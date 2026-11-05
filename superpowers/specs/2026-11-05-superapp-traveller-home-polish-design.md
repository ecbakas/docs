# super-app traveller Home polish — design

Date: 2026-11-05 · Repo: `super-app` · Branch: `feat/traveller-home-polish`
(worktree `C:\unirefund\super-app-wt-home`)

Three small traveller-side items from the 2026-11-05 backlog (#4, #6, #9).

## #4 Document switcher as a Home card

**Before:** the switcher was a pill under the Home greeting
(`ActiveDocumentPill`, the TabPage `headerAccessory`) and the document row in
Profile's identity hero (`IdentityHero`). Both open `DocumentSwitcherSheet`,
which switches the **active** document (JWT `TravellerDocumentId`, via
`set-active`), never the primary one.

**User decisions (2026-11-05):**

- Design **C, the passport-cover card**: a `bg-primary` card with
  `text-primary-foreground` — kicker with the document type (plus "· In use"
  when there are several), the document's full name, the number masked
  (`maskDocumentNumber`, serial font), and on the right a swap icon with
  "n of N". Chosen over a quieter bordered row (A) and document chips (B),
  knowing it outweighs the refund summary below it.
- **Drop the Home header pill, keep Profile's row.**
- **One document → card without a switch** (type icon instead of the swap
  affordance, not pressable).

**Builder's calls:**

- The card leads every Home state (loading, start, error, loaded), so switching
  never waits on tags; in the loaded state the refund summary follows it (the
  retry banner, when a background refresh fails, sits between them).
- No claim → no card. Claim missing from the list (stale token) → no card,
  rather than naming another document. Loading with no list yet → a skeleton
  of the card's shape.
- The card takes Home's existing `switcher` (no second GET) and keeps the
  select-then-confirm sheet.

## #6 Pre-fill Card Holder Name

**Source:** the active document's `travellerDocumentFullName` (the legal name a
refund is paid against), falling back to profile `name` + `surname`, else
nothing. Only the active document — another document may spell the name
differently. ssr has no pre-fill to match.

**Rules:**

- The field shows the suggestion only while untouched (`typedHolderName ===
  null`). A late suggestion never replaces typing; a cleared field stays clear.
- While the document list is loading the field stays empty, so it never shows
  the profile name and then changes to the document name.
- Card scan does not read a holder name (`ScannedCard` has none), so nothing
  from a scan is overwritten.
- A hint under the field says it was filled in and can be edited; it disappears
  once the traveller edits.
- The fetch runs inside the form (mounted only while the sheet is open) and
  calls no context hook, so the portal boundary and the host-re-render rule
  (no modal-host re-render per keystroke) both hold.
- The name is used as stored — no upper-casing.

## #9 Add to Apple Wallet loading state

- On tap the Apple button is replaced by a same-size placeholder (spinner +
  "Getting your pass ready…"), the card reports `busy`, and a ref guard stops a
  second touch-up in the same frame from issuing twice.
- Restores when `addPassFromUrlAsync` settles — that is when Apple's sheet
  closes (or the call fails), not when it appears. The sheet is modal and
  covers the card, so the difference is not visible; restoring on appear would
  need a new native event that cannot be compiled or checked on Windows.
- The card has no other action, and the pass is per traveller rather than per
  document, so nothing else on Home competes with it.
- iOS only; covered by router tests, **unverified on a device**.
