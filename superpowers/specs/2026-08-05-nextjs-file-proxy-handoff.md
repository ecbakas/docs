# Next.js file proxy — verification handoff and follow-ups

**Date:** 2026-08-05
**Repo:** `web-app`, branch `saas-update`
**Spec:** `2026-08-05-nextjs-file-proxy-design.md`
**Plan:** `../plans/2026-08-05-nextjs-file-proxy.md`

Implementation is complete and reviewed clean. This document records what could **not** be
verified, because none of it is captured in git history and all of it needs a human with
credentials.

## What shipped

Eight commits in `web-app`:

| Commit | What |
|---|---|
| `0f6bf2db9` | `GET /api/file/[fileId]` route handler |
| `7cd0e2ea8` | `Cache-Control` on error responses |
| `ae7503238` | Verify page viewer → proxy |
| `416fb9a7f` | Stop leaking `presignedUrl` into the verify page's client payload |
| `0037091f5` | `file/list` download action → proxy |
| `0f7ac493d` | `file/verification` download action → proxy |
| `e2005d179` | Explicit `HEAD`, `nosniff` + forced attachment, RFC 6266 filenames, upstream timeout |
| `48ce8874d` | Fix two regressions introduced by `e2005d179` |

## Verified

- Type-check: 0 errors. Lint: 0 errors (5 pre-existing warnings in untouched files).
- Production build passes, with `ƒ /api/file/[fileId]` in the route list.
- `curl`, GET and HEAD: malformed id → 400; no session → 401; every response carries
  `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`; zero `x-amz-*` headers.
- `getFilePresignedUrlApi` appears nowhere under `apps/` except inside the route handler.
- `presignedUrl` appears nowhere under `apps/` except the verify page's has-blob check.
- Filename encoding: 199-chars-plus-emoji, 300 emoji, Turkish text, embedded quote/semicolon, and
  CRLF inputs all encode without throwing, cap at 200 code points, and leave no raw `"`, `;`, CR
  or LF in the header.

## NOT verified — needs a signed-in session

Nothing in this feature has been exercised against a running, authenticated application. No agent
had credentials or a real `fileId`. **None of the following should be treated as passing.**

### 1. The rendered-HTML leak check — the one that proves the goal

```bash
curl -s -b "<session cookie>" \
  '<host>/en/file/verification/<real fileId>/verify' \
  | grep -c -iE 'X-Amz-Signature|wasabisys'
```

Expected: `0`.

This matters more than the rest combined. A presigned URL leak was found on this exact page
during implementation, and the static greps could not see it: the page passed a whole DTO to a
`"use client"` component, whose narrower declared prop type does **not** strip fields at runtime,
so Next.js serialized `presignedUrl` into the RSC flight payload. `git grep presignedUrl` matched
nothing, because `fileDetails={selectedFile}` contains no such text. Only rendered-HTML
inspection catches that class of bug. If this returns non-zero, find which prop carries the value.

### 2. Remaining functional checks

| Check | Needs |
|---|---|
| Verify page renders the PDF inline, no `wasabisys.com` request in the network tab | session + real fileId |
| `file/list` download saves with the real `blobName` | session + a file with a `blobName` |
| `file/verification` download saves with the real `fileName` | session + a verification record |
| A file with no stored blob still shows the `Empty` / `FileXCorner` state | a record whose `presignedUrl` is null |
| A non-ASCII filename (e.g. Turkish) saves correctly via `filename*` | session + a file so named |

### 3. `HEAD` against real storage — a reasoned fix, not an observed one

`48ce8874d` makes the handler always issue **GET** upstream, even when the client sent `HEAD`,
because SigV4 binds the HTTP method into a presigned URL's signature — a `HEAD` against a
GET-signed URL is expected to return `403 SignatureDoesNotMatch`. When the client sent `HEAD` the
upstream body is cancelled so the storage connection closes early.

This reasoning is sound but **was never observed against Wasabi**. Confirm a `HEAD /api/file/{id}`
with a real session returns 200 with headers and no body. If it 502s, the SigV4 assumption needs
revisiting.

### 4. Inline-render safety depends on backend configuration

`e2005d179` forces `Content-Disposition: attachment` for `text/html`, `application/xhtml+xml`,
`image/svg+xml`, `text/xml`, and `application/xml`, and sets `nosniff` everywhere.

The reason: before this work, these bytes came from `s3.wasabisys.com` — a *different origin*, so
active content in a file could not touch the app's session. Serving them same-origin removed that
sandbox. The forced-attachment list restores protection for the types we know about, but **it was
not possible to determine from this repo which mime types the upload ruleset actually permits**
(`getApiFileTypeGroupsRulesetApi` returns backend-configured data). Worth confirming that no
executable type is accepted at upload, and note there is no CSP in `next.config.js`.

## Follow-ups (agreed non-blocking)

1. **`DocumentViewer`'s built-in download button** saves a URL-derived name rather than the real
   filename, because the viewer and the button share one `documentUri` prop — passing the
   `?download=1` URL would make the viewer itself fetch attachment-disposition bytes. Proper fix:
   a separate `downloadUri` prop on `packages/ayasofyazilim-ui` (a git submodule).
2. **Download-failure UX changed shape.** Previously a failed presigned-URL resolution was a
   silent no-op; now a tab always opens and shows the route's plain-text `Not Found` /
   `Bad Gateway` body. Arguably better than silence, but nobody has seen it rendered. Consider
   intercepting known statuses client-side for a translated message.
3. **`console.error(error)` on upstream failure** could in principle carry the presigned URL into
   *server-side* logs, if undici embeds the request URL in the `TypeError` cause chain. Not
   client-visible, and the spec permits server-side error logging, but worth confirming if logs
   are shipped anywhere.
4. **Signature images remain out of scope** — `refund-signatures.tsx` and `tag-signatures.tsx`
   still render presigned URLs via `next/image`. See the spec's Non-goals section: the leak lives
   in the *action payload*, not the `src`; `next/image`'s optimizer would need `unoptimized` since
   it fetches server-side without the session cookie; and the FileService permission overlap is
   unverified. The uncommitted `next.config.js` `remotePatterns` entry for
   `s3.eu-central-2.wasabisys.com` exists to serve these, and stays necessary until they are
   converted.
5. **Redundant document fetches.** A PDF view still triggers more than one full run of the
   handler: react-doc-viewer's `defaultFileLoader` fetches the whole file to build a data URL that
   `CustomPDFRenderer` then ignores, before `react-pdf` fetches the URI itself. `e2005d179`
   removed the `HEAD` probe (by supplying `fileType`), but the loader/renderer duplication lives
   inside the `ayasofyazilim-ui` submodule and was left alone.
