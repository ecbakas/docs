# Next.js File Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the browser ever seeing a Wasabi S3 presigned URL for files addressed by `fileId`, by serving those files through an authenticated Next.js route handler that streams the bytes.

**Architecture:** A new route handler at `GET /api/file/[fileId]` authenticates the session, calls the existing `getFilePresignedUrlApi` server action to resolve a presigned URL, `fetch`es it, and pipes the upstream response body straight back to the client. The three call sites that currently expose presigned URLs switch to this same-origin path. The presigned URL never leaves the server process.

**Tech Stack:** Next.js 16 App Router route handlers, next-auth v5 (`auth()`), TypeScript, pnpm + Turborepo monorepo.

**Spec:** `docs/superpowers/specs/2026-08-05-nextjs-file-proxy-design.md`

## Global Constraints

- **Repo:** all work happens in the `web-app` git repo (`c:\unirefund\web-app`). It is a separate git repo from `docs`. Run all commands from the `web-app` root.
- **Never call SDK clients directly from app code.** All API access goes through server actions in `@repo/actions`. Enforced by `web-app/.claude/rules/api-actions.md`.
- **No new i18n keys in this plan.** All user-visible strings reused are already present. Do not add keys, so `pnpm run init` is never required.
- **No new `data-testid` targets in this plan.** No components from the required list in `web-app/.claude/rules/data-testid.md` are added.
- **No `useEffect`.** Per `web-app/.claude/rules/avoid-use-effect.md`.
- **UUID shape check must be `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`** — NOT a version-aware UUID validator. Real IDs in this system are not RFC 4122 v1–v5 (e.g. `172f8e7a-16e8-8a7e-36ac-3a1f82881a9b` has version nibble `8`) and a strict validator rejects them.
- **Filename sanitization is exactly:** replace every character outside `[\w .\-()]` with `_`, cap at 200 characters, fall back to the `fileId` when the result is empty or the param is absent.
- **`Cache-Control: private, no-store`** on every proxy response.
- **Never forward `x-amz-*` headers** from the upstream S3 response to the client.
- **No `Accept-Ranges` header and no `Range` passthrough** in this implementation. Deliberate — see spec.
- **`apps/web` has no unit-test runner.** Verification is `pnpm run build`, `pnpm run type-check` (or the repo's equivalent — discover it in Task 1 Step 1), plus the manual checks in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/app/api/file/[fileId]/route.ts` | **Create.** The whole proxy: validate, authenticate, resolve, stream. Single responsibility, ~70 lines. |
| `apps/web/src/app/[lang]/(main)/(unirefund)/file/verification/[fileId]/verify/page.tsx` | **Modify** lines 46–58. Demote `presignedUrl` to a boolean; point the viewer at the proxy. |
| `apps/web/src/app/[lang]/(main)/(unirefund)/file/list/_components/table.tsx` | **Modify** lines 4, 47–59. Row action opens the proxy instead of resolving a presigned URL client-side. |
| `apps/web/src/app/[lang]/(main)/(unirefund)/file/verification/_components/table.tsx` | **Modify** lines 4–7, 123–135. Same change, different id/name fields. |

No helper module is extracted. The sanitizer and the UUID check are each two lines and have exactly one caller; a shared file would be indirection without reuse.

---

## Task 1: The proxy route handler

**Files:**
- Create: `apps/web/src/app/api/file/[fileId]/route.ts`
- Test: none — `apps/web` has no unit-test runner. Verified by type-check, build, and `curl` in Step 6.

**Interfaces:**
- Consumes:
  - `auth` from `@repo/utils/auth/next-auth` — next-auth v5 result; `await auth()` returns `Session | null`.
  - `getFilePresignedUrlApi` from `@repo/actions/unirefund/FileService/actions` — signature `(id: string, session?: Session | null)`. On success returns `{ type: "success", data: string, message: "" }`; on failure returns a `structuredError` object whose `type` is not `"success"`.
- Produces: the HTTP contract that Tasks 2–4 consume:
  - `GET /api/file/{fileId}` → 200, `Content-Disposition: inline`
  - `GET /api/file/{fileId}?download=1&name={encoded}` → 200, `Content-Disposition: attachment; filename="{sanitized}"`
  - 400 malformed id · 401 no session · 404 no URL resolvable · 502 upstream failure

- [ ] **Step 1: Discover the verification commands**

Read `apps/web/package.json` and the repo root `package.json`. Note the exact script names for building and type-checking `apps/web` (the repo is Turborepo-based, so the root may expose `pnpm run build --filter=web` or similar). Write them down — every later "Run:" step in this plan that says `<BUILD>` or `<TYPECHECK>` means the commands you found here.

Do not guess. If no separate type-check script exists, `<TYPECHECK>` is `npx tsc --noEmit -p apps/web/tsconfig.json`.

- [ ] **Step 2: Create the route handler**

Create `apps/web/src/app/api/file/[fileId]/route.ts` with exactly this content:

```ts
import { getFilePresignedUrlApi } from "@repo/actions/unirefund/FileService/actions";
import { auth } from "@repo/utils/auth/next-auth";
import type { NextRequest } from "next/server";

// Matches the hex shape of an id without asserting RFC 4122 semantics. Real
// ids in this system are not v1-v5 UUIDs, so a version-aware validator would
// reject them. This exists only to keep junk out of the upstream call.
const ID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `name` arrives from the client, so it is untrusted. Collapsing everything
// outside this class to "_" keeps CR/LF and quotes out of the header, which is
// what stops a crafted value from injecting or escaping Content-Disposition.
function safeFilename(raw: string | null, fallback: string) {
  const cleaned = (raw ?? "").replace(/[^\w .\-()]/g, "_").slice(0, 200);
  return cleaned.length > 0 ? cleaned : fallback;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;
  if (!ID_SHAPE.test(fileId)) {
    return new Response("Bad Request", { status: 400 });
  }

  const session = await auth();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const presigned = await getFilePresignedUrlApi(fileId, session);
  if (presigned.type !== "success" || !presigned.data) {
    // A missing blob and a missing permission collapse to the same 404 on
    // purpose: telling them apart would confirm the file exists.
    return new Response("Not Found", { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(presigned.data as string, { cache: "no-store" });
  } catch (error) {
    console.error(`[file-proxy] fetch failed for ${fileId}`, error);
    return new Response("Bad Gateway", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    console.error(`[file-proxy] upstream ${upstream.status} for ${fileId}`);
    return new Response("Bad Gateway", { status: 502 });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    upstream.headers.get("Content-Type") ?? "application/octet-stream"
  );
  const contentLength = upstream.headers.get("Content-Length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }
  headers.set(
    "Content-Disposition",
    request.nextUrl.searchParams.get("download") === "1"
      ? `attachment; filename="${safeFilename(
          request.nextUrl.searchParams.get("name"),
          fileId
        )}"`
      : "inline"
  );
  headers.set("Cache-Control", "private, no-store");

  // Only the headers built above are sent. Upstream x-amz-* headers are
  // dropped so bucket and storage details never reach the client. No
  // Accept-Ranges, so pdf.js does one full fetch instead of chunked requests
  // that would each need their own re-sign call.
  return new Response(upstream.body, { status: 200, headers });
}
```

Three things to be careful about, because the sibling handlers get them wrong or differ:

1. **Do not add `"use server"`.** `apps/web/src/app/api/auth/reset-password/route.ts` has it, but that directive marks exports as server *actions* and does not belong in a route handler. Omit it.
2. **Do not `return fetch(...)` directly** the way `reset-password/route.ts` does. That forwards every upstream header, including `x-amz-*`. Build a fresh `Headers` as above.
3. **`params` is a Promise** in Next.js 16 and must be awaited.

- [ ] **Step 3: Type-check**

Run: `<TYPECHECK>` (from Step 1)
Expected: PASS with no errors in `route.ts`.

If `presigned.data` errors on the `as string` cast, check what `getApiFileServiceFilesByIdPresignedUrl` is typed to return in `packages/saas/FileService/sdk.gen.ts` and narrow accordingly rather than widening to `any`.

- [ ] **Step 4: Build**

Run: `<BUILD>` (from Step 1)
Expected: PASS. The new route appears in the build output route list as `/api/file/[fileId]`.

If the build reports a route conflict with `[lang]`, stop — that would contradict the spec's assumption. The existing `api/health` and `api/session` handlers prove the literal `api` segment wins, so a conflict means something else is wrong.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/file/[fileId]/route.ts
git commit -m "feat(web): add authenticated file proxy route

Streams file bytes from storage through Next instead of handing a
presigned S3 URL to the browser."
```

- [ ] **Step 6: Verify the route by hand**

Start the dev server (the script name is in `apps/web/package.json`, typically `pnpm run dev`).

Run these and confirm each status:

```bash
# malformed id -> 400
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/api/file/not-a-uuid'

# well-formed id, no session cookie -> 401
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/api/file/00000000-0000-0000-0000-000000000000'
```

Expected: `400` then `401`.

Then sign in through the browser and open `/api/file/<a real fileId>` in a tab. Expected: the PDF renders in the browser's native viewer. Check the response headers in devtools: `Content-Disposition: inline`, `Cache-Control: private, no-store`, and **no `x-amz-*` headers**.

Then open `/api/file/<same fileId>?download=1&name=test.pdf`. Expected: the browser downloads it as `test.pdf`.

Do not proceed to Task 2 until all four behaviours are confirmed.

---

## Task 2: Point the verify page at the proxy

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/file/verification/[fileId]/verify/page.tsx:46-58`

**Interfaces:**
- Consumes: `GET /api/file/{fileId}` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace the fileUrl derivation**

In `page.tsx`, replace this block:

```tsx
  const [fileResponse] = apiRequests.requiredRequests;
  const selectedFile = fileResponse.data;
  // The detail endpoint now returns the presigned URL itself, so there is no
  // second round trip to make. It is null when the file has no stored blob or
  // the URL could not be signed - the rest of the payload still arrives, which
  // is why that case falls through to the empty state rather than erroring.
  const fileUrl = selectedFile.presignedUrl ?? "";
```

with:

```tsx
  const [fileResponse] = apiRequests.requiredRequests;
  const selectedFile = fileResponse.data;
  // `presignedUrl` is read only as a "does a blob exist?" signal and is never
  // passed to the client - the browser gets the same-origin proxy path
  // instead, so the S3 URL and its embedded signature stay on the server. The
  // field is null when the file has no stored blob or could not be signed, and
  // that case falls through to the empty state rather than erroring.
  const fileUrl = selectedFile.presignedUrl ? `/api/file/${fileId}` : "";
```

`fileId` is already destructured from `params` on line 36, so nothing new is needed.

Leave lines 54–73 completely untouched — the `fileUrl ?` ternary, the `DocumentViewer`, the `Empty` block with `FileXCorner`, and both `t.FileService` keys all keep working unchanged.

- [ ] **Step 2: Type-check**

Run: `<TYPECHECK>`
Expected: PASS.

- [ ] **Step 3: Verify in the browser**

Open the verify page for a file that has a stored blob. Confirm:
- The PDF renders as before.
- **The network tab contains no request to `wasabisys.com`.** The only document request is to `/api/file/<fileId>`.
- View source on the page: search for `wasabisys` and `X-Amz-Signature`. Both must return zero matches.

- [ ] **Step 4: Verify the empty state still works**

Open the verify page for a file whose `presignedUrl` is null (a record with no stored blob). Confirm the `Empty` state with the `FileXCorner` icon and the translated `FileFetchError` message renders, exactly as before the change.

If you cannot find such a record, temporarily hardcode `const fileUrl = "";` to confirm the branch renders, then revert that line before committing.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/file/verification/[fileId]/verify/page.tsx"
git commit -m "refactor(web): serve verify page document via file proxy

The presigned URL now stays server-side and is read only as a
has-blob signal; the viewer loads /api/file/{fileId}."
```

---

## Task 3: Convert the file list table download action

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/file/list/_components/table.tsx:4,47-59`

**Interfaces:**
- Consumes: `GET /api/file/{fileId}?download=1&name={encoded}` from Task 1.
- Row DTO is `UniRefund_FileService_Files_FileResponseListDto`: id field is **`id`**, name field is **`blobName`** (`string | null | undefined`).

- [ ] **Step 1: Replace the row action's onClick**

Replace this `rowActions` entry:

```tsx
        rowActions: [
          {
            icon: DownloadIcon,
            label: t.FileService["Verification.Download"],
            id: "download-file",
            onClick: (row) => {
              void getFilePresignedUrlApi(row.id).then((res) => {
                if (res.type !== "success" || !res.data) return;
                window.open(res.data as string, "_blank");
              });
            },
          },
        ],
```

with:

```tsx
        rowActions: [
          {
            icon: DownloadIcon,
            label: t.FileService["Verification.Download"],
            id: "download-file",
            onClick: (row) => {
              const name = encodeURIComponent(row.blobName ?? "");
              window.open(
                `/api/file/${row.id}?download=1&name=${name}`,
                "_blank"
              );
            },
          },
        ],
```

- [ ] **Step 2: Remove the now-unused import**

Delete line 4 entirely:

```tsx
import { getFilePresignedUrlApi } from "@repo/actions/unirefund/FileService/actions";
```

Leave `getFilePresignedUrlApi` itself in `packages/actions/unirefund/FileService/actions.ts` — the route handler from Task 1 is now its consumer.

- [ ] **Step 3: Lint and type-check**

Run: `<TYPECHECK>`
Expected: PASS.

Also run the repo's lint script for `apps/web`. Expected: PASS, with no `no-unused-vars` complaint about `getFilePresignedUrlApi` (it should be gone) and no `react-require-testid/testid-missing` error (no components from the required list were added).

- [ ] **Step 4: Verify in the browser**

On the file list page, click the download row action. Confirm:
- The file downloads with its real `blobName` as the filename.
- The network tab shows a request to `/api/file/...?download=1` and **no request to `wasabisys.com`**.
- The download is now synchronous — no action round trip before the tab opens.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/file/list/_components/table.tsx"
git commit -m "refactor(web): download files via proxy in file list table

Drops the client-side presigned URL round trip."
```

---

## Task 4: Convert the verification table download action

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/file/verification/_components/table.tsx:4-7,123-135`

**Interfaces:**
- Consumes: `GET /api/file/{fileId}?download=1&name={encoded}` from Task 1.
- Row DTO is `UniRefund_FileService_Files_FileForHumanValidationDto`: id field is **`fileId`**, name field is **`fileName`** (`string`, non-nullable). **These differ from Task 3** — do not copy Task 3's field names.

- [ ] **Step 1: Replace the row action's onClick**

Replace this `rowActions` entry:

```tsx
        rowActions: [
          {
            icon: DownloadIcon,
            label: t.FileService["Verification.Download"],
            id: "download-file",
            onClick: (row) => {
              void getFilePresignedUrlApi(row.fileId).then((res) => {
                if (res.type !== "success" || !res.data) return;
                window.open(res.data as string, "_blank");
              });
            },
          },
        ],
```

with:

```tsx
        rowActions: [
          {
            icon: DownloadIcon,
            label: t.FileService["Verification.Download"],
            id: "download-file",
            onClick: (row) => {
              const name = encodeURIComponent(row.fileName);
              window.open(
                `/api/file/${row.fileId}?download=1&name=${name}`,
                "_blank"
              );
            },
          },
        ],
```

- [ ] **Step 2: Trim the import, keeping the sibling**

This file imports two actions from the same module (lines 4–7). Remove **only** `getFilePresignedUrlApi` and keep `getApiFileTypeGroupsRulesetApi`, collapsing to a single-specifier import:

```tsx
import { getApiFileTypeGroupsRulesetApi } from "@repo/actions/unirefund/FileService/actions";
```

- [ ] **Step 3: Lint and type-check**

Run: `<TYPECHECK>`
Expected: PASS.

Run the lint script for `apps/web`. Expected: PASS.

- [ ] **Step 4: Verify in the browser**

On the file verification list page, click the download row action. Confirm the file downloads with its real `fileName`, and that the network tab shows `/api/file/...?download=1` with **no `wasabisys.com` request**.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/[lang]/(main)/(unirefund)/file/verification/_components/table.tsx"
git commit -m "refactor(web): download files via proxy in verification table

Drops the client-side presigned URL round trip."
```

---

## Task 5: Full verification sweep

**Files:** none modified. This task only runs checks and, if any fail, sends you back to the relevant task.

- [ ] **Step 1: Confirm no presigned URL reaches the client anywhere**

Run from the `web-app` root:

```bash
git grep -n "getFilePresignedUrlApi" -- apps/
```

Expected: **exactly two matches, both in `apps/web/src/app/api/file/[fileId]/route.ts`** — its
import on line 1 and its call inside the handler. That file is the intended and only consumer.

(An earlier revision of this plan wrongly predicted zero matches, on the theory that the route
handler "imports it under a different call shape." It does not — the route handler lives under
`apps/` and imports the symbol by name. Two matches is correct; zero would actually mean the
route handler had lost its import.)

The property this grep really establishes is that **no client component resolves a presigned URL
any more.** So the test is: every match must be inside the route handler. A match anywhere else
under `apps/` — especially in a `"use client"` file — is a missed call site. Report it; convert it
the same way as Task 3 or 4.

Then:

```bash
git grep -n "presignedUrl" -- apps/
```

Expected: matches only in `verify/page.tsx` from Task 2 — its explanatory comments, the
destructure that keeps the field off the `Form` prop, and the has-blob check. Nothing in any
other file.

**This grep is necessary but not sufficient.** It proves no *identifier* named `presignedUrl`
survives outside the page; it cannot prove the *value* never reaches the client, because the
value can travel inside an object. Step 3b covers that.

Note this grep is case-sensitive and will not match `getFilePresignedUrlApi` (capital `P`), which is why Step 1 needs both greps. It also will not match the prose "presigned URL" in `operations/refunds/[refundId]/_components/refund-signatures.tsx:92` — that file is an explicit non-goal in the spec. If a match does appear there, leave it alone.

- [ ] **Step 2: Full build**

Run: `<BUILD>`
Expected: PASS.

- [ ] **Step 3: Full lint**

Run the repo lint script.
Expected: PASS.

- [ ] **Step 3b: Rendered-HTML leak check (the greps in Step 1 cannot do this)**

The text greps in Step 1 only match the literal string `presignedUrl`. They are structurally
blind to a leak that travels as an object — `<Form fileDetails={selectedFile} />` contains no
such substring, yet Next.js serializes the whole runtime object into the flight payload
embedded in the page HTML, narrower client-component prop types notwithstanding. Exactly that
leak was found on the verify page during Task 2 review.

So verify against the **served HTML**, not the source. With a signed-in session cookie:

```bash
curl -s -b "<session cookie>" \
  'http://localhost:3000/en/file/verification/<real fileId>/verify' \
  | grep -c -iE 'X-Amz-Signature|wasabisys'
```

Expected: `0`.

This needs real credentials and a real `fileId`, so it belongs to the manual handoff rather
than to an agent. Any non-zero count means a presigned URL is still crossing the
server/client boundary somewhere on that page — find which prop carries it.

- [ ] **Step 4: Run the manual checklist end to end**

Confirm all six, in one dev-server session:

1. Verify page renders the PDF, no `wasabisys.com` in the network tab, and the Step 3b
   rendered-HTML check returns `0`.
2. `file/list` download action saves with the `blobName` filename.
3. `file/verification` download action saves with the `fileName` filename.
4. `curl` with no session cookie → 401; malformed id → 400.
5. A file with no stored blob → verify page still shows the `Empty` state.

- [ ] **Step 5: Confirm the deferred limitation, do not fix it**

Open the verify page and click `DocumentViewer`'s own download button (the one inside the viewer chrome, from `packages/ayasofyazilim-ui/src/custom/document-viewer/controllers.tsx:67`).

Expected: it downloads, but with a name derived from the URL rather than the real filename. **This is known and accepted** — see "Known limitation" in the spec. Do not modify the shared `ayasofyazilim-ui` package to fix it; that needs a separate `downloadUri` prop and is out of scope.

Note the actual filename the browser chose, so the follow-up ticket can describe it accurately.

- [ ] **Step 6: Report**

State plainly which of the checks in Steps 1–4 passed, with the command output for the build, lint, and `git grep` steps. If any failed, say which and stop rather than claiming completion.

---

## Self-Review Notes

Checked against the spec:

- Route contract, handler flow, response headers, error table → Task 1.
- UUID shape decision, filename sanitization, `Cache-Control` → Global Constraints + Task 1 Step 2.
- No `Accept-Ranges` / no `Range` passthrough → Global Constraints, and the inline comment in Task 1 Step 2 records why.
- Verify page change → Task 2. Both table changes, with their differing id/name fields → Tasks 3 and 4.
- Non-goal `refund-signatures.tsx` → not touched by any task; Task 5 Step 1's `git grep presignedUrl` is scoped to expect the one `verify/page.tsx` match, so a signatures match would surface as a discrepancy to be checked against the non-goal rather than silently ignored.
- Known limitation → explicitly confirmed-not-fixed in Task 5 Step 5.
- Verification section → Task 5.

Type consistency: `getFilePresignedUrlApi(id, session)` and its `{ type, data, message }` return shape are used identically in Task 1's interfaces and body. `row.id`/`row.blobName` (Task 3) and `row.fileId`/`row.fileName` (Task 4) are stated in each task's Interfaces block and again in its code, with an explicit warning in Task 4 not to copy Task 3.
