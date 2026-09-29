# Bluetooth receipt printing (test page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A staff test page in super-app that pairs Bluetooth ESC/POS printers, stores per-printer settings, and prints a calibration page and any PDF (rasterised to the printer's dot width).

**Architecture:** An autolinked Expo module (`modules/bluetooth-printer`, Kotlin) does Bluetooth Classic SPP and `PdfRenderer` rasterisation; everything else — ESC/POS encoding, profiles, the test page image, the screen — is TypeScript. Native returns packed 1-bit rows as `Uint8Array`; TS encodes them and hands the bytes back to `send`.

**Tech Stack:** Expo 54 Modules API (Kotlin, coroutines), `android.graphics.pdf.PdfRenderer`, RFCOMM SPP, zustand + AsyncStorage, `expo-asset`, `expo-document-picker`, jest (node project).

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-09-29-superapp-bluetooth-printing-design.md`

## Global Constraints

- Repo: `C:\unirefund\super-app-safe`, branch `feat/bluetooth-printing` from `main` @ `0e69da70`. The IDE periodically runs `git pull --tags origin main` here — check `git branch --show-current` before each commit.
- Android only; `getBluetoothPrinter()` returns `null` on iOS and on a dev client without the module.
- Strings on the test page and its profile row are hard-coded English (spec decision).
- Colour only through semantic tokens (`tokens.test.ts` guard); no default-palette classes, no hex outside `TRACK_COLOR`-style native props.
- Comments only for the non-obvious (user preference: few comments).
- Profile defaults: paper `80`, widthDots `576` (58 → `384`), trimMargins `true`, mode `threshold`, threshold `160`, command `gsv0`, bandHeight `128`, chunkSize `512`, chunkDelayMs `15`, lingerMs `1500`, feedLines `4`, cut `none`.
- Native builds are the user's: hand over `npx expo run:android --device OrderPAD_3 --no-bundler` (in `super-app-safe`) and wait.
- Device: CPadNFC `LD38266200649` only, served from super-app-safe's bundler on **8096** via `C:\unirefund\dev-superapp-devices.ps1 -Project safe -Serial LD38266200649`.

## Review Focus

1. **Printer dies mid-job** (paper out, battery, range) → `E_WRITE_FAILED` naming bytes sent, and the *next* job is not stuck on `E_BUSY` (native `sending` resets in `finally`; screen `busy` resets in `finally`). Review item — not jest-reachable.
2. **Garbage in persisted settings** (older build, bad write) → sanitised to defaults, dangling default dropped. Test in Task 3.
3. **Typed non-number / empty / out-of-range numeric field** → reverts or clamps, never `NaN` to the printer. `parseSetting` test in Task 2.
4. **Multi-page PDF** → every page printed in order in one job. `encodePages` test in Task 4.
5. **Non-ASCII in printer-font text** (Turkish names) → `?`, not code-page garbage; **width not a multiple of 8** → byte width rounds up. Tests in Task 1.

---

## File map

| File | Responsibility |
|---|---|
| `src/features/printing/escpos.ts` | Pure ESC/POS encoder: `init`, `align`, `bold`, `doubleSize`, `text`, `line`, `feed`, `cut`, `raster` (`gsv0` bands / `escStar`), `concatBytes`, `rowBytes`, type `MonoImage` |
| `src/features/printing/profile.ts` | `PrinterProfile` type, `DEFAULT_SETTINGS`, `PAPER_DOTS`, `LIMITS`, `clampSetting`, `parseSetting`, `defaultProfile`, `withPaper`, `withWidth`, `sanitizeProfile`, `paperLabel`, `rasterOptions`, `sendOptions` |
| `src/features/printing/testPage.ts` | `rulerImage(width)`, `buildTestPage(profile, printedAt)` |
| `src/features/printing/printJob.ts` | `encodePages(pages, profile)` |
| `src/features/printing/devices.ts` | `displayName`, `sortDevices`, `addFound` |
| `src/features/printing/bluetoothPrinter.ts` | Native module types, `getBluetoothPrinter`, `requireBluetoothPrinter`, `printerErrorCode`, `printerErrorMessage` |
| `src/features/printing/permissions.ts` | `hasBluetoothPermissions`, `requestBluetoothPermissions` |
| `src/features/printing/samplePdf.ts` | `samplePdfUri()` via `expo-asset` |
| `src/store/printerSettings.ts` | Persisted profiles + default address; `useDefaultPrinter` |
| `modules/bluetooth-printer/**` | Kotlin module: `BluetoothPrinterModule.kt`, `SppConnection.kt`, `PdfRasterizer.kt`, manifest, gradle, config |
| `src/screens/staff/Printers/useBluetoothPrinters.ts` | Adapter/permission state, bonded + discovered lists, scan, pair |
| `src/screens/staff/Printers/PrinterTestScreen.tsx` (+ `_components/`) | The page |
| `src/app/(auth)/(modals)/printer-test.tsx` | Route |
| `src/screens/shared/Profile/StaffProfileScreen.tsx` | Android-only "Printer test" row |
| `metro.config.js`, `assets/printing/TagDetailReport_58MM_FRO.pdf`, `package.json` | `pdf` asset ext, sample, `expo-document-picker` |

---

### Task 0: Branch and baseline

- [ ] `git switch -c feat/bluetooth-printing` in super-app-safe.
- [ ] `npm run init` if `src/data/**/*.gen.json` is stale, then record `npm run typecheck`, `npm test`, `npm run lint` counts as this branch's baseline.

### Task 1: ESC/POS encoder

**Files:** Create `src/features/printing/escpos.ts`, Test `src/features/printing/__tests__/escpos.test.ts`

**Interfaces — Produces:**
```ts
export type MonoImage = { width: number; height: number; data: Uint8Array }; // rows of ceil(width/8) bytes, MSB first, 1 = black
export type RasterCommand = "gsv0" | "escStar";
export type CutKind = "none" | "partial" | "full";
export function raster(image: MonoImage, command: RasterCommand, bandHeight: number): Uint8Array;
export const init, align(a), bold(on), doubleSize(on), text(s), line(s?), feed(n), cut(kind), concatBytes(parts), rowBytes(width)
```

- [ ] **Tests first** (exact bytes):
  - `raster(576×10 black, "gsv0", 128)` starts `1D 76 30 00 48 00 0A 00`, length `8 + 720`.
  - 16×300 with band 128 → three headers at offsets 0, 264, 528 with rows 128, 128, 44; total `3·8 + 600`.
  - width 10 → header byte width `2`.
  - 8×300 band 1000 → height bytes `2C 01`.
  - `escStar` 8×24 with pixels (0,0) and (1,23): output `1B 33 18 1B 2A 21 08 00`, column 0 = `80 00 00`, column 1 = `00 00 01`, tail `0A 1B 32`.
  - `escStar` 8×25 black: second strip's first column `80 00 00` (white-padded rows).
  - `text("Aş\n")` → `41 3F 0A`; `feed(300)` → `1B 64 FF`; `cut("none")` empty, `cut("partial")` → `1D 56 42 00`, `cut("full")` → `1D 56 41 00`.
- [ ] Run `npx jest src/features/printing/__tests__/escpos.test.ts` → FAIL (module missing).
- [ ] Implement. `gsv0`: per band `GS v 0 m=0 xL xH yL yH` + `data.subarray(top·wb, (top+rows)·wb)`. `escStar`: `ESC 3 24`, per 24-row strip `ESC * 33 nL nH` + 3 bytes per column (top dot = bit 7, rows past the end white) + `LF`, finally `ESC 2`. `text` keeps `0x0A` and `0x20–0x7E`, else `0x3F`.
- [ ] Run → PASS. Commit `feat(printing): ESC/POS raster and text encoder`.

### Task 2: Printer profile

**Files:** Create `src/features/printing/profile.ts`, Test `src/features/printing/__tests__/profile.test.ts`

**Interfaces — Produces:**
```ts
export type PaperWidth = "58" | "80" | "custom";
export type ToneMode = "threshold" | "dither";
export type PrinterProfile = { address; name; paper: PaperWidth; widthDots; trimMargins: boolean; mode: ToneMode; threshold; command: RasterCommand; bandHeight; chunkSize; chunkDelayMs; lingerMs; feedLines; cut: CutKind };
export const PAPER_DOTS = { "58": 384, "80": 576 };
export const LIMITS: widthDots [8,2048], threshold [1,254], bandHeight [1,2048], chunkSize [16,65536], chunkDelayMs [0,1000], lingerMs [0,10000], feedLines [0,20];
export type NumericSetting = keyof typeof LIMITS;
export function clampSetting(key, value): number;            // rounds, clamps
export function parseSetting(key, text, fallback): number;   // "" / NaN → fallback
export function defaultProfile(address, name): PrinterProfile;
export function withPaper(profile, paper): PrinterProfile;   // 58/80 set widthDots; custom keeps it
export function withWidth(profile, dots): PrinterProfile;    // 384 → "58", 576 → "80", else "custom"
export function sanitizeProfile(raw: unknown): PrinterProfile | null;
export function paperLabel(profile): string;                 // "80 mm" | "custom"
export function rasterOptions(profile): { widthDots; trimMargins; mode; threshold };
export function sendOptions(profile): { chunkSize; chunkDelayMs; lingerMs };
```

- [ ] **Tests first:** defaults match Global Constraints; `withPaper(p,"58").widthDots === 384`, custom keeps 576; `withWidth(p,384).paper === "58"`, `withWidth(p,500).paper === "custom"`; `parseSetting("threshold","",160) === 160`, `"abc"` → 160, `"999"` → 254, `"12.6"` for feedLines → 13; `sanitizeProfile(null)`/`{}`/`{address:""}` → null; bad `widthDots: "x"` → 576; `widthDots: 5000` → 2048; `mode: "sepia"` → `"threshold"`; missing name → address.
- [ ] Run → FAIL; implement; run → PASS. Commit `feat(printing): printer profile defaults and sanitising`.

### Task 3: Persisted printer settings

**Files:** Create `src/store/printerSettings.ts`, Test `src/store/__tests__/printerSettings.test.ts`

**Interfaces:** Consumes `sanitizeProfile`, `PrinterProfile`. Produces default export `usePrinterSettingsStore` with `{ profiles: Record<string, PrinterProfile>; defaultAddress: string | null; saveProfile(p); setDefault(address | null) }`, persisted as `printer-settings-storage` v1 with `partialize` + a `merge` that sanitises each profile and drops a `defaultAddress` with no profile; and `useDefaultPrinter(): PrinterProfile | null`.

- [ ] **Tests first**, same harness as `deviceSettings.test.ts` (`jest.isolateModulesAsync`, seed AsyncStorage, `persist.rehydrate()`): fresh install empty/null; save + setDefault reflected in state; restored after reload; garbage profile dropped and dangling default → null; a profile with one bad field keeps the rest.
- [ ] FAIL → implement → PASS. Commit `feat(printing): persist printer profiles`.

### Task 4: Test page, job encoding, device helpers

**Files:** Create `testPage.ts`, `printJob.ts`, `devices.ts` in `src/features/printing/`; tests beside Task 1's.

**Interfaces — Produces:**
```ts
export function rulerImage(width: number): MonoImage;              // 64 rows
export function buildTestPage(profile: PrinterProfile, printedAt: Date): Uint8Array;
export function encodePages(pages: MonoImage[], profile: PrinterProfile): Uint8Array; // init + raster per page + feed + cut
export const displayName = (d: { name: string | null; address: string }) => string;
export function sortDevices(list: BluetoothDevice[]): BluetoothDevice[];   // printers first, then by name
export function addFound(list: BluetoothDevice[], d: BluetoothDevice): BluetoothDevice[]; // replace by address
```
Ruler: 8-dot solid edge bars on every row; rows 0–1 solid; 2-dot ticks every 8 dots, 8 rows tall, 16 at every 5 mm, 24 at every 10 mm; rows 40–63 a 4×4 checker.

- [ ] **Tests first:** ruler data length `72·64` at 576; pixels (0,y), (575,y), (567,y) black for y ∈ {0,30,63}; (566,30) white; (80,20) black, (88,20) white, (40,12) black, (40,20) white. `buildTestPage` starts `1B 40`, contains `1D 76 30 00 48 00 40 00`, and with `cut:"none"` ends with `1B 64 04`. `encodePages([a, b], p)` contains both headers in order, starts `1B 40`, ends feed (+ `1D 56 42 00` when `cut:"partial"`). `sortDevices` puts `isPrinter` first; `addFound` replaces an existing address; `displayName` falls back to address for blank names.
- [ ] FAIL → implement → PASS. Commit `feat(printing): calibration page and job encoding`.

### Task 5: Native module

**Files:** Create under `modules/bluetooth-printer/`: `expo-module.config.json` (`platforms: ["android"]`, module `expo.modules.bluetoothprinter.BluetoothPrinterModule`), `.gitignore` (as card-scanner), `android/build.gradle` (as card-scanner, no dependencies), `android/src/main/AndroidManifest.xml` (permissions per spec + `uses-feature bluetooth required=false`), `android/src/main/java/expo/modules/bluetoothprinter/{BluetoothPrinterModule,SppConnection,PdfRasterizer}.kt`.

**Interfaces — Produces (JS names):** `isSupported()`, `isEnabled()`, `requestEnable()`, `getBondedDevices()`, `startDiscovery()`, `cancelDiscovery()` (sync `Function`s); `pair(address)` (MAIN queue, settled by the bond receiver); `send(address, bytes, {chunkSize, chunkDelayMs, lingerMs}) → {bytesSent, millis}` and `rasterizePdf(uri, {widthDots, trimMargins, mode, threshold}) → [{width, height, data, previewUri}]` as `Coroutine` on `Dispatchers.IO` / `Default` — **not** the default queue, which is one shared `HandlerThread` that a multi-second print would stall for every Expo module. Events `onDeviceFound`, `onDiscoveryFinished`, `onAdapterStateChanged {enabled}`.

Key rules:
- One receiver (FOUND, DISCOVERY_FINISHED, STATE_CHANGED, BOND_STATE_CHANGED) registered `OnCreate`, `RECEIVER_EXPORTED` on 33+, unregistered `OnDestroy` (rejecting pending pairs).
- `SecurityException` → `E_PERMISSION`; adapter missing → `E_UNSUPPORTED`; off → `E_DISABLED`.
- `send`: `AtomicBoolean` busy guard reset in `finally`; cancel discovery; sockets tried secure → insecure → reflective channel 1; write chunks with delay; `E_WRITE_FAILED "Sent X of Y bytes."`; flush, sleep `lingerMs`, close.
- `rasterizePdf`: clear `cacheDir/printer-preview`; `file://`, bare path or `content://`; per page: white-filled ARGB, `Matrix` = translate(−left pt) then scale; trim pass finds ink columns at threshold, pads 2 % of width each side, re-renders the span from vector; rows > 20 000 → `E_PDF_FAILED`; threshold or Floyd–Steinberg (threshold as pivot); packs MSB-first; rewrites the bitmap to black/white and writes a timestamped PNG preview.

- [ ] Write the files. No JS test — verified on device (Task 8). Commit `feat(printing): Android Bluetooth SPP + PDF raster module`.

### Task 6: JS bridge, permissions, sample asset

**Files:** Create `bluetoothPrinter.ts`, `permissions.ts`, `samplePdf.ts`; Modify `metro.config.js` (`config.resolver.assetExts.push("pdf")`); add `assets/printing/TagDetailReport_58MM_FRO.pdf`; `npx expo install expo-document-picker`. Test `src/features/printing/__tests__/bluetoothPrinter.test.ts`.

**Interfaces — Produces:** `BluetoothDevice {address, name: string|null, isPrinter, bonded}`, `RasterPage = MonoImage & {previewUri}`, `BluetoothPrinterModule` (typed native surface incl. `addListener` overloads), `getBluetoothPrinter(): BluetoothPrinterModule | null`, `requireBluetoothPrinter()` (throws `{code:"E_UNSUPPORTED"}`), `printerErrorCode(err): PrinterErrorCode`, `printerErrorMessage(err): string` (plain-English line + native detail); `hasBluetoothPermissions()`, `requestBluetoothPermissions()` (SCAN+CONNECT on API ≥ 31, FINE_LOCATION below); `samplePdfUri(): Promise<string>`.

- [ ] **Tests first:** `printerErrorCode({code:"E_BUSY"}) === "E_BUSY"`, unknown/absent → `"E_UNKNOWN"`; `printerErrorMessage` of a coded error includes the native message; `requireBluetoothPrinter()` throws `E_UNSUPPORTED` when the module is absent (jest has none).
- [ ] FAIL → implement → PASS. Commit `feat(printing): JS bridge, permissions and bundled sample PDF`.

### Task 7: Test screen, route, profile row

**Files:** Create `src/screens/staff/Printers/useBluetoothPrinters.ts`, `PrinterTestScreen.tsx`, `_components/{StatusPanel,DeviceList,SettingsForm,PreviewPanel,Choice,NumberField}.tsx`, `src/app/(auth)/(modals)/printer-test.tsx`; Modify `StaffProfileScreen.tsx` (Android-only row "Printer test", icon `print-outline`, `router.push("/(auth)/(modals)/printer-test")`).

Behaviour:
- `useBluetoothPrinters`: one `useEffect` subscribes to the three events and checks permission on mount (cleanup removes listeners and cancels discovery); everything else event-driven (`grant`, `enable`, `scan`, `pair`, `refresh`).
- Selecting a bonded device saves `defaultProfile` if new and makes it the default — the default *is* the selection.
- Footer: action "Print test page"; `moreActions` "Preview sample PDF", "Pick a PDF…" (`getDocumentAsync({type:"application/pdf", copyToCacheDirectory:true})`). Disabled until a printer is selected (and, for printing, permission + adapter on).
- Preview panel: pages at `width/2` dp with `aspectRatio`, stats, a stale warning when `rasterOptions` changed since rendering, `Print` + `Re-render` buttons.
- Last job: bytes, rasterise/send ms, or the error message.
- `NumberField` keeps its own text, commits `parseSetting` on end-editing, resyncs when the stored value changes; form keyed by address.

- [ ] Implement. Regenerate typed routes (start super-app-safe's bundler once, Task 8) before trusting `tsc` on the new `router.push`.
- [ ] Gates: `npm run typecheck`, `npm test`, `npm run lint` — no new errors vs Task 0. Commit `feat(printing): printer test page`.

### Task 8: Build handoff and device QA (user present)

- [ ] Ask the user to run, in `C:\unirefund\super-app-safe`: `npx expo run:android --device OrderPAD_3 --no-bundler`. Wait for success or the error text.
- [ ] `C:\unirefund\dev-superapp-devices.ps1 -Project safe -Serial LD38266200649` (8096). Confirm `flags=[ DEBUGGABLE` and that the bundle contains `BluetoothPrinter`.
- [ ] With the user: grant permission, pair HM-E300 and MTP-3; test page on each (both edge bars visible at 576); sample PDF preview → print on each (QR scans, text legible); a picked PDF; printer-off → connect error; second job after an error works.
- [ ] Report per printer what printed, and anything unverified.
