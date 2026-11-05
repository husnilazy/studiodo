namespace StudiodoCanonBridge;

// Menggabungkan beberapa mesin kamera: kamera mana pun yang terhubung lebih dulu
// dipakai (sticky sampai dicabut). Mesin yang gagal start (DLL SDK tidak ada)
// dilewati — kiosk Canon tidak butuh DLL Sony dan sebaliknya.
public sealed class CameraHub : ICameraBackend
{
    private readonly List<ICameraBackend> _backends = new();
    private ICameraBackend? _active;
    private readonly List<string> _startupErrors = new();

    public CameraHub(params Func<ICameraBackend>[] factories)
    {
        foreach (var make in factories)
        {
            try { _backends.Add(make()); }
            catch (Exception ex) { _startupErrors.Add(ex.Message); Console.WriteLine($"[canon-bridge] mesin dilewati: {ex.Message}"); }
        }
    }

    public IReadOnlyList<ICameraBackend> Backends => _backends;

    private ICameraBackend? Pick()
    {
        if (_active is { Connected: true }) return _active;
        _active = _backends.FirstOrDefault(b => b.Connected);
        return _active;
    }

    private ICameraBackend Require() => Pick() ?? throw new InvalidOperationException("Kamera tidak terhubung");

    public string State => Pick() != null ? "ready" : _backends.Any(b => b.State == "asleep") ? "asleep" : "none";

    public Task<bool> PrepareAsync(TimeSpan hold) => Require().PrepareAsync(hold);
    public Task StandbyAsync() => Pick()?.StandbyAsync() ?? Task.CompletedTask;

    public string Engine => Pick()?.Engine ?? "none";
    public bool Connected => Pick() != null;
    public string CameraName => Pick()?.CameraName ?? "";
    public string? LastError =>
        Pick() != null ? null
        : _backends.Select(b => b.LastError).FirstOrDefault(e => e != null) ?? _startupErrors.FirstOrDefault();

    public Task<byte[]> CaptureAsync(TimeSpan timeout) => Require().CaptureAsync(timeout);
    public Task<bool> FocusAsync() => Require().FocusAsync();
    public Task<bool> DriveFocusAsync(bool far, int step) => Require().DriveFocusAsync(far, step);
    public Task<bool> StartLiveAsync(TimeSpan wait) => Require().StartLiveAsync(wait);
    public Task StopLiveAsync() => Pick()?.StopLiveAsync() ?? Task.CompletedTask;
    public byte[]? LatestLiveFrame() => Pick()?.LatestLiveFrame();

    public Task<Dictionary<string, PropState>> GetPropertiesAsync() => Pick()?.GetPropertiesAsync()
        ?? Task.FromResult(CameraProps.All.ToDictionary(p => p.Name, p => new PropState(null, new(), "Kamera tidak terhubung") { Label = p.Label, Group = p.Group, Writable = p.Writable }));

    public Task<Dictionary<string, (bool Ok, string? Error)>> SetPropertiesAsync(Dictionary<string, string> values) =>
        Require().SetPropertiesAsync(values);

    public void Dispose() { foreach (var b in _backends) b.Dispose(); }
}
