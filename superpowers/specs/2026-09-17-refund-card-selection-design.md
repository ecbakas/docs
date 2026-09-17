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

## What this builds

Three sources for the card, one outcome (`travellerCardId`), chosen per refund:

1. **The traveller's saved cards** — pick one.
2. **The card registered at purchase** — the tag's `payoutTokenId`, captured by
   the merchant at tag creation. **Blocked on a backend field; see below.**
3. **Register a new card** — captured by tap, scan or manual entry, vaulted,
   then paid.

Plus the existing behaviour, kept: **record a payout already made** on a
terminal, which writes `paidCardDetail` and moves no money.

Out of scope, explicitly: managing the traveller's card collection. The refund
flow selects a card and can register one. It does not edit, delete, rename or
re-order them. That is My Cards' job.

## The two payment modes

`CreateRefundDto` supports two genuinely different acts, and the refund flow
must not blur them:

| Mode | Field | What happens |
|---|---|---|
| **live** | `travellerCardId` | The API moves the money to a vaulted card. |
| **record** | `paidCardDetail` | The money already moved on a terminal; this records which card, masked. |

Today's flow only does `record` — it sends `paidCardDetail` with a masked
number, and `maskCardNumber` carries the comment *"The API contract forbids a
full PAN here"*. Live refunds are new.

The mode is an **explicit choice**, not inferred from which control the agent
touched:

```
Refund method: Credit card
┌────────────────────────────────────────┐
│ ( • ) Refund to a card                 │  live
│ ( ○ ) Record a payout already made     │  record
└────────────────────────────────────────┘
```

Under **live**, the three sources above. Under **record**, the same three
capture controls, filling the masked record and vaulting nothing — the money
moved on the terminal, so there is nothing to pay and no reason to store a card.

`live` is hidden, not merely disabled, when the account cannot reach it:
reading saved cards needs `RefundService.TravellerCards.ViewList`, registering
one needs `.Create`. An agent holding neither can only record — which is
exactly today's behaviour, so nothing regresses for anyone using the screen now.

## Structure

`RefundConfirmSheet` is already 351 lines carrying totals, signatures, card
fields, confirm and the in-flight lockdown. The card decision becomes its own
component rather than a fourth concern in that file:

```
RefundConfirmSheet          totals · signatures · confirm · lockdown  (unchanged)
└─ RefundCardStep           only for method === "CreditCard"
   ├─ mode: live | record
   ├─ saved cards        →  travellerCardId
   ├─ tag's payout card  →  travellerCardId      (blocked, see below)
   ├─ capture            →  vault → travellerCardId
   └─ manual record      →  paidCardDetail
```

It owns one value the sheet reads back:

```ts
type RefundCardChoice =
  | { mode: "live"; travellerCardId: string }
  | { mode: "record"; card: CardEntry };
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

## Option 2 is blocked on the backend

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

**Ships in two parts, and part one is what gets built.** Options 1 and 3 and the
mode selector land now. Option 2 is one more row in the same picker, added when
the field appears. Nothing built now is thrown away by it: the picker renders a
list of card choices, and option 2 adds an entry to that list.

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
