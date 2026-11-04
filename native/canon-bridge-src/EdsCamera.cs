using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using EDSDKLib;

namespace StudiodoCanonBridge;

// Semua panggilan EDSDK HARUS dari satu thread (STA) yang juga memompa pesan
// Windows — kalau tidak, event kamera (foto selesai, kamera dicabut) tidak
// pernah sampai. Kelas ini memiliki thread itu; thread HTTP hanya mengantre
// pekerjaan lewat Run<T>() dan menunggu hasilnya.
public sealed class EdsCamera : ICameraBackend
{
    [StructLayout(LayoutKind.Sequential)]
    private struct Msg { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x, y; }
    [DllImport("user32.dll")] private static extern bool PeekMessage(out Msg msg, IntPtr hwnd, uint min, uint max, uint remove);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref Msg msg);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref Msg msg);
    [DllImport("EDSDK.dll")] private static extern uint EdsGetEvent();
    [DllImport("EDSDK.dll")] private static extern uint EdsDownloadCancel(IntPtr dirItem);

    private const uint ERR_OBJECT_NOTREADY = 0x00000A102; // EVF belum siap (frame pertama belum ada)
    private const uint EVF_NOT_READY_ALT = 0x0000A102;

    private readonly BlockingCollection<Action> _queue = new();
    private readonly Thread _thread;
    private volatile bool _stop;

    private IntPtr _camera = IntPtr.Zero;
    private string _cameraName = "";
    private volatile bool _connected;
    private DateTime _nextConnectTry = DateTime.MinValue;

    // Callback harus dipegang referensinya supaya tidak di-GC.
    private readonly EDSDK.EdsObjectEventHandler _objectHandler;
    private readonly EDSDK.EdsStateEventHandler _stateHandler;
    private TaskCompletionSource<byte[]>? _pendingShot;

    // Live view
    private bool _liveWanted;
    private byte[]? _liveFrame;
    private long _liveFrameAt;
    private long _liveLastRequest;
    public static readonly TimeSpan LiveIdleStop = TimeSpan.FromSeconds(20);

    public string Engine => "canon";
    public string State => _connected ? "ready" : _asleep ? "asleep" : "none";

    private volatile bool _asleep;
    private long _awakeUntil;      // tick: sampai kapan kamera ditahan agar tidak tidur (sesi akan/sedang jalan)
    private long _lastKeepAlive;
    private const long KeepAliveEveryMs = 30_000;
    public bool Connected => _connected;
    public string CameraName => _cameraName;
    public string? LastError { get; private set; }

    public EdsCamera()
    {
        _objectHandler = OnObjectEvent;
        _stateHandler = OnStateEvent;
        _thread = new Thread(Loop) { IsBackground = true, Name = "eds-camera" };
        _thread.SetApartmentState(ApartmentState.STA);
        _thread.Start();
    }

    // ---- thread plumbing ---------------------------------------------------

    public Task<T> Run<T>(Func<T> work)
    {
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        _queue.Add(() =>
        {
            try { tcs.SetResult(work()); }
            catch (Exception ex) { tcs.SetException(ex); }
        });
        return tcs.Task;
    }

    private void Loop()
    {
        try { LoopCore(); }
        catch (Exception ex) { LastError = ex.Message; Console.WriteLine($"[canon-bridge] mesin Canon berhenti: {ex.Message}"); }
    }

    private void LoopCore()
    {
        var err = EDSDK.EdsInitializeSDK();
        if (err != EDSDK.EDS_ERR_OK) { LastError = $"EdsInitializeSDK gagal (0x{err:X})"; return; }

        long lastLiveGrab = 0;
        while (!_stop)
        {
            while (_queue.TryTake(out var job)) job();

            if (!_connected && DateTime.UtcNow >= _nextConnectTry)
            {
                TryConnect();
                _nextConnectTry = DateTime.UtcNow.AddSeconds(2);
            }

            if (_connected && _liveWanted)
            {
                var now = Environment.TickCount64;
                // Watchdog: tidak ada yang minta frame -> matikan supaya sensor tidak panas.
                if (now - _liveLastRequest > LiveIdleStop.TotalMilliseconds) StopLiveInternal();
                else if (_pendingShot == null && now - lastLiveGrab >= 45) { lastLiveGrab = now; GrabLiveFrame(); }
            }

            if (_connected)
            {
                var t = Environment.TickCount64;
                if ((_liveWanted || t < _awakeUntil) && t - _lastKeepAlive >= KeepAliveEveryMs)
                {
                    _lastKeepAlive = t;
                    EDSDK.EdsSendCommand(_camera, EDSDK.CameraCommand_ExtendShutDownTimer, 0);
                }
            }

            while (PeekMessage(out var msg, IntPtr.Zero, 0, 0, 1)) { TranslateMessage(ref msg); DispatchMessage(ref msg); }
            EdsGetEvent();
            Thread.Sleep(8);
        }

        if (_connected) Disconnect();
        EDSDK.EdsTerminateSDK();
    }

    public void Dispose()
    {
        _stop = true;
        _thread.Join(3000);
    }

    // ---- connection --------------------------------------------------------

    private void TryConnect()
    {
        IntPtr list = IntPtr.Zero;
        try
        {
            if (EDSDK.EdsGetCameraList(out list) != EDSDK.EDS_ERR_OK) return;
            if (EDSDK.EdsGetChildCount(list, out var count) != EDSDK.EDS_ERR_OK || count < 1) return;
            if (EDSDK.EdsGetChildAtIndex(list, 0, out var cam) != EDSDK.EDS_ERR_OK) return;

            EDSDK.EdsGetDeviceInfo(cam, out var info);
            var open = EDSDK.EdsOpenSession(cam);
            if (open != EDSDK.EDS_ERR_OK)
            {
                LastError = $"Gagal membuka sesi kamera (0x{open:X})";
                EDSDK.EdsRelease(cam);
                return;
            }

            _camera = cam;
            _cameraName = info.szDeviceDescription ?? "Canon";
            EDSDK.EdsSetObjectEventHandler(cam, EDSDK.ObjectEvent_All, _objectHandler, IntPtr.Zero);
            EDSDK.EdsSetCameraStateEventHandler(cam, EDSDK.StateEvent_All, _stateHandler, IntPtr.Zero);

            // Property privat (suhu, tidur otomatis) harus diaktifkan dulu; gagal di model lama = diabaikan.
            EDSDK.EdsSetPropertyData(cam, 0x01000000, 0x14840DF1, sizeof(uint), 0x01000415u);
            EDSDK.EdsSetPropertyData(cam, 0x01000000, 0x1C31565B, sizeof(uint), 0x0100045Eu);

            // Foto langsung ke PC (tanpa kartu SD wajib).
            EDSDK.EdsSetPropertyData(cam, EDSDK.PropID_SaveTo, 0, sizeof(uint), (uint)EDSDK.EdsSaveTo.Host);
            EDSDK.EdsSetCapacity(cam, new EDSDK.EdsCapacity { NumberOfFreeClusters = 0x7FFFFFFF, BytesPerSector = 0x1000, Reset = 1 });

            _connected = true;
            _asleep = false;
            LastError = null;
            Console.WriteLine($"[canon-bridge] kamera terhubung: {_cameraName}");
        }
        finally
        {
            if (list != IntPtr.Zero) EDSDK.EdsRelease(list);
        }
    }

    private void Disconnect()
    {
        _liveWanted = false;
        _liveFrame = null;
        if (_camera != IntPtr.Zero)
        {
            EDSDK.EdsCloseSession(_camera);
            EDSDK.EdsRelease(_camera);
        }
        _camera = IntPtr.Zero;
        _connected = false;
        _pendingShot?.TrySetException(new InvalidOperationException("Kamera terputus"));
        _pendingShot = null;
    }

    private uint OnStateEvent(uint ev, uint param, IntPtr ctx)
    {
        if (ev == EDSDK.StateEvent_WillSoonShutDown && (_liveWanted || Environment.TickCount64 < _awakeUntil))
        {
            // Kamera mau tidur padahal sesi sedang/akan jalan — perpanjang.
            EDSDK.EdsSendCommand(_camera, EDSDK.CameraCommand_ExtendShutDownTimer, 0);
        }
        if (ev == EDSDK.StateEvent_Shutdown)
        {
            _asleep = true;
            Console.WriteLine("[canon-bridge] kamera terputus");
            Disconnect();
        }
        return EDSDK.EDS_ERR_OK;
    }

    // ---- capture -----------------------------------------------------------

    private uint OnObjectEvent(uint ev, IntPtr obj, IntPtr ctx)
    {
        if (ev == EDSDK.ObjectEvent_DirItemRequestTransfer || ev == EDSDK.ObjectEvent_DirItemCreated)
        {
            try { HandleDirItem(obj); }
            catch (Exception ex) { _pendingShot?.TrySetException(ex); }
        }
        else if (obj != IntPtr.Zero)
        {
            EDSDK.EdsRelease(obj);
        }
        return EDSDK.EDS_ERR_OK;
    }

    private void HandleDirItem(IntPtr dirItem)
    {
        var shot = _pendingShot;
        EDSDK.EdsGetDirectoryItemInfo(dirItem, out var info);
        var name = info.szFileName ?? "";
        var isJpeg = name.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) || name.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase);

        // RAW (kalau kamera RAW+JPEG) dan file tak diminta: batalkan transfer.
        if (shot == null || !isJpeg)
        {
            EdsDownloadCancel(dirItem);
            EDSDK.EdsRelease(dirItem);
            return;
        }

        IntPtr stream = IntPtr.Zero;
        try
        {
            var err = EDSDK.EdsCreateMemoryStream(0, out stream);
            if (err == EDSDK.EDS_ERR_OK) err = EDSDK.EdsDownload(dirItem, info.Size, stream);
            if (err == EDSDK.EDS_ERR_OK) err = EDSDK.EdsDownloadComplete(dirItem);
            if (err != EDSDK.EDS_ERR_OK) throw new InvalidOperationException($"Download foto gagal (0x{err:X})");

            EDSDK.EdsGetPointer(stream, out var ptr);
            EDSDK.EdsGetLength(stream, out var len);
            var bytes = new byte[len];
            Marshal.Copy(ptr, bytes, 0, (int)len);
            shot.TrySetResult(bytes);
        }
        finally
        {
            if (stream != IntPtr.Zero) EDSDK.EdsRelease(stream);
            EDSDK.EdsRelease(dirItem);
        }
    }

    public async Task<byte[]> CaptureAsync(TimeSpan timeout)
    {
        var tcs = new TaskCompletionSource<byte[]>(TaskCreationOptions.RunContinuationsAsynchronously);
        await Run(() =>
        {
            if (!_connected) throw new InvalidOperationException("Kamera tidak terhubung");
            if (_pendingShot != null) throw new InvalidOperationException("Foto sebelumnya masih diproses");
            _pendingShot = tcs;

            // Coba dengan autofocus; kalau AF gagal fokus, tembak tanpa AF (booth: jangan sampai gagal total).
            var err = Shutter(EDSDK.EdsShutterButton.CameraCommand_ShutterButton_Completely);
            if (err == EDSDK.EDS_ERR_TAKE_PICTURE_AF_NG)
                err = Shutter(EDSDK.EdsShutterButton.CameraCommand_ShutterButton_Completely_NonAF);
            if (err != EDSDK.EDS_ERR_OK)
            {
                _pendingShot = null;
                throw new InvalidOperationException(DescribeError(err));
            }
            return 0;
        });

        try
        {
            using var cts = new CancellationTokenSource(timeout);
            using (cts.Token.Register(() => tcs.TrySetException(new TimeoutException("Timeout menunggu foto dari kamera"))))
                return await tcs.Task;
        }
        finally
        {
            await Run(() => { _pendingShot = null; return 0; });
        }
    }

    private uint Shutter(EDSDK.EdsShutterButton press)
    {
        var err = EDSDK.EdsSendCommand(_camera, EDSDK.CameraCommand_PressShutterButton, (int)press);
        // Selalu lepas tombol, apa pun hasilnya.
        EDSDK.EdsSendCommand(_camera, EDSDK.CameraCommand_PressShutterButton, (int)EDSDK.EdsShutterButton.CameraCommand_ShutterButton_OFF);
        return err;
    }

    public async Task<bool> PrepareAsync(TimeSpan hold)
    {
        await Run(() =>
        {
            if (!_connected) throw new InvalidOperationException(_asleep ? "Kamera sedang tidur atau mati - nyalakan atau setengah-tekan shutter" : "Kamera tidak terhubung");
            _awakeUntil = Environment.TickCount64 + (long)hold.TotalMilliseconds;
            _lastKeepAlive = Environment.TickCount64;
            EDSDK.EdsSendCommand(_camera, EDSDK.CameraCommand_ExtendShutDownTimer, 0);
            return 0;
        });
        return await StartLiveAsync(TimeSpan.FromSeconds(8));
    }

    public async Task StandbyAsync()
    {
        await Run(() => { _awakeUntil = 0; return 0; });
        await StopLiveAsync();
    }

    public Task<bool> FocusAsync() => Run(() =>
    {
        if (!_connected) throw new InvalidOperationException("Kamera tidak terhubung");
        var err = EDSDK.EdsSendCommand(_camera, EDSDK.CameraCommand_PressShutterButton, (int)EDSDK.EdsShutterButton.CameraCommand_ShutterButton_Halfway);
        Thread.Sleep(600);
        EDSDK.EdsSendCommand(_camera, EDSDK.CameraCommand_PressShutterButton, (int)EDSDK.EdsShutterButton.CameraCommand_ShutterButton_OFF);
        if (err == EDSDK.EDS_ERR_TAKE_PICTURE_AF_NG) throw new InvalidOperationException("Autofocus tidak menemukan fokus — cek lensa di posisi AF dan cahaya cukup");
        if (err != EDSDK.EDS_ERR_OK) throw new InvalidOperationException(DescribeError(err));
        return true;
    });

    // ---- live view ---------------------------------------------------------

    public async Task<bool> StartLiveAsync(TimeSpan wait)
    {
        await Run(() =>
        {
            if (!_connected) throw new InvalidOperationException("Kamera tidak terhubung");
            _liveLastRequest = Environment.TickCount64;
            if (_liveWanted) return 0;
            _liveFrame = null;
            EDSDK.EdsSetPropertyData(_camera, EDSDK.PropID_Evf_Mode, 0, sizeof(uint), 1u);
            EDSDK.EdsGetPropertyData(_camera, EDSDK.PropID_Evf_OutputDevice, 0, out uint device);
            var err = EDSDK.EdsSetPropertyData(_camera, EDSDK.PropID_Evf_OutputDevice, 0, sizeof(uint), device | EDSDK.EvfOutputDevice_PC);
            if (err != EDSDK.EDS_ERR_OK) throw new InvalidOperationException(DescribeError(err));
            _liveWanted = true;
            return 0;
        });

        var deadline = Environment.TickCount64 + (long)wait.TotalMilliseconds;
        while (Environment.TickCount64 < deadline)
        {
            if (_liveFrame != null) return true;
            await Task.Delay(60);
        }
        return false;
    }

    public Task StopLiveAsync() => Run(() => { StopLiveInternal(); return 0; });

    private void StopLiveInternal()
    {
        _liveWanted = false;
        _liveFrame = null;
        if (!_connected) return;
        EDSDK.EdsGetPropertyData(_camera, EDSDK.PropID_Evf_OutputDevice, 0, out uint device);
        EDSDK.EdsSetPropertyData(_camera, EDSDK.PropID_Evf_OutputDevice, 0, sizeof(uint), device & ~EDSDK.EvfOutputDevice_PC);
    }

    private void GrabLiveFrame()
    {
        IntPtr stream = IntPtr.Zero, evf = IntPtr.Zero;
        try
        {
            if (EDSDK.EdsCreateMemoryStream(0, out stream) != EDSDK.EDS_ERR_OK) return;
            if (EDSDK.EdsCreateEvfImageRef(stream, out evf) != EDSDK.EDS_ERR_OK) return;
            var err = EDSDK.EdsDownloadEvfImage(_camera, evf);
            if (err != EDSDK.EDS_ERR_OK) return; // belum siap / sibuk — coba lagi di putaran berikut
            EDSDK.EdsGetPointer(stream, out var ptr);
            EDSDK.EdsGetLength(stream, out var len);
            if (len == 0) return;
            var bytes = new byte[len];
            Marshal.Copy(ptr, bytes, 0, (int)len);
            _liveFrame = bytes;
            _liveFrameAt = Environment.TickCount64;
        }
        finally
        {
            if (evf != IntPtr.Zero) EDSDK.EdsRelease(evf);
            if (stream != IntPtr.Zero) EDSDK.EdsRelease(stream);
        }
    }

    public byte[]? LatestLiveFrame()
    {
        _liveLastRequest = Environment.TickCount64;
        return _liveFrame;
    }

    // ---- properties --------------------------------------------------------

    // label -> kode mentah dari daftar pilihan kamera yang terakhir dibaca. Dua kode bisa berbagi label
    // yang sama (langkah 1/3 stop) — yang dipakai selalu kode milik kamera itu, bukan tebakan dari tabel.
    private readonly Dictionary<string, Dictionary<string, uint>> _choiceMaps = new();
    // Property privat yang ditolak kamera saat ditulis (mis. tidur otomatis di EOS 1300D): dilaporkan read-only.
    private readonly HashSet<string> _rejectedWrites = new();

    private List<uint> ReadChoiceCodes(CameraProps.PropDef def)
    {
        if (def.FixedChoices) return def.Map.Keys.OrderBy(k => k == 0 ? uint.MaxValue : k).ToList();
        var codes = new List<uint>();
        if (EDSDK.EdsGetPropertyDesc(_camera, def.Id, out var desc) == EDSDK.EDS_ERR_OK)
            for (var i = 0; i < desc.NumElements && i < desc.PropDesc.Length; i++) codes.Add((uint)desc.PropDesc[i]);
        return codes;
    }

    private Dictionary<string, uint> BuildChoiceMap(CameraProps.PropDef def, List<uint> codes)
    {
        var map = new Dictionary<string, uint>();
        foreach (var code in codes)
        {
            var label = CameraProps.Label(def, code);
            while (map.ContainsKey(label)) label += " *";
            map[label] = code;
        }
        _choiceMaps[def.Name] = map;
        return map;
    }

    public Task<Dictionary<string, PropState>> GetPropertiesAsync() => Run(() =>
    {
        var result = new Dictionary<string, PropState>();
        foreach (var def in CameraProps.All)
        {
            PropState Fail(string why) => new(null, new(), why) { Label = def.Label, Group = def.Group, Writable = def.Writable };
            if (!_connected) { result[def.Name] = Fail("Kamera tidak terhubung"); continue; }
            try
            {
                var getErr = EDSDK.EdsGetPropertyData(_camera, def.Id, 0, out uint cur);
                if (getErr != EDSDK.EDS_ERR_OK) { result[def.Name] = Fail("Tidak didukung kamera ini"); continue; }
                var choices = new List<string>();
                var writable = def.Writable && !_rejectedWrites.Contains(def.Name);
                var current = CameraProps.Label(def, cur);
                if (def.Writable)
                {
                    var codes = ReadChoiceCodes(def);
                    var map = BuildChoiceMap(def, codes);
                    choices.AddRange(map.Keys);
                    // Label nilai sekarang = label dari kode yang sama di daftar (bukan sekadar tabel).
                    var hit = map.FirstOrDefault(kv => kv.Value == cur);
                    if (hit.Key != null) current = hit.Key;
                    // Daftar kosong = kamera sedang tidak mengizinkan perubahan (mis. mode eksposur mengunci).
                    if (choices.Count == 0) writable = false;
                    if (!writable) { choices.Clear(); }
                }
                if (choices.Count == 0) choices.Add(current);
                result[def.Name] = new PropState(current, choices, null) { Label = def.Label, Group = def.Group, Writable = writable };
            }
            catch (Exception ex) { result[def.Name] = Fail(ex.Message); }
        }
        return result;
    });

    public Task<Dictionary<string, (bool Ok, string? Error)>> SetPropertiesAsync(Dictionary<string, string> values) => Run(() =>
    {
        var results = new Dictionary<string, (bool, string?)>();
        foreach (var (name, raw) in values)
        {
            var prop = CameraProps.All.FirstOrDefault(p => p.Name == name);
            if (prop == null) { results[name] = (false, "Properti tidak dikenal"); continue; }
            if (!_connected) { results[name] = (false, "Kamera tidak terhubung"); continue; }
            if (!prop.Writable) { results[name] = (false, "Hanya bisa diubah lewat dial/menu kamera"); continue; }

            var wanted = raw.Trim();
            if (!_choiceMaps.TryGetValue(name, out var map) || !map.ContainsKey(wanted))
                map = BuildChoiceMap(prop, ReadChoiceCodes(prop));
            uint code;
            if (map.TryGetValue(wanted, out var fromCamera)) code = fromCamera;
            else if (!CameraProps.TryParse(prop.Map, wanted, out code) || (map.Count > 0 && !map.ContainsValue(code)))
            { results[name] = (false, $"Nilai \"{raw}\" tidak tersedia di kamera ini"); continue; }

            var err = EDSDK.EdsSetPropertyData(_camera, prop.Id, 0, sizeof(uint), code);
            if (err != EDSDK.EDS_ERR_OK && prop.Id >= 0x01000000) _rejectedWrites.Add(name);
            results[name] = err == EDSDK.EDS_ERR_OK ? (true, null)
                : prop.Id >= 0x01000000 ? (false, "Kamera ini tidak mengizinkan pengaturan ini dari PC - ubah lewat menu kamera (Auto power off)")
                : (false, DescribeError(err) + (err == 0x00000081 ? "" : " — cek mode eksposur kamera"));
        }
        return results;
    });

    // Hanya untuk eksplorasi (CANON_BRIDGE_DEBUG=1): baca nilai mentah + daftar pilihan satu property ID.
    public Task<object> RawProbeAsync(uint id, bool enablePrivate) => Run<object>(() =>
    {
        if (!_connected) throw new InvalidOperationException("Kamera tidak terhubung");
        uint enableErr = 0;
        if (enablePrivate && id >= 0x01000000)
            enableErr = EDSDK.EdsSetPropertyData(_camera, 0x01000000, id == 0x01000415 ? 0x14840DF1 : 0x1C31565B, sizeof(uint), id);
        var getErr = EDSDK.EdsGetPropertyData(_camera, id, 0, out uint cur);
        var descErr = EDSDK.EdsGetPropertyDesc(_camera, id, out var desc);
        var codes = new List<uint>();
        if (descErr == EDSDK.EDS_ERR_OK) for (var i = 0; i < desc.NumElements && i < desc.PropDesc.Length; i++) codes.Add((uint)desc.PropDesc[i]);
        return new { id = $"0x{id:X}", enableErr = $"0x{enableErr:X}", getErr = $"0x{getErr:X}", value = cur, descErr = $"0x{descErr:X}", access = desc.Access, form = desc.Form, choices = codes };
    });

    // Manual focus dari layar (live view harus aktif, lensa di posisi AF): geser fokus dekat/jauh.
    public Task<bool> DriveFocusAsync(bool far, int step) => Run(() =>
    {
        if (!_connected) throw new InvalidOperationException("Kamera tidak terhubung");
        step = Math.Clamp(step, 1, 3);
        var param = far ? 0x8000 + step : step - 1;
        var err = EDSDK.EdsSendCommand(_camera, 0x00000103 /* kEdsCameraCommand_DriveLensEvf */, param);
        if (err != EDSDK.EDS_ERR_OK) throw new InvalidOperationException(DescribeError(err));
        return true;
    });

    public static string DescribeError(uint err) => err switch
    {
        EDSDK.EDS_ERR_DEVICE_BUSY => "Kamera sibuk, coba lagi",
        EDSDK.EDS_ERR_TAKE_PICTURE_AF_NG => "Autofocus gagal",
        0x00000002 => "Kamera tidak menanggapi",
        0x00000061 => "Kamera dalam mode yang tidak mengizinkan perintah ini",
        _ => $"Kamera menolak perintah (kode 0x{err:X})",
    };
}
