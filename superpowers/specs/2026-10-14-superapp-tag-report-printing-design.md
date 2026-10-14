# Printing a tag's report on a Bluetooth printer (super-app) — design

**Repo:** `super-app`, worked in the `super-app-safe` clone · **Date:** 2026-10-14 ·
**Branch:** `feat/bluetooth-printing` (14 commits, @ `d88ffd0d`), with `origin/main` merged in first

Builds on [2026-09-29-superapp-bluetooth-printing-design.md](2026-09-29-superapp-bluetooth-printing-design.md),
which built the transport and a test page. This phase connects that work to the
report service and puts it behind the tag's Print button.

UI mockups the user chose from: <https://claude.ai/artifact/A6qtb96YKCM6GQUmk2PM5Q>.
**Option B (two steps) was chosen.**

## Goal

On a tag's detail page, staff tap **Print**, pick **where** (one of their Bluetooth
printers, or a connected device as today) and, for a Bluetooth printer, **which
layout** (A4, 58 mm or 80 mm, from the report service's catalogue). The app then
prints the report-service PDF on that printer, without leaving the app.

**Network printers come next.** Two kinds are planned: network receipt printers,
which get the same bytes over the network, and A4 office printers, which get the
PDF itself over IPP or Android's print framework. This phase leaves a seam for
both and builds neither.

## Decisions taken

| Question | Answer |
|---|---|
| Today's "send to a connected device" print | **Kept**, as one of step 1's groups. It still sends `DeviceService` `PrintTag`, and the device prints its own layout, so it skips step 2. |
| A4 on a 58/80 mm printer | **Offered.** It is scaled to the printer's width and labelled "Try it — shrunk to N mm", so people can see the result for themselves. |
| Where printer setup lives | A permanent, translated **Printers** page in the profile, replacing the English-only "Printer test" screen. The print sheet only lists saved printers and links to the page. |
| Sheet shape | **Two steps** (mockup B): step 1 picks where, step 2 picks the layout and holds the Print button. |
| How the PDF reaches a printer | **The phone does it** (approach 1): fetch the PDF from GET by-entity, turn it into an image at the printer's dot width with the branch's native module, encode it as ESC/POS or CPCL, and send it over Bluetooth. Rejected: backend-rendered printer bytes (no such output format; the server would need each printer's settings) and Android's system print dialog (most cheap receipt printers have no print plugin, and it leaves the app). |
| Leaving the app | Never, for a print. Setting up a printer shows only Android's own pop-ups over the app: the Nearby devices permission, the pairing PIN, and "Turn on Bluetooth?". |
| Platform | **Android only.** iOS has no Classic SPP without MFi; a BLE transport comes later. On iOS step 1 shows connected devices only. |
| Entity types | Tags only in this phase. The flow takes an `entityTypeId`, so refunds and statements are wiring work later. |
| Generating reports | Through `GET /api/report-service/reports/synchronously/by-entity` only, never `POST …/reports/synchronously` (user rule, same as web). |

## The flow

### Step 1 — where to print

Two groups, each shown only to someone who can use it:

- **Bluetooth printers.** The saved printer profiles, the last one used first, each
  with its paper size. Under them, **Add printer** opens the Printers page. With no
  saved printer the group reads "No printers yet" above that link.
  Shown when `Platform.OS === "android"`, the native module is present, and the
  session holds `ReportService.Reports` + `ReportService.Reports.CreateSynchronously`.
- **Connected devices.** Today's list (`useDevices`, filtered to `PrintTag`), with the
  online dot. Tapping one sends the command straight away, as now: toast, sheet closes.
  Shown with `DeviceService.Commands` + `.SubmitPrintTag` + `DeviceService.Devices` + `.ViewList`.

Tapping a Bluetooth printer moves to step 2.

### Step 2 — which layout

The header names the printer and has a back button to step 1.

One row per **size** in the tag's catalogue (`GET reports/catalogue?entityTypeId=Tag`),
in catalogue order. Each row shows the size's name and its default definition's name.
For the size's default output format, only **PDF** is offered: a raster path needs a PDF.
A size with no PDF format is left out.

- **Fits printer** badge: the size's `widthMm` equals the printer profile's paper
  width (`58` or `80`). A `custom` paper profile gets no badge.
- **Try it — shrunk to N mm** badge: `widthMm` is wider than the paper, where N is the
  printable width (`widthDots / 8`, e.g. 72 for 576 dots). A4 on 80 mm paper reads
  "shrunk to 72 mm".
- A narrower size (58 mm on an 80 mm printer) gets no badge and is scaled up to fit.
- A size with more than one PDF definition lists its versions under it, default
  first; the user can pick one.

**Preselected row**, first match wins:
1. the layout last used on this printer, if it is still in the catalogue;
2. the size that fits the printer;
3. the catalogue's default size.

**Without `ReportService.Reports.ViewDefinitionListByEntity`** the catalogue cannot be
read, so step 2 shows a single **Default layout** row and the export is sent with no
size, format or definition. A tenant whose staff print on receipt printers sets that
default to 80 mm on the web's Report Entity Types page.

**Print** sits at the bottom of step 2.

### After Print

The sheet switches to a progress state: **Downloading → Preparing → Printing**, with
**Cancel**. It cannot be swiped away while a job runs.

- Success: a toast, and the sheet closes. The printer and layout are remembered.
- Failure: the reason (see Errors) with **Retry**; both choices are kept.

## Architecture

### Branch

1. Merge `origin/main` into `feat/bluetooth-printing` in `super-app-safe`. It is 61
   commits behind; the 14 printing commits stay as they are.
2. Regenerate the ReportService SDK: `npm run gen -f ReportService`. That needs the
   GitHub Packages token in `.npmrc`; if this machine lacks it, the user runs it.
   The current super-app SDK has no catalogue, and by-entity still takes `entityType`.

### New and changed pieces

| Piece | Responsibility |
|---|---|
| `src/actions/ReportService/` (new) | `getReportCatalogueApi({ entityTypeId })`, and `downloadEntityReportPdf({ entityTypeId, entityId, sizeId?, outputFormatId?, reportDefinitionId? })`. The download calls by-entity through the generated client, using the patched `core/request.ts` `response.blob()` path. It saves the bytes to the app cache (`expo-file-system`, already a dependency) and returns the `file://` URI. Both go through `fetchRequest`, so a 401 refreshes the token like every other call. |
| `src/features/printing/reportOptions.ts` (new, pure) | Catalogue entry + printer profile → step 2's rows: size, definitions, `fitsPrinter`, `shrunkToMm`, and the preselected row by the order above. Also the default-layout row used without the catalogue grant. |
| `src/features/printing/printReport.ts` (new) | Runs one job: download → `rasterizePdf` (the profile's `widthDots`, `trimMargins`, `mode`, `threshold`) → `encodePages` → send. It reports each stage, honours an abort signal, and deletes the cached PDF at the end. It gets its sender from the profile's connection type through one lookup. Bluetooth is the only connection type now, and network receipt printers become a second entry. |
| `src/features/printing/profile.ts` + `src/store/printerSettings.ts` (existing) | Profiles gain `connection: "bluetooth"`, the seam for network printers. The store gains `lastUsedAddress` and `lastLayoutByPrinter: Record<address, { sizeId, reportDefinitionId }>`, both sanitised on load like the existing fields. |
| `PrintTagSheet.tsx` (rebuilt) | The two steps and the progress state. As today, `useLocalization` and `useToastRef` are called in the host component and passed down: hooks inside `<BottomSheet>` children lose context in this app. |
| Printers page | `/(auth)/(modals)/printers` (`src/screens/staff/Printers/PrintersScreen.tsx`), promoted from `PrinterTestScreen`. It covers status, saved and nearby printers, pair and forget, paper size and command language, and "Print test page"; the advanced tuning (command, band, chunk, pacing, linger) is collapsed. Translated through `MobileApp.Printers.*` keys in `src/localization/resources/en-US.json` and `tr-TR.json`. |
| Staff profile | The "Printer test" row becomes **Printers**. It shows only on Android and with the report-export grant. |
| `src/utils/tagActions.ts` | `print`'s rule changes from the four DeviceService grants to *device grants **or** (report-export grant **and** local printing supported)*. The rule table only supports "all of these", so `policies` needs an any-of form (or `print` moves to `extra`). The context gains `canPrintLocally` (Android with the native module). The footer, the sheet and step 1's groups must all reach the same answer. |

### Data flow

```
Print (footer) ─▶ step 1 ─┬─ connected device ─▶ postPrintTagApi ─▶ toast
                          └─ Bluetooth printer ─▶ step 2 (catalogue rows)
                                                   │ Print
                                                   ▼
                         downloadEntityReportPdf ─▶ file://…pdf
                         rasterizePdf(widthDots) ─▶ 1-bit pages
                         encodePages(ESC/POS|CPCL) ─▶ bytes + pacing
                         send(address) ─▶ printer ─▶ remember choice
```

## Errors

| Situation | What the user sees |
|---|---|
| Nearby devices permission refused | Why it is needed, with **Open settings** |
| Bluetooth off | Android's "Turn on Bluetooth?" pop-up |
| No saved printers | "No printers yet" with **Add printer** |
| Catalogue fails to load | An error with **Retry**, plus **Print default layout** |
| PDF download fails (offline, 5xx, Cloudflare `error code: 502`) | "Couldn't download the report", with **Retry** |
| Backend refuses the layout (e.g. `010035` inactive definition, `010030` no definition in that size) | The backend's localized message, with **Retry** and **Back** |
| Printer unreachable (off, out of range, held by another phone) | That reason after the existing 20 s connect budget, with **Retry** |
| Paper out / cover open | That reason, from the existing DLE EOT status check |
| Link drops mid-job | "Stopped after part of the tag printed", with **Retry** |
| Printer un-paired in Android settings | Treated as unreachable, with a link to **Printers** |
| Another job running (`E_BUSY`) | "Another print is in progress" |
| Cancel | During the download it stops cleanly. While sending, it stops the transfer, and the confirmation warns that some of the tag may already be on paper. |

## Testing

**Gates**, on the branch after the merge: re-measure `npm run typecheck`, `npm test`
and `npm run lint` first (the AGENTS.md baselines are from 2026-09-24), then hold them.

**Unit tests (jest, node project), written test-first:**
- `reportOptions`:
  - fits / shrunk / narrower by paper width;
  - the preselection order;
  - multiple definitions;
  - sizes without PDF left out;
  - the default-layout row.
- `printReport`, with a fake sender and a fake rasterizer: the stage order, cancel
  during the download and during sending, each error code mapped to its message, and
  the cached PDF deleted on success and on failure.
- Printer store: `lastUsedAddress`, `lastLayoutByPrinter`, sanitising bad persisted values.
- `tagActions` `print`: device grants alone; the report grant with `canPrintLocally`;
  the report grant without it; neither.
- `downloadEntityReportPdf`: the request parameters, the file written, errors passed through.

**Screen tests** (`*.router.test.tsx`, as super-app requires for render tests):
- step 1's groups by grant and platform;
- step 2's rows, badges and preselection;
- the progress state, Cancel, and the error states.

**Device:**
- **One new dev build is needed.** The branch's native code has changed since the
  APK on the device (cancel, connect budget, Forget). The user builds:
  `npx expo run:android --device OrderPAD_3 --no-bundler` in `super-app-safe`.
  Everything after that is served over Metro.
- QA runs on **CPadNFC + HPRT HM-E300**, signed in as the Faroe Islands admin. Check:
  - 80 mm, 58 mm and A4 from a real tag;
  - a connected-device print still works;
  - Bluetooth off, printer off, Cancel mid-print;
  - the Printers page: scan, pair, settings, test page.

## Out of scope

- Network receipt printers.
- Network A4 office printers.
- iOS / BLE.
- Printing entities other than tags.
- The **Afanda MTP-3**: it never printed, and its CPCL mode is unproven, so nothing here depends on it.
- Server-side printer formats.
- Remote printing to another phone's Bluetooth printer.
