# Design: Role-aware QR scan with three flows (draft-claim, issued-details, validation)

**Date:** 2026-07-22
**Scope:** `src/hooks/useQrScanLauncher.tsx`, `src/screens/shared/TagPreviewScreen.tsx`, `src/utils/tag.ts`, the three role Home screens (`src/screens/{traveller,merchant,refund-point}/Home/HomeScreen.tsx`), a new traveller-picker component, a new KYC camera-capture flow, new actions under `src/actions/{KYCService,TagService}`, `src/actions/lib.ts`, the role-scoped tag list + detail path (`src/hooks/useLoadTags.tsx`, `src/store/tag.ts`, `src/screens/shared/Tags/**`, `src/app/(auth)/tags/[tagId].tsx`, `getFullTagDetailById`), and localization resources.

## Goal

Make the QR scanner handle three solutions cleanly and **role-aware**:

1. **Draft tag scan** — the scanned tag is claimable. A **traveller** claims it for themselves; **staff** assign it to a traveller.
2. **Issued tag scan** — show the tag's details.
3. **Validation QR scan** (airport/kiosk "rolling" QR) — start the export-validation flow. **Travellers only.**

This is an **audit-and-fill** effort: the three flows already have implementations. The existing code is the baseline; we verify each flow end-to-end and add the missing role behavior, the corrected draft/issued rule, and the staff-assign path.

## Roles

`UserRole` (see [src/store/user.ts](../../../src/store/user.ts)) = `traveller` | `merchant` | `refundPoint`. `isMerchant` / `isRefundPoint` are derived. "Staff" = merchant **or** refund-point. Staff are always authenticated (they live in the `(auth)` route group); travellers can also be logged out (`tag-preview` and `validate` are root routes).

## Decisions (agreed with user)

1. **Scope:** audit & fix gaps. Existing code (`classifyScan`, `useQrScanLauncher`, `TagPreviewScreen`, `ValidateScreen`) is the baseline; extend it, don't rebuild.
2. **Draft vs issued — both must agree.** Claim path requires `status === "Draft"` **and** no traveller attached. Details path requires a non-Draft status **and** a traveller attached. Any mismatch is a **divergent** tag surfaced as an explicit error — not silently treated as claimable.
3. **Roles:**
   - Validation is **traveller-only**. Staff scanning a validation QR are blocked with a clear message.
   - Staff **can** view issued tag details.
   - Staff scanning a **draft** tag assign it to a traveller via `postApiTagServiceTagByIdAssignTraveller` (tag GUID + full `TravellerRequestDto`).
   - Travellers keep the existing self-claim (`postTagTravellerSelfAssign`, sales amount as proof).
4. **Traveller picker (staff):** mirror the web `SearchTraveller` — search by document number / email / phone **plus** scan-to-prefill. Scan-to-prefill has two paths: on-device **MRZ** (existing scanner) and **KYC verify-by-photo** (server-side verification).
5. **KYC:** the KYCService SDK client now exists (`src/saas/KYCService`); the action wrappers and client factory are added as part of this work (collaboratively). Full web parity on the scan path.
6. **Post-assign:** land on the tag detail screen (`/(auth)/tags/[tagId]`).
7. **Residence country:** `residenceCountryCode3` is required by `AssignTravellerToTagRequestDto` but absent from MRZ/KYC data — prefill it from nationality (mirrors the existing `getInformationFromMrz` behavior). Not a blocking confirm step.
8. **Legacy QR** (`tagNumber` + document, no GUID `tagId`): not a concern beyond generic handling. Staff-assign needs the GUID; legacy codes fall through to existing not-actionable handling.
9. **Role-scoped tag endpoints (hard invariant).** Travellers must **never** call tenant-scoped tag endpoints; staff (merchant/refund-point) are **always** tenant-scoped. A tag scanned **without auth** may use the public read.
   - Authenticated traveller **list** → cross-tenant (`getApiTagServiceTagCrossTenantsByTravellerIdClaim`, current behavior).
   - Authenticated traveller **detail** → authed cross-tenant **by tag number** (`getOwnedTagByTagNumber` = `getApiTagServiceTagCrossTenantsByTravellerIdClaimByTagNumber`), replacing the public-by-id read in the authenticated `TagDetailScreen`.
   - Staff **list** → tenant-scoped `getApiTagServiceTag`; staff **detail** → tenant-scoped `getApiTagServiceTagByIdDetail`.
   - The current `TagDetailScreen` scope bug (`isMerchant ? "Merchant" : "Traveller"`) sends **refund-point** users down the traveller path; scope must key off `isMerchant || isRefundPoint`.
   - The two list DTOs (`TagListItemDto` tenant vs `TagListItemForTravellerCrossTenantsDto` cross-tenant) are **field-identical** for every field the UI reads, and both wrappers expose `{ items, totalCount }` — so no heavy mapping layer is needed; the store item type widens to the shared subset.
   - `TagPreviewScreen` (scan result) keeps `getPublicTagByTagId` so it works pre-login; it is exempt from the tenant/cross-tenant split.

## Architecture (Approach A: extend the hub + one reusable picker)

`classifyScan` already separates `validate` / `tag` / `unknown`; `TagPreviewScreen` is already the "what kind of tag + what can I do" hub. We layer role-awareness onto these rather than splitting into per-role screens.

### 1. Classification & routing role gate — `useQrScanLauncher`

`classifyScan` ([src/utils/qr/classifyScan.ts](../../../src/utils/qr/classifyScan.ts)) is unchanged.

[useQrScanLauncher.tsx](../../../src/hooks/useQrScanLauncher.tsx) reads `useUserStore()` and gates by role in `onScanned`:

- `kind === "validate"`:
  - staff (`isMerchant || isRefundPoint`) → toast `MobileApp.Qr.ValidateStaffBlocked`; do **not** navigate.
  - traveller / logged-out → `router.push("/validate", { qrValue })` (unchanged).
- `kind === "tag"` → `router.push("/tag-preview", { tagId, tagNumber, travellerDocumentNumber })` (unchanged; role/kind resolved in the screen).
- `kind === "unknown"` → `MobileApp.Qr.Unrecognized` toast (unchanged).

### 2. Canonical tag-kind — `src/utils/tag.ts`

New pure helper, replacing the `isDraftPublicTag`-only check inside the preview:

```ts
export type TagKind = "draft" | "issued" | "divergent";

export function deriveTagKind(tag: TagPublicDetailDto): TagKind {
  const hasTraveller = !!tag.traveller?.travellerDocumentNumber;
  const isDraftStatus = tag.status === "Draft";
  if (isDraftStatus && !hasTraveller) return "draft";
  if (!isDraftStatus && hasTraveller) return "issued";
  return "divergent"; // Draft-but-owned, or non-Draft-but-unowned
}
```

`isDraftPublicTag` / `salesAmountFromPublicDetail` remain for the traveller self-claim proof amount.

### 3. `TagPreviewScreen` — role × kind CTA

The screen keeps loading public detail by `tagId` (the GUID carried in the slug — exactly what the assign endpoint needs). It reads `useUserStore()` and picks the CTA from `deriveTagKind(tag)` × role:

| Kind | Traveller / logged-out | Staff (merchant / refund-point) |
|---|---|---|
| **draft** | authed → self-claim (`postTagTravellerSelfAssign`, `salesAmount` proof); logged-out → stash pending-claim + login *(unchanged)* | open traveller-picker → `postApiTagServiceTagByIdAssignTraveller(id, { traveller })` → success toast → `router.replace("/(auth)/tags/[tagId]")` |
| **issued** | authed → View in My Tags; logged-out → login to view *(unchanged)* | View details → `/(auth)/tags/[tagId]` (authed merchant detail) |
| **divergent** | error card (`MobileApp.Qr.TagPreview.Divergent`), no primary action | same |

The informational body block also branches on kind (draft info / issued info / divergent warning).

### 4. Traveller picker — new `src/screens/shared/_components/SearchTraveller` (mobile)

A `@gorhom/bottom-sheet` opened from the staff draft CTA. Produces a `UniRefund_TagService_Travellers_TravellerRequestDto` and calls back to `TagPreviewScreen` to run the assign. Two intents:

- **Search** — method selector (Document / Email / Phone) + input + Search:
  - `getTravellerByDocumentNumber` / `getTravellerByEmail` / `getTravellerByPhoneNumber` (all exist in [src/actions/TravellerService/actions.ts](../../../src/actions/TravellerService/actions.ts)), each returns `TravellerSearchResultDto[]`.
  - Results list of `travellerDocuments`; selecting a document maps `TravellerDocumentDto` + `residences[0]` → `TravellerRequestDto`.
  - Auto-select when exactly one traveller with exactly one document matches (web parity).
- **Scan** — two buttons:
  - **MRZ passport** (on-device): `scanDocument()` + `getMrzDataFromDocument()` + MRZ parse (`getInformationFromMrz`) from [src/utils/mrz/mrz-utils.ts](../../../src/utils/mrz/mrz-utils.ts) → prefill.
  - **KYC camera** (server-verify): capture front image → `postApiKycServiceIdVerificationsVerifyByPhoto` → map `IdVerificationByPhotoResultDto` → prefill; surface `warnings` / `mappedStatus` (allow retake on `Declined`).

**Field mapping to `TravellerRequestDto`** (`travellerDocumentNumber`, `nationalityCountryCode3`, `firstName`, `lastName`, `residenceCountryCode3` required; `id`, `expirationDate`, `birthDate` optional):
- Search result: from the selected `TravellerDocumentDto` (+ `residences[0].residenceCountryCode3`, falling back to nationality when absent).
- MRZ / KYC: `residenceCountryCode3` defaults to `nationalityCountryCode3`.

Reuse existing UI primitives: `BottomSheet`, `Input`, `Button`, `CountryInput`, `PhoneInput`, `Ionicons`.

### 5. KYC camera capture (net-new)

- [src/actions/lib.ts](../../../src/actions/lib.ts): add `getKycServiceClient(customHeaders?)` mirroring the existing client factories.
- `src/actions/KYCService/post.ts`: add `postApiKycServiceIdVerificationsVerifyByPhoto` wrapper (`fetchRequest` + `getKycServiceClient`).
- Capture: `expo-camera` `takePictureAsync({ base64: true })` (already a dependency) → `frontImageBase64`. On gateway error, fall back to MRZ/search (do not hard-block the picker).

### 6. Actions summary

- **Reuse:** `postApiTagServiceTagByIdAssignTraveller` ([src/actions/TagService/post.ts](../../../src/actions/TagService/post.ts)), `getTravellerBy{DocumentNumber,Email,PhoneNumber}`, `getPublicTagByTagId`, `postTagTravellerSelfAssign`, `getOwnedTagByTagNumber`, `getTagDetailsById`.
- **Add:** `getKycServiceClient` (lib) + `postApiKycServiceIdVerificationsVerifyByPhoto` (KYCService/post.ts); `getTenantTags` wrapper around `getApiTagServiceTag` (TagService/actions.ts).
- **Change:** `getFullTagDetailById` → role/scope-aware, keyed by `"Traveller" | "Staff"` and taking both `tagId` and `tagNumber` (see §7).

### 7. Role-scoped tag endpoints (list + detail)

Enforces decision 9. "Staff" = `isMerchant || isRefundPoint`.

**List — `loadTags` becomes role-aware** ([src/hooks/useLoadTags.tsx](../../../src/hooks/useLoadTags.tsx)):
- traveller → `getTags` (cross-tenant, unchanged).
- staff → `getTenantTags` → `getApiTagServiceTag` (`TagListResponseDto_TagListItemDto`).
- Both return `{ items, totalCount }`; `useTagStore.setTags` is unchanged. The store's `TagListItem` type widens to the shared field subset (id, tagNumber, status, travellerFullName, merchantTitle, issueDate, salesAmount, currency) — a union of the two DTOs, which are field-identical for these. `TagScreen` and `LastestTag` need no field changes.
- The post-claim / post-assign `loadTags(true)` refresh inherits role-awareness automatically.

**Detail — scope by role** ([TagDetailScreen.tsx](../../../src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx), [useTagDetail.tsx](../../../src/screens/shared/Tags/TagDetail/useTagDetail.tsx), `getFullTagDetailById`):
- Scope = staff → `"Staff"` (tenant), else `"Traveller"` (cross-tenant). Fixes the refund-point mis-route.
- traveller → `getOwnedTagByTagNumber(tagNumber)` (authed cross-tenant by number) → `TagPublicDetailDto`.
- staff → `getTagDetailsById(tagId)` (tenant by id) → `TagDetailDto`. Unchanged `TagDetailData` shape either way.
- **`tagNumber` must reach the detail screen** (traveller path needs it): `/(auth)/tags/[tagId]` gains a `tagNumber` query param. Navigation sources that already have it: `TagScreen`, `LastestTag` (list items carry `tagNumber`), and the scan "issued → details" path in `TagPreviewScreen` (`tag.tagNumber`). `[tagId].tsx` reads both params and passes them down.
- `MerchantAction` (print) stays gated on `isMerchant` only — refund-point gets the staff **fetch** but not the print action.

### 8. Staff scan entry points

Extract the traveller Home's Scan CTA + `QrScanner` block into a shared `ScanEntry` component (`src/screens/shared/_components/ScanEntry.tsx`) that wraps `useQrScanLauncher` + `QrScanner`. Render it on all three Home screens; remove the `isTraveller` gate so merchant and refund-point Home get the scanner too.

### 9. Localization

New keys in `src/localization/resources/{en-US,tr-TR}.json`, then `npm run init`:
- `MobileApp.Qr.ValidateStaffBlocked`
- `MobileApp.Qr.TagPreview.Divergent` (title + body)
- `MobileApp.Qr.TagPreview.AssignTraveller` (staff draft CTA), `AssignSuccess`, `AssignError`
- Picker: search-method labels, `Search`, results empty, `NoMatchPrefilled`, scan buttons (MRZ / camera), KYC verifying / failed / no-data / warnings labels.

## Data flow

```
QrScanner → useQrScanLauncher.onScanned(raw)
  ├─ classifyScan → "validate"
  │     ├─ staff        → toast (blocked), stop
  │     └─ traveller    → /validate?qrValue=…  (existing flow)
  ├─ classifyScan → "tag" → /tag-preview?tagId=…
  │     └─ TagPreviewScreen: load PUBLIC detail (works logged-out) → deriveTagKind × role
  │           ├─ draft + traveller → self-claim → /(auth)/tags/[id]?tagNumber=…
  │           ├─ draft + staff     → SearchTraveller → assign-traveller → /(auth)/tags/[id]?tagNumber=…
  │           ├─ issued (any role) → /(auth)/tags/[id]?tagNumber=…
  │           └─ divergent         → error card
  └─ classifyScan → "unknown" → toast

/(auth)/tags/[tagId]  (authenticated detail — role-scoped fetch)
  ├─ traveller → getOwnedTagByTagNumber(tagNumber)   (cross-tenant, authed)
  └─ staff     → getTagDetailsById(tagId)            (tenant-scoped)
```

## Testing

**Unit (jest):**
- `deriveTagKind` — full truth table: {Draft, non-Draft} × {traveller, no-traveller} → {draft, issued, divergent}.
- `TravellerSearchResultDto → TravellerRequestDto` mapping (incl. residence fallback).
- `IdVerificationByPhotoResultDto / MRZ → TravellerRequestDto` mapping (residence defaults to nationality).

- Role→endpoint selection: traveller list → cross-tenant, staff list → tenant; traveller detail → cross-tenant by number, staff detail → tenant by id (assert the correct action is invoked per role, incl. refund-point routed as staff).

**Manual / integration matrix:**
- Traveller: draft → claim → detail; issued → view; validation → validate flow. Tags tab + detail hit only cross-tenant endpoints.
- Staff (merchant & refund-point): draft → picker (search + MRZ + KYC) → assign → detail; issued → detail; validation → blocked message. Tags tab + detail hit only tenant-scoped endpoints; refund-point no longer falls into the traveller path.
- Divergent tag → error card.
- KYC decline/warnings → retake; KYC gateway down → fallback to MRZ/search.

## Edge cases

- **Legacy QR** (no GUID `tagId`): staff-assign cannot run; falls through to existing not-actionable handling. No extra work.
- **KYC unavailable:** graceful fallback, picker stays usable via MRZ/search.
- **Logged-out staff:** impossible (staff are always in `(auth)`), so no logged-out-staff branch.

## Out of scope

- Adding the "claim additional tags from the validation results view" (a separate, pre-existing follow-up on the validate flow).
- Any change to `classifyScan` payload formats or the BCBP boarding-pass parser.
- Changing tag list/detail screens beyond navigating to them.
