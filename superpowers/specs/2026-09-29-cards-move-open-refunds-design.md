# My Cards: move open refunds onto the refund card — design

**Date:** 2026-09-29 · **Scope:** `super-app` (traveller My Cards) + `web-app/apps/ssr` (`/account/cards`) · **Status:** approved in conversation 2026-09-29, awaiting spec review

## Problem

`POST /api/tag-service/tag/traveller-payout-token` (`postTagTravellerPayoutToken`
in super-app, `postTagTravellerPayoutTokenApi` in web-app) points every one of
the traveller's open tags at one saved card. Both apps call it today only inside
Validate (`PayoutCardStep`), just before the customs scan.

My Cards, the screen where a traveller actually manages cards, never calls it.
So the card the screen presents as "Refunds arrive on" can be wrong for every
refund already in progress:

- The refund desk pre-selects **the tag's pinned card**, then `isLastUsed`, then
  `isDefault` (backend "Payout Cards — Frontend API Guide"; implemented as
  `preferredPayoutToken` / `preferredPayoutCard` in both repos). The default
  comes last.
- A newly claimed tag inherits the **last-used** card, not the default.
- A merchant can attach a card to a tag at the POS (`payoutToken` /
  `payoutTokenId` on tag create), and it need not be the traveller's default.

Setting a default on My Cards therefore changes almost nothing for money
already in flight.

## Decision

**The hero card is the refund card.** Pinning from My Cards always targets the
card in the hero slot. When a prompt is confirmed, the hero card, the default and
the card every open refund pins to all end up the same card.

- The hero comes from `partitionTokens`: the default, else the usable last-used
  card, else the first usable card. When the target is not flagged `isDefault`,
  confirming also calls set-default, so the three agree.
- Pinning is **offered, never silent**. The traveller is asked at three moments:
  after set-default, after adding a card, and when deleting a card that open
  refunds use. A persistent mismatch line catches everything else: a declined
  prompt, or a card attached at the POS.

Rejected alternatives:

- **An independent "open refunds go to" chooser.** It puts two answers to
  "where does my money go" on one screen, and the hero stays wrong by design.
- **Waiting for backend flags** (`alsoPinOpenTags` on set-default, or a dry-run
  count on the pin endpoint). These would give an exact count, but add and delete
  would still need client prompts. This stays a possible follow-up (see Follow-ups).

## Endpoint facts this design relies on

From the generated SDK docblocks and the backend guide, as read on 2026-09-29:

- The body is `{ payoutTokenId }` only. The server derives the tags from the
  caller's traveller claim, across every tenant: tags not attached to a refund,
  in a status where the payout target still matters, and risk-cleared or not yet
  evaluated. Tags that are refunded, cancelled, expired, in payout or red are left
  alone.
- **All eligible tags move at once.** There is no way to move only the tags on
  one card.
- The response is `{ tagIds, payoutTokenId, changedCount }`. An empty `tagIds` is
  success. Re-pinning the same token returns `changedCount: 0`.
- The token must be the caller's own, a Card, and not expired.
- Permission pair: `TagService.Tags` + `TagService.Tags.TravellerSetPayoutToken`.
- There is **no dry run**.
- `DELETE traveller-cards/{id}` is a plain soft delete. It does nothing about
  tags pinned to the deleted card.
- Adding a card does **not** make it the default, in either app.

Settled decisions this design keeps:

- **Never re-pin on claim.** A claimed tag inherits the last-used card on the
  server.
- **With zero open refunds, never ask and never call.** Decided 2026-09-28: the
  "applies to later tags" edge is accepted and left alone.

## 1. Knowing which refunds are open

**Fetch.** My Cards additionally loads the traveller's tags from
`GET tag/cross-tenants/by-traveller-id-claim`:

- super-app calls it through `getTags`.
- ssr calls it through `getTagsCrossTenantsByTravellerIdClaimApi`. That action
  **throws** its structured error, so the caller must `.catch` it.

Request parameters:

- `status`: `Open`, `PreIssued`, `Issued`, `WaitingGoodsValidation`,
  `WaitingStampValidation`, `ExportValidated`. This is our approximation of
  "where the payout target still matters".
- `maxResultCount: 999`. The ceiling is 1000, and 1001 returns 400.

**Filter.** On the client, drop rows whose `risk.finalRiskLevel` is `Red`, or
whose `risk.riskLevel` is `Red` when there is no `finalRiskLevel`.

**Derive.** Pure functions per app compute the counts:

```ts
openRefunds(tags) => {
  count: number;                     // open tags after filtering
  byCard: Record<string, number>;    // open tags per payoutTokenId
}
notOnCard(refunds, cardId) => number // open tags not pinned to cardId (null included)
```

`notOnCard(refunds, hero.id)` is the "off the hero" count. The same function
serves the add and set-default prompts, whose target is not the hero.

A `null` `payoutTokenId` counts as "not on this card", because the desk resolves
it through last-used before default.

**Where the fetch lives.**

- super-app: a `useOpenRefunds()` hook beside `useCards`. It refetches after
  every set-default, add, delete and pin.
- ssr: `account/cards/page.tsx` fetches the tags inside the existing (empty)
  `optionalRequests` `Promise.allSettled` and passes them to `CardsView`.
  `router.refresh()`, which already runs after each mutation, re-runs it.

**Failure.** If the tag lookup fails, for any reason, My Cards behaves exactly
as it does today: no prompts and no mismatch line. Tags only enrich the screen
and never gate it.

**Accuracy.** Counts shown *before* an action are our approximation of the
server's rule. Copy shown *after* an action uses the server's `changedCount`.
When `changedCount` is 0 there is no result toast, only the refresh.

## 2. The prompt and its entry points

**One component per app:**

- super-app: `MoveRefundsSheet`, a `BottomSheet` built like `DeleteTokenSheet`.
  Everything reaches it through props. Hooks inside `<BottomSheet>` children lose
  their provider context, so it must not call them for data.
- ssr: `MoveRefundsDialog`, a `Dialog` built like `DeleteCardDialog`.

Both take the target card, the count and a mode. A prompt is shown only when at
least one open refund is not already on the target card.

| Entry | Copy (en, final wording in resources) | Confirm does |
| --- | --- | --- |
| After **set default** succeeds | "•••• 4242 is now your refund card. 3 open refunds aren't set to it yet. Move them?" · [Move them] [Not now] | pin(target) |
| After **add card** succeeds | "Use •••• 4242 for refunds? It becomes your default, and your 3 open refunds move to it." · [Use this card] [Not now] | set-default(target) → pin(target) |
| **Mismatch line** tapped | same as the set-default row, with the hero as target | set-default(hero) if not `isDefault` → pin(hero) |

**Mismatch line.** It sits under the hero and reads "3 open refunds aren't set
to this card · Move them". It shows when `offHero > 0`, and the hero is usable,
and the tag lookup succeeded. When the hero is expired, the action is hidden: the
hero already shows its expired state, and a pin to an expired card is rejected.

**Toasts.**

- When a prompt follows set-default, skip the set-default success toast; the
  prompt's first line already says the default changed. In super-app this also
  avoids presenting the Toast `BottomSheetModal` in the same moment as the prompt
  sheet.
- After a pin, show one success toast: "3 refunds moved to •••• 4242", from
  `changedCount`. Show none when it is 0.

**"Not now"** does nothing on the server. The mismatch line stays until the
tags agree with the hero.

**In flight.** Reuse the screen's one-mutation-at-a-time lock: `pendingId` in
super-app's `useCards`, `useTransition` in ssr's `CardsView`. Every control that
starts another mutation is disabled while a pin runs.

**Partial failure (add, or a mismatch with a non-default hero).** If set-default
succeeds and the pin then fails, say exactly that: "It's your default now, but
your open refunds didn't move." · [Try again] [Close]. The mismatch line then
carries the retry.

**Pin failure (set-default prompt, or the line).** "Couldn't move your open
refunds." · [Try again] [Not now]. Nothing else has changed.

**Where failure copy appears.**
- ssr shows it inline in the dialog.
- super-app shows it as a `toast.error` over the still-open sheet, and the
  buttons change to [Try again] and [Not now] or [Close].
- The reason: gorhom's dynamic sizing measures the sheet once and clips anything
  that appears later. Toast uses `stackBehavior="push"`, so it does not
  minimize the sheet under it.

## 3. Deleting a card that open refunds use

Let `n = byCard[card.id]`.

| Case | Sheet / dialog shows | Confirm does |
| --- | --- | --- |
| `n = 0`, or the tag lookup failed | Today's delete confirm, unchanged | delete |
| Not the hero, and the hero is usable | "2 open refunds are set to this card. Deleting it moves all your open refunds to •••• 1234." | pin(hero) → delete |
| It is the hero, or the hero is expired | "2 open refunds are set to this card. Choose where they go instead." + a compact list of the other usable cards, preselected with `preferredPayoutToken` | set-default(chosen) → pin(chosen) → delete |
| No other usable card | "2 open refunds are set to this card. They'll have no card to pay to until you add one." · [Add a card] [Delete anyway] [Cancel] | delete, or open the add flow |

- The copy says "**all** your open refunds" on purpose: the endpoint cannot move
  only this card's tags.
- The calls run **in sequence and stop at the first failure**. The card is
  **never deleted unless its refunds moved**. On a pin failure: "Couldn't move
  your open refunds, so the card wasn't deleted." · [Try again]. If set-default
  had already succeeded, the copy says the default changed.
- What the backend does at refund time with a tag pinned to a soft-deleted card
  is **unverified**. That is why the last row says only "no card to pay to" and
  predicts nothing about the desk.
- Where the four-case logic lives is the implementation plan's call.
  `DeleteTokenSheet` / `DeleteCardDialog` are the intended hosts.

**Reuse:**

- super-app: the picker is Validate's `TokenList` from
  `shared/Tags/Tag/_components/refund/RefundPayoutRows`. It takes `t` as a prop,
  so it is safe inside the sheet portal. It renders `expanded`, with every choice
  at once and no "show more", for the same can't-grow reason as the failure
  toasts.
- ssr: `CardOption` is private to `validate/_components/payout-card-step.tsx`.
  Lift it into `components/payout-cards/card-option.tsx`; Validate and the delete
  dialog both import it from there.

## 4. Files, copy, tests

### super-app (`src/screens/traveller/Cards/`)

- **New files:**
  - `openRefunds.ts`: the status allowlist, the red filter and `openRefunds()`.
  - `useOpenRefunds.ts`: the fetch, plus `refresh`.
  - `_components/MoveRefundsSheet.tsx`
  - `_components/OpenRefundsLine.tsx`
- **Changed files:**
  - `useCards.ts`: `setDefault` can skip its toast and reports success; a new
    `pin(id)` mutation shares the `pendingId` lock.
  - `CardsScreen.tsx`: wiring. `AddCardSheet`'s existing `onAdded(card)` already
    hands back the saved token.
  - `_components/DeleteTokenSheet.tsx`: the four cases.
- **Copy:** `MobileApp.Cards.MoveRefunds.*` in
  `src/localization/resources/{en-US,tr-TR}.json`.
- **Tests (jest).** Render tests must be named `*.router.test.tsx`.
  - `openRefunds.test.ts`: the allowlist, the red filter, null pins, `byCard`.
  - `MoveRefundsSheet.router.test.tsx`: each mode's calls, the toast from
    `changedCount`, no toast on 0, partial failure.
  - `DeleteTokenSheet.router.test.tsx`: each case's call order, and no delete
    after a failed pin.
  - `CardsScreen.router.test.tsx`, extended: a prompt only when tags are off the
    hero; no prompt and no line when the tag lookup fails.

### ssr (`apps/ssr/src/`)

- **New files:**
  - `components/payout-cards/open-refunds.ts` (+ `open-refunds.test.ts`)
  - `components/payout-cards/card-option.tsx`: lifted from `payout-card-step.tsx`.
  - `app/[lang]/(main)/account/cards/_components/move-refunds-dialog.tsx`
  - `app/[lang]/(main)/account/cards/_components/open-refunds-line.tsx`
- **Changed files:**
  - `account/cards/page.tsx`: the optional tag fetch.
  - `cards-view.tsx`: wiring. It passes `onAdded` to `AddCardDialog` so an add
    can prompt, then refreshes.
  - `delete-card-dialog.tsx`: the four cases.
  - `validate/_components/payout-card-step.tsx`: imports the lifted `CardOption`.
- **Copy:** `Account.Cards.MoveRefunds.*` in
  `language-data/unirefund/SSRService/resources/{en,tr}.json`, then
  `pnpm run init` so `tsc` sees the keys.
- **Tests.** ssr has no unit runner today; `pnpm test` is Playwright against a
  live environment. Add `"test:unit": "node --import tsx --test \"src/**/*.test.ts\""`,
  copied from `apps/web`, so `open-refunds.test.ts` runs. Node's runner loads
  no JSX, so only the pure module is unit-tested.

### Out of scope

- **Bank tokens.** The pin is card-only, so ssr's bank set-default never prompts,
  and super-app's bank section is switched off.
- **Any backend change.**
- **Re-pinning on claim.** Already settled.

## Verification

- **super-app:** `npx jest` for the suites above, plus `npx tsc --noEmit`.
  Device pass on a CPad through `.\dev-superapp-devices.ps1 -Serial <serial>`,
  after checking the build's `flags=[… DEBUGGABLE …]`.
- **ssr:** `tsc`, lint, and `pnpm --filter ssr test:unit`. Browser pass through
  Playwright, signed in as `tur-a25y29041`.
- **Unverified until checked:** whether `tur-a25y29041` has any open tags. If
  not, the prompts and the delete cases cannot be exercised end to end until a
  tag is issued to that traveller.

## Follow-ups (not in this work)

- Ask the backend for a dry-run count on the pin endpoint, or an
  `alsoPinOpenTags` flag on set-default. Either would replace the client-side
  approximation in §1.
- Confirm how the refund desk and `POST refunds` handle a tag pinned to a
  soft-deleted card.
