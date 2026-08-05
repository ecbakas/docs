# Next.js file proxy for verification documents

**Date:** 2026-08-05
**Repo:** `web-app`
**Status:** Design approved, ready for planning

## Problem

The file verification screen hands a Wasabi S3 presigned URL directly to the
browser. `getFileVerificationsByFileIdApi` returns `presignedUrl` on its detail
DTO, and the verify page passes it straight into `DocumentViewer`:

```tsx
// apps/web/src/app/[lang]/(main)/(unirefund)/file/verification/[fileId]/verify/page.tsx:52
const fileUrl = selectedFile.presignedUrl ?? "";
```

A real value looks like:

```
https://s3.eu-central-2.wasabisys.com/unirefund-dev.blobcontainers.filecontainer/tenants/<tenantId>/<fileId>/TaxFreeInvoice/<blobId>.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Expires=86400&X-Amz-Signature=...
```

That URL is a bearer credential. Once it reaches the client it can be copied
out of the network tab or page source and replayed by anyone, with no session,
for the full 24 hours of `X-Amz-Expires`. It also discloses the storage
provider, region, bucket naming scheme, and tenant ID.

Two table row actions leak the same thing via a separate call:

- `apps/web/src/app/[lang]/(main)/(unirefund)/file/list/_components/table.tsx:53`
- `apps/web/src/app/[lang]/(main)/(unirefund)/file/verification/_components/table.tsx:129`

Both do `getFilePresignedUrlApi(id).then(res => window.open(res.data))`.

## Goal

No presigned URL reaches the browser for any file addressed by `fileId` —
not in HTML, not in props, not in the network tab. Every file request is gated
on an authenticated session.

## Non-goals

- **Refund signature images.** `operations/refunds/[refundId]/_components/refund-signatures.tsx`
  renders `<img src={travellerSignatureFileUrl}>` from presigned URLs on the
  refund payload. Those are not addressable by `fileId`, so they need a
  different route shape. Explicitly out of scope.
- **Range-request support.** See Decisions.
- **A `downloadUri` prop on `DocumentViewer`.** See Known limitation.

## Approach

A Next.js route handler resolves the presigned URL server-side and streams the
S3 response body through to the client.

Two alternatives were rejected:

- **Stream the backend's own `/files/{id}/download` endpoint.** One hop instead
  of two, but the generated SDK method is typed `CancelablePromise<void>` — it
  discards the response body — so this needs a hand-rolled `fetch` with bearer
  token plumbing outside `@repo/actions`, which `.claude/rules/api-actions.md`
  forbids. It also routes all file bytes through the .NET service instead of
  straight from Wasabi.
- **Base64 data URI via `DocumentViewer`'s existing `fileData` prop.** No new
  infrastructure, but it inlines the whole PDF into the HTML payload at ~1.33x
  size, defeats streaming, and does nothing for the table download actions.

## The route

New file: `apps/web/src/app/api/file/[fileId]/route.ts`

It sits alongside the existing `api/health`, `api/session`, and
`api/auth/[...nextauth]` handlers. The literal `api` segment already takes
precedence over its sibling `[lang]` dynamic segment, as those handlers prove.

### Contract

```
GET /api/file/{fileId}
    → 200, Content-Disposition: inline          (the viewer)

GET /api/file/{fileId}?download=1&name=invoice.pdf
    → 200, Content-Disposition: attachment; filename="invoice.pdf"   (table row actions)
```

### Handler flow

1. `await params` → `fileId`. Reject with **400** unless it matches
   `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`.

   Use exactly this shape check — **not** a version-aware UUID validator. Real
   tenant and file IDs in this system are not RFC 4122 v1–v5; the tenant ID
   `172f8e7a-16e8-8a7e-36ac-3a1f82881a9b` from the sample URL above has version
   nibble `8` and would be rejected by a strict validator. The check exists only
   to keep junk out of the upstream call, not to assert UUID semantics.
2. `await auth()` from `@repo/utils/auth/next-auth`. **401** when there is no
   session. This is what makes a copied or guessed URL useless.
3. `getFilePresignedUrlApi(fileId, session)` — the existing action in
   `packages/actions/unirefund/FileService/actions.ts`, unchanged. It returns
   `{ type, data, message }`; `type !== "success" || !data` → **404**.
4. `fetch(presignedUrl)`. If `!upstream.ok` → **502**.
5. `return new Response(upstream.body, { status: 200, headers })`.

The presigned URL lives only as a local `const` across steps 3–4. It is never
serialized into HTML, props, or a response header.

Authorization is inherited rather than reimplemented: the backend endpoint
requires `FileService.File` + `FileService.File.GetPresignedUrl`, so a session
without those permissions gets an error from the action at step 3 and never
reaches S3. The route does not need its own permission list.

Piping `upstream.body` rather than awaiting `arrayBuffer()` keeps memory flat
regardless of file size.

### Response headers

| Header | Value |
|---|---|
| `Content-Type` | copied from upstream, `application/octet-stream` fallback |
| `Content-Length` | copied from upstream when present |
| `Content-Disposition` | `inline`, or `attachment; filename="<sanitized>"` when `?download=1` |
| `Cache-Control` | `private, no-store` |

Nothing else is forwarded. In particular no `x-amz-*` headers, which would echo
bucket and storage details back to the client.

### Error responses

| Condition | Status |
|---|---|
| Malformed `fileId` | 400 |
| No session | 401 |
| Action failed, or returned no URL (no stored blob, or missing permission) | 404 |
| S3 fetch failed or returned non-2xx | 502 |

Bodies are bare status text. No upstream message, no bucket path. Real causes
go to `console.error` server-side only.

Missing-blob and missing-permission deliberately collapse to the same 404:
distinguishing them would tell an unauthorized caller that the file exists.

## Decisions

### No range-request support in v1

The route deliberately does **not** set `Accept-Ranges`, so `pdf.js` performs one
full fetch instead of chunked ones.

Every range request would need its own re-sign call to the backend, so a chunked
load of a single PDF could mean dozens of sign calls where one full download
needs one. For invoice-sized PDFs that is pure overhead. If large files appear
later, adding `Range` passthrough (forward the request header, echo 206 and
`Content-Range`) is a contained change to this one file.

### Filename comes from the caller as `?name=`

The call sites already hold the filename, so resolving it inside the route would
cost a second backend call on every download. The field name differs per DTO:

| Call site | Row DTO | Id field | Name field |
|---|---|---|---|
| `file/list` table | `FileResponseListDto` | `id` | `blobName` |
| `file/verification` table | `FileForHumanValidationDto` | `fileId` | `fileName` |
| verify page | `FileForHumanValidationDetailDto` | `fileId` | `fileName` |

`name` is sanitized before use: replace every character outside `[\w .\-()]`
with `_`, then cap at 200 characters, falling back to `fileId` when the result
is empty or the param is absent. A tampered value can therefore only change
the save-name the user's own browser suggests. It cannot inject a header (no
CR/LF survives the character class) or escape the quoted string.

### `Cache-Control: private, no-store`

Each viewer mount re-fetches. Correct default for authenticated documents on a
verification screen; `pdf.js` keeps its own in-memory cache for the current view.

## Call-site changes

### Verify page

`apps/web/src/app/[lang]/(main)/(unirefund)/file/verification/[fileId]/verify/page.tsx`

`presignedUrl` stays in the server component but demotes to a boolean signal.
Only the proxy path crosses to the client:

```tsx
const hasBlob = Boolean(selectedFile.presignedUrl);
const fileUrl = hasBlob ? `/api/file/${fileId}` : "";
```

Everything below is untouched: the `fileUrl ?` ternary, the `Empty` state with
`FileXCorner`, and the `t.FileService.FileFetchError` /
`t.FileService["FileFetchError.Message"]` keys. Behaviour for a file with no
stored blob is unchanged, with no extra request.

The comment on lines 48–51 is rewritten — "no second round trip" is no longer
why the field is read.

### Both table row actions

`file/list/_components/table.tsx` and `file/verification/_components/table.tsx`
collapse from an async action call to a direct open:

```tsx
// file/list — FileResponseListDto
onClick: (row) => {
  const name = encodeURIComponent(row.blobName ?? "");
  window.open(`/api/file/${row.id}?download=1&name=${name}`, "_blank");
}

// file/verification — FileForHumanValidationDto
onClick: (row) => {
  const name = encodeURIComponent(row.fileName);
  window.open(`/api/file/${row.fileId}?download=1&name=${name}`, "_blank");
}
```

The id and name fields differ between the two: `id`/`blobName` versus
`fileId`/`fileName`. See the table under Decisions.

This drops the `getFilePresignedUrlApi` import from both files.
`getFilePresignedUrlApi` itself stays in `@repo/actions` — the route handler
becomes its only consumer.

## Known limitation

`DocumentViewer`'s built-in download button links to `documentUri`
(`packages/ayasofyazilim-ui/src/custom/document-viewer/controllers.tsx:67`),
which now points at the proxy's inline URL. It will save with a URL-derived
name rather than the real filename.

Passing the `?download=1` URL as `documentUri` is not an option — that is the
same URL the viewer fetches for rendering, so the viewer would receive
attachment-disposition bytes. Fixing this properly means adding a separate
`downloadUri` prop to the shared `DocumentViewer`. Deferred; not worth changing
a shared package for in this change.

## Verification

`apps/web` has no unit-test runner, so:

**Automated:** `pnpm run build` and type-check.

**Manual:**
1. Verify page renders the PDF, with **no request to `wasabisys.com`** in the
   network tab and no presigned URL in view-source.
2. Both table download actions save a file with the real name — `blobName` in
   the `list` table, `fileName` in the `verification` table.
3. `curl` to `/api/file/{fileId}` with no session cookie → 401.
4. A valid `fileId` whose file has no stored blob → verify page still shows the
   `Empty` state.
5. A malformed `fileId` → 400.

No new i18n keys and no new `data-testid` targets, so `pnpm run init` is not
needed.
