# ssr visual parity, sub-project 1 (tokens and shell): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- ssr and super-app both take `apps/web`'s design tokens and the Geist font.
- ssr gets super-app's island navigation, page header, Profile hub and FAQ.
- ssr adopts the app's route names, and the QR entry routes keep working.

**Architecture:**
- The light tokens move into one shared CSS file in `packages/ui`, which `apps/web` and ssr both import. super-app mirrors the same values in its NativeWind tokens.
- The ssr shell is a small set of client components under `apps/ssr/src/components/shell/`. Pure, node-tested modules sit underneath them: island geometry ported from super-app, slot and route rules, and scan routing through `@unirefund/qr`.
- The shell is mounted by the `(main)` and `(public)` layouts in place of the navbar and footer.

**Tech stack:**
- ssr: Next.js 16 (App Router, webpack dev), Tailwind v4, `node:test` via `tsx`.
- super-app: Expo 54 / RN 0.81, NativeWind 4, jest, `expo-font` with `@expo-google-fonts/geist` and `@expo-google-fonts/geist-mono`.

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-10-01-ssr-visual-parity-shell-design.md`

**Plan decision, base branches.** The spec says super-app works on `feat/unirefund-tokens` from `main`. Since then the user created `feat/ssr-visual-parity` in **both** repos; in super-app it sits at the current `main` (`92c77eb`). So both repos branch from the user's `feat/ssr-visual-parity`, and both PRs target it:
- web-app: `feat/ssr-visual-parity-shell`;
- super-app: `feat/ssr-visual-parity-tokens`.

## Global Constraints

- **QR contract.** `/tag/<slug>` (with or without a locale, opened signed out from a phone camera) and `/{lang}/validate?qrValue=…` keep working unchanged. Slugs and validate values are decoded only through `@unirefund/qr`.
- **No changes** to the `ayasofyazilim-ui` submodule, to `apps/web`'s computed look, or to any QR format.
- **Shared light tokens** are the exact oklch values in the spec's Section 1 table.
- **Status tokens** in both apps are success `#16a34a`/`#f0fdf4`/`#15803d`, warning `#d97706`/`#fffbeb`/`#b45309`, info `#2563eb`/`#eff6ff`/`#1d4ed8`, error `#dc2626`/`#fef2f2`, and recent `#7c3aed`/`#f5f3ff`.
- **Fonts.**
  - Geist is the sans face. In ssr it is loaded with `next/font/local` from a copy of `apps/web/public/GeistVariable.woff2`.
  - Geist Mono is `font-serial`. In ssr it is loaded with `next/font/google` (`Geist_Mono`).
  - In super-app, both come from static `@expo-google-fonts` weights 400–800.
- **Grants.** Every control that calls an endpoint renders only with that endpoint's group plus leaf grant.
- **Kept but not rendered.** `DefaultNavbar`, `Footer` and `ChatbotWidget` stay in the codebase. The navbar and footer are no longer rendered. The chat widget is still mounted, with its bubble hidden (as it already is).
- **No redirects.** Old ssr URLs (`/account*`) are dropped.
- **ssr strings.** New `SSRService` strings go in both `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json` and `tr.json`, with no duplicate keys. Run `pnpm --filter ssr run init` afterwards, and never commit `src/language-data/i18n/*.gen.json`.
- **ssr test ids.** Every `Link`, `Button`, `Input`, `Label`, `Checkbox`, `Switch` and `*Trigger` carries a `data-testid` (lint rule `react-require-testid/testid-missing`).
- **ssr tests.** `test:unit` runs `node --import tsx --test "src/**/*.test.ts"`: Node's runner, `.ts` only, no JSX.
- **Never `next build` while a dev server runs on the same checkout.** Implementers never push and never run native builds.
- **super-app is a SHARED checkout.**
  - Never `git reset --hard`, `git stash`, `git checkout -- <file>`, `git add -A` or `git add .`.
  - Stage files by name.
  - Check `git branch --show-current` and `git status --short` before committing.
- **super-app tests.** Render tests are `*.router.test.*`; the typecheck baseline is exactly 1 `error TS`. In a `jest.mock` factory, never bind `require("react")` as `react` and call `createElement`; name it `ReactLib`.
- **Comments** are rare and short: one line, only where the reason is not obvious.

## Review Focus

1. **A receipt QR opened by a phone camera.** Signed out, `https://<ssr-host>/tag/<slug>` and `/en/tag/<slug>` both open the public tag page with the island shown and no login redirect. Pinned by: Task 2's `isIslandHidden` and `routeScan` cases, and Task 9's manual camera-style open.
2. **A 320 px phone.** The island fits without horizontal scroll. Server and client render the same island path for every viewport of 304 px or wider. Pinned by: a Task 2 `blobBarChain` width case.
3. **A signed-out tap on Tags or Profile.** It lands on login with an encoded `redirectTo` back to the target. Pinned by: Task 2 `slotHref` cases.
4. **The `/validate` flow.** The island is hidden there, so it never covers the flow's sticky bottom claim button. Pinned by: Task 2 `isIslandHidden` cases.
5. **Content under the island.** The last tag row, the pagination, the Log out row, Explore's status pill and the legal pages' last lines all stay reachable above it. Pinned by: Task 3's bottom spacing, the Explore pill lift and the map `isolate`, plus Task 9's manual pass at 375 px.

---

## File structure

**web-app** (worktree `C:\unirefund\web-app-wt-visual-parity`):

| Path | Change |
| --- | --- |
| `packages/ui/src/styles/unirefund-tokens.css` | new: the shared light tokens |
| `packages/ui/package.json` | add `"./styles/*": "./src/styles/*"` to `exports` |
| `packages/ui/src/notification/index.tsx`, `popover.tsx` | optional `renderBell` pass-through |
| `apps/web/src/app/[lang]/layout.tsx` | import the shared tokens |
| `apps/web/src/components/styles/custom.css` | drop the moved lines |
| `apps/ssr/public/GeistVariable.woff2` | copy of `apps/web`'s |
| `apps/ssr/src/components/styles/app.css` | new: ssr's single Tailwind entry |
| `apps/ssr/src/components/styles/tokens.test.ts` | new |
| `apps/ssr/src/app/[lang]/layout.tsx` | fonts, `app.css`, drop the inline primary |
| `apps/ssr/scripts/gen-ionicons.mjs` | new, generates `ionicons.tsx` |
| `apps/ssr/src/components/shell/blob-chain.ts` + `.test.ts` | port from super-app |
| `apps/ssr/src/components/shell/island-routes.ts` + `.test.ts` | new |
| `apps/ssr/src/components/shell/scan-routing.ts` + `.test.ts` | new |
| `apps/ssr/src/components/shell/profile-rows.ts` + `.test.ts` | new |
| `apps/ssr/src/components/shell/faq-toggle.ts` + `.test.ts` | new |
| `apps/ssr/src/components/shell/ionicons.tsx` | generated |
| `apps/ssr/src/components/shell/surface.tsx` | new |
| `apps/ssr/src/components/shell/tab-page.tsx` | new |
| `apps/ssr/src/components/shell/shell-context.tsx` | new |
| `apps/ssr/src/components/shell/tab-island.tsx` | new |
| `apps/ssr/src/components/shell/scan-overlay.tsx` | new |
| `apps/ssr/src/components/shell/page-header.tsx` | new |
| `apps/ssr/src/components/shell/header-bell.tsx` | new |
| `apps/ssr/src/app/[lang]/(main)/layout.tsx`, `(public)/layout.tsx` | mount the shell |
| `apps/ssr/src/components/global/navbar/traveller-document-switcher.tsx` | `variant="pill"` |
| `apps/ssr/src/components/global/navbar/language-selector.tsx` | `variant="row"` |
| `apps/ssr/src/app/[lang]/(public)/client.tsx` | signed-in header |
| `tags/_components/tags-view.tsx`, `tags/[tagNumber]/_components/tag-details.tsx`, `tag/[slug]/_components/public-tag-details.tsx` | PageHeader |
| `apps/ssr/src/app/[lang]/(main)/profile/**` | hub, plus pages moved from `account/**` |
| `apps/ssr/src/app/[lang]/(public)/faq/**` | new |
| `apps/ssr/src/proxy.ts` | `faq` always public |
| `apps/ssr/src/app/[lang]/(public)/explore/page.tsx` | lift the pill, `isolate` the map |
| `apps/ssr/src/components/legal/*` | bottom spacing |

**super-app** (shared checkout `C:\unirefund\super-app`):

| Path | Change |
| --- | --- |
| `src/global.css`, `src/utils/theme.ts`, `tailwind.config.js` | tokens and radius |
| `package.json`, lockfile | `@expo-google-fonts/geist`, `@expo-google-fonts/geist-mono` |
| `src/utils/fontFamily.ts` + `src/utils/__tests__/fontFamily.test.ts` | new |
| `src/hooks/useAppFonts.ts` | new |
| `src/app/_layout.tsx`, `src/features/SplashScreenController.tsx` | wait for fonts |
| `src/components/rnr/text.tsx`, `input.tsx`, `textarea.tsx`, `src/components/PageHeader.tsx` | Geist families |
| `RefundConfirmSheet.tsx`, `SearchTraveller.tsx`, `FlightInfoStep.tsx` | Geist families |

## Strings

**ssr.** Every task adds its own keys to `SSRService` `en.json` and `tr.json`. Wording is copied from super-app where it has the same string.

| Key | en | tr | Task |
| --- | --- | --- | --- |
| `Island.Label` | Main navigation | Ana gezinme | 3 |
| `Island.Home` | Home | Ana Sayfa | 3 |
| `Island.Tags` | Tags | Etiketler | 3 |
| `Island.Scan` | Scan QR | QR Tara | 3 |
| `Island.Faq` | FAQ | SSS | 3 |
| `Island.Profile` | Profile | Profil | 3 |
| `Scan.Title` | Scan QR code | QR kodu tara | 3 |
| `Scan.Prompt` | Point your camera at a tax-free tag, store sticker, or airport QR code | Kameranızı bir vergi iadesi etiketine, mağaza etiketine veya havalimanı QR koduna doğrultun | 3 |
| `Scan.Unrecognised` | Unrecognized code. Please scan a valid Unirefund QR. | Tanınmayan kod. Lütfen geçerli bir Unirefund QR kodu tarayın. | 3 |
| `Scan.Close` | Close | Kapat | 3 |
| `Header.Back` | Back | Geri | 4 |
| `Home.Greeting` | Hello, {0} | Merhaba, {0} | 4 |
| `Home.Guest` | Guest | Misafir | 4 |
| `Profile.Title` | Profile | Profil | 5 |
| `Profile.Group.Account` | Account | Hesap | 5 |
| `Profile.Group.Wallet` | Wallet | Cüzdan | 5 |
| `Profile.Group.App` | App | Uygulama | 5 |
| `Profile.Group.Legal` | Legal | Yasal | 5 |
| `Profile.Row.Personal` | Personal Information | Kişisel Bilgilerim | 5 |
| `Profile.Row.Cards` | My Cards | Kartlarım | 5 |
| `Profile.Row.Language` | App Language | Uygulama Dili | 5 |
| `Profile.Row.ChangePassword` | Change Password | Şifre Değiştir | 5 |
| `Profile.Row.Privacy` | Privacy Policy | Gizlilik Politikası | 5 |
| `Profile.Row.AccountDeletion` | Account Deletion | Hesap Silme | 5 |
| `Profile.Row.Logout` | Log Out | Çıkış Yap | 5 |
| `Faq.Title` | FAQ | Sık Sorulan Sorular | 6 |
| `Faq.Chat` | Chat with support | Destekle sohbet et | 6 |
| `Faq.*` (14 keys) | — | — | 6, values in the task |

---

### Task 0: Setup (controller)

- [ ] **Step 1: Create the web-app worktree.**

```bash
cd /c/unirefund/web-app
git fetch origin
git worktree add -b feat/ssr-visual-parity-shell /c/unirefund/web-app-wt-visual-parity origin/feat/ssr-visual-parity
cd /c/unirefund/web-app-wt-visual-parity
git submodule update --init packages/utils packages/ayasofyazilim-ui
cp /c/unirefund/web-app/apps/ssr/.env apps/ssr/.env
pnpm install
pnpm --filter ssr run init
```

- [ ] **Step 2: Push the branch and record baselines.**
  - Push the branch: `git push -u origin feat/ssr-visual-parity-shell`.
  - Record these baselines in the ledger:
    - `pnpm --filter ssr test:unit`
    - `pnpm --filter ssr type-check`
    - `pnpm --filter ssr lint`, recording errors and warnings
    - `pnpm --filter web type-check`
- [ ] **Step 3: Create the super-app branch.** In `C:\unirefund\super-app`:
  - Check that `git status --short` is empty and `git branch --show-current` is `feat/ssr-visual-parity`.
  - Run `git checkout -b feat/ssr-visual-parity-tokens`.
  - Record baselines for `npx jest` (suites and tests) and `npm run typecheck` (`grep -c "error TS"` should be 1).

---

### Task 1: Shared tokens and fonts (web-app)

**Files:**
- Create:
  - `packages/ui/src/styles/unirefund-tokens.css`
  - `apps/ssr/src/components/styles/app.css`
  - `apps/ssr/src/components/styles/tokens.test.ts`
  - `apps/ssr/src/components/shell/surface.tsx`
  - `apps/ssr/public/GeistVariable.woff2`
- Modify:
  - `packages/ui/package.json`
  - `apps/web/src/app/[lang]/layout.tsx`
  - `apps/web/src/components/styles/custom.css`
  - `apps/ssr/src/app/[lang]/layout.tsx`

**Interfaces:**
- Produces:
  - Tailwind classes in ssr, in the `base`, `-surface` and `-strong` forms that exist for each: `bg-success`, `text-success-strong`, `bg-warning-surface`, `text-info-strong`, `bg-error`, `bg-recent`.
  - The `font-serial` utility.
  - `Surface(props: React.ComponentProps<"div">)`.

- [ ] **Step 1: Write the failing token test** `apps/ssr/src/components/styles/tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const root = resolve(process.cwd(), "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const TOKENS: Record<string, string> = {
  "--radius": "0.65rem",
  "--background": "oklch(1 0 0)",
  "--foreground": "oklch(0.141 0.005 285.823)",
  "--card": "oklch(1 0 0)",
  "--card-foreground": "oklch(0.141 0.005 285.823)",
  "--popover": "oklch(1 0 0)",
  "--popover-foreground": "oklch(0.141 0.005 285.823)",
  "--primary": "oklch(0.577 0.245 27.325)",
  "--primary-foreground": "oklch(0.971 0.013 17.38)",
  "--secondary": "oklch(0.967 0.001 286.375)",
  "--secondary-foreground": "oklch(0.21 0.006 285.885)",
  "--muted": "oklch(0.967 0.001 286.375)",
  "--muted-foreground": "oklch(0.552 0.016 285.938)",
  "--accent": "oklch(0.967 0.001 286.375)",
  "--accent-foreground": "oklch(0.21 0.006 285.885)",
  "--destructive": "oklch(0.577 0.245 27.325)",
  "--border": "oklch(0.92 0.004 286.32)",
  "--input": "oklch(0.92 0.004 286.32)",
  "--ring": "oklch(0.704 0.191 22.216)",
};

const STATUS: Record<string, string> = {
  "--color-success": "#16a34a",
  "--color-success-surface": "#f0fdf4",
  "--color-success-strong": "#15803d",
  "--color-warning": "#d97706",
  "--color-warning-surface": "#fffbeb",
  "--color-warning-strong": "#b45309",
  "--color-info": "#2563eb",
  "--color-info-surface": "#eff6ff",
  "--color-info-strong": "#1d4ed8",
  "--color-error": "#dc2626",
  "--color-error-surface": "#fef2f2",
  "--color-recent": "#7c3aed",
  "--color-recent-surface": "#f5f3ff",
};

function declarations(css: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    map.set(m[1]!, m[2]!.trim());
  }
  return map;
}

describe("shared Unirefund tokens", () => {
  it("defines every light token with apps/web's value", () => {
    const shared = declarations(read("packages/ui/src/styles/unirefund-tokens.css"));
    for (const [name, value] of Object.entries(TOKENS)) {
      assert.equal(shared.get(name), value, name);
    }
  });

  it("leaves none of them in apps/web's own :root", () => {
    const custom = read("apps/web/src/components/styles/custom.css");
    const lightRoot = custom.slice(custom.indexOf(":root"), custom.indexOf(".dark"));
    const own = declarations(lightRoot);
    for (const name of Object.keys(TOKENS)) assert.equal(own.has(name), false, name);
  });

  it("gives ssr the app's status colours", () => {
    const app = declarations(read("apps/ssr/src/components/styles/app.css"));
    for (const [name, value] of Object.entries(STATUS)) {
      assert.equal(app.get(name), value, name);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails.** Run `pnpm --filter ssr test:unit`. Expected: an ENOENT for `unirefund-tokens.css`.

- [ ] **Step 3: Create the shared file** `packages/ui/src/styles/unirefund-tokens.css`:

```css
/* Unirefund light tokens, shared by apps/web and apps/ssr. super-app mirrors them in src/global.css. */
:root {
  --radius: 0.65rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.141 0.005 285.823);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.141 0.005 285.823);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.141 0.005 285.823);
  --primary: oklch(0.577 0.245 27.325);
  --primary-foreground: oklch(0.971 0.013 17.38);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.967 0.001 286.375);
  --muted-foreground: oklch(0.552 0.016 285.938);
  --accent: oklch(0.967 0.001 286.375);
  --accent-foreground: oklch(0.21 0.006 285.885);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.92 0.004 286.32);
  --input: oklch(0.92 0.004 286.32);
  --ring: oklch(0.704 0.191 22.216);
}
```

  In `packages/ui/package.json` → `exports`, add `"./styles/*": "./src/styles/*",`.

- [ ] **Step 4: Switch apps/web to the shared file.**
  - In `apps/web/src/components/styles/custom.css`, delete the 19 lines in `:root` from `--radius` through `--ring`. Keep `--logo-secondary`, every `--chart-*`, every `--sidebar*`, and the whole `.dark` block.
  - In `apps/web/src/app/[lang]/layout.tsx`, import the shared file between the two existing imports:

```ts
import "@repo/ayasofyazilim-ui/globals.css";
import "@repo/ui/styles/unirefund-tokens.css";
import "@/components/styles/custom.css";
```

- [ ] **Step 5: Give ssr one Tailwind entry.**
  - Copy the font: `cp apps/web/public/GeistVariable.woff2 apps/ssr/public/GeistVariable.woff2`.
  - Create `apps/ssr/src/components/styles/app.css`:

```css
@import "./custom.css";
@import "@repo/ayasofyazilim-ui/globals.css";
@import "@repo/ui/styles/unirefund-tokens.css";

@theme inline {
  --color-success: #16a34a;
  --color-success-surface: #f0fdf4;
  --color-success-strong: #15803d;
  --color-warning: #d97706;
  --color-warning-surface: #fffbeb;
  --color-warning-strong: #b45309;
  --color-info: #2563eb;
  --color-info-surface: #eff6ff;
  --color-info-strong: #1d4ed8;
  --color-error: #dc2626;
  --color-error-surface: #fef2f2;
  --color-recent: #7c3aed;
  --color-recent-surface: #f5f3ff;
  --font-serial: var(--font-geist-mono);
}
```

  `custom.css` stays first, as today: it was imported before `globals.css` in the layout, and that order is kept.
  - If the bundler cannot resolve `@repo/ui/styles/unirefund-tokens.css` from CSS, use the relative path `../../../../../packages/ui/src/styles/unirefund-tokens.css` instead. Note which one worked in the report.

- [ ] **Step 6: Update the ssr root layout** `apps/ssr/src/app/[lang]/layout.tsx`.
  - Replace the first five lines (both CSS imports, the Figtree import and its constant) with:

```ts
"use server";
import "@/components/styles/app.css";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";

const fontSans = localFont({
  variable: "--font-sans",
  src: "../../../public/GeistVariable.woff2",
});
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
```

  - Replace the `<html …>` opening tag's `className` and `style` with `className={cn(fontSans.variable, fontMono.variable, "h-full")}`, and delete the `style` prop.
  - Remove `CSSProperties` from the `react` import.

- [ ] **Step 7: Add the Surface primitive** `apps/ssr/src/components/shell/surface.tsx`:

```tsx
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";

export function Surface({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("rounded-md border border-border bg-card", className)} {...props} />
  );
}
```

- [ ] **Step 8: Run the gates.**

```bash
pnpm --filter ssr test:unit 2>&1 | grep -E "^# (tests|pass|fail)"
pnpm --filter ssr type-check
pnpm --filter ssr lint 2>&1 | tail -2
pnpm --filter web type-check
pnpm --filter ssr build 2>&1 | tail -5     # no dev server runs in this worktree
pnpm --filter web build 2>&1 | tail -5
```

  Expected: every test passes, both type-checks are clean, lint has 0 errors, and both builds compile.
  - Open the ssr build's CSS (`apps/ssr/.next/static/css/*.css`) and grep it for `--color-success` and `#16a34a`. Both must be present.
  - Open the `web` build's CSS and confirm that `--primary:oklch(.577 .245 27.325)` is still declared.

- [ ] **Step 9: Commit.** Stage only the files above, then:

```bash
git commit -q -F - <<'EOF'
feat(ui,ssr): share apps/web's tokens and Geist with ssr

The light tokens move from apps/web's custom.css into packages/ui, which
apps/web and ssr both import, so apps/web looks the same and ssr drops
Figtree and its own red. ssr also gets the app's status colours and a
Geist Mono serial face, and a bordered Surface like the app's cards.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 2: Pure shell logic (web-app)

**Files:** create the following in `apps/ssr/src/components/shell/`:
- `blob-chain.ts` and `blob-chain.test.ts`
- `island-routes.ts` and `island-routes.test.ts`
- `scan-routing.ts` and `scan-routing.test.ts`

**Interfaces:**
- Produces:
  - `blobChain`, `blobBarChain`, `groupsAround`, `BAR_RADIUS`, `BAR_H_PADDING` and `BAR_BOTTOM_GAP`, with the same names and signatures as super-app's `src/components/blobChain.ts`.
  - `type IslandSlot = "home" | "tags" | "scan" | "faq" | "profile"`.
  - `ISLAND_SLOTS: readonly IslandSlot[]`, in bar order.
  - `activeSlot(pathname: string, lang: string): IslandSlot | null`.
  - `slotHref(slot: Exclude<IslandSlot, "scan">, lang: string, signedIn: boolean): string`.
  - `isIslandHidden(pathname: string, lang: string): boolean`.
  - `type ScanRoute = { kind: "validate" | "tag"; href: string } | { kind: "unknown" }`.
  - `routeScan(raw: string, lang: string): ScanRoute`.

- [ ] **Step 1: Port the geometry.**
  - Copy `C:\unirefund\super-app\src\components\blobChain.ts` verbatim to `blob-chain.ts`. It is React-Native-free.
  - Copy `C:\unirefund\super-app\src\components\__tests__\blobChain.test.ts` to `blob-chain.test.ts`, converting it from jest to `node:test`:
    - import `{ describe, it }` from `"node:test"` and `assert` from `"node:assert/strict"`;
    - `expect(a).toBe(b)` becomes `assert.equal(a, b)`;
    - `toEqual` becomes `assert.deepEqual`;
    - `toBeCloseTo(v, d)` becomes `assert.ok(Math.abs(a - v) < 10 ** -d / 2)`;
    - `toThrow()` becomes `assert.throws(() => …)`;
    - `toBeLessThanOrEqual(v)` becomes `assert.ok(a <= v)`;
    - change the import path to `./blob-chain`.
  - Add one case at the end (Review Focus 2):

```ts
it("fits a 320 px phone and is unscaled from 304 px up", () => {
  const groups = groupsAround(5, 2);
  const narrow = blobBarChain({ windowWidth: 320, groups });
  assert.ok(narrow.width <= 320 - BAR_H_PADDING * 2);
  assert.deepEqual(blobBarChain({ windowWidth: 304, groups }), blobBarChain({ windowWidth: 1024, groups }));
});
```

- [ ] **Step 2: Write the failing island-routes test** `island-routes.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { activeSlot, isIslandHidden, ISLAND_SLOTS, slotHref } from "./island-routes";

describe("activeSlot", () => {
  it("maps each tab root and its sub-pages", () => {
    assert.equal(activeSlot("/en", "en"), "home");
    assert.equal(activeSlot("/en/", "en"), "home");
    assert.equal(activeSlot("/en/tags", "en"), "tags");
    assert.equal(activeSlot("/en/tags/FRO2026092700001", "en"), "tags");
    assert.equal(activeSlot("/tr/faq", "tr"), "faq");
    assert.equal(activeSlot("/en/profile", "en"), "profile");
    assert.equal(activeSlot("/en/profile/cards", "en"), "profile");
  });
  it("marks nothing elsewhere, including the public tag page", () => {
    assert.equal(activeSlot("/en/explore", "en"), null);
    assert.equal(activeSlot("/en/tag/e246RlJP", "en"), null);
    assert.equal(activeSlot("/en/tagsx", "en"), null);
  });
  it("orders the bar like the app", () => {
    assert.deepEqual([...ISLAND_SLOTS], ["home", "tags", "scan", "faq", "profile"]);
  });
});

describe("slotHref", () => {
  it("links straight to the tab when signed in", () => {
    assert.equal(slotHref("home", "en", true), "/en");
    assert.equal(slotHref("tags", "en", true), "/en/tags");
    assert.equal(slotHref("profile", "en", true), "/en/profile");
  });
  it("sends a signed-out Tags or Profile tap to login and back", () => {
    assert.equal(slotHref("tags", "en", false), "/en/login?redirectTo=%2Fen%2Ftags");
    assert.equal(slotHref("profile", "tr", false), "/tr/login?redirectTo=%2Ftr%2Fprofile");
  });
  it("keeps Home and FAQ open when signed out", () => {
    assert.equal(slotHref("home", "en", false), "/en");
    assert.equal(slotHref("faq", "en", false), "/en/faq");
  });
});

describe("isIslandHidden", () => {
  it("hides on the validate flow only", () => {
    assert.equal(isIslandHidden("/en/validate", "en"), true);
    assert.equal(isIslandHidden("/en/validated", "en"), false);
    assert.equal(isIslandHidden("/en/tag/e246RlJP", "en"), false);
    assert.equal(isIslandHidden("/en/explore", "en"), false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails.** Expected: the module is not found.

- [ ] **Step 4: Implement** `island-routes.ts`:

```ts
export type IslandSlot = "home" | "tags" | "scan" | "faq" | "profile";

export const ISLAND_SLOTS: readonly IslandSlot[] = ["home", "tags", "scan", "faq", "profile"];

function withinLang(pathname: string, lang: string): string {
  const prefix = `/${lang}`;
  const rest = pathname === prefix ? "/" : pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : pathname;
  return rest.replace(/\/+$/, "") || "/";
}

const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

export function activeSlot(pathname: string, lang: string): IslandSlot | null {
  const path = withinLang(pathname, lang);
  if (path === "/") return "home";
  if (under(path, "/tags")) return "tags";
  if (path === "/faq") return "faq";
  if (under(path, "/profile")) return "profile";
  return null;
}

export function slotHref(slot: Exclude<IslandSlot, "scan">, lang: string, signedIn: boolean): string {
  const target = slot === "home" ? `/${lang}` : `/${lang}/${slot}`;
  if (signedIn || slot === "home" || slot === "faq") return target;
  return `/${lang}/login?redirectTo=${encodeURIComponent(target)}`;
}

export function isIslandHidden(pathname: string, lang: string): boolean {
  return under(withinLang(pathname, lang), "/validate");
}
```

- [ ] **Step 5: Write the failing scan-routing test** `scan-routing.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTagUrl, buildValidateUrl } from "@unirefund/qr";
import { routeScan } from "./scan-routing";

const SSR = "https://ssr-dev.unirefund.com";

describe("routeScan", () => {
  it("opens a tag QR, as pos-app and apps/web print it", () => {
    const url = buildTagUrl(SSR, { tagNumber: "FRO2026092700001", travellerDocumentNumber: "A25Y29040" });
    const route = routeScan(url, "en");
    assert.equal(route.kind, "tag");
    assert.equal(route.kind === "tag" && route.href, `/en/tag/${url.split("/tag/")[1]}`);
  });
  it("opens a sticker label QR", () => {
    const url = buildTagUrl(SSR, { tagNumber: "", stickerLineNumber: "FRO20260904861E41" });
    assert.equal(routeScan(url, "tr").kind, "tag");
  });
  it("opens a backend publicLink that carries a locale", () => {
    const url = buildTagUrl(`${SSR}/en`, { tagNumber: "FRO2026092700001" });
    const route = routeScan(url, "tr");
    assert.equal(route.kind === "tag" && route.href.startsWith("/tr/tag/"), true);
  });
  it("opens an airport validate QR in the current language", () => {
    const url = buildValidateUrl(SSR, { qrValue: "3fa85f64-5717-4562-b3fc-2c963f66afa6", lang: "tr" });
    assert.deepEqual(routeScan(url, "en"), {
      kind: "validate",
      href: "/en/validate?qrValue=3fa85f64-5717-4562-b3fc-2c963f66afa6",
    });
  });
  it("refuses anything else", () => {
    assert.deepEqual(routeScan("https://example.com/hello", "en"), { kind: "unknown" });
    assert.deepEqual(routeScan("hello world", "en"), { kind: "unknown" });
    assert.deepEqual(routeScan("", "en"), { kind: "unknown" });
  });
});
```

- [ ] **Step 6: Run it to verify it fails.**

- [ ] **Step 7: Implement** `scan-routing.ts`:

```ts
import { decodeTagScan, extractValidateQrValue, slugFromScan } from "@unirefund/qr";

export type ScanRoute = { kind: "validate" | "tag"; href: string } | { kind: "unknown" };

export function routeScan(raw: string, lang: string): ScanRoute {
  const value = raw.trim();
  const qrValue = extractValidateQrValue(value);
  if (qrValue) {
    return { kind: "validate", href: `/${lang}/validate?qrValue=${encodeURIComponent(qrValue)}` };
  }
  const fields = decodeTagScan(value);
  if (fields.tagNumber || fields.tagId || fields.stickerLineNumber) {
    return { kind: "tag", href: `/${lang}/tag/${slugFromScan(value)}` };
  }
  return { kind: "unknown" };
}
```

  If `decodeTagScan`'s return type names its fields differently, use the names it declares. `(public)/tag/[slug]/page.tsx` reads `tagNumber`, `tagId`, `travellerDocumentNumber` and `stickerLineNumber` from `decodeTagSlug`.

- [ ] **Step 8: Run the tests and lint them.** Run `pnpm --filter ssr test:unit` (all pass), then `pnpm --filter ssr lint` (0 errors).

- [ ] **Step 9: Commit.**

```bash
git add apps/ssr/src/components/shell/blob-chain.ts apps/ssr/src/components/shell/blob-chain.test.ts apps/ssr/src/components/shell/island-routes.ts apps/ssr/src/components/shell/island-routes.test.ts apps/ssr/src/components/shell/scan-routing.ts apps/ssr/src/components/shell/scan-routing.test.ts
git commit -q -F - <<'EOF'
feat(ssr): add the island's geometry, slot rules and scan routing

The blob-chain geometry is super-app's, ported with its tests. Pure
helpers pick the active slot, send a signed-out Tags or Profile tap to
login, hide the island on validate, and route a scanned code through
@unirefund/qr to the public tag page or validate.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 3: The island, the scanner and the layouts (web-app)

**Files:**
- Create:
  - `apps/ssr/scripts/gen-ionicons.mjs`
  - `apps/ssr/src/components/shell/ionicons.tsx` (generated)
  - `shell-context.tsx`
  - `tab-island.tsx`
  - `scan-overlay.tsx`
  - `tab-page.tsx`
- Modify:
  - `(main)/layout.tsx` and `(public)/layout.tsx`
  - `(public)/explore/page.tsx`
  - the legal page container in `apps/ssr/src/components/legal/`
  - `SSRService` en/tr: the `Island.*` and `Scan.*` keys from the Strings table

**Interfaces:**
- Consumes (from Task 2): `blobBarChain`, `groupsAround`, `BAR_RADIUS`, `BAR_BOTTOM_GAP`, `ISLAND_SLOTS`, `activeSlot`, `slotHref`, `isIslandHidden`, `routeScan`.
- Produces:
  - `ShellProvider({ value: ShellValue; children })` and `useShell(): ShellValue`, where:

    ```ts
    type ShellValue = {
      signedIn: boolean;
      notification: NotificationConfig | null;
      documentAffiliations: Affiliation[];
    };
    type NotificationConfig = { appId: string; appUrl: string; socketUrl: string; subscriberId: string };
    ```

  - `TabIsland()`.
  - `TabPage({ children, wide?: boolean })`.
  - `ISLAND_CLEARANCE_CLASS`.
  - The icon components `IoHome`, `IoHomeOutline`, `IoPricetags`, `IoPricetagsOutline`, `IoQrCodeOutline`, `IoHelpCircle`, `IoHelpCircleOutline`, `IoPerson`, `IoPersonOutline`, `IoNotifications`, `IoArrowBack`, `IoCardOutline`, `IoLanguageOutline`, `IoLockClosedOutline`, `IoShieldCheckmarkOutline`, `IoPersonRemoveOutline`, `IoLogOutOutline`, `IoChevronForward`, `IoChevronDown`, `IoDocumentTextOutline`, `IoChatbubblesOutline` and `IoClose`. Each takes `{ size?: number } & SVGProps<SVGSVGElement>`.

- [ ] **Step 1: Generate the icons.** Create `apps/ssr/scripts/gen-ionicons.mjs`:

```js
// Writes src/components/shell/ionicons.tsx from ionicons (MIT). Run: node scripts/gen-ionicons.mjs
import { writeFile } from "node:fs/promises";

const VERSION = "8.1.0";
const NAMES = [
  "home", "home-outline", "pricetags", "pricetags-outline", "qr-code-outline",
  "help-circle", "help-circle-outline", "person", "person-outline", "notifications",
  "arrow-back", "card-outline", "language-outline", "lock-closed-outline",
  "shield-checkmark-outline", "person-remove-outline", "log-out-outline",
  "chevron-forward", "chevron-down", "document-text-outline", "chatbubbles-outline", "close",
];
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const pascal = (s) => camel(`-${s}`);

function toJsx(svg) {
  return svg
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/\sclass="[^"]*"/g, "")
    .replace(/\s(stroke-linecap|stroke-linejoin|stroke-width|stroke-miterlimit|fill-rule|clip-rule)=/g, (_, a) => ` ${camel(a)}=`)
    .replace(/strokeWidth="(\d+)px"/g, 'strokeWidth="$1"');
}

let out = `// Generated by scripts/gen-ionicons.mjs from ionicons@${VERSION} (MIT). Do not edit.\nimport type { SVGProps } from "react";\n\ntype IconProps = SVGProps<SVGSVGElement> & { size?: number };\n`;
for (const name of NAMES) {
  const res = await fetch(`https://unpkg.com/ionicons@${VERSION}/dist/svg/${name}.svg`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const body = toJsx(await res.text());
  out += `\nexport function Io${pascal(name)}({ size = 24, ...props }: IconProps) {\n  return (\n    <svg aria-hidden="true" fill="currentColor" height={size} viewBox="0 0 512 512" width={size} {...props}>\n      ${body}\n    </svg>\n  );\n}\n`;
}
await writeFile(new URL("../src/components/shell/ionicons.tsx", import.meta.url), out);
```

  - Run `cd apps/ssr && node scripts/gen-ionicons.mjs`, then `pnpm exec prettier --write src/components/shell/ionicons.tsx`.
  - Open the file and check that each component's body holds only `path`, `circle` and `rect` elements, with camelCased attributes.

- [ ] **Step 2: Add the shell context** `shell-context.tsx`:

```tsx
"use client";
import type { UniRefund_TravellerService_Travellers_TravellerDocumentAffiliationDto as Affiliation } from "@repo/saas/TravellerService";
import { createContext, useContext } from "react";

export type NotificationConfig = { appId: string; appUrl: string; socketUrl: string; subscriberId: string };
export type ShellValue = {
  signedIn: boolean;
  notification: NotificationConfig | null;
  documentAffiliations: Affiliation[];
};

const ShellContext = createContext<ShellValue>({ signedIn: false, notification: null, documentAffiliations: [] });

export function ShellProvider({ value, children }: { value: ShellValue; children: React.ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export const useShell = () => useContext(ShellContext);
```

  The server layouts build the config with a separate, server-safe `notification-config.ts` (no `"use client"`), because a server component cannot call a function exported from a client module:

```ts
import type { NotificationConfig } from "./shell-context";

export function notificationConfig(subscriberId: string | undefined): NotificationConfig | null {
  const appId = process.env.NOVU_APP_IDENTIFIER;
  const appUrl = process.env.NOVU_APP_URL;
  const socketUrl = process.env.NOVU_SOCKET_URL;
  if (!appId || !appUrl || !socketUrl || !subscriberId) return null;
  return { appId, appUrl, socketUrl, subscriberId };
}
```

- [ ] **Step 3: Add the page frame** `tab-page.tsx`:

```tsx
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";

/** Bottom clearance for the island: its 60 px height, its 20 px gap and 32 px of air. */
export const ISLAND_CLEARANCE_CLASS = "pb-[calc(env(safe-area-inset-bottom)+112px)]";

export function TabPage({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={cn("mx-auto w-full px-4 pt-4", wide ? "max-w-5xl" : "max-w-3xl", ISLAND_CLEARANCE_CLASS)}>
      {children}
    </main>
  );
}
```

- [ ] **Step 4: Add the scanner overlay** `scan-overlay.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { BarcodeCameraScanner } from "@repo/ayasofyazilim-ui/custom/barcode-camera-scanner";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { IoClose } from "./ionicons";
import { routeScan } from "./scan-routing";

export function ScanOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang } = useParams<{ lang: string }>();
  const router = useRouter();
  const { t } = useTranslations();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleScan(code: string) {
    const route = routeScan(code, lang);
    if (route.kind === "unknown") {
      toast.error(t.SSRService["Scan.Unrecognised"]);
      return;
    }
    onClose();
    router.push(route.href);
  }

  return (
    <div
      aria-label={t.SSRService["Scan.Title"]}
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      data-testid="scan-overlay"
      role="dialog"
    >
      <div className="flex items-center gap-2 p-4">
        <Button
          aria-label={t.SSRService["Scan.Close"]}
          className="text-white hover:bg-white/10 hover:text-white"
          data-testid="scan-close"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <IoClose size={24} />
        </Button>
        <h2 className="flex-1 text-center text-lg font-semibold">{t.SSRService["Scan.Title"]}</h2>
        <span className="size-9" />
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4">
        <BarcodeCameraScanner
          aspectRatio="1 / 1"
          formats={["qr_code"]}
          labels={{
            requesting: t.SSRService["Validate.ClaimTag.CameraRequesting"],
            permissionDenied: t.SSRService["Validate.ClaimTag.CameraPermissionDenied"],
            noCamera: t.SSRService["Validate.ClaimTag.CameraNoCamera"],
            selectCamera: t.SSRService["Validate.ClaimTag.CameraSelectCamera"],
            retry: t.SSRService["Validate.ClaimTag.CameraRetry"],
          }}
          onScan={handleScan}
        />
        <p className="text-center text-sm text-white/80">{t.SSRService["Scan.Prompt"]}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add the island** `tab-island.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { BAR_BOTTOM_GAP, BAR_RADIUS, blobBarChain, groupsAround } from "./blob-chain";
import { activeSlot, isIslandHidden, ISLAND_SLOTS, slotHref } from "./island-routes";
import {
  IoHelpCircle, IoHelpCircleOutline, IoHome, IoHomeOutline, IoPerson,
  IoPersonOutline, IoPricetags, IoPricetagsOutline, IoQrCodeOutline,
} from "./ionicons";
import { ScanOverlay } from "./scan-overlay";
import { useShell } from "./shell-context";

const ACTIVE_INSET = 5;
const SCAN_INDEX = ISLAND_SLOTS.indexOf("scan");
const ICONS = {
  home: [IoHome, IoHomeOutline],
  tags: [IoPricetags, IoPricetagsOutline],
  faq: [IoHelpCircle, IoHelpCircleOutline],
  profile: [IoPerson, IoPersonOutline],
} as const;
const LABEL_KEYS = { home: "Island.Home", tags: "Island.Tags", scan: "Island.Scan", faq: "Island.Faq", profile: "Island.Profile" } as const;

const subscribe = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
// 1024 on the server: the chain only scales below 304 px, so every real phone hydrates the same path.
const useViewportWidth = () => useSyncExternalStore(subscribe, () => window.innerWidth, () => 1024);

export function TabIsland() {
  const { lang } = useParams<{ lang: string }>();
  const pathname = usePathname();
  const { signedIn } = useShell();
  const { t } = useTranslations();
  const [scanOpen, setScanOpen] = useState(false);
  const closeScan = useCallback(() => setScanOpen(false), []);
  const width = useViewportWidth();
  const chain = useMemo(
    () => blobBarChain({ windowWidth: width, groups: groupsAround(ISLAND_SLOTS.length, SCAN_INDEX) }),
    [width]
  );

  if (isIslandHidden(pathname, lang)) return null;
  const active = activeSlot(pathname, lang);
  const activeIndex = active ? ISLAND_SLOTS.indexOf(active) : -1;
  const diameter = BAR_RADIUS * 2;

  return (
    <>
      <nav
        aria-label={t.SSRService["Island.Label"]}
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
        data-testid="tab-island"
        style={{ bottom: `calc(env(safe-area-inset-bottom) + ${BAR_BOTTOM_GAP}px)` }}
      >
        <div className="pointer-events-auto relative" style={{ width: chain.width, height: chain.height }}>
          <div
            aria-hidden="true"
            className="absolute inset-0 backdrop-blur-md"
            style={{ clipPath: `path("${chain.path}")` }}
          />
          <svg
            aria-hidden="true"
            className="absolute inset-0 overflow-visible"
            height={chain.height}
            viewBox={`0 0 ${chain.width} ${chain.height}`}
            width={chain.width}
          >
            <path className="fill-card/92 stroke-border" d={chain.path} strokeWidth={1} />
          </svg>
          {activeIndex >= 0 && (
            <span
              aria-hidden="true"
              className="absolute rounded-full bg-foreground transition-transform duration-300 ease-out"
              style={{
                top: ACTIVE_INSET,
                left: 0,
                width: diameter - ACTIVE_INSET * 2,
                height: diameter - ACTIVE_INSET * 2,
                transform: `translateX(${(chain.centers[activeIndex] ?? 0) - BAR_RADIUS + ACTIVE_INSET}px)`,
              }}
            />
          )}
          {ISLAND_SLOTS.map((slot, index) => {
            const left = (chain.centers[index] ?? 0) - BAR_RADIUS;
            const label = t.SSRService[LABEL_KEYS[slot]];
            if (slot === "scan") {
              return (
                <button
                  aria-label={label}
                  className="absolute top-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_10px_rgb(231_0_11/0.3)] transition-transform active:scale-90"
                  data-testid="island-scan"
                  key={slot}
                  onClick={() => setScanOpen(true)}
                  style={{ left, width: diameter, height: diameter }}
                  type="button"
                >
                  <IoQrCodeOutline size={24} />
                </button>
              );
            }
            const isActive = index === activeIndex;
            const [Filled, Outline] = ICONS[slot];
            const Icon = isActive ? Filled : Outline;
            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                aria-label={label}
                className={cn(
                  "absolute top-0 flex items-center justify-center rounded-full transition-transform active:scale-90",
                  isActive ? "text-card" : "text-muted-foreground"
                )}
                data-testid={`island-${slot}`}
                href={slotHref(slot, lang, signedIn)}
                key={slot}
                style={{ left, width: diameter, height: diameter }}
              >
                <Icon size={24} />
              </Link>
            );
          })}
        </div>
      </nav>
      <ScanOverlay onClose={closeScan} open={scanOpen} />
    </>
  );
}
```

  Type the `LABEL_KEYS` lookup against `t.SSRService`'s generated key type once Step 7 has run `init`.

- [ ] **Step 6: Mount the shell in both layouts.**
  - **`(main)/layout.tsx`:**
    - Remove the `DefaultNavbar` element and the `Footer` element, along with their imports and `getPublicLanguagesApi`. Keep `getMyDocumentAffiliationsApi` as the only required request.
    - Keep `ChatbotWidget`.
    - Wrap the children:

```tsx
<ShellProvider
  value={{
    signedIn: true,
    notification: notificationConfig(session?.user?.sub),
    documentAffiliations: documentAffiliationsResponse.data || [],
  }}
>
  {children}
  <TabIsland />
</ShellProvider>
```

  - **`(public)/layout.tsx`:**
    - Remove `DefaultNavbar`, `Footer` and their imports.
    - `getPublicLanguagesApi` is now unused. Drop it, and make the affiliations probe the only (optional) request.
    - Keep `StaleSessionCleaner` and `ChatbotWidget`.
    - Wrap the children:

```tsx
<ShellProvider
  value={{
    signedIn: isLoggedIn,
    notification: isLoggedIn ? notificationConfig(session?.user?.sub) : null,
    documentAffiliations,
  }}
>
  {children}
  <TabIsland />
</ShellProvider>
```

  Keep the `SessionState` logic and the `documentAffiliations` computation exactly as they are. Do not delete `components/global/navbar/*` or `components/global/footer.tsx`.

- [ ] **Step 7: Make room for the island.**
  - **Strings:** add the `Island.*` and `Scan.*` keys (en and tr) from the Strings table, then run `pnpm --filter ssr run init`.
  - **Explore** (`(public)/explore/page.tsx`):
    - On the status pill wrapper (around line 275), change `bottom-10` to `bottom-28`.
    - Add `isolate` to the map wrapper's `className` (the element with `style={{ height: wrapperHeight }}`, around line 144), so Leaflet's z-indexes stay inside the map and the island draws over it.
  - **Legal pages:** in `apps/ssr/src/components/legal/`, add `ISLAND_CLEARANCE_CLASS` (from `@/src/components/shell/tab-page`) to the shared page container. That is the element with `container mx-auto max-w-3xl px-4 py-10 lg:py-16`.

- [ ] **Step 8: Run the gates.**
  - Run `pnpm --filter ssr test:unit`, `type-check` and `lint` (0 errors).
  - Then start the dev server, `pnpm --filter ssr dev --port 3011`, in the background. If 3011 is taken, use another free port.
  - Check the island:
    - `curl -s http://localhost:3011/en | grep -c 'data-testid="tab-island"'` should print 1.
    - `curl -s "http://localhost:3011/en/validate?qrValue=x" | grep -c 'data-testid="tab-island"'` should print 0.
  - Stop the dev server before committing.

- [ ] **Step 9: Commit.** Stage by name:
  - `apps/ssr/scripts/gen-ionicons.mjs`
  - the four new shell components and `ionicons.tsx`
  - both layouts
  - `explore/page.tsx`
  - the legal container file
  - en.json and tr.json

```bash
git commit -q -F - <<'EOF'
feat(ssr): replace the navbar with the app's island

Every page outside sign-in and validate now ends in super-app's island:
Home, Tags, a red Scan button, FAQ and Profile, drawn from the same
blob chain with the app's Ionicons. Scan opens a camera overlay that
routes a code through @unirefund/qr. The navbar and footer are no longer
rendered; Explore's status pill and the legal pages clear the island.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 4: The page header, the bell and the document pill (web-app)

**Files:**
- Create:
  - `apps/ssr/src/components/shell/page-header.tsx`
  - `header-bell.tsx`
- Modify:
  - `packages/ui/src/notification/index.tsx` and `popover.tsx`
  - `components/global/navbar/traveller-document-switcher.tsx`
  - `(public)/client.tsx`
  - `(main)/tags/_components/tags-view.tsx`
  - `(main)/tags/[tagNumber]/_components/tag-details.tsx`
  - `(public)/tag/[slug]/_components/public-tag-details.tsx`
  - `SSRService` en/tr: `Header.Back`, `Home.Greeting`, `Home.Guest`

**Interfaces:**
- Consumes (from Task 3): `useShell`, `TabPage`, `IoArrowBack`, `IoNotifications`, `IoDocumentTextOutline`, `IoChevronDown`.
- Produces:
  - `PageHeader({ title: string; accessory?: React.ReactNode; backHref?: string; actions?: React.ReactNode })`.
  - `NotificationProps.renderBell?: BellProps["renderBell"]`.
  - `TravellerDocumentSwitcher({ affiliations, variant?: "navbar" | "pill" })`.

- [ ] **Step 1: Pass `renderBell` through the shared popover.**
  - In `packages/ui/src/notification/index.tsx`, import `type BellProps` from `"@novu/nextjs"`, and add `renderBell?: BellProps["renderBell"];` to `NotificationProps`.
  - In `popover.tsx`, destructure `renderBell` and render `<Bell renderBell={renderBell} />` in place of `<Bell />`.
  - Add `data-testid="notification-popover-trigger"` to the trigger `Button`.
  - `apps/web` passes no `renderBell`, so its bell is unchanged.

- [ ] **Step 2: Add the bell** `header-bell.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { NotificationPopover } from "@repo/ui/notification";
import { IoNotifications } from "./ionicons";
import type { NotificationConfig } from "./shell-context";

export function HeaderBell({ config }: { config: NotificationConfig }) {
  const { t } = useTranslations();
  return (
    <NotificationPopover
      appId={config.appId}
      appUrl={config.appUrl}
      langugageData={{ ...t.Default, ...t.AbpUiNavigation }}
      renderBell={(unread) => (
        <span className="relative inline-flex text-foreground">
          <IoNotifications size={24} />
          {unread.total > 0 && (
            <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {unread.total > 99 ? "99+" : unread.total}
            </span>
          )}
        </span>
      )}
      socketUrl={config.socketUrl}
      subscriberId={config.subscriberId}
    />
  );
}
```

- [ ] **Step 3: Add the header** `page-header.tsx`:

```tsx
"use client";
import { useTranslations } from "@/src/providers/i18n";
import { buttonVariants } from "@repo/ayasofyazilim-ui/components/button";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { HeaderBell } from "./header-bell";
import { IoArrowBack } from "./ionicons";
import { useShell } from "./shell-context";

export function PageHeader({
  title,
  accessory,
  backHref,
  actions,
}: {
  title: string;
  accessory?: React.ReactNode;
  backHref?: string;
  actions?: React.ReactNode;
}) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const pathname = usePathname();
  const { signedIn, notification } = useShell();
  return (
    <header className="mb-4 flex items-start gap-4" data-testid="page-header">
      {backHref && (
        <Link
          aria-label={t.SSRService["Header.Back"]}
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-foreground"
          data-testid="page-header-back"
          href={backHref}
        >
          <IoArrowBack size={24} />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-3xl font-bold text-foreground">{title}</h1>
        {accessory}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {signedIn ? (
          notification && <HeaderBell config={notification} />
        ) : (
          <Link
            className={buttonVariants({ size: "sm" })}
            data-testid="page-header-sign-in"
            href={`/${lang}/login?redirectTo=${encodeURIComponent(pathname)}`}
          >
            {t.SSRService["Auth.signIn"]}
          </Link>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Add the pill variant to the document switcher.**
  - In `traveller-document-switcher.tsx`, add the prop `variant?: "navbar" | "pill"`, defaulting to `"navbar"`. Keep the dropdown's content, the switching logic and the navbar rendering exactly as they are.
  - When `variant === "pill"`:
    - **One affiliation:** render the app's plain line instead of the navbar label:

```tsx
<span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground" data-testid="document-pill-single">
  <IoDocumentTextOutline size={14} />
  {activeAffiliation?.identificationNumber}
</span>
```

      Use the same field the navbar label prints for the number.
    - **Two or more:** keep the `DropdownMenu`, but make its trigger child this element, keeping the existing `data-testid` on the `DropdownMenuTrigger`:

```tsx
<button
  className="mt-1 inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs font-semibold text-foreground"
  type="button"
>
  {activeAffiliation?.identificationNumber}
  <IoChevronDown size={12} />
</button>
```

- [ ] **Step 5: Use the header on the four pages.** First add `Header.Back`, `Home.Greeting` and `Home.Guest` (en and tr), and run `init`.
  - **`(public)/client.tsx`, signed in:**
    - Return `<TabPage>`. Inside it, put `<PageHeader title={t.SSRService["Home.Greeting"].replace("{0}", name || t.SSRService["Home.Guest"])} accessory={<TravellerDocumentSwitcher variant="pill" affiliations={documentAffiliations} />} />`, then today's two buttons ("Explore merchants" and "Check your tags") in a `flex flex-col gap-3 sm:flex-row` row.
    - `documentAffiliations` comes from `useShell()`.
    - Render the pill only when `documentAffiliations.length > 0`.
  - **`(public)/client.tsx`, signed out:** keep the current `<section id="hero-section">` unchanged.
  - **`tags-view.tsx`:**
    - Replace the outer two `div`s with `<TabPage>`.
    - Replace the `h1` row and the `Separator` with `<PageHeader title={t.SSRService["Tags"]} />`, then a `mb-4 flex flex-wrap gap-2` row holding `<UploadVerificationDialog />` and `<ClaimTag />`.
    - Keep the toolbar, the pending verifications and the table.
  - **`tag-details.tsx`:**
    - Replace the back `Link` and the `h1` with `<PageHeader title={<the h1's existing text>} backHref={`/${lang}/tags`} />`.
    - Wrap the page in `<TabPage wide>`, in place of its `max-w-5xl` container.
  - **`public-tag-details.tsx`:**
    - Replace the back `Link` and the `h1` block with `<PageHeader title={<existing title>} accessory={<p className="text-sm text-muted-foreground">{tagNumber}</p>} backHref={`/${lang}/tag`} />`.
    - Wrap the page in `<TabPage wide>`.

- [ ] **Step 6: Run the gates.**
  - Run `test:unit`, `type-check` and `lint` (0 errors).
  - Then `pnpm --filter web type-check`, because `packages/ui` changed.
  - Start dev on a free port, then run `curl -s http://localhost:<port>/en/tag/e246RlJPMjAyNjA5MjcwMDAwMSx0OkEyNVkyOTA0MH0 | grep -c 'data-testid="page-header-sign-in"'`. It should print 1.
  - Stop dev.

- [ ] **Step 7: Commit.** Stage the files above, then:

```bash
git commit -q -F - <<'EOF'
feat(ssr): give every tab page the app's header

Pages now open with the app's header: a large title, a round back
button on sub-pages, and the bell with a red unread count on the
right, or Sign in when signed out. Home greets the traveller by name
over the document pill. The shared notification popover gains an
optional renderBell; apps/web passes none and is unchanged.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 5: Profile hub and routes (web-app)

**Files:**
- Create:
  - `apps/ssr/src/components/shell/profile-rows.ts` and `.test.ts`
  - `(main)/profile/page.tsx`
  - `(main)/profile/_components/profile-hub.tsx`
- Move (`git mv`):
  - `(main)/account/page.tsx` → `(main)/profile/edit-profile/page.tsx`
  - `(main)/account/_components/` → `(main)/profile/edit-profile/_components/`
  - `(main)/account/cards/` → `(main)/profile/cards/`
  - `(main)/account/change-password/` → `(main)/profile/change-password/`
- Delete: `(main)/account/layout.tsx` (the tab bar)
- Modify:
  - `components/global/navbar/language-selector.tsx` (`variant="row"`)
  - the three moved pages (PageHeader)
  - `SSRService` en/tr: the `Profile.*` keys

**Interfaces:**
- Consumes: `PageHeader`, `TabPage`, `Surface`, `useShell`, and the Task 3 icons.
- Produces:
  - `type ProfileRowId = "personal" | "cards" | "language" | "change-password" | "privacy" | "account-deletion" | "logout"`.
  - `type ProfileGroup = { id: "account" | "wallet" | "app" | "legal" | "session"; titleKey: "Profile.Group.Account" | "Profile.Group.Wallet" | "Profile.Group.App" | "Profile.Group.Legal" | null; rows: ProfileRowId[] }`.
  - `profileGroups(granted: Record<string, boolean> | undefined): ProfileGroup[]`.

- [ ] **Step 1: Write the failing rows test** `profile-rows.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { profileGroups } from "./profile-rows";

const PAIR = { "RefundService.TravellerCards": true, "RefundService.TravellerCards.ViewMine": true };

describe("profileGroups", () => {
  it("lists the app's groups in order, with Cards when the pair is granted", () => {
    assert.deepEqual(
      profileGroups(PAIR).map((g) => [g.id, g.rows]),
      [
        ["account", ["personal"]],
        ["wallet", ["cards"]],
        ["app", ["language", "change-password"]],
        ["legal", ["privacy", "account-deletion"]],
        ["session", ["logout"]],
      ]
    );
  });
  it("drops the wallet group without the cards pair", () => {
    assert.equal(profileGroups({}).some((g) => g.id === "wallet"), false);
    assert.equal(profileGroups({ "RefundService.TravellerCards.ViewMine": true }).some((g) => g.id === "wallet"), false);
    assert.equal(profileGroups(undefined).some((g) => g.id === "wallet"), false);
  });
  it("titles every group but the session one", () => {
    assert.equal(profileGroups(PAIR).find((g) => g.id === "session")?.titleKey, null);
    assert.equal(profileGroups(PAIR).find((g) => g.id === "legal")?.titleKey, "Profile.Group.Legal");
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**

- [ ] **Step 3: Implement** `profile-rows.ts`:

```ts
export type ProfileRowId = "personal" | "cards" | "language" | "change-password" | "privacy" | "account-deletion" | "logout";
export type ProfileGroup = {
  id: "account" | "wallet" | "app" | "legal" | "session";
  titleKey: "Profile.Group.Account" | "Profile.Group.Wallet" | "Profile.Group.App" | "Profile.Group.Legal" | null;
  rows: ProfileRowId[];
};

const CARDS_PAIR = ["RefundService.TravellerCards", "RefundService.TravellerCards.ViewMine"];
const granted = (map: Record<string, boolean> | undefined, keys: string[]) => keys.every((k) => map?.[k] === true);

export function profileGroups(policies: Record<string, boolean> | undefined): ProfileGroup[] {
  const groups: ProfileGroup[] = [
    { id: "account", titleKey: "Profile.Group.Account", rows: ["personal"] },
    { id: "wallet", titleKey: "Profile.Group.Wallet", rows: granted(policies, CARDS_PAIR) ? ["cards"] : [] },
    { id: "app", titleKey: "Profile.Group.App", rows: ["language", "change-password"] },
    { id: "legal", titleKey: "Profile.Group.Legal", rows: ["privacy", "account-deletion"] },
    { id: "session", titleKey: null, rows: ["logout"] },
  ];
  return groups.filter((g) => g.rows.length > 0);
}
```

- [ ] **Step 4: Run it to verify it passes.**

- [ ] **Step 5: Move the account pages.** Run the `git mv` commands above, then `git rm "apps/ssr/src/app/[lang]/(main)/account/layout.tsx"`.
  - In each moved page, wrap the content in `<TabPage>` and add `<PageHeader title=… backHref={`/${lang}/profile`} />` at the top, using the existing `Account.Layout.*` title key:
    - edit-profile: `AccountSettings`
    - cards: `Cards`
    - change-password: `ChangePassword`
  - Remove each page's own top `h2` title where it repeats that text. Keep its description paragraph.
  - Server pages pass `lang` from `params`; client components read it with `useParams`.
  - Then run `grep -rn '/account' apps/ssr/src --include=*.tsx --include=*.ts | grep -v account-deletion | grep -v api/account`. It must print nothing. Fix any link it finds by pointing it at its `/profile/...` equivalent.

- [ ] **Step 6: Add the row variant to `LanguageSelector`.**
  - Add `"row"` to the `variant` union, and add an optional `children?: React.ReactNode` prop.
  - When `variant === "row"`, return:

```tsx
<Dialog>
  <DialogTrigger asChild data-testid="profile-row-language">
    {children}
  </DialogTrigger>
  <DialogContent className="p-0 sm:max-w-sm">
    <DialogTitle className="sr-only">{languageData.SSRService.ChangeLocale}</DialogTitle>
    <LanguageSelectorContent
      filterLanguages={filterLanguages}
      languageData={languageData}
      languagesList={languagesList}
      pathName={pathName}
      router={router}
      searchParams={searchParams}
      selectedLanguage={selectedLanguage}
    />
  </DialogContent>
</Dialog>
```

  Import `Dialog`, `DialogContent`, `DialogTitle` and `DialogTrigger` from `@repo/ayasofyazilim-ui/components/dialog`.

- [ ] **Step 7: Add the hub.** First add the `Profile.*` keys (en and tr) and run `init`.
  - **`(main)/profile/page.tsx`** (server):

```tsx
import { getTranslations } from "@/src/language-data/get-translations";
import { getPublicLanguagesApi } from "@repo/actions/core/AdministrationService/actions";
import { signOutServer } from "@repo/utils/auth";
import { auth } from "@repo/utils/auth/next-auth";
import { ProfileHub } from "./_components/profile-hub";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const [t, session] = await Promise.all([getTranslations(lang), auth()]);
  const languages = await getPublicLanguagesApi(session).catch(() => null);
  return (
    <ProfileHub
      languageData={t}
      languagesList={languages?.data?.items ?? []}
      signOutServer={signOutServer}
    />
  );
}
```

  - **`profile-hub.tsx`** (client):
    - Render `<TabPage><PageHeader title={t.SSRService["Profile.Title"]} />`, then one block per `profileGroups(policies)` group, using `policies` from `useApplicationConfiguration()` (`import { useApplicationConfiguration } from "@repo/utils/app-config"`, as `cards-view.tsx` does).
    - Each group block is:
      - a kicker `<p className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">`, omitted when `titleKey` is null;
      - then a `<Surface className="mb-6 overflow-hidden">` holding the rows;
      - with `<div className="ml-[60px] h-px bg-border" />` between rows.
    - Row content: a `flex items-center gap-3 px-4 py-3.5` element containing:
      - a `flex size-9 items-center justify-center rounded-full bg-foreground/5` bubble with a 20 px icon;
      - `<span className="flex-1 text-base text-foreground">`;
      - an optional value `text-sm text-muted-foreground`;
      - `<IoChevronForward size={16} className="text-muted-foreground" />`.
    - The rows:

| Row | Element | Icon | `data-testid` |
| --- | --- | --- | --- |
| personal | `Link` → `/${lang}/profile/edit-profile` | `IoPersonOutline` | `profile-row-personal` |
| cards | `Link` → `/${lang}/profile/cards` | `IoCardOutline` | `profile-row-cards` |
| language | `<LanguageSelector variant="row" languagesList languageData>` wrapping a `<button type="button">` row. Value = the current language's `displayName`. | `IoLanguageOutline` | on the trigger |
| change-password | `Link` → `/${lang}/profile/change-password` | `IoLockClosedOutline` | `profile-row-change-password` |
| privacy | `Link` → `/${lang}/privacy` | `IoShieldCheckmarkOutline` | `profile-row-privacy` |
| account-deletion | `Link` → `/${lang}/account-deletion` | `IoPersonRemoveOutline` | `profile-row-account-deletion` |
| logout | `Button variant="ghost"`, full row, `text-destructive`; bubble `bg-destructive/10`; no chevron. `onClick={async () => { await signOutServer({ redirectTo: "/" }); router.refresh(); }}`, the same as the old navbar. | `IoLogOutOutline` | `profile-row-logout` |

- [ ] **Step 8: Run the gates.**
  - Run `test:unit`, `type-check` and `lint` (0 errors).
  - Start dev, then check:
    - signed in (the dev test traveller, `tur-a25y29041` / `1q2w3E*`), `/en/profile` renders all five groups;
    - `/en/profile/cards` renders the cards page with a back button;
    - `/en/account` returns 404.
  - Stop dev.

- [ ] **Step 9: Commit.** Stage the moves, the deletion, the new files, `language-selector.tsx` and en/tr. The message:

```bash
git commit -q -F - <<'EOF'
feat(ssr): add the app's Profile hub and move account pages under it

/profile is now the app's grouped list: personal information, cards
(with the cards grant), language, change password, privacy, account
deletion and log out. The account pages move to /profile/edit-profile,
/profile/cards and /profile/change-password; /account and its tab bar
are gone.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 6: FAQ (web-app)

**Files:**
- Create:
  - `apps/ssr/src/components/shell/faq-toggle.ts` and `.test.ts`
  - `(public)/faq/page.tsx`
  - `(public)/faq/_components/faq-view.tsx`
- Modify:
  - `apps/ssr/src/proxy.ts`
  - `SSRService` en/tr: the `Faq.*` keys

**Interfaces:**
- Consumes: `PageHeader`, `TabPage`, `Surface`, `IoHelpCircleOutline`, `IoChevronDown`, `IoChatbubblesOutline`.
- Produces: `toggleOpen(current: string | null, id: string): string | null`.

- [ ] **Step 1: Write the failing test** `faq-toggle.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toggleOpen } from "./faq-toggle";

describe("toggleOpen", () => {
  it("opens one item at a time and closes it on a second press", () => {
    assert.equal(toggleOpen(null, "a"), "a");
    assert.equal(toggleOpen("a", "b"), "b");
    assert.equal(toggleOpen("b", "b"), null);
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement** `faq-toggle.ts`:

```ts
export function toggleOpen(current: string | null, id: string): string | null {
  return current === id ? null : id;
}
```

- [ ] **Step 3: Add the strings** (en | tr). These are copied from super-app's `MobileApp.FAQ.*`:

| Key | en | tr |
| --- | --- | --- |
| `Faq.Title` | FAQ | Sık Sorulan Sorular |
| `Faq.Chat` | Chat with support | Destekle sohbet et |
| `Faq.TaxFree.Title` | Tax Free | Tax Free |
| `Faq.TaxFree.WhatIsTaxFree.Title` | What is Tax Free? | Tax Free nedir? |
| `Faq.TaxFree.WhatIsTaxFree.Description` | Tax Free is a system that allows foreign tourists to get back the VAT they paid on their purchases. It applies to purchases above a certain amount. | Tax Free, yabancı turistlerin yaptıkları alışverişlerde ödedikleri KDV'yi geri almalarını sağlayan bir sistemdir. Belirli bir tutarın üzerindeki alışverişler için geçerlidir. |
| `Faq.TaxFree.WhoIsEligible.Title` | Who is eligible for Tax Free? | Kimler Tax Free'den yararlanabilir? |
| `Faq.TaxFree.WhoIsEligible.Description` | Tourists who are not residents of the EU and are staying for less than 3 months can benefit from Tax Free. | AB'de ikamet etmeyen ve 3 aydan az süre kalan turistler Tax Free'den yararlanabilir. |
| `Faq.TaxFree.HowToClaim.Title` | How to claim Tax Free? | Tax Free nasıl talep edilir? |
| `Faq.TaxFree.HowToClaim.Description` | To claim Tax Free, you need to get your purchases stamped by customs when leaving the country and submit your claim at a refund point. | Tax Free talep etmek için ülkeden çıkarken alışverişlerinizi gümrüğe onaylatmanız ve iade noktasında talebinizi sunmanız gerekir. |
| `Faq.Tags.Title` | Tags | Etiketler |
| `Faq.Tags.HowToCreate.Title` | How to create a tag? | Etiket nasıl oluşturulur? |
| `Faq.Tags.HowToCreate.Description` | To create a new tag, click the 'New Tag' button. Fill in customer information and enter the sales amount. | Yeni etiket oluşturmak için 'Yeni Etiket' butonuna tıklayın. Müşteri bilgilerini doldurun ve satış tutarını girin. |
| `Faq.Tags.WhenCustomsApproval.Title` | When to get customs approval? | Gümrük onayı ne zaman alınır? |
| `Faq.Tags.WhenCustomsApproval.Description` | You must get customs approval when leaving the country. The tag must be validated within the validity period. | Ülkeden çıkarken gümrük onayı almanız gerekir. Etiket geçerlilik süresi içinde onaylanmalıdır. |
| `Faq.Tags.HowRefundWorks.Title` | How does the refund process work? | İade süreci nasıl işler? |
| `Faq.Tags.HowRefundWorks.Description` | After customs approval, you can get your refund at authorized refund points. The refund can be received in cash or transferred to your card. | Gümrük onayından sonra yetkili iade noktalarından ödemenizi alabilirsiniz. İade nakit olarak veya kartınıza transfer edilebilir. |

  Then run `pnpm --filter ssr run init`. "How to create a tag?" is merchant-facing text. It is copied as-is for parity; the report notes it for the user.

- [ ] **Step 4: Add the page.**
  - **`(public)/faq/page.tsx`:**

```tsx
import { FaqView } from "./_components/faq-view";

export default function Page() {
  return <FaqView chatEnabled={Boolean(process.env.CHATBOT_URL && process.env.CHATBOT_TOKEN)} />;
}
```

  - **`faq-view.tsx`** (client):
    - Render `<TabPage><PageHeader title={t.SSRService["Faq.Title"]} />`, then the two sections, each a `<section className="my-4">` with `<h2 className="mb-4 text-2xl font-bold">`.
    - Each item is a `<Surface className="mb-3 px-5 py-4">` holding:
      - a `<button type="button" aria-expanded={open} data-testid={`faq-item-${id}`} className="flex w-full items-center gap-3 text-left">`;
      - inside it, a `flex size-9 items-center justify-center rounded-md bg-foreground/5` square with `IoHelpCircleOutline` (20), the title (`flex-1 font-semibold`), and `IoChevronDown` (16, `rotate-180` when open);
      - when open, `<p className="mt-3 text-sm text-muted-foreground">` with the answer.
    - Keep one `useState<string | null>` and update it with `toggleOpen`. The ids are `taxfree-what`, `taxfree-who`, `taxfree-claim`, `tags-create`, `tags-customs` and `tags-refund`.
    - When `chatEnabled`, add at the end a `<Button className="w-full" data-testid="faq-chat" onClick={toggleChatwoot} variant="outline">` with `IoChatbubblesOutline` and `t.SSRService["Faq.Chat"]`. `toggleChatwoot` comes from `@repo/ui/chatbot`.
  - **`apps/ssr/src/proxy.ts`:** change `ALWAYS_PUBLIC_ROUTES` to `["privacy", "account-deletion", "faq"]`, so a signed-out visitor reaches the FAQ without a login redirect.

- [ ] **Step 5: Run the gates.**
  - Run `test:unit`, `type-check` and `lint` (0 errors).
  - Start dev on a free port, then run `curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/en/faq` without a cookie. It should print 200, not a redirect.
  - Stop dev.

- [ ] **Step 6: Commit.**

```bash
git commit -q -F - <<'EOF'
feat(ssr): add the app's FAQ, with support chat

/faq shows the app's two FAQ sections as accordion cards, one open at a
time, and a Chat with support button that opens the Chatwoot widget
when it is configured. The page is public, so signed-out visitors
reach it from the island.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 7: super-app tokens (super-app)

**Files:**
- Modify:
  - `src/global.css`
  - `src/utils/theme.ts`
  - `tailwind.config.js`
- Test: `src/utils/__tests__/theme.test.ts` (existing sync test, unchanged)

**Interfaces:**
- Produces: the same token names, with new values; `rounded-sm/md/lg/xl` = 6/8/10/14 px.

- [ ] **Step 1: Change `src/global.css`.** Keep every token name. These are the only values that change:

| Token | New RGB value | Notes |
| --- | --- | --- |
| `--color-background` | `255 255 255` | delete the comment above it about the page sitting below `card` |
| `--color-foreground` | `9 9 11` | |
| `--color-border` | `228 228 231` | |
| `--color-muted` | `113 113 123` | |
| `--color-primary` | `231 0 11` | |
| `--color-primary-foreground` | `254 242 242` | |
| `--color-input` | `228 228 231` | delete the comment above it about inputs needing a stronger border |
| `--color-placeholder` | `113 113 123` | |
| `--color-muted-foreground` | `113 113 123` | |
| `--color-accent` | `244 244 245` | |
| `--color-accent-foreground` | `24 24 27` | |
| `--color-secondary` | `244 244 245` | |
| `--color-secondary-foreground` | `24 24 27` | |
| `--color-destructive` | `231 0 11` | |
| `--color-popover-foreground` | `9 9 11` | |
| `--color-card-foreground` | `9 9 11` | |
| `--color-ring` | `255 100 103` | |

  Everything else stays as it is: `card`, `popover`, every status, `-surface` and `-strong` token, `primary-surface`, and `recent`.
  - Add one line under the existing header comment: "Values follow apps/web's light tokens (packages/ui unirefund-tokens.css)."

- [ ] **Step 2: Mirror the values in `src/utils/theme.ts`.**

| Key | New hex value |
| --- | --- |
| `background` | `#ffffff` |
| `foreground` | `#09090b` |
| `border` | `#e4e4e7` |
| `muted` | `#71717b` |
| `primary` | `#e7000b` |
| `primaryForeground` | `#fef2f2` |
| `input` | `#e4e4e7` |
| `placeholder` | `#71717b` |
| `mutedForeground` | `#71717b` |
| `accent` | `#f4f4f5` |
| `accentForeground` | `#18181b` |
| `secondary` | `#f4f4f5` |
| `secondaryForeground` | `#18181b` |
| `destructive` | `#e7000b` |
| `popoverForeground` | `#09090b` |
| `cardForeground` | `#09090b` |
| `ring` | `#ff6467` |

  Leave `chartPalette` unchanged.

- [ ] **Step 3: Add the radius scale.** In `tailwind.config.js` → `theme.extend`, add:

```js
      // apps/web's --radius (0.65rem) and its sm/md/xl steps, in px for native.
      borderRadius: { sm: "6px", md: "8px", lg: "10px", xl: "14px" },
```

- [ ] **Step 4: Run the gates.**

```bash
cd /c/unirefund/super-app
npx jest src/utils src/components 2>&1 | grep -E "^(Test Suites|Tests):"
npx jest 2>&1 | grep -E "^(Test Suites|Tests):"
npm run typecheck 2>&1 | grep -c "error TS"    # 1
```

  If a test asserts an old value literally (grep for `244 245 247`, `db0000` and `#111827` in `*.test.*`), update it to the new value. Report each change.

- [ ] **Step 5: Commit.** Run `git branch --show-current` (it must print `feat/ssr-visual-parity-tokens`) and `git status --short`, then:

```bash
git add src/global.css src/utils/theme.ts tailwind.config.js
git commit -q -F - <<'EOF'
feat(theme): take apps/web's tokens

The palette now follows apps/web's light tokens, the same ones
web-app's packages/ui shares with ssr: a white page, zinc text and
borders, and apps/web's red. Corners follow its 0.65rem radius. The
status colours stay as they were.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 8: super-app Geist fonts (super-app)

**Files:**
- Create:
  - `src/utils/fontFamily.ts`
  - `src/utils/__tests__/fontFamily.test.ts`
  - `src/hooks/useAppFonts.ts`
- Modify:
  - `package.json` and the lockfile
  - `tailwind.config.js`
  - `src/app/_layout.tsx`
  - `src/features/SplashScreenController.tsx`
  - `src/components/rnr/text.tsx`
  - `src/components/rnr/input.tsx`
  - `src/components/rnr/textarea.tsx`
  - `src/components/PageHeader.tsx`
  - `src/screens/shared/Tags/Tag/_components/refund/RefundConfirmSheet.tsx`
  - `src/screens/shared/_components/SearchTraveller/SearchTraveller.tsx`
  - `src/screens/traveller/Validate/FlightInfoStep.tsx`
  - `src/components/rnr/__tests__/Text.router.test.tsx`

**Interfaces:**
- Produces:
  - `fontFamilyFor(className: string | undefined): string`.
  - `SANS_FAMILIES`, `SERIAL_FAMILIES`.
  - `useAppFonts(): boolean`.

- [ ] **Step 1: Install the fonts.** Run `npx expo install @expo-google-fonts/geist @expo-google-fonts/geist-mono expo-font`. Check `git diff --stat`: only `package.json` and the lockfile should have changed.

- [ ] **Step 2: Write the failing test** `src/utils/__tests__/fontFamily.test.ts`:

```ts
import { fontFamilyFor } from "../fontFamily";

describe("fontFamilyFor", () => {
  it("defaults to Geist Regular", () => {
    expect(fontFamilyFor(undefined)).toBe("Geist_400Regular");
    expect(fontFamilyFor("text-base text-foreground")).toBe("Geist_400Regular");
  });
  it("maps each weight class to its static family", () => {
    expect(fontFamilyFor("font-medium")).toBe("Geist_500Medium");
    expect(fontFamilyFor("text-sm font-semibold")).toBe("Geist_600SemiBold");
    expect(fontFamilyFor("font-bold")).toBe("Geist_700Bold");
    expect(fontFamilyFor("font-extrabold")).toBe("Geist_800ExtraBold");
    expect(fontFamilyFor("font-black")).toBe("Geist_800ExtraBold");
    expect(fontFamilyFor("font-light")).toBe("Geist_400Regular");
  });
  it("lets the last weight win, as tailwind-merge leaves it", () => {
    expect(fontFamilyFor("font-bold font-medium")).toBe("Geist_500Medium");
  });
  it("uses Geist Mono for serials, at the same weight", () => {
    expect(fontFamilyFor("font-serial")).toBe("GeistMono_400Regular");
    expect(fontFamilyFor("font-serial text-[15px] font-semibold")).toBe("GeistMono_600SemiBold");
  });
  it("ignores state-prefixed weights", () => {
    expect(fontFamilyFor("font-medium active:font-bold")).toBe("Geist_500Medium");
  });
});
```

- [ ] **Step 3: Run it to verify it fails** (`npx jest src/utils/__tests__/fontFamily.test.ts`).

- [ ] **Step 4: Implement** `src/utils/fontFamily.ts`:

```ts
export const SANS_FAMILIES = {
  400: "Geist_400Regular",
  500: "Geist_500Medium",
  600: "Geist_600SemiBold",
  700: "Geist_700Bold",
  800: "Geist_800ExtraBold",
} as const;

export const SERIAL_FAMILIES = {
  400: "GeistMono_400Regular",
  500: "GeistMono_500Medium",
  600: "GeistMono_600SemiBold",
  700: "GeistMono_700Bold",
  800: "GeistMono_800ExtraBold",
} as const;

type Weight = keyof typeof SANS_FAMILIES;

const WEIGHTS: Record<string, Weight> = {
  "font-thin": 400,
  "font-extralight": 400,
  "font-light": 400,
  "font-normal": 400,
  "font-medium": 500,
  "font-semibold": 600,
  "font-bold": 700,
  "font-extrabold": 800,
  "font-black": 800,
};

/** React Native cannot pick a weight inside a custom family, so each weight is its own static font. */
export function fontFamilyFor(className: string | undefined): string {
  let weight: Weight = 400;
  let serial = false;
  for (const token of (className ?? "").split(/\s+/)) {
    if (token.includes(":")) continue;
    if (token in WEIGHTS) weight = WEIGHTS[token];
    else if (token === "font-serial") serial = true;
  }
  return (serial ? SERIAL_FAMILIES : SANS_FAMILIES)[weight];
}
```

- [ ] **Step 5: Run it to verify it passes.**

- [ ] **Step 6: Load the fonts before the app renders.**
  - **`src/hooks/useAppFonts.ts`:**

```ts
import {
  Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, Geist_800ExtraBold,
} from "@expo-google-fonts/geist";
import {
  GeistMono_400Regular, GeistMono_500Medium, GeistMono_600SemiBold, GeistMono_700Bold, GeistMono_800ExtraBold,
} from "@expo-google-fonts/geist-mono";
import { useFonts } from "expo-font";

/** True once Geist is ready, or once it has failed — a failure falls back to the system font rather than hanging the splash. */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, Geist_800ExtraBold,
    GeistMono_400Regular, GeistMono_500Medium, GeistMono_600SemiBold, GeistMono_700Bold, GeistMono_800ExtraBold,
  });
  return loaded || error != null;
}
```

  - **`src/app/_layout.tsx`:**
    - Inside `Layout`, add `const fontsReady = useAppFonts();` after the `useEffect`.
    - Render `{fontsReady ? <RootNavigator /> : null}` in place of `<RootNavigator />`.
    - Pass `fontsReady={fontsReady}` to `SplashScreenController`.
  - **`SplashScreenController.tsx`:** accept `{ fontsReady }: { fontsReady: boolean }`, and pass `isBusy={isLoading || !fontsReady}` to `AnimatedSplash`.

- [ ] **Step 7: Apply the families.**
  - **`src/components/rnr/text.tsx`:**
    - Destructure `style` out of `props` in `Text`.
    - Compute the class string once: `const merged = cn(textVariants({ variant }), textClass, tone && TONE_CLASSES[tone], disabled && 'opacity-50', className);`. Pass `className={merged}`.
    - Add `style={[{ fontFamily: fontFamilyFor(merged), fontWeight: 'normal' }, style]}`. Setting `fontWeight` to `normal` stops Android adding a fake bold on top of a bold face.
  - **The other six files.** Each renders React Native's own `Text` or `TextInput`:
    - `rnr/input.tsx`
    - `rnr/textarea.tsx`
    - `PageHeader.tsx`
    - `RefundConfirmSheet.tsx`
    - `SearchTraveller.tsx`
    - `FlightInfoStep.tsx`

    Add `{ fontFamily: fontFamilyFor(<that element's className>), fontWeight: 'normal' }` as the first entry of its `style`. If the element has no `style`, add one.
  - **`tailwind.config.js`:**
    - Set `serial` to `"GeistMono_400Regular"`, replacing the `platformSelect` call.
    - Add `sans: "Geist_400Regular"`.
    - Remove the `platformSelect` import if nothing else uses it.
- [ ] **Step 8: Add a render case** to `src/components/rnr/__tests__/Text.router.test.tsx`:

```tsx
it("sets a bold label in Geist Bold without a synthetic weight", () => {
  render(<Text className="font-bold">Heavy</Text>);
  const style = StyleSheet.flatten(screen.getByText("Heavy").props.style);
  expect(style.fontFamily).toBe("Geist_700Bold");
  expect(style.fontWeight).toBe("normal");
});
```

  Import `StyleSheet` from `react-native` if the file doesn't already. Run it red against a stashed copy of `text.tsx` (rename the file rather than using `git stash`), then green.

- [ ] **Step 9: Run the gates.**

```bash
npx jest 2>&1 | grep -E "^(Test Suites|Tests):"
npm run typecheck 2>&1 | grep -c "error TS"    # 1
npx eslint src/utils/fontFamily.ts src/hooks/useAppFonts.ts src/components/rnr/text.tsx src/components/rnr/input.tsx src/components/rnr/textarea.tsx src/components/PageHeader.tsx src/features/SplashScreenController.tsx src/app/_layout.tsx
```

  If a render suite now fails because `expo-font` or `@expo-google-fonts/*` cannot load under jest, add `jest.mock("@/hooks/useAppFonts", () => ({ useAppFonts: () => true }))` to that suite only. Report each suite where you did.

- [ ] **Step 10: Commit.** Check the branch and status, then stage exactly the files above plus `package.json` and the lockfile:

```bash
git commit -q -F - <<'EOF'
feat(theme): set the app in Geist

Text uses apps/web's Geist, loaded as static weights before the splash
lifts, so a weight class maps to its own face instead of a synthetic
bold. Serial numbers use Geist Mono. A failed load falls back to the
system font rather than holding the splash.

Co-Authored-By: <your model> <noreply@anthropic.com>
EOF
```

---

### Task 9: Gates, manual pass, push and PRs (controller)

- [ ] **Step 1: Run the web-app gates in the worktree**, with no dev server running:
  - `pnpm --filter ssr test:unit`, `type-check`, `lint` and `build`;
  - `pnpm --filter web type-check` and `build`.

  Compare against the Task 0 baselines.
- [ ] **Step 2: Run the super-app gates:** `npx jest` and `npm run typecheck`. `git log --oneline feat/ssr-visual-parity..HEAD` should show Tasks 7–8.
- [ ] **Step 3: Manual pass.**
  - **ssr on dev**, with Playwright at 375, 768 and 1440 px, signed in as `tur-a25y29041` and signed out:
    1. Every island slot and its active marker.
    2. A signed-out Tags tap, which goes to login and comes back.
    3. The Scan overlay, using the fake camera with both flags and a Y4M file of a tag QR.
    4. A camera-style open (signed out, no cookie) of `/tag/<slug>`, both with no locale and with `/en`, and of `/en/validate?qrValue=…`.
    5. No island on `/validate`.
    6. The Profile hub, the moved pages, the FAQ and the chat button.
    7. The last tag row, the pagination and Log out, all above the island.
    8. Explore's pill.
  - **super-app on CPadNFC through Metro:** Geist on Home, Tags and Profile, and the white page. Settle 2 s before each screenshot.
- [ ] **Step 4: Push and open the PRs.**
  - **web-app:** run `git push`, then open a PR with base `feat/ssr-visual-parity` in `unirefund-web`, using the repo's PR template. There is no Jira link unless the user asks.
  - **super-app:** run `git push -u origin feat/ssr-visual-parity-tokens`, then open a PR with base `feat/ssr-visual-parity` in `unirefund-mobile`.
  - Keep vulnerability detail out of the PR bodies.
