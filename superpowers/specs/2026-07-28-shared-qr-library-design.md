# Design: One shared library for Unirefund QR generation and resolution

**Date:** 2026-07-28
**Scope:** A new zero-dependency package (`@unirefund/qr`) owning the tag-QR wire format, consumed by `mobile/app` and `mobile/pos` in pass 1 and by `unirefund-web` in pass 2. `web-utils/tag` becomes a re-export and gains EN + TR documentation.

**Cross-repo.** This spec lives in `mobile/app` because that is the only `docs/superpowers/specs` directory in the workspace, but it governs four repos.

## Goal

One definition of how a Unirefund tag QR is written and read, so a code produced by any app resolves identically in every other app, and no field is silently dropped in transit.

## Why

The format is currently implemented eight times, and the authority is not any of the client copies — it is the backend.

| #   | Where                                                         | Role                                | Fields    |
| --- | ------------------------------------------------------------- | ----------------------------------- | --------- |
| 1   | Backend `publicLink` (`TagDetailDto`, `StickerLineReportDto`) | **the authority**                   | —         |
| 2   | `web-utils/tag/slug.ts`                                       | decode                              | `n,i,t,s` |
| 3   | `unirefund-web/packages/utils/tag/slug.ts`                    | the SAME file as #2 — git submodule | `n,i,t,s` |
| 4   | `mobile/app/src/utils/qr/tagSlug.ts`                          | decode (hand-port of #2)            | `n,i,t,s` |
| 5   | `mobile/app/src/utils/qr/base64url.ts`                        | codec, decode half                  | —         |
| 6   | `mobile/pos/src/utils/encode.ts`                              | codec, encode half                  | —         |
| 7   | `mobile/pos` `tagPrintTemplateV1`                             | **encode** — query format           | `n,t`     |
| 8   | `mobile/pos` `tagPrintTemplateV3`                             | **encode** — slug format            | `n,i,t`   |

`apps/web` does the right thing: it renders `tagDetails.publicLink` and builds nothing. `pos` re-derives the URL by hand instead, in two different shapes.

### Concrete defects this causes

1. **`stickerLineNumber` is decoded in four places and emitted in zero.** It appears nowhere in `pos`. A field that looks supported never is.
2. **V1 drops `tagId`, and V1 is live.** `receiptTemplate` is a per-device merchant setting (`"v1" | "v2" | "v3"`, default `v3`) exposed in DeviceSettings, so all three behaviours print in production today. The "legacy query form" branch in `classifyScan.ts` is not legacy — it is load-bearing.
3. **The two codecs must agree byte-for-byte and nothing checks it.** Web uses `atob`/`TextDecoder`; mobile hand-rolls UTF-8 because those globals are unreliable on Hermes. Turkish traveller names (`İ`, `ğ`, `ş`) are precisely the multi-byte input where a subtle disagreement corrupts the tail. There is not one test asserting the two agree.
4. **The validate-URL parsers disagree.** `unirefund-web` `rescan-qr-modal.tsx#extractQrValue` requires a URL that parses _and_ has `/validate` in its pathname. `mobile/app` `classifyScan.ts#extractValidateQrValue` is a bare `[?&]qrValue=` regex with no path check. The same scanned string resolves differently depending on which app read it.
5. ~~Copy-mirroring has already failed once.~~ **Wrong — corrected during implementation.** `unirefund-web/packages/utils` is the `web-utils` repository as a **git submodule**, not a hand-kept copy. The `policies/` difference I read as drift was only my separate clone sitting at a different commit than the pinned submodule. So #2 and #3 above are one file, not two, and the real count of implementations was seven rather than eight. This made the fix simpler: one change to `web-utils/tag` serves the web repo too.

### The reason a client-side encoder must exist at all

`TagDto` — the create-tag POST response that [`buildLocalTagDetail.ts`](<../../../../pos/src/screens/(auth)/Sale/_components/buildLocalTagDetail.ts>) assembles the fast print path from — **has no `publicLink`**. Only `TagDetailDto` does. `pos` deliberately prints without fetching the detail endpoint to save 4–7 seconds, so at print time it may genuinely not have the canonical link.

That is a legitimate need, and it sets the hard requirement: **the local encoder must produce byte-identical output to the backend's `publicLink`.**

## Decisions (agreed with user)

1. **One package, everyone depends on it.** Not a shared spec, not vendored copies.
2. **A new zero-dependency repo**, because `web-utils` cannot be installed by an Expo app: its manifest is `@repo/utils` with `workspace:*` dependencies (`@repo/ayasofyazilim-ui`, `@repo/core-saas`, `@workspace/typescript-config`) plus `next`, `next-auth`, `ioredis`, `sonner`, and its tsconfig extends a Next config. `workspace:*` does not resolve outside the pnpm workspace.
3. **`web-utils/tag` re-exports the package** so every existing `@repo/utils/tag` import keeps working, and hosts EN + TR docs.
4. **Scope decided by me** (see below).
5. **Sticker readiness**, not sticker removal — `s` is an upcoming feature.
6. **Converge pos V1's QR** onto the current format. **Leave V2 alone** — it prints no QR by layout choice, not by legacy format.
7. **Pass 1 = library + mobile.** `unirefund-web` follows in a reviewed pass 2.

## Scope

**In:** the codec; the tag-slug contract, encode _and_ decode; the tag-link contract including the `publicLink`-first rule; the validate-URL contract; golden vectors; EN + TR docs.

**Out:**

- `classifyScan` stays in `mobile/app`. It maps a scan to a _navigation flow_, which is per-app product policy, not a wire format. It gets rebuilt on the library primitives.
- `bcbp.ts` (boarding passes) stays in `mobile/app`. An IATA format we only ever read and never generate, so there is no generate/resolve symmetry to protect, and web never touches it.

Validate-URL handling **is** in scope despite looking app-specific, because defect 4 proves it is already duplicated and already divergent.

## Package

Repo `ayasofyazilim-clomerce/unirefund-qr`, package name `@unirefund/qr`. Zero runtime dependencies.

```
unirefund-qr/
  src/
    codec.ts       base64url encode + decode, no platform globals
    slug.ts        the payload contract
    link.ts        tag URL construction + publicLink-first resolution
    validate.ts    airport/kiosk validate URL
    index.ts
    __tests__/
      conformance.test.ts
  vectors.json     golden fixtures, shared by every consumer
  README.md        English
  README.tr.md     Türkçe
  package.json     zero deps; tsc build to dist/; prepare script
  tsconfig.json
```

The codec is a merge of the two halves that already exist and are already pure JS with no platform globals — `pos/src/utils/encode.ts` (encode) and `app/src/utils/qr/base64url.ts` (decode). Together they run on Hermes, Node, the browser and the Edge runtime. Nothing needs inventing; it needs uniting.

### API

```ts
// codec.ts
export function base64UrlEncode(input: string): string;
export function base64UrlDecode(input: string): string; // "" on failure, never throws

// slug.ts
export interface TagSlugData {
  tagNumber: string;
  tagId: string;
  travellerDocumentNumber: string;
  stickerLineNumber: string;
}

export interface TagSlugInput {
  tagNumber: string;
  tagId?: string | null;
  travellerDocumentNumber?: string | null;
  stickerLineNumber?: string | null;
}

export function encodeTagSlug(input: TagSlugInput): string;
export function decodeTagSlug(slug: string): TagSlugData;
export function decodeTagScan(scanned: string): TagSlugData;
export function slugFromScan(scanned: string): string;

// link.ts
export function buildTagUrl(baseUrl: string, input: TagSlugInput): string;

export function resolveTagLink(args: {
  publicLink?: string | null;
  baseUrl: string;
  tag: TagSlugInput;
}):
  | { ok: true; url: string; source: "backend" | "local" }
  | { ok: false; reason: "unencodable-field" | "insufficient-data" };

// validate.ts
export function buildValidateUrl(
  baseUrl: string,
  args: { qrValue: string; lang?: string },
): string;
export function extractValidateQrValue(scanned: string): string | null;
export function isValidateScan(scanned: string): boolean;
```

`resolveTagLink` returns a result rather than throwing, deliberately. `encodeTagSlug` throws on bad input because that is right for a primitive, but the POS print path must not crash mid-receipt over a malformed tag number — it needs to print without a QR and surface a message instead. `resolveTagLink` is the safe wrapper the print path uses; `encodeTagSlug` is the fail-fast primitive everything else uses.

`decodeTagSlug` and `decodeTagScan` keep their current names, signatures and total behaviour, so #2/#3/#4 can be replaced by a re-export with no caller changes.

## The wire format

Authoritative statement, to be mirrored verbatim in both READMEs.

The QR carries the **public tag URL**: `{ssrBaseUrl}/tag/{slug}`.

`slug` is the base64url encoding (URL-safe alphabet, **no padding**) of the UTF-8 bytes of:

```
{n:<tagNumber>,i:<tagId>,t:<travellerDocumentNumber>[,s:<stickerLineNumber>]}
```

| key | field                     | presence                          |
| --- | ------------------------- | --------------------------------- |
| `n` | `tagNumber`               | always                            |
| `i` | `tagId`                   | always; empty string when unknown |
| `t` | `travellerDocumentNumber` | always; empty string when unknown |
| `s` | `stickerLineNumber`       | **omitted entirely** when absent  |

`n`, `i` and `t` are always written, empty if unknown — matching what `tagPrintTemplateV3` emits today (`i:${id ?? ""}`, `t:${doc ?? ""}`). `s` is omitted rather than written empty, so **output for a tag with no sticker is byte-identical to today's**. A golden vector asserts exactly this, which is what lets us adopt the encoder without reprinting anything.

### Values are not escaped

The decoder splits the body on `,` then on each pair's **first** `:`. So a value may safely contain `:`, but a value containing `,`, `{` or `}` corrupts the payload — silently, into a neighbouring field.

We must not invent escaping, because the backend produces this format too and would not know about it. Instead `encodeTagSlug` **throws** on a field containing `,`, `{` or `}`. That is a latent bug today, made loud without changing the format. If real tag numbers ever legitimately contain a comma, escaping becomes a coordinated backend + client change, not a client-side patch.

### Accepted on decode, never produced

- The legacy query form `…/tag?tagNumber=X&travellerDocumentNumber=Y` (pos V1). Kept readable forever — those tags are printed and in travellers' hands.
- A bare slug with no URL around it.
- Percent-encoded slugs, peeled up to three times, guarding a `%3D` padding artefact from being misread as data.
- A raw already-decoded `{...}` payload.

## The validate rule — resolving defect 4

The two existing parsers disagree, so the library picks **the stricter, web-style semantics**:

> A validate scan is a value whose path contains `/validate` **and** which carries a non-empty `qrValue` query parameter. Anything else is not a validate scan.

Chosen over the app's looser regex because the validate QR is only ever produced by `buildValidateUrl` as a full URL, so a bare `?qrValue=…` with no `/validate` path is not something we emit — and accepting it risks misrouting an unrelated URL that happens to carry a `qrValue` parameter.

**Implemented without `URL`/`searchParams`.** React Native's built-in `URL` is famously partial on Hermes (`react-native-url-polyfill` exists for exactly this), so the library gets web's strictness through string and regex operations rather than web's API. This is a behaviour change for `mobile/app`, which currently accepts the looser form; called out here because it is a deliberate narrowing, not an accident.

## `publicLink` first

`resolveTagLink` returns `publicLink` whenever it is present and only encodes locally as a fallback, reporting which happened via `source`. That makes the backend authoritative by default and confines local encoding to the offline print path where it is unavoidable.

**Drift detection.** I cannot read the backend, so I cannot prove the local encoder matches it. In `__DEV__` only, when both a `publicLink` and enough fields to encode locally are available, `resolveTagLink` compares them and logs a structured warning on mismatch. Invisible divergence becomes a loud signal in the field, at zero production cost.

## Golden vectors

`vectors.json` is the shared contract. Every consumer runs it, so agreement is proven rather than assumed.

Cases:

- ASCII baseline, all fields populated.
- `tagId` empty, `travellerDocumentNumber` empty (each alone and together).
- **Turkish multi-byte:** `İ`, `ğ`, `ş`, `ü`, `ö`, `ç` in the traveller document field — the case defect 3 makes dangerous.
- Emoji / astral plane, to exercise surrogate pairs in both codec halves.
- With and without `s`, asserting the no-sticker output is byte-identical to today's `tagPrintTemplateV3` string.
- Round-trip: `decodeTagSlug(encodeTagSlug(x)) === x` for every case.
- Legacy query form decode.
- Percent-encoded slug decode, including the `%3D` tail case.
- Malformed input returns all-empty fields and never throws.
- Validate URL: build → extract round-trip, plus the two divergent shapes from defect 4 resolved to one defined answer.

## Documentation (EN + TR)

`README.md` and `README.tr.md`, same content in both languages:

- What the QR contains and why it is reversible base64, **not** a hash (the "SHA256" wording in existing callers is wrong and the docs will say so).
- The format table above.
- How to generate — and that you should prefer `publicLink`.
- How to resolve a scan.
- The no-escaping constraint and why `encodeTagSlug` throws.
- What is accepted on decode but never produced.
- How to add a golden vector when the format changes.

Also placed in `web-utils/tag/` as requested, alongside the re-export.

## Consumption

### `mobile/app`

- `utils/qr/base64url.ts` and `utils/qr/tagSlug.ts` are **deleted**; both re-exported from the package.
- `classifyScan.ts` stays but drops its private `extractValidateQrValue` in favour of the library's (see the validate rule below).
- `QR_FEATURE_CHECKLIST.md` and the qr-scan plan doc reference the ported files; updated to point at the package.

### `mobile/pos`

- `utils/encode.ts` is **deleted**; `base64UrlEncode` re-exported from the package.
- `tagPrintTemplateV3` uses `resolveTagLink`, preferring `publicLink`.
- `tagPrintTemplateV1` **converges** onto `resolveTagLink` — its lossy query-string QR is replaced. Its receipt layout is otherwise untouched.
- `tagPrintTemplateV2` unchanged: still no QR.
- `BarcodeTestScreen` uses the package codec.

### `unirefund-web` (pass 2)

- `packages/utils/tag/slug.ts` replaced by a re-export of `@unirefund/qr`.
- `rescan-qr-modal.tsx#extractQrValue` replaced by the library's.
- Not attempted in pass 1: I have read this repo but never built it (pnpm + turbo + Next 16), so I will not claim verification I cannot perform.

## Distribution mechanics — and the risk in them

Mobile consumes it as a git dependency: `"@unirefund/qr": "github:ayasofyazilim-clomerce/unirefund-qr"`. `pos` already depends on three GitHub repos this way, so the pattern is established.

**The real integration risk is not resolution, it is transformation.** Metro does not compile TypeScript in `node_modules` the way it compiles app source, and Jest needs its own transform for it. So the package ships **compiled** output:

- `tsc` build to `dist/` (ESM + CJS + `.d.ts`), `main`/`module`/`types` pointing there.
- A `prepare` script so git installs build on the consumer's machine.

This must be proven empirically, not assumed. Pass 1 is not done until the package is installed into both `app` and `pos` and their `typecheck`, `lint` and `jest` all pass against it. If `prepare` proves unreliable across the package managers in play, the fallback is committing `dist/` — noisier history, but deterministic.

## Out of scope

- Changing the wire format. Everything here is additive (`s`) or convergent (V1); no already-printed QR stops resolving.
- The backend. It remains the authority; we mirror it and detect drift rather than negotiate with it.
- `web-utils`'s other directories (`api`, `auth`, `policies`) — `policies` has drifted and deserves the same treatment, but that is a separate change.
- Adding a QR to pos V2.
- Sticker QR _flows_. We make the format ready for `s`; we do not build the feature.

## Risks

| Risk                                                     | Mitigation                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Local encoder silently differs from backend `publicLink` | `publicLink` preferred at runtime; `__DEV__` mismatch warning; golden vector pinned to today's V3 output |
| Metro/Jest cannot consume the git dependency             | Ship compiled `dist/`; pass 1 gated on real typecheck + lint + jest in both apps                         |
| Converging V1 changes what a v1 merchant's QR looks like | Intended and requested; decoders keep reading the old form, so printed tags still resolve                |
| A tag number containing `,` corrupts the payload         | `encodeTagSlug` throws; documented as needing a coordinated backend change                               |
| New repo needs creating and pushing                      | Explicitly the user's call; I will ask before creating or pushing anything                               |

## Verification

- `unirefund-qr`: `tsc --noEmit`, and the conformance suite over `vectors.json`.
- `mobile/app`: `npm run typecheck`, `npm run lint`, `npm test` — including a test that the app's own decode path agrees with `vectors.json`.
- `mobile/pos`: `npm run typecheck`, `npm run lint`, `npm test`.
- A test asserting `encodeTagSlug` reproduces the exact URL expected for a fully-populated tag.
- Not verifiable here, and stated as such: real printer output, real camera scans, and anything in `unirefund-web`.

---

# What was actually built

Recorded after implementation, because four decisions changed during it.

## Changes from the plan above

**1. Backward compatibility was dropped.** The plan preserved the legacy query form on decode "because those tags are printed and in travellers' hands". Those prints turned out to be test-only, so the decoder was removed instead of carried forever. A test pins that a `?tagNumber=` query string is no longer accepted, so a lenient fallback cannot creep back in.

**2. Every slug key is now conditional, not just `s`.** The plan wrote `n`, `i` and `t` unconditionally to stay byte-identical to what the POS printed. With the paper constraint gone, the format follows one uniform rule: a key is written only when it has a value, order fixed at `n`, `i`, `t`, `s`. `{n:TR2026004182}` is as valid as the full form, and an omitted key decodes identically to an empty one.

The remaining reason to care about exact bytes is **producer parity with the backend**, not compatibility with anything printed. If the backend still writes empty keys, our local encoding and its `publicLink` will differ for a tag with a missing field — different strings that decode to identical fields. `resolveTagLink` prefers `publicLink`, so the printed code is unaffected, but `onDrift` will fire. Making the two byte-equal is a backend change. **This is the one open question**: no real `publicLink` value exists anywhere in the four repos to compare against, so the backend's exact output is still unconfirmed.

**3. pos V2 gained a QR.** The plan left it alone, on the grounds that printing no QR looked like a layout choice. It was then included: V2 printed only a Code128 barcode, so a tag issued on it could not be opened by scanning at all. Its receipt is now taller.

**4. `resolveTagLink` returns a result rather than throwing.** `encodeTagSlug` throws on a field the format cannot carry, which is right for a primitive, but a POS print must not crash mid-receipt. The templates skip the QR — and its caption — and log instead.

**5. Drift detection compares slugs, not URLs.** The original design compared whole URLs, which was wrong. The base URL is environment configuration on both sides: the backend embeds its own (`ssr-dev` / `ssr-uat` / `ssr`) and the client resolves its own independently through `getSsrUrl()` and its persisted environment. Two links therefore differ there routinely while carrying byte-identical payloads, so `onDrift` would have fired on **every tag** whenever the two sides sat on different hosts — and noise that constant gets ignored, taking real format divergence with it. It now compares the slug, which is the only part this package defines, and passes slugs to the callback. `resolveTagLink` still returns `publicLink` verbatim, host included; it never rewrites the backend's link to match the client's base URL.

## Delivered

| Where           | State                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `unirefund-qr`  | pushed; 3 commits; 31 conformance tests; EN + TR docs; `.gitignore`                                           |
| `mobile/pos`    | `utils/encode.ts` deleted; `utils/tagQr.ts` added; V1, V2, V3 all resolve `publicLink`-first; 5 new tests     |
| `mobile/app`    | `utils/qr/tagSlug.ts` and `utils/qr/base64url.ts` deleted; `classifyScan` rebuilt on the package; 8 new tests |
| `web-utils/tag` | EN + TR docs added; `slug.ts` marked superseded but **not** rewired — see below                               |
| `unirefund-web` | untouched                                                                                                     |

## Results

| Check                             | Result                                                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unirefund-qr` typecheck + tests  | clean; 31/31                                                                                                                                              |
| `mobile/app` typecheck            | clean                                                                                                                                                     |
| `mobile/app` lint (changed files) | clean                                                                                                                                                     |
| `mobile/app` tests                | 74 pass; 4 suites fail to load on a pre-existing `@testing-library/react-native` resolution error in `src/components/__tests__/`, unrelated and untouched |
| `mobile/app` Metro bundle         | succeeded, 9.72 MB Hermes bundle                                                                                                                          |
| `mobile/pos` typecheck            | zero errors in changed files; 68 pre-existing errors, all missing i18n keys in three untouched screens                                                    |
| `mobile/pos` lint (changed files) | clean                                                                                                                                                     |
| `mobile/pos` tests                | 39/39 pass                                                                                                                                                |
| `mobile/pos` Metro bundle         | succeeded, 10.1 MB Hermes bundle                                                                                                                          |

Both Metro bundles matter: they prove an Expo app can consume the package from a private git dependency, which was the flagged integration risk. It works because the package ships compiled CJS, so neither app needed a `transformIgnorePatterns` change.

## Still outstanding

- ~~`unirefund-web` (the planned pass 2).~~ **Done.** `packages/utils` — which is the `web-utils` submodule, so this covers `web-utils/tag` at the same time — now re-exports the package, `tag/slug.ts` is deleted, and `rescan-qr-modal.tsx` uses the shared `extractValidateQrValue`. `tsc --noEmit` is clean in `packages/utils`, `apps/ssr` and `apps/web`; eslint clean on the changed SSR file. Submodule change is on branch `tag/shared-qr-package` (web-utils PR #45, `main` is protected); the parent commit sits on `traveller-card` with the pointer updated.

  **pnpm needed one accommodation.** pnpm 10 refuses to run build scripts for git-hosted packages unless allowlisted, and the package compiles itself via `prepare`, so `pnpm-workspace.yaml` gains `onlyBuiltDependencies: ["@unirefund/qr"]`. This is the risk the plan named; the fallback it named — committing `dist/` — was rejected because it trades one line of config for the chance of shipping stale build output whenever someone edits the source and forgets to rebuild.

  **Not run here:** the Next production builds and the Playwright suites.

- **The repo is private.** Every dev machine and CI runner installing it needs GitHub credentials with read access. Say if it should be public instead.
- ~~Confirm the backend's exact `publicLink` output.~~ **Closed, not outstanding.** Local encoding happens on exactly one path — the POS offline print — and `buildLocalTagDetail` supplies all three fields there (`id` and `tagNumber` from the create-tag POST response, `travellerDocumentNumber` from the traveller store). Every key is therefore written, so the conditional-key rule never changes the output on that path and it matches the full form the backend produces. Were a field ever empty, the two strings would still decode to identical fields and a scan would resolve the same tag; the only effect is a dev-only warning.
- **Nothing in `mobile/app` or `mobile/pos` is committed.** Both have unrelated in-flight changes, so staging was left alone.
