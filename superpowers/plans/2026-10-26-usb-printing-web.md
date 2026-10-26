# USB Printers in the Printer Sheet (web, phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With Print Helper 1.2.0, a label printer plugged in by USB appears in **Manage printers** as a card reading "… · USB cable". It sets up exactly like a network printer and prints by its `usb:` id, with plain messages when it is unplugged or busy.

**Architecture:**
- **Parsing:** the helper client accepts `connection: "usb"` search results; until now they were dropped.
- **Storage:** the stored found target records its `connection`, as spec §3.2 lists it. That lets the dialog say "Check the USB cable" instead of "isn't on the network".
- **UI:** the cards, the searching line, the edit form's "Found automatically" line and the error messages each gain a USB variant. Setup, the guided test, Check position and the moved-address logic are unchanged; a USB printer never moves.

**Tech Stack:** Next.js 16 / React 19 (`apps/web`), the Node test runner for `.ts` units. No new packages.

**Spec:** `docs/superpowers/specs/2026-10-14-printer-discovery-design.md`:
- §3.1 card text "Zebra ZT231 · 300 dpi · USB cable";
- §3.2 the found target `{ kind: "found", printerId, connection, lastAddress? }`;
- §6 the `usb` feature and `printer-busy`;
- §9 messages.

The helper side is `2026-10-26-usb-printing-helper.md` (1.2.0).

## Global Constraints

- **Base:** `main` after web PR #342 merges. Branch `feat/usb-printers` in the worktree `C:\unirefund\web-app-wt-usb-printers`. After `git worktree add`, run `git submodule update --init` and copy `apps/web/.env` from another worktree before `pnpm install`.
- **No backend work.** The helper contract is:
  - search results may carry `connection: "usb"`, with `address: null` and an optional `windowsPrinter`;
  - `POST /print` by `printerId` (no `lastAddress` for USB);
  - error codes `printer-unreachable` (502) and `printer-busy` (409).
- **Gating:** USB copy shows only when `helperSupports(helper, "usb")`. Everything else is driven by what the search returned.
- **Older data:** profiles saved before this change have no `connection` on their found target. They must parse unchanged and are treated as `"network"`.
- **Conventions:**
  - every interactive element gets a `data-testid`;
  - no `useEffect`, and no ref reads during render;
  - all text through `TagService` keys in BOTH `en.json` and `tr.json`;
  - comments sparse.
- **Gates after every task:**
  - `pnpm --filter web run test:unit` → 0 fail;
  - `npx tsc --noEmit -p .` in `apps/web` → 0;
  - eslint on the changed files → 0 errors;
  - after editing en/tr: `pnpm --filter web run init`, then `pnpm -w run i18n:missing` → `NEEDS_KEY 0` and `i18n:unused` at its baseline.
- **Commits:** one per task, message via a quoted heredoc, ending with the Co-Authored-By trailer.

## Review Focus

1. **A USB printer saved before it was unplugged.** Printing gives "The printer isn't connected. Check the USB cable.", not the network message. Pinned in Task 1: `unreachable means the cable for a usb printer`.
2. **A profile saved by #342** (found target without `connection`) parses and prints as before. Pinned in Task 1: `keeps a found target saved without a connection`.
3. **A helper older than 1.2.0** never shows USB copy. Pinned in Task 2 (walkthrough), and by `helperSupports` tests already in the suite.
4. **Two identical Zebras on USB** get distinct names in the picker: the second gets " (USB)". Pinned in Task 1: `names a second usb printer of the same model apart`.
5. **The same Argox on both network and USB** shows two cards, "Network · 192.168.1.19" and "USB cable", each addable on its own. Checked live in Task 3.

---

### Task 0: Worktree and baseline

- [ ] Confirm that `origin/main` contains the PR #342 merge. If it doesn't, stop and report.
- [ ] Create the worktree with `git -C C:/unirefund/web-app worktree add ../web-app-wt-usb-printers -b feat/usb-printers origin/main`.
- [ ] In the worktree, run `git submodule update --init`, copy the `.env`, then `pnpm install` and `pnpm --filter web run init`.
- [ ] Record the `test:unit`, `tsc` and `i18n:unused` baselines.

### Task 1: USB in the model and the client

Paths below are under `apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/`.

**Files:**
- Modify:
  - `transports/helper-client.ts`
  - `transports/print-error.ts`
  - `zpl/profile.ts`
  - `zpl/found-printer.ts`
- Test:
  - `transports/helper-search.test.ts`
  - `zpl/profile.test.ts`
  - `zpl/found-printer.test.ts`

**Interfaces:**
- **Produces:**
  - `FoundPrinter.connection: "network" | "windows" | "usb"`.
  - `PrinterTarget`'s found variant becomes `{ kind: "found"; printerId: string; connection?: "network" | "usb"; lastAddress: PrinterAddress | null }`.
  - `PrintErrorCode` gains `"printer-busy"`.
  - `export function isUsbTarget(target: PrinterTarget | undefined): boolean` lives in `zpl/profile.ts`.
- **Rules:**
  - `parseFoundPrinter` accepts `"usb"` when `address` is absent or null. A USB entry carrying an address is dropped. `windowsPrinter` is optional for USB.
  - `parseTarget` keeps `connection` only when it is `"network"` or `"usb"`. It drops any other value but keeps the target.
  - `profileFromFound` sets `connection` from the found printer's connection for network and USB printers. Windows printers stay `queue` targets, as now.
  - For USB, `lastAddress` is `null`.
  - `distinctPrinterName` appends ` (USB)` for a USB printer whose name is taken.
  - `HELPER_ERROR_CODES` includes `printer-busy`, and the status fallback maps 409 → `printer-busy`.
  - `isUsbTarget` is true only for `{ kind: "found", connection: "usb" }`.

- [ ] **Step 1: Write the failing tests.**
  - **Search parsing:**
    - `keeps a usb printer from the search`: the entry `{ id: "usb:1664:0D10:80384F461093", connection: "usb", address: null, maker: "Argox", model: "O4-250 PPLZ", labelPrinter: true }` parses.
    - `drops a usb printer that carries an address`.
    - `maps 409 to printer-busy`, both by code and by status.
  - **Profile:**
    - `keeps a found target saved without a connection`: the #342 shape round-trips.
    - `keeps the connection of a found target`.
    - `drops an unknown connection but keeps the target`.
    - `unreachable means the cable for a usb printer`: `isUsbTarget` is true for a USB found target, and false for network, queue and an old found target.
  - **Found printer:**
    - `sets up a usb printer with no address`: its target is `{ kind: "found", printerId, connection: "usb", lastAddress: null }`.
    - `names a second usb printer of the same model apart`: the second gets "Zebra ZT231 (USB)".
- [ ] **Step 2:** Run `pnpm --filter web run test:unit` and see the new tests fail.
- [ ] **Step 3:** Implement the rules above.
- [ ] **Step 4:** All gates pass.
- [ ] **Step 5:** Commit: `feat(stickers): read USB printers from the Print Helper`.

### Task 2: USB in the sheet and the dialog

**Files:**
- Modify:
  - `found-printers.tsx`
  - `manage-printers-sheet.tsx`
  - `print-sticker-lines.tsx`
  - `apps/web/src/language-data/unirefund/TagService/resources/en.json` and `tr.json`

**Interfaces:**
- **Consumes:** everything from Task 1.
- **New keys** (en / tr):
  - `StickerHeader.PrintLabels.Search.SearchingUsb`: "Looking for printers on your network and on USB…" / "Ağınızda ve USB'de yazıcı aranıyor…"
  - `StickerHeader.PrintLabels.Search.UsbCable`: "USB cable" / "USB kablosu"
  - `StickerHeader.PrintLabels.Error.PrinterBusy`: "The printer is busy. Try again in a moment." / "Yazıcı meşgul. Biraz sonra tekrar deneyin."
  - `StickerHeader.PrintLabels.Error.UsbUnplugged`: "The printer isn't connected. Check the USB cable." / "Yazıcı bağlı değil. USB kablosunu kontrol edin."
- **Behaviour:**
  - USB label printers join the top card list, after the network ones, in the helper's order.
  - A USB card's second line is `[{dpi} dpi · ]USB cable`.
  - The searching line uses `SearchingUsb` when `helperSupports(helper, "usb")`, and the existing `Searching` otherwise.
  - The edit form's line for a found printer reads `Found automatically · USB cable` for a USB target, and stays `· host` for network.
  - The error map gains `printer-busy`. For `printer-unreachable`, the dialog shows `UsbUnplugged` when `isUsbTarget(selectedProfile?.target)` is true. This applies to the run error and to test-label toasts (setup and Check position).

- [ ] **Step 1:** Add the 4 keys to both JSON files and run `pnpm --filter web run init`.
- [ ] **Step 2:** Implement the behaviour above. Each new element reuses its existing `data-testid` pattern. The card's `data-testid` stays `print-sticker-lines-use-<id>`, so the id carries the `usb:` prefix.
- [ ] **Step 3:** All gates pass: tsc 0, unit 0 fail, eslint 0 errors, `NEEDS_KEY 0`, `i18n:unused` at baseline (all 4 keys used).
- [ ] **Step 4:** Commit: `feat(stickers): show and set up USB label printers`.

### Task 3: Walkthrough (controller)

Use the helper 1.2.0 build (from the helper plan's branch or its installer), the office Argox on USB **and** on the network, and the dev server on this worktree. Log in as admin on Faroe Islands and use book `dd76f22b-5520-13bb-54eb-3a237377b232`.

- [ ] **The search:** opening Manage printers shows "Looking for printers on your network and on USB…". Then two Argox cards appear: "Network · 192.168.1.19" and "USB cable".
- [ ] **Setup:** on the USB card, **Use this printer** → roll → test label → **Yes**. The printer is saved with `connection: "usb"` and `lastAddress: null`, and a real label prints. Ask the user to confirm it.
- [ ] **A book:** printing a book to it sends `printerId: "usb:1664:0D10:80384F461093"`. Intercept `/print` so a whole book isn't printed.
- [ ] **Unplugged:** the user unplugs the cable, and a print shows "The printer isn't connected. Check the USB cable."
- [ ] **Busy, simulated:** route `/print` to `409 printer-busy` and check its message.
- [ ] **An older helper:** with `/status` `features: ["search"]`, no USB copy appears.
- [ ] **Finish:** push, then open the PR.
