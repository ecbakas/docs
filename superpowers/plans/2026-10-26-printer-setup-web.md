# Printer Setup for Zero-IT Admins (web, phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the sticker print dialog's printer sheet, an admin with no IT knowledge sets up a label printer from a list the Print Helper found:
- one click;
- at most two plain questions;
- one test label with yes/no and arrow buttons.

Saved printers keep working when their IP changes.

**Architecture:**
- **Helper detection:** the web asks the helper for its `features`. Only when `"search"` is listed does the sheet search on open (`GET /printers/search`) and show cards.
- **Setup:** a card's setup step turns a found printer into a `PrinterProfile` (`zpl/found-printer.ts`). A Zebra's reported dpi, ribbon mode and label length fill the answers.
- **Saved printers:** they print through `{ printerId, lastAddress }`. A new address the helper reports is saved, with one toast.
- **Older helpers** see the sheet exactly as before.

**Tech Stack:** Next.js 16 / React 19 (`apps/web`), `@repo/ayasofyazilim-ui`, the Node test runner for `.ts` units. No new packages.

**Spec:** `docs/superpowers/specs/2026-10-14-printer-discovery-design.md`, sections 3, 6, 8 and 9. The helper side is in the companion plan `2026-10-26-printer-search-helper.md` (API version 2).

**Verified before writing:** all code below was committed as a scratch commit (`879203713`, never pushed) on top of PR #334's head (`78ef6cf17`) and checked on 2026-10-26:
- `test:unit` 691 tests, 690 pass, 0 fail, 1 skipped (+31);
- `type-check` 0 errors;
- `eslint` 0 errors (the one existing `<img>` warning);
- `i18n:missing` NEEDS_KEY 0;
- `i18n:unused` 5, the existing baseline;
- `policy:audit` 0.

A browser walkthrough simulated the helper's v2 answers with the office search results. It checked:
- the cards, setup, the guided test ZPL and the arrows;
- the save, the blank roll turning the background on, the moved-address save and toast, and the not-found message;
- "nothing found", and an older helper.

Later the same day, with the real helper 1.1.0 installed, the office search showed the Argox's network card first. Its Windows entry (a PPLA driver on COM10) sat under a collapsed "Installed in Windows (1)", and the six office and virtual printers sat under "Other printers".

## Global Constraints

- **Base:** `main` after PR #334 merges (it holds the simplified sheet this plan edits). Branch `feat/printer-setup` in a worktree outside the repo: `C:\unirefund\web-app-wt-printer-setup`.
- **No backend work.** The helper contract is spec §6:
  - `/status` `features`;
  - `GET /printers/search`;
  - `POST /print` with `{ printerId, lastAddress }` returning `address` when the printer moved;
  - error codes `printer-not-found` and `not-a-label-printer`.
- **Older helpers:** with a helper whose `features` lack `"search"` (or no helper), the sheet behaves exactly as before.
- **Probing safety is the helper's job.** The web never sends anything except a print the admin started: a test label, or a book.
- **Never force a ribbon mode the printer did not report** (`media: "printer"` when unknown). A wrong `^MT` halts the printer.
- **Conventions:**
  - every interactive element gets a `data-testid`;
  - no `useEffect`, and no ref reads during render (React compiler lint);
  - all text through `TagService` keys in **both** `en.json` and `tr.json`;
  - comments sparse, for the non-obvious "why".
- **Gates after every task:**
  - `pnpm --filter web test:unit` → 0 fail;
  - `pnpm --filter web type-check` → 0;
  - lint on the changed files → 0 errors.

  After editing `en.json`/`tr.json`, run `pnpm --filter web run init` (the translation types come from the generated bundle).
- **Commits:** one per task, message via a quoted heredoc (`git commit -F - <<'EOF'`), no backticks or backslashes in the message, ending with the Co-Authored-By trailer. lint-staged runs prettier on commit. After each commit, `git status` must be clean (memory: lint-staged can sweep the submodule pointer; never clean its patch blindly).

## Review Focus

1. **A saved printer the admin set up before the helper update** (a `network` or `queue` target) keeps printing exactly as before. Covered by the existing `send.test.ts` and profile tests, which stay green.
2. **The helper found the printer under Windows' printer list.** The profile uses the `queue` target, so it also works with old helpers. Pinned in Task 3: `prints to an installed Windows printer by name`.
3. **The admin closes the sheet in the middle of setup.** Setup is discarded and nothing is saved (the `onOpenChange(false)` branch). Task 5 checks it.
4. **A moved printer moves again within one run.** Later jobs use the newest address. Pinned in Task 2: `passes on a new address once and uses it for the next job`.
5. **Two printers with the same name** (two ZT231s). Each card shows its address, and saved ids differ. Task 5 checks the list shows both.

---

### Task 0: Worktree and baseline

- [ ] **Step 1:** confirm PR #334 is merged: `git -C C:/unirefund/web-app fetch origin && git -C C:/unirefund/web-app log --oneline -1 origin/main` must include the merge of `feat/sticker-zpl-printing`. If it doesn't, stop and report.
- [ ] **Step 2:** `git -C C:/unirefund/web-app worktree add ../web-app-wt-printer-setup -b feat/printer-setup origin/main`
- [ ] **Step 3:** in the worktree, run `pnpm install` then `pnpm --filter web run init`. Record the baselines: `test:unit` counts, `type-check` (expect 0) and `i18n:unused` (expect 5).


### Task 1: Found printers in the profile model

**Files:**
- Modify: `_components/transports/print-error.ts`, `_components/zpl/profile.ts`, `_components/zpl/profile-draft.ts`
- Test: `_components/zpl/profile.test.ts`, `_components/zpl/profile-draft.test.ts`

**Interfaces:**
- Produces:
  - `type PrinterAddress = { host: string; port: number }`;
  - `PrinterTarget` gains `{ kind: "found"; printerId: string; lastAddress: PrinterAddress | null }`;
  - `type RollKind = "preprinted" | "blank"`, and `PrinterProfile.roll?: RollKind`;
  - `PRINT_PORT = 9100`;
  - `parseAddress(value: unknown): PrinterAddress | null`;
  - `ProfileDraft` gains `found` and `roll`;
  - `PrintErrorCode` gains `"printer-not-found" | "not-a-label-printer"`.

- [ ] **Step 1: Write the failing tests.** Append to `zpl/profile.test.ts` and `zpl/profile-draft.test.ts`:

```diff
diff --git a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile.test.ts b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile.test.ts
index d6553143a..3fbfa9562 100644
--- a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile.test.ts
+++ b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile.test.ts
@@ -140,3 +140,46 @@ describe("loadProfiles / saveProfiles", () => {
     assert.equal(saveProfiles(throwingStorage(), [argox]), false);
   });
 });
+
+describe("found printers", () => {
+  const found = {
+    ...argox,
+    target: {
+      kind: "found",
+      printerId: "mac:78:5F:4C:00:55:67",
+      lastAddress: { host: "192.168.1.19", port: 9100 },
+    },
+    roll: "blank",
+  };
+
+  it("keeps a found target and the roll", () => {
+    assert.deepEqual(parseProfile(found), found);
+    assert.deepEqual(
+      parseProfile({ ...found, target: { ...found.target, lastAddress: null } })
+        ?.target,
+      { kind: "found", printerId: "mac:78:5F:4C:00:55:67", lastAddress: null }
+    );
+  });
+
+  it("refuses an address the helper would not print to", () => {
+    for (const lastAddress of [
+      { host: "8.8.8.8", port: 9100 },
+      { host: "192.168.1.19", port: 22 },
+      "192.168.1.19",
+    ]) {
+      assert.equal(
+        parseProfile({ ...found, target: { ...found.target, lastAddress } }),
+        null
+      );
+    }
+  });
+
+  it("refuses an empty id, Direct to Zebra and an unknown roll", () => {
+    assert.equal(
+      parseProfile({ ...found, target: { ...found.target, printerId: " " } }),
+      null
+    );
+    assert.equal(parseProfile({ ...found, transport: "zebra-direct" }), null);
+    assert.equal(parseProfile({ ...found, roll: "thermal" }), null);
+  });
+});
```

```diff
diff --git a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile-draft.test.ts b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile-draft.test.ts
index c90c20e0c..fa2d8e9f8 100644
--- a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile-draft.test.ts
+++ b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile-draft.test.ts
@@ -123,3 +123,23 @@ describe("connection", () => {
     );
   });
 });
+
+describe("drafts of found printers", () => {
+  it("keep the found target and the roll through an edit", () => {
+    const profile = {
+      ...PRESETS["zt231-203"],
+      id: "f",
+      transport: "helper" as const,
+      target: {
+        kind: "found" as const,
+        printerId: "zebra:99J000800418",
+        lastAddress: { host: "192.168.1.20", port: 9100 },
+      },
+      roll: "preprinted" as const,
+    };
+
+    const draft = { ...draftFromProfile(profile), offsetXmm: "1,5" };
+
+    assert.deepEqual(profileFromDraft(draft), { ...profile, offsetXmm: 1.5 });
+  });
+});
```

- [ ] **Step 2: Run and watch them fail.** Run: `pnpm --filter web test:unit` (the whole suite; Node treats a `[lang]` path argument as a glob, so single files cannot be run). Expected: the new `found printers` and `drafts of found printers` tests fail; a found target parses as `null`.

- [ ] **Step 3: Implement:**

```diff
diff --git a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/print-error.ts b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/print-error.ts
index f34cf6e3f..635216cda 100644
--- a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/print-error.ts
+++ b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/print-error.ts
@@ -5,6 +5,8 @@ export type PrintErrorCode =
   | "printer-unreachable"
   | "printer-timeout"
   | "network-blocked"
+  | "printer-not-found"
+  | "not-a-label-printer"
   | "unknown";
 
 /** Carries a code the dialog maps to a translated message; `detail` is for logs. */
```

```diff
diff --git a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile.ts b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile.ts
index 85a8a1a07..a52845171 100644
--- a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile.ts
+++ b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile.ts
@@ -1,10 +1,15 @@
 import type { Rotation } from "./geometry";
 
 export type Transport = "helper" | "zebra-direct";
+export type PrinterAddress = { host: string; port: number };
 export type PrinterTarget =
   | { kind: "network"; host: string }
-  | { kind: "queue"; name: string };
+  | { kind: "queue"; name: string }
+  /** A printer the Print Helper found; it re-finds it when the address changes. */
+  | { kind: "found"; printerId: string; lastAddress: PrinterAddress | null };
 export type MediaMode = "printer" | "ribbon" | "direct";
+/** Which roll the printer holds: pre-printed stickers, or blank labels that get the artwork. */
+export type RollKind = "preprinted" | "blank";
 
 export type PrinterProfile = {
   id: string;
@@ -20,9 +25,13 @@ export type PrinterProfile = {
   offsetXmm: number;
   offsetYmm: number;
   media: MediaMode;
+  roll?: RollKind;
 };
 
-export type ProfilePreset = Omit<PrinterProfile, "id" | "transport" | "target">;
+export type ProfilePreset = Omit<
+  PrinterProfile,
+  "id" | "transport" | "target" | "roll"
+>;
 export type PresetId = "zt231-203" | "zt231-300" | "argox-o4-250";
 
 export const PRESETS: Record<PresetId, ProfilePreset> = {
@@ -85,6 +94,8 @@ export function isPrivateIPv4(host: string): boolean {
 
 const MAX_SIZE_MM = 300;
 const MAX_OFFSET_MM = 100;
+const MAX_PRINTER_ID_LENGTH = 200;
+export const PRINT_PORT = 9100;
 
 const isFiniteNumber = (v: unknown): v is number =>
   typeof v === "number" && Number.isFinite(v);
@@ -106,9 +117,30 @@ function parseTarget(value: unknown): PrinterTarget | null {
   ) {
     return { kind: "queue", name: t.name.trim() };
   }
+  if (
+    t.kind === "found" &&
+    typeof t.printerId === "string" &&
+    t.printerId.trim() !== "" &&
+    t.printerId.length <= MAX_PRINTER_ID_LENGTH
+  ) {
+    const address = parseAddress(t.lastAddress);
+    if (t.lastAddress != null && !address) return null;
+    return { kind: "found", printerId: t.printerId, lastAddress: address };
+  }
   return null;
 }
 
+/** The only addresses the helper prints to on the network. */
+export function parseAddress(value: unknown): PrinterAddress | null {
+  if (!value || typeof value !== "object") return null;
+  const a = value as Record<string, unknown>;
+  return typeof a.host === "string" &&
+    isPrivateIPv4(a.host) &&
+    a.port === PRINT_PORT
+    ? { host: a.host, port: PRINT_PORT }
+    : null;
+}
+
 /** Returns null for anything a hand-edited or older entry could hold. */
 export function parseProfile(value: unknown): PrinterProfile | null {
   if (!value || typeof value !== "object") return null;
@@ -121,6 +153,7 @@ export function parseProfile(value: unknown): PrinterProfile | null {
     (p.transport !== "helper" && p.transport !== "zebra-direct") ||
     !target ||
     (p.transport === "zebra-direct" && target.kind !== "network") ||
+    (p.roll !== undefined && p.roll !== "preprinted" && p.roll !== "blank") ||
     (p.dpi !== 203 && p.dpi !== 300) ||
     !isFiniteNumber(p.headWidthMm) ||
     p.headWidthMm <= 0 ||
@@ -156,6 +189,7 @@ export function parseProfile(value: unknown): PrinterProfile | null {
     offsetXmm: p.offsetXmm,
     offsetYmm: p.offsetYmm,
     media: p.media,
+    ...(p.roll === undefined ? {} : { roll: p.roll }),
   };
 }
```

```diff
diff --git a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile-draft.ts b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile-draft.ts
index 415860b48..be0acacef 100644
--- a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile-draft.ts
+++ b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile-draft.ts
@@ -5,9 +5,12 @@ import {
   type MediaMode,
   type PresetId,
   type PrinterProfile,
+  type RollKind,
   type Transport,
 } from "./profile";
 
+type FoundTarget = Extract<PrinterProfile["target"], { kind: "found" }>;
+
 /** What the printer form edits: numbers stay text until saved. */
 export type ProfileDraft = {
   id: string;
@@ -24,6 +27,9 @@ export type ProfileDraft = {
   offsetXmm: string;
   offsetYmm: string;
   media: MediaMode;
+  /** Kept as found: the form edits geometry, not how a found printer is reached. */
+  found: FoundTarget | null;
+  roll: RollKind | null;
 };
 
 /** Accepts "6.5" and the Turkish "6,5"; anything else is null. */
@@ -50,6 +56,8 @@ export function draftFromPreset(presetId: PresetId, id: string): ProfileDraft {
     offsetXmm: String(p.offsetXmm),
     offsetYmm: String(p.offsetYmm),
     media: p.media,
+    found: null,
+    roll: null,
   };
 }
 
@@ -58,8 +66,13 @@ export function draftFromProfile(p: PrinterProfile): ProfileDraft {
     id: p.id,
     name: p.name,
     transport: p.transport,
-    targetKind: p.target.kind,
-    host: p.target.kind === "network" ? p.target.host : "",
+    targetKind: p.target.kind === "queue" ? "queue" : "network",
+    host:
+      p.target.kind === "network"
+        ? p.target.host
+        : p.target.kind === "found"
+          ? p.target.lastAddress?.host ?? ""
+          : "",
     queue: p.target.kind === "queue" ? p.target.name : "",
     dpi: String(p.dpi) as ProfileDraft["dpi"],
     headWidthMm: String(p.headWidthMm),
@@ -69,6 +82,8 @@ export function draftFromProfile(p: PrinterProfile): ProfileDraft {
     offsetXmm: String(p.offsetXmm),
     offsetYmm: String(p.offsetYmm),
     media: p.media,
+    found: p.target.kind === "found" ? p.target : null,
+    roll: p.roll ?? null,
   };
 }
 
@@ -78,8 +93,9 @@ export function profileFromDraft(d: ProfileDraft): PrinterProfile | null {
     id: d.id,
     name: d.name.trim(),
     transport: d.transport,
-    target:
-      d.targetKind === "network"
+    target: d.found
+      ? d.found
+      : d.targetKind === "network"
         ? { kind: "network", host: d.host.trim() }
         : { kind: "queue", name: d.queue },
     dpi: Number(d.dpi),
@@ -90,6 +106,7 @@ export function profileFromDraft(d: ProfileDraft): PrinterProfile | null {
     offsetXmm: parseMm(d.offsetXmm),
     offsetYmm: parseMm(d.offsetYmm),
     media: d.media,
+    roll: d.roll ?? undefined,
   });
 }
```

- [ ] **Step 4: Run.** Run: `pnpm --filter web test:unit` (the whole suite; Node treats a `[lang]` path argument as a glob, so single files cannot be run). Expected: all pass. Also run `pnpm --filter web type-check`. It fails only where later tasks fill in:
  - the error-message map in `print-sticker-lines.tsx` lacks the two new codes;
  - the saved-printer list in `manage-printers-sheet.tsx` doesn't handle `found`.

  Both are fixed in Task 4. Record them in your report.

- [ ] **Step 5: Commit** (lint-staged formats on commit):

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/print-error.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile.test.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile-draft.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/profile-draft.test.ts"
git commit -F - <<'EOF'
feat(stickers): printers the Print Helper found, in the printer profile

A profile can now point at a printer id the helper found, with its last address, and remember which roll is loaded. Drafts keep both through an edit.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```


### Task 2: Helper client: features, search, and printing to a found printer

**Files:**
- Modify (full replacement below): `_components/transports/helper-client.ts`, `_components/transports/send.ts`
- Create: `_components/transports/helper-search.test.ts`
- Test: `_components/transports/send.test.ts` (append)

**Interfaces:**
- Consumes: `parseAddress`, `PrinterAddress` and the `found` target (Task 1).
- Produces:
  - `HELPER_SEARCH_TIMEOUT_MS`;
  - `type HelperFeature = "search"`;
  - `HelperStatus.features?: string[]`;
  - `helperSupports(helper: HelperDetection | null, feature): boolean`;
  - `type FoundPrinter`, whose `dpi` is `203 | 300 | null`;
  - `parseFoundPrinter(value)`;
  - `searchPrinters(fetchFn, timeoutMs?) : Promise<{ printers: FoundPrinter[]; searchedMs: number }>`;
  - `sendViaHelper(...) : Promise<{ address: PrinterAddress | null }>`;
  - `senderFor(profile, fetchFn, onMoved?)`.

- [ ] **Step 1: Write the failing tests.** Create `transports/helper-search.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HELPER_BASE_URL,
  helperSupports,
  parseFoundPrinter,
  searchPrinters,
  sendViaHelper,
} from "./helper-client";
import { PrintError, type FetchLike } from "./print-error";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const hangingFetch: FetchLike = (_url, init) =>
  new Promise((_resolve, reject) =>
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
  );

// `GET /printers/search` from the helper on the office network, 2026-10-26.
const officeSearch = {
  printers: [
    {
      id: "mac:78:5F:4C:00:55:67",
      connection: "network",
      labelPrinter: true,
      maker: "Argox",
      model: "O4",
      dpi: null,
      printMethod: null,
      labelLengthMm: null,
      address: { host: "192.168.1.19", port: 9100 },
      windowsPrinter: null,
      statusSupported: false,
      recognisedBy: ["port", "snmp", "mac"],
    },
    {
      id: "mac:6C:3C:7C:F4:0F:48",
      connection: "network",
      labelPrinter: false,
      maker: null,
      model: "Canon MF460 Series /P",
      dpi: null,
      printMethod: null,
      labelLengthMm: null,
      address: { host: "192.168.1.15", port: 9100 },
      windowsPrinter: null,
      statusSupported: false,
      recognisedBy: ["port", "snmp"],
    },
  ],
  searchedMs: 3256,
};

describe("helperSupports", () => {
  const ready = (features?: string[]) =>
    ({
      state: "ready",
      status: { name: "h", version: "1.1.0", apiVersion: 2, features },
    }) as const;

  it("needs a helper that lists the feature", () => {
    assert.equal(helperSupports(ready(["search"]), "search"), true);
    assert.equal(helperSupports(ready([]), "search"), false);
    assert.equal(helperSupports(ready(), "search"), false);
    assert.equal(helperSupports({ state: "missing" }, "search"), false);
    assert.equal(helperSupports(null, "search"), false);
  });
});

describe("searchPrinters", () => {
  it("reads the helper's search", async () => {
    const urls: string[] = [];
    const result = await searchPrinters(async (url) => {
      urls.push(url);
      return json(officeSearch);
    });

    assert.deepEqual(urls, [`${HELPER_BASE_URL}/printers/search`]);
    assert.equal(result.searchedMs, 3256);
    assert.deepEqual(
      result.printers.map((p) => [p.id, p.labelPrinter, p.maker, p.model]),
      [
        ["mac:78:5F:4C:00:55:67", true, "Argox", "O4"],
        ["mac:6C:3C:7C:F4:0F:48", false, null, "Canon MF460 Series /P"],
      ]
    );
  });

  it("drops entries this page cannot use instead of failing", async () => {
    const result = await searchPrinters(async () =>
      json({
        printers: [
          officeSearch.printers[0],
          { id: "x", connection: "usb" },
          {
            id: "y",
            connection: "network",
            address: { host: "8.8.8.8", port: 9100 },
          },
          null,
        ],
        searchedMs: 5,
      })
    );

    assert.deepEqual(
      result.printers.map((p) => p.id),
      ["mac:78:5F:4C:00:55:67"]
    );
  });

  it("reports a helper that is gone or too slow as missing", async () => {
    await assert.rejects(
      searchPrinters(async () => {
        throw new TypeError("Failed to fetch");
      }),
      (e: unknown) => e instanceof PrintError && e.code === "helper-missing"
    );
    await assert.rejects(
      searchPrinters(hangingFetch, 10),
      (e: unknown) => e instanceof PrintError && e.code === "helper-missing"
    );
  });

  it("rejects a malformed answer as unknown", async () => {
    await assert.rejects(
      searchPrinters(async () => json({ printers: "nope" })),
      (e: unknown) => e instanceof PrintError && e.code === "unknown"
    );
  });
});

describe("parseFoundPrinter", () => {
  it("keeps only dpi values the presets cover", () => {
    const at600 = parseFoundPrinter({ ...officeSearch.printers[0], dpi: 600 });
    assert.equal(at600?.dpi, null);
    const at300 = parseFoundPrinter({ ...officeSearch.printers[0], dpi: 300 });
    assert.equal(at300?.dpi, 300);
  });

  it("needs a Windows printer name for an installed printer", () => {
    const base = {
      ...officeSearch.printers[0],
      connection: "windows",
      address: null,
    };
    assert.equal(parseFoundPrinter({ ...base, windowsPrinter: null }), null);
    assert.equal(
      parseFoundPrinter({
        ...base,
        windowsPrinter: "ZDesigner ZT231-203dpi ZPL",
      })?.windowsPrinter,
      "ZDesigner ZT231-203dpi ZPL"
    );
  });
});

describe("sendViaHelper to a found printer", () => {
  const found = {
    kind: "found",
    printerId: "mac:78:5F:4C:00:55:67",
    lastAddress: { host: "192.168.1.19", port: 9100 },
  } as const;

  it("posts the printer id and its last address", async () => {
    let body: unknown;
    const result = await sendViaHelper(
      async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return json({ ok: true, bytes: 7, ms: 1, address: null });
      },
      found,
      "^XA^XZ",
      "Stickers 1-1"
    );

    assert.deepEqual(body, {
      printerId: "mac:78:5F:4C:00:55:67",
      lastAddress: { host: "192.168.1.19", port: 9100 },
      data: "^XA^XZ",
      jobName: "Stickers 1-1",
    });
    assert.equal(result.address, null);
  });

  it("returns the new address of a printer the helper re-found", async () => {
    const result = await sendViaHelper(
      async () =>
        json({
          ok: true,
          bytes: 7,
          ms: 1,
          address: { host: "192.168.1.23", port: 9100 },
        }),
      found,
      "^XA^XZ",
      "Stickers 1-1"
    );

    assert.deepEqual(result.address, { host: "192.168.1.23", port: 9100 });
  });

  it("maps the helper's own error codes", async () => {
    for (const [status, code] of [
      [404, "printer-not-found"],
      [400, "not-a-label-printer"],
      [404, "queue-not-found"],
    ] as const) {
      await assert.rejects(
        sendViaHelper(
          async () =>
            json({ ok: false, error: { code, message: "m" } }, status),
          found,
          "^XA^XZ",
          "j"
        ),
        (e: unknown) => e instanceof PrintError && e.code === code
      );
    }
  });
});
```

Append to `transports/send.test.ts`:

```diff
diff --git a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/send.test.ts b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/send.test.ts
index 12ca470f9..e645971a6 100644
--- a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/send.test.ts
+++ b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/send.test.ts
@@ -47,3 +47,43 @@ describe("senderFor", () => {
     assert.equal(bodies[0], "^XA^XZ\n");
   });
 });
+
+describe("senderFor a found printer", () => {
+  it("passes on a new address once and uses it for the next job", async () => {
+    const bodies: { lastAddress?: unknown }[] = [];
+    let call = 0;
+    const fn: FetchLike = async (_url, init) => {
+      bodies.push(JSON.parse(String(init?.body)));
+      call++;
+      return new Response(
+        JSON.stringify({
+          ok: true,
+          bytes: 7,
+          ms: 1,
+          address: call === 1 ? { host: "192.168.1.23", port: 9100 } : null,
+        }),
+        { status: 200 }
+      );
+    };
+    const profile: PrinterProfile = {
+      ...base,
+      transport: "helper",
+      target: {
+        kind: "found",
+        printerId: "mac:78:5F:4C:00:55:67",
+        lastAddress: { host: "192.168.1.19", port: 9100 },
+      },
+    };
+    const moved: unknown[] = [];
+
+    const send = senderFor(profile, fn, (address) => moved.push(address));
+    await send(job);
+    await send(job);
+
+    assert.deepEqual(moved, [{ host: "192.168.1.23", port: 9100 }]);
+    assert.deepEqual(bodies[1]?.lastAddress, {
+      host: "192.168.1.23",
+      port: 9100,
+    });
+  });
+});
```

- [ ] **Step 2: Run and watch them fail.** Run: `pnpm --filter web test:unit` (the whole suite; Node treats a `[lang]` path argument as a glob, so single files cannot be run). Expected: they fail to import `helperSupports`, `parseFoundPrinter` and `searchPrinters`.

- [ ] **Step 3: Implement.** Replace `transports/helper-client.ts` with:

```ts
import {
  parseAddress,
  type PrinterAddress,
  type PrinterTarget,
} from "../zpl/profile";
import {
  PrintError,
  withTimeout,
  type FetchLike,
  type PrintErrorCode,
} from "./print-error";

export const HELPER_BASE_URL = "http://127.0.0.1:9180";
export const MIN_HELPER_VERSION = "1.0.0";
/** Null until the installer's storage is chosen (spec open question 1). */
export const HELPER_DOWNLOAD_URL: string | null = null;
export const HELPER_PRINT_TIMEOUT_MS = 60_000;
export const HELPER_LIST_TIMEOUT_MS = 30_000;
/** The helper's own search takes about 8 s; this covers a slow, large network. */
export const HELPER_SEARCH_TIMEOUT_MS = 30_000;

export type HelperFeature = "search";

export type HelperStatus = {
  name: string;
  version: string;
  apiVersion: number;
  /** Listed by helpers from apiVersion 2 on. */
  features?: string[];
};
export type HelperDetection =
  | { state: "missing" }
  | { state: "ready" | "outdated"; status: HelperStatus };

export type HelperPrinters = {
  queues: { name: string; driver: string; port: string }[];
  network: { host: string; port: number }[];
};

/** One printer from `GET /printers/search`. */
export type FoundPrinter = {
  id: string;
  connection: "network" | "windows";
  labelPrinter: boolean;
  maker: string | null;
  model: string | null;
  /** Only the resolutions the presets cover; anything else is asked. */
  dpi: 203 | 300 | null;
  printMethod: "thermal-transfer" | "direct-thermal" | null;
  labelLengthMm: number | null;
  address: PrinterAddress | null;
  windowsPrinter: string | null;
};

export type PrinterSearchResult = {
  printers: FoundPrinter[];
  searchedMs: number;
};

export function helperSupports(
  helper: HelperDetection | null,
  feature: HelperFeature
): boolean {
  return (
    helper !== null &&
    helper.state !== "missing" &&
    (helper.status.features ?? []).includes(feature)
  );
}

/** Numeric dotted compare; a pre-release suffix ("1.2.0-beta") is ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    (v.split("-")[0] ?? "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

/** A connection refusal, a timeout and a non-helper answer all mean "not usable". */
export async function detectHelper(
  fetchFn: FetchLike,
  timeoutMs = 1500
): Promise<HelperDetection> {
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetchFn(`${HELPER_BASE_URL}/status`, {
      signal: t.signal,
    });
    if (!res.ok) return { state: "missing" };
    const status = (await res.json()) as HelperStatus;
    if (typeof status?.version !== "string") return { state: "missing" };
    return {
      state:
        compareVersions(status.version, MIN_HELPER_VERSION) < 0
          ? "outdated"
          : "ready",
      status,
    };
  } catch {
    return { state: "missing" };
  } finally {
    t.done();
  }
}

const HELPER_ERROR_CODES: readonly PrintErrorCode[] = [
  "invalid-target",
  "queue-not-found",
  "printer-unreachable",
  "printer-timeout",
  "printer-not-found",
  "not-a-label-printer",
];

async function errorFrom(res: Response): Promise<PrintError> {
  let body: { error?: { code?: string; message?: string } } = {};
  try {
    const parsed: unknown = await res.json();
    if (parsed && typeof parsed === "object") body = parsed;
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
  const code = HELPER_ERROR_CODES.find((c) => c === body.error?.code);
  return new PrintError(
    code ?? byStatus[res.status] ?? "unknown",
    body.error?.message ?? `HTTP ${res.status}`
  );
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

/** Drops whatever a newer or broken helper sends that this page cannot use. */
export function parseFoundPrinter(value: unknown): FoundPrinter | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  const id = str(p.id);
  if (!id || (p.connection !== "network" && p.connection !== "windows")) {
    return null;
  }
  const address = parseAddress(p.address);
  const windowsPrinter = str(p.windowsPrinter);
  if (p.connection === "network" ? !address : !windowsPrinter) return null;
  return {
    id,
    connection: p.connection,
    labelPrinter: p.labelPrinter === true,
    maker: str(p.maker),
    model: str(p.model),
    dpi: p.dpi === 203 || p.dpi === 300 ? p.dpi : null,
    printMethod:
      p.printMethod === "thermal-transfer" || p.printMethod === "direct-thermal"
        ? p.printMethod
        : null,
    labelLengthMm:
      typeof p.labelLengthMm === "number" && Number.isFinite(p.labelLengthMm)
        ? p.labelLengthMm
        : null,
    address,
    windowsPrinter,
  };
}

export async function searchPrinters(
  fetchFn: FetchLike,
  timeoutMs = HELPER_SEARCH_TIMEOUT_MS
): Promise<PrinterSearchResult> {
  const t = withTimeout(timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetchFn(`${HELPER_BASE_URL}/printers/search`, {
        signal: t.signal,
      });
    } catch (error) {
      if (t.signal.aborted) throw new PrintError("helper-missing", "timed out");
      throw new PrintError("helper-missing", String(error));
    }
    if (!res.ok) throw await errorFrom(res);
    try {
      const body: unknown = await res.json();
      const printers =
        body && typeof body === "object"
          ? (body as { printers?: unknown }).printers
          : null;
      if (Array.isArray(printers)) {
        return {
          printers: printers
            .map(parseFoundPrinter)
            .filter((p): p is FoundPrinter => p !== null),
          searchedMs:
            Number((body as { searchedMs?: unknown }).searchedMs) || 0,
        };
      }
    } catch {
      // handled below as a malformed response
    }
    throw new PrintError("unknown", "malformed /printers/search response");
  } finally {
    t.done();
  }
}

export async function listHelperPrinters(
  fetchFn: FetchLike,
  scan: boolean,
  timeoutMs = HELPER_LIST_TIMEOUT_MS
): Promise<HelperPrinters> {
  const t = withTimeout(timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetchFn(
        `${HELPER_BASE_URL}/printers${scan ? "?scan=1" : ""}`,
        { signal: t.signal }
      );
    } catch (error) {
      if (t.signal.aborted) throw new PrintError("helper-missing", "timed out");
      throw new PrintError("helper-missing", String(error));
    }
    if (!res.ok) throw await errorFrom(res);
    try {
      const body: unknown = await res.json();
      if (
        body &&
        typeof body === "object" &&
        Array.isArray((body as HelperPrinters).queues) &&
        Array.isArray((body as HelperPrinters).network)
      ) {
        return body as HelperPrinters;
      }
    } catch {
      // handled below as a malformed response
    }
    throw new PrintError("unknown", "malformed /printers response");
  } finally {
    t.done();
  }
}

/** Resolves with `address` set when the helper re-found the printer somewhere new. */
export async function sendViaHelper(
  fetchFn: FetchLike,
  target: PrinterTarget,
  zpl: string,
  jobName: string,
  timeoutMs = HELPER_PRINT_TIMEOUT_MS
): Promise<{ address: PrinterAddress | null }> {
  const body = JSON.stringify(
    target.kind === "found"
      ? {
          printerId: target.printerId,
          lastAddress: target.lastAddress,
          data: zpl,
          jobName,
        }
      : {
          target:
            target.kind === "network"
              ? { kind: "network", host: target.host, port: 9100 }
              : target,
          data: zpl,
          jobName,
        }
  );
  const t = withTimeout(timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetchFn(`${HELPER_BASE_URL}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: t.signal,
      });
    } catch (error) {
      if (t.signal.aborted)
        throw new PrintError("printer-timeout", "timed out");
      throw new PrintError("helper-missing", String(error));
    }
    if (!res.ok) throw await errorFrom(res);
    try {
      const result: unknown = await res.json();
      return {
        address:
          result && typeof result === "object"
            ? parseAddress((result as { address?: unknown }).address)
            : null,
      };
    } catch {
      return { address: null };
    }
  } finally {
    t.done();
  }
}
```

Replace `transports/send.ts` with:

```ts
import type { ZplJob } from "../zpl/jobs";
import type { PrinterAddress, PrinterProfile } from "../zpl/profile";
import { sendViaHelper } from "./helper-client";
import type { FetchLike } from "./print-error";
import { sendToZebra } from "./zebra-direct";

/** window.fetch must be called unbound-safe, or Chrome throws "Illegal invocation". */
export const browserFetch: FetchLike = (input, init) => fetch(input, init);

/**
 * `onMoved` hears the new address of a found printer the helper had to re-find;
 * later jobs of the same run go to that address directly.
 */
export function senderFor(
  profile: PrinterProfile,
  fetchFn: FetchLike,
  onMoved?: (address: PrinterAddress) => void
): (job: ZplJob) => Promise<void> {
  let target = profile.target;
  if (profile.transport === "zebra-direct" && target.kind === "network") {
    const host = target.host;
    return (job) => sendToZebra(fetchFn, host, job.zpl);
  }
  return async (job) => {
    const { address } = await sendViaHelper(
      fetchFn,
      target,
      job.zpl,
      `Stickers ${job.firstIndex + 1}-${job.lastIndex + 1}`
    );
    if (address && target.kind === "found") {
      target = { ...target, lastAddress: address };
      onMoved?.(address);
    }
  };
}
```

- [ ] **Step 4: Run.** Run: `pnpm --filter web test:unit` (the whole suite; Node treats a `[lang]` path argument as a glob, so single files cannot be run). Expected: all pass.

- [ ] **Step 5: Commit:**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/helper-client.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/helper-search.test.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/send.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/transports/send.test.ts"
git commit -F - <<'EOF'
feat(stickers): search for printers through the Print Helper

Reads which features the helper offers, asks it for the printers it found, prints to a found printer by id and passes on the new address when the helper re-found it elsewhere. Error codes come from the helper's own answer.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```


### Task 3: From a found printer to a profile, and the guided test label

**Files:**
- Create: `_components/zpl/found-printer.ts`, `_components/zpl/found-printer.test.ts`
- Modify: `_components/zpl/alignment-test.ts`
- Test: `_components/zpl/alignment-test.test.ts`

**Interfaces:**
- Consumes: `FoundPrinter` (Task 2), `PRESETS`, `RollKind` and `PrinterProfile` (Task 1).
- Produces:
  - `ROLL_SIZES`;
  - `type SetupQuestion = "dpi" | "roll"`;
  - `type SetupAnswers = { dpi: 203 | 300; roll: RollKind }`;
  - `rollFromLabelLength`, `knownAnswers`, `questionsFor`, `presetFor`, `foundPrinterName`, `profileFromFound(found, answers, id)` and `isAdded(found, profiles)`;
  - `buildGuidedTestZpl(profile, roll)`.

- [ ] **Step 1: Write the failing tests.** Create `zpl/found-printer.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FoundPrinter } from "../transports/helper-client";
import {
  foundPrinterName,
  isAdded,
  knownAnswers,
  profileFromFound,
  questionsFor,
  rollFromLabelLength,
} from "./found-printer";
import { parseProfile, PRESETS, type PrinterProfile } from "./profile";

// What the helper reports for the office Argox, and for a Zebra that answered everything.
const argox: FoundPrinter = {
  id: "mac:78:5F:4C:00:55:67",
  connection: "network",
  labelPrinter: true,
  maker: "Argox",
  model: "O4",
  dpi: null,
  printMethod: null,
  labelLengthMm: null,
  address: { host: "192.168.1.19", port: 9100 },
  windowsPrinter: null,
};

const zt231: FoundPrinter = {
  id: "zebra:99J000800418",
  connection: "network",
  labelPrinter: true,
  maker: "Zebra",
  model: "ZT231",
  dpi: 300,
  printMethod: "thermal-transfer",
  labelLengthMm: 101,
  address: { host: "192.168.1.20", port: 9100 },
  windowsPrinter: null,
};

const zdesigner: FoundPrinter = {
  id: "queue:ZDesigner ZT231-203dpi ZPL",
  connection: "windows",
  labelPrinter: true,
  maker: "Zebra",
  model: "ZT231",
  dpi: 203,
  printMethod: null,
  labelLengthMm: null,
  address: null,
  windowsPrinter: "ZDesigner ZT231-203dpi ZPL",
};

describe("rollFromLabelLength", () => {
  it("tells the two rolls apart by the length a Zebra measured", () => {
    assert.equal(rollFromLabelLength(100), "preprinted");
    assert.equal(rollFromLabelLength(95), "preprinted");
    assert.equal(rollFromLabelLength(70), "blank");
    assert.equal(rollFromLabelLength(76), "blank");
    assert.equal(rollFromLabelLength(85), null);
    assert.equal(rollFromLabelLength(null), null);
  });
});

describe("questionsFor", () => {
  it("asks nothing a Zebra already reported", () => {
    assert.deepEqual(questionsFor(zt231), []);
    assert.deepEqual(knownAnswers(zt231), { dpi: 300, roll: "preprinted" });
  });

  it("asks the Argox only which roll is loaded; its dpi is fixed", () => {
    assert.deepEqual(questionsFor(argox), ["roll"]);
    assert.deepEqual(knownAnswers(argox), { dpi: 203 });
  });

  it("asks a silent Zebra both", () => {
    assert.deepEqual(
      questionsFor({ ...zt231, dpi: null, labelLengthMm: null }),
      ["dpi", "roll"]
    );
  });

  it("asks only for the dpi when the printer measured its roll but gave no usable dpi", () => {
    assert.deepEqual(questionsFor({ ...zt231, dpi: null }), ["dpi"]);
  });
});

describe("foundPrinterName", () => {
  it("joins maker and model without repeating the maker", () => {
    assert.equal(foundPrinterName(zt231), "Zebra ZT231");
    assert.equal(
      foundPrinterName({ ...argox, model: "Argox O4-250 PPLA" }),
      "Argox O4-250 PPLA"
    );
    assert.equal(
      foundPrinterName({ ...argox, maker: null, model: null }),
      "192.168.1.19"
    );
  });
});

describe("profileFromFound", () => {
  it("builds a valid profile for a Zebra on a pre-printed roll", () => {
    const profile = profileFromFound(
      zt231,
      { dpi: 300, roll: "preprinted" },
      "p1"
    );

    assert.deepEqual(parseProfile(profile), profile);
    assert.equal(profile.name, "Zebra ZT231");
    assert.equal(profile.dpi, 300);
    assert.equal(profile.headWidthMm, PRESETS["zt231-300"].headWidthMm);
    assert.deepEqual(
      [profile.labelWidthMm, profile.labelHeightMm, profile.rotation],
      [70, 100, 0]
    );
    assert.equal(profile.offsetXmm, 0);
    assert.equal(profile.media, "ribbon");
    assert.equal(profile.roll, "preprinted");
    assert.deepEqual(profile.target, {
      kind: "found",
      printerId: "zebra:99J000800418",
      lastAddress: { host: "192.168.1.20", port: 9100 },
    });
  });

  it("matches the measured Argox preset on a blank roll", () => {
    const profile = profileFromFound(argox, { dpi: 203, roll: "blank" }, "p2");

    const preset = PRESETS["argox-o4-250"];
    assert.deepEqual(
      [
        profile.labelWidthMm,
        profile.labelHeightMm,
        profile.rotation,
        profile.offsetXmm,
      ],
      [
        preset.labelWidthMm,
        preset.labelHeightMm,
        preset.rotation,
        preset.offsetXmm,
      ]
    );
    assert.equal(profile.media, "printer");
  });

  it("centres a pre-printed roll on the Argox", () => {
    const profile = profileFromFound(
      argox,
      { dpi: 203, roll: "preprinted" },
      "p3"
    );

    assert.equal(profile.offsetXmm, 21);
    assert.equal(profile.rotation, 0);
  });

  it("prints to an installed Windows printer by name", () => {
    const profile = profileFromFound(
      zdesigner,
      { dpi: 203, roll: "preprinted" },
      "p4"
    );

    assert.deepEqual(profile.target, {
      kind: "queue",
      name: "ZDesigner ZT231-203dpi ZPL",
    });
  });
});

describe("isAdded", () => {
  it("matches saved printers by printer id or Windows printer name", () => {
    const saved: PrinterProfile[] = [
      profileFromFound(zt231, { dpi: 300, roll: "preprinted" }, "a"),
      profileFromFound(zdesigner, { dpi: 203, roll: "preprinted" }, "b"),
    ];

    assert.equal(isAdded(zt231, saved), true);
    assert.equal(isAdded(zdesigner, saved), true);
    assert.equal(isAdded(argox, saved), false);
  });
});
```

Change `zpl/alignment-test.test.ts`:

```diff
diff --git a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/alignment-test.test.ts b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/alignment-test.test.ts
index 689d1bdad..4439702d4 100644
--- a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/alignment-test.test.ts
+++ b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/alignment-test.test.ts
@@ -1,6 +1,6 @@
 import assert from "node:assert/strict";
 import { describe, it } from "node:test";
-import { buildAlignmentTestZpl } from "./alignment-test";
+import { buildAlignmentTestZpl, buildGuidedTestZpl } from "./alignment-test";
 import { PRESETS, type PrinterProfile } from "./profile";
 
 const argox: PrinterProfile = {
@@ -43,3 +43,26 @@ describe("buildAlignmentTestZpl", () => {
     assert.ok(lines(zpl).includes("^FO566,374^GB165,165,2^FS"));
   });
 });
+
+describe("buildGuidedTestZpl", () => {
+  it("draws only a square where the QR goes on a pre-printed roll", () => {
+    const zebra: PrinterProfile = {
+      id: "z",
+      transport: "helper",
+      target: { kind: "network", host: "192.168.1.20" },
+      ...PRESETS["zt231-203"],
+    };
+
+    const zpl = buildGuidedTestZpl(zebra, "preprinted").split("\n");
+
+    assert.equal(zpl.filter((l) => l.includes("^GB")).length, 1);
+    assert.ok(zpl.includes("^FO381,101^GB165,165,4^FS"), zpl.join(" "));
+  });
+
+  it("draws a frame 2 mm inside a blank label at the Argox offset", () => {
+    const zpl = buildGuidedTestZpl(argox, "blank").split("\n");
+
+    assert.ok(zpl.includes("^FO64,16^GB767,527,4^FS"), zpl.join(" "));
+    assert.equal(zpl.at(-1), "^XZ");
+  });
+});
```

- [ ] **Step 2: Run and watch them fail.** Run: `pnpm --filter web test:unit` (the whole suite; Node treats a `[lang]` path argument as a glob, so single files cannot be run). Expected: they fail to import `./found-printer` and `buildGuidedTestZpl`.

- [ ] **Step 3: Implement.** Create `zpl/found-printer.ts`:

```ts
import type { FoundPrinter } from "../transports/helper-client";
import {
  PRESETS,
  type MediaMode,
  type PresetId,
  type PrinterProfile,
  type RollKind,
} from "./profile";

/** The two rolls in use: pre-printed 70x100 stickers and blank 100x70 labels. */
export const ROLL_SIZES: Record<
  RollKind,
  { labelWidthMm: number; labelHeightMm: number }
> = {
  preprinted: { labelWidthMm: 70, labelHeightMm: 100 },
  blank: { labelWidthMm: 100, labelHeightMm: 70 },
};

/** A calibrated Zebra measures its labels; this much either way still counts as a match. */
const ROLL_TOLERANCE_MM = 6;

export type SetupQuestion = "dpi" | "roll";
export type SetupAnswers = { dpi: 203 | 300; roll: RollKind };

const isArgox = (found: FoundPrinter) => found.maker === "Argox";

export function rollFromLabelLength(mm: number | null): RollKind | null {
  if (mm === null) return null;
  for (const roll of ["preprinted", "blank"] as const) {
    if (Math.abs(mm - ROLL_SIZES[roll].labelHeightMm) <= ROLL_TOLERANCE_MM) {
      return roll;
    }
  }
  return null;
}

/** What the printer told us; setup asks for the rest. */
export function knownAnswers(found: FoundPrinter): Partial<SetupAnswers> {
  const dpi = isArgox(found) ? 203 : found.dpi ?? undefined;
  const roll = rollFromLabelLength(found.labelLengthMm) ?? undefined;
  return { ...(dpi ? { dpi } : {}), ...(roll ? { roll } : {}) };
}

export function questionsFor(found: FoundPrinter): SetupQuestion[] {
  const known = knownAnswers(found);
  const questions: SetupQuestion[] = [];
  if (!known.dpi) questions.push("dpi");
  if (!known.roll) questions.push("roll");
  return questions;
}

export function presetFor(found: FoundPrinter, dpi: 203 | 300): PresetId {
  if (isArgox(found)) return "argox-o4-250";
  return dpi === 300 ? "zt231-300" : "zt231-203";
}

/** "Zebra ZT231", "Argox O4", or what an installed printer is called. */
export function foundPrinterName(found: FoundPrinter): string {
  const { maker, model } = found;
  const name =
    maker && model && !model.toLowerCase().startsWith(maker.toLowerCase())
      ? `${maker} ${model}`
      : model ?? maker;
  return name ?? found.windowsPrinter ?? found.address?.host ?? found.id;
}

const MEDIA: Record<NonNullable<FoundPrinter["printMethod"]>, MediaMode> = {
  "thermal-transfer": "ribbon",
  "direct-thermal": "direct",
};

export function profileFromFound(
  found: FoundPrinter,
  answers: SetupAnswers,
  id: string
): PrinterProfile {
  const preset = PRESETS[presetFor(found, answers.dpi)];
  const size = ROLL_SIZES[answers.roll];
  return {
    ...preset,
    id,
    name: foundPrinterName(found),
    transport: "helper",
    target:
      found.connection === "windows" && found.windowsPrinter
        ? { kind: "queue", name: found.windowsPrinter }
        : { kind: "found", printerId: found.id, lastAddress: found.address },
    ...size,
    rotation: answers.roll === "blank" ? 90 : 0,
    // The Argox centres the roll under its head, measured about 2 mm right of
    // centre; Zebras align it to the head's left edge.
    offsetXmm: isArgox(found)
      ? (preset.headWidthMm - size.labelWidthMm) / 2 + 2
      : 0,
    offsetYmm: 0,
    // Never forces ^MT when the printer did not say: a wrong one halts it.
    media: found.printMethod ? MEDIA[found.printMethod] : "printer",
    roll: answers.roll,
  };
}

export function isAdded(
  found: FoundPrinter,
  profiles: PrinterProfile[]
): boolean {
  return profiles.some(({ target }) =>
    target.kind === "found"
      ? target.printerId === found.id
      : target.kind === "queue" && target.name === found.windowsPrinter
  );
}
```

and add the guided label to `zpl/alignment-test.ts`:

```diff
diff --git a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/alignment-test.ts b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/alignment-test.ts
index 23b673295..e6238aa11 100644
--- a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/alignment-test.ts
+++ b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/alignment-test.ts
@@ -1,7 +1,7 @@
 import { mmToDots, rotatedDesignSize } from "./geometry";
 import { artworkOrigin, labelHeaderZpl, placeOrigin, qrRectMm } from "./jobs";
 import type { LayoutKind } from "./layouts";
-import type { PrinterProfile } from "./profile";
+import type { PrinterProfile, RollKind } from "./profile";
 
 /** Any value of sticker length sizes the QR outline like a real label. */
 const SAMPLE_QR_VALUE = "https://ssr.unirefund.com/tag/e3M6U0FNUExFMDAwMDAwfQ";
@@ -72,3 +72,37 @@ export function buildAlignmentTestZpl(
   lines.push("^XZ");
   return lines.join("\n");
 }
+
+/** Line weight of the guided test's square and frame, thick enough to judge by eye. */
+const GUIDE_LINE_DOTS = 4;
+const GUIDE_FRAME_INSET_MM = 2;
+
+/**
+ * The guided setup's test label. On a pre-printed roll, a square where the QR
+ * goes: it belongs inside the printed box. On a blank roll, a frame 2 mm inside
+ * the label: all of it belongs on the paper.
+ */
+export function buildGuidedTestZpl(
+  profile: PrinterProfile,
+  roll: RollKind
+): string {
+  const dots = (mm: number) => mmToDots(mm, profile.dpi);
+  const lines = labelHeaderZpl(profile);
+  if (roll === "preprinted") {
+    const { rect } = qrRectMm(SAMPLE_QR_VALUE, profile, "preprinted");
+    const q = placeOrigin(rect, profile);
+    const side = dots(rect.w);
+    lines.push(`^FO${q.x},${q.y}^GB${side},${side},${GUIDE_LINE_DOTS}^FS`);
+  } else {
+    const footprint = rotatedDesignSize(profile.rotation);
+    const a = artworkOrigin(profile);
+    const inset = dots(GUIDE_FRAME_INSET_MM);
+    const width = dots(footprint.w - 2 * GUIDE_FRAME_INSET_MM);
+    const height = dots(footprint.h - 2 * GUIDE_FRAME_INSET_MM);
+    lines.push(
+      `^FO${a.x + inset},${a.y + inset}^GB${width},${height},${GUIDE_LINE_DOTS}^FS`
+    );
+  }
+  lines.push("^XZ");
+  return lines.join("\n");
+}
```

- [ ] **Step 4: Run.** Run: `pnpm --filter web test:unit` (the whole suite; Node treats a `[lang]` path argument as a glob, so single files cannot be run). Expected: all pass. The guided labels' exact positions are pinned: `^FO381,101^GB165,165,4` (ZT231 203 dpi, pre-printed) and `^FO64,16^GB767,527,4` (Argox, blank).

- [ ] **Step 5: Commit:**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/found-printer.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/found-printer.test.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/alignment-test.ts" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/zpl/alignment-test.test.ts"
git commit -F - <<'EOF'
feat(stickers): turn a found printer into a printer profile

Fills model, dpi, ribbon and roll from what the printer reported, asks only what it could not say, and adds the guided test label: a square where the QR goes, or a frame inside a blank label.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```


### Task 4: The sheet: found printers, guided setup, and saved addresses

**Files:**
- Modify: `apps/web/src/language-data/unirefund/TagService/resources/en.json`, `apps/web/src/language-data/unirefund/TagService/resources/tr.json` (40 keys each)
- Create: `_components/found-printers.tsx`, `_components/printer-setup.tsx`
- Modify (full replacement below): `_components/manage-printers-sheet.tsx`
- Modify: `_components/print-sticker-lines.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces:
  - `FoundPrinters({ search, profiles, onSearch, onUse })` and `type PrinterSearchState`;
  - `PrinterSetup({ found, profileId, onSendTestLabel, onSave, onCancel })`;
  - `ManagePrintersSheet` gains `onSendTestLabel(profile, zpl) => Promise<boolean>`.

- [ ] **Step 1: Strings.** Apply to both files, then run `pnpm --filter web run init`:

```diff
diff --git a/apps/web/src/language-data/unirefund/TagService/resources/en.json b/apps/web/src/language-data/unirefund/TagService/resources/en.json
index 62aa58edc..f74c3f895 100644
--- a/apps/web/src/language-data/unirefund/TagService/resources/en.json
+++ b/apps/web/src/language-data/unirefund/TagService/resources/en.json
@@ -417,6 +417,46 @@
   "StickerHeader.PrintLabels.Error.Unknown": "Printing failed.",
   "StickerHeader.PrintLabels.CheckAgain": "Check again",
   "StickerHeader.PrintLabels.CheckingHelper": "Checking…",
+  "StickerHeader.PrintLabels.Search.Searching": "Looking for printers…",
+  "StickerHeader.PrintLabels.Search.Found": "Printers found",
+  "StickerHeader.PrintLabels.Search.Again": "Search again",
+  "StickerHeader.PrintLabels.Search.Use": "Use this printer",
+  "StickerHeader.PrintLabels.Search.Added": "Added",
+  "StickerHeader.PrintLabels.Search.Network": "Network · {0}",
+  "StickerHeader.PrintLabels.Search.Windows": "Installed in Windows",
+  "StickerHeader.PrintLabels.Search.InstalledInWindows": "Installed in Windows ({0})",
+  "StickerHeader.PrintLabels.Search.Others": "Other printers, not label printers ({0})",
+  "StickerHeader.PrintLabels.Search.NoneFound": "No label printer was found.",
+  "StickerHeader.PrintLabels.Search.CheckPower": "Is the printer switched on?",
+  "StickerHeader.PrintLabels.Search.CheckConnection": "Is its cable plugged in, or is it on the same network as this computer?",
+  "StickerHeader.PrintLabels.Search.FeedTip": "On a Zebra, hold the FEED button for 2 seconds to print its network settings; the address is on that label. Enter it under Add a printer by hand.",
+  "StickerHeader.PrintLabels.Search.ByHand": "Add a printer by hand",
+  "StickerHeader.PrintLabels.Search.FoundAutomatically": "Found automatically",
+  "StickerHeader.PrintLabels.Setup.Title": "Set up {0}",
+  "StickerHeader.PrintLabels.Setup.DpiQuestion": "What is the printer's resolution? It is printed on the label on the back of the printer.",
+  "StickerHeader.PrintLabels.Setup.RollQuestion": "Which roll is loaded?",
+  "StickerHeader.PrintLabels.Setup.RollPreprinted": "Pre-printed stickers",
+  "StickerHeader.PrintLabels.Setup.RollBlank": "Blank labels",
+  "StickerHeader.PrintLabels.Setup.Continue": "Continue",
+  "StickerHeader.PrintLabels.Setup.TestIntroPreprinted": "A test label will show a square where the QR code goes.",
+  "StickerHeader.PrintLabels.Setup.TestIntroBlank": "A test label will show a frame just inside the label's edge.",
+  "StickerHeader.PrintLabels.Setup.PrintTest": "Print a test label",
+  "StickerHeader.PrintLabels.Setup.PrintAgain": "Print again",
+  "StickerHeader.PrintLabels.Setup.QuestionPreprinted": "Is the square inside the printed box?",
+  "StickerHeader.PrintLabels.Setup.QuestionBlank": "Is the whole frame on the label?",
+  "StickerHeader.PrintLabels.Setup.Yes": "Yes",
+  "StickerHeader.PrintLabels.Setup.No": "No",
+  "StickerHeader.PrintLabels.Setup.Move": "Move the print, then print again:",
+  "StickerHeader.PrintLabels.Setup.MoveUp": "1 mm up",
+  "StickerHeader.PrintLabels.Setup.MoveDown": "1 mm down",
+  "StickerHeader.PrintLabels.Setup.MoveLeft": "1 mm left",
+  "StickerHeader.PrintLabels.Setup.MoveRight": "1 mm right",
+  "StickerHeader.PrintLabels.Setup.Position": "Position: {0} mm across, {1} mm down",
+  "StickerHeader.PrintLabels.Setup.SaveWithoutTest": "Save without a test",
+  "StickerHeader.PrintLabels.Setup.Saved": "{0} is ready to print.",
+  "StickerHeader.PrintLabels.PrinterMoved": "The printer was found at a new address.",
+  "StickerHeader.PrintLabels.Error.PrinterNotFound": "The printer isn't on the network. Is it switched on and connected?",
+  "StickerHeader.PrintLabels.Error.NotALabelPrinter": "This printer can't print these labels.",
   "StickerHeader.PrintLabels.MayNotHavePrinted": "Labels from {0} on may not have printed. Check the last label that came out and continue from the next one.",
   "StickerHeader.PrintLabels.ContinueFrom": "Continue from label",
   "StickerHeader.PrintLabels.ContinueFromHint": "Label {0} is sticker {1}.",
```

```diff
diff --git a/apps/web/src/language-data/unirefund/TagService/resources/tr.json b/apps/web/src/language-data/unirefund/TagService/resources/tr.json
index e659f6554..ecb670d97 100644
--- a/apps/web/src/language-data/unirefund/TagService/resources/tr.json
+++ b/apps/web/src/language-data/unirefund/TagService/resources/tr.json
@@ -419,6 +419,46 @@
   "StickerHeader.PrintLabels.Error.Unknown": "Yazdırma başarısız oldu.",
   "StickerHeader.PrintLabels.CheckAgain": "Yeniden kontrol et",
   "StickerHeader.PrintLabels.CheckingHelper": "Kontrol ediliyor…",
+  "StickerHeader.PrintLabels.Search.Searching": "Yazıcılar aranıyor…",
+  "StickerHeader.PrintLabels.Search.Found": "Bulunan yazıcılar",
+  "StickerHeader.PrintLabels.Search.Again": "Yeniden ara",
+  "StickerHeader.PrintLabels.Search.Use": "Bu yazıcıyı kullan",
+  "StickerHeader.PrintLabels.Search.Added": "Eklendi",
+  "StickerHeader.PrintLabels.Search.Network": "Ağ · {0}",
+  "StickerHeader.PrintLabels.Search.Windows": "Windows'ta kurulu",
+  "StickerHeader.PrintLabels.Search.InstalledInWindows": "Windows'ta kurulu ({0})",
+  "StickerHeader.PrintLabels.Search.Others": "Diğer yazıcılar, etiket yazıcısı değil ({0})",
+  "StickerHeader.PrintLabels.Search.NoneFound": "Etiket yazıcısı bulunamadı.",
+  "StickerHeader.PrintLabels.Search.CheckPower": "Yazıcı açık mı?",
+  "StickerHeader.PrintLabels.Search.CheckConnection": "Kablosu takılı mı, ya da bu bilgisayarla aynı ağda mı?",
+  "StickerHeader.PrintLabels.Search.FeedTip": "Zebra'da ağ ayarlarını basmak için FEED düğmesini 2 saniye basılı tutun; adres o etikette yazar. Adresi Yazıcıyı elle ekle bölümüne girin.",
+  "StickerHeader.PrintLabels.Search.ByHand": "Yazıcıyı elle ekle",
+  "StickerHeader.PrintLabels.Search.FoundAutomatically": "Otomatik bulundu",
+  "StickerHeader.PrintLabels.Setup.Title": "{0} kurulumu",
+  "StickerHeader.PrintLabels.Setup.DpiQuestion": "Yazıcının çözünürlüğü nedir? Yazıcının arkasındaki etikette yazar.",
+  "StickerHeader.PrintLabels.Setup.RollQuestion": "Hangi rulo takılı?",
+  "StickerHeader.PrintLabels.Setup.RollPreprinted": "Baskılı çıkartmalar",
+  "StickerHeader.PrintLabels.Setup.RollBlank": "Boş etiketler",
+  "StickerHeader.PrintLabels.Setup.Continue": "Devam",
+  "StickerHeader.PrintLabels.Setup.TestIntroPreprinted": "Test etiketinde QR kodun geleceği yere bir kare basılır.",
+  "StickerHeader.PrintLabels.Setup.TestIntroBlank": "Test etiketinde, etiketin kenarının hemen içine bir çerçeve basılır.",
+  "StickerHeader.PrintLabels.Setup.PrintTest": "Test etiketi bas",
+  "StickerHeader.PrintLabels.Setup.PrintAgain": "Yeniden bas",
+  "StickerHeader.PrintLabels.Setup.QuestionPreprinted": "Kare, baskılı kutunun içinde mi?",
+  "StickerHeader.PrintLabels.Setup.QuestionBlank": "Çerçevenin tamamı etiketin üzerinde mi?",
+  "StickerHeader.PrintLabels.Setup.Yes": "Evet",
+  "StickerHeader.PrintLabels.Setup.No": "Hayır",
+  "StickerHeader.PrintLabels.Setup.Move": "Baskıyı kaydırın, sonra yeniden basın:",
+  "StickerHeader.PrintLabels.Setup.MoveUp": "1 mm yukarı",
+  "StickerHeader.PrintLabels.Setup.MoveDown": "1 mm aşağı",
+  "StickerHeader.PrintLabels.Setup.MoveLeft": "1 mm sola",
+  "StickerHeader.PrintLabels.Setup.MoveRight": "1 mm sağa",
+  "StickerHeader.PrintLabels.Setup.Position": "Konum: yatayda {0} mm, dikeyde {1} mm",
+  "StickerHeader.PrintLabels.Setup.SaveWithoutTest": "Test etmeden kaydet",
+  "StickerHeader.PrintLabels.Setup.Saved": "{0} yazdırmaya hazır.",
+  "StickerHeader.PrintLabels.PrinterMoved": "Yazıcı yeni bir adreste bulundu.",
+  "StickerHeader.PrintLabels.Error.PrinterNotFound": "Yazıcı ağda bulunamadı. Açık ve bağlı mı?",
+  "StickerHeader.PrintLabels.Error.NotALabelPrinter": "Bu yazıcı bu etiketleri basamaz.",
   "StickerHeader.PrintLabels.MayNotHavePrinted": "{0}. etiketten itibaren basılmamış olabilir. Çıkan son etiketi kontrol edip bir sonrakinden devam edin.",
   "StickerHeader.PrintLabels.ContinueFrom": "Şu etiketten devam et",
   "StickerHeader.PrintLabels.ContinueFromHint": "{0}. etiket, {1} numaralı çıkartmadır.",
```

- [ ] **Step 2: The found list.** Create `found-printers.tsx`:

```tsx
"use client";

import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ayasofyazilim-ui/components/collapsible";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { LucideChevronRight, LucideRefreshCw } from "lucide-react";
import type { FoundPrinter } from "./transports/helper-client";
import { foundPrinterName, isAdded } from "./zpl/found-printer";
import type { PrinterProfile } from "./zpl/profile";

export type PrinterSearchState =
  | { phase: "idle" }
  | { phase: "searching" }
  | { phase: "done"; printers: FoundPrinter[] }
  | { phase: "failed" };

/**
 * What the Print Helper found, each one click from set up. Network label
 * printers come first; Windows printers sit in their own section, open only
 * when nothing was found on the network, because one physical printer can be
 * both and its Windows entry may sit on a port it is not connected to.
 */
export function FoundPrinters({
  search,
  profiles,
  onSearch,
  onUse,
}: {
  search: PrinterSearchState;
  profiles: PrinterProfile[];
  onSearch: () => void;
  onUse: (found: FoundPrinter) => void;
}) {
  const { t } = useTranslations();
  const tag = t.TagService;
  const searching = search.phase === "searching";
  const printers = search.phase === "done" ? search.printers : [];
  const labelPrinters = printers.filter((p) => p.labelPrinter);
  const networkLabel = labelPrinters.filter((p) => p.connection === "network");
  const windowsLabel = labelPrinters.filter((p) => p.connection === "windows");
  const others = printers.filter((p) => !p.labelPrinter);

  const where = (p: FoundPrinter) =>
    p.connection === "network" && p.address
      ? tag["StickerHeader.PrintLabels.Search.Network"].replace(
          "{0}",
          p.address.host
        )
      : tag["StickerHeader.PrintLabels.Search.Windows"];

  const cards = (list: FoundPrinter[]) => (
    <ul className="divide-y rounded-md border">
      {list.map((p) => (
        <li className="flex items-center gap-2 py-2 pl-3 pr-2" key={p.id}>
          <div className="flex min-w-0 grow flex-col">
            <span className="truncate text-sm font-medium">
              {foundPrinterName(p)}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {[
                p.dpi ? `${p.dpi} dpi` : null,
                p.connection === "network" ? where(p) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          {isAdded(p, profiles) ? (
            <span className="text-muted-foreground text-xs">
              {tag["StickerHeader.PrintLabels.Search.Added"]}
            </span>
          ) : (
            <Button
              data-testid={`print-sticker-lines-use-${p.id}`}
              onClick={() => onUse(p)}
              size="sm"
            >
              {tag["StickerHeader.PrintLabels.Search.Use"]}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {searching
            ? tag["StickerHeader.PrintLabels.Search.Searching"]
            : tag["StickerHeader.PrintLabels.Search.Found"]}
        </span>
        <Button
          data-testid="print-sticker-lines-search-again"
          disabled={searching}
          onClick={onSearch}
          size="sm"
          variant="outline"
        >
          <LucideRefreshCw className={cn(searching && "animate-spin")} />
          {search.phase === "idle"
            ? tag["StickerHeader.PrintLabels.FindPrinters"]
            : tag["StickerHeader.PrintLabels.Search.Again"]}
        </Button>
      </div>

      {networkLabel.length > 0 ? cards(networkLabel) : null}

      {windowsLabel.length > 0 ? (
        <Collapsible
          defaultOpen={networkLabel.length === 0}
          key={String(networkLabel.length === 0)}
        >
          <CollapsibleTrigger
            className="group flex w-full items-center gap-1 text-left text-sm font-medium"
            data-testid="print-sticker-lines-windows-printers"
          >
            <LucideChevronRight className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
            {tag["StickerHeader.PrintLabels.Search.InstalledInWindows"].replace(
              "{0}",
              String(windowsLabel.length)
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            {cards(windowsLabel)}
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {search.phase === "done" && labelPrinters.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-md border p-3 text-sm">
          <span className="font-medium">
            {tag["StickerHeader.PrintLabels.Search.NoneFound"]}
          </span>
          <ul className="text-muted-foreground list-disc pl-5">
            <li>{tag["StickerHeader.PrintLabels.Search.CheckPower"]}</li>
            <li>{tag["StickerHeader.PrintLabels.Search.CheckConnection"]}</li>
          </ul>
          <p className="text-muted-foreground text-xs">
            {tag["StickerHeader.PrintLabels.Search.FeedTip"]}
          </p>
        </div>
      ) : null}

      {others.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger
            className="group flex w-full items-center gap-1 text-left text-xs text-muted-foreground"
            data-testid="print-sticker-lines-other-printers"
          >
            <LucideChevronRight className="size-3 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
            {tag["StickerHeader.PrintLabels.Search.Others"].replace(
              "{0}",
              String(others.length)
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="text-muted-foreground pl-4 pt-1 text-xs">
              {others.map((p) => (
                <li key={p.id}>
                  {foundPrinterName(p)} · {where(p)}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: The setup step.** Create `printer-setup.tsx`:

```tsx
"use client";

import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import {
  LucideArrowDown,
  LucideArrowLeft,
  LucideArrowRight,
  LucideArrowUp,
} from "lucide-react";
import { useState, useTransition } from "react";
import type { FoundPrinter } from "./transports/helper-client";
import { buildGuidedTestZpl } from "./zpl/alignment-test";
import {
  foundPrinterName,
  knownAnswers,
  profileFromFound,
  questionsFor,
  type SetupAnswers,
} from "./zpl/found-printer";
import type { PrinterProfile, RollKind } from "./zpl/profile";

/** Same limit the profile accepts. */
const MAX_OFFSET_MM = 100;

type Check = "untested" | "asking" | "adjusting";

function RollPicture({ roll }: { roll: RollKind }) {
  // A pre-printed sticker stands upright with its artwork and QR box; a blank label lies flat.
  return roll === "preprinted" ? (
    <svg aria-hidden="true" className="h-16" viewBox="0 0 70 100">
      <rect
        fill="white"
        height="98"
        rx="4"
        stroke="currentColor"
        width="68"
        x="1"
        y="1"
      />
      <rect fill="#db0000" height="16" width="68" x="1" y="1" />
      <rect
        fill="none"
        height="26"
        stroke="#db0000"
        strokeWidth="2"
        width="26"
        x="38"
        y="16"
      />
      <rect fill="#db0000" height="4" opacity="0.5" width="30" x="6" y="60" />
      <rect fill="#db0000" height="4" opacity="0.5" width="40" x="6" y="70" />
    </svg>
  ) : (
    <svg aria-hidden="true" className="h-16" viewBox="0 0 100 70">
      <rect
        fill="white"
        height="68"
        rx="4"
        stroke="currentColor"
        width="98"
        x="1"
        y="1"
      />
    </svg>
  );
}

/** What a correct test label looks like next to the yes/no question. */
function ExpectedPicture({ roll }: { roll: RollKind }) {
  return roll === "preprinted" ? (
    <svg aria-hidden="true" className="h-20" viewBox="0 0 70 100">
      <rect
        fill="white"
        height="98"
        rx="4"
        stroke="currentColor"
        width="68"
        x="1"
        y="1"
      />
      <rect
        fill="none"
        height="26"
        stroke="#db0000"
        strokeWidth="2"
        width="26"
        x="38"
        y="16"
      />
      <rect
        fill="none"
        height="20"
        stroke="currentColor"
        strokeWidth="3"
        width="20"
        x="41"
        y="19"
      />
    </svg>
  ) : (
    <svg aria-hidden="true" className="h-14" viewBox="0 0 100 70">
      <rect
        fill="white"
        height="68"
        rx="4"
        stroke="currentColor"
        width="98"
        x="1"
        y="1"
      />
      <rect
        fill="none"
        height="60"
        stroke="currentColor"
        strokeWidth="2"
        width="90"
        x="5"
        y="5"
      />
    </svg>
  );
}

/**
 * Turns a found printer into a saved one: asks only what the printer could not
 * say, then checks the position with one test label and arrow buttons.
 */
export function PrinterSetup({
  found,
  profileId,
  onSendTestLabel,
  onSave,
  onCancel,
}: {
  found: FoundPrinter;
  profileId: string;
  onSendTestLabel: (profile: PrinterProfile, zpl: string) => Promise<boolean>;
  onSave: (profile: PrinterProfile) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslations();
  const tag = t.TagService;
  const questions = questionsFor(found);
  const [answers, setAnswers] = useState<Partial<SetupAnswers>>(() =>
    knownAnswers(found)
  );
  const [asked, setAsked] = useState(questions.length === 0);
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const [check, setCheck] = useState<Check>("untested");
  const [isSending, startSending] = useTransition();

  const complete =
    answers.dpi !== undefined && answers.roll !== undefined
      ? (answers as SetupAnswers)
      : null;
  const base = complete ? profileFromFound(found, complete, profileId) : null;
  const profile =
    base && offset
      ? { ...base, offsetXmm: offset.x, offsetYmm: offset.y }
      : base;

  function printTest() {
    if (!profile || !complete) return;
    const zpl = buildGuidedTestZpl(profile, complete.roll);
    startSending(async () => {
      if (await onSendTestLabel(profile, zpl)) setCheck("asking");
    });
  }

  function move(dx: number, dy: number) {
    if (!profile) return;
    const clamp = (v: number) =>
      Math.max(-MAX_OFFSET_MM, Math.min(MAX_OFFSET_MM, v));
    setOffset({
      x: clamp(profile.offsetXmm + dx),
      y: clamp(profile.offsetYmm + dy),
    });
  }

  // A cross of four buttons: up on top, left and right in the middle, down below.
  const arrows = [
    {
      id: "up",
      dx: 0,
      dy: -1,
      icon: LucideArrowUp,
      label: tag["StickerHeader.PrintLabels.Setup.MoveUp"],
      cell: "col-start-2",
    },
    {
      id: "left",
      dx: -1,
      dy: 0,
      icon: LucideArrowLeft,
      label: tag["StickerHeader.PrintLabels.Setup.MoveLeft"],
      cell: "col-start-1",
    },
    {
      id: "right",
      dx: 1,
      dy: 0,
      icon: LucideArrowRight,
      label: tag["StickerHeader.PrintLabels.Setup.MoveRight"],
      cell: "col-start-3",
    },
    {
      id: "down",
      dx: 0,
      dy: 1,
      icon: LucideArrowDown,
      label: tag["StickerHeader.PrintLabels.Setup.MoveDown"],
      cell: "col-start-2",
    },
  ];

  return (
    <div
      className="flex flex-col gap-4 rounded-md border p-3"
      data-testid="print-sticker-lines-setup"
    >
      <span className="text-sm font-medium">
        {tag["StickerHeader.PrintLabels.Setup.Title"].replace(
          "{0}",
          foundPrinterName(found)
        )}
      </span>

      {!asked ? (
        <div className="flex flex-col gap-4">
          {questions.includes("dpi") ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm">
                {tag["StickerHeader.PrintLabels.Setup.DpiQuestion"]}
              </span>
              <div className="flex gap-2">
                {([203, 300] as const).map((dpi) => (
                  <Button
                    data-testid={`print-sticker-lines-setup-dpi-${dpi}`}
                    key={dpi}
                    onClick={() => setAnswers((a) => ({ ...a, dpi }))}
                    variant={answers.dpi === dpi ? "default" : "outline"}
                  >
                    {dpi} dpi
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {questions.includes("roll") ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm">
                {tag["StickerHeader.PrintLabels.Setup.RollQuestion"]}
              </span>
              <div className="flex gap-2">
                {(["preprinted", "blank"] as const).map((roll) => (
                  <button
                    className={cn(
                      "flex flex-1 flex-col items-center gap-2 rounded-md border p-3 text-sm",
                      answers.roll === roll &&
                        "border-primary ring-primary ring-2"
                    )}
                    data-testid={`print-sticker-lines-setup-roll-${roll}`}
                    key={roll}
                    onClick={() => setAnswers((a) => ({ ...a, roll }))}
                    type="button"
                  >
                    <RollPicture roll={roll} />
                    {roll === "preprinted"
                      ? tag["StickerHeader.PrintLabels.Setup.RollPreprinted"]
                      : tag["StickerHeader.PrintLabels.Setup.RollBlank"]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              data-testid="print-sticker-lines-setup-cancel"
              onClick={onCancel}
              variant="ghost"
            >
              {t.Default["Cancel"]}
            </Button>
            <Button
              data-testid="print-sticker-lines-setup-continue"
              disabled={!complete}
              onClick={() => setAsked(true)}
            >
              {tag["StickerHeader.PrintLabels.Setup.Continue"]}
            </Button>
          </div>
        </div>
      ) : profile && complete ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {complete.roll === "preprinted"
              ? tag["StickerHeader.PrintLabels.Setup.TestIntroPreprinted"]
              : tag["StickerHeader.PrintLabels.Setup.TestIntroBlank"]}
          </p>

          {check === "asking" ? (
            <div className="flex items-center gap-3">
              <ExpectedPicture roll={complete.roll} />
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">
                  {complete.roll === "preprinted"
                    ? tag["StickerHeader.PrintLabels.Setup.QuestionPreprinted"]
                    : tag["StickerHeader.PrintLabels.Setup.QuestionBlank"]}
                </span>
                <div className="flex gap-2">
                  <Button
                    data-testid="print-sticker-lines-setup-yes"
                    onClick={() => onSave(profile)}
                  >
                    {tag["StickerHeader.PrintLabels.Setup.Yes"]}
                  </Button>
                  <Button
                    data-testid="print-sticker-lines-setup-no"
                    onClick={() => setCheck("adjusting")}
                    variant="outline"
                  >
                    {tag["StickerHeader.PrintLabels.Setup.No"]}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {check === "adjusting" ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm">
                {tag["StickerHeader.PrintLabels.Setup.Move"]}
              </span>
              <div className="grid w-fit grid-cols-3 gap-2">
                {arrows.map(({ label, icon: Icon, dx, dy, id, cell }) => (
                  <Button
                    aria-label={label}
                    className={cell}
                    data-testid={`print-sticker-lines-setup-move-${id}`}
                    key={id}
                    onClick={() => move(dx, dy)}
                    title={label}
                    variant="outline"
                  >
                    <Icon />
                    {label}
                  </Button>
                ))}
              </div>
              <span className="text-muted-foreground text-xs">
                {tag["StickerHeader.PrintLabels.Setup.Position"]
                  .replace("{0}", String(profile.offsetXmm))
                  .replace("{1}", String(profile.offsetYmm))}
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              data-testid="print-sticker-lines-setup-cancel"
              onClick={onCancel}
              variant="ghost"
            >
              {t.Default["Cancel"]}
            </Button>
            <Button
              data-testid="print-sticker-lines-setup-save-untested"
              onClick={() => onSave(profile)}
              variant="ghost"
            >
              {tag["StickerHeader.PrintLabels.Setup.SaveWithoutTest"]}
            </Button>
            <Button
              data-testid="print-sticker-lines-setup-print-test"
              disabled={isSending}
              onClick={printTest}
              variant={check === "asking" ? "outline" : "default"}
            >
              {check === "untested"
                ? tag["StickerHeader.PrintLabels.Setup.PrintTest"]
                : tag["StickerHeader.PrintLabels.Setup.PrintAgain"]}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: The sheet.** Replace `manage-printers-sheet.tsx` with:

```tsx
"use client";

import { useTranslations } from "@/src/providers/i18n";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ayasofyazilim-ui/components/collapsible";
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
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import {
  LucideChevronRight,
  LucidePencil,
  LucideRefreshCw,
  LucideSettings2,
  LucideTrash2,
} from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { FoundPrinters, type PrinterSearchState } from "./found-printers";
import { HelperMissingNotice } from "./helper-missing-notice";
import { PrinterSetup } from "./printer-setup";
import {
  helperSupports,
  listHelperPrinters,
  searchPrinters,
  type FoundPrinter,
  type HelperDetection,
  type HelperPrinters,
} from "./transports/helper-client";
import { browserFetch } from "./transports/send";
import { PRESETS, type PresetId, type PrinterProfile } from "./zpl/profile";
import {
  connectionOf,
  connectionPatch,
  draftFromPreset,
  draftFromProfile,
  profileFitsDesign,
  profileFromDraft,
  type Connection,
  type ProfileDraft,
} from "./zpl/profile-draft";

const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

type MmKey =
  | "headWidthMm"
  | "labelWidthMm"
  | "labelHeightMm"
  | "offsetXmm"
  | "offsetYmm";

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
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
 * The model preset fills the label geometry, so it sits under "Advanced".
 * With a helper that can search, found printers come first and the form
 * moves under "Add a printer by hand".
 */
export function ManagePrintersSheet({
  profiles,
  onProfilesChange,
  helper,
  helperChecking,
  onCheckHelper,
  directSupported,
  onAlignmentTest,
  onSendTestLabel,
}: {
  profiles: PrinterProfile[];
  onProfilesChange: (profiles: PrinterProfile[]) => void;
  /** The last detection this dialog session; null until the first one answers. */
  helper: HelperDetection | null;
  helperChecking: boolean;
  onCheckHelper: () => void;
  directSupported: boolean;
  onAlignmentTest: (profile: PrinterProfile) => Promise<void>;
  /** Sends one label; true when it went out (failures are already toasted). */
  onSendTestLabel: (profile: PrinterProfile, zpl: string) => Promise<boolean>;
}) {
  const { t } = useTranslations();
  const tag = t.TagService;
  const helperAvailable = helper !== null && helper.state !== "missing";
  const helperMissing = helper?.state === "missing";
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [presetId, setPresetId] = useState<PresetId>("zt231-203");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [found, setFound] = useState<HelperPrinters | null>(null);
  const [isFinding, startFinding] = useTransition();
  const [isTesting, startTesting] = useTransition();
  const canSearch = helperSupports(helper, "search");
  const [search, setSearch] = useState<PrinterSearchState>({ phase: "idle" });
  const [setupFor, setSetupFor] = useState<FoundPrinter | null>(null);
  const [setupId, setSetupId] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  const connectionLabels: Record<Connection, string> = {
    network: tag["StickerHeader.PrintLabels.Target.Network"],
    queue: tag["StickerHeader.PrintLabels.Target.Queue"],
    "zebra-direct": tag["StickerHeader.PrintLabels.Transport.ZebraDirect"],
  };
  const mediaLabels = {
    printer: tag["StickerHeader.PrintLabels.Media.Printer"],
    ribbon: tag["StickerHeader.PrintLabels.Media.Ribbon"],
    direct: tag["StickerHeader.PrintLabels.Media.Direct"],
  };

  const candidate = draft ? profileFromDraft(draft) : null;
  const doesNotFit = candidate !== null && !profileFitsDesign(candidate);
  const connection = draft ? connectionOf(draft) : null;
  const canFind = helperAvailable && connection !== "zebra-direct";
  const update = (patch: Partial<ProfileDraft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  function handleFind() {
    startFinding(async () => {
      try {
        setFound(await listHelperPrinters(browserFetch, true));
      } catch {
        toast.error(tag["StickerHeader.PrintLabels.Error.HelperMissing"]);
        onCheckHelper();
      }
    });
  }

  function runSearch() {
    setSearch({ phase: "searching" });
    void searchPrinters(browserFetch).then(
      (result) => setSearch({ phase: "done", printers: result.printers }),
      () => {
        setSearch({ phase: "failed" });
        toast.error(tag["StickerHeader.PrintLabels.Error.HelperMissing"]);
        onCheckHelper();
      }
    );
  }

  function startSetup(found: FoundPrinter) {
    setDraft(null);
    setSetupId(crypto.randomUUID());
    setSetupFor(found);
  }

  function handleSetupSave(profile: PrinterProfile) {
    onProfilesChange([...profiles, profile]);
    setSetupFor(null);
    toast.success(
      tag["StickerHeader.PrintLabels.Setup.Saved"].replace("{0}", profile.name)
    );
  }

  function openDraft(next: ProfileDraft) {
    setDraft(next);
    setAdvancedOpen(false);
    if (helperAvailable && found === null && !isFinding) handleFind();
  }

  function handleSave() {
    if (!candidate) return;
    const exists = profiles.some((p) => p.id === candidate.id);
    onProfilesChange(
      exists
        ? profiles.map((p) => (p.id === candidate.id ? candidate : p))
        : [...profiles, candidate]
    );
    setDraft(null);
  }

  function handleAlignmentTest() {
    if (!candidate) return;
    const profile = candidate;
    startTesting(async () => {
      try {
        await onAlignmentTest(profile);
      } catch {
        toast.error(tag["StickerHeader.PrintLabels.Error.Unknown"]);
      }
    });
  }

  function mmField(key: MmKey, id: string, label: string) {
    if (!draft) return null;
    return (
      <Field id={id} key={key} label={label}>
        <Input
          data-testid={id}
          id={id}
          inputMode="decimal"
          onChange={(e) => update({ [key]: e.target.value })}
          value={draft[key]}
        />
      </Field>
    );
  }

  const findButton = canFind ? (
    <Button
      aria-label={tag["StickerHeader.PrintLabels.FindPrinters"]}
      data-testid="print-sticker-lines-find-printers"
      disabled={isFinding}
      onClick={handleFind}
      size="icon"
      title={
        isFinding
          ? tag["StickerHeader.PrintLabels.FindingPrinters"]
          : tag["StickerHeader.PrintLabels.FindPrinters"]
      }
      variant="outline"
    >
      <LucideRefreshCw className={cn(isFinding && "animate-spin")} />
    </Button>
  ) : null;

  const manualForm = (
    <>
      {draft ? null : (
        <div className="flex items-end gap-2">
          <div className="grow">
            <Field
              id="print-sticker-lines-preset"
              label={tag["StickerHeader.PrintLabels.Preset"]}
            >
              <Select
                onValueChange={(v) => setPresetId(v as PresetId)}
                value={presetId}
              >
                <SelectTrigger
                  className="w-full"
                  data-testid="print-sticker-lines-preset"
                  id="print-sticker-lines-preset"
                >
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
          </div>
          <Button
            data-testid="print-sticker-lines-add-printer"
            onClick={() =>
              openDraft(draftFromPreset(presetId, crypto.randomUUID()))
            }
          >
            {tag["StickerHeader.PrintLabels.AddPrinter"]}
          </Button>
        </div>
      )}

      {draft && connection ? (
        <div className="flex flex-col gap-4 rounded-md border p-3">
          <Field
            id="print-sticker-lines-printer-name"
            label={tag["StickerHeader.PrintLabels.PrinterName"]}
          >
            <Input
              data-testid="print-sticker-lines-printer-name"
              id="print-sticker-lines-printer-name"
              onChange={(e) => update({ name: e.target.value })}
              value={draft.name}
            />
          </Field>

          {draft.found ? (
            <p className="text-muted-foreground text-sm">
              {tag["StickerHeader.PrintLabels.Search.FoundAutomatically"]}
              {draft.found.lastAddress
                ? ` · ${draft.found.lastAddress.host}`
                : ""}
            </p>
          ) : (
            <>
              <Field
                id="print-sticker-lines-connection"
                label={tag["StickerHeader.PrintLabels.Transport"]}
              >
                <Select
                  onValueChange={(v) =>
                    update(connectionPatch(v as Connection))
                  }
                  value={connection}
                >
                  <SelectTrigger
                    className="w-full"
                    data-testid="print-sticker-lines-connection"
                    id="print-sticker-lines-connection"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="network">
                      {connectionLabels.network}
                    </SelectItem>
                    <SelectItem value="queue">
                      {connectionLabels.queue}
                    </SelectItem>
                    {directSupported || connection === "zebra-direct" ? (
                      <SelectItem value="zebra-direct">
                        {connectionLabels["zebra-direct"]}
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </Field>

              {connection === "queue" ? (
                <Field
                  id="print-sticker-lines-queue"
                  label={tag["StickerHeader.PrintLabels.Queue"]}
                >
                  <div className="flex gap-2">
                    <Select
                      onValueChange={(v) => update({ queue: v })}
                      value={draft.queue}
                    >
                      <SelectTrigger
                        className="w-full"
                        data-testid="print-sticker-lines-queue"
                        id="print-sticker-lines-queue"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          found?.queues ??
                          (draft.queue ? [{ name: draft.queue }] : [])
                        ).map((queue) => (
                          <SelectItem key={queue.name} value={queue.name}>
                            {queue.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {findButton}
                  </div>
                </Field>
              ) : (
                <Field
                  id="print-sticker-lines-host"
                  label={tag["StickerHeader.PrintLabels.Host"]}
                >
                  <div className="flex gap-2">
                    <Input
                      data-testid="print-sticker-lines-host"
                      id="print-sticker-lines-host"
                      onChange={(e) => update({ host: e.target.value })}
                      placeholder="192.168.1.20"
                      value={draft.host}
                    />
                    {findButton}
                  </div>
                  {canFind && found?.network.length ? (
                    <div className="flex flex-wrap gap-1">
                      {found.network.map((printer) => (
                        <Button
                          data-testid={`print-sticker-lines-found-${printer.host}`}
                          key={printer.host}
                          onClick={() => update({ host: printer.host })}
                          size="sm"
                          variant={
                            draft.host === printer.host
                              ? "default"
                              : "secondary"
                          }
                        >
                          {printer.host}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </Field>
              )}
            </>
          )}

          <div className="flex flex-col gap-3 border-t pt-3">
            <span className="text-sm font-medium">
              {tag["StickerHeader.PrintLabels.Alignment"]}
            </span>
            <p className="text-muted-foreground text-xs">
              {tag["StickerHeader.PrintLabels.AlignmentHelp"]}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {mmField(
                "offsetXmm",
                "print-sticker-lines-offset-x",
                tag["StickerHeader.PrintLabels.OffsetX"]
              )}
              {mmField(
                "offsetYmm",
                "print-sticker-lines-offset-y",
                tag["StickerHeader.PrintLabels.OffsetY"]
              )}
            </div>
            <Button
              data-testid="print-sticker-lines-alignment-test"
              disabled={!candidate || isTesting}
              onClick={handleAlignmentTest}
              variant="outline"
            >
              {tag["StickerHeader.PrintLabels.AlignmentTest"]}
            </Button>
          </div>

          <Collapsible
            className="border-t pt-3"
            onOpenChange={setAdvancedOpen}
            open={advancedOpen || doesNotFit}
          >
            <CollapsibleTrigger
              className="group flex w-full items-center gap-1 text-left text-sm font-medium"
              data-testid="print-sticker-lines-advanced"
            >
              <LucideChevronRight className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
              {tag["StickerHeader.PrintLabels.Advanced"]}
            </CollapsibleTrigger>
            <CollapsibleContent className="grid grid-cols-2 gap-3 pt-3">
              <Field
                id="print-sticker-lines-dpi"
                label={tag["StickerHeader.PrintLabels.Resolution"]}
              >
                <Select
                  onValueChange={(v) =>
                    update({ dpi: v as ProfileDraft["dpi"] })
                  }
                  value={draft.dpi}
                >
                  <SelectTrigger
                    className="w-full"
                    data-testid="print-sticker-lines-dpi"
                    id="print-sticker-lines-dpi"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="203">203</SelectItem>
                    <SelectItem value="300">300</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field
                id="print-sticker-lines-rotation"
                label={tag["StickerHeader.PrintLabels.Rotation"]}
              >
                <Select
                  onValueChange={(v) =>
                    update({ rotation: v as ProfileDraft["rotation"] })
                  }
                  value={draft.rotation}
                >
                  <SelectTrigger
                    className="w-full"
                    data-testid="print-sticker-lines-rotation"
                    id="print-sticker-lines-rotation"
                  >
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
              {mmField(
                "labelWidthMm",
                "print-sticker-lines-label-width",
                tag["StickerHeader.PrintLabels.LabelWidth"]
              )}
              {mmField(
                "labelHeightMm",
                "print-sticker-lines-label-height",
                tag["StickerHeader.PrintLabels.LabelHeight"]
              )}
              {mmField(
                "headWidthMm",
                "print-sticker-lines-head-width",
                tag["StickerHeader.PrintLabels.HeadWidth"]
              )}
              <Field
                id="print-sticker-lines-media"
                label={tag["StickerHeader.PrintLabels.Media"]}
              >
                <Select
                  onValueChange={(v) =>
                    update({ media: v as ProfileDraft["media"] })
                  }
                  value={draft.media}
                >
                  <SelectTrigger
                    className="w-full"
                    data-testid="print-sticker-lines-media"
                    id="print-sticker-lines-media"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="printer">
                      {mediaLabels.printer}
                    </SelectItem>
                    <SelectItem value="ribbon">{mediaLabels.ribbon}</SelectItem>
                    <SelectItem value="direct">{mediaLabels.direct}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </CollapsibleContent>
          </Collapsible>

          {!candidate ? (
            <p className="text-destructive text-sm">
              {tag["StickerHeader.PrintLabels.InvalidPrinter"]}
            </p>
          ) : doesNotFit ? (
            <p className="text-destructive text-sm">
              {tag["StickerHeader.PrintLabels.DoesNotFit"]}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              data-testid="print-sticker-lines-cancel-printer"
              onClick={() => setDraft(null)}
              variant="ghost"
            >
              {t.Default["Cancel"]}
            </Button>
            <Button
              data-testid="print-sticker-lines-save-printer"
              disabled={!candidate}
              onClick={handleSave}
            >
              {tag["StickerHeader.PrintLabels.SavePrinter"]}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <Sheet
      onOpenChange={(open) => {
        if (open && helperMissing) onCheckHelper();
        if (open && canSearch && search.phase !== "searching") runSearch();
        if (!open) setSetupFor(null);
      }}
    >
      <SheetTrigger
        asChild
        data-testid="print-sticker-lines-manage-printers-trigger"
      >
        <Button
          data-testid="print-sticker-lines-manage-printers"
          variant="outline"
        >
          <LucideSettings2 />
          {tag["StickerHeader.PrintLabels.ManagePrinters"]}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[480px] overflow-y-auto sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>
            {tag["StickerHeader.PrintLabels.ManagePrinters"]}
          </SheetTitle>
          <SheetDescription>
            {tag["StickerHeader.PrintLabels.ManagePrintersDescription"]}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 p-4 pt-0">
          {helperMissing ? (
            <HelperMissingNotice
              checking={helperChecking}
              onCheckAgain={onCheckHelper}
              testIdPrefix="print-sticker-lines-sheet"
            />
          ) : null}

          {canSearch && !setupFor ? (
            <FoundPrinters
              onSearch={runSearch}
              onUse={startSetup}
              profiles={profiles}
              search={search}
            />
          ) : null}

          {profiles.length > 0 && !setupFor ? (
            <ul className="divide-y rounded-md border">
              {profiles.map((profile) => (
                <li
                  className={cn(
                    "flex items-center gap-2 py-1 pl-3 pr-1",
                    draft?.id === profile.id && "bg-muted"
                  )}
                  key={profile.id}
                >
                  <div className="flex min-w-0 grow flex-col">
                    <span className="truncate text-sm font-medium">
                      {profile.name}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {profile.target.kind === "network"
                        ? profile.target.host
                        : profile.target.kind === "queue"
                          ? profile.target.name
                          : profile.target.lastAddress?.host ??
                            tag[
                              "StickerHeader.PrintLabels.Search.FoundAutomatically"
                            ]}
                    </span>
                  </div>
                  <Button
                    aria-label={tag["StickerHeader.PrintLabels.EditPrinter"]}
                    data-testid={`print-sticker-lines-edit-printer-${profile.id}`}
                    onClick={() => openDraft(draftFromProfile(profile))}
                    size="icon"
                    title={tag["StickerHeader.PrintLabels.EditPrinter"]}
                    variant="ghost"
                  >
                    <LucidePencil />
                  </Button>
                  <Button
                    aria-label={tag["StickerHeader.PrintLabels.DeletePrinter"]}
                    className="text-destructive hover:text-destructive"
                    data-testid={`print-sticker-lines-delete-printer-${profile.id}`}
                    onClick={() => {
                      if (draft?.id === profile.id) setDraft(null);
                      onProfilesChange(
                        profiles.filter((p) => p.id !== profile.id)
                      );
                    }}
                    size="icon"
                    title={tag["StickerHeader.PrintLabels.DeletePrinter"]}
                    variant="ghost"
                  >
                    <LucideTrash2 />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          {setupFor ? (
            <PrinterSetup
              found={setupFor}
              onCancel={() => setSetupFor(null)}
              onSave={handleSetupSave}
              onSendTestLabel={onSendTestLabel}
              profileId={setupId}
            />
          ) : canSearch ? (
            <Collapsible
              className="border-t pt-3"
              onOpenChange={setManualOpen}
              open={manualOpen || draft !== null}
            >
              <CollapsibleTrigger
                className="group flex w-full items-center gap-1 text-left text-sm font-medium"
                data-testid="print-sticker-lines-by-hand"
              >
                <LucideChevronRight className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
                {tag["StickerHeader.PrintLabels.Search.ByHand"]}
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-4 pt-3">
                {manualForm}
              </CollapsibleContent>
            </Collapsible>
          ) : (
            manualForm
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 5: The dialog:**
  - error messages;
  - saving a moved address;
  - sending the setup's test label;
  - a printer's roll setting the background toggle.

```diff
diff --git a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/print-sticker-lines.tsx b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/print-sticker-lines.tsx
index da27333c4..2e5203dc1 100644
--- a/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/print-sticker-lines.tsx
+++ b/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/print-sticker-lines.tsx
@@ -62,7 +62,12 @@ import { ARTWORK_SUPERSAMPLE } from "./zpl/artwork";
 import { DESIGN_SIZE_MM, mmToDots } from "./zpl/geometry";
 import { artworkCommandFor, buildJobs, LABELS_PER_JOB } from "./zpl/jobs";
 import { LAYOUTS, type LayoutKind } from "./zpl/layouts";
-import { loadProfiles, saveProfiles, type PrinterProfile } from "./zpl/profile";
+import {
+  loadProfiles,
+  saveProfiles,
+  type PrinterAddress,
+  type PrinterProfile,
+} from "./zpl/profile";
 import { profileFitsDesign } from "./zpl/profile-draft";
 import { qrMagnification, qrModuleCount, qrSizeMm } from "./zpl/qr";
 
@@ -365,6 +370,9 @@ export function PrintStickerLines() {
       tag["StickerHeader.PrintLabels.Error.PrinterUnreachable"],
     "printer-timeout": tag["StickerHeader.PrintLabels.Error.PrinterTimeout"],
     "network-blocked": tag["StickerHeader.PrintLabels.Error.NetworkBlocked"],
+    "printer-not-found": tag["StickerHeader.PrintLabels.Error.PrinterNotFound"],
+    "not-a-label-printer":
+      tag["StickerHeader.PrintLabels.Error.NotALabelPrinter"],
     unknown: tag["StickerHeader.PrintLabels.Error.Unknown"],
   };
   const errorMessage = (error: unknown) =>
@@ -469,12 +477,45 @@ export function PrintStickerLines() {
     if (!next.some((p) => p.id === printerId)) setPrinterId(BROWSER_PRINT);
   }
 
+  /** The helper re-found a saved printer elsewhere: keep its new address. */
+  function handleMoved(profileId: string, address: PrinterAddress) {
+    const next = profiles.map((p) =>
+      p.id === profileId && p.target.kind === "found"
+        ? { ...p, target: { ...p.target, lastAddress: address } }
+        : p
+    );
+    if (next.every((p, i) => p === profiles[i])) return;
+    setProfiles(next);
+    saveProfiles(browserStorage(), next);
+    toast.info(tag["StickerHeader.PrintLabels.PrinterMoved"]);
+  }
+
+  const sendFor = (profile: PrinterProfile) =>
+    senderFor(profile, browserFetch, (address) =>
+      handleMoved(profile.id, address)
+    );
+
+  async function handleSendTestLabel(
+    profile: PrinterProfile,
+    zpl: string
+  ): Promise<boolean> {
+    try {
+      await sendFor(profile)({
+        zpl: `${zpl}\n`,
+        firstIndex: 0,
+        lastIndex: 0,
+        labelCount: 1,
+      });
+      return true;
+    } catch (error) {
+      toast.error(errorMessage(error));
+      return false;
+    }
+  }
+
   async function handleAlignmentTest(profile: PrinterProfile) {
     try {
-      await senderFor(
-        profile,
-        browserFetch
-      )({
+      await sendFor(profile)({
         zpl: `${buildAlignmentTestZpl(profile, layoutKind)}\n`,
         firstIndex: 0,
         lastIndex: 0,
@@ -534,7 +575,7 @@ export function PrintStickerLines() {
       return;
     }
 
-    const result = await runPrintJobs(jobs, senderFor(profile, browserFetch), {
+    const result = await runPrintJobs(jobs, sendFor(profile), {
       signal: controller.signal,
       onProgress: (progress) => {
         if (isCurrent()) setZplRun({ phase: "printing", progress });
@@ -618,6 +659,11 @@ export function PrintStickerLines() {
                 setPrinterId(value);
                 setZplRun({ phase: "idle" });
                 if (value !== BROWSER_PRINT) setOptimizeForA4(false);
+                // A blank roll only makes a sticker with the artwork on it.
+                const roll = profiles.find((p) => p.id === value)?.roll;
+                if (roll && (roll === "blank") !== withBackground) {
+                  handleBackgroundChange(roll === "blank");
+                }
               }}
               profiles={profiles}
               value={printerId}
@@ -630,6 +676,7 @@ export function PrintStickerLines() {
                 onAlignmentTest={handleAlignmentTest}
                 onCheckHelper={() => checkHelper(10_000)}
                 onProfilesChange={handleProfilesChange}
+                onSendTestLabel={handleSendTestLabel}
                 profiles={profiles}
               />
             )}
```

- [ ] **Step 6: Gates:**
  - `pnpm --filter web type-check` → 0;
  - `cd apps/web && npx eslint "src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components"` → 0 errors (the existing `<img>` warning only);
  - `pnpm --filter web test:unit` → 0 fail;
  - `pnpm i18n:missing` → NEEDS_KEY 0;
  - `pnpm i18n:unused` → the Task 0 baseline.

- [ ] **Step 7: Commit:**

```bash
git add "apps/web/src/language-data/unirefund/TagService/resources/en.json" "apps/web/src/language-data/unirefund/TagService/resources/tr.json" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/found-printers.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/printer-setup.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/manage-printers-sheet.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/print-sticker-lines.tsx"
git commit -F - <<'EOF'
feat(stickers): set up a found label printer in one click

The printer sheet searches through the Print Helper when it opens and lists label printers first; Use this printer asks only what the printer could not say, prints one test label and offers arrow buttons until it lands right. A printer set up for blank labels turns the background on, and a printer the helper re-found elsewhere is saved with its new address. Helpers without search keep the sheet as it was.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```


### Task 5: Walkthrough (controller)

Use the dev server on this worktree, logged in as admin on Faroe Islands, with book `dd76f22b-5520-13bb-54eb-3a237377b232`.

- **With helper 1.1.0** (the companion plan's build; the user stops their installed 1.0.0 first, or the 1.1.0 installer replaces it):
  - opening Manage printers lists the office Argox as a label printer, and the Canon under "Other printers";
  - **Use this printer** → roll question → test label (a frame on a blank roll) → Yes. The printer is saved and the card shows **Added**;
  - choosing it in the dialog turns **Add background** on, and printing a book sends `printerId` and `lastAddress`.
- **Not printable here:** the moved-address path and the not-found message, unless the Argox's IP changes. Simulate them by routing the helper's `/print` in the test browser, as when the plan was verified.
- **Review Focus checks:**
  - closing the sheet mid-setup saves nothing (3);
  - a printer saved before this change still prints (1);
  - two found printers with the same name both appear with their addresses (5, simulated).
- **With an older helper** (or `features` without `"search"`): the sheet is unchanged, with no search and no "Add a printer by hand" section.
