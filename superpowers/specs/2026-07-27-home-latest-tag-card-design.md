# Design: Rework the Home "latest tag" card

**Date:** 2026-07-27
**Scope:** `src/screens/shared/_components/LastestTag.tsx` (rewritten and renamed), `TagStates.tsx`, `src/utils/tagStatus.ts`, a new `src/utils/serialFont.ts`, import-only edits in `TagScreen.tsx` and both role Home screens, plus two localization keys.

**Amended the same day** to extend the same card to the tags list — see [Amendment](#amendment--the-list-adopts-the-same-card). That added `src/screens/shared/_components/TagCard.tsx` and deleted `TagRow` from `TagScreen.tsx`.

## Goal

Rebuild the "last tag" hero card on Home so it uses the same visual language as the tags list, shows the refund figure, colours the status correctly, and themes in dark mode.

## Why

The card at [LastestTag.tsx](../../../src/screens/shared/_components/LastestTag.tsx) predates the tags-list redesign and never caught up with it. `TagRow` in [TagScreen.tsx](../../../src/screens/shared/Tags/Tag/TagScreen.tsx) already established the vocabulary — status rail, tone badge, monospace serial, amount panel — and the Home card ignores all of it.

Three of the problems are correctness, not taste:

1. **Every status renders green.** The pill is a hardcoded `bg-green-300`, so a `Cancelled`, `Expired` or `PaymentBlocked` tag reads as good news. [tagStatus.ts](../../../src/utils/tagStatus.ts) already maps all eighteen statuses to five tones; Home doesn't call it.
2. **The raw enum is displayed.** `{lastTag?.status}` prints `WaitingStampValidation` rather than `t(tagStatusLabelKey(status))` — unlocalized, contrary to the `i18n` rule.
3. **Nothing themes.** `bg-red-100`, `text-gray-600/700` and `color="#4b5563"` are hardcoded, so the card is broken in dark mode. The `ui-components` rule asks for semantic tokens.

And one substantive gap: the card never shows an **amount**. List rows lead with it; the larger, more prominent hero omits the single most useful number on the tag.

Layout problems: a rigid 3×2 `w-1/2` grid gives six values identical weight (`text-lg font-semibold`) with nothing to land on first; no `numberOfLines`, so a long merchant title or traveller name reflows the card; `min-h-56` with `justify-center` makes it float; the chevron consumes a whole grid cell.

## Decisions (agreed with user)

1. **Match the tags-list language** rather than inventing a separate hero treatment or doing a minimal token-swap in place. Home and the Tags tab become one system.
2. **The meta line adapts to role**, mirroring the call already made at [TagScreen.tsx:279](../../../src/screens/shared/Tags/Tag/TagScreen.tsx#L279): staff see the traveller name, travellers see the store.
3. Section heading copy ("Last Tag") and `TagsEmptyState`'s `min-h-52` are **out of scope**.

## Card anatomy

```
TouchableOpacity   flex-row items-stretch overflow-hidden rounded-2xl border border-border bg-card
├─ View  w-1.5 {TAG_STATUS_RAIL[tone]}              full-height tone rail
└─ View  flex-1 px-5 py-4 gap-3
   ├─ row    serial (mono, flex-1, numberOfLines=1)   ·   tone badge
   ├─ block  "1,248.50" text-[30px] font-bold  +  "TRY" muted suffix
   │         caption beneath: "Refund" / "Purchase"
   ├─ divider  h-px bg-border
   └─ row    meta (muted, 1 line, truncating)         ·   chevron
```

The surface stays `bg-card`; the rail and badge carry the colour. This is the reasoning already recorded at [TagScreen.tsx:66-70](../../../src/screens/shared/Tags/Tag/TagScreen.tsx#L66-L70) — a fully tinted surface swamps the reader instead of helping them triage.

Border uses `border-border` rather than the list's `border-black/10`: indistinguishable in light mode (`229 231 235` vs black at 10%), but actually visible in dark, where `border-black/10` disappears.

## Status

`tagStatusTone(status)` selects `TAG_STATUS_RAIL` / `TAG_STATUS_BADGE` / `TAG_STATUS_TEXT`; the label comes from `t(tagStatusLabelKey(status))`. No new colour values and no new keys — all of it already exists for the list.

## Amount

`tagHeadlineAmount(tag)` supplies the figure, formatted with `Intl.NumberFormat` at 2dp. Currency code is `tag.currency ?? useCurrencyCode()`, shown as a muted suffix beside the value.

That helper falls back `refund → grossRefund → salesAmount` without reporting which one won, so a fixed "Refund" caption would sometimes be false. Add a sibling to `tagStatus.ts`:

```ts
tagHeadlineAmountKind(tag): "refund" | "purchase" | null
```

`"refund"` when `refund` or `grossRefund` supplied the number, `"purchase"` when it fell back to `salesAmount`, `null` when there is no figure at all. `tagHeadlineAmount` is left untouched, so the list is unaffected.

When the kind is `null` the value slot shows `—` and the caption is omitted — the same degenerate case the list already tolerates, and cheaper than maintaining a second layout for a tag with no monetary fields.

## Meta line

```ts
[isStaff ? tag.travellerFullName : tag.merchantTitle, formatDate(tag.issueDate)]
  .filter(Boolean)
  .join(" · ");
```

`isStaff` is `isMerchant || isRefundPoint` from `useUserStore()`. The date uses the same compact `Intl.DateTimeFormat` the list uses (`24 Jul 26`) — the year still matters on an expiring claim, the weekday and full month don't. Both formatters are `useMemo`'d on `activeLocale`, so they're built once per locale rather than once per render.

## Serial font

The `Platform.select` that picks Menlo on iOS and `monospace` on Android is currently private to [TagScreen.tsx:54-58](../../../src/screens/shared/Tags/Tag/TagScreen.tsx#L54-L58). Two surfaces now need it, so it moves to `src/utils/serialFont.ts` and both import it. Copying the `Platform.select` into a second file would leave two places to fix when a font choice changes.

## Skeleton

`TagCardSkeleton` in [TagStates.tsx:19-58](../../../src/screens/shared/_components/TagStates.tsx#L19-L58) is shaped for the old 3×2 grid. Its whole purpose is that nothing shifts when data lands, so it must be reshaped alongside the card: rail column, serial bar, large amount bar, divider, meta bar. `min-h-56` goes; card height drops from roughly 224px to roughly 155px.

Its `compact` prop has **no callers** — `TagScreen` imports `TagListSkeleton`, not `TagCardSkeleton` — so it is deleted rather than carried forward.

## Localization

Two new keys in both `src/localization/resources/en-US.json` and `tr-TR.json`, under `Tags`:

| Key                   | en-US    | tr-TR     |
| --------------------- | -------- | --------- |
| `Tags.RefundAmount`   | Refund   | İade      |
| `Tags.PurchaseAmount` | Purchase | Alışveriş |

No key for the date: the list shows it bare in its meta line, and this card follows.

Per the `i18n` rule these require `npm run init` to regenerate `src/data/language-data/*.gen.json`. That script fetches backend resources, so it needs network and env. If it cannot run, the two keys render as their key strings until someone runs it — a known, stated consequence, not a silent one.

## Rename

`LastestTag.tsx` → `LatestTag.tsx`, component `LastestTag` → `LatestTag`. The file is being rewritten anyway and has exactly two importers.

## Files

| File                                            | Change                                      |
| ----------------------------------------------- | ------------------------------------------- |
| `src/screens/shared/_components/LatestTag.tsx`  | new — the rewritten card                    |
| `src/screens/shared/_components/LastestTag.tsx` | deleted                                     |
| `src/screens/shared/_components/TagStates.tsx`  | reshape `TagCardSkeleton`, drop `compact`   |
| `src/utils/tagStatus.ts`                        | add `tagHeadlineAmountKind`                 |
| `src/utils/serialFont.ts`                       | new — extracted `SERIAL_FONT`               |
| `src/screens/shared/Tags/Tag/TagScreen.tsx`     | import `SERIAL_FONT` instead of defining it |
| `src/screens/traveller/Home/HomeScreen.tsx`     | import rename                               |
| `src/screens/merchant/Home/HomeScreen.tsx`      | import rename                               |
| `src/localization/resources/{en-US,tr-TR}.json` | two keys each                               |

## Amendment — the list adopts the same card

Added after the Home card shipped, at the user's request: they wanted the list to look the same.

Direction chosen: **condensed hero**, not the hero verbatim. The hero is ~155px, which is fine standing alone on Home but yields roughly 6 rows per screen in a list that can hold 100 tags. The row keeps the hero's anatomy, colour logic and reading order, and trims only what doesn't survive repetition:

|          | hero                 | row                          |
| -------- | -------------------- | ---------------------------- |
| padding  | `px-5 py-4`, `gap-3` | `px-4 py-3`, `gap-2`         |
| amount   | `text-[30px]`        | `text-[22px]`                |
| currency | `text-base`          | `text-sm`                    |
| caption  | shown                | hidden — noise once repeated |
| chevron  | 20                   | 18                           |
| height   | ~155px               | ~110px                       |

**Accepted tradeoff.** The old `TagRow` parked the amount in a right-hand panel so figures aligned in a column down the list — reasoning recorded in the comment at `TagScreen.tsx`. The hero stacks the amount instead, so adopting it gives that column up. On a single card there is no column to align with; in a list there was. This was raised with the user and accepted in favour of one consistent card.

**Structure.** Rather than copying the hero into `TagRow`, both surfaces now render one component, `src/screens/shared/_components/TagCard.tsx`, with a `variant: "hero" | "row"`. It is purely presentational — formatters and the role-dependent `secondary` are passed in, so a list builds them once rather than once per row — and memoised, preserving the property `TagRow` had. `LatestTag` shrinks to a container that reads the store, picks the state and chooses the name. `TagRow` is deleted.

`TagCardSkeleton` takes the same `variant` and `TagListSkeleton` renders it with `variant="row"`, so the separate `TagRowSkeleton` goes too — one skeleton that can't fall out of step with the one card it stands in for.

### Additional files

| File                                           | Change                                             |
| ---------------------------------------------- | -------------------------------------------------- |
| `src/screens/shared/_components/TagCard.tsx`   | new — the single card, both variants               |
| `src/screens/shared/_components/LatestTag.tsx` | reduced to a container over `TagCard`              |
| `src/screens/shared/Tags/Tag/TagScreen.tsx`    | `TagRow` deleted; renders `TagCard variant="row"`  |
| `src/screens/shared/_components/TagStates.tsx` | skeleton takes `variant`; `TagRowSkeleton` removed |
| `src/utils/__tests__/tagStatus.test.ts`        | cover `tagHeadlineAmountKind`                      |

## Out of scope

- The `Section` heading copy.
- `TagsEmptyState` / `TagsErrorState` sizing and their hardcoded `gray-*` / `red-*` classes — the same dark-mode problem the card had, but on different components.
- FlashList sizing: it is v2, which measures rows itself, and no `estimatedItemSize` was set, so the taller row needs no config change.

## Verification

- `npm run typecheck` — clean
- `npm run lint` — 0 errors; the 19 warnings are pre-existing and in untouched files. Targeted lint over every changed file is clean.
- `npm run init` — ran; both keys present in both generated bundles.
- `npx prettier --write` over changed files.
- `npm test` — 66 tests pass, including 6 new ones over `tagHeadlineAmountKind`. Four suites in `src/components/__tests__/` fail to load on a `@testing-library/react-native` module-resolution error; pre-existing, and unrelated to anything changed here.

`tagHeadlineAmountKind` is pure logic in a file that already has tests, so it is covered — including that it never disagrees with `tagHeadlineAmount` about which field won, since a caption that contradicts its figure is worse than no caption. The card itself is presentational and has no test harness in this repo, so it is verified by typecheck and lint only.
