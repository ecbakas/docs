# Sticker printing over ZPL (web-app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The sticker book's "Print labels" dialog can send labels as ZPL to a label printer, through the Unirefund Print Helper or straight to a networked Zebra. That gives native-quality QR codes, with printer profiles, an alignment test and the artwork option. Browser print stays as the always-available fallback with a sharper QR.

**Architecture:**
- **Pure, unit-tested modules** in `_components/zpl/`:
  - `geometry`, `qr`, `layouts`, `profile`, `profile-draft`, `artwork`, `jobs`, `alignment-test`;
  - they turn a profile plus labels into self-contained ZPL jobs.
- **Transports** in `_components/transports/`:
  - `helper-client`, `zebra-direct`, `print-run`, `send`;
  - they carry jobs one at a time.
- **UI:** two new components (`printer-picker`, `manage-printers-sheet`) and the reworked dialog wire it up. No new server actions or endpoints.

**Tech Stack:** Next.js 16 / React 19 client components, `@repo/ayasofyazilim-ui`, `react-qr-code`, `qrcode-generator` (new direct dependency), `pdfjs-dist`, Node's test runner via `pnpm --filter web test:unit`.

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-10-14-sticker-zpl-printing-design.md`, sections A, B, D and E. Read it first. The helper app is a separate plan, `2026-10-14-print-helper.md`. This plan depends only on its HTTP contract: `127.0.0.1:9180`, `/status`, `/printers`, `/print`.

**Where the pure modules came from:** the code in Tasks 1–6 was written and run before this plan was saved. **81 tests passed** and strict `tsc` was clean under web-app's own compiler settings, including `noUncheckedIndexedAccess`. Treat it as correct and copy it exactly. If a test fails in the worktree, investigate the environment before changing the code.

**Implementation choices that refine the spec** (reviewers: these are deliberate):

| # | Spec says | This plan does | Why |
|---|---|---|---|
| 1 | QR version from a hand-written byte-capacity table | `qrcode-generator` computes it | It's the encoder `react-qr-code` already uses, so it's exact |
| 2 | Browser print draws the QR to a canvas per label | The existing SVG QR gets an exact whole-dot size and `shape-rendering: crispEdges` | Same whole-dot modules without thousands of canvases |
| 3 | (unspecified) | Browser print's "Add background" uses the approved artwork QR position, the same as ZPL | One layout for both paths |
| 4 | Installer link (open question 1) | `HELPER_DOWNLOAD_URL` is `null` | The banner asks admins to contact Unirefund until storage is chosen; adding the URL later is one line |

## Global Constraints

- **Workspace:** work only in the worktree `C:\unirefund\web-app-wt-sticker-zpl`, on branch `feat/sticker-zpl-printing` from `origin/main` (Task 0). The main checkout `C:\unirefund\web-app` is shared with other sessions: never `git reset --hard`, `git stash` or switch branches there.
- **App rules:** read `web-app/AGENTS.md` and `.claude/rules/` before writing code.
  - No hard-coded UI strings; keys go in `TagService` en **and** tr.
  - Only `@repo/ayasofyazilim-ui` components.
  - `data-testid` on every Label, Button, Input, Switch, SelectTrigger, SheetTrigger and DialogTrigger.
  - No `useEffect`.
- **No backend changes:** no new server actions or endpoints. The print permission gate stays `["TagService.StickerHeaders", "TagService.StickerHeaders.GetLinesByHeaderId"]`.
- **Helper contract:** `http://127.0.0.1:9180`, `MIN_HELPER_VERSION = "1.0.0"`, `HELPER_DOWNLOAD_URL = null`.
- **ZPL rules** (spec A):
  - **QR:** `^BQN,2,m` at level M, with `m` = whole dots per module closest to 20 mm (5 at 203 dpi, 7 at 300 dpi).
  - **Geometry:** `^PW` = full head width; profile offsets added to every field origin and clamped at 0.
  - **Media:** no `^MT` unless the profile's `media` asks for one.
  - **Jobs:** 500 labels each, every job self-contained.
  - **Artwork:** stored with `~DGR:UNISTK.GRF` and recalled with `^XGR:UNISTK.GRF,1,1`. Converted at 4×: ink = red, or luminance < 225; a dot is black at ≥ 40% ink.
- **Layouts** (mm on the 70×100 design):
  - pre-printed: QR centred at (58, 23);
  - artwork: QR centred at (57.1, 24.8) on a white plate with 2.5 mm padding.
- **Gates:** hold the baselines you measure in Task 0. They are expected to match `web-app/AGENTS.md`: type-check 2 errors (the `capture-core` mrz TS2307s), lint 0 errors, `i18n:unused` 1 unreachable (`ManualVerification.*`).
- **Lockfile:** `pnpm add` re-resolves `tailwind-merge` 3.6.0 → 3.7.0. Hand-revert that (Task 1, Step 2).
- **Commits:** quoted heredoc (`git commit -F - <<'EOF'`) with no backslashes or backticks inside, ending with:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  Stage route paths with `:(literal)`, because `[lang]` and `[stickerId]` are glob characters to git.
- **Comments:** few. Explain a non-obvious why only.

## Review Focus

1. **A Turkish admin types a decimal comma** ("6,5") in an offset or size field. It must be read as 6.5, not rejected or read as 65. Pinned by `profile-draft.test.ts` → `parseMm` (Task 3).
2. **A profile whose rotation doesn't fit the loaded roll** (a turned design on a 70×100 roll). Print must be blocked with a warning, not print clipped labels across two stickers. Pinned by `profileFitsDesign` tests (Task 3). The dialog disables Print on it (Task 9).
3. **The Print Helper quits or crashes mid-book.** The run stops at that job, names the labels not sent, and "Continue from here" resumes there. Pinned by `transports.test.ts` → `runPrintJobs` / `unsentRange` and the `helper-missing` mapping (Task 6).
4. **Every label in the book lacks a QR, or the book is empty.** Nothing is sent and nothing claims success. Pinned by `jobs.test.ts` → "returns no jobs, only skips" and "returns no jobs for an empty book" (Task 5).
5. **A large book (1,234 labels)** splits into 500 + 500 + 234, with correct label ranges for the failure message. Pinned by `jobs.test.ts` (Task 5).

---

### Task 0: Worktree and baselines

**Files:** none (environment only).

- [ ] **Step 1: Check nothing is mid-run, then create the worktree**

```bash
git -C /c/unirefund/web-app status --short | head
git -C /c/unirefund/web-app fetch origin
git -C /c/unirefund/web-app worktree add -b feat/sticker-zpl-printing /c/unirefund/web-app-wt-sticker-zpl origin/main
```

- [ ] **Step 2: Populate the two submodules at their pinned commits**

```bash
cd /c/unirefund/web-app-wt-sticker-zpl
git submodule update --init --recursive || for p in packages/ayasofyazilim-ui packages/utils; do
  sha=$(git ls-tree HEAD "$p" | awk '{print $3}')
  rm -rf "$p"
  git clone --no-hardlinks "/c/unirefund/web-app/$p" "$p" && git -C "$p" checkout "$sha"
done
git status --short
```

Expected: `git status` is clean.
- The fallback clones from the sibling checkout. It is needed when `git submodule update` fails; it fails in some worktree setups.
- `rm -rf` only ever touches the two empty submodule folders inside this new worktree.

- [ ] **Step 3: Copy the gitignored files the build needs, install, measure baselines**

```bash
cd /c/unirefund/web-app-wt-sticker-zpl
cp /c/unirefund/web-app/apps/web/.env apps/web/.env
mkdir -p apps/web/src/language-data/i18n
cp /c/unirefund/web-app/apps/web/src/language-data/i18n/*.gen.json apps/web/src/language-data/i18n/
cp /c/unirefund/web-app/apps/web/next-env.d.ts apps/web/next-env.d.ts
pnpm install --frozen-lockfile
pnpm --filter web test:unit 2>&1 | grep -E '^# (tests|pass|fail)'
pnpm --filter web type-check 2>&1 | grep -c 'error TS'
pnpm --filter web lint 2>&1 | tail -3
```

Write the three numbers down: unit tests passing, type errors, and lint errors/warnings. Every later gate compares against them. Expected:
- 0 failing tests;
- 2 type errors, both TS2307 on `capture-core/detectors/mrz`;
- 0 lint errors.

---

### Task 1: QR encoder dependency and the geometry module

**Files:**
- Modify: `apps/web/package.json`, `pnpm-lock.yaml`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/geometry.ts`
- Test: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/geometry.test.ts`

**Interfaces:**
- Produces:
  - **Types:** `type Rotation = 0 | 90 | 180 | 270`, `type SizeMm`, `type RectMm`
  - **Constant:** `DESIGN_SIZE_MM` (70 × 100)
  - **Functions:**
    - `dotsPerMm(dpi)`, `mmToDots(mm, dpi)`
    - `rotateRect(rect, rotation, design?)`
    - `rotatedDesignSize(rotation, design?)`
    - `designFitsStock(rotation, stock, design?)`

- [ ] **Step 1: Add `qrcode-generator`**

Run from the worktree root: `pnpm --filter web add qrcode-generator@^2.0.4`

- [ ] **Step 2: Hand-revert the `tailwind-merge` bump**

Run: `git diff -- pnpm-lock.yaml | grep -n 'tailwind-merge'`

If it prints anything, restore `tailwind-merge` to 3.6.0 in `pnpm-lock.yaml`. There are three spots:
- the `packages:` entry, with its old integrity hash (copy both from `git show HEAD:pnpm-lock.yaml`);
- the `snapshots:` key;
- the one `tailwind-merge: 3.7.0` reference.

Then verify:

```bash
git show HEAD:pnpm-lock.yaml > /tmp/base-lock.yaml
diff /tmp/base-lock.yaml pnpm-lock.yaml | grep '^[<>]' | grep -v qrcode-generator
pnpm install --frozen-lockfile --offline
```

Expected:
- the `diff | grep` prints only lines belonging to `qrcode-generator`'s own entries, or nothing;
- the frozen install succeeds.

- [ ] **Step 3: Write the failing test**

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/geometry.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  designFitsStock,
  mmToDots,
  rotateRect,
  rotatedDesignSize,
} from "./geometry";

describe("mmToDots", () => {
  it("uses 8 dots per mm at 203 dpi and 11.8 at 300 dpi", () => {
    assert.equal(mmToDots(70, 203), 559);
    assert.equal(mmToDots(100, 203), 799);
    assert.equal(mmToDots(108, 203), 863);
    assert.equal(mmToDots(70, 300), 827);
  });
});

describe("rotateRect", () => {
  const qrBox = { x: 48, y: 13, w: 20, h: 20 };

  it("leaves the rectangle alone at 0", () => {
    assert.deepEqual(rotateRect(qrBox, 0), qrBox);
  });

  it("moves the design's top edge to the stock's right at 90", () => {
    assert.deepEqual(rotateRect(qrBox, 90), { x: 67, y: 48, w: 20, h: 20 });
  });

  it("mirrors both axes at 180", () => {
    assert.deepEqual(rotateRect(qrBox, 180), { x: 2, y: 67, w: 20, h: 20 });
  });

  it("moves the design's top edge to the stock's left at 270", () => {
    assert.deepEqual(rotateRect(qrBox, 270), { x: 13, y: 2, w: 20, h: 20 });
  });

  it("swaps width and height for a non-square rectangle at 90 and 270", () => {
    const bar = { x: 0, y: 0, w: 70, h: 11 };
    assert.deepEqual(rotateRect(bar, 90), { x: 89, y: 0, w: 11, h: 70 });
    assert.deepEqual(rotateRect(bar, 270), { x: 0, y: 0, w: 11, h: 70 });
  });
});

describe("rotatedDesignSize / designFitsStock", () => {
  it("turns 70x100 into 100x70 at 90 and 270", () => {
    assert.deepEqual(rotatedDesignSize(90), { w: 100, h: 70 });
    assert.deepEqual(rotatedDesignSize(180), { w: 70, h: 100 });
  });

  it("fits the portrait design on a 70x100 roll only upright or upside down", () => {
    assert.equal(designFitsStock(0, { w: 70, h: 100 }), true);
    assert.equal(designFitsStock(180, { w: 70, h: 100 }), true);
    assert.equal(designFitsStock(90, { w: 70, h: 100 }), false);
  });

  it("fits it on a 100x70 roll only turned", () => {
    assert.equal(designFitsStock(90, { w: 100, h: 70 }), true);
    assert.equal(designFitsStock(270, { w: 100, h: 70 }), true);
    assert.equal(designFitsStock(0, { w: 100, h: 70 }), false);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm --filter web test:unit 2>&1 | grep -E 'geometry|Cannot find module|^# fail'`
Expected: an `ERR_MODULE_NOT_FOUND` / `Cannot find module` naming `zpl/geometry`.

- [ ] **Step 5: Implement**

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/geometry.ts`:

```ts
export type Rotation = 0 | 90 | 180 | 270;
export type SizeMm = { w: number; h: number };
export type RectMm = { x: number; y: number; w: number; h: number };

/** The sticker artwork and both layouts are drawn on a 70x100mm portrait sheet. */
export const DESIGN_SIZE_MM: SizeMm = { w: 70, h: 100 };

export function dotsPerMm(dpi: number): number {
  return dpi / 25.4;
}

export function mmToDots(mm: number, dpi: number): number {
  return Math.round(mm * dotsPerMm(dpi));
}

/**
 * Where a rectangle of the upright design lands once the design is turned
 * clockwise by `rotation` onto the label stock. 90 puts the design's top edge
 * on the stock's right; 270 puts it on the left.
 */
export function rotateRect(
  rect: RectMm,
  rotation: Rotation,
  design: SizeMm = DESIGN_SIZE_MM
): RectMm {
  const { x, y, w, h } = rect;
  switch (rotation) {
    case 0:
      return { x, y, w, h };
    case 90:
      return { x: design.h - y - h, y: x, w: h, h: w };
    case 180:
      return { x: design.w - x - w, y: design.h - y - h, w, h };
    case 270:
      return { x: y, y: design.w - x - w, w: h, h: w };
  }
}

export function rotatedDesignSize(
  rotation: Rotation,
  design: SizeMm = DESIGN_SIZE_MM
): SizeMm {
  return rotation === 90 || rotation === 270
    ? { w: design.h, h: design.w }
    : { w: design.w, h: design.h };
}

/** Half a millimetre of slack: label stock is sold in nominal sizes. */
export function designFitsStock(
  rotation: Rotation,
  stock: SizeMm,
  design: SizeMm = DESIGN_SIZE_MM
): boolean {
  const footprint = rotatedDesignSize(rotation, design);
  return footprint.w <= stock.w + 0.5 && footprint.h <= stock.h + 0.5;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter web test:unit 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: `# fail 0`, and `# pass` equals the Task 0 baseline **+ 9**.

- [ ] **Step 7: Commit**

```bash
cd /c/unirefund/web-app-wt-sticker-zpl
git add apps/web/package.json pnpm-lock.yaml ':(literal)apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl'
git commit -F - <<'EOF'
feat(stickers): label geometry for ZPL printing

mm to printer dots, and where a rectangle of the 70x100 sticker lands when
the design is turned onto the loaded roll. Adds qrcode-generator, the
encoder react-qr-code already uses, as a direct dependency.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: QR sizing and the two layouts

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/qr.ts`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/layouts.ts`
- Test: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/qr.test.ts`

**Interfaces:**
- Consumes: `dotsPerMm` (Task 1).
- Produces:
  - **qr:** `QR_TARGET_MM`, `qrModuleCount(data)`, `qrMagnification(modules, dpi, maxSizeMm)`, `qrSizeMm(modules, m, dpi)`, `isZplSafe(data)`
  - **layouts:** `type LayoutKind = "preprinted" | "artwork"`, `type StickerLayout`, `LAYOUTS`

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/qr.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isZplSafe, qrMagnification, qrModuleCount, qrSizeMm } from "./qr";

const STICKER_URL = "https://ssr-dev.unirefund.com/tag/e3M6WlBMVEVTVDAwMDAwMX0";

describe("qrModuleCount", () => {
  it("makes a real sticker URL a version 4 code (33 modules)", () => {
    assert.equal(qrModuleCount(STICKER_URL), 33);
  });

  it("steps up a version exactly at the byte capacity for level M", () => {
    assert.equal(qrModuleCount("x".repeat(42)), 29);
    assert.equal(qrModuleCount("x".repeat(43)), 33);
  });
});

describe("qrMagnification", () => {
  it("picks 5 dots per module at 203 dpi and 7 at 300 dpi", () => {
    assert.equal(qrMagnification(33, 203, 21), 5);
    assert.equal(qrMagnification(33, 300, 21), 7);
  });

  it("steps down until the code fits the space", () => {
    assert.equal(qrMagnification(33, 203, 18), 4);
  });

  it("never goes below 1 or above ZPL's 10", () => {
    assert.equal(qrMagnification(177, 203, 5), 1);
    assert.equal(qrMagnification(21, 600, 100), 10);
  });

  it("reports the printed size", () => {
    assert.equal(Math.round(qrSizeMm(33, 5, 203) * 10) / 10, 20.6);
    assert.equal(Math.round(qrSizeMm(33, 7, 300) * 10) / 10, 19.6);
  });
});

describe("isZplSafe", () => {
  it("accepts a sticker URL", () => {
    assert.equal(isZplSafe(STICKER_URL), true);
  });

  it("rejects ZPL control characters and non-ASCII", () => {
    assert.equal(isZplSafe("a^XZ"), false);
    assert.equal(isZplSafe("a~JA"), false);
    assert.equal(isZplSafe("tag/ç"), false);
    assert.equal(isZplSafe("line\nbreak"), false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test:unit 2>&1 | grep -E 'zpl/qr|Cannot find module|^# fail'`
Expected: `Cannot find module` naming `zpl/qr`.

- [ ] **Step 3: Implement**

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/qr.ts`:

```ts
import qrcode from "qrcode-generator";
import { dotsPerMm } from "./geometry";

export const QR_TARGET_MM = 20;

/** ZPL's ^BQ accepts a magnification of 1 to 10 dots per module. */
const MAX_MAGNIFICATION = 10;

/**
 * Modules per side for `data` at error correction M in byte mode, the same
 * encoder react-qr-code uses, so the browser preview and the printed code agree.
 */
export function qrModuleCount(data: string): number {
  const qr = qrcode(0, "M");
  qr.addData(data, "Byte");
  qr.make();
  return qr.getModuleCount();
}

/**
 * Whole dots per module, chosen so the code comes out closest to 20mm, then
 * stepped down until it fits `maxSizeMm`. A whole number of dots per module
 * is the entire point of printing ZPL: a fractional one is what blurs PDFs.
 */
export function qrMagnification(
  modules: number,
  dpi: number,
  maxSizeMm: number
): number {
  const dpmm = dotsPerMm(dpi);
  let m = Math.min(
    MAX_MAGNIFICATION,
    Math.max(1, Math.round((QR_TARGET_MM * dpmm) / modules))
  );
  while (m > 1 && (modules * m) / dpmm > maxSizeMm) m--;
  return m;
}

export function qrSizeMm(modules: number, magnification: number, dpi: number) {
  return (modules * magnification) / dotsPerMm(dpi);
}

/** `^` and `~` start ZPL commands, so a value carrying one cannot be printed as data. */
export function isZplSafe(data: string): boolean {
  return /^[\x20-\x7e]*$/.test(data) && !/[\^~]/.test(data);
}
```

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/layouts.ts`:

```ts
export type LayoutKind = "preprinted" | "artwork";

export type StickerLayout = {
  kind: LayoutKind;
  /** Centre of the QR on the upright 70x100mm design. */
  qrCenterMm: { x: number; y: number };
  /** Largest QR side the free space allows; magnification steps down to fit. */
  qrMaxMm: number;
  /** White plate around the QR, so the quiet zone survives artwork beneath it. */
  platePaddingMm: number | null;
  artwork: boolean;
};

export const LAYOUTS: Record<LayoutKind, StickerLayout> = {
  // Pre-printed rolls carry their own artwork with a 20mm QR box 13mm from the
  // top and 2mm from the right: centre (58, 23).
  preprinted: {
    kind: "preprinted",
    qrCenterMm: { x: 58, y: 23 },
    qrMaxMm: 21,
    platePaddingMm: null,
    artwork: false,
  },
  // Approved on paper 2026-10-14: centred in the free area beside the intro
  // text, ~3mm clear of the header, the right edge, the text and "FULL NAME".
  artwork: {
    kind: "artwork",
    qrCenterMm: { x: 57.1, y: 24.8 },
    qrMaxMm: 21,
    platePaddingMm: 2.5,
    artwork: true,
  },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test:unit 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: `# fail 0`, and pass = baseline **+ 17**.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/web-app-wt-sticker-zpl
git add ':(literal)apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl'
git commit -F - <<'EOF'
feat(stickers): whole-dot QR sizing and the two sticker layouts

Picks dots per module closest to 20mm (5 at 203 dpi, 7 at 300), the fix
for the fractional modules that blur PDF prints. Layouts: the pre-printed
box and the artwork position approved on paper 2026-10-14.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Printer profiles and the printer form's parsing

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile.ts`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile-draft.ts`
- Test: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile.test.ts`
- Test: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile-draft.test.ts`

**Interfaces:**
- Consumes: `Rotation`, `designFitsStock` (Task 1).
- Produces:
  - **profile:**
    - types: `Transport`, `PrinterTarget`, `MediaMode`, `PrinterProfile`, `ProfilePreset`, `PresetId`, `ProfileStorage`
    - constants: `PRESETS`, `PROFILES_STORAGE_KEY`
    - functions: `isPrivateIPv4`, `parseProfile`, `loadProfiles`, `saveProfiles`
  - **profile-draft:**
    - type: `ProfileDraft`
    - functions: `parseMm`, `draftFromPreset`, `draftFromProfile`, `profileFromDraft`, `profileFitsDesign`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPrivateIPv4,
  loadProfiles,
  parseProfile,
  PRESETS,
  PROFILES_STORAGE_KEY,
  saveProfiles,
  type PrinterProfile,
  type ProfileStorage,
} from "./profile";

function memoryStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  const storage: ProfileStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
  return storage;
}

function throwingStorage(): ProfileStorage {
  return {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("SecurityError");
    },
  };
}

const argox: PrinterProfile = {
  id: "p-1",
  transport: "helper",
  target: { kind: "network", host: "192.168.1.19" },
  ...PRESETS["argox-o4-250"],
};

describe("isPrivateIPv4", () => {
  it("accepts the three private ranges", () => {
    assert.equal(isPrivateIPv4("10.0.0.5"), true);
    assert.equal(isPrivateIPv4("172.16.0.1"), true);
    assert.equal(isPrivateIPv4("172.31.255.254"), true);
    assert.equal(isPrivateIPv4("192.168.1.19"), true);
  });

  it("rejects public, loopback, out-of-range and non-IP hosts", () => {
    assert.equal(isPrivateIPv4("8.8.8.8"), false);
    assert.equal(isPrivateIPv4("172.32.0.1"), false);
    assert.equal(isPrivateIPv4("127.0.0.1"), false);
    assert.equal(isPrivateIPv4("192.168.1.300"), false);
    assert.equal(isPrivateIPv4("printer.local"), false);
  });
});

describe("parseProfile", () => {
  it("round-trips a valid profile", () => {
    assert.deepEqual(parseProfile(JSON.parse(JSON.stringify(argox))), argox);
  });

  it("rejects a direct-to-Zebra profile aimed at a USB queue", () => {
    assert.equal(
      parseProfile({ ...argox, transport: "zebra-direct", target: { kind: "queue", name: "ZDesigner" } }),
      null
    );
  });

  it("rejects an unknown dpi, rotation or media mode", () => {
    assert.equal(parseProfile({ ...argox, dpi: 600 }), null);
    assert.equal(parseProfile({ ...argox, rotation: 45 }), null);
    assert.equal(parseProfile({ ...argox, media: "laser" }), null);
  });

  it("rejects a public printer address", () => {
    assert.equal(parseProfile({ ...argox, target: { kind: "network", host: "8.8.8.8" } }), null);
  });
});

describe("loadProfiles / saveProfiles", () => {
  it("saves and loads profiles", () => {
    const storage = memoryStorage();
    assert.equal(saveProfiles(storage, [argox]), true);
    assert.deepEqual(loadProfiles(storage), [argox]);
  });

  it("skips invalid entries instead of failing the whole list", () => {
    const storage = memoryStorage({
      [PROFILES_STORAGE_KEY]: JSON.stringify([argox, { id: "broken" }]),
    });
    assert.deepEqual(loadProfiles(storage), [argox]);
  });

  it("returns an empty list for corrupt JSON, a non-array, or no storage", () => {
    assert.deepEqual(loadProfiles(memoryStorage({ [PROFILES_STORAGE_KEY]: "{oops" })), []);
    assert.deepEqual(loadProfiles(memoryStorage({ [PROFILES_STORAGE_KEY]: "{}" })), []);
    assert.deepEqual(loadProfiles(null), []);
  });

  it("survives storage that throws (private mode)", () => {
    assert.deepEqual(loadProfiles(throwingStorage()), []);
    assert.equal(saveProfiles(throwingStorage(), [argox]), false);
  });
});
```

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile-draft.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRESETS, type PrinterProfile } from "./profile";
import {
  draftFromPreset,
  draftFromProfile,
  parseMm,
  profileFitsDesign,
  profileFromDraft,
} from "./profile-draft";

describe("parseMm", () => {
  it("accepts a dot or a Turkish decimal comma, and negatives", () => {
    assert.equal(parseMm("6.5"), 6.5);
    assert.equal(parseMm("6,5"), 6.5);
    assert.equal(parseMm(" -2 "), -2);
    assert.equal(parseMm("108"), 108);
  });

  it("rejects empty, partial and non-numeric text", () => {
    assert.equal(parseMm(""), null);
    assert.equal(parseMm("6,"), null);
    assert.equal(parseMm("6mm"), null);
    assert.equal(parseMm("1,2,3"), null);
  });
});

describe("profileFromDraft", () => {
  it("turns a filled preset draft into a profile", () => {
    const draft = { ...draftFromPreset("argox-o4-250", "p-1"), host: "192.168.1.19", offsetXmm: "6,25" };
    const profile = profileFromDraft(draft);
    assert.equal(profile?.offsetXmm, 6.25);
    assert.deepEqual(profile?.target, { kind: "network", host: "192.168.1.19" });
    assert.equal(profile?.rotation, 90);
  });

  it("refuses a draft with no printer address, or a bad number", () => {
    assert.equal(profileFromDraft(draftFromPreset("zt231-203", "p-2")), null);
    assert.equal(
      profileFromDraft({ ...draftFromPreset("zt231-203", "p-2"), host: "10.0.0.9", labelWidthMm: "seventy" }),
      null
    );
  });

  it("round-trips a saved profile through the form", () => {
    const saved: PrinterProfile = {
      id: "p-3",
      transport: "helper",
      target: { kind: "queue", name: "ZDesigner ZT231-203dpi ZPL" },
      ...PRESETS["zt231-203"],
    };
    assert.deepEqual(profileFromDraft(draftFromProfile(saved)), saved);
  });
});

describe("profileFitsDesign", () => {
  const base = { id: "x", transport: "helper" as const, target: { kind: "network" as const, host: "10.0.0.1" } };

  it("accepts the presets as shipped", () => {
    assert.equal(profileFitsDesign({ ...base, ...PRESETS["zt231-203"] }), true);
    assert.equal(profileFitsDesign({ ...base, ...PRESETS["argox-o4-250"] }), true);
  });

  it("flags a turned design on an upright roll", () => {
    assert.equal(profileFitsDesign({ ...base, ...PRESETS["zt231-203"], rotation: 90 }), false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web test:unit 2>&1 | grep -E 'zpl/profile|Cannot find module|^# fail'`
Expected: `Cannot find module` naming `zpl/profile`.

- [ ] **Step 3: Implement**

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile.ts`:

```ts
import type { Rotation } from "./geometry";

export type Transport = "helper" | "zebra-direct";
export type PrinterTarget =
  | { kind: "network"; host: string }
  | { kind: "queue"; name: string };
export type MediaMode = "printer" | "ribbon" | "direct";

export type PrinterProfile = {
  id: string;
  name: string;
  transport: Transport;
  target: PrinterTarget;
  dpi: 203 | 300;
  headWidthMm: number;
  /** The stock as loaded: width runs across the print head. */
  labelWidthMm: number;
  labelHeightMm: number;
  rotation: Rotation;
  offsetXmm: number;
  offsetYmm: number;
  media: MediaMode;
};

export type ProfilePreset = Omit<PrinterProfile, "id" | "transport" | "target">;
export type PresetId = "zt231-203" | "zt231-300" | "argox-o4-250";

export const PRESETS: Record<PresetId, ProfilePreset> = {
  "zt231-203": {
    name: "Zebra ZT231 (203 dpi)",
    dpi: 203,
    headWidthMm: 104,
    labelWidthMm: 70,
    labelHeightMm: 100,
    rotation: 0,
    offsetXmm: 0,
    offsetYmm: 0,
    media: "printer",
  },
  "zt231-300": {
    name: "Zebra ZT231 (300 dpi)",
    dpi: 300,
    headWidthMm: 104,
    labelWidthMm: 70,
    labelHeightMm: 100,
    rotation: 0,
    offsetXmm: 0,
    offsetYmm: 0,
    media: "printer",
  },
  // Measured on the office unit 2026-10-14 with a 100x70 blank roll: it centres
  // the roll under a 108mm head, so the left paper edge sits ~6mm in.
  "argox-o4-250": {
    name: "Argox O4-250",
    dpi: 203,
    headWidthMm: 108,
    labelWidthMm: 100,
    labelHeightMm: 70,
    rotation: 90,
    offsetXmm: 6,
    offsetYmm: 0,
    media: "printer",
  },
};

export const PROFILES_STORAGE_KEY = "unirefund.printerProfiles.v1";

export type ProfileStorage = Pick<Storage, "getItem" | "setItem">;

/** Same rule the Print Helper enforces: 10/8, 172.16/12 and 192.168/16 only. */
export function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const octets = m.slice(1).map(Number);
  if (octets.some((o) => o > 255)) return false;
  const a = octets[0] ?? 0;
  const b = octets[1] ?? 0;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

function parseTarget(value: unknown): PrinterTarget | null {
  if (!value || typeof value !== "object") return null;
  const t = value as Record<string, unknown>;
  if (t.kind === "network" && typeof t.host === "string" && isPrivateIPv4(t.host)) {
    return { kind: "network", host: t.host };
  }
  if (t.kind === "queue" && typeof t.name === "string" && t.name.trim() !== "") {
    return { kind: "queue", name: t.name };
  }
  return null;
}

/** Returns null for anything a hand-edited or older entry could hold. */
export function parseProfile(value: unknown): PrinterProfile | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  const target = parseTarget(p.target);
  if (
    typeof p.id !== "string" ||
    typeof p.name !== "string" ||
    (p.transport !== "helper" && p.transport !== "zebra-direct") ||
    !target ||
    (p.transport === "zebra-direct" && target.kind !== "network") ||
    (p.dpi !== 203 && p.dpi !== 300) ||
    !isFiniteNumber(p.headWidthMm) ||
    p.headWidthMm <= 0 ||
    !isFiniteNumber(p.labelWidthMm) ||
    p.labelWidthMm <= 0 ||
    !isFiniteNumber(p.labelHeightMm) ||
    p.labelHeightMm <= 0 ||
    (p.rotation !== 0 && p.rotation !== 90 && p.rotation !== 180 && p.rotation !== 270) ||
    !isFiniteNumber(p.offsetXmm) ||
    !isFiniteNumber(p.offsetYmm) ||
    (p.media !== "printer" && p.media !== "ribbon" && p.media !== "direct")
  ) {
    return null;
  }
  return {
    id: p.id,
    name: p.name,
    transport: p.transport,
    target,
    dpi: p.dpi,
    headWidthMm: p.headWidthMm,
    labelWidthMm: p.labelWidthMm,
    labelHeightMm: p.labelHeightMm,
    rotation: p.rotation,
    offsetXmm: p.offsetXmm,
    offsetYmm: p.offsetYmm,
    media: p.media,
  };
}

export function loadProfiles(storage: ProfileStorage | null): PrinterProfile[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(PROFILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseProfile).filter((p): p is PrinterProfile => p !== null);
  } catch {
    return [];
  }
}

export function saveProfiles(
  storage: ProfileStorage | null,
  profiles: PrinterProfile[]
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    return true;
  } catch {
    return false;
  }
}
```

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile-draft.ts`:

```ts
import { designFitsStock, type Rotation } from "./geometry";
import {
  parseProfile,
  PRESETS,
  type MediaMode,
  type PresetId,
  type PrinterProfile,
  type Transport,
} from "./profile";

/** What the printer form edits: numbers stay text until saved. */
export type ProfileDraft = {
  id: string;
  name: string;
  transport: Transport;
  targetKind: "network" | "queue";
  host: string;
  queue: string;
  dpi: "203" | "300";
  headWidthMm: string;
  labelWidthMm: string;
  labelHeightMm: string;
  rotation: "0" | "90" | "180" | "270";
  offsetXmm: string;
  offsetYmm: string;
  media: MediaMode;
};

/** Accepts "6.5" and the Turkish "6,5"; anything else is null. */
export function parseMm(text: string): number | null {
  const normalised = text.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalised)) return null;
  return Number(normalised);
}

export function draftFromPreset(presetId: PresetId, id: string): ProfileDraft {
  const p = PRESETS[presetId];
  return {
    id,
    name: p.name,
    transport: "helper",
    targetKind: "network",
    host: "",
    queue: "",
    dpi: String(p.dpi) as ProfileDraft["dpi"],
    headWidthMm: String(p.headWidthMm),
    labelWidthMm: String(p.labelWidthMm),
    labelHeightMm: String(p.labelHeightMm),
    rotation: String(p.rotation) as ProfileDraft["rotation"],
    offsetXmm: String(p.offsetXmm),
    offsetYmm: String(p.offsetYmm),
    media: p.media,
  };
}

export function draftFromProfile(p: PrinterProfile): ProfileDraft {
  return {
    id: p.id,
    name: p.name,
    transport: p.transport,
    targetKind: p.target.kind,
    host: p.target.kind === "network" ? p.target.host : "",
    queue: p.target.kind === "queue" ? p.target.name : "",
    dpi: String(p.dpi) as ProfileDraft["dpi"],
    headWidthMm: String(p.headWidthMm),
    labelWidthMm: String(p.labelWidthMm),
    labelHeightMm: String(p.labelHeightMm),
    rotation: String(p.rotation) as ProfileDraft["rotation"],
    offsetXmm: String(p.offsetXmm),
    offsetYmm: String(p.offsetYmm),
    media: p.media,
  };
}

/** Null when any field is unusable; parseProfile owns the rules. */
export function profileFromDraft(d: ProfileDraft): PrinterProfile | null {
  return parseProfile({
    id: d.id,
    name: d.name.trim(),
    transport: d.transport,
    target:
      d.targetKind === "network"
        ? { kind: "network", host: d.host.trim() }
        : { kind: "queue", name: d.queue },
    dpi: Number(d.dpi),
    headWidthMm: parseMm(d.headWidthMm),
    labelWidthMm: parseMm(d.labelWidthMm),
    labelHeightMm: parseMm(d.labelHeightMm),
    rotation: Number(d.rotation) as Rotation,
    offsetXmm: parseMm(d.offsetXmm),
    offsetYmm: parseMm(d.offsetYmm),
    media: d.media,
  });
}

/** A turned design on an upright roll would print clipped across two labels. */
export function profileFitsDesign(p: PrinterProfile): boolean {
  return designFitsStock(p.rotation, { w: p.labelWidthMm, h: p.labelHeightMm });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test:unit 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: `# fail 0`, and pass = baseline **+ 34**.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/web-app-wt-sticker-zpl
git add ':(literal)apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl'
git commit -F - <<'EOF'
feat(stickers): printer profiles kept in the browser

Presets for the ZT231 (203/300 dpi) and the office Argox as measured. Stored
entries are validated on read and a bad one is skipped; private mode and
corrupt JSON degrade to an empty list. The form accepts a Turkish decimal
comma and flags a rotation that does not fit the loaded roll.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Artwork to a ZPL graphic

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/artwork.ts`
- Test: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/artwork.test.ts`

**Interfaces:**
- Consumes: `Rotation` (Task 1).
- Produces:
  - **Types:** `RgbaImage`, `MonoBitmap`, `PackedBitmap`
  - **Constants:** `ARTWORK_SUPERSAMPLE` (4), `ARTWORK_GRAPHIC` (`"R:UNISTK.GRF"`)
  - **Functions:** `isInk`, `toMonoBitmap(image, factor?)`, `rotateBitmap`, `cropBitmap`, `packBitmap`, `storeGraphicZpl`

- [ ] **Step 1: Write the failing test**

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/artwork.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cropBitmap,
  isInk,
  packBitmap,
  rotateBitmap,
  storeGraphicZpl,
  toMonoBitmap,
  type MonoBitmap,
  type RgbaImage,
} from "./artwork";

function solidImage(width: number, height: number, rgb: [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...rgb, 255], i * 4);
  return { width, height, data };
}

function paint(image: RgbaImage, x: number, y: number, rgb: [number, number, number]) {
  image.data.set([...rgb, 255], (y * image.width + x) * 4);
}

const bmp = (width: number, height: number, rows: string[]): MonoBitmap => ({
  width,
  height,
  black: Uint8Array.from(rows.join("").split("").map(Number)),
});

describe("isInk", () => {
  it("treats brand red, black and mid grey as ink, and white and light grey as paper", () => {
    assert.equal(isInk(218, 29, 36), true);
    assert.equal(isInk(0, 0, 0), true);
    assert.equal(isInk(150, 150, 150), true);
    assert.equal(isInk(255, 255, 255), false);
    assert.equal(isInk(235, 235, 235), false);
  });
});

describe("toMonoBitmap", () => {
  it("reduces 4x4 blocks to one dot", () => {
    const image = solidImage(8, 4, [255, 255, 255]);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) paint(image, x, y, [0, 0, 0]);
    assert.deepEqual(toMonoBitmap(image), bmp(2, 1, ["10"]));
  });

  it("blackens a dot at 40% ink coverage but not below it", () => {
    const seven = solidImage(4, 4, [255, 255, 255]);
    const six = solidImage(4, 4, [255, 255, 255]);
    for (let i = 0; i < 7; i++) paint(seven, i % 4, Math.floor(i / 4), [0, 0, 0]);
    for (let i = 0; i < 6; i++) paint(six, i % 4, Math.floor(i / 4), [0, 0, 0]);
    assert.equal(toMonoBitmap(seven).black[0], 1);
    assert.equal(toMonoBitmap(six).black[0], 0);
  });
});

describe("rotateBitmap", () => {
  // 3 wide, 2 tall, black at the top-left corner
  const corner = bmp(3, 2, ["100", "000"]);

  it("moves the top-left corner clockwise", () => {
    assert.deepEqual(rotateBitmap(corner, 90), bmp(2, 3, ["01", "00", "00"]));
    assert.deepEqual(rotateBitmap(corner, 180), bmp(3, 2, ["000", "001"]));
    assert.deepEqual(rotateBitmap(corner, 270), bmp(2, 3, ["00", "00", "10"]));
  });

  it("returns the same bitmap at 0", () => {
    assert.equal(rotateBitmap(corner, 0), corner);
  });
});

describe("cropBitmap", () => {
  it("drops leading columns and rows", () => {
    assert.deepEqual(cropBitmap(bmp(3, 2, ["100", "011"]), 1, 1), bmp(2, 1, ["11"]));
  });
});

describe("packBitmap / storeGraphicZpl", () => {
  it("packs MSB first and pads each row to whole bytes", () => {
    const packed = packBitmap(bmp(10, 2, ["1000000001", "0000000011"]));
    assert.deepEqual(packed, { bytesPerRow: 2, totalBytes: 4, hex: "8040" + "00C0" });
  });

  it("builds the ~DG command", () => {
    assert.equal(
      storeGraphicZpl({ bytesPerRow: 2, totalBytes: 4, hex: "804000C0" }),
      "~DGR:UNISTK.GRF,4,2,804000C0"
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test:unit 2>&1 | grep -E 'zpl/artwork|Cannot find module|^# fail'`
Expected: `Cannot find module` naming `zpl/artwork`.

- [ ] **Step 3: Implement**

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/artwork.ts`:

```ts
import type { Rotation } from "./geometry";

export type RgbaImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
};

/** One byte per pixel, 1 = black, row-major. */
export type MonoBitmap = { width: number; height: number; black: Uint8Array };

export type PackedBitmap = { bytesPerRow: number; totalBytes: number; hex: string };

/** The artwork is rendered at 4x the printer's dots, then reduced 4x4 -> 1. */
export const ARTWORK_SUPERSAMPLE = 4;
export const ARTWORK_GRAPHIC = "R:UNISTK.GRF";

const INK_LUMINANCE_MAX = 225;
const INK_COVERAGE_MIN = 0.4;

/**
 * Brand red prints solid; anything darker than light grey prints black. Tuned
 * on the 2026-10-14 office tests: plain 50% thresholding lost the grey form
 * boxes, and error diffusion made the white headline text noisy.
 */
export function isInk(r: number, g: number, b: number): boolean {
  if (r > 140 && g < 110 && b < 110) return true;
  return 0.299 * r + 0.587 * g + 0.114 * b < INK_LUMINANCE_MAX;
}

/**
 * A printer dot is black when at least 40% of its supersampled block is ink.
 * Deciding per sub-pixel keeps thin text strokes without the fringe bloat a
 * low-resolution threshold gives them.
 */
export function toMonoBitmap(image: RgbaImage, factor = ARTWORK_SUPERSAMPLE): MonoBitmap {
  const width = Math.floor(image.width / factor);
  const height = Math.floor(image.height / factor);
  const black = new Uint8Array(width * height);
  const needed = INK_COVERAGE_MIN * factor * factor;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let ink = 0;
      for (let sy = 0; sy < factor; sy++) {
        const row = (y * factor + sy) * image.width;
        for (let sx = 0; sx < factor; sx++) {
          const i = (row + x * factor + sx) * 4;
          if (isInk(image.data[i] ?? 255, image.data[i + 1] ?? 255, image.data[i + 2] ?? 255)) ink++;
        }
      }
      black[y * width + x] = ink >= needed ? 1 : 0;
    }
  }
  return { width, height, black };
}

/** Clockwise, matching rotateRect in geometry.ts. */
export function rotateBitmap(bitmap: MonoBitmap, rotation: Rotation): MonoBitmap {
  if (rotation === 0) return bitmap;
  const { width: w, height: h, black } = bitmap;
  const turned = rotation === 90 || rotation === 270;
  const outW = turned ? h : w;
  const outH = turned ? w : h;
  const out = new Uint8Array(outW * outH);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx: number;
      let ny: number;
      if (rotation === 90) {
        nx = h - 1 - y;
        ny = x;
      } else if (rotation === 180) {
        nx = w - 1 - x;
        ny = h - 1 - y;
      } else {
        nx = y;
        ny = w - 1 - x;
      }
      out[ny * outW + nx] = black[y * w + x] ?? 0;
    }
  }
  return { width: outW, height: outH, black: out };
}

/** Drops `left` columns and `top` rows, for a negative profile offset. */
export function cropBitmap(bitmap: MonoBitmap, left: number, top: number): MonoBitmap {
  const l = Math.max(0, Math.min(left, bitmap.width));
  const t = Math.max(0, Math.min(top, bitmap.height));
  if (l === 0 && t === 0) return bitmap;
  const width = bitmap.width - l;
  const height = bitmap.height - t;
  const black = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const from = (y + t) * bitmap.width + l;
    black.set(bitmap.black.subarray(from, from + width), y * width);
  }
  return { width, height, black };
}

/** ZPL graphic rows: MSB first, 1 = black, each row padded to whole bytes. */
export function packBitmap(bitmap: MonoBitmap): PackedBitmap {
  const bytesPerRow = Math.ceil(bitmap.width / 8);
  const bytes = new Uint8Array(bytesPerRow * bitmap.height);
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      if (bitmap.black[y * bitmap.width + x]) {
        const at = y * bytesPerRow + (x >> 3);
        bytes[at] = (bytes[at] ?? 0) | (0x80 >> (x & 7));
      }
    }
  }
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return { bytesPerRow, totalBytes: bytes.length, hex: hex.toUpperCase() };
}

/** Stores the graphic on the printer for the rest of the job; labels recall it with ^XG. */
export function storeGraphicZpl(packed: PackedBitmap, name = ARTWORK_GRAPHIC): string {
  return `~DG${name},${packed.totalBytes},${packed.bytesPerRow},${packed.hex}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test:unit 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: `# fail 0`, and pass = baseline **+ 42**.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/web-app-wt-sticker-zpl
git add ':(literal)apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl'
git commit -F - <<'EOF'
feat(stickers): convert the sticker artwork to a 1-bit ZPL graphic

Rendered at 4x, inked per sub-pixel (brand red solid, anything darker than
light grey black) and kept where 40% of a dot is ink: the conversion that
printed readable small text on the office Argox.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Label formats, jobs and the alignment test

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/jobs.ts`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/alignment-test.ts`
- Test: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/jobs.test.ts`
- Test: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/alignment-test.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - **jobs:**
    - types: `StickerLabelInput`, `ZplJob { zpl, firstIndex, lastIndex, labelCount }`, `BuildJobsResult { jobs, skipped }`
    - constant: `LABELS_PER_JOB` (500)
    - functions: `placeOrigin`, `labelHeaderZpl`, `artworkOrigin`, `artworkCommandFor(image, profile)`, `qrRectMm`, `buildLabelZpl(qrValue, profile, layoutKind)`, `buildJobs(labels, profile, layoutKind, artworkCommand, perJob?)`
  - **alignment-test:** `buildAlignmentTestZpl(profile, layoutKind)`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/jobs.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { artworkCommandFor, buildJobs, buildLabelZpl } from "./jobs";
import { PRESETS, type PrinterProfile } from "./profile";

const URL_1 = "https://ssr-dev.unirefund.com/tag/e3M6WlBMVEVTVDAwMDAwMX0";

const argox: PrinterProfile = {
  id: "argox",
  transport: "helper",
  target: { kind: "network", host: "192.168.1.19" },
  ...PRESETS["argox-o4-250"],
};

const zebra: PrinterProfile = {
  id: "zebra",
  transport: "helper",
  target: { kind: "queue", name: "ZDesigner ZT231-203dpi ZPL" },
  ...PRESETS["zt231-203"],
};

describe("buildLabelZpl", () => {
  it("prints the approved artwork layout on the office Argox (100x70, 90°, 6mm)", () => {
    // Matches the label printed and approved on 2026-10-14 (^LH48 + ^FO519,374
    // and ^FO499,354 there), give or take one dot of rounding.
    assert.equal(
      buildLabelZpl(URL_1, argox, "artwork"),
      [
        "^XA",
        "^PW863",
        "^LL559",
        "^LH0,0",
        "^FO48,0^XGR:UNISTK.GRF,1,1^FS",
        "^FO546,354^GB205,205,205,W^FS",
        "^FO566,374^BQN,2,5^FDMA," + URL_1 + "^FS",
        "^XZ",
      ].join("\n")
    );
  });

  it("puts the QR in the pre-printed box on an upright Zebra roll", () => {
    assert.equal(
      buildLabelZpl(URL_1, zebra, "preprinted"),
      [
        "^XA",
        "^PW831",
        "^LL799",
        "^LH0,0",
        "^FO381,101^BQN,2,5^FDMA," + URL_1 + "^FS",
        "^XZ",
      ].join("\n")
    );
  });

  it("scales the module to 7 dots at 300 dpi", () => {
    const zpl = buildLabelZpl(URL_1, { ...zebra, ...PRESETS["zt231-300"] }, "preprinted");
    assert.match(zpl, /\^BQN,2,7\^/);
  });

  it("sends a media command only when the profile asks for one", () => {
    assert.doesNotMatch(buildLabelZpl(URL_1, zebra, "preprinted"), /\^MT/);
    assert.match(buildLabelZpl(URL_1, { ...zebra, media: "ribbon" }, "preprinted"), /\^MTT/);
    assert.match(buildLabelZpl(URL_1, { ...zebra, media: "direct" }, "preprinted"), /\^MTD/);
  });

  it("clamps fields pushed off the stock by a negative offset to 0", () => {
    const zpl = buildLabelZpl(URL_1, { ...argox, offsetXmm: -10 }, "artwork");
    assert.match(zpl, /\^FO0,0\^XG/);
  });
});

describe("artworkCommandFor", () => {
  const white = (width: number, height: number) => ({
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4).fill(255),
  });

  it("reduces 4x, turns with the profile and stores the result", () => {
    // 64x32 sub-pixels -> 16x8 dots -> turned 90° -> 8 wide x 16 tall
    assert.equal(
      artworkCommandFor(white(64, 32), argox),
      "~DGR:UNISTK.GRF,16,1," + "00".repeat(16)
    );
  });

  it("crops columns pushed off the stock by a negative offset", () => {
    // 16 dots wide, upright, -1mm at 203 dpi drops 8 columns -> 1 byte per row
    const upright = { ...zebra, offsetXmm: -1 };
    assert.equal(
      artworkCommandFor(white(64, 32), upright),
      "~DGR:UNISTK.GRF,8,1," + "00".repeat(8)
    );
  });
});

describe("buildJobs", () => {
  const labels = Array.from({ length: 5 }, (_, i) => ({
    stickerLineNumber: `L${i + 1}`,
    qrValue: `${URL_1}${i}`,
  }));

  it("chunks labels into self-contained jobs, each starting with the artwork", () => {
    const { jobs, skipped } = buildJobs(labels, argox, "artwork", "~DGR:UNISTK.GRF,4,2,804000C0", 2);
    assert.deepEqual(skipped, []);
    assert.deepEqual(
      jobs.map((j) => [j.firstIndex, j.lastIndex, j.labelCount]),
      [
        [0, 1, 2],
        [2, 3, 2],
        [4, 4, 1],
      ]
    );
    for (const job of jobs) {
      assert.ok(job.zpl.startsWith("~DGR:UNISTK.GRF,4,2,804000C0\n^XA"));
      assert.equal(job.zpl.match(/\^XA/g)?.length, job.labelCount);
    }
  });

  it("sends no artwork for the pre-printed layout", () => {
    const { jobs } = buildJobs(labels, zebra, "preprinted", null);
    assert.equal(jobs.length, 1);
    assert.ok(jobs[0]?.zpl.startsWith("^XA"));
  });

  it("skips and reports labels without a QR or with ZPL control characters", () => {
    const { jobs, skipped } = buildJobs(
      [
        { stickerLineNumber: "OK1", qrValue: URL_1 },
        { stickerLineNumber: "NOQR", qrValue: null },
        { stickerLineNumber: "CARET", qrValue: `${URL_1}^XZ` },
        { stickerLineNumber: "OK2", qrValue: URL_1 },
      ],
      zebra,
      "preprinted",
      null
    );
    assert.deepEqual(skipped, ["NOQR", "CARET"]);
    assert.equal(jobs[0]?.labelCount, 2);
    assert.equal(jobs[0]?.firstIndex, 0);
    assert.equal(jobs[0]?.lastIndex, 3);
  });

  it("returns no jobs for an empty book", () => {
    assert.deepEqual(buildJobs([], zebra, "preprinted", null), { jobs: [], skipped: [] });
  });

  it("returns no jobs, only skips, when no label can be printed", () => {
    const { jobs, skipped } = buildJobs(
      [
        { stickerLineNumber: "A", qrValue: null },
        { stickerLineNumber: "B", qrValue: "x~y" },
      ],
      zebra,
      "preprinted",
      null
    );
    assert.deepEqual(jobs, []);
    assert.deepEqual(skipped, ["A", "B"]);
  });

  it("splits a 1,234-label book into 500 + 500 + 234", () => {
    const book = Array.from({ length: 1234 }, (_, i) => ({ stickerLineNumber: `L${i}`, qrValue: URL_1 }));
    const { jobs } = buildJobs(book, zebra, "preprinted", null);
    assert.deepEqual(
      jobs.map((j) => j.labelCount),
      [500, 500, 234]
    );
    assert.equal(jobs.at(-1)?.lastIndex, 1233);
  });
});
```

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/alignment-test.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAlignmentTestZpl } from "./alignment-test";
import { PRESETS, type PrinterProfile } from "./profile";

const argox: PrinterProfile = {
  id: "argox",
  transport: "helper",
  target: { kind: "network", host: "192.168.1.19" },
  ...PRESETS["argox-o4-250"],
};

const lines = (zpl: string) => zpl.split("\n");

describe("buildAlignmentTestZpl", () => {
  const zpl = buildAlignmentTestZpl(argox, "artwork");

  it("is a single label", () => {
    assert.ok(zpl.startsWith("^XA\n^PW863\n^LL559\n^LH0,0"));
    assert.ok(zpl.endsWith("^XZ"));
    assert.equal(zpl.match(/\^XA/g)?.length, 1);
  });

  it("draws 1mm ticks for the first and last 15mm of a 108mm head, 5mm between", () => {
    // 0..15 and 93..108 (16 each) plus 20, 25 … 90 (15)
    const ticks = lines(zpl).filter((l) => /^\^FO\d+,\d+\^GB2,(10|20|32),2\^FS$/.test(l));
    assert.equal(ticks.length, 47);
  });

  it("draws 1mm ticks for the first and last 10mm of a 70mm label, 5mm between", () => {
    // 0..10 and 60..70 (11 each) plus 15, 20 … 55 (9)
    const ticks = lines(zpl).filter((l) => /\^GB(10|20|32),2,2\^FS$/.test(l));
    assert.equal(ticks.length, 31);
  });

  it("frames the turned design at the profile offset", () => {
    assert.ok(lines(zpl).includes("^FO48,0^GB799,559,3^FS"));
  });

  it("outlines the QR where a real label puts it", () => {
    assert.ok(lines(zpl).includes("^FO566,374^GB165,165,2^FS"));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web test:unit 2>&1 | grep -E 'zpl/(jobs|alignment)|Cannot find module|^# fail'`
Expected: `Cannot find module` naming `zpl/jobs`.

- [ ] **Step 3: Implement**

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/jobs.ts`:

```ts
import {
  ARTWORK_GRAPHIC,
  cropBitmap,
  packBitmap,
  rotateBitmap,
  storeGraphicZpl,
  toMonoBitmap,
  type RgbaImage,
} from "./artwork";
import { mmToDots, rotateRect, type RectMm } from "./geometry";
import { LAYOUTS, type LayoutKind } from "./layouts";
import type { PrinterProfile } from "./profile";
import { isZplSafe, qrMagnification, qrModuleCount, qrSizeMm } from "./qr";

export type StickerLabelInput = { stickerLineNumber: string; qrValue: string | null };

export type ZplJob = {
  zpl: string;
  /** Positions in the input label list, so a failure can name what was not sent. */
  firstIndex: number;
  lastIndex: number;
  labelCount: number;
};

export type BuildJobsResult = { jobs: ZplJob[]; skipped: string[] };

/** Small enough for one request; the artwork is re-sent at the head of every job. */
export const LABELS_PER_JOB = 500;

type Origin = { x: number; y: number };

/** Design mm -> stock dots: rotate, add the profile offset, never below 0. */
export function placeOrigin(rect: RectMm, profile: PrinterProfile): Origin {
  const r = rotateRect(rect, profile.rotation);
  return {
    x: Math.max(0, mmToDots(r.x + profile.offsetXmm, profile.dpi)),
    y: Math.max(0, mmToDots(r.y + profile.offsetYmm, profile.dpi)),
  };
}

export function labelHeaderZpl(profile: PrinterProfile): string[] {
  const lines = [
    "^XA",
    `^PW${mmToDots(profile.headWidthMm, profile.dpi)}`,
    `^LL${mmToDots(profile.labelHeightMm, profile.dpi)}`,
    "^LH0,0",
  ];
  if (profile.media === "ribbon") lines.push("^MTT");
  if (profile.media === "direct") lines.push("^MTD");
  return lines;
}

/** Where the stored artwork goes: the design's corner plus the offset. */
export function artworkOrigin(profile: PrinterProfile): Origin {
  return {
    x: Math.max(0, mmToDots(profile.offsetXmm, profile.dpi)),
    y: Math.max(0, mmToDots(profile.offsetYmm, profile.dpi)),
  };
}

/**
 * The artwork for this profile as a `~DG` command: reduced to printer dots,
 * turned like the layout, and cropped where a negative offset pushes it off
 * the stock (field origins clamp to 0, so the image must lose those edges).
 * `image` is the PDF rendered at ARTWORK_SUPERSAMPLE x the profile's dots.
 */
export function artworkCommandFor(image: RgbaImage, profile: PrinterProfile): string {
  const turned = rotateBitmap(toMonoBitmap(image), profile.rotation);
  const cropped = cropBitmap(
    turned,
    Math.max(0, -mmToDots(profile.offsetXmm, profile.dpi)),
    Math.max(0, -mmToDots(profile.offsetYmm, profile.dpi))
  );
  return storeGraphicZpl(packBitmap(cropped));
}

export function qrRectMm(qrValue: string, profile: PrinterProfile, layoutKind: LayoutKind) {
  const layout = LAYOUTS[layoutKind];
  const modules = qrModuleCount(qrValue);
  const magnification = qrMagnification(modules, profile.dpi, layout.qrMaxMm);
  const size = qrSizeMm(modules, magnification, profile.dpi);
  const rect: RectMm = {
    x: layout.qrCenterMm.x - size / 2,
    y: layout.qrCenterMm.y - size / 2,
    w: size,
    h: size,
  };
  return { rect, magnification };
}

export function buildLabelZpl(
  qrValue: string,
  profile: PrinterProfile,
  layoutKind: LayoutKind
): string {
  const layout = LAYOUTS[layoutKind];
  const lines = labelHeaderZpl(profile);
  const { rect, magnification } = qrRectMm(qrValue, profile, layoutKind);

  if (layout.artwork) {
    const a = artworkOrigin(profile);
    lines.push(`^FO${a.x},${a.y}^XG${ARTWORK_GRAPHIC},1,1^FS`);
  }
  if (layout.platePaddingMm !== null) {
    const pad = layout.platePaddingMm;
    const plate: RectMm = { x: rect.x - pad, y: rect.y - pad, w: rect.w + 2 * pad, h: rect.h + 2 * pad };
    const o = placeOrigin(plate, profile);
    const side = mmToDots(plate.w, profile.dpi);
    lines.push(`^FO${o.x},${o.y}^GB${side},${side},${side},W^FS`);
  }
  // ^BQ draws upright only; a square code reads the same at any rotation.
  const q = placeOrigin(rect, profile);
  lines.push(`^FO${q.x},${q.y}^BQN,2,${magnification}^FDMA,${qrValue}^FS`);
  lines.push("^XZ");
  return lines.join("\n");
}

/**
 * Splits a book into self-contained jobs. A label whose QR cannot be produced
 * or carries ZPL control characters is skipped and reported, not printed blank.
 */
export function buildJobs(
  labels: StickerLabelInput[],
  profile: PrinterProfile,
  layoutKind: LayoutKind,
  artworkCommand: string | null,
  perJob = LABELS_PER_JOB
): BuildJobsResult {
  const skipped: string[] = [];
  const printable: { index: number; zpl: string }[] = [];
  labels.forEach((label, index) => {
    if (!label.qrValue || !isZplSafe(label.qrValue)) {
      skipped.push(label.stickerLineNumber);
      return;
    }
    printable.push({ index, zpl: buildLabelZpl(label.qrValue, profile, layoutKind) });
  });

  const jobs: ZplJob[] = [];
  for (let i = 0; i < printable.length; i += perJob) {
    const chunk = printable.slice(i, i + perJob);
    const first = chunk[0];
    const last = chunk.at(-1);
    if (!first || !last) continue;
    const body = chunk.map((c) => c.zpl).join("\n");
    jobs.push({
      zpl: artworkCommand ? `${artworkCommand}\n${body}\n` : `${body}\n`,
      firstIndex: first.index,
      lastIndex: last.index,
      labelCount: chunk.length,
    });
  }
  return { jobs, skipped };
}
```

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/alignment-test.ts`:

```ts
import { mmToDots, rotatedDesignSize } from "./geometry";
import { artworkOrigin, labelHeaderZpl, placeOrigin, qrRectMm } from "./jobs";
import type { LayoutKind } from "./layouts";
import type { PrinterProfile } from "./profile";

/** Any value of sticker length sizes the QR outline like a real label. */
const SAMPLE_QR_VALUE = "https://ssr.unirefund.com/tag/e3M6U0FNUExFMDAwMDAwfQ";

function tickLength(mm: number): number {
  if (mm % 10 === 0) return 32;
  if (mm % 5 === 0) return 20;
  return 10;
}

/**
 * One calibration label. The rulers are drawn in raw head coordinates, so the
 * number under the paper's left edge IS the X offset to enter and the number at
 * its top edge IS the Y offset. The frame and the QR outline are drawn with the
 * current offsets, so a correct profile puts the frame on the paper's edges.
 */
export function buildAlignmentTestZpl(profile: PrinterProfile, layoutKind: LayoutKind): string {
  const dots = (mm: number) => mmToDots(mm, profile.dpi);
  const headDots = dots(profile.headWidthMm);
  const lengthDots = dots(profile.labelHeightMm);
  const lines = labelHeaderZpl(profile);

  // Horizontal ruler across the whole head, 1mm ticks near both ends.
  const rulerY = Math.round(lengthDots / 2);
  lines.push(`^FO0,${rulerY}^GB${headDots},2,2^FS`);
  const headMm = Math.floor(profile.headWidthMm);
  for (let mm = 0; mm <= headMm; mm++) {
    const fine = mm <= 15 || mm >= headMm - 15;
    if (!fine && mm % 5 !== 0) continue;
    const x = Math.min(dots(mm), headDots - 2);
    const h = tickLength(mm);
    lines.push(`^FO${x},${rulerY - h}^GB2,${h},2^FS`);
    if (mm % 10 === 0) {
      const textX = Math.min(x + 3, headDots - 34);
      lines.push(`^FO${textX},${rulerY - h - 22}^A0N,18,18^FD${mm}^FS`);
    }
  }

  // Vertical ruler down the middle of the head, 1mm ticks near both ends.
  const rulerX = Math.round(headDots / 2);
  lines.push(`^FO${rulerX},0^GB2,${lengthDots},2^FS`);
  const lengthMm = Math.floor(profile.labelHeightMm);
  for (let mm = 0; mm <= lengthMm; mm++) {
    const fine = mm <= 10 || mm >= lengthMm - 10;
    if (!fine && mm % 5 !== 0) continue;
    const y = Math.min(dots(mm), lengthDots - 2);
    lines.push(`^FO${rulerX + 2},${y}^GB${tickLength(mm)},2,2^FS`);
    if (mm % 10 === 0) {
      lines.push(`^FO${rulerX + 38},${Math.max(0, y - 9)}^A0N,18,18^FD${mm}^FS`);
    }
  }

  // The design's footprint and the QR's place, at the current offsets.
  const footprint = rotatedDesignSize(profile.rotation);
  const a = artworkOrigin(profile);
  lines.push(`^FO${a.x},${a.y}^GB${dots(footprint.w)},${dots(footprint.h)},3^FS`);
  const { rect } = qrRectMm(SAMPLE_QR_VALUE, profile, layoutKind);
  const q = placeOrigin(rect, profile);
  const side = dots(rect.w);
  lines.push(`^FO${q.x},${q.y}^GB${side},${side},2^FS`);
  lines.push("^XZ");
  return lines.join("\n");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test:unit 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: `# fail 0`, and pass = baseline **+ 60**.

The golden strings in `jobs.test.ts` match the label approved on paper on 2026-10-14, to within one dot of rounding. **Never "fix" a golden string to match new output.** A difference means the geometry changed.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/web-app-wt-sticker-zpl
git add ':(literal)apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl'
git commit -F - <<'EOF'
feat(stickers): ZPL label formats, self-contained jobs and an alignment test

Each job of 500 labels starts with the stored artwork, because a printer
dropped a job that arrived on a second connection. Labels without a
printable QR are skipped and reported. The alignment test prints rulers in
head coordinates so the paper edge reads off as the offset.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Transports

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/print-error.ts`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/helper-client.ts`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/zebra-direct.ts`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/print-run.ts`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/send.ts`
- Test: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/transports.test.ts`
- Test: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/send.test.ts`

**Interfaces:**
- Consumes: `PrinterTarget`, `PrinterProfile`, `isPrivateIPv4`, `PRESETS` (Task 3); `ZplJob` (Task 5).
- Produces:
  - **print-error:** `type PrintErrorCode`, `class PrintError { code, detail }`, `type FetchLike`
  - **helper-client:**
    - constants: `HELPER_BASE_URL`, `MIN_HELPER_VERSION`, `HELPER_DOWNLOAD_URL: string | null`
    - types: `HelperStatus`, `HelperDetection`, `HelperPrinters`
    - functions: `compareVersions`, `detectHelper(fetchFn, timeoutMs?)`, `listHelperPrinters(fetchFn, scan)`, `sendViaHelper(fetchFn, target, zpl, jobName)`
  - **zebra-direct:** `sendToZebra(fetchFn, host, zpl)`, `canSendDirect(userAgent)`
  - **print-run:** `PrintRunProgress`, `PrintRunResult`, `runPrintJobs(jobs, send, { startAt, signal, onProgress })`, `unsentRange(jobs, from)`
  - **send:** `browserFetch`, `senderFor(profile, fetchFn)`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/transports.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ZplJob } from "../zpl/jobs";
import {
  compareVersions,
  detectHelper,
  HELPER_BASE_URL,
  listHelperPrinters,
  sendViaHelper,
} from "./helper-client";
import { PrintError, type FetchLike } from "./print-error";
import { runPrintJobs, unsentRange } from "./print-run";
import { canSendDirect, sendToZebra } from "./zebra-direct";

type Call = { url: string; init?: RequestInit };

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return respond({ url, init });
  };
  return { fn, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("compareVersions", () => {
  it("compares dotted versions numerically", () => {
    assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
    assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
    assert.equal(compareVersions("0.9.0", "1.0.0"), -1);
    assert.equal(compareVersions("1.0", "1.0.1"), -1);
    assert.equal(compareVersions("1.2.0-beta", "1.2.0"), 0);
  });
});

describe("detectHelper", () => {
  it("reports ready for a current helper", async () => {
    const { fn, calls } = fakeFetch(() => json({ name: "Unirefund Print Helper", version: "1.0.0", apiVersion: 1 }));
    const result = await detectHelper(fn);
    assert.equal(result.state, "ready");
    assert.equal(calls[0]?.url, `${HELPER_BASE_URL}/status`);
  });

  it("reports outdated below the minimum version", async () => {
    const { fn } = fakeFetch(() => json({ name: "x", version: "0.9.0", apiVersion: 1 }));
    assert.equal((await detectHelper(fn)).state, "outdated");
  });

  it("reports missing when the connection fails, times out or answers oddly", async () => {
    assert.equal((await detectHelper(async () => Promise.reject(new TypeError("Failed to fetch")))).state, "missing");
    assert.equal((await detectHelper(fakeFetch(() => json({ error: {} }, 403)).fn)).state, "missing");
    assert.equal((await detectHelper(fakeFetch(() => json({ hello: 1 })).fn)).state, "missing");
    const hanging: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    assert.equal((await detectHelper(hanging, 20)).state, "missing");
  });
});

describe("sendViaHelper", () => {
  it("posts a network job with port 9100", async () => {
    const { fn, calls } = fakeFetch(() => json({ ok: true, bytes: 3, ms: 1 }));
    await sendViaHelper(fn, { kind: "network", host: "192.168.1.19" }, "^XA", "book 1/2");
    assert.equal(calls[0]?.url, `${HELPER_BASE_URL}/print`);
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
      target: { kind: "network", host: "192.168.1.19", port: 9100 },
      data: "^XA",
      jobName: "book 1/2",
    });
  });

  it("posts a queue job by name", async () => {
    const { fn, calls } = fakeFetch(() => json({ ok: true, bytes: 3, ms: 1 }));
    await sendViaHelper(fn, { kind: "queue", name: "ZDesigner ZT231" }, "^XA", "book");
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)).target, { kind: "queue", name: "ZDesigner ZT231" });
  });

  it("maps helper errors to codes", async () => {
    const cases: [number, string][] = [
      [400, "invalid-target"],
      [404, "queue-not-found"],
      [502, "printer-unreachable"],
      [504, "printer-timeout"],
      [500, "unknown"],
    ];
    for (const [status, code] of cases) {
      const { fn } = fakeFetch(() => json({ ok: false, error: { code: "x", message: "m" } }, status));
      await assert.rejects(sendViaHelper(fn, { kind: "network", host: "10.0.0.1" }, "^XA", "j"), (e: PrintError) => e.code === code);
    }
  });

  it("reports a helper that went away mid-print as missing", async () => {
    await assert.rejects(
      sendViaHelper(async () => Promise.reject(new TypeError("Failed to fetch")), { kind: "network", host: "10.0.0.1" }, "^XA", "j"),
      (e: PrintError) => e.code === "helper-missing"
    );
  });
});

describe("listHelperPrinters", () => {
  it("asks for a scan only when told to", async () => {
    const { fn, calls } = fakeFetch(() => json({ queues: [], network: [] }));
    await listHelperPrinters(fn, true);
    await listHelperPrinters(fn, false);
    assert.equal(calls[0]?.url, `${HELPER_BASE_URL}/printers?scan=1`);
    assert.equal(calls[1]?.url, `${HELPER_BASE_URL}/printers`);
  });
});

describe("sendToZebra", () => {
  it("posts no-cors to /pstprnt with the local address space", async () => {
    const { fn, calls } = fakeFetch(() => new Response(null, { status: 200 }));
    await sendToZebra(fn, "192.168.1.50", "^XA^XZ");
    assert.equal(calls[0]?.url, "http://192.168.1.50/pstprnt");
    const init = calls[0]?.init as RequestInit & { targetAddressSpace?: string };
    assert.equal(init.mode, "no-cors");
    assert.equal(init.targetAddressSpace, "local");
    assert.equal(init.body, "^XA^XZ");
  });

  it("refuses a non-private host without sending", async () => {
    const { fn, calls } = fakeFetch(() => new Response(null));
    await assert.rejects(sendToZebra(fn, "8.8.8.8", "^XA"), (e: PrintError) => e.code === "invalid-target");
    assert.equal(calls.length, 0);
  });

  it("maps a failed fetch to network-blocked", async () => {
    await assert.rejects(
      sendToZebra(async () => Promise.reject(new TypeError("Failed to fetch")), "192.168.1.50", "^XA"),
      (e: PrintError) => e.code === "network-blocked"
    );
  });

  it("is offered in Chromium browsers only", () => {
    assert.equal(canSendDirect("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36"), true);
    assert.equal(canSendDirect("Mozilla/5.0 ... Edg/155.0.0.0"), true);
    assert.equal(canSendDirect("Mozilla/5.0 (Windows NT 10.0; rv:140.0) Gecko/20100101 Firefox/140.0"), false);
  });
});

describe("runPrintJobs", () => {
  const job = (first: number, last: number): ZplJob => ({
    zpl: `^XA${first}`,
    firstIndex: first,
    lastIndex: last,
    labelCount: last - first + 1,
  });
  const jobs = [job(0, 499), job(500, 999), job(1000, 1199)];

  it("sends every job in order and reports progress", async () => {
    const sent: string[] = [];
    const progress: number[] = [];
    const result = await runPrintJobs(jobs, async (j) => void sent.push(j.zpl), {
      onProgress: (p) => progress.push(p.labelsDone),
    });
    assert.deepEqual(result, { status: "done" });
    assert.deepEqual(sent, ["^XA0", "^XA500", "^XA1000"]);
    assert.deepEqual(progress, [0, 500, 1000, 1200]);
  });

  it("never starts the next job before the previous one settles", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await runPrintJobs(jobs, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    assert.equal(maxInFlight, 1);
  });

  it("stops at the first failure and names the job", async () => {
    const boom = new PrintError("printer-unreachable");
    const result = await runPrintJobs(jobs, async (j) => {
      if (j.firstIndex === 500) throw boom;
    });
    assert.deepEqual(result, { status: "failed", failedJob: 1, error: boom });
    assert.deepEqual(unsentRange(jobs, 1), { first: 501, last: 1200 });
  });

  it("retries from a given job and counts earlier labels as done", async () => {
    const sent: number[] = [];
    const progress: number[] = [];
    await runPrintJobs(jobs, async (j) => void sent.push(j.firstIndex), {
      startAt: 1,
      onProgress: (p) => progress.push(p.labelsDone),
    });
    assert.deepEqual(sent, [500, 1000]);
    assert.deepEqual(progress, [500, 1000, 1200]);
  });

  it("stops between jobs when cancelled", async () => {
    const controller = new AbortController();
    const result = await runPrintJobs(jobs, async () => controller.abort(), { signal: controller.signal });
    assert.deepEqual(result, { status: "cancelled", nextJob: 1 });
  });

  it("has nothing unsent after the last job", () => {
    assert.equal(unsentRange(jobs, 3), null);
  });
});
```

`apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/send.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRESETS, type PrinterProfile } from "../zpl/profile";
import { HELPER_BASE_URL } from "./helper-client";
import type { FetchLike } from "./print-error";
import { senderFor } from "./send";

const job = { zpl: "^XA^XZ\n", firstIndex: 0, lastIndex: 499, labelCount: 500 };

function recordingFetch() {
  const urls: string[] = [];
  const bodies: unknown[] = [];
  const fn: FetchLike = async (url, init) => {
    urls.push(url);
    bodies.push(init?.body);
    return new Response(JSON.stringify({ ok: true, bytes: 7, ms: 1 }), { status: 200 });
  };
  return { fn, urls, bodies };
}

const base = { ...PRESETS["zt231-203"], id: "p" };

describe("senderFor", () => {
  it("sends a Print Helper profile through the helper, naming the label range", async () => {
    const profile: PrinterProfile = { ...base, transport: "helper", target: { kind: "network", host: "192.168.1.19" } };
    const { fn, urls, bodies } = recordingFetch();
    await senderFor(profile, fn)(job);
    assert.equal(urls[0], `${HELPER_BASE_URL}/print`);
    assert.equal(JSON.parse(String(bodies[0])).jobName, "Stickers 1-500");
  });

  it("sends a direct-to-Zebra profile straight to the printer", async () => {
    const profile: PrinterProfile = { ...base, transport: "zebra-direct", target: { kind: "network", host: "192.168.1.50" } };
    const { fn, urls, bodies } = recordingFetch();
    await senderFor(profile, fn)(job);
    assert.equal(urls[0], "http://192.168.1.50/pstprnt");
    assert.equal(bodies[0], "^XA^XZ\n");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web test:unit 2>&1 | grep -E 'transports|Cannot find module|^# fail'`
Expected: `Cannot find module` naming `transports/helper-client`.

- [ ] **Step 3: Implement**

`…/_components/transports/print-error.ts`:

```ts
export type PrintErrorCode =
  | "helper-missing"
  | "invalid-target"
  | "queue-not-found"
  | "printer-unreachable"
  | "printer-timeout"
  | "network-blocked"
  | "unknown";

/** Carries a code the dialog maps to a translated message; `detail` is for logs. */
export class PrintError extends Error {
  constructor(
    readonly code: PrintErrorCode,
    readonly detail?: string
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "PrintError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
```

`…/_components/transports/helper-client.ts`:

```ts
import type { PrinterTarget } from "../zpl/profile";
import { PrintError, type FetchLike, type PrintErrorCode } from "./print-error";

export const HELPER_BASE_URL = "http://127.0.0.1:9180";
export const MIN_HELPER_VERSION = "1.0.0";
/** Null until the installer's storage is chosen (spec open question 1). */
export const HELPER_DOWNLOAD_URL: string | null = null;

export type HelperStatus = { name: string; version: string; apiVersion: number };
export type HelperDetection =
  | { state: "missing" }
  | { state: "ready" | "outdated"; status: HelperStatus };

export type HelperPrinters = {
  queues: { name: string; driver: string; port: string }[];
  network: { host: string; port: number }[];
};

/** Numeric dotted compare; a pre-release suffix ("1.2.0-beta") is ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => (v.split("-")[0] ?? "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

/** A connection refusal, a timeout and a non-helper answer all mean "not usable". */
export async function detectHelper(fetchFn: FetchLike, timeoutMs = 1500): Promise<HelperDetection> {
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetchFn(`${HELPER_BASE_URL}/status`, { signal: t.signal });
    if (!res.ok) return { state: "missing" };
    const status = (await res.json()) as HelperStatus;
    if (typeof status?.version !== "string") return { state: "missing" };
    return {
      state: compareVersions(status.version, MIN_HELPER_VERSION) < 0 ? "outdated" : "ready",
      status,
    };
  } catch {
    return { state: "missing" };
  } finally {
    t.done();
  }
}

async function errorFrom(res: Response): Promise<PrintError> {
  let body: { error?: { code?: string; message?: string } } = {};
  try {
    body = await res.json();
  } catch {
    // a body that is not JSON still has a status worth mapping
  }
  const byStatus: Record<number, PrintErrorCode> = {
    400: "invalid-target",
    403: "network-blocked",
    404: "queue-not-found",
    502: "printer-unreachable",
    504: "printer-timeout",
  };
  return new PrintError(byStatus[res.status] ?? "unknown", body.error?.message ?? `HTTP ${res.status}`);
}

export async function listHelperPrinters(fetchFn: FetchLike, scan: boolean): Promise<HelperPrinters> {
  let res: Response;
  try {
    res = await fetchFn(`${HELPER_BASE_URL}/printers${scan ? "?scan=1" : ""}`);
  } catch (error) {
    throw new PrintError("helper-missing", String(error));
  }
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as HelperPrinters;
}

export async function sendViaHelper(
  fetchFn: FetchLike,
  target: PrinterTarget,
  zpl: string,
  jobName: string
): Promise<void> {
  const body = JSON.stringify({
    target: target.kind === "network" ? { kind: "network", host: target.host, port: 9100 } : target,
    data: zpl,
    jobName,
  });
  let res: Response;
  try {
    res = await fetchFn(`${HELPER_BASE_URL}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch (error) {
    throw new PrintError("helper-missing", String(error));
  }
  if (!res.ok) throw await errorFrom(res);
}
```

`…/_components/transports/zebra-direct.ts`:

```ts
import { isPrivateIPv4 } from "../zpl/profile";
import { PrintError, type FetchLike } from "./print-error";

/**
 * Posts a job to a networked Zebra's built-in /pstprnt endpoint. The printer
 * sends no CORS headers, so the response is opaque: success means "sent", never
 * "printed". `targetAddressSpace: "local"` is Chrome's opt-in that lets an
 * HTTPS page reach a private-IP http:// URL behind the local-network prompt.
 */
export async function sendToZebra(fetchFn: FetchLike, host: string, zpl: string): Promise<void> {
  if (!isPrivateIPv4(host)) throw new PrintError("invalid-target", host);
  try {
    await fetchFn(`http://${host}/pstprnt`, {
      method: "POST",
      mode: "no-cors",
      body: zpl,
      targetAddressSpace: "local",
    } as RequestInit & { targetAddressSpace: "local" });
  } catch (error) {
    // Chrome reports a denied local-network permission and an offline printer
    // the same way: a TypeError with no detail.
    throw new PrintError("network-blocked", String(error));
  }
}

/** The local-network option exists only in Chromium browsers. */
export function canSendDirect(userAgent: string): boolean {
  return /\b(Chrome|Chromium|Edg)\//.test(userAgent);
}
```

`…/_components/transports/print-run.ts`:

```ts
import type { ZplJob } from "../zpl/jobs";

export type PrintRunProgress = {
  jobsDone: number;
  jobsTotal: number;
  labelsDone: number;
  labelsTotal: number;
};

export type PrintRunResult =
  | { status: "done" }
  | { status: "cancelled"; nextJob: number }
  | { status: "failed"; failedJob: number; error: unknown };

/**
 * Sends jobs strictly one after another: the office Argox silently dropped a
 * job that arrived while a large one was still being consumed. Cancelling is
 * checked between jobs only; a job already on the wire finishes printing.
 */
export async function runPrintJobs(
  jobs: ZplJob[],
  send: (job: ZplJob) => Promise<void>,
  options: {
    startAt?: number;
    signal?: AbortSignal;
    onProgress?: (progress: PrintRunProgress) => void;
  } = {}
): Promise<PrintRunResult> {
  const { startAt = 0, signal, onProgress } = options;
  const labelsTotal = jobs.reduce((sum, j) => sum + j.labelCount, 0);
  let labelsDone = jobs.slice(0, startAt).reduce((sum, j) => sum + j.labelCount, 0);
  onProgress?.({ jobsDone: startAt, jobsTotal: jobs.length, labelsDone, labelsTotal });

  for (const [i, job] of jobs.entries()) {
    if (i < startAt) continue;
    if (signal?.aborted) return { status: "cancelled", nextJob: i };
    try {
      await send(job);
    } catch (error) {
      return { status: "failed", failedJob: i, error };
    }
    labelsDone += job.labelCount;
    onProgress?.({ jobsDone: i + 1, jobsTotal: jobs.length, labelsDone, labelsTotal });
  }
  return { status: "done" };
}

/** 1-based label numbers not sent, from job `from` to the end. */
export function unsentRange(jobs: ZplJob[], from: number): { first: number; last: number } | null {
  const first = jobs[from];
  const last = jobs.at(-1);
  if (!first || !last) return null;
  return { first: first.firstIndex + 1, last: last.lastIndex + 1 };
}
```

`…/_components/transports/send.ts`:

```ts
import type { ZplJob } from "../zpl/jobs";
import type { PrinterProfile } from "../zpl/profile";
import { sendViaHelper } from "./helper-client";
import type { FetchLike } from "./print-error";
import { sendToZebra } from "./zebra-direct";

/** window.fetch must be called unbound-safe, or Chrome throws "Illegal invocation". */
export const browserFetch: FetchLike = (input, init) => fetch(input, init);

export function senderFor(
  profile: PrinterProfile,
  fetchFn: FetchLike
): (job: ZplJob) => Promise<void> {
  const { target } = profile;
  if (profile.transport === "zebra-direct" && target.kind === "network") {
    return (job) => sendToZebra(fetchFn, target.host, job.zpl);
  }
  return (job) =>
    sendViaHelper(fetchFn, target, job.zpl, `Stickers ${job.firstIndex + 1}-${job.lastIndex + 1}`);
}
```

(`…` is `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]`, as in the Files list.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test:unit 2>&1 | grep -E '^# (tests|pass|fail)'`
Expected: `# fail 0`, and pass = baseline **+ 81**.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/web-app-wt-sticker-zpl
git add ':(literal)apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports'
git commit -F - <<'EOF'
feat(stickers): Print Helper and direct-to-Zebra transports

Detects the helper on 127.0.0.1:9180 (missing, outdated, ready), maps its
errors to codes, posts no-cors to a Zebra's /pstprnt with Chrome's local
address space, and runs jobs strictly one after another with progress,
cancel between jobs and resume from a failed job.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: Translations

**Files:**
- Modify: `apps/web/src/language-data/unirefund/TagService/resources/en.json`
- Modify: `apps/web/src/language-data/unirefund/TagService/resources/tr.json`

**Interfaces:**
- Produces: the 62 `StickerHeader.PrintLabels.*` keys that Tasks 8–9 read. The keys were cross-checked against the UI code: every key is used, none is missing, and en and tr hold the same set.

- [ ] **Step 1: Add the English keys**

In `en.json`, insert these lines directly after the line starting with `"StickerHeader.PrintLabels.UnknownHost":`. More keys follow that line, so each new line keeps its trailing comma.

```json
  "StickerHeader.PrintLabels.Printer": "Printer",
  "StickerHeader.PrintLabels.BrowserPrint": "Browser print",
  "StickerHeader.PrintLabels.BrowserResolution": "Printer resolution",
  "StickerHeader.PrintLabels.Beta": "beta",
  "StickerHeader.PrintLabels.ManagePrinters": "Manage printers",
  "StickerHeader.PrintLabels.ManagePrintersDescription": "Label printers saved here are kept in this browser on this computer only.",
  "StickerHeader.PrintLabels.AddPrinter": "Add printer",
  "StickerHeader.PrintLabels.EditPrinter": "Edit",
  "StickerHeader.PrintLabels.DeletePrinter": "Delete",
  "StickerHeader.PrintLabels.SavePrinter": "Save printer",
  "StickerHeader.PrintLabels.Preset": "Printer model",
  "StickerHeader.PrintLabels.PrinterName": "Name",
  "StickerHeader.PrintLabels.Transport": "Connection",
  "StickerHeader.PrintLabels.Transport.Helper": "Print Helper",
  "StickerHeader.PrintLabels.Transport.ZebraDirect": "Direct to Zebra (beta)",
  "StickerHeader.PrintLabels.TargetKind": "Printer type",
  "StickerHeader.PrintLabels.Target.Network": "Network printer",
  "StickerHeader.PrintLabels.Target.Queue": "USB / installed printer",
  "StickerHeader.PrintLabels.FindPrinters": "Find printers",
  "StickerHeader.PrintLabels.FindingPrinters": "Searching…",
  "StickerHeader.PrintLabels.Host": "Printer IP address",
  "StickerHeader.PrintLabels.Queue": "Installed printer",
  "StickerHeader.PrintLabels.Resolution": "Resolution (dpi)",
  "StickerHeader.PrintLabels.Rotation": "Rotation",
  "StickerHeader.PrintLabels.HeadWidth": "Print head width (mm)",
  "StickerHeader.PrintLabels.LabelWidth": "Label width (mm)",
  "StickerHeader.PrintLabels.LabelHeight": "Label length (mm)",
  "StickerHeader.PrintLabels.OffsetX": "Offset X (mm)",
  "StickerHeader.PrintLabels.OffsetY": "Offset Y (mm)",
  "StickerHeader.PrintLabels.Media": "Ribbon",
  "StickerHeader.PrintLabels.Media.Printer": "Use the printer's setting",
  "StickerHeader.PrintLabels.Media.Ribbon": "With ribbon (thermal transfer)",
  "StickerHeader.PrintLabels.Media.Direct": "No ribbon (direct thermal)",
  "StickerHeader.PrintLabels.InvalidPrinter": "Check the fields: a network printer needs a local IP address such as 192.168.1.20, and every size must be a number.",
  "StickerHeader.PrintLabels.DoesNotFit": "The 70×100 mm sticker does not fit this label at this rotation.",
  "StickerHeader.PrintLabels.AlignmentHelp": "Print the alignment test, then enter the number under the paper's left edge on the horizontal ruler as Offset X, and the number at its top edge on the vertical ruler as Offset Y.",
  "StickerHeader.PrintLabels.AlignmentTest": "Print alignment test",
  "StickerHeader.PrintLabels.AlignmentSent": "Alignment test sent to the printer.",
  "StickerHeader.PrintLabels.ProfilesNotSaved": "The printers could not be saved in this browser.",
  "StickerHeader.PrintLabels.HelperMissing": "Print Helper isn't running on this computer.",
  "StickerHeader.PrintLabels.HelperInstall": "Install Print Helper",
  "StickerHeader.PrintLabels.HelperAskContact": "Ask your Unirefund contact for the Print Helper installer.",
  "StickerHeader.PrintLabels.HelperOutdated": "A newer Print Helper is available.",
  "StickerHeader.PrintLabels.UseBrowserPrint": "Use browser print",
  "StickerHeader.PrintLabels.DirectNote": "Zebra printers don't confirm jobs sent directly: “sent” means the printer received the data.",
  "StickerHeader.PrintLabels.Preparing": "Preparing labels…",
  "StickerHeader.PrintLabels.Progress": "Job {0}/{1} · {2}/{3} labels",
  "StickerHeader.PrintLabels.Stop": "Stop",
  "StickerHeader.PrintLabels.Sent": "{0} label(s) sent to the printer.",
  "StickerHeader.PrintLabels.CheckPrinter": "Printers don't report errors back. If nothing prints, check the printer's light.",
  "StickerHeader.PrintLabels.Stopped": "Printing stopped.",
  "StickerHeader.PrintLabels.NotSent": "Labels {0}–{1} were not sent.",
  "StickerHeader.PrintLabels.RetryFromHere": "Continue from here",
  "StickerHeader.PrintLabels.Skipped": "{0} label(s) were skipped because their QR code could not be printed.",
  "StickerHeader.PrintLabels.Sample": "Preview of the first {0} labels",
  "StickerHeader.PrintLabels.Error.HelperMissing": "Print Helper is not running on this computer.",
  "StickerHeader.PrintLabels.Error.InvalidTarget": "The printer address was refused. Use a local IP address on port 9100.",
  "StickerHeader.PrintLabels.Error.QueueNotFound": "That printer is no longer installed on this computer. Edit the printer and pick it again.",
  "StickerHeader.PrintLabels.Error.PrinterUnreachable": "The printer could not be reached. Check that it is switched on and connected.",
  "StickerHeader.PrintLabels.Error.PrinterTimeout": "The printer stopped responding.",
  "StickerHeader.PrintLabels.Error.NetworkBlocked": "The browser blocked the connection. Allow local network access for this site in the browser's site settings.",
  "StickerHeader.PrintLabels.Error.Unknown": "Printing failed.",
```

- [ ] **Step 2: Add the Turkish keys**

In `tr.json`, insert these after the `"StickerHeader.PrintLabels.UnknownHost":` line:

```json
  "StickerHeader.PrintLabels.Printer": "Yazıcı",
  "StickerHeader.PrintLabels.BrowserPrint": "Tarayıcıdan yazdır",
  "StickerHeader.PrintLabels.BrowserResolution": "Yazıcı çözünürlüğü",
  "StickerHeader.PrintLabels.Beta": "beta",
  "StickerHeader.PrintLabels.ManagePrinters": "Yazıcıları yönet",
  "StickerHeader.PrintLabels.ManagePrintersDescription": "Burada kaydedilen etiket yazıcıları yalnızca bu bilgisayardaki bu tarayıcıda saklanır.",
  "StickerHeader.PrintLabels.AddPrinter": "Yazıcı ekle",
  "StickerHeader.PrintLabels.EditPrinter": "Düzenle",
  "StickerHeader.PrintLabels.DeletePrinter": "Sil",
  "StickerHeader.PrintLabels.SavePrinter": "Yazıcıyı kaydet",
  "StickerHeader.PrintLabels.Preset": "Yazıcı modeli",
  "StickerHeader.PrintLabels.PrinterName": "Ad",
  "StickerHeader.PrintLabels.Transport": "Bağlantı",
  "StickerHeader.PrintLabels.Transport.Helper": "Print Helper",
  "StickerHeader.PrintLabels.Transport.ZebraDirect": "Doğrudan Zebra'ya (beta)",
  "StickerHeader.PrintLabels.TargetKind": "Yazıcı türü",
  "StickerHeader.PrintLabels.Target.Network": "Ağ yazıcısı",
  "StickerHeader.PrintLabels.Target.Queue": "USB / yüklü yazıcı",
  "StickerHeader.PrintLabels.FindPrinters": "Yazıcıları bul",
  "StickerHeader.PrintLabels.FindingPrinters": "Aranıyor…",
  "StickerHeader.PrintLabels.Host": "Yazıcı IP adresi",
  "StickerHeader.PrintLabels.Queue": "Yüklü yazıcı",
  "StickerHeader.PrintLabels.Resolution": "Çözünürlük (dpi)",
  "StickerHeader.PrintLabels.Rotation": "Döndürme",
  "StickerHeader.PrintLabels.HeadWidth": "Baskı kafası genişliği (mm)",
  "StickerHeader.PrintLabels.LabelWidth": "Etiket genişliği (mm)",
  "StickerHeader.PrintLabels.LabelHeight": "Etiket uzunluğu (mm)",
  "StickerHeader.PrintLabels.OffsetX": "X kaydırma (mm)",
  "StickerHeader.PrintLabels.OffsetY": "Y kaydırma (mm)",
  "StickerHeader.PrintLabels.Media": "Ribon",
  "StickerHeader.PrintLabels.Media.Printer": "Yazıcının ayarını kullan",
  "StickerHeader.PrintLabels.Media.Ribbon": "Ribonlu (termal transfer)",
  "StickerHeader.PrintLabels.Media.Direct": "Ribonsuz (direkt termal)",
  "StickerHeader.PrintLabels.InvalidPrinter": "Alanları kontrol edin: ağ yazıcısı için 192.168.1.20 gibi yerel bir IP adresi gerekir ve tüm ölçüler sayı olmalıdır.",
  "StickerHeader.PrintLabels.DoesNotFit": "70×100 mm etiket tasarımı bu döndürmeyle bu etikete sığmıyor.",
  "StickerHeader.PrintLabels.AlignmentHelp": "Hizalama testini yazdırın; ardından yatay cetvelde kağıdın sol kenarının altındaki sayıyı X kaydırma, dikey cetvelde üst kenarındaki sayıyı Y kaydırma olarak girin.",
  "StickerHeader.PrintLabels.AlignmentTest": "Hizalama testi yazdır",
  "StickerHeader.PrintLabels.AlignmentSent": "Hizalama testi yazıcıya gönderildi.",
  "StickerHeader.PrintLabels.ProfilesNotSaved": "Yazıcılar bu tarayıcıya kaydedilemedi.",
  "StickerHeader.PrintLabels.HelperMissing": "Print Helper bu bilgisayarda çalışmıyor.",
  "StickerHeader.PrintLabels.HelperInstall": "Print Helper'ı yükle",
  "StickerHeader.PrintLabels.HelperAskContact": "Print Helper kurulum dosyası için Unirefund yetkilinize başvurun.",
  "StickerHeader.PrintLabels.HelperOutdated": "Daha yeni bir Print Helper sürümü var.",
  "StickerHeader.PrintLabels.UseBrowserPrint": "Tarayıcıdan yazdır",
  "StickerHeader.PrintLabels.DirectNote": "Zebra yazıcılar doğrudan gönderilen işleri onaylamaz: “gönderildi”, verinin yazıcıya ulaştığı anlamına gelir.",
  "StickerHeader.PrintLabels.Preparing": "Etiketler hazırlanıyor…",
  "StickerHeader.PrintLabels.Progress": "İş {0}/{1} · {2}/{3} etiket",
  "StickerHeader.PrintLabels.Stop": "Durdur",
  "StickerHeader.PrintLabels.Sent": "{0} etiket yazıcıya gönderildi.",
  "StickerHeader.PrintLabels.CheckPrinter": "Yazıcılar hataları geri bildirmez. Hiçbir şey basılmazsa yazıcının ışığını kontrol edin.",
  "StickerHeader.PrintLabels.Stopped": "Yazdırma durduruldu.",
  "StickerHeader.PrintLabels.NotSent": "{0}–{1} arası etiketler gönderilmedi.",
  "StickerHeader.PrintLabels.RetryFromHere": "Buradan devam et",
  "StickerHeader.PrintLabels.Skipped": "QR kodu basılamadığı için {0} etiket atlandı.",
  "StickerHeader.PrintLabels.Sample": "İlk {0} etiketin önizlemesi",
  "StickerHeader.PrintLabels.Error.HelperMissing": "Print Helper bu bilgisayarda çalışmıyor.",
  "StickerHeader.PrintLabels.Error.InvalidTarget": "Yazıcı adresi reddedildi. 9100 portunda yerel bir IP adresi kullanın.",
  "StickerHeader.PrintLabels.Error.QueueNotFound": "Bu yazıcı artık bu bilgisayarda yüklü değil. Yazıcıyı düzenleyip yeniden seçin.",
  "StickerHeader.PrintLabels.Error.PrinterUnreachable": "Yazıcıya ulaşılamadı. Açık ve bağlı olduğunu kontrol edin.",
  "StickerHeader.PrintLabels.Error.PrinterTimeout": "Yazıcı yanıt vermeyi bıraktı.",
  "StickerHeader.PrintLabels.Error.NetworkBlocked": "Tarayıcı bağlantıyı engelledi. Tarayıcının site ayarlarından bu site için yerel ağ erişimine izin verin.",
  "StickerHeader.PrintLabels.Error.Unknown": "Yazdırma başarısız oldu.",
```

- [ ] **Step 3: Validate and regenerate the bundle**

```bash
cd /c/unirefund/web-app-wt-sticker-zpl/apps/web
node -e "for (const l of ['en','tr']) JSON.parse(require('fs').readFileSync('src/language-data/unirefund/TagService/resources/'+l+'.json','utf8')); console.log('json ok')"
pnpm run init
cd ../.. && git status --short
```

Expected:
- `json ok`;
- `init` succeeds; it needs `GATEWAY_URL` from `.env` and network access;
- `git status` shows the two JSON files, and possibly `packages/utils` as modified (init rewrites `policies.json` there). **Leave `packages/utils` unstaged.**

- [ ] **Step 4: Commit**

```bash
cd /c/unirefund/web-app-wt-sticker-zpl
git add apps/web/src/language-data/unirefund/TagService/resources/en.json apps/web/src/language-data/unirefund/TagService/resources/tr.json
git commit -F - <<'EOF'
feat(stickers): en and tr strings for label-printer printing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: Artwork pixels, printer picker, manage-printers sheet

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/sticker-label-background.ts` (replace the whole file)
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/printer-picker.tsx`
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/manage-printers-sheet.tsx`

**Interfaces:**
- Consumes: `RgbaImage` (Task 4); profiles and drafts (Task 3); `listHelperPrinters`, `HelperPrinters`, `browserFetch` (Task 6); the Task 7 keys.
- Produces:
  - `loadStickerBackground(): Promise<string>`, unchanged behaviour;
  - `renderStickerArtwork(widthPx): Promise<RgbaImage>`;
  - `BROWSER_PRINT` and `<PrinterPicker profiles value onChange disabled? />`;
  - `<ManagePrintersSheet profiles onProfilesChange helperAvailable onAlignmentTest />`.

These are browser components, so there is no unit-test runner for them: Node's runner loads no JSX. They are verified by type-check and lint here, and in the browser in Task 10.

- [ ] **Step 1: Replace `sticker-label-background.ts`**

It keeps today's PNG export, now through a shared renderer that paints white paper first, and adds raw-pixel export for the ZPL graphic:

```ts
"use client";

import type { RgbaImage } from "./zpl/artwork";

// Bundled rather than served from `public/`: the app's locale middleware
// redirects any request whose first path segment isn't a locale, so a plain
// `/unirefund_sticker_70x100mm.pdf` URL never reaches the file. Resolving it
// through the bundler emits it under `/_next/static/...`, which the
// middleware's matcher already excludes.
const BACKGROUND_PDF_URL = new URL(
  "./unirefund_sticker_70x100mm.pdf",
  import.meta.url
).toString();

/**
 * 70mm at 300 DPI. The artwork is rasterised to this width and the label's
 * `<img>` stretches it back to 70mm, so the printed background lands at 300 DPI
 * whatever the browser's own print scaling does.
 */
const LABEL_WIDTH_PX = 827;

/**
 * Renders the artwork's first page `widthPx` wide on a white canvas.
 *
 * `pdfjs-dist` is imported lazily rather than at module scope: it is ~350KB that
 * only an operator who ticks the background toggle ever needs, and deferring it
 * keeps pdf.js out of the server render of this client component entirely.
 */
async function renderFirstPage(widthPx: number): Promise<HTMLCanvasElement> {
  const pdfjs = await import("pdfjs-dist");

  // Resolved by the bundler rather than fetched from a CDN. A printed sticker is
  // permanent, so a CDN outage must not be able to degrade a print run.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const pdf = await pdfjs.getDocument(BACKGROUND_PDF_URL).promise;
  try {
    const page = await pdf.getPage(1);
    // Scale is derived from the page's own width rather than an assumed
    // 198.43x283.46pt box, so artwork whose page size drifts from 70x100mm
    // still rasterises at the requested width instead of silently softening.
    const scale = widthPx / page.getViewport({ scale: 1 }).width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    // The ZPL ink test reads transparent pixels as black, so paint paper first.
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas is unavailable");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, viewport }).promise;
    return canvas;
  } finally {
    void pdf.destroy();
  }
}

/** Rasterises the sticker artwork to a PNG data URL for browser printing. */
export async function loadStickerBackground(): Promise<string> {
  return (await renderFirstPage(LABEL_WIDTH_PX)).toDataURL("image/png");
}

/**
 * The artwork's raw pixels `widthPx` wide, for converting to a ZPL graphic.
 * Callers pass the printer's dot width times ARTWORK_SUPERSAMPLE.
 */
export async function renderStickerArtwork(widthPx: number): Promise<RgbaImage> {
  const canvas = await renderFirstPage(widthPx);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is unavailable");
  const { width, height, data } = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width, height, data };
}
```

- [ ] **Step 2: Create `printer-picker.tsx`**

```tsx
"use client";

import { useTranslations } from "@/src/providers/i18n";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ayasofyazilim-ui/components/select";
import type { PrinterProfile } from "./zpl/profile";

/** The picker value that means "today's browser print dialog". */
export const BROWSER_PRINT = "browser";

export function PrinterPicker({
  profiles,
  value,
  onChange,
  disabled,
}: {
  profiles: PrinterProfile[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslations();
  return (
    <div className="flex items-center gap-2">
      <Label
        data-testid="print-sticker-lines-printer-label"
        htmlFor="print-sticker-lines-printer"
      >
        {t.TagService["StickerHeader.PrintLabels.Printer"]}
      </Label>
      <Select disabled={disabled} onValueChange={onChange} value={value}>
        <SelectTrigger
          className="w-64"
          data-testid="print-sticker-lines-printer"
          id="print-sticker-lines-printer"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={BROWSER_PRINT}>
            {t.TagService["StickerHeader.PrintLabels.BrowserPrint"]}
          </SelectItem>
          {profiles.map((profile) => (
            <SelectItem key={profile.id} value={profile.id}>
              {profile.transport === "zebra-direct"
                ? `${profile.name} (${t.TagService["StickerHeader.PrintLabels.Beta"]})`
                : profile.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 3: Create `manage-printers-sheet.tsx`**

```tsx
"use client";

import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { Input } from "@repo/ayasofyazilim-ui/components/input";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ayasofyazilim-ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ayasofyazilim-ui/components/sheet";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { LucideSettings2 } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { listHelperPrinters, type HelperPrinters } from "./transports/helper-client";
import { browserFetch } from "./transports/send";
import { PRESETS, type PresetId, type PrinterProfile } from "./zpl/profile";
import {
  draftFromPreset,
  draftFromProfile,
  profileFitsDesign,
  profileFromDraft,
  type ProfileDraft,
} from "./zpl/profile-draft";

const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label data-testid={`${id}-label`} htmlFor={id}>
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * Add, edit and delete printer profiles, find printers through the Print
 * Helper, and print the calibration label. Profiles live in this browser only.
 */
export function ManagePrintersSheet({
  profiles,
  onProfilesChange,
  helperAvailable,
  onAlignmentTest,
}: {
  profiles: PrinterProfile[];
  onProfilesChange: (profiles: PrinterProfile[]) => void;
  helperAvailable: boolean;
  onAlignmentTest: (profile: PrinterProfile) => Promise<void>;
}) {
  const { t } = useTranslations();
  const tag = t.TagService;
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [presetId, setPresetId] = useState<PresetId>("zt231-203");
  const [found, setFound] = useState<HelperPrinters | null>(null);
  const [isFinding, startFinding] = useTransition();
  const [isTesting, startTesting] = useTransition();

  const transportLabels = {
    helper: tag["StickerHeader.PrintLabels.Transport.Helper"],
    "zebra-direct": tag["StickerHeader.PrintLabels.Transport.ZebraDirect"],
  };
  const targetLabels = {
    network: tag["StickerHeader.PrintLabels.Target.Network"],
    queue: tag["StickerHeader.PrintLabels.Target.Queue"],
  };
  const mediaLabels = {
    printer: tag["StickerHeader.PrintLabels.Media.Printer"],
    ribbon: tag["StickerHeader.PrintLabels.Media.Ribbon"],
    direct: tag["StickerHeader.PrintLabels.Media.Direct"],
  };

  const candidate = draft ? profileFromDraft(draft) : null;
  const update = (patch: Partial<ProfileDraft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  function handleSave() {
    if (!candidate) return;
    const exists = profiles.some((p) => p.id === candidate.id);
    onProfilesChange(
      exists ? profiles.map((p) => (p.id === candidate.id ? candidate : p)) : [...profiles, candidate]
    );
    setDraft(null);
  }

  function handleFind() {
    startFinding(async () => {
      try {
        setFound(await listHelperPrinters(browserFetch, true));
      } catch {
        toast.error(tag["StickerHeader.PrintLabels.Error.HelperMissing"]);
      }
    });
  }

  function handleAlignmentTest() {
    if (!candidate) return;
    startTesting(() => onAlignmentTest(candidate));
  }

  return (
    <Sheet>
      <SheetTrigger asChild data-testid="print-sticker-lines-manage-printers-trigger">
        <Button data-testid="print-sticker-lines-manage-printers" variant="outline">
          <LucideSettings2 />
          {tag["StickerHeader.PrintLabels.ManagePrinters"]}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[520px] overflow-y-auto sm:max-w-[520px]">
        <SheetHeader>
          <SheetTitle>{tag["StickerHeader.PrintLabels.ManagePrinters"]}</SheetTitle>
          <SheetDescription>{tag["StickerHeader.PrintLabels.ManagePrintersDescription"]}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 p-4">
          {profiles.map((profile) => (
            <div className="flex items-center justify-between gap-2 rounded-md border p-2" key={profile.id}>
              <span className="text-sm">
                {profile.name} ·{" "}
                {profile.target.kind === "network" ? profile.target.host : profile.target.name}
              </span>
              <div className="flex gap-2">
                <Button
                  data-testid={`print-sticker-lines-edit-printer-${profile.id}`}
                  onClick={() => setDraft(draftFromProfile(profile))}
                  size="sm"
                  variant="outline"
                >
                  {tag["StickerHeader.PrintLabels.EditPrinter"]}
                </Button>
                <Button
                  data-testid={`print-sticker-lines-delete-printer-${profile.id}`}
                  onClick={() => onProfilesChange(profiles.filter((p) => p.id !== profile.id))}
                  size="sm"
                  variant="destructive"
                >
                  {tag["StickerHeader.PrintLabels.DeletePrinter"]}
                </Button>
              </div>
            </div>
          ))}

          <div className="flex items-end gap-2">
            <Field id="print-sticker-lines-preset" label={tag["StickerHeader.PrintLabels.Preset"]}>
              <Select onValueChange={(v) => setPresetId(v as PresetId)} value={presetId}>
                <SelectTrigger className="w-64" data-testid="print-sticker-lines-preset" id="print-sticker-lines-preset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {PRESETS[id].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button
              data-testid="print-sticker-lines-add-printer"
              onClick={() => setDraft(draftFromPreset(presetId, crypto.randomUUID()))}
            >
              {tag["StickerHeader.PrintLabels.AddPrinter"]}
            </Button>
          </div>

          {draft ? (
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <Field id="print-sticker-lines-printer-name" label={tag["StickerHeader.PrintLabels.PrinterName"]}>
                <Input
                  data-testid="print-sticker-lines-printer-name"
                  id="print-sticker-lines-printer-name"
                  onChange={(e) => update({ name: e.target.value })}
                  value={draft.name}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field id="print-sticker-lines-transport" label={tag["StickerHeader.PrintLabels.Transport"]}>
                  <Select
                    onValueChange={(v) =>
                      update(
                        v === "zebra-direct"
                          ? { transport: "zebra-direct", targetKind: "network" }
                          : { transport: "helper" }
                      )
                    }
                    value={draft.transport}
                  >
                    <SelectTrigger data-testid="print-sticker-lines-transport" id="print-sticker-lines-transport">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="helper">{transportLabels.helper}</SelectItem>
                      <SelectItem value="zebra-direct">{transportLabels["zebra-direct"]}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field id="print-sticker-lines-target-kind" label={tag["StickerHeader.PrintLabels.TargetKind"]}>
                  <Select
                    disabled={draft.transport === "zebra-direct"}
                    onValueChange={(v) => update({ targetKind: v as ProfileDraft["targetKind"] })}
                    value={draft.targetKind}
                  >
                    <SelectTrigger data-testid="print-sticker-lines-target-kind" id="print-sticker-lines-target-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="network">{targetLabels.network}</SelectItem>
                      <SelectItem value="queue">{targetLabels.queue}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {helperAvailable ? (
                <Button
                  data-testid="print-sticker-lines-find-printers"
                  disabled={isFinding}
                  onClick={handleFind}
                  variant="outline"
                >
                  {isFinding
                    ? tag["StickerHeader.PrintLabels.FindingPrinters"]
                    : tag["StickerHeader.PrintLabels.FindPrinters"]}
                </Button>
              ) : null}

              {draft.targetKind === "network" ? (
                <Field id="print-sticker-lines-host" label={tag["StickerHeader.PrintLabels.Host"]}>
                  <Input
                    data-testid="print-sticker-lines-host"
                    id="print-sticker-lines-host"
                    onChange={(e) => update({ host: e.target.value })}
                    placeholder="192.168.1.20"
                    value={draft.host}
                  />
                  <div className="flex flex-wrap gap-1">
                    {found?.network.map((printer) => (
                      <Button
                        data-testid={`print-sticker-lines-found-${printer.host}`}
                        key={printer.host}
                        onClick={() => update({ host: printer.host })}
                        size="sm"
                        variant="secondary"
                      >
                        {printer.host}
                      </Button>
                    ))}
                  </div>
                </Field>
              ) : (
                <Field id="print-sticker-lines-queue" label={tag["StickerHeader.PrintLabels.Queue"]}>
                  <Select onValueChange={(v) => update({ queue: v })} value={draft.queue}>
                    <SelectTrigger data-testid="print-sticker-lines-queue" id="print-sticker-lines-queue">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(found?.queues ?? (draft.queue ? [{ name: draft.queue }] : [])).map((queue) => (
                        <SelectItem key={queue.name} value={queue.name}>
                          {queue.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field id="print-sticker-lines-dpi" label={tag["StickerHeader.PrintLabels.Resolution"]}>
                  <Select onValueChange={(v) => update({ dpi: v as ProfileDraft["dpi"] })} value={draft.dpi}>
                    <SelectTrigger data-testid="print-sticker-lines-dpi" id="print-sticker-lines-dpi">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="203">203</SelectItem>
                      <SelectItem value="300">300</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field id="print-sticker-lines-rotation" label={tag["StickerHeader.PrintLabels.Rotation"]}>
                  <Select
                    onValueChange={(v) => update({ rotation: v as ProfileDraft["rotation"] })}
                    value={draft.rotation}
                  >
                    <SelectTrigger data-testid="print-sticker-lines-rotation" id="print-sticker-lines-rotation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["0", "90", "180", "270"] as const).map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}°
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {(
                  [
                    ["headWidthMm", "print-sticker-lines-head-width", tag["StickerHeader.PrintLabels.HeadWidth"]],
                    ["labelWidthMm", "print-sticker-lines-label-width", tag["StickerHeader.PrintLabels.LabelWidth"]],
                    ["labelHeightMm", "print-sticker-lines-label-height", tag["StickerHeader.PrintLabels.LabelHeight"]],
                    ["offsetXmm", "print-sticker-lines-offset-x", tag["StickerHeader.PrintLabels.OffsetX"]],
                    ["offsetYmm", "print-sticker-lines-offset-y", tag["StickerHeader.PrintLabels.OffsetY"]],
                  ] as const
                ).map(([key, id, label]) => (
                  <Field id={id} key={key} label={label}>
                    <Input
                      data-testid={id}
                      id={id}
                      inputMode="decimal"
                      onChange={(e) => update({ [key]: e.target.value } as Partial<ProfileDraft>)}
                      value={draft[key]}
                    />
                  </Field>
                ))}
                <Field id="print-sticker-lines-media" label={tag["StickerHeader.PrintLabels.Media"]}>
                  <Select
                    onValueChange={(v) => update({ media: v as ProfileDraft["media"] })}
                    value={draft.media}
                  >
                    <SelectTrigger data-testid="print-sticker-lines-media" id="print-sticker-lines-media">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="printer">{mediaLabels.printer}</SelectItem>
                      <SelectItem value="ribbon">{mediaLabels.ribbon}</SelectItem>
                      <SelectItem value="direct">{mediaLabels.direct}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {!candidate ? (
                <p className="text-destructive text-sm">{tag["StickerHeader.PrintLabels.InvalidPrinter"]}</p>
              ) : !profileFitsDesign(candidate) ? (
                <p className="text-destructive text-sm">{tag["StickerHeader.PrintLabels.DoesNotFit"]}</p>
              ) : null}
              <p className="text-muted-foreground text-sm">{tag["StickerHeader.PrintLabels.AlignmentHelp"]}</p>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  data-testid="print-sticker-lines-alignment-test"
                  disabled={!candidate || isTesting}
                  onClick={handleAlignmentTest}
                  variant="outline"
                >
                  {tag["StickerHeader.PrintLabels.AlignmentTest"]}
                </Button>
                <Button data-testid="print-sticker-lines-cancel-printer" onClick={() => setDraft(null)} variant="ghost">
                  {t.Default["Cancel"]}
                </Button>
                <Button data-testid="print-sticker-lines-save-printer" disabled={!candidate} onClick={handleSave}>
                  {tag["StickerHeader.PrintLabels.SavePrinter"]}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Type-check and lint**

```bash
cd /c/unirefund/web-app-wt-sticker-zpl
pnpm --filter web type-check 2>&1 | grep 'error TS' | grep -v 'capture-core'
pnpm --filter web lint 2>&1 | grep -E 'stickers/\[stickerId\]|✖'
```

Expected:
- the first command prints nothing; only the two baseline mrz errors remain;
- the second shows **no errors** in the sticker files. Warnings must not exceed the Task 0 count.

A `react-require-testid` error means a required component is missing `data-testid`: add one, prefixed `print-sticker-lines-`.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/web-app-wt-sticker-zpl
git add ':(literal)apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/sticker-label-background.ts' ':(literal)apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/printer-picker.tsx' ':(literal)apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/manage-printers-sheet.tsx'
git commit -F - <<'EOF'
feat(stickers): printer picker and printer setup sheet

Profiles are added from presets, find printers through the Print Helper,
and print the alignment test from the form. The artwork renderer now also
returns raw pixels for the ZPL graphic.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 9: The print dialog

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/print-sticker-lines.tsx` (replace the whole file)

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: `PrintStickerLines`, with the same export name and props (none), so its caller is untouched.

**What changes relative to today's file:**
- **Kept:**
  - label loading through `getStickerLabelsAction` and the permission gate;
  - "Only unused lines", "Add background" and "Optimize for A4" (A4 now shows for browser print only);
  - the existing comments that still apply.
- **Added:**
  - the printer picker and "Manage printers";
  - helper detection in the open handler (no effects);
  - the install / outdated / doesn't-fit / direct-to-Zebra notes;
  - a ZPL run with progress, Stop, "Continue from here" and skipped-label reporting;
  - a browser-print resolution select.
- **Changed:**
  - the QR in the HTML labels now gets a whole-dot size for the chosen resolution, `shape-rendering="crispEdges"`, and the layout's centre;
  - a ZPL printer shows only a three-label sample.

- [ ] **Step 1: Replace `print-sticker-lines.tsx`**

```tsx
"use client";

import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ayasofyazilim-ui/components/dialog";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import { Progress } from "@repo/ayasofyazilim-ui/components/progress";
import { ScrollArea } from "@repo/ayasofyazilim-ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ayasofyazilim-ui/components/select";
import { SidebarMenuButton } from "@repo/ayasofyazilim-ui/components/sidebar";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { Spinner } from "@repo/ayasofyazilim-ui/components/spinner";
import { Switch } from "@repo/ayasofyazilim-ui/components/switch";
import { useApplicationConfiguration } from "@repo/utils/app-config";
import { isActionGranted } from "@repo/utils/policies";
import { LucidePrinter } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { QRCode } from "react-qr-code";
import { useReactToPrint } from "react-to-print";
import { ManagePrintersSheet } from "./manage-printers-sheet";
import { BROWSER_PRINT, PrinterPicker } from "./printer-picker";
import {
  getStickerLabelsAction,
  type StickerLabel,
} from "./print-sticker-lines-action";
import {
  loadStickerBackground,
  renderStickerArtwork,
} from "./sticker-label-background";
import {
  detectHelper,
  HELPER_DOWNLOAD_URL,
  type HelperDetection,
} from "./transports/helper-client";
import { PrintError, type PrintErrorCode } from "./transports/print-error";
import {
  runPrintJobs,
  unsentRange,
  type PrintRunProgress,
} from "./transports/print-run";
import { browserFetch, senderFor } from "./transports/send";
import { buildAlignmentTestZpl } from "./zpl/alignment-test";
import { ARTWORK_SUPERSAMPLE } from "./zpl/artwork";
import { DESIGN_SIZE_MM, mmToDots } from "./zpl/geometry";
import { artworkCommandFor, buildJobs, type ZplJob } from "./zpl/jobs";
import { LAYOUTS, type LayoutKind } from "./zpl/layouts";
import {
  loadProfiles,
  saveProfiles,
  type PrinterProfile,
} from "./zpl/profile";
import { profileFitsDesign } from "./zpl/profile-draft";
import { qrMagnification, qrModuleCount, qrSizeMm } from "./zpl/qr";

/**
 * One label per page at the physical label size. The zero margin is what makes a
 * 70x100mm sheet come out as a full-bleed label rather than a shrunken one
 * centred inside the printer's default margins.
 */
const LABEL_PAGE_STYLE = `
  @page { size: 70mm 100mm; margin: 0; }
  @media print {
    html, body { margin: 0; padding: 0; background: #fff; }
  }
`;

/**
 * Development aid: fits 3x2 = 6 of the same 70x100mm labels onto a single A4
 * sheet (210x297mm) instead of one label per page, so a whole book can be test
 * printed on ordinary office paper without burning through physical stock.
 */
const A4_PAGE_STYLE = `
  @page { size: A4; margin: 0; }
  @media print {
    html, body { margin: 0; padding: 0; background: #fff; }
  }
`;

/** How many 70x100mm labels tile onto one A4 sheet: 3 columns x 2 rows = 210x200mm. */
const LABELS_PER_A4_SHEET = 6;

/** A ZPL print runs straight to the printer, so the preview is a sample. */
const ZPL_PREVIEW_COUNT = 3;

const BROWSER_DPIS = [203, 300, 600] as const;
type BrowserDpi = (typeof BROWSER_DPIS)[number];

type UnsentRange = { first: number; last: number } | null;

type ZplRun =
  | { phase: "idle" }
  | { phase: "preparing" }
  | { phase: "printing"; progress: PrintRunProgress }
  | { phase: "done"; sent: number; skipped: number; direct: boolean }
  | {
      phase: "failed";
      failedJob: number;
      message: string;
      skipped: number;
      notSent: UnsentRange;
    }
  | { phase: "cancelled"; nextJob: number; skipped: number; notSent: UnsentRange };

/** Splits a flat label list into fixed-size groups, the last one possibly short. */
function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

/** Private browsing can throw on access rather than return null. */
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The QR at a whole number of printer dots per module, with crisp edges, centred
 * where the layout puts it. A fractional module is what made PDF prints soft.
 * The white plate keeps the quiet zone clear of any artwork beneath it.
 */
function StickerQr({
  value,
  layoutKind,
  dpi,
}: {
  value: string | null;
  layoutKind: LayoutKind;
  dpi: number;
}) {
  const layout = LAYOUTS[layoutKind];
  const sizeMm = useMemo(() => {
    if (!value) return 20;
    const modules = qrModuleCount(value);
    return qrSizeMm(modules, qrMagnification(modules, dpi, layout.qrMaxMm), dpi);
  }, [value, dpi, layout.qrMaxMm]);
  const { x, y } = layout.qrCenterMm;
  const plateMm = sizeMm + 5;
  const box = (side: number) => ({
    left: `${x - side / 2}mm`,
    top: `${y - side / 2}mm`,
    width: `${side}mm`,
    height: `${side}mm`,
  });

  return (
    <>
      <div className="absolute bg-white" style={box(plateMm)} />
      {value ? (
        <QRCode
          className="absolute"
          level="M"
          shapeRendering="crispEdges"
          style={box(sizeMm)}
          value={value}
        />
      ) : (
        // Nothing is written on a label, so an unencodable line number leaves an
        // empty outline rather than a page that reads as blank by design.
        <div
          className="absolute border-2 border-dashed border-black/30"
          style={box(sizeMm)}
        />
      )}
    </>
  );
}

/**
 * A single 70x100mm label: an optional artwork background plus the QR.
 *
 * `pageBreakBefore` is set on every label but the first - forcing a break *after*
 * the last one leaves a trailing blank page in some browsers.
 */
function StickerLabelPage({
  backgroundUrl,
  label,
  pageBreakBefore,
  layoutKind,
  dpi,
}: {
  backgroundUrl: string | null;
  label: StickerLabel;
  pageBreakBefore: boolean;
  layoutKind: LayoutKind;
  dpi: number;
}) {
  return (
    <div
      className={`relative h-[100mm] w-[70mm] shrink-0 overflow-hidden break-inside-avoid border bg-white print:border-0 ${
        pageBreakBefore ? "break-before-page" : ""
      }`}
    >
      {backgroundUrl ? (
        // An <img> rather than a CSS background: background images print only
        // when the operator has ticked "Background graphics" in the print
        // dialog, which would let a whole book print blank without warning.
        <img
          alt=""
          className="absolute inset-0 h-full w-full"
          src={backgroundUrl}
        />
      ) : null}
      <StickerQr dpi={dpi} layoutKind={layoutKind} value={label.qrValue} />
    </div>
  );
}

/**
 * One A4 sheet (210x297mm) holding up to 6 of the same 70x100mm labels in a
 * 3-column grid, for test-printing many labels without one sheet per label.
 * The break sits between sheets, not between labels, so the grid can't be torn
 * across two pages by browser flex/grid fragmentation.
 */
function StickerA4Sheet({
  backgroundUrl,
  labels,
  pageBreakBefore,
  layoutKind,
  dpi,
}: {
  backgroundUrl: string | null;
  labels: StickerLabel[];
  pageBreakBefore: boolean;
  layoutKind: LayoutKind;
  dpi: number;
}) {
  return (
    <div
      className={`grid h-[297mm] w-[210mm] shrink-0 grid-cols-3 gap-0 break-inside-avoid border bg-white print:border-0 ${
        pageBreakBefore ? "break-before-page" : ""
      }`}
    >
      {labels.map((label) => (
        <StickerLabelPage
          backgroundUrl={backgroundUrl}
          dpi={dpi}
          key={label.stickerLineNumber}
          label={label}
          layoutKind={layoutKind}
          pageBreakBefore={false}
        />
      ))}
    </div>
  );
}

/**
 * Prints a whole sticker book as 70x100mm labels, either through the browser's
 * print dialog or as ZPL straight to a label printer (Print Helper or a
 * networked Zebra), where the printer draws the QR at whole-dot modules.
 */
export function PrintStickerLines() {
  const { t } = useTranslations();
  const tag = t.TagService;
  const { lang, stickerId } = useParams<{ lang: string; stickerId: string }>();
  const { policies: grantedPolicies } = useApplicationConfiguration();
  const [open, setOpen] = useState(false);
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [labels, setLabels] = useState<StickerLabel[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [withBackground, setWithBackground] = useState(false);
  const [background, setBackground] = useState<string | null>(null);
  const [optimizeForA4, setOptimizeForA4] = useState(false);
  // A second transition rather than reusing `isPending`: the label fetch and the
  // PDF render are independent, and sharing one flag would make the spinner
  // claim the label list is reloading when it is not.
  const [isBackgroundPending, startBackgroundTransition] = useTransition();
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [printerId, setPrinterId] = useState<string>(BROWSER_PRINT);
  const [helper, setHelper] = useState<HelperDetection | null>(null);
  const [browserDpi, setBrowserDpi] = useState<BrowserDpi>(203);
  const [zplRun, setZplRun] = useState<ZplRun>({ phase: "idle" });
  const contentRef = useRef<HTMLDivElement>(null);
  // Bumped whenever the dialog closes, so a background load already in flight
  // can tell it no longer belongs to an open dialog and discard its result
  // instead of setting state behind a closed dialog or toasting an error for
  // a run the operator can no longer see.
  const backgroundLoadGenerationRef = useRef(0);
  const jobsRef = useRef<ZplJob[]>([]);
  const skippedRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const selectedProfile = profiles.find((p) => p.id === printerId) ?? null;
  const layoutKind: LayoutKind = withBackground ? "artwork" : "preprinted";
  const previewDpi = selectedProfile?.dpi ?? browserDpi;
  const zplBusy = zplRun.phase === "preparing" || zplRun.phase === "printing";
  const helperMissing =
    selectedProfile?.transport === "helper" && helper?.state === "missing";
  const doesNotFit =
    selectedProfile !== null && !profileFitsDesign(selectedProfile);

  const print = useReactToPrint({
    contentRef,
    documentTitle: tag["StickerHeader.PrintLabels"],
    pageStyle: optimizeForA4 ? A4_PAGE_STYLE : LABEL_PAGE_STYLE,
  });

  const labelChunks = useMemo(
    () => (optimizeForA4 && labels ? chunk(labels, LABELS_PER_A4_SHEET) : []),
    [labels, optimizeForA4]
  );

  // Nothing on the label says which line it is, so a QR that could not be encoded
  // would otherwise print as an unidentifiable sticker. Reported here instead.
  const missingQrCount = labels?.filter((label) => !label.qrValue).length ?? 0;

  // `getStickerLabelsAction` reads the same lines endpoint the page itself
  // does, but printing is a distinct capability from viewing the list - so it
  // is gated here rather than left to the action's own error toast.
  const canPrint = isActionGranted(
    [
      "TagService.StickerHeaders",
      "TagService.StickerHeaders.GetLinesByHeaderId",
    ],
    grantedPolicies
  );
  if (!canPrint) return null;

  const errorMessages: Record<PrintErrorCode, string> = {
    "helper-missing": tag["StickerHeader.PrintLabels.Error.HelperMissing"],
    "invalid-target": tag["StickerHeader.PrintLabels.Error.InvalidTarget"],
    "queue-not-found": tag["StickerHeader.PrintLabels.Error.QueueNotFound"],
    "printer-unreachable":
      tag["StickerHeader.PrintLabels.Error.PrinterUnreachable"],
    "printer-timeout": tag["StickerHeader.PrintLabels.Error.PrinterTimeout"],
    "network-blocked": tag["StickerHeader.PrintLabels.Error.NetworkBlocked"],
    unknown: tag["StickerHeader.PrintLabels.Error.Unknown"],
  };
  const errorMessage = (error: unknown) =>
    error instanceof PrintError
      ? errorMessages[error.code]
      : errorMessages.unknown;

  function loadLabels(nextUnusedOnly: boolean) {
    setLabels(null);
    startTransition(async () => {
      const response = await getStickerLabelsAction({
        lang,
        stickerHeaderId: stickerId,
        unusedOnly: nextUnusedOnly,
      });
      if (response.type !== "success") {
        toast.error(response.message || t.Default["error"]);
        return;
      }
      setLabels(response.data);
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      loadLabels(unusedOnly);
      const loaded = loadProfiles(browserStorage());
      setProfiles(loaded);
      if (!loaded.some((p) => p.id === printerId)) setPrinterId(BROWSER_PRINT);
      setHelper(null);
      void detectHelper(browserFetch).then(setHelper);
    } else {
      // Thousands of QR codes are not worth keeping mounted behind a closed dialog.
      setLabels(null);
      setBackground(null);
      setWithBackground(false);
      setOptimizeForA4(false);
      // Stops a ZPL run between jobs; a job already on the wire still prints.
      abortRef.current?.abort();
      abortRef.current = null;
      setZplRun({ phase: "idle" });
      // Invalidates any background load still in flight - see the ref's comment.
      backgroundLoadGenerationRef.current += 1;
    }
  }

  function handleUnusedOnlyChange(checked: boolean) {
    setUnusedOnly(checked);
    setZplRun({ phase: "idle" });
    loadLabels(checked);
  }

  function handleBackgroundChange(checked: boolean) {
    setWithBackground(checked);
    setZplRun({ phase: "idle" });
    // Rasterised once per dialog session - toggling off and back on reuses it.
    if (!checked || background) return;

    const generation = backgroundLoadGenerationRef.current;
    startBackgroundTransition(async () => {
      try {
        const data = await loadStickerBackground();
        if (backgroundLoadGenerationRef.current !== generation) return;
        setBackground(data);
      } catch (error) {
        if (backgroundLoadGenerationRef.current !== generation) return;
        // Reverted rather than left on: a toggle reading "on" over a run that
        // would print without artwork is the one outcome worth preventing.
        setWithBackground(false);
        console.error(error);
        toast.error(tag["StickerHeader.PrintLabels.BackgroundUnavailable"]);
      }
    });
  }

  function handleProfilesChange(next: PrinterProfile[]) {
    setProfiles(next);
    if (!saveProfiles(browserStorage(), next)) {
      toast.error(tag["StickerHeader.PrintLabels.ProfilesNotSaved"]);
    }
    if (!next.some((p) => p.id === printerId)) setPrinterId(BROWSER_PRINT);
  }

  async function handleAlignmentTest(profile: PrinterProfile) {
    try {
      await senderFor(profile, browserFetch)({
        zpl: `${buildAlignmentTestZpl(profile, layoutKind)}\n`,
        firstIndex: 0,
        lastIndex: 0,
        labelCount: 1,
      });
      toast.success(tag["StickerHeader.PrintLabels.AlignmentSent"]);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  /** Builds the jobs on a fresh run; a retry resumes the jobs already built. */
  async function runZpl(startAt: number) {
    const profile = selectedProfile;
    if (!profile || !labels) return;
    const direct = profile.transport === "zebra-direct";

    if (startAt === 0) {
      setZplRun({ phase: "preparing" });
      let artwork: string | null = null;
      if (withBackground) {
        try {
          const image = await renderStickerArtwork(
            mmToDots(DESIGN_SIZE_MM.w, profile.dpi) * ARTWORK_SUPERSAMPLE
          );
          artwork = artworkCommandFor(image, profile);
        } catch (error) {
          console.error(error);
          toast.error(tag["StickerHeader.PrintLabels.BackgroundUnavailable"]);
          setZplRun({ phase: "idle" });
          return;
        }
      }
      const built = buildJobs(labels, profile, layoutKind, artwork);
      jobsRef.current = built.jobs;
      skippedRef.current = built.skipped.length;
    }

    const jobs = jobsRef.current;
    const skipped = skippedRef.current;
    if (jobs.length === 0) {
      setZplRun({ phase: "done", sent: 0, skipped, direct });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const result = await runPrintJobs(jobs, senderFor(profile, browserFetch), {
      startAt,
      signal: controller.signal,
      onProgress: (progress) => setZplRun({ phase: "printing", progress }),
    });
    // The dialog was closed mid-run: nothing left to report to.
    if (abortRef.current !== controller) return;
    abortRef.current = null;

    if (result.status === "done") {
      const sent = jobs.reduce((sum, job) => sum + job.labelCount, 0);
      setZplRun({ phase: "done", sent, skipped, direct });
    } else if (result.status === "cancelled") {
      setZplRun({
        phase: "cancelled",
        nextJob: result.nextJob,
        skipped,
        notSent: unsentRange(jobs, result.nextJob),
      });
    } else {
      setZplRun({
        phase: "failed",
        failedJob: result.failedJob,
        message: errorMessage(result.error),
        skipped,
        notSent: unsentRange(jobs, result.failedJob),
      });
    }
  }

  function handlePrint() {
    if (selectedProfile) void runZpl(0);
    else print();
  }

  const notSentText = (range: UnsentRange) =>
    range
      ? tag["StickerHeader.PrintLabels.NotSent"]
          .replace("{0}", String(range.first))
          .replace("{1}", String(range.last))
      : "";

  const previewLabels = selectedProfile
    ? (labels ?? []).slice(0, ZPL_PREVIEW_COUNT)
    : (labels ?? []);
  const backgroundUrl = withBackground ? background : null;

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild data-testid="print-sticker-lines-trigger">
        <SidebarMenuButton name="sticker-details-layout" variant="outline">
          <LucidePrinter />
          <span>{tag["StickerHeader.PrintLabels"]}</span>
        </SidebarMenuButton>
      </DialogTrigger>
      <DialogContent className="sm:max-w-max">
        <DialogHeader>
          <DialogTitle>{tag["StickerHeader.PrintLabels"]}</DialogTitle>
          <DialogDescription>
            {tag["StickerHeader.PrintLabelsDescription"]}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <PrinterPicker
              disabled={zplBusy}
              onChange={(value) => {
                setPrinterId(value);
                setZplRun({ phase: "idle" });
                if (value !== BROWSER_PRINT) setOptimizeForA4(false);
              }}
              profiles={profiles}
              value={printerId}
            />
            <ManagePrintersSheet
              helperAvailable={helper !== null && helper.state !== "missing"}
              onAlignmentTest={handleAlignmentTest}
              onProfilesChange={handleProfilesChange}
              profiles={profiles}
            />
          </div>
          <span className="text-muted-foreground text-sm">
            {tag["StickerHeader.PrintLabelsCount"].replace(
              "{0}",
              String(labels?.length ?? 0)
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={unusedOnly}
              data-testid="print-sticker-lines-unused-only"
              disabled={isPending || zplBusy}
              id="print-sticker-lines-unused-only"
              onCheckedChange={handleUnusedOnlyChange}
            />
            <Label
              data-testid="print-sticker-lines-unused-only-label"
              htmlFor="print-sticker-lines-unused-only"
            >
              {tag["StickerHeader.PrintLabelsUnusedOnly"]}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={withBackground}
              data-testid="print-sticker-lines-background"
              disabled={isBackgroundPending || zplBusy}
              id="print-sticker-lines-background"
              onCheckedChange={handleBackgroundChange}
            />
            <Label
              data-testid="print-sticker-lines-background-label"
              htmlFor="print-sticker-lines-background"
            >
              {tag["StickerHeader.PrintLabelsBackground"]}
            </Label>
          </div>
          {selectedProfile ? null : (
            <>
              <div className="flex items-center gap-2">
                <Switch
                  checked={optimizeForA4}
                  data-testid="print-sticker-lines-a4"
                  id="print-sticker-lines-a4"
                  onCheckedChange={setOptimizeForA4}
                />
                <Label
                  data-testid="print-sticker-lines-a4-label"
                  htmlFor="print-sticker-lines-a4"
                >
                  {tag["StickerHeader.PrintLabelsA4"]}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Label
                  data-testid="print-sticker-lines-browser-dpi-label"
                  htmlFor="print-sticker-lines-browser-dpi"
                >
                  {tag["StickerHeader.PrintLabels.BrowserResolution"]}
                </Label>
                <Select
                  onValueChange={(v) => setBrowserDpi(Number(v) as BrowserDpi)}
                  value={String(browserDpi)}
                >
                  <SelectTrigger
                    className="w-24"
                    data-testid="print-sticker-lines-browser-dpi"
                    id="print-sticker-lines-browser-dpi"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BROWSER_DPIS.map((dpi) => (
                      <SelectItem key={dpi} value={String(dpi)}>
                        {dpi}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        {missingQrCount > 0 && (
          <p className="text-destructive text-sm">
            {tag["StickerHeader.PrintLabels.QrUnavailable"].replace(
              "{0}",
              String(missingQrCount)
            )}
          </p>
        )}

        {helperMissing ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
            <span>{tag["StickerHeader.PrintLabels.HelperMissing"]}</span>
            {HELPER_DOWNLOAD_URL ? (
              <a
                className="underline"
                href={HELPER_DOWNLOAD_URL}
                rel="noreferrer"
                target="_blank"
              >
                {tag["StickerHeader.PrintLabels.HelperInstall"]}
              </a>
            ) : (
              <span className="text-muted-foreground">
                {tag["StickerHeader.PrintLabels.HelperAskContact"]}
              </span>
            )}
            <Button
              data-testid="print-sticker-lines-use-browser-print"
              onClick={() => setPrinterId(BROWSER_PRINT)}
              size="sm"
              variant="outline"
            >
              {tag["StickerHeader.PrintLabels.UseBrowserPrint"]}
            </Button>
          </div>
        ) : null}
        {selectedProfile?.transport === "helper" &&
        helper?.state === "outdated" ? (
          <p className="text-muted-foreground text-sm">
            {tag["StickerHeader.PrintLabels.HelperOutdated"]}{" "}
            {HELPER_DOWNLOAD_URL ? (
              <a
                className="underline"
                href={HELPER_DOWNLOAD_URL}
                rel="noreferrer"
                target="_blank"
              >
                {tag["StickerHeader.PrintLabels.HelperInstall"]}
              </a>
            ) : null}
          </p>
        ) : null}
        {doesNotFit ? (
          <p className="text-destructive text-sm">
            {tag["StickerHeader.PrintLabels.DoesNotFit"]}
          </p>
        ) : null}
        {selectedProfile?.transport === "zebra-direct" ? (
          <p className="text-muted-foreground text-sm">
            {tag["StickerHeader.PrintLabels.DirectNote"]}
          </p>
        ) : null}

        {zplRun.phase === "printing" ? (
          <div className="flex flex-col gap-2">
            <Progress
              value={
                (zplRun.progress.labelsDone /
                  Math.max(1, zplRun.progress.labelsTotal)) *
                100
              }
            />
            <div className="flex items-center justify-between text-sm">
              <span>
                {tag["StickerHeader.PrintLabels.Progress"]
                  .replace("{0}", String(zplRun.progress.jobsDone))
                  .replace("{1}", String(zplRun.progress.jobsTotal))
                  .replace("{2}", String(zplRun.progress.labelsDone))
                  .replace("{3}", String(zplRun.progress.labelsTotal))}
              </span>
              <Button
                data-testid="print-sticker-lines-stop"
                onClick={() => abortRef.current?.abort()}
                size="sm"
                variant="outline"
              >
                {tag["StickerHeader.PrintLabels.Stop"]}
              </Button>
            </div>
          </div>
        ) : null}
        {zplRun.phase === "preparing" ? (
          <div className="flex items-center gap-2 text-sm">
            <Spinner className="size-4" />
            {tag["StickerHeader.PrintLabels.Preparing"]}
          </div>
        ) : null}
        {zplRun.phase === "done" ? (
          <div className="flex flex-col gap-1 text-sm">
            <p>
              {tag["StickerHeader.PrintLabels.Sent"].replace(
                "{0}",
                String(zplRun.sent)
              )}
            </p>
            <p className="text-muted-foreground">
              {tag["StickerHeader.PrintLabels.CheckPrinter"]}
            </p>
          </div>
        ) : null}
        {zplRun.phase === "failed" || zplRun.phase === "cancelled" ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-destructive">
              {zplRun.phase === "failed"
                ? zplRun.message
                : tag["StickerHeader.PrintLabels.Stopped"]}{" "}
              {notSentText(zplRun.notSent)}
            </span>
            <Button
              data-testid="print-sticker-lines-retry"
              onClick={() =>
                void runZpl(
                  zplRun.phase === "failed" ? zplRun.failedJob : zplRun.nextJob
                )
              }
              size="sm"
            >
              {tag["StickerHeader.PrintLabels.RetryFromHere"]}
            </Button>
          </div>
        ) : null}
        {zplRun.phase !== "idle" &&
        zplRun.phase !== "preparing" &&
        zplRun.phase !== "printing" &&
        zplRun.skipped > 0 ? (
          <p className="text-destructive text-sm">
            {tag["StickerHeader.PrintLabels.Skipped"].replace(
              "{0}",
              String(zplRun.skipped)
            )}
          </p>
        ) : null}

        <ScrollArea className="bg-muted/30 h-[50vh] rounded-md border">
          {isPending || !labels ? (
            <div className="flex h-[50vh] items-center justify-center">
              <Spinner className="size-6" />
            </div>
          ) : labels.length === 0 ? (
            <div className="text-muted-foreground flex h-[50vh] items-center justify-center px-6 text-center text-sm">
              {tag["StickerHeader.PrintLabelsEmpty"]}
            </div>
          ) : (
            <div
              className="flex w-fit flex-col items-center gap-4 p-4 print:w-auto print:gap-0 print:p-0"
              ref={contentRef}
            >
              {selectedProfile ? (
                <p className="text-muted-foreground text-sm">
                  {tag["StickerHeader.PrintLabels.Sample"].replace(
                    "{0}",
                    String(previewLabels.length)
                  )}
                </p>
              ) : null}
              {optimizeForA4 && !selectedProfile
                ? labelChunks.map((sheetLabels, index) => (
                    <StickerA4Sheet
                      backgroundUrl={backgroundUrl}
                      dpi={previewDpi}
                      key={sheetLabels[0]?.stickerLineNumber ?? index}
                      labels={sheetLabels}
                      layoutKind={layoutKind}
                      pageBreakBefore={index > 0}
                    />
                  ))
                : previewLabels.map((label, index) => (
                    <StickerLabelPage
                      backgroundUrl={backgroundUrl}
                      dpi={previewDpi}
                      key={label.stickerLineNumber}
                      label={label}
                      layoutKind={layoutKind}
                      pageBreakBefore={index > 0}
                    />
                  ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button
            data-testid="print-sticker-lines-cancel"
            onClick={() => handleOpenChange(false)}
            variant="outline"
          >
            {t.Default["Cancel"]}
          </Button>
          <Button
            data-testid="print-sticker-lines-print"
            disabled={
              isPending ||
              isBackgroundPending ||
              !labels?.length ||
              zplBusy ||
              helperMissing ||
              doesNotFit
            }
            onClick={handlePrint}
          >
            <LucidePrinter />
            {tag["StickerHeader.PrintLabels"]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check, lint, unit tests**

```bash
cd /c/unirefund/web-app-wt-sticker-zpl
pnpm --filter web type-check 2>&1 | grep 'error TS' | grep -v 'capture-core'
pnpm --filter web lint 2>&1 | grep -E 'stickers/\[stickerId\]|✖'
pnpm --filter web test:unit 2>&1 | grep -E '^# (tests|pass|fail)'
```

Expected:
- no type errors beyond the baseline;
- no lint errors in the sticker files;
- tests at baseline + 81, with `# fail 0`.

- [ ] **Step 3: Commit**

```bash
cd /c/unirefund/web-app-wt-sticker-zpl
git add ':(literal)apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/print-sticker-lines.tsx'
git commit -F - <<'EOF'
feat(stickers): print sticker books as ZPL to a label printer

The print dialog can send a book through the Print Helper or straight to a
networked Zebra, with progress, stop and continue-from-failure. Browser
print stays as the fallback and now draws the QR at whole printer dots with
crisp edges.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 10: Gates and verification in the browser

**Files:** none, unless a check fails.

- [ ] **Step 1: Full gates**

```bash
cd /c/unirefund/web-app-wt-sticker-zpl
pnpm --filter web test:unit 2>&1 | grep -E '^# (tests|pass|fail)'
pnpm --filter web type-check 2>&1 | grep -c 'error TS'
pnpm --filter web lint 2>&1 | tail -3
pnpm i18n:missing --app=web 2>&1 | tail -5
pnpm i18n:unused --app=web 2>&1 | tail -5
pnpm policy:audit 2>&1 | tail -5
```

Expected:
- tests at baseline + 81, with 0 failing;
- type errors still 2;
- lint 0 errors;
- `i18n:missing` NEEDS_KEY 0;
- `i18n:unused` still only `ManualVerification.*`;
- `policy:audit` clean. No new actions were added, so it has nothing new to check.

- [ ] **Step 2: Ask the user for what a browser check needs**

`apps/web` can't be logged into unattended. Ask the user for:
- an account that holds `TagService.StickerHeaders` and `.GetLinesByHeaderId`. The workspace `AGENTS.md` lists test users; `admin / 1q2w3E*` on the Faroe Islands tenant has broad grants;
- a sticker book id on dev that has a few unused lines;
- whether the Print Helper is installed. If it isn't yet, the browser-print checks still apply.

**For a local dev server:** the helper only accepts `http://localhost:3000` if `%LOCALAPPDATA%\Unirefund\PrintHelper\settings.json` contains `{ "extraAllowedOrigins": ["http://localhost:3000"] }` and the helper is restarted afterwards.

- [ ] **Step 3: Start the dev server detached and walk through**

- **Check port 3000 is free:** `Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue`. If it isn't, ask the user rather than taking it over.
- **Start the server detached** (a background `next dev` dies at the tool time limit): `Start-Process -WindowStyle Hidden pnpm -ArgumentList '--filter','web','dev' -WorkingDirectory C:\unirefund\web-app-wt-sticker-zpl`.

Then, logged in as the user's account, open `http://localhost:3000/en/operations/stickers/<book id>` → **Print sticker labels**:

1. **Browser print (default):**
   - the preview shows QRs; a QR's `<svg>` has `shape-rendering="crispEdges"`;
   - switching the resolution to 300 re-sizes it slightly;
   - "Add background" moves the QR beside the intro text;
   - "Optimize for A4" works as before;
   - the Print button opens the browser dialog.
2. **Manage printers:**
   - add the "Argox O4-250" preset with host `192.168.1.19` (re-sweep port 9100 if the IP changed) and save;
   - reload the page: the printer is still there;
   - type `6,5` in Offset X: it saves as 6.5;
   - set rotation 0 on the Argox profile: the "does not fit" warning shows and Print is disabled.
3. **Helper not running:**
   - with the helper quit, picking the Argox shows "Print Helper isn't running…" and "Ask your Unirefund contact…";
   - "Use browser print" switches back.
4. **Helper running** (with the user's OK, using Argox labels):
   - "Print alignment test" prints the ruler label;
   - with "Only unused lines" plus "Add background", Print shows progress and "N label(s) sent";
   - the user confirms the stickers match the approved 2026-10-14 label, and that the QRs scan to the right `/tag/…` URLs.
5. **Stop and continue:** stop the helper mid-run on a book of more than 500 labels, or simulate by quitting it. The dialog names the unsent range; "Continue from here" resumes once the helper is back.

Record what was and wasn't checked. Direct to Zebra **cannot** be checked without a networked Zebra, so it stays labelled beta. Stop the dev server afterwards.

- [ ] **Step 4: Hand over**

Report to the user:
- the gate numbers;
- the walkthrough results, including what is unverified: direct to Zebra, USB through the helper, 300 dpi;
- the branch name.

**Ask before pushing** `feat/sticker-zpl-printing` or opening a PR. Don't do either unasked.
