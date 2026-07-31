# Design: Refund creation for refund-point users

**Date:** 2026-07-31
**Repo:** `super-app`
**Reference:** `web-app/apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund`
**Scope:** mobile only. One SDK regeneration (ContractService). No backend, no web changes.

## Goal

A refund-point user can pay out a traveller's refundable tags from the mobile app — the flow web already offers at `operations/refund`, reshaped for a phone at a counter.

## What is true today

The refund-point role exists in `super-app` and can do almost nothing. Its Home is a centred placeholder string; its Tags tab and tag detail are the shared traveller/staff screens; scanning routes it to a tag preview. There is no refund creation anywhere in the app.

What is already in place and gets reused:

| Capability | Where |
| --- | --- |
| `POST /api/RefundService/refunds` | `saas/RefundService` (`postApiRefundServiceRefunds`), unwrapped |
| Refundable tags query | `saas/TagService` (`getApiTagServiceTagTagsRefund`), unwrapped |
| Traveller lookup (document / email / phone + passport MRZ scan) | `screens/shared/_components/SearchTraveller` |
| Skia signature pad | `screens/shared/_components/tag-calculator/SignatureSheet` + `SignaturePads` |
| Card validation (Luhn, expiry, formatting) | `utils/card/card.ts`, already unit-tested |
| Sticky running-total bar + review sheet pattern | `tag-calculator/CartSummaryBar` + `CartReviewSheet` |
| Success-in-place pattern | `merchant/CreateTag/_components/CreatedTagSummary` |
| Hidden push-navigable route pattern | `(auth)/create-tag`, `(auth)/connected-devices` |

The one genuine gap: web reads the refund point's allowed refund methods from ContractService, and `super-app` has no ContractService client generated.

## The web flow being ported

`@refundPoint/page.tsx` → `client-page.tsx` → `_components/refund-filters/*`:

1. `refundPointId` from the session's `RefundPointId` claim; absent → `NoAccessibleRefundPoints`.
2. `getPaymentTypesByRefundPointIdApi(refundPointId)` → allowed `RefundMethod[]`.
3. Traveller looked up by document number.
4. `getRefundableTagsApi({ refundPointId, refundType, travellerDocumentNumber, isExportValidated, maxResultCount: 100 })`.
5. Multi-select tags; live ledger of sales / VAT / refund fee / refund.
6. Method picked; Cash → paid date, CreditCard → masked PAN + expiry, other methods → no form.
7. Optional traveller and refund-point signatures.
8. Confirm dialog → `postRefundApi` → navigate to refund detail.

## Decisions (agreed with user)

1. **Traveller-first, web parity.** A dedicated Refund screen: find the traveller, list their refundable tags, multi-select, pay. Not scan-first — one traveller commonly has several tags in one payout.
2. **Generate ContractService.** Added to `src/saas/API_LIST.json` and regenerated, so mobile offers exactly the methods the refund point is contracted for. Rejected: hardcoding the enum (the UI would offer methods the backend rejects at submit) and cash-only (a card-only refund point could not use the app).
3. **Method coverage matches web exactly.** Cash → paid-date picker. CreditCard → manual masked number + expiry, recording a payout already taken on the terminal. Any other contracted method is selectable with no extra form.
4. **Success summary in place**, following `CreatedTagSummary`. No refund detail screen is built.
5. **Both signatures optional**, identical to web policy.
6. **One scrolling screen with a sticky bottom bar**, not a wizard and not two screens. The refund total stays visible while tags are being selected, and the whole flow is one hook's state.

## Architecture

### Route and entry

`src/app/(auth)/refund.tsx` renders `RefundScreen`, and is registered in `(auth)/_layout.tsx` as `<Tabs.Screen name="refund" options={{ href: null }} />` — a hidden tab, push-navigable, exactly as `create-tag` and `connected-devices` already are.

Refund-point Home gains one primary CTA card pushing to `/(auth)/refund`, styled like merchant Home's Create Tag card, with the existing placeholder text kept below it. The 2026-07-30 quick-access design deliberately left refund-point Home content for later; this adds the single card this feature needs, not a Home redesign.

### Resolving the refund point

`src/hooks/useRefundPointId.ts`, mirroring `useMerchantId.ts`: reads the `RefundPointId` JWT claim from the user store and handles the string-or-array shape ABP emits for a repeated claim. `src/store/user.types.ts` gains `RefundPointId?: string[] | string` on `JwtUser`.

The claim exists on this identity server — web decodes it at `packages/utils/auth/auth-actions.ts:137`; `super-app`'s type simply never declared it. **Verify against a real refund-point token as the first implementation step.** If it turns out to be absent, the fallback is the primary `REFUNDPOINT` affiliation's `partyId`, which `SessionProvider.resolveRoleFromAffiliations` already fetches (and currently discards) and `SignalrProvider` holds in state.

No refund point resolved → the screen renders an empty state and the form never mounts.

### Files

New:

```
src/app/(auth)/refund.tsx                              route
src/hooks/useRefundPointId.ts
src/actions/ContractService/actions.ts
src/screens/refund-point/Refund/
  RefundScreen.tsx                                     layout + orchestration
  useRefundFlow.ts                                     all flow state + submit
  refund.logic.ts                                      pure: totals, canSubmit, DTO build
  _components/TravellerSearchCard.tsx
  _components/MethodPicker.tsx
  _components/PaymentDetails.tsx
  _components/RefundableTagList.tsx
  _components/RefundSummaryBar.tsx
  _components/RefundConfirmSheet.tsx
  _components/RefundSuccess.tsx
  __tests__/refund.logic.test.ts
```

Modified:

```
src/saas/API_LIST.json                  + Contract entry, then `npm run gen`
src/actions/lib.ts                      + getContractServiceClient
src/actions/TagService/actions.ts       + getRefundableTagsApi
src/actions/RefundService/post.ts       + postRefundApi
src/store/user.types.ts                 + RefundPointId on JwtUser
src/app/(auth)/_layout.tsx              + hidden refund route
src/screens/refund-point/Home/HomeScreen.tsx        + CTA card
src/screens/shared/_components/tag-calculator/line.ts          SignatureTarget widened
src/screens/shared/_components/tag-calculator/SignaturePads.tsx  label lookup
src/localization/resources/en-US.json, tr-TR.json   then `npm run init`
```

### Shared signature component

`SignatureTarget` is `"merchant" | "traveller"` and `SignaturePads` picks its label with a `target === "merchant"` ternary — so a third target would silently render as "traveller". The union widens to include `"refundPoint"` and the ternary becomes a record keyed by target, making the mapping total. `SignatureSheet` is target-agnostic and unchanged; `targets` is already a prop, so the merchant and sticker call sites keep their current behaviour.

## Data flow

All state lives in `useRefundFlow` as component state — no store. Same reasoning `useCreateTag` documents: the traveller picker is an inline modal, so nothing has to survive a navigation.

```
refundPointId     useRefundPointId()            JWT claim, not fetched
paymentTypes      fetched once on mount         RefundMethod[]
traveller         SearchTraveller modal         TravellerRequestDto
method            picker                        auto-selected when exactly one is allowed
isExportValidated segmented toggle              default true
tags              fetched per query key         (documentNumber, method, isExportValidated)
selectedTagIds    Set                           cleared whenever the query key changes
signatures        { traveller?, refundPoint? }  file URIs until submit
paidDate          Cash only                     defaults to now
card              CreditCard only               { number, mm, yy }
createdRefund     set on success                swaps the form for RefundSuccess
isSubmitting      submit guard
```

No tag request is made until a traveller is selected; after that, any change to the query key refetches and clears the selection. The toggle maps to the API the way web does: `isExportValidated: status !== "need-validation"`.

### API calls

Three, all behind `src/actions/**` wrappers per the repo's api-actions rule — `fetchRequest` + a `get<Service>Client(customHeaders)`, never an SDK client from UI code.

1. **`getPaymentTypesByRefundPointIdApi(refundPointId)`** — new `src/actions/ContractService/actions.ts` over `getApiContractServiceRefundFeeHeadersPaymentTypesByRefundPointByRefundPointId`. Fetched on mount in a `useEffect`: a network call keyed on an external value, the same honest use of an effect that `useMerchantContext` documents.
2. **`getRefundableTagsApi(...)`** — added to `src/actions/TagService/actions.ts` over `getApiTagServiceTagTagsRefund`, with web's exact arguments.
3. **`postRefundApi(dto)`** — added to `src/actions/RefundService/post.ts` over `postApiRefundServiceRefunds`.

### Screen order

Traveller → method + payment details → validation toggle + tag list → signature pads → sticky bar.

Method sits **above** the tag list, unlike web, because `refundType` is a filter on the refundable-tags query: the chosen method determines which tags come back. Web can place it in a right-hand rail because both columns are visible at once; a single mobile scroll has to order them causally. When the contract allows exactly one method it is preselected, so in the common case the ordering is invisible.

### Traveller lookup

`SearchTraveller` is reused unchanged. It already searches by document number, email or phone, can scan a passport MRZ, and returns a `TravellerRequestDto` carrying `travellerDocumentNumber` — exactly the key the refundable-tags query needs. Mobile therefore gets passport-scan traveller lookup, which web does not have.

### Pure core — `refund.logic.ts`

- `sumTagTotals(rows)` → sales, VAT, refund fee, refund, plus the currency of the first row (web's `rows[0]?.currency || "USD"`).
- `canSubmit(state)` → refund point present, at least one tag, a method chosen, card valid when CreditCard, not already submitting.
- `buildCreateRefundDto(state)` → `{ refundPointId, tagIds, refundTypeEnum }`, plus `paidDate` for Cash only, `paidCardDetail` for CreditCard only (masked number, numeric month, `20{yy}` year — web's conversion), and each signature field only when captured. A contracted method that is neither Cash nor CreditCard sends the base fields and neither block, matching web, whose `PaymentForm` renders nothing for those methods.

Card validity composes `luhnValid`, `isExpiredCard` and `parseExpiry` from `utils/card/card.ts`. No new dependency: web uses the `card-validator` package, but this repo already has these helpers with passing tests, and the UI rule is not to add a dependency an existing capability covers.

### Submit

The sticky bar's Refund button opens `RefundConfirmSheet` — a `BottomSheet`, this app's equivalent of web's `ConfirmDialog` — showing tag count, method and total. Confirming converts the signature URIs to base64 with `expo-file-system` (the same `toBase64` helper `useCreateTag` uses), builds the DTO and posts. Success sets `createdRefund`; the screen becomes `RefundSuccess` with amount, tag count and method, offering "New refund" and "Done".

## Error handling

| Failure | Behaviour |
| --- | --- |
| No `RefundPointId` | Full-screen empty state; the form never renders |
| Payment types request fails | Error row + Retry |
| Contract allows no methods | Static message, no retry — retrying cannot help |
| Refundable tags request fails | Inline error + Retry, traveller selection preserved |
| No refundable tags returned | Empty state hinting at the other validation filter |
| Submit fails | Toast via `useToastRef`; form, selections and signatures preserved, button re-enabled |
| 401 | Already handled — `fetchRequest` refreshes and retries once |

Distinguishing a failed payment-types request from an empty contract is a deliberate departure: web conflates them behind one message, but only one of the two is worth retrying.

## Edge cases

- **Method change clears the tag selection** — the list itself is re-filtered, so a carried-over selection could reference tags no longer offered.
- **Traveller change clears selection and both signatures** — they belong to that traveller's payout.
- **Double submit** blocked by `useDebouncedPress` plus the `isSubmitting` guard.
- **Mixed currencies:** once a tag is selected, tags in a different currency are disabled with a hint. Web sums whatever is selected and labels the total with `rows[0].currency`, which at a cash desk shows an arithmetically meaningless number. The guard is a filter and a disabled style — the one place this design is stricter than web.
- **`maxResultCount: 100`, no pagination** — same as web, and well past a plausible counter session.

## Localization

New `MobileApp.Refund.*` keys in both `src/localization/resources/en-US.json` and `tr-TR.json`, then `npm run init`. `*.gen.json` files are never hand-edited.

Keys cover: screen title and Home CTA; traveller prompt, selected-traveller card and change action; all six `RefundMethod` labels; the export-validated / needs-validation toggle; tag list empty, error and retry; the five ledger labels (selected count, sales amount, VAT, refund fee, refund); paid date; card number; month/year; invalid card; the refund-point signature label (the traveller one already exists as `MobileApp.CreateTag.TravellerSignature`); confirm sheet title, description and pay action; success title, info and both actions; the submit error; and the no-refund-point empty state.

## Testing

`src/screens/refund-point/Refund/__tests__/refund.logic.test.ts` covers the pure core:

- `sumTagTotals` — empty, single row, several rows, rows with null amounts, mixed currency.
- `canSubmit` — the full disable matrix: no refund point, no tags, no method, invalid card under CreditCard, valid card under CreditCard, already submitting.
- `buildCreateRefundDto` — Cash sends `paidDate` and no card block; CreditCard sends `paidCardDetail` with numeric month and `20{yy}` year and no `paidDate`; signature fields appear only when captured; a non-Cash non-card method sends neither block.

Card validation already has coverage in `src/utils/card/__tests__/card.test.ts`.

**No component tests.** `@testing-library/react-native` cannot resolve `react-native` under this jest config, so every suite importing it fails at import, before any assertion.

Measured baseline on 2026-07-31, which this work must leave unchanged:

```
Test Suites: 7 failed, 19 passed, 26 total
Tests:       262 passed, 262 total
```

The 7 failures are all that RNTL import: `BottomSheet`, `Button`, `DebouncedPressable`, `SafeAreaView`, `Toast`, `Modal`, `TabPage`. This is worse than the 4-failure baseline recorded on 2026-07-30 — three more RNTL suites have been added since. Fixing the jest config is out of scope here.

Gate before PR:

- `npm run lint` clean
- `npx tsc --noEmit` clean
- `npm test` at exactly the baseline above
- Manual pass on Android and iOS: cash refund end-to-end, card refund, an account with no refund point, and a forced submit failure

## Deliberately not included

- **Admin / multi-refund-point selection** — web's `@admin` parallel route. Mobile staff act for a single refund point resolved from their token.
- **A refund detail screen.** `getRefundDetailByIdApi` already exists in `actions/RefundService/actions.ts` and stays unused; the success summary covers what the counter needs.
- **Payout to a saved traveller card or bank token** — `travellerCardId` and `travellerBankTokenId` are in `CreateRefundDto` and the traveller Cards feature already vaults tokens. A mobile-native capability web does not expose, and a clean follow-up.
- **Scanning a tag to pre-fill the flow.**
- **OCR card capture** via the existing `CardScannerModal`.
