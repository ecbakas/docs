# Refund card capture in SaleScreenV2

**Date:** 2026-08-03
**Scope:** `pos-app`
**Status:** Approved for planning

## Problem

The POS captures a traveller's refund card through `RefundCardScanModal`, but the
only entry point is CustomerScreen, which reveals the scan button after every
required traveller field is filled. A cashier working entirely in SaleScreenV2 has
to detour into the customer screen to attach a card.

Users want the same capability on SaleScreenV2 itself, above the Create Tag /
Create Draft Tag button. The CustomerScreen entry point stays exactly as it is —
this adds a second door to the same room, it does not move the room.

## Decisions

These were settled during brainstorming and are not open questions:

1. The new button is **always visible and always enabled**, regardless of whether a
   traveller is selected.
2. A scanned card is **sent with Draft tags as well as Issued tags**, so a traveller
   who later claims the draft keeps the payout token. This is a change to the
   create-tag payload, not only a UI addition.
3. Once a card is captured the button shows the masked PAN and expiry; tapping it
   re-scans, and a **separate clear button** removes the card.
4. The payload change applies to **both** `SaleScreen` (V1) and `SaleScreenV2`, so
   the two layouts cannot disagree about what a Draft tag carries. V1 does **not**
   get a scan button.

## Architecture

No data-layer changes. `usePayoutStore` is already a global zustand store holding
`payoutCard`, and both sale screens already read it.

```
SaleScreenV2
  ├── RefundCardButton  ──tap──►  setCardScanVisible(true)
  │                     ──X───►  clearPayoutCard()
  └── RefundCardScanModal ──onCaptured(card)──► setPayoutCard(card)
                                                      │
                              createSale() ───────────┘
                                  toPayoutToken(payoutCard) → tagData.payoutToken
```

### RefundCardButton (new)

`src/screens/(auth)/Sale/_components/RefundCardButton.tsx`

Extracted from the existing markup in CustomerScreen's footer so the label,
icon and colour rules live in one place rather than being copy-pasted.

| Prop | Type | Purpose |
| --- | --- | --- |
| `payoutCard` | `ScannedCard \| null` | Drives label, icon and colour |
| `onPress` | `() => void` | Opens the scan modal |
| `onClear` | `(() => void) \| undefined` | When supplied, renders the clear button |
| `className` | `string \| undefined` | Lets each screen own its own layout |

Rendering rules, carried over unchanged from CustomerScreen:

- **No card** — `card-outline` icon in `#db0000`, primary-bordered, label
  `MobileApp.CustomerScreen.ScanRefundCard`.
- **Card captured** — `card` icon in `#16a34a`, grey bordered, label
  `maskedCardNumber(card) ?? t("MobileApp.CustomerScreen.RefundCardCaptured")`,
  followed by the expiry when the card exposed one.

`className` is what keeps the two call sites visually identical to today:
CustomerScreen passes its `flex-[2]` footer-cell classes, SaleScreenV2 passes
full-width classes.

### SaleScreenV2 changes

- Add `cardScanVisible` local state.
- Add `setPayoutCard` to the existing `usePayoutStore()` destructure (line ~405,
  which already pulls `payoutCard` and `clearPayoutCard`).
- Render `RefundCardButton` between the signature pad and the Create button, with
  `onClear={clearPayoutCard}`.
- Render `RefundCardScanModal` alongside the existing `SignatureModal` and
  `CartReviewModal`.

`closeAndReset` already calls `clearPayoutCard()`, so the card is discarded after
each completed sale with no change needed.

### CustomerScreen changes

Replace the inline footer button JSX with `<RefundCardButton>`, passing the same
classes it uses today and **no** `onClear` — its existing behaviour (tap to
re-scan, clear only via the whole-form reset) is preserved exactly. The
`isTravellerFilled` visibility gate stays. This is a refactor with no user-visible
change.

### Payload change (both sale screens)

`payoutToken` moves out of the `Issued`-only branch in `createSale`:

```js
// before — card silently discarded on Draft
...(status === "Issued" ? { traveller, ...(payoutToken ? { payoutToken } : {}) } : {}),

// after — traveller stays Issued-only, token always sent
...(status === "Issued" ? { traveller } : {}),
...(payoutToken ? { payoutToken } : {}),
```

`traveller` remains Issued-only. `toPayoutToken` already returns `undefined`
unless the card yielded both a PAN and a parseable `MM/YY` expiry, so a
contactless read that returns only a UID still sends nothing.

`CreateTagRequestDto` permits this shape: `traveller` is optional and
`payoutToken` is a top-level sibling, not nested under the traveller.

## Localization

No new keys. `MobileApp.CustomerScreen.ScanRefundCard` and
`MobileApp.CustomerScreen.RefundCardCaptured` already exist in `en-US` and
`tr-TR`. The keys keep their `CustomerScreen` namespace even though they now also
render on the sale screen; renaming would churn four files for no user-visible
gain.

## Error handling

`RefundCardScanModal` already owns every scan failure path — unsupported reader,
read error, card number unreadable, retry, and switching between tap and swipe.
The new call site adds no error handling of its own.

## Testing

- **Unit test** `RefundCardButton` under `src/components/__tests__/`, matching the
  existing component-test pattern: the empty-state label, the captured-state
  masked label, and that `onClear` fires when the clear button is pressed. PAN
  masking itself is already covered by `src/utils/__tests__/cardData.test.ts`.
- **No screen-level tests.** The repo has none today and this change does not
  justify standing up that harness.

## Open risk: Draft + payoutToken on the backend

Whether TagService accepts a `payoutToken` on a Draft tag that carries no
traveller is **unverified**. The DTO allows it structurally, but the field is
documented as registering the card as *the traveller's* payout token, and the
TagService source is not in this workspace.

Agreed course: implement the unconditional send, then create a Draft with a
scanned card against `dev-api.unirefund.com` and confirm the POST is accepted.
If it is rejected, return to this design before merging — the fallback would be
to ship the button alone (card applying to Issued tags only) and raise a backend
ticket for the Draft case.

## Out of scope

- A scan button in SaleScreen (V1).
- Any change to how CustomerScreen gates or clears its own button.
- Changes to `RefundCardScanModal`, `useCardReader`, or the native card-reader module.
