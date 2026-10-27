# Printer Profiles Across Tabs, and Tests for the Print Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two follow-ups from the status PR (#347) review:
- Two browser tabs can no longer overwrite each other's saved label printers.
- The dialog's pre-run flow gets automated tests: a unit test in CI, plus a Playwright e2e spec in the repo's existing suite.

**Architecture:**
- **Reads:** the dialog reads saved printers from `localStorage` through `useSyncExternalStore`. It subscribes to the `storage` event, which fires in other tabs, and to a same-tab emitter, so both tabs always show the stored list.
- **Writes:** every change is an updater `(current) => next`. It is applied to a list freshly read from storage, then saved and emitted. So a tab never writes back a stale copy.
- **Pre-run logic:** the dialog's "check → learn → decide" logic moves into a pure `preRunStep` with unit tests.
- **E2E spec:** a Playwright spec under `apps/web/tests/unirefund/` fakes the Print Helper with `page.route`, so it needs no helper and no printer. It drives the real dialog.

**Tech Stack:** Next.js 16 / React 19 (`apps/web`), Node test runner (`test:unit`), Playwright 1.56 (`pnpm --filter web test`, projects `local`/`dev`/`uat` with `tests/core/auth/auth.setup.ts`).

**Spec:** `docs/superpowers/specs/2026-10-14-printer-discovery-design.md` §3 (saved printers, Print anyway, pre-run check). Follow-ups to `2026-10-26-printer-status-web.md`.

## Global Constraints

- **Base:** stack on `origin/feat/printer-status` (#347, open). The branch is `feat/printer-store-and-tests`, in worktree `C:\unirefund\web-app-wt-printer-followup`, created with **`--no-track`**. Push only with an explicit refspec. The PR base is `feat/printer-status`, which GitHub retargets to `main` when #347 merges.
- **Behaviour:** behaviour is unchanged apart from cross-tab correctness. Every existing unit test still passes.
- **Storage:** key `unirefund.printerProfiles.v1`.
  - Read it with `loadProfiles` (which validates every profile) and write it with `saveProfiles`.
  - When `localStorage` is unavailable, fall back to an empty list, the same as today.
  - A failed save still toasts `ProfilesNotSaved`.
- **React compiler lint:**
  - no `useEffect`;
  - no set-state in effects;
  - no ref reads during render.

  `useSyncExternalStore` is the sanctioned way to read an external store.
- **Snapshot stability:** `getSnapshot` must return the same reference while the stored string is unchanged. Cache the parsed list by the raw string; otherwise React loops.
- **Conventions:** a `data-testid` on every interactive element, sparse comments, and all text through TagService keys. This plan adds no new text.
- **Gates:**
  - `test:unit` 0 fail;
  - tsc 0;
  - eslint 0 errors;
  - `i18n:missing` NEEDS_KEY 0;
  - `i18n:unused` stays at baseline.

  The e2e spec must pass with `--project=local` against the dev server.
- **Commits:** one per task, via a quoted heredoc, with the Co-Authored-By trailer. Never push.

## Review Focus

1. **A printer deleted in tab A stays deleted** after tab B learns status, records a moved address, or saves a position. Pinned in Task 1, `an update in one tab keeps another tab's delete`, and in the Task 3 e2e.
2. **A printer added in tab A** appears in tab B's picker without a reload. Pinned in Task 3.
3. **A browser with storage disabled:** the dialog still opens with no saved printers and Browser print works. Pinned in Task 1, `no storage gives an empty list`.
4. **The snapshot does not re-render-loop:** the same string gives the same array. Pinned in Task 1, `the snapshot is stable while storage is unchanged`.
5. **The learn-before-decide order:** a first-ever `ready` prints and learns. A first-ever `no-reply` prints, not asks. Pinned in Task 2.

---

### Task 0: Worktree and baseline
- [ ] `git -C C:/unirefund/web-app fetch origin && git -C C:/unirefund/web-app worktree add ../web-app-wt-printer-followup -b feat/printer-store-and-tests --no-track origin/feat/printer-status`
- [ ] Then:
  - `git submodule update --init`;
  - copy `apps/web/.env`;
  - `pnpm install`;
  - `pnpm --filter web run init`.

  Record the `test:unit`, `tsc` and `i18n:unused` baselines.

### Task 1: One stored printer list for every tab

Paths are under `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/`.

**Files:**
- Create:
  - `zpl/profile-store.ts`
  - `zpl/profile-store.test.ts`
- Modify:
  - `print-sticker-lines.tsx`
  - `manage-printers-sheet.tsx`

**Interfaces:**
- **Produces (`zpl/profile-store.ts`):**
  - `type ProfileUpdate = (current: PrinterProfile[]) => PrinterProfile[]`.
  - `function updateStoredProfiles(storage: ProfileStorage | null, update: ProfileUpdate): { profiles: PrinterProfile[]; saved: boolean }`. It reads `loadProfiles(storage)` fresh, applies `update`, saves with `saveProfiles`, notifies same-tab subscribers, and returns the result. If `update` returns the same array, it saves nothing and returns `saved: true`.
  - `function subscribeProfiles(onChange: () => void): () => void`. It subscribes to `window` `storage` events for the key, plus the same-tab emitter.
  - `function profilesSnapshot(storage: ProfileStorage | null): PrinterProfile[]`. This is the parsed list, cached by the raw stored string.
- **Changes:**
  - `manage-printers-sheet.tsx`: `onProfilesChange(list)` becomes `onProfilesUpdate(update: ProfileUpdate)`. Each call site passes the operation, not a list built from its prop:
    - `(c) => withPosition(c, tested)`;
    - `(c) => [...c, profile]`;
    - save edit: `(c) => c.map(p => p.id === draft.id ? saved : p)`, or append when new;
    - delete: `(c) => c.filter(p => p.id !== id)`.
  - `print-sticker-lines.tsx`:
    - `profiles` comes from `useSyncExternalStore(subscribeProfiles, () => profilesSnapshot(browserStorage()), () => EMPTY)`;
    - `profilesRef`, `showProfiles` and the `setProfiles` state go away;
    - `storeProfiles` becomes `updateProfiles(update)`, which calls `updateStoredProfiles` and toasts `ProfilesNotSaved` when `saved` is false;
    - `handleMoved` and the status learning pass updaters (`withMovedAddress`, `withStatusSupported`);
    - the existing selection fallback (the selected printer was deleted → Browser print) still works.

- [ ] **Step 1: Write the failing tests** in `zpl/profile-store.test.ts`. Use a fake `ProfileStorage` shared by two "tabs":
  - `applies an update to the stored list, not a stale copy`: tab A deletes p2, then tab B runs `withStatusSupported(…, "p1")`. Storage holds p1 (learned) and not p2.
  - `an update in one tab keeps another tab's delete`.
  - `an add in one tab survives another tab's moved-address update`.
  - `returning the same array saves nothing`.
  - `a failed save reports saved: false`, using storage whose `setItem` throws.
  - `no storage gives an empty list`.
  - `the snapshot is stable while storage is unchanged`: the same reference twice, and a new reference after a write.
  - `notifies same-tab subscribers on update`.
- [ ] **Step 2:** The new tests fail.
- [ ] **Step 3:** Implement `profile-store.ts`, then switch the sheet and the dialog to updaters.
- [ ] **Step 4:** All gates pass. Existing tests are unchanged and pass.
- [ ] **Step 5:** Commit `fix(stickers): keep saved printers in step across browser tabs`.

### Task 2: The pre-run step as a tested function

**Files:**
- Modify:
  - `zpl/pre-run.ts`
  - `zpl/pre-run.test.ts`
  - `print-sticker-lines.tsx`

**Interfaces:**
- **Produces:** `function preRunStep(statusSupported: boolean | undefined, status: PrinterStatus | null): { decision: PreRunDecision; learn: boolean }`.
  - `learn` is true for `ready` and `problem`.
  - `decision` is `preRunDecision(status, statusSupported === true)`, using the value **before** learning.
- `checkThenRun` uses it. When `learn` is true, it calls `updateProfiles((c) => withStatusSupported(c, profile.id))`.

- [ ] **Step 1: Write the failing tests:**
  - `a first ready prints and learns`;
  - `a first problem blocks and learns`;
  - `a first no-reply prints and does not learn`;
  - `a learned no-reply asks`;
  - `busy and unsupported print and do not learn`;
  - `a failed status call prints and does not learn`.
- [ ] **Step 2:** The tests fail.
- [ ] **Step 3:** Implement, and use it in `checkThenRun`.
- [ ] **Step 4:** All gates pass.
- [ ] **Step 5:** Commit `refactor(stickers): make the pre-run step a tested function`.

### Task 3: Playwright e2e for the print flow

**Files:**
- Create: `apps/web/tests/unirefund/stickers/printer-status.spec.ts`
- Read first:
  - `apps/web/playwright.config.ts` (projects; `storageState` from `tests/core/auth/auth.setup.ts`; env `TEST_LOCAL_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `TEST_TENANT`);
  - `apps/web/tests/_support/*` (`appReady`, helpers);
  - one existing spec for conventions.

**Rules:**
- **Book:** the spec opens a sticker book page. Use `TEST_STICKER_BOOK_ID`, falling back to `dd76f22b-5520-13bb-54eb-3a237377b232`, the Faroe Islands QA book.
- **Fake helper:** route `http://127.0.0.1:9180/**` with `page.route`. Answer OPTIONS with 204 and the CORS headers (`Access-Control-Allow-Origin` = the page origin, `-Allow-Headers: content-type`, `-Allow-Methods`, `-Allow-Private-Network: true`).
  - `/status` → `{ name, version: "1.3.0", apiVersion: 2, features: ["search","usb","status"] }`.
  - `/printers/search` → a found USB Argox.
  - `/printers/*/status` → per test.
  - `/print` is recorded and answers `{ ok: true, bytes, ms: 1, address: null }`, or a test-chosen error.
- **Seeding:** seed saved printers in `localStorage` (`unirefund.printerProfiles.v1`) before the dialog opens.
- **Device Hub:** dismiss the "Device not registered" dialog with **Skip** if it appears.

**Tests:**
- `a reported problem blocks the run and Print anyway sends it`: head-open shows "The print head is open.", no `/print`; Print anyway gives exactly one `/print`.
- `a learned printer that does not answer asks`: "Couldn't read the printer's state…" with Print anyway.
- `a ready printer prints and learns status support`: one `/print`; the stored profile has `statusSupported: true`.
- `an older helper is not asked for status`: features without `"status"` give zero status requests and one `/print`.
- `retry from here is checked`: the first `/print` answers 502; with status `paper-out`, Retry blocks with no `/print`.
- `a printer deleted in one tab stays deleted when the other tab learns`. Use two pages in one context, both on the book:
  - page A deletes printer 2 via Manage printers;
  - page B prints to printer 1 with status `ready` (learning);
  - storage holds printer 1 (learned) and no printer 2;
  - page B's picker no longer lists printer 2.

- [ ] **Step 1:** Write the spec.
- [ ] **Step 2:** Run `pnpm --filter web test -- tests/unirefund/stickers/printer-status.spec.ts --project=local` with `TEST_LOCAL_URL=http://localhost:3000` against the dev server from this worktree. All tests pass.
  - The controller starts the dev server and provides `ADMIN_USERNAME=admin`, `ADMIN_PASSWORD=1q2w3E*` and `TEST_TENANT="Faroe Islands"` if the env file lacks them.
  - Report the exact command and output.
- [ ] **Step 3:** Commit `test(stickers): e2e for the printer status check and cross-tab printers`.
