# Design: A status-first traveller Home

**Date:** 2026-08-24
**Repo:** `super-app`
**Branch point:** `7bfc58c` (`feat/home-upload-for-verification`) — `main` plus the commit that moved the sticker-upload entry point onto Home.

**Scope:** `src/screens/traveller/Home/` (screen recomposed, four new components, two new logic units), a new `src/utils/tagMoney.ts`, a header-grouping fix in `src/templates/TabPage.tsx`, new keys in both localization resources, and one re-pointed assertion in `HomeUploadEntry.router.test.tsx`.

## Goal

Turn traveller Home from a launcher into a status screen: what the traveller will receive, what is about to expire, and what they must do next — answered without opening anything.

## Why

Today's Home ([HomeScreen.tsx](../../../super-app/src/screens/traveller/Home/HomeScreen.tsx)) is five shortcuts at roughly equal weight, none of which know the traveller's situation. Four findings, in descending order of cost:

1. **The app never shows a deadline, and the data carries two.** `TagListItemForTravellerCrossTenantsDto` has a required `exportValidationExpirationDate` and an optional `refundExpirationDate` ([types.gen.ts:1731-1755](../../../super-app/src/saas/TagService/types.gen.ts#L1731-L1755)). Grepped across the app outside `src/saas/`, both appear **only in test fixtures**. A tax-free claim is a race against a date and the app is silent about it. Miss the export-validation date and the money is simply gone.

2. **The loudest element is the least urgent.** The tax-free map is the only `bg-primary` block on the screen. Finding a shop is discovery; getting stamped before a flight is the job.

3. **Nothing is prioritised by what needs doing.** [tagStatus.ts](../../../super-app/src/utils/tagStatus.ts) already sorts all eighteen statuses into "waiting on you" / "done" / "dead", and [useLoadTags](../../../super-app/src/hooks/useLoadTags.tsx) already holds up to 100 tags client-side. Home shows exactly one tag, picked by `issueDate desc` — so a `WaitingStampValidation` tag from last week hides behind a `Paid` one from today. The aggregates are free; they are simply not computed.

4. **Two smaller ones.** Home's FAQ accordion renders 4 of the 6 items the FAQ *tab* renders, from the identical keys — pure duplication of a whole tab. And the setup state that knows a traveller has no payout method exists only on Profile ([useProfileIdentity.ts](../../../super-app/src/screens/traveller/Profile/useProfileIdentity.ts)); Home shows an undifferentiated "My Cards" row whether they have three cards or none — that is, whether or not they can be paid at all.

## Decisions (agreed with user)

1. **Status home**, not a journey home and not a repaired launcher. Home is organised around money and deadlines.
2. **No design-variant flag.** Unlike the Profile redesign ([store/profileDesign.ts](../../../super-app/src/store/profileDesign.ts)), this replaces traveller Home outright. The user's stated safety net is reverting the branch, so the work lands in an isolated worktree on its own branch and revert means not merging it.
3. **The money figure is `refund ?? grossRefund`, never `salesAmount`** — see [The money figure](#the-money-figure).
4. The upload row's *behaviour* — grant gating, sheet-in-place, commit-routes-to-verifications — is treated as settled by `7bfc58c` and carried forward untouched. Only its position changes.

## Layout

```
Hello, Ayse                        [bell]      greeting replaces the "Home" title
[doc] TR-P1234567 v                           pill grouped under the title

+-- RefundSummary --------------------+
| YOU'LL RECEIVE                      |
| 1,248.50 TRY                        |
| 3 tags - 2 not yet calculated       |
| ----------------------------------- |
| + 412.00 TRY already paid           |
+-------------------------------------+

! Needs you                                   ActionList, omitted when empty
+-------------------------------------+
| | Get a customs stamp               |
| | 3 tags - soonest 28 Aug (4 days) >|
+-------------------------------------+
| | Add a payout method               |
| | We can't pay you without one     >|
+-------------------------------------+

Latest tag                       All >        unchanged: Section + LatestTag
[ hero TagCard ]

[cam] Upload receipt & stamp photo   >        grant-gated, behaviour unchanged
[pin] Tax-free near me               >
[card] Payout methods                >
```

## The money figure

Three questions, each answered so the headline cannot state something untrue.

**Which field.** `refund` where present, else `grossRefund`, **never** `salesAmount`. The existing `tagHeadlineAmount` falls back all the way to the purchase amount — correct as a per-tag placeholder, wrong under a caption promising what the traveller will receive, since a purchase is roughly five times its refund. When any contributing tag fell back to `grossRefund` the caption reads *estimated* (pre-fee); when none did it reads plain. Tags with neither field are **counted, not guessed**: "2 not yet calculated". Summing only `refund` was considered and rejected — it shows a traveller with three fresh tags `0.00`.

This is deliberately a different rule from `tagHeadlineAmount`, which is unchanged and still used by `TagCard`. The precedent is `tagHeadlineAmountKind`, added for exactly this reason: a caption must not claim "Refund" over a `salesAmount` fallback.

Two more pure functions in `src/utils/tagMoney.ts` carry this rule, so the fallback and the caption cannot drift apart — the same reason `tagHeadlineAmountKind` sits beside `tagHeadlineAmount`:

```ts
tagExpectedAmount(tag): number | null        // refund ?? grossRefund ?? null
tagExpectedAmountIsEstimate(tag): boolean    // true when grossRefund supplied it
```

**Which currency.** A traveller's list is cross-tenant, so `tag.currency` varies and one sum would be nonsense. Group by `tag.currency ?? useCurrencyCode()`, sum per group, headline the largest group by magnitude, render remaining groups as small rows beneath. With a single currency — the normal case — this renders exactly as drawn above.

Ties are broken by currency code ascending, so the headlined group is deterministic and the tests are not order-dependent. The *estimated* caption is decided **per group**: it appears when any tag in that group fell back to `grossRefund`, not when any tag anywhere did.

**Which tags.** A new pure function in `src/utils/tagMoney.ts`:

```ts
tagMoneyBucket(status): "expected" | "received" | "lost" | "inactive"
```

| Bucket | Statuses | Role |
| --- | --- | --- |
| `expected` | `PreIssued`, `Issued`, `WaitingGoodsValidation`, `WaitingStampValidation`, `ExportValidated`, `PaymentInProgress`, `PaymentProblem`, `PaymentBlocked`, `Correction` | The headline, and the tag count beside it |
| `received` | `Paid`, `EarlyPaid` | The "already paid" line |
| `lost` | `Declined`, `Cancelled`, `Expired`, `OptedOut` | Excluded |
| `inactive` | `None`, `Open`, `Draft` | Excluded — not yet a live claim |

`PaymentProblem` and `PaymentBlocked` count as `expected`: the money is stuck, not gone, and both raise an action row.

**This must not reuse `tagStatusTone`.** Tone is a display grouping and reusing it here would be a real bug in two places: `Correction` is `warning` but is live money, and `ExportValidated` is `success` but is *not yet paid* and would be counted as received. Declared as an explicit `Record<UniRefund_TagService_Tags_TagStatusType, MoneyBucket>`, following the pattern of `TONE_BY_STATUS` and `EVIDENCE_ORDER`, so a new backend status fails the build rather than silently defaulting.

## The action list

**Grouped by kind, never one row per tag.** Every unvalidated tag needs a stamp, so a per-tag list would be as long as the tag list itself and the "needs you" count would be meaningless. One row per kind carries a count and the soonest deadline.

| Kind | Trigger | Deadline |
| --- | --- | --- |
| `stamp` | status in `PreIssued`, `Issued`, `WaitingGoodsValidation`, `WaitingStampValidation` **and** `exportValidationDate == null` | `exportValidationExpirationDate` (required, so always dated) |
| `collect` | status `ExportValidated` | `refundExpirationDate` (nullable, so may be undated) |
| `correction` | status `Correction` | none |
| `payment` | status `PaymentProblem` or `PaymentBlocked` | none |
| `payout` | `payoutMethodCount === 0` **and** at least one `expected` tag | none |
| `identity` | `!isVerifiedLevel(evidenceLevel)` **and** at least one `expected` tag | none |

`evidenceLevel` here is the **active document's**, which is what `useProfileIdentity` reads and what the Profile hero badges. An account with no document at all is unverified by this test, which is correct: `isVerifiedLevel(undefined)` is already `false`.

`PaymentInProgress` raises nothing — it is progressing normally and there is nothing to do.

**Account-level rows are gated on having an expected tag.** A traveller with no tags is not nagged to add a card; Profile's `VerificationStrip` already owns cold-start setup, and duplicating it on Home would nag an account that has nothing at stake.

**Sorting.** Dated kinds by deadline ascending, then undated kinds in the fixed order `payout`, `identity`, `collect`, `payment`, `correction` — payout first among them because it blocks payment outright. `collect` appears in both halves: it is dated when the tag carries a `refundExpirationDate` and undated when it does not.

**Urgency tone**, from days until the deadline: overdue or 3 days or fewer → `error`; 7 days or fewer → `warning`; otherwise `info`. These three are members of the existing `TagStatusTone` union, so they index `TAG_STATUS_RAIL` / `TAG_STATUS_BADGE` / `TAG_STATUS_TEXT` directly and typecheck — no new colour values and no second tone vocabulary. Undated kinds take `info`. A deadline that has passed while the status is still live is shown as overdue rather than hidden: the backend flips the status to `Expired` on its own schedule, and until it does, "overdue" is the true statement.

**Row anatomy.** Title from `Home.Actions.{kind}.Title`; beneath it either `Home.Actions.OneTag` or `Home.Actions.ManyTags` for tag-backed kinds, or `Home.Actions.{kind}.Hint` for the two account-level ones. A dated row additionally renders one of `Home.Deadline.{DaysLeft,Today,Overdue}` as a toned chip — that chip is the "(4 days)" in the layout drawing.

**No cap, and so no silent truncation.** There are at most six kinds and typically one or two, so the list is bounded by construction.

**Tapping reuses machinery that already exists.** Count 1 pushes that tag (`/(auth)/tags/[tagId]`). Count above 1 calls `setQuery({ ...query, statuses })` and `router.navigate("/(auth)/tags")` — the filter the Tags tab already honours on every load. No new screen, no new route params, no new list. `payout` calls `openCards()`, `identity` calls `useVerifyAccount()` — both existing helpers.

## Data sources

Everything above the "Latest tag" section derives from data already in hand, plus two cheap GETs:

- **Tags** — `useTagStore`, populated by `useLoadTags` in `(auth)/_layout.tsx`. Free; Home already subscribes.
- **`payoutMethodCount` and `evidenceLevel`** — the two requests `useProfileIdentity` already makes (documents via `useDocumentSwitcher`, payout tokens via `getTravellerCardsMine`). Home pays two GETs on mount and nothing else.

`useHomeStatus` composes these and delegates every derivation to `homeStatus.logic.ts`. The split is the one `profileIdentity.logic.ts` and `refund.logic.ts` already make: the pure half must stay loadable in the plain `node` jest project, so it takes type-only imports and receives `now` as a parameter rather than calling `Date.now()`.

## States

| State | Treatment |
| --- | --- |
| `isLoading` | `HomeSkeleton` — summary block and one action row at their final heights, so nothing shifts when data lands |
| No tags at all | `HomeStartCard` replaces the summary, the action list is hidden, and the map returns to `bg-primary`. This is the entire screen for a new traveller, so it points at the scan tab |
| `error` and no tags | Existing `TagsErrorState` with retry — unchanged |
| `error` with tags on screen | Keep the content, show a thin amber retry banner. The pattern [CardsScreen](../../../super-app/src/screens/traveller/Cards/CardsScreen.tsx) and [DocumentsScreen](../../../super-app/src/screens/traveller/Documents/DocumentsScreen.tsx) already use |
| Tags but no actions | The `ActionList` renders nothing at all — no empty state and no "all clear" row. The summary already says the money is coming; a congratulation row would be a permanent fixture saying nothing |

## Header

`TabPage`'s header row is `flex-row justify-between` over three children — title, `headerAccessory`, bell — which leaves the document pill floating in the middle of the row, capped at `max-w-[45%]`. Group the title and accessory in a column so the pill sits under the greeting and the bell stays hard right.

Safe to change in the shared template: traveller Home is verified to be the **only** caller passing `headerAccessory`.

The greeting replaces the `Home.Title` string rather than being added above it, so it costs no vertical space. Name from `useUserStore().user?.name`, falling back to the existing `MobileApp.Home.Guest` key.

## Removals

| Removed | Reason |
| --- | --- |
| The `Faq` block and its `faqData` | Renders 4 of the 6 items the FAQ tab renders, from identical keys. No keys are orphaned — [traveller/FAQ/FaqScreen.tsx](../../../super-app/src/screens/traveller/FAQ/FaqScreen.tsx) uses all of them |
| The `bg-primary` map block | Becomes a quiet `CardAction`-style row in the shortcut group |

The standing "My Cards" row is **kept**, demoted into the shortcut group. It rises into the action list only when it is actually blocking payment.

## Localization

New keys in both `en-US.json` and `tr-TR.json` under `Home`. Action keys are suffixed by the kind's own key — the `MobileApp.Profile.Setup.${key}.Cta` pattern from `VerificationStrip` — so a new kind needs no mapping table.

```
Home.Greeting                    "Hello, {name}"
Home.Summary.Expected            "You'll receive"
Home.Summary.EstimatedNote       "estimated"
Home.Summary.TagCount            "{count} tags"
Home.Summary.NotCalculated       "{count} not yet calculated"
Home.Summary.AlreadyPaid         "{amount} {currency} already paid"
Home.Actions.Title               "Needs you"
Home.Actions.stamp.Title         "Get a customs stamp"
Home.Actions.collect.Title       "Collect your refund"
Home.Actions.correction.Title    "A tag needs correcting"
Home.Actions.payment.Title       "Payment problem"
Home.Actions.payout.Title        "Add a payout method"
Home.Actions.payout.Hint         "We can't pay you without one"
Home.Actions.identity.Title      "Verify your identity"
Home.Actions.identity.Hint       "Needed before a refund can be paid"
Home.Actions.OneTag              "{tagNumber} - by {date}"
Home.Actions.ManyTags            "{count} tags - soonest {date}"
Home.Deadline.DaysLeft           "{count} days left"
Home.Deadline.Today              "Last day"
Home.Deadline.Overdue            "Overdue"
Home.Start.Title                 "No tags yet"
Home.Start.Description           "Shop tax-free, then scan the tag on your receipt to claim it."
Home.Start.Cta                   "Scan a tag"
Home.Shortcuts.Title             "Shortcuts"
```

Per the repo's i18n rule these require `npm run init` to regenerate `src/data/language-data/*.gen.json`; without it `tsc` fails at the `t("…")` call sites rather than shipping raw key strings.

## Files

| File | Change |
| --- | --- |
| `src/utils/tagMoney.ts` | new — `MoneyBucket`, `tagMoneyBucket` and its `Record` table, `tagExpectedAmount`, `tagExpectedAmountIsEstimate` |
| `src/screens/traveller/Home/homeStatus.logic.ts` | new — pure: per-currency summary and the grouped action list from `(tags, { payoutMethodCount, isVerified, now })` |
| `src/screens/traveller/Home/useHomeStatus.ts` | new — tag store + documents + payout tokens, delegating to the logic |
| `src/screens/traveller/Home/_components/RefundSummary.tsx` | new |
| `src/screens/traveller/Home/_components/ActionList.tsx` | new — the list and its row |
| `src/screens/traveller/Home/_components/HomeStartCard.tsx` | new — the no-tags state |
| `src/screens/traveller/Home/_components/HomeSkeleton.tsx` | new |
| `src/screens/traveller/Home/HomeScreen.tsx` | recomposed; `Faq` and the `bg-primary` map block removed |
| `src/templates/TabPage.tsx` | group title + `headerAccessory` in a column |
| `src/utils/__tests__/tagMoney.test.ts` | new — bucket table, including that it disagrees with `tagStatusTone` where it must |
| `src/screens/traveller/Home/__tests__/homeStatus.test.ts` | new — summary and action derivations |
| `src/screens/traveller/Home/__tests__/HomeUploadEntry.router.test.tsx` | one assertion re-pointed — see below |
| `src/localization/resources/{en-US,tr-TR}.json` | the keys above |

Unchanged and reused as-is: `LatestTag`, `TagCard`, `Section`, `ActiveDocumentPill`, `UploadVerificationSheet`, `TagsErrorState`, `openCards`, `openDocuments`, `useVerifyAccount`, `useCanUploadVerification`, `tagStatus.ts`.

## The test that belongs to another commit

`HomeUploadEntry.router.test.tsx` arrived in `7bfc58c`. Three of its four cases are behavioural — grant gating, sheet-opens-in-place, commit-routes-to-verifications — and are carried forward **verbatim**.

The fourth, "offers the upload row above my cards", asserts the literal order `[TaxFreeLocations, Upload, MyCards]`. This design moves the map to the bottom, so the assertion cannot survive as written. It is re-pointed at what that commit actually cared about — the upload row is present on Home and sits above the shortcut group — rather than deleted, because the regression it guards against (the row rendering on both halves of the tags screen instead of on Home) is still worth guarding.

Both `Home/__tests__` suites are render tests and keep the `*.router.test.tsx` suffix, which is what puts them in the `router` jest project; under the `node` preset a rendered component reaches nativewind's web JSX runtime and cannot even load.

## Out of scope

- Merchant, refund-point and customs Home. Only the traveller screen changes; `TabPage`'s header change is layout-neutral for callers that pass no accessory.
- The Tags tab, `TagCard`, and `tagHeadlineAmount` — the new money rule lives beside the old one rather than replacing it.
- Notifications. Deadlines are surfaced on Home only; a push reminder ahead of an expiry is the obvious follow-up and is deliberately not designed here.
- Server-side aggregation. Everything is derived from the page of tags already loaded, which caps at 100 — acceptable for a traveller's own list, and the same assumption `travellerSearchIsClientSide` already makes.
- Dark mode. Removed from the app in `6cb6ae8`; components use semantic tokens anyway.

## Verification

1. `npm run init` — regenerate the language bundles; confirm every new key is present in both.
2. `npm run typecheck` — clean.
3. `npm test` — the baseline is **6 failing suites** (pre-existing, per the repo's known state). The gate is that it stays 6, and that both `Home/__tests__` suites and the two new logic suites pass.
4. `npm run lint` — no new errors.
5. `npx prettier --write` over changed files only (the repo fails prettier repo-wide on CRLF, so a repo-wide run proves nothing).
6. On-device on the SM-A022F over Metro. This is JS-only, so no rebuild: check the no-tags state, a dated `stamp` row, the tap-through to a filtered Tags tab, and that the document pill still opens the switcher from its new position.

The pure logic carries the risk here — a wrong bucket silently misreports money — so `tagMoney` and `homeStatus` are tested directly, including the cases where the money bucketing must *disagree* with `tagStatusTone`.
