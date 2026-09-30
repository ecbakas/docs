# Unirefund Super App (mobile) — Traveller feature inventory

- Repo: `C:\unirefund\super-app`, branch `feat/traveller-web-parity` @ `0f582db` (caller states it equals `origin/main`). Working tree clean.
- Method: static read of the source on 2026-09-30. Nothing was built, run, or exercised on a device, and no network calls were made. All paths are relative to the repo root.
- Permissions quoted as `[perms: …]` come from the generated SDK docblocks (`src/saas/*/sdk.gen.ts`, the backend's own XML comments). "Client gate" means the app hides or disables the control unless the session's `grantedPolicies` hold the named ABP group+leaf pair (`src/utils/policies.ts` `isActionGranted`).

---

## 0. How the app decides a user is a Traveller

- **Before login, a device preference only.** `RoleGateScreen.choose` (`src/screens/shared/RoleGateScreen.tsx:89`) stores `role_preference` = `traveller` | `staff` (`src/utils/rolePreference.ts:18`, AsyncStorage). It chooses which login screen to show and nothing else (`src/utils/landingRoute.ts:18,30`). A traveller goes to `/onboarding` until the device has completed one session, and after that to `/traveller-login`.
- **After login, the role the app acts on.** `SessionProvider.getUserData` (`src/providers/SessionProvider.tsx:295`) sets it:
  - Didit sign-in passes `role: "traveller"` directly (`signInWithDidit`, `:436`).
  - Password sign-in, a stored-token bootstrap and every refresh call `resolveRoleFromAffiliations` (`:273`): `GET /api/crm-service/user-affiliations`. The primary affiliation (or the first one) decides by `partyType`: `MERCHANT`→merchant, `REFUNDPOINT`→refundPoint, `CUSTOM`→customs. Any other value, an empty list, or an error → **traveller**.
- **Where the role changes what renders:**
  - `(auth)/index.tsx:13` → `TravellerHome`
  - `(auth)/faq.tsx:12` → `TravellerFaq`
  - `(auth)/profile/index.tsx:28/35` → `IdentityTravellerProfile` by default, or the classic `TravellerProfile` (a debug flag picks)
  - `(auth)/_layout.tsx:38` → `AffiliationProvider` is mounted for staff only
  - `isStaffRole` (`src/utils/roles.ts:49`) is false for a traveller, so `tagScopeForRole` (`src/utils/tag.ts:65`) returns `"Traveller"` and the **cross-tenant** tag endpoints are used
  - `TagsTabBar` (Tags | Verifications) shows for non-staff only
  - Scan routing lets only non-staff reach the airport-validate flow (`src/utils/qr/scanDestination.ts:38`)
- **Grants are a second gate.** Many in-screen controls check granted ABP policies rather than the role. Those gates are listed per feature below. What a real traveller account holds is decided on the server (see Open questions).
- **Traveller tab bar** (`src/app/(auth)/_layout.tsx`): Home · Tags · **[centre QR scan button]** · FAQ · Profile.
  - The centre slot is the `explore` route. Its `tabPress` calls `preventDefault()` and opens the scanner (`:212-216`). The map itself is reached only by pushing from Home.
  - Push-only routes: `tags/[tagId]`, `profile/cards`, `profile/documents`, `profile/edit-profile`, `explore`, `(modals)/tag-row-design`.
  - Merchant-only routes with no traveller entry point (deep link only): `connected-devices`, `create-tag`, `(modals)/device-settings`.
- **Root routes outside the auth guard** (reachable signed in or out, `src/features/RootNavigator.tsx:33-69`): `/tag-preview`, `/validate`, `/manual-entry`, `/sticker-tag` (sends any non-issuer to `/tag-preview`, `src/screens/staff/StickerTag/StickerTagScreen.tsx:156`), `/(modals)/language-selector`, `/(modals)/debug-menu`, `/(modals)/ui-kit`, `/loading`.

---

## 1. Auth & session

### 1.1 Landing and role gate
- **Files:** `src/app/(public)/index.tsx:22`; `src/screens/shared/RoleGateScreen.tsx`
- **Behaviour:** With no stored preference the user lands on `/role-select`. That screen has:
  - a Traveller panel ("I'm a Traveller") and a Staff panel ("I'm authorized personnel")
  - a language selector
  - a role-neutral **"Scan QR"** pill on the seam between the panels (`src/screens/shared/_components/SeamScanPill.tsx:40`), so a tag can be scanned before choosing a role (§6)
- **API:** none

### 1.2 Password login
- **Files:** `src/screens/traveller/TravellerLoginScreen.tsx:49` (`handleSignIn`); `SessionProvider.signIn` (`src/providers/SessionProvider.tsx:426`); `loginWithCredentials` (`src/actions/auth/actions.ts:19`)
- **Fields:** "Email or username" and password, with a show/hide toggle. Submit stays disabled until both are filled. The password path and the Didit path share one busy flag.
- **Tenant:** clears any stored tenant before the request (`:57`, `setTenantId(null)`). Travellers authenticate against the host.
- **Calls:**
  - `GET {gateway}/.well-known/openid-configuration`: requests every advertised scope, falling back to `openid offline_access`
  - `POST {gateway}/connect/token` with `grant_type=password`, `client_id=env.oauthClientId`, `credentials: "omit"`, and no `__tenant` header
- **Tokens:** stored in SecureStore, chunked (`src/utils/auth/token.ts`).
- **Errors:** the server's `error_description` (or "Unknown error") is shown inline under the password field.
- **Also on this screen:** "Forgot your password?" (§1.5), "Continue with identity verification" (§1.3), "Create an account" (§1.4), the app version, a back arrow to `/role-select`, and 5 taps on the brand mark to open the debug menu (§13).

### 1.3 Didit login ("Continue with identity verification")
- **Files:** `useTravellerDidit.loginWithDidit` (`src/hooks/useTravellerDidit.tsx:52`)
- **Flow:**
  1. `verify("GetAccessToken")` runs the Didit SDK (§2.2).
  2. `GET /api/traveller-service/ssr-public-actions/get-email?sessionId&kycSessionProvider=Didit`.
  3. For an existing account, `signInWithDidit` (`SessionProvider.tsx:436`) clears the tenant, fetches scopes, and calls `POST /api/traveller-service/ssr-public-actions/get-access-token {sessionId, kycSessionProvider:"Didit", scope}`. It stores the access token, and the refresh token if one came back (otherwise it clears the stored one), and adopts the session as traveller.
  4. For a new account it pushes `/(public)/didit` (the create-traveller form, §1.4).
- **UX:** while the token exchange runs, the login screen is replaced by `AppShellSkeleton` (`:78`). Any failure shows the toast "Something went wrong while signing in."

### 1.4 Registration ("Create an account")
- **Files:** `registerWithDidit` (`src/hooks/useTravellerDidit.tsx:97`); `src/screens/traveller/DiditScreen.tsx:65` (`completeRegistration`)
- **Flow:**
  1. `verify("CreateTraveller")`, then `get-email`.
  2. If the account already exists: info toast "An account already exists for this identity. Reset your password to continue." and a push to the reset screen.
  3. If it is new, `DiditScreen` collects:
     - email (prefilled from Didit)
     - password (hold to reveal; **no client-side minimum length**)
     - optional phone (`PhoneInput` with country code)
  4. `POST /api/traveller-service/ssr-public-actions/create-traveller {sessionId, password, kycSessionProvider:"Didit", email:{emailAddress, type:"PERSONAL"}, telephone?:{ituCountryCode, localNumber, type:"MOBILE"}}`
  5. Success toast, then automatic sign-in via `get-access-token`.
- **UX:** back (header or hardware) asks for confirmation in an Alert (Leave / Stay). On failure a generic error appears inline.

### 1.5 Forgot or reset password
- **Files:** `resetWithDidit` (`src/hooks/useTravellerDidit.tsx:122`); `src/screens/shared/ResetPasswordScreen.tsx:41`
- **Flow:**
  1. `verify("SetPassword")`, then `get-email`.
  2. The reset screen shows the account email plus new and confirm password fields (at least 6 characters, and they must match).
  3. `POST /api/traveller-service/ssr-public-actions/set-password {sessionId, kycSessionProvider:"Didit", newPassword}`
  4. Toast, then `replace` to `/traveller-login`.
- **Scope:** logged-out only. Password reset always requires identity verification; there is no email reset link.

### 1.6 Session bootstrap
- **Files:** `SessionProvider.tsx:135-153`, `:235` (`resumeStoredSession`), `:295` (`getUserData`)
- **Token resolution:** hydrates the tenant store first. A stored access token is adopted; failing that, the refresh token is spent; failing that, the user goes to the public group. The splash is capped at 8 s.
- **`getUserData` calls:**
  - in parallel: `GET /api/account/my-profile` and `GET /api/abp/application-configuration?includeLocalizationResources=false`
  - alongside those: `GET /api/administration-service/country-settings/info` [perms: UniRefund.Settings(.GetInfo)], raced against a 5 s timeout (`src/actions/AccountService/actions.ts:21`)
  - then `GET /api/account/profile-picture/{userId}`, saved to a local file
  - then role resolution (§0)
- **Failure:** grants are revoked and the token released, which sends the user to login. The authed shell shows `AppShellSkeleton` until the role arrives (`(auth)/_layout.tsx:48`).

### 1.7 Refresh and expiry
- **On 401:** every SDK call goes through `fetchRequest` (`src/utils/customFetch.ts:6`), which retries once after a refresh.
- **Refresh:** single-flight (`src/utils/auth/refreshSession.ts:36`): `POST /connect/token grant_type=refresh_token`, with `__tenant` only if a tenant is set.
- **Proactive:** when the app returns to the foreground and the token is within 2 minutes of expiry, it refreshes (`SessionProvider.tsx:186`, `src/utils/auth/tokenExpiry.ts:4`).
- **Unrecoverable session:** tokens and stores are cleared, the toast "Your session expired. Please log in again." appears (`src/features/SessionExpiryNotice.tsx:11`), and the guards return the user to the public group. The role preference and tenant are kept.

### 1.8 Logout
- **Where:** the Profile "Logout" row.
- **Behaviour:** `signOut` (`SessionProvider.tsx:395`) clears the user, configuration, tag and pending-scan stores, the SecureStore tokens, and the role preference. The tenant is kept.
- **Gaps:** no confirmation dialog; no server-side token revocation call. The user lands on `/role-select`.

### 1.9 Tenant handling
- Travellers never see a tenant picker; both traveller sign-in paths set the tenant to `null`.
- The tag list reads cross-tenant by the `TravellerId` claim.
- The Explore map sends a hard-coded tenant header (§12).
- The debug menu can switch environment and tenant (§13).

### 1.10 Not present
none found: OTP/SMS login, magic link, social login, passkey/biometric login, "remember me", change password while signed in, email or phone verification, MFA.

---

## 2. Onboarding & identity verification

### 2.1 Onboarding slides
- **Files:** `src/app/(public)/onboarding.tsx:216`
- **Content:** 3 static slides — "Welcome to Unirefund", "Digital Tax Tags", "Fast & Secure Refunds" — with paging dots, Next / "Get Started" (→ `/traveller-login`), a language selector, and a back arrow to `/role-select`.
- **When shown:** only when the preference is traveller and the device has never completed a session (the `onboarding_seen` flag is set on the first successful session, `SessionProvider.tsx:260`).
- **Gap:** there is no Skip button. The "Skip" i18n key exists but is unused.
- **API:** none

### 2.2 The Didit verification engine
- **Files:** `src/hooks/useDiditVerify.tsx:79` (`runVerification`), `:111` (`verify`); `src/utils/didit/workflow.ts:44` (`resolveWorkflowId`)
- **Workflow choice:** SSR action → minimum evidence level (`GET /api/traveller-service/ssr-public-actions/evidence-level-requirements`) → workflow id (`GET /api/traveller-service/ssr-public-actions/didit-workflows`). The config is cached for the app run. The fallback workflow id is `8f30da2b-…`.
- **SDK call:** `startVerificationWithWorkflow` with the UI language, a close button and an exit confirmation.
- **Actions used:** `GetAccessToken`, `CreateTraveller`, `SetPassword`, `ProveDocument`.
- **Capture:** document capture, liveness and NFC chip reading happen inside the Didit SDK as its workflow is configured. None of it is app code.
- **Outcomes:**
  - `approved`: the only one that returns a session id
  - `declined`, `pending`, `failed`, `unavailable`: toast
  - `cancelled`: silent

### 2.3 "Verify Account" (Profile)
- **Files:** `src/screens/traveller/Profile/useVerifyAccount.ts:48`
- **Behaviour:** runs the Didit `ProveDocument` workflow and reports the outcome in an Alert (Approved "Your identity has been verified." / Pending / Declined / Cancelled / Failed).
- **Finding:** **the approved session is not sent to the backend.** The approved session id is only logged. Compare Add-document (§3.2), which does `POST prove-document`. The Documents list and the hero badge are not refreshed afterwards either.
- **Entry points:** in the identity profile, the Account group row "Verify Account" and the setup strip's identity step; in the classic profile, the primary row.
- **Client gate:** none.

### 2.4 Setup strip and verified badge
- **Files:** `src/screens/traveller/Profile/_components/IdentityHero.tsx:28`; `VerificationStrip.tsx:41`; `profileIdentity.logic.ts:18`
- **Badge:** "Verified" or "Not verified", plus the evidence level. Verified means the active document's `evidenceLevel` is Medium or higher.
- **Setup strip:** 3 steps (Identity verification / Travel document / Payout method) with a "n of 3 done" counter and a call to action for the first open step:
  - identity → Verify Account
  - document → My Documents
  - payout → My Cards
- **Complete:** "Your account is ready for tax-free shopping." The strip is hidden while it loads.

### 2.5 When verification is required or blocks anything
- **No client gate:** validation, claiming, cards and uploads never check verification status. Only the copy says it matters ("Required before you can claim a refund").
- **[STUB]** Home's "Verify your identity" action row is computed but never rendered (§14.1).

---

## 3. Identity documents

### 3.1 List
- **Files:** `src/screens/traveller/Documents/DocumentsScreen.tsx:85`, route `/(auth)/profile/documents`
- **Entry points:** the Profile Account group "My Documents" row (shows a count) and the setup strip.
- **API:** `GET /api/traveller-service/travellers/my-document-affiliations` [perms: TravellerService.Travellers(.GetMyDocumentAffiliations)]
- **Hero "Tags are issued to"** (`_components/ActiveDocumentPanel.tsx:32`) is the document matching the JWT `TravellerDocumentId` claim. It shows the document number, full name, type and type icon, and the evidence-level badge.
- **Grid of `DocumentCard`** (`_components/DocumentCard.tsx:74`). Each tile shows:
  - full name, and "type · number"
  - a Primary badge
  - the evidence level (None/Low/Medium/High, colour-coded)
  - an "in use" radio and a "Set as primary" pill
- **Types:** Passport, IdCard, DriverLicense, ResidencePermit, HealthInsurance.
- **States:** skeleton; error with Retry; a warning banner when a background refresh fails; an empty state with a primary Add button.

### 3.2 Add a document
- **Files:** `useTravellerDocuments.addDocument` (`src/screens/traveller/Documents/useTravellerDocuments.ts:118`)
- **Flow:**
  1. Didit `verify("ProveDocument")`.
  2. `POST /api/traveller-service/ssr-actions/prove-document {sessionId, kycSessionProvider:"Didit"}` [perms: TravellerService.SSRActions(.ProveDocument)].
  3. Refetch, then toast "Added" — or "Updated" when the returned id was already on the list (that document's evidence level was raised).
- **Client gate:** the same pair. Without it the control is disabled rather than hidden, with the note "Adding a document is not available for your account." (`DocumentsScreen.tsx:233`).
- **Capture:** only through the Didit SDK. There is no in-app MRZ scan, OCR, NFC or manual form for travellers.

### 3.3 Set the active document ("use this document")
- **Where:** the tile radio; the Home header document pill (`src/screens/traveller/Home/_components/ActiveDocumentPill.tsx:26`); the profile hero detail row. The pill and the hero open `DocumentSwitcherSheet` (`_components/DocumentSwitcherSheet.tsx:19`, pick then confirm "Switch to {number}").
- **API:** `POST /api/traveller-service/travellers/my-document-affiliations/{id}/set-active` [perms: …(.SetActiveDocument)], then `fetchNewAccessToken()` and a refetch (`useSwitchActiveDocument.ts:31`).
- **Outcomes:**
  - success: toast "Switched to {number}"
  - POST failed: toast, retry allowed
  - refresh failed: toast "Document switched, but your session could not be refreshed. Please sign in again."
- **Pill states:** hidden without a claim; a plain label with 1 document; a switcher with more than 1.
- **Client gate:** none.

### 3.4 Set primary
- **Where:** the pill on a non-primary tile.
- **API:** `POST …/my-document-affiliations/{id}/set-primary` [perms: …(.SetPrimaryDocument)], then toast and refetch (`useTravellerDocuments.ts:94`).
- **Client gate:** none.

### 3.5 Not present
- none found: delete or deactivate a document, a document detail view or images, expiry display or handling. `TravellerDocumentAffiliationDto` carries no expiry field.

---

## 4. Tags — list

### 4.1 Screen
- **Files:** `src/screens/shared/Tags/Tag/TagScreen.tsx`, route `/(auth)/tags` (tab)
- **Traveller specifics:** always a card list, never the landscape grid (`:156`); a **Tags | Verifications** segmented control (`_components/TagsTabBar.tsx:7`, `:902`).

### 4.2 Data
- **Call:** `loadTags` (`src/hooks/useLoadTags.tsx:218`) → `getTags` → `GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim` [perms: TagService.Tags(.GetTagsByTravellerId)]
- **Parameters** (`queryToParams`, `:151`): `Sorting=issueDate desc|asc`, `MaxResultCount=20`, `SkipCount=page*20`, `IssuedStartDate/IssuedEndDate` (sent only as a pair), `Status[]`.
- **Reloads:** when the role resolves, on tab focus (skeleton), on any query or page change, and on pull-to-refresh.

### 4.3 Search
- A "Search tags…" box (`_components/TagListHeader.tsx:21`), debounced 350 ms.
- **Client-side only.** It filters the rows already loaded — tag number, traveller name, merchant title (`TagScreen.tsx:259`) — so it only ever searches the current page of 20. The traveller endpoint has no text search.

### 4.4 Sort
- A newest/oldest toggle on issue date.

### 4.5 Filters
- **Files:** `_components/TagFilterSheet.tsx:47`
- **Fields:**
  - Tag number
  - Issue date, Export date, Paid date — each a preset dropdown: Any time / Today / Last 7 / Last 30 / Last 120 days
  - Risk-evaluation date — only with `TagService.TagRisks.ViewRiskLevel`
  - Risk level chips — only with `TagService.TagRisks(.FilterByRisk)`
- **Controls:** "Clear all" and "Show results". The filter button shows a badge with the active-filter count.
- **Finding:** for the traveller scope **only the issue-date range and statuses are sent** (`useLoadTags.tsx:151-156`). Tag number, Export date and Paid date are neither sent nor applied on the device. They light the filter badge and narrow nothing.
- **Gap:** there is no status filter control for travellers.

### 4.6 Pagination
- `BlobPagination` (`TagScreen.tsx:1196`), 20 per page, hidden when there is a single page.

### 4.7 Row
- **Files:** `src/screens/shared/_components/TagCard.tsx:82` (classic), or `TagRow` for the Pill/Tinted designs (§13)
- **Content:**
  - tag number
  - a localized status badge with a status-coloured rail
  - an "Early" chip when `isEarlyRefunded`
  - the headline amount (purchase `salesAmount`) and currency
  - "merchant title · issue date"
  - an urgency chip for the export-validation deadline, or for the refund deadline once the tag is validated (`src/utils/tagDeadline.ts:76`): "N days left" within 14 days, "Last day", "Overdue"
  - a risk dot, only with `ViewRiskLevel`
- **Tap:** opens the detail (guarded navigation).

### 4.8 States
- skeleton
- error with Retry — only when nothing has loaded
- empty: "No Tags Yet — Make your first purchase to create a tag"
- no match: "No tags match these filters", with Clear

### 4.9 Summary counters and grouping
- none. The summary band is staff-scope only (`:180`), and the "recently updated by you" group is staff-only (`src/hooks/useRecentTags.ts:27`).

### 4.10 Verifications tab (traveller only)
- **Files:** `TagScreen.tsx:959`; `src/hooks/useVerifications.ts:18`; `_components/VerificationList.tsx:31`
- **API:** `GET /api/tag-service/sticker-manual-verification/my?MaxResultCount=20&Sorting=creationTime desc` [perms: TagService.StickerManualVerifications(.ViewMine)]. A 403 is treated as an empty list.
- **Row:** sticker line number; a status chip (Under review / Rejected / Approved); the upload date; the rejection reason; and, on approval, "A tag was created from this pair."
- **States:** pull-to-refresh, skeleton, error with retry, empty state.
- **Header:** "Upload for verification" when upload is allowed (§14.2).
- **Gap:** no paging beyond 20.

---

## 5. Tags — detail

### 5.1 Data
- **Route:** `/(auth)/tags/[tagId]?tagNumber` → `src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx:54`; `useTagDetail` (`useTagDetail.tsx:33`)
- **Call:** traveller scope `getFullTagDetail` (`src/actions/TagService/actions.ts:306`) → `getOwnedTagByTagNumber` → `GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim/{tagNumber}` [perms: TagService.Tags(.GetTagByTagNumberCrossTenants)]
- **Returns** `TagPublicDetailDto`: tagNumber, status, issueDate, exportValidationExpirationDate, merchant (name, address string), traveller, invoices, totals.
- **Keyed by tag number.** `tagId` is ignored, so without a `tagNumber` param the screen shows the error state.
- **Extras:** `getTagDetailExtras` (`:220`) makes **no calls** for the traveller scope — no VAT statement, refund detail, risk, flight, payout token or eligibility.

### 5.2 Sections a traveller sees
- **Identity card** (`_components/TagIdentityCard.tsx:54`): tag number, status badge, headline amount captioned by what it is — Refund, Refund estimate (gross), Purchase, or none. The refund-method badge, "Paid early" badge and risk pill are staff-only.
- **Deadline card** (`_components/TagDeadlineCard.tsx:36`, traveller-only per `:65`):
  - "Validate by {date}" with a countdown ("N days left", "Last day", "Overdue by N days")
  - tone: under 3 days error, up to 14 days warning
  - a "claim by" (refund) deadline can never show: the public DTO has no `refundExpirationDate`
- **Progress journey** (`_components/TagJourney.tsx:79`, `src/utils/tagJourney.ts:83`):
  - steps: Draft → Issued → Export validated (or Waiting / Rejected) → Refund → (VAT statement, staff only); Cancelled replaces the tail
  - completion is derived from status
  - dates come from the issue date only; the pending export step shows "Validate by {date}"
  - the Issued step carries "Store name"
- **Amounts** (`_components/TagAmounts.tsx:77`):
  - rows: Purchase, of which VAT, Gross refund, then fees (Refund fee / Agent refund fee / Early refund fee) as deductions, and the net Refund emphasized
  - an exchange-rate footnote when the rate is not 1
  - "Fees are applied when the refund is issued." when there are no fee rows and the tag is not paid
  - no earnings, and **no payout-destination row** (the payout token is resolved for staff only)
- **Purchase** (`_components/TagPurchase.tsx:24`): one collapsible per invoice, with number, total, VAT amount and issue date. Lines show description, amount, tax base, and a VAT-rate badge; no product group for travellers.
- **Details:**
  - Traveller block (`_components/TagDetailBlocks.tsx:11`): name, document number, nationality, residence; collapsed
  - Store block (`:174`): name and address
  - Flight, Tour, Risk and Documents (QR/public link, signatures, sticker line) are staff-only or grant-gated and render nothing for a traveller.

### 5.3 Actions
- The footer comes from `TAG_ACTION_RULES` (`src/utils/tagActions.ts:193`), gated only by grants and status. A traveller with no staff grants gets **no footer action**. Were a traveller to hold the refund grants, "Refund" would push to Home.
- none found: traveller-specific actions such as pinning a card to this tag, share, PDF/receipt download, report a problem, or request an early refund.

### 5.4 States
- skeleton
- 403: "Couldn't load", with no Retry
- other error: Retry
- a failed reload keeps the detail already on screen
- back: `router.back()`, or `/(auth)/tags` as the fallback

---

## 6. Tag lookup / public tag / QR

### 6.1 Scanner
- **Entry points:** the centre tab button (`(auth)/_layout.tsx:212`), Home's empty-state "Scan a tag" (`src/screens/traveller/Home/HomeScreen.tsx:214`), and the role-gate "Scan QR" pill before login.
- **Component:** `QrScanner` (`src/components/QrScanner.tsx:104`) — vision-camera back camera, a permission screen, and the formats QR, PDF417, Aztec, DataMatrix, Code128/39/93, EAN-13/8, ITF, UPC-A/E, Codabar. The first read wins.
- none found: torch, scanning from an image.

### 6.2 Routing
- **Files:** `src/utils/qr/classifyScan.ts:38`; `src/utils/qr/scanDestination.ts:38`; `src/hooks/useScanRouting.ts:21`
- **Rules:**
  - airport QR (a `/validate` path plus `qrValue`) → `/validate?qrValue`
  - tag QR (`…/tag/<slug>` or a bare slug; the slug encodes tagId, tagNumber, travellerDocumentNumber, stickerLineNumber) → `/tag-preview`
  - a tag carrying neither a tagId nor both tagNumber and document → the traveller goes to `/manual-entry` in Tag mode with the number prefilled
  - sticker slug → `/tag-preview?stickerLineNumber`
  - a bare Code128 value → treated as a tag number
  - anything else → toast "Unrecognized code"

### 6.3 Manual entry
- **Files:** `/manual-entry` → `src/screens/shared/ManualEntryScreen.tsx:39`; `src/utils/qr/manualEntry.ts:30`
- **Modes:** Sticker (line number) or Tag (tag number **plus** passport/document number, both required for a traveller).
- **Routing:** it feeds the same scan routing as the camera.
- **[FLAGGED OFF]** the scanner's "can't scan?" link (`SHOW_MANUAL_ENTRY_LINK = false`, `QrScanner.tsx:76`). Manual entry is reachable only through the redirect in §6.2.

### 6.4 Public tag preview
- **Files:** `/tag-preview` → `src/screens/shared/TagPreviewScreen.tsx:52`. Works signed out.
- **Anonymous reads** (no bearer token):
  - `GET /api/tag-service/public/tag/by-tag-id/{id}`
  - `GET /api/tag-service/public/tag?tagNumber&travellerDocumentNumber`
  - `GET /api/tag-service/public/tag/by-sticker-line-number?stickerLineNumber`
- **Content:** identity card, deadline card, amounts, invoices, store block, and an info line. The **traveller block is hidden from non-staff** because the endpoint is anonymous (`:355`).
- **Tag kind** (`deriveTagKind`, `src/utils/tag.ts:40`): draft (status Draft and no traveller), issued, or divergent.

### 6.5 Claim (self-assign)
- **Draft, signed in:** "Claim this tag" (`TagPreviewScreen.tsx:119`) → `POST /api/tag-service/tag/traveller-self-assign {tagNumber, salesAmount}` [perms: TagService.Tags(.TravellerSelfAssign)]. `salesAmount` is the SalesAmount total, or the invoice sum (`src/utils/tag.ts:23`). Then toast, list reload, and `replace` to the detail.
- **Draft, signed out:** "Log in to claim" (`:185`) stores a pending `{type:"claim"}` (`src/store/pendingScan.ts:12`) and goes to `/traveller-login`. The claim runs automatically once the shell mounts (`src/hooks/useResumePendingScan.tsx:14`), then opens the detail.
- **Issued:** "View in my tags" when signed in (the detail fails if the tag is not this traveller's), otherwise "Log in to see your tags".
- **Divergent:** an explanation and no action.
- **Other states:** "Tag not found", and "No tax-free tag has been issued on this sticker yet".
- **Unused:** `postTagTravellerSelfAssignByTagId` (`src/actions/TagService/actions.ts:131`) is defined but nothing calls it; every claim goes by number plus sales amount.
- **Staff only, same screen:** assign-traveller and the SearchTraveller picker (grant TagService.Tags(.AssignTraveller)).

---

## 7. Validation (airport self-validation)

- **Route:** `/validate?qrValue` (`src/app/validate.tsx`) → `src/screens/traveller/ValidateScreen.tsx:47`. It is a root route, so it can be reached signed out.
- **Entry points:** scanning a kiosk QR (the scan button, Home, the role-gate pill), a pending-validate resume after login, or a deep link. Staff scans are refused with "Airport validation is available to travellers only."

### Steps
1. **Gate.**
   - While the profile loads behind a session: `ValidateGateSkeleton`.
   - Signed out (`:295`): "Log in to validate" → `goLogin` (`:272`) stores a pending `{type:"validate", qrValue}` → `/traveller-login` → auto-resume to `/validate`.
   - There is no role check and no KYC/verification check.
2. **Location** (`requestLocation`, `:91`; `src/utils/location.ts:17`). "Allow location" asks for foreground permission and reads the position at Balanced accuracy. Denied, unsupported or unavailable each show an inline message.
3. **Flight ticket** (`src/screens/traveller/Validate/FlightInfoStep.tsx:57`).
   - An editable boarding-pass form: departure and destination IATA (3 characters), flight number, PNR, passenger name.
   - "Scan boarding pass": the scanner narrowed to PDF417/Aztec/QR/DataMatrix (`:37`), parsed by the BCBP parser (`src/utils/qr/bcbp.ts:12`). It keeps scanning until a read yields flight fields, and a scan merges into what was typed.
   - A scan also fills and sends `rawBarcodeData`, airlineCode, flightDate, compartment, seat, sequence number, passenger status and e-ticket indicator.
   - A warning appears for an unreadable pass.
   - Submit stays disabled until at least one of flightNumber, departure, destination, PNR, seat or passengerName is present (`:254`).
4. **Payout card** (`src/screens/traveller/Validate/PayoutCardStep.tsx:40`).
   - `GET /api/refund-service/traveller-cards/mine`; **Card type only**, banks excluded (`:78`).
   - Sorted, with the preselection last-used → default (`src/screens/shared/Tags/Tag/_components/refund/refund.logic.ts`); the list is expandable.
   - "Add a new card" appears with the Create grant (`:173`) and opens `AddCardSheet` (§9).
   - "Continue to validate" needs a selected card (`:212`). With the pin grant (`TagService.Tags(.TravellerSetPayoutToken)`) it calls `POST /api/tag-service/tag/traveller-payout-token {payoutTokenId}` (`handleContinue`, `:108`); without the grant it skips the pin.
   - If the pin fails: a warning, "Try again", and "Continue without saving it".
   - A traveller with no card and no Create grant cannot continue.
5. **Validating** (`runScan`, `:110`). `POST /api/export-validation-service/qr-evidence/{qrValue}/scan {latitude, longitude, flightTicket}` (the SDK lists no permission).
   - 401 → "session expired" state → "Try again" logs in again with the pending validate.
   - The body contains "QR record is not active" → the QR-inactive state → "Rescan" opens the scanner for a new QR, then the scan re-runs.
   - Any other error → the failed state showing the server's localized message → "Try again" returns to step 3.
6. **Results** (`src/screens/traveller/Validate/ScanResultView.tsx:47`).
   - Four accordion buckets with counts:
     - **Validated** (green): "cleared for refund"
     - **Already validated** (blue)
     - **Needs customs** (red), with "Suggested exit points" (`:273`)
     - **Rejected by customs**
   - Rows are enriched through `GET …/cross-tenants/by-traveller-id-claim?TagIds=…&MaxResultCount=999` (`:151`): tag number, merchant, purchase amount; a skeleton per id while that loads.
   - An empty state covers a scan that returns no tags.
   - Pinned footer:
     - **"Claim another tag"** opens `src/screens/traveller/Validate/ClaimTagModal.tsx:36`. It is scan-only and needs a tagId in the QR (`:105`). It reads the tag anonymously by id and, for a draft, claims it by self-assign. It then offers "Scan another" / "Done". Closing after any claim attempt re-runs the validation scan, and newly claimed rows are marked with a purple "Just claimed".
     - **"Done"** replaces to `/(auth)/tags`.
- **Back** walks back one step at a time (`handleBack`, `:253`). Leaving the results leaves the flow.

---

## 8. Refunds

- **none found** for a traveller: creating or requesting a refund, choosing a refund method, requesting an early refund, or recording a payment.
  - The refund flow (`RefundSurface`, `useRefundHomeFlow`) is for refund points only: `canShowRefundable` requires `role === "refundPoint"` (`src/utils/tagListMode.ts:19`).
- **Where refunds are paid:** the default payout card, and the card pinned to open tags (§7 step 4, §9).
- **Refund status is visible through:**
  - tag status badges (Refunded, EarlyRefunded, PaymentInProgress, PaymentProblem, PaymentBlocked, …)
  - the "Early" chip in the list
  - the Refund step of the journey
  - the amounts statement (net refund and fees)
  - Home's "You'll receive" / "already paid" totals (§14.1)
- **Early refund:** display only. The tenant flag `EarlyRefundAvailable` affects only the staff "Refund" footer action.
- **Refund-point details on the journey** (refund point name, method) are staff-only; they need `RefundService.Refunds.Detail` and the staff DTO.
- **Refund points:** shown only as a map layer (§12).

---

## 9. Payout cards ("My Cards")

- **Route:** `/(auth)/profile/cards` → `src/screens/traveller/Cards/CardsScreen.tsx:71`
- **Entry points:** Home's "Payout methods" tile ("N saved"), the Profile Wallet row (count), and the setup strip.
- **Client gates** (`src/screens/traveller/Cards/useCardGrants.ts:7`):

  | Action | Grants required |
  |---|---|
  | setDefault | RefundService.TravellerCards(.SetDefault) |
  | rename | (.UpdateNickname) |
  | remove | (.Delete) |
  | add | (.Create) |
  | pin | TagService.Tags(.TravellerSetPayoutToken) |
  | moveRefunds | setDefault **and** TagService.Tags(.GetTagsByTravellerId, .TravellerSetPayoutToken) |

  Each control renders only with its grant.

### 9.1 List
- **API:** `GET /api/refund-service/traveller-cards/mine?includeExpired=true&maxResultCount=100` [perms: RefundService.TravellerCards(.ViewMine)] (`src/actions/RefundService/actions.ts:19`). Card-type tokens only; wallet tokens are dropped and bank tokens hidden (`useCards.ts:61`).
- **Hero `PayoutDestination`** ("Default card"): masked number, holder, expiry, nickname, brand, and a warning when expired. Which card takes the slot (`partitionTokens.ts:27`): the default, else the last used and unexpired, else the first unexpired, else the first.
- **Tile grid of `MethodTile`** (`_components/MethodTile.tsx:25`):
  - a brand logo (Visa/Mastercard/Amex/Discover/Diners/JCB, detected from the number prefix, `src/utils/card/card.ts:37`), or a generic card glyph
  - nickname or "•••• 1234", then "tail · expiry"
  - a "Last used" badge
  - a default radio
  - rename and delete icons
  - for an expired card: an amber stripe, "Expired — refunds can't be paid here", and a "Replace" link
- **Add tile** as the last cell of the grid.
- **States:** skeleton; error with Retry; a warning banner when a background refresh fails; empty "No cards" with a primary Add button.

### 9.2 Add a card
- **Files:** `_components/AddCardSheet.tsx:36` (bottom sheet at 85%)
- **Fields:**
  - card number: Luhn-checked, grouped by brand
  - expiry `MM/YY`: shape-checked and must not be expired
  - holder name: optional, up to 256
  - nickname: optional, up to 64
- **Live preview:** the destination panel above the form.
- **Capture options:**
  - **"Tap card"** — contactless EMV read over NFC, Android only, offered only when the hardware exists (`src/hooks/useNfcSupported.ts:17`, `src/components/card/NfcCardModal.tsx:17`). A switched-off radio leads to a settings prompt. iOS never offers it (CoreNFC cannot read payment cards).
  - **"Scan card"** (`src/components/card/useCardScan.ts:25`) — the platform scanner when available (Google Pay card recognition on Android, VisionKit on iOS; a Google Pay TEST result is ignored). Otherwise the camera OCR scanner (`src/components/card/CardScannerModal.tsx:168`, ML Kit), which after 5 unreadable frames escalates to the document-extraction platform (`POST {EXPO_PUBLIC extractionUrl}/api/app/extraction-run/submit-and-wait` with an X-Api-Key, `src/actions/DocumentExtraction/post.ts:46`), at most 2 times per session.
  - Captures fill only number and expiry; the rest is typed.
- **Submit:**
  1. Resolve the traveller id from the JWT `TravellerId` claim, falling back to `GET /api/traveller-service/travellers/my-document-affiliations` (`src/utils/card/traveller-id.ts:14`). Without an id: "We couldn't identify your traveller profile, so cards can't be added right now."
  2. `POST /api/refund-service/traveller-cards {travellerId, cardNumber, cardExpiryMonth, cardExpiryYear, holderName?, nickname?}` [perms: …(.Create)]. Adding the same card again returns the existing token.
  3. Success toast; the list refreshes.
  4. With open refunds, the "Use {card} for refunds?" prompt follows (§9.6).

### 9.3 Set default
- **Where:** the tile radio (never offered on an expired card).
- **API:** `POST /api/refund-service/traveller-cards/{id}/set-default`, then a toast. With open refunds the toast is suppressed and the move prompt opens instead (`CardsScreen.tsx:135`).

### 9.4 Rename
- **Where:** the pencil icon or tapping the title → `_components/EditNicknameSheet.tsx:10` (up to 64; blank clears).
- **API:** `PUT /api/refund-service/traveller-cards/{id}/nickname {nickname|null}`

### 9.5 Delete
- **Where:** trash icon → `_components/DeleteTokenSheet.tsx:21`.
- **The plan** (`openRefunds.ts:41`) depends on whether open refunds exist:

  | Plan | When | What happens |
  |---|---|---|
  | plain | no open refunds | delete |
  | moveToHero | a valid default exists | "all your open refunds move to {card}", then delete |
  | choose | several valid cards | pick the target from a list, then delete |
  | noTarget | no other valid card | "Add card" or "Delete anyway" |

- **Moving then deleting** (`moveRefunds.ts:47`): set-default on the target if it isn't already, then `POST /api/tag-service/tag/traveller-payout-token {payoutTokenId}`, then `DELETE /api/refund-service/traveller-cards/{id}` (a soft delete).
- **Failures** are reported separately for each step, with Retry.

### 9.6 Move open refunds between cards
- **Files:** `_components/MoveRefundsSheet.tsx:24`
- **When:** after setting a new default ("Move your open refunds too?") or after adding a card ("Use {card} for refunds?").
- **API:** set-default when needed, then `POST /api/tag-service/tag/traveller-payout-token`. Success toast "moved".
- **"Open refunds" check** (`useHasOpenRefunds.ts:11`): `GET …/cross-tenants/by-traveller-id-claim?Status=[Open, PreIssued, Issued, WaitingGoodsValidation, WaitingStampValidation, ExportValidated]&MaxResultCount=999`; any tag that is not red-risk counts.

### 9.7 Pin a card to a tag
- none found per tag. The pin endpoint takes only the token and applies it to **every** open tag, server-side, across tenants. It is used by the validate payout step (§7) and by moves/deletes.

### 9.8 Bank accounts [FLAGGED OFF]
- `AddBankSheet` (`_components/AddBankSheet.tsx:27`: IBAN, BIC, bank name, country, holder → `POST /api/refund-service/traveller-cards/bank`), `BankPanel` and `BankRow` exist but are not mounted (`CardsScreen.tsx:282`).
- Bank tokens are still fetched and then hidden. The Home and Profile counts still include them (`useProfileIdentity.ts:79`).

---

## 10. Profile & account

### 10.1 Profile screens
- **Identity design** (the default, `src/store/profileDesign.ts:22`) — `src/screens/traveller/Profile/IdentityProfileScreen.tsx:45`:
  - **Hero** (`src/screens/shared/Profile/_components/ProfileHero.tsx:79`): avatar (tap to change, §10.3), full name, the verification badge and level, the active document as "type •••• last 4" (tap to open the switcher when there is more than 1 document), a QR button, and the setup strip (§2.4).
  - **Account group:** Personal Info; My Documents (count); Verify Account.
  - **Wallet group:** My Cards (count).
  - **App group:** App Language (shows the language's own name); Tag row design (shows the current value); Notification Preferences **[STUB — disabled row]** (`:125`).
  - **Legal group:** Privacy Policy; Account Deletion.
  - **Logout** (destructive style).
- **Classic design** (only via the debug menu) — `src/screens/traveller/Profile/ProfileScreen.tsx:16`:
  - `UserCard`: avatar, name, QR.
  - A list/grid layout toggle.
  - Rows: Verify Account (primary), Personal Info, My Cards, My Documents, App Language, Notification Preferences **[STUB — disabled]**, Logout.
  - Legal: Privacy Policy, Account Deletion.
  - There is no Tag-row-design row.

### 10.2 Edit profile ("Personal Info")
- **Files:** `/(auth)/profile/edit-profile` → `src/screens/shared/Profile/EditProfileScreen.tsx`
- **Fields:** Name, Surname, Username and Email are required; Phone is optional (libphonenumber validation, invalid → inline error).
- **Save:** a loading overlay, then `PUT /api/account/my-profile` with `{...user, name, surname, phoneNumber, userName}` (`src/actions/auth/post.ts:5`). The server's error message shows inline; success shows the toast "Profile Updated" and updates the store.
- **Finding:** **the Email field is editable and required, but the edit is never sent.** `updatedProfile` (`:43`) omits `emailInput`, so the old email passes through unchanged.

### 10.3 Profile picture
- **Files:** `src/screens/shared/Profile/_components/AvatarModal.tsx:31/44/56`
- **Flow:** pick from the gallery only (square crop), then "Save" → `POST /api/account/profile-picture?type=2` (multipart `ImageContent`; `__tenant` sent if set) → `GET /api/account/profile-picture/{id}` → toast "Profile Picture Updated".
- **Gaps:** no camera option and no way to remove a picture.
- **Observation:** the upload promise has no `catch`, so a failed upload leaves the `/loading` overlay (which blocks hardware back) on screen.

### 10.4 QR code (profile)
- `src/screens/shared/Profile/_components/QrCodeModal.tsx:33`: **[STUB]** the QR encodes the literal `"UNIREFUND"`, with the avatar as its logo.

### 10.5 Delete account
- **Files:** `src/screens/shared/Profile/_components/DeleteAccountModal.tsx:29`
- **Flow:** a warning sheet whose delete button unlocks after a **10 s countdown** (`:26`); a "Learn more" link to `https://ssr.unirefund.com/en/account-deletion`; then `DELETE /api/identity/gdprs` [perms: IdentityService.Gdprs(.DeleteUserData), not checked by the client] → sign out → toast → `/role-select`. An error shows a toast.

### 10.6 Legal pages
- `src/screens/shared/Profile/useLegalMenuItems.tsx:18-23`: Privacy Policy opens `https://ssr.unirefund.com/en/privacy` in the external browser.
- none found: Terms of Use.

### 10.7 FAQ (tab)
- `src/screens/traveller/FAQ/FaqScreen.tsx:7`: static accordions.
  - "Tax Free": What is tax free / Who is eligible / How to claim
  - "Tags": How to create / When customs approval / How refund works
- none found: search, contact, feedback.

### 10.8 Not present
- none found: change password while signed in, change email or phone with verification, data export, marketing consent.

---

## 11. Notifications

### 11.1 Inbox
- **Entry:** a bell in every `TabPage` header with an unread-count badge (`src/templates/TabPage.tsx:56,114`). It opens `NotificationsSheet` (`src/screens/shared/Notifications/NotificationsSheet.tsx:24`, a bottom sheet at 70%).
- **Provider:** Novu, hosted (`src/providers/NotificationsProvider.tsx:17-19`: API `https://novuapi.clomerce.com`, socket `wss://novuws.clomerce.com`, app id `mkLEnSh7ClRq`). The subscriber is the JWT `sub` (`:112`). With no session there is no inbox.
- **Behaviour:** opening the sheet **marks everything read** (`readAll`, `:39`); closing it refetches.
- **Items:** subject (with a fallback), body (2 lines, expandable when over 100 characters), relative time, and a "New" badge on unread items.
- **Header:** the total count and the unread count. "Load more" pages further; there is an empty state and a loading skeleton.
- none found: tap-through or deep link from a notification, per-item read/archive/delete, filters.

### 11.2 Push
- none found. There is no `expo-notifications` dependency and no device-token registration.

### 11.3 Preferences
- The "Notification Preferences" row is **[STUB]**, a disabled no-op in both profile designs.

---

## 12. Explore / map

- **Entry:** only from Home — the "Tax-Free Locations" tile, or the prominent card when there are no tags. Route `/(auth)/explore` → `src/screens/shared/Explore/ExploreScreen.tsx:31`. The tab bar stays visible.
- **Map:** MapLibre with the OpenFreeMap "liberty" style (`_components/ExploreMap.tsx:77`), opening on Istanbul at zoom 9 (`:79`).
- **Layers sheet:** Merchants (on by default, `:42`), Customs, Refund points.
- **Data** — anonymous, with a **hard-coded `__tenant: df64152b-9f76-e06b-d43f-3a1bd9644ea9`** (the dev tenant, `src/actions/CRMService/actions.ts:71`):
  - `GET /api/crm-service/public/merchants/viewport {south, north, west, east, sector?}`
  - `GET /api/crm-service/public/customs/viewport {…}`
  - `GET /api/crm-service/public/refund-points/viewport {…}`
  - Requests are debounced 350 ms, and spans over 180° are skipped. The server answers with either pins or clusters (count bubbles).
- **Pin tap** → `PlaceDetailSheet` (`_components/PlaceDetailSheet.tsx:11`): name, address (or "no address"), sector badges for merchants, and "Google Maps" / "Apple Maps" directions links.
- **Sector filter:** merchant sectors are derived from the visible pins, with an "All" option.
- **Place search:** the Photon geocoder (`https://photon.komoot.io/api`, 6 results, in the UI language) flies the map to the pick.
- **Controls:** locate me (location permission; a toast when denied, unsupported or unavailable), zoom in, zoom out.
- **[TODO]** tapping a cluster does nothing (`ExploreMap.tsx:215`).
- **Errors:** a failed layer fetch is only logged; there is no UI for it (`_components/useViewportLayer.ts:64`).
- none found: list view, opening hours, contact details, filters beyond sector.

---

## 13. Settings & misc

- **Language:** en-US and tr-TR. The picker (`src/screens/shared/LanguageSelectionScreen.tsx:61`) has a search box and is reachable from the role gate, onboarding and the profile. The choice is persisted (`locale`); the default comes from the device locale. The API calls send no `Accept-Language` header (`src/actions/lib.ts`).
- **Theme:** light only, forced in the root layout (`Appearance.setColorScheme("light")`). No dark mode.
- **Tag row design:** `/(auth)/(modals)/tag-row-design` (`src/screens/shared/Settings/TagRowDesignScreen.tsx:20`) — Classic (default, `src/store/tagRowDesign.ts:23`), Pill or Tinted, persisted per install. Only the identity profile links to it.
- **Profile design:** Identity (default) or Classic, switchable in the debug menu only.
- **Debug menu:**
  - Opened by 5 taps on the brand mark of the traveller or staff login screen (`src/hooks/useBrandDebugGesture.ts:4`) → `/(modals)/debug-menu`.
  - Contains:
    - the component-kit screen
    - environment chips live/uat/dev (default **dev**, `src/utils/environment.ts:103`)
    - a tenant picker (`GET /api/saas/public-tenants`)
    - "Resolve a tenant by name" (`GET /api/abp/multi-tenancy/tenants/by-name/{name}`)
    - the profile design picker
  - There is no entry point once signed in.
- **App version:** "v1.0.2" on the traveller login (`src/components/AppVersion.tsx`).
- **Support / chat:** none found.
- **Deep links:**
  - Custom scheme `unirefundsuperapp://`.
  - Universal links for `https://tur.unirefund.com` (`app.config.js:4`; an Android `autoVerify` intent filter; iOS `applinks:` and `appclips:`).
  - Linkable root routes: `/validate?qrValue`, `/tag-preview?tagId | tagNumber&travellerDocumentNumber | stickerLineNumber`, `/manual-entry`, `/sticker-tag`.
  - There is no `+native-intent` rewrite, so the web QR URL shapes (`/{lang}/validate?qrValue=`, `/tag/<slug>`) have no matching app route. Unverified on a device.
- **Offline:** none found — no offline cache and no connectivity detection. A failed first load shows an error with Retry. A failed background refresh keeps the content and shows a warning banner (Home, Cards, Documents).
- **Other:** phones are locked to portrait and tablets may rotate (traveller tags stay as cards). `expo-keep-awake` runs app-wide, from `SessionProvider`.

---

## 14. Other traveller features

### 14.1 Home dashboard
- **Files:** `src/screens/traveller/Home/HomeScreen.tsx`; `useHomeStatus.ts:44`; `homeStatus.logic.ts`
- **Header:** "Hello, {name}" (or "Guest"), the active-document pill (§3.3), and the notification bell.
- **On focus:** clears any active tag filter and reloads the tag list silently (`:50`).
- **Body:**
  - loading: skeleton
  - error with no tags: error with Retry
  - no tags: `HomeStartCard` ("No tags yet — Shop tax-free, then scan the tag on your receipt to claim it." with a "Scan a tag" button) plus the prominent map card
  - otherwise `RefundSummaryCard` (`_components/RefundSummary.tsx:20`, `homeStatus.logic.ts:46`):
    - "You'll receive": the largest-currency total as the headline, other currencies below it, and "· estimated" when only gross amounts are known
    - "N tags · N not yet calculated"
    - "X CUR already paid" per currency
    - buckets: expected = PreIssued…PaymentBlocked; received = Refunded or EarlyRefunded (`src/utils/tagMoney.ts:14`)
- **"Last tag" section:** a hero `LatestTag` card (the first tag in the store, refund amount first) and "View all".
- **Shortcut tiles** (`:72`): "Upload for verification" (when upload is allowed); "Tax-Free Locations" (when there are tags); "Payout methods · N saved" (→ Cards).
- **[STUB]** the "Needs you" action list — stamp, collect, payment problem, add payout, verify identity, each with its deadline — is computed by `buildHomeActions` (`homeStatus.logic.ts:192`), and `ActionList` exists (`_components/ActionList.tsx:31`), but `HomeScreen` never renders it. The i18n key `Home.Actions.correction` is unused as well.
- **Observation:** the summary and the latest tag read the **tag store's current page** (at most the 20 newest tags). The page resets to 0 only when a filter was active, so for a traveller with more than 20 tags the totals cover only one page.

### 14.2 Manual sticker verification upload
For a paper receipt: the traveller uploads a sticker photo and a stamped-receipt photo, and a tag is created on review.
- **Files:** `src/screens/shared/Tags/Tag/_components/UploadVerificationSheet.tsx:53` (sheet at 90%)
- **Photos:** a sticker photo and a "receipt & customs stamp" photo, each by camera or gallery, resized before upload.
- **Sticker line number:** read automatically from the QR in the sticker photo and editable, with the note "Read from your photo — check it matches the sticker".
- **Submit:** `POST /api/tag-service/sticker-manual-verification {stickerLineNumber, frontPictureBase64, backPictureBase64}` (`:204`) [perms: TagService.StickerManualVerifications(.Upload)] → success toast → switches to Tags › Verifications (§4.10). On failure the server's business message is shown.
- **Gate:** non-staff plus that grant (`src/hooks/useCanUploadVerification.ts:13`); otherwise the entry points are hidden.
- **Entry points:** the Home tile and the Verifications tab header.

### 14.3 Claim tags
- Covered in §6.5 (preview, and resuming after login) and §7 (claim inside the validation results).

---

## Flat API table — every traveller-reachable call

| # | Action (`src/actions/…`) | SDK method | HTTP | Permissions (SDK doc) | Used by |
|---|---|---|---|---|---|
| 1 | `getSupportedScopes` (auth/actions.ts:10) | — (fetch) | GET `{gw}/.well-known/openid-configuration` | anon | §1.2, §1.3, §1.4 |
| 2 | `loginWithCredentials` (auth/actions.ts:19) | — (fetch) | POST `{gw}/connect/token` (password grant) | anon | §1.2 |
| 3 | `fetchNewAccessTokenByRefreshToken` (auth/actions.ts:79) | — (fetch) | POST `{gw}/connect/token` (refresh_token grant) | anon | §1.7, §3.3 (after a switch) |
| 4 | `getUserProfileApi` (AccountService/actions.ts:83) | `profile.getApiAccountMyProfile` | GET `/api/account/my-profile` | auth | §1.6 bootstrap |
| 5 | `getApplicationConfigurationApi` (AccountService/actions.ts:21) | `abpApplicationConfiguration.getApiAbpApplicationConfiguration` | GET `/api/abp/application-configuration?includeLocalizationResources=false` | auth | §1.6 (grants, currency, EarlyRefundAvailable) |
| 6 | `getCountrySettingsInfo` (AdministrationService/actions.ts:4) | `countrySetting.getApiAdministrationServiceCountrySettingsInfo` | GET `/api/administration-service/country-settings/info` | UniRefund.Settings(.GetInfo) | §1.6 (5 s timeout) |
| 7 | `getProfilePictureByIdApi` (AccountService/actions.ts:53) | `account.getApiAccountProfilePictureById` | GET `/api/account/profile-picture/{id}` | auth | §1.6, §10.3 |
| 8 | `getUserAffiliationsApi` (CRMService/actions.ts:35) | `userAffiliation.getApiCrmServiceUserAffiliations` | GET `/api/crm-service/user-affiliations` | CRMService.UserAffiliations(.View) | §0 role resolution (password / bootstrap / refresh) |
| 9 | `getTravellerAccessToken` (TravellerService/actions.ts:23) | `ssrActionPublic.postApiTravellerServiceSsrPublicActionsGetAccessToken` | POST `/api/traveller-service/ssr-public-actions/get-access-token` | anon | §1.3, §1.4 |
| 10 | `getTravellerEmail` (TravellerService/actions.ts:36) | `ssrActionPublic.getApiTravellerServiceSsrPublicActionsGetEmail` | GET `/api/traveller-service/ssr-public-actions/get-email` | anon | §1.3, §1.4, §1.5 |
| 11 | `postCreateTraveller` (TravellerService/actions.ts:10) | `ssrActionPublic.postApiTravellerServiceSsrPublicActionsCreateTraveller` | POST `/api/traveller-service/ssr-public-actions/create-traveller` | anon | §1.4 |
| 12 | `postSetPassword` (TravellerService/actions.ts:51) | `ssrActionPublic.postApiTravellerServiceSsrPublicActionsSetPassword` | POST `/api/traveller-service/ssr-public-actions/set-password` | anon | §1.5 |
| 13 | `getDiditWorkflows` (TravellerService/actions.ts:67) | `ssrActionPublic.getApiTravellerServiceSsrPublicActionsDiditWorkflows` | GET `/api/traveller-service/ssr-public-actions/didit-workflows` | anon | §2.2 (every Didit flow) |
| 14 | `getEvidenceLevelRequirements` (TravellerService/actions.ts:75) | `ssrActionPublic.getApiTravellerServiceSsrPublicActionsEvidenceLevelRequirements` | GET `/api/traveller-service/ssr-public-actions/evidence-level-requirements` | anon | §2.2 |
| 15 | `getMyDocumentAffiliations` (TravellerService/actions.ts:114) | `traveller.getApiTravellerServiceTravellersMyDocumentAffiliations` | GET `/api/traveller-service/travellers/my-document-affiliations` | TravellerService.Travellers(.GetMyDocumentAffiliations) | §3.1, §3.3 pill/switcher, §2.4 hero, §9.2 traveller-id fallback |
| 16 | `postProveDocumentApi` (TravellerService/post.ts:20) | `ssrAction.postApiTravellerServiceSsrActionsProveDocument` | POST `/api/traveller-service/ssr-actions/prove-document` | TravellerService.SSRActions(.ProveDocument) | §3.2 |
| 17 | `postSetPrimaryDocumentApi` (TravellerService/post.ts:34) | `traveller.postApi…MyDocumentAffiliationsByTravellerDocumentIdSetPrimary` | POST `/api/traveller-service/travellers/my-document-affiliations/{id}/set-primary` | TravellerService.Travellers(.SetPrimaryDocument) | §3.4 |
| 18 | `postSetActiveDocumentApi` (TravellerService/post.ts:49) | `traveller.postApi…MyDocumentAffiliationsByTravellerDocumentIdSetActive` | POST `/api/traveller-service/travellers/my-document-affiliations/{id}/set-active` | TravellerService.Travellers(.SetActiveDocument) | §3.3 |
| 19 | `getTags` (TagService/actions.ts:23) | `tag.getApiTagServiceTagCrossTenantsByTravellerIdClaim` | GET `/api/tag-service/tag/cross-tenants/by-traveller-id-claim` | TagService.Tags(.GetTagsByTravellerId) | §4.2 list/Home, §7 result enrichment (TagIds), §9.6 open-refunds check (Status) |
| 20 | `getOwnedTagByTagNumber` (TagService/actions.ts:144) | `tag.getApiTagServiceTagCrossTenantsByTravellerIdClaimByTagNumber` | GET `/api/tag-service/tag/cross-tenants/by-traveller-id-claim/{tagNumber}` | TagService.Tags(.GetTagByTagNumberCrossTenants) | §5.1 detail |
| 21 | `getPublicTagByTagId` (TagService/actions.ts:86) | `tagPublic.getApiTagServicePublicTagByTagIdById` | GET `/api/tag-service/public/tag/by-tag-id/{id}` | anon | §6.4, §7 claim modal |
| 22 | `getPublicTag` (TagService/actions.ts:97) | `tagPublic.getApiTagServicePublicTag` | GET `/api/tag-service/public/tag?tagNumber&travellerDocumentNumber` | anon | §6.4 (manual entry, number+doc QR) |
| 23 | `getPublicTagByStickerLineNumber` (TagService/actions.ts:401) | `tagPublic.getApiTagServicePublicTagByStickerLineNumber` | GET `/api/tag-service/public/tag/by-sticker-line-number` | anon | §6.4 (sticker QR / manual) |
| 24 | `postTagTravellerSelfAssign` (TagService/actions.ts:115) | `tag.postApiTagServiceTagTravellerSelfAssign` | POST `/api/tag-service/tag/traveller-self-assign` | TagService.Tags(.TravellerSelfAssign) | §6.5 claim, resume after login, §7 claim modal |
| 25 | `postTagTravellerPayoutToken` (TagService/post.ts:143) | `tag.postApiTagServiceTagTravellerPayoutToken` | POST `/api/tag-service/tag/traveller-payout-token` | TagService.Tags(.TravellerSetPayoutToken) | §7 step 4, §9.5, §9.6 |
| 26 | `getStickerManualVerificationsMyApi` (TagService/actions.ts:485) | `stickerManualVerification.getApiTagServiceStickerManualVerificationMy` | GET `/api/tag-service/sticker-manual-verification/my` | TagService.StickerManualVerifications(.ViewMine) | §4.10 |
| 27 | `postStickerManualVerificationApi` (TagService/post.ts:59) | `stickerManualVerification.postApiTagServiceStickerManualVerification` | POST `/api/tag-service/sticker-manual-verification` | TagService.StickerManualVerifications(.Upload) | §14.2 |
| 28 | `postQrEvidenceScan` (ExportValidationService/actions.ts:16) | `qrEvidence.postApiExportValidationServiceQrEvidenceByQrValueScan` | POST `/api/export-validation-service/qr-evidence/{qrValue}/scan` | (none listed) | §7 steps 5–6 |
| 29 | `getTravellerCardsMine` (RefundService/actions.ts:19) | `travellerCard.getApiRefundServiceTravellerCardsMine` | GET `/api/refund-service/traveller-cards/mine?includeExpired=true&maxResultCount=100` | RefundService.TravellerCards(.ViewMine) | §9.1, §7 step 4, Home/Profile counts |
| 30 | `postTravellerCard` (RefundService/post.ts:18) | `travellerCard.postApiRefundServiceTravellerCards` | POST `/api/refund-service/traveller-cards` | RefundService.TravellerCards(.Create) | §9.2, §7 add card |
| 31 | `postTravellerCardSetDefault` (RefundService/post.ts:49) | `travellerCard.postApiRefundServiceTravellerCardsByIdSetDefault` | POST `/api/refund-service/traveller-cards/{id}/set-default` | …(.SetDefault) | §9.3, §9.5, §9.6 |
| 32 | `putTravellerCardNickname` (RefundService/post.ts:59) | `travellerCard.putApiRefundServiceTravellerCardsByIdNickname` | PUT `/api/refund-service/traveller-cards/{id}/nickname` | …(.UpdateNickname) | §9.4 |
| 33 | `deleteTravellerCard` (RefundService/actions.ts:30) | `travellerCard.deleteApiRefundServiceTravellerCardsById` | DELETE `/api/refund-service/traveller-cards/{id}` | …(.Delete) | §9.5 |
| 34 | `postTravellerBankToken` (RefundService/post.ts:34) | `travellerCard.postApiRefundServiceTravellerCardsBank` | POST `/api/refund-service/traveller-cards/bank` | …(.CreateBank) | §9.8 **[FLAGGED OFF, not reachable]** |
| 35 | `editProfile` (auth/post.ts:5) | `profile.putApiAccountMyProfile` | PUT `/api/account/my-profile` | auth | §10.2 |
| 36 | `uploadProfilePictureApi` (AccountService/post.ts:17) | — (fetch) | POST `/api/account/profile-picture?type=2` (multipart) | auth | §10.3 |
| 37 | `deleteGdpr` (IdentityService/actions.ts:4) | `gdprCustom.deleteApiIdentityGdprs` | DELETE `/api/identity/gdprs` | IdentityService.Gdprs(.DeleteUserData) | §10.5 |
| 38 | `getPublicMerchantsViewportApi` (CRMService/actions.ts:81) | `merchantPublic.getApiCrmServicePublicMerchantsViewport` | GET `/api/crm-service/public/merchants/viewport` | anon + `__tenant` | §12 |
| 39 | `getPublicCustomsViewportApi` (CRMService/actions.ts:90) | `customPublic.getApiCrmServicePublicCustomsViewport` | GET `/api/crm-service/public/customs/viewport` | anon + `__tenant` | §12 |
| 40 | `getPublicRefundPointsViewportApi` (CRMService/actions.ts:97) | `refundPointPublic.getApiCrmServicePublicRefundPointsViewport` | GET `/api/crm-service/public/refund-points/viewport` | anon + `__tenant` | §12 |
| 41 | `getPublicTenants` (SaasService/actions.ts:4) | `tenantPublic.getApiSaasPublicTenants` | GET `/api/saas/public-tenants` | — | §13 debug menu only |
| 42 | `getTenantByNameApi` (auth/actions.ts:127) | — (fetch) | GET `/api/abp/multi-tenancy/tenants/by-name/{name}` | anon | §13 debug menu only |
| 43 | `submitCardExtractionApi` (DocumentExtraction/post.ts:46) | — (fetch, external) | POST `{extractionUrl}/api/app/extraction-run/submit-and-wait` (X-Api-Key) | API key | §9.2 OCR fallback |

**Non-API services a traveller touches:**
- Didit SDK (native)
- Novu REST and WebSocket (§11)
- Photon geocoder and OpenFreeMap tiles (§12)
- Google Pay card recognition / VisionKit (native card scan)
- ML Kit OCR (on-device)
- NFC EMV read (on-device)
- expo-location
- external links: `ssr.unirefund.com/en/privacy`, `/en/account-deletion`, Google/Apple Maps

**Calls present on traveller-reachable screens but gated out for a traveller** (role or staff grants): `getTagSummaryApi` (staff scope), `getTagDetailExtras`' six reads (staff DTO only), `getTagDetailByTagNumber` (staff scan routing), `postApiTagServiceTagByIdAssignTraveller` and the SearchTraveller lookups (TagService.Tags.AssignTraveller), the customs verdict and lifecycle footer actions, create-tag (TagService.Tags.Create), `getRecentlyModifiedTagsApi` (staff), and the refund-desk flow (role refundPoint).

**Defined but not called anywhere:** `postTagTravellerSelfAssignByTagId`.

---

## Open questions

1. **Which grants a real traveller account holds** — this cannot be read from code. It decides whether a traveller sees: upload-for-verification, Add document (disabled otherwise), card add/rename/delete/default, the pin during validation, and the move-refunds prompts. It also decides whether any staff-gated footer action could appear on a traveller's tag detail.
2. **Verify Account** (§2.3) runs Didit `ProveDocument` but never posts the approved session. Is the backend meant to pick it up through a Didit webhook, or should it call `prove-document` the way Add-document does?
3. **Universal links:** `tur.unirefund.com` is claimed, but there is no `+native-intent` rewrite. The web QR URLs (`/{lang}/validate?qrValue=`, `/tag/<slug>`) have no matching route. What happens on a device is untested (possibly `+not-found`).
4. **Explore** uses a hard-coded dev tenant GUID (`CRMService/actions.ts:71`). On live/uat the layers would probably fail, and only a log line would show it.
5. **Filter sheet no-ops** (§4.5): are Tag number, Export date and Paid date meant to be hidden for travellers, or sent to the cross-tenant endpoint? Does that endpoint even accept them? The SDK query lists only MerchantIds, IssuedStart/End, Status, TagIds, Sorting and paging.
6. **Home totals** cover only the loaded page of at most 20 tags (§14.1). Is that intended?
7. `postQrEvidenceScan` lists no required permission in the SDK. Does the endpoint enforce any?
8. The public detail DTO "totals filtered to three types" (per the comment in `TagService/types.ts`): which three is defined by the backend, and it bounds what §5.2 Amounts can show.
9. **Password-login role resolution** calls CRM `user-affiliations` for a traveller. Does a traveller hold `CRMService.UserAffiliations.View`, or does every traveller login take the 403 fallback? Behaviour is the same either way; not verified.
10. **Bank payout** (§9.8) is flagged off in the UI, but bank tokens still count in the Home and Profile "N saved" figures.
11. The profile QR (`"UNIREFUND"` literal) and the disabled Notification Preferences row: placeholders to be removed or finished?
12. Home's "Needs you" action list is built but not rendered (§14.1). Hidden on purpose, or unfinished?
13. The Verifications tab fetches only the 20 newest uploads and has no paging.
