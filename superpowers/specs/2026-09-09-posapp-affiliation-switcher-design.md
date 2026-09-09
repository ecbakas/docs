# SP7: the affiliation switcher UI — pos-app

**Date:** 2026-09-09
**Repo:** `pos-app` (`unirefund-pos`)
**Branch point:** `feat/tag-detail` (SP6), on SP5 → SP4 → SP3 → SP2 → SP1 — **not `main`**
**Program:** [2026-09-09-posapp-parity-program-design.md](2026-09-09-posapp-parity-program-design.md) — sub-project 7 of 7, the last
**Covers:** the UI half of T7. Its correctness half shipped in SP2.

## Goal

One store switcher in the app, built like super-app's, that lists every
affiliation the user holds and lets them act only as a merchant.

## Why

SP2 fixed what the switcher *knows* — the active party now comes from the
affiliation list's `isPrimary` rather than a JWT claim that lags a switch — but
left the UI as it was: a collapsible card on the Connected Devices screen,
reachable from nowhere else, with `changeAffiliation`'s failure result
observable and **unrendered**. A switch that the server refused looked
identical to one that worked.

## The requirement that arrived mid-implementation

The user asked for this while the sheet was being written, and it is the one
place this deviates from super-app:

> we need to make sure we list every affiliation but if the affiliation is not
> Merchant type we should disable that in list

So the sheet is not filtered. A user holding a refund-point or customs
affiliation **sees** it — filtering would leave them wondering where it went —
but only a `MERCHANT` row is selectable, because the whole app is built around
one: the sale flow, the product groups and the tag list all key off
`merchantId`, and SP2's `MerchantProvider` resolves the acting merchant from
the active party.

**It fails closed on an absent `partyType`.** The field is optional on
`UserAffiliationDto`, and an affiliation that does not *confirm* it is a
merchant is not one to start issuing tags against. The trade-off is explicit: if
the backend ever stopped sending `partyType`, every row would disable rather
than every row becoming switchable.

A disabled row says **why** — "Not available on the POS" — rather than sitting
dimmed and unexplained.

## Decisions

1. **One sheet, mounted once, in a provider.** A `BottomSheetModal` needs
   `BottomSheetModalProvider` above it, so rendering one per screen with a
   trigger would push that requirement — and its test setup — onto every such
   screen. `StoreSwitcherProvider` sits inside `(auth)` and publishes
   `canSwitch`, `activePartyName` and `open()`.
2. **`canSwitch` counts every affiliation, not just the merchant ones.** A user
   with one merchant and one refund point still has something worth looking at,
   even though only one row of it can be picked.
3. **Two triggers, no new header.** super-app hangs a pill in `TabPage`'s
   header; pos-app's `TabPage` is 25 lines with no header slot and its `(auth)`
   group is a plain `Stack` with no tab bar, so building one would be scope
   creep. Instead: a Profile menu entry whose subtitle names the active store,
   and the Connected Devices card — which is where the switcher already lived.
4. **The old inline switcher is replaced, not kept beside the new one.** Two
   switchers could disagree, and the merchant-only rule, the in-flight lock and
   the failure toast would each need implementing twice.
5. **`t()` and `useToast()` are read in the sheet's host, never inside
   `<BottomSheet>`.** A hook called from the portalled children loses its
   provider: the toast one throws and the localization one silently renders raw
   i18n keys. Values are captured in the host's closure and used below.

## What lands

| File | Note |
| --- | --- |
| `src/components/SwitchAffiliationSheet.tsx` | new; the sheet, with `canActAs` deciding selectability |
| `src/providers/StoreSwitcherProvider.tsx` | new; hosts the single sheet, publishes `canSwitch` / `activePartyName` / `open` |
| `src/app/(auth)/_layout.tsx` | mounts it innermost, below `SignalrProvider` |
| `src/screens/(auth)/Profile/ProfileScreen.tsx` | menu entry, shown only when `canSwitch` |
| `src/screens/(auth)/ConnectedDevices/_components/AffilationSwitch.tsx` | rewritten from a collapsible list into a trigger |
| `src/components/ActionList.tsx` | gains an optional `description`, so the menu row can name the active store |

i18n: super-app's `MerchantSwitch` namespace in both locales with its real
translations, plus one new key — `NotMerchant` — which super-app has no
equivalent for because it never needed the rule.

## Testing

`src/components/__tests__/SwitchAffiliationSheet.test.tsx`, 14 cases:

- every affiliation is listed whatever its party type
- a non-merchant row is disabled, a merchant row is not, and an untyped row
  fails closed
- a disabled row says why, and pressing it makes no request
- a switch posts and closes; pressing the already-active row closes without a
  request
- while switching: the sheet is held open, every row and the close control are
  locked, and the target store is named
- a failure surfaces the server's message and keeps the sheet open; with no
  message it falls back to its own copy
- an empty list says so

## Risks

**Failing closed on `partyType`** is the deliberate call above. It is recorded
here because the symptom — every row disabled — would otherwise look like a
bug in this sheet rather than a change in the payload.

**The Profile entry is the only always-reachable trigger.** Connected Devices
is a screen a cashier may never open. If the switcher turns out to be used
often, a persistent trigger wants a header to live in, which is a `TabPage`
change this sub-project deliberately did not make.

## Out of scope

A header pill (decision 3). Any change to how the active party is *determined*
— that is SP2, already shipped.
