# SP5: tag list parity — pos-app

**Date:** 2026-09-09
**Repo:** `pos-app` (`unirefund-pos`)
**Branch point:** `feat/ui-kit` (SP4), which sits on SP3 → SP2 → SP1 — **not `main`**
**Program:** [2026-09-09-posapp-parity-program-design.md](2026-09-09-posapp-parity-program-design.md) — sub-project 5 of 7
**Covers:** T3 (tag list styles *and* functionality, merchant scope)

## Goal

The merchant's tag list looks and behaves like super-app's: a status-railed
card, server-side search, a filter sheet, a sort toggle, pagination, and the
five list states.

## Why

pos-app's list is one 348-line file. What it does today:

- a `SectionList` bucketed by date, with the row component, the status palette,
  the date bucketing and the filter strip all inline
- a single-select status tab strip filtering **client-side** over one
  `maxResultCount: 100` fetch
- no search, no pagination, no pull-to-refresh, no error state
- the raw enum as the status label — a cashier sees `WaitingStampValidation`
- `STATUS_STYLES` written in `bg-blue-100` / `text-blue-700`, which
  [`AGENTS.md`](../../../pos-app/AGENTS.md) forbids outright, and which covers
  only 8 of the 18 statuses; the rest fall back to purple

The server already supports everything missing. `GetApiTagServiceTagData`
declares `tagNumber`, `travellerFullName`, `travellerDocumentNumber`,
`statuses[]`, `issuedStartDate`/`issuedEndDate`, `riskLevels[]`, `skipCount`,
`sorting` — all unwired.

## The finding that shapes this port

**pos-app's status enum is not super-app's.** Both declare 18 members in the
same order, but positions 12 and 17 differ:

| pos-app | super-app |
| --- | --- |
| `Paid` | `Refunded` |
| `EarlyPaid` | `EarlyRefunded` |

The backend renamed them and the two SDKs were generated either side of it.
Every ported file that names a status — the tone map, the no-deadline set, the
18 `StatusLabel` i18n keys — must use **pos-app's** names, and a comment in
`tagStatus.ts` says so, because "make it match super-app" is the obvious wrong
fix. This is exactly what AGENTS.md means by never carrying a claim between the
apps without re-diffing.

Regenerating pos-app's SDK is **not** in scope: `npm run gen` rewrites every
service and would bury this change in thousands of lines of unrelated churn.

## Decisions

1. **The tag list gets its own store.** `useMerchantStore.tags` becomes
   `src/store/tag.ts`, holding the list, the query, the page and a `generation`
   guard. Keeping the list in the merchant store would mean the query and the
   paging state living beside printer preferences, and the merchant store is
   already the widest thing in the app.
2. **`loadTags` becomes the single fetcher.** Today three places fetch tags —
   `MerchantProvider` on mount and both sale screens after creating one — each
   with its own params. They all call `loadTags` instead.
3. **Row variant only.** super-app's `TagCard` has a `hero` variant for its Home
   screen. pos-app's Home is a grid of `CardAction` tiles and has no hero, so
   the variant map goes and the row's classes inline.
4. **Statuses are offered as themselves, not as tone buckets.** super-app
   orders the filter chips by tone but filters by real statuses, because tone
   buckets are a client-side invention the backend has no concept of. Same here.
5. **The date bucketing goes.** Today's `SectionList` groups by
   "Today"/"Yesterday"/date. With server-side sort and pagination the groups
   would break across page boundaries — a page starting mid-Tuesday gets a
   "Tuesday" header with three of that day's tags under it. super-app's flat
   `FlashList` with the date on each row is what replaces it.
6. **The summary bar ships if and only if its grants are held.**
   `TagService.Tags` + `TagService.Tags.ViewSummary` for the figures,
   `TagService.TagRisks.FilterByRisk` for the risk tiles doubling as a filter.
   Fail-closed: no grant, no request, no tiles.

## Structure

| File | Responsibility |
| --- | --- |
| `src/utils/tagStatus.ts` | tones, rails, badge/text classes, label keys, headline amount, risk tone |
| `src/utils/tagDeadline.ts` | the one live deadline and its urgency tone |
| `src/store/tag.ts` | list + query + page + `generation` |
| `src/hooks/useLoadTags.tsx` | `loadTags(silent?)`, `queryToParams` |
| `src/screens/(auth)/Tags/_components/TagCard.tsx` | the row |
| `src/screens/(auth)/Tags/_components/TagStates.tsx` | skeleton, empty, no-match, error |
| `src/screens/(auth)/Tags/Tag/_components/TagListHeader.tsx` | search pill, sort, filter button |
| `src/screens/(auth)/Tags/Tag/_components/TagFilterSheet.tsx` | status chips + date presets, applied on confirm |
| `src/screens/(auth)/Tags/Tag/_components/TagSummaryBar.tsx` | grant-gated tiles |
| `src/screens/(auth)/Tags/Tag/TagScreen.tsx` | rewritten: `FlashList` + `BottomChrome` + `BlobPagination` |

`MerchantProvider` and both sale screens drop their own `getTags` call
(decision 2). `useMerchantStore`'s `tags` / `tagCount` / `setTags` /
`clearTags` are removed with their last caller.

## i18n

43 keys under `MobileApp.Tags` in both locales: the 18 `StatusLabel` entries
plus search/sort/filter labels, the four date presets, the five list states,
the three urgency strings, and the five summary captions. The pager's own
labels are `MobileApp.Common.Pager.*`, added in SP4.

`tagStatusLabelKey` returns the template-literal type
`` `MobileApp.Tags.StatusLabel.${TagStatusType}` ``, so a status added to the
API without a label **fails `tsc`** rather than shipping a raw enum name. That
is what makes the 18 keys a contract instead of a hope.

## Testing

- `tagStatus` / `tagDeadline`: tone mapping for all 18 statuses; the deadline's
  sequential export-then-refund choice; the `< 3` / `<= 14` tone thresholds;
  `NO_DEADLINE` statuses returning `null`; a validated tag with no refund
  deadline returning `null` rather than falling back to the met one.
- `tag.ts`: `tagKey` precedence, `tagPageCount` arithmetic, `setPage` clamping,
  narrowing resetting to page 1, `clearTags` returning to pre-load state.
- `useLoadTags`: `skipCount` sent and omitted on page 1; search trimmed and
  dropped when empty; sort mapped to the right `sorting` string; a load
  outliving its session dropped for both success and failure; a failed
  `ApiResult` recorded as an error rather than thrown.
- `TagCard`: the urgency chip's thresholds and its absence on a no-deadline
  status; the risk dot's grant gate and its `finalRiskLevel` preference; the
  early-refund pill; the localized status label.
- `TagScreen`: the skeleton is padded clear of the floating pager; a filter
  change resets to page 1; no-match offers a clear; an error offers a retry and
  is distinguishable from empty; the summary is requested only with both grants
  and never carries a risk level.

## Risks

**The single fetcher changes when tags load.** Today `MerchantProvider` fetches
them at `(auth)` mount, so the list is warm before the user opens it. Moving to
`loadTags` on the tag screen means a first-open skeleton. That is the correct
trade — the mount fetch was one page of 100 with no query — but it is a
visible change.

**`setTags` collapses a failure to `[]` today**, so a network error is
indistinguishable from an empty list. The new store separates them, which means
the error state appears where users previously saw "No tags". That is the fix,
not a regression, but it will look like new behaviour.

**The list is the screen a merchant uses most.** Worth on-device time before
merge, particularly the pager's floating position over the system nav bar,
which `BottomChrome` now derives from the safe-area inset rather than from a
tab island.

## Out of scope

The tag detail screen and its action footer (SP6). The `hero` card variant
(decision 3). Regenerating the SDK to pick up the `Paid` → `Refunded` rename.
