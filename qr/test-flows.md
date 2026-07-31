# QR handling — test flows

This file answers how to manually verify each QR-triggered action end to end.
One flow per registry action id, written for a tester who has not read any of
the code this guide describes — every precondition is stated in test-data
terms, every screen is named by what it says rather than by its file, and
every gate a flow depends on carries an `EXPECT` so a tester can tell a pass
from a fail without guessing.

_Verified against: 2026-07-31 · super-app `24221f7` · web-app `0cf122af0`._

None of these 102 flows has been executed against a deployed environment as
part of writing this file — see [What has not been run](#what-has-not-been-run)
at the end.

## Test-data preamble

Every flow below draws on this shared cast of fixtures instead of re-deriving
its own setup. Where a flow needs something this list does not cover, its own
**Needs** line says so. Nothing here is a permission or a screen name — it is
the state the data has to be in before the first step.

- **Sticker U** — a printed sticker QR whose book has **not** been allocated
  to any store yet.
- **Sticker O** — a printed sticker QR whose book is allocated to the
  tester's **own** store — the store Staff M (below) works for.
- **Sticker F** — a printed sticker QR whose book is allocated to a store
  **other than** Staff M's.
- **Tag D** — a **Draft** tag with no traveller attached (unclaimed). Note
  down its tag number and the sale amount recorded on it before starting a
  flow that claims it — the claim needs both. A tag comes out Draft only
  because whoever created it left the traveller field empty; that is what
  makes it claimable at all, not a status a tester can assume by default.
- **Tag I** — an **Issued** tag, already carrying a traveller.
- **Traveller A** — a traveller account and travel document whose identity
  check (KYC) is complete.
- **Traveller B** — a traveller account or travel document whose identity
  check (KYC) is **not** complete.
- **Staff M** — a merchant staff account, for the same store Sticker O and
  Tag D / Tag I belong to.
- **Staff R** — a refund point staff account.
- **Staff C** — a customs staff account, at a customs office with **exactly
  one** registered kiosk device. The kiosk page treats zero devices as "not
  set up yet" and, separately, treats more than one as an operational
  failure rather than a friendly prompt — exactly one is the only setup that
  lets a kiosk flow proceed cleanly; see the negative case on `TF-A73`.
- **Boarding pass H** — a boarding pass carrying a scannable barcode in the
  format airlines print on paper and mobile boarding passes (BCBP), for a
  real or realistic test itinerary.

**Producing a scannable code without printed stock.** A sticker QR, a tag QR
and a validate QR all need to exist as a scannable code before the first step
of the flows that use them. Where no real printed sticker, tax-free form or
kiosk screen is on hand: `pos-app` — a separate point-of-sale companion app,
not the same app as any of the three this guide's flows run on — ships a
device-settings screen called `BarcodeTestScreen` built for exactly this
purpose. It prints an arbitrary test code, chosen by the tester, as a QR or
in any of several other symbologies, on that device's own screen, for a
second device's camera to scan. It is the only way to produce a scannable
code without real printed stock, and it is what several flows below fall
back to when a fixture above has no physical counterpart yet. `pos-app`
itself performs no action in this guide's registry — it is cited here only
as a source of test codes.

## Mobile app flows

These 38 flows (`A01`–`A38`) run on the mobile app. Three entry points —
the role picker seen before any role is chosen, the traveller sign-in screen,
and the scan button inside the signed-in app — all feed the same underlying
scan-handling pipeline, which four of the ids below (`A34`–`A37`) test
directly rather than through a screen of their own.

### TF-A01 — Scan a QR before choosing a role

**App:** mobile app · **Role:** Anyone, before choosing a role
**Needs:** Sticker O, or any printed sticker or tag QR

1. Launch the app for the first time, or after signing out so no role is
   remembered, so it opens on the screen offering a choice of role.
   EXPECT a role-choice screen with a scan action available before either
   role is picked.
2. Tap the scan action and point the camera at Sticker O.
   EXPECT the same read-only result a non-staff scan of a sticker QR
   produces (see `TF-A08`) — no role or login is required to reach it.

**Negative cases**
- Point the camera at a QR that is not a Unirefund code at all.
  EXPECT a plain "not recognized" message, and the app stays on the role
  picker rather than opening any tag or sticker screen.

### TF-A02 — Scan a QR from the traveller login screen

**App:** mobile app · **Role:** Traveller, logged out
**Needs:** Traveller A's login credentials; Sticker O

1. From the role picker, choose the traveller role, reaching the traveller
   sign-in screen without signing in yet.
   EXPECT a sign-in form with a scan action available beside it.
2. Tap the scan action and point the camera at Sticker O.
   EXPECT the same read-only sticker result as `TF-A08`, reached without
   entering any credentials.

**Negative cases**
- Point the camera at a validate QR (see `TF-A73` for how to display one)
  from this same screen.
  EXPECT the validate flow opens for a logged-out traveller (see `TF-A22`),
  not a staff-style refusal — this screen has no staff role active.

### TF-A03 — Look up a tag by typed tag number and passport number

**App:** mobile app · **Role:** Traveller
**Needs:** Tag I's tag number; the passport/document number of the
traveller on Tag I

1. From the scan screen, switch to typing the code in by hand instead of
   using the camera, and choose the tag mode of the two on offer.
   EXPECT a form asking for a tag number and, since this account is not
   staff, also a passport number field.
2. Enter Tag I's tag number and the matching passport number, then submit.
   EXPECT the same public tag detail a scan of Tag I's own QR would show
   (see `TF-A07`).

**Negative cases**
- Submit with the passport number field left empty.
  EXPECT an inline validation message, and the form does not submit.
- Enter a tag number and passport number that do not both belong to the same
  tag.
  EXPECT a not-found result, not a mismatched tag's detail.

### TF-A04 — Look up the tag issued on a typed sticker line number

**App:** mobile app · **Role:** Traveller, Merchant staff, Refund Point staff
**Needs:** Sticker O's line number

1. From the scan screen, switch to typing the code in by hand, and choose
   the sticker mode (the default mode on this form).
   EXPECT a form asking only for a sticker number — no passport field,
   regardless of who is signed in.
2. Type Sticker O's line number and submit.
   EXPECT the same destination a camera scan of that sticker would reach:
   the read-only tag preview for a traveller (`TF-A08`), or the staff
   sticker screen for Staff M or Staff R (`TF-A12`).

**Negative cases**
- Submit with the field left empty.
  EXPECT an inline validation message, and the form does not submit.
- Type a sticker number that does not exist.
  EXPECT a not-found result rather than a blank or crashing screen.

### TF-A05 — Resolve a bare tag number to its tag id

**App:** mobile app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M or Staff R, signed in; Tag D's tag number; pos-app's test
barcode screen (or a real Code128 tag-number barcode) set to print Tag D's
number

1. Signed in as staff, scan a 1D barcode carrying only Tag D's tag number —
   no QR, just the linear barcode — with the in-app scanner.
   EXPECT the app resolves the number to the underlying tag and opens the
   same tag preview a full tag QR scan would (`TF-A06`), with no extra step
   visible to the tester.
2. Repeat by typing the same tag number into the manual-entry tag mode
   (`TF-A04`'s form, tag mode) instead of scanning.
   EXPECT the identical resolved result.

**Negative cases**
- Scan or type a tag number that does not exist.
  EXPECT a "tag not found" message, not a generic failure and not a blank
  screen.

### TF-A06 — Read a scanned tag's public detail by tag id

**App:** mobile app · **Role:** Anyone, including logged out
**Needs:** Tag D (Draft) and Tag I (Issued), each as a scannable tag QR

1. Without signing in, scan Tag D's tag QR.
   EXPECT the tag's public preview: tag number, status, and — because it
   is Draft with no traveller — an offer to claim it (login-gated, since no
   one is signed in yet).
2. Scan Tag I's tag QR the same way.
   EXPECT the same public preview, showing it as already issued, with no
   claim offered.
3. Repeat step 1 signed in as Staff M.
   EXPECT the identical read-only preview — this first read is anonymous
   and does not distinguish a staff caller from a traveller — with an
   "assign a traveller" action in place of "claim", since this caller is
   staff.

**Negative cases**
- Scan a tag QR whose tag id does not exist (or has been altered).
  EXPECT a not-found message on the preview screen, not a crash.

### TF-A07 — Read a tag's public detail by tag number and traveller document

**App:** mobile app · **Role:** Traveller, including logged out
**Needs:** Tag I's tag number; the document number of the traveller on Tag I

This is the scan-shaped counterpart to `TF-A03`'s typed lookup — the two
share one screen and one result.

1. Without signing in, scan (or, if no such QR exists to scan, type via
   `TF-A03`) a tag QR carrying Tag I's number paired with its traveller's
   document number.
   EXPECT the tag's public preview, showing it already issued.

**Negative cases**
- Supply Tag I's tag number with a document number that does not match its
  traveller.
  EXPECT a not-found result — this pairing is the credential, and a
  mismatch must not leak whether the tag number alone is valid.

### TF-A08 — Read the tag issued on a scanned sticker line

**App:** mobile app · **Role:** Traveller, including logged out
**Needs:** Sticker O with a tag already created against it (use Tag I's
sticker if it was created that way, or complete `TF-A19` first); Sticker U

1. Without signing in, scan a sticker QR whose book already has a tag
   issued on it.
   EXPECT the read-only public preview of the tag issued on that sticker —
   the same shape `TF-A06` shows, reached by sticker instead of by tag id.
2. Scan Sticker U (no tag issued on it yet, book unallocated).
   EXPECT a specific message that no tax-free tag has been issued on this
   sticker yet, telling the traveller to ask the store to complete the
   purchase — not a generic not-found message.

**Negative cases**
- Scan a sticker QR for a line that does not exist at all.
  EXPECT a not-found result, distinguishable from the "no tag yet" message
  in step 2.

### TF-A09 — Claim an unclaimed draft tag

**App:** mobile app · **Role:** Traveller, authenticated
**Needs:** Traveller A signed in; Tag D scanned as a tag QR, with its sale
amount noted from the preamble

1. Signed in as Traveller A, scan Tag D's tag QR.
   EXPECT the public preview showing Tag D as a Draft tag with a Claim
   button (not "Login to claim", since a session already exists).
2. Tap Claim.
   EXPECT a success message, and the tag now shows in this traveller's own
   tag list (`TF-A28`) as claimed by them.

**Negative cases**
- Scan an already-Issued tag (Tag I) instead.
  EXPECT no Claim button at all — the preview offers only to view it, with
  no path to claim someone else's already-assigned tag.
- Claim Tag D, then have a second traveller account attempt to claim the
  same tag number again.
  EXPECT the second claim to fail rather than silently reassign the tag.

### TF-A10 — Assign a traveller to a scanned draft tag

**App:** mobile app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M (or Staff R) signed in; Tag D scanned as a tag QR;
Traveller A's document number

1. Signed in as Staff M, scan Tag D's tag QR.
   EXPECT the public preview showing Tag D as Draft, with an "assign a
   traveller" action rather than a Claim button — staff cannot claim a tag
   for themselves.
2. Tap the assign action and search for Traveller A by document number.
   EXPECT a matching result, selectable.
3. Select Traveller A.
   EXPECT a success message, and the screen moves to the tag's own detail
   view now showing Traveller A attached.

**Negative cases**
- Search the traveller picker for a document number with no matching
  traveller.
  EXPECT an empty result, not an error, and the picker stays open for
  another attempt.

### TF-A11 — Resolve a traveller by document number to attach or assign

**App:** mobile app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M or Staff R, signed in and mid-way through `TF-A10` or
`TF-A19`'s traveller-search step; Traveller A's document number

1. With the traveller-search picker open (reached from either the sticker
   create screen or the assign-a-traveller action), type Traveller A's
   document number.
   EXPECT a list of matching travellers, showing enough to tell them apart
   if more than one document matches.
2. Select the intended match.
   EXPECT the picker closes and the traveller is attached to whatever
   in-progress action opened it (a sale in progress, or an assign call).

**Negative cases**
- Type a document number matching more than one traveller.
  EXPECT every match listed, not just the first — this field is not
  guaranteed unique, and taking the first result silently would risk
  attaching the wrong person.

### TF-A12 — Resolve a scanned sticker line

**App:** mobile app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M signed in; Sticker O; Sticker U

1. Signed in as Staff M, scan Sticker O.
   EXPECT the sticker screen opens showing this line already allocated to
   the tester's own store, ready to price and create a tag.
2. Scan Sticker U instead.
   EXPECT the sticker screen opens showing this line as unallocated, with
   no store name shown yet.

**Negative cases**
- Scan a sticker QR for a line number that does not exist.
  EXPECT a "line not found" message, not a blank create form.

### TF-A13 — A used sticker opens its tag instead of a create form

**App:** mobile app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M signed in; a sticker whose book already has a tag issued
on it (reuse the sticker from `TF-A08`'s first step)

1. Signed in as Staff M, scan a sticker that already has a tag issued
   against it.
   EXPECT the app skips the create form entirely and opens straight to
   that tag's own detail, exactly as if a tag QR had been scanned.

**Negative cases**
- Scan a sticker line that reports as used but, due to a data
  inconsistency, names no tag to open.
  EXPECT a dedicated "already used" terminal message with no create form
  and no navigation — not a silent failure and not a second create attempt.
  (This state may not be reproducible on demand; note whether it was
  reachable rather than skipping the row if it cannot be forced.)

### TF-A14 — Resolve the merchant an allocated sticker book is booked to

**App:** mobile app · **Role:** Refund Point staff
**Needs:** Staff R signed in; Sticker O (allocated to a merchant Staff R
does not work for)

1. Signed in as Staff R, scan Sticker O.
   EXPECT the sticker screen previews the store it is allocated to — name,
   VAT number and active product groups — with no picker offered, since
   the book is already spoken for.

**Negative cases**
- Compare this same read as Staff M (the store's own merchant staff)
  scanning the same sticker.
  EXPECT Staff M reaches the identical allocation information through a
  different read (see `TF-A16`/`TF-A17`) without ever seeing the picker
  either — the point being that neither role is offered a picker on an
  already-allocated line.

### TF-A15 — Pick a merchant for an unallocated sticker book

**App:** mobile app · **Role:** Refund Point staff
**Needs:** Staff R signed in; Sticker U

1. Signed in as Staff R, scan Sticker U.
   EXPECT the sticker screen shows the line as unallocated and offers a
   merchant picker rather than a fixed store name.
2. Search the picker for a store by name.
   EXPECT a list of active stores matching the search, selectable, with no
   allocation made yet by the act of searching or previewing.

**Negative cases**
- Search for a store that does not exist or is not active.
  EXPECT an empty result list, not an error.
- Reach this same screen as an account that does not hold the grant to
  search for a merchant.
  EXPECT a blocked state explaining a merchant cannot be picked here,
  rather than a picker that opens but silently fails to return results.

### TF-A16 — Load own product groups to price a sticker tag

**App:** mobile app · **Role:** Merchant staff
**Needs:** Staff M signed in; Sticker O

1. Signed in as Staff M, scan Sticker O (allocated to the tester's own
   store).
   EXPECT the sticker screen loads and shows the store's own product
   groups, each with its VAT rate, ready to price a line item.

**Negative cases**
- Compare against the same store's information loading a second time when
  the product-group read itself fails (for example, a forced network
  interruption).
  EXPECT the screen still shows enough identity (from the sticker line
  itself) to continue, rather than a dead end — a degraded product-group
  read should not block seeing the store's name and VAT number.

### TF-A17 — Load own VAT identity for the sticker create call

**App:** mobile app · **Role:** Merchant staff
**Needs:** Staff M signed in; Sticker O

1. Signed in as Staff M, scan Sticker O.
   EXPECT the sticker screen shows the store's own VAT number and business
   name, sourced from the store's own record rather than only from the
   sticker line.

**Negative cases**
- Force the store-identity read to fail (for example, a network
  interruption) while the sticker line read itself still succeeds.
  EXPECT the screen falls back to the name and VAT number already carried
  on the sticker line, rather than blocking the whole screen on the failed
  call.

### TF-A18 — Refuse a sticker book allocated to another merchant

**App:** mobile app · **Role:** Merchant staff
**Needs:** Staff M signed in; Sticker F (allocated to a different store)

1. Signed in as Staff M, scan Sticker F.
   EXPECT a terminal "allocated to another store" message with no create
   form and no way forward — not a create form that would only fail at
   submission.

**Negative cases**
- Attempt the same scan as Staff R (Refund Point) instead of Staff M.
  EXPECT no refusal at all: a Refund Point is not excluded from any store's
  book, so the same sticker previews normally for Staff R (see `TF-A14`).

### TF-A19 — Create a tag against a scanned sticker as the merchant

**App:** mobile app · **Role:** Merchant staff
**Needs:** Staff M signed in; Sticker O; Traveller A's document number
(optional, for the Issued variant); an invoice amount to enter

1. Signed in as Staff M, scan Sticker O.
   EXPECT the sticker screen, allocated to the tester's own store, ready to
   price a line.
2. Enter an invoice amount against one of the store's product groups, leave
   the traveller field empty, and submit the create action.
   EXPECT a new **Draft** tag, bound to that sticker, with no traveller
   attached — claimable later by scanning the same sticker or the tag's own
   QR.
3. Repeat with a traveller attached before submitting (search and select
   Traveller A first).
   EXPECT a new **Issued** tag, already carrying Traveller A, created in
   the same single submission with no separate assign step.

**Note.** If this same create is attempted against an unallocated sticker
(Sticker U) rather than Sticker O, the result is not established by this
guide — the underlying SDK's own documentation disagrees about whether
that call is rejected or permanently allocates the book. See
`endpoints.md`'s "Sticker allocation: an unresolved contradiction". Do not
run this variant against a book anyone still needs unallocated.

**Negative cases**
- Attempt the create with no product group priced at all.
  EXPECT the submit action is withheld or refused, not a tag created with
  nothing on it.

### TF-A20 — Create a tag against a scanned sticker on a merchant's behalf

**App:** mobile app · **Role:** Refund Point staff
**Needs:** Staff R signed in; Sticker U; a merchant picked via `TF-A15`; an
invoice amount to enter

1. Signed in as Staff R, scan Sticker U and pick a merchant as in `TF-A15`.
   EXPECT the picked store's product groups load, ready to price a line.
2. Enter an invoice amount, leave the traveller field empty, and submit the
   create action.
   **The result of this step is not established by this guide — see the
   note below before running it.**
3. Separately, repeat against Sticker O (already allocated) instead.
   EXPECT a normal, unambiguous create: a new Draft or Issued tag bound to
   the sticker, with the picked-merchant question moot since the book is
   already spoken for.

**Note.** Step 2's underlying SDK documentation disagrees about whether
creating against a still-unallocated line is rejected outright or
permanently allocates the whole sticker book to the picked store — see
`endpoints.md`'s "Sticker allocation: an unresolved contradiction". Do not
treat either a rejection or a success in step 2 as confirmation of which
reading is correct, and do not repeat step 2 against a second unallocated
sticker without a settled answer — if the book is in fact allocated by
that call, it cannot be pointed at a different store afterward.

**Negative cases**
- Attempt this create signed in as Staff M (a merchant) instead of Staff R.
  EXPECT the option to create on a merchant's behalf is not available to a
  merchant account at all — a merchant creates through `TF-A19`'s path, not
  this one.

### TF-A21 — Capture the merchant and traveller signatures on a sticker tag

**App:** mobile app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M signed in; Sticker O; Sticker U

1. Signed in as Staff M, scan Sticker O and reach the pricing screen.
   EXPECT both a traveller signature pad and a merchant signature pad
   available, regardless of whether a traveller has been attached yet.
2. Sign both pads and submit a create with a traveller attached.
   EXPECT the created (Issued) tag to carry both signatures.
3. Signed in as Staff R (Refund Point), scan Sticker U, pick a merchant,
   and reach the signature step — **without submitting the create yet**.
   EXPECT only the traveller signature pad is offered — no merchant
   signature pad for a Refund Point, since a Refund Point is not the
   merchant.
4. Sign the traveller pad and submit the create.
   **The result of this step is not established by this guide — see the
   note below before running it.**

**Note.** Sticker U is still unallocated at the point it was picked in
step 3, so completing the create in step 4 is the same disputed action
`TF-A20` describes — see `endpoints.md`'s "Sticker allocation: an
unresolved contradiction". Do not treat either a rejection or a success in
step 4 as confirmation of which reading is correct, and do not run that
step against a book anyone still needs unallocated.

**Negative cases**
- As Staff M, sign the traveller pad but never attach a traveller, then
  submit as a Draft tag.
  EXPECT the tag is still created — nothing on this screen blocks a
  traveller signature from being sent on a tag with no traveller attached,
  which is worth confirming precisely because it looks like it should be
  blocked.

### TF-A22 — Run the airport self-validation scan

**App:** mobile app · **Role:** Traveller, authenticated
**Needs:** Traveller A signed in, with Tag D (or another Draft tag) already
claimed onto their account; a validate QR (see `TF-A73`'s kiosk, or a
printed test copy); Boarding pass H; device location permission available
to grant

1. Signed in as Traveller A, scan the validate QR.
   EXPECT the validation flow opens, first asking to grant device location.
2. Grant location.
   EXPECT the flow moves to the flight-ticket step.
3. Scan Boarding pass H's barcode on the flight-ticket step.
   EXPECT the flight fields populate and the Submit action becomes
   available.
4. Submit.
   EXPECT a results screen sorting the traveller's claimed tags into
   categories (at minimum: cleared and rejected), reflecting whatever this
   traveller currently holds.

**Negative cases**
- Deny the location permission.
  EXPECT a specific denied/unavailable message rather than a silent stall,
  and no path forward until location is granted.
- Attempt this scan while logged out.
  EXPECT a visible "log in to validate" prompt rather than a silent
  redirect or a broken screen — signing in from here resumes the same
  validate attempt afterward with no second scan needed.

### TF-A23 — Scan the boarding pass for the flight ticket

**App:** mobile app · **Role:** Traveller, authenticated
**Needs:** Traveller A mid-way through `TF-A22`, at the flight-ticket step;
Boarding pass H

1. On the flight-ticket step, choose the scan tab and point the camera at
   Boarding pass H's barcode.
   EXPECT the flight fields populate automatically and Submit becomes
   available.

**Negative cases**
- Scan a barcode that decodes as a boarding pass but carries no usable
  flight fields (a boarding pass with a badly printed or non-standard
  barcode, if one is available; this is a negative case of this same
  action, not a separate one).
  EXPECT an amber "unreadable" prompt inviting a rescan, with Submit
  withheld — not a silent pass-through to Submit.
- Scan something that is not a boarding pass barcode at all.
  EXPECT the same "unreadable" prompt rather than a crash or a false
  positive.

### TF-A24 — Rescan an expired validate QR mid-flow

**App:** mobile app · **Role:** Traveller, authenticated
**Needs:** Traveller A mid-way through `TF-A22`; enough elapsed time (or a
kiosk configured to roll quickly) for the original validate QR to expire
before submitting

1. Let the validate QR go stale mid-flow (wait past its display window on
   the kiosk before submitting the scan), then submit.
   EXPECT a dedicated "this code is no longer active, please rescan"
   state — not the generic failure screen.
2. Tap the rescan action and scan the kiosk's current validate QR.
   EXPECT the flow continues with the freshly read code, without losing
   the flight-ticket data already entered.

**Negative cases**
- Let the session itself expire (not just the QR) before submitting.
  EXPECT a distinct "session expired" screen instead of the rescan prompt,
  whose retry re-runs the login-and-resume path rather than just asking
  for a fresh QR.

### TF-A25 — Claim a further tag from the validation results

**App:** mobile app · **Role:** Traveller, authenticated
**Needs:** Traveller A, having just completed `TF-A22`; a second Draft tag
scannable by QR, with its sale amount noted

1. From the validation results, open the claim action.
   EXPECT a scan-only claim screen (no typed-entry tab on this app — typed
   entry is the separate manual-entry screen, `TF-A03`/`TF-A04`).
2. Scan the second Draft tag's QR.
   EXPECT a success message and the modal closes.
3. Observe the results screen after the modal closes.
   EXPECT the validation scan re-runs automatically so the newly claimed
   tag can appear in a cleared/rejected bucket, without a manual refresh.

**Negative cases**
- Scan an already-Issued tag from this modal.
  EXPECT dedicated "already issued" copy rather than a generic claim
  failure, with no Claim button offered for it.

### TF-A26 — Refuse a validate QR scanned by staff

**App:** mobile app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M (or Staff R) signed in; a validate QR to scan (see
`TF-A73`)

1. Signed in as staff, scan a validate QR with the in-app scanner.
   EXPECT a specific message naming this as a validation code that staff
   cannot use — not a generic failure, and not a "not found" message — and
   no navigation away from the current screen.

**Negative cases**
- Compare the same scan as a logged-out or traveller-role scanner.
  EXPECT the validate flow opens normally instead (see `TF-A22`) — the
  refusal in step 1 is specific to an active staff role, not to the code
  itself.

### TF-A27 — Create a tag from the merchant Create Tag screen

**App:** mobile app · **Role:** Merchant staff
**Needs:** Staff M signed in; no sticker required; an invoice amount and
product group to select; Traveller A's document number (optional)

1. Signed in as Staff M, open the Create Tag screen directly from the
   signed-in app's own navigation, without scanning anything first.
   EXPECT a create form with no sticker attached, priced against the
   store's own product groups.
2. Enter an invoice amount, leave the traveller field empty, and submit.
   EXPECT a new Draft tag created with no sticker line bound to it.
3. Repeat with Traveller A attached before submitting.
   EXPECT a new Issued tag, carrying Traveller A, in one submission.

**Negative cases**
- Attempt this same screen signed in as Staff R (Refund Point).
  EXPECT this entry point is not available to a Refund Point account —
  creating with no sticker at all is a merchant-only path here.

### TF-A28 — List own tags across tenants

**App:** mobile app · **Role:** Traveller
**Needs:** Traveller A signed in, having claimed at least one tag (from any
claim flow above)

1. Signed in as Traveller A, open the Tags tab.
   EXPECT every tag this traveller has claimed, across every store, listed
   together.
2. Claim another tag (any claim flow above), then return to this tab
   without a manual refresh action.
   EXPECT the newly claimed tag already present — this list refreshes
   automatically after a claim.

**Negative cases**
- Open this tab on an account that has claimed nothing yet.
  EXPECT an empty-state message, not an error.

### TF-A29 — List the tenant's tags

**App:** mobile app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M signed in, having created or assigned at least one tag

1. Signed in as Staff M, open the Tags tab.
   EXPECT every tag belonging to the tester's own store listed, not other
   stores' tags.
2. Create or assign a tag (any flow above), then return to this tab.
   EXPECT the change already reflected without a manual refresh.

**Negative cases**
- Compare the same tab as Staff R (Refund Point).
  EXPECT Staff R's list to be scoped to their own activity the same way,
  not merged with any merchant's list by default.

### TF-A30 — Open the detail of a tag the caller owns

**App:** mobile app · **Role:** Traveller
**Needs:** Traveller A signed in, with at least one claimed tag from
`TF-A28`

1. From the Tags tab, tap a claimed tag's row.
   EXPECT that tag's own detail view, matching what the list row showed.

**Negative cases**
- Attempt to reach a tag's detail by number for a tag this traveller has
  not claimed (if a route to try one exists).
  EXPECT the same not-found treatment as a genuinely missing tag number —
  this read must not double as a way to probe whether some other tag
  number exists.

### TF-A31 — Open the tenant detail of a tag by id

**App:** mobile app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M signed in; a tag reached via `TF-A06`'s "view details"
action, or a row in `TF-A29`'s list

1. From either the scanned tag preview's "view details" action or a Tags
   tab row, open a tag's detail.
   EXPECT the tenant-scoped detail view: full status, traveller (if any),
   invoice and totals — richer than the anonymous preview `TF-A06` shows.

**Negative cases**
- Reach this same detail for a tag belonging to a different tenant, if a
  route to attempt it exists.
  EXPECT it is not obtainable this way at all — this chapter of the guide
  does not establish a specific refusal message for a cross-tenant attempt,
  so record what actually happens rather than assuming a message.

### TF-A32 — Assign a traveller to a draft tag from the tag detail

**App:** mobile app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M signed in; a Draft tag open on its tenant detail view
(`TF-A31`); Traveller A's document number

1. On a Draft tag's tenant detail, open the assign-a-traveller action.
   EXPECT the same traveller-search picker `TF-A10`/`TF-A11` use.
2. Search for and select Traveller A.
   EXPECT a success message and the detail view now shows Traveller A
   attached.

**Negative cases**
- Attempt this same action on a tag that is already Issued.
  EXPECT the assign action is not offered at all on an already-assigned
  tag.

### TF-A33 — Scan a QR from the authenticated app

**App:** mobile app · **Role:** Traveller, Merchant staff, Refund Point staff
**Needs:** Any signed-in account; Sticker O and a validate QR to try in
turn

1. Signed in as any role, tap the scan action from the app's main
   navigation (not the pre-login role picker or sign-in screen).
   EXPECT the camera opens, and a scan routes to the same destinations the
   pre-login entry points reach (`TF-A01`/`TF-A02`) for the signed-in
   role — a sticker scan as Staff M reaches the sticker screen (`TF-A12`),
   the same scan as a traveller reaches the read-only preview (`TF-A08`).

**Negative cases**
- Scan a validate QR while signed in as staff.
  EXPECT the staff refusal from `TF-A26`, not the traveller validate flow —
  this entry point shares the same routing rules as every other scan
  button, not a relaxed set of its own.

### TF-A34 — Classify a raw scan as tag, sticker, validate or unknown

**App:** mobile app · **Role:** Anyone
**Needs:** Sticker O; a tag QR; a validate QR; any QR that is not a
Unirefund code at all

This id has no screen of its own — it is the first step every scan and
every manual-entry submission runs through. It is tested by observing that
four different kinds of code each reach the destination their kind implies.

1. Scan a tag QR.
   EXPECT the tag preview destination (`TF-A06`), never the sticker or
   validate screen.
2. Scan a sticker QR.
   EXPECT the sticker destination appropriate to the active role
   (`TF-A08`/`TF-A12`).
3. Scan a validate QR.
   EXPECT the validate destination or staff refusal (`TF-A22`/`TF-A26`).
4. Scan an unrelated QR.
   EXPECT the "not recognized" refusal from `TF-A01`'s negative case, not a
   silent no-op and not a crash.

**Negative cases**
- Scan a code that decodes to a value carrying only a traveller document
  number and nothing else openable.
  EXPECT the same "not recognized" outcome as step 4 — a value identifying
  nothing openable is not treated as any of the three known kinds.

### TF-A35 — Turn a classification plus the active role into a destination

**App:** mobile app · **Role:** Anyone
**Needs:** Sticker O; a validate QR; a signed-in staff account and a
signed-in traveller account to compare

1. Scan Sticker O as a traveller (or logged out).
   EXPECT the read-only tag preview (`TF-A08`).
2. Scan the identical Sticker O as Staff M.
   EXPECT the sticker create/assign screen (`TF-A12`) instead — the same
   code, a different destination, because the active role changed.
3. Scan a validate QR as a traveller, then as Staff M.
   EXPECT the validate flow for the traveller and the staff refusal for
   Staff M — again the same code, opposite outcomes by role.

**Negative cases**
- Scan a tag QR as both a traveller and as staff.
  EXPECT both reach the same tag-preview destination — a full tag QR is
  the one case that does **not** branch by role, so both a traveller and
  staff land on the identical read-only preview at this first step.

### TF-A36 — Own the scanner's visibility and hand a read to the routing

**App:** mobile app · **Role:** Anyone
**Needs:** Any account; Sticker O

1. From any of the three entry points (`TF-A01`, `TF-A02`, `TF-A33`), tap
   the scan action.
   EXPECT the camera view opens.
2. Scan Sticker O.
   EXPECT the camera view closes and the destination screen opens in its
   place — the scanner does not stay open behind the result.
3. Open the scanner again and back out of it without scanning anything.
   EXPECT the camera view closes cleanly, returning to whatever screen
   opened it.

**Negative cases**
- Open the scanner, then background the app before scanning anything, and
  return to it.
  EXPECT the scanner is still usable (or cleanly reopenable) rather than
  stuck in a broken state.

### TF-A37 — Perform a scan destination: navigate, refuse, or resolve first

**App:** mobile app · **Role:** Merchant staff, Refund Point staff (for the
resolve-first case); Anyone (for navigate and refuse)
**Needs:** Sticker O; a validate QR; Staff M signed in; pos-app's test
barcode screen printing a bare tag number as a 1D barcode

This id is the step that actually acts on a destination once decided — it is
exercised by three different outcomes of the same underlying mechanism.

1. Scan Sticker O as a traveller.
   EXPECT a plain navigation to the read-only preview — the "navigate"
   outcome.
2. Scan a validate QR as Staff M.
   EXPECT the "refuse" outcome from `TF-A26`, with no navigation.
3. As Staff M, scan the bare 1D tag-number barcode.
   EXPECT the "resolve first" outcome: the app looks the number up before
   navigating, landing on the tag preview only once the lookup succeeds —
   distinguishable from step 1 by a brief loading state before the preview
   appears.

**Negative cases**
- Repeat step 3 with a tag number that does not exist.
  EXPECT a "tag not found" message and no navigation at all — the resolve
  step must fail closed, not open a blank preview.

### TF-A38 — Complete a claim deferred through login, once authenticated

**App:** mobile app · **Role:** Traveller, logged out then authenticated
**Needs:** Traveller A's login credentials, signed out to start; a Draft
tag scannable by QR, with its sale amount noted

1. Signed out, scan the Draft tag's QR.
   EXPECT the read-only preview with a "Login to claim" action (not a
   plain Claim button, since no session exists).
2. Tap "Login to claim" and sign in as Traveller A.
   EXPECT the claim completes automatically once signed in, with no second
   button press and no second scan — the app resumes the intent it stashed
   before sending the tester to sign in.
3. Confirm the result.
   EXPECT the newly claimed tag present in Traveller A's own tag list
   (`TF-A28`) without any further action.

**Negative cases**
- Sign in as a **different** traveller account than the one that started
  the deferred claim.
  EXPECT the claim resumes and posts under whichever account completes the
  sign-in — record which traveller ends up holding the tag, since the
  resumed intent is not itself re-checked against who signed in.

## Operations web app flows

These 38 flows (`A39`–`A76`) run on the operations web app — the
browser-based back office Merchant, Refund Point and Customs staff sign
into. There is no role picker here: every route requires sign-in first, and
which staff role a session has decides what it can do.

### TF-A39 — Open the camera and scan a code on the sticker page

**App:** operations web app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M signed in; Sticker O

1. Signed in as Staff M, open the Scan Sticker page while it is idle (no
   scan in progress).
   EXPECT a "scan with camera" action available.
2. Tap it and point a webcam at Sticker O.
   EXPECT the same sticker result `TF-A43` describes.

**Negative cases**
- Open the camera, then close it again without scanning anything.
  EXPECT the page returns to its idle state cleanly, ready for either the
  camera or the wedge scanner (`TF-A40`).

### TF-A40 — Read a sticker line number or tag code from a wedge scanner

**App:** operations web app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M signed in; a handheld barcode scanner connected to the
computer (acting as a keyboard); Sticker O printed, or pos-app's test
barcode screen showing the same code

1. Signed in as Staff M, with the Scan Sticker page idle and the camera
   closed, and no text field focused, scan Sticker O with the handheld
   scanner.
   EXPECT the same sticker result `TF-A43` describes, reached without ever
   opening the on-page camera.

**Negative cases**
- Trigger the same handheld scanner while a text field on the page has
  focus, or while the camera is open.
  EXPECT the keystrokes land in the focused field (or are ignored while the
  camera is open) rather than being read as a second scan.
- Type the same characters slowly by hand, one key at a time, rather than
  in one burst.
  EXPECT this is **not** read as a wedge scan — the page only treats a
  fast, uninterrupted keystroke burst ending in Enter as a scan, so slow
  manual typing must not accidentally trigger a lookup mid-keystroke.

### TF-A41 — Classify a scan as sticker, tag, validate or nothing

**App:** operations web app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M signed in; Sticker O; a tag QR; a validate QR; an
unrelated QR

This id has no screen of its own — every camera read and every wedge burst
runs through it first. It is tested the same way as its mobile counterpart
(`TF-A34`), through the destinations each kind of code reaches.

1. Scan Sticker O.
   EXPECT the sticker result (`TF-A43`).
2. Scan a tag QR.
   EXPECT the tag detail opens directly (`TF-A58`) — this app has no
   read-only preview step of its own.
3. Scan a validate QR.
   EXPECT the staff refusal (`TF-A42`).
4. Scan an unrelated QR.
   EXPECT a "not recognized" outcome, with the page staying idle.

**Negative cases**
- Trigger the wedge path (`TF-A40`) with a value that decodes to nothing at
  all — a plain unstructured string.
  EXPECT it is read as a sticker line number (the wedge-specific fallback),
  distinct from a camera read of the identical unreadable value, which is
  read as "not recognized" instead.

### TF-A42 — Refuse a traveller validate QR scanned by staff

**App:** operations web app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M (or Staff R) signed in; a validate QR

1. Signed in as staff, scan a validate QR on the Scan Sticker page (camera
   or wedge).
   EXPECT a specific message naming this as a validation code staff cannot
   use here — not "sticker not found" and not a generic failure.

**Negative cases**
- Confirm the check happens before any sticker lookup is attempted at all
  (for example, by observing no loading state for a sticker read appears
  before the refusal shows).
  EXPECT the refusal is immediate, not a delayed one following a failed
  sticker-line lookup.

### TF-A43 — Resolve a scanned sticker line

**App:** operations web app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M signed in; Sticker O; Sticker U

1. Signed in as Staff M, scan Sticker O.
   EXPECT the page shows this line already allocated to the tester's own
   store, ready to price and create a tag.
2. Scan Sticker U.
   EXPECT the page shows this line unallocated, with no store name yet.

**Negative cases**
- Scan a sticker line number that does not exist.
  EXPECT a "line not found" message, not a blank create form.

### TF-A44 — A used sticker opens its tag instead of the create form

**App:** operations web app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M signed in; a sticker whose book already has a tag issued
against it

1. Signed in as Staff M, scan a sticker that already carries a tag.
   EXPECT the app opens that tag's detail page directly, skipping the
   create form entirely.

**Negative cases**
- Compare against scanning the same sticker's own tag QR directly (once it
  exists) instead of the sticker.
  EXPECT the identical tag detail page — the two paths converge on the
  same destination.

### TF-A45 — Resolve a tag id from a scanned tag number

**App:** operations web app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M signed in; a tag QR or wedge-scanned code carrying only a
tag number, no tag id (or pos-app's test barcode screen printing Tag D's
number as a 1D code)

1. Signed in as Staff M, scan a code carrying only Tag D's tag number.
   EXPECT the app resolves the number to the underlying tag and opens its
   detail page (`TF-A58`), with no extra step visible to the tester.

**Negative cases**
- Scan a tag number that does not exist.
  EXPECT a "tag not found" message, not a generic failure and not a blank
  page.

### TF-A46 — Refuse to open a scanned tag without the tag-view grant

**App:** operations web app · **Role:** Merchant staff, Refund Point staff
**Needs:** An operator account that cannot view tag details; a tag QR

1. Signed in as an operator lacking the grant to view a tag's detail, scan
   any tag QR.
   EXPECT a specific "not granted" refusal and no navigation to the tag
   detail page at all — not a page that opens and then fails to load.

**Negative cases**
- Compare the same scan as Staff M, who does hold the grant.
  EXPECT the tag detail opens normally (`TF-A58`) — confirming the refusal
  in step 1 is specific to the missing grant, not to the scan itself.

### TF-A47 — Refuse a sticker book allocated to another merchant

**App:** operations web app · **Role:** Merchant staff
**Needs:** Staff M signed in; Sticker F

1. Signed in as Staff M, scan Sticker F.
   EXPECT a terminal, read-only "allocated to another store" notice, with
   no create form offered.

**Negative cases**
- Compare the same scan as Staff R (Refund Point).
  EXPECT no refusal at all — the same sticker previews normally for a
  Refund Point (`TF-A48`), which is not excluded from any store's book.

### TF-A48 — Resolve the merchant a scanned sticker book is booked to

**App:** operations web app · **Role:** Refund Point staff
**Needs:** Staff R signed in; Sticker O

1. Signed in as Staff R, scan Sticker O.
   EXPECT the page previews the store it is allocated to — name, VAT
   number and active product groups — with no picker offered.

**Negative cases**
- Scan a sticker line that does not exist.
  EXPECT a "line not found" message rather than an empty merchant preview.

### TF-A49 — Load own product groups to price a scanned sticker tag

**App:** operations web app · **Role:** Merchant staff
**Needs:** Staff M signed in; Sticker O

1. Signed in as Staff M, scan Sticker O.
   EXPECT the store's own product groups load, each with its VAT rate,
   ready to price a line item.

**Negative cases**
- Force this read to fail (for example, a network interruption) while the
  sticker-line read itself still succeeds.
  EXPECT the page still shows the store's name and VAT number from the
  sticker line itself, rather than a dead end.

### TF-A50 — Load own merchant identity for the sticker create call

**App:** operations web app · **Role:** Merchant staff
**Needs:** Staff M signed in; Sticker O

1. Signed in as Staff M, scan Sticker O.
   EXPECT the store's own VAT number and business name shown, sourced from
   the store's own record.

**Negative cases**
- Force this read to fail while the sticker-line read still succeeds.
  EXPECT the page falls back to the name and VAT number already on the
  sticker line rather than blocking the whole page.

### TF-A51 — Pick a merchant for an unallocated sticker book

**App:** operations web app · **Role:** Refund Point staff
**Needs:** Staff R signed in; Sticker U

1. Signed in as Staff R, scan Sticker U.
   EXPECT the page shows the line unallocated and offers a merchant picker.
2. Type a store name into the picker.
   EXPECT matching active stores listed, selectable.

**Negative cases**
- Search for a store that does not exist or is not active.
  EXPECT an empty result list, not an error.
- Reach this same page as an account lacking the grant to search for a
  merchant.
  EXPECT a blocked state explaining a merchant cannot be picked, rather
  than a picker that opens but returns nothing.

### TF-A52 — Preview the picked merchant on the unallocated sticker line

**App:** operations web app · **Role:** Refund Point staff
**Needs:** Staff R mid-way through `TF-A51`

1. Choose a store from the picker.
   EXPECT the page previews that store's name, VAT number and product
   groups — a preview only; nothing is allocated by choosing or previewing
   alone.
2. Choose a **different** store from the picker before submitting a
   create.
   EXPECT the previously priced line items are discarded (since they were
   priced against the first store's VAT rates), and the picked-invoice
   number's fate should be checked explicitly — record whether it survives
   the re-pick or is cleared with it, since this is a documented difference
   from the mobile app's equivalent screen.

**Negative cases**
- Pick a store, then submit the create without ever changing the pick
  again.
  EXPECT no re-pick warning of any kind — the discard behaviour in step 2
  is specific to **changing** an already-made pick, not to making one.

### TF-A53 — Attach a traveller to a scanned sticker tag by document search

**App:** operations web app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M mid-way through pricing a sticker tag (`TF-A43`);
Traveller A's document number

1. Open the "add traveller" dialog on the in-progress sticker sale.
   EXPECT a document-number search field.
2. Search for Traveller A's document number and select the match.
   EXPECT the traveller attached to the in-progress sale, ready to be
   included when the tag is created.

**Negative cases**
- Search for a document number with no matching traveller.
  EXPECT an empty result, not an error, and the dialog stays open.

### TF-A54 — Capture the merchant and traveller signatures on a scanned sticker tag

**App:** operations web app · **Role:** Merchant staff, Refund Point staff
**Needs:** Staff M mid-way through pricing Sticker O; Staff R mid-way
through pricing Sticker U, having picked a merchant

1. As Staff M, open the signature capture on the scan result.
   EXPECT both a traveller signature pad and a merchant signature pad
   available, regardless of whether a traveller is attached yet.
2. Sign both, attach a traveller, and create the tag.
   EXPECT both signatures present on the created (Issued) tag.
3. As Staff R, on Sticker U, having picked a merchant, open the signature
   capture on the scan result — **without submitting the create yet**.
   EXPECT only the traveller pad is offered — no merchant pad for a Refund
   Point.
4. Sign the traveller pad and submit the create.
   **The result of this step is not established by this guide — see the
   note below before running it.**

**Note.** Sticker U is still unallocated at the point it was picked in
step 3, so completing the create in step 4 is the same disputed action
`TF-A56` describes — see `endpoints.md`'s "Sticker allocation: an
unresolved contradiction". Do not treat either outcome in step 4 as
confirmation of which reading is correct, and do not run that step against
a book anyone still needs unallocated.

**Negative cases**
- As Staff M, attach a traveller, sign the traveller pad, then remove the
  traveller before creating as a Draft tag.
  EXPECT the signature is **not** carried onto the created tag on this
  app — the traveller-signature control is tied to the currently attached
  traveller and is cleared when that traveller changes or is removed,
  unlike the mobile app's equivalent screen.

### TF-A55 — Create a tag against a scanned sticker as the merchant

**App:** operations web app · **Role:** Merchant staff
**Needs:** Staff M signed in; Sticker O; Traveller A's document number
(optional); an invoice amount

1. Signed in as Staff M, scan Sticker O and price a line.
   EXPECT the store's own product groups available to price against.
2. Submit the create with no traveller attached.
   EXPECT a new Draft tag, bound to the sticker.
3. Repeat with Traveller A attached first.
   EXPECT a new Issued tag, carrying Traveller A, in one submission.

**Note.** Attempting this same create against an unallocated sticker
(Sticker U) is not established by this guide — see the note on `TF-A19`
and `endpoints.md`'s "Sticker allocation: an unresolved contradiction".

**Negative cases**
- Attempt the create with no product group priced.
  EXPECT the submit action is withheld or refused, not a tag created empty.

### TF-A56 — Create a tag against a scanned sticker on a merchant's behalf

**App:** operations web app · **Role:** Refund Point staff
**Needs:** Staff R signed in; Sticker U; a merchant picked via `TF-A51`; an
invoice amount

1. Signed in as Staff R, scan Sticker U, pick a merchant, and price a line.
   EXPECT the picked store's product groups available.
2. Submit the create with no traveller attached.
   **The result of this step is not established by this guide — see the
   note below before running it.**
3. Separately, repeat against Sticker O (already allocated).
   EXPECT a normal, unambiguous create.

**Note.** Step 2 is the same disputed action `TF-A20` describes for the
mobile app: the underlying SDK's own documentation disagrees about whether
creating against a still-unallocated line is rejected outright or
permanently allocates the whole sticker book to the picked store — see
`endpoints.md`'s "Sticker allocation: an unresolved contradiction". Do not
run step 2 against a book anyone still needs unallocated, and do not treat
either outcome as settling the question.

**Negative cases**
- Attempt this same create signed in as Staff M (a merchant).
  EXPECT this option is not available to a merchant account — a merchant
  creates through `TF-A55`'s path only.

### TF-A57 — List the tenant's tags a scan-created tag lands in

**App:** operations web app · **Role:** Merchant staff, Refund Point staff,
Customs staff
**Needs:** Staff M signed in, having just created or assigned a tag

1. Signed in as Staff M, complete a create (`TF-A55`) or assign (`TF-A59`).
   EXPECT the page redirects to the Tax-Free Tags list, showing the
   just-created or just-assigned tag already present.
2. Open the Tax-Free Tags list directly, without just having created
   anything.
   EXPECT the tenant's tags listed, scoped to the tester's own store.

**Negative cases**
- Compare the same list as Staff C (Customs).
  EXPECT Customs sees a wider, differently filtered view of the same
  underlying list (see `TF-A72`'s note on the customs-specific status
  filter) rather than an identical merchant view.

### TF-A58 — Open the tag a scanned QR resolved to

**App:** operations web app · **Role:** Merchant staff, Refund Point staff,
Customs staff
**Needs:** Staff M signed in; a tag QR, or a row in the Tax-Free Tags list

1. Scan a tag QR, or click a row in the Tax-Free Tags list.
   EXPECT the tag's tenant detail page: status, traveller (if any), invoice
   and totals.

**Negative cases**
- Attempt this same open on an account lacking the tag-view grant.
  EXPECT the refusal from `TF-A46`, with no navigation to this page at
  all.

### TF-A59 — Assign a traveller to a draft tag from the tag detail

**App:** operations web app · **Role:** Merchant staff, Refund Point staff,
Customs staff
**Needs:** Staff M signed in; a Draft tag open on its detail page; Traveller
A's document number

1. On a Draft tag's detail page, open the assign-a-traveller popover.
   EXPECT a traveller-search field.
2. Search for and select Traveller A.
   EXPECT a success message, with Traveller A now shown attached on the
   detail page.

**Negative cases**
- Attempt this same action on a tag that is already Issued.
  EXPECT the assign action is not offered on an already-assigned tag.
- Reach the same popover as Staff C (Customs), on an account that lacks the
  traveller-search grant this popover separately checks for.
  EXPECT the search field inside the popover is withheld, falling back to
  a plain typed-entry form instead of a crash — record whether this
  matches what the account can actually search for elsewhere, since this
  is a documented mismatch worth confirming rather than assuming fixed.

### TF-A60 — Render the tag's own QR onto the printable tax-free form

**App:** operations web app · **Role:** Merchant staff, Refund Point staff,
Customs staff
**Needs:** Staff M signed in; any tag open on its detail page

1. On a tag's detail page, open the print preview.
   EXPECT the printable tax-free form renders with a QR code on it,
   scannable back into a tag lookup (`TF-A77`/`TF-A79`/`TF-A80`).

**Negative cases**
- Scan the rendered QR and compare its result against scanning the
  sticker's own printed QR for the same tag, if both exist.
  EXPECT both resolve to the same tag — record explicitly if they do not,
  since this guide does not establish that the two are guaranteed to
  agree.

### TF-A61 — Print the tag through the report service

**App:** operations web app · **Role:** Merchant staff, Refund Point staff,
Customs staff
**Needs:** Staff M signed in; any tag open on its detail page

1. On a tag's detail page, use the Print Tag action.
   EXPECT a rendered document produced and offered for printing or
   download.

**Negative cases**
- Attempt this action as a traveller account (if the detail page were
  reachable at all, which it is not for a traveller).
  EXPECT this confirms there is no traveller-facing equivalent of this
  action anywhere in either app — a traveller's printable artefact is the
  tag's own QR, not a report.

### TF-A62 — Create a tag from the new-tag form, with no sticker scanned

**App:** operations web app · **Role:** Merchant staff
**Needs:** Staff M signed in; no sticker required; an invoice amount and
product group; Traveller A's document number (optional)

1. Signed in as Staff M, open the New Tag page directly, without scanning
   anything.
   EXPECT a create form with no sticker attached.
2. Price a line and submit with no traveller.
   EXPECT a new Draft tag, with no sticker line bound.
3. Repeat with Traveller A attached first.
   EXPECT a new Issued tag in one submission.

**Negative cases**
- Attempt this same page as Staff R (Refund Point).
  EXPECT this entry point is not available to a Refund Point account.

### TF-A63 — Open the bulk scan-and-assign sheet

**App:** operations web app · **Role:** Customs staff
**Needs:** Staff C signed in

1. Signed in as Staff C, open the Tax-Free Tags list and use its "Assign
   draft tags" action.
   EXPECT a sheet opens with a Scan tab and a Traveller tab.
2. Separately, open the Tags workspace, select a traveller, and use the
   "Assign draft" action on that traveller's card.
   EXPECT the identical sheet opens, this time pre-filled with the
   selected traveller on its Traveller tab.

**Negative cases**
- Attempt to open this sheet as Staff M or Staff R.
  EXPECT this action is not available at all outside a Customs session —
  it is Customs-only, on both entry points.

### TF-A64 — Scan draft tag QRs into the bulk basket with the camera

**App:** operations web app · **Role:** Customs staff
**Needs:** Staff C signed in, with the bulk sheet open (`TF-A63`); two or
more Draft, unassigned tags as QR codes

1. On the sheet's Scan tab, open the camera and scan a Draft tag's QR.
   EXPECT it is added to the basket list and the camera stays open, ready
   for the next scan.
2. Scan a second Draft tag.
   EXPECT it joins the first in the basket, both listed.

**Negative cases**
- Scan the same Draft tag a second time.
  EXPECT it is recognized as already added rather than duplicated in the
  basket, and without a repeated network lookup.

### TF-A65 — Read a draft tag code into the bulk basket from a wedge scanner

**App:** operations web app · **Role:** Customs staff
**Needs:** Staff C signed in, with the bulk sheet open; a handheld barcode
scanner; a Draft tag's code

1. With no field focused inside the sheet, scan a Draft tag's code with the
   handheld scanner.
   EXPECT it is added to the basket exactly as a camera scan would be.

**Negative cases**
- Trigger the same scanner while a text field inside the sheet has focus.
  EXPECT the keystrokes land in that field rather than being read as a
  scan.

### TF-A66 — Type a tag number into the bulk basket

**App:** operations web app · **Role:** Customs staff
**Needs:** Staff C signed in, with the bulk sheet open; a Draft tag's
number

1. On the sheet's Scan tab, type a Draft tag's number into the manual field
   and use the Add action.
   EXPECT it is added to the basket exactly as a scan would add it.

**Negative cases**
- Type a tag number that does not exist.
  EXPECT the same rejection `TF-A68` describes for a not-found lookup, not
  a silent no-op.

### TF-A67 — Look up each scanned tag before it enters the bulk basket

**App:** operations web app · **Role:** Customs staff
**Needs:** Staff C signed in, with the bulk sheet open; a Draft tag's
number or QR

1. Add a Draft tag by any of the three methods (`TF-A64`/`TF-A65`/`TF-A66`).
   EXPECT the tag is looked up before it appears in the basket — its number
   alone is not enough to add it; the lookup must succeed.

**Negative cases**
- Add a tag number, then immediately add the same number again.
  EXPECT the second add reuses the first lookup's result rather than
  making a second network call — record whether a brief delay is visible
  on the first add but not the second, which is how this is observable.

### TF-A68 — Refuse a scanned tag that is not an unassigned draft

**App:** operations web app · **Role:** Customs staff
**Needs:** Staff C signed in, with the bulk sheet open; an Issued tag's
code; a tag number that does not exist

1. Attempt to add an already-Issued tag (one that already carries a
   traveller) to the basket.
   EXPECT it is rejected with a message identifying it as already assigned,
   not added silently and not a generic failure.
2. Attempt to add a tag number that does not exist.
   EXPECT a distinct not-found rejection.
3. Attempt to add a tag whose status is not Draft at all (any non-Draft,
   unassigned state, if one is available to test with).
   EXPECT the same family of rejection as step 1 — not-Draft is refused
   regardless of the specific reason.

**Negative cases**
- After any of the above rejections, confirm the camera (if open) stays
  open rather than closing.
  EXPECT the officer can immediately retry without reopening the scanner —
  only a **successful** add closes the camera.

### TF-A69 — Resolve the traveller the bulk basket will be assigned to

**App:** operations web app · **Role:** Customs staff
**Needs:** Staff C signed in, with the bulk sheet open; Traveller A's
document number

1. On the sheet's Traveller tab, search for Traveller A by document number.
   EXPECT a matching result, selectable.
2. Open the sheet from the Tags workspace with a traveller already selected
   there (see `TF-A63`'s second entry point).
   EXPECT the Traveller tab is pre-filled with that same traveller
   automatically, with no second search needed.

**Negative cases**
- From the pre-filled state in step 2, use the "change traveller" action
  and search for someone else.
  EXPECT the pre-fill does not fight the new search — the field accepts
  the change and does not keep re-selecting the original traveller.

### TF-A70 — Assign every tag in the bulk basket to that traveller

**App:** operations web app · **Role:** Customs staff
**Needs:** Staff C signed in, with the bulk sheet open, holding at least
two Draft tags in the basket and Traveller A selected

1. With two or more Draft tags in the basket and Traveller A selected, use
   the Assign action.
   EXPECT each tag assigned one at a time (visibly sequential, not one
   combined request), with a summary count of successes at the end.
2. Confirm the destination after assigning: exactly one tag was assigned
   during this flow (repeat with just one tag in the basket for a clean
   check).
   EXPECT the app navigates to that one tag's own detail page.
3. Repeat with more than one tag assigned in the same batch.
   EXPECT the app instead returns to the Tax-Free Tags list rather than any
   single tag's detail.

**Negative cases**
- Include a tag in the basket that becomes ineligible between being added
  and the batch running (for example, assigned by someone else in the
  interim, if reproducible).
  EXPECT that one tag's assignment fails with its own reported error while
  the rest of the batch continues — one failure must not abort the whole
  batch.

### TF-A71 — Resolve a traveller from a scanned passport at the customs desk

**App:** operations web app · **Role:** Customs staff
**Needs:** Staff C signed in; Traveller A's passport or document, and its
document number typed as a fallback

1. Signed in as Staff C, open the Tags workspace and use the traveller
   search bar's scan mode to scan Traveller A's passport.
   EXPECT the document number is read from the scan and the matching
   traveller resolved automatically.
2. Repeat by typing the document number instead.
   EXPECT the identical resolved traveller.

**Negative cases**
- Scan or type a document number with no matching traveller.
  EXPECT an empty result, not an error, and the search bar stays usable
  for another attempt.

### TF-A72 — Load the tags of the traveller under customs review

**App:** operations web app · **Role:** Customs staff
**Needs:** Staff C signed in, with a traveller selected (`TF-A71`)

1. Select Traveller A at the customs desk.
   EXPECT that traveller's tags load, filtered to the lifecycle states a
   border review cares about (not every status a tenant might use).
2. Complete a bulk assign (`TF-A70`) for this traveller from this same
   page.
   EXPECT the list refreshes automatically to include the newly assigned
   tag, with no manual reload.

**Negative cases**
- Select a traveller with no tags in the reviewable states.
  EXPECT an empty-state message, not an error.

### TF-A73 — Require a registered kiosk device before a validate QR is shown

**App:** operations web app · **Role:** Customs staff
**Needs:** Staff C signed in, at a customs office with **exactly one**
registered kiosk device; separately, an office with **zero** and an office
with **two or more**, if available

1. Signed in as Staff C (exactly one kiosk device registered), open the
   kiosk page.
   EXPECT it proceeds straight to generating a validate QR (`TF-A74`), with
   no registration prompt.
2. Repeat as a customs account at an office with **zero** kiosk devices
   registered.
   EXPECT a friendly device-registration prompt instead of a QR, offering
   to register one.

**Negative cases**
- Repeat as a customs account at an office with **two or more** kiosk
  devices registered.
  EXPECT this is **not** caught by a friendly prompt the way zero devices
  is — the page proceeds past the "is a kiosk registered" check (which
  only asks whether the count is above zero) and only then fails with a
  generic error from the QR-generation step itself, since that step
  separately requires exactly one device. Record this outcome precisely;
  it is a known rough edge, not a guess.

### TF-A74 — Generate the rolling customs validate QR

**App:** operations web app · **Role:** Customs staff
**Needs:** Staff C signed in, at an office with exactly one kiosk device

1. Open the kiosk page.
   EXPECT a validate QR renders, ready for a traveller to scan
   (`TF-A22`/`TF-A90`).

**Negative cases**
- Open the kiosk page while signed out, or with a session that is not a
  customs session at all.
  EXPECT the page is not reachable at all — it requires sign-in like every
  other page in this app, despite sitting in a differently named part of
  the site.

### TF-A75 — Roll the displayed validate QR every thirty seconds

**App:** operations web app · **Role:** Customs staff
**Needs:** Staff C signed in, at an office with exactly one kiosk device,
with the kiosk page open and a stopwatch or visible countdown

1. Leave the kiosk page open and idle until the displayed QR's countdown
   reaches zero.
   EXPECT a new validate QR replaces the old one automatically, with no
   action from the tester.
2. Switch away from the kiosk browser tab until the QR would have expired,
   then switch back to it.
   EXPECT the QR refreshes immediately on returning to the tab, rather
   than waiting for the next tick.

**Negative cases**
- Attempt to scan the just-expired QR in the brief window before it
  refreshes.
  EXPECT the traveller-side rescan path handles this (`TF-A24`/`TF-A92`)
  rather than the kiosk silently accepting a stale code.

### TF-A76 — Scan tags into a refund — disabled

**App:** operations web app · **Role:** Refund Point staff
**Needs:** Staff R signed in, on the Refund page

1. Signed in as Staff R, open the Refund page and look for a way to scan a
   tag directly into the refund selection.
   EXPECT **no such control exists** — this capability is intentionally
   disabled, not merely hard to find. Only manual select-all / select-row
   controls are present.

**Negative cases**
- This action has no positive path to test, by design — there is nothing
  further to attempt here. Record only whether the control remains absent,
  since its reappearance would itself be a regression worth reporting.

## Traveller web site flows

These 26 flows (`A77`–`A102`) run on the public traveller web site — the one
`super-app` and `pos-app` do not cover. A tag QR and a sticker QR here are not
scanned in-app: the traveller's own phone camera opens them as an ordinary
web link, and the site resolves what was scanned server-side before the page
even paints. Only the boarding-pass scan, the expired-QR rescan and the
claim modal's own scan tab use an in-page camera on this site.

### TF-A77 — Look up a tag by typed tag number and passport number

**App:** traveller web site · **Role:** Traveller, including logged out
**Needs:** Tag I's tag number; the document number of the traveller on Tag I

1. Without signing in, open the tag lookup page and enter Tag I's tag
   number and the matching passport/document number.
   EXPECT the same public tag page a scanned tag QR would open
   (`TF-A79`).

**Negative cases**
- Submit with the passport/document field empty.
  EXPECT an inline validation message, no submission.
- Submit a tag number and document number that do not belong to the same
  tag.
  EXPECT a not-found result.

### TF-A78 — Read the tag issued on a scanned sticker line

**App:** traveller web site · **Role:** Traveller, including logged out
**Needs:** A sticker QR whose book already has a tag issued on it

1. Without signing in, scan the sticker QR with a phone camera (opening it
   as an ordinary link).
   EXPECT the site opens directly to the tag issued on that sticker,
   read-only.

**Negative cases**
- Scan a sticker QR for a line with no tag issued on it yet.
  EXPECT a generic lookup-failed message on this site — unlike the mobile
  app, this site has no dedicated "no tag on this sticker yet" wording; the
  same generic failure screen every other lookup failure on this site uses
  is what a tester should expect here, not the mobile-specific copy.

### TF-A79 — Read a tag's public detail by tag number and traveller document

**App:** traveller web site · **Role:** Traveller, including logged out
**Needs:** A tag QR carrying Tag I's number and its traveller's document
number

1. Without signing in, scan the tag QR (or arrive via `TF-A77`'s typed
   lookup).
   EXPECT the public tag page: tag number, status, and (since it is
   already issued) no claim offered.

**Negative cases**
- Alter the document number in the URL before loading it, so it no longer
  matches the tag's traveller.
  EXPECT a not-found result rather than a mismatched tag's detail.

### TF-A80 — Read an unclaimed draft tag's public detail by tag id

**App:** traveller web site · **Role:** Traveller, including logged out
**Needs:** Tag D's tag QR (Draft, no traveller yet)

1. Without signing in, scan Tag D's tag QR.
   EXPECT the public tag page showing it as unclaimed, with a claim offer
   (see `TF-A81`) — reached because this QR carries no document number at
   all, being Draft.

**Negative cases**
- Alter the tag id in the URL to one that does not exist.
  EXPECT a not-found result, not a crash or a blank page.

### TF-A81 — Offer the claim only while the tag has no traveller

**App:** traveller web site · **Role:** Traveller, including logged out
**Needs:** Tag D (Draft); Tag I (Issued)

1. Open Tag D's public page (`TF-A80`).
   EXPECT a claim offer shown.
2. Open Tag I's public page (`TF-A79`).
   EXPECT no claim offer — Tag I already has a traveller.

**Negative cases**
- Claim Tag D (`TF-A82`), then reload its public page.
  EXPECT the claim offer is gone now that a traveller is attached — this
  page's claim gate checks only whether a traveller is present, not the
  tag's separate status field, so confirm the offer disappears once either
  changes.

### TF-A82 — Claim an unclaimed draft tag from the scanned tag page

**App:** traveller web site · **Role:** Traveller, authenticated
**Needs:** Traveller A signed in; Tag D's public page open, showing the
claim offer

1. Signed in as Traveller A, open Tag D's public page.
   EXPECT a plain "Claim" button (not "log in to claim", since a session
   already exists).
2. Tap Claim.
   EXPECT a success result, and the tag now appears in Traveller A's own
   tag list (`TF-A97`).

**Negative cases**
- Attempt the same claim on Tag I (already Issued) by altering the URL to
  its id.
  EXPECT the page shows no claim button for it at all (see `TF-A81`), so
  there is no button to press — record this as the refusal rather than a
  server error, since the block happens before any request is made.

### TF-A83 — Defer the claim through login and resume on the same tag

**App:** traveller web site · **Role:** Traveller, logged out then
authenticated
**Needs:** Traveller A's login credentials, signed out to start; Tag D's
public page open

1. Signed out, open Tag D's public page.
   EXPECT a "log in to claim" link instead of a plain Claim button.
2. Tap it and sign in as Traveller A.
   EXPECT the sign-in redirects back to this exact tag's page afterward,
   which then shows the plain Claim button from `TF-A82` — the claim
   itself is **not** completed automatically here; a second tap on Claim
   is required, unlike the mobile app's equivalent (`TF-A38`).

**Negative cases**
- From the login page reached this way, use the username-and-password form
  rather than the identity-check (KYC) sign-in option.
  EXPECT this completes sign-in and the redirect back to the tag page
  without running the KYC steps (`TF-A87`/`TF-A88`) at all — confirming
  those two ids are not the only way to reach a session from here.

### TF-A84 — Refuse a validate page opened without a scanned QR value

**App:** traveller web site · **Role:** Traveller
**Needs:** None beyond a browser

1. Open the validate page directly, with no QR value in the address (not
   reached by scanning anything).
   EXPECT a clear refusal explaining a validate code must be scanned first
   — not a blank page, and not a page that silently proceeds as if a code
   had been read.

**Negative cases**
- Open the validate page with a QR value present but malformed (edited by
  hand into the address).
  EXPECT this is treated as a scan that failed to resolve, not treated the
  same as no QR value at all — record which of the two messages actually
  appears.

### TF-A85 — Probe whether the session can still scan before trusting it

**App:** traveller web site · **Role:** Traveller
**Needs:** Traveller A signed in already, then the validate page reached
with a valid QR value

1. Signed in as Traveller A (session already established from a previous
   visit), scan a validate QR.
   EXPECT the validate flow opens directly, with no re-verification prompt
   — the existing session was probed and found usable behind the scenes.
2. Force the session to become invalid in a way the traveller cannot see
   directly (for example, revoke it from an admin surface, or wait out its
   natural expiry), then repeat step 1.
   EXPECT the page does **not** trust the stale cookie: it falls back to
   the identity-check (KYC) sign-in flow (`TF-A87`/`TF-A88`) rather than
   opening the validate flow against a session that can no longer scan.

**Negative cases**
- Interrupt the network so this probe itself fails with something other
  than a plain "not authorized" (a timeout, for instance), if reproducible.
  EXPECT a distinct "temporarily unavailable" state rather than being
  forced straight into a fresh identity check on what may be a transient
  error.

### TF-A86 — Grant the device location for the validation scan

**App:** traveller web site · **Role:** Traveller
**Needs:** A browser with location permission available to grant or deny;
Traveller A

1. Reach the location prompt through the validate flow (as an already
   signed-in traveller, per `TF-A85`).
   EXPECT a location permission prompt, and granting it advances the flow.
2. Reach the same prompt ahead of identity verification (KYC), as a
   traveller with no session yet.
   EXPECT the identical control offered before KYC runs, so location can be
   granted before signing in at all.

**Negative cases**
- Deny the permission in either place.
  EXPECT a specific denied/unsupported/unavailable message distinguishing
  the reason, not one generic failure for all three.

### TF-A87 — Resolve whether the KYC-verified traveller already has an account

**App:** traveller web site · **Role:** Traveller, logged out
**Needs:** Traveller A (KYC complete, existing account); Traveller B (KYC
not complete)

1. Reach the identity-check (KYC) sign-in option, logged out, and complete
   it as Traveller A.
   EXPECT the site resolves that an account already exists for this
   verified identity, and proceeds to sign in automatically (`TF-A88`).
2. Attempt the identical path as Traveller B, whose identity check does not
   complete successfully.
   EXPECT the flow does not proceed to account resolution at all — it
   stops at the incomplete identity check, with no email or account lookup
   attempted for an unverified identity.

**Negative cases**
- Complete identity verification for a real person who has **no** existing
  account yet, if such a fixture is available.
  EXPECT this resolves as "no existing account" rather than silently
  reusing a different traveller's account — record precisely what happens
  next (this guide does not establish an account-creation path from this
  screen, so note whether one exists).

### TF-A88 — Exchange the KYC session for an access token and sign in

**App:** traveller web site · **Role:** Traveller, logged out then
authenticated
**Needs:** Traveller A, whose identity check resolves to an existing
account (`TF-A87`)

1. Following on from `TF-A87`'s successful resolution for Traveller A.
   EXPECT the site signs in automatically with no separate password step,
   and lands back on the flow that sent the traveller to KYC in the first
   place (the validate flow, or a deferred claim).

**Negative cases**
- Let the identity-check session go stale between completing verification
  and this exchange (if reproducible, e.g. by waiting past its lifetime).
  EXPECT the exchange fails cleanly with a re-verify prompt rather than
  signing in with stale or partial information.

### TF-A89 — Scan the boarding pass for the flight ticket

**App:** traveller web site · **Role:** Traveller, authenticated
**Needs:** Traveller A signed in, mid-way through the validate flow, at the
flight-ticket step; Boarding pass H

1. On the flight-ticket step, choose the scan tab and scan Boarding pass
   H's barcode with the device camera.
   EXPECT the flight fields populate and Submit becomes available.

**Negative cases**
- Scan a barcode that decodes as a boarding pass but yields no usable
  flight fields.
  EXPECT an amber "unreadable" prompt with Submit withheld — the same
  negative case `TF-A23` describes for the mobile app, tested here
  separately because the two apps' boarding-pass readers have been found to
  disagree on some inputs (see the report's Findings) even though both
  implement the same rule in the ordinary case.
- Scan a real boarding pass whose barcode carries a leading marker or
  stray whitespace before its data (if such a boarding pass is available).
  EXPECT this app's reader may be **stricter** than the mobile app's — a
  pass that scans successfully on `TF-A23` may fall through to the
  "unreadable" state here. Record the outcome precisely rather than
  assuming parity between the two apps for this input.

### TF-A90 — Run the airport self-validation scan

**App:** traveller web site · **Role:** Traveller, authenticated
**Needs:** Traveller A signed in, with at least one Draft tag already
claimed; a validate QR; Boarding pass H; location permission grantable

1. Signed in as Traveller A, scan a validate QR, grant location, and submit
   a readable boarding pass.
   EXPECT a results page sorting the traveller's claimed tags into
   categories (at minimum: cleared and rejected).

**Negative cases**
- Submit with a session that has just gone stale (a `401` on this specific
  call).
  EXPECT the page re-probes the session and routes back to identity
  verification rather than looping on a dead attempt.
- Submit while genuinely far from any airport, if the environment enforces
  a distance check.
  EXPECT a specific "too far from the airport" message rather than the raw
  server error text — this site recognizes that case with its own wording;
  the mobile app does not.

### TF-A91 — Enrich the scan result with each returned tag's detail

**App:** traveller web site · **Role:** Traveller, authenticated
**Needs:** Traveller A, having just completed `TF-A90` with at least one
tag returned in a bucket

1. Complete a validation scan that returns at least one tag in any bucket.
   EXPECT each listed tag shows real detail (store, amount) rather than
   just a bare id or number.

**Negative cases**
- Complete a scan that returns zero tags in every visible bucket.
  EXPECT a dedicated empty-result state, not a blank results page.

### TF-A92 — Rescan a validate QR that expired mid-flow

**App:** traveller web site · **Role:** Traveller, authenticated
**Needs:** Traveller A mid-way through `TF-A90`; enough elapsed time for the
kiosk's QR to roll before submitting

1. Let the validate QR expire mid-flow, then submit.
   EXPECT a dedicated "rescan" state, not the generic failure screen.
2. Open the rescan camera and scan the kiosk's current QR.
   EXPECT the flow keeps prompting for a fresh scan until the scan itself
   is accepted as valid — this modal treats the server's acceptance as the
   authority on validity, not a single client-side retry.

**Negative cases**
- Dismiss the rescan modal without completing it.
  EXPECT the flow returns to the expired state cleanly, without silently
  treating the dismissal as a completed rescan.

### TF-A93 — Scan a further tag's QR in the claim modal and read it by id

**App:** traveller web site · **Role:** Traveller, authenticated
**Needs:** Traveller A signed in; a second Draft tag as a scannable QR

1. Open the claim modal (from the validation results, `TF-A102`, or from
   the tags page, `TF-A98`) and choose its scan tab.
   EXPECT a camera opens inside the modal.
2. Scan the second Draft tag's QR.
   EXPECT the tag's detail (store, amount) shown inside the modal before
   confirming the claim — read by its id, needing no document number since
   a session already exists.

**Negative cases**
- Scan an already-Issued tag.
  EXPECT — record precisely what happens: this modal performs **no**
  client-side Draft/Issued check before offering to confirm, unlike the
  mobile app's equivalent (`TF-A25`), so the read here may show a Confirm
  option regardless of status, with the rejection only appearing after
  confirming (see `TF-A94`'s negative case). Do not assume a pre-check
  refusal at this step.

### TF-A94 — Claim a further tag from the claim modal

**App:** traveller web site · **Role:** Traveller, authenticated
**Needs:** Traveller A, having just scanned a tag in `TF-A93`

1. With the scanned tag's detail shown in the modal, tap Confirm.
   EXPECT a success result and the modal closes.

**Negative cases**
- Repeat with an already-Issued tag scanned in via `TF-A93`, and confirm
  anyway.
  EXPECT a generic claim-failure message appears only at **this** step —
  after confirming — rather than the modal having refused to offer the
  confirm step in the first place. This is the opposite of the mobile
  app's equivalent screen, which pre-checks and shows dedicated "already
  issued" copy before a Confirm button is even offered.
- Dismiss the modal (via its close control, the Escape key, or clicking
  outside it) in the moment right after tapping Confirm, before any result
  is shown.
  EXPECT the claim may still complete on the server even though the modal
  is gone and nothing on screen says so — record whether the tag shows as
  claimed on a later visit to the tag list (`TF-A97`) despite no success
  message ever having appeared. This is a known gap, not a guess: unlike
  the mobile app, this modal does not block its own close control while a
  claim is in flight.

### TF-A95 — Type a tag number and sales amount to claim without scanning

**App:** traveller web site · **Role:** Traveller, authenticated
**Needs:** Traveller A signed in; a second Draft tag's number and its sale
amount, known without scanning

1. Open the claim modal and choose its manual tab.
   EXPECT fields for a tag number and a sale amount.
2. Enter the Draft tag's number and its correct sale amount, then confirm.
   EXPECT a success result — this path posts directly with **no** lookup
   step first, unlike the scan tab.

**Negative cases**
- Enter the correct tag number with an incorrect sale amount.
  EXPECT the claim is refused — the sale amount is the proof of ownership
  on this path, verified against the tag server-side.
- Enter a tag number that does not exist at all.
  EXPECT a generic claim-failure message appears only after confirming,
  since this path performs no lookup to catch it earlier.

### TF-A96 — Re-run the validation scan after a claim so the new tag appears

**App:** traveller web site · **Role:** Traveller, authenticated
**Needs:** Traveller A, on the validation results page, completing a claim
via `TF-A94` or `TF-A95`

1. From the validation results, claim a further tag successfully and close
   the modal.
   EXPECT the validation scan re-runs automatically, and the newly claimed
   tag can appear in a bucket without a manual refresh.

**Negative cases**
- Close the modal in the gap between tapping Confirm and its success
  response arriving (see `TF-A94`'s second negative case), rather than
  after a confirmed success.
  EXPECT the automatic rescan does **not** fire in this case — this app
  keys the rescan on a **reported** success, not on an attempt, so a lost
  or late response leaves the results page looking exactly as if no claim
  had happened, even though it did.

### TF-A97 — List own tags across tenants

**App:** traveller web site · **Role:** Traveller, authenticated
**Needs:** Traveller A signed in, having claimed at least one tag

1. Signed in as Traveller A, open the tags page.
   EXPECT every tag this traveller has claimed, across every store.
2. Claim another tag (any claim flow above), then return to this page.
   EXPECT the new tag already present without a manual refresh.

**Negative cases**
- Open this page on an account that has claimed nothing yet.
  EXPECT an empty-state message, not an error.

### TF-A98 — Open the claim modal from the tags page, behind the self-assign grant

**App:** traveller web site · **Role:** Traveller, authenticated
**Needs:** Traveller A signed in, on the tags page

1. Signed in as Traveller A, open the tags page.
   EXPECT a Claim button in the page header, shown because this account
   holds the grant to claim.
2. Tap it.
   EXPECT the same claim modal `TF-A93`/`TF-A94`/`TF-A95` describes.

**Negative cases**
- Reach this same page on an account that does **not** hold the
  self-assign grant, if one is available.
  EXPECT the Claim button in the header is not shown at all — this is the
  one claim entry point on this site that is gated on a visible grant
  check.

### TF-A99 — Open one of the traveller's own tags by tag number

**App:** traveller web site · **Role:** Traveller, authenticated
**Needs:** Traveller A signed in, with at least one claimed tag

1. From the tags page, click a claimed tag's row.
   EXPECT that tag's own detail page opens, by its number.

**Negative cases**
- Alter the tag number in the address bar to a tag this traveller has not
  claimed.
  EXPECT a not-found result — this read only ever answers for a tag
  already assigned to the caller, so it cannot be used to check whether
  some other tag number exists.

### TF-A100 — Type the flight ticket when there is no readable boarding pass

**App:** traveller web site · **Role:** Traveller, authenticated
**Needs:** Traveller A mid-way through the validate flow, at the
flight-ticket step; a flight number, date and airport pair to type

1. On the flight-ticket step, choose the manual tab instead of the scan
   tab.
   EXPECT a form asking for the flight details directly, with no boarding
   pass required at all.
2. Fill it in and submit.
   EXPECT the flow proceeds to the scan step exactly as a successfully
   scanned boarding pass would (`TF-A89`).

**Negative cases**
- Submit with a required field left blank.
  EXPECT an inline validation message, no submission.

### TF-A101 — Carry the pre-KYC location across the login so the scan step does not re-prompt

**App:** traveller web site · **Role:** Traveller, logged out then
authenticated
**Needs:** Traveller B or Traveller A, logged out, reaching the validate
flow with no session yet; location permission grantable

1. Logged out, reach the validate flow and grant location **before**
   completing identity verification (KYC).
   EXPECT the grant is accepted at this earlier point in the flow.
2. Complete identity verification and sign in.
   EXPECT the flow lands back on the validate page and proceeds straight
   to the flight-ticket step — **not** a second location prompt — because
   the earlier grant was carried across the sign-in round trip.

**Negative cases**
- Complete the same round trip but let something interrupt the carried
  value — for example, complete KYC in a different browser tab or session
  than the one that granted location, so the two do not share the same
  verification-session identity.
  EXPECT the scan step re-prompts for location rather than trusting a
  grant that cannot be tied to this particular sign-in.

### TF-A102 — Open the claim modal from the validation results

**App:** traveller web site · **Role:** Traveller, authenticated
**Needs:** Traveller A, having just completed a validation scan (`TF-A90`)

1. From the validation results page, look for the claim action.
   EXPECT it is shown only now that a scan has actually validated — not
   before any scan has run and not on a page reached any other way.
2. Tap it.
   EXPECT the same claim modal `TF-A93`/`TF-A94`/`TF-A95` describes.

**Negative cases**
- Look for this same claim action before submitting any validation scan at
  all.
  EXPECT it is not present yet — this entry point exists only on a
  validated result, unlike `TF-A98`'s entry point on the tags page, which
  is available independent of any scan.

## Coverage

Every registry action id, mapped to its flow above. Generated from the
headings in this file rather than transcribed by hand, so it cannot drift
from them — a hole here would mean a heading is missing, not a typo in the
table.

| ID | Flow |
| --- | --- |
| A01 | [Scan a QR before choosing a role](#tf-a01-scan-a-qr-before-choosing-a-role) |
| A02 | [Scan a QR from the traveller login screen](#tf-a02-scan-a-qr-from-the-traveller-login-screen) |
| A03 | [Look up a tag by typed tag number and passport number](#tf-a03-look-up-a-tag-by-typed-tag-number-and-passport-number) |
| A04 | [Look up the tag issued on a typed sticker line number](#tf-a04-look-up-the-tag-issued-on-a-typed-sticker-line-number) |
| A05 | [Resolve a bare tag number to its tag id](#tf-a05-resolve-a-bare-tag-number-to-its-tag-id) |
| A06 | [Read a scanned tag's public detail by tag id](#tf-a06-read-a-scanned-tags-public-detail-by-tag-id) |
| A07 | [Read a tag's public detail by tag number and traveller document](#tf-a07-read-a-tags-public-detail-by-tag-number-and-traveller-document) |
| A08 | [Read the tag issued on a scanned sticker line](#tf-a08-read-the-tag-issued-on-a-scanned-sticker-line) |
| A09 | [Claim an unclaimed draft tag](#tf-a09-claim-an-unclaimed-draft-tag) |
| A10 | [Assign a traveller to a scanned draft tag](#tf-a10-assign-a-traveller-to-a-scanned-draft-tag) |
| A11 | [Resolve a traveller by document number to attach or assign](#tf-a11-resolve-a-traveller-by-document-number-to-attach-or-assign) |
| A12 | [Resolve a scanned sticker line](#tf-a12-resolve-a-scanned-sticker-line) |
| A13 | [A used sticker opens its tag instead of a create form](#tf-a13-a-used-sticker-opens-its-tag-instead-of-a-create-form) |
| A14 | [Resolve the merchant an allocated sticker book is booked to](#tf-a14-resolve-the-merchant-an-allocated-sticker-book-is-booked-to) |
| A15 | [Pick a merchant for an unallocated sticker book](#tf-a15-pick-a-merchant-for-an-unallocated-sticker-book) |
| A16 | [Load own product groups to price a sticker tag](#tf-a16-load-own-product-groups-to-price-a-sticker-tag) |
| A17 | [Load own VAT identity for the sticker create call](#tf-a17-load-own-vat-identity-for-the-sticker-create-call) |
| A18 | [Refuse a sticker book allocated to another merchant](#tf-a18-refuse-a-sticker-book-allocated-to-another-merchant) |
| A19 | [Create a tag against a scanned sticker as the merchant](#tf-a19-create-a-tag-against-a-scanned-sticker-as-the-merchant) |
| A20 | [Create a tag against a scanned sticker on a merchant's behalf](#tf-a20-create-a-tag-against-a-scanned-sticker-on-a-merchants-behalf) |
| A21 | [Capture the merchant and traveller signatures on a sticker tag](#tf-a21-capture-the-merchant-and-traveller-signatures-on-a-sticker-tag) |
| A22 | [Run the airport self-validation scan](#tf-a22-run-the-airport-self-validation-scan) |
| A23 | [Scan the boarding pass for the flight ticket](#tf-a23-scan-the-boarding-pass-for-the-flight-ticket) |
| A24 | [Rescan an expired validate QR mid-flow](#tf-a24-rescan-an-expired-validate-qr-mid-flow) |
| A25 | [Claim a further tag from the validation results](#tf-a25-claim-a-further-tag-from-the-validation-results) |
| A26 | [Refuse a validate QR scanned by staff](#tf-a26-refuse-a-validate-qr-scanned-by-staff) |
| A27 | [Create a tag from the merchant Create Tag screen](#tf-a27-create-a-tag-from-the-merchant-create-tag-screen) |
| A28 | [List own tags across tenants](#tf-a28-list-own-tags-across-tenants) |
| A29 | [List the tenant's tags](#tf-a29-list-the-tenants-tags) |
| A30 | [Open the detail of a tag the caller owns](#tf-a30-open-the-detail-of-a-tag-the-caller-owns) |
| A31 | [Open the tenant detail of a tag by id](#tf-a31-open-the-tenant-detail-of-a-tag-by-id) |
| A32 | [Assign a traveller to a draft tag from the tag detail](#tf-a32-assign-a-traveller-to-a-draft-tag-from-the-tag-detail) |
| A33 | [Scan a QR from the authenticated app](#tf-a33-scan-a-qr-from-the-authenticated-app) |
| A34 | [Classify a raw scan as tag, sticker, validate or unknown](#tf-a34-classify-a-raw-scan-as-tag-sticker-validate-or-unknown) |
| A35 | [Turn a classification plus the active role into a destination](#tf-a35-turn-a-classification-plus-the-active-role-into-a-destination) |
| A36 | [Own the scanner's visibility and hand a read to the routing](#tf-a36-own-the-scanners-visibility-and-hand-a-read-to-the-routing) |
| A37 | [Perform a scan destination: navigate, refuse, or resolve first](#tf-a37-perform-a-scan-destination-navigate-refuse-or-resolve-first) |
| A38 | [Complete a claim deferred through login, once authenticated](#tf-a38-complete-a-claim-deferred-through-login-once-authenticated) |
| A39 | [Open the camera and scan a code on the sticker page](#tf-a39-open-the-camera-and-scan-a-code-on-the-sticker-page) |
| A40 | [Read a sticker line number or tag code from a wedge scanner](#tf-a40-read-a-sticker-line-number-or-tag-code-from-a-wedge-scanner) |
| A41 | [Classify a scan as sticker, tag, validate or nothing](#tf-a41-classify-a-scan-as-sticker-tag-validate-or-nothing) |
| A42 | [Refuse a traveller validate QR scanned by staff](#tf-a42-refuse-a-traveller-validate-qr-scanned-by-staff) |
| A43 | [Resolve a scanned sticker line](#tf-a43-resolve-a-scanned-sticker-line) |
| A44 | [A used sticker opens its tag instead of the create form](#tf-a44-a-used-sticker-opens-its-tag-instead-of-the-create-form) |
| A45 | [Resolve a tag id from a scanned tag number](#tf-a45-resolve-a-tag-id-from-a-scanned-tag-number) |
| A46 | [Refuse to open a scanned tag without the tag-view grant](#tf-a46-refuse-to-open-a-scanned-tag-without-the-tag-view-grant) |
| A47 | [Refuse a sticker book allocated to another merchant](#tf-a47-refuse-a-sticker-book-allocated-to-another-merchant) |
| A48 | [Resolve the merchant a scanned sticker book is booked to](#tf-a48-resolve-the-merchant-a-scanned-sticker-book-is-booked-to) |
| A49 | [Load own product groups to price a scanned sticker tag](#tf-a49-load-own-product-groups-to-price-a-scanned-sticker-tag) |
| A50 | [Load own merchant identity for the sticker create call](#tf-a50-load-own-merchant-identity-for-the-sticker-create-call) |
| A51 | [Pick a merchant for an unallocated sticker book](#tf-a51-pick-a-merchant-for-an-unallocated-sticker-book) |
| A52 | [Preview the picked merchant on the unallocated sticker line](#tf-a52-preview-the-picked-merchant-on-the-unallocated-sticker-line) |
| A53 | [Attach a traveller to a scanned sticker tag by document search](#tf-a53-attach-a-traveller-to-a-scanned-sticker-tag-by-document-search) |
| A54 | [Capture the merchant and traveller signatures on a scanned sticker tag](#tf-a54-capture-the-merchant-and-traveller-signatures-on-a-scanned-sticker-tag) |
| A55 | [Create a tag against a scanned sticker as the merchant](#tf-a55-create-a-tag-against-a-scanned-sticker-as-the-merchant) |
| A56 | [Create a tag against a scanned sticker on a merchant's behalf](#tf-a56-create-a-tag-against-a-scanned-sticker-on-a-merchants-behalf) |
| A57 | [List the tenant's tags a scan-created tag lands in](#tf-a57-list-the-tenants-tags-a-scan-created-tag-lands-in) |
| A58 | [Open the tag a scanned QR resolved to](#tf-a58-open-the-tag-a-scanned-qr-resolved-to) |
| A59 | [Assign a traveller to a draft tag from the tag detail](#tf-a59-assign-a-traveller-to-a-draft-tag-from-the-tag-detail) |
| A60 | [Render the tag's own QR onto the printable tax-free form](#tf-a60-render-the-tags-own-qr-onto-the-printable-tax-free-form) |
| A61 | [Print the tag through the report service](#tf-a61-print-the-tag-through-the-report-service) |
| A62 | [Create a tag from the new-tag form, with no sticker scanned](#tf-a62-create-a-tag-from-the-new-tag-form-with-no-sticker-scanned) |
| A63 | [Open the bulk scan-and-assign sheet](#tf-a63-open-the-bulk-scan-and-assign-sheet) |
| A64 | [Scan draft tag QRs into the bulk basket with the camera](#tf-a64-scan-draft-tag-qrs-into-the-bulk-basket-with-the-camera) |
| A65 | [Read a draft tag code into the bulk basket from a wedge scanner](#tf-a65-read-a-draft-tag-code-into-the-bulk-basket-from-a-wedge-scanner) |
| A66 | [Type a tag number into the bulk basket](#tf-a66-type-a-tag-number-into-the-bulk-basket) |
| A67 | [Look up each scanned tag before it enters the bulk basket](#tf-a67-look-up-each-scanned-tag-before-it-enters-the-bulk-basket) |
| A68 | [Refuse a scanned tag that is not an unassigned draft](#tf-a68-refuse-a-scanned-tag-that-is-not-an-unassigned-draft) |
| A69 | [Resolve the traveller the bulk basket will be assigned to](#tf-a69-resolve-the-traveller-the-bulk-basket-will-be-assigned-to) |
| A70 | [Assign every tag in the bulk basket to that traveller](#tf-a70-assign-every-tag-in-the-bulk-basket-to-that-traveller) |
| A71 | [Resolve a traveller from a scanned passport at the customs desk](#tf-a71-resolve-a-traveller-from-a-scanned-passport-at-the-customs-desk) |
| A72 | [Load the tags of the traveller under customs review](#tf-a72-load-the-tags-of-the-traveller-under-customs-review) |
| A73 | [Require a registered kiosk device before a validate QR is shown](#tf-a73-require-a-registered-kiosk-device-before-a-validate-qr-is-shown) |
| A74 | [Generate the rolling customs validate QR](#tf-a74-generate-the-rolling-customs-validate-qr) |
| A75 | [Roll the displayed validate QR every thirty seconds](#tf-a75-roll-the-displayed-validate-qr-every-thirty-seconds) |
| A76 | [Scan tags into a refund — disabled](#tf-a76-scan-tags-into-a-refund-disabled) |
| A77 | [Look up a tag by typed tag number and passport number](#tf-a77-look-up-a-tag-by-typed-tag-number-and-passport-number) |
| A78 | [Read the tag issued on a scanned sticker line](#tf-a78-read-the-tag-issued-on-a-scanned-sticker-line) |
| A79 | [Read a tag's public detail by tag number and traveller document](#tf-a79-read-a-tags-public-detail-by-tag-number-and-traveller-document) |
| A80 | [Read an unclaimed draft tag's public detail by tag id](#tf-a80-read-an-unclaimed-draft-tags-public-detail-by-tag-id) |
| A81 | [Offer the claim only while the tag has no traveller](#tf-a81-offer-the-claim-only-while-the-tag-has-no-traveller) |
| A82 | [Claim an unclaimed draft tag from the scanned tag page](#tf-a82-claim-an-unclaimed-draft-tag-from-the-scanned-tag-page) |
| A83 | [Defer the claim through login and resume on the same tag](#tf-a83-defer-the-claim-through-login-and-resume-on-the-same-tag) |
| A84 | [Refuse a validate page opened without a scanned QR value](#tf-a84-refuse-a-validate-page-opened-without-a-scanned-qr-value) |
| A85 | [Probe whether the session can still scan before trusting it](#tf-a85-probe-whether-the-session-can-still-scan-before-trusting-it) |
| A86 | [Grant the device location for the validation scan](#tf-a86-grant-the-device-location-for-the-validation-scan) |
| A87 | [Resolve whether the KYC-verified traveller already has an account](#tf-a87-resolve-whether-the-kyc-verified-traveller-already-has-an-account) |
| A88 | [Exchange the KYC session for an access token and sign in](#tf-a88-exchange-the-kyc-session-for-an-access-token-and-sign-in) |
| A89 | [Scan the boarding pass for the flight ticket](#tf-a89-scan-the-boarding-pass-for-the-flight-ticket) |
| A90 | [Run the airport self-validation scan](#tf-a90-run-the-airport-self-validation-scan) |
| A91 | [Enrich the scan result with each returned tag's detail](#tf-a91-enrich-the-scan-result-with-each-returned-tags-detail) |
| A92 | [Rescan a validate QR that expired mid-flow](#tf-a92-rescan-a-validate-qr-that-expired-mid-flow) |
| A93 | [Scan a further tag's QR in the claim modal and read it by id](#tf-a93-scan-a-further-tags-qr-in-the-claim-modal-and-read-it-by-id) |
| A94 | [Claim a further tag from the claim modal](#tf-a94-claim-a-further-tag-from-the-claim-modal) |
| A95 | [Type a tag number and sales amount to claim without scanning](#tf-a95-type-a-tag-number-and-sales-amount-to-claim-without-scanning) |
| A96 | [Re-run the validation scan after a claim so the new tag appears](#tf-a96-re-run-the-validation-scan-after-a-claim-so-the-new-tag-appears) |
| A97 | [List own tags across tenants](#tf-a97-list-own-tags-across-tenants) |
| A98 | [Open the claim modal from the tags page, behind the self-assign grant](#tf-a98-open-the-claim-modal-from-the-tags-page-behind-the-self-assign-grant) |
| A99 | [Open one of the traveller's own tags by tag number](#tf-a99-open-one-of-the-travellers-own-tags-by-tag-number) |
| A100 | [Type the flight ticket when there is no readable boarding pass](#tf-a100-type-the-flight-ticket-when-there-is-no-readable-boarding-pass) |
| A101 | [Carry the pre-KYC location across the login so the scan step does not re-prompt](#tf-a101-carry-the-pre-kyc-location-across-the-login-so-the-scan-step-does-not-re-prompt) |
| A102 | [Open the claim modal from the validation results](#tf-a102-open-the-claim-modal-from-the-validation-results) |

102 ids, `A01` through `A102`, each with exactly one flow above.

## What has not been run

**None of the 102 flows in this file has been executed.** They are written
to be run by a tester against a deployed environment; writing them down is
not running them, and nothing above should be read as a pass. Two other
documents already track what real-device and real-environment verification
is still outstanding, and this file links to them rather than restating
their contents, so the two lists cannot drift apart:

- [`docs/QR.md` § Verification still outstanding](../QR.md#verification-still-outstanding)
- [`super-app/QR_FEATURE_CHECKLIST.md`](../../super-app/QR_FEATURE_CHECKLIST.md)'s unchecked native-verification boxes

Running the flows in this file for the first time is itself part of closing
those two lists, not a separate activity from it.

