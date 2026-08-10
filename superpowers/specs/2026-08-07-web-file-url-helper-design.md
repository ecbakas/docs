# Shared file view/download URL helper (web)

**Date:** 2026-08-07
**Repos:** `web-app` (`apps/web`)

## Problem

Three places build a URL for the file proxy at `/api/file/[fileId]`, and each
hand-rolls the construction:

| Site | Builds |
| --- | --- |
| `file/list/_components/table.tsx:52-56` | `encodeURIComponent(row.blobName ?? "")`, then `` `/api/file/${row.id}?download=1&name=${name}` ``, then `window.open(…, "_blank")` |
| `file/verification/_components/table.tsx:126-130` | the same construction, written out independently |
| `file/verification/[fileId]/verify/page.tsx:60` | `` `/api/file/${fileId}` `` for inline viewing |

Two identical download constructions and one view construction. Every call site
repeats the encoding and the query string, and a fourth caller would repeat them
again.

`window.open(…, "_blank")` is also the wrong trigger for this response. The route
sets `Content-Disposition: attachment`, so the browser downloads rather than
navigates and the new tab closes immediately — a visible flicker, and exposed to
popup blockers for a user-initiated download that does not need a window at all.

**Not a problem any more:** an earlier reading of this code found
`verification/_components/table.tsx` fetching a presigned storage URL client-side
and opening it raw, bypassing the proxy that exists to keep bucket details off the
client. That has since been fixed independently — both tables now go through
`/api/file/…`. This spec is therefore purely the de-duplication, with no security
component.

## Goal

One module owns the shape of a file-proxy URL, so no call site encodes or
concatenates anything, and downloads start without a throwaway tab.

## Scope

| Surface | What changes |
| --- | --- |
| `apps/web/src/utils/utils-file.ts` | **New.** `fileViewUrl`, `fileDownloadUrl`, `startFileDownload` |
| `file/list/_components/table.tsx` | Download action calls `startFileDownload` |
| `file/verification/_components/table.tsx` | Download action calls `startFileDownload` |
| `file/verification/[fileId]/verify/page.tsx` | Inline URL comes from `fileViewUrl` |

Deliberately out of scope:

- **`apps/web/src/app/api/file/[fileId]/route.ts`.** The proxy is correct and
  untouched. This change only alters how callers address it.
- **`downloadFile` in `apps/web/src/utils.ts`.** Different concept, left alone —
  see "Naming" below.
- **The `apps/ssr` app.** It has no file-proxy call sites.

## Design

### Placement

`apps/web/src/utils/utils-file.ts`, following the `utils-<domain>.ts` convention
already in that directory (`utils-date.ts`, `utils-number.ts`).

**Not `apps/web/src/utils.ts`**, even though that file is the more obvious home at
first glance. It already exports:

```ts
downloadFile(data: BlobPart, fileName: string, mimeType?: string): void
```

which builds an object URL from bytes the caller has already fetched — used by the
payout-batch, rebate-statement and VAT-statement clients. Two functions named for
"downloading a file" that mean different things, in one module, is a trap for the
next reader.

### API

```ts
/** Inline view URL for the file proxy - DocumentViewer, <img>, pdf.js. */
export function fileViewUrl(fileId: string): string {
  return `/api/file/${encodeURIComponent(fileId)}`;
}

/** Download URL: same proxy, attachment disposition, server-sanitised filename. */
export function fileDownloadUrl(
  fileId: string,
  fileName?: string | null
): string {
  const params = new URLSearchParams({ download: "1" });
  if (fileName) params.set("name", fileName);
  return `${fileViewUrl(fileId)}?${params}`;
}

/** Start a download without opening a throwaway tab. */
export function startFileDownload(
  fileId: string,
  fileName?: string | null
): void {
  const link = document.createElement("a");
  link.href = fileDownloadUrl(fileId, fileName);
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
```

`URLSearchParams` owns both the encoding and the `?`/`&` joining, which is the
point: no call site writes `encodeURIComponent` again, and adding a future
parameter cannot produce a malformed query string.

`encodeURIComponent` still wraps the **path segment**, which `URLSearchParams`
does not cover. The route validates the id shape and returns 400 otherwise, so
this is defence rather than a live bug — but a URL builder should not depend on
its server's validation.

`fileName` is optional and skipped when falsy, so a caller with no name simply
omits the parameter. `list/table.tsx` currently passes `row.blobName ?? ""`, which
produces `name=` with an empty value; after this change it passes the possibly-null
value straight through and the parameter is dropped instead. The route already
falls back to the file id, so the resulting filename is unchanged.

### The anchor carries no `download` attribute

Deliberate, and the one subtlety in this change. On a same-origin link the
`download` attribute **overrides** the server's `Content-Disposition` filename.
`route.ts` runs the client-supplied name through `safeFilename`, which collapses
everything outside `[\w .\-()]` to `_` precisely so a crafted value cannot inject
into or escape that header. Setting `download` client-side would route around that
sanitisation and let the raw value name the saved file. The server stays
authoritative; the anchor exists only to trigger the request.

`rel="noopener"` is set for the usual reason, even though no window is opened.

### Call sites

```ts
// file/list/_components/table.tsx
onClick: (row) => { startFileDownload(row.id, row.blobName); }

// file/verification/_components/table.tsx
onClick: (row) => { startFileDownload(row.fileId, row.fileName); }

// file/verification/[fileId]/verify/page.tsx
const fileUrl = presignedUrl ? fileViewUrl(fileId) : "";
```

The `verify/page.tsx` line keeps its existing conditional and its comment. That
comment explains that `presignedUrl` is read only as a "does a blob exist?" signal
and is never sent to the client — the change must not disturb that behaviour, only
the string construction.

`startFileDownload` touches `document`, so it is client-only. Both table call sites
are already in `"use client"` components. `fileViewUrl` and `fileDownloadUrl` are
pure and safe in a server component, which is what `verify/page.tsx` needs.

## Testing

**There is none, and that is a constraint rather than a choice.** `apps/web` has no
unit-test runner: its `test` script is Playwright e2e against a live deployed
environment, and the only Jest suite in the monorepo lives in the
`packages/ayasofyazilim-ui` git submodule, a separate repository. Adding a runner
is out of scope for a three-function helper.

The two URL builders are pure and short enough to verify by reading. What genuinely
needs a human is the behaviour change in the trigger.

## Verification

- `pnpm --filter web type-check`
- `pnpm --filter web lint`
- Manual: on **both** the file list and the verification list, the Download action
  saves a file with the expected name and **no blank tab appears**. Also open a
  file in the verification viewer and confirm it still renders inline.

Capture the typecheck and lint baseline before editing and gate on "no worse than
baseline". Note that a fresh worktree needs `next-env.d.ts` generated by one
`next dev` / `next build` run before a typecheck baseline means anything.

## Outcome

Implemented on branch `fix/web-file-url-helper`, three task commits plus one
final-review fix commit, branched from `origin/main` (196f7edef — which already
includes PR #266). Final state: `pnpm --filter web type-check` clean exit 0;
`pnpm --filter web lint` exit 0 with 5 pre-existing warnings; a repo-wide grep for
`/api/file/` leaves matches only inside `utils-file.ts`.

### The one real cost, accepted deliberately

**On an error response, a download now navigates the page away.** `route.ts`
returns plain-text bodies for 401 and 404 with no `Content-Disposition`, so a
target-less anchor click becomes a top-level navigation: a user whose session has
expired clicks Download on a filtered grid and lands on a bare "Unauthorized"
page, losing filters, pagination and scroll. `window.open(…, "_blank")` confined
that failure to a disposable tab.

On success nothing changes — the attachment disposition means no navigation
happens at all.

Every mitigation costs more than it saves: a `_blank` target restores the
throwaway-tab flicker on **every** successful download, which is the thing this
change set out to remove; a HEAD pre-flight doubles the round trips on the happy
path to improve the unhappy one. So the trade-off is accepted and documented in
the module. **If it proves annoying in practice, the fix belongs in the route** —
returning an HTML error page, or redirecting — not in `startFileDownload`.

This is the kind of defect that only a whole-branch view finds: it needs the
route's error contract and the new trigger together, and neither per-task review
could see both.

### Verified, not assumed

- No caller-supplied value reaches the URL unencoded: the id through
  `encodeURIComponent` (which round-trips exactly against the route's id-shape
  test on the already-decoded param), the name through `URLSearchParams` (read
  back by the matching form-urlencoded decode, so `+` becomes a space again).
- Omitting the anchor's `download` attribute is correct: on a same-origin link it
  would override the route's sanitised `Content-Disposition`, which also carries
  an RFC 6266 `filename*`.

### Follow-ups

1. The two grids name the same file differently — the list passes `blobName`, the
   verification list passes `fileName` — because `FileResponseListDto` has no
   `fileName` field. Forced by the API, not by this change.
2. `printBlobInNewTab` in `utils.ts` still uses `window.open`; out of scope here.

## What is not covered

- No automated test exercises `startFileDownload`; the anchor-click path is
  verified only by the manual check above.
- The proxy route itself is unchanged and untested by this work.
