# Driverless USB Printing (helper 1.2.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Zebra or Argox plugged into the PC by USB, with no vendor driver, appears in `GET /printers/search` as one `"usb"` card. `POST /print` with its `usb:` id prints to it, and `/status` lists `"usb"`.

**Architecture:**
- **Core (cross-platform):**
  - `Discovery/Usb.cs` parses the IEEE 1284 ID and the device path into a stable id;
  - `Printing/UsbPrinting.cs` defines `IUsbPorts` and writes a job in 64 KB chunks;
  - `Discovery/Zebra.cs` asks its read-only questions over any `Stream`, so USB reuses them.
- **Windows** (`src/Unirefund.PrintHelper/UsbPrintPorts.cs`):
  - enumerates `GUID_DEVINTERFACE_USBPRINT` with SetupDi;
  - reads the 1284 ID with `IOCTL_USBPRINT_GET_1284_ID`;
  - opens the device as an overlapped `FileStream`.
- **macOS:** gets `NoUsbPorts`, so `"usb"` isn't listed there (spec §2: driverless USB is Windows-only).
- **Search, resolver and API:** each gains a `usb` branch beside `network` and `queue`.

**Tech Stack:** .NET 10, C# (`net10.0` Core, `net10.0-windows` app), xUnit, P/Invoke into setupapi and kernel32. No new packages.

**Spec:** `docs/superpowers/specs/2026-10-14-printer-discovery-design.md`:
- §5 USB without a driver;
- §6 the `usb` feature and `printer-busy` (409);
- §7 security rules;
- §10 USB tests;
- §11 verification.

The companion web plan is `2026-10-26-usb-printing-web.md`.

**Verified on hardware before writing (2026-10-26).** The office Argox O4-250 was on USB with its vendor driver and driver-store package removed. The spike is in the session scratchpad, `usb-spike/`.
- **Enumeration:** Windows bound it to the in-box usbprint, with no printer queue created: `USB\VID_1664&PID_0D10\80384F461093`. SetupDi returned `\\?\usb#vid_1664&pid_0d10#80384f461093#{28d78fad-5a12-11d1-ae5b-0000f803a8c2}`.
- **1284 ID:** `IOCTL_USBPRINT_GET_1284_ID` returned 70 bytes: `46 46` + `MFG:ARGOX ;CMD:PPLZ;MDL:O4-250 PPLZ;CLS:PRINTER;DES:ARGOX O4-250 PPL`.
  - The 2-byte "length prefix" is the count written into **both** bytes, and both are printable.
  - The device also truncates its own `DES`.
- **Reads:** an overlapped `FileStream` read that nothing answers is cancelled cleanly by its token (1515 ms for a 1500 ms timeout).
- **Writes:** a **zero-length write fails** with ERROR_NO_SYSTEM_RESOURCES (1450). A 112 KB artwork label printed correctly in two chunks (109 ms + 477 ms).
- **Shared opens:** two handles open at once succeed. usbprint allows shared opens, so a "busy" open error is unlikely in practice.
- **Elevation:** a non-elevated session opened and printed. A true standard-user account was not tried.

## Global Constraints

- **Base:** `main` after helper PR #5 (1.1.1) merges. Work in branch `feat/usb-printing`, in the worktree `C:\unirefund\print-helper-wt-usb`. Set `Directory.Build.props` `<Version>` to `1.2.0`.
- **Feature flag:** `/status` `features` is `["search", "usb"]` when the platform has USB support (Windows), and `["search"]` otherwise. `apiVersion` stays 2.
- **Printer id:** `usb:<VID>:<PID>:<serial>`, with VID and PID as 4 upper-case hex digits and the serial upper-cased (`usb:1664:0D10:80384F461093`).
  - A device whose path has no serial segment (an instance id containing `&`) gets `usb:<VID>:<PID>:#<instance segment>`. It is port-bound (spec §5.1).
- **Probing rule (spec §7.5):**
  - only a USB device known to be a Zebra (VID `0x0A5F`, or 1284 `MFG` containing "Zebra") is asked `~HI` and `getvar`;
  - no other USB device is ever sent a byte during a search;
  - never `setvar` or `do`.
- **Writes:** chunks of 65,536 bytes, an inactivity timeout of 10 s per chunk, and **never a zero-length write**.
- **Locks:** one job at a time per printer id, through the existing `TargetLocks` with key `usb:<printer id>`.
- **Security (spec §7.2):** a `usb:` id prints only to a device found by enumerating `GUID_DEVINTERFACE_USBPRINT`. The request can never carry a device path.
- **Errors:**
  - a device that isn't present → `printer-unreachable` (502);
  - a busy open with no fallback queue → `printer-busy` (409);
  - a chunk timeout → `printer-timeout` (504).
- **Conventions:**
  - match the surrounding code: primary constructors, records, file-scoped namespaces;
  - comments sparse, for the non-obvious "why";
  - `dotnet build PrintHelper.slnx -c Release` gives 0 warnings;
  - log with `ILogger`, printing device strings through `Printable`.
- **Commits:** one per task, message via a quoted heredoc, ending with the Co-Authored-By trailer.

## Review Focus

1. **Unplugged between search and print** → `printer-unreachable`. The web says "The printer isn't connected. Check the USB cable." Pinned in Task 5: `A_usb_printer_that_is_gone_is_unreachable`.
2. **Unplugged mid-job** (a write fails or stalls) → `printer-unreachable` or `printer-timeout`, never a hang. Pinned in Task 2: `A_write_that_stalls_times_out` and `A_failed_write_is_unreachable`.
3. **An Argox in PPLA or PPLB mode** (1284 `CMD` without ZPL) is not offered as a label printer, because it would print ZPL as text. Pinned in Task 4: `An_argox_not_in_zpl_mode_is_not_a_label_printer`.
4. **The same model with a vendor driver installed** (a Windows queue on `USB00x`) shows one card, not two. Pinned in Task 4: `A_windows_printer_on_the_usb_device_is_listed_once`.
5. **Re-plugged into another USB port** keeps its id, so the saved printer still prints. Pinned in Task 1: `The_id_ignores_the_usb_port` (two paths differing only in hub position give the same id). Checked live in Task 6.

---

### Task 0: Worktree and baseline

- [ ] `git -C C:/unirefund/print-helper fetch origin`. Confirm that `origin/main` contains the PR #5 merge (`gh pr view 5 --json state` reads `MERGED`). If it doesn't, stop and report.
- [ ] `git -C C:/unirefund/print-helper worktree add ../print-helper-wt-usb -b feat/usb-printing origin/main`.
- [ ] Record the baselines with `dotnet test PrintHelper.slnx` (passed count) and `dotnet build PrintHelper.slnx -c Release` (0 warnings).

### Task 1: The 1284 ID and the USB printer id

**Files:**
- Create: `src/Unirefund.PrintHelper.Core/Discovery/Usb.cs`
- Modify: `src/Unirefund.PrintHelper.Core/Discovery/Makers.cs` (add `FromUsbVendor`)
- Test: `tests/Unirefund.PrintHelper.Tests/UsbTests.cs`

**Interfaces:**
- Produces:
  - `public sealed record Ieee1284Id(string? Manufacturer, string? Model, string? CommandSet, string Raw)`.
  - `public static class Ieee1284 { public static Ieee1284Id? Parse(ReadOnlySpan<byte> reply); }`. `reply` is exactly the bytes the IOCTL returned.
  - `public sealed record UsbDevice(string Path, int VendorId, int ProductId, string? Serial, Ieee1284Id? Id)`.
  - `public static partial class UsbPaths { public static UsbDevice? FromPath(string path, Ieee1284Id? id); public static string PrinterId(UsbDevice device); }`.
  - `Makers.FromUsbVendor(int vendorId)`: `0x0A5F` → `Makers.Zebra`, `0x1664` → `Makers.Argox`, otherwise `null`.

**Rules:**
- **Parsing:**
  - always skip the first 2 bytes, whatever their value;
  - decode the rest as Latin-1 and cut at the first NUL;
  - split on `;`, then split each pair at its first `:`. Keys are case-insensitive: `MFG`/`MANUFACTURER`, `MDL`/`MODEL`, `CMD`/`COMMAND SET`;
  - trim values;
  - ignore a last pair with no `:`;
  - `Raw` is the decoded text, trimmed;
  - fewer than 3 bytes, or no recognised key, gives `null`.
- **Device path:** `^\\\\\?\\usb#vid_([0-9a-f]{4})&pid_([0-9a-f]{4})[^#]*#([^#]+)#\{`, case-insensitive. A third group containing `&` is an instance id, not a serial. A path that doesn't match gives `null`.

- [ ] **Step 1: Write the failing tests** in `UsbTests.cs`:
  - `Parses_the_office_argox` uses the real capture: bytes `0x46, 0x46` + ASCII `MFG:ARGOX ;CMD:PPLZ;MDL:O4-250 PPLZ;CLS:PRINTER;DES:ARGOX O4-250 PPL`. It expects `("ARGOX", "O4-250 PPLZ", "PPLZ")`.
  - `Skips_the_length_prefix_in_either_byte_order` uses prefixes `00 2A` and `2A 00` before `MFG:Zebra Technologies;CMD:ZPL;MDL:ZT231;`. Both give `("Zebra Technologies", "ZT231", "ZPL")`.
  - `Reads_long_key_names` uses `MANUFACTURER:Zebra;COMMAND SET:ZPL;MODEL:ZT411;`.
  - `Stops_at_a_nul_and_ignores_a_cut_off_pair` uses `MFG:X;MDL:Y;DE` + `\0` + garbage, giving Manufacturer `X`, Model `Y`.
  - `Gives_nothing_for_an_empty_or_unknown_reply` covers `[]`, `[0,0]` and `00 05 hello`.
  - `Reads_the_office_argox_path` gives `(0x1664, 0x0D10, "80384f461093")` and id `usb:1664:0D10:80384F461093`.
  - `The_id_ignores_the_usb_port`: the same serial under two different paths gives the same id.
  - `A_device_without_a_serial_is_port_bound` uses `\\?\usb#vid_0a5f&pid_0181#7&227c4e24&0&1#{28d78fad-…}`, giving id `usb:0A5F:0181:#7&227c4e24&0&1`.
  - `Ignores_a_path_that_is_not_usb` covers `\\?\hid#…` and `""`.
  - `Knows_the_label_printer_vendors` covers `0x0A5F` → Zebra, `0x1664` → Argox and `0x04A9` → null.
- [ ] **Step 2:** `dotnet test PrintHelper.slnx --filter UsbTests` fails to compile (the types don't exist yet).
- [ ] **Step 3:** Implement `Usb.cs` and `Makers.FromUsbVendor` to the rules above, with a `[GeneratedRegex]` for the path.
- [ ] **Step 4:** `dotnet test PrintHelper.slnx` passes: all tests, with 0 warnings.
- [ ] **Step 5:** Commit: `feat(usb): read a USB printer's 1284 ID and give it a stable id`.

### Task 2: Writing to a USB printer

**Files:**
- Create:
  - `src/Unirefund.PrintHelper.Core/Printing/UsbPrinting.cs`
  - `src/Unirefund.PrintHelper/UsbPrintPorts.cs`
- Test: `tests/Unirefund.PrintHelper.Tests/UsbPrintingTests.cs`

**Interfaces:**
- Consumes: `UsbDevice`, `UsbPaths.FromPath`, `Ieee1284.Parse` (Task 1).
- Produces:
  - `public interface IUsbPorts { bool Supported { get; } IReadOnlyList<UsbDevice> List(); Stream Open(string path); }`.
  - `public sealed class NoUsbPorts : IUsbPorts`:
    - `Supported` is false;
    - `List()` returns `[]`;
    - `Open` throws `PrinterUnreachableException`.
  - `public sealed class PrinterBusyException(string message) : Exception(message);`, in `Printers.cs` beside the other printer exceptions.
  - `public sealed class UsbPrinter(IUsbPorts ports, TimeSpan? chunkTimeout = null) { public Task SendAsync(string path, ReadOnlyMemory<byte> data, CancellationToken ct); }`. The default chunk timeout is 10 s.
  - `UsbPrintPorts : IUsbPorts` (Windows only, `Supported` true).

**Rules for `UsbPrinter.SendAsync`:**
- It opens through `ports.Open(path)` and writes 65,536-byte slices, each under its own timeout token.
- It skips the write when `data` is empty.
- It disposes the stream at the end.
- It maps errors:
  - a chunk token that fires → `PrinterTimeoutException`;
  - an `IOException` or `UnauthorizedAccessException` from `Open` with Win32 error 32 (sharing violation), 5 (access denied) or 170 (busy) → `PrinterBusyException`;
  - any other `IOException` or `UnauthorizedAccessException` from `Open` or a write → `PrinterUnreachableException`.
  - Read the Win32 code as `ex.HResult & 0xFFFF` when `(ex.HResult & 0xFFFF0000) == 0x80070000`; an `UnauthorizedAccessException` counts as 5.

- [ ] **Step 1: Write the failing tests.** `FakeUsbPorts` in the test file records every `Write` length and can throw on `Open` or stall a write. Tests:
  - `Writes_a_job_in_64_kb_chunks`: 150,000 bytes give writes of `[65536, 65536, 18928]`.
  - `Never_writes_zero_bytes`: an empty job opens nothing and writes nothing. The hardware rejects a 0-byte write with error 1450.
  - `A_write_that_stalls_times_out`: a stream whose `WriteAsync` waits for its token, with chunk timeout 50 ms, gives `PrinterTimeoutException`.
  - `A_failed_write_is_unreachable`: `WriteAsync` throws `new IOException("gone", unchecked((int)0x8007001F))` (ERROR_GEN_FAILURE) and gives `PrinterUnreachableException`.
  - `A_busy_open_is_busy`: `Open` throws `IOException` with HResult `0x80070020` (and, as a second case, `UnauthorizedAccessException`), giving `PrinterBusyException`.
  - `A_missing_device_is_unreachable`: `Open` throws `FileNotFoundException`, giving `PrinterUnreachableException`.
- [ ] **Step 2:** Run `dotnet test PrintHelper.slnx --filter UsbPrintingTests`. It must fail.
- [ ] **Step 3:** Implement `UsbPrinting.cs` (the interface, `NoUsbPorts`, `UsbPrinter`) to the rules.
- [ ] **Step 4: Implement `UsbPrintPorts`.** These calls were verified on the Argox; keep the values exactly:

```csharp
// GUID_DEVINTERFACE_USBPRINT and IOCTL_USBPRINT_GET_1284_ID (usbprint.h).
private static readonly Guid UsbPrintInterface = new("28D78FAD-5A12-11D1-AE5B-0000F803A8C2");
private const uint Get1284Id = 0x220034;
private const uint DigcfPresent = 0x2, DigcfDeviceInterface = 0x10;
private const int ErrorNoMoreItems = 259;

[StructLayout(LayoutKind.Sequential)]
private struct DeviceInterfaceData { public uint CbSize; public Guid InterfaceClassGuid; public uint Flags; public UIntPtr Reserved; }

[DllImport("setupapi.dll", SetLastError = true)]
private static extern IntPtr SetupDiGetClassDevsW(ref Guid classGuid, IntPtr enumerator, IntPtr parent, uint flags);
[DllImport("setupapi.dll", SetLastError = true)]
private static extern bool SetupDiEnumDeviceInterfaces(IntPtr set, IntPtr devInfo, ref Guid guid, uint index, ref DeviceInterfaceData data);
[DllImport("setupapi.dll", SetLastError = true)]
private static extern bool SetupDiGetDeviceInterfaceDetailW(IntPtr set, ref DeviceInterfaceData data, IntPtr detail, uint size, out uint required, IntPtr devInfo);
[DllImport("setupapi.dll", SetLastError = true)]
private static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
[DllImport("kernel32.dll", SetLastError = true)]
private static extern bool DeviceIoControl(SafeFileHandle device, uint code, IntPtr inBuffer, uint inSize, byte[] outBuffer, uint outSize, out uint returned, IntPtr overlapped);
```

**What `List()` does:**
- **Enumerate:** `SetupDiGetClassDevsW(…, DigcfPresent | DigcfDeviceInterface)` (an `INVALID_HANDLE_VALUE` result throws), then loop `SetupDiEnumDeviceInterfaces` until error 259.
- **Read each detail:** call `SetupDiGetDeviceInterfaceDetailW` twice:
  1. first with a null buffer, to get the `required` size;
  2. then allocate `required` bytes, write `cbSize` = `IntPtr.Size == 8 ? 8 : 6` at offset 0, call again, and read the path with `PtrToStringUni(buffer + 4)`.
- **Read the 1284 ID:** open a separate *non-overlapped* handle with `File.OpenHandle(path, FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite)`. Call `DeviceIoControl` with a 4,094-byte buffer, then pass `buffer[..returned]` to `Ieee1284.Parse`.
  - Build each device with `UsbPaths.FromPath(path, id)`, and skip a path that returns `null`.
  - A device whose IOCTL fails is still listed, with `Id: null`.
  - Each device is wrapped in try/catch, so one bad device never hides the others.
- **Finish:** always `SetupDiDestroyDeviceInfoList`.

**What `Open(path)` does:** `new FileStream(File.OpenHandle(path, FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite, FileOptions.Asynchronous), FileAccess.ReadWrite, 0, isAsync: true)`. The overlapped handle is what makes a pending read cancellable.

- [ ] **Step 5:** `dotnet test PrintHelper.slnx` passes, and `dotnet build PrintHelper.slnx -c Release` gives 0 warnings.
- [ ] **Step 6:** Commit: `feat(usb): print to a USB printer through Windows' own USB printer driver`.

### Task 3: Zebra questions over any stream

**Files:**
- Modify: `src/Unirefund.PrintHelper.Core/Discovery/Zebra.cs`
- Test: `tests/Unirefund.PrintHelper.Tests/ZebraTests.cs`

**Interfaces:**
- Consumes: `IUsbPorts` (Task 2).
- Produces:
  - `public static class ZebraQuestions { public static Task<ZebraInfo?> AskAsync(Stream stream, TimeSpan replyTimeout, CancellationToken ct); }`. This is the body of today's `TcpZebraProbe` after it connects: `~HI`, then the four getvars, with the same completeness rules and the same `ZebraInfo` construction.
  - `TcpZebraProbe` connects, then calls `ZebraQuestions.AskAsync` over its `NetworkStream`. Its behaviour is unchanged.
  - `public interface IUsbZebraProbe { Task<ZebraInfo?> QueryAsync(string devicePath, CancellationToken ct); }`.
  - `public sealed class UsbZebraProbe(IUsbPorts ports, TimeSpan? replyTimeout = null) : IUsbZebraProbe`. It opens the device, asks, and disposes it. Any `IOException`, `UnauthorizedAccessException` or a timeout gives `null`.

- [ ] **Step 1: Write the failing tests.**
  - `Asks_the_same_questions_over_any_stream` uses a scripted duplex `Stream` fake that answers `~HI` with the documented `\u0002ZT410-200dpi,V75.19.15Z,8,4096KB\u0003` and each getvar with a quoted value. It asserts the `ZebraInfo` fields, and that the bytes written are exactly `~HI` followed by four `! U1 getvar "…"\r\n` lines.
  - `A_silent_stream_gives_nothing`: a stream whose reads block until cancelled gives `null` within the reply timeout plus 500 ms.
  - The existing `TcpZebraProbe` tests (`FakeZebra`) still pass unchanged.
- [ ] **Step 2:** Run the tests and see them fail.
- [ ] **Step 3:** Extract `ZebraQuestions`, re-point `TcpZebraProbe` at it, and add `IUsbZebraProbe`/`UsbZebraProbe`.
- [ ] **Step 4:** `dotnet test PrintHelper.slnx` passes.
- [ ] **Step 5:** Commit: `refactor(zebra): ask the read-only questions over any stream, so USB can too`.

### Task 4: USB printers in the search

**Files:**
- Modify:
  - `src/Unirefund.PrintHelper.Core/Discovery/FoundPrinter.cs` (`DevicePath`, `PrinterClassifier.FromUsb`, `UsbQueueMatch`)
  - `src/Unirefund.PrintHelper.Core/Discovery/PrinterSearch.cs` (`SearchSources` and the listing)
  - `src/Unirefund.PrintHelper.Core/Api/HelperApi.cs` (`Services.Default` wiring only)
- Test:
  - `tests/Unirefund.PrintHelper.Tests/PrinterClassifierTests.cs`
  - `tests/Unirefund.PrintHelper.Tests/PrinterSearchTests.cs`

**Interfaces:**
- Consumes:
  - `UsbDevice`, `UsbPaths.PrinterId` and `Makers.FromUsbVendor` (Task 1);
  - `IUsbPorts` (Task 2);
  - `IUsbZebraProbe` (Task 3).
- Produces:
  - `FoundPrinter` gains `[JsonIgnore] public string? DevicePath { get; init; }`.
  - `public static FoundPrinter PrinterClassifier.FromUsb(UsbDevice device, ZebraInfo? zebra, QueueInfo? queue)`.
  - `public static class UsbQueueMatch { public static QueueInfo? For(UsbDevice device, string? model, IReadOnlyList<QueueInfo> queues); }`.
  - `SearchSources` gains `IUsbPorts? Usb = null` and `IUsbZebraProbe? UsbZebra = null`, as its last two parameters. `null` means no USB, so existing callers compile unchanged.
  - `Services.Default(HelperOptions, IQueuePrinter, IPrinterCatalog, ILoggerFactory?, IUsbPorts? usb = null)` uses `usb ?? new NoUsbPorts()`.

**How `FromUsb` classifies a device:**
- `Id` is `UsbPaths.PrinterId(device)`, and `Connection` is `"usb"`.
- `Maker` is `Makers.Zebra` if `zebra` is not null. Otherwise it's `Makers.FromUsbVendor(VendorId)`, then `Makers.FromDescription(Id?.Manufacturer)`.
- `Model` is `zebra?.Model`, otherwise `Id?.Model`.
- `Dpi`, `PrintMethod` and `LabelLengthMm` come from `zebra`.
- `LabelPrinter`:
  - `zebra.SpeaksZpl` when known;
  - else, when `Id?.CommandSet` is present, whether it contains `ZPL` or `PPLZ` (case-insensitive);
  - else, whether the maker is Zebra or Argox.
  - A known command set without ZPL (an Argox in PPLA mode) is therefore not a label printer. It would print ZPL as text.
- `Address` is null, and `WindowsPrinter` is `queue?.Name`.
- `StatusSupported` is `zebra?.Model is not null`.
- `RecognisedBy` is `["usb"]`, plus `"zebra-commands"` when `zebra` is set.
- `DevicePath` is `device.Path`.
- `Diagnostics` is `path=… 1284="…" zebra=[…] queue="…"`.

**How `UsbQueueMatch.For` matches a queue:**
- A queue qualifies when its `Port` starts with `USB` (case-insensitive) and its name or driver contains a token from `model`.
- A token is any whitespace-separated part with at least 4 characters and at least one digit. For example, `O4-250` matches `Argox O4-250 PPLA`, and `ZT231-203dpi` matches `ZDesigner ZT231-203dpi ZPL`.
- It returns the queue only when exactly one qualifies, and `null` otherwise.

**Changes to the search:**
- **Listing:** `sources.Usb.List()` runs beside the catalog, wrapped in `OrEmpty("USB printers", …)`.
- **Probing:** each device that is a Zebra by VID `0x0A5F` or `MFG` is asked through `UsbZebra`, under the existing `MaxParallelQuestions` gate. Every other device is sent nothing.
- **Folding:** each device gets `UsbQueueMatch.For(device, zebra?.Model ?? device.Id?.Model, queues)`. A matched queue is removed from the queue list, exactly like the 1.1.1 network fold.
- **Order:** network printers (unchanged), then USB printers (label printers first, then by id), then the remaining queues.

- [ ] **Step 1: Write the failing tests.**
  - **Classifier:**
    - `Classifies_the_office_argox_on_usb` uses the real 1284 capture. It expects connection `usb`, maker `Argox`, model `O4-250 PPLZ`, label printer, id `usb:1664:0D10:80384F461093`, address null.
    - `An_argox_not_in_zpl_mode_is_not_a_label_printer`: `CMD:PPLA` gives `LabelPrinter == false`.
    - `A_zebra_on_usb_takes_what_it_answered`: the `ZebraInfo` dpi, print method and label length are copied, and `StatusSupported` is true.
    - `Matches_a_usb_queue_by_model`: `O4-250 PPLZ` against queues `Argox O4-250 PPLA` on `USB001` (match) and `MF460 Advanced` on `IP_…` (no match).
    - `Two_matching_queues_match_none`.
  - **Search:**
    - `Lists_a_usb_printer_after_the_network_ones`.
    - `A_windows_printer_on_the_usb_device_is_listed_once`: the queue disappears and the USB card's `WindowsPrinter` names it.
    - `Never_asks_a_usb_device_that_is_not_a_zebra`: the fake probe records calls; the Argox VID gets none.
    - `Asks_a_zebra_on_usb`.
    - `A_failing_usb_listing_still_returns_the_rest`: `List()` throws, and network and queue results are intact.
- [ ] **Step 2:** Run them and see them fail.
- [ ] **Step 3:** Implement as above, and add `FakeUsbPorts`/`FakeUsbZebraProbe` to the test helpers. Existing `new SearchSources(…)` calls stay as they are.
- [ ] **Step 4:** `dotnet test PrintHelper.slnx` passes. The Release build gives 0 warnings.
- [ ] **Step 5:** Commit: `feat(usb): list USB printers in the search`.

### Task 5: Printing by `usb:` id, the feature flag, 1.2.0

**Files:**
- Modify:
  - `src/Unirefund.PrintHelper.Core/Discovery/PrinterResolver.cs`
  - `src/Unirefund.PrintHelper.Core/Api/HelperApi.cs`
  - `src/Unirefund.PrintHelper/Program.cs` (pass `new UsbPrintPorts()`)
  - `Directory.Build.props` (`1.2.0`)
  - `AGENTS.md`
- Test:
  - `tests/Unirefund.PrintHelper.Tests/PrinterResolverTests.cs`
  - `tests/Unirefund.PrintHelper.Tests/ApiTests.cs`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces:
  - `PrintDestination` gains a trailing positional `string? DevicePath = null`. For kind `"usb"`, `Queue` is the fallback Windows printer, or `null`.
  - `PrinterResolver` gains a trailing optional constructor parameter, `IUsbPorts? usb = null`, after `time`. `null` means `NoUsbPorts`, so existing constructions compile unchanged.
  - `Services` gains a trailing `IUsbPorts? Usb = null`. `HelperApi.FeaturesFor(Services)` returns `["search", "usb"]` when `(Usb ?? new NoUsbPorts()).Supported`, otherwise `["search"]`.

**How the resolver handles a `usb:` id:**
- **Find the device:** enumerate `usb.List()` and take the device whose `UsbPaths.PrinterId` equals the id (ordinal, ignoring case). A device that isn't there throws `PrintRefusedException(502, "printer-unreachable", "The USB printer is not connected.")`.
  - This is the only way a `usb:` id becomes a path. A device absent from the registry (after a restart) is still accepted, because enumeration proves it is a usbprint printer-class device. Record this in AGENTS.md as the USB form of security rule 2.
- **Refuse non-label printers:** call `RefuseIfNotALabelPrinter` with `search.Find(id)`, or with `PrinterClassifier.FromUsb(device, null, null)` when the search never listed it.
- **Fallback queue:** `search.Find(id)?.WindowsPrinter`.
- **Return** `new PrintDestination("usb", null, 0, fallbackQueue, null, device.Path)`. `lastAddress` is ignored for `usb:` ids.

**How the API prints to a `"usb"` destination:**
- It runs under `locks.RunAsync($"usb:{printerId}", …)`, through `new UsbPrinter(services.Usb).SendAsync(path, bytes, CancellationToken.None)`.
- On `PrinterBusyException`:
  - with a fallback queue, the job goes through `services.Queue.SendAsync(queue, …)` and is logged "USB printer busy, sent through Windows printer {Queue}";
  - without one, the answer is `409 printer-busy` "The printer is busy.".
- The `described` text for logs is `USB {printerId}`.

- [ ] **Step 1: Write the failing tests.**
  - **Resolver:**
    - `Resolves_a_usb_id_to_its_device_path`.
    - `The_id_follows_the_device_to_another_port`: the device is listed under a new path and resolves to it.
    - `A_usb_printer_that_is_gone_is_unreachable` expects `(502, "printer-unreachable")`.
    - `A_usb_printer_in_ppla_mode_is_refused` expects `(400, "not-a-label-printer")`.
    - `A_usb_id_never_takes_a_path_from_the_request`: an id that matches no enumerated device fails, even though `lastAddress` is set.
  - **API:**
    - `Status_lists_usb_when_the_platform_supports_it` and `Status_leaves_usb_out_without_it`.
    - `Prints_to_a_usb_printer_by_id`: the fake records the path and the bytes.
    - `A_busy_usb_printer_uses_its_windows_printer`: the fake queue receives the job.
    - `A_busy_usb_printer_without_one_is_busy` expects `409 printer-busy`.
- [ ] **Step 2:** Run them and see them fail.
- [ ] **Step 3:** Implement as above. Bump `<Version>` to `1.2.0`. In AGENTS.md, add the USB invariants:
  - the probing rule for USB;
  - never a zero-length write;
  - shared opens, so the lock is what serialises jobs;
  - a `usb:` id resolves only through enumeration.

  In the Program.cs files: Windows passes `new UsbPrintPorts()`; the Mac project passes nothing.
- [ ] **Step 4:** `dotnet test PrintHelper.slnx` passes, and the Release build gives 0 warnings.
- [ ] **Step 5:** Commit: `feat(usb): print by usb id; helper 1.2.0 lists the usb feature`.

### Task 6: Live check (controller)

This needs the office Argox on USB, which is already connected. The user's installed helper must be stopped (tray → Exit), because it holds 127.0.0.1:9180 and the single-instance mutex. Restart it afterwards.

- [ ] **Build and run:** run the Release build from the worktree. `GET /status` lists `"usb"`.
- [ ] **Search:** `GET /printers/search` lists `usb:1664:0D10:80384F461093` (`connection: "usb"`, maker Argox, `labelPrinter: true`). It sits beside the network card for the same printer, which is expected. The helper log shows no question sent to the Argox over USB.
- [ ] **Print:** `POST /print` with that id and the 1-label frame ZPL prints one label. Ask the user to confirm it.
- [ ] **Re-plug:** have the user move the cable to another USB port. Search again: the same id, and the print works.
- [ ] **Unplug:** have the user pull the cable. A print gives `502 printer-unreachable`.
- [ ] **Finish:** push and open the PR. Record in the PR that a true standard-user account was not tested.
