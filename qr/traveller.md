# QR handling — traveller

This file answers what a traveller can do by scanning or presenting a QR code.

_Verified against: 2026-07-31 · super-app `24221f7` · web-app `0cf122af0`._

## Which ids this chapter narrates

46 action ids: every registry row whose `Actor` names Traveller, plus the rows
whose `Actor` begins `Anyone` (`super-app`'s shared scan plumbing, reachable
before any role is chosen). 20 come from `super-app`, 26 from `apps/ssr`.
[`permissions-by-role.md` § Traveller](permissions-by-role.md#traveller) files
the identical 46 ids — checked id-for-id against this chapter's list rather than
assumed, and the two agree exactly; no disagreement to report.

This chapter narrates what the traveller experiences and cites the id and the
`file:line` behind it. It does not restate what is already established
elsewhere: permission strings live in
[`permissions-by-role.md`](permissions-by-role.md), endpoint ownership and
contracts in [`endpoints.md`](endpoints.md), and the wire format, QR
precedence rules and login/session mechanics in [`README.md`](README.md).

## Getting to a QR flow

A traveller reaches a scan from three entry points on `super-app` before any of
the flows below start: the role-select seam (`A01`,
`super-app/src/screens/shared/_components/SeamScanPill.tsx:69`), the traveller
login screen (`A02`,
`super-app/src/screens/traveller/TravellerLoginScreen.tsx:166`), and the centre
tab once authenticated (`A33`, `super-app/src/app/(auth)/_layout.tsx:128`,
mounted via `TabRoutes` at `:59`). All three funnel into the same pipeline:
`useQrScanLauncher` (`A36`, `super-app/src/hooks/useQrScanLauncher.tsx:20`)
owns the scanner's visibility and hands a raw read to `classifyScan` (`A34`,
`super-app/src/utils/qr/classifyScan.ts:38`), whose result goes to
`scanDestination` (`A35`, `super-app/src/utils/qr/scanDestination.ts:26`) and
then `useScanRouting` (`A37`, `super-app/src/hooks/useScanRouting.ts:20`),
which navigates, refuses, or resolves a bare tag number first. Manual entry
(below) enters this same pipeline partway through rather than being a second
lookup path — see
[README § How each app resolves a QR](README.md#how-each-app-resolves-a-qr) for
the classification precedence table this pipeline implements, which this
chapter does not repeat.

`apps/ssr` has no equivalent in-app pipeline for a tag or sticker QR: a printed
code there encodes `{ssrBaseUrl}/tag/{slug}`, so the traveller's own camera app
opens the browser directly at `/tag/[slug]`, which decodes the slug
server-side. See
[README § The tag slug](README.md#the-tag-slug) for the format and the
`s`/`n`+`i` precedence a decoded slug is read under.

## T1 — Validate QR (airport self-validation)

The airport flow is location → flight ticket → scan → categorized results, run
on both apps, with a rescan path for an expired rolling QR and a session-expiry
path distinct from it.

**Reaching the screen.** `super-app`'s `ValidateScreen` (`A22`,
`super-app/src/screens/traveller/ValidateScreen.tsx:90`) is a root route, not
inside `(auth)`, so it renders even logged out — it does its own gate: when
`!user?.userId` it shows a visible lock-icon screen with a "Login to validate"
button (`ValidateScreen.tsx:183`–`201`) rather than redirecting silently.
Pressing it (`goLogin`, `:173`–`178`) stashes `{type: "validate", qrValue}` in
the same `pendingScan` store the claim flow uses and routes to
`/traveller-login`; `useResumePendingScan` (called once from
`super-app/src/app/(auth)/_layout.tsx:22`) replaces the route with
`/validate?qrValue=…` once authenticated
(`super-app/src/hooks/useResumePendingScan.tsx:23`–`28`) — one hook resumes
both a deferred claim and a deferred validate.

`apps/ssr` resolves the same question server-side before any UI paints, with no
visible "please log in" screen of its own. `A84` refuses outright when the URL
carries no `qrValue`
(`web-app/apps/ssr/src/app/[lang]/(public)/validate/page.tsx:51`–`58`). When a
`qrValue` is present, the page does not just trust a session cookie — `A85`
probes it: `getSessionState`
(`validate/page.tsx:26`–`38`) calls the affiliations endpoint and sorts the
result into `"usable"` (has an access token and the probe succeeds),
`"anonymous"` (no session), `"revoked"` (no access token, or the probe itself
401s), or `"unverifiable"` (the probe threw something else — a 5xx or network
blip). Usable renders `ValidateClient` straight away; unverifiable renders
`ValidateUnavailable` rather than forcing a paid re-KYC on a transient error;
anonymous or revoked renders `DiditForValidate` (`:89`–`94`), which is `A87`
(resolve whether the KYC-verified traveller already has an account,
`didit-for-validate.tsx:162`) and `A88` (exchange the KYC session for a token
and sign in, `:177`). A `"revoked"` session additionally clears the stale
cookie via `clearStaleSession` so the traveller stops looking signed-in
elsewhere in the app while `DiditForValidate` re-verifies them
(`didit-for-validate.tsx:76`–`82`). `DiditForValidate` itself opens straight
into the location prompt or the KYC widget with no separate "you must log in"
message — a real difference in shape from `super-app`'s explicit gate screen,
even though both ultimately require the same thing.

**Geolocation (`A86`).** `super-app` requests it inline in `ValidateScreen`
(`requestLocation`, `ValidateScreen.tsx:64`–`81`), branching the error message
by denied/unsupported/unavailable. `apps/ssr` mounts the identical control
twice — once inside the authenticated flow
(`use-validate-flow.ts:231`) and once ahead of KYC
(`didit-for-validate.tsx:84`), so a traveller who has not yet signed in can
still grant location before verifying identity. `A101` is what carries whichever
one ran first across the login round trip: the pre-KYC location is written to
an httpOnly cookie keyed by the Didit session id
(`saveValidateLocation`/`readValidateLocation`,
`web-app/apps/ssr/src/app/[lang]/(public)/validate/validate-location-actions.ts`)
and read back on the next page load (`validate/page.tsx:67`) so the scan step
never re-prompts. See
[README § A86 and A101 are separate rows](README.md#login-and-session-resolution)
and the fuller note in `actions-and-routes.md` for why the two are tested
separately.

**Flight ticket (`A23`/`A89`, manual fallback `A100`).** Both apps offer a scan
tab (parsing the boarding-pass barcode as BCBP) and a manual tab, and both
withhold Submit until either the manual tab has focus or the scan actually
decoded a recognized field (`hasParsedFlightInfo`) — a scan that yields only
the raw barcode leaves the traveller on an amber "unreadable" prompt rather
than letting them continue
(`super-app/src/screens/traveller/Validate/FlightInfoStep.tsx:45`,`104`–`110`;
`web-app/apps/ssr/src/app/[lang]/(public)/validate/_components/flight-info-step.tsx:277`–`279`,`339`–`347`).
**The two BCBP parsers have drifted, not just been ported.**
`super-app/src/utils/qr/bcbp.ts` is documented as "ported from the web app's
`parseBcbp`" but has since diverged: it tolerates a leading AIM symbology
identifier or stray whitespace/newline before the `M` marker
(`bcbp.ts:14`–`21`, matching `/M[1-9]/` and slicing from there) and validates
the two airport-code fields are exactly three uppercase letters before
accepting them (`:38`–`41`). `apps/ssr`'s local `parseBcbp`
(`flight-info-step.tsx:27`–`72`) still does the older, stricter
`raw.charAt(0) !== "M" || raw.length < 58` check with no such tolerance and no
airport-code validation. A concrete consequence: a boarding pass whose barcode
carries a leading symbology prefix (or a scanner-injected newline) parses on
`super-app` and falls through to the "unreadable" state on `apps/ssr`. This is
recorded as [`F15`](README.md#findings).

**The scan and its result buckets (`A22`/`A90`).** Both apps POST the same
scan endpoint and receive `greenTagIds`, `redTagIds`, `customsRejectedTagIds`
and `alreadyClearedTagIds`. **Only three of those four buckets are ever shown
to the traveller, on either app** — correcting an earlier note in the survey
behind this guide, which had described a visible "already validated" bucket. On
`super-app`, the "already cleared" section is written but entirely commented
out of the rendered list
(`super-app/src/screens/traveller/Validate/ScanResultView.tsx:57`–`68`); the
ids are still folded into the enrichment call (`ValidateScreen.tsx:101`) but
never reach a bucket the traveller can see. On `apps/ssr`, `categorizeTags`
computes an `alreadyCleared` array
(`scan-result-view.tsx:40`,`56`) and the tag-detail enrichment call (`A91`,
`use-validate-flow.ts:166`,`170`) fetches it exactly like the other three, but
`ScanResultView`'s render (`scan-result-view.tsx:294`–`380`) never reads
`tags.alreadyCleared` at all — no section, no count, nothing. Both apps also
carry a translation string for it
(`MobileApp.Qr.Validate.AlreadyCleared` /
`Validate.ScanResult.AlreadyClearedTags`) that no component ever renders. This
is recorded as [`F17`](README.md#findings): an orphaned bucket and orphaned copy
on both platforms, not a one-off oversight on either. The red bucket carries suggested
customs exit points when present (`ScanResultView.tsx:144`–`147` on
`super-app`; `scan-result-view.tsx:363` on `apps/ssr`), and an empty result
(all three visible buckets empty) shows a dedicated empty state on both apps
rather than nothing.

**Failure branches.** A `401` on the scan call means the session is no longer
usable: `super-app` moves straight to a "session expired" screen whose retry
button re-runs the same `goLogin()` deferred-login path
(`ValidateScreen.tsx:124`–`125`,`284`–`296`); `apps/ssr` re-runs the server page
so it re-probes the session and routes back to KYC rather than looping on a
dead token (`use-validate-flow.ts:191`–`194`). Both apps look for the literal
substring `"QR record is not active"` in the error response to distinguish an
**expired rolling QR** from any other failure
(`ValidateScreen.tsx:126`; `use-validate-flow.ts:195`), and route that case to
a dedicated rescan state rather than the generic failure one — `A24` on
`super-app` (rescan button opens a scanner, re-runs the scan with the freshly
read `qrValue`, `ValidateScreen.tsx:140`–`149`,`268`–`282`) and `A92` on
`apps/ssr` (a modal camera that keeps asking until the scan endpoint itself
accepts the fresh value — "it's the authority on validity", not the client,
`rescan-qr-modal.tsx:56`; `use-validate-flow.ts:346`–`372`). Any other failure
shows a generic message with its own retry; `apps/ssr` additionally recognizes
an error containing `"distance"` and shows a "too far from the airport" message
instead of the raw one (`validate-client.tsx:223`–`231`) — a case `super-app`
has no special wording for.

## T2 — Sticker QR

A traveller (or anyone scanning before choosing a role or logging in) who
scans a store's sticker sees whatever tag was issued against it, and nothing
more — creating a tag against a sticker is a staff action, out of this
chapter's scope. On `super-app`, `scanDestination` sends a non-staff scanner to
`/tag-preview` rather than the staff sticker screen precisely because "everyone
else … reads the tag already issued on it… That read needs no token"
(`super-app/src/utils/qr/scanDestination.ts:51`–`59`). `A08` reads it anonymously
by sticker line number
(`super-app/src/screens/shared/TagPreviewScreen.tsx:81`); `A78` is the same
read on `apps/ssr`, reached because the decoded slug carries an `s` key
(`web-app/apps/ssr/src/app/[lang]/(public)/tag/[slug]/page.tsx:150`).

**No tag on this sticker yet.** When the sticker line resolves to nothing,
`super-app` shows a dedicated message —
`MobileApp.Qr.TagPreview.NoTagOnSticker`, "No tax-free tag has been issued on
this sticker yet. Ask the store to complete your purchase."
(`TagPreviewScreen.tsx:238`–`241`, string in
`super-app/src/localization/resources/en-US.json:41`). `apps/ssr` has no
equivalent dedicated copy for this case: a failed sticker-line lookup there
falls through to the same generic `LookupFailed` component every other lookup
failure uses
(`web-app/apps/ssr/src/app/[lang]/(public)/tag/[slug]/page.tsx:163`–`167`,
`72`–`98`), showing either the server's own error text or a generic
"something went wrong". This asymmetry is recorded as
[`F28`](README.md#findings).

**Manual entry (`#9`, `A04`).** `/manual-entry`'s sticker mode
(`super-app/src/screens/shared/ManualEntryScreen.tsx:122`–`139`) is the typed
fallback for a sticker QR the camera cannot read; it asks only for the sticker
number, staff and traveller alike. `apps/ssr` has no manual sticker-lookup
route at all — because a sticker QR there is a URL the phone's own camera
resolves by routing rather than something the app scans in-app, there is
nothing for a typed fallback to substitute for.

If the resolved tag is unclaimed, the same draft-claim mechanics described
below apply (`A09`/`A38` on `super-app`, `A81`/`A82`/`A83` on `apps/ssr`).

## T3 — Tag QR

Scanning a printed tag QR (or typing its number) shows the tag's own public
detail. `super-app`'s `TagPreviewScreen` serves two anonymous reads: by tag id
alone (`A06`, self-credentialing — "the unguessable Guid id is the credential",
`TagPreviewScreen.tsx:71`) and by tag number plus the traveller's own document
number (`A07`, `:74`). `apps/ssr`'s `/tag/[slug]` page serves the equivalent
two reads, chosen by which keys the decoded slug carries: `n`+`t` present goes
to `A79` (`web-app/apps/ssr/src/app/[lang]/(public)/tag/[slug]/page.tsx:182`),
and `i` present without `t` — a tag with no traveller yet, so there is no
document number to carry — goes to `A80` (`:216`–`231`), which is exactly the
draft case a traveller needs to claim. See
[README § The tag slug](README.md#the-tag-slug) for the full key precedence.

**Manual entry (`#9`).** `super-app`'s tag mode
(`ManualEntryScreen.tsx:140`–`176`) asks for the tag number and, only for a
non-staff caller, a passport number too (`{!isStaff && (...)}`, `:157`) —
because the anonymous public read needs the pair, while staff resolve a bare
number tenant-side and never see that field. `A03` is this typed lookup.
`apps/ssr`'s equivalent is the tag search form at `/tag`
(`web-app/apps/ssr/src/app/[lang]/(public)/tag/_components/tag-search-form.tsx`),
which likewise asks for both a tag number and the traveller's passport number
(`:77`–`103`) and encodes them into the very same slug format a scanned QR
would carry, pushing to `/tag/[slug]` rather than being a separate lookup path
(`:52`–`67`) — this is `A77`. Unlike `super-app`'s manual entry, `apps/ssr`'s
form has no sticker mode, for the same routing-based reason noted under T2.
`A77` is also the fallback `/tag/[slug]` itself falls back to when a slug
carries too little to look anything up
(`[slug]/page.tsx:247`).

If the tag is a draft with no traveller attached, a claim is offered — see
below.

## Cross-cutting: scanning before login

Every public read above works with no account at all: `A06`, `A07`, `A08` on
`super-app` and `A78`, `A79`, `A80` on `apps/ssr` are `— anonymous` endpoints
(see [`permissions-by-role.md` § Anonymous](permissions-by-role.md#anonymous--no-permission-and-sometimes-no-token-at-all)),
and every screen that serves them is reachable before login. On `super-app`
this is because `/tag-preview` is a **root** route — it sits directly under
`super-app/src/app/`, beside the `(public)` and `(auth)` route groups rather
than inside either, alongside `/manual-entry`, `/sticker-tag` and `/validate`
— so the same screen renders whether or not a session exists, and each screen
does its own authenticated/unauthenticated branching rather than inheriting a
route group's gate. `apps/ssr`'s equivalent is exempting `tag` and `validate`
from the authentication redirect at the middleware level
(`PUBLIC_ROUTES=/,explore,tag,validate,barcode-scanner-demo,card-demo` in
`web-app/apps/ssr/.env:19`, matched in
`web-app/packages/utils/auth/middleware.ts`).

## Cross-cutting: only a Draft tag is claimable, and the client checks for it differently across surfaces

The underlying rule is uniform — the backend only lets a Draft, unowned tag be
claimed, and `status`/`traveller` are meant to move together (see
[`endpoints.md` § Draft or Issued](endpoints.md#draft-or-issued-status-and-traveller-are-coupled))
— but **how thoroughly each screen checks for it before offering the button
differs, and this chapter reports that rather than rounding it to one rule.**

`super-app`'s `TagPreviewScreen.buildAction()` computes a three-way
`deriveTagKind` (`super-app/src/utils/tag.ts:38`–`46`: `draft` when Draft status
and no traveller, `issued` when not-Draft and a traveller is attached,
`divergent` when the two disagree) and acts on all three: `divergent` offers no
action at all (`TagPreviewScreen.tsx:170`–`171`), `draft` offers Claim (`A09`)
or, when logged out, "Login to claim" (`:183`–`188`), and `issued` offers
viewing instead. `super-app`'s validate-results `ClaimTagModal` (`A25`) does
the identical `deriveTagKind` check
(`super-app/src/screens/traveller/Validate/ClaimTagModal.tsx:137`,`192`–`208`):
a `draft` scanned tag gets a Claim button, an `issued` or `divergent` one gets
"already issued" / "divergent" copy instead of a button.

`apps/ssr`'s `/tag/[slug]` page (`A81`) is simpler: `claimPropsFor`
(`web-app/apps/ssr/src/app/[lang]/(public)/tag/[slug]/page.tsx:122`–`131`)
offers a claim whenever `data.traveller?.travellerDocumentNumber` is absent —
it does not separately check `status`, so it has no notion of `super-app`'s
"divergent" case at all. Given the backend coupling
`endpoints.md` documents, an unowned tag should always be Draft in practice, so
this simpler gate should agree with `super-app`'s in the ordinary case; it is
narrower defensive coding, not a different policy.

**`apps/ssr`'s own validate-results claim modal (`A93`/`A94`/`A95`, opened by
both `A102` from `/validate` and `A98` from `/tags`) performs no client-side
draft/issued check at all.** A tag found by scan (`A93`,
`web-app/apps/ssr/src/app/[lang]/(public)/validate/_components/claim-tag-modal.tsx:87`–`110`)
goes straight to a confirm step with a Claim button regardless of its status;
a tag entered by number (`A95`, `handleManualClaim`, `:128`–`157`) is posted
directly with no lookup at all. Either path relies entirely on the self-assign
endpoint's own rejection, surfaced as a generic toast
(`claim-tag-modal.tsx:152`–`153`,`193`–`194`), to refuse a non-Draft tag. This
is the opposite of `super-app`'s validate-results modal, which pre-checks and
shows dedicated copy. Recorded as [`F27`](README.md#findings).

## Cross-cutting: deferred claim intent

"Login to claim" does not lose the scan. On `super-app`,
`TagPreviewScreen.loginToClaim()`
(`super-app/src/screens/shared/TagPreviewScreen.tsx:156`–`165`) stashes
`{type: "claim", tagNumber, salesAmount, tagId}` in a module-level zustand
store (`super-app/src/store/pendingScan.ts`) and routes to `/traveller-login`;
`useResumePendingScan()`, run once from
`super-app/src/app/(auth)/_layout.tsx:22`, reads and clears the intent and
posts the self-assign itself — `A38` — with no second button press
(`super-app/src/hooks/useResumePendingScan.tsx:31`–`58`).

`apps/ssr` has no equivalent client-side store, because it needs none: its
`ClaimTagButton` renders a "Login to claim" link straight to
`/login?redirectTo=/tag/{slug}` when logged out
(`web-app/apps/ssr/src/app/[lang]/(public)/tag/[slug]/_components/claim-tag-button.tsx:27`–`39`,
url built at `[slug]/page.tsx:147`) — this round trip **is** `A83`. Because the
whole page is server-rendered, landing back on that same slug after signing in
re-runs the lookup and recomputes `claimProps` from scratch; there is nothing
to "resume" separately from loading the page. **What `/login` offers when the
traveller arrives is two paths, and only one of them touches `A87`/`A88`.**
`web-app/apps/ssr/src/components/auth/login-form.tsx` renders a live
username-or-email field (`:107`) and password field (`:135`) whose submit
(`:60`) carries the `redirectTo` straight through `signInServerApi`; signing in
with KYC is a separate link to `/login/kyc` beside it (`:157`). A traveller who
already has a password completes the deferred claim entirely through that
form and never runs the KYC actions (`A87`, `A88`) at all — see
[README § Login and session resolution](README.md#login-and-session-resolution)
for the fuller mechanics, not repeated here.

## Cross-cutting: claiming from the validation results (`#8`)

`super-app`'s `ClaimTagModal`, opened from the results screen (`A25`), is
deliberately **scan-only on mobile** — its own doc comment states why: the app
already has `/manual-entry` as its own route, so a second typed path inside the
modal would be a third way to enter a tag number
(`super-app/src/screens/traveller/Validate/ClaimTagModal.tsx:24`–`33`).
`apps/ssr`'s equivalent modal (opened by `A102` from `/validate` and reused by
`A98` from `/tags`) is not scan-only: it has both a scan tab (`A93`) and a
manual tab (`A95`, typed tag number plus sales amount,
`claim-tag-modal.tsx:287`–`336`), because it has no separate manual-entry route
to defer to the way `super-app` does.

**Closing the modal after any claim re-runs the scan — but the two apps key
this on different things, and the difference matters.** A claimed tag is not a
validated tag, so both apps re-run the scan (`A96` on `apps/ssr`, folded into
`A25`'s own close handler on `super-app`) rather than inserting a row locally.
`super-app`'s `handleClaimClose`
(`ValidateScreen.tsx:163`–`171`) keys this on whether a claim was **attempted**:
`ClaimTagModal`'s `onClaimAttempted()` fires *before* the `await`
(`ClaimTagModal.tsx:108`–`110`, "fired before the await, not after: a commit
that lands on the server but whose response we never see must still trigger
the parent's re-scan") — so a dropped response after a real commit still
triggers the rescan. **`apps/ssr`'s `handleClaimModalOpenChange`
(`use-validate-flow.ts:323`–`338`) does not reproduce this — it keys on a
*reported success* only, the opposite of `super-app`'s half.**
`claimedSinceOpenRef.current` is set only inside `handleTagClaimed`
(`use-validate-flow.ts:314`–`315`), which is wired as the modal's `onTagClaimed`
prop; that prop is invoked only inside the `res.type === "success"` branches
of `handleConfirm` and `handleManualClaim`
(`claim-tag-modal.tsx:151`,`192`). There is no attempt-tracking prop on this
modal at all — `ClaimTagModalProps` carries only `open` / `onOpenChange` /
`onTagClaimed` (`claim-tag-modal.tsx:35`–`39`). The registry's own `Trigger`
cell for `A96` matches this exactly, verbatim: "Claim tag modal closes after at
least one successful claim" — not "attempted." Concretely reachable, not
theoretical: `claim-tag-modal.tsx`'s `handleClose`
(`:208`–`218`) applies no `isPending` guard before calling `onOpenChange`, and
the shared `DialogContent` renders its own close (`X`) button by default with
`showCloseButton` left at its default `true`
(`web-app/packages/ayasofyazilim-ui/src/components/dialog.tsx:53`,`72`–`80`) —
nothing here stops a traveller from dismissing the dialog (via that button,
Escape, or the overlay) while a claim POST is still in flight — unlike
`super-app`'s modal, which explicitly blocks exactly this (`isClaiming`-gated
`handleClose`, `ClaimTagModal.tsx:69`–`75`). On `apps/ssr`, closing the modal in
that window means the eventual success response updates state nobody is
listening to anymore: the rescan check already ran once, against a still-false
ref.

**The accepted limitation is real on `super-app`, and a stricter gap exists on
`apps/ssr`.** `super-app/QR_FEATURE_CHECKLIST.md`'s Phase 8 accepts that "if
the post-claim `runScan()` fails, the screen shows the generic
validation-failed state with nothing saying the claim itself succeeded … the
claim is already committed server-side and the tag is in the account
regardless" — that is `super-app`'s case, where the rescan reliably *runs* and
can then separately fail to render its success. `apps/ssr`'s failure mode is
earlier and quieter: when the response to a committed claim is lost (dropped,
or arrives after an early dismiss), the rescan **never fires at all** — no
error state, no failed state, nothing distinguishing it from a session where
no claim happened. The tag is still claimed server-side and will appear the
next time anything re-runs the scan, but nothing on this screen tells the
traveller that, and nothing prompts them to look. This is recorded as
[`F4`](README.md#findings), alongside the BCBP-parser drift at
[`F15`](README.md#findings).

## After the claim: the traveller's own tags

Once a tag is claimed (by any of the routes above), it shows up in the
traveller's own tag list — `A28` on `super-app` (`Tags` tab, refreshed after
every claim, `super-app/src/hooks/useLoadTags.tsx:94`) and `A97` on `apps/ssr`
(`/tags`, same refresh-on-claim contract,
`web-app/apps/ssr/src/app/[lang]/(main)/tags/page.tsx`) — and its own detail
opens by tag number: `A30` on `super-app`
(`super-app/src/screens/shared/Tags/TagDetail/useTagDetail.tsx:31`) and `A99`
on `apps/ssr` (`web-app/apps/ssr/src/app/[lang]/(main)/tags/[tagNumber]/page.tsx`).

`apps/ssr`'s `/tags` page additionally offers a second claim entry point,
`A98` — a Claim button in the tags header, rendered only while the traveller
holds the `TravellerSelfAssign` grant
(`isActionGranted`,
`web-app/apps/ssr/src/app/[lang]/(main)/tags/_components/tag-claim.tsx:14`) —
which opens the very same claim modal (`A93`/`A94`/`A95`) the validation
results use, "so the tag is looked up (sales amount included) before
self-assignment" (`tag-claim.tsx:29`–`31`). See
[`permissions-by-role.md` § Traveller](permissions-by-role.md#traveller) for
the exact permission strings behind every read and write named in this
chapter.
