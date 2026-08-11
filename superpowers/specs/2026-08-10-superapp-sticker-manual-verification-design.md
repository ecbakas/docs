# Sticker manual verification — super-app (traveller)

A traveller holding a physical sticker and a paper tax-free form, but no digital
tag, photographs both from the mobile app and submits the pair. A refund officer
reviews it in the back office and either rejects it with a reason the traveller
reads, or issues the tag from it.

The officer side and the traveller **web** side shipped as
[2026-08-07-sticker-manual-verification-web-design.md](2026-08-07-sticker-manual-verification-web-design.md).
This design covers the traveller **mobile** side, in `c:\unirefund\super-app`.

It is deliberately not a port. The web design's two hardest problems — a canvas
resize pipeline and a still-image barcode decoder — both have native answers
already installed here, and the app's own conventions differ from the web
monorepo's in ways that matter (error handling, i18n, testing). What does carry
over is the *reasoning*: which failures are silent, what supersedes what, and
which value must never be shown wrong.

## Task zero: the proxy does not exist yet

`src/saas/TagService` contains none of the manual-verification endpoints.
`src/saas/**` is generated and must not be hand-edited, so **`npm run gen`
against a backend carrying the new controller is a hard prerequisite** — no other
task can begin. Confirm afterwards that `StickerManualVerificationService` and
the `UploadStickerManualVerificationDto` types are present.

Two operational notes for whoever runs it: the super-app checkout is sometimes
driven by more than one agent session at once, so check `git status` and the
branch before starting; and regeneration rewrites a generated tree that other
in-flight work may depend on.

## What the traveller side needs, and only that

Of the six endpoints the backend added, this app uses **two**:

| Endpoint | Why |
| --- | --- |
| `POST /api/tag-service/sticker-manual-verification` | the upload |
| `GET /api/tag-service/sticker-manual-verification/my` | the traveller's own pairs |

`GET /{id}` is **not** added. Nothing in this design fetches a single pair — the
section shows everything the traveller needs — and an action with no caller is an
invitation. Nor are the officer endpoints: the worklist, `mark-invalid`, and
`POST /tag/by-manual-verification`. No role in this app touches them.

## The actions layer follows super-app's contract, not the web's

[`.claude/rules/api-actions.md`](../../../super-app/.claude/rules/api-actions.md)
differs from the web monorepo's in three ways that will trip anyone arriving from
that codebase:

- no `"use server"`, no `structuredResponse` / `structuredError`, no `auth()`;
- every call is wrapped in `fetchRequest(...)` from `src/utils/customFetch.ts`,
  which owns the single-retry-on-401 token refresh, with a stable `apiName`;
- **errors bubble.** Callers do not receive `{ type: "error" }`; they catch, or
  they let it throw.

So:

| File | Action |
| --- | --- |
| `src/actions/TagService/post.ts` | `postStickerManualVerificationApi` |
| `src/actions/TagService/actions.ts` | `getStickerManualVerificationsMyApi` |

Name them with the `Api` suffix the rules file asks for. The existing file is
inconsistent on this (`getTags`, `getStickerLineByNumber` predate the rule);
follow the rule rather than the neighbours.

## Where it lives: folded into the tags list

Mirrors the choice made for the traveller web app, so the two traveller surfaces
share one mental model — a pending pair appears where the traveller already looks
for their tags.

[`TagScreen.tsx`](../../../super-app/src/screens/shared/Tags/Tag/TagScreen.tsx)
is the host. It is more machinery than the web equivalent: a Zustand store
(`useTagStore`), a `FlashList`, a `TabPage` template, a `TagListHeader`, a filter
sheet, and skeleton/empty/error/no-match states.

- **The pending list is the `FlashList`'s `ListHeaderComponent`**, above the tags.
- **The upload entry point goes in `TagListHeader`**, beside the existing controls.

### Two gates, not one

`TagScreen` is **shared with staff** — it already computes
`isStaff = isMerchant || isRefundPoint` and branches on it for search and card
layout. Pending verifications are traveller-only, so the section renders when
**`!isStaff` and** the `TagService.StickerManualVerifications.ViewMine` grant is
held. A merchant or refund-point user must never see a traveller's pairs, and the
grant alone is not sufficient to establish that.

A missing `.ViewMine` grant must degrade to *no section*, never to a broken
screen. On the web this was achieved by putting the call in an optional
`Promise.allSettled` group; here, because actions throw, the equivalent is an
explicit catch that yields an empty list. Travellers do not hold this grant on
every environment — on dev it went only to two Refund Point roles — so the
degraded path is the one most likely to run first.

### Refresh comes free

`TagScreen` already calls `loadTags(true)` from `useFocusEffect` to pick up a tag
the traveller just claimed. The pending list rides the same trigger, so a pair
that has become a tag needs no manual refresh — it disappears from the section
and appears in the list on the next focus.

### What the section shows

`Created` and `Invalid` rows only, carrying the sticker line number, a status
chip, the upload date, and for `Invalid` the `invalidReason` **verbatim** — it is
written for the traveller to read.

`Completed` is dropped, for the same reason as on the web: the DTO carries no
`tagId`, so the row would link nowhere, and the resulting tag is in the list
directly below. The consequence is the same too, and is correct: a traveller
whose recent pairs are all `Completed` sees no section, because nothing is
outstanding.

**Superseded 2026-08-11 by
[2026-08-11-superapp-tags-tabs-design.md](2026-08-11-superapp-tags-tabs-design.md).**
That design splits this screen into Tags and Verifications tabs, which removes
the adjacency the paragraph above rests on — the tag is no longer "directly
below", it is a tab away. The Verifications tab therefore shows **all three**
statuses. The `tagId` half of the reasoning still holds: a `Completed` row states
that a tag was created but does not link to it.

Use a local status→style map. Do **not** reach for whatever styles `TagCard` uses
for `TagStatusType` — that is a different enum with different members, and
sharing it would make the two look interchangeable.

## The upload sheet

A `BottomSheet` from `@gorhom/bottom-sheet`, following
[`AvatarModal`](../../../super-app/src/screens/shared/Profile/_components/AvatarModal.tsx),
the app's one existing image-upload precedent. Three fields, all **required and
marked as such**: sticker photo (the side carrying the QR), tax-free-form photo,
and the sticker line number.

The two slots are ordered and not interchangeable — the DTO fixes which is which.

### Capture and preparation

Each slot offers **camera or gallery** through `expo-image-picker`
(`launchCameraAsync` / `launchImageLibraryAsync`). Gallery matters: a traveller
may already have photographed the form. Both need their permission request
handled, and a denial must produce a message rather than a silent no-op.

Then, per photo:

1. **`expo-image-manipulator`** resizes and compresses. This runs **natively, off
   the JS heap** — the significant advantage over the web's canvas pipeline, and
   the reason this design does not need the web's quality ladder.
2. **`expo-file-system`** reads the result as base64.

The DTO accepts base64 with or without a `data:` prefix; send the bare body.

### The size budget is not the web's

Restate it rather than copying, because the binding limits differ:

- There is **no Next `bodySizeLimit`** here. That limit drove the web numbers and
  does not exist in this app.
- The backend's cap does apply: **JPEG or PNG, 5 MB decoded per picture.**
- The new constraint is the **JS heap**. Two base64 strings at that cap are
  roughly 13 MB of JavaScript strings held at once, which is real memory pressure
  on a low-end Android device.

So keep a ceiling of about **2.5 MB of base64 per photo** (~1.9 MB decoded).

Reach it by **resizing to a fixed longest-edge cap at a fixed JPEG quality**,
chosen conservatively enough that a single pass clears the ceiling for any phone
camera — not by a re-encode loop. If a pass does overshoot, retry **once** at a
lower quality and accept the result; do not iterate further. The web build needed
a four-step ladder because a canvas gave it no control over the input dimensions;
`expo-image-manipulator` resizes first, which is what makes one pass sufficient
here.

Hold each photo's base64 only as long as it is needed, and do not keep the
original alongside the resized copy — that doubles the heap cost the cap exists to
bound.

## QR prefill: one call, not a subsystem

`expo-camera` — already a dependency — exports
`scanFromURLAsync(url, barcodeTypes)`, a **still-image** barcode scanner. The web
build spent two whole tasks in a shared submodule on this (a format map, a native
`BarcodeDetector` path, a ZXing fallback, a multi-scale retry ladder). None of it
ports, and none of it is needed: here it is one call against the picked photo's
`uri`.

Run it on the **front** photo, **before** manipulation, so it reads the
full-resolution original. Pass its result through `decodeTagScan` from
`@unirefund/qr` — the same package the web uses — and take the `s` key.

### The rules that do port, because they were learned the hard way

- **The field stays editable.** A printed sheet holds several stickers and a
  camera easily catches a neighbour's code, so a prefill is a suggestion. Show a
  hint saying it came from the photo, and clear that hint the moment the traveller
  edits the field.
- **A miss is silent.** No toast, no error. Manual entry is the baseline.
- **A photo-origin value is superseded by a new photo; a hand-typed one is not.**
  This is the rule the web build took two fix rounds to get right. Without it,
  retaking a photo after reading its prefill leaves the *discarded* photo's number
  in the field with the hint still vouching for it.
- **Guard against a stale decode** landing after the photo it belongs to has been
  replaced, or after the sheet has been reset. On the web this needed a generation
  counter because the component survived the dialog closing; check whether the
  same is true of a dismissed `BottomSheet` here rather than assuming either way.
- A **tag** QR decodes fine but carries no `s` key, so it yields nothing and needs
  no special case.

## Failure behaviour

On a failed submit the sheet **stays open with both photos intact** and surfaces
the error. The likely rejections are a sticker line number that does not exist or
one that already has a tag — making the traveller re-shoot two photographs to fix
a typo would be gratuitous. Because actions throw here, that means a `try`/`catch`
around the submit, not a returned-error check.

The sheet must not be dismissable mid-submit, and submit stays disabled until
both photos are prepared and the line number is non-empty when trimmed.

Errors surface through the app's existing `ToastProvider` (`useToastRef`), as
`AvatarModal` does.

## Testing: the one surface in this feature that can be tested

`super-app` has a working Jest suite. Neither `apps/web` nor `apps/ssr` does, and
the cost of that showed: the web build's worst latent defect was a helper that
failed two of its own specified test cases, found only because the one task with
a runner was written test-first.

So the pure logic here gets **real red-green unit tests**:

- the resize/budget decision — what dimensions and quality a given input yields,
  and that it never upscales;
- the QR-result-to-line-number mapping, including a tag QR yielding nothing;
- the supersede rule: photo-origin replaced, hand-typed preserved.

Constraints established by prior work in this repo:

- **Render tests must be named `*.router.test.*`** or they do not pick up the
  router mocks.
- **Roughly 7 suites already fail at baseline.** Record the exact baseline before
  changing anything, and compare against it rather than expecting green.
- **`npm test` also collects sibling worktrees' tests**, so runs need scoping.
- **`npm run init`** regenerates the i18n bundle and is a type-check prerequisite
  after adding keys.
- **`expo start` needs `--offline`** in this environment.

i18n keys go under `MobileApp.*` in
`src/localization/resources/{en-US,tr-TR}.json`, read through `useLocalization()`.
Never edit `src/data/language-data/*.gen.json`.

## Constraints inherited from the repo

- **No `useEffect`** for derived state or event responses; see
  [`.claude/rules/avoid-use-effect.md`](../../../super-app/.claude/rules/avoid-use-effect.md).
  The existing `useFocusEffect` refresh is the sanctioned lifecycle hook here.
- **UI from `src/components/**` first** — `Button`, `Input`, `BottomSheet`,
  `Image`, `Section`, `SafeAreaView` — with NativeWind classes and semantic
  tokens, not hardcoded colours.
- **No new dependency.** Everything this design needs is installed:
  `expo-image-picker`, `expo-image-manipulator`, `expo-file-system`,
  `expo-camera`, `@unirefund/qr`, `@gorhom/bottom-sheet`.
- **Comments sparse.** Comment what the code cannot say — a rule that would
  otherwise be silently broken, a budget number that looks arbitrary. Not the
  obvious.

## Out of scope

- The officer side and the traveller web side, both already shipped.
- `POST /tag/by-manual-verification` and the officer worklist.
- A detail screen for a single pending pair. The section shows everything the
  traveller needs; add one only if the rejection reason proves too long to read
  in a row.
- Retention of rejected picture pairs. The backend records this as a known
  follow-up and no client can address it.
- Offline queueing of an upload. Worth wanting on a mobile app in an airport, and
  deliberately not designed here — it needs its own thinking about storage limits
  and duplicate submission, and bolting it on would compromise both.
