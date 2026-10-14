# Sticker printing over ZPL: builder, printer profiles and the Unirefund Print Helper

**Status:** design approved 2026-10-14
**Apps:**
- web-app, `apps/web`: the sticker print dialog.
- New `print-helper` repo: .NET 10, Windows.

**Branches:**
- web-app: `feat/sticker-zpl-printing`, from `origin/main`.
- print-helper: `main`, in the new private repo `ayasofyazilim-clomerce/print-helper`. The repo is created only after this spec is approved.

## Why

**How stickers print today:** the dialog in `operations/stickers/[stickerId]/_components/print-sticker-lines.tsx` renders each 70×100 mm label as HTML. `react-to-print` passes it to the browser print dialog, then to the Windows driver. The QR is a 20 mm `react-qr-code` SVG at error correction level M.

**Why it looks soft:**
- The sticker URL is `{ssr}/tag/` plus base64url of `{s:<line>}`, about 52–57 bytes. At level M that makes a version 4 QR of 33×33 modules.
- 20 mm is 160 dots at 203 dpi and 236 dots at 300 dpi. That works out to **4.8 or 7.2 dots per module**.
- The driver rounds each module to a whole number of dots and dithers the edges. Modules come out uneven and soft.
- Clients with a Zebra ZT231 see this as noticeably worse scanning than raw ZPL.

**What changes:** ZPL's `^BQ` command makes the printer draw the QR itself, with a whole number of dots per module.

**Who uses it:** tenant admins holding `TagService.StickerHeaders` + `.GetLinesByHeaderId`, the same gate as today. It is a support tool with no revenue attached. So there is no .NET backend work and no certificates, and the installable part is a "nice to have" branded helper.

### Spike evidence (2026-10-13/14)

The test printer was the office Argox O4-250 at `192.168.1.19`: 203 dpi, PPLZ mode (Argox's ZPL emulation), network. The spike code was throwaway and is not kept.

| Finding | Consequence |
|---|---|
| Raw ZPL over TCP 9100 prints. `^BQN,2,5` (20.6 mm) was chosen over `^BQN,2,4`. | Module size is 5 dots at 203 dpi. |
| A `^MTT` job sent to a printer with no ribbon halts it ("ribbon not loaded"). Every later job queues behind it. TCP 9100 keeps accepting, so the sender cannot tell. | Never send `^MT` by default. It is a per-profile opt-in. |
| The pre-printed sticker roll fails the thermal scratch test. | It needs a thermal-transfer ribbon. It is untested in the office; the client's ZT231 has a ribbon. |
| The Argox centres the roll under its 108 mm head. `^PW` centres the print area, but the roll sat about 2 mm off-centre. | Recipe: `^PW` = full head width, offset = measured left edge. A blank 100×70 roll aligned at 90° with a 6 mm X offset. |
| Clients' current PDF path on the ZT231 already aligns correctly. | Offsets default to 0. Calibration is for centring printers like the Argox. |
| Artwork as `^GFA`: plain thresholding lost the grey form, dithering was noisy, solid-red with grey→black worked, and 4× supersampling at 40% coverage fixed small text. | That 4× / 40% conversion is the one adopted ("perfect" on paper). |
| A stored graphic (`~DGR:` + `^XGR:`) works, but **only in the same TCP stream**. A second connection opened right after a 112 KB job had its 356 bytes silently dropped. | One job = one self-contained stream. The helper sends jobs to a printer one at a time. |
| The Argox has no HTTP print endpoint: `POST /pstprnt` returns 405. | A networked Argox is reachable only through the helper. |
| QZ Tray 2.3.0 works, but unsigned mode cannot remember "Allow". | Rejected in favour of our own helper. |
| A Node prototype helper on `127.0.0.1:9180` with an origin allowlist and LAN-only targets printed the 112 KB job in 19 ms. Foreign or missing origin → 403; public IP or a port other than 9100 → 400. | The helper design is proven on network printers. |
| From `https://example.com`, Chrome 155 granted a one-time `loopback_network` permission, remembered across reloads. The preflighted JSON POST worked. | The portal will see one Chrome prompt per site. IT can pre-grant it with `LoopbackNetworkAllowedForUrls`. |

## Decisions

- **web-app builds all ZPL.** Transports only carry bytes.
- **v1 transports:**
  - Print Helper
  - Direct to Zebra, marked beta until verified on a ZT231
  - Browser print, improved
- **Later:** Web Serial, Web Bluetooth, a Zebra status query, code signing, auto-update, macOS, and tag labels.
- **Our own helper** replaces QZ Tray, Zebra Browser Print and a Chrome extension.
- **The helper:**
  - .NET 10, Windows only;
  - private repo;
  - installers hosted on our own storage (open question);
  - no certificates.
- **Printer profiles** live in `localStorage`, one set per PC and browser. Stickers only.

## A. The ZPL builder (web-app)

**Where:** pure `.ts` modules in `operations/stickers/[stickerId]/_components/zpl/`, each with a sibling `*.test.ts` for `pnpm --filter web test:unit`. There is no JSX in them.

**Modules:**

| Module | Responsibility |
|---|---|
| `profile.ts` | `PrinterProfile` type, zod schema, presets, and `localStorage` load/save wrapped in try/catch. An invalid entry is skipped, not thrown. |
| `geometry.ts` | mm → dots (`dots = round(mm × dpi / 25.4)`) and rotating a design rectangle onto the label stock |
| `qr.ts` | QR version and module count from data length, the module size `m`, and the guard against ZPL control characters |
| `layouts.ts` | The two sticker layouts, in millimetres on the 70×100 portrait design |
| `artwork.ts` | RGBA → black/white (4× / 40%), rotation, row packing, and the `~DG` command. It takes a plain pixel buffer, not a canvas. |
| `jobs.ts` | Label formats and chunking a book into jobs |
| `alignment-test.ts` | The ruler / frame / QR-position calibration label |

### Printer profile

| Field | Values | Default (Zebra preset) | Office Argox |
|---|---|---|---|
| `name` | text | "Zebra ZT231" | "Argox O4-250" |
| `transport` | `helper` \| `zebra-direct` | `helper` | `helper` |
| `target` | `{ kind: "network", host }` \| `{ kind: "queue", name }` | — | network `192.168.1.19` |
| `dpi` | 203 \| 300 | 203 | 203 |
| `headWidthMm` | number | 104 (ZT231) | 108 |
| `labelWidthMm` × `labelHeightMm` | the stock as loaded; width runs across the head | 70 × 100 | 100 × 70 |
| `rotation` | 0 \| 90 \| 180 \| 270 | 0 | 90 |
| `offsetXmm`, `offsetYmm` | numbers, may be negative | 0, 0 | 6, 0 |
| `media` | `printer` (send nothing) \| `ribbon` (`^MTT`) \| `direct` (`^MTD`) | `printer` | `printer` |

There are three presets: Zebra ZT231 203 dpi, Zebra ZT231 300 dpi, and Argox O4-250.

**Browser print** is not a profile. It always appears in the picker, with its own resolution select.

### Layouts (mm, on the 70×100 portrait design)

- **Pre-printed:**
  - QR only.
  - It is centred in today's 20 mm box, which spans x 48–68 and y 13–33, so the centre is (58, 23).
- **Artwork:**
  - The full sticker artwork, from today's `unirefund_sticker_70x100mm.pdf`.
  - The QR is centred at **(57.1, 24.8)**, on a white plate the size of the QR plus a 2.5 mm quiet zone on every side.
  - Placed this way it clears the header, the right edge, the intro text and "FULL NAME" by about 3 mm. These are the positions approved on paper on 2026-10-14.

### QR

- **Version:** the smallest version whose byte-mode capacity at level M is at least the data length. Capacities for v1–v10: 14, 26, 42, 62, 84, 106, 122, 152, 180, 213.
- **Module count:** `n = 17 + 4·version`.
- **Module size:** `m = round(20 mm × dpi/25.4 ÷ n)`, which gives 5 at 203 dpi and 7 at 300 dpi. If the QR plus quiet zone would not fit the layout's free area, `m` steps down by one.
- **Field:** `^FO{x},{y}^BQN,2,{m}^FDMA,{data}^FS`. The origin is the layout centre minus half of `n·m`.
- **Version drift:** in automatic mode the printer may pick a smaller version than the byte-mode estimate. The code then stays centred to within one module, and the alignment test makes this visible.
- **Bad data:** data containing `^` or `~` cannot be encoded. That label is skipped and counted (see D).

### Geometry

**Rotation** maps a design rectangle `(x, y, w, h)`, with design size `W × H = 70 × 100`, onto the stock:

| Rotation | Stock position |
|---|---|
| 0 | `(x, y)` |
| 90 | `(H−y−h, x)` |
| 180 | `(W−x−w, H−y−h)` |
| 270 | `(y, W−x−w)` |

**Fit check:** the profile's stock must hold the design in the rotated orientation. The dialog warns if it does not.

**Every label format:**
- `^PW` = head width in dots.
- `^LL` = stock length in dots.
- `^LH0,0`, with the offsets **added to every field origin** so negative offsets work. Anything pushed below 0 is clipped, and the artwork is cropped to match.
- `^MTT` or `^MTD` only when the profile's `media` field asks for it.

### Artwork

1. **Render:** the PDF is rendered with pdf.js at 4× the target dot size (width = `round(70 × dpi/25.4) × 4`). This reuses the lazy `loadStickerBackground` pattern.
2. **Classify ink:** a sub-pixel is ink when it is red (`r > 140 && g < 110 && b < 110`) or when its luminance is below 225.
3. **Downsample:** a printer dot is black when at least **40%** of its 4×4 block is ink.
4. **Rotate:** the bitmap is rotated per the profile.
5. **Pack:** rows are packed MSB-first, with 1 meaning black.
6. **Store:** `~DGR:UNISTK.GRF,{totalBytes},{bytesPerRow},{HEX}`. That is 56,000 bytes (112 KB hex) at 203 dpi, and about 122,800 bytes (246 KB hex) at 300 dpi.

Each label recalls it with `^FO{offset}^XGR:UNISTK.GRF,1,1^FS`, then draws the white plate (`^GB{s},{s},{s},W`) and the QR. Z64 compression is a later option, not v1.

### Jobs

- A book is split into chunks of **500 labels**.
- A job is the `~DG` artwork (artwork layout only) followed by the chunk's label formats, about 180 bytes per label with artwork and about 120 bytes without.
- Every job is self-contained and goes out as one request or stream.

### Alignment test

One label, built from the profile:
- a horizontal millimetre ruler across the full head (1 mm ticks for the first and last 15 mm);
- a vertical ruler down the stock;
- a frame at the stock size with the current offsets applied;
- the layout's QR position.

The admin reads the paper edges off the rulers and enters the offsets. This replaces the hand-made `RULER2` / `ALIGN1` labels from the spike.

## B. The print dialog (web-app)

**What stays:** `PrintStickerLines` keeps loading labels through `getStickerLabelsAction` (same gate), and keeps "unused only". The artwork toggle selects the **Artwork** layout. "A4 test" applies to browser print only. **No new actions or endpoints.**

**Printer picker** at the top: the saved profiles, plus **Browser print**, which is always present.

**"Manage printers" sheet:**
- add, edit and delete profiles;
- apply a preset;
- pick the target from the helper's `/printers?scan=1` (network hosts and USB queues), or type an IP;
- **Print alignment test**.

**Helper client** (`helper-client.ts`):
- Calls `http://127.0.0.1:9180`, with a 1.5 s timeout on `/status`. Detection runs in the dialog's open handler, not in an effect.
- Holds `MIN_HELPER_VERSION` and `HELPER_DOWNLOAD_URL` as constants.
- **Missing:** a banner with an **Install** link and "Use browser print".
- **Older than the minimum:** printing is still allowed, with an "Update available" link.

**Sending ZPL** (helper or direct):
- Jobs are sent **sequentially**.
- A `Progress` bar shows "job 3/10 · 1,500/5,000 labels", with **Cancel** between jobs.
- If a job fails, the dialog stops and names the label range not sent, with **Retry from here**.
- The preview shows a few sample labels and the count. The full-book DOM preview remains only for browser print.

**Direct to Zebra** (`zebra-direct.ts`):

```ts
fetch(`http://${host}/pstprnt`, {
  method: "POST",
  mode: "no-cors",
  body: job,
  targetAddressSpace: "local",
} as RequestInit);
```

- `targetAddressSpace: "local"` exempts the private-IP request from mixed-content blocking. Chrome asks for `local_network` once per site.
- The response is opaque, so the UI says "sent", not "printed".
- It is offered on Chromium browsers only, and labelled beta until the ZT231 check (see E).

**Browser print, improved:**
- Same `react-to-print` flow.
- The QR is drawn from its module matrix to a canvas at `m` pixels per module for the chosen resolution (203 / 300 / 600, default 203). The matrix comes from `qrcode-generator`, the encoder `react-qr-code` 2.2.0 already uses, now declared as a direct dependency of `apps/web`.
- It is shown as an `<img>` sized `n·m ÷ (dpi/25.4)` mm, with `image-rendering: pixelated`.
- This is a best-effort fix: it holds only when the driver prints at 100%.

**Conventions:**
- New strings go in `TagService` en/tr.
- `data-testid` on every required component.
- Only `@repo/ayasofyazilim-ui` components (`Select`, `Sheet`, `Input`, `Switch`, `Progress`, `Button`).
- No `useEffect` fetching.
- `localStorage` access wrapped in try/catch.

## C. Unirefund Print Helper (.NET 10, Windows)

**Shape:**
- A WinForms tray app hosting Kestrel minimal APIs on **`127.0.0.1:9180`**.
- Kestrel binds the port directly, so no URL reservation and no admin rights are needed.
- Published as a self-contained single-file `win-x64` exe.

**Repo layout:**
- `src/Unirefund.PrintHelper`
- `tests/Unirefund.PrintHelper.Tests` (xUnit)
- `installer/print-helper.iss` (Inno Setup)
- `.github/workflows/build.yml`
- `README.md`, `AGENTS.md`

### API

| Endpoint | Request | Response |
|---|---|---|
| `GET /status` | — | `{ name: "Unirefund Print Helper", version, apiVersion: 1 }` |
| `GET /printers?scan=1` | — | `{ queues: [{ name, driver, port }], network: [{ host, port: 9100 }] }` |
| `POST /print` | `{ target: { kind: "network", host, port } \| { kind: "queue", name }, data, jobName }` | `{ ok: true, bytes, ms }` |

Errors come back as `{ ok: false, error: { code, message } }`:

| Status | Meaning |
|---|---|
| 400 | bad target or body |
| 403 | origin or host not allowed |
| 404 | queue not found |
| 502 | printer connect or write failed |
| 504 | printer timeout |

**What each endpoint does:**
- **`/printers`:**
  - **Queues:** the Windows printer queues.
  - **Network scan:** each active private IPv4 `/24` interface, port 9100 only, 1.5 s connect timeout, bounded parallelism.
- **`/print` to a network target:** opens a TCP connection, writes the whole job, and closes.
- **`/print` to a queue target:** winspool `OpenPrinter` → `StartDocPrinter` with datatype `RAW` → `WritePrinter` → `EndDocPrinter`.

### Security

- **Bind:** `127.0.0.1` only. The helper is not reachable from the LAN and triggers no firewall prompt.
- **Origin allowlist:**
  - `https://portal.unirefund.com`, `https://uat.unirefund.com` and `https://dev.unirefund.com`.
  - `http://localhost:3000` only when listed in `%LOCALAPPDATA%\Unirefund\PrintHelper\settings.json` (`extraAllowedOrigins`).
  - A missing or unknown origin gets 403. CORS preflights are answered for allowed origins only.
- **Host header:** must be `127.0.0.1:9180` or `localhost:9180`. This blocks DNS rebinding.
- **Targets:**
  - private IPv4 only (10/8, 172.16/12, 192.168/16) on port 9100;
  - a queue must exist in the PC's printer list.
- **Limits:**
  - 20 MB request body;
  - **one job at a time per target**, serialised inside the helper.

### Tray, logs, install, release

- **Tray menu:** status and version, "Start with Windows", "Open logs", "Quit".
- **Logs:** rolling files under `%LOCALAPPDATA%\Unirefund\PrintHelper\logs`. They record target, size and outcome only, never label data.
- **Installer:** Inno Setup, **per user**, installing to `%LOCALAPPDATA%\Programs\Unirefund Print Helper`. Autostart uses `HKCU\…\Run`. It needs no admin rights, launches after install, and registers an uninstaller under HKCU.
- **Signing:** unsigned in v1. Admins will see "Keep anyway" in Chrome and "Run anyway" in SmartScreen.
- **Versioning and CI:**
  - SemVer.
  - CI on `windows-latest`: build, test, `dotnet publish`, then Inno Setup. The result is a build artifact.
  - Uploading to our storage is manual until the storage is chosen.

### Tests

- **xUnit:**
  - origin, host and target validation;
  - the endpoints through `WebApplicationFactory`;
  - network printing against a fake TCP listener;
  - scan subnet selection.
- **Manual:** USB spooler printing on a real USB printer.

## D. Error handling

| Situation | Behaviour |
|---|---|
| Helper not running or not installed | Banner with **Install** and "Use browser print" |
| Helper older than `MIN_HELPER_VERSION` | Printing allowed, with "Update available" |
| Printer unreachable or times out (helper) | Stop, then "Labels 1,501–5,000 were not sent" with **Retry from here** |
| USB queue gone | Error naming the queue; the profile is flagged for re-setup |
| Direct to Zebra fetch rejects (offline, permission denied) | Error with "allow local network access for this site" help |
| Chrome local-network permission blocked | Site-settings instructions, plus the IT policy names |
| Label QR unencodable | Skipped and counted, like today's `QrUnavailable` message |
| Artwork render fails | The toggle reverts with a toast, as today |
| Printer-side fault (paper, ribbon, pause) | Not detectable: the Argox never answers status. Standing note: "If nothing prints, check the printer's light." |

## E. Phasing and verification

- **Phase 1 (this spec):**
  - **web-app:** sections A and B.
  - **print-helper v1:** section C.
- **Later:** Web Serial, Web Bluetooth, a Zebra status query over 9100 (`~HQES`), code signing, auto-update, macOS, and tag labels.

**Verify on the office Argox:**
- the helper's network path;
- both layouts, with geometry checked on the blank 100×70 roll;
- the alignment test round trip;
- book chunking on a multi-job print.

**Verify on the client's ZT231**, which has a ribbon and the pre-printed 70×100 roll:
- pre-printed alignment (expected: 0° and no offset);
- the `^BQ` origin;
- Direct to Zebra, which drops "beta" if it passes;
- USB through the helper, if their printer is on USB;
- 300 dpi, if theirs is a 300 dpi model.

**Gates:**
- **web-app:** `pnpm --filter web type-check`, `lint` and `test:unit` held at their AGENTS.md baselines; `pnpm i18n:missing` / `i18n:unused` for web; `pnpm policy:audit`.
- **print-helper:** CI green.

## Open questions

1. Which storage hosts the installer, and the final `HELPER_DOWNLOAD_URL`.
2. Whether any tenant reaches the portal on a custom domain that must join the origin allowlist.
3. Documentation: a `print-helper` row in the workspace `AGENTS.md` table, and the repo's own `AGENTS.md`.
