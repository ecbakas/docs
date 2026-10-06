# ssr visual parity, sub-project 4b (the notifications sheet): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ssr's header bell opens the app's notifications sheet instead of Novu's stock popover. The sheet is a page-width bottom sheet with the app's rows, summary line, Load more, and skeleton, empty and error states. The badge shows the server's unread total.

**Architecture:**
- One `NotificationsProvider` inside the shell's `ShellProvider` wraps Novu's own `NovuProvider` (hooks flavour), keyed by subscriber, and disconnects the socket on unmount.
- It owns the feed (`useNotifications`), the unread count (`useCounts`), the sheet's open state and the sheet itself. The bell only reads `{ available, unreadCount, open }` from it.
- Pure rules (relative time, summary, badge label, unread-at-open) are node-tested `.ts` modules in `apps/ssr/src/utils/notifications/`.

**Tech stack:** Next.js 16 (App Router, webpack), Tailwind v4, `@novu/nextjs` 3 hooks (re-exported through `@repo/ui`), `@repo/ayasofyazilim-ui` (Drawer, Button, Skeleton), `node:test` via `tsx`.

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-10-06-ssr-visual-parity-explore-notifications-sign-in-design.md`, Section 2.

**Where the work happens:**
- **Worktree:** `C:\unirefund\web-app-wt-visual-parity-profile`.
- **Branch:** `feat/ssr-visual-parity-notifications`, cut from `feat/ssr-visual-parity-explore` at `2fc1edca2` (the head of #316).
- **PR:** targets `feat/ssr-visual-parity-explore`.

`S/` means `apps/ssr/src/`.

**Plan decisions.** These argue from the spec, and the executor treats each as a ruling.

1. **The hooks reach ssr through `@repo/ui`.** `@novu/nextjs` is a dependency of `packages/ui` only. A new `packages/ui/src/notification-hooks/index.tsx` re-exports `NovuProvider`, `useNotifications`, `useCounts` and `useNovu` from `@novu/nextjs/hooks`. The package's `"./*"` export makes that `@repo/ui/notification-hooks`. ssr's `package.json` and the lockfile do not change; adding a dependency bumped an unrelated package in 4a. `packages/ui` is not a submodule.
2. **Relative times use `Intl.RelativeTimeFormat`.** The app writes "{n} " plus a suffix ("1 minutes ago"). `Intl` gives correct singular and plural forms in en and tr ("1 minute ago", "5 dakika önce"). The app's buckets are kept: under 60 s, under 1 h, under 1 day, under 7 days, then a short localized date. So is its "Just now" string, so `RelativeTime.{MinutesAgo,HoursAgo,DaysAgo}` are not ported.
3. **The summary line has singular and plural keys:** "1 notification" against "5 notifications". The app prints "{n} notification" for every n.
4. **NEW survives the open.** Opening the sheet calls `readAll()`, as in the app. The provider first records which loaded notifications were unread. Those rows keep their unread tint and NEW pill while the sheet stays open, so the traveller can still see what was new. Closing refetches, as in the app.
5. **The socket is closed per account.** `NovuProvider` is keyed by the subscriber id, and an inner component calls `novu.socket.disconnect()` on unmount. Changing `subscriber` alone would leave the previous account's socket streaming, which the app hit as ERT-36 (memory `superapp-novu-shared-inbox`).
6. **The badge counts the server's unread total** with `useCounts({ filters: [{ read: false }] })`. It is hidden at 0 and shows "99+" above 99, as today. The app counts only the loaded page.
7. **The close button's label is `Header.Back`**, like 3a's and 3b's sheets. A sheet-wide "Close" wording is a separate follow-up.

## Global Constraints

- **QR contract.** `/tag/<slug>` and `/{lang}/validate?qrValue=…` are untouched.
- **Where the bell shows:** in `PageHeader`'s right slot, signed in, when the Novu config is present (`NOVU_APP_IDENTIFIER`, `NOVU_APP_URL`, `NOVU_SOCKET_URL` and the session's `sub`, via the existing `notificationConfig`). Signed out, the "Sign in" button stays. No grant gates Novu.
- **The sheet:** a page-width `Drawer`, `70vh` tall. Every `DrawerContent` gets `className="mx-auto w-full max-w-3xl md:border-x"` (user rule, 2026-10-02).
- **Copied from the app** (`super-app/src/screens/shared/Notifications/`):
  - **Header:** `flex items-center justify-between px-4 pt-4 pb-3`, title `text-xl font-bold text-foreground`, close `size-9 rounded-full bg-foreground/5`.
  - **Summary:** `mb-4 pb-3 border-b border-border`, `text-sm font-semibold text-muted-foreground`.
  - **Unread row:** `bg-info-surface border-2 border-info/40` plus a `h-1 bg-info` bar.
  - **Read row:** `bg-card border border-border`. Every row is `mb-4 rounded-md overflow-hidden`.
  - **Row tile:** `size-14 rounded-md bg-info` with a bell in `text-primary-foreground`.
  - **NEW pill:** `ml-2 px-2 py-0.5 bg-info rounded-full text-xs font-bold text-primary-foreground`.
  - **Body:** clamped to two lines, with "Show more" / "Show less" (`text-xs text-info font-semibold`) past 100 characters.
  - **Time:** `time-outline` and the label, `text-xs font-medium text-muted-foreground`.
  - **Load more:** `mt-4 py-4 px-6 bg-info rounded-md`, label `text-primary-foreground font-bold`, with `arrow-down-circle-outline`.
  - **Empty state:** a `size-24 rounded-md bg-foreground/5` tile with `notifications-off-outline`, title `text-xl font-bold`, description `text-base text-muted-foreground text-center`.
- **Behaviour, as in the app:** opening marks all read; closing refetches and collapses the expanded row; tapping a row only expands or collapses it; redirect links are not followed.
- **Class translation:**
  - `text-muted` and `text-placeholder` become `text-muted-foreground`.
  - `bg-info`, `bg-info-surface`, `border-info/40`, `text-info`, `bg-card`, `border-border`, `bg-foreground/5` and `text-primary-foreground` copy verbatim.
- **Icons** are the shell's generated Ionicons (`S/components/shell/ionicons.tsx`).
- **ssr strings.**
  - New `SSRService` strings go in both `S/language-data/unirefund/SSRService/resources/en.json` and `tr.json`. Keys are flat, and placeholders are `{0}`.
  - There must be no duplicate keys.
  - Run `pnpm --filter ssr run init` afterwards. Never commit `*.gen.json`.
- **ssr lint** enforces React Compiler rules such as `react-hooks/set-state-in-effect` as **errors**. Never add an eslint-disable for them. Set state in event handlers and callbacks, not synchronously in effects (memory `ssr-react-compiler-lint-errors`).
- **ssr test ids.** Every `Link`, `Button`, `Input`, `Label`, `*Trigger`, `DrawerClose`, `<form>`, `<input>`, `<a>` and native `<button>` carries a `data-testid`.
- **ssr tests.** `test:unit` runs `node --import tsx --test "src/**/*.test.ts"`: Node's runner, `.ts` only, no JSX. Test files import their module with a **relative** path.
- **Shared checkouts and processes.**
  - Never run `git reset --hard`, `git stash`, `git checkout --`, `git add -A` or `git add .`. Stage files by name.
  - Implementers never push. Never commit `.env` or submodule pointers. Do not change `packages/utils` or `packages/ayasofyazilim-ui` (submodules).
  - **The user's dev server runs on :3001 from `C:\unirefund\web-app-wt-visual-parity`. Never touch it.** Only stop `node.exe` processes whose command line contains `web-app-wt-visual-parity-profile`.
  - Never `next build` while a dev server runs on this checkout.
- **Comments** are rare and short: one line, only where the reason is not obvious.

## Review Focus

1. **A notification stamped slightly in the future** (server clock ahead of the browser). It reads "Just now", not a negative time. Pinned by: Task 1's `relativeTimeBucket` cases.
2. **A malformed `createdAt`.** The row shows no "Invalid Date". Pinned by: Task 1's `relativeTimeBucket` and `formatRelativeTime` cases.
3. **Exactly one notification, or one unread.** The summary is singular ("1 notification • 1 unread"). Pinned by: Task 1's `notificationSummary` cases.
4. **Unread total of 0, or above 99.** No badge at 0, "99+" above 99. Pinned by: Task 1's `badgeLabel` cases.
5. **Opening the sheet marks everything read.** Rows that were unread at open keep their NEW highlight while the sheet stays open. Pinned by: Task 1's `unreadIdsAtOpen` cases.

---

## File structure

| Path | Change |
| --- | --- |
| `S/utils/notifications/relative-time.ts` + `.test.ts` | new: `relativeTimeBucket`, `formatRelativeTime` |
| `S/utils/notifications/summary.ts` + `.test.ts` | new: `notificationSummary`, `badgeLabel`, `canExpandBody`, `unreadIdsAtOpen` |
| `packages/ui/src/notification-hooks/index.tsx` | new: re-exports Novu's hooks |
| `apps/ssr/scripts/gen-ionicons.mjs`, `S/components/shell/ionicons.tsx` | 3 more icons |
| en/tr, `apps/ssr/.env.example` | strings; `NOVU_SOCKET_URL` |
| `S/components/notifications/notification-row.tsx`, `notifications-skeleton.tsx`, `notifications-sheet.tsx` | new |
| `S/components/notifications/notifications-provider.tsx` | new: Novu provider, feed, count, sheet, socket teardown |
| `S/components/shell/shell-context.tsx` | wraps children in `NotificationsProvider` |
| `S/components/shell/header-bell.tsx` | a button that opens the sheet |
| `S/components/shell/page-header.tsx` | renders `<HeaderBell />` signed in |

## Strings

**New `SSRService` keys**, all added in Task 2. Values come from super-app's `en-US.json` / `tr-TR.json`. Keys marked *web* have no app counterpart, or differ for the reasons in decisions 2 and 3.

| Key | en | tr |
| --- | --- | --- |
| `Notifications.Title` | Notifications | Bildirimler |
| `Notifications.Loading` | Loading notifications | Bildirimler yükleniyor |
| `Notifications.Empty` | No Notifications | Bildirim Yok |
| `Notifications.EmptyDescription` | You don't have any notifications yet. You'll see new notifications here. | Henüz hiç bildiriminiz bulunmuyor. Yeni bildirimleri burada göreceksiniz. |
| `Notifications.DefaultSubject` | Notification | Bildirim |
| `Notifications.New` | NEW | YENİ |
| `Notifications.ShowMore` | Show more | Devamı |
| `Notifications.ShowLess` | Show less | Daha az |
| `Notifications.Count.One` (*web*) | {0} notification | {0} bildirim |
| `Notifications.Count.Other` (*web*) | {0} notifications | {0} bildirim |
| `Notifications.Unread` (*web*) | {0} unread | {0} okunmamış |
| `Notifications.LoadMore` | Load More | Daha Fazla Yükle |
| `Notifications.JustNow` | Just now | Az önce |
| `Notifications.LoadFailed` (*web*) | Couldn't load notifications. | Bildirimler yüklenemedi. |
| `Notifications.Retry` (*web*) | Try again | Tekrar dene |

**Reused unchanged:** `Header.Notifications` (the bell's label) and `Header.Back` (the close button).

---

### Task 0: Setup (controller)

- [ ] **Step 1: Check the worktree.**
  - In `C:\unirefund\web-app-wt-visual-parity-profile`, `git status --short` must be clean, apart from untracked `.env`, `*.gen.json` and the git-ignored `apps/ssr/public/maplibre/`.
  - The branch is `feat/ssr-visual-parity-explore` at `2fc1edca2`.
  - No `node.exe` may have `web-app-wt-visual-parity-profile` in its command line.
- [ ] **Step 2: Branch.** Run `git switch -c feat/ssr-visual-parity-notifications`.
- [ ] **Step 3: Measure the baselines and ledger them.**
  - `test:unit`: expect 371 pass.
  - ssr `type-check`: expect 0.
  - ssr `lint`: expect 0 errors and 459 warnings.
  - web `type-check`: expect 0.

---

### Task 1: Pure notification rules (web-app)

**Files:**
- Create:
  - `S/utils/notifications/relative-time.ts` and `relative-time.test.ts`
  - `S/utils/notifications/summary.ts` and `summary.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `relative-time.ts`:
    - `type RelativeTimeBucket = { kind: "justNow" } | { kind: "relative"; value: number; unit: "minute" | "hour" | "day" } | { kind: "date" } | { kind: "invalid" }`;
    - `relativeTimeBucket(createdAt: string, now: number): RelativeTimeBucket`;
    - `formatRelativeTime(createdAt: string, now: number, lang: string, justNowLabel: string): string`.
  - `summary.ts`:
    - `notificationSummary(count: number, unread: number, labels: { one: string; other: string; unread: string }): string`;
    - `badgeLabel(count: number): string`;
    - `canExpandBody(body: string | null | undefined): boolean`;
    - `unreadIdsAtOpen(notifications: { id: string; isRead: boolean }[] | undefined): ReadonlySet<string>`.

- [ ] **Step 1: Write the failing tests.**

`S/utils/notifications/relative-time.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatRelativeTime, relativeTimeBucket } from "./relative-time";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe("relativeTimeBucket", () => {
  it("calls anything under a minute just now", () => {
    assert.deepEqual(relativeTimeBucket(ago(0), NOW), { kind: "justNow" });
    assert.deepEqual(relativeTimeBucket(ago(59), NOW), { kind: "justNow" });
  });
  it("calls a timestamp from the near future just now", () => {
    assert.deepEqual(relativeTimeBucket(ago(-30), NOW), { kind: "justNow" });
  });
  it("counts minutes, hours and days at the app's boundaries", () => {
    assert.deepEqual(relativeTimeBucket(ago(60), NOW), { kind: "relative", value: 1, unit: "minute" });
    assert.deepEqual(relativeTimeBucket(ago(3599), NOW), { kind: "relative", value: 59, unit: "minute" });
    assert.deepEqual(relativeTimeBucket(ago(3600), NOW), { kind: "relative", value: 1, unit: "hour" });
    assert.deepEqual(relativeTimeBucket(ago(86399), NOW), { kind: "relative", value: 23, unit: "hour" });
    assert.deepEqual(relativeTimeBucket(ago(86400), NOW), { kind: "relative", value: 1, unit: "day" });
    assert.deepEqual(relativeTimeBucket(ago(604799), NOW), { kind: "relative", value: 6, unit: "day" });
  });
  it("falls back to a date from a week on", () => {
    assert.deepEqual(relativeTimeBucket(ago(604800), NOW), { kind: "date" });
  });
  it("flags a malformed timestamp", () => {
    assert.deepEqual(relativeTimeBucket("not a date", NOW), { kind: "invalid" });
  });
});

describe("formatRelativeTime", () => {
  it("uses the given just-now label", () => {
    assert.equal(formatRelativeTime(ago(5), NOW, "en", "Just now"), "Just now");
  });
  it("pluralises in English and Turkish", () => {
    assert.equal(formatRelativeTime(ago(60), NOW, "en", "Just now"), "1 minute ago");
    assert.equal(formatRelativeTime(ago(300), NOW, "en", "Just now"), "5 minutes ago");
    assert.equal(formatRelativeTime(ago(300), NOW, "tr", "Az önce"), "5 dakika önce");
    assert.equal(formatRelativeTime(ago(7200), NOW, "en", "Just now"), "2 hours ago");
    assert.equal(formatRelativeTime(ago(172800), NOW, "en", "Just now"), "2 days ago");
  });
  it("gives a non-empty date for older items", () => {
    const label = formatRelativeTime(ago(30 * 86400), NOW, "en", "Just now");
    assert.ok(label.length > 0);
    assert.ok(!label.includes("ago"));
  });
  it("gives an empty label for a malformed timestamp", () => {
    assert.equal(formatRelativeTime("not a date", NOW, "en", "Just now"), "");
  });
});
```

`S/utils/notifications/summary.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { badgeLabel, canExpandBody, notificationSummary, unreadIdsAtOpen } from "./summary";

const labels = { one: "{0} notification", other: "{0} notifications", unread: "{0} unread" };

describe("notificationSummary", () => {
  it("is singular for one", () => {
    assert.equal(notificationSummary(1, 1, labels), "1 notification • 1 unread");
  });
  it("is plural for many and drops the unread part at zero", () => {
    assert.equal(notificationSummary(5, 0, labels), "5 notifications");
    assert.equal(notificationSummary(5, 2, labels), "5 notifications • 2 unread");
  });
});

describe("badgeLabel", () => {
  it("is empty at zero", () => {
    assert.equal(badgeLabel(0), "");
  });
  it("shows the count up to 99", () => {
    assert.equal(badgeLabel(7), "7");
    assert.equal(badgeLabel(99), "99");
  });
  it("caps at 99+", () => {
    assert.equal(badgeLabel(100), "99+");
  });
});

describe("canExpandBody", () => {
  it("expands only past 100 characters", () => {
    assert.equal(canExpandBody("a".repeat(100)), false);
    assert.equal(canExpandBody("a".repeat(101)), true);
    assert.equal(canExpandBody(null), false);
  });
});

describe("unreadIdsAtOpen", () => {
  it("records the unread ids", () => {
    assert.deepEqual(
      [...unreadIdsAtOpen([{ id: "a", isRead: false }, { id: "b", isRead: true }, { id: "c", isRead: false }])],
      ["a", "c"]
    );
  });
  it("is empty before the feed loads", () => {
    assert.equal(unreadIdsAtOpen(undefined).size, 0);
  });
});
```

- [ ] **Step 2: Run the tests and see them fail.**

Run: `pnpm --filter ssr test:unit`
Expected: FAIL, because the two modules cannot be resolved.

- [ ] **Step 3: Write the modules.**

`S/utils/notifications/relative-time.ts`:

```ts
export type RelativeTimeBucket =
  | { kind: "justNow" }
  | { kind: "relative"; value: number; unit: "minute" | "hour" | "day" }
  | { kind: "date" }
  | { kind: "invalid" };

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const WEEK = 604800;

export function relativeTimeBucket(createdAt: string, now: number): RelativeTimeBucket {
  const time = Date.parse(createdAt);
  if (Number.isNaN(time)) return { kind: "invalid" };
  // A server clock slightly ahead of the browser would otherwise read as negative.
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < MINUTE) return { kind: "justNow" };
  if (seconds < HOUR) return { kind: "relative", value: Math.floor(seconds / MINUTE), unit: "minute" };
  if (seconds < DAY) return { kind: "relative", value: Math.floor(seconds / HOUR), unit: "hour" };
  if (seconds < WEEK) return { kind: "relative", value: Math.floor(seconds / DAY), unit: "day" };
  return { kind: "date" };
}

export function formatRelativeTime(
  createdAt: string,
  now: number,
  lang: string,
  justNowLabel: string
): string {
  const bucket = relativeTimeBucket(createdAt, now);
  switch (bucket.kind) {
    case "invalid":
      return "";
    case "justNow":
      return justNowLabel;
    case "relative":
      return new Intl.RelativeTimeFormat(lang, { numeric: "always" }).format(
        -bucket.value,
        bucket.unit
      );
    case "date":
      return new Date(createdAt).toLocaleDateString(lang, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
  }
}
```

`S/utils/notifications/summary.ts`:

```ts
const fill = (template: string, value: number) => template.replace("{0}", String(value));

export function notificationSummary(
  count: number,
  unread: number,
  labels: { one: string; other: string; unread: string }
): string {
  const total = fill(count === 1 ? labels.one : labels.other, count);
  return unread > 0 ? `${total} • ${fill(labels.unread, unread)}` : total;
}

export function badgeLabel(count: number): string {
  if (count <= 0) return "";
  return count > 99 ? "99+" : String(count);
}

const EXPAND_THRESHOLD = 100;

export function canExpandBody(body: string | null | undefined): boolean {
  return (body?.length ?? 0) > EXPAND_THRESHOLD;
}

export function unreadIdsAtOpen(
  notifications: { id: string; isRead: boolean }[] | undefined
): ReadonlySet<string> {
  return new Set((notifications ?? []).filter((n) => !n.isRead).map((n) => n.id));
}
```

- [ ] **Step 4: Run the tests and see them pass.**

Run: `pnpm --filter ssr test:unit`
Expected: PASS, 371 plus the new cases (17), with no failures.

If an `Intl` string differs in this Node's ICU (for example a narrow no-break space), report the exact output rather than loosening the test (memory `intl-locale-server-browser-traps`).

Also run `pnpm --filter ssr type-check` (0) and `pnpm --filter ssr lint` (0 errors).

- [ ] **Step 5: Commit.**

```bash
git add apps/ssr/src/utils/notifications/relative-time.ts apps/ssr/src/utils/notifications/relative-time.test.ts apps/ssr/src/utils/notifications/summary.ts apps/ssr/src/utils/notifications/summary.test.ts
git commit -m "feat(ssr): add the notification sheet's time, summary and badge rules"
```

---

### Task 2: The hooks re-export, icons, strings and env example (web-app)

**Files:**
- Create: `packages/ui/src/notification-hooks/index.tsx`.
- Modify: `apps/ssr/scripts/gen-ionicons.mjs`, then regenerate `S/components/shell/ionicons.tsx`.
- Modify: en/tr and `apps/ssr/.env.example`.

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `@repo/ui/notification-hooks`, exporting `NovuProvider`, `useNotifications`, `useCounts` and `useNovu`.
  - Icons `IoTimeOutline`, `IoNotificationsOffOutline`, `IoArrowDownCircleOutline`.
  - Every key in the **Strings** table.

- [ ] **Step 1: The re-export.** Create `packages/ui/src/notification-hooks/index.tsx`:

```tsx
"use client";
export {
  NovuProvider,
  useCounts,
  useNotifications,
  useNovu,
} from "@novu/nextjs/hooks";
```

  Check it resolves from ssr. Create a throwaway file `apps/ssr/src/__novu-check.ts` containing `import { useNotifications } from "@repo/ui/notification-hooks"; export const ok = typeof useNotifications;`. Run `pnpm --filter ssr type-check`, then delete the file and record the result.

- [ ] **Step 2: Icons.**
  - Append these to `NAMES` in `apps/ssr/scripts/gen-ionicons.mjs`: `"time-outline"`, `"notifications-off-outline"`, `"arrow-down-circle-outline"`.
  - Run `node apps/ssr/scripts/gen-ionicons.mjs`.
  - `grep -c "^export function Io" apps/ssr/src/components/shell/ionicons.tsx` must print `67`.
- [ ] **Step 3: Strings and env example.**
  - Add every key in the **Strings** table to en and tr, after the last existing `Header.*` key, with the values exactly as written. Edit with the Edit tool; never re-serialise the JSON.
  - Run `pnpm --filter ssr run init`.
  - The key-parity check must print `ok`:

```bash
node -e "const r='./apps/ssr/src/language-data/unirefund/SSRService/resources/';const en=require(r+'en.json'),tr=require(r+'tr.json');const a=Object.keys(en);console.log(a.length===Object.keys(tr).length&&a.every(k=>k in tr)?'ok':'mismatch')"
```

  - The duplicate check must print nothing:

```bash
for f in en tr; do grep -o '^  "[^"]*":' apps/ssr/src/language-data/unirefund/SSRService/resources/$f.json | sort | uniq -d; done
```

  - Both files go from 861 keys to 876.
  - In `apps/ssr/.env.example`, add a commented `# NOVU_SOCKET_URL=` line next to the existing `NOVU_*` lines, matching their style.
- [ ] **Step 4: Gates.**
  - `pnpm --filter ssr type-check` gives 0, and `pnpm --filter ssr lint` gives 0 errors.
  - `pnpm --filter web type-check` gives 0, since `packages/ui` changed.
- [ ] **Step 5: Commit.**

```bash
git add packages/ui/src/notification-hooks/index.tsx apps/ssr/scripts/gen-ionicons.mjs apps/ssr/src/components/shell/ionicons.tsx apps/ssr/src/language-data/unirefund/SSRService/resources/en.json apps/ssr/src/language-data/unirefund/SSRService/resources/tr.json apps/ssr/.env.example
git commit -m "feat(ssr): expose Novu's hooks and add the notification sheet's icons and strings"
```

---

### Task 3: The row, the skeleton and the sheet (web-app)

These are standalone; Task 4 wires them in.

**Files:**
- Create in `S/components/notifications/`: `notification-row.tsx`, `notifications-skeleton.tsx`, `notifications-sheet.tsx`.

**Interfaces:**
- Consumes:
  - Task 1: `formatRelativeTime`, `notificationSummary`, `canExpandBody`.
  - Task 2: `IoNotifications` (existing), `IoTimeOutline`, `IoChevronUp`/`IoChevronDown` (existing), `IoNotificationsOffOutline`, `IoArrowDownCircleOutline`, `IoClose` (existing); the strings.
- Produces:
  - `NotificationRow({ id, subject, body, timeLabel, unread, expanded, onToggle })`.
  - `NotificationsSkeleton()`.
  - `NotificationsSheet({ open, onOpenChange, feed, unreadAtOpen, now })`, where `feed` has the shape of `ReturnType<typeof useNotifications>` and `now` is the epoch milliseconds the sheet was opened at.

- [ ] **Step 1: The row.** Create `S/components/notifications/notification-row.tsx`:

```tsx
"use client";
import {
  IoChevronDown,
  IoChevronUp,
  IoNotifications,
  IoTimeOutline,
} from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { canExpandBody } from "@/src/utils/notifications/summary";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";

export function NotificationRow({
  id,
  subject,
  body,
  timeLabel,
  unread,
  expanded,
  onToggle,
}: {
  id: string;
  subject: string;
  body: string | null | undefined;
  timeLabel: string;
  unread: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const expandable = canExpandBody(body);
  return (
    <button
      aria-expanded={expandable ? expanded : undefined}
      className={cn(
        "mb-4 block w-full overflow-hidden rounded-md text-left",
        unread ? "border-2 border-info/40 bg-info-surface" : "border border-border bg-card"
      )}
      data-testid={`notification-row-${id}`}
      onClick={onToggle}
      type="button"
    >
      <div className="flex items-start p-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-info text-primary-foreground">
          <IoNotifications size={26} />
        </span>
        <div className="ml-4 min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between">
            <p
              className={cn(
                "flex-1 text-base leading-5 text-foreground",
                unread ? "font-bold" : "font-semibold"
              )}
            >
              {subject}
            </p>
            {unread ? (
              <span className="ml-2 rounded-full bg-info px-2 py-0.5 text-xs font-bold text-primary-foreground">
                {copy["Notifications.New"]}
              </span>
            ) : null}
          </div>
          {body ? (
            <p
              className={cn(
                "text-sm leading-5 text-muted-foreground",
                expanded ? "mb-3" : "mb-2 line-clamp-2"
              )}
            >
              {body}
            </p>
          ) : null}
          <div className="flex items-center justify-between">
            <span className="flex items-center text-xs font-medium text-muted-foreground">
              <IoTimeOutline size={14} />
              <span className="ml-1">{timeLabel}</span>
            </span>
            {expandable ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-info">
                {expanded ? copy["Notifications.ShowLess"] : copy["Notifications.ShowMore"]}
                {expanded ? <IoChevronUp size={14} /> : <IoChevronDown size={14} />}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {unread ? <span className="block h-1 bg-info" /> : null}
    </button>
  );
}
```

- [ ] **Step 2: The skeleton.** Create `S/components/notifications/notifications-skeleton.tsx`, using the UI kit's `Skeleton` (`@repo/ayasofyazilim-ui/components/skeleton`):

```tsx
import { useTranslations } from "@/src/providers/i18n";
import { Skeleton } from "@repo/ayasofyazilim-ui/components/skeleton";

export function NotificationsSkeleton() {
  const { t } = useTranslations();
  return (
    <div
      aria-busy="true"
      aria-label={t.SSRService["Notifications.Loading"]}
      className="pb-6"
      data-testid="notifications-skeleton"
      role="status"
    >
      <div className="mb-4 border-b border-border pb-3">
        <Skeleton className="h-3.5 w-36" />
      </div>
      {[0, 1, 2, 3].map((card) => (
        <div className="mb-4 rounded-md border border-border p-4" key={card}>
          <div className="flex items-start gap-4">
            <Skeleton className="size-14 rounded-md" />
            <div className="flex-1">
              <Skeleton className="h-5 w-40" />
              <div className="mt-1 space-y-1">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-2/3" />
              </div>
              <div className="mt-2 flex items-center gap-1">
                <Skeleton className="size-3.5 rounded-full" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

  `useTranslations` is a client hook. If the file needs `"use client"` to compile, add it.

- [ ] **Step 3: The sheet.** Create `S/components/notifications/notifications-sheet.tsx`. It renders whatever feed it is given; the provider owns the data and the open state.

```tsx
"use client";
import {
  IoArrowDownCircleOutline,
  IoClose,
  IoNotificationsOffOutline,
} from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { formatRelativeTime } from "@/src/utils/notifications/relative-time";
import { notificationSummary } from "@/src/utils/notifications/summary";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from "@repo/ayasofyazilim-ui/components/drawer";
import type { useNotifications } from "@repo/ui/notification-hooks";
import { LoaderCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { NotificationRow } from "./notification-row";
import { NotificationsSkeleton } from "./notifications-skeleton";

type Feed = ReturnType<typeof useNotifications>;

export function NotificationsSheet({
  open,
  onOpenChange,
  feed,
  unreadAtOpen,
  now,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feed: Feed;
  unreadAtOpen: ReadonlySet<string>;
  now: number;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const { lang } = useParams<{ lang: string }>();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const notifications = feed.notifications ?? [];
  const isEmpty = notifications.length === 0;
  const unreadCount = notifications.filter(
    (item) => !item.isRead || unreadAtOpen.has(item.id)
  ).length;

  function handleOpenChange(next: boolean) {
    if (!next) setExpandedId(null);
    onOpenChange(next);
  }

  return (
    <Drawer onOpenChange={handleOpenChange} open={open}>
      <DrawerContent
        aria-describedby={undefined}
        className="mx-auto h-[70vh] w-full max-w-3xl md:border-x"
        data-testid="notifications-sheet"
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <DrawerTitle className="text-xl font-bold text-foreground">
            {copy["Notifications.Title"]}
          </DrawerTitle>
          <DrawerClose
            aria-label={copy["Header.Back"]}
            className="flex size-9 items-center justify-center rounded-full bg-foreground/5 text-foreground"
            data-testid="notifications-close"
          >
            <IoClose size={20} />
          </DrawerClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {feed.isLoading && isEmpty ? (
            <NotificationsSkeleton />
          ) : feed.error && isEmpty ? (
            <div className="flex flex-col items-center gap-3 py-10" data-testid="notifications-error">
              <p className="text-center text-muted-foreground">
                {copy["Notifications.LoadFailed"]}
              </p>
              <Button className="w-40" data-testid="notifications-retry" onClick={() => void feed.refetch()}>
                {copy["Notifications.Retry"]}
              </Button>
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center px-8 py-10 text-center" data-testid="notifications-empty">
              <span className="mb-5 flex size-24 items-center justify-center rounded-md bg-foreground/5 text-muted-foreground">
                <IoNotificationsOffOutline size={44} />
              </span>
              <p className="mb-2 text-xl font-bold text-foreground">{copy["Notifications.Empty"]}</p>
              <p className="text-base leading-6 text-muted-foreground">
                {copy["Notifications.EmptyDescription"]}
              </p>
            </div>
          ) : (
            <>
              <p className="mb-4 border-b border-border pb-3 text-sm font-semibold text-muted-foreground">
                {notificationSummary(notifications.length, unreadCount, {
                  one: copy["Notifications.Count.One"],
                  other: copy["Notifications.Count.Other"],
                  unread: copy["Notifications.Unread"],
                })}
              </p>
              {notifications.map((item) => (
                <NotificationRow
                  body={item.body}
                  expanded={expandedId === item.id}
                  id={item.id}
                  key={item.id}
                  onToggle={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                  subject={item.subject || copy["Notifications.DefaultSubject"]}
                  timeLabel={formatRelativeTime(item.createdAt, now, lang ?? "en", copy["Notifications.JustNow"])}
                  unread={!item.isRead || unreadAtOpen.has(item.id)}
                />
              ))}
              {feed.hasMore ? (
                <button
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-info px-6 py-4 text-base font-bold text-primary-foreground disabled:opacity-70"
                  data-testid="notifications-load-more"
                  disabled={feed.isFetching}
                  onClick={() => void feed.fetchMore()}
                  type="button"
                >
                  {feed.isFetching ? (
                    <LoaderCircle className="size-5 animate-spin" />
                  ) : (
                    <>
                      {copy["Notifications.LoadMore"]}
                      <IoArrowDownCircleOutline size={20} />
                    </>
                  )}
                </button>
              ) : null}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

  `now` comes from the provider, which reads `Date.now()` in its open handler. Calling it during render would break React's purity rule, and the time labels only need to be right as of the moment the sheet opened.

- [ ] **Step 4: Gates.** `pnpm --filter ssr test:unit` passes, `pnpm --filter ssr type-check` gives 0, and `pnpm --filter ssr lint` gives 0 errors.
- [ ] **Step 5: Commit.**

```bash
git add apps/ssr/src/components/notifications/notification-row.tsx apps/ssr/src/components/notifications/notifications-skeleton.tsx apps/ssr/src/components/notifications/notifications-sheet.tsx
git commit -m "feat(ssr): add the app's notification rows and sheet"
```

---

### Task 4: The provider, the bell and the shell wiring (web-app)

**Files:**
- Create: `S/components/notifications/notifications-provider.tsx`.
- Modify: `S/components/shell/shell-context.tsx`, `S/components/shell/header-bell.tsx`, `S/components/shell/page-header.tsx`.

**Interfaces:**
- Consumes:
  - Task 1: `badgeLabel`, `unreadIdsAtOpen`.
  - Task 2: `@repo/ui/notification-hooks`.
  - Task 3: `NotificationsSheet`.
  - Existing: `NotificationConfig` (`shell-context.tsx`), `IoNotifications`.
- Produces:
  - `NotificationsProvider({ config, children })`.
  - `useNotificationsInbox(): { available: boolean; unreadCount: number; open: () => void }`.
  - `HeaderBell()`, with no props.

- [ ] **Step 1: The provider.** Create `S/components/notifications/notifications-provider.tsx`:

```tsx
"use client";
import type { NotificationConfig } from "@/src/components/shell/shell-context";
import { unreadIdsAtOpen } from "@/src/utils/notifications/summary";
import {
  NovuProvider,
  useCounts,
  useNotifications,
  useNovu,
} from "@repo/ui/notification-hooks";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { NotificationsSheet } from "./notifications-sheet";

type Inbox = { available: boolean; unreadCount: number; open: () => void };

const InboxContext = createContext<Inbox>({
  available: false,
  unreadCount: 0,
  open: () => undefined,
});

export const useNotificationsInbox = () => useContext(InboxContext);

function NovuInbox({ children }: { children: ReactNode }) {
  const novu = useNovu();
  const feed = useNotifications();
  const { counts } = useCounts({ filters: [{ read: false }] });
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(0);
  const [unreadAtOpen, setUnreadAtOpen] = useState<ReadonlySet<string>>(() => new Set());

  // A re-keyed provider must not leave the previous account's socket streaming.
  useEffect(
    () => () => {
      void Promise.resolve(novu.socket.disconnect()).catch(() => undefined);
    },
    [novu]
  );

  function openSheet() {
    setUnreadAtOpen(unreadIdsAtOpen(feed.notifications));
    setOpenedAt(Date.now());
    setOpen(true);
    void feed.readAll();
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      openSheet();
      return;
    }
    setOpen(false);
    void feed.refetch();
  }

  return (
    <InboxContext.Provider
      value={{ available: true, unreadCount: counts?.[0]?.count ?? 0, open: openSheet }}
    >
      {children}
      <NotificationsSheet
        feed={feed}
        now={openedAt}
        onOpenChange={handleOpenChange}
        open={open}
        unreadAtOpen={unreadAtOpen}
      />
    </InboxContext.Provider>
  );
}

export function NotificationsProvider({
  config,
  children,
}: {
  config: NotificationConfig | null;
  children: ReactNode;
}) {
  if (!config) return <>{children}</>;
  return (
    <NovuProvider
      apiUrl={config.appUrl}
      applicationIdentifier={config.appId}
      key={config.subscriberId}
      socketUrl={config.socketUrl}
      subscriber={config.subscriberId}
    >
      <NovuInbox>{children}</NovuInbox>
    </NovuProvider>
  );
}
```

  If `NovuProvider`'s types reject `apiUrl`, use the deprecated `backendUrl`, as the old popover did, and say so in the report. If `socket.disconnect` is not on the instance's type, report NEEDS_CONTEXT rather than casting it away.

- [ ] **Step 2: The shell mounts it.** In `S/components/shell/shell-context.tsx`, import `NotificationsProvider` and wrap the children inside `ShellProvider`. The scan overlay stays outside it:

```tsx
<ShellContext.Provider value={shell}>
  <NotificationsProvider config={value.notification}>{children}</NotificationsProvider>
  <ScanOverlay onClose={closeScan} open={scanOpen} />
</ShellContext.Provider>
```

  `shell-context.tsx` is imported by `notifications-provider.tsx` for a type only, so the import is type-only and there is no runtime cycle. Keep it `import type`.

- [ ] **Step 3: The bell.** Replace `S/components/shell/header-bell.tsx` with:

```tsx
"use client";
import { useNotificationsInbox } from "@/src/components/notifications/notifications-provider";
import { useTranslations } from "@/src/providers/i18n";
import { badgeLabel } from "@/src/utils/notifications/summary";
import { IoNotifications } from "./ionicons";

export function HeaderBell() {
  const { t } = useTranslations();
  const { available, unreadCount, open } = useNotificationsInbox();
  if (!available) return null;
  const badge = badgeLabel(unreadCount);
  return (
    <button
      aria-label={t.SSRService["Header.Notifications"]}
      className="relative inline-flex size-10 items-center justify-center text-foreground"
      data-testid="notification-bell"
      onClick={open}
      type="button"
    >
      <IoNotifications size={24} />
      {badge ? (
        <span className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
```

- [ ] **Step 4: The header.** In `S/components/shell/page-header.tsx`, replace `notification && <HeaderBell config={notification} />` with `<HeaderBell />`. Remove `notification` from the `useShell()` destructuring if nothing else in the file reads it. The bell hides itself when Novu is not configured.
- [ ] **Step 5: Check nothing else uses the popover.** `grep -rn "NotificationPopover\|@repo/ui/notification\"" apps/ssr/src` must print nothing. `@repo/ui/notification` stays in the package for `apps/web`.
- [ ] **Step 6: Gates.**
  - `pnpm --filter ssr test:unit` passes, and `pnpm --filter ssr type-check` gives 0.
  - `pnpm --filter ssr lint` gives 0 errors with no eslint-disable added, and `pnpm --filter web type-check` gives 0.
- [ ] **Step 7: Smoke check.** This needs `NOVU_SOCKET_URL` in the local `apps/ssr/.env`, which is untracked and never committed.
  - If the key is missing, report that instead of inventing a value; the controller supplies it.
  - With it present, start the dev server detached on PORT 3005: `Start-Process cmd.exe '/c','set PORT=3005&& pnpm run dev > <log> 2>&1' -WorkingDirectory …\apps\ssr -WindowStyle Hidden`.
  - Sign in as `tur-a25y29041` / `1q2w3E*` and open `/en/profile`. The bell shows; tapping it opens the sheet.
  - Opening marks the test traveller's feed read, which the spec accepts.
  - Close the sheet.
  - Stop ONLY the `node.exe` processes whose command line contains `web-app-wt-visual-parity-profile`. Never touch :3001.
- [ ] **Step 8: Commit.**

```bash
git add apps/ssr/src/components/notifications/notifications-provider.tsx apps/ssr/src/components/shell/shell-context.tsx apps/ssr/src/components/shell/header-bell.tsx apps/ssr/src/components/shell/page-header.tsx
git commit -m "feat(ssr): open the app's notifications sheet from the header bell"
```

---

### Task 5: Gates, manual pass, push and PR (controller)

- [ ] **Step 1: Local env.**
  - Make sure the local `apps/ssr/.env` has `NOVU_SOCKET_URL`. It is untracked; never commit it.
  - The value is the socket host in super-app's `src/providers/NotificationsProvider.tsx` (`NOVU_SOCKET_URL`), for the same Novu application as `NOVU_APP_IDENTIFIER`.
- [ ] **Step 2: Gates on the branch head.**
  - Run `test:unit`, ssr `type-check`, ssr `lint` and `pnpm --filter web type-check`.
  - With no dev server up on this checkout, run `pnpm --filter ssr build` and `pnpm --filter web build`. Clear `apps/ssr/.next/cache` first if the build hits a `WasmHash` crash (memory `ssr-explore-maplibre-traps`).
- [ ] **Step 3: Manual pass** on this worktree's production build (`next start`, PORT 3005, detached), at 375 px and 1280 px, signed in as `tur-a25y29041`. Use a browser no other device is signed into as that traveller. Cover:
  - **The bell:** it shows, with its badge (or none).
  - **The sheet:** it opens at 70vh, page width, over the island. The header and close button are present.
  - **The feed:**
    - the summary line;
    - rows: unread rows keep NEW while the sheet is open, and long bodies show "Show more";
    - Load more, if the feed has more.
  - **Closing:** close, then reopen. The rows read as read.
  - **Turkish:** `/tr/profile`, where relative times read "… önce".
  - **Signed out:** the "Sign in" button shows and there is no bell.
  - **Console:** no errors after a reload taken without a screenshot.

  Record anything unverified: for example the empty or error states, if the account has notifications and Novu answers.
- [ ] **Step 4: Stop this worktree's server.** Stop only the `node.exe` processes whose command line contains `web-app-wt-visual-parity-profile`.
- [ ] **Step 5: Push and open the PR.**
  - Run `git push -u origin feat/ssr-visual-parity-notifications`.
  - Open a PR into `feat/ssr-visual-parity-explore` with the repo template, and say it is stacked on #316.
  - In the PR body:
    - note that `NOVU_SOCKET_URL` must be set in each environment for the bell to appear (the code already required it);
    - note the plural and singular improvements over the app;
    - list the unverified items.
  - End the body with the attribution line.
