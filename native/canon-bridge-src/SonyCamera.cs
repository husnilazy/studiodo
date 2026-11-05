using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Text;

namespace StudiodoCanonBridge;

// Mesin Sony via sony_core.dll (pembungkus C untuk Sony Camera Remote SDK; sumbernya di
// native/sony-core-src). Pola threading sama dengan EdsCamera: satu thread kamera,
// pekerjaan diantre lewat Run<T>().
public sealed class SonyCamera : ICameraBackend
{
    private const string Dll = "sony_core";

    [DllImport(Dll)] private static extern int sony_init();
    [DllImport(Dll)] private static extern void sony_shutdown();
    [DllImport(Dll, CharSet = CharSet.Unicode)] private static extern int sony_connect(StringBuilder name, int cap, string saveDir);
    [DllImport(Dll)] private static extern int sony_connected();
    [DllImport(Dll)] private static extern void sony_disconnect();
    [DllImport(Dll, CharSet = CharSet.Unicode)] private static extern int sony_capture(int afMs, int timeoutMs, StringBuilder outPath, int cap);
    [DllImport(Dll)] private static extern int sony_focus(int afMs);
    [DllImport(Dll)] private static extern int sony_live_frame(byte[] buf, int cap, out int len);
    [DllImport(Dll)] private static extern int sony_get_prop(uint code, out ulong current, ulong[] values, int max, out int n, out int writable);
    [DllImport(Dll)] private static extern int sony_set_prop(uint code, ulong value, int typeBytes);
    [DllImport(Dll)] private static extern uint sony_last_error();
    [DllImport(Dll)] private static extern uint sony_code_fnumber();
    [DllImport(Dll)] private static extern uint sony_code_shutter();
    [DllImport(Dll)] private static extern uint sony_code_iso();
    [DllImport(Dll)] private static extern uint sony_code_wb();
    [DllImport(Dll)] private static extern uint sony_code_exposure_mode();
    [DllImport(Dll)] private static extern uint sony_code_exposure_bias();
    [DllImport(Dll)] private static extern uint sony_code_metering();
    [DllImport(Dll)] private static extern uint sony_code_focus_mode();
    [DllImport(Dll)] private static extern uint sony_code_focus_area();
    [DllImport(Dll)] private static extern uint sony_code_image_size();
    [DllImport(Dll)] private static extern uint sony_code_image_quality();

    private readonly BlockingCollection<Action> _queue = new();
    private readonly Thread _thread;
    private volatile bool _stop;
    private volatile bool _connected;
    private string _name = "";
    private DateTime _nextTry = DateTime.MinValue;
    private readonly string _saveDir = Path.Combine(Path.GetTempPath(), "studiodo-sony");

    // Live view: Sony mengirim frame lewat GetLiveViewImage tanpa perintah "start" terpisah,
    // tapi tetap hanya ditarik saat diminta supaya CPU/kamera tidak terus bekerja.
    private bool _liveWanted;
    private byte[]? _liveFrame;
    private long _liveLastRequest;
    private readonly byte[] _liveBuf = new byte[4 * 1024 * 1024];

    // label -> kode mentah dari daftar terakhir yang dibaca, per properti
    private readonly Dictionary<string, Dictionary<string, ulong>> _labelMaps = new();

    public string Engine => "sony";
    public string State => _connected ? "ready" : "none";

    public Task<bool> PrepareAsync(TimeSpan hold) => StartLiveAsync(TimeSpan.FromSeconds(8));
    public Task StandbyAsync() => StopLiveAsync();
    public bool Connected => _connected;
    public string CameraName => _name;
    public string? LastError { get; private set; }

    public SonyCamera()
    {
        // Gagal cepat (DLL tidak ada) supaya CameraHub melewati mesin ini.
        sony_code_iso();
        Directory.CreateDirectory(_saveDir);
        _thread = new Thread(Loop) { IsBackground = true, Name = "sony-camera" };
        _thread.Start();
    }

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
        try
        {
            if (sony_init() != 0) { LastError = "Sony SDK gagal diinisialisasi"; return; }
            long lastGrab = 0;
            while (!_stop)
            {
                while (_queue.TryTake(out var job)) job();

                if (_connected && sony_connected() == 0)
                {
                    Console.WriteLine("[canon-bridge] kamera Sony terputus");
                    sony_disconnect();
                    _connected = false;
                    _liveWanted = false;
                    _liveFrame = null;
                }

                if (!_connected && DateTime.UtcNow >= _nextTry)
                {
                    TryConnect();
                    _nextTry = DateTime.UtcNow.AddSeconds(3);
                }

                if (_connected && _liveWanted)
                {
                    var now = Environment.TickCount64;
                    if (now - _liveLastRequest > EdsCamera.LiveIdleStop.TotalMilliseconds) { _liveWanted = false; _liveFrame = null; }
                    else if (now - lastGrab >= 45)
                    {
                        lastGrab = now;
                        if (sony_live_frame(_liveBuf, _liveBuf.Length, out var len) == 0 && len > 0)
                            _liveFrame = _liveBuf.AsSpan(0, len).ToArray();
                    }
                }
                Thread.Sleep(10);
            }
            if (_connected) sony_disconnect();
            sony_shutdown();
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
            Console.WriteLine($"[canon-bridge] mesin Sony berhenti: {ex.Message}");
        }
    }

    private void TryConnect()
    {
        var name = new StringBuilder(256);
        var rc = sony_connect(name, name.Capacity, _saveDir);
        if (rc == 0)
        {
            _connected = true;
            _name = name.ToString();
            LastError = null;
            Console.WriteLine($"[canon-bridge] kamera Sony terhubung: {_name}");
        }
        else if (rc == -3)
        {
            LastError = "Kamera Sony terdeteksi tapi tidak merespons — set USB Connection ke \"PC Remote\" di menu kamera";
        }
        else if (rc != 1)
        {
            LastError = $"Gagal menyambung kamera Sony (kode 0x{rc:X})";
        }
    }

    public void Dispose()
    {
        _stop = true;
        _thread.Join(3000);
    }

    // ---- capture -----------------------------------------------------------

    public async Task<byte[]> CaptureAsync(TimeSpan timeout)
    {
        var afMs = int.TryParse(Environment.GetEnvironmentVariable("SONY_AF_MS"), out var v) ? v : 500;
        var path = await Run(() =>
        {
            if (!_connected) throw new InvalidOperationException("Kamera tidak terhubung");
            var sb = new StringBuilder(1024);
            var rc = sony_capture(afMs, (int)timeout.TotalMilliseconds, sb, sb.Capacity);
            if (rc == 2) throw new TimeoutException("Timeout menunggu foto dari kamera");
            if (rc != 0) throw new InvalidOperationException($"Kamera menolak perintah foto (kode 0x{rc:X})");
            return sb.ToString();
        });

        if (!Path.IsPathRooted(path)) path = Path.Combine(_saveDir, path);
        // Kamera RAW-only menghasilkan .ARW — bridge hanya mengirim JPEG ke kiosk.
        var ext = Path.GetExtension(path).ToLowerInvariant();
        if (ext is not (".jpg" or ".jpeg"))
            throw new InvalidOperationException($"Kamera menyimpan {ext} — ubah kualitas gambar ke JPEG di menu kamera");

        for (var attempt = 0; attempt < 10; attempt++)
        {
            try
            {
                var bytes = await File.ReadAllBytesAsync(path);
                try { File.Delete(path); } catch { /* bersihkan nanti */ }
                return bytes;
            }
            catch (IOException) { await Task.Delay(100); }
        }
        throw new IOException("File foto dari kamera tidak bisa dibaca");
    }

    public Task<bool> FocusAsync() => Run(() =>
    {
        if (!_connected) throw new InvalidOperationException("Kamera tidak terhubung");
        return sony_focus(700) == 0;
    });

    // ---- live view ---------------------------------------------------------

    public async Task<bool> StartLiveAsync(TimeSpan wait)
    {
        await Run(() =>
        {
            if (!_connected) throw new InvalidOperationException("Kamera tidak terhubung");
            _liveLastRequest = Environment.TickCount64;
            if (!_liveWanted) { _liveFrame = null; _liveWanted = true; }
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

    public Task StopLiveAsync() => Run(() => { _liveWanted = false; _liveFrame = null; return 0; });

    public byte[]? LatestLiveFrame()
    {
        _liveLastRequest = Environment.TickCount64;
        return _liveFrame;
    }

    // ---- properties --------------------------------------------------------

    private enum Kind { Iso, Shutter, Fnum, Wb, ExposureMode, Bias, Metering, FocusMode, FocusArea, ImageSize, Quality }

    private sealed record Def(string Name, string Label, string Group, uint Code, Kind Kind, int Bytes);

    private Def[] Props => new[]
    {
        new Def("iso", "ISO", "exposure", sony_code_iso(), Kind.Iso, 4),
        new Def("shutterspeed", "Shutter Speed", "exposure", sony_code_shutter(), Kind.Shutter, 4),
        new Def("aperture", "Aperture", "exposure", sony_code_fnumber(), Kind.Fnum, 2),
        new Def("exposurecomp", "Kompensasi Eksposur (EV)", "exposure", sony_code_exposure_bias(), Kind.Bias, 2),
        new Def("exposuremode", "Mode Eksposur", "exposure", sony_code_exposure_mode(), Kind.ExposureMode, 4),
        new Def("meteringmode", "Metering", "exposure", sony_code_metering(), Kind.Metering, 2),
        new Def("afmode", "Mode Fokus", "focus", sony_code_focus_mode(), Kind.FocusMode, 2),
        new Def("focusarea", "Area Fokus", "focus", sony_code_focus_area(), Kind.FocusArea, 2),
        new Def("whitebalance", "White Balance", "color", sony_code_wb(), Kind.Wb, 2),
        new Def("imagesize", "Ukuran Foto", "output", sony_code_image_size(), Kind.ImageSize, 2),
        new Def("imagequality", "Kualitas JPEG", "output", sony_code_image_quality(), Kind.Quality, 2),
    };

    private static string FormatValue(Kind kind, ulong raw)
    {
        switch (kind)
        {
            case Kind.Iso:
            {
                var iso = (uint)(raw & 0x00FFFFFF);
                var mode = (uint)((raw >> 24) & 0xF);
                var label = iso == 0x00FFFFFF ? "Auto" : iso.ToString();
                return mode != 0 ? $"{label} NR{mode}" : label;
            }
            case Kind.Shutter:
            {
                var v = (uint)raw;
                if (v == 0) return "Bulb";
                var num = v >> 16; var den = v & 0xFFFF;
                if (den == 0) return $"0x{v:X}";
                if (num == 1) return $"1/{den}";
                if (num % den == 0) return (num / den).ToString();
                return Math.Round((double)num / den, 1).ToString("0.#", System.Globalization.CultureInfo.InvariantCulture);
            }
            case Kind.Fnum:
            {
                var f = (ushort)raw;
                if (f == 0 || f == 0xFFFE || f == 0xFFFF) return "--";
                return (f / 100.0).ToString("0.#", System.Globalization.CultureInfo.InvariantCulture);
            }
            case Kind.Bias:
            {
                // int16 dalam 1/1000 EV
                var ev = (short)raw / 1000.0;
                return ev == 0 ? "0" : (ev > 0 ? "+" : "") + ev.ToString("0.#", System.Globalization.CultureInfo.InvariantCulture);
            }
            case Kind.ExposureMode:
                return (uint)raw switch
                {
                    1 => "M (Manual)", 2 => "P (Program)", 3 => "A (Prioritas aperture)", 4 => "S (Prioritas shutter)",
                    0x8000 => "Auto", 0x8001 => "Auto+", var o => $"0x{o:X}",
                };
            case Kind.Metering:
                return (ushort)raw switch
                {
                    1 => "Average", 2 => "Center-weighted average", 3 => "Multi spot", 4 => "Center spot", 5 => "Multi",
                    6 => "Center-weighted", 7 => "Entire screen average", 8 => "Spot standard", 9 => "Spot large",
                    10 => "Highlight weighted", var o => $"0x{o:X}",
                };
            case Kind.FocusMode:
                return (ushort)raw switch
                {
                    1 => "Manual Focus", 2 => "AF-S (sekali)", 3 => "AF-C (kontinu)", 4 => "AF-A (otomatis)", 5 => "AF-D",
                    6 => "DMF", 7 => "Power Focus", var o => $"0x{o:X}",
                };
            case Kind.FocusArea:
                return (ushort)raw switch
                {
                    1 => "Wide", 2 => "Zone", 3 => "Center", 4 => "Flexible Spot S", 5 => "Flexible Spot M",
                    6 => "Flexible Spot L", 7 => "Expand Flexible Spot", 8 => "Flexible Spot", 0x11 => "Tracking Wide",
                    0x12 => "Tracking Zone", 0x13 => "Tracking Center", 0x14 => "Tracking Flexible S", 0x15 => "Tracking Flexible M",
                    0x16 => "Tracking Flexible L", 0x17 => "Tracking Expand Flexible", 0x18 => "Tracking Flexible",
                    var o => $"0x{o:X}",
                };
            case Kind.ImageSize:
                return (ushort)raw switch { 1 => "L", 2 => "M", 3 => "S", 4 => "VGA", var o => $"0x{o:X}" };
            case Kind.Quality:
                return (ushort)raw switch { 1 => "Light", 2 => "Standard", 3 => "Fine", 4 => "Extra Fine", var o => $"0x{o:X}" };
            default:
                return (ushort)raw switch
                {
                    0x0000 => "Auto", 0x0001 => "Underwater Auto", 0x0011 => "Daylight", 0x0012 => "Shade",
                    0x0013 => "Cloudy", 0x0014 => "Tungsten", 0x0020 => "Fluorescent", 0x0021 => "Fluorescent Warm",
                    0x0022 => "Fluorescent Cool", 0x0023 => "Fluorescent Day White", 0x0024 => "Fluorescent Daylight",
                    0x0030 => "Flash", 0x0100 => "Color Temperature", 0x0101 => "Custom 1", 0x0102 => "Custom 2",
                    0x0103 => "Custom 3", 0x0104 => "Custom", var o => $"0x{o:X}",
                };
        }
    }

    private Dictionary<string, ulong> BuildMap(Def def, ulong[] values, int n)
    {
        var map = new Dictionary<string, ulong>();
        for (var i = 0; i < n; i++)
        {
            var label = FormatValue(def.Kind, values[i]);
            while (map.ContainsKey(label)) label += "'";
            map[label] = values[i];
        }
        return map;
    }

    public Task<Dictionary<string, PropState>> GetPropertiesAsync() => Run(() =>
    {
        var result = new Dictionary<string, PropState>();
        foreach (var def in Props)
        {
            PropState Fail(string why) => new(null, new(), why) { Label = def.Label, Group = def.Group, Writable = false };
            if (!_connected) { result[def.Name] = Fail("Kamera tidak terhubung"); continue; }
            var values = new ulong[512];
            var rc = sony_get_prop(def.Code, out var cur, values, values.Length, out var n, out var writable);
            if (rc != 0) { result[def.Name] = Fail("Tidak didukung kamera ini"); continue; }

            var map = BuildMap(def, values, n);
            _labelMaps[def.Name] = map;
            var current = FormatValue(def.Kind, cur);
            var choices = map.Keys.ToList();
            if (!choices.Contains(current)) choices.Insert(0, current);
            result[def.Name] = new PropState(current, choices, null) { Label = def.Label, Group = def.Group, Writable = writable == 1 && n > 0 };
        }
        return result;
    });

    public Task<Dictionary<string, (bool Ok, string? Error)>> SetPropertiesAsync(Dictionary<string, string> values) => Run(() =>
    {
        var results = new Dictionary<string, (bool, string?)>();
        foreach (var (name, raw) in values)
        {
            var def = Props.FirstOrDefault(p => p.Name == name);
            if (def == null) { results[name] = (false, "Properti tidak dikenal"); continue; }
            if (!_connected) { results[name] = (false, "Kamera tidak terhubung"); continue; }

            if (!_labelMaps.TryGetValue(name, out var map) || !map.ContainsKey(raw.Trim()))
            {
                // Peta belum pernah dibaca (atau nilai tak ada): baca dulu supaya label bisa diterjemahkan.
                var buf = new ulong[512];
                if (sony_get_prop(def.Code, out _, buf, buf.Length, out var n, out _) == 0)
                {
                    map = BuildMap(def, buf, n);
                    _labelMaps[name] = map;
                }
            }
            if (map == null || !map.TryGetValue(raw.Trim(), out var code))
            {
                results[name] = (false, $"Nilai \"{raw}\" tidak tersedia di kamera ini (cek mode eksposur: M/A/S)");
                continue;
            }
            var rc = sony_set_prop(def.Code, code, def.Bytes);
            results[name] = rc == 0 ? (true, null) : (false, $"Kamera menolak nilai ini (kode 0x{rc:X})");
        }
        return results;
    });

    public Task<bool> DriveFocusAsync(bool far, int step) =>
        throw new NotSupportedException("Fokus manual dari layar belum tersedia untuk kamera Sony - gunakan ring fokus lensa");
}
