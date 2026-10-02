# ssr visual parity, sub-project 3: Profile in full

**Goal.** `web-app/apps/ssr`'s traveller Profile looks and behaves like super-app's traveller Profile: the hub, the Documents page, Edit profile with a real avatar upload, and the Cards page. This is sub-project 3 of 4.

It builds on:
- **Sub-project 1** ([spec](2026-10-01-ssr-visual-parity-shell-design.md), #312): the Profile hub at `/profile`, the moved account pages, `SettingsGroup` / `SettingsRowContent`, the shared tokens, Geist, the island, and the QR contract.
- **Sub-project 2** ([spec](2026-10-02-ssr-visual-parity-home-tags-design.md), #313): `PinnedBar`, `TabPage pinnedBar`, the `tag-row-design` cookie, and the single centred column.

**The reference is super-app's code:**
- the Profile root: `src/screens/traveller/Profile/IdentityProfileScreen.tsx`, with `_components/IdentityHero.tsx` and `VerificationStrip.tsx`;
- `src/screens/shared/Profile/` (`SettingsGroup`, `ProfileHero`, `EditProfileScreen`, `AvatarModal`, `DeleteAccountModal`);
- `src/screens/shared/Settings/TagRowDesignScreen.tsx`;
- `src/screens/traveller/Documents/` and `src/screens/traveller/Cards/`.

## Decisions (user, 2026-10-02)

1. **One spec, two PRs.**
   - **3a:** the Profile hub (hero, setup strip, groups, the Tag list style picker, delete account) and the new Documents page.
   - **3b:** Edit profile with the real avatar upload, and the Cards restyle.
2. **Account deletion is in-app, as in the app.** The public `/account-deletion` page stays for store listings.
3. **Banks stay behind their grant.** Cards are restyled to the app's tiles, and the bank section is restyled the same way behind `RefundService.TravellerCards.CreateBank`, which travellers do not hold yet.
4. **Sheets are no wider than the page column:** `mx-auto w-full max-w-3xl md:border-x` on every `DrawerContent` (2026-10-02; memory `ssr-sheets-match-page-width`). This was applied to the Tags filter sheet in `8098340ed` on #313.
5. **The three section designs below were approved as presented.**

**Left out on purpose:**
- the app's QR button, which shows a placeholder code;
- its disabled "Notification preferences" row.

ssr keeps its Change password row, which sub-project 1 decided is web-only.

## Approach

This is sub-projects 1 and 2's approach. Port the app's pure logic into ssr as `.ts` modules with `node:test` tests. Build web components that copy the app's classes on the shared tokens. Use the app's class translation table: `text-muted` becomes `text-muted-foreground`, `text-placeholder` becomes `text-muted-foreground`, and a neutral fill `bg-muted` becomes `bg-muted-foreground`.

## Grants

Every control and every optional call is gated on its endpoint's group grant **and** its leaf grant (memory `gate-every-action-by-grant`). This rule wins over app parity: where the app disables a control without its grant, ssr hides it.

| Control or call | Group + leaf |
| --- | --- |
| Verify Account row, the strip's identity step, Add document | `TravellerService.SSRActions` + `.ProveDocument` |
| "Issue tags to this document" (set active) | `TravellerService.Travellers` + `.SetActiveDocument` |
| "Set as primary" | `TravellerService.Travellers` + `.SetPrimaryDocument` |
| My Cards row and count, the strip's payout step, the hub's cards call | `RefundService.TravellerCards` + `.ViewMine` (`cardGrants().view`) |
| Account Deletion opens the delete sheet | `IdentityService.Gdprs` + `.DeleteUserData` |
| Card actions, the bank section, move open refunds | today's `cardGrants()`: `add`, `addBank`, `rename`, `remove`, `setDefault`, `pin`, `moveRefunds` (unchanged) |
| Avatar upload | none: `POST /api/account/profile-picture` declares no permission, so any signed-in user may upload, as in the app |

The documents list (`.GetMyDocumentAffiliations`) is already required by the `(main)` layout.

## Section 1 (3a): the Profile hub, `/profile`

**Hero card** (`IdentityHero`): `gap-4 rounded-md border border-border bg-card p-4`.
- **Avatar** (64 px circle):
  - It shows the profile picture, or the user's initials on `bg-foreground/5`. The web has no blurhash.
  - In 3b, a camera chip at the bottom right opens the avatar sheet. In 3a the avatar is not tappable.
- **Name:** `[name, surname]` from the session, `text-lg font-bold`.
- **Verification badge** (`text-xs font-semibold`):
  - "Verified" with a check, `text-success`; or "Not verified" with an alert, `text-warning`.
  - Then "· {evidence level}" in muted text, shown only when there is an active document.
  - Verified means the active document's `evidenceLevel` is Medium or High (the app's `VERIFIED_FROM = "Medium"`).
  - The active document is the one the session's `TravellerDocumentId` claim names, as in `traveller-document-switcher.tsx`.
- **Document row** (`rounded-md bg-foreground/5 px-3 py-2.5`), shown only with an active document:
  - the type icon, the type label, and the number masked as `•••• ` plus its last 4 characters (unmasked when 4 characters or fewer);
  - type icons: Passport `airplane-outline`, IdCard `card-outline`, DriverLicense `car-outline`, ResidencePermit `home-outline`, HealthInsurance `medkit-outline`;
  - with more than one document, it shows `chevron-down` and opens the switcher, restyled as the app's sheet: pick a document, then "Switch to {number}". It keeps today's set-active, session refresh and `router.refresh()` flow. Its known failure for KYC-login sessions (no refresh token) is carried over, with today's error toast.
- **Setup strip**, below a `h-px bg-border` divider (`VerificationStrip`):
  - **Steps:**
    - **Identity:** done when verified. It is dropped without the ProveDocument grant.
    - **Travel document:** done when there is at least one document.
    - **Payout method:** done when there is at least one token of type `Card`. It is dropped without the cards view grant.
  - **Outstanding:**
    - the progress line "{completed} of {total} done";
    - one row per step, a check when done or an outline circle when not;
    - one CTA for the first step not done (`rounded-md bg-primary/10 px-3 py-2.5`, `shield-checkmark-outline`, title, hint, chevron).
  - **CTA destinations:**
    - identity opens the Didit dialog (below);
    - document goes to `/profile/documents`;
    - payout goes to `/profile/cards`.
  - **All done:** "Your account is ready for tax-free shopping.", `text-sm font-medium text-success`.
  - **Copy** (the app's):
    - identity: "Identity verification" / "Verify your identity" / "Required before you can claim a refund — takes about two minutes";
    - document: "Travel document" / "Add your travel document" / "Your passport or ID card is what proves you're eligible for tax-free";
    - payout: "Payout method" / "Add a payout method" / "Approved refunds can't be paid out until you add one".
- **The Didit dialog:**
  - It uses `@repo/ui/unirefund/didit-verification` with `getWorkflowForAction("ProveDocument")` from `useDiditConfig()`.
  - On an approved session it calls `postProveDocumentApi({ sessionId, kycSessionProvider: "Didit" })`, then `router.refresh()`.
  - Outcomes toast the app's text:
    - approved: "Verification complete";
    - pending: "Verification in review";
    - declined: "Verification declined";
    - cancelled: silent;
    - failed: "Verification failed".

**Groups**, using the existing `SettingsGroup` and `SettingsRowContent`, matched to the app's classes:

| Group | Rows (icon) and destination |
| --- | --- |
| Account | Personal Information (`person-outline`), `/profile/edit-profile` · My Documents (`document-text-outline`, value = document count, hidden at 0), `/profile/documents` · Verify Account (`checkmark-done-outline`, ProveDocument grant), the Didit dialog |
| Wallet | My Cards (`card-outline`, value = Card-token count, hidden at 0, cards view grant), `/profile/cards` |
| App | Language (`language-outline`, value = the current language) · Tag list style (`list-outline`, value = Current, Compact or Tinted), `/profile/tag-row-design` · Change password (`lock-closed-outline`), `/profile/change-password` |
| Legal | Privacy Policy (`shield-checkmark-outline`), `/privacy` · Account Deletion (`person-remove-outline`): with the Gdprs pair it opens the delete sheet; without it, it links to `/account-deletion` |
| (none) | Log out (`log-out-outline`, destructive), today's sign-out |

**Tag list style, `/profile/tag-row-design`:**
- The header "Tag list style" has a back button to `/profile`, and the description "Changes how each tag is drawn in your Tags list."
- Three radio cards (`flex gap-3 rounded-md border p-4`):
  - an active card is `border-info bg-info-surface`, with radio `border-info` and an inner `bg-info` dot;
  - each has a `text-sm font-semibold` label over a `text-xs` muted hint.
- The options:
  - Current: "The card you have now." (`classic`);
  - Compact: "Shorter rows with a colour bar down the edge." (`pill`);
  - Tinted: "Shorter rows, each tinted by its status." (`tinted`).
- The server reads the current value with `parseTagRowDesign`.
- A tap writes `tag-row-design=<value>; path=/; max-age=31536000; samesite=lax` at once, with no Save, then refreshes.

**Delete sheet** (`Drawer`, page width):
- An alert icon in error colour.
- "Are you sure you want to delete your account?" (`text-2xl font-bold`), then the app's description.
- A ghost "Learn more" link to `/{lang}/account-deletion`.
- A red rounded-full "Continue and Delete My Account ({n})" button:
  - it is disabled with a 10-second countdown that starts when the sheet opens and resets when it closes;
  - confirming calls the new `deleteGdprApi()` (`DELETE /api/identity/gdprs`), then `signOutServer({ redirectTo: "/" })`, and shows the success toast;
  - an error keeps the sheet open with the app's error toast.

**Hub data** (server page):
- `getMyTravellerCardsApi` runs only with the cards view grant, for the count and the payout step;
- `getProfilePictureApi(session.user.sub)` is optional;
- the documents come from `useShell().documentAffiliations`.

## Section 2 (3a): Documents, `/profile/documents`

**Header:** "My Documents", described as "Passports and ID cards linked to your account", with a back button to `/profile`.

1. **Hero** (`ActiveDocumentPanel`): `min-h-[104px] flex items-start justify-between gap-3 rounded-md border border-border bg-card p-4`.
   - The kicker "Tags are issued to" (`text-[10px] font-semibold uppercase tracking-widest` muted).
   - The number in `font-serial text-3xl font-semibold`.
   - The full name (uppercase, `text-xs` muted) and the type name.
   - On the right: a `size-10 rounded-full bg-foreground/5` type icon and the evidence badge, a solid pill `rounded-full px-2 py-0.5 text-[10px] text-primary-foreground`: None `bg-error`, Low `bg-warning`, Medium `bg-info`, High `bg-success`.
   - It follows the active document from the session claim.
2. **"DOCUMENTS"** (`text-xs font-bold uppercase tracking-widest` muted), with the count on the right. Then the tiles: `grid gap-3`, one column, and two from `sm`.
   - **Tile** (`flex flex-col gap-2 rounded-md border border-border bg-card p-4`, with `border-primary` when it is in use). It holds:
     - the type icon in an `h-9 w-9 rounded-md bg-foreground/5` slot;
     - the full name (`text-base font-semibold`);
     - "{Type} · {number}" in `text-sm` muted.
   - **Selector:**
     - in use: a `bg-primary` circle with a check and "In use";
     - otherwise: an empty `border-2 border-input` circle and "Issue tags to this document", which sets the document active (SetActiveDocument grant).
   - **Badges:** "Primary" (`bg-warning-surface`), the evidence badge, and a right-aligned outline pill "Set as primary" (`rounded-full border border-primary px-3 py-1 text-xs font-semibold text-primary`, SetPrimaryDocument grant).
   - **Pending:** a tile being changed shows `opacity-50`. Other changes are blocked with the app's "busy" toast.
   - **Toasts:** "Primary document updated", "Switched to {number}", and the app's failure texts.
3. **A dashed "Add document" tile** (`min-h-16 flex items-center justify-center gap-2 rounded-md border border-dashed border-input p-4`, `add-outline`, `text-primary`):
   - It opens the Didit dialog with ProveDocument.
   - On approval it toasts "Document added", or "Document verification updated" when the document already existed.
   - It is hidden without the grant.
4. **States:**
   - a skeleton while loading;
   - empty: a dashed card with `document-text-outline`, "No documents yet", "Add a passport or ID card so your tax-free tags can be issued in your name.", and the add button;
   - error: "Could not load your documents." with Retry.

**Data:** `useShell().documentAffiliations` (the layout's call). Every change ends with `router.refresh()`.

## Section 3 (3b): Edit profile, avatar, and Cards

**Edit profile, `/profile/edit-profile`.**
- **Header:** "Edit Profile", with a back button to `/profile`.
- **One form** with Name, Surname, Phone, Username and Email, each a labelled input with the app's icon (`person-outline`, `person-outline`, the phone input, `at-outline`, `mail-outline`).
  - Phone uses the UI kit's phone input and is validated with libphonenumber. An invalid non-empty number shows "Invalid phone number".
  - Save is disabled until name, surname, username and email are filled in.
- **Save** is pinned above the island (`PinnedBar`, `TabPage pinnedBar`).
  - It calls `putPersonalInfomationApi` with all five fields, **including email**, which today's form never sends, plus the `concurrencyStamp`.
  - On success: the toast "Profile information updated", then return to `/profile`. An error toasts the server message and the page stays.
- **Removed from the page:** the avatar block, the gradient intro, and the per-field Save buttons.

**Avatar sheet** (from the hero's camera chip; `Drawer`, page width):
- the avatar at 100 px;
- "Upload an image that represents you." and "Select a photo from your gallery.";
- a primary button that picks an image. After a pick it reads "Save".
- **Pipeline:**
  1. The picked image goes through today's square `react-easy-crop` cropper.
  2. `postProfilePictureApi(type, formData)` uploads it.
  3. `router.refresh()`, then the toast "Profile picture updated", or "Couldn't update your profile picture. Please try again."

**Cards, `/profile/cards`.** Today's logic is unchanged: `partitionTokens`, set default, rename, delete with `deletePlan`, move open refunds, and `cardGrants`. Only the presentation changes:
- **Header:** "My Cards", described as "Where your tax-free refunds are paid".
- **Hero** (`PayoutDestination`): `min-h-[104px] flex items-start justify-between gap-3 rounded-md border border-border bg-card p-4`, with `border-warning` when the card has expired.
  - The kicker "Default card".
  - `•••• 1234` in `font-serial text-3xl font-semibold`.
  - The holder's name (`text-xs uppercase` muted) and `MM/YY` (`font-serial text-xs` muted).
  - On the right: the brand logo (the UI kit's `CardBrandIcon`, size 40) and a nickname pill.
  - It replaces `CreditCardPreview` and keeps today's hero rule.
- **"CARDS"** with the count, then `grid gap-3`, one column and two from `sm`.
  - **Tile** (`flex flex-col gap-3 rounded-md border border-border bg-card p-4`, with `border-primary` for the default card, `opacity-50` while pending, and a 3 px amber left border when expired). It shows:
    - the brand slot;
    - the title, which is the nickname or `•••• NNNN`;
    - a "Last used" info badge;
    - the sub-line `•••• NNNN · MM/YY`;
    - the selector: the default shows a `bg-primary` check circle; the others show "Pay refunds here", which sets the default and is hidden when expired;
    - rename (`create-outline`) and delete (`trash-outline`, primary colour);
    - when expired, the strip "Expired — refunds can't be paid here" with a "Replace" link to the add-card sheet.
- **A dashed "Add card" tile**, with the `add` grant.
- **States:**
  - empty: a dashed card with `card-outline`, "No saved cards", "Add a card so your refunds have somewhere to land.", and an "Add card" button;
  - error with no cards: "Couldn't load your payout methods." with Try again;
  - error with cards: the app's amber banner with a Try again link.
- **Sheets:** add card, rename, delete (all four `deletePlan` faces) and move open refunds become page-width `Drawer` sheets with the app's wording.
  - The add-card sheet shows a live hero preview above the fields.
  - It keeps today's camera capture (`DocumentCapture`). The app's NFC "Tap card" stays out of the web.
- **Banks** (with `addBank` / `CreateBank`): a "BANKS" heading, the same hero shape (IBAN masked, bank name) and tiles, with today's add-bank form in a sheet.

## Ported logic (`apps/ssr/src/utils/profile/`, each with `node:test` tests)

| Module | From super-app | Provides |
| --- | --- | --- |
| `identity.ts` | `screens/traveller/Profile/profileIdentity.logic.ts` | `isVerified(evidenceLevel)` (Medium or High), `activeDocument(affiliations, claimIds)`, `setupSteps({ verified, documentCount, cardCount, canVerify, canViewCards })` returning the ordered steps, the done count and the first outstanding step |
| `document-format.ts` | the hero's mask and `TYPE_ICONS` | `maskDocumentNumber(n)`, `documentTypeIcon(type)`, `EVIDENCE_BADGE` classes |
| `tag-row-design-options.ts` | `TagRowDesignScreen` and `TAG_ROW_DESIGN_LABEL` | the three options with their label and hint keys, and `tagRowDesignCookie(value)` building the cookie string |
| `delete-countdown.ts` | `DeleteAccountModal`'s timer | `countdownLabel(seconds)` and `isConfirmEnabled(seconds)` |
| `profile-rows.ts` (existing) | — | gains the `documents`, `verify` and `tag-row-design` rows, and the delete-sheet versus link choice, with tests |

`partitionTokens`, `deletePlan`, `hasOpenRefunds` and the move-refunds logic already exist in ssr and are reused unchanged.

## Strings

New `SSRService` keys, in en and tr, worded like the app's keys:
- `MobileApp.Profile.*`: the hero badges, the setup strip, the group and row labels, and the verification outcomes;
- `MobileApp.Documents.*`: the title, the hero kicker, the tile texts, the toasts and the empty and error states;
- `MobileApp.TagRowDesign.*`: the title, description, options and hints;
- `MobileApp.DeleteAccount.*`: the question, description, Learn more, confirm, success and error;
- `MobileApp.Cards.*`: the hero kicker, tile texts, empty and error states and sheet wording, where today's `Account.Cards.*` wording differs.

Values come from super-app's `en-US.json` and `tr-TR.json`. Then run `pnpm --filter ssr run init`. Existing keys keep their names; values change only where the app's wording replaces them.

## Shared package change

- `packages/actions/core/IdentityService/delete-actions.ts` gains `deleteGdprApi()`, wrapping `client.gdprCustom.deleteApiIdentityGdprs()`. It returns the package's usual `structuredSuccessResponse` or `structuredError`. Use the client accessor name the generated `IdentityServiceClient` actually exposes.
- `packages/actions` is not a submodule; `packages/utils` is. No `packages/utils` change is expected.

## Verification

**Gates** for each PR. Re-measure each baseline first.
- `pnpm --filter ssr test:unit`: 259 at sub-project 2's head, plus the new suites.
- `pnpm --filter ssr type-check`: 0 errors.
- `pnpm --filter ssr lint`: 0 errors.
- `pnpm --filter web type-check`: 0 errors.
- `pnpm --filter ssr build` and `pnpm --filter web build`, run with no dev server up.

**Manual pass**, on ssr dev at 375 px and 1280 px, signed in as `tur-a25y29041`. Use a client no other device is signed into as the same traveller.
- **3a:**
  - the hero and badge;
  - the switcher sheet, opened and closed, with no switch confirmed if that would disturb another session;
  - the strip's states;
  - every row;
  - the Tag list style picker, checked by reading the cookie and seeing `/tags` change;
  - the Documents page and its tiles;
  - "Set as primary" on a second document, only if the account has one;
  - the Didit dialog opening. Do not complete a real verification.
  - The delete sheet opens, its countdown runs and it closes. **Never confirm the deletion.**
- **3b:**
  - Edit profile: validation, then a save with an unchanged value;
  - the avatar sheet: open and crop, and upload only a harmless image if the user agrees;
  - Cards: the hero, tiles and sheets opened and closed. Use no destructive action on real cards.

## Delivery

- **3a:** branch `feat/ssr-visual-parity-profile`, in the worktree `C:\unirefund\web-app-wt-visual-parity`, cut from `feat/ssr-visual-parity-home-tags` (#313's head). The PR targets `feat/ssr-visual-parity-home-tags`.
- **3b:** branch `feat/ssr-visual-parity-profile-cards`, cut from 3a's head. The PR targets 3a's branch.
- Each part gets its own plan, task reviews, final review and PR. Each PR is retargeted as the one below it merges.
- unirefund-web only; super-app has no change.

## Out of scope

- The app's QR button (a placeholder) and the disabled Notification preferences row.
- Fixing set-active for KYC-login sessions, an open bug in the parity report.
- The KYC register `evidenceId` / `sessionId` mismatch, an open bug in the parity report.
- `didit-upgrade-options`, which has no action wrapper and no screen in either app.
- Document deletion: no endpoint is offered to travellers in either app.
- Explore, the notifications sheet and the sign-in screens (sub-project 4).
