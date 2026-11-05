using System.Text.Json;
using StudiodoCanonBridge;

// STUDIODO — Canon EDSDK bridge
//
// Kontrak HTTP sama dengan electron/digicam-bridge.cjs (digiCamControl), jadi
// client/src/lib/camera.ts tidak perlu tahu mesin mana yang dipakai:
//   GET  /health, POST /capture, POST /focus, GET|POST /properties,
//   POST /liveview/start, POST /liveview/stop, GET /liveview.jpg
// Port default 5514 (5513 dipakai digiCamControl); ubah dengan --port atau CANON_BRIDGE_PORT.

var port = int.TryParse(Environment.GetEnvironmentVariable("CANON_BRIDGE_PORT"), out var envPort) ? envPort : 5514;
for (var i = 0; i < args.Length - 1; i++)
    if (args[i] == "--port" && int.TryParse(args[i + 1], out var p)) port = p;

var builder = WebApplication.CreateSlimBuilder();
builder.WebHost.UseUrls($"http://127.0.0.1:{port}");
builder.Logging.SetMinimumLevel(LogLevel.Warning);
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors();

using var camera = new CameraHub(() => new EdsCamera(), () => new SonyCamera());
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);

app.MapGet("/health", () => Results.Json(new
{
    ok = true,
    engine = camera.Engine,
    cameraConnected = camera.Connected,
    state = camera.State,
    camera = camera.CameraName,
    error = camera.LastError,
}, json));

app.MapPost("/capture", async (HttpContext ctx) =>
{
    // Body ({ slotIndex, filter, orientation }) tidak dipakai untuk menembak —
    // sama seperti bridge digiCamControl; dibaca habis supaya request tidak menggantung.
    using var _ = ctx.Request.Body;
    try
    {
        var jpeg = await camera.CaptureAsync(TimeSpan.FromSeconds(25));
        return Results.File(jpeg, "image/jpeg");
    }
    catch (Exception ex)
    {
        return Results.Json(new { error = ex.Message }, json, statusCode: 502);
    }
});

app.MapPost("/focus", async () =>
{
    try { return Results.Json(new { ok = await camera.FocusAsync() }, json); }
    catch (Exception ex) { return Results.Json(new { error = ex.Message }, json, statusCode: 502); }
});

app.MapPost("/focus/drive", async (HttpContext ctx) =>
{
    try
    {
        var body = await ctx.Request.ReadFromJsonAsync<Dictionary<string, JsonElement>>() ?? new();
        var far = body.TryGetValue("direction", out var d) && d.GetString() == "far";
        var step = body.TryGetValue("step", out var st) && st.TryGetInt32(out var n) ? n : 1;
        return Results.Json(new { ok = await camera.DriveFocusAsync(far, step) }, json);
    }
    catch (Exception ex) { return Results.Json(new { error = ex.Message }, json, statusCode: 502); }
});

app.MapPost("/power/prepare", async (HttpContext ctx) =>
{
    try
    {
        var body = await ctx.Request.ReadFromJsonAsync<Dictionary<string, JsonElement>>() ?? new();
        var hold = body.TryGetValue("holdSeconds", out var h) && h.TryGetInt32(out var n) ? Math.Clamp(n, 30, 3600) : 600;
        var ready = await camera.PrepareAsync(TimeSpan.FromSeconds(hold));
        return Results.Json(new { ready, state = camera.State }, json);
    }
    catch (Exception ex) { return Results.Json(new { error = ex.Message, state = camera.State }, json, statusCode: 409); }
});

app.MapPost("/power/standby", async () =>
{
    try { await camera.StandbyAsync(); } catch { /* kamera mungkin sudah tidur */ }
    return Results.Json(new { state = camera.State }, json);
});

app.MapPost("/liveview/start", async () =>
{
    try
    {
        var ready = await camera.StartLiveAsync(TimeSpan.FromSeconds(10));
        return Results.Json(new { ready }, json);
    }
    catch (Exception ex) { return Results.Json(new { error = ex.Message }, json, statusCode: 502); }
});

app.MapPost("/liveview/stop", async () =>
{
    try { await camera.StopLiveAsync(); } catch { /* kamera mungkin sudah dicabut */ }
    return Results.NoContent();
});

app.MapGet("/liveview.jpg", () =>
{
    var frame = camera.LatestLiveFrame();
    return frame == null ? Results.NoContent() : Results.File(frame, "image/jpeg");
});

app.MapGet("/properties", async () =>
{
    try
    {
        var props = await camera.GetPropertiesAsync();
        return Results.Json(props.ToDictionary(
            kv => kv.Key,
            kv => new { value = kv.Value.Value, choices = kv.Value.Choices, error = kv.Value.Error, label = kv.Value.Label, group = kv.Value.Group, writable = kv.Value.Writable }), json);
    }
    catch (Exception ex) { return Results.Json(new { error = ex.Message }, json, statusCode: 502); }
});

app.MapPost("/properties", async (Dictionary<string, string> values) =>
{
    var results = await camera.SetPropertiesAsync(values);
    return Results.Json(new
    {
        results = results.ToDictionary(kv => kv.Key, kv => new { ok = kv.Value.Ok, error = kv.Value.Error }),
    }, json);
});

if (Environment.GetEnvironmentVariable("CANON_BRIDGE_DEBUG") == "1")
{
    app.MapGet("/debug/prop", async (string id, bool? priv) =>
    {
        var hub = camera as CameraHub;
        var eds = hub?.Backends.OfType<EdsCamera>().FirstOrDefault();
        if (eds == null) return Results.Json(new { error = "tidak ada mesin Canon" }, json, statusCode: 404);
        var n = Convert.ToUInt32(id.Replace("0x", ""), 16);
        return Results.Json(await eds.RawProbeAsync(n, priv ?? false), json);
    });
}

Console.WriteLine($"[canon-bridge] jalan di http://127.0.0.1:{port}");
app.Run();
