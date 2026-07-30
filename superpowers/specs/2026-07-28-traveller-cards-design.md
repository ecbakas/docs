# Design: Traveller card and bank-account management

**Date:** 2026-07-28
**Scope:** A Cards section in the traveller perspective of `mobile/app` — list, add (typed or camera-scanned), rename, set-default and delete saved payout tokens. Ports the SSR web `account/cards` page, and adds bank-account support that the web app does not have yet.

## Goal

A traveller can manage the cards and bank accounts their refunds pay out to, from the phone, without going to the web app.

## Why

The SSR web app already ships this at `apps/ssr/src/app/[lang]/(main)/account/cards`. The mobile app has none of it, even though the traveller is the primary mobile persona and the payout method is what a tax-free refund ultimately lands on.

The API side is already done. `mobile/app/src/saas/RefundService/sdk.gen.ts` contains the complete `TravellerCardService` — six endpoints covering every operation this feature needs:

| Endpoint                                                    | Purpose                                     |
| ----------------------------------------------------------- | ------------------------------------------- |
| `getApiRefundServiceTravellerCardsMine`                      | list the caller's own tokens, from the claim |
| `postApiRefundServiceTravellerCards`                         | save a card (PAN vaulted in the CDE)        |
| `postApiRefundServiceTravellerCardsBank`                     | save a bank account (IBAN, not vaulted)     |
| `putApiRefundServiceTravellerCardsByIdNickname`              | rename                                      |
| `postApiRefundServiceTravellerCardsByIdSetDefault`           | set default for its type                    |
| `deleteApiRefundServiceTravellerCardsById`                   | soft delete                                 |

What is missing is only the actions wrapper, the screen, and the RN ports of the two web UI primitives. `src/actions/RefundService/actions.ts` currently holds one unrelated function.

## Decisions (agreed with user)

1. **Two entry points** — a Profile menu item *and* a Home shortcut, both pushing the same screen.
2. **Camera scan included**, not manual-entry-only.
3. **Cards and bank accounts**, not cards alone. The web app will add bank accounts later, so mobile leads here.
4. Consequence of 3: the bank half is designed rather than ported, and mobile becomes the reference implementation for it.

## Scope

**In:** the cards screen; card add via typed entry and on-device camera OCR; bank-account add; rename, set-default and delete for both types; the two RN UI ports; traveller-ID resolution; EN + TR copy; unit tests for all pure logic.

**Out:**

- **Wallet tokens.** `PayoutTokenType` is `'Card' | 'Bank' | 'Wallet'`, but there is no wallet add endpoint and no distinct display for one. Wallet tokens are filtered out of the list rather than rendered un-manageably.
- **Pagination.** The list endpoint is paged; travellers hold a handful of tokens. One request with `maxResultCount: 100`. If that ever truncates, it is a paging task, not a silent cap — noted here so it is not mistaken for coverage.
- **Choosing a payout method during a refund.** This screen manages the wallet; it does not pin a token to a tag or refund.
- **Editing a saved card's number or expiry.** The API offers no such endpoint by design — the PAN is vaulted. Replacing a card means delete then add.

## Entry points

Route `src/app/(auth)/profile/cards.tsx`, registered as a `Stack.Screen name="cards"` in `src/app/(auth)/profile/_layout.tsx`.

The route nests one level below the `profile` tab, which means the tab bar hides itself with no extra work: `(auth)/_layout.tsx` already keys `tabBarStyle.display` off `segment?.[2]`, and `/(auth)/profile/cards` puts `"cards"` there. This is the same mechanism `edit-profile` relies on today.

**Profile menu** — a new item in the traveller `ProfileScreen` `menuItems`, icon `card-outline`, placed after Personal Information.

**Home shortcut** — a `CardAction` row on the traveller `HomeScreen`, directly under the red tax-free-map tile and above the Last-tag section. `CardAction` already renders exactly this shape (icon, title, description, chevron), so the shortcut adds no new UI vocabulary.

## Module layout

```
src/app/(auth)/profile/cards.tsx          route → CardsScreen

src/screens/traveller/Cards/
  CardsScreen.tsx           ModalTemplate shell; two sections; empty states
  useCards.ts               list + five mutations + toasts + per-row pending state
  _components/
    CardPreview.tsx         RN port of CreditCardPreview; children slot for action pills
    CardBrandLogo.tsx       RN port of card-brand-icon, via react-native-svg
    BankRow.tsx             bank token row — masked IBAN, bank name, country flag
    AddCardSheet.tsx        BottomSheet: card form + "Scan card" entry
    AddBankSheet.tsx        BottomSheet: IBAN / BIC / bank / country / holder / nickname
    EditNicknameSheet.tsx   BottomSheet, shared by both types
    DeleteTokenSheet.tsx    BottomSheet confirm, shared by both types
    CardScannerModal.tsx    expo-camera capture → on-device OCR → prefill

src/utils/card/
  card.ts                   onlyDigits, formatCardNumber, normalizeExpiry, parseExpiry,
                            luhnValid, getCardBrand, groupMaskedNumber
  iban.ts                   normalizeIban, ibanValid (mod-97), formatIban, maskIban
  parse-card-ocr.ts         pure: OcrBlock[] → { number?, expiry? }
  __tests__/                one spec per module
```

Pure logic lives in `src/utils/card/` per the AGENTS.md convention, mirroring the existing `src/utils/qr/` shape including its own `__tests__`. It is not colocated with the screen because it has a second consumer waiting: tag creation registers payable cards through `RegisterPayableCardInputDto` and needs the same formatting and Luhn check.

Each unit answers the three questions cleanly: `CardPreview` renders a card face and knows nothing about defaults or deletion; `useCards` owns all server state and knows nothing about layout; the `src/utils/card/` modules are pure and know nothing about React.

## Data layer

Following the existing verb split in `src/actions/` — reads in `actions.ts`, writes in `post.ts`, with the delete beside the reads exactly as `IdentityService.deleteGdpr` sits in its `actions.ts`:

```
src/actions/RefundService/actions.ts   + getTravellerCardsMine, deleteTravellerCard
src/actions/RefundService/post.ts      new: postTravellerCard, postTravellerBankToken,
                                            postTravellerCardSetDefault, putTravellerCardNickname
```

All route through `fetchRequest` so they inherit the coalesced 401-refresh behaviour, and all throw on failure rather than returning a result object — the established convention, documented on `postTagServiceTagApi`.

`useCards` fetches once through `useAsyncFetch` with `{ includeExpired: true, maxResultCount: 100 }` and splits the response by `type` into a card list and a bank list. One request, no server-side `type` filter, because both are rendered. Each mutation awaits its call then re-runs `execute()`; that is the local equivalent of the SSR `router.refresh()`. Per-row pending state disables only the row being acted on, matching `CardsView`'s `pendingId`.

Listing uses `/mine` rather than SSR's `by-traveller/{travellerId}`. It resolves the traveller from the caller's own claim, so listing needs no ID at all — and its documented 4xx for callers without a `TravellerId` claim is correct here, since this screen is traveller-only by placement.

### The one real gap: traveller ID

`CreateTravellerCardDto.travellerId` and `CreateBankTokenDto.travellerId` are both **required**, and nothing in the mobile app reads a traveller ID today. `JwtUser` in `src/store/user.types.ts` declares `MerchantId` but no `TravellerId`.

The claim does exist. The web reads it directly in `packages/utils/auth/auth-actions.ts#getUserData`, off the same issuer's access token mobile uses. So:

1. Add `TravellerId?: string[] | string` to `JwtUser`.
2. Add `getTravellerId(jwtUser)` to the existing `src/utils/traveller.ts`, tolerating the array form the same way SSR's `getTravellerId` does.
3. Fallback when the claim is absent: `getApiTravellerServiceTravellersMyDocumentAffiliations()`, whose `TravellerDocumentAffiliationDto.travellerId` is documented as "The Traveller (parent) entity ID".

If neither resolves, the add buttons disable with an explanatory message. Firing a request guaranteed to 400 and surfacing a server error would be worse than saying what is wrong.

### Duplicate adds are not errors

Both create endpoints deduplicate: "Adding the same physical card again returns the existing card instead of creating a duplicate", and the bank endpoint does the same per IBAN. So a duplicate add returns 200 with the existing token. The UI treats it as success and refreshes — the list simply already contains it. No special-casing, but recorded so a future reader does not mistake it for a bug.

## Visual port

`CardPreview` keeps the web component's contract exactly: purely presentational, with the action cluster composed by the caller through `children`. That is what lets the screen own behaviour while the card face stays reusable.

```
┌────────────────────────────────┐
│ ▬▬▬            [Work Visa] ★ 🗑 │   nickname pill · default star · delete
│                                │
│ 4111 11•• •••• 1111            │
│                                │
│ CARD HOLDER          EXPIRES   │
│ ADA LOVELACE         09/28  VISA│
└────────────────────────────────┘
```

Carried over unchanged from `CreditCardPreview` and `CardsView`:

- masked-number regrouping in fours (`411111******1111` → `4111 11** **** 1111`)
- `MM/YY` expiry, built as `padStart(2,'0')` month + last two digits of year
- expired cards dimmed, badged `EXPIRED`, and **not** offered set-default
- the default card shows a filled star; non-default, non-expired cards show a pressable one

Brand logos port near 1:1 to `react-native-svg` — the web SVGs use only `Rect`, `Circle`, `Path` and `Text`, all of which it supports. `getCardBrand`'s IIN prefix ranges are copied verbatim, including their order-dependence.

The web card face uses a CSS gradient. Rather than add `expo-linear-gradient` for one surface, `CardPreview` uses `bg-primary` plus the same absolutely-positioned soft white highlight the web version overlays. Cheap to swap for a real gradient later if the difference is judged to matter.

Web dialogs become `BottomSheet` sheets, the app's established modal idiom (`DeleteAccountModal`, `SwitchAffilationSheet`).

## Card scanner — a necessary deviation

**The web scanner's mechanism cannot be ported.** It sends card images to a third-party Document Extraction API, and the whole point of `apps/ssr/src/components/card-extraction/actions.ts` being a server action is that `EXTRACTION_API_KEY` never reaches the browser. A mobile app has no server to hide a key behind. Shipping it would leak it in the bundle, and it would send card images to a third party.

So mobile scanning runs **entirely on-device**, via `expo-camera` + `rn-mlkit-ocr`. Both are already dependencies, and already paired this way for MRZ scanning in `src/utils/mrz/mrz-utils.ts`. The PAN never leaves the phone — strictly better handling for this data than the web path, not merely an acceptable substitute.

`parse-card-ocr.ts` is pure, taking `OcrBlock[]` and returning what it found:

- **Number** — the longest 13–19 digit run across whitespace-stripped lines, accepted only if Luhn-valid. An unvalidated read is discarded rather than prefilled.
- **Expiry** — `MM/YY` or `MM/YYYY`, preferring a match adjacent to a `VALID` / `THRU` / `GOOD` label, since cards often print an issue date too.

**Holder name is typed, not scanned.** Embossed names read unreliably, and a silently wrong name reaching the vault as `name_on_card` is a worse outcome than a few seconds of typing.

The modal mirrors the web scanner's *shape* — permission-request state, capture-and-retry loop, and an "Enter manually" escape that drops back to the form with whatever was found. Being pure, the parser is unit-tested against captured OCR-block fixtures rather than requiring a camera.

## Bank accounts

New surface, no web precedent. `AddBankSheet` collects:

| Field       | Required | Constraint                                          |
| ----------- | -------- | --------------------------------------------------- |
| IBAN        | yes      | 15–50 chars; mod-97 checksum validated before submit |
| BIC         | no       | 8–11 chars when supplied; blank treated as omitted   |
| Bank name   | no       | ≤256                                                |
| Country     | no       | ISO-3166 alpha-2                                    |
| Holder name | no       | ≤256                                                |
| Nickname    | no       | ≤64                                                 |

Constraints mirror `CreateBankTokenDto` so the client rejects what the server would reject. Country reuses the existing `CountryInput`, which already returns `countryCode2` — precisely the alpha-2 value `bankCountryCode` wants.

Bank tokens are payout tokens like cards, so rename, set-default and delete reuse the same three endpoints and the same two sheets. They get `BankRow` rather than `CardPreview`: a bank account is not a credit card and should not be drawn as one.

**Default is per type.** A traveller has one default card *and* one default bank simultaneously, since set-default "clears the previous default of that type". That is the substantive reason for two sections instead of one merged list — a single list would show two stars and read like a bug.

## Localization

New keys go in `src/localization/resources/en-US.json` and `tr-TR.json` under a `Cards` section, read as `t("MobileApp.Cards.…")`. Copy is ported from the SSR `Account.Cards.*` and `CardScanner.*` keys, with real Turkish rather than English placeholders, plus new keys for the bank fields, which have no SSR equivalent.

`src/data/language-data/*.gen.json` is generated and gitignored, and `TranslationKey` derives from it, so **new keys do not typecheck until `npm run init` regenerates it**. That run is part of the work, not a follow-up.

## Verification

| Check                                                            | How                            |
| ---------------------------------------------------------------- | ------------------------------ |
| Luhn edge cases, brand prefix boundaries, expiry normalisation    | `src/utils/card/__tests__/`    |
| IBAN mod-97 accept/reject, formatting, masking                    | `src/utils/card/__tests__/`    |
| OCR parsing against captured block fixtures                       | `src/utils/card/__tests__/`    |
| Types                                                            | `npm run typecheck`            |
| Lint                                                             | `npm run lint`                 |
| Existing suite unbroken                                          | `npm test`                     |

**Not verifiable from here, and stated rather than glossed:** real camera capture and OCR accuracy against physical cards, and every server response — vaulting, dedupe, and the set-default/delete round-trips — all of which need a device and a live dev backend. AGENTS.md additionally requires an Android and iOS build before a PR.

### Baseline recorded before implementation

Measured on this branch (`role/merchant`, clean tree) so nothing below can later be mistaken for damage this feature did:

- `npm run typecheck` — **clean**.
- `npm test` — **74 tests pass; 4 suites fail to load.** The 4 are `src/components/__tests__/`, and the failure is a module-resolution error, not an assertion: `@testing-library/react-native` maps `react-native` → `react-native-web` under the `jest-expo/node` preset, which cannot resolve. The same failure is recorded in the shared-QR spec.

**This constrains the test strategy, and is why every test in this design is a pure-logic test.** Component tests cannot run in this repo today. Fixing that preset is a real and worthwhile task, but it is not this feature's, and quietly bundling it in would make this change hard to review.

Note also that AGENTS.md claims the project has no automated test suite. It does — see above. The claim is stale.

## Risks

| Risk                                                          | Mitigation                                                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| On-device OCR misreads a PAN                                  | Luhn-validated before prefill; user reviews the prefilled form before submit; manual entry always available |
| `TravellerId` claim absent for some traveller accounts        | Documented fallback via my-document-affiliations; add disabled with a message if both fail          |
| No gradient makes the card face look flatter than the web's   | Cosmetic and reversible; `expo-linear-gradient` is one dependency away if judged to matter           |
| Mobile-first bank UI diverges from web's later implementation  | Field set and constraints taken from the shared DTO, so both converge on the same contract           |
| A traveller with >100 tokens sees a truncated list             | Accepted and recorded above rather than silently capped; becomes a paging task if it ever occurs     |
| Camera permission denied leaves the add flow stuck             | Scanner is an optional entry point; the typed form is the default path, not a fallback               |
