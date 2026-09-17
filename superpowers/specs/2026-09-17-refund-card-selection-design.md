# Refund card selection — design

**Repo:** `super-app` · **Date:** 2026-09-17

## Problem

A CreditCard refund needs a card. Today the refund confirm sheet offers one way
to supply it: type a number and an expiry into two fields. That is worse than it
sounds in three separate ways.

The traveller's own saved cards are ignored, even though the tag detail already
resolves and displays them. The card the merchant registered against the tag at
creation — the one the traveller expects the money to land on — is ignored.
And a card typed at the counter is typed from a plastic card sitting on the
desk, which the app can already read by NFC or camera on the My Cards screen.

## What this builds — REVISED 2026-09-17

**Superseded.** The first cut asked the agent to pick a *mode* — "Refund to a
card" vs "Record a payout already made" — before asking where the money goes.
That framing came from the API's field names, not from anything happening at
the counter, and the user rejected it on sight: *"I dont understand what is a
Record a payout already made"*.

It is replaced by one question with four answers, each writing exactly one
`CreateRefundDto` field:

| Row | Writes | Source |
|---|---|---|
| A saved card | `travellerCardId` | the traveller's vaulted card tokens |
| A saved bank account | `travellerBankTokenId` | the same list, bank tokens |
| A different card | `paidCardDetail` | tap / scan / type at the desk |
| A different bank account | `ibanInfo` | IBAN, BIC, bank name — typed |

Design proposal, with the drawn sheet:
https://claude.ai/artifact/D4VMpikXkAGHaSm1xL14V7

**A radio group makes exclusivity structural.** There is no state in which two
destinations are selected, so no state in which the payload carries two. The
previous design left a typed card silently overriding a picked one with nothing
on screen saying so.

**The two "different …" rows are the only ones that expand**, and they expand in
place. Capture is a way to fill a row, not a row of its own: tap, scan and type
all produce the same two fields.

### Ordering and the cap

A frequent traveller accumulates cards — every desk that captured one left it
behind — and everything that completes the refund sits *below* the list: the
capture rows, both signatures, and the button that moves the money. So:

- 1-3 payable cards: show them all.
- 4+: the default plus two, then "Show N more cards", expanding in place.
- Sort: default first, then payable by expiry with the furthest-out first
  (most likely still in the wallet), and **every expired token below every
  payable one**.

The sort is what makes the cap safe. Cap at three without it and a traveller
with three expired cards sees a list where nothing is selectable and every
usable card hides behind a tap — strictly worse than no cap.

Expired tokens stay listed but greyed and unpressable: the backend lists them
and rejects them at refund time, so the sheet must refuse them before two
signatures are collected, not after.

**Expanding grows the sheet; it does not scroll inside it.** A scroll region
nested in a `@gorhom/bottom-sheet` fights the sheet's own pan gesture — drag the
list and the sheet dismisses. One scrolling surface is the only version that
behaves on a small phone.

Out of scope, explicitly: managing the traveller's card collection. The refund
flow selects a destination and can register one. It does not edit, delete,
rename or re-order. That is My Cards' job.

## Structure

`RefundConfirmSheet` is already 351 lines carrying totals, signatures, card
fields, confirm and the in-flight lockdown. The card decision becomes its own
component rather than a fourth concern in that file:

```
RefundConfirmSheet        totals · signatures · confirm · lockdown  (unchanged)
└─ RefundPayoutStep       only for method === "CreditCard"
   ├─ saved cards      →  travellerCardId
   ├─ saved bank       →  travellerBankTokenId
   ├─ a different card →  paidCardDetail      (tap / scan / type)
   └─ a different bank →  ibanInfo            (typed)
```

It owns one value the sheet reads back:

```ts
type RefundPayout =
  | { kind: "savedCard"; travellerCardId: string }
  | { kind: "savedBank"; travellerBankTokenId: string }
  | { kind: "newCard"; card: CardEntry }
  | { kind: "newBank"; iban: IbanEntry };
```

`buildRefundDto` today branches on `method === "CreditCard"` and always writes
`paidCardDetail`. It will branch on this choice instead and write
`travellerCardId` **or** `paidCardDetail`, never both — which is what the DTO
expects and what a test should pin.

Validation splits with the mode. `isCardEntryValid` (Luhn plus not-expired)
gates `record`. A `live` choice has no PAN to check: it is gated on a card being
selected, and on the vault call having returned an id. `canConfirm` asks the
choice, not the card fields.

## The traveller seam

`AddCardSheet` vaults through `getMyTravellerId()` — the **signed-in**
traveller. An agent is not the traveller, so that is unusable here. Vaulting
takes the id from the traveller record the tags screen already resolves
(`TravellerRequestDto.id`, optional on the type).

`RefundSurface` currently takes `documentNumber`. It needs the record as well —
the number to query the refundable list, the id to vault against:

```ts
RefundSurface({ documentNumber, travellerId, bottomInset })
```

**Consequence worth stating:** `travellerId` is `undefined` until the tag-detail
handoff's traveller lookup resolves. The refundable list appears immediately
(it queries by number), but **live** refunds are unavailable for the moment
that lookup takes. `record` works throughout. This is a deliberate trade — the
alternative is holding the whole list back on a lookup it does not need.

## Vaulting

**At confirm, not at capture.** An abandoned sheet then stores nothing.

```
Confirm ──► vault (only when registering a new card for live)
              │
              ├─ fails  → sheet stays open, card kept, record still offered
              └─ ok     → refund
                           ├─ fails → sheet stays open, id kept
                           └─ ok    → success
```

The backend makes this safer than it looks: *"Adding the same physical card
again returns the existing card instead of creating a duplicate."* So a retry
after a failed refund cannot produce a second card on the traveller's account.
Holding the vaulted id across a retry is an optimisation, not a correctness
requirement.

**Capture always vaults** when the captured card is being used for a live
refund — there is no consent step, decided 2026-09-17. A card vaulted this way
appears in the traveller's My Cards, where they can see and delete it; it is not
invisible to them. The residual risk, named rather than solved: a vault that
succeeds followed by a refund that fails leaves a card stored and no money
moved.

**Never log the vault error object.** `AddCardSheet`'s catch carries the reason:
`ApiError` holds `request.body`, which is the raw PAN, and `logger.error` runs
in production. Vault error handling here follows the same rule.

## Dropped: the tag's own payout card

`payoutTokenId` is declared on `TagDetailDto`, `TagDto` and the three
create-tag request DTOs. It is **not** on `TagListItemDto`, which is what
`tags-refund` returns, and `tags-refund-fees` does not carry it either. So the
refund surface cannot learn the merchant's registered card from the rows it has.

The resolution, decided 2026-09-17: **ask the backend to add `payoutTokenId` to
the `tags-refund` row.** The endpoint already has the tag. With the field
present, option 2 costs zero extra requests and is exact.

**Requested 2026-09-17** against `GET /api/tag-service/tag/tags-refund`. Option
2 is therefore parked on a change already in flight, not on an open question —
resume it when the field appears in a regenerated SDK.

Rejected alternative: fetching tag detail per selected tag. One request per
ticked row, and it raises a question the product has not answered — a refund is
one payout to one card, but three selected tags may name two different cards.

**Out of the four the user specified.** The revised design lists saved card,
saved bank, new card and new bank — the tag's own `payoutTokenId` is not among
them. The backend request stands and the field is still worth having; if it
lands, it becomes one more row in the same list rather than a redesign.

## Testing

Pure logic carries most of it:

- `RefundCardChoice` → DTO: `travellerCardId` xor `paidCardDetail`, never both,
  never neither for a CreditCard refund.
- Mode availability from grants and from `travellerId` presence.
- `canConfirm` per mode — a live choice needs no Luhn, a record choice does.

Router tests over `RefundCardStep`:

- The mode selector appears only for CreditCard.
- Saved cards listed when the traveller has them; capture offered either way.
- `live` absent without `TravellerCards` grants, and absent before
  `travellerId` resolves.
- Capture fills the record path and the live path from the same controls.
- A vault failure leaves the sheet open with the card intact.

The existing refund suites (94 tests through the re-home, plus the fee pricing)
must stay green: this adds a branch to `buildRefundDto`, and the `record` path
through it is what they already cover.

## Open

- **Verify an agent can vault for another traveller in a real environment.** The
  permission is a plain ABP pair (`RefundService.TravellerCards` + `.Create`)
  and the DTO takes `travellerId` explicitly, so it should hold — but it has not
  been exercised with a staff token, and option 3 depends on it entirely.
- `MobileApp.Refund.ConfirmPay` is now unused (the confirm button reuses
  `Submit`). Remove with this work or leave.
