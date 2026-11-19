namespace AgentOffice.Desktop;

/// <summary>Where the Agent Office repo is and which port the server uses.</summary>
internal sealed record AppConfig(string Root, int Port)
{
    private const int DefaultPort = 4317;

    public Uri Origin => new($"http://127.0.0.1:{Port}/");

    public bool HasServerScript => File.Exists(EnsureServerScript);

    public string EnsureServerScript => Path.Combine(Root, "ensure-server.js");

    public static AppConfig Resolve() => new(ResolveRoot(), ResolvePort());

    // Same rule as server.js / hook.js / ensure-server.js: Number(AGENT_OFFICE_PORT) || 4317.
    private static int ResolvePort()
    {
        string? raw = Environment.GetEnvironmentVariable("AGENT_OFFICE_PORT");
        return int.TryParse(raw, out int port) && port is > 0 and < 65536 ? port : DefaultPort;
    }

    // AGENT_OFFICE_ROOT, else the first parent of the exe that contains server.js + ensure-server.js.
    private static string ResolveRoot()
    {
        string? fromEnv = Environment.GetEnvironmentVariable("AGENT_OFFICE_ROOT");
        if (!string.IsNullOrWhiteSpace(fromEnv) && IsRepoRoot(fromEnv)) return Path.GetFullPath(fromEnv);

        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            if (IsRepoRoot(dir.FullName)) return dir.FullName;
        }
        // Not found: keep the exe folder. MainForm tells the user that server.js is missing and how to point at the repo.
        return AppContext.BaseDirectory;
    }

    private static bool IsRepoRoot(string dir) =>
        File.Exists(Path.Combine(dir, "server.js")) && File.Exists(Path.Combine(dir, "ensure-server.js"));
}
