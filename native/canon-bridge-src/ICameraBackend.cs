namespace StudiodoCanonBridge;

public sealed record PropState(string? Value, List<string> Choices, string? Error)
{
    /// <summary>Nama tampilan, grup UI ("exposure"/"focus"/"color"/"output"), dan apakah bisa diubah dari PC.</summary>
    public string? Label { get; init; }
    public string Group { get; init; } = "other";
    public bool Writable { get; init; } = true;
}

// Satu mesin kamera (Canon EDSDK, Sony Camera Remote SDK, ...). Semua implementasi
// memegang thread kamera sendiri; pemanggil HTTP boleh memanggil dari thread mana pun.
public interface ICameraBackend : IDisposable
{
    string Engine { get; }
    bool Connected { get; }
    string CameraName { get; }
    string? LastError { get; }
    /// <summary>"ready" (terhubung), "asleep" (kamera tidur/mati setelah pernah terhubung) atau "none".</summary>
    string State { get; }

    Task<byte[]> CaptureAsync(TimeSpan timeout);
    /// <summary>Bangunkan/siapkan kamera untuk sesi: tahan agar tidak tidur sampai holdSeconds dan nyalakan live view.</summary>
    Task<bool> PrepareAsync(TimeSpan hold);
    /// <summary>Kamera kembali idle: matikan live view supaya sensor dingin (kamera boleh tidur sesuai timernya).</summary>
    Task StandbyAsync();
    Task<bool> FocusAsync();
    /// <summary>Geser fokus manual dekat/jauh (step 1-3). Tidak semua mesin mendukung.</summary>
    Task<bool> DriveFocusAsync(bool far, int step);
    Task<bool> StartLiveAsync(TimeSpan wait);
    Task StopLiveAsync();
    byte[]? LatestLiveFrame();
    Task<Dictionary<string, PropState>> GetPropertiesAsync();
    Task<Dictionary<string, (bool Ok, string? Error)>> SetPropertiesAsync(Dictionary<string, string> values);
}
