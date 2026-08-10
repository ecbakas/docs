# Sticker manual verification — web-app

A traveller who holds a physical sticker and a paper tax-free form, but no
digital tag, photographs both and submits the pair. A refund officer reviews the
pair and either rejects it with a reason the traveller reads, or transcribes the
invoice off the form and issues the tag from it.

The backend for this shipped in [PR #2033](https://github.com/ayasofyazilim-clomerce/UniRefund/pull/2033)
([UNI-1490](https://clomerce.atlassian.net/browse/UNI-1490)) and the TagService
proxy is already generated on `feat/manual-verification` (`f147278f0`). This
design covers the three frontend surfaces in `web-app`:

1. the officer worklist, detail and create-tag screens in `apps/web`;
2. the traveller upload in `apps/ssr`;
3. reading the sticker line number out of the uploaded photo's QR to prefill the
   field.

The traveller-mobile equivalent in `super-app` is a separate design.

## What the backend gives us

Five endpoints on `/api/tag-service/sticker-manual-verification` plus one on the
tag controller. All six are already in
[`packages/saas/TagService`](../../../web-app/packages/saas/TagService/types.gen.ts),
reachable as `client.stickerManualVerification` and `client.tag`.

| Endpoint                        | DTO                                        | Permission                                    |
| ------------------------------- | ------------------------------------------ | --------------------------------------------- |
| `POST /`                        | `UploadStickerManualVerificationDto`       | `TagService.StickerManualVerifications.Upload` |
| `GET /`                         | `StickerManualVerificationListDto`         | `…StickerManualVerifications.ViewList`         |
| `GET /my`                       | `MyStickerManualVerificationListDto`       | `…StickerManualVerifications.ViewMine`         |
| `GET /{id}`                     | `StickerManualVerificationDetailDto`       | `…StickerManualVerifications.View`             |
| `POST /{id}/mark-invalid`       | `MarkStickerManualVerificationInvalidDto`  | `…StickerManualVerifications.MarkInvalid`      |
| `POST /tag/by-manual-verification` | `CreateTagByManualVerificationRequestDto` | `TagService.Tags.CreateByManualVerification`  |

Three facts shape everything below.

**The lifecycle has three states** — `Created`, `Invalid`, `Completed` — and the
generated type is a string union, so no numeric-enum trap applies here.

**The create takes no traveller data.** `CreateTagByManualVerificationRequestDto`
carries `manualVerificationId`, an optional `merchantId`, the `invoices`, and two
optional extras (`payoutTokenId`, `travellerSignatureBase64`). The traveller, the
sticker line and the resulting `Issued` status are all derived server-side from
the reviewed pair. The officer's form therefore asks for merchant and invoice
lines and nothing else.

**Picture URLs degrade rather than fail.** `frontPictureUrl` and
`backPictureUrl` are presigned and documented as null when the storage layer
cannot produce one, without failing the request.

## Part 0 — the actions layer

Nothing in `packages/actions/unirefund/TagService/` wraps the new controller yet.
Six thin wrappers, following
[`.claude/rules/api-actions.md`](../../../web-app/.claude/rules/api-actions.md) —
GETs `throw structuredError`, POSTs `return` it — and the existing path-order
naming (`getStickersDetailsByIdApi`, `getTagsCrossTenantsByTravellerIdClaimApi`):

| File              | Action                                            |
| ----------------- | ------------------------------------------------- |
| `actions.ts`      | `getStickerManualVerificationsApi`                |
| `actions.ts`      | `getStickerManualVerificationsMyApi`              |
| `actions.ts`      | `getStickerManualVerificationByIdApi`             |
| `post-actions.ts` | `postStickerManualVerificationApi`                |
| `post-actions.ts` | `postStickerManualVerificationByIdMarkInvalidApi` |
| `post-actions.ts` | `postTagByManualVerificationApi`                  |

Both apps consume the same six. This is the only code the two halves share.

## Part 1 — officer screens in `apps/web`

Route group `[lang]/(main)/(unirefund)/operations/manual-verifications/`, beside
`scan-sticker` and `stickers`. It is a daily operational queue, which is what
puts it under Operations at the top level rather than nested inside the
sticker-book admin pages.

```
operations/manual-verifications/
  page.tsx                        worklist (server)
  loading.tsx
  _components/table.tsx           MasterDataGrid
  [id]/page.tsx                   review screen (server)
  [id]/_components/
    pictures.tsx                  the two panes
    mark-invalid-dialog.tsx
  [id]/create-tag/page.tsx        server shell
  [id]/create-tag/client.tsx      merchant resolution + TagForm
```

### The worklist

`MasterDataGrid` over `$UniRefund_TagService_Stickers_StickerManualVerificationListDto`,
following [`file/verification`](../../../web-app/apps/web/src/app/[lang]/(main)/(unirefund)/file/verification/_components/table.tsx)
closely enough that the two read as the same kind of screen.

Columns: `stickerLineNumber` (a `RowLink` to the detail, `linkCondition` on
`TagService.StickerManualVerifications.View`), `travellerFullName`,
`travellerDocumentNumber`, `status`, `creationTime`, `reviewedAt`.

Status renders as a `Badge` — `Created` warning, `Invalid` destructive,
`Completed` success.

`tagId` is present on the list DTO and non-null exactly when the status is
`Completed`, so a completed row also carries a row action linking to
`operations/tax-free-tags/{tagId}`, gated on `TagService.Tags.ViewSummary`. It is
the one question an officer asks about a reviewed pair — what came of it — and
the answer is already in the response.

The endpoint offers exactly two filters, `status` and `stickerLineNumber`, plus
paging; the page exposes those and no more. **`status=Created` is the default**,
so the page opens on the outstanding queue rather than on history. Clearing the
filter shows every status.

### The review screen

Two panes side by side: the pictures, and a details column carrying the
traveller name and document number, the line number, `creationTime`,
`reviewedAt`, the status badge, and `invalidReason` when there is one.

Each picture pane renders its own unavailable state, independently, and says the
picture could not be loaded rather than implying the traveller failed to send
one — both pictures are mandatory on upload, so a blank pane is always our
problem, never theirs.

**Amended 2026-08-10 (first amendment).** This originally rendered the DTO's
presigned `frontPictureUrl` / `backPictureUrl` directly. PR #267 established the
opposite rule in `apps/web/src/utils/utils-file.ts` — the browser is never handed
a storage URL; everything goes through the `/api/file/{id}` proxy. So the panes
used `fileViewUrl(frontPictureFileId)` and the presigned fields went unused.

**Amended again 2026-08-10, at the author's instruction — this supersedes the
above.** The photographs are now fetched as **base64 in the detail response**
(`includePictureData: true`) and rendered as `data:` URIs. `fileViewUrl` is not
used here at all, and neither the presigned URLs nor the file ids are used for
display.

The reversal is deliberate and its cost was accepted explicitly: two photographs
at roughly 1.9 MB decoded each arrive as ~5 MB of base64 inside the detail JSON,
uncached and non-streaming, on every load — including the reload that follows
*Mark invalid*. Nothing was added to mitigate that, because mitigating it was not
what was asked. The security posture is unchanged either way: the browser never
sees a storage URL on either design.

Two consequences to hold onto. The unavailable state keys off an **absent or
empty base64 string**, not a failed fetch. And a `data:` URI cannot be opened as
a top-level navigation in Chrome, so full-size viewing is a **Dialog lightbox**
over the same string rather than a new tab — which matters because the officer
transcribes invoice line items off that photograph, and a form rendered into a
third of the screen is not legible enough to read amounts from.

**The two officer screens are now one.** The review screen and the create-tag
screen were merged into a single two-column screen at `[id]`: details, both
photographs and *Mark invalid* on the left, the create-tag form on the right. The
right column renders `ManualVerification.CreateTag.NotPending` instead of the
form for an `Invalid` or `Completed` pair. `[id]/create-tag` survives as a
**redirect** to `[id]` — the path keeps working and there is exactly one
implementation of the form. Merging also fixed a real defect the whole-branch
review found: the officer had been issuing a tag without the sticker line number
or the photograph anywhere on screen.

Two header actions, both offered only while `status === "Created"`, since the
backend refuses either against a pair that has already been reviewed:

- **Mark invalid** — a dialog with a required reason textarea, gated on
  `…MarkInvalid`. The reason reaches the traveller verbatim, and the dialog says
  so under the field, because an officer writing an internal shorthand note is
  the obvious failure here.
- **Create tag** — navigates to `[id]/create-tag`, gated on
  `TagService.Tags.CreateByManualVerification`.

### The create-tag screen

Merchant resolution here is the same problem `scan-sticker` already solved for a
Refund Point, and the answer is the same, so the implementation is the same
components with a different create call. See
[the scan-sticker README](../../../web-app/apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/README.md)
for the reasoning behind each branch; only the differences are stated here.

1. The server shell fetches the pair by id and passes `stickerLineNumber` and the
   traveller display fields to the client.
2. The client calls `getStickerLineMerchantInfoApi({ stickerLineNumber })`.
   When `isMerchantAllocated`, the merchant is fixed and `merchantId` is omitted
   from the create body — the backend documents the parameter as ignored for an
   allocated line. Otherwise the officer picks through `MerchantSelector` →
   `searchMerchantsForTagCreation`, and the pick is re-previewed through the same
   call to load that merchant's product groups.
3. A merchant pick replaces the whole invoice rather than keeping its lines, for
   the reason `scan-sticker` documents: lines are priced against the product
   groups of the merchant that was resolved when they were added.
4. `TagForm` and `invoice.ts` render the card and do the VAT arithmetic
   unchanged.
5. Submit posts `{ manualVerificationId, merchantId?, invoices: [invoiceForSubmit(...)] }`
   and redirects to `operations/tax-free-tags/{id}`.

`getStickerLineMerchantInfoApi` needs the **pre-existing**
`TagService.StickerHeaders.ViewMerchantInfo`, which is not among the seven new
permissions. A null result toasts `AssignSticker.MerchantInfoUnavailable`, the
same message `scan-sticker` uses, rather than leaving the officer on a card with
no merchant and no explanation.

Neither `payoutTokenId` nor `travellerSignatureBase64` is sent. There is no
traveller at the counter in this flow — the traveller uploaded from their phone,
possibly days earlier — so there is nobody to sign, and no payout token in hand.

### One targeted change to `TagForm`

[`TagForm`](../../../web-app/apps/web/src/components/tag-form/tag-form.tsx) today
takes `traveller`, `setTraveller` and `countries` as required props and renders
`AddTravellerDialog` in its header. On this flow the traveller is derived
server-side and the endpoint has no traveller field at all, so offering an "add
traveller" button would invite an officer to fill in something silently dropped.

Make `traveller`, `setTraveller` and `countries` optional, and add a
`headerAction?: ReactNode` slot. When the traveller pair is omitted, `TagForm`
renders `headerAction` in place of the dialog; this page passes a read-only
traveller card built from the detail DTO. Both existing callers keep passing what
they pass today and neither changes behaviour, and the create-tag page skips the
CRM country fetch entirely because `countries` existed only to feed
`AddTravellerDialog`.

## Part 2 — traveller upload in `apps/ssr`

Folded into the existing `/tags` page rather than given its own section: a
pending pair is a proto-tag, and the traveller already goes to `/tags` to see
what they have.

### Page restructure

[`tag-table-view.tsx`](../../../web-app/apps/ssr/src/app/[lang]/(main)/tags/_components/tag-table-view.tsx)
currently owns the page shell, the header row *and* the table. Split it:

| Component                       | Owns                                                      |
| ------------------------------- | --------------------------------------------------------- |
| `tags-view.tsx` (new)           | the `max-w-5xl` shell, the header row, the separator      |
| `pending-verifications.tsx` (new) | the pending section                                     |
| `upload-verification-dialog.tsx` (new) | the upload button and its dialog                   |
| `tag-table-view.tsx`            | the table, the pagination, the `NoTags` empty state       |

The header row gains the upload button beside the existing `ClaimTag`.

### Fetching

`page.tsx` adds `getStickerManualVerificationsMyApi({ maxResultCount: 20, sorting: "creationTime desc" })`
to the **optional** `Promise.allSettled` group, never the required one. Dev
granted the new permissions to `Refund Point Admin` and `Refund Point HQ Manager`
only; a traveller without `.ViewMine` gets a 403, and that must not take the tags
list down with it. On a rejection the section simply does not render.

There is no pagination for the section. Twenty most-recent covers a traveller's
realistic history, and a second pager on a page that already has one would be
noise.

One thing to check rather than assume: `StickerManualVerificationRepository`
hand-rolls its own sort whitelist — the backend team recorded that as a follow-up
against the shared `SafeSort` helper. Verify `creationTime desc` is accepted
before relying on it; if it is not, drop `sorting` and take the repository's
default ordering, which is what the section's "most recent twenty" wording
assumes anyway.

### What the section shows

`Created` and `Invalid` rows only: the line number, a status chip, the date, and
for `Invalid` the `invalidReason` verbatim.

The chip borrows the page's existing Tailwind colour classes but **not** its
`getStatusColor` function — that one is keyed by `TagStatusType` and this is a
different enum, so a local two-entry map keeps the two from being confused for
one another. `Created` takes the yellow "in progress" pair, `Invalid` the red.

`Completed` is deliberately dropped. `MyStickerManualVerificationListDto` carries
no `tagId`, so a completed row links nowhere, and the tag it produced is already
in the table immediately below. A consequence worth stating: a traveller whose
twenty most recent pairs are all `Completed` sees no section at all, which is
correct — there is nothing outstanding.

### The upload dialog

Triggered from the header by a button gated on
`…StickerManualVerifications.Upload`, returning `null` without the grant exactly
as [`ClaimTag`](../../../web-app/apps/ssr/src/app/[lang]/(main)/tags/_components/tag-claim.tsx)
does.

Three fields, in this order:

1. **Sticker photo** — the side carrying the QR. This is `frontPictureBase64`.
2. **Tax-free-form photo** — the form the sticker is pasted on. This is
   `backPictureBase64`.
3. **Sticker line number** — required, prefilled from the QR when that succeeds.

Each photo slot is a hidden `<input type="file" accept="image/*" capture="environment">`
behind a labelled button: the camera on a phone, the file picker on a desktop,
and either way a traveller who already photographed the form can use that photo.
After selection the slot shows a thumbnail and a replace control.

Submit is disabled until both photos are prepared and the line number is
non-empty, and `onOpenChange` is guarded while the request is in flight.

On success: close, `router.refresh()`. On failure the dialog **stays open with
both photos intact** and shows the message inline. The likely rejections are a
line number that does not exist or one that already has a tag bound to it, so
making the traveller re-shoot two photos to correct a typo would be gratuitous.

### The image pipeline

`apps/ssr/src/utils/image.ts`:

```ts
prepareStickerPicture(file: File): Promise<
  | { ok: true; base64: string; previewUrl: string; bitmap: ImageBitmap }
  | { ok: false; reason: "unreadable" }
>
```

- `createImageBitmap(file, { imageOrientation: "from-image" })` applies EXIF
  rotation, so the officer sees the photo the way the traveller held the phone.
- Draw to a canvas capped at **2000 px** on the longest edge.
- Encode JPEG at q=0.85; while the base64 exceeds **2.5 MB**, step through
  q=0.7, q=0.6, then a 1600 px redraw. First result under budget wins.
- Return the bare base64 body. The DTO accepts a `data:` prefix but does not
  need one, and it is dead weight on the wire.
- Revoke the preview object URL on replace and on unmount.

The budget is not arbitrary. `apps/ssr` sets
[`bodySizeLimit: "8mb"`](../../../web-app/apps/ssr/next.config.js); two pictures
at the backend's own 5 MB *decoded* cap would be roughly 13.4 MB of base64 and
would be rejected by Next before ever reaching the API. Two pictures at 2.5 MB of
base64 is ~5 MB of request with headroom, and 2.5 MB of base64 is ~1.9 MB
decoded, inside the backend cap.

Re-encoding has a second benefit: anything the browser can decode arrives as
JPEG, which is one of the two formats the backend accepts. If `createImageBitmap`
throws, the slot reports that the image could not be read rather than posting
something the API will refuse.

## Part 3 — QR prefill

### In the submodule

`packages/ayasofyazilim-ui` is a git submodule with its own repository, so this
is a separate PR plus a pointer bump here. It is still the right home: zxing, the
format map and the native-detector shim already live there, thirty lines from
where the new code goes, and copying them into this repo is exactly the drift
worth avoiding.

**First, extract.** `BarcodeFormatName`, `FORMAT_TO_ZXING` and the
`BarcodeDetectorCtor` types move out of
[`custom/barcode-camera-scanner/index.tsx`](../../../web-app/packages/ayasofyazilim-ui/src/custom/barcode-camera-scanner/index.tsx)
into `custom/barcode-formats.ts`. The scanner imports them; nothing about its
behaviour changes.

**Then add** `custom/barcode-image-decoder/index.ts`:

```ts
decodeBarcodeFromImage(
  source: Blob | ImageBitmap | HTMLCanvasElement,
  options?: { formats?: BarcodeFormatName[] },
): Promise<string | null>
```

- Native `BarcodeDetector` when `getSupportedFormats()` covers the requested
  formats; zxing's `BrowserMultiFormatReader` with `POSSIBLE_FORMATS` and
  `TRY_HARDER` otherwise. Same two-path structure the camera scanner uses, and
  the fallback is what makes this work at all on browsers without the API.
- Retry at **1600 / 1024 / 640 px**, stopping at the first hit. A 12 MP photo of
  a small QR frequently decodes better downscaled, and a QR shot from a distance
  needs the larger size — neither single choice covers both.
- **No rotation retries.** QR self-orients; the camera scanner rotates frames
  only because PDF417 and the 1-D symbologies do not.
- Returns `null` on a miss rather than throwing.

### Wiring in `apps/ssr`

After `prepareStickerPicture` resolves for the **front** slot, decode its bitmap
with `formats: ["qr_code"]`, pass the result through `decodeTagScan` from
`@unirefund/qr`, and if the slug's `s` key yields a line number, fill the field
and note that it came from the photo.

- The field **stays editable**. A printed sheet holds several stickers and the
  camera easily catches a neighbour's code, so a prefill is a suggestion, not a
  fact.
- The decode runs off the submit path and off the preview path, so a slow decode
  never delays either.
- A miss is silent. Manual entry was always the baseline; this is help, not a
  gate.
- A tag QR rather than a sticker QR decodes fine but carries no `s`, so it
  produces no prefill and needs no special case.

Sticker QRs are produced by the sticker-book print flow, which encodes only the
`s` key — see
[`print-sticker-lines-action.ts`](../../../web-app/apps/web/src/app/[lang]/(main)/(unirefund)/operations/stickers/[stickerId]/_components/print-sticker-lines-action.ts).

## Localization

New keys go in `apps/web/src/language-data/unirefund/TagService/resources/{en,tr}.json`
for the officer screens and `apps/ssr/src/language-data/unirefund/SSRService/resources/{en,tr}.json`
for the traveller, per
[`.claude/rules/i18n.md`](../../../web-app/.claude/rules/i18n.md). Run
`pnpm run init` in each app afterwards — `tsc` does not see a new key until the
generated `i18n/` files are rebuilt, so a missing `init` looks like a type error
in the component rather than a missing key.

The 18 new localization keys the backend added to TagService's own `en.json` are
ABP permission display names and business-error messages. They surface through
the permissions UI and through API error text; they are not frontend keys and
nothing here reads them directly.

## Verification

Neither app has a unit-test runner. Both have Playwright, but the specs run
against a live environment with an auth setup step, and this feature responds to
nothing until DbMigrator has run and permissions have been granted per
environment — so E2E is follow-up, not a gate.

The gate is:

- `pnpm type-check` and `pnpm lint` in `apps/web`, `apps/ssr`, and the
  `ayasofyazilim-ui` submodule.
- `pnpm run init` in both apps.
- Manual verification over HTTPS on a real phone: both capture slots, the
  downscale budget against a full-resolution camera photo, and the prefill
  against a real printed sticker QR.
- Manual verification of the officer flow end to end: worklist filter, both
  actions, and a created tag landing on `operations/tax-free-tags/{id}`.

`next build` must not be run while a dev server is up — both share `.next`, and
the build strips the dev HMR chunks, leaving the browser in a `ChunkLoadError`
reload loop.

## Risks

Three things that will present as frontend bugs and are not:

- **Traveller permissions.** Dev granted the seven new permissions to
  `Refund Point Admin` and `Refund Point HQ Manager` only. Travellers need
  `.Upload` and `.ViewMine` or the whole of Part 2 is invisible. The design
  degrades quietly rather than erroring, which is correct behaviour and also
  means a missing grant is easy to mistake for a bug.
- **`ViewMerchantInfo`.** The create-tag form needs the pre-existing
  `TagService.StickerHeaders.ViewMerchantInfo` on top of the seven. Granting only
  the seven leaves the merchant block returning 403.
- **Re-authentication.** The OAuth scope list changed, and a refresh grant reuses
  the original scope, so existing sessions keep their old audiences until browser
  storage is cleared.

And one sequencing risk: Part 3 depends on a submodule PR landing and a pointer
bump. Part 2 can be built and merged without it — the line-number field works
manually, and the prefill is additive.

## Out of scope

- The `super-app` traveller upload, which is its own design.
- The Angular admin shell under `apps/angular/**`, which is not the production
  React frontend.
- A retention policy for rejected picture pairs. The backend records this as a
  known follow-up; nothing in the frontend can address it.
- `CreatedByPartyType` / `CreatedByPartyId` on `TagDto`, `TagDetailDto` and
  `TagListItemDto`. They arrived in the same backend PR but belong to the tag
  screens, not to this flow. Worth noting for whoever does use them: ABP
  serialises the enum **by name**, so the value arrives as `"REFUNDPOINT"`, and a
  numeric TypeScript enum would silently fail every comparison. The generated
  type is a string union, so the generated code is already correct.
