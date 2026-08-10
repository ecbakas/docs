# File-URL Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One module owns the shape of a `/api/file/[fileId]` URL, so no call site hand-rolls encoding or query strings, and downloads start without opening a throwaway tab.

**Architecture:** A new three-function module in `apps/web/src/utils/`, then three call sites switched over to it. No API, route or component behaviour changes beyond the download trigger.

**Tech Stack:** Next.js App Router, React 19, TypeScript, pnpm workspaces.

**Spec:** `c:/unirefund/docs/superpowers/specs/2026-08-07-web-file-url-helper-design.md`

## Global Constraints

- **Import the new module as `@/src/utils/utils-file`.** This matters and is easy to get wrong: `@/utils` maps to `./src/utils`, which TypeScript resolves to the **file** `src/utils.ts` (where the unrelated `downloadFile` lives). The established style for the utils **directory** is `@/src/utils/utils-date` — three existing call sites prove it. Follow that.
- **Do not touch `apps/web/src/app/api/file/[fileId]/route.ts`.** The proxy is correct; this change only alters how callers address it.
- **Do not touch `downloadFile` in `apps/web/src/utils.ts`.** It is a different concept (in-memory `BlobPart` → object URL) with three existing consumers.
- **The anchor must not carry a `download` attribute.** On a same-origin link it overrides the server's `Content-Disposition` filename, routing around `safeFilename` in the route, which exists to keep CR/LF and quotes out of that header. The server stays authoritative.
- **No new dependencies.** No UI library, no URL library — `URLSearchParams` is built in.
- **`data-testid` rule:** the repo's `react-require-testid` ESLint rule applies to `Button`, `Input`, `Label` and similar components. This change adds no such components, but do not remove any existing `data-testid`.
- **There is no unit-test runner for `apps/web`.** Its `test` script is Playwright e2e against a live deployed environment; the only Jest suite is in the `packages/ayasofyazilim-ui` git submodule (a separate repository). **Write no test files — nothing would run them.** Verification is typecheck, lint and a manual check.
- `packages/ayasofyazilim-ui` and `packages/utils` are **git submodules for separate repositories** — never edit them.
- **Baseline gate:** capture `pnpm --filter web type-check` and `pnpm --filter web lint` before editing, and gate on "no worse than baseline".

---

### Task 0: Branch and baseline

**Files:** none modified.

**Interfaces:**
- Consumes: nothing.
- Produces: a clean branch and a recorded baseline.

- [ ] **Step 1: Check the checkout is clean and safe to branch from**

```bash
cd c:/unirefund/web-app
git status --short
git branch --show-current
```

**This checkout is shared** — other sessions have moved it between branches during the day. If `git status --short` shows **any** modified or staged files, **stop and report** rather than branching over someone else's work. Untracked files alone are acceptable.

- [ ] **Step 2: Branch from `origin/main`**

```bash
git fetch origin
git checkout -b fix/web-file-url-helper origin/main
```

Branching from `origin/main` rather than the current branch keeps this change independent of any feature branch in flight.

A full git worktree is deliberately **not** used here: this repo's worktrees need submodule initialisation, a fresh `pnpm install`, and copied gitignored artifacts before they even typecheck — disproportionate setup for a four-file change.

- [ ] **Step 3: Generate `next-env.d.ts` if it is missing**

```bash
ls apps/web/next-env.d.ts
```

If absent, run `pnpm --filter web dev` briefly (or `pnpm --filter web build`) to generate it, then stop the server. That file is gitignored and carries the `next/image-types/global` reference declaring `*.svg` modules; without it `tsc` reports phantom "Cannot find module '…/*.svg'" errors that have nothing to do with your change.

- [ ] **Step 4: Record the baseline**

```bash
pnpm --filter web type-check 2>&1 | tail -6
pnpm --filter web lint 2>&1 | tail -6
```

Save both outputs verbatim in the task report. Every later task gates on "no worse than this", not on zero.

---

### Task 1: The `utils-file` module

**Files:**
- Create: `apps/web/src/utils/utils-file.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all exported from `@/src/utils/utils-file`:
  - `fileViewUrl(fileId: string): string`
  - `fileDownloadUrl(fileId: string, fileName?: string | null): string`
  - `startFileDownload(fileId: string, fileName?: string | null): void`

  All three are used by Task 2.

The filename follows the directory's `utils-<domain>.ts` convention (`utils-date.ts`, `utils-number.ts`).

The `fileName` parameter is `string | null | undefined` on purpose: the file-list row types it as `blobName?: string | null`, while the verification row types it as `fileName: string`. One signature serves both.

- [ ] **Step 1: Write the module**

```ts
/**
 * URLs for the file proxy at `/api/file/[fileId]`.
 *
 * The proxy exists so the browser never sees a presigned storage URL: it
 * re-signs server-side, strips upstream storage headers, and forces
 * `Cache-Control: private, no-store`. Every caller should address files
 * through here rather than building the path by hand.
 */

/** Inline view URL - for `DocumentViewer`, `<img>`, pdf.js and the like. */
export function fileViewUrl(fileId: string): string {
  // The route validates the id's shape and 400s otherwise, so this is defence
  // rather than a live bug - but a URL builder should not lean on its server's
  // validation.
  return `/api/file/${encodeURIComponent(fileId)}`;
}

/**
 * Download URL: same proxy, `Content-Disposition: attachment`.
 *
 * `URLSearchParams` owns the encoding and the `?`/`&` joining, so no caller
 * writes `encodeURIComponent` again and a future parameter cannot produce a
 * malformed query string. A blank or missing `fileName` omits the parameter
 * entirely; the route then falls back to the file id.
 */
export function fileDownloadUrl(
  fileId: string,
  fileName?: string | null
): string {
  const params = new URLSearchParams({ download: "1" });
  if (fileName) params.set("name", fileName);
  return `${fileViewUrl(fileId)}?${params}`;
}

/**
 * Start a download.
 *
 * A synthetic anchor click rather than `window.open(..., "_blank")`: the
 * response is already an attachment, so a new window is never navigated and
 * closes immediately - a visible flicker, and needless exposure to popup
 * blockers for a user-initiated download.
 *
 * Deliberately no `download` attribute. On a same-origin link it OVERRIDES the
 * server's `Content-Disposition` filename, which the route builds through
 * `safeFilename` precisely to keep CR/LF and quotes out of that header. The
 * server stays authoritative for the saved name.
 *
 * Client-only - it touches `document`.
 */
export function startFileDownload(
  fileId: string,
  fileName?: string | null
): void {
  // The doc comment explains why this is client-only; this enforces it. Without
  // the guard a server-side call throws a bare "document is not defined", which
  // says nothing about the actual mistake.
  if (typeof document === "undefined") {
    throw new Error(
      "startFileDownload is client-only - it needs `document`. Call it from a " +
        '"use client" component, or use fileDownloadUrl() to build the URL on ' +
        "the server."
    );
  }

  const link = document.createElement("a");
  link.href = fileDownloadUrl(fileId, fileName);
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
```

- [ ] **Step 2: Sanity-check the builders by hand**

There is no test runner, so verify the output once before trusting it:

```bash
cd apps/web && npx tsx -e "import {fileViewUrl as v, fileDownloadUrl as d} from './src/utils/utils-file.ts'; console.log(JSON.stringify([v('abc-123'), d('abc-123'), d('abc-123','my report.pdf'), d('abc-123',null), d('abc-123','')]));"
```

Expected output exactly:

```
["/api/file/abc-123","/api/file/abc-123?download=1","/api/file/abc-123?download=1&name=my+report.pdf","/api/file/abc-123?download=1","/api/file/abc-123?download=1"]
```

Read those: a plain view URL; a download URL with no name when none is given; a name that is **URL-encoded with `+` for the space** (`URLSearchParams` uses form encoding — the route reads it back through `searchParams.get("name")`, which decodes it correctly); and both `null` and `""` omitting the parameter rather than sending `name=`.

**Paste this output verbatim into your report.**

- [ ] **Step 3: Verify**

```bash
pnpm --filter web type-check 2>&1 | tail -5
pnpm --filter web lint 2>&1 | tail -5
```
Expected: no worse than the Task 0 baseline.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/utils/utils-file.ts
git commit -m "feat(web): add file proxy URL helpers"
```

---

### Task 2: Switch the three call sites

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/file/list/_components/table.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/file/verification/_components/table.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/file/verification/[fileId]/verify/page.tsx`

**Interfaces:**
- Consumes: `fileViewUrl` and `startFileDownload` from Task 1.
- Produces: nothing.

All three currently build the URL inline. **The paths contain `[lang]`, `(main)`, `(unirefund)` and `[fileId]` — quote them in shell commands.**

- [ ] **Step 1: `file/list/_components/table.tsx`**

Add to the imports:

```ts
import { startFileDownload } from "@/src/utils/utils-file";
```

Replace the download row action's `onClick` body. It currently reads:

```ts
onClick: (row) => {
  const name = encodeURIComponent(row.blobName ?? "");
  window.open(
    `/api/file/${row.id}?download=1&name=${name}`,
    "_blank"
  );
},
```

with:

```ts
onClick: (row) => {
  startFileDownload(row.id, row.blobName);
},
```

Note `row.blobName` is passed straight through rather than `?? ""`. It is typed `string | null | undefined`, and the helper omits the parameter when it is falsy — where the old code sent `name=` with an empty value. The route falls back to the file id either way, so the saved filename does not change.

- [ ] **Step 2: `file/verification/_components/table.tsx`**

Add to the imports:

```ts
import { startFileDownload } from "@/src/utils/utils-file";
```

Replace the download row action's `onClick` body. It currently reads:

```ts
onClick: (row) => {
  const name = encodeURIComponent(row.fileName);
  window.open(
    `/api/file/${row.fileId}?download=1&name=${name}`,
    "_blank"
  );
},
```

with:

```ts
onClick: (row) => {
  startFileDownload(row.fileId, row.fileName);
},
```

Note this row uses `row.fileId` (not `row.id`) and `row.fileName` (not `row.blobName`) — the two grids carry different DTOs. Do not "unify" the field names.

- [ ] **Step 3: `file/verification/[fileId]/verify/page.tsx`**

Add to the imports:

```ts
import { fileViewUrl } from "@/src/utils/utils-file";
```

Change the single line:

```ts
const fileUrl = presignedUrl ? `/api/file/${fileId}` : "";
```

to:

```ts
const fileUrl = presignedUrl ? fileViewUrl(fileId) : "";
```

**Keep the conditional and the comment above it exactly as they are.** That comment explains that `presignedUrl` is read only as a "does a blob exist?" signal and never reaches the client — this change alters the string construction and nothing else. This is a server component, and `fileViewUrl` is pure, so there is no client/server issue.

- [ ] **Step 4: Confirm nothing hand-builds the URL any more**

```bash
grep -rn '/api/file/' apps/web/src --include=*.ts --include=*.tsx
```

Expected: **every remaining match is inside `apps/web/src/utils/utils-file.ts`** — currently two lines there, one in its doc comment and one in the `fileViewUrl` implementation.

Before this change the same grep returns those two plus exactly three more — the call sites you are replacing. The route itself never spells the path out, so it does not appear either way. What matters is the *location* of the matches, not the count: **any remaining match under a `file/` page or component means a call site was missed.** Paste the output into your report.

- [ ] **Step 5: Verify**

```bash
pnpm --filter web type-check 2>&1 | tail -5
pnpm --filter web lint 2>&1 | tail -5
```
Expected: no worse than the Task 0 baseline. In particular, `window.open` and `encodeURIComponent` should no longer appear in either table file — check with:

```bash
grep -n "window.open\|encodeURIComponent" "apps/web/src/app/[lang]/(main)/(unirefund)/file/list/_components/table.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/file/verification/_components/table.tsx"
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/file/list/_components/table.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/file/verification/_components/table.tsx" "apps/web/src/app/[lang]/(main)/(unirefund)/file/verification/[fileId]/verify/page.tsx"
git commit -m "refactor(web): address the file proxy through the shared URL helpers"
```

---

### Task 3: Check it in a browser

**Files:** none.

**Interfaces:**
- Consumes: the finished change.
- Produces: the only behavioural verification this change gets.

`apps/web` has no unit-test runner, so typecheck and lint are the only automated gates and neither exercises the download trigger. The trigger is also the one thing whose behaviour actually changed — from `window.open` to a synthetic anchor click.

- [ ] **Step 1: Run the app**

```bash
pnpm --filter web dev
```

- [ ] **Step 2: Check both download paths and the viewer**

Confirm and report each:

- **File list** → Download on a row: the file saves, with the same filename as before, and **no blank tab flashes open**.
- **Verification list** → Download on a row: same.
- A row whose `blobName` is empty still downloads, named after the file id rather than failing.
- **Verification viewer**: open a file and confirm it still renders inline (this exercises `fileViewUrl`).
- Check the browser's Network tab on one download: the request goes to `/api/file/…?download=1&name=…`, and the response carries `Content-Disposition: attachment`.

- [ ] **Step 3: Report honestly**

State which checks you ran and which you could not — for example, no row with an empty `blobName` on the test data. Do not claim a check you did not perform; with no automated coverage, an unperformed check means that path is unverified.

---

## Definition of done

- [ ] `pnpm --filter web type-check` — no worse than the Task 0 baseline
- [ ] `pnpm --filter web lint` — no worse than the Task 0 baseline
- [ ] `grep -rn '/api/file/' apps/web/src` leaves matches only inside `utils-file.ts` — none under any `file/` page or component
- [ ] Two commits (Tasks 1 and 2; Tasks 0 and 3 produce none), each staging only its own explicit paths
- [ ] No file under `packages/ayasofyazilim-ui/` or `packages/utils/` modified — both are separate repositories
- [ ] Task 3 walked in a browser, with any unperformed check named
