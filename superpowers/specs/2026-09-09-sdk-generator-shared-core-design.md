# SDK generator: shared core, GitHub Packages, and the binary-response fix

**Date:** 2026-09-09
**Scope:** `OpenAPI-SDK-generator` (upstream), then all four consumers —
`web-app` (`packages/saas`, `packages/core-saas`), `super-app` (`src/saas`),
`pos-app` (`src/saas`), `ayasofyazilim-core-project` (`packages/core-saas`).

## Problem

Reported symptom: the Excel export on `/en/finance/agent-cash-report` downloads a
file that cannot be opened, while the same endpoint fetched with `curl` returns a
working `.xlsx`.

The backend is healthy. `GET /api/refund-service/refunds/agent-cash-report/excel`
returns `200`, `Content-Length: 7107`, a valid ZIP (`PK\x03\x04`, containing
`xl/workbook.xml`), and:

```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

That MIME matches **none** of the four branches in `getResponseBody`
(`core/request.ts`) — not `application/json`/`+json`, not the `binaryTypes`
allow-list (`application/octet-stream`, `application/pdf`, `application/zip`,
`audio/`, `image/`, `video/`), not `multipart/form-data`, not `text/`. Execution
falls through to `return undefined`, discarding the body of a successful
response.

The rest follows mechanically:

| Step | Value |
| --- | --- |
| `getResponseBody(response)` | `undefined` (body discarded) |
| `structuredSuccessResponse(undefined)` | `{ type: "success", data: undefined }` |
| `downloadFile(undefined, "….xlsx", XLSX_MIME)` | `new Blob([undefined])` |
| Saved file | 9 bytes, ASCII text `undefined`, named `.xlsx` |

Excel refuses it. `curl` works because `curl` never runs this parser.

Two facts explain why this went unnoticed:

- The SDK **declares** the response as `Blob | File`
  (`GetApiRefundServiceRefundsAgentCashReportExcelResponse`). The type is a lie
  about runtime behaviour, so `tsc` sees nothing wrong in passing the result to
  `downloadFile`.
- `downloadFile` takes `BlobPart`, and the `Blob` constructor does not reject
  `undefined` — it stringifies it.

Ruled out as a contributing cause: the server-action boundary. React's flight
server serializes `Blob` via `serializeBlob` (verified in the installed
`react-server-dom-turbopack` server build, Next 16.2 / React 19.1), so a Blob
returned from the action does reach the client intact. The parser is the only
defect.

### Why upstream will never fix it

`getResponseBody` is stock `@hey-api/openapi-ts` legacy-fetch output, emitted
with `client: { name: "legacy/fetch", bundle: true }`. Verified by content probe
of the published tarballs:

| hey-api version | Legacy client | Bug |
| --- | --- | --- |
| 0.60.1 | present | present — **the version the generator actually pins** |
| 0.83.1 | present | present — declared by web-app, but not what generates |
| 0.86.0 | present | present — **last legacy version; pin ceiling** |
| 0.87.0 | removed | n/a |
| 0.99.0 (latest) | removed | n/a |

The bug survived unchanged from 0.60.1 through 0.86.0, then the legacy client was
deleted. There is no version to upgrade to that fixes this while keeping the
generated SDK shape.

The modern client (`@hey-api/client-fetch`) does handle it correctly —
`parseAs: "auto"` infers from `Content-Type`, and `parseAs: "blob"` can be forced
per call — but it emits standalone functions instead of `…ServiceClient` classes
with an `httpRequest`. Adopting it would rewrite every `@repo/actions` call site
in four repos. Out of scope here.

Therefore the fix must live in **our** generator, applied to generated output.

### The duplication that makes the fix expensive

`web-app` carries **17 copies** of the core runtime — 13 under `packages/saas`,
4 under `packages/core-saas`. They differ by indentation only (`diff -w` is
empty), so they are logically one file. A hand-patch would mean 17 edits that the
next `index.mjs` run reverts.

`super-app` and `pos-app` already solved the duplication: each keeps one shared
`src/saas/core` and a **vendored** `generator.mjs` with `centralizeCore()` and
`rewriteCoreImports()`. Those two forks are byte-identical to each other, and
both are **ahead of upstream** — the published
`@ayasofyazilim/sdk_generator@0.0.13` has no `centralizeCore` at all.

Current state:

| Repo | Generator | Cores |
| --- | --- | --- |
| web-app | npm `@ayasofyazilim/sdk_generator@0.0.13` | 17 duplicated |
| ayasofyazilim-core-project | npm, same | 4 duplicated |
| super-app | vendored fork | 1 shared |
| pos-app | vendored fork (identical to super-app's) | 1 shared |

## Non-goals

- No migration to `@hey-api/client-fetch`. The generated SDK keeps its class
  shape; `@repo/actions` and its call sites are untouched.
- No hey-api version bump. `0.60.1` is already the de-facto version everywhere,
  because the generator resolves its own nested copy; consumers' declared
  `@hey-api/openapi-ts` versions are vestigial for generation. Bumping would
  churn every core for no gain.
- No interim hand-patch of web-app's cores. The fix exists only as generated
  output, so nothing hand-edited can be mistaken for the source of truth.
- No change to `downloadFile` or to any call site. The parser is the defect.
- No new binary endpoints or export features.

## Approach

### 1. `OpenAPI-SDK-generator` — upstream, and a hard prerequisite

Nothing else can proceed until this publishes.

**Port the fork in.** `centralizeCore()`, `rewriteCoreImports()` and the
`exportCore: true` / `exportCore: false` split come from super-app/pos-app
verbatim; they are proven in two repos. The first service in a run donates its
freshly generated `core/` to the shared root; later services drop theirs; each
service's `'./core/…'` specifiers are rewritten to `'../core/…'`. The rewrite is
idempotent — `'../core/…'` no longer matches the lookahead.

**Add `patchResponseBody()`**, run after `centralizeCore()` on the single shared
core. It appends a fallthrough to `getResponseBody`:

```ts
// Unknown content type on a 2xx: treat it as binary rather than silently
// discarding the body. Without this, an .xlsx download (whose MIME is on
// none of the lists above) returns undefined and the caller saves the
// string "undefined".
if (response.ok) {
  return await response.blob();
}
```

Constrained to `response.ok` so error bodies keep their present handling and
`catchErrorCodes` still reads what it reads today. Matching is
whitespace-tolerant, because the same template is emitted tab-indented
(super-app, pos-app) and space-indented (web-app, after prettier).

`patchResponseBody()` **throws** when its anchor is absent. A hey-api change or
an accidental client swap then fails generation loudly, instead of quietly
restoring a bug whose only symptom is a corrupt download.

**Pin `@hey-api/openapi-ts` to exactly `0.60.1`**, with the ceiling recorded in a
comment: `0.86.0` is the last version shipping the legacy client, `0.87.0`
removed it. This makes explicit what is already true, and stops a future `^`
range from silently crossing 0.87.0 and breaking generation.

**Move to GitHub Packages.** Rename to `@ayasofyazilim-clomerce/sdk_generator` —
GitHub Packages requires the scope to match the repo owner — and add
`publishConfig.registry=https://npm.pkg.github.com`. That scope is already the
one `web-app/.npmrc` maps for the capture SDK, so that file needs no change.

**Publish via Actions,** not from a laptop: a tag-triggered workflow with
`permissions: packages: write`, using `GITHUB_TOKEN`.

**Fix two latent bugs in the fork** before they become upstream:

- `index.mjs` guards its CLI with `if (!isMain)`, which is inverted. It works
  only by accident on Windows, where `import.meta.url`
  (`file:///C:/…/index.mjs`) never equals `file://` + `process.argv[1]`
  (`file://C:\…\index.mjs`), so `isMain` is always `false`. On Linux/macOS the
  CLI would do nothing, and a library import would run it instead.
- `parseArgs` references `PKG.version`, but `PKG` is never imported, so `-v`
  throws `ReferenceError`.

**Tests:** `centralizeCore` (donate, drop, rewrite, idempotent re-run) and
`patchResponseBody` (patches both indentation styles, is idempotent, throws on a
missing anchor).

### 2. `web-app` — the only consumer needing centralizing

Swap the dependency in `packages/saas` and `packages/core-saas`, drop the
vestigial `@hey-api/openapi-ts`, regenerate both. 17 cores collapse to 2 — one
per package, since the two are separate workspace packages and `core-saas` must
not depend on `saas` — each carrying the patch. Then each package's own prettier
pass, or the diff is dominated by quote churn.

Consumer-safe: nothing outside the SDK packages imports `core/…`, verified by
grep across `apps/` and `packages/`. Public entry points
(`@repo/saas/<Service>`) are unchanged — `index.ts` re-exports `ApiError` and
friends from `../core/…` instead of `./core/…`.

### 3–4. `super-app`, `pos-app`

Delete the vendored `generator.mjs` and `index.mjs`, depend on the published
package, add the `.npmrc` scope mapping (neither repo has one today), regenerate.
Because the generator keeps hey-api at `0.60.1` — the version these repos already
generate with — the core diff should be the patch and nothing else. Any other
change in that diff means an assumption here is wrong: stop and investigate
rather than committing it.

### 5. `ayasofyazilim-core-project`

Same as web-app: 4 cores to 1, plus a `.npmrc`. It is the base template that
`web-app/packages/core-saas` is synced from, so its core should end up matching
web-app's.

## Verification

Per repo, before claiming done:

- The shared `core/request.ts` contains the `response.ok` fallthrough.
- No per-service `core/` directory survives
  (`find . -maxdepth 2 -name core -type d`).
- Every service's imports resolve to `../core/…`, and the repo's typecheck passes
  at its own recorded baseline — re-measure it, do not quote a remembered number.
- Regenerating twice is a no-op, proving the rewrite and the patch are idempotent.

End to end, the acceptance test for the original report: on
`/en/finance/agent-cash-report`, Export downloads a file whose first four bytes
are `PK\x03\x04` and which opens in Excel — not a 9-byte file reading
`undefined`.

## Risks and blockers

- **Publishing is blocked on credentials.** The available `gh` token carries
  `repo` and `workflow` but not `write:packages`, so the first publish must come
  from the Actions workflow, or from someone holding that scope. The org may also
  need to permit first-time package creation for this scope.
- **Regeneration needs a reachable gateway.** Every consumer step hits
  `…/swagger/v1/swagger.json`. A gateway that is down blocks the rollout, and a
  gateway serving a *different* schema silently produces an unrelated diff.
- **Five repos, five reviews.** Steps 2–5 are independent once step 1 lands and
  can be reviewed in parallel, but each carries its own regenerated diff.
- **The fork is the reference, not upstream.** Upstream is behind by design here;
  the port direction is fork → upstream. Do not "reconcile" by taking upstream's
  older `generateApi`.
