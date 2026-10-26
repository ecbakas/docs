# Printer Status Before a Run (web, phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before a sticker run on a found printer, the dialog asks the Print Helper for the printer's state.
- **A problem** (out of labels, head open, paused, ribbon out) is shown in plain words, and nothing is sent.
- **A printer that has answered status before but is silent now** gets "Couldn't read the printer's state…" with **Print anyway**.
- **Everything else** prints as today.

**Architecture:**
- **Helper client:** gains `readPrinterStatus`.
- **Pure decision:** `preRunDecision` in `zpl/` (testable) turns a status into print, block or ask.
- **Learned support:** the found target remembers `statusSupported`. It is set from the search at setup (Zebras that answered `~HI`), and learned true after the first `ready` or `problem` answer, which covers the Argox.
- **Dialog:** `print-sticker-lines.tsx` runs the check in `handlePrint`, only when `helperSupports(helper, "status")`.

**Tech Stack:** Next.js 16 / React 19 (`apps/web`), Node test runner for `.ts`. No new packages.

**Spec:** `docs/superpowers/specs/2026-10-14-printer-discovery-design.md`:
- §3.6, While printing;
- §6, the status endpoint and the 2026-10-26 amendment;
- §9, messages.

The helper side is `2026-10-26-printer-status-helper.md` (1.3.0).

## Global Constraints

- **Base:** web `main` after PR #346 merges. Work on branch `feat/printer-status`, created with `--no-track` in worktree `C:\unirefund\web-app-wt-printer-status`. Then run submodules init, copy `.env`, `pnpm install` and `pnpm --filter web run init`.
- **Helper contract:**
  - `GET /printers/{encodeURIComponent(id)}/status[?lastAddress=host:port]` returns one of:
    - `{state:"ready"}`;
    - `{state:"problem", problems:[…]}`;
    - `{state:"unknown", reason:"no-reply"|"busy"|"unsupported"}`.
  - Errors use the same JSON as `/print`.
  - Feature `"status"` is listed in `/status`.
- **Which targets get a check:** only found targets (`kind: "found"`), and only when the helper lists `"status"`.
  - Network and queue targets keep printing exactly as before.
  - Test labels and alignment tests are not checked, because the admin is standing at the printer.
- **Decision rules** (`preRunDecision(status, statusSupported)`):
  - `ready` gives `print`.
  - `problem` gives `block` with the problems.
  - `unknown/no-reply` gives `ask` when `statusSupported`, and `print` otherwise.
  - `unknown/busy` and `unknown/unsupported` give `print`.
  - Any helper error or timeout on the status call gives `print`; the run then surfaces the real error.
  - The client timeout is 3 s.
- **Learning:** a `ready` or `problem` answer sets `statusSupported: true` on that profile's found target and saves it. Do it once, not on every run.
- **Text** (spec §9). Keys go in both `en.json` and `tr.json`:
  - `Status.PaperOut`: "The printer is out of labels." / "Yazıcıda etiket kalmadı."
  - `Status.HeadOpen`: "The print head is open." / "Yazıcı kafası açık."
  - `Status.Paused`: "The printer is paused." / "Yazıcı duraklatıldı."
  - `Status.RibbonOut`: "The ribbon has run out." / "Ribon bitti."
  - `Status.CouldNotRead`: "Couldn't read the printer's state. Check it has labels and the head is closed." / "Yazıcının durumu okunamadı. Etiket olduğunu ve kafanın kapalı olduğunu kontrol edin."
  - `Status.PrintAnyway`: "Print anyway" / "Yine de yazdır"

  All keys are under `StickerHeader.PrintLabels.`.
- **Conventions:**
  - `data-testid` on every interactive element;
  - no `useEffect`, and no ref reads during render;
  - comments sparse.
- **Gates:**
  - `test:unit` 0 fail;
  - tsc 0;
  - eslint 0 errors;
  - `i18n:missing` NEEDS_KEY 0;
  - `i18n:unused` at baseline;
  - run `pnpm --filter web run init` after editing en/tr.
- **Commits:** quoted heredoc with the Co-Authored-By trailer. Never push (the controller does it, with an explicit refspec).

## Review Focus

1. **A printer with the head open:** the run is blocked with "The print head is open." and **no** `/print` request goes out. Pinned in Task 1 (`preRunDecision`) and checked live in Task 3.
2. **A helper older than 1.3.0, or none:** no status request is made and printing is unchanged. Pinned in Task 1 (`shouldCheckStatus`).
3. **A status call that hangs:** the run starts after at most 3 s; the dialog doesn't freeze. Pinned in Task 1 (`readPrinterStatus` timeout test).
4. **Two problems at once** (paper out and paused): both lines are shown, in the order the helper sends them. Pinned in Task 1.
5. **A profile saved by #342/#346** (no `statusSupported`): it parses unchanged and is treated as not yet known. Pinned in Task 1.

---

### Task 0: Worktree and baseline
- [ ] Confirm `origin/main` contains the #346 merge. If it doesn't, stop and report.
- [ ] Run `git -C C:/unirefund/web-app worktree add ../web-app-wt-printer-status -b feat/printer-status --no-track origin/main`.
- [ ] Run submodules init, copy `.env`, then install, init and record the baselines.

### Task 1: Status in the client and the model

Paths are under `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/`.

**Files:**
- Modify:
  - `transports/helper-client.ts`
  - `zpl/profile.ts`
  - `zpl/found-printer.ts`
- Create:
  - `zpl/pre-run.ts`
  - `zpl/pre-run.test.ts`
- Test:
  - `transports/helper-search.test.ts`
  - `zpl/profile.test.ts`
  - `zpl/found-printer.test.ts`

**Interfaces:**
- **Produces:**
  - `HelperFeature` gains `"status"`.
  - `type PrinterStatus = { state: "ready" } | { state: "problem"; problems: PrinterProblem[] } | { state: "unknown"; reason: "no-reply" | "busy" | "unsupported" }`.
  - `type PrinterProblem = "paper-out" | "paused" | "head-open" | "ribbon-out"`.
  - `readPrinterStatus(fetchFn, target: Extract<PrinterTarget, {kind:"found"}>, timeoutMs = 3000): Promise<PrinterStatus | null>`. `null` means an error or timeout.
  - The found target gains an optional `statusSupported?: boolean`. `parseTarget` keeps only a boolean.
  - `profileFromFound` sets `statusSupported` from `found.statusSupported`. It is always present on `FoundPrinter`, so parse it in `parseFoundPrinter` (default false).
  - `withStatusSupported(profiles, id): PrinterProfile[]` returns the same array when the profile already has it.
  - In `zpl/pre-run.ts`:
    - `shouldCheckStatus(target, helper): boolean`;
    - `preRunDecision(status: PrinterStatus | null, statusSupported: boolean): { kind: "print" } | { kind: "block"; problems: PrinterProblem[] } | { kind: "ask" }`;
    - `problemKey(problem): <TagService key>` (typed like `printErrorKey`).
- **Rules:**
  - `readPrinterStatus` builds `/printers/${encodeURIComponent(id)}/status`, adding `?lastAddress=host:port` when the target has one.
  - Unknown `problems` entries are dropped. A `problem` state with none left becomes `ready`.

- [ ] **Step 1: Write the failing tests:**
  - **parsing:** `reads each status shape`; `drops unknown problems`;
  - **requests:** `encodes a port-bound usb id`; `sends the last address`;
  - **failures:** `a status call that hangs gives null within the timeout`; `an error gives null`;
  - **`preRunDecision`:** the full rule table above, plus `two problems keep their order`;
  - **`shouldCheckStatus`:** false without the feature and for network/queue targets;
  - **profile:** `keeps statusSupported`; `a #346 profile without it parses unchanged`;
  - **learning:** `withStatusSupported sets it once`;
  - **setup:** `profileFromFound carries statusSupported`.
- [ ] **Step 2:** Run the tests and watch them fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** All gates pass.
- [ ] **Step 5:** Commit `feat(stickers): read a printer's status before a run`.

### Task 2: The check in the dialog

**Files:**
- Modify:
  - `print-sticker-lines.tsx`
  - en.json and tr.json (6 keys, listed above)

**Interfaces:**
- **Consumes:** Task 1.
- **Behaviour:**
  - **The check:** in `handlePrint`, when `shouldCheckStatus`, await `readPrinterStatus`, then act on `preRunDecision`:
    - **block:** show the problem line(s) where run errors show, and send nothing;
    - **ask:** show `CouldNotRead` with a **Print anyway** button (`data-testid="print-sticker-lines-print-anyway"`), which starts the run without checking again;
    - **print:** run as today.
  - **Learning:** on `ready` or `problem`, apply `withStatusSupported` and save, through the same save path `handleMoved` uses.
  - **While waiting:** the Print button shows its existing pending state while the check runs.
- [ ] **Step 1:** Add the 6 keys and run init.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** All gates pass, with the 6 keys used.
- [ ] **Step 4:** Commit `feat(stickers): stop a run when the printer reports a problem`.

### Task 3: Walkthrough (controller)

This uses helper 1.3.0, the office Argox on USB and on the network, and the dev server on this worktree.
- [ ] **Ready, network:** with the Argox ready, a book run to its network profile checks the status (`ready`) and prints (routed `/print`). The profile learns `statusSupported: true`.
- [ ] **Head open, both connections:** with the head open, a run to the USB profile shows "The print head is open." and **no** `/print` request is made. The same goes for the network profile.
- [ ] **Head closed:** after closing the head, the run goes through.
- [ ] **Silent printer (simulated):** route `/status` to `unknown/no-reply` for a learned profile. "Couldn't read…" and **Print anyway** appear, and Print anyway prints.
- [ ] **Older helper:** with features `["search","usb"]`, no status request is made.
- [ ] **Finish:** push with an explicit refspec, open the PR, and check its commit list.
