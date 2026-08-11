# Tabs on the traveller tags screen — super-app

The traveller's tags screen currently shows their pending sticker verifications
as a block above the tag list. This splits the screen into two tabs: **Tags**
(left, default) and **Verifications** (right).

It amends
[2026-08-10-superapp-sticker-manual-verification-design.md](2026-08-10-superapp-sticker-manual-verification-design.md),
which is where the verifications list came from.

## Why this changes more than the layout

The existing section deliberately hides `Completed` pairs. The stated reason was
adjacency: *"the tag it produced is already in the list immediately below."*

Tabs remove that adjacency. The tag is no longer below — it is a tab away. So the
reasoning that justified hiding them no longer holds, and **the Verifications tab
shows all three statuses**: `Created`, `Invalid` and `Completed`.

This is the substantive change. Without it, a traveller who opens a tab named
*Verifications* and finds a pair they uploaded last week simply absent cannot
tell whether it succeeded, was lost, or was never sent.

## The tab bar

A two-segment control, **local to the Tags feature** rather than a shared
component. `src/components/` has no tab or segmented-control primitive to extend,
and nothing else in the app needs one today; if a second caller appears, lift it
then. Building a general one now would be inventing a component to have one.

**It renders for travellers only.** `TagScreen` is shared with merchant and
refund-point staff, who have no verifications at all — the endpoint behind the
second tab is traveller-scoped. Staff see the screen exactly as it is today: no
tab bar, no second tab, the tag list unchanged. Gate on the `isStaff` the file
already computes (`isMerchant || isRefundPoint`), the same predicate that already
gates the section and the upload trigger.

Default is **Tags**, and the tab is local component state. It does not belong in
the route, the tag store, or persisted storage: nothing links to a tab, and a
traveller returning to the screen expects their tags.

## What the header does

The header row holds search, sort, a filter button and Upload. The first three
are tag-specific — they search tag numbers, sort by issue date, and filter tag
status.

- **On Tags:** unchanged.
- **On Verifications:** search, sort and filter are hidden. They would do nothing
  there, and a control that does nothing reads as broken rather than as a
  deliberate omission.
- **Upload stays visible on both.** It is the action that produces what the
  second tab lists, and hiding it behind a tab switch would put it one step
  further from the traveller who needs it.

The tab bar sits **below** the header row, so Upload stays at the top where it is
now and the tabs sit directly above the content they switch.

`TagListHeader` therefore gains a prop controlling whether the tag-specific
controls render. It must be optional and default to showing them, so the staff
path and any other caller are untouched.

## The verifications list becomes a tab body

Today `PendingVerifications` is the `FlashList`'s `ListHeaderComponent`. It
becomes the Verifications tab's whole body. Three consequences:

**It shows `Completed`.** That needs a third entry in the status→style map and
**two** new keys in both locales: `Status.Completed` for the chip, and a separate
line stating that a tag was created from the pair — the chip alone says only what
happened to the *verification*, not that something now exists because of it.

A completed row does **not** link to that tag. The traveller's `/my` DTO carries
no `tagId` — only the officer's worklist DTO does — so a link would need either a
backend change or a lookup by sticker line number, and neither is worth it for a
row the traveller can already find in the adjacent tab.

**It needs an empty state.** As a section it could legitimately render nothing;
as a tab it cannot. A traveller who has never uploaded needs to see why the tab
is empty and what to do about it, in the same shape as the existing
`TagsEmptyState`.

**It gets renamed to `VerificationList`.** "Pending" stops being true the moment
`Completed` rows appear, and a component whose name contradicts its contents
misleads the next person to read it.

The status→style map stays local and stays **separate from `TagCard`'s**. That
one is keyed by `TagStatusType`, an eighteen-member enum; this is
`StickerManualVerificationStatus`, which has three. Sharing them would make two
unrelated vocabularies look interchangeable.

## Refresh and data loading

No change to when data is fetched. `usePendingVerifications` already reloads on
screen focus alongside `loadTags`, so **switching tabs triggers no refetch** —
both datasets are already current.

The Verifications tab gets its own pull-to-refresh calling the hook's `reload`,
matching the Tags tab's existing `RefreshControl`.

### The empty state must not absorb failures

*Added during execution, after review of the wiring task.*

The same argument that forces `Completed` onto this tab forces an error state
onto it. `getStickerManualVerificationsMyApi` swallows every failure into `[]` —
written that way because the `ViewMine` grant is absent on some environments and
the old section had to vanish rather than break the tags screen it sat on. As a
section that was harmless: rendering nothing is not a claim. As a tab body with
an empty state, it becomes one. A traveller on a dead connection would read
"No verifications yet" and believe it.

This repo has already ruled on the trade-off, in the very file the empty state
was copied from: *"an outage reading as 'you have no tags' is the more
misleading of the two."* The Tags tab honours it. So:

- The action keeps returning `[]` for **403 only** — the case its catch was
  actually written for — and lets everything else bubble, which is what
  `.claude/rules/api-actions.md` asks for anyway.
- `usePendingVerifications` grows an `error` and an `isLoading` channel.
  `isLoading` starts true for an enabled caller, or the tab flashes the empty
  card before the first response lands.
- The tab body branches the way the tags body already does: skeleton while
  loading, error state only when there is nothing to show, list otherwise. A
  failed background refresh must not pull a list out from under someone reading
  it.

`TagsErrorState` takes optional copy keys rather than being duplicated. Its name
overreaches once verifications use it, but renaming a shared component is not
this plan's business.

The list is capped at 20 items, so it stays a **plain scrolling list**, not a
second `FlashList`. Virtualisation exists on the Tags tab because that list can
hold a hundred tags and mounting them all was what made the screen stall; that
reasoning does not carry over to twenty rows.

## Testing

*Amended during execution. This section first claimed the feature had no
testable logic — that the tab was a `useState` and the chip a lookup. Review
showed otherwise: both new components are prop-driven and own no state, and
`src/screens/traveller/Cards/__tests__/HeroPills.router.test.tsx` already tests
the same shape of component with nothing but `render`, `fireEvent` and a
one-line localization mock. The original reasoning did not survive contact with
the repo's own precedent.*

**The two components get render tests.** `TagsTabBar` is tested for which tab
reports selected and that pressing the other one reports its key.
`VerificationList` is where the real branching lives — three statuses, a
rejection reason only on `Invalid`, a tag-created line only on `Completed`, and
an empty state — and each branch gets a case. Tests are named
`*.router.test.tsx`, which is how `jest.config.js` routes them to the
`jest-expo/android` project.

**`TagScreen` gets none.** Covering it means mocking the tag store, expo-router
and two hooks, which tests the mocks rather than the screen.

Beyond that the gate is `tsc`, `eslint`, the suite staying green, and a device
check. The device is not a formality: it is what caught the required-field label
inconsistency that three rounds of code review had passed over as Minor.

What most needs looking at on a phone: that the tab bar reads as tabs rather than
buttons, that switching does not flash the list, and that the Verifications empty
state appears for a traveller with no uploads.

## Out of scope

- Any change to the upload sheet, the QR prefill, or the image pipeline.
- Linking a `Completed` row to its tag — needs `tagId` on the traveller DTO.
- Swipe-between-tabs, animated indicators, or a general tab component.
- Persisting the selected tab across app launches.
- Staff seeing anything new.
