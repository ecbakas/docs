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

The list is capped at 20 items, so it stays a **plain scrolling list**, not a
second `FlashList`. Virtualisation exists on the Tags tab because that list can
hold a hundred tags and mounting them all was what made the screen stall; that
reasoning does not carry over to twenty rows.

## Testing

There is almost no pure logic here. The tab is a two-value state and the status
chip is a lookup, so unit tests would assert against a `useState` rather than
against behaviour — worse than no test.

The gate is `tsc`, `eslint`, and the existing Jest suite staying green, plus a
device check. That is not a formality: the device is what caught the
required-field label inconsistency that three rounds of code review had passed
over as Minor.

What most needs looking at on a phone: that the tab bar reads as tabs rather than
buttons, that switching does not flash the list, and that the Verifications empty
state appears for a traveller with no uploads.

## Out of scope

- Any change to the upload sheet, the QR prefill, or the image pipeline.
- Linking a `Completed` row to its tag — needs `tagId` on the traveller DTO.
- Swipe-between-tabs, animated indicators, or a general tab component.
- Persisting the selected tab across app launches.
- Staff seeing anything new.
