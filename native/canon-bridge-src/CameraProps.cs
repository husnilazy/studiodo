using EDSDKLib;

namespace StudiodoCanonBridge;

// Kode properti EDSDK -> label yang sama dengan yang dipakai UI (CameraSettings).
// Tabel dari EDSDKTypes.h; kode yang tidak ada di tabel tetap bisa dipilih
// lewat label "0xNN" supaya model kamera lain tidak terkunci.
public static class CameraProps
{
    // Group: "exposure" (segitiga eksposur + kompensasi/mode/metering), "focus", "color", "output".
    // Writable=false: hanya bisa diubah dari dial/menu kamera (mode eksposur, switch AF/MF di lensa).
    public sealed record PropDef(string Name, string Label, string Group, uint Id, bool Writable, Dictionary<uint, string> Map, Func<uint, string>? Format = null, bool FixedChoices = false);

    public static PropDef[] All => new[]
    {
        new PropDef("iso", "ISO", "exposure", EDSDK.PropID_ISOSpeed, true, Iso),
        new PropDef("shutterspeed", "Shutter Speed", "exposure", EDSDK.PropID_Tv, true, Tv),
        new PropDef("aperture", "Aperture", "exposure", EDSDK.PropID_Av, true, Av),
        new PropDef("exposurecomp", "Kompensasi Eksposur (EV)", "exposure", 0x0000040E, true, ExposureComp),
        new PropDef("exposuremode", "Mode Eksposur (dial kamera)", "exposure", 0x00000436, false, ExposureMode),
        new PropDef("meteringmode", "Metering", "exposure", 0x0000040D, true, Metering),
        new PropDef("afmode", "Mode Autofocus", "focus", 0x0000010E, true, AfMode),
        new PropDef("whitebalance", "White Balance", "color", EDSDK.PropID_WhiteBalance, true, Wb),
        new PropDef("picturestyle", "Picture Style", "color", 0x00000114, true, PictureStyle),
        // Daya & suhu. Baterai/suhu hanya dibaca; tidur otomatis (detik) bisa diatur dan kamera tidak
        // melaporkan daftar pilihannya, jadi daftar tetap di bawah (FixedChoices).
        new PropDef("autopoweroff", "Tidur otomatis kamera", "power", 0x0100045E, true, AutoPowerOff, null, true),
        new PropDef("batterylevel", "Sumber daya", "power", 0x00000008, false, new(), BatteryLabel),
        new PropDef("cameratemp", "Suhu kamera", "power", 0x01000415, false, TempStatus),
        new PropDef("imagequality", "Kualitas & Ukuran Foto", "output", 0x00000100, true, ImageQuality, ImageQualityLabel),
    };

    // Beberapa kode (langkah 1/3 stop) berbagi label bulat yang sama — bedakan
    // supaya memilih satu nilai tidak diam-diam menjadi nilai lain.
    private static Dictionary<uint, string> Uniq(Dictionary<uint, string> map) => map;

    public static string Label(PropDef def, uint code) => def.Format != null ? def.Format(code) : Label(def.Map, code);

    // Kode kualitas gambar Canon: [ukuran1][tipe1][ukuran2][tipe2]; tipe = (jenis<<4)|kompresi
    // (jenis 1 JPEG, 6 RAW; kompresi 2 Normal, 3 Fine, 4 RAW). Ukuran 0 L, 1 M, 2 S, 0xE S1, 0xF S2, 0x10 S3,
    // 0xFF = slot kosong. Diverifikasi terhadap daftar dari EOS 1300D.
    private static string ImageQualitySlot(uint size, uint type)
    {
        if (size == 0xFF || type == 0xFF) return "";
        var kind = type >> 4; var comp = type & 0xF;
        var sizeName = size switch { 0 => "Large", 1 => "Medium", 2 => "Small", 0xE => "Small 1", 0xF => "Small 2", 0x10 => "Small 3", _ => $"#{size:X}" };
        if (kind == 6) return size == 0 ? "RAW" : size == 1 ? "M-RAW" : "S-RAW";
        var kindName = kind == 1 ? "JPEG" : $"T{kind:X}";
        var compName = comp switch { 2 => "Normal", 3 => "Fine", 5 => "Superfine", _ => $"Q{comp:X}" };
        return $"{kindName} {sizeName} {compName}";
    }

    public static string ImageQualityLabel(uint code)
    {
        var first = ImageQualitySlot((code >> 24) & 0xFF, (code >> 16) & 0xFF);
        var second = ImageQualitySlot((code >> 8) & 0xFF, code & 0xFF);
        if (first == "") return $"0x{code:X}";
        return second == "" ? first : $"{first} + {second}";
    }

    public static string Label(Dictionary<uint, string> map, uint code) =>
        map.TryGetValue(code, out var label) ? label : (ReferenceEquals(map, TempStatus) ? $"Waspada (kode {code})" : $"0x{code:X}");

    public static bool TryParse(Dictionary<uint, string> map, string raw, out uint code)
    {
        raw = raw.Trim();
        foreach (var (k, v) in map)
            if (string.Equals(v, raw, StringComparison.OrdinalIgnoreCase)) { code = k; return true; }
        if (raw.StartsWith("0x", StringComparison.OrdinalIgnoreCase) &&
            uint.TryParse(raw[2..], System.Globalization.NumberStyles.HexNumber, null, out code)) return true;
        code = 0;
        return false;
    }

    private static readonly Dictionary<uint, string> Iso = Uniq(new Dictionary<uint, string>
    {
        [0x00] = "Auto", [0x28] = "6", [0x30] = "12", [0x38] = "25", [0x40] = "50", [0x48] = "100", [0x4B] = "125",
        [0x4D] = "160", [0x50] = "200", [0x53] = "250", [0x55] = "320", [0x58] = "400", [0x5B] = "500",
        [0x5D] = "640", [0x60] = "800", [0x63] = "1000", [0x65] = "1250", [0x68] = "1600", [0x6B] = "2000",
        [0x6D] = "2500", [0x70] = "3200", [0x73] = "4000", [0x75] = "5000", [0x78] = "6400", [0x7B] = "8000",
        [0x7D] = "10000", [0x80] = "12800", [0x88] = "25600",
    });

    private static readonly Dictionary<uint, string> Tv = Uniq(new Dictionary<uint, string>
    {
        [0x0C] = "Bulb", [0x10] = "30", [0x13] = "25", [0x14] = "20", [0x15] = "20", [0x18] = "15", [0x1B] = "13",
        [0x1C] = "10", [0x1D] = "10", [0x20] = "8", [0x23] = "6", [0x24] = "6", [0x25] = "5", [0x28] = "4",
        [0x2B] = "3.2", [0x2C] = "3", [0x2D] = "2.5", [0x30] = "2", [0x33] = "1.6", [0x34] = "1.5", [0x35] = "1.3",
        [0x38] = "1", [0x3B] = "0.8", [0x3C] = "0.7", [0x3D] = "0.6", [0x40] = "0.5", [0x43] = "0.4", [0x44] = "0.3",
        [0x45] = "0.3", [0x48] = "1/4", [0x4B] = "1/5", [0x4C] = "1/6", [0x4D] = "1/6", [0x50] = "1/8",
        [0x53] = "1/10", [0x54] = "1/10", [0x55] = "1/13", [0x58] = "1/15", [0x5B] = "1/20", [0x5C] = "1/20",
        [0x5D] = "1/25", [0x60] = "1/30", [0x63] = "1/40", [0x64] = "1/45", [0x65] = "1/50", [0x68] = "1/60",
        [0x6B] = "1/80", [0x6C] = "1/90", [0x6D] = "1/100", [0x70] = "1/125", [0x73] = "1/160", [0x74] = "1/180",
        [0x75] = "1/200", [0x78] = "1/250", [0x7B] = "1/320", [0x7C] = "1/350", [0x7D] = "1/400", [0x80] = "1/500",
        [0x83] = "1/640", [0x84] = "1/750", [0x85] = "1/800", [0x88] = "1/1000", [0x8B] = "1/1250", [0x8C] = "1/1500",
        [0x8D] = "1/1600", [0x90] = "1/2000", [0x93] = "1/2500", [0x94] = "1/3000", [0x95] = "1/3200",
        [0x98] = "1/4000", [0x9B] = "1/5000", [0x9C] = "1/6000", [0x9D] = "1/6400", [0xA0] = "1/8000",
    });

    private static readonly Dictionary<uint, string> Av = Uniq(new Dictionary<uint, string>
    {
        [0x08] = "1", [0x0B] = "1.1", [0x0C] = "1.2", [0x0D] = "1.2", [0x10] = "1.4", [0x13] = "1.6", [0x14] = "1.8",
        [0x15] = "1.8", [0x18] = "2", [0x1B] = "2.2", [0x1C] = "2.5", [0x1D] = "2.5", [0x20] = "2.8", [0x23] = "3.2",
        [0x24] = "3.5", [0x25] = "3.5", [0x28] = "4", [0x2B] = "4.5", [0x2C] = "4.5", [0x2D] = "5", [0x30] = "5.6",
        [0x33] = "6.3", [0x34] = "6.7", [0x35] = "7.1", [0x38] = "8", [0x3B] = "9", [0x3C] = "9.5", [0x3D] = "10",
        [0x40] = "11", [0x43] = "13", [0x44] = "13", [0x45] = "14", [0x48] = "16", [0x4B] = "18", [0x4C] = "19",
        [0x4D] = "20", [0x50] = "22", [0x53] = "25", [0x54] = "27", [0x55] = "29", [0x58] = "32",
    });

    private static readonly Dictionary<uint, string> Wb = Uniq(new Dictionary<uint, string>
    {
        [0] = "Auto", [1] = "Daylight", [2] = "Cloudy", [3] = "Tungsten", [4] = "Fluorescent", [5] = "Flash",
        [6] = "Manual", [8] = "Shade", [9] = "Color Temperature", [10] = "PC Set 1", [11] = "PC Set 2",
        [12] = "PC Set 3", [23] = "Auto White",
    });

    private static readonly Dictionary<uint, string> AutoPowerOff = new()
    {
        [30] = "30 detik", [60] = "1 menit", [120] = "2 menit", [240] = "4 menit", [480] = "8 menit", [900] = "15 menit", [0] = "Nonaktif",
    };

    private static readonly Dictionary<uint, string> TempStatus = new() { [0] = "Normal" };

    public static string BatteryLabel(uint code) => code switch
    {
        0xFFFFFFFF => "Adaptor AC (tanpa baterai)",
        0xFFFFFFFE => "Tidak diketahui",
        _ => $"Baterai {code}%",
    };

    // Kompensasi eksposur: int8 dalam 1/8 EV; langkah 1/3 dikodekan 3 & 5 per 8, 1/2 sebagai 4.
    private static readonly Dictionary<uint, string> ExposureComp = BuildExposureComp();
    private static Dictionary<uint, string> BuildExposureComp()
    {
        var map = new Dictionary<uint, string>();
        for (var v = -40; v <= 40; v++)
        {
            var rem = Math.Abs(v) % 8;
            if (rem is not (0 or 3 or 4 or 5)) continue;
            var whole = Math.Abs(v) / 8;
            var frac = rem switch { 3 => ".3", 4 => ".5", 5 => ".7", _ => "" };
            // 5 per 8 = +2/3 -> sudah masuk "whole.7" tanpa menambah whole; 3 per 8 = 1/3.
            var label = v == 0 ? "0" : (v < 0 ? "-" : "+") + whole + frac;
            map[(uint)(byte)(sbyte)v] = label;
        }
        return map;
    }

    private static readonly Dictionary<uint, string> ExposureMode = new()
    {
        [0] = "P (Program)", [1] = "Tv (Prioritas shutter)", [2] = "Av (Prioritas aperture)", [3] = "M (Manual)",
        [4] = "Bulb", [5] = "A-DEP", [6] = "DEP", [7] = "Custom", [8] = "Lock", [9] = "Green (Auto)", [10] = "Night Portrait",
        [11] = "Sports", [12] = "Portrait", [13] = "Landscape", [14] = "Close-up", [15] = "Flash Off", [19] = "Creative Auto",
    };

    private static readonly Dictionary<uint, string> Metering = new()
    {
        [1] = "Spot", [3] = "Evaluatif", [4] = "Parsial", [5] = "Center-weighted",
    };

    private static readonly Dictionary<uint, string> AfMode = new()
    {
        [0] = "One-Shot AF", [1] = "AI Servo AF", [2] = "AI Focus AF", [3] = "Manual Focus", [4] = "Tidak ada",
    };

    private static readonly Dictionary<uint, string> PictureStyle = new()
    {
        [0x81] = "Standard", [0x82] = "Portrait", [0x83] = "Landscape", [0x84] = "Neutral", [0x85] = "Faithful",
        [0x86] = "Monochrome", [0x87] = "Auto", [0x88] = "Fine Detail", [0x21] = "User 1", [0x22] = "User 2", [0x23] = "User 3",
    };

    // Kode kualitas gambar Canon sangat berlapis (JPEG/RAW, ukuran, kompresi) — tabel ini hanya
    // untuk label; kode lain tampil sebagai "0xNNNNNNNN" dan tetap bisa dipilih dari daftar kamera.
    private static readonly Dictionary<uint, string> ImageQuality = new()
    {
        [0x0013FF0F] = "JPEG Large Fine", [0x0113FF0F] = "JPEG Large Normal", [0x0213FF0F] = "JPEG Medium Fine",
        [0x0313FF0F] = "JPEG Medium Normal", [0x0E13FF0F] = "JPEG Small Fine", [0x0F13FF0F] = "JPEG Small Normal",
        [0x0064FF0F] = "RAW", [0x00640013] = "RAW + JPEG Large Fine",
    };
}
