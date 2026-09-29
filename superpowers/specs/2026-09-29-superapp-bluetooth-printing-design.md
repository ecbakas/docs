# Bluetooth receipt printing (test page) — design

**Repo:** `super-app` (worked in the `super-app-safe` clone) · **Date:** 2026-09-29 ·
**Branch:** `feat/bluetooth-printing`, cut from `main` @ `4cb30440`

## Goal

Staff (Merchant, RefundPoint, Customs) need to print. OrderPADs and phones have no
printer, so printing goes to Bluetooth receipt printers that differ merchant to
merchant. This phase builds **a test page**: find and pair a printer, configure
it, print a calibration page, and print a PDF — first the bundled 58 mm
`TagDetailReport_58MM_FRO.pdf`, then any PDF picked from the device.

**Where this is headed (not built now):** ReportService returns ready-to-print
PDFs for tags; the print action moves to its real screens; the settings move to a
permanent place; iOS follows. The PDF path is the one that matters — if this
PDF prints, any template of any width prints, because the page is rasterised to
the printer's dot width rather than laid out for it.

## Printers under test

| Printer | Serial | Known facts |
|---|---|---|
| HPRT HM-E300 | HME30020120600 | 80 mm, 203 dpi, 72 mm / 576-dot print width (48 mm on 58 mm paper), ESC/POS, USB + Bluetooth 3.0/4.0, no cutter |
| Afanda MTP-3 | MTP202205355 | 80 mm portable; no spec sheet found. The "MTP-3" family is generic ESC/POS over SPP — confirmed or refuted by the test page |

## Decisions taken

| Question | Answer |
|---|---|
| Platform | **Android only.** iOS cannot reach Bluetooth Classic (SPP) printers without MFi; it needs a BLE transport, designed later. The JS layer reports "not supported" on iOS. |
| Library or own module | **Own Expo module**, `modules/bluetooth-printer` (Kotlin, Expo Modules API, autolinked like `modules/card-scanner`). The RN printer libraries are unmaintained, old-architecture, and none prints a PDF. The system print dialog (`expo-print`) needs a per-vendor print-service app on every device. |
| Split between native and JS | Native does only what needs the platform: Bluetooth and PDF rasterisation. **ESC/POS encoding is TypeScript** — pure, jest-tested, and reusable by a future iOS BLE transport. |
| PDF sizing | **Always fit to the printer's width.** The PDF's own size cannot be trusted: the "58 mm" sample's MediaBox is 426 × 1820 pt (≈150 × 642 mm). An optional **trim side margins** step crops to the ink before scaling. No "actual size" mode. |
| Text vs image | PDFs print as **1-bit raster**. That sidesteps printer code pages (Turkish characters, logos, QR) entirely. The calibration page also prints a few lines in the printer's own font (ASCII only) to prove the text channel. |
| Strings | English, hard-coded, like `debug-menu` and `ui-kit`. i18n keys come from the backend's language resources; they are added when the page reaches its permanent place. |
| Entry point | A temporary **"Printer test"** row in the staff profile's App group → `/(auth)/(modals)/printer-test`. |
| Build | New native module + `expo-document-picker` ⇒ one new dev build. **The user runs it**: `npx expo run:android --device OrderPAD_3 --no-bundler` in `super-app-safe`. Then CPadNFC (`LD38266200649`, handed over by the user) is served from super-app-safe's own bundler on 8096. |

## Architecture

### Native module `BluetoothPrinter` (Android)

`modules/bluetooth-printer/android`, package `expo.modules.bluetoothprinter`.
Library manifest declares the permissions (below), so no config plugin is needed.

| Member | Behaviour |
|---|---|
| `isSupported(): boolean` | A Bluetooth adapter exists. |
| `isEnabled(): boolean` | Adapter is on. |
| `requestEnable(): void` | Fires `ACTION_REQUEST_ENABLE`; the result arrives as `onAdapterStateChanged`. |
| `getBondedDevices(): Device[]` | `{ address, name, majorClass, isPrinter }`; `isPrinter` = major device class IMAGING. JS sorts those first but lists every device, because cheap printers often report UNCATEGORIZED. |
| `startDiscovery()` / `cancelDiscovery()` | Events `onDeviceFound(Device)`, `onDiscoveryFinished()`. |
| `pair(address): Promise<void>` | `createBond()`; resolves on `BOND_BONDED`, rejects `E_PAIR_FAILED` on fall-back to `BOND_NONE`. The system shows the PIN dialog (usually `0000` / `1234`). |
| `send(address, bytes, { chunkSize, chunkDelayMs, lingerMs }): Promise<{ bytesSent, millis }>` | Cancel discovery → RFCOMM to SPP UUID `00001101-0000-1000-8000-00805F9B34FB` (secure; fallback insecure; fallback reflective `createRfcommSocket(1)`) → write in chunks with a delay → flush → wait `lingerMs` (closing early truncates on some printers) → close. One job at a time; a second call while one runs rejects `E_BUSY`. |
| `rasterizePdf(uri, { widthDots, trimMargins, mode, threshold }): Promise<Page[]>` | `file://` or `content://`. `PdfRenderer`, every page: render onto a **white-filled** ARGB bitmap (PdfRenderer leaves transparency, which reads as black), optionally trim to the ink's horizontal bounds — a first pass at `widthDots` finds the ink columns, a second re-renders with a `Matrix` mapping that span to `widthDots`, so the crop is scaled from vector rather than upscaled from pixels — convert to luminance, 1-bit by `threshold` or Floyd–Steinberg (`mode: "threshold" \| "dither"`), pack MSB-first with 1 = black, `widthBytes = ceil(widthDots / 8)`. Returns `{ width, height, data: Uint8Array, previewUri }`, the preview a PNG of the 1-bit result in the cache dir. |

Error codes: `E_UNSUPPORTED`, `E_DISABLED`, `E_PERMISSION`, `E_PAIR_FAILED`,
`E_CONNECT_FAILED`, `E_WRITE_FAILED` (carries `bytesSent`), `E_BUSY`,
`E_PDF_FAILED`. The JS wrapper uses `requireOptionalNativeModule` per call, so a
dev client built before the module exists reports `E_UNSUPPORTED` instead of
crashing.

**Memory:** the 80 mm sample is ~576 × 2460 px at fit-to-width — a 5.7 MB ARGB
bitmap, 177 KB packed. Pages are rendered one at a time and recycled.

### TypeScript `src/features/printing/`

| File | Responsibility |
|---|---|
| `bluetoothPrinter.ts` | Typed wrapper over the native module; coded errors; `Platform.OS !== "android"` ⇒ unsupported. |
| `permissions.ts` | `PermissionsAndroid` for `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT` on API 31+; `ACCESS_FINE_LOCATION` for discovery on ≤ 30. |
| `escpos.ts` | Pure encoder. `init()` (`ESC @`), `text()`, `align()`, `bold()`, `feed(n)` (`ESC d n`), `cut(kind)` (`GS V`), `raster(image, { bandHeight, command })`: `GS v 0` in bands of `bandHeight` rows (default 128; some printers cap the height of one command), or the `ESC *` 24-dot fallback for printers without `GS v 0`. |
| `testPage.ts` | Builds the calibration job: printer-font header (name, address, dots, date), a raster ruler exactly `widthDots` wide with a tick every 8 dots (1 mm) and solid edge bars, a 50 % checker strip, then feed. If the right edge bar is clipped, the dot width is too large. |
| `printPdf.ts` | `rasterizePdf` → `escpos` → `send`, with timings per stage. |
| `printerStore.ts` | Zustand + AsyncStorage (`printer-settings-storage`), same shape as `deviceSettings.ts`: saved profiles keyed by address and the default address. |

**Printer profile** (defaults in brackets):
`address`, `name`, `paper` (`58` \| `80` \| `custom`) [`80`], `widthDots`
[`576` for 80, `384` for 58], `trimMargins` [`true`], `mode` [`threshold`],
`threshold` [`160`], `command` (`gsv0` \| `escStar`) [`gsv0`], `bandHeight`
[`128`], `chunkSize` [`512`], `chunkDelayMs` [`15`], `lingerMs` [`1500`],
`feedLines` [`4`], `cut` (`none` \| `partial` \| `full`) [`none` — mobile printers
tear].

### Test screen `/(auth)/(modals)/printer-test`

`src/screens/staff/Printers/PrinterTestScreen.tsx`, in `ModalTemplate`.

1. **Status** — adapter present / on / permissions; buttons to grant or enable.
2. **Printers** — bonded devices, printers first; **Scan** lists discoverable
   unpaired ones, tap to pair. Tap a bonded device to select it; "Set as
   default".
3. **Settings** — the profile fields above for the selected printer; advanced
   (command, band, chunk, delay, linger) collapsed.
4. **Actions** — *Print test page*, *Print sample PDF*, *Pick a PDF…*
   (`expo-document-picker`, `application/pdf`, copied to cache). A PDF job first
   shows the 1-bit preview of what will print, with *Print* under it, so
   settings can be tuned without paper.
5. **Last job** — pages, dots × rows, bytes, rasterise / send ms, or the error.

The sample ships as `assets/printing/TagDetailReport_58MM_FRO.pdf`, loaded
through `expo-asset`; `metro.config.js` adds `pdf` to `assetExts`.

### Permissions (module manifest)

- `BLUETOOTH_CONNECT`; `BLUETOOTH_SCAN` with `usesPermissionFlags="neverForLocation"`.
- `BLUETOOTH` and `BLUETOOTH_ADMIN` with `maxSdkVersion="30"`.
- `ACCESS_FINE_LOCATION` is already declared (expo-location) and only requested
  here on ≤ 30.

## Error handling

| Case | What the user sees |
|---|---|
| iOS / no adapter / old dev client | "Printing is not supported on this device/build." |
| Bluetooth off | Enable button. |
| Permission denied | Explanation + Open settings. |
| Pair fails | Error with the PIN hint. |
| Connect fails | "Printer off, out of range, or connected to another device?" — SPP printers take one connection. |
| Write fails mid-job | Error with bytes sent of total. |
| PDF unreadable | Error naming the file. |

## Testing

- **Jest (node project):** `escpos.ts` — exact bytes for `GS v 0` headers, band
  splitting including a short last band, `ESC *` column packing, feed/cut;
  `testPage.ts` — ruler width equals `widthDots`, edge bars set; the store's
  defaults and merge of bad persisted values.
- **Gates** in super-app-safe, re-measured on the branch base before starting:
  `npm run typecheck`, `npm test`, `npm run lint`.
- **Device (CPadNFC, user present):** pair both printers; test page on each
  (edge bars visible at 576); sample PDF on each (QR scans, text legible);
  a picked PDF; Bluetooth-off and printer-off errors.

## Out of scope

iOS / BLE, network (9100) and USB printers, Star / TSPL / CPCL command sets,
ReportService, printer status queries (paper out), and the page's permanent
home.
