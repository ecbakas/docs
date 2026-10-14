# Unirefund Print Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-user Windows tray app that accepts ZPL jobs from the Unirefund portal on `127.0.0.1:9180` and writes them raw to a network printer (port 9100) or an installed USB printer queue.

**Architecture:**
- A `Core` class library holds the whole HTTP surface: Kestrel minimal APIs behind an Origin/Host guard. It also holds the security rules, printing (TCP 9100 and the Windows RAW spooler) and subnet discovery, all behind interfaces, so xUnit can test the API in-process with fakes.
- A thin WinForms tray app hosts it, adds file logging and per-user autostart.
- An Inno Setup script packages it per user.

**Tech Stack:**
- .NET 10 (`net10.0-windows`), ASP.NET Core minimal APIs, WinForms
- xUnit v2 + `Microsoft.AspNetCore.TestHost`
- `System.Management` (WMI), Serilog file sink
- Inno Setup 6, GitHub Actions

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-10-14-sticker-zpl-printing-design.md`, section C. Read it before Task 1. The browser side is a separate plan, `2026-10-14-sticker-zpl-web.md`. It depends only on the HTTP contract this plan implements.

**Repo:** `C:\unirefund\print-helper`, a local git repo on `main` with only a README. There is no GitHub remote yet: **ask the user before creating one** (Task 8).

## Global Constraints

- **Platform:** `net10.0-windows` for every project. Windows only.
- **Listening:** `127.0.0.1` port **9180** only. web-app hard-codes `http://127.0.0.1:9180`.
- **API contract** (spec C), exactly:
  - `GET /status` → `{ name, version, apiVersion: 1 }`
  - `GET /printers?scan=1` → `{ queues: [{ name, driver, port }], network: [{ host, port }] }`
  - `POST /print` takes `{ target: { kind: "network", host, port } | { kind: "queue", name }, data, jobName }` and returns `{ ok: true, bytes, ms }`.
  - Errors return `{ ok: false, error: { code, message } }` with 400 / 403 / 404 / 413 / 502 / 504.
- **Allowed origins:** `https://portal.unirefund.com`, `https://uat.unirefund.com` and `https://dev.unirefund.com`. Additional ones come only from `%LOCALAPPDATA%\Unirefund\PrintHelper\settings.json` (`extraAllowedOrigins`).
- **Host header:** `127.0.0.1:9180` or `localhost:9180` only.
- **Print targets:** private IPv4 (10/8, 172.16/12, 192.168/16) on port 9100, or a queue that exists on the PC.
- **Limits:** 20 MB request body, and **one job at a time per printer**.
- **Logs:** under `%LOCALAPPDATA%\Unirefund\PrintHelper\logs`, recording target, size and outcome. Never label data.
- **Install:** per user, no admin rights. Autostart is the `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value `UnirefundPrintHelper`.
- **No certificates and no backend calls.**
- **Workspace rule: the user runs artifact builds.** That covers `dotnet publish` and the Inno Setup compile. Hand over the exact command; `dotnet build` and `dotnet test` are yours.
- **Commits:** write each message with a quoted heredoc (`git commit -F - <<'EOF'`), with no backslashes or backticks inside, ending with:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Comments:** few. Explain a non-obvious why, never narrate the code.

## Review Focus

1. **Port 9180 already taken** (another copy, or another app). Startup must not crash: the tray shows "Not running: …". Pinned by `StartupTests.Fails_to_start_when_the_port_is_taken` (Task 5), plus the single-instance mutex (Task 7).
2. **Origin look-alikes:**
   - These pass: a trailing slash, upper case.
   - These are refused: a suffix domain (`portal.unirefund.com.evil.example`), dev on the wrong port (`localhost:3001`).
   - Pinned by `RequestPolicyTests` (Task 2).
3. **A body over the limit sent with Content-Length** is refused with 413 before any printing. Pinned by `ApiTests.Refuses_a_body_over_the_limit` (Task 5).
4. **Two browser tabs printing to one printer at once** are serialised. Pinned by `TargetLocksTests` (Task 3) and `ApiTests.Serialises_concurrent_jobs_to_the_same_printer` (Task 5).
5. **A printer that accepts the connection but stops reading** (paused, out of ribbon) gets a 504 within the timeout instead of hanging the dialog. Pinned by `TcpNetworkPrinterTests.A_printer_that_stops_reading_times_out` (Task 3).

---

### Task 0: Toolchain (user step)

Nothing here is code. It needs admin rights, so the user does it.

- [ ] **Step 1: Ask the user to install the .NET 10 SDK and Inno Setup 6**

Ask the user to run this in an elevated PowerShell, then report the output of the last command:

```powershell
winget install --id Microsoft.DotNet.SDK.10 -e
winget install --id JRSoftware.InnoSetup -e
dotnet --list-sdks
```

Expected: a line starting `10.0.`. Do not continue until it is there.

---

### Task 1: Repo scaffold and the printer-address rule

**Files:**
- Create: `Directory.Build.props`, `.gitignore`, `PrintHelper.slnx`
- Create: `src/Unirefund.PrintHelper.Core/Unirefund.PrintHelper.Core.csproj`
- Create: `src/Unirefund.PrintHelper.Core/Security/TargetPolicy.cs`
- Create: `tests/Unirefund.PrintHelper.Tests/Unirefund.PrintHelper.Tests.csproj`
- Test: `tests/Unirefund.PrintHelper.Tests/TargetPolicyTests.cs`

**Interfaces:**
- Produces: `Unirefund.PrintHelper.Core.Security.TargetPolicy.IsPrivateIPv4(string? host): bool`. Task 4 (discovery) and Task 5 (API) use it.

- [ ] **Step 1: Write the shared build settings and ignore file**

`Directory.Build.props`:

```xml
<Project>
  <PropertyGroup>
    <Version>1.0.0</Version>
    <Company>Unirefund</Company>
    <Product>Unirefund Print Helper</Product>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <LangVersion>latest</LangVersion>
  </PropertyGroup>
</Project>
```

`.gitignore`:

```text
bin/
obj/
artifacts/
TestResults/
.vs/
*.user
```

- [ ] **Step 2: Create the projects and the solution**

`src/Unirefund.PrintHelper.Core/Unirefund.PrintHelper.Core.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net10.0-windows</TargetFramework>
    <RootNamespace>Unirefund.PrintHelper.Core</RootNamespace>
  </PropertyGroup>

  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
  </ItemGroup>

</Project>
```

`tests/Unirefund.PrintHelper.Tests/Unirefund.PrintHelper.Tests.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net10.0-windows</TargetFramework>
    <IsPackable>false</IsPackable>
  </PropertyGroup>

  <ItemGroup>
    <Using Include="Xunit" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\..\src\Unirefund.PrintHelper.Core\Unirefund.PrintHelper.Core.csproj" />
  </ItemGroup>

</Project>
```

Then, from `C:\unirefund\print-helper`:

```powershell
dotnet new sln -n PrintHelper
dotnet sln PrintHelper.slnx add src/Unirefund.PrintHelper.Core/Unirefund.PrintHelper.Core.csproj tests/Unirefund.PrintHelper.Tests/Unirefund.PrintHelper.Tests.csproj
dotnet add tests/Unirefund.PrintHelper.Tests package Microsoft.NET.Test.Sdk
dotnet add tests/Unirefund.PrintHelper.Tests package xunit
dotnet add tests/Unirefund.PrintHelper.Tests package xunit.runner.visualstudio
dotnet add tests/Unirefund.PrintHelper.Tests package Microsoft.AspNetCore.TestHost
```

Expected: the .NET 10 SDK creates `PrintHelper.slnx`. If it creates `PrintHelper.sln`, use that name in every later command. `Microsoft.AspNetCore.TestHost` must resolve to a `10.0.x` version; check the csproj after adding it.

- [ ] **Step 3: Write the failing test**

`tests/Unirefund.PrintHelper.Tests/TargetPolicyTests.cs`:

```csharp
using Unirefund.PrintHelper.Core.Security;

namespace Unirefund.PrintHelper.Tests;

public class TargetPolicyTests
{
    [Theory]
    [InlineData("10.0.0.5")]
    [InlineData("172.16.0.1")]
    [InlineData("172.31.255.254")]
    [InlineData("192.168.1.19")]
    public void Accepts_private_ranges(string host) => Assert.True(TargetPolicy.IsPrivateIPv4(host));

    [Theory]
    [InlineData("8.8.8.8")]
    [InlineData("172.32.0.1")]
    [InlineData("127.0.0.1")]
    [InlineData("192.168.1.300")]
    [InlineData("10")]
    [InlineData("printer.local")]
    [InlineData("")]
    [InlineData(null)]
    public void Rejects_everything_else(string? host) => Assert.False(TargetPolicy.IsPrivateIPv4(host));
}
```

- [ ] **Step 4: Run it to verify it fails**

Run: `dotnet test PrintHelper.slnx --filter FullyQualifiedName~TargetPolicyTests`
Expected: the build fails with `CS0103: The name 'TargetPolicy' does not exist in the current context`.

- [ ] **Step 5: Implement**

`src/Unirefund.PrintHelper.Core/Security/TargetPolicy.cs`:

```csharp
using System.Text.RegularExpressions;

namespace Unirefund.PrintHelper.Core.Security;

public static partial class TargetPolicy
{
    [GeneratedRegex(@"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$")]
    private static partial Regex DottedQuad();

    /// <summary>
    /// 10/8, 172.16/12 and 192.168/16 written as a plain dotted quad. Parsed by
    /// hand rather than with IPAddress.TryParse, which also accepts "10" and
    /// octal-looking "010.0.0.1" - the browser side applies the same rule.
    /// </summary>
    public static bool IsPrivateIPv4(string? host)
    {
        if (host is null) return false;
        var match = DottedQuad().Match(host);
        if (!match.Success) return false;
        var octets = new int[4];
        for (var i = 0; i < 4; i++)
        {
            octets[i] = int.Parse(match.Groups[i + 1].Value);
            if (octets[i] > 255) return false;
        }
        return octets[0] == 10
            || (octets[0] == 172 && octets[1] is >= 16 and <= 31)
            || (octets[0] == 192 && octets[1] == 168);
    }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test PrintHelper.slnx --filter FullyQualifiedName~TargetPolicyTests`
Expected: `Passed!  - Failed: 0, Passed: 12`.

- [ ] **Step 7: Commit**

```bash
cd /c/unirefund/print-helper
git add -A
git commit -F - <<'EOF'
chore: scaffold the print helper solution and the printer-address rule

Core library and xUnit project on net10.0-windows. TargetPolicy accepts only
a dotted-quad private IPv4 address, the same rule web-app applies.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Origin and Host policy, options, settings file

**Files:**
- Create: `src/Unirefund.PrintHelper.Core/HelperOptions.cs`
- Create: `src/Unirefund.PrintHelper.Core/Security/RequestPolicy.cs`
- Create: `src/Unirefund.PrintHelper.Core/HelperSettings.cs`
- Test: `tests/Unirefund.PrintHelper.Tests/RequestPolicyTests.cs`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `HelperOptions` (`Port`, `AllowedOrigins`, `DefaultOrigins`, `MaxBodyBytes`, `PrinterPort`, `PrinterTimeout`, `ScanTimeout`, `Version`)
  - `RequestPolicy(HelperOptions)` with `IsOriginAllowed(string?)` and `IsHostAllowed(string?)`
  - `HelperSettings.Load(string path)` returning `ExtraAllowedOrigins`

- [ ] **Step 1: Write the failing tests**

`tests/Unirefund.PrintHelper.Tests/RequestPolicyTests.cs`:

```csharp
using Unirefund.PrintHelper.Core;
using Unirefund.PrintHelper.Core.Security;

namespace Unirefund.PrintHelper.Tests;

public class RequestPolicyTests
{
    private readonly RequestPolicy _policy = new(new HelperOptions
    {
        AllowedOrigins = [.. HelperOptions.DefaultOrigins, "http://localhost:3000"],
    });

    [Theory]
    [InlineData("https://portal.unirefund.com")]
    [InlineData("https://dev.unirefund.com/")]
    [InlineData("HTTPS://UAT.UNIREFUND.COM")]
    [InlineData("http://localhost:3000")]
    public void Allows_listed_origins_ignoring_case_and_trailing_slash(string origin) =>
        Assert.True(_policy.IsOriginAllowed(origin));

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData("http://localhost:3001")]
    [InlineData("https://portal.unirefund.com.evil.example")]
    [InlineData("")]
    [InlineData(null)]
    public void Refuses_other_origins(string? origin) => Assert.False(_policy.IsOriginAllowed(origin));

    [Theory]
    [InlineData("127.0.0.1:9180", true)]
    [InlineData("localhost:9180", true)]
    [InlineData("LOCALHOST:9180", true)]
    [InlineData("127.0.0.1", false)]
    [InlineData("attacker.example:9180", false)]
    [InlineData(null, false)]
    public void Checks_the_host_header(string? host, bool allowed) =>
        Assert.Equal(allowed, _policy.IsHostAllowed(host));
}

public class HelperSettingsTests
{
    [Fact]
    public void Missing_file_means_no_extra_origins()
    {
        Assert.Empty(HelperSettings.Load(Path.Combine(Path.GetTempPath(), Guid.NewGuid() + ".json")).ExtraAllowedOrigins);
    }

    [Fact]
    public void Reads_extra_origins()
    {
        var path = Path.GetTempFileName();
        File.WriteAllText(path, """{ "extraAllowedOrigins": ["http://localhost:3000"] }""");
        Assert.Equal(new[] { "http://localhost:3000" }, HelperSettings.Load(path).ExtraAllowedOrigins);
    }

    [Fact]
    public void Broken_json_falls_back_to_none()
    {
        var path = Path.GetTempFileName();
        File.WriteAllText(path, "{ not json");
        Assert.Empty(HelperSettings.Load(path).ExtraAllowedOrigins);
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~RequestPolicyTests|FullyQualifiedName~HelperSettingsTests"`
Expected: the build fails with `CS0246: The type or namespace name 'RequestPolicy' could not be found`.

- [ ] **Step 3: Implement**

`src/Unirefund.PrintHelper.Core/HelperOptions.cs`:

```csharp
namespace Unirefund.PrintHelper.Core;

public sealed class HelperOptions
{
    public const int DefaultPort = 9180;

    public static readonly IReadOnlyList<string> DefaultOrigins =
    [
        "https://portal.unirefund.com",
        "https://uat.unirefund.com",
        "https://dev.unirefund.com",
    ];

    public int Port { get; init; } = DefaultPort;
    public IReadOnlyList<string> AllowedOrigins { get; init; } = DefaultOrigins;
    public long MaxBodyBytes { get; init; } = 20 * 1024 * 1024;
    public int PrinterPort { get; init; } = 9100;
    public TimeSpan PrinterTimeout { get; init; } = TimeSpan.FromSeconds(10);
    public TimeSpan ScanTimeout { get; init; } = TimeSpan.FromMilliseconds(1500);
    public string Version { get; init; } = "0.0.0";
}
```

`src/Unirefund.PrintHelper.Core/Security/RequestPolicy.cs`:

```csharp
namespace Unirefund.PrintHelper.Core.Security;

/// <summary>
/// Who may talk to the helper. A browser cannot forge the Origin header, so an
/// allowlist replaces certificates and prompts. The Host check defeats DNS
/// rebinding: a hostile page that re-points its own name at 127.0.0.1 still
/// sends its own name as Host.
/// </summary>
public sealed class RequestPolicy(HelperOptions options)
{
    private readonly HashSet<string> _origins = new(
        options.AllowedOrigins.Select(Normalise),
        StringComparer.OrdinalIgnoreCase);

    private readonly HashSet<string> _hosts = new(
        [$"127.0.0.1:{options.Port}", $"localhost:{options.Port}"],
        StringComparer.OrdinalIgnoreCase);

    public bool IsOriginAllowed(string? origin) =>
        !string.IsNullOrWhiteSpace(origin) && _origins.Contains(Normalise(origin));

    public bool IsHostAllowed(string? host) => host is not null && _hosts.Contains(host);

    private static string Normalise(string origin) => origin.Trim().TrimEnd('/');
}
```

`src/Unirefund.PrintHelper.Core/HelperSettings.cs`:

```csharp
using System.Text.Json;

namespace Unirefund.PrintHelper.Core;

/// <summary>
/// %LOCALAPPDATA%\Unirefund\PrintHelper\settings.json. Only extra origins live
/// here - e.g. "http://localhost:3000" on a developer's machine - so production
/// installs need no file at all.
/// </summary>
public sealed record HelperSettings(IReadOnlyList<string> ExtraAllowedOrigins)
{
    public static readonly HelperSettings Empty = new([]);

    public static HelperSettings Load(string path)
    {
        try
        {
            if (!File.Exists(path)) return Empty;
            var settings = JsonSerializer.Deserialize<HelperSettings>(
                File.ReadAllText(path),
                new JsonSerializerOptions(JsonSerializerDefaults.Web));
            return settings is { ExtraAllowedOrigins: not null } ? settings : Empty;
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
        {
            return Empty;
        }
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test PrintHelper.slnx`
Expected: `Failed: 0`, with every TargetPolicy, RequestPolicy and HelperSettings test passing.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/print-helper
git add -A
git commit -F - <<'EOF'
feat: origin and host allowlist, options and settings file

Only the three portal origins (plus extras from settings.json) may call the
helper, and only with a 127.0.0.1:9180 or localhost:9180 Host header, which
stops DNS rebinding.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Network printing and per-printer serialisation

**Files:**
- Create: `src/Unirefund.PrintHelper.Core/Printing/Printers.cs`
- Test: `tests/Unirefund.PrintHelper.Tests/PrintingTests.cs`

**Interfaces:**
- Produces (namespace `Unirefund.PrintHelper.Core.Printing`):
  - **Interfaces:**
    - `INetworkPrinter.SendAsync(string host, int port, ReadOnlyMemory<byte> data, CancellationToken ct)`
    - `IQueuePrinter.SendAsync(string queueName, string jobName, ReadOnlyMemory<byte> data, CancellationToken ct)`
    - `IPrinterCatalog.ListQueues(): IReadOnlyList<QueueInfo>`, with `record QueueInfo(string Name, string Driver, string Port)`
  - **Exceptions:** `PrinterUnreachableException`, `PrinterTimeoutException`, `QueueNotFoundException`
  - **Implementations:**
    - `TcpNetworkPrinter(TimeSpan timeout)`
    - `TargetLocks.RunAsync<T>(string key, Func<Task<T>> work, CancellationToken ct)`

- [ ] **Step 1: Write the failing tests**

`tests/Unirefund.PrintHelper.Tests/PrintingTests.cs`:

```csharp
using System.Net;
using System.Net.Sockets;
using Unirefund.PrintHelper.Core.Printing;

namespace Unirefund.PrintHelper.Tests;

public class TcpNetworkPrinterTests
{
    [Fact]
    public async Task Writes_every_byte_then_closes()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var received = Task.Run(async () =>
        {
            using var client = await listener.AcceptTcpClientAsync();
            using var memory = new MemoryStream();
            await client.GetStream().CopyToAsync(memory);
            return memory.ToArray();
        });

        var payload = "^XA^FDhello^FS^XZ"u8.ToArray();
        await new TcpNetworkPrinter(TimeSpan.FromSeconds(5)).SendAsync("127.0.0.1", port, payload, CancellationToken.None);

        Assert.Equal(payload, await received);
    }

    [Fact]
    public async Task A_closed_port_is_unreachable()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();

        await Assert.ThrowsAsync<PrinterUnreachableException>(() =>
            new TcpNetworkPrinter(TimeSpan.FromSeconds(5)).SendAsync("127.0.0.1", port, new byte[] { 1 }, CancellationToken.None));
    }

    [Fact]
    public async Task A_printer_that_stops_reading_times_out()
    {
        // Accepts but never reads, like a paused printer: once the socket
        // buffers fill, the write blocks until the timeout fires.
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var accepted = listener.AcceptTcpClientAsync();

        await Assert.ThrowsAsync<PrinterTimeoutException>(() =>
            new TcpNetworkPrinter(TimeSpan.FromMilliseconds(500)).SendAsync("127.0.0.1", port, new byte[64 * 1024 * 1024], CancellationToken.None));
        (await accepted).Dispose();
    }
}

public class TargetLocksTests
{
    [Fact]
    public async Task Runs_one_job_at_a_time_per_printer()
    {
        var locks = new TargetLocks();
        var inFlight = 0;
        var maxInFlight = 0;
        async Task<bool> Work()
        {
            var now = Interlocked.Increment(ref inFlight);
            maxInFlight = Math.Max(maxInFlight, now);
            await Task.Delay(30);
            Interlocked.Decrement(ref inFlight);
            return true;
        }

        await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => locks.RunAsync("net:192.168.1.19", Work, CancellationToken.None)));

        Assert.Equal(1, maxInFlight);
    }

    [Fact]
    public async Task Different_printers_run_side_by_side()
    {
        var locks = new TargetLocks();
        var bothStarted = new TaskCompletionSource();
        var started = 0;
        async Task<bool> Work()
        {
            if (Interlocked.Increment(ref started) == 2) bothStarted.SetResult();
            await bothStarted.Task.WaitAsync(TimeSpan.FromSeconds(5));
            return true;
        }

        await Task.WhenAll(
            locks.RunAsync("net:192.168.1.19", Work, CancellationToken.None),
            locks.RunAsync("net:192.168.1.20", Work, CancellationToken.None));
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~TcpNetworkPrinterTests|FullyQualifiedName~TargetLocksTests"`
Expected: the build fails with `CS0246: … 'TcpNetworkPrinter' could not be found`.

- [ ] **Step 3: Implement**

`src/Unirefund.PrintHelper.Core/Printing/Printers.cs`:

```csharp
using System.Collections.Concurrent;
using System.Net.Sockets;

namespace Unirefund.PrintHelper.Core.Printing;

public sealed class PrinterUnreachableException(string message) : Exception(message);

public sealed class PrinterTimeoutException() : Exception("The printer stopped responding.");

public sealed class QueueNotFoundException(string queue) : Exception($"No installed printer named '{queue}'.");

public sealed record QueueInfo(string Name, string Driver, string Port);

public interface INetworkPrinter
{
    Task SendAsync(string host, int port, ReadOnlyMemory<byte> data, CancellationToken ct);
}

public interface IQueuePrinter
{
    Task SendAsync(string queueName, string jobName, ReadOnlyMemory<byte> data, CancellationToken ct);
}

public interface IPrinterCatalog
{
    IReadOnlyList<QueueInfo> ListQueues();
}

/// <summary>Raw ZPL over TCP 9100: connect, write everything, close.</summary>
public sealed class TcpNetworkPrinter(TimeSpan timeout) : INetworkPrinter
{
    public async Task SendAsync(string host, int port, ReadOnlyMemory<byte> data, CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeout);
        using var client = new TcpClient();
        try
        {
            await client.ConnectAsync(host, port, cts.Token);
            var stream = client.GetStream();
            await stream.WriteAsync(data, cts.Token);
            await stream.FlushAsync(cts.Token);
            client.Client.Shutdown(SocketShutdown.Send);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new PrinterTimeoutException();
        }
        catch (SocketException ex)
        {
            throw new PrinterUnreachableException(ex.Message);
        }
        catch (IOException ex)
        {
            throw new PrinterUnreachableException(ex.Message);
        }
    }
}

/// <summary>
/// One job at a time per printer. The office Argox silently dropped a job that
/// arrived while it was still consuming a large one, and two browser tabs can
/// print to the same printer at once.
/// </summary>
public sealed class TargetLocks
{
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.OrdinalIgnoreCase);

    public async Task<T> RunAsync<T>(string key, Func<Task<T>> work, CancellationToken ct)
    {
        var gate = _locks.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            return await work();
        }
        finally
        {
            gate.Release();
        }
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test PrintHelper.slnx`
Expected: `Failed: 0`.
- `A_closed_port_is_unreachable` takes about 2 s on Windows, which retries a refused connect; that is normal.
- If `A_printer_that_stops_reading_times_out` reports `PrinterUnreachableException` instead, the write's cancellation surfaced as an `IOException`. Map an `IOException` whose inner `SocketException` has `SocketError.OperationAborted` to `PrinterTimeoutException` when the linked token is cancelled. Do not delete the test.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/print-helper
git add -A
git commit -F - <<'EOF'
feat: raw TCP 9100 printing with a timeout, one job at a time per printer

A printer that accepts the connection but stops reading now times out
instead of hanging. Jobs to the same printer queue behind each other: the
office Argox dropped a job that arrived while it was still busy.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Printer discovery on the local /24

**Files:**
- Create: `src/Unirefund.PrintHelper.Core/Discovery/SubnetScanner.cs`
- Test: `tests/Unirefund.PrintHelper.Tests/SubnetScannerTests.cs`

**Interfaces:**
- Consumes: `TargetPolicy.IsPrivateIPv4` (Task 1), `HelperOptions` (Task 2).
- Produces (namespace `Unirefund.PrintHelper.Core.Discovery`):
  - **Records:**
    - `record NetworkPrinterInfo(string Host, int Port)`
    - `record InterfaceAddress(IPAddress Address, IPAddress Mask, bool IsUp)`
  - **Interfaces:**
    - `IPortProbe.IsOpenAsync(host, port, timeout, ct)`
    - `INetworkScanner.ScanAsync(ct): Task<IReadOnlyList<NetworkPrinterInfo>>`
  - **`SubnetScanner`:**
    - constructors `(HelperOptions)` and `(HelperOptions, IPortProbe, Func<IEnumerable<InterfaceAddress>>)`
    - static `CandidatePrefixes(IEnumerable<InterfaceAddress>)`

- [ ] **Step 1: Write the failing tests**

`tests/Unirefund.PrintHelper.Tests/SubnetScannerTests.cs`:

```csharp
using System.Collections.Concurrent;
using System.Net;
using Unirefund.PrintHelper.Core;
using Unirefund.PrintHelper.Core.Discovery;

namespace Unirefund.PrintHelper.Tests;

public class SubnetScannerTests
{
    private static InterfaceAddress Addr(string ip, string mask, bool up = true) =>
        new(IPAddress.Parse(ip), IPAddress.Parse(mask), up);

    [Fact]
    public void Picks_each_private_slash_24_once()
    {
        var prefixes = SubnetScanner.CandidatePrefixes([
            Addr("192.168.1.67", "255.255.255.0"),
            Addr("192.168.1.68", "255.255.255.0"),
            Addr("172.24.0.1", "255.255.240.0"),
            Addr("10.0.5.4", "255.255.255.0", up: false),
            Addr("8.8.8.8", "255.255.255.0"),
            Addr("10.1.2.3", "255.255.255.0"),
        ]);

        Assert.Equal(new[] { "192.168.1", "10.1.2" }, prefixes);
    }

    private sealed class FakeProbe(params string[] open) : IPortProbe
    {
        public ConcurrentBag<string> Probed { get; } = [];

        public Task<bool> IsOpenAsync(string host, int port, TimeSpan timeout, CancellationToken ct)
        {
            Probed.Add(host);
            return Task.FromResult(port == 9100 && open.Contains(host));
        }
    }

    [Fact]
    public async Task Probes_all_254_hosts_and_returns_open_ones_in_order()
    {
        var probe = new FakeProbe("192.168.1.19", "192.168.1.15");
        var scanner = new SubnetScanner(new HelperOptions(), probe, () => [Addr("192.168.1.67", "255.255.255.0")]);

        var found = await scanner.ScanAsync(CancellationToken.None);

        Assert.Equal(254, probe.Probed.Count);
        Assert.Equal(new[] { "192.168.1.15", "192.168.1.19" }, found.Select(p => p.Host));
        Assert.All(found, p => Assert.Equal(9100, p.Port));
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test PrintHelper.slnx --filter FullyQualifiedName~SubnetScannerTests`
Expected: the build fails with `CS0246: … 'InterfaceAddress' could not be found`.

- [ ] **Step 3: Implement**

`src/Unirefund.PrintHelper.Core/Discovery/SubnetScanner.cs`:

```csharp
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using Unirefund.PrintHelper.Core.Security;

namespace Unirefund.PrintHelper.Core.Discovery;

public sealed record NetworkPrinterInfo(string Host, int Port);

public sealed record InterfaceAddress(IPAddress Address, IPAddress Mask, bool IsUp);

public interface IPortProbe
{
    Task<bool> IsOpenAsync(string host, int port, TimeSpan timeout, CancellationToken ct);
}

public interface INetworkScanner
{
    Task<IReadOnlyList<NetworkPrinterInfo>> ScanAsync(CancellationToken ct);
}

public sealed class TcpPortProbe : IPortProbe
{
    public async Task<bool> IsOpenAsync(string host, int port, TimeSpan timeout, CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeout);
        using var client = new TcpClient();
        try
        {
            await client.ConnectAsync(host, port, cts.Token);
            return true;
        }
        catch (Exception ex) when (ex is SocketException or OperationCanceledException)
        {
            return false;
        }
    }
}

/// <summary>
/// Finds label printers by trying port 9100 on every host of each private /24
/// this PC sits on. Wider subnets (Hyper-V's /20 switch, say) are skipped:
/// thousands of probes for a dialog button is not worth it.
/// </summary>
public sealed class SubnetScanner(
    HelperOptions options,
    IPortProbe probe,
    Func<IEnumerable<InterfaceAddress>> listAddresses) : INetworkScanner
{
    private const int MaxParallelProbes = 64;

    public SubnetScanner(HelperOptions options)
        : this(options, new TcpPortProbe(), LocalAddresses)
    {
    }

    public static IReadOnlyList<string> CandidatePrefixes(IEnumerable<InterfaceAddress> addresses) =>
        addresses
            .Where(a => a.IsUp
                && a.Address.AddressFamily == AddressFamily.InterNetwork
                && a.Mask.Equals(IPAddress.Parse("255.255.255.0"))
                && TargetPolicy.IsPrivateIPv4(a.Address.ToString()))
            .Select(a => string.Join('.', a.Address.ToString().Split('.').Take(3)))
            .Distinct()
            .ToList();

    public async Task<IReadOnlyList<NetworkPrinterInfo>> ScanAsync(CancellationToken ct)
    {
        var hosts = CandidatePrefixes(listAddresses())
            .SelectMany(prefix => Enumerable.Range(1, 254).Select(i => $"{prefix}.{i}"))
            .ToList();
        var found = new List<NetworkPrinterInfo>();
        using var gate = new SemaphoreSlim(MaxParallelProbes);
        await Task.WhenAll(hosts.Select(async host =>
        {
            await gate.WaitAsync(ct);
            try
            {
                if (await probe.IsOpenAsync(host, options.PrinterPort, options.ScanTimeout, ct))
                {
                    lock (found) found.Add(new NetworkPrinterInfo(host, options.PrinterPort));
                }
            }
            finally
            {
                gate.Release();
            }
        }));
        return found
            .OrderBy(p => p.Host[..p.Host.LastIndexOf('.')], StringComparer.Ordinal)
            .ThenBy(p => int.Parse(p.Host[(p.Host.LastIndexOf('.') + 1)..]))
            .ToList();
    }

    private static IEnumerable<InterfaceAddress> LocalAddresses() =>
        NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
            .SelectMany(n => n.GetIPProperties().UnicastAddresses.Select(u => new InterfaceAddress(
                u.Address,
                u.IPv4Mask,
                n.OperationalStatus == OperationalStatus.Up)));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test PrintHelper.slnx`
Expected: `Failed: 0`.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/print-helper
git add -A
git commit -F - <<'EOF'
feat: find label printers by probing port 9100 on each private /24

Wider subnets such as Hyper-V's /20 switch are skipped, so a scan stays at
254 probes per network, 64 at a time.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: The HTTP API

**Files:**
- Create: `src/Unirefund.PrintHelper.Core/Api/Contracts.cs`
- Create: `src/Unirefund.PrintHelper.Core/Api/HelperApi.cs`
- Test: `tests/Unirefund.PrintHelper.Tests/ApiTests.cs`

**Interfaces:**
- Consumes:
  - `RequestPolicy`, `HelperOptions` (Task 2)
  - `TargetPolicy` (Task 1)
  - everything in `Printing` (Task 3)
  - `INetworkScanner`, `NetworkPrinterInfo` (Task 4)
- Produces:
  - `HelperApi.Build(HelperOptions, HelperApi.Services, Action<WebApplicationBuilder>? configure): WebApplication`
  - `record HelperApi.Services(INetworkPrinter Network, IQueuePrinter Queue, IPrinterCatalog Catalog, INetworkScanner Scanner)`
  - the response records `StatusResponse`, `PrintersResponse`, `PrintResult`, `ErrorResponse`

- [ ] **Step 1: Write the failing tests**

`tests/Unirefund.PrintHelper.Tests/ApiTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Unirefund.PrintHelper.Core;
using Unirefund.PrintHelper.Core.Api;
using Unirefund.PrintHelper.Core.Discovery;
using Unirefund.PrintHelper.Core.Printing;

namespace Unirefund.PrintHelper.Tests;

public sealed class FakeNetworkPrinter : INetworkPrinter
{
    public List<(string Host, int Port, byte[] Data)> Sent { get; } = [];
    public Exception? Throw { get; set; }
    public TimeSpan Delay { get; set; }
    private int _inFlight;
    public int MaxInFlight { get; private set; }

    public async Task SendAsync(string host, int port, ReadOnlyMemory<byte> data, CancellationToken ct)
    {
        var now = Interlocked.Increment(ref _inFlight);
        MaxInFlight = Math.Max(MaxInFlight, now);
        try
        {
            if (Delay > TimeSpan.Zero) await Task.Delay(Delay, ct);
            if (Throw is not null) throw Throw;
            lock (Sent) Sent.Add((host, port, data.ToArray()));
        }
        finally
        {
            Interlocked.Decrement(ref _inFlight);
        }
    }
}

public sealed class FakeQueuePrinter : IQueuePrinter
{
    public List<(string Queue, string Job, byte[] Data)> Sent { get; } = [];

    public Task SendAsync(string queueName, string jobName, ReadOnlyMemory<byte> data, CancellationToken ct)
    {
        Sent.Add((queueName, jobName, data.ToArray()));
        return Task.CompletedTask;
    }
}

public sealed class FakeCatalog(params QueueInfo[] queues) : IPrinterCatalog
{
    public IReadOnlyList<QueueInfo> ListQueues() => queues;
}

public sealed class FakeScanner(params NetworkPrinterInfo[] printers) : INetworkScanner
{
    public int Calls { get; private set; }

    public Task<IReadOnlyList<NetworkPrinterInfo>> ScanAsync(CancellationToken ct)
    {
        Calls++;
        return Task.FromResult<IReadOnlyList<NetworkPrinterInfo>>(printers);
    }
}

public sealed class ApiTests : IAsyncLifetime
{
    private const string Portal = "https://portal.unirefund.com";
    private readonly FakeNetworkPrinter _network = new();
    private readonly FakeQueuePrinter _queue = new();
    private readonly FakeScanner _scanner = new(new NetworkPrinterInfo("192.168.1.19", 9100));
    private WebApplication _app = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        var options = new HelperOptions { Version = "1.0.0", MaxBodyBytes = 1024 };
        var services = new HelperApi.Services(
            _network,
            _queue,
            new FakeCatalog(new QueueInfo("ZDesigner ZT231-203dpi ZPL", "ZDesigner", "USB001")),
            _scanner);
        _app = HelperApi.Build(options, services, b => b.WebHost.UseTestServer());
        await _app.StartAsync();
        _client = _app.GetTestClient();
        _client.BaseAddress = new Uri("http://127.0.0.1:9180/");
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _app.DisposeAsync();
    }

    private HttpRequestMessage Request(HttpMethod method, string path, string? origin = Portal, object? json = null)
    {
        var request = new HttpRequestMessage(method, path);
        if (origin is not null) request.Headers.Add("Origin", origin);
        // A string body carries Content-Length, as a browser fetch does.
        if (json is not null) request.Content = new StringContent(JsonSerializer.Serialize(json), Encoding.UTF8, "application/json");
        return request;
    }

    private static object NetworkJob(string host = "192.168.1.19", int port = 9100, string data = "^XA^XZ") =>
        new { target = new { kind = "network", host, port }, data, jobName = "Stickers 1-1" };

    [Fact]
    public async Task Status_answers_an_allowed_origin_with_cors()
    {
        var response = await _client.SendAsync(Request(HttpMethod.Get, "/status"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(Portal, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
        var status = await response.Content.ReadFromJsonAsync<StatusResponse>();
        Assert.Equal(new StatusResponse("Unirefund Print Helper", "1.0.0", 1), status);
    }

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData(null)]
    public async Task Refuses_unknown_or_missing_origins(string? origin)
    {
        var response = await _client.SendAsync(Request(HttpMethod.Get, "/status", origin));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Refuses_a_foreign_host_header()
    {
        var request = Request(HttpMethod.Get, "/status");
        request.Headers.Host = "attacker.example:9180";

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Answers_a_preflight_including_private_network_access()
    {
        var request = Request(HttpMethod.Options, "/print");
        request.Headers.Add("Access-Control-Request-Method", "POST");

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal("true", response.Headers.GetValues("Access-Control-Allow-Private-Network").Single());
        Assert.Contains("POST", response.Headers.GetValues("Access-Control-Allow-Methods").Single());
    }

    [Fact]
    public async Task Prints_to_a_network_printer()
    {
        var response = await _client.SendAsync(Request(HttpMethod.Post, "/print", json: NetworkJob()));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var sent = Assert.Single(_network.Sent);
        Assert.Equal(("192.168.1.19", 9100), (sent.Host, sent.Port));
        Assert.Equal("^XA^XZ", Encoding.Latin1.GetString(sent.Data));
    }

    [Theory]
    [InlineData("8.8.8.8", 9100)]
    [InlineData("192.168.1.19", 22)]
    [InlineData("127.0.0.1", 9100)]
    public async Task Refuses_targets_outside_the_lan_printer_port(string host, int port)
    {
        var response = await _client.SendAsync(Request(HttpMethod.Post, "/print", json: NetworkJob(host, port)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(_network.Sent);
    }

    [Fact]
    public async Task Refuses_data_that_is_not_zpl()
    {
        var response = await _client.SendAsync(Request(HttpMethod.Post, "/print", json: NetworkJob(data: "hello")));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Refuses_a_body_over_the_limit()
    {
        var response = await _client.SendAsync(Request(HttpMethod.Post, "/print", json: NetworkJob(data: "^XA" + new string('A', 2048))));

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
    }

    [Fact]
    public async Task Prints_to_an_installed_queue_matched_case_insensitively()
    {
        var job = new { target = new { kind = "queue", name = "zdesigner zt231-203DPI zpl" }, data = "^XA^XZ", jobName = "Stickers 1-500" };

        var response = await _client.SendAsync(Request(HttpMethod.Post, "/print", json: job));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var sent = Assert.Single(_queue.Sent);
        Assert.Equal(("ZDesigner ZT231-203dpi ZPL", "Stickers 1-500"), (sent.Queue, sent.Job));
    }

    [Fact]
    public async Task An_unknown_queue_is_404()
    {
        var job = new { target = new { kind = "queue", name = "Nope" }, data = "^XA^XZ" };

        var response = await _client.SendAsync(Request(HttpMethod.Post, "/print", json: job));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Maps_an_unreachable_printer_to_502_and_a_timeout_to_504()
    {
        _network.Throw = new PrinterUnreachableException("refused");
        var unreachable = await _client.SendAsync(Request(HttpMethod.Post, "/print", json: NetworkJob()));
        _network.Throw = new PrinterTimeoutException();
        var timeout = await _client.SendAsync(Request(HttpMethod.Post, "/print", json: NetworkJob()));

        Assert.Equal(HttpStatusCode.BadGateway, unreachable.StatusCode);
        Assert.Equal(HttpStatusCode.GatewayTimeout, timeout.StatusCode);
    }

    [Fact]
    public async Task Serialises_concurrent_jobs_to_the_same_printer()
    {
        _network.Delay = TimeSpan.FromMilliseconds(50);

        await Task.WhenAll(Enumerable.Range(0, 4).Select(_ =>
            _client.SendAsync(Request(HttpMethod.Post, "/print", json: NetworkJob()))));

        Assert.Equal(4, _network.Sent.Count);
        Assert.Equal(1, _network.MaxInFlight);
    }

    [Fact]
    public async Task Lists_queues_and_scans_only_when_asked()
    {
        var plain = await _client.SendAsync(Request(HttpMethod.Get, "/printers"));
        var scanned = await _client.SendAsync(Request(HttpMethod.Get, "/printers?scan=1"));

        var plainBody = await plain.Content.ReadFromJsonAsync<PrintersResponse>();
        var scannedBody = await scanned.Content.ReadFromJsonAsync<PrintersResponse>();
        Assert.Single(plainBody!.Queues);
        Assert.Empty(plainBody.Network);
        Assert.Equal("192.168.1.19", Assert.Single(scannedBody!.Network).Host);
        Assert.Equal(1, _scanner.Calls);
    }
}

public class StartupTests
{
    [Fact]
    public async Task Fails_to_start_when_the_port_is_taken()
    {
        using var squatter = new TcpListener(IPAddress.Loopback, 0);
        squatter.Start();
        var port = ((IPEndPoint)squatter.LocalEndpoint).Port;
        var services = new HelperApi.Services(new FakeNetworkPrinter(), new FakeQueuePrinter(), new FakeCatalog(), new FakeScanner());
        await using var app = HelperApi.Build(new HelperOptions { Port = port }, services);

        await Assert.ThrowsAnyAsync<IOException>(() => app.StartAsync());
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~ApiTests|FullyQualifiedName~StartupTests"`
Expected: the build fails with `CS0246: … 'HelperApi' could not be found`.

- [ ] **Step 3: Implement**

`src/Unirefund.PrintHelper.Core/Api/Contracts.cs`:

```csharp
using Unirefund.PrintHelper.Core.Discovery;
using Unirefund.PrintHelper.Core.Printing;

namespace Unirefund.PrintHelper.Core.Api;

public sealed record StatusResponse(string Name, string Version, int ApiVersion);

public sealed record PrintersResponse(IReadOnlyList<QueueInfo> Queues, IReadOnlyList<NetworkPrinterInfo> Network);

public sealed record PrintTarget(string? Kind, string? Host, int? Port, string? Name);

public sealed record PrintRequest(PrintTarget? Target, string? Data, string? JobName);

public sealed record PrintResult(bool Ok, int Bytes, long Ms);

public sealed record ErrorDetail(string Code, string Message);

public sealed record ErrorResponse(bool Ok, ErrorDetail Error)
{
    public static ErrorResponse Of(string code, string message) => new(false, new ErrorDetail(code, message));
}
```

`src/Unirefund.PrintHelper.Core/Api/HelperApi.cs`:

```csharp
using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Unirefund.PrintHelper.Core.Discovery;
using Unirefund.PrintHelper.Core.Printing;
using Unirefund.PrintHelper.Core.Security;

namespace Unirefund.PrintHelper.Core.Api;

public static class HelperApi
{
    public const string Name = "Unirefund Print Helper";
    public const int ApiVersion = 1;

    public sealed record Services(
        INetworkPrinter Network,
        IQueuePrinter Queue,
        IPrinterCatalog Catalog,
        INetworkScanner Scanner);

    /// <summary>
    /// The helper's whole HTTP surface on 127.0.0.1. Tests pass a `configure`
    /// that swaps Kestrel for TestServer; the tray app adds file logging there.
    /// </summary>
    public static WebApplication Build(
        HelperOptions options,
        Services services,
        Action<WebApplicationBuilder>? configure = null)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.ConfigureKestrel(kestrel =>
        {
            kestrel.Listen(IPAddress.Loopback, options.Port);
            kestrel.Limits.MaxRequestBodySize = options.MaxBodyBytes;
        });
        configure?.Invoke(builder);

        var app = builder.Build();
        var policy = new RequestPolicy(options);
        var locks = new TargetLocks();
        var log = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("PrintHelper");

        app.Use(async (context, next) =>
        {
            var request = context.Request;
            var origin = request.Headers.Origin.ToString();
            if (!policy.IsHostAllowed(request.Host.Value) || !policy.IsOriginAllowed(origin))
            {
                log.LogWarning("Refused {Method} {Path} from origin '{Origin}', host '{Host}'",
                    request.Method, request.Path, origin, request.Host.Value);
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(ErrorResponse.Of("forbidden", "Origin or host not allowed."));
                return;
            }

            context.Response.Headers.AccessControlAllowOrigin = origin;
            context.Response.Headers.Vary = "Origin";
            if (HttpMethods.IsOptions(request.Method))
            {
                context.Response.Headers.AccessControlAllowMethods = "GET, POST, OPTIONS";
                context.Response.Headers.AccessControlAllowHeaders = "Content-Type";
                context.Response.Headers.AccessControlMaxAge = "600";
                context.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
                context.Response.StatusCode = StatusCodes.Status204NoContent;
                return;
            }

            if (request.ContentLength > options.MaxBodyBytes)
            {
                context.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
                await context.Response.WriteAsJsonAsync(ErrorResponse.Of("too-large", "Request body too large."));
                return;
            }

            await next(context);
        });

        app.MapGet("/status", () => Results.Json(new StatusResponse(Name, options.Version, ApiVersion)));

        app.MapGet("/printers", async (HttpRequest request, CancellationToken ct) =>
        {
            var scan = request.Query["scan"] == "1";
            var queues = services.Catalog.ListQueues();
            IReadOnlyList<NetworkPrinterInfo> network = scan ? await services.Scanner.ScanAsync(ct) : [];
            return Results.Json(new PrintersResponse(queues, network));
        });

        app.MapPost("/print", async (HttpRequest request, CancellationToken ct) =>
        {
            PrintRequest? body;
            try
            {
                body = await request.ReadFromJsonAsync<PrintRequest>(ct);
            }
            catch (Exception ex) when (ex is JsonException or InvalidOperationException)
            {
                return Error(400, "bad-request", "Body must be a JSON print request.");
            }

            var data = body?.Data;
            var target = body?.Target;
            if (string.IsNullOrEmpty(data) || !data.Contains("^XA", StringComparison.Ordinal))
            {
                return Error(400, "bad-request", "Data must be a ZPL job.");
            }

            var bytes = Encoding.Latin1.GetBytes(data);
            var jobName = string.IsNullOrWhiteSpace(body?.JobName) ? "Unirefund stickers" : body!.JobName!;
            var timer = Stopwatch.StartNew();
            string described;
            try
            {
                switch (target?.Kind)
                {
                    case "network":
                        var host = target.Host;
                        var port = target.Port ?? options.PrinterPort;
                        if (host is null || !TargetPolicy.IsPrivateIPv4(host) || port != options.PrinterPort)
                        {
                            return Error(400, "invalid-target", $"Printer must be a private IPv4 address on port {options.PrinterPort}.");
                        }
                        described = $"{host}:{port}";
                        await locks.RunAsync($"net:{host}", async () =>
                        {
                            await services.Network.SendAsync(host, port, bytes, ct);
                            return true;
                        }, ct);
                        break;

                    case "queue":
                        var queue = services.Catalog.ListQueues()
                            .FirstOrDefault(q => string.Equals(q.Name, target.Name, StringComparison.OrdinalIgnoreCase));
                        if (queue is null)
                        {
                            return Error(404, "queue-not-found", $"No installed printer named '{target.Name}'.");
                        }
                        described = $"queue '{queue.Name}'";
                        await locks.RunAsync($"queue:{queue.Name}", async () =>
                        {
                            await services.Queue.SendAsync(queue.Name, jobName, bytes, ct);
                            return true;
                        }, ct);
                        break;

                    default:
                        return Error(400, "invalid-target", "Target kind must be 'network' or 'queue'.");
                }
            }
            catch (PrinterTimeoutException ex)
            {
                log.LogWarning("Print to {Kind} timed out: {Message}", target?.Kind, ex.Message);
                return Error(504, "printer-timeout", ex.Message);
            }
            catch (QueueNotFoundException ex)
            {
                return Error(404, "queue-not-found", ex.Message);
            }
            catch (PrinterUnreachableException ex)
            {
                log.LogWarning("Print to {Kind} failed: {Message}", target?.Kind, ex.Message);
                return Error(502, "printer-unreachable", ex.Message);
            }

            log.LogInformation("Printed {Bytes} bytes to {Target} in {Ms} ms",
                bytes.Length, described, timer.ElapsedMilliseconds);
            return Results.Json(new PrintResult(true, bytes.Length, timer.ElapsedMilliseconds));
        });

        return app;
    }

    private static IResult Error(int status, string code, string message) =>
        Results.Json(ErrorResponse.Of(code, message), statusCode: status);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test PrintHelper.slnx`
Expected: `Failed: 0` across all suites.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/print-helper
git add -A
git commit -F - <<'EOF'
feat: status, printers and print endpoints behind the origin guard

Answers CORS preflights, including Chrome's private-network header, only
for allowed origins. Prints to a private-LAN printer on 9100 or an
installed queue; maps unreachable to 502, timeout to 504, unknown queue
to 404 and an oversized body to 413.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: USB printers through the Windows spooler

**Files:**
- Create: `src/Unirefund.PrintHelper.Core/Printing/WindowsSpooler.cs`

**Interfaces:**
- Consumes: `IPrinterCatalog`, `IQueuePrinter`, `QueueInfo`, `QueueNotFoundException` and `PrinterUnreachableException` (Task 3).
- Produces: `WmiPrinterCatalog : IPrinterCatalog` and `WinSpoolQueuePrinter : IQueuePrinter`. Task 7 wires both.

Both wrap Windows APIs: WMI and `winspool.drv`. A unit test would only re-test Windows, and the API logic around them is already covered by Task 5's fakes. They are verified against the real spooler in Task 7, Step 5.

- [ ] **Step 1: Add the WMI package**

Run: `dotnet add src/Unirefund.PrintHelper.Core package System.Management`
Expected: a `10.0.x` reference is added.

- [ ] **Step 2: Implement**

`src/Unirefund.PrintHelper.Core/Printing/WindowsSpooler.cs`:

```csharp
using System.ComponentModel;
using System.Management;
using System.Runtime.InteropServices;

namespace Unirefund.PrintHelper.Core.Printing;

/// <summary>Installed Windows printer queues, which is how a USB printer is reached.</summary>
public sealed class WmiPrinterCatalog : IPrinterCatalog
{
    public IReadOnlyList<QueueInfo> ListQueues()
    {
        using var searcher = new ManagementObjectSearcher("SELECT Name, DriverName, PortName FROM Win32_Printer");
        using var results = searcher.Get();
        return results
            .Cast<ManagementObject>()
            .Select(p => new QueueInfo(
                p["Name"] as string ?? "",
                p["DriverName"] as string ?? "",
                p["PortName"] as string ?? ""))
            .Where(q => q.Name.Length > 0)
            .OrderBy(q => q.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}

/// <summary>
/// Writes bytes to a queue with datatype RAW, so the driver passes the ZPL to
/// the printer untouched instead of rendering it.
/// </summary>
public sealed class WinSpoolQueuePrinter : IQueuePrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private sealed class DocInfo1
    {
        public string? DocName;
        public string? OutputFile;
        public string? DataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool OpenPrinter(string printerName, out IntPtr printer, IntPtr defaults);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr printer);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int StartDocPrinter(IntPtr printer, int level, [In] DocInfo1 docInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr printer);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr printer);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr printer);

    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr printer, byte[] bytes, int count, out int written);

    public Task SendAsync(string queueName, string jobName, ReadOnlyMemory<byte> data, CancellationToken ct) =>
        Task.Run(() => Send(queueName, jobName, data.ToArray()), ct);

    private static void Send(string queueName, string jobName, byte[] bytes)
    {
        if (!OpenPrinter(queueName, out var printer, IntPtr.Zero))
        {
            throw new QueueNotFoundException(queueName);
        }
        try
        {
            var doc = new DocInfo1 { DocName = jobName, DataType = "RAW" };
            if (StartDocPrinter(printer, 1, doc) == 0) throw Fail("StartDocPrinter");
            try
            {
                if (!StartPagePrinter(printer)) throw Fail("StartPagePrinter");
                if (!WritePrinter(printer, bytes, bytes.Length, out var written) || written != bytes.Length)
                {
                    throw Fail("WritePrinter");
                }
                EndPagePrinter(printer);
            }
            finally
            {
                EndDocPrinter(printer);
            }
        }
        finally
        {
            ClosePrinter(printer);
        }
    }

    private static PrinterUnreachableException Fail(string call) =>
        new($"{call} failed: {new Win32Exception(Marshal.GetLastWin32Error()).Message}");
}
```

- [ ] **Step 3: Build and re-run the suite**

Run: `dotnet build PrintHelper.slnx` then `dotnet test PrintHelper.slnx`
Expected: the build succeeds and `Failed: 0`.

- [ ] **Step 4: Commit**

```bash
cd /c/unirefund/print-helper
git add -A
git commit -F - <<'EOF'
feat: list installed printers and print RAW to a USB printer queue

WMI lists the queues; winspool writes the job with datatype RAW, so the
driver passes the ZPL through instead of rendering it.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: The tray app

**Files:**
- Create: `src/Unirefund.PrintHelper/Unirefund.PrintHelper.csproj`
- Create: `src/Unirefund.PrintHelper/Program.cs`
- Create: `src/Unirefund.PrintHelper/TrayContext.cs`

**Interfaces:**
- Consumes: `HelperApi.Build`, `HelperApi.Services`, `HelperOptions`, `HelperSettings`, `TcpNetworkPrinter`, `WinSpoolQueuePrinter`, `WmiPrinterCatalog`, `SubnetScanner`.
- Produces: the `Unirefund.PrintHelper.exe` that Task 8 packages.

- [ ] **Step 1: Create the project**

`src/Unirefund.PrintHelper/Unirefund.PrintHelper.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net10.0-windows</TargetFramework>
    <UseWindowsForms>true</UseWindowsForms>
    <RootNamespace>Unirefund.PrintHelper</RootNamespace>
    <AssemblyName>Unirefund.PrintHelper</AssemblyName>
    <ApplicationHighDpiMode>SystemAware</ApplicationHighDpiMode>
    <RuntimeIdentifier>win-x64</RuntimeIdentifier>
    <SelfContained>true</SelfContained>
    <PublishSingleFile>true</PublishSingleFile>
    <IncludeNativeLibrariesForSelfExtract>true</IncludeNativeLibrariesForSelfExtract>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\Unirefund.PrintHelper.Core\Unirefund.PrintHelper.Core.csproj" />
  </ItemGroup>

</Project>
```

```powershell
dotnet sln PrintHelper.slnx add src/Unirefund.PrintHelper/Unirefund.PrintHelper.csproj
dotnet add src/Unirefund.PrintHelper package Serilog.Extensions.Logging
dotnet add src/Unirefund.PrintHelper package Serilog.Sinks.File
```

- [ ] **Step 2: Write the entry point**

`src/Unirefund.PrintHelper/Program.cs`:

```csharp
using System.Reflection;
using Microsoft.Extensions.Logging;
using Serilog;
using Unirefund.PrintHelper.Core;
using Unirefund.PrintHelper.Core.Api;
using Unirefund.PrintHelper.Core.Discovery;
using Unirefund.PrintHelper.Core.Printing;

namespace Unirefund.PrintHelper;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        // A second copy would fail to bind 9180 anyway; this exits it quietly.
        using var mutex = new Mutex(true, @"Local\Unirefund.PrintHelper", out var isFirstInstance);
        if (!isFirstInstance) return;

        ApplicationConfiguration.Initialize();

        var dataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Unirefund",
            "PrintHelper");
        var logDir = Path.Combine(dataDir, "logs");
        Directory.CreateDirectory(logDir);
        Log.Logger = new LoggerConfiguration()
            .WriteTo.File(Path.Combine(logDir, "helper-.log"), rollingInterval: RollingInterval.Day, retainedFileCountLimit: 14)
            .CreateLogger();

        var version = Assembly.GetExecutingAssembly()
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?
            .InformationalVersion.Split('+')[0] ?? "0.0.0";
        var settings = HelperSettings.Load(Path.Combine(dataDir, "settings.json"));
        var options = new HelperOptions
        {
            Version = version,
            AllowedOrigins = [.. HelperOptions.DefaultOrigins, .. settings.ExtraAllowedOrigins],
        };
        var services = new HelperApi.Services(
            new TcpNetworkPrinter(options.PrinterTimeout),
            new WinSpoolQueuePrinter(),
            new WmiPrinterCatalog(),
            new SubnetScanner(options));

        var app = HelperApi.Build(options, services, builder =>
        {
            builder.Logging.ClearProviders();
            builder.Logging.AddSerilog();
        });

        string? startError = null;
        try
        {
            app.StartAsync().GetAwaiter().GetResult();
            Log.Information("Unirefund Print Helper {Version} listening on 127.0.0.1:{Port}", version, options.Port);
        }
        catch (Exception ex)
        {
            startError = ex.Message;
            Log.Error(ex, "Could not start on port {Port}", options.Port);
        }

        Application.Run(new TrayContext(version, options.Port, logDir, startError));

        app.StopAsync().GetAwaiter().GetResult();
        Log.CloseAndFlush();
    }
}
```

- [ ] **Step 3: Write the tray menu and autostart**

`src/Unirefund.PrintHelper/TrayContext.cs`:

```csharp
using System.Diagnostics;
using Microsoft.Win32;

namespace Unirefund.PrintHelper;

/// <summary>Per-user autostart, the same HKCU Run value the installer writes.</summary>
internal static class AutoStart
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "UnirefundPrintHelper";

    public static bool IsEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey);
        return key?.GetValue(ValueName) is string;
    }

    public static void Set(bool enabled)
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKey);
        if (enabled) key.SetValue(ValueName, $"\"{Environment.ProcessPath}\"");
        else key.DeleteValue(ValueName, throwOnMissingValue: false);
    }
}

internal sealed class TrayContext : ApplicationContext
{
    private readonly NotifyIcon _icon;

    public TrayContext(string version, int port, string logDir, string? startError)
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(new ToolStripMenuItem(
            startError is null ? $"Running on 127.0.0.1:{port}" : $"Not running: {startError}") { Enabled = false });
        menu.Items.Add(new ToolStripMenuItem($"Version {version}") { Enabled = false });
        menu.Items.Add(new ToolStripSeparator());

        var autostart = new ToolStripMenuItem("Start with Windows") { CheckOnClick = true, Checked = AutoStart.IsEnabled() };
        autostart.CheckedChanged += (_, _) => AutoStart.Set(autostart.Checked);
        menu.Items.Add(autostart);
        menu.Items.Add("Open logs", null, (_, _) =>
            Process.Start(new ProcessStartInfo("explorer.exe", $"\"{logDir}\"") { UseShellExecute = true }));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit", null, (_, _) => ExitThread());

        _icon = new NotifyIcon
        {
            Icon = startError is null ? SystemIcons.Application : SystemIcons.Warning,
            Text = "Unirefund Print Helper",
            ContextMenuStrip = menu,
            Visible = true,
        };
        if (startError is not null)
        {
            _icon.ShowBalloonTip(10_000, "Unirefund Print Helper", $"Not running: {startError}", ToolTipIcon.Warning);
        }
    }

    protected override void ExitThreadCore()
    {
        _icon.Visible = false;
        _icon.Dispose();
        base.ExitThreadCore();
    }
}
```

- [ ] **Step 4: Build and run the tests**

Run: `dotnet build PrintHelper.slnx` then `dotnet test PrintHelper.slnx`
Expected: the build succeeds and `Failed: 0`.

- [ ] **Step 5: Run it and check it end to end**

**First, check nothing else is using port 9180.** A throwaway Node spike helper from the design session used the same port.
- Run `Get-NetTCPConnection -LocalPort 9180 -State Listen -ErrorAction SilentlyContinue`.
- If anything is listening, ask the user before stopping it.

Then start the app with `dotnet run --project src/Unirefund.PrintHelper` (run it in the background), and check:

```powershell
# allowed origin -> 200 with the version
Invoke-RestMethod http://127.0.0.1:9180/status -Headers @{ Origin = "https://portal.unirefund.com" }
# no origin -> 403
try { Invoke-WebRequest http://127.0.0.1:9180/status -UseBasicParsing } catch { $_.Exception.Response.StatusCode }
# installed queues from WMI (this PC has e.g. "Microsoft Print to PDF")
(Invoke-RestMethod http://127.0.0.1:9180/printers -Headers @{ Origin = "https://portal.unirefund.com" }).queues
```

Expected:
- `name = Unirefund Print Helper`, `apiVersion = 1`;
- `Forbidden`;
- a list of queue names.

**Ask the user to check the tray:**
- the icon is there;
- its menu shows "Running on 127.0.0.1:9180" and the version;
- toggling "Start with Windows" adds and removes `UnirefundPrintHelper` under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. Check with `Get-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Run`.

**Real-printer check (optional, needs the user's OK):** this sends one label to the office Argox. Find its address first with a port-9100 sweep; it was `192.168.1.19` on 2026-10-14 and is DHCP-assigned.

```powershell
$job = @{ target = @{ kind = "network"; host = "192.168.1.19"; port = 9100 }; data = "^XA^PW864^LL559^FO60,60^A0N,50,50^FDPrint Helper OK^FS^XZ"; jobName = "check" } | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:9180/print -Method Post -ContentType "application/json" -Body $job -Headers @{ Origin = "https://portal.unirefund.com" }
```

Expected: `ok = True`, and the user confirms a label reading "Print Helper OK". Then quit the app from the tray.

- [ ] **Step 6: Commit**

```bash
cd /c/unirefund/print-helper
git add -A
git commit -F - <<'EOF'
feat: tray app hosting the helper with logging and per-user autostart

Single instance; rolling logs under LOCALAPPDATA; the tray shows the port,
the version, or why it could not start.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: Installer, CI, docs

**Files:**
- Create: `installer/print-helper.iss`
- Create: `.github/workflows/build.yml`
- Create: `AGENTS.md`
- Modify: `README.md` (replace the design-stage stub)
- Modify: `C:\unirefund\AGENTS.md` (workspace root, not in any repo)

**Interfaces:**
- Consumes: the `Unirefund.PrintHelper.exe` single-file publish output (Task 7).
- Produces: `artifacts/UnirefundPrintHelperSetup-<version>.exe`, the file web-app's install link will point to once storage is chosen.

- [ ] **Step 1: Write the installer script**

`installer/print-helper.iss`:

```ini
; Per-user installer: no admin rights, installs under %LOCALAPPDATA%\Programs,
; starts at login through HKCU\...\Run, and launches straight after install.
; Build: iscc /DAppVersion=1.0.0 installer\print-helper.iss  (after dotnet publish)

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define AppName "Unirefund Print Helper"
#define AppExe "Unirefund.PrintHelper.exe"

[Setup]
AppId={{6F2B9C4E-3A71-4D8E-9B25-7C1E0A4D5F93}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Unirefund
DefaultDirName={localappdata}\Programs\Unirefund Print Helper
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\artifacts
OutputBaseFilename=UnirefundPrintHelperSetup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
CloseApplications=yes
UninstallDisplayIcon={app}\{#AppExe}

[Files]
Source: "..\artifacts\publish\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "UnirefundPrintHelper"; ValueData: """{app}\{#AppExe}"""; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#AppExe}"; Description: "Start {#AppName}"; Flags: nowait postinstall

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/IM {#AppExe} /F"; Flags: runhidden; RunOnceId: "StopHelper"
```

- [ ] **Step 2: Write the CI workflow**

`.github/workflows/build.yml`:

```yaml
name: build

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: "10.0.x"

      - name: Test
        run: dotnet test PrintHelper.slnx -c Release

      - name: Publish
        run: dotnet publish src/Unirefund.PrintHelper/Unirefund.PrintHelper.csproj -c Release -o artifacts/publish

      - name: Build installer
        shell: pwsh
        run: |
          choco install innosetup --no-progress -y
          $version = ([xml](Get-Content Directory.Build.props)).Project.PropertyGroup.Version
          & "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" "/DAppVersion=$version" installer/print-helper.iss

      - uses: actions/upload-artifact@v4
        with:
          name: UnirefundPrintHelperSetup
          path: artifacts/UnirefundPrintHelperSetup-*.exe
```

- [ ] **Step 3: Write the docs**

`AGENTS.md`:

````markdown
# AGENTS.md — `print-helper`

A Windows tray app for tenant admins. The Unirefund portal (web-app,
`operations/stickers/[stickerId]`) builds sticker labels as ZPL in the browser
and posts them here; the helper only carries the bytes to the printer. All
label logic lives in web-app. Design:
`docs/superpowers/specs/2026-10-14-sticker-zpl-printing-design.md` in the
workspace docs repo.

## Layout

| Path | Holds |
|---|---|
| `src/Unirefund.PrintHelper.Core` | HTTP API (`Api/HelperApi.cs`), security rules, printing, discovery — everything testable |
| `src/Unirefund.PrintHelper` | WinForms tray app: single instance, logging, autostart, starts the API |
| `tests/Unirefund.PrintHelper.Tests` | xUnit; the API is tested in-process through TestServer |
| `installer/print-helper.iss` | Inno Setup, per user, no admin rights |

## Commands

```powershell
dotnet test PrintHelper.slnx                    # the gate
dotnet run --project src/Unirefund.PrintHelper  # tray app on 127.0.0.1:9180
```

Publishing and the installer are artifact builds: hand them to the user
(workspace rule), or let CI (`.github/workflows/build.yml`) produce them:

```powershell
dotnet publish src/Unirefund.PrintHelper/Unirefund.PrintHelper.csproj -c Release -o artifacts/publish
& "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" /DAppVersion=1.0.0 installer/print-helper.iss
```

## Invariants — do not loosen without a design change

- Listen on **127.0.0.1 only**, port 9180. web-app hard-codes that address.
- Every request needs an allowed **Origin** and a **Host** of
  `127.0.0.1:9180` / `localhost:9180` (DNS-rebinding guard). Extra origins come
  only from `%LOCALAPPDATA%\Unirefund\PrintHelper\settings.json`.
- Print targets: **private IPv4 on port 9100**, or a queue that exists on the
  PC. The helper must never become a tunnel to arbitrary hosts.
- **One job at a time per printer** (`TargetLocks`): some printers silently drop
  a job that arrives while they are still consuming the last one.
- Logs record target, size and outcome — **never label data**.

## Releasing

1. Bump `<Version>` in `Directory.Build.props`.
2. Get the installer from CI (or the user's local build) and upload it to the
   installer storage.
3. If web-app must refuse older helpers, raise `MIN_HELPER_VERSION` in web-app's
   `transports/helper-client.ts`.
````

`README.md` (replace the whole file):

```markdown
# Unirefund Print Helper

A small Windows tray app for tenant admins. It lets the Unirefund portal send
sticker labels as raw ZPL straight to a label printer — a network printer on
port 9100 or a USB printer queue — so QR codes print at the printer's native
quality instead of through a browser PDF.

- Installs per user (no admin rights) and starts with Windows.
- Listens only on `http://127.0.0.1:9180` and only accepts the Unirefund portal.
- Chrome asks once per site to allow the portal to reach "apps on this device".

Developer notes and invariants: [AGENTS.md](AGENTS.md).
```

Workspace `C:\unirefund\AGENTS.md`:
- In the section titled "The four apps", change the heading to "The apps".
- Add this row to its table:

```markdown
| [`print-helper/`](print-helper/AGENTS.md) | Unirefund Print Helper | Tenant admins (support tool) | Windows desktop tray app |
```

- [ ] **Step 4: Ask the user to build the installer, then smoke-test it**

Hand the user these commands, run from `C:\unirefund\print-helper`:

```powershell
dotnet publish src/Unirefund.PrintHelper/Unirefund.PrintHelper.csproj -c Release -o artifacts/publish
& "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" /DAppVersion=1.0.0 installer/print-helper.iss
```

**Expected:** `artifacts\UnirefundPrintHelperSetup-1.0.0.exe`.

**Ask the user to run the installer and confirm each of these:**
- no admin prompt;
- it installs to `%LOCALAPPDATA%\Programs\Unirefund Print Helper`;
- the tray icon appears;
- `Invoke-RestMethod http://127.0.0.1:9180/status -Headers @{ Origin = "https://portal.unirefund.com" }` answers;
- uninstalling from Settings → Apps removes the Run value and stops the process.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/print-helper
git add -A
git commit -F - <<'EOF'
feat: per-user installer, CI build and repo docs

Inno Setup installs under LOCALAPPDATA without admin rights and starts the
helper at login. CI tests, publishes and builds the installer as an
artifact; uploading it to the installer storage stays manual.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

- [ ] **Step 6: Ask before publishing**

Ask the user whether to create the **private** GitHub repo `ayasofyazilim-clomerce/print-helper` and push `main`. Only after a yes:

```bash
cd /c/unirefund/print-helper
gh repo create ayasofyazilim-clomerce/print-helper --private --source . --push
```

Then check that the `build` workflow's first run is green with `gh run list -R ayasofyazilim-clomerce/print-helper --limit 1`. If it fails at the Inno Setup step because the runner's Chocolatey install path differs, locate `ISCC.exe` with `Get-ChildItem -Recurse "${env:ProgramFiles(x86)}" -Filter ISCC.exe` in the step and use that path.
