# Design: Resolving codes the QR path cannot — manual entry and 1D barcodes

**Date:** 2026-07-29
**Repo:** `mobile/app`
**Branch:** `role/staff`
**Catalogue items:** #9 (traveller manual lookup), #18 (staff manual tag-number entry), and a new #28 (scanned Code128 tag number) in `QR.md`

## Goal

Every way a Unirefund code can reach the app should resolve to something useful. Two do not today:

1. **Nothing can be typed.** If the camera cannot read a damaged or badly-lit code there is no recourse at all — `unirefund-web` has offered one to both audiences for longer than the mobile app has existed. (#9, #18)
2. **A barcode we print ourselves is rejected.** POS receipts print a Code128 of the tag number, the mobile scanner already reads Code128, and `classifyScan` answers "Unrecognized code." (#28)

Both are the same shortfall seen twice: a value arrives carrying a real identifier, and the app has no path from it to a tag.

## What the QR contract actually is

Verified against `@unirefund/qr@0.1.0` and every producer, because the design depends on it.

### Producers

| Source | Emits |
| --- | --- |
| Backend `publicLink` on `TagDetailDto` / `StickerLineReportDto` | the authority on the format |
| `web` sticker print (`print-sticker-lines-action.ts`) | `buildTagUrl(base, { tagNumber: "", stickerLineNumber })` |
| `pos` receipt templates (`utils/tagQr.ts`) | `resolveTagLink` — prefers `publicLink`, encodes `{n,i,t}` locally only on the offline print path |
| `pos` receipt templates, additionally | **`printBarcode(tagNumber, "code128")`** — a second, 1D code carrying the bare tag number |
| `web` airport kiosk (`(external)/qr`) | `{base}/{lang}/validate?qrValue={guid}`, rolling and server-issued |

### The tag slug

Base64url of `{n:<tagNumber>,i:<tagId>,t:<travellerDocumentNumber>,s:<stickerLineNumber>}`. A key is written **only when it has a value**; order is fixed `n,i,t,s`. There is no escaping, so `encodeTagSlug` throws on a value containing `,`, `{` or `}`. Decoding is lenient: a full URL or a bare slug, percent-decoded up to three times, and a raw `{...}` payload all work; anything else yields four empty strings and never throws.

**A sticker QR is a tag slug carrying only `s`.** That is why `classifyScan` must test `tag` before `sticker`: a code that identifies a tag stays on the tag path, and the sticker is merely how it was printed.

### The validate URL

`/validate` in the path **and** a non-empty `qrValue`. Strict on both, because the only producer emits a full URL and a bare `?qrValue=` could misroute an unrelated link.

## Decisions (agreed with user)

1. **Two typed modes:** sticker line number, and tag number.
2. **Reached from a link on the scanner overlay only** — the moment the camera fails is where the fallback is discoverable.
3. **Staff get no passport field.** They resolve tenant-scoped by tag number; asking for a document they do not hold is a dead end.
4. **A scanned Code128 resolves, and the symbology is what makes that safe** (see below).

## Two corrections to the first draft of this spec

Recorded because both were wrong in an instructive way.

**The slug round-trip is gone.** The first draft encoded typed input into a slug and immediately decoded it, copying SSR. SSR is right to do that: its seam is a *route*, and the slug is the only shape `/tag/[slug]` reads. Mobile's seam is an in-memory discriminated union, and manual entry already starts at the structured end. Running it backwards through the wire format and forwards again asserts nothing and can only add failure modes.

**The `,{}` validation is gone with it.** The first draft rejected those characters in typed input. They are *slug* constraints. A typed sticker number is sent to `getStickerLineByNumber(n)` as a path parameter and never becomes a slug, so enforcing them would have refused valid input for no reason.

## Architecture: one decision, three callers

Three layers, of which the first two are pure and testable — which matters because the repo's `@testing-library/react-native` fails to load, so anything left inside a hook or component cannot be tested at all.

```
raw string + symbology                 classifyScan       (pure)
        ↓
  ScanClassification                   scanDestination    (pure)
        ↓
  ScanDestination                      useScanRouting     (I/O: navigate, toast, look up)
```

### Layer 1 — `classifyScan` learns the symbology

```ts
/** How the value reached us. A 2D code carries a slug; a 1D code carries a bare identifier. */
export type ScanSource = "qr" | "linear";

export function classifyScan(
  raw: string,
  source: ScanSource = "qr",
): ScanClassification;
```

Order is unchanged — validate → tag → sticker — with one new final step before `unknown`: when `source === "linear"` and the value is non-empty, it is a bare tag number, so it classifies as `{ kind: "tag", data: { tagNumber: raw, … } }`.

**Why the symbology and not just "any bare value".** Task 1 deliberately pinned that a bare value stays `unknown`, unlike the web page, which treats one as a sticker line number because it has a wedge scanner. That rule was right for QR reads and too broad for 1D: a smudged QR that half-decodes into garbage must still be rejected, while a Code128 read is an unambiguous, self-describing source of a bare tag number. The symbology is exactly the information that separates the two, and `QrScanner` already has it — `code.type` on every read — and currently throws it away.

`QrScanner` maps its `CodeType` to the coarse pair: `qr`, `pdf-417`, `aztec` and `data-matrix` are `"qr"`; every 1D symbology is `"linear"`. The package-level union stays out of `classifyScan`, which should not know about `react-native-vision-camera`.

### Layer 2 — `scanDestination`, the shared decision

The routing decision currently lives inside `useQrScanLauncher`'s `onScanned`, interleaved with `router.push` and toasts, so nothing else can reuse it and nothing can test it. Extract the decision, not the navigation:

```ts
export type ScanDestination =
  | { kind: "route"; pathname: "/tag-preview" | "/sticker-tag" | "/validate";
      params: Record<string, string> }
  /** Staff scanned or typed a bare tag number: look up its id, then open it. */
  | { kind: "resolve-tag-number"; tagNumber: string }
  /** A traveller's bare tag number: the public read also needs their document. */
  | { kind: "need-traveller-document"; tagNumber: string }
  /** A validate QR in staff hands — recognised, but not theirs to act on. */
  | { kind: "blocked" }
  | { kind: "unrecognized" };

export function scanDestination(
  result: ScanClassification,
  isStaff: boolean,
): ScanDestination;
```

The two middle outcomes both arise from the same input — a tag classification carrying only `tagNumber` — split by role. That split is precisely the kind of decision this function should own, and it is why the Code128 work and the manual-entry work collapse into one change rather than two.

Every other destination it returns is exactly what `onScanned` produces today. **The refactor must not change behaviour**; the new tests pin each destination so a change would have to be deliberate.

### Layer 3 — `useScanRouting`, the only impure part

```ts
// src/hooks/useScanRouting.ts
export function useScanRouting(): {
  routeScan: (result: ScanClassification) => Promise<void>;
};
```

Maps each outcome to an effect:

| Outcome | Effect |
| --- | --- |
| `route` | `router.push(pathname, params)` |
| `resolve-tag-number` | `getTagDetailByTagNumber` → `/tag-preview` with `tagId`; not found → toast |
| `need-traveller-document` | `/manual-entry` in tag mode, pre-filled with the tag number |
| `blocked` | the existing validate-is-traveller-only toast |
| `unrecognized` | the existing unrecognized toast |

`useQrScanLauncher` is rebuilt on it and keeps its current surface plus `openManualEntry`:

```ts
onScanned = (raw, source) => routeScan(classifyScan(raw, source));
```

Splitting `useScanRouting` out matters because `ManualEntryScreen` needs the routing but not the scanner's visibility state; making it instantiate the full launcher for one callback would be the wrong seam.

## The manual entry screen

Root route `src/app/manual-entry.tsx`, registered beside `tag-preview` and `validate` for the same reason: it must work logged out — the role gate and the traveller login screen both offer scanning — and logged in.

A segmented **Sticker | Tag** control, following the method selector already in `SearchTraveller`, so the two typed-input surfaces match. Switching mode clears the fields and any error. It accepts optional `mode` and `tagNumber` route params so the `need-traveller-document` outcome can open it pre-filled.

| Mode | Fields |
| --- | --- |
| Sticker | Sticker number |
| Tag, traveller | Tag number · Passport number |
| Tag, staff | Tag number |

Staff-ness is `isMerchant \|\| isRefundPoint` from `useUserStore`, the same test the routing uses. Logged out means not staff, which is right: the public read is what a logged-out user can reach.

**Every mode has the same exit.** The form builds a `ScanClassification` and hands it to `routeScan` — the identical call the scanner makes. Nothing about manual entry is a separate path:

| Mode | Built classification |
| --- | --- |
| Sticker | `{ kind: "sticker", stickerLineNumber }` |
| Tag, traveller | `{ kind: "tag", data: { tagNumber, travellerDocumentNumber, … } }` |
| Tag, staff | `{ kind: "tag", data: { tagNumber, … } }` → resolves via `resolve-tag-number` |

## The scanner link

`QrScanner` gains `onManualEntry?: () => void`, rendering a text link below the existing subtitle. When omitted the scanner is unchanged, so the boarding-pass scanner in the validate flow — which reads an IATA barcode, not a Unirefund code, and already has its own manual tab — is unaffected.

`useQrScanLauncher` owns the handler: close the scanner, push `/manual-entry`. The four call sites (`(auth)/_layout.tsx`, `ScanEntry`, `SeamScanPill`, `TravellerLoginScreen`) each gain one prop.

`QrScanner`'s `onScanned` signature widens to `(raw: string, source: ScanSource)`. The validate flow's boarding-pass scanner ignores the second argument.

## New action

`src/actions/TagService/actions.ts`:

```ts
getTagDetailByTagNumber(tagNumber: string)
  → client.tag.getApiTagServiceTagByTagNumberDetailByTagNumber({ tagNumber })
```

Through `fetchRequest` like its siblings, so it throws and the caller reports. Requires `TagService.Tags.DetailByTagNumber`, confirmed present in `src/data/policies/policies.gen.json`. Returns `TagDetailDto`, whose `id` is what the route needs.

**Why staff resolve the id rather than routing a bare tag number.** `TagPreviewScreen` resolves by `tagId`, by `tagNumber + travellerDocumentNumber`, or by `stickerLineNumber`. A bare tag number matches none — the public read demands both fields — so routing one directly would silently show "not found". Resolving first uses the branch staff already take after scanning a tag QR, and leaves `TagPreviewScreen` **entirely unchanged**.

## Errors

Inline on the form, so nothing is a dead end and nothing typed is lost:

| Case | Behaviour |
| --- | --- |
| Empty field | inline error, no navigation |
| Traveller tag mode with no passport | inline error naming the missing field |
| Staff tag lookup returns 404 | inline "no tag with that number" |
| Staff tag lookup fails otherwise | toast, form left filled in |

From the scanner, the same two lookup failures surface as toasts, since there is no form to return to.

## Testing

The two pure layers carry the tests.

`classifyScan`, extending the existing suite:
- a bare value with `source: "linear"` → `tag` carrying it as `tagNumber`
- the same bare value with `source: "qr"` → still `unknown` (the Task 1 narrowing, now scoped rather than removed)
- a Code128 that happens to carry a full tag URL still decodes as a slug — the linear rule is the last resort, not the first

`scanDestination`:
- tag QR → `/tag-preview`, both roles
- sticker QR → `/sticker-tag` for staff, `/tag-preview` otherwise
- validate QR → `/validate` for a traveller, `blocked` for staff
- tag with only `tagNumber` → `resolve-tag-number` for staff, `need-traveller-document` otherwise
- unknown → `unrecognized`
- params carried through intact in each case

Slug encoding and decoding are already covered by `@unirefund/qr`'s conformance suite, and the three `TagPreviewScreen` resolution branches by the sticker work. Neither is re-tested here.

## Out of scope

- A standalone manual-entry route reachable without opening the scanner (decision 2).
- Manual entry for the airport validate QR: it is a rolling, server-issued value with no human-readable form printed anywhere, so there is nothing to type.
- Manual entry for boarding passes — the validate flow already has its own manual tab.
- Catalogue #8, #17, #20, #21.

## Risks

| Risk | Mitigation |
| --- | --- |
| The refactor silently changes routing | `scanDestination` returns exactly today's destinations and the new tests pin each; a change would have to be deliberate |
| A 1D read of something that is not a tag number now looks like one | it resolves to a clear not-found rather than a wrong tag; only symbologies we print are in the scanner's defaults |
| Staff lack `TagService.Tags.DetailByTagNumber` in some tenant | the lookup fails to an inline message rather than a blank screen, and sticker mode still works |
| A sticker number typed into Tag mode, or the reverse | both resolve to a clear not-found; the two number formats do not collide |

## Not verifiable here

Whether a real damaged sticker's printed number is legible enough to type; that a POS Code128 read yields exactly the tag number on a real device; and all camera behaviour. All need hardware.
