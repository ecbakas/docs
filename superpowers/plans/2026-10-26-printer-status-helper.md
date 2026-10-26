# Printer Status (helper 1.3.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /printers/{id}/status` tells the web, before a run, whether a found printer is ready, has a problem (paper out, head open, paused, ribbon out) or can't be read, and why. `/status` lists `"status"`.

**Architecture:**
- **Asking:** `~HS` is asked through the same `Stream`-based Zebra question code, over a TCP connection to 9100 or an opened usbprint device, with a 2 s deadline.
- **Resolving:** the endpoint resolves the id exactly as `POST /print` does, with the same resolver, `lastAddress` and error codes.
- **Locking:** it never interleaves with one of our own jobs; a held lock answers `busy`.
- **Search:** unchanged. It sends `~HS` to no one.

**Tech Stack:** .NET 10, xUnit. No new packages.

**Spec:** `docs/superpowers/specs/2026-10-14-printer-discovery-design.md`:
- §3.6, While printing;
- §6, `GET /printers/{id}/status`, including the 2026-10-26 amendment;
- §7.5, read-only probing;
- §9, messages.

The companion web plan is `2026-10-26-printer-status-web.md`.

**Verified on hardware before writing (2026-10-26, the office Argox O4-250 in PPLZ mode):**
- **Over USB:** it answers `~HS` in 14 ms.
- **Over TCP 9100:** about 110 ms.
- **Framing:** both replies use Zebra's framing.
- **Ready state:** `<STX>030,0,0,0059,000,0,0,0,000,0,0,0<ETX><CR><LF><STX>000,0,0,0,0,2,5,0,00000000,1,002<ETX><CR><LF><STX>0000,0<ETX><CR><LF>`.
- **Head open:** String 2 field 3 is `1`, and the printer kept answering.
- **Not observed yet:** paper-out and pause.
- **Documented paper-out capture** (ZT410, research §3): String 1 `030,1,1,1225,…` means paper out plus paused.

## Global Constraints

- **Base:** helper `main` at 6aa7d4a or later. Branch `feat/printer-status`, created with `--no-track` in worktree `C:\unirefund\print-helper-wt-status`. Push only with an explicit refspec. Version `1.3.0`.
- **Response:** `{ "state": "ready" }`, `{ "state": "problem", "problems": [...] }`, or `{ "state": "unknown", "reason": "no-reply" | "busy" | "unsupported" }`.
  - `problems` holds any of `"paper-out"`, `"paused"`, `"head-open"` and `"ribbon-out"`, in that order.
- **Mapping (spec §6):**
  - String 1 field 2 = paper out;
  - String 1 field 3 = paused;
  - String 2 field 3 = head open;
  - String 2 field 4 = ribbon out.

  A field counts only when it is exactly `1`.
- **Deadline:** 2 s for the whole read: connect or open, write, and the reply. A write that never completes must not exceed it.
- **Read-only:** the endpoint sends exactly `~HS`, nothing else, and only to the one resolved printer.
- **Locks:** under the same keys `/print` uses:
  - `net:{host}`;
  - `TargetLocks.UsbKey(id)`;
  - a queue target is `unsupported`, with no lock and no I/O.

  If the key is held, the answer is `busy` at once, with no I/O. Otherwise the read runs inside `RunAsync` on that key.
- **Errors:** id resolution failures return the same JSON error codes and statuses as `/print`.
- **Conventions:** comments sparse, `Printable` for device strings in logs, Release build with 0 warnings. Each commit message goes through a quoted heredoc with the Co-Authored-By trailer.

## Review Focus

1. **A Zebra that goes silent in a fault** (the manual says it may) answers `unknown/no-reply` within 2 s, and never hangs. Pinned in Task 1: `A_silent_printer_gives_no_reply_within_the_deadline`.
2. **A status request while one of our books prints to that printer** gives `busy` immediately, with no bytes sent. Pinned in Task 3: `A_printer_printing_our_job_is_busy`.
3. **A half reply** (one line, or no ETX before the deadline) never becomes a false "ready". Pinned in Task 1: `A_partial_reply_is_not_a_status`.
4. **An id the helper can't resolve** gives the same error as `/print` would, so the web falls through to printing and shows that error. Pinned in Task 3: `A_status_for_an_unknown_id_errors_like_print`.
5. **An installed Windows printer** gives `unknown/unsupported`, never an attempt to read through the spooler. Pinned in Task 3.

---

### Task 0: Worktree and baseline
- [ ] `git -C C:/unirefund/print-helper fetch origin`
- [ ] `git -C C:/unirefund/print-helper worktree add ../print-helper-wt-status -b feat/printer-status --no-track origin/main`
- [ ] Record `dotnet test PrintHelper.slnx` (passed count) and the Release build (0 warnings).

### Task 1: Reading `~HS`

**Files:**
- Modify: `src/Unirefund.PrintHelper.Core/Discovery/Zebra.cs`
- Test: `tests/Unirefund.PrintHelper.Tests/ZebraTests.cs`

**Interfaces:**
- **Produces:**
  - `public sealed record PrinterStatus(string State, IReadOnlyList<string>? Problems = null, string? Reason = null)`, with static helpers `Ready`, `Problem(IReadOnlyList<string>)` and `Unknown(string reason)`.
  - `public static IReadOnlyList<string>? ZebraReplies.ParseHostStatus(string reply)`:
    - `null` means not a complete status;
    - an empty list means ready.
  - `public static Task<string?> ZebraQuestions.AskHostStatusAsync(Stream stream, TimeSpan deadline, CancellationToken ct)`.
- **Parsing:**
  - Strip `\u0002`, `\u0003` and `\r`, split on `\n`, and drop empty lines.
  - It needs at least 2 lines, line 1 with at least 3 comma fields and line 2 with at least 4. Otherwise it returns `null`.
- **Asking:**
  - Create the deadline token first, then write `~HS` and read under it.
  - Stop at 3 ETX bytes, or 4096 chars.
  - Return the text read, or `null` if nothing came.

- [ ] **Step 1: Write the failing tests.**
  - `Parses_the_office_argox_ready`: the real capture gives `[]`.
  - `Parses_the_office_argox_with_the_head_open`: gives `["head-open"]`.
  - `Parses_a_zebra_that_is_out_of_paper`: research §3's `030,1,1,1225,000,0,0,0,000,0,0,0` / `001,0,0,1,1,2,6,0,00000000,1,000` / `1234,0` gives `["paper-out","paused","ribbon-out"]`. Field 4 of line 2 is `1` in that capture.
  - `Reads_the_sgd_form_without_stx`: the same text without STX/ETX parses the same.
  - `A_partial_reply_is_not_a_status`: one line only, or line 2 with 3 fields, gives `null`.
  - `A_silent_printer_gives_no_reply_within_the_deadline`: a stream whose reads block gives `null` within the deadline plus 300 ms.
  - `A_stalled_write_gives_no_reply_within_the_deadline`: same for writes, using the `FakeUsbPorts` stalled-write stream.
  - `Asks_only_HS`: the bytes written are exactly `~HS`.
- [ ] **Step 2:** `dotnet test PrintHelper.slnx --filter ZebraTests` fails.
- [ ] **Step 3:** Implement to the rules above.
- [ ] **Step 4:** The full `dotnet test` passes, and the Release build has 0 warnings.
- [ ] **Step 5:** Commit `feat(status): read a printer's ~HS host status`.

### Task 2: A status reader per destination

**Files:**
- Create: `src/Unirefund.PrintHelper.Core/Printing/PrinterStatusReader.cs`
- Test: `tests/Unirefund.PrintHelper.Tests/PrinterStatusReaderTests.cs`

**Interfaces:**
- **Consumes:** Task 1; `PrintDestination` (Kind `"network"`/`"usb"`/`"queue"`, Host, Port, DevicePath); `IUsbPorts.Open`.
- **Produces:**
  - `public interface IPrinterStatusReader { Task<PrinterStatus> ReadAsync(PrintDestination destination, CancellationToken ct); }`
  - `public sealed class PrinterStatusReader(IUsbPorts usb, TimeSpan? deadline = null) : IPrinterStatusReader`, with a default deadline of 2 s.
  - It also takes an injectable `Func<string, int, CancellationToken, Task<Stream>> connect` (optional, default TCP connect). Tests use it to avoid real sockets.
- **Rules by kind:**
  - **`queue`** gives `Unknown("unsupported")` with no I/O.
  - **`network`** connects to Host:Port under the deadline.
  - **`usb`** opens `DevicePath` through `IUsbPorts`.
  - **Then** both run `AskHostStatusAsync`, and parse the reply:
    - a parsed list gives `Ready` or `Problem`;
    - a null reply, a parse failure, any I/O error, or the deadline gives `Unknown("no-reply")`.
  - **Disposal:** the stream or connection is disposed on every path.

- [ ] **Step 1: Write the failing tests:**
  - `A_queue_target_is_unsupported_without_io`;
  - `Reads_a_network_printer_through_the_connection` (a fake connect returns a scripted stream with the Argox ready reply);
  - `Reads_a_usb_printer_through_its_device` (`FakeUsbPorts` with the head-open reply gives `Problem(["head-open"])`);
  - `A_connection_that_fails_is_no_reply`;
  - `A_garbled_reply_is_no_reply`;
  - `Disposes_the_stream_on_every_path`.
- [ ] **Step 2:** The tests fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** All tests pass, and the Release build has 0 warnings.
- [ ] **Step 5:** Commit `feat(status): read status from a network or USB printer`.

### Task 3: The endpoint, the feature, 1.3.0

**Files:**
- Modify:
  - `src/Unirefund.PrintHelper.Core/Api/HelperApi.cs`
  - `src/Unirefund.PrintHelper.Core/Api/Contracts.cs`
  - `Directory.Build.props`
  - `AGENTS.md`
- Test: `tests/Unirefund.PrintHelper.Tests/ApiTests.cs`

**Interfaces:**
- **Consumes:** Task 2; `PrinterResolver.ResolveAsync(id, lastAddress, ct)`; `TargetLocks.IsHeld`/`RunAsync`/`UsbKey`.
- **Produces:**
  - `Services` gains a trailing optional `IPrinterStatusReader? Status = null`. `Services.Default` builds a `PrinterStatusReader` over the same USB ports.
  - `FeaturesFor` adds `"status"` after the existing features, on every platform.
  - `GET /printers/{id}/status`:
    - `id` is URL-decoded.
    - It takes an optional `lastAddress=host:port` query.
    - It answers `PrinterStatus` as camelCase JSON, leaving out null `problems` and `reason`.
- **Rules:**
  - **Resolve:** with the resolver. On `PrintRefusedException`, answer the same `Error(status, code, message)` as `/print`.
  - **Lock key:** pick it from the destination (`net:{host}`, `TargetLocks.UsbKey(id)`; queue answers `unsupported` straight away). If `IsHeld(key)`, answer `Unknown("busy")`.
  - **Read:** otherwise read inside `locks.RunAsync(key, …, ct)`.
  - **Log:** one information line per status read, `Status of {Target}: {State} {Problems} {Reason}`.

- [ ] **Step 1: Write the failing tests:**
  - `Status_lists_status_feature`;
  - `Reports_a_ready_network_printer`;
  - `Reports_a_problem`;
  - `A_printer_printing_our_job_is_busy` (hold the key via a running fake job, as the existing USB lock test does; the status is `busy` and the fake reader is never called);
  - `An_installed_printer_is_unsupported`;
  - `A_status_for_an_unknown_id_errors_like_print` (same status and code as `/print` for the same id);
  - `Takes_the_last_address_from_the_query`;
  - `Decodes_a_port_bound_usb_id`: an id containing `#` and `&`, percent-encoded in the path, resolves.
- [ ] **Step 2:** The tests fail.
- [ ] **Step 3:** Implement. Bump to `1.3.0`. In AGENTS.md, record:
  - who gets `~HS` (only this endpoint, only the resolved printer);
  - the three `unknown` reasons;
  - the `busy` rule.
- [ ] **Step 4:** All tests pass, and the Release build has 0 warnings.
- [ ] **Step 5:** Commit `feat(status): GET /printers/{id}/status; helper 1.3.0`.

### Task 4: Live check (controller)

This uses the office Argox on USB and on the network. Run the worktree's Release build with the installed helper stopped, or install the PR's CI artifact.

- [ ] **Ready:** `/status` lists `"status"`, and the status of `mac:78:5F:4C:00:55:67` and of `usb:1664:0D10:80384F461093` is `ready` on both.
- [ ] **Head open:** the user opens the head. Both answer `problem` with `["head-open"]`. Close the head, and both are `ready` again.
- [ ] **Paper out:** the user removes the roll and presses FEED. Record what `~HS` reports, then add the capture as a test fixture if it differs from the documented one.
- [ ] **Busy:** while a 3-label book prints to the USB id, a status request answers `busy`.
- [ ] **Unsupported:** an installed-printer id (`queue:…`) answers `unknown/unsupported`.
- [ ] **Finish:** push with an explicit refspec, open the PR, and check its commit list.
