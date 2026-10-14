# Sticker ZPL printing: follow-ups

These are the leftovers from executing [the web plan](2026-10-14-sticker-zpl-web.md) and [the helper plan](2026-10-14-print-helper.md). The reviewers rated all of them Minor and deferred them.

- **web-app:** branch `feat/sticker-zpl-printing`, done at `6bcceb7a3`.
- **print-helper:** `main`, done at `4b28aec`.

## Not verified yet

| What | Why not | How to verify |
|---|---|---|
| ZT231 on pre-printed 70x100 rolls (QR lands in the box) | The office has no Zebra | Run the alignment test and one book at the client |
| Direct to Zebra (`/pstprnt`) | No Zebra | The same visit; also test with Chrome's Local Network Access prompt |
| A USB queue through the helper (winspool RAW) | The Argox is on the network only | Any USB label printer with a RAW-capable driver |
| 300 dpi profile | Both office printers are 203 dpi | A 300 dpi ZT231 |
| The installed single-file exe | The live checks ran the Debug build | Installer smoke test: install, tray, `/status`, upgrade over a running copy, uninstall |
| Stop and continue across jobs | It needs a book over 500 labels | Unit tests cover it; try once with a large book |
| Firefox and Safari hiding "Direct to Zebra" | No run on those browsers | Open the dialog in each |

## Open decisions (spec)

- **Installer storage:** where the setup exe is hosted. The web keeps `HELPER_DOWNLOAD_URL = null` until then, and shows "ask your administrator".
- **Custom portal domains:** the helper accepts only the portal, uat and dev origins plus `settings.json` extras. A tenant on its own domain gets 403 with no hint in the tray.

## print-helper

- **Timeouts:** the printer timeout is one deadline over connect plus write. Make the write an inactivity timeout, since artwork jobs are about 200–340 KB.
- **Request handling:**
  - a body read the browser aborts is neither logged nor answered;
  - unhandled exceptions return an empty 500 outside the JSON error contract.
- **Logging:**
  - `Refuse` logs the client-supplied `target.Name` as is, so a name with newlines could forge a log line;
  - the catalog 502 drops the exception detail.
- **WinSpool:**
  - a short write reads a stale last-error;
  - any `OpenPrinter` failure maps to 404;
  - there's no queue-job timeout;
  - the `EndPagePrinter` result is ignored.
- **Scanner:**
  - only an exact /24 is scanned, so a /23 or /16 finds nothing and says nothing;
  - virtual adapters add scan time;
  - there are no partial results and no rate limit.
- **Installer:**
  - an upgrade re-enables autostart;
  - the version is typed in, not read from the exe;
  - `[Run]` also launches on `/SILENT`;
  - uninstall uses `taskkill /F` (no graceful shutdown) and leaves the logs and `settings.json`.
- **CI:** pin the action versions, set minimal permissions, and restore once instead of twice.
- **Tests to add:**
  - a printer that closes late, to prove the drain waits;
  - cancel before the job starts;
  - no ACAO header on a 403;
  - the QueueNotFound mapping;
  - malformed JSON;
  - a stalled mid-write.
- **Text encoding:** Latin1 turns characters above U+00FF into `?`. The web only sends ASCII ZPL.

## web-app

**Behaviour**
- `sendViaHelper` treats `{ok:false}` on HTTP 200 as success.
- Every helper scan failure shows the HelperMissing toast; map it by `PrintError` code instead.
- After a retry, the "sent" count covers only that attempt, and the resume input takes `1.5` as `1`.
- There's no Stop while preparing the artwork. Stop gives no feedback while the in-flight job (up to 60 s) finishes: show "Stopping after this job…".
- An artwork render failure in ZPL mode doesn't revert the background toggle (spec D).
- The chosen printer isn't remembered across page loads. Persist the last-used profile id.
- There's no re-entrancy guard inside `runZpl`; only the disabled buttons prevent a second run.

**Printer sheet**
- A saved queue renders blank after a scan that doesn't list it.
- The empty queue select has no placeholder.
- Deleting the profile open in the editor leaves the draft open, and Save re-adds it. There's no delete confirmation.
- "Find printers" shows for Zebra-direct drafts.

**Alignment test**
- It frames the design footprint, not the stock size (spec A).
- The head-centre ruler can fall off narrow, left-justified stock.
- Its QR outline follows the dialog's background toggle, so it's 1–2 mm off.

**Copy and accessibility**
- Counts aren't locale-formatted; use `Intl.NumberFormat(lang)`.
- `Error.NetworkBlocked` doesn't name the Chrome policies (spec D).
- The run status, failure text and progress have no live region or accessible name.
- Turkish polish:
  - `Media.Direct` should read "doğrudan";
  - `DoesNotFit` mixes "çıkartma" and "etiket";
  - the `PrinterUnreachable` subject;
  - the HelperInstall / HelperAskContact verbs;
  - `UseBrowserPrint`;
  - `QrUnavailable` drops its count (this one predates the branch).

**Code hygiene**
- `StickerQr` ignores `platePaddingMm`; that's harmless, because white doesn't print.
- The draft stringification and the origin clamp are duplicated.
- The QR module count uses byte mode while ZPL uses auto mode.
- The `getImageData` canvas has no `willReadFrequently`.
- Test gaps:
  - `rotatedDesignSize(270)`;
  - the 0.5 mm fit slack;
  - rulers ignoring offsets.
