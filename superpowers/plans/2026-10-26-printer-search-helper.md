# Printer Search (Print Helper, phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Print Helper finds and recognises label printers on the PC's networks and among its installed printers, prints to them by a stable printer id, and re-finds a printer whose IP changed. This is API version 2, helper 1.1.0.

**Architecture:**
- **The search** is a new `Discovery` pipeline in the cross-platform Core. It runs four sources in parallel: a port-9100 sweep, an SNMP sysDescr GET, Zebra's UDP 4201 discovery, and the `arp` neighbour table.
- **Zebras are asked about themselves** (`~HI` / `getvar`), but only devices already known to be Zebras.
- **Classification** sorts what was found into label printers and others.
- **Results** are kept in memory by printer id.
- **`POST /print`** accepts `{ printerId, lastAddress }`. The id is resolved to an address and checked by MAC or Zebra serial; a search runs again when the printer moved.
- **API v1** (`/printers`, raw `target`) is unchanged.

**Tech Stack:** .NET 10, ASP.NET Core minimal APIs, xUnit 2. No new NuGet packages.

**Spec:** `docs/superpowers/specs/2026-10-14-printer-discovery-design.md`. Protocol facts: `docs/superpowers/specs/2026-10-14-printer-discovery-research.md`.

**Verified before writing:** every code block below was built and run on 2026-10-26.
- **Where:** a scratch worktree of `feat/macos` at `b3a0ae7`, which is `main` plus PR #3.
- **Tests:** `dotnet test PrintHelper.slnx` gives 181 passed (76 existing + 105 new).
- **Build:** `dotnet build PrintHelper.slnx` (Windows, Mac and Core) gives 0 warnings.
- **Live search on the office network** (harness in Task 9):
  - the Argox at 192.168.1.19 → label printer, `mac:78:5F:4C:00:55:67`, model `O4`;
  - the Canon at .15 → other printer, `Canon MF460 Series /P`;
  - Hyper-V, WSL and Bluetooth adapters skipped;
  - 3.3 s.

## Global Constraints

- **Base:** `main` after PR #3 (macOS) merges. Core is `net10.0` and cross-platform; Windows-only code lives in `src/Unirefund.PrintHelper`, macOS-only code in `src/Unirefund.PrintHelper.Mac`. Work on branch `feat/printer-search` in a worktree **outside** the repo: `C:\unirefund\print-helper-wt-printer-search`.
- **Version:** `1.1.0` in `Directory.Build.props`. `/status` reports `apiVersion: 2` and `features: ["search"]`.
- **Unchanged:** the Origin/Host guard, 127.0.0.1:9180, API v1, `TargetLocks`, and "logs never contain label data".
- **Probing rule:** the search never sends a byte to a device not already known to be a Zebra. It sends `~HI` and `! U1 getvar` only, never `setvar` or `do`.
- **Network printing stays on port 9100 in phase 1.** The spec's "port reported by the printer" rule is deferred: the only way to learn the port is a `getvar` over 9100 itself.
- **No new packages.** No admin rights. Nothing in Core may use a Windows-only API unguarded (`OperatingSystem.IsWindows()`).
- **Comments:** sparse, and only for the non-obvious "why", as in the existing code.
- **Gates:** `dotnet test PrintHelper.slnx` gives 0 failed after every task, and `dotnet build PrintHelper.slnx` gives 0 warnings at the end.
- **Artifacts:** never run `dotnet publish`, ISCC or `build-pkg.sh`. Those are the user's (workspace rule); CI builds them.
- **Commits:** one per task, message via a quoted heredoc (`git commit -F - <<'EOF'`), with no backticks or backslashes in the message, ending with the Co-Authored-By trailer.
- **Shell:** in Git Bash, prefix `export PATH="/c/Program Files/dotnet:$PATH"` when `dotnet` is not found.

## Review Focus

1. **A Windows Firewall prompt on the first search.** The search sends UDP broadcasts and receives the replies. A zero-IT admin must not see a firewall dialog. Task 9 records whether one appears.
2. **A search on a large office network takes too long.** On a /22 that is 1,021 hosts × 1.5 s at 256 in parallel, about 6 s, plus Zebra questions. Task 9 times it, and the target is under 10 s. The cap is tested in Task 1.
3. **One unanswered host must not hide the others' SNMP answers.** On Windows, each ICMP "port unreachable" fails the next UDP receive. `UdpSockets.Open` disables that, and the receive loop keeps going on a socket error. This was found by the live run, not by a unit test; Task 9 checks it again.
4. **A Zebra known by nothing but its web page.** With SNMP off (EMEA default since 2025-08) and an unlisted hardware-address prefix, the page title must trigger the Zebra questions. Pinned in Task 6: `A_zebra_known_only_by_its_web_page_is_asked_and_recognised`.
5. **Locked-down PCs** where `arp` can't run. The Argox must still be a label printer, through SNMP, with an `ip:` id. Pinned in Task 6: `Without_a_neighbour_table_the_argox_is_still_a_label_printer`.

---

### Task 0: Worktree and baseline

**Files:** none changed.

- [ ] **Step 1: Confirm the base.** In `C:\unirefund\print-helper`, run `git fetch origin && git log --oneline -3 origin/main`. PR #3, "Merge pull request #3 … feat/macos", must be on `origin/main`. If it isn't, stop and report: this plan's paths assume the macOS layout.
- [ ] **Step 2: Create the worktree.** `git worktree add ../print-helper-wt-printer-search -b feat/printer-search origin/main`
- [ ] **Step 3: Record the baseline.** In the worktree, `dotnet test PrintHelper.slnx` → 76 passed, 0 failed. `dotnet build PrintHelper.slnx` → 0 warnings. Record both in your report.


### Task 1: Network adapters and the addresses to search

**Files:**
- Create: `src/Unirefund.PrintHelper.Core/Discovery/NetworkAdapters.cs`
- Test: `tests/Unirefund.PrintHelper.Tests/NetworkAdaptersTests.cs`

**Interfaces:**
- Produces:
  - `record NetworkAdapter(string Name, string Description, NetworkInterfaceType Type, bool IsUp, IPAddress Address, IPAddress Mask)`;
  - `NetworkAdapters.List()`, `IsSearchable(NetworkAdapter)`, `HostsAround(IPAddress, IPAddress) : IReadOnlyList<IPAddress>`, `Broadcast(IPAddress, IPAddress)`;
  - `NetworkAdapters.MaxHosts = 1024`.

- [ ] **Step 1: Write the failing test** — create `tests/Unirefund.PrintHelper.Tests/NetworkAdaptersTests.cs`:

```csharp
using System.Net;
using System.Net.NetworkInformation;
using Unirefund.PrintHelper.Core.Discovery;

namespace Unirefund.PrintHelper.Tests;

public class NetworkAdaptersTests
{
    private static NetworkAdapter Adapter(
        string name, string description, string ip, string mask,
        NetworkInterfaceType type = NetworkInterfaceType.Ethernet, bool up = true) =>
        new(name, description, type, up, IPAddress.Parse(ip), IPAddress.Parse(mask));

    // Captured from the dev PC on 2026-10-26.
    public static TheoryData<NetworkAdapter, bool> DevPcAdapters => new()
    {
        { Adapter("Ethernet", "Intel(R) Ethernet Connection (5) I219-LM", "192.168.1.7", "255.255.255.0"), true },
        { Adapter("vEthernet (Default Switch)", "Hyper-V Virtual Ethernet Adapter", "172.25.160.1", "255.255.240.0"), false },
        { Adapter("vEthernet (WSL (Hyper-V firewall))", "Hyper-V Virtual Ethernet Adapter #2", "172.25.208.1", "255.255.240.0"), false },
        { Adapter("Loopback Pseudo-Interface 1", "Software Loopback Interface 1", "127.0.0.1", "255.0.0.0", NetworkInterfaceType.Loopback), false },
    };

    [Theory]
    [MemberData(nameof(DevPcAdapters))]
    public void Searches_only_real_private_adapters(NetworkAdapter adapter, bool expected) =>
        Assert.Equal(expected, NetworkAdapters.IsSearchable(adapter));

    [Theory]
    [InlineData("Wi-Fi", "Intel(R) Wi-Fi 6 AX201", "10.0.0.5", true)]
    [InlineData("Ethernet 2", "TAP-Windows Adapter V9", "10.8.0.2", false)]
    [InlineData("Ethernet 3", "Realtek USB GbE", "85.105.1.2", false)]
    public void Skips_vpn_and_public_adapters(string name, string description, string ip, bool expected) =>
        Assert.Equal(expected, NetworkAdapters.IsSearchable(Adapter(name, description, ip, "255.255.255.0")));

    [Fact]
    public void Skips_an_adapter_that_is_down() =>
        Assert.False(NetworkAdapters.IsSearchable(Adapter("Ethernet", "Intel", "192.168.1.7", "255.255.255.0", up: false)));

    [Fact]
    public void A_slash_24_gives_its_253_other_hosts()
    {
        var hosts = NetworkAdapters.HostsAround(IPAddress.Parse("192.168.1.7"), IPAddress.Parse("255.255.255.0"));

        Assert.Equal(253, hosts.Count);
        Assert.Equal("192.168.1.1", hosts[0].ToString());
        Assert.Equal("192.168.1.254", hosts[^1].ToString());
        Assert.DoesNotContain(IPAddress.Parse("192.168.1.7"), hosts);
    }

    [Fact]
    public void A_slash_23_is_searched_whole()
    {
        var hosts = NetworkAdapters.HostsAround(IPAddress.Parse("10.1.3.9"), IPAddress.Parse("255.255.254.0"));

        Assert.Equal(509, hosts.Count);
        Assert.Equal("10.1.2.1", hosts[0].ToString());
        Assert.Equal("10.1.3.254", hosts[^1].ToString());
    }

    [Fact]
    public void A_bigger_network_is_capped_to_the_slash_22_around_the_pc()
    {
        var hosts = NetworkAdapters.HostsAround(IPAddress.Parse("10.20.6.30"), IPAddress.Parse("255.255.0.0"));

        Assert.Equal(1021, hosts.Count);
        Assert.Equal("10.20.4.1", hosts[0].ToString());
        Assert.Equal("10.20.7.254", hosts[^1].ToString());
    }

    [Fact]
    public void Broadcast_is_the_last_address_of_the_subnet() =>
        Assert.Equal("192.168.1.255",
            NetworkAdapters.Broadcast(IPAddress.Parse("192.168.1.7"), IPAddress.Parse("255.255.255.0")).ToString());
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~NetworkAdaptersTests"`
Expected: the build fails: `NetworkAdapter` and `NetworkAdapters` do not exist.

- [ ] **Step 3: Write the implementation**

`src/Unirefund.PrintHelper.Core/Discovery/NetworkAdapters.cs`:

```csharp
using System.Buffers.Binary;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using Unirefund.PrintHelper.Core.Security;

namespace Unirefund.PrintHelper.Core.Discovery;

public sealed record NetworkAdapter(
    string Name,
    string Description,
    NetworkInterfaceType Type,
    bool IsUp,
    IPAddress Address,
    IPAddress Mask);

public static class NetworkAdapters
{
    /// <summary>Hosts searched per adapter at most: the /22 around the PC on bigger networks.</summary>
    public const int MaxHosts = 1024;

    // Hyper-V, WSL and VPN adapters report themselves as plain Ethernet, so only their names tell.
    private static readonly string[] VirtualMarkers =
        ["Hyper-V", "vEthernet", "WSL", "Docker", "VirtualBox", "VMware", "TAP-", "Tailscale", "WireGuard", "ZeroTier"];

    public static IReadOnlyList<NetworkAdapter> List() =>
        NetworkInterface.GetAllNetworkInterfaces()
            .SelectMany(n => n.GetIPProperties().UnicastAddresses
                .Where(u => u.Address.AddressFamily == AddressFamily.InterNetwork)
                .Select(u => new NetworkAdapter(
                    n.Name,
                    n.Description,
                    n.NetworkInterfaceType,
                    n.OperationalStatus == OperationalStatus.Up,
                    u.Address,
                    u.IPv4Mask)))
            .ToList();

    public static bool IsSearchable(NetworkAdapter adapter) =>
        adapter.IsUp
        && adapter.Type is not (NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel or NetworkInterfaceType.Ppp)
        && TargetPolicy.IsPrivateIPv4(adapter.Address.ToString())
        && !VirtualMarkers.Any(marker =>
            adapter.Name.Contains(marker, StringComparison.OrdinalIgnoreCase)
            || adapter.Description.Contains(marker, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Every host of the adapter's subnet except the PC itself; on a subnet larger than
    /// <see cref="MaxHosts"/>, the hosts of the /22 the PC sits in.
    /// </summary>
    public static IReadOnlyList<IPAddress> HostsAround(IPAddress address, IPAddress mask)
    {
        var self = ToUInt(address);
        var maskBits = ToUInt(mask);
        if (~maskBits + 1UL > MaxHosts) maskBits = 0xFFFFFC00;
        var network = self & maskBits;
        var broadcast = network | ~maskBits;
        var hosts = new List<IPAddress>();
        for (var host = network + 1; host < broadcast; host++)
        {
            if (host != self) hosts.Add(FromUInt(host));
        }
        return hosts;
    }

    public static IPAddress Broadcast(IPAddress address, IPAddress mask) =>
        FromUInt(ToUInt(address) | ~ToUInt(mask));

    private static uint ToUInt(IPAddress address) => BinaryPrimitives.ReadUInt32BigEndian(address.GetAddressBytes());

    private static IPAddress FromUInt(uint value)
    {
        var bytes = new byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(bytes, value);
        return new IPAddress(bytes);
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~NetworkAdaptersTests"`
Expected: PASS. Then `dotnet test PrintHelper.slnx` → 0 failed.

- [ ] **Step 5: Commit**

```bash
git add tests/Unirefund.PrintHelper.Tests/NetworkAdaptersTests.cs src/Unirefund.PrintHelper.Core/Discovery/NetworkAdapters.cs
git commit -F - <<'EOF'
feat: choose which networks to search for printers

Real, private, connected adapters only - Hyper-V, WSL and VPN adapters
look like Ethernet and are skipped by name - and any subnet size, capped
at the 1,024 addresses around the PC.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 2: Makers by hardware address, and the neighbour table

**Files:**
- Create: `src/Unirefund.PrintHelper.Core/Discovery/Makers.cs`, `src/Unirefund.PrintHelper.Core/Discovery/NeighbourTable.cs`
- Test: `tests/Unirefund.PrintHelper.Tests/MakersTests.cs` (also holds `ArpParserTests`)

**Interfaces:**
- Produces:
  - `Makers.Zebra`, `Makers.Argox`;
  - `Makers.NormalizeMac(string?) : string?` ("78:5F:4C:00:55:67" form), `Makers.FromMac(string?)`, `Makers.FromDescription(string?)`;
  - `interface INeighbourTable { Task<IReadOnlyDictionary<string,string>> ReadAsync(CancellationToken) }` (IP → normalised MAC);
  - `ArpNeighbourTable` and `ArpParser.Parse(string)`.

- [ ] **Step 1: Write the failing test** — create `tests/Unirefund.PrintHelper.Tests/MakersTests.cs`:

```csharp
using Unirefund.PrintHelper.Core.Discovery;

namespace Unirefund.PrintHelper.Tests;

public class MakersTests
{
    [Theory]
    [InlineData("78-5f-4c-00-55-67", "78:5F:4C:00:55:67")]
    [InlineData("78:5f:4c:0:55:67", "78:5F:4C:00:55:67")]
    [InlineData(" 00:07:4D:69:58:80 ", "00:07:4D:69:58:80")]
    [InlineData("78-5f-4c-00-55", null)]
    [InlineData("not a mac", null)]
    [InlineData(null, null)]
    public void Normalises_windows_and_macos_macs(string? raw, string? expected) =>
        Assert.Equal(expected, Makers.NormalizeMac(raw));

    [Theory]
    [InlineData("78-5f-4c-00-55-67", "Argox")]
    [InlineData("00:07:4d:69:58:80", "Zebra")]
    [InlineData("6c-3c-7c-f4-0f-48", null)]
    [InlineData("garbage", null)]
    public void Knows_zebra_and_argox_by_hardware_address(string mac, string? maker) =>
        Assert.Equal(maker, Makers.FromMac(mac));

    [Theory]
    [InlineData("ARGOX O4", "Argox")]
    [InlineData("Zebra Technologies ZT231-203dpi / internal wired", "Zebra")]
    [InlineData("ZDesigner ZT231-203dpi ZPL", "Zebra")]
    [InlineData("Canon MF460 Series /P", null)]
    [InlineData("", null)]
    public void Knows_zebra_and_argox_by_description(string text, string? maker) =>
        Assert.Equal(maker, Makers.FromDescription(text));
}

public class ArpParserTests
{
    // `arp -a` on the dev PC, 2026-10-26 (trimmed).
    private const string WindowsOutput = """

        Interface: 192.168.1.7 --- 0x5
          Internet Address      Physical Address      Type
          192.168.1.1           84-39-8f-38-3a-8c     dynamic
          192.168.1.15          6c-3c-7c-f4-0f-48     dynamic
          192.168.1.19          78-5f-4c-00-55-67     dynamic
          192.168.1.255         ff-ff-ff-ff-ff-ff     static
          224.0.0.22            01-00-5e-00-00-16     static
        """;

    [Fact]
    public void Reads_windows_rows_and_skips_broadcast_and_multicast()
    {
        var table = ArpParser.Parse(WindowsOutput);

        Assert.Equal("78:5F:4C:00:55:67", table["192.168.1.19"]);
        Assert.Equal("6C:3C:7C:F4:0F:48", table["192.168.1.15"]);
        Assert.Equal(3, table.Count);
    }

    [Fact]
    public void Reads_macos_rows_with_short_octets_and_skips_incomplete_ones()
    {
        const string output = """
            ? (192.168.1.19) at 78:5f:4c:0:55:67 on en0 ifscope [ethernet]
            ? (192.168.1.40) at (incomplete) on en0 ifscope [ethernet]
            """;

        var table = ArpParser.Parse(output);

        Assert.Equal("78:5F:4C:00:55:67", Assert.Single(table).Value);
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~MakersTests|FullyQualifiedName~ArpParserTests"`
Expected: the build fails: `Makers` and `ArpParser` do not exist.

- [ ] **Step 3: Write the implementation**

`src/Unirefund.PrintHelper.Core/Discovery/Makers.cs`:

```csharp
using System.Text.RegularExpressions;

namespace Unirefund.PrintHelper.Core.Discovery;

/// <summary>Label-printer makers, recognised by hardware address or by how a printer describes itself.</summary>
public static partial class Makers
{
    public const string Zebra = "Zebra";
    public const string Argox = "Argox";

    // IEEE registrations from the Wireshark manuf list (docs research, section 8). A hint, not a filter.
    private static readonly Dictionary<string, string> Ouis = new(StringComparer.OrdinalIgnoreCase)
    {
        ["00:05:12"] = Zebra, ["00:07:4D"] = Zebra, ["00:15:70"] = Zebra, ["00:23:68"] = Zebra,
        ["00:A0:F8"] = Zebra, ["40:83:DE"] = Zebra, ["48:8E:B7"] = Zebra, ["60:95:32"] = Zebra,
        ["74:93:A4"] = Zebra, ["78:B8:D6"] = Zebra, ["84:24:8D"] = Zebra, ["88:BC:AC"] = Zebra,
        ["90:75:DE"] = Zebra, ["94:FB:29"] = Zebra, ["C4:7D:CC"] = Zebra, ["C8:1C:FE"] = Zebra,
        ["FC:59:7A"] = Zebra,
        ["78:5F:4C"] = Argox,
    };

    [GeneratedRegex(@"^([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})$")]
    private static partial Regex MacPattern();

    /// <summary>"78-5f-4c-00-55-67" (Windows) or "78:5f:4c:0:55:67" (macOS) as "78:5F:4C:00:55:67".</summary>
    public static string? NormalizeMac(string? raw)
    {
        if (raw is null) return null;
        var match = MacPattern().Match(raw.Trim());
        if (!match.Success) return null;
        return string.Join(':', match.Groups.Values.Skip(1).Select(g => g.Value.PadLeft(2, '0').ToUpperInvariant()));
    }

    public static string? FromMac(string? mac)
    {
        var normalized = NormalizeMac(mac);
        return normalized is not null && Ouis.TryGetValue(normalized[..8], out var maker) ? maker : null;
    }

    public static string? FromDescription(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        if (text.Contains("zebra", StringComparison.OrdinalIgnoreCase) || text.Contains("ZDesigner", StringComparison.OrdinalIgnoreCase)) return Zebra;
        if (text.Contains("argox", StringComparison.OrdinalIgnoreCase)) return Argox;
        return null;
    }
}
```

`src/Unirefund.PrintHelper.Core/Discovery/NeighbourTable.cs`:

```csharp
using System.Diagnostics;
using System.Text.RegularExpressions;

namespace Unirefund.PrintHelper.Core.Discovery;

public interface INeighbourTable
{
    /// <summary>IPv4 address → normalised MAC, for hosts on this PC's own subnets.</summary>
    Task<IReadOnlyDictionary<string, string>> ReadAsync(CancellationToken ct);
}

/// <summary>
/// Reads the neighbour (ARP) table through the `arp` tool, which needs no admin rights on
/// Windows or macOS. Only addresses and MACs are read, so localised headers don't matter.
/// </summary>
public sealed class ArpNeighbourTable : INeighbourTable
{
    public async Task<IReadOnlyDictionary<string, string>> ReadAsync(CancellationToken ct)
    {
        var start = new ProcessStartInfo("arp", OperatingSystem.IsWindows() ? "-a" : "-an")
        {
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(3));
        try
        {
            using var process = Process.Start(start);
            if (process is null) return new Dictionary<string, string>();
            var output = await process.StandardOutput.ReadToEndAsync(cts.Token);
            await process.WaitForExitAsync(cts.Token);
            return ArpParser.Parse(output);
        }
        catch (Exception ex) when (ex is OperationCanceledException or System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            return new Dictionary<string, string>();
        }
    }
}

public static partial class ArpParser
{
    [GeneratedRegex(@"(?<ip>\b\d{1,3}(?:\.\d{1,3}){3}\b)\D[^\r\n]*?(?<mac>\b[0-9a-fA-F]{1,2}(?:[:-][0-9a-fA-F]{1,2}){5}\b)")]
    private static partial Regex Row();

    public static IReadOnlyDictionary<string, string> Parse(string output)
    {
        var table = new Dictionary<string, string>();
        foreach (var line in output.Split('\n'))
        {
            var match = Row().Match(line);
            if (!match.Success) continue;
            var mac = Makers.NormalizeMac(match.Groups["mac"].Value);
            // Broadcast and IPv4-multicast entries are not devices.
            if (mac is null || mac == "FF:FF:FF:FF:FF:FF" || mac.StartsWith("01:00:5E", StringComparison.Ordinal)) continue;
            table[match.Groups["ip"].Value] = mac;
        }
        return table;
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~MakersTests|FullyQualifiedName~ArpParserTests"`
Expected: PASS. Then `dotnet test PrintHelper.slnx` → 0 failed.

- [ ] **Step 5: Commit**

```bash
git add tests/Unirefund.PrintHelper.Tests/MakersTests.cs src/Unirefund.PrintHelper.Core/Discovery/Makers.cs src/Unirefund.PrintHelper.Core/Discovery/NeighbourTable.cs
git commit -F - <<'EOF'
feat: tell printer makers apart by hardware address

The Zebra and Argox hardware-address prefixes, and the neighbour table
read through the arp tool, which needs no admin rights on Windows or
macOS and is parsed by address only, so localised headers do not matter.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 3: SNMP sysDescr

**Files:**
- Create: `src/Unirefund.PrintHelper.Core/Discovery/Snmp.cs`
- Test: `tests/Unirefund.PrintHelper.Tests/SnmpTests.cs`

**Interfaces:**
- Produces:
  - `SnmpCodec.SysDescr`, `SnmpCodec.EncodeGet(int, string, string) : byte[]`, `SnmpCodec.TryDecodeResponse(ReadOnlySpan<byte>, out int, out string?)`;
  - `interface ISnmpClient { Task<IReadOnlyDictionary<string,string>> GetSysDescrAsync(IReadOnlyList<IPAddress>, TimeSpan, CancellationToken) }`;
  - `UdpSnmpClient`;
  - `UdpSockets.Open(bool broadcast = false) : UdpClient`, which Task 4 also uses.

- [ ] **Step 1: Write the failing test** — create `tests/Unirefund.PrintHelper.Tests/SnmpTests.cs`:

```csharp
using Unirefund.PrintHelper.Core.Discovery;

namespace Unirefund.PrintHelper.Tests;

public class SnmpTests
{
    [Fact]
    public void Encodes_the_get_that_both_office_printers_answered()
    {
        var packet = SnmpCodec.EncodeGet(1, "public", SnmpCodec.SysDescr);

        Assert.Equal(
            "302602010004067075626c6963a019020101020100020100300e300c06082b060102010101000500",
            Convert.ToHexStringLower(packet));
    }

    [Fact]
    public void Encodes_larger_request_ids_and_arcs()
    {
        var packet = SnmpCodec.EncodeGet(300, "public", "1.3.6.1.4.1.10642.1.1.0");

        Assert.True(SnmpCodec.TryDecodeResponse(ToResponse(packet), out var id, out _));
        Assert.Equal(300, id);
        Assert.Contains("2b06010401d3120101", Convert.ToHexStringLower(packet));
    }

    // Raw replies captured from the office printers on 2026-10-26.
    [Theory]
    [InlineData("302e02010004067075626c6963a2210201010201000201003016301406082b0601020101010004084152474f58204f34", "ARGOX O4")]
    [InlineData("303b02010004067075626c6963a22e0201010201000201003023302106082b06010201010100041543616e6f6e204d4634363020536572696573202f50", "Canon MF460 Series /P")]
    public void Decodes_real_printer_replies(string hex, string expected)
    {
        Assert.True(SnmpCodec.TryDecodeResponse(Convert.FromHexString(hex), out var id, out var value));
        Assert.Equal(1, id);
        Assert.Equal(expected, value);
    }

    [Fact]
    public void An_error_status_gives_no_value()
    {
        // The Argox reply with error-status 2 (noSuchName).
        var hex = "302e02010004067075626c6963a2210201010201020201013016301406082b0601020101010004084152474f58204f34";

        Assert.True(SnmpCodec.TryDecodeResponse(Convert.FromHexString(hex), out _, out var value));
        Assert.Null(value);
    }

    [Theory]
    [InlineData("")]
    [InlineData("302e0201")]
    [InlineData("0400")]
    public void Rejects_truncated_or_foreign_packets(string hex) =>
        Assert.False(SnmpCodec.TryDecodeResponse(Convert.FromHexString(hex), out _, out _));

    // Turns our own GetRequest into a GetResponse so the request id round-trips.
    private static byte[] ToResponse(byte[] request)
    {
        var copy = (byte[])request.Clone();
        var pduAt = Array.IndexOf(copy, (byte)0xA0);
        copy[pduAt] = 0xA2;
        return copy;
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~SnmpTests"`
Expected: the build fails: `SnmpCodec` does not exist.

- [ ] **Step 3: Write the implementation**

`src/Unirefund.PrintHelper.Core/Discovery/Snmp.cs`:

```csharp
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace Unirefund.PrintHelper.Core.Discovery;

/// <summary>
/// Just enough SNMPv1 for one GET of sysDescr: label and office printers alike answer it
/// with community "public" (the office Argox says "ARGOX O4", the Canon "Canon MF460 Series /P").
/// </summary>
public static class SnmpCodec
{
    public const string SysDescr = "1.3.6.1.2.1.1.1.0";
    private const byte Sequence = 0x30, Integer = 0x02, OctetString = 0x04, Null = 0x05, ObjectId = 0x06;
    private const byte GetRequest = 0xA0, GetResponse = 0xA2;

    public static byte[] EncodeGet(int requestId, string community, string oid)
    {
        var varbind = Tlv(Sequence, [.. Tlv(ObjectId, EncodeOid(oid)), .. Tlv(Null, [])]);
        var pdu = Tlv(GetRequest, [
            .. Tlv(Integer, EncodeInteger(requestId)),
            .. Tlv(Integer, [0]),
            .. Tlv(Integer, [0]),
            .. Tlv(Sequence, varbind),
        ]);
        return Tlv(Sequence, [.. Tlv(Integer, [0]), .. Tlv(OctetString, Encoding.ASCII.GetBytes(community)), .. pdu]);
    }

    /// <summary>The first varbind's string value; null value when the agent reported an error or no string.</summary>
    public static bool TryDecodeResponse(ReadOnlySpan<byte> packet, out int requestId, out string? value)
    {
        requestId = 0;
        value = null;
        try
        {
            var reader = new BerReader(packet);
            var message = reader.Enter(Sequence);
            message.Skip(Integer);
            message.Skip(OctetString);
            var pdu = message.Enter(GetResponse);
            requestId = (int)pdu.ReadInteger();
            var errorStatus = pdu.ReadInteger();
            pdu.Skip(Integer);
            var varbind = pdu.Enter(Sequence).Enter(Sequence);
            varbind.Skip(ObjectId);
            if (errorStatus == 0 && varbind.PeekTag() == OctetString)
            {
                var text = Encoding.UTF8.GetString(varbind.Read(OctetString)).Trim('\0', ' ', '\r', '\n');
                value = text.Length > 0 ? text : null;
            }
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static byte[] Tlv(byte tag, byte[] content)
    {
        var length = content.Length switch
        {
            < 0x80 => new[] { (byte)content.Length },
            < 0x100 => [0x81, (byte)content.Length],
            _ => [0x82, (byte)(content.Length >> 8), (byte)content.Length],
        };
        return [tag, .. length, .. content];
    }

    private static byte[] EncodeInteger(int value)
    {
        var bytes = new List<byte>();
        do
        {
            bytes.Insert(0, (byte)value);
            value >>= 8;
        }
        while (value != 0 && value != -1);
        if (value == 0 && (bytes[0] & 0x80) != 0) bytes.Insert(0, 0);
        return [.. bytes];
    }

    private static byte[] EncodeOid(string oid)
    {
        var arcs = oid.Split('.').Select(uint.Parse).ToArray();
        var bytes = new List<byte> { (byte)(arcs[0] * 40 + arcs[1]) };
        foreach (var arc in arcs.Skip(2))
        {
            var chunk = new Stack<byte>();
            var rest = arc;
            chunk.Push((byte)(rest & 0x7F));
            while ((rest >>= 7) > 0) chunk.Push((byte)(0x80 | (rest & 0x7F)));
            bytes.AddRange(chunk);
        }
        return [.. bytes];
    }

    private ref struct BerReader(ReadOnlySpan<byte> data)
    {
        private ReadOnlySpan<byte> _data = data;

        public byte PeekTag() => _data.Length > 0 ? _data[0] : throw new FormatException("Truncated.");

        public ReadOnlySpan<byte> Read(byte tag)
        {
            if (_data.Length < 2 || _data[0] != tag) throw new FormatException($"Expected tag 0x{tag:X2}.");
            var length = (int)_data[1];
            var header = 2;
            if (length >= 0x80)
            {
                var count = length & 0x7F;
                if (count is 0 or > 2 || _data.Length < 2 + count) throw new FormatException("Bad length.");
                length = 0;
                for (var i = 0; i < count; i++) length = (length << 8) | _data[2 + i];
                header += count;
            }
            if (_data.Length < header + length) throw new FormatException("Truncated.");
            var content = _data.Slice(header, length);
            _data = _data[(header + length)..];
            return content;
        }

        public BerReader Enter(byte tag) => new(Read(tag));

        public void Skip(byte tag) => Read(tag);

        public long ReadInteger()
        {
            var bytes = Read(Integer);
            if (bytes.Length is 0 or > 8) throw new FormatException("Bad integer.");
            long value = (sbyte)bytes[0];
            foreach (var b in bytes[1..]) value = (value << 8) | b;
            return value;
        }
    }
}

public interface ISnmpClient
{
    /// <summary>sysDescr of every host that answers within <paramref name="wait"/>.</summary>
    Task<IReadOnlyDictionary<string, string>> GetSysDescrAsync(IReadOnlyList<IPAddress> hosts, TimeSpan wait, CancellationToken ct);
}

public sealed class UdpSnmpClient : ISnmpClient
{
    public async Task<IReadOnlyDictionary<string, string>> GetSysDescrAsync(
        IReadOnlyList<IPAddress> hosts, TimeSpan wait, CancellationToken ct)
    {
        var answers = new Dictionary<string, string>();
        using var udp = UdpSockets.Open();
        var request = SnmpCodec.EncodeGet(1, "public", SnmpCodec.SysDescr);
        foreach (var host in hosts)
        {
            try
            {
                await udp.SendAsync(request, new IPEndPoint(host, 161), ct);
            }
            catch (SocketException)
            {
                // An unroutable host is no answer.
            }
        }

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(wait);
        while (true)
        {
            try
            {
                var reply = await udp.ReceiveAsync(cts.Token);
                if (SnmpCodec.TryDecodeResponse(reply.Buffer, out _, out var value) && value is not null)
                {
                    answers[reply.RemoteEndPoint.Address.ToString()] = value;
                }
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                return answers;
            }
            catch (SocketException)
            {
                // A stray ICMP error for one host; keep listening for the others.
            }
        }
    }
}

public static class UdpSockets
{
    /// <summary>
    /// A UDP socket for asking many hosts at once. On Windows an ICMP "port unreachable" from any
    /// one host otherwise fails the next receive, which would end the wait for everyone else.
    /// </summary>
    public static UdpClient Open(bool broadcast = false)
    {
        var udp = new UdpClient(AddressFamily.InterNetwork) { EnableBroadcast = broadcast };
        if (OperatingSystem.IsWindows())
        {
            const int SioUdpConnReset = -1744830452;
            udp.Client.IOControl(SioUdpConnReset, [0, 0, 0, 0], null);
        }
        return udp;
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~SnmpTests"`
Expected: PASS. Then `dotnet test PrintHelper.slnx` → 0 failed.

- [ ] **Step 5: Commit**

```bash
git add tests/Unirefund.PrintHelper.Tests/SnmpTests.cs src/Unirefund.PrintHelper.Core/Discovery/Snmp.cs
git commit -F - <<'EOF'
feat: ask every address what it is over SNMP

One SNMPv1 GET of sysDescr with community public, as both office
printers answer it, decoded from the real replies. On Windows an ICMP
port unreachable from one host no longer ends the wait for the rest.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 4: Zebra: replies, discovery broadcast and the read-only probe

**Files:**
- Create: `src/Unirefund.PrintHelper.Core/Discovery/Zebra.cs`
- Test: `tests/Unirefund.PrintHelper.Tests/ZebraTests.cs` (also holds `FakeZebra`, a TCP listener that answers like the programming guide, and `TcpZebraProbeTests`)

**Interfaces:**
- Consumes: `UdpSockets.Open(broadcast: true)` (Task 3).
- Produces:
  - `record ZebraInfo(string? Model, int? Dpi, string? Serial, string? PrintMethod, int? LabelLengthMm, bool? SpeaksZpl, string Raw)`;
  - `ZebraReplies.ParseHostIdentification`, `ParseModel`, `ParseGetvar`, `NormalizePrintMethod`, `LabelLengthMm`;
  - `ZebraDiscoveryPacket.Request` / `IsReply`;
  - `interface IZebraDiscovery { Task<IReadOnlySet<string>> FindAsync(IReadOnlyList<IPAddress>, CancellationToken) }` and `UdpZebraDiscovery`;
  - `interface IZebraProbe { Task<ZebraInfo?> QueryAsync(string host, int port, CancellationToken) }` and `TcpZebraProbe(TimeSpan? connectTimeout = null, TimeSpan? replyTimeout = null)`.

- [ ] **Step 1: Write the failing test** — create `tests/Unirefund.PrintHelper.Tests/ZebraTests.cs`:

```csharp
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using Unirefund.PrintHelper.Core.Discovery;

namespace Unirefund.PrintHelper.Tests;

public class ZebraRepliesTests
{
    [Theory]
    [InlineData("ZT410-200dpi,V75.19.15Z,8,4096KB", "ZT410", 203)]
    [InlineData("\u0002ZT231-300dpi,V92.21.39Z,12,8192KB\u0003\r\n", "ZT231", 300)]
    [InlineData("ZD230,V84.20.18Z,8,8176KB", "ZD230", 203)]
    public void Reads_model_and_dpi_from_host_identification(string reply, string model, int dpi) =>
        Assert.Equal((model, dpi), ZebraReplies.ParseHostIdentification(reply));

    [Theory]
    [InlineData("")]
    [InlineData("garbage")]
    public void Unreadable_host_identification_gives_nothing(string reply) =>
        Assert.Equal((null, null), ZebraReplies.ParseHostIdentification(reply));

    [Theory]
    [InlineData("Zebra Technologies ZT231-203dpi / internal wired", "ZT231", 203)]
    [InlineData("ZTC ZT411-203dpi ZPL", "ZT411", 203)]
    public void Reads_model_from_a_description(string text, string model, int dpi) =>
        Assert.Equal((model, dpi), ZebraReplies.ParseModel(text));

    [Theory]
    [InlineData("\"18J161604846\"", "18J161604846")]
    [InlineData("\r\n\"direct thermal\"", "direct thermal")]
    [InlineData("\"?\"", null)]
    [InlineData("\"\"", null)]
    [InlineData("", null)]
    public void Reads_getvar_values(string reply, string? expected) =>
        Assert.Equal(expected, ZebraReplies.ParseGetvar(reply));

    [Theory]
    [InlineData("thermal trans", "thermal-transfer")]
    [InlineData("Direct Thermal", "direct-thermal")]
    [InlineData("hybrid", null)]
    [InlineData(null, null)]
    public void Normalises_print_methods(string? value, string? expected) =>
        Assert.Equal(expected, ZebraReplies.NormalizePrintMethod(value));

    [Theory]
    [InlineData("799", 203, 100)]
    [InlineData("1181", 300, 100)]
    [InlineData("559", 203, 70)]
    [InlineData("0", 203, null)]
    [InlineData("?", 203, null)]
    [InlineData("799", null, null)]
    public void Converts_label_length_to_mm(string dots, int? dpi, int? mm) =>
        Assert.Equal(mm, ZebraReplies.LabelLengthMm(dots, dpi));

    [Fact]
    public void Recognises_discovery_replies_by_their_magic()
    {
        Assert.True(ZebraDiscoveryPacket.IsReply(Convert.FromHexString("3a2c2e03373930373100")));
        Assert.False(ZebraDiscoveryPacket.IsReply(Convert.FromHexString("2e2c3a010000")));
        Assert.False(ZebraDiscoveryPacket.IsReply([]));
    }
}

/// <summary>A TCP printer that answers like the Zebra programming guide says.</summary>
public sealed class FakeZebra : IAsyncDisposable
{
    private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
    private readonly Task _loop;
    public List<string> Received { get; } = [];
    public int Port { get; }

    public FakeZebra(Func<string, string?> answer)
    {
        _listener.Start();
        Port = ((IPEndPoint)_listener.LocalEndpoint).Port;
        _loop = Task.Run(async () =>
        {
            try
            {
                using var client = await _listener.AcceptTcpClientAsync();
                var stream = client.GetStream();
                var buffer = new byte[1024];
                var pending = "";
                int read;
                while ((read = await stream.ReadAsync(buffer)) > 0)
                {
                    pending += Encoding.ASCII.GetString(buffer, 0, read);
                    foreach (var command in TakeCommands(ref pending))
                    {
                        lock (Received) Received.Add(command);
                        var reply = answer(command);
                        if (reply is not null) await stream.WriteAsync(Encoding.ASCII.GetBytes(reply));
                    }
                }
            }
            catch (Exception ex) when (ex is SocketException or IOException or ObjectDisposedException)
            {
            }
        });
    }

    private static IEnumerable<string> TakeCommands(ref string pending)
    {
        var commands = new List<string>();
        while (true)
        {
            if (pending.StartsWith("~HI", StringComparison.Ordinal))
            {
                commands.Add("~HI");
                pending = pending[3..];
                continue;
            }
            var end = pending.IndexOf("\r\n", StringComparison.Ordinal);
            if (end < 0) break;
            commands.Add(pending[..end]);
            pending = pending[(end + 2)..];
        }
        return commands;
    }

    public static string? LikeAZt231(string command) => command switch
    {
        "~HI" => "\u0002ZT231-203dpi,V92.21.39Z,8,8192KB\u0003\r\n",
        "! U1 getvar \"device.unique_id\"" => "\"99J000800418\"",
        "! U1 getvar \"ezpl.print_method\"" => "\"thermal trans\"",
        "! U1 getvar \"zpl.label_length\"" => "\"799\"",
        "! U1 getvar \"device.languages\"" => "\"hybrid_xml_zpl\"",
        _ => "\"?\"",
    };

    public async ValueTask DisposeAsync()
    {
        _listener.Stop();
        await _loop;
    }
}

public class TcpZebraProbeTests
{
    [Fact]
    public async Task Reads_everything_a_zt231_reports()
    {
        await using var zebra = new FakeZebra(FakeZebra.LikeAZt231);

        var info = await new TcpZebraProbe().QueryAsync("127.0.0.1", zebra.Port, CancellationToken.None);

        Assert.NotNull(info);
        Assert.Equal("ZT231", info.Model);
        Assert.Equal(203, info.Dpi);
        Assert.Equal("99J000800418", info.Serial);
        Assert.Equal("thermal-transfer", info.PrintMethod);
        Assert.Equal(100, info.LabelLengthMm);
        Assert.True(info.SpeaksZpl);
        Assert.Contains("ZT231-203dpi", info.Raw);
    }

    [Fact]
    public async Task Only_asks_read_only_questions()
    {
        await using var zebra = new FakeZebra(FakeZebra.LikeAZt231);

        await new TcpZebraProbe().QueryAsync("127.0.0.1", zebra.Port, CancellationToken.None);

        Assert.All(zebra.Received, c => Assert.True(c == "~HI" || c.StartsWith("! U1 getvar ", StringComparison.Ordinal), c));
    }

    [Fact]
    public async Task A_silent_device_gives_null_within_the_reply_timeouts()
    {
        await using var silent = new FakeZebra(_ => null);
        var timer = Stopwatch.StartNew();

        var info = await new TcpZebraProbe(replyTimeout: TimeSpan.FromMilliseconds(200))
            .QueryAsync("127.0.0.1", silent.Port, CancellationToken.None);

        Assert.Null(info);
        Assert.InRange(timer.Elapsed, TimeSpan.Zero, TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task A_closed_port_gives_null()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();

        Assert.Null(await new TcpZebraProbe().QueryAsync("127.0.0.1", port, CancellationToken.None));
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~Zebra"`
Expected: the build fails: `ZebraReplies`, `ZebraDiscoveryPacket` and `TcpZebraProbe` do not exist.

- [ ] **Step 3: Write the implementation**

`src/Unirefund.PrintHelper.Core/Discovery/Zebra.cs`:

```csharp
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;

namespace Unirefund.PrintHelper.Core.Discovery;

/// <summary>What a Zebra said about itself. Every field may be missing; nothing here is required to print.</summary>
public sealed record ZebraInfo(
    string? Model,
    int? Dpi,
    string? Serial,
    string? PrintMethod,
    int? LabelLengthMm,
    bool? SpeaksZpl,
    string Raw);

/// <summary>Parsers for Zebra replies (ZPL programming guide; docs research, sections 2 and 4).</summary>
public static partial class ZebraReplies
{
    [GeneratedRegex(@"(?<model>[A-Z]{1,4}\d{2,4}[A-Za-z]*)(?:-(?<dpi>\d{3})dpi)?")]
    private static partial Regex ModelToken();

    /// <summary>`~HI` → "ZT410-200dpi,V75.19.15Z,8,4096KB": model ZT410 and, from 8 dots/mm, 203 dpi.</summary>
    public static (string? Model, int? Dpi) ParseHostIdentification(string reply)
    {
        var fields = Clean(reply).Split(',');
        if (fields.Length < 3) return (null, null);
        var (model, dpi) = ParseModel(fields[0]);
        return (model, DpiFromDotsPerMm(fields[2].Trim()) ?? dpi);
    }

    /// <summary>"Zebra Technologies ZT231-203dpi / internal wired" or "ZT410-200dpi" → (ZT231, 203).</summary>
    public static (string? Model, int? Dpi) ParseModel(string text)
    {
        foreach (Match match in ModelToken().Matches(text))
        {
            var dpi = match.Groups["dpi"].Success ? NormalizeDpi(int.Parse(match.Groups["dpi"].Value)) : (int?)null;
            return (match.Groups["model"].Value, dpi);
        }
        return (null, null);
    }

    /// <summary>`! U1 getvar` answers a double-quoted value; "?" or nothing means unknown.</summary>
    public static string? ParseGetvar(string reply)
    {
        var text = Clean(reply);
        if (text.Length >= 2 && text[0] == '"' && text[^1] == '"') text = text[1..^1];
        text = text.Trim();
        return text.Length == 0 || text == "?" ? null : text;
    }

    public static string? NormalizePrintMethod(string? value) => value?.ToLowerInvariant() switch
    {
        "thermal trans" => "thermal-transfer",
        "direct thermal" => "direct-thermal",
        _ => null,
    };

    public static int? LabelLengthMm(string? dots, int? dpi) =>
        int.TryParse(dots, out var d) && d > 0 && dpi is > 0
            ? (int)Math.Round(d * 25.4 / dpi.Value)
            : null;

    private static int? DpiFromDotsPerMm(string field) => field switch
    {
        "6" => 152,
        "8" => 203,
        "12" => 300,
        "24" => 600,
        _ => null,
    };

    // Zebra names 203 dpi printers "200dpi".
    private static int NormalizeDpi(int dpi) => dpi == 200 ? 203 : dpi;

    private static string Clean(string reply) =>
        new string(reply.Where(c => c >= ' ').ToArray()).Trim();
}

public static class ZebraDiscoveryPacket
{
    public const int Port = 4201;

    /// <summary>The 6-byte discovery request every ZebraNet / Link-OS client sends.</summary>
    public static readonly byte[] Request = [0x2E, 0x2C, 0x3A, 0x01, 0x00, 0x00];

    /// <summary>Replies start with the magic ":,."; nothing else of the layout is relied on.</summary>
    public static bool IsReply(ReadOnlySpan<byte> packet) =>
        packet.Length >= 3 && packet[0] == 0x3A && packet[1] == 0x2C && packet[2] == 0x2E;
}

public interface IZebraDiscovery
{
    /// <summary>Addresses of Zebras that answered the discovery broadcast.</summary>
    Task<IReadOnlySet<string>> FindAsync(IReadOnlyList<IPAddress> broadcasts, CancellationToken ct);
}

public sealed class UdpZebraDiscovery : IZebraDiscovery
{
    public async Task<IReadOnlySet<string>> FindAsync(IReadOnlyList<IPAddress> broadcasts, CancellationToken ct)
    {
        var found = new HashSet<string>();
        using var udp = UdpSockets.Open(broadcast: true);
        var targets = broadcasts.Prepend(IPAddress.Broadcast).Distinct().ToList();
        var receive = ReceiveAsync(udp, found, TimeSpan.FromSeconds(3), ct);
        for (var round = 0; round < 3; round++)
        {
            foreach (var target in targets)
            {
                try
                {
                    await udp.SendAsync(ZebraDiscoveryPacket.Request, new IPEndPoint(target, ZebraDiscoveryPacket.Port), ct);
                }
                catch (SocketException)
                {
                    // A network that refuses broadcasts just finds nothing this way.
                }
            }
            await Task.Delay(TimeSpan.FromSeconds(1), ct);
        }
        await receive;
        return found;
    }

    private static async Task ReceiveAsync(UdpClient udp, HashSet<string> found, TimeSpan wait, CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(wait);
        while (true)
        {
            try
            {
                var reply = await udp.ReceiveAsync(cts.Token);
                if (ZebraDiscoveryPacket.IsReply(reply.Buffer)) found.Add(reply.RemoteEndPoint.Address.ToString());
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                return;
            }
            catch (SocketException)
            {
                // ICMP noise from the broadcast; keep listening.
            }
        }
    }
}

public interface IZebraProbe
{
    /// <summary>Asks a printer already known to be a Zebra about itself; null when it does not answer at all.</summary>
    Task<ZebraInfo?> QueryAsync(string host, int port, CancellationToken ct);
}

/// <summary>
/// Read-only questions over the print port: `~HI` and a few `getvar`s, never `setvar` or `do`.
/// Only ever sent to devices already recognised as Zebras - an office printer would print them.
/// </summary>
public sealed class TcpZebraProbe(TimeSpan? connectTimeout = null, TimeSpan? replyTimeout = null) : IZebraProbe
{
    private readonly TimeSpan _connectTimeout = connectTimeout ?? TimeSpan.FromSeconds(3);
    private readonly TimeSpan _replyTimeout = replyTimeout ?? TimeSpan.FromMilliseconds(1500);

    public async Task<ZebraInfo?> QueryAsync(string host, int port, CancellationToken ct)
    {
        using var client = new TcpClient();
        try
        {
            using (var connect = CancellationTokenSource.CreateLinkedTokenSource(ct))
            {
                connect.CancelAfter(_connectTimeout);
                await client.ConnectAsync(host, port, connect.Token);
            }
            var stream = client.GetStream();

            var hi = await AskAsync(stream, "~HI", reply => reply.Contains('\u0003') || reply.Contains('\n'), ct);
            var (model, dpi) = hi is null ? (null, null) : ZebraReplies.ParseHostIdentification(hi);
            var serial = await GetvarAsync(stream, "device.unique_id", ct);
            var method = await GetvarAsync(stream, "ezpl.print_method", ct);
            var length = await GetvarAsync(stream, "zpl.label_length", ct);
            var languages = await GetvarAsync(stream, "device.languages", ct);

            if (hi is null && serial is null && method is null && length is null && languages is null) return null;
            var raw = $"~HI={hi?.Trim('\u0002', '\u0003', '\r', '\n')} unique_id={serial} print_method={method} label_length={length} languages={languages}";
            return new ZebraInfo(
                model,
                dpi,
                serial,
                ZebraReplies.NormalizePrintMethod(method),
                ZebraReplies.LabelLengthMm(length, dpi),
                languages is null ? null : languages.Contains("zpl", StringComparison.OrdinalIgnoreCase),
                raw);
        }
        catch (Exception ex) when (ex is SocketException or IOException or OperationCanceledException && !ct.IsCancellationRequested)
        {
            return null;
        }
    }

    private async Task<string?> GetvarAsync(NetworkStream stream, string name, CancellationToken ct)
    {
        var reply = await AskAsync(stream, $"! U1 getvar \"{name}\"\r\n", r => r.Count(c => c == '"') >= 2, ct);
        return reply is null ? null : ZebraReplies.ParseGetvar(reply);
    }

    /// <summary>Sends one command and reads until the reply looks complete or the reply timeout passes.</summary>
    private async Task<string?> AskAsync(NetworkStream stream, string command, Func<string, bool> complete, CancellationToken ct)
    {
        await stream.WriteAsync(Encoding.ASCII.GetBytes(command), ct);
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(_replyTimeout);
        var reply = new StringBuilder();
        var buffer = new byte[1024];
        try
        {
            while (!complete(reply.ToString()))
            {
                var read = await stream.ReadAsync(buffer, cts.Token);
                if (read == 0) break;
                reply.Append(Encoding.Latin1.GetString(buffer, 0, read));
            }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            // No (complete) answer in time.
        }
        return reply.Length == 0 ? null : reply.ToString();
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~Zebra"`
Expected: PASS. Then `dotnet test PrintHelper.slnx` → 0 failed.

- [ ] **Step 5: Commit**

```bash
git add tests/Unirefund.PrintHelper.Tests/ZebraTests.cs src/Unirefund.PrintHelper.Core/Discovery/Zebra.cs
git commit -F - <<'EOF'
feat: recognise Zebras and read what they report

Zebra discovery on UDP 4201, and the read-only questions ~HI and getvar
for model, dpi, serial, print method, label length and languages, with a
deadline on every reply so a silent device cannot hang a search.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 5: Found printers and how they are classified

**Files:**
- Create: `src/Unirefund.PrintHelper.Core/Discovery/FoundPrinter.cs`
- Test: `tests/Unirefund.PrintHelper.Tests/PrinterClassifierTests.cs`

**Interfaces:**
- Consumes: `Makers` (Task 2), `ZebraInfo` and `ZebraReplies` (Task 4), `QueueInfo` (existing, `Printing/Printers.cs`).
- Produces:
  - `record PrinterAddress(string Host, int Port)`;
  - `record FoundPrinter(string Id, string Connection, bool LabelPrinter, string? Maker, string? Model, int? Dpi, string? PrintMethod, int? LabelLengthMm, PrinterAddress? Address, string? WindowsPrinter, bool StatusSupported, IReadOnlyList<string> RecognisedBy) { [JsonIgnore] Mac; [JsonIgnore] Diagnostics }`;
  - `record Candidate(string Host, int Port, string? Mac, string? SnmpDescription, bool AnsweredZebraDiscovery, ZebraInfo? Zebra, string? HttpTitle)`;
  - `PrinterClassifier.FromNetwork(Candidate)` and `FromQueue(QueueInfo)`;
  - `interface IHttpTitleReader` and `HttpTitleReader(HttpClient)`.
- Id forms: `zebra:<serial>`, `mac:<MAC>`, `ip:<host>:<port>`, `queue:<name>`.

- [ ] **Step 1: Write the failing test** — create `tests/Unirefund.PrintHelper.Tests/PrinterClassifierTests.cs`:

```csharp
using Unirefund.PrintHelper.Core.Discovery;
using Unirefund.PrintHelper.Core.Printing;

namespace Unirefund.PrintHelper.Tests;

public class PrinterClassifierTests
{
    private static readonly ZebraInfo Zt231 =
        new("ZT231", 203, "99J000800418", "thermal-transfer", 100, true, "~HI=ZT231-203dpi,V92.21.39Z,8,8192KB");

    [Fact]
    public void The_office_argox_is_a_label_printer_known_by_its_mac()
    {
        var found = PrinterClassifier.FromNetwork(
            new Candidate("192.168.1.19", 9100, "78:5F:4C:00:55:67", "ARGOX O4", false, null, null));

        Assert.True(found.LabelPrinter);
        Assert.Equal("Argox", found.Maker);
        Assert.Equal("O4", found.Model);
        Assert.Equal("mac:78:5F:4C:00:55:67", found.Id);
        Assert.Equal(new PrinterAddress("192.168.1.19", 9100), found.Address);
        Assert.False(found.StatusSupported);
        Assert.Equal(["port", "snmp", "mac"], found.RecognisedBy);
    }

    [Fact]
    public void The_office_canon_is_another_printer()
    {
        var found = PrinterClassifier.FromNetwork(
            new Candidate("192.168.1.15", 9100, "6C:3C:7C:F4:0F:48", "Canon MF460 Series /P", false, null, null));

        Assert.False(found.LabelPrinter);
        Assert.Null(found.Maker);
        Assert.Equal("Canon MF460 Series /P", found.Model);
    }

    [Fact]
    public void A_zebra_that_answered_is_known_by_its_serial_with_everything_it_said()
    {
        var found = PrinterClassifier.FromNetwork(
            new Candidate("192.168.1.20", 9100, "00:07:4D:69:58:80", null, true, Zt231, null));

        Assert.Equal("zebra:99J000800418", found.Id);
        Assert.Equal(("Zebra", "ZT231", 203), (found.Maker, found.Model, found.Dpi));
        Assert.Equal("thermal-transfer", found.PrintMethod);
        Assert.Equal(100, found.LabelLengthMm);
        Assert.True(found.StatusSupported);
        Assert.Equal("00:07:4D:69:58:80", found.Mac);
    }

    [Fact]
    public void A_silent_zebra_is_still_a_label_printer_by_its_mac()
    {
        var found = PrinterClassifier.FromNetwork(
            new Candidate("192.168.1.21", 9100, "00:07:4D:00:00:01", null, false, null, null));

        Assert.True(found.LabelPrinter);
        Assert.Equal("Zebra", found.Maker);
        Assert.Null(found.Model);
        Assert.Null(found.Dpi);
        Assert.Equal("mac:00:07:4D:00:00:01", found.Id);
    }

    [Fact]
    public void A_zebra_known_only_by_snmp_takes_model_and_dpi_from_the_description()
    {
        var found = PrinterClassifier.FromNetwork(
            new Candidate("10.0.0.9", 9100, null, "Zebra Technologies ZT231-300dpi / internal wired", false, null, null));

        Assert.Equal(("ZT231", 300), (found.Model, found.Dpi));
        Assert.Equal("ip:10.0.0.9:9100", found.Id);
    }

    [Fact]
    public void An_unknown_device_is_named_by_its_web_page()
    {
        var found = PrinterClassifier.FromNetwork(new Candidate("192.168.1.30", 9100, null, null, false, null, "HP LaserJet"));

        Assert.False(found.LabelPrinter);
        Assert.Equal("HP LaserJet", found.Model);
        Assert.Equal(["port", "http"], found.RecognisedBy);
    }

    [Theory]
    [InlineData("ZDesigner ZT231-203dpi ZPL", "ZDesigner", true, "Zebra")]
    [InlineData("Argox O4-250 PPLA", "Argox O4-250 PPLA", true, "Argox")]
    [InlineData("Microsoft Print to PDF", "Microsoft Print To PDF", false, null)]
    public void Windows_printers_are_sorted_by_name_and_driver(string name, string driver, bool label, string? maker)
    {
        var found = PrinterClassifier.FromQueue(new QueueInfo(name, driver, "USB001"));

        Assert.Equal($"queue:{name}", found.Id);
        Assert.Equal("windows", found.Connection);
        Assert.Equal(name, found.WindowsPrinter);
        Assert.Equal(label, found.LabelPrinter);
        Assert.Equal(maker, found.Maker);
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~PrinterClassifierTests"`
Expected: the build fails: `Candidate`, `FoundPrinter` and `PrinterClassifier` do not exist.

- [ ] **Step 3: Write the implementation**

`src/Unirefund.PrintHelper.Core/Discovery/FoundPrinter.cs`:

```csharp
using System.Net;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Unirefund.PrintHelper.Core.Printing;

namespace Unirefund.PrintHelper.Core.Discovery;

public sealed record PrinterAddress(string Host, int Port);

/// <summary>One printer as `GET /printers/search` reports it (camelCase JSON).</summary>
public sealed record FoundPrinter(
    string Id,
    string Connection,
    bool LabelPrinter,
    string? Maker,
    string? Model,
    int? Dpi,
    string? PrintMethod,
    int? LabelLengthMm,
    PrinterAddress? Address,
    string? WindowsPrinter,
    bool StatusSupported,
    IReadOnlyList<string> RecognisedBy)
{
    /// <summary>The hardware address on this PC's subnet, used to re-find the printer.</summary>
    [JsonIgnore] public string? Mac { get; init; }

    /// <summary>Everything the printer said, for the log only.</summary>
    [JsonIgnore] public string Diagnostics { get; init; } = "";
}

/// <summary>What the search learned about one network address.</summary>
public sealed record Candidate(
    string Host,
    int Port,
    string? Mac,
    string? SnmpDescription,
    bool AnsweredZebraDiscovery,
    ZebraInfo? Zebra,
    string? HttpTitle);

public static class PrinterClassifier
{
    public static FoundPrinter FromNetwork(Candidate c)
    {
        var maker = c.Zebra is not null || c.AnsweredZebraDiscovery
            ? Makers.Zebra
            : Makers.FromDescription(c.SnmpDescription) ?? Makers.FromMac(c.Mac) ?? Makers.FromDescription(c.HttpTitle);
        var (snmpModel, snmpDpi) = maker == Makers.Zebra && c.SnmpDescription is not null
            ? ZebraReplies.ParseModel(c.SnmpDescription)
            : (null, null);
        var model = c.Zebra?.Model ?? snmpModel ?? OtherModel(maker, c);
        var labelPrinter = maker is Makers.Zebra or Makers.Argox
            || c.Zebra?.SpeaksZpl == true
            || (c.SnmpDescription?.Contains("ZPL", StringComparison.OrdinalIgnoreCase) ?? false);

        var recognisedBy = new List<string> { "port" };
        if (c.Zebra is not null) recognisedBy.Add("zebra-commands");
        if (c.AnsweredZebraDiscovery) recognisedBy.Add("zebra-discovery");
        if (c.SnmpDescription is not null) recognisedBy.Add("snmp");
        if (Makers.FromMac(c.Mac) is not null) recognisedBy.Add("mac");
        if (c.HttpTitle is not null) recognisedBy.Add("http");

        var id = c.Zebra?.Serial is { } serial ? $"zebra:{serial}"
            : c.Mac is not null ? $"mac:{c.Mac}"
            : $"ip:{c.Host}:{c.Port}";

        return new FoundPrinter(
            id,
            "network",
            labelPrinter,
            maker,
            model,
            c.Zebra?.Dpi ?? snmpDpi,
            c.Zebra?.PrintMethod,
            c.Zebra?.LabelLengthMm,
            new PrinterAddress(c.Host, c.Port),
            null,
            c.Zebra?.Model is not null,
            recognisedBy)
        {
            Mac = c.Mac,
            Diagnostics = $"mac={c.Mac} snmp=\"{c.SnmpDescription}\" discovery={c.AnsweredZebraDiscovery} zebra=[{c.Zebra?.Raw}] http=\"{c.HttpTitle}\"",
        };
    }

    public static FoundPrinter FromQueue(QueueInfo queue)
    {
        var maker = Makers.FromDescription(queue.Name) ?? Makers.FromDescription(queue.Driver);
        var labelPrinter = maker is not null
            || queue.Name.Contains("ZPL", StringComparison.OrdinalIgnoreCase)
            || queue.Driver.Contains("ZPL", StringComparison.OrdinalIgnoreCase);
        var (model, dpi) = maker == Makers.Zebra ? ZebraReplies.ParseModel(queue.Name) : (null, null);
        return new FoundPrinter(
            $"queue:{queue.Name}",
            "windows",
            labelPrinter,
            maker,
            model ?? queue.Name,
            dpi,
            null,
            null,
            null,
            queue.Name,
            false,
            ["windows"])
        {
            Diagnostics = $"driver=\"{queue.Driver}\" port=\"{queue.Port}\"",
        };
    }

    // An office printer: show what it calls itself. The Argox only says "ARGOX O4".
    private static string? OtherModel(string? maker, Candidate c)
    {
        if (maker == Makers.Argox)
        {
            var words = c.SnmpDescription?.Split(' ', StringSplitOptions.RemoveEmptyEntries) ?? [];
            return words.Length > 1 ? string.Join(' ', words.Skip(1)) : null;
        }
        return c.SnmpDescription ?? c.HttpTitle;
    }
}

public interface IHttpTitleReader
{
    Task<string?> ReadAsync(string host, CancellationToken ct);
}

/// <summary>The title of a device's own web page: a last-resort name for printers that answer nothing else.</summary>
public sealed partial class HttpTitleReader(HttpClient http) : IHttpTitleReader
{
    [GeneratedRegex(@"<title[^>]*>\s*(?<title>[^<]{1,200}?)\s*</title>", RegexOptions.IgnoreCase)]
    private static partial Regex Title();

    public async Task<string?> ReadAsync(string host, CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(2));
        try
        {
            using var response = await http.GetAsync($"http://{host}/", HttpCompletionOption.ResponseHeadersRead, cts.Token);
            var content = response.Content.Headers.ContentType?.MediaType ?? "";
            if (!content.Contains("html", StringComparison.OrdinalIgnoreCase)) return null;
            var buffer = new char[16 * 1024];
            using var reader = new StreamReader(await response.Content.ReadAsStreamAsync(cts.Token));
            var read = await reader.ReadBlockAsync(buffer, cts.Token);
            var match = Title().Match(new string(buffer, 0, read));
            return match.Success ? WebUtility.HtmlDecode(match.Groups["title"].Value).Trim() : null;
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException or IOException && !ct.IsCancellationRequested)
        {
            return null;
        }
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~PrinterClassifierTests"`
Expected: PASS. Then `dotnet test PrintHelper.slnx` → 0 failed.

- [ ] **Step 5: Commit**

```bash
git add tests/Unirefund.PrintHelper.Tests/PrinterClassifierTests.cs src/Unirefund.PrintHelper.Core/Discovery/FoundPrinter.cs
git commit -F - <<'EOF'
feat: sort what the search finds into label printers and others

Zebra or Argox by any source, or ZPL in what the device says, makes a
label printer; ids prefer the Zebra serial, then the MAC, then the
address. Office printers keep the name they give themselves.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 6: The search

**Files:**
- Modify: `src/Unirefund.PrintHelper.Core/HelperOptions.cs` (add `SnmpWait`)
- Create: `src/Unirefund.PrintHelper.Core/Discovery/PrinterSearch.cs`
- Test: `tests/Unirefund.PrintHelper.Tests/PrinterSearchTests.cs` (also holds the fakes `FakePorts`, `FakeSnmp`, `FakeDiscovery`, `FakeNeighbours`, `FakeZebraProbe` and `FakeTitles`, which Tasks 7 and 8 reuse)

**Interfaces:**
- Consumes: everything from Tasks 1–5; `IPortProbe` and `TcpPortProbe` (existing, `Discovery/SubnetScanner.cs`); `IPrinterCatalog` (existing).
- Produces:
  - `record SearchResult(IReadOnlyList<FoundPrinter> Printers, long SearchedMs, IReadOnlyList<string> Unreachable)`;
  - `interface IPrinterSearch { Task<SearchResult> SearchAsync(TimeSpan maxAge, CancellationToken); FoundPrinter? Find(string id); }`;
  - `record SearchSources(...)`;
  - `PrinterSearch(HelperOptions, SearchSources)`.

- [ ] **Step 1: Write the failing test** — create `tests/Unirefund.PrintHelper.Tests/PrinterSearchTests.cs`:

```csharp
using System.Collections.Concurrent;
using System.Net;
using System.Net.NetworkInformation;
using Unirefund.PrintHelper.Core;
using Unirefund.PrintHelper.Core.Discovery;
using Unirefund.PrintHelper.Core.Printing;

namespace Unirefund.PrintHelper.Tests;

public sealed class FakePorts(params string[] open) : IPortProbe
{
    public ConcurrentBag<string> Probed { get; } = [];
    public TaskCompletionSource? Hold { get; set; }

    public async Task<bool> IsOpenAsync(string host, int port, TimeSpan timeout, CancellationToken ct)
    {
        Probed.Add(host);
        if (Hold is not null) await Hold.Task;
        return port == 9100 && open.Contains(host);
    }
}

public sealed class FakeSnmp(Dictionary<string, string> answers) : ISnmpClient
{
    public Task<IReadOnlyDictionary<string, string>> GetSysDescrAsync(IReadOnlyList<IPAddress> hosts, TimeSpan wait, CancellationToken ct) =>
        Task.FromResult<IReadOnlyDictionary<string, string>>(answers);
}

public sealed class FakeDiscovery(params string[] zebras) : IZebraDiscovery
{
    public Task<IReadOnlySet<string>> FindAsync(IReadOnlyList<IPAddress> broadcasts, CancellationToken ct) =>
        Task.FromResult<IReadOnlySet<string>>(zebras.ToHashSet());
}

public sealed class FakeNeighbours(Dictionary<string, string> table) : INeighbourTable
{
    public Dictionary<string, string> Table { get; } = table;

    public Task<IReadOnlyDictionary<string, string>> ReadAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyDictionary<string, string>>(new Dictionary<string, string>(Table));
}

public sealed class FakeZebraProbe(Dictionary<string, ZebraInfo> answers) : IZebraProbe
{
    public ConcurrentBag<string> Queried { get; } = [];

    public Task<ZebraInfo?> QueryAsync(string host, int port, CancellationToken ct)
    {
        Queried.Add(host);
        return Task.FromResult(answers.GetValueOrDefault(host));
    }
}

public sealed class FakeTitles(Dictionary<string, string> titles) : IHttpTitleReader
{
    public ConcurrentBag<string> Read { get; } = [];

    public Task<string?> ReadAsync(string host, CancellationToken ct)
    {
        Read.Add(host);
        return Task.FromResult(titles.GetValueOrDefault(host));
    }
}

public class PrinterSearchTests
{
    private static readonly NetworkAdapter Office = new(
        "Ethernet", "Intel(R) Ethernet Connection (5) I219-LM", NetworkInterfaceType.Ethernet, true,
        IPAddress.Parse("192.168.1.7"), IPAddress.Parse("255.255.255.0"));

    private static readonly NetworkAdapter HyperV = new(
        "vEthernet (Default Switch)", "Hyper-V Virtual Ethernet Adapter", NetworkInterfaceType.Ethernet, true,
        IPAddress.Parse("172.25.160.1"), IPAddress.Parse("255.255.240.0"));

    public static readonly ZebraInfo Zt231 =
        new("ZT231", 203, "99J000800418", "thermal-transfer", 100, true, "~HI=ZT231-203dpi,V92.21.39Z,8,8192KB");

    // The office as seen on 2026-10-26, plus a Zebra at .20 and an unknown device at .30.
    private sealed class Office_
    {
        public FakePorts Ports { get; } = new("192.168.1.15", "192.168.1.19", "192.168.1.20", "192.168.1.30");
        public FakeZebraProbe Zebra { get; } = new(new() { ["192.168.1.20"] = Zt231 });
        public FakeTitles Titles { get; } = new(new() { ["192.168.1.30"] = "HP LaserJet" });
        public FakeNeighbours Neighbours { get; } = new(new()
        {
            ["192.168.1.15"] = "6C:3C:7C:F4:0F:48",
            ["192.168.1.19"] = "78:5F:4C:00:55:67",
            ["192.168.1.20"] = "00:07:4D:69:58:80",
        });

        public PrinterSearch Search(params NetworkAdapter[] adapters) => new(new HelperOptions(), new SearchSources(
            () => adapters.Length > 0 ? adapters : [Office],
            Ports,
            new FakeSnmp(new() { ["192.168.1.15"] = "Canon MF460 Series /P", ["192.168.1.19"] = "ARGOX O4" }),
            new FakeDiscovery("192.168.1.20"),
            Neighbours,
            Zebra,
            Titles,
            new FakeCatalog(new QueueInfo("Argox O4-250 PPLA", "Argox O4-250 PPLA", "COM10:"), new QueueInfo("Microsoft Print to PDF", "Microsoft Print To PDF", "PORTPROMPT:"))));
    }

    [Fact]
    public async Task Finds_label_printers_first_then_others_then_windows_printers()
    {
        var office = new Office_();

        var result = await office.Search().SearchAsync(TimeSpan.Zero, CancellationToken.None);

        Assert.Equal(
            ["mac:78:5F:4C:00:55:67", "zebra:99J000800418", "mac:6C:3C:7C:F4:0F:48", "ip:192.168.1.30:9100", "queue:Argox O4-250 PPLA", "queue:Microsoft Print to PDF"],
            result.Printers.Select(p => p.Id));
        Assert.Equal([true, true, false, false, true, false], result.Printers.Select(p => p.LabelPrinter));
    }

    [Fact]
    public async Task Asks_only_known_zebras_anything()
    {
        var office = new Office_();

        await office.Search().SearchAsync(TimeSpan.Zero, CancellationToken.None);

        Assert.Equal(["192.168.1.20"], office.Zebra.Queried);
        Assert.Equal(["192.168.1.30"], office.Titles.Read);
    }

    [Fact]
    public async Task Never_searches_a_virtual_adapter()
    {
        var office = new Office_();

        await office.Search(Office, HyperV).SearchAsync(TimeSpan.Zero, CancellationToken.None);

        Assert.Equal(253, office.Ports.Probed.Count);
        Assert.DoesNotContain(office.Ports.Probed, h => h.StartsWith("172.", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Concurrent_requests_share_one_search()
    {
        var office = new Office_ { Ports = { Hold = new TaskCompletionSource() } };
        var search = office.Search();

        var first = search.SearchAsync(TimeSpan.Zero, CancellationToken.None);
        var second = search.SearchAsync(TimeSpan.Zero, CancellationToken.None);
        office.Ports.Hold!.SetResult();
        await Task.WhenAll(first, second);

        Assert.Equal(253, office.Ports.Probed.Count);
        Assert.Same(await first, await second);
    }

    [Fact]
    public async Task Reuses_a_recent_search_only_when_asked_to()
    {
        var office = new Office_();
        var search = office.Search();

        await search.SearchAsync(TimeSpan.Zero, CancellationToken.None);
        await search.SearchAsync(TimeSpan.FromSeconds(30), CancellationToken.None);
        Assert.Equal(253, office.Ports.Probed.Count);

        await search.SearchAsync(TimeSpan.Zero, CancellationToken.None);
        Assert.Equal(506, office.Ports.Probed.Count);
    }

    [Fact]
    public async Task Remembers_found_printers_by_id()
    {
        var search = new Office_().Search();

        Assert.Null(search.Find("mac:78:5F:4C:00:55:67"));
        await search.SearchAsync(TimeSpan.Zero, CancellationToken.None);

        Assert.Equal("192.168.1.19", search.Find("mac:78:5f:4c:00:55:67")?.Address?.Host);
    }

    [Fact]
    public async Task Reports_label_printers_whose_print_port_is_closed()
    {
        var office = new Office_();
        office.Neighbours.Table["192.168.1.50"] = "00:07:4D:00:00:50";

        var result = await office.Search().SearchAsync(TimeSpan.Zero, CancellationToken.None);

        Assert.Equal(["192.168.1.50 (port 9100 closed)"], result.Unreachable);
        Assert.DoesNotContain(result.Printers, p => p.Address?.Host == "192.168.1.50");
    }

    [Fact]
    public async Task A_failing_source_still_lets_the_others_report()
    {
        var office = new Office_();
        var search = new PrinterSearch(new HelperOptions(), new SearchSources(
            () => [Office], office.Ports, new ThrowingSnmp(), new FakeDiscovery(), office.Neighbours,
            office.Zebra, office.Titles, new ThrowingCatalog()));

        var result = await search.SearchAsync(TimeSpan.Zero, CancellationToken.None);

        Assert.Contains(result.Printers, p => p.Id == "mac:78:5F:4C:00:55:67" && p.LabelPrinter);
    }

    [Fact]
    public async Task Two_adapters_on_one_network_search_it_once()
    {
        var office = new Office_();
        var wifi = Office with { Name = "Wi-Fi", Description = "Intel(R) Wi-Fi 6 AX201", Address = IPAddress.Parse("192.168.1.8") };

        await office.Search(Office, wifi).SearchAsync(TimeSpan.Zero, CancellationToken.None);

        Assert.Equal(254, office.Ports.Probed.Count);
        Assert.Equal(office.Ports.Probed.Count, office.Ports.Probed.Distinct().Count());
    }

    [Fact]
    public async Task Without_a_neighbour_table_the_argox_is_still_a_label_printer()
    {
        var office = new Office_();
        office.Neighbours.Table.Clear();

        var result = await office.Search().SearchAsync(TimeSpan.Zero, CancellationToken.None);

        var argox = Assert.Single(result.Printers, p => p.Maker == "Argox" && p.Connection == "network");
        Assert.True(argox.LabelPrinter);
        Assert.Equal("ip:192.168.1.19:9100", argox.Id);
    }

    [Fact]
    public async Task A_zebra_known_only_by_its_web_page_is_asked_and_recognised()
    {
        var office = new Office_();
        var search = new PrinterSearch(new HelperOptions(), new SearchSources(
            () => [Office],
            new FakePorts("192.168.1.60"),
            new FakeSnmp([]),
            new FakeDiscovery(),
            new FakeNeighbours(new() { ["192.168.1.60"] = "AA:BB:CC:00:00:60" }),
            new FakeZebraProbe(new() { ["192.168.1.60"] = Zt231 }),
            new FakeTitles(new() { ["192.168.1.60"] = "Zebra Technologies ZTC ZT231-203dpi ZPL" }),
            new FakeCatalog()));

        var result = await search.SearchAsync(TimeSpan.Zero, CancellationToken.None);

        var zebra = Assert.Single(result.Printers);
        Assert.Equal("zebra:99J000800418", zebra.Id);
        Assert.True(zebra.LabelPrinter);
    }

    private sealed class ThrowingSnmp : ISnmpClient
    {
        public Task<IReadOnlyDictionary<string, string>> GetSysDescrAsync(IReadOnlyList<IPAddress> hosts, TimeSpan wait, CancellationToken ct) =>
            throw new System.Net.Sockets.SocketException(10013);
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~PrinterSearchTests"`
Expected: the build fails: `PrinterSearch` and `SearchSources` do not exist.

- [ ] **Step 3: Write the implementation**

`src/Unirefund.PrintHelper.Core/Discovery/PrinterSearch.cs`:

```csharp
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using Unirefund.PrintHelper.Core.Printing;

namespace Unirefund.PrintHelper.Core.Discovery;

public sealed record SearchResult(
    IReadOnlyList<FoundPrinter> Printers,
    long SearchedMs,
    IReadOnlyList<string> Unreachable);

public interface IPrinterSearch
{
    /// <summary>Joins the running search, reuses one finished within <paramref name="maxAge"/>, or starts one.</summary>
    Task<SearchResult> SearchAsync(TimeSpan maxAge, CancellationToken ct);

    /// <summary>A printer from any search since the helper started.</summary>
    FoundPrinter? Find(string id);
}

public sealed record SearchSources(
    Func<IReadOnlyList<NetworkAdapter>> Adapters,
    IPortProbe Ports,
    ISnmpClient Snmp,
    IZebraDiscovery ZebraDiscovery,
    INeighbourTable Neighbours,
    IZebraProbe Zebra,
    IHttpTitleReader Titles,
    IPrinterCatalog Catalog);

/// <summary>
/// Finds printers on this PC's networks and among its installed printers. One search runs at
/// a time; a request that arrives meanwhile shares its result.
/// </summary>
public sealed class PrinterSearch(HelperOptions options, SearchSources sources) : IPrinterSearch
{
    private const int MaxParallelProbes = 256;
    private const int MaxParallelQuestions = 16;

    private readonly object _gate = new();
    private readonly ConcurrentDictionary<string, FoundPrinter> _registry = new(StringComparer.OrdinalIgnoreCase);
    private Task<SearchResult>? _running;
    private (SearchResult Result, DateTimeOffset At)? _last;

    public Task<SearchResult> SearchAsync(TimeSpan maxAge, CancellationToken ct)
    {
        lock (_gate)
        {
            if (_running is null && _last is { } last && DateTimeOffset.UtcNow - last.At <= maxAge)
            {
                return Task.FromResult(last.Result);
            }
            // Task.Run: the search must never finish while this lock is held, or _running would stick.
            _running ??= Task.Run(RunAsync);
            return _running.WaitAsync(ct);
        }
    }

    public FoundPrinter? Find(string id) => _registry.TryGetValue(id, out var printer) ? printer : null;

    private async Task<SearchResult> RunAsync()
    {
        try
        {
            // Not tied to any one request: a tab that gives up must not cancel it for the others.
            var result = await SearchOnceAsync(CancellationToken.None);
            lock (_gate)
            {
                foreach (var printer in result.Printers) _registry[printer.Id] = printer;
                _last = (result, DateTimeOffset.UtcNow);
            }
            return result;
        }
        finally
        {
            lock (_gate) _running = null;
        }
    }

    private async Task<SearchResult> SearchOnceAsync(CancellationToken ct)
    {
        var timer = Stopwatch.StartNew();
        var adapters = sources.Adapters().Where(NetworkAdapters.IsSearchable).ToList();
        var hosts = adapters
            .SelectMany(a => NetworkAdapters.HostsAround(a.Address, a.Mask))
            .Distinct()
            .ToList();
        var broadcasts = adapters.Select(a => NetworkAdapters.Broadcast(a.Address, a.Mask)).Distinct().ToList();

        var sweep = SweepAsync(hosts, ct);
        var snmp = OrEmpty(() => sources.Snmp.GetSysDescrAsync(hosts, options.SnmpWait, ct));
        var discovery = OrEmpty(() => sources.ZebraDiscovery.FindAsync(broadcasts, ct));
        var open = await sweep;
        // After the sweep, so every host that answered is fresh in the neighbour table.
        var neighbours = await OrEmpty(() => sources.Neighbours.ReadAsync(ct));
        var descriptions = await snmp;
        var zebras = await discovery;

        using var questions = new SemaphoreSlim(MaxParallelQuestions);
        var candidates = await Task.WhenAll(open.Select(async host =>
        {
            neighbours.TryGetValue(host, out var mac);
            descriptions.TryGetValue(host, out var description);
            var answeredDiscovery = zebras.Contains(host);
            var looksLikeZebra = answeredDiscovery
                || Makers.FromDescription(description) == Makers.Zebra
                || Makers.FromMac(mac) == Makers.Zebra;
            var known = description is not null || Makers.FromMac(mac) is not null;

            await questions.WaitAsync(ct);
            try
            {
                // The probing rule: only a device already known to be a Zebra is asked anything,
                // because an office printer would print the question as a page.
                var zebra = looksLikeZebra ? await OrNull(() => sources.Zebra.QueryAsync(host, options.PrinterPort, ct)) : null;
                var title = !looksLikeZebra && !known ? await OrNull(() => sources.Titles.ReadAsync(host, ct)) : null;
                // A Zebra with SNMP off and a hardware address we don't list still names itself on its web page.
                if (zebra is null && Makers.FromDescription(title) == Makers.Zebra)
                {
                    zebra = await OrNull(() => sources.Zebra.QueryAsync(host, options.PrinterPort, ct));
                }
                return new Candidate(host, options.PrinterPort, mac, description, answeredDiscovery, zebra, title);
            }
            finally
            {
                questions.Release();
            }
        }));

        var queues = OrEmpty(() => sources.Catalog.ListQueues());
        var printers = candidates.Select(PrinterClassifier.FromNetwork)
            .OrderByDescending(p => p.LabelPrinter)
            .ThenBy(p => AddressOrder(p.Address!.Host))
            .Concat(queues.Select(PrinterClassifier.FromQueue)
                .OrderByDescending(p => p.LabelPrinter)
                .ThenBy(p => p.WindowsPrinter, StringComparer.OrdinalIgnoreCase))
            .ToList();

        // Label printers seen by other means that would not take a print job on the print port.
        var openSet = open.ToHashSet();
        var unreachable = zebras
            .Concat(descriptions.Where(d => Makers.FromDescription(d.Value) is not null).Select(d => d.Key))
            .Concat(neighbours.Where(n => Makers.FromMac(n.Value) is not null).Select(n => n.Key))
            .Where(host => !openSet.Contains(host))
            .Distinct()
            .Select(host => $"{host} (port {options.PrinterPort} closed)")
            .ToList();

        return new SearchResult(printers, timer.ElapsedMilliseconds, unreachable);
    }

    private async Task<IReadOnlyList<string>> SweepAsync(IReadOnlyList<IPAddress> hosts, CancellationToken ct)
    {
        var open = new ConcurrentBag<string>();
        using var gate = new SemaphoreSlim(MaxParallelProbes);
        await Task.WhenAll(hosts.Select(async address =>
        {
            await gate.WaitAsync(ct);
            try
            {
                var host = address.ToString();
                if (await sources.Ports.IsOpenAsync(host, options.PrinterPort, options.ScanTimeout, ct)) open.Add(host);
            }
            finally
            {
                gate.Release();
            }
        }));
        return [.. open];
    }

    private static uint AddressOrder(string host) =>
        System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(IPAddress.Parse(host).GetAddressBytes());

    // A source that fails (SNMP or broadcasts blocked, WMI broken) just contributes nothing.
    private static async Task<IReadOnlyDictionary<string, string>> OrEmpty(Func<Task<IReadOnlyDictionary<string, string>>> source)
    {
        try { return await source(); }
        catch (Exception) { return new Dictionary<string, string>(); }
    }

    private static async Task<IReadOnlySet<string>> OrEmpty(Func<Task<IReadOnlySet<string>>> source)
    {
        try { return await source(); }
        catch (Exception) { return new HashSet<string>(); }
    }

    private static IReadOnlyList<QueueInfo> OrEmpty(Func<IReadOnlyList<QueueInfo>> source)
    {
        try { return source(); }
        catch (Exception) { return []; }
    }

    private static async Task<T?> OrNull<T>(Func<Task<T?>> source) where T : class
    {
        try { return await source(); }
        catch (Exception) { return null; }
    }
}
```

Also add this property to `HelperOptions` (`src/Unirefund.PrintHelper.Core/HelperOptions.cs`), after `ScanTimeout`:

```csharp
    public TimeSpan SnmpWait { get; init; } = TimeSpan.FromSeconds(2);
```

and add `src/Unirefund.PrintHelper.Core/HelperOptions.cs` to the Step 5 `git add`.

- [ ] **Step 4: Run the tests**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~PrinterSearchTests"`
Expected: PASS. Then `dotnet test PrintHelper.slnx` → 0 failed.

- [ ] **Step 5: Commit**

```bash
git add tests/Unirefund.PrintHelper.Tests/PrinterSearchTests.cs src/Unirefund.PrintHelper.Core/Discovery/PrinterSearch.cs
git commit -F - <<'EOF'
feat: search for printers, one search at a time

Sweep, SNMP, Zebra discovery and the neighbour table run in parallel;
only devices already known to be Zebras are asked anything. Concurrent
requests share one search, a failing source just contributes nothing,
and found printers are remembered by id.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 7: Printing by printer id, and re-finding a moved printer

**Files:**
- Create: `src/Unirefund.PrintHelper.Core/Discovery/PrinterResolver.cs`
- Test: `tests/Unirefund.PrintHelper.Tests/PrinterResolverTests.cs` (also holds `FakeSearch` and `FakeIdentity`, which Task 8 reuses)

**Interfaces:**
- Consumes: `IPrinterSearch` (Task 6), `IPortProbe`, `INeighbourTable` and `IZebraProbe` (Tasks 2 and 4), `TargetPolicy` (existing).
- Produces:
  - `PrintRefusedException(int status, string code, string message)`;
  - `record PrintDestination(string Kind, string? Host, int Port, string? Queue, PrinterAddress? MovedTo)`;
  - `interface IIdentityCheck` and `PrinterIdentity`;
  - `PrinterResolver(IPrinterSearch, IIdentityCheck, IPrinterCatalog, HelperOptions)` with `ResolveAsync(string, PrinterAddress?, CancellationToken)`, `RecentSearch` (30 s) and `static FindQueue(IPrinterCatalog, string)`.

- [ ] **Step 1: Write the failing test** — create `tests/Unirefund.PrintHelper.Tests/PrinterResolverTests.cs`:

```csharp
using Unirefund.PrintHelper.Core;
using Unirefund.PrintHelper.Core.Discovery;
using Unirefund.PrintHelper.Core.Printing;

namespace Unirefund.PrintHelper.Tests;

public sealed class FakeSearch(params FoundPrinter[] printers) : IPrinterSearch
{
    private readonly Dictionary<string, FoundPrinter> _known = new(StringComparer.OrdinalIgnoreCase);
    public FoundPrinter[] NextResult { get; set; } = printers;
    public int Searches { get; private set; }
    public TimeSpan? LastMaxAge { get; private set; }

    public Task<SearchResult> SearchAsync(TimeSpan maxAge, CancellationToken ct)
    {
        Searches++;
        LastMaxAge = maxAge;
        foreach (var p in NextResult) _known[p.Id] = p;
        return Task.FromResult(new SearchResult(NextResult, 42, []));
    }

    public FoundPrinter? Find(string id) => _known.GetValueOrDefault(id);

    public void Remember(params FoundPrinter[] found)
    {
        foreach (var p in found) _known[p.Id] = p;
    }
}

public sealed class FakeIdentity(params (string Id, string Host)[] at) : IIdentityCheck
{
    public List<(string Id, string Host)> Checked { get; } = [];

    public Task<bool> IsAtAsync(string printerId, PrinterAddress address, CancellationToken ct)
    {
        Checked.Add((printerId, address.Host));
        return Task.FromResult(at.Contains((printerId, address.Host)));
    }
}

public class PrinterResolverTests
{
    private const string ArgoxId = "mac:78:5F:4C:00:55:67";

    public static FoundPrinter Network(string id, string host, bool label = true) =>
        new(id, "network", label, "Argox", "O4", null, null, null, new PrinterAddress(host, 9100), null, false, ["port"]);

    private static PrinterResolver Resolver(FakeSearch search, FakeIdentity identity) =>
        new(search, identity, new FakeCatalog(new QueueInfo("ZDesigner ZT231-203dpi ZPL", "ZDesigner", "USB001")), new HelperOptions());

    [Fact]
    public async Task Prints_where_the_printer_still_is_without_searching()
    {
        var search = new FakeSearch();
        var identity = new FakeIdentity((ArgoxId, "192.168.1.19"));

        var destination = await Resolver(search, identity)
            .ResolveAsync(ArgoxId, new PrinterAddress("192.168.1.19", 9100), CancellationToken.None);

        Assert.Equal(new PrintDestination("network", "192.168.1.19", 9100, null, null), destination);
        Assert.Equal(0, search.Searches);
    }

    [Fact]
    public async Task Re_finds_a_printer_that_moved_and_says_where()
    {
        var search = new FakeSearch(Network(ArgoxId, "192.168.1.23"));
        var identity = new FakeIdentity();

        var destination = await Resolver(search, identity)
            .ResolveAsync(ArgoxId, new PrinterAddress("192.168.1.19", 9100), CancellationToken.None);

        Assert.Equal("192.168.1.23", destination.Host);
        Assert.Equal(new PrinterAddress("192.168.1.23", 9100), destination.MovedTo);
        Assert.Equal(PrinterResolver.RecentSearch, search.LastMaxAge);
    }

    [Fact]
    public async Task Uses_the_remembered_address_when_the_web_sends_none()
    {
        var search = new FakeSearch();
        search.Remember(Network(ArgoxId, "192.168.1.19"));
        var identity = new FakeIdentity((ArgoxId, "192.168.1.19"));

        var destination = await Resolver(search, identity).ResolveAsync(ArgoxId, null, CancellationToken.None);

        Assert.Equal("192.168.1.19", destination.Host);
        Assert.Null(destination.MovedTo);
    }

    [Fact]
    public async Task A_printer_that_is_nowhere_is_404()
    {
        var error = await Assert.ThrowsAsync<PrintRefusedException>(() =>
            Resolver(new FakeSearch(), new FakeIdentity())
                .ResolveAsync(ArgoxId, new PrinterAddress("192.168.1.19", 9100), CancellationToken.None));

        Assert.Equal((404, "printer-not-found"), (error.Status, error.Code));
    }

    [Fact]
    public async Task Refuses_a_printer_the_search_found_not_to_print_labels()
    {
        var search = new FakeSearch();
        search.Remember(Network("mac:6C:3C:7C:F4:0F:48", "192.168.1.15", label: false));

        var error = await Assert.ThrowsAsync<PrintRefusedException>(() =>
            Resolver(search, new FakeIdentity())
                .ResolveAsync("mac:6C:3C:7C:F4:0F:48", new PrinterAddress("192.168.1.15", 9100), CancellationToken.None));

        Assert.Equal((400, "not-a-label-printer"), (error.Status, error.Code));
    }

    [Theory]
    [InlineData("8.8.8.8", 9100)]
    [InlineData("192.168.1.19", 22)]
    public async Task Refuses_a_last_address_outside_the_lan_print_port(string host, int port)
    {
        var error = await Assert.ThrowsAsync<PrintRefusedException>(() =>
            Resolver(new FakeSearch(), new FakeIdentity())
                .ResolveAsync(ArgoxId, new PrinterAddress(host, port), CancellationToken.None));

        Assert.Equal("invalid-target", error.Code);
    }

    [Fact]
    public async Task An_ip_id_prints_only_to_its_own_lan_address()
    {
        var resolver = Resolver(new FakeSearch(), new FakeIdentity());

        var destination = await resolver.ResolveAsync("ip:10.0.0.9:9100", null, CancellationToken.None);
        Assert.Equal(new PrintDestination("network", "10.0.0.9", 9100, null, null), destination);

        await Assert.ThrowsAsync<PrintRefusedException>(() => resolver.ResolveAsync("ip:8.8.8.8:9100", null, CancellationToken.None));
        await Assert.ThrowsAsync<PrintRefusedException>(() => resolver.ResolveAsync("ip:10.0.0.9:25", null, CancellationToken.None));
    }

    [Fact]
    public async Task A_queue_id_needs_an_installed_printer()
    {
        var resolver = Resolver(new FakeSearch(), new FakeIdentity());

        var destination = await resolver.ResolveAsync("queue:zdesigner zt231-203dpi zpl", null, CancellationToken.None);
        Assert.Equal("ZDesigner ZT231-203dpi ZPL", destination.Queue);

        var error = await Assert.ThrowsAsync<PrintRefusedException>(() => resolver.ResolveAsync("queue:Gone", null, CancellationToken.None));
        Assert.Equal((404, "queue-not-found"), (error.Status, error.Code));
    }

    [Theory]
    [InlineData("usb:0A5F:0166:X")]
    [InlineData("192.168.1.19")]
    [InlineData("")]
    public async Task Refuses_unknown_id_forms(string id) =>
        await Assert.ThrowsAsync<PrintRefusedException>(() =>
            Resolver(new FakeSearch(), new FakeIdentity()).ResolveAsync(id, null, CancellationToken.None));
}

public class PrinterIdentityTests
{
    [Fact]
    public async Task A_mac_id_matches_the_neighbour_table_after_connecting()
    {
        var ports = new FakePorts("192.168.1.19");
        var identity = new PrinterIdentity(
            ports, new FakeNeighbours(new() { ["192.168.1.19"] = "78:5F:4C:00:55:67" }),
            new FakeZebraProbe([]), new HelperOptions());

        Assert.True(await identity.IsAtAsync("mac:78:5f:4c:00:55:67", new("192.168.1.19", 9100), CancellationToken.None));
        Assert.False(await identity.IsAtAsync("mac:00:07:4D:00:00:01", new("192.168.1.19", 9100), CancellationToken.None));
        Assert.False(await identity.IsAtAsync("mac:78:5F:4C:00:55:67", new("192.168.1.40", 9100), CancellationToken.None));
        Assert.Contains("192.168.1.19", ports.Probed);
    }

    [Fact]
    public async Task A_zebra_id_matches_its_serial()
    {
        var identity = new PrinterIdentity(
            new FakePorts(), new FakeNeighbours([]),
            new FakeZebraProbe(new() { ["192.168.1.20"] = PrinterSearchTests.Zt231 }), new HelperOptions());

        Assert.True(await identity.IsAtAsync("zebra:99J000800418", new("192.168.1.20", 9100), CancellationToken.None));
        Assert.False(await identity.IsAtAsync("zebra:OTHER", new("192.168.1.20", 9100), CancellationToken.None));
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~PrinterResolverTests|FullyQualifiedName~PrinterIdentityTests"`
Expected: the build fails: `PrinterResolver` and `PrinterIdentity` do not exist.

- [ ] **Step 3: Write the implementation**

`src/Unirefund.PrintHelper.Core/Discovery/PrinterResolver.cs`:

```csharp
using Unirefund.PrintHelper.Core.Printing;
using Unirefund.PrintHelper.Core.Security;

namespace Unirefund.PrintHelper.Core.Discovery;

/// <summary>A print request the helper turns down; the API answers it as a JSON error.</summary>
public sealed class PrintRefusedException(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}

/// <summary>Where to send a job: a network address or an installed printer, and whether the printer moved.</summary>
public sealed record PrintDestination(string Kind, string? Host, int Port, string? Queue, PrinterAddress? MovedTo);

public interface IIdentityCheck
{
    /// <summary>Is the printer with this id the one answering at this address?</summary>
    Task<bool> IsAtAsync(string printerId, PrinterAddress address, CancellationToken ct);
}

/// <summary>Same MAC in the neighbour table, or the same Zebra serial number.</summary>
public sealed class PrinterIdentity(IPortProbe ports, INeighbourTable neighbours, IZebraProbe zebra, HelperOptions options)
    : IIdentityCheck
{
    public async Task<bool> IsAtAsync(string printerId, PrinterAddress address, CancellationToken ct)
    {
        if (printerId.StartsWith("mac:", StringComparison.OrdinalIgnoreCase))
        {
            // Connecting first puts the address in the neighbour table.
            if (!await ports.IsOpenAsync(address.Host, address.Port, options.ScanTimeout, ct)) return false;
            var table = await neighbours.ReadAsync(ct);
            return table.TryGetValue(address.Host, out var mac)
                && string.Equals(mac, printerId[4..], StringComparison.OrdinalIgnoreCase);
        }
        if (printerId.StartsWith("zebra:", StringComparison.OrdinalIgnoreCase))
        {
            var info = await zebra.QueryAsync(address.Host, address.Port, ct);
            return info?.Serial is { } serial && string.Equals(serial, printerId[6..], StringComparison.Ordinal);
        }
        return false;
    }
}

/// <summary>
/// Turns a printer id from a search into a destination. A printer whose address changed is
/// re-found by its MAC or serial; the web stores the new address it gets back.
/// </summary>
public sealed class PrinterResolver(IPrinterSearch search, IIdentityCheck identity, IPrinterCatalog catalog, HelperOptions options)
{
    /// <summary>A search this recent is reused rather than run again when re-finding.</summary>
    public static readonly TimeSpan RecentSearch = TimeSpan.FromSeconds(30);

    public async Task<PrintDestination> ResolveAsync(string printerId, PrinterAddress? lastAddress, CancellationToken ct)
    {
        if (lastAddress is not null && !IsPrintPort(lastAddress))
        {
            throw new PrintRefusedException(400, "invalid-target", $"Printer must be a private IPv4 address on port {options.PrinterPort}.");
        }

        if (printerId.StartsWith("queue:", StringComparison.OrdinalIgnoreCase))
        {
            return new PrintDestination("queue", null, 0, FindQueue(catalog, printerId[6..]).Name, null);
        }

        if (printerId.StartsWith("ip:", StringComparison.OrdinalIgnoreCase))
        {
            var parts = printerId[3..].Split(':');
            var address = parts.Length == 2 && int.TryParse(parts[1], out var port) ? new PrinterAddress(parts[0], port) : null;
            if (address is null || !IsPrintPort(address))
            {
                throw new PrintRefusedException(400, "invalid-target", "Unknown printer id.");
            }
            RefuseIfNotALabelPrinter(search.Find(printerId));
            return new PrintDestination("network", address.Host, address.Port, null, null);
        }

        if (!printerId.StartsWith("mac:", StringComparison.OrdinalIgnoreCase)
            && !printerId.StartsWith("zebra:", StringComparison.OrdinalIgnoreCase))
        {
            throw new PrintRefusedException(400, "invalid-target", "Unknown printer id.");
        }

        var known = search.Find(printerId);
        RefuseIfNotALabelPrinter(known);
        var here = lastAddress ?? known?.Address;
        if (here is not null && await identity.IsAtAsync(printerId, here, ct))
        {
            return new PrintDestination("network", here.Host, here.Port, null, null);
        }

        var result = await search.SearchAsync(RecentSearch, ct);
        var found = result.Printers.FirstOrDefault(p => string.Equals(p.Id, printerId, StringComparison.OrdinalIgnoreCase));
        if (found?.Address is null)
        {
            throw new PrintRefusedException(404, "printer-not-found", "The printer was not found on the network.");
        }
        RefuseIfNotALabelPrinter(found);
        var moved = lastAddress is not null && found.Address != lastAddress ? found.Address : null;
        return new PrintDestination("network", found.Address.Host, found.Address.Port, null, moved);
    }

    /// <summary>An installed printer by name, matched case-insensitively.</summary>
    public static QueueInfo FindQueue(IPrinterCatalog catalog, string name)
    {
        IReadOnlyList<QueueInfo> installed;
        try
        {
            installed = catalog.ListQueues();
        }
        catch (Exception)
        {
            throw new PrintRefusedException(502, "printer-unreachable", "Could not list installed printers.");
        }
        return installed.FirstOrDefault(q => string.Equals(q.Name, name, StringComparison.OrdinalIgnoreCase))
            ?? throw new PrintRefusedException(404, "queue-not-found", $"No installed printer named '{name}'.");
    }

    private bool IsPrintPort(PrinterAddress address) =>
        TargetPolicy.IsPrivateIPv4(address.Host) && address.Port == options.PrinterPort;

    private static void RefuseIfNotALabelPrinter(FoundPrinter? printer)
    {
        if (printer is { LabelPrinter: false })
        {
            throw new PrintRefusedException(400, "not-a-label-printer", "This printer cannot print these labels.");
        }
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~PrinterResolverTests|FullyQualifiedName~PrinterIdentityTests"`
Expected: PASS. Then `dotnet test PrintHelper.slnx` → 0 failed.

- [ ] **Step 5: Commit**

```bash
git add tests/Unirefund.PrintHelper.Tests/PrinterResolverTests.cs src/Unirefund.PrintHelper.Core/Discovery/PrinterResolver.cs
git commit -F - <<'EOF'
feat: print by printer id and re-find a printer that moved

An id from a search is checked at the last known address by MAC or
Zebra serial; if the printer is not there, a recent or fresh search finds
it and the new address goes back to the web. Ids for printers that are
not label printers are refused.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 8: API version 2, wiring and docs

**Files:**
- Modify: `src/Unirefund.PrintHelper.Core/Api/Contracts.cs`, `src/Unirefund.PrintHelper.Core/Api/HelperApi.cs`
- Modify: `src/Unirefund.PrintHelper/Program.cs`, `src/Unirefund.PrintHelper.Mac/Program.cs`
- Modify: `Directory.Build.props` (1.1.0), `AGENTS.md` (invariants)
- Test: `tests/Unirefund.PrintHelper.Tests/ApiTests.cs`

**Interfaces:**
- Consumes: all of the above.
- Produces (HTTP):
  - `GET /status` → `{ name, version, apiVersion: 2, features: ["search"] }`;
  - `GET /printers/search` → `{ printers: FoundPrinter[], searchedMs }`;
  - `POST /print` also accepts `{ printerId, lastAddress?, data, jobName? }` and returns `address` when the printer moved.
  - New error codes: `printer-not-found` (404), `not-a-label-printer` (400).
- Produces (C#): `HelperApi.Services(Network, Queue, Catalog, Scanner, Search, Identity)` and `HelperApi.Services.Default(HelperOptions, IQueuePrinter, IPrinterCatalog)`.

- [ ] **Step 1: Write the failing tests** — apply this change to `tests/Unirefund.PrintHelper.Tests/ApiTests.cs`:

```diff
diff --git a/tests/Unirefund.PrintHelper.Tests/ApiTests.cs b/tests/Unirefund.PrintHelper.Tests/ApiTests.cs
index 9c27a39..992aa8f 100644
--- a/tests/Unirefund.PrintHelper.Tests/ApiTests.cs
+++ b/tests/Unirefund.PrintHelper.Tests/ApiTests.cs
@@ -77,6 +77,10 @@ public sealed class ApiTests : IAsyncLifetime
     private readonly FakeNetworkPrinter _network = new();
     private readonly FakeQueuePrinter _queue = new();
     private readonly FakeScanner _scanner = new(new NetworkPrinterInfo("192.168.1.19", 9100));
+    private readonly FakeSearch _search = new(
+        PrinterResolverTests.Network("mac:78:5F:4C:00:55:67", "192.168.1.19"),
+        PrinterResolverTests.Network("mac:6C:3C:7C:F4:0F:48", "192.168.1.15", label: false));
+    private readonly FakeIdentity _identity = new(("mac:78:5F:4C:00:55:67", "192.168.1.19"));
     private WebApplication _app = null!;
     private HttpClient _client = null!;
 
@@ -87,7 +91,9 @@ public sealed class ApiTests : IAsyncLifetime
             _network,
             _queue,
             new FakeCatalog(new QueueInfo("ZDesigner ZT231-203dpi ZPL", "ZDesigner", "USB001")),
-            _scanner);
+            _scanner,
+            _search,
+            _identity);
         _app = HelperApi.Build(options, services, b => b.WebHost.UseTestServer());
         await _app.StartAsync();
         _client = _app.GetTestClient();
@@ -120,7 +126,8 @@ public sealed class ApiTests : IAsyncLifetime
         Assert.Equal(HttpStatusCode.OK, response.StatusCode);
         Assert.Equal(Portal, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
         var status = await response.Content.ReadFromJsonAsync<StatusResponse>();
-        Assert.Equal(new StatusResponse("Unirefund Print Helper", "1.0.0", 1), status);
+        Assert.Equal(("Unirefund Print Helper", "1.0.0", 2), (status!.Name, status.Version, status.ApiVersion));
+        Assert.Equal(["search"], status.Features);
     }
 
     [Theory]
@@ -333,6 +340,78 @@ public sealed class ApiTests : IAsyncLifetime
         Assert.Equal("printer-unreachable", body.RootElement.GetProperty("error").GetProperty("code").GetString());
     }
 
+    [Fact]
+    public async Task Search_lists_found_printers_without_internal_fields()
+    {
+        var response = await _client.SendAsync(Request(HttpMethod.Get, "/printers/search"));
+
+        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
+        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
+        var first = body.RootElement.GetProperty("printers")[0];
+        Assert.Equal("mac:78:5F:4C:00:55:67", first.GetProperty("id").GetString());
+        Assert.True(first.GetProperty("labelPrinter").GetBoolean());
+        Assert.Equal("192.168.1.19", first.GetProperty("address").GetProperty("host").GetString());
+        Assert.False(first.TryGetProperty("mac", out _));
+        Assert.False(first.TryGetProperty("diagnostics", out _));
+        Assert.Equal(42, body.RootElement.GetProperty("searchedMs").GetInt64());
+    }
+
+    [Fact]
+    public async Task Prints_to_a_found_printer_by_id()
+    {
+        var job = new { printerId = "mac:78:5F:4C:00:55:67", lastAddress = new { host = "192.168.1.19", port = 9100 }, data = "^XA^XZ" };
+
+        var response = await _client.SendAsync(Request(HttpMethod.Post, "/print", json: job));
+
+        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
+        Assert.Equal("192.168.1.19", Assert.Single(_network.Sent).Host);
+        var result = await response.Content.ReadFromJsonAsync<PrintResult>();
+        Assert.Null(result!.Address);
+    }
+
+    [Fact]
+    public async Task Prints_to_a_moved_printer_and_returns_its_new_address()
+    {
+        _search.NextResult = [PrinterResolverTests.Network("mac:78:5F:4C:00:55:67", "192.168.1.23")];
+        var job = new { printerId = "mac:78:5F:4C:00:55:67", lastAddress = new { host = "192.168.1.40", port = 9100 }, data = "^XA^XZ" };
+
+        var response = await _client.SendAsync(Request(HttpMethod.Post, "/print", json: job));
+
+        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
+        Assert.Equal("192.168.1.23", Assert.Single(_network.Sent).Host);
+        var result = await response.Content.ReadFromJsonAsync<PrintResult>();
+        Assert.Equal("192.168.1.23", result!.Address!.Host);
+    }
+
+    [Theory]
+    [InlineData("mac:00:07:4D:00:00:99", 404, "printer-not-found")]
+    [InlineData("mac:6C:3C:7C:F4:0F:48", 400, "not-a-label-printer")]
+    [InlineData("whatever", 400, "invalid-target")]
+    public async Task Refuses_printer_ids_it_cannot_print_to(string printerId, int status, string code)
+    {
+        await _client.SendAsync(Request(HttpMethod.Get, "/printers/search"));
+        _search.NextResult = [];
+        var job = new { printerId, data = "^XA^XZ" };
+
+        var response = await _client.SendAsync(Request(HttpMethod.Post, "/print", json: job));
+
+        Assert.Equal(status, (int)response.StatusCode);
+        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
+        Assert.Equal(code, body.RootElement.GetProperty("error").GetProperty("code").GetString());
+        Assert.Empty(_network.Sent);
+    }
+
+    [Fact]
+    public async Task Prints_to_a_windows_printer_by_id()
+    {
+        var job = new { printerId = "queue:ZDesigner ZT231-203dpi ZPL", data = "^XA^XZ" };
+
+        var response = await _client.SendAsync(Request(HttpMethod.Post, "/print", json: job));
+
+        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
+        Assert.Equal("ZDesigner ZT231-203dpi ZPL", Assert.Single(_queue.Sent).Queue);
+    }
+
     private static WebApplication BuildWithThrowingCatalog()
     {
         var options = new HelperOptions { Version = "1.0.0", MaxBodyBytes = 1024 };
@@ -340,7 +419,9 @@ public sealed class ApiTests : IAsyncLifetime
             new FakeNetworkPrinter(),
             new FakeQueuePrinter(),
             new ThrowingCatalog(),
-            new FakeScanner(new NetworkPrinterInfo("192.168.1.19", 9100)));
+            new FakeScanner(new NetworkPrinterInfo("192.168.1.19", 9100)),
+            new FakeSearch(),
+            new FakeIdentity());
         return HelperApi.Build(options, services, b => b.WebHost.UseTestServer());
     }
 }
@@ -353,7 +434,7 @@ public class StartupTests
         using var squatter = new TcpListener(IPAddress.Loopback, 0);
         squatter.Start();
         var port = ((IPEndPoint)squatter.LocalEndpoint).Port;
-        var services = new HelperApi.Services(new FakeNetworkPrinter(), new FakeQueuePrinter(), new FakeCatalog(), new FakeScanner());
+        var services = new HelperApi.Services(new FakeNetworkPrinter(), new FakeQueuePrinter(), new FakeCatalog(), new FakeScanner(), new FakeSearch(), new FakeIdentity());
         await using var app = HelperApi.Build(new HelperOptions { Port = port }, services);
 
         await Assert.ThrowsAnyAsync<IOException>(() => app.StartAsync());
@@ -369,7 +450,7 @@ public class KestrelLimitTests
         probe.Start();
         var port = ((IPEndPoint)probe.LocalEndpoint).Port;
         probe.Stop();
-        var services = new HelperApi.Services(new FakeNetworkPrinter(), new FakeQueuePrinter(), new FakeCatalog(), new FakeScanner());
+        var services = new HelperApi.Services(new FakeNetworkPrinter(), new FakeQueuePrinter(), new FakeCatalog(), new FakeScanner(), new FakeSearch(), new FakeIdentity());
         await using var app = HelperApi.Build(new HelperOptions { Port = port, MaxBodyBytes = 1024 }, services);
         await app.StartAsync();
         using var client = new HttpClient();
```

- [ ] **Step 2: Run them and watch them fail**

Run: `dotnet test PrintHelper.slnx --filter "FullyQualifiedName~ApiTests"`
Expected: the build fails: `HelperApi.Services` has no 6-argument constructor and `StatusResponse` has no `Features`.

- [ ] **Step 3: Write the implementation**

Replace `src/Unirefund.PrintHelper.Core/Api/Contracts.cs` with:

```csharp
using Unirefund.PrintHelper.Core.Discovery;
using Unirefund.PrintHelper.Core.Printing;

namespace Unirefund.PrintHelper.Core.Api;

public sealed record StatusResponse(string Name, string Version, int ApiVersion, IReadOnlyList<string> Features);

public sealed record PrintersResponse(IReadOnlyList<QueueInfo> Queues, IReadOnlyList<NetworkPrinterInfo> Network);

public sealed record SearchResponse(IReadOnlyList<FoundPrinter> Printers, long SearchedMs);

public sealed record PrintTarget(string? Kind, string? Host, int? Port, string? Name);

/// <summary>Either a raw <see cref="Target"/> (API v1) or a <see cref="PrinterId"/> from a search (API v2).</summary>
public sealed record PrintRequest(
    PrintTarget? Target,
    string? Data,
    string? JobName,
    string? PrinterId = null,
    PrinterAddress? LastAddress = null);

/// <summary><see cref="Address"/> is set when the printer was re-found at a new address.</summary>
public sealed record PrintResult(bool Ok, int Bytes, long Ms, PrinterAddress? Address = null);

public sealed record ErrorDetail(string Code, string Message);

public sealed record ErrorResponse(bool Ok, ErrorDetail Error)
{
    public static ErrorResponse Of(string code, string message) => new(false, new ErrorDetail(code, message));
}
```

Replace `src/Unirefund.PrintHelper.Core/Api/HelperApi.cs` with:

```csharp
using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
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
    public const int ApiVersion = 2;

    /// <summary>What this build can do; the web turns each feature on only when it is listed.</summary>
    public static readonly IReadOnlyList<string> Features = ["search"];

    public sealed record Services(
        INetworkPrinter Network,
        IQueuePrinter Queue,
        IPrinterCatalog Catalog,
        INetworkScanner Scanner,
        IPrinterSearch Search,
        IIdentityCheck Identity)
    {
        /// <summary>The real network pieces around a platform's own queue printer and catalog.</summary>
        public static Services Default(HelperOptions options, IQueuePrinter queue, IPrinterCatalog catalog)
        {
            var ports = new TcpPortProbe();
            var neighbours = new ArpNeighbourTable();
            var zebra = new TcpZebraProbe();
            var search = new PrinterSearch(options, new SearchSources(
                NetworkAdapters.List,
                ports,
                new UdpSnmpClient(),
                new UdpZebraDiscovery(),
                neighbours,
                zebra,
                new HttpTitleReader(new HttpClient()),
                catalog));
            return new Services(
                new TcpNetworkPrinter(options.PrinterTimeout),
                queue,
                catalog,
                new SubnetScanner(options),
                search,
                new PrinterIdentity(ports, neighbours, zebra, options));
        }
    }

    /// <summary>
    /// The helper's whole HTTP surface on 127.0.0.1. Tests pass a `configure`
    /// that swaps Kestrel for TestServer; the tray app adds file logging there.
    /// </summary>
    public static WebApplication Build(
        HelperOptions options,
        Services services,
        Action<WebApplicationBuilder>? configure = null)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            ContentRootPath = AppContext.BaseDirectory,
            EnvironmentName = "Production",
        });
        builder.WebHost.ConfigureKestrel(kestrel =>
        {
            kestrel.Listen(IPAddress.Loopback, options.Port);
            kestrel.Limits.MaxRequestBodySize = options.MaxBodyBytes;
        });
        configure?.Invoke(builder);

        var app = builder.Build();
        var policy = new RequestPolicy(options);
        var locks = new TargetLocks();
        var resolver = new PrinterResolver(services.Search, services.Identity, services.Catalog, options);
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

        app.MapGet("/status", () => Results.Json(new StatusResponse(Name, options.Version, ApiVersion, Features)));

        app.MapGet("/printers/search", async (CancellationToken ct) =>
        {
            var result = await services.Search.SearchAsync(TimeSpan.Zero, ct);
            // What each printer said, never label data: lets us read a client's search from their log.
            foreach (var p in result.Printers)
            {
                log.LogInformation("Found {Id} ({Connection}, label printer: {Label}) {Maker} {Model} at {Address}: {Diagnostics}",
                    p.Id, p.Connection, p.LabelPrinter, p.Maker, p.Model, p.Address, p.Diagnostics);
            }
            foreach (var host in result.Unreachable)
            {
                log.LogWarning("Label printer not taking print jobs: {Host}", host);
            }
            log.LogInformation("Search found {Count} printers in {Ms} ms", result.Printers.Count, result.SearchedMs);
            return Results.Json(new SearchResponse(result.Printers, result.SearchedMs));
        });

        app.MapGet("/printers", async (HttpRequest request, CancellationToken ct) =>
        {
            var scan = request.Query["scan"] == "1";
            IReadOnlyList<QueueInfo> queues;
            try
            {
                queues = services.Catalog.ListQueues();
            }
            catch (Exception ex)
            {
                log.LogWarning(ex, "Could not list installed printers");
                queues = [];
            }
            IReadOnlyList<NetworkPrinterInfo> network = scan ? await services.Scanner.ScanAsync(ct) : [];
            return Results.Json(new PrintersResponse(queues, network));
        });

        app.MapPost("/print", async (HttpRequest request, CancellationToken ct) =>
        {
            IResult Refuse(int status, string code, string message)
            {
                log.LogWarning("Refused print: {Code} {Message}", code, message);
                return Error(status, code, message);
            }

            PrintRequest? body;
            try
            {
                body = await request.ReadFromJsonAsync<PrintRequest>(ct);
            }
            catch (BadHttpRequestException ex) when (ex.StatusCode == StatusCodes.Status413PayloadTooLarge)
            {
                return Refuse(413, "too-large", "Request body too large.");
            }
            catch (Exception ex) when (ex is JsonException or InvalidOperationException)
            {
                return Refuse(400, "bad-request", "Body must be a JSON print request.");
            }

            var data = body?.Data;
            if (string.IsNullOrEmpty(data) || !data.Contains("^XA", StringComparison.Ordinal))
            {
                return Refuse(400, "bad-request", "Data must be a ZPL job.");
            }

            var bytes = Encoding.Latin1.GetBytes(data);
            var jobName = string.IsNullOrWhiteSpace(body?.JobName) ? "Unirefund stickers" : body!.JobName!;
            var timer = Stopwatch.StartNew();
            var described = "(unknown)";
            PrintDestination? destination = null;
            try
            {
                destination = string.IsNullOrWhiteSpace(body?.PrinterId)
                    ? RawDestination(body?.Target, services.Catalog, options)
                    : await resolver.ResolveAsync(body!.PrinterId!, body.LastAddress, ct);
                described = destination.Kind == "queue"
                    ? $"queue '{destination.Queue}'"
                    : $"{destination.Host}:{destination.Port}";

                // The request's token only bounds the wait for the lock: once a job is
                // being sent, a browser that gives up must not cut it off half-way.
                if (destination.Kind == "queue")
                {
                    var queue = destination.Queue!;
                    await locks.RunAsync($"queue:{queue}", async () =>
                    {
                        await services.Queue.SendAsync(queue, jobName, bytes, CancellationToken.None);
                        return true;
                    }, ct);
                }
                else
                {
                    var (host, port) = (destination.Host!, destination.Port);
                    await locks.RunAsync($"net:{host}", async () =>
                    {
                        await services.Network.SendAsync(host, port, bytes, CancellationToken.None);
                        return true;
                    }, ct);
                }
            }
            catch (PrintRefusedException ex)
            {
                return Refuse(ex.Status, ex.Code, ex.Message);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                log.LogWarning("Print to {Target} cancelled by the client before it started", described);
                return Error(400, "cancelled", "The request was cancelled.");
            }
            catch (PrinterTimeoutException ex)
            {
                log.LogWarning("Print to {Target} timed out: {Message}", described, ex.Message);
                return Error(504, "printer-timeout", ex.Message);
            }
            catch (QueueNotFoundException ex)
            {
                return Refuse(404, "queue-not-found", ex.Message);
            }
            catch (PrinterUnreachableException ex)
            {
                log.LogWarning("Print to {Target} failed: {Message}", described, ex.Message);
                return Error(502, "printer-unreachable", ex.Message);
            }

            if (destination.MovedTo is { } moved)
            {
                log.LogInformation("Printer {Id} moved to {Host}", body!.PrinterId, moved.Host);
            }
            log.LogInformation("Printed {Bytes} bytes to {Target} in {Ms} ms",
                bytes.Length, described, timer.ElapsedMilliseconds);
            return Results.Json(new PrintResult(true, bytes.Length, timer.ElapsedMilliseconds, destination.MovedTo));
        });

        return app;
    }

    /// <summary>API v1: the web names the address or the installed printer itself.</summary>
    private static PrintDestination RawDestination(PrintTarget? target, IPrinterCatalog catalog, HelperOptions options)
    {
        switch (target?.Kind)
        {
            case "network":
                var port = target.Port ?? options.PrinterPort;
                if (target.Host is null || !TargetPolicy.IsPrivateIPv4(target.Host) || port != options.PrinterPort)
                {
                    throw new PrintRefusedException(400, "invalid-target", $"Printer must be a private IPv4 address on port {options.PrinterPort}.");
                }
                return new PrintDestination("network", target.Host, port, null, null);
            case "queue":
                return new PrintDestination("queue", null, 0, PrinterResolver.FindQueue(catalog, target.Name ?? "").Name, null);
            default:
                throw new PrintRefusedException(400, "invalid-target", "Target kind must be 'network' or 'queue'.");
        }
    }

    private static IResult Error(int status, string code, string message) =>
        Results.Json(ErrorResponse.Of(code, message), statusCode: status);
}
```

Wire both apps to the shared defaults:

```diff
diff --git a/src/Unirefund.PrintHelper/Program.cs b/src/Unirefund.PrintHelper/Program.cs
index c240c43..b8ddc92 100644
--- a/src/Unirefund.PrintHelper/Program.cs
+++ b/src/Unirefund.PrintHelper/Program.cs
@@ -65,11 +65,7 @@ internal static class Program
             Version = version,
             AllowedOrigins = [.. HelperOptions.DefaultOrigins, .. settings.ExtraAllowedOrigins],
         };
-        var services = new HelperApi.Services(
-            new TcpNetworkPrinter(options.PrinterTimeout),
-            new WinSpoolQueuePrinter(),
-            new WmiPrinterCatalog(),
-            new SubnetScanner(options));
+        var services = HelperApi.Services.Default(options, new WinSpoolQueuePrinter(), new WmiPrinterCatalog());
 
         WebApplication? app = null;
         string? startError = null;
```

```diff
diff --git a/src/Unirefund.PrintHelper.Mac/Program.cs b/src/Unirefund.PrintHelper.Mac/Program.cs
index 7e32c3c..504ee66 100644
--- a/src/Unirefund.PrintHelper.Mac/Program.cs
+++ b/src/Unirefund.PrintHelper.Mac/Program.cs
@@ -63,11 +63,7 @@ internal static class Program
             Version = version,
             AllowedOrigins = [.. HelperOptions.DefaultOrigins, .. settings.ExtraAllowedOrigins],
         };
-        var services = new HelperApi.Services(
-            new TcpNetworkPrinter(options.PrinterTimeout),
-            new CupsQueuePrinter(),
-            new CupsPrinterCatalog(),
-            new SubnetScanner(options));
+        var services = HelperApi.Services.Default(options, new CupsQueuePrinter(), new CupsPrinterCatalog());
 
         WebApplication? app = null;
         string? startError = null;
```

Bump the version:

```diff
diff --git a/Directory.Build.props b/Directory.Build.props
index ae3a1c3..9903487 100644
--- a/Directory.Build.props
+++ b/Directory.Build.props
@@ -1,6 +1,6 @@
 <Project>
   <PropertyGroup>
-    <Version>1.0.0</Version>
+    <Version>1.1.0</Version>
     <Company>Unirefund</Company>
     <Product>Unirefund Print Helper</Product>
     <Nullable>enable</Nullable>
```

Record the new invariants:

```diff
diff --git a/AGENTS.md b/AGENTS.md
index 184c2ba..f1183eb 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -11,7 +11,7 @@ workspace docs repo.
 
 | Path | Holds |
 |---|---|
-| `src/Unirefund.PrintHelper.Core` | HTTP API (`Api/HelperApi.cs`), security rules, TCP and CUPS printing, discovery — cross-platform (`net10.0`), everything testable |
+| `src/Unirefund.PrintHelper.Core` | HTTP API (`Api/HelperApi.cs`), security rules, TCP and CUPS printing, printer search (`Discovery/`: adapters, SNMP, Zebra discovery and commands, neighbour table, classifier, re-finding) — cross-platform (`net10.0`), everything testable |
 | `src/Unirefund.PrintHelper` | WinForms tray app: single instance, logging, autostart, starts the API; owns the Windows-only WMI catalog and winspool printer (`WindowsSpooler.cs`) |
 | `src/Unirefund.PrintHelper.Mac` | Avalonia menu bar app: the same, with CUPS queues, a LaunchAgent for Open at Login, logs in `~/Library/Logs/Unirefund/PrintHelper` |
 | `tests/Unirefund.PrintHelper.Tests` | xUnit; the API is tested in-process through TestServer |
@@ -64,7 +64,15 @@ CI and admin (all-users) installs of Inno Setup use
   only from `%LOCALAPPDATA%\Unirefund\PrintHelper\settings.json`
   (macOS: `~/Library/Application Support/Unirefund/PrintHelper/settings.json`).
 - Print targets: **private IPv4 on port 9100**, or a queue that exists on the
-  PC. The helper must never become a tunnel to arbitrary hosts.
+  PC. By printer id (API v2), only what the helper's own search found
+  (`PrinterResolver`). The helper must never become a tunnel to arbitrary hosts.
+- **The search never sends a byte to an unrecognised device.** Only a device
+  already known to be a Zebra (hardware address, SNMP description or discovery
+  reply) is asked `~HI` and `getvar`, never `setvar` or `do`: an office printer
+  on port 9100 prints whatever it receives as a page.
+- **One search at a time** (`PrinterSearch`): a request that arrives during a
+  search shares its result. Virtual adapters (Hyper-V, WSL, VPN) are never
+  searched.
 - **One job at a time per printer** (`TargetLocks`): the next job starts only
   after the previous one was handed over and the printer closed its side, or
   2 s passed. Some printers silently drop a job that arrives while they are
```

- [ ] **Step 4: Run everything**

Run: `dotnet test PrintHelper.slnx`. Expected: 181 passed, 0 failed.
Run: `dotnet build PrintHelper.slnx`. Expected: 0 warnings, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/Unirefund.PrintHelper.Core/Api src/Unirefund.PrintHelper/Program.cs src/Unirefund.PrintHelper.Mac/Program.cs Directory.Build.props AGENTS.md tests/Unirefund.PrintHelper.Tests/ApiTests.cs
git commit -F - <<'EOF'
feat: API version 2 - printer search and printing by id

GET /printers/search lists what the helper found, and POST /print takes a
printer id from it, re-finding a printer that moved and reporting its new
address. Status reports apiVersion 2 with the features list. Every found
printer is logged with what it said, never label data. Version 1.1.0.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```


### Task 9: Live check on the office network (controller, with the user)

**Files:** none in the repo. The harness lives in the controller's scratchpad.

This needs the office LAN with the Argox (192.168.1.19) and the Canon (192.168.1.15). It sends **no print data**. The only bytes sent to printers are the port check, SNMP and, for Zebras only, `~HI`/`getvar`.

- [ ] **Step 1: The harness.** A console project in the scratchpad (`search-live`) referencing the worktree's Core project:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="C:\unirefund\print-helper-wt-printer-search\src\Unirefund.PrintHelper.Core\Unirefund.PrintHelper.Core.csproj" />
  </ItemGroup>
</Project>
```

```csharp
using System.Text.Json;
using Unirefund.PrintHelper.Core;
using Unirefund.PrintHelper.Core.Api;
using Unirefund.PrintHelper.Core.Discovery;
using Unirefund.PrintHelper.Core.Printing;

var services = HelperApi.Services.Default(new HelperOptions(), new NoQueues(), new NoQueues());
foreach (var a in NetworkAdapters.List()) Console.WriteLine($"adapter {a.Name} | {a.Address}/{a.Mask} | searchable={NetworkAdapters.IsSearchable(a)}");
var result = await services.Search.SearchAsync(TimeSpan.Zero, CancellationToken.None);
Console.WriteLine($"searched in {result.SearchedMs} ms");
foreach (var p in result.Printers) Console.WriteLine($"{JsonSerializer.Serialize(p, JsonSerializerOptions.Web)}\n   diag: {p.Diagnostics}");
foreach (var u in result.Unreachable) Console.WriteLine($"unreachable: {u}");
var argox = result.Printers.FirstOrDefault(p => p.Maker == "Argox");
if (argox is not null)
{
    Console.WriteLine($"identity at .19: {await services.Identity.IsAtAsync(argox.Id, new PrinterAddress("192.168.1.19", 9100), CancellationToken.None)}");
    Console.WriteLine($"identity at .15: {await services.Identity.IsAtAsync(argox.Id, new PrinterAddress("192.168.1.15", 9100), CancellationToken.None)}");
}

sealed class NoQueues : IQueuePrinter, IPrinterCatalog
{
    public IReadOnlyList<QueueInfo> ListQueues() => [];
    public Task SendAsync(string queueName, string jobName, ReadOnlyMemory<byte> data, CancellationToken ct) => throw new NotSupportedException();
}
```

- [ ] **Step 2: Run it** with `dotnet run`. Expected:
  - only `Ethernet` is `searchable=True`; the Hyper-V, WSL and Bluetooth adapters are false;
  - the search takes under 10 s;
  - first line: `mac:78:5F:4C:00:55:67`, `labelPrinter: true`, `maker: Argox`, `model: O4`, `recognisedBy: [port, snmp, mac]`;
  - second line: `mac:6C:3C:7C:F4:0F:48`, `labelPrinter: false`, `model: Canon MF460 Series /P`;
  - `identity at .19: True` and `identity at .15: False`.
- [ ] **Step 3: Ask the user** whether a Windows Firewall dialog appeared during the run (Review Focus 1), and that nothing printed on either printer.
- [ ] **Step 4: Record** the output and the answers in the ledger. A difference from Step 2 is a finding for the final review, not something to patch silently.

## After this plan

- **CI:** pushing `feat/printer-search` runs `build` and `build-macos`; both must pass before the PR.
- **The installer and `.pkg`** come from CI (user rule: no local artifact builds).
- **Web:** the sticker dialog's printer sheet consumes API v2 in the separate plan `2026-10-26-printer-setup-web.md`. It gates every new control on `features` containing `"search"`.
