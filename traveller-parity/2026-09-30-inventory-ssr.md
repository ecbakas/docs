# Feature inventory — `apps/ssr` (traveller web app)

- Source: worktree `C:\unirefund\web-app-wt-traveller-parity`, branch `feat/traveller-parity`, HEAD `671c4944d` (merge of PR #309, cards-move-open-refunds). Read on 2026-09-30.
- Paths below are repo-relative. `ssr/` = `apps/ssr/src/`, `[lang]/` = `apps/ssr/src/app/[lang]/`.
- Method: static reading only. No build, dev server or test run. Nothing was verified at runtime (see Open questions).

## 0. Cross-cutting facts (read first)

**Route protection happens only in middleware.** `ssr/proxy.ts:27-32` short-circuits `ALWAYS_PUBLIC_ROUTES = ["privacy","account-deletion"]` (`ssr/proxy.ts:15`), then delegates to `packages/utils/auth/middleware.ts:58-147`:
- Locale: a path without a valid locale is redirected to `/{cookie|Accept-Language|DEFAULT_LOCALE}/…` and the `locale` cookie is set (`middleware.ts:67-77`).
- Classification: `UNAUTHORIZED_ROUTES` covers auth-only routes. A signed-in user who opens one is redirected to `/{lang}` (`:117-123`). `PUBLIC_ROUTES` is the anonymous allow-list. Every other route is "main".
- With `PROTECT_ALL_ROUTES=true`, an anonymous user who opens a route outside those two lists is redirected to `/{lang}/{LOGIN_ROUTE}?redirectTo=…` (`:126-143`). A signed-in user can open any route (the AGENTS.md trap applies).
- Env values found: `.env.example` has `PUBLIC_ROUTES="/"` and `UNAUTHORIZED_ROUTES="login,register,reset-password"`. The local (gitignored) `apps/ssr/.env` has `PUBLIC_ROUTES=/,explore,tag,validate`. The production values are not in the repo.
- Matcher excludes `api`, `_next/*`, `favicon.ico` and `docext` (`ssr/proxy.ts:41`).

**There are no `isUnauthorized` calls anywhere in `apps/ssr`.** No page does a server-side policy gate. The client gates are:
- `isActionGranted` in `tag-claim.tsx:15` and `upload-verification-dialog.tsx:110`.
- `cardGrants()` (`ssr/components/payout-cards/card-grants.ts:8-52`) in `cards-view.tsx:67-68`, `payout-card-step.tsx:51-52` and `account/cards/page.tsx:32-42`.
- Policies come from `getApplicationConfiguration()` → `GET /api/abp/application-configuration?includeLocalizationResources=false` (`packages/utils/app-config/fetch.ts:57-85`), provided by `ssr/providers/providers.tsx:13-22`.

**Errors can sign the user out.** `ErrorComponent` (`packages/ui/src/components/error-component.tsx:56-71`), when given a `signOutServer` prop, treats **any** error as "session expired": it signs out and redirects to `/{lang}/login`.
- Pages that pass it: `(main)/layout.tsx:43-47`, `(public)/layout.tsx:80-84`, `account/page.tsx:48-53`, `tags/page.tsx:66-71`. So a failed required call there (for example a 403 or 500 on the tag list, or on `my-document-affiliations` in the main layout) logs the traveller out.
- Pages that don't pass it (these show the message only): `tags/[tagNumber]/page.tsx:33-36`, `account/cards/page.tsx:65-68`, `tag/[slug]/page.tsx`.

**Env flags that change behaviour:**

| Env | Effect |
| --- | --- |
| `PUBLIC_ROUTES`, `UNAUTHORIZED_ROUTES`, `PROTECT_ALL_ROUTES`, `LOGIN_ROUTE`, `HOME_ROUTE`, `IS_ADMIN_PANEL` | middleware |
| `SUPPORTED_LOCALES`, `DEFAULT_LOCALE` | middleware + `init.ts` (only `en` and `tr` bundles exist: `ssr/language-data/i18n-config.ts:1-3`) |
| `NEXT_PUBLIC_DIDIT_API_KEY` | Didit (build time) |
| `NOVU_APP_IDENTIFIER`, `NOVU_APP_URL`, `NOVU_SOCKET_URL` | bell icon hidden unless all three are set |
| `CHATBOT_URL`, `CHATBOT_TOKEN` | Chatwoot widget hidden unless both are set |
| `EXTRACTION_API_KEY`, `EXTRACTION_SUBMIT_URL`, `EXTRACTION_CARD_PROJECT_ID` | card camera scan |
| `AUTH_REDIS_URL`, `AUTH_REDIS_PREFIX` | token store |
| `GATEWAY_URL`, `CLIENT_ID`, `CLIENT_SECRET`, `ABP_APP_NAME`, `APPLICATION_NAME`, `TENANT_ID` | `TENANT_ID` is read only by the unused `/api/auth/reset-password` route |

**Navbar quirk.** `ssr/components/global/navbar/index.tsx:111-113` hides the whole right cluster (bell, document switcher, language selector, sign-out) when `actions` is empty **and** `languagesList.length <= 1`. The `(main)` layout passes no `actions` (`(main)/layout.tsx:56-81`). So on main pages, a deployment with a single public language shows no bell, no switcher and no sign-out button. The `(public)` layout always passes one action (the sign-in link), so this doesn't happen there.

---

## 1. Auth & session

**Password login** — `[lang]/(auth)/login/page.tsx:14` → `LoginForm` (`ssr/components/auth/login-form.tsx:28-180`)
- Fields: `userName` ("username or email", required, trimmed) and `password` (required). There is no length rule (`ssr/components/auth/schema.ts:8-14`).
- Submit calls `signInServerApi({ userName, password, tenantId: "", redirectTo })` (`packages/actions/core/AccountService/actions.ts:26-56`). That calls next-auth `signIn("credentials")`, which runs `fetchToken`: a password grant to `${GATEWAY_URL}/connect/token` requesting **every** `scopes_supported` scope from `/.well-known/openid-configuration`, with an empty `__tenant` header (`packages/utils/auth/auth-actions.ts:54-101`). The JWT is decoded into user claims (`packages/utils/auth/user-claims.ts:25-51`).
- `tenantId` is always `""`: no tenant picker, so travellers log in at host level.
- Honours `?redirectTo=` (decoded) with a default of `/{lang}/` (`login-form.tsx:54-59`), and `?email=` prefills the username (`:49`).
- An error is toasted after `normalizeLoginError` strips Auth.js JSON quoting and the "Read more" suffix (`ssr/utils.ts:50-80`).
- `?error=` shows the toast `Auth.ResetPasswordError` (`login-form.tsx:71-75`). That is a mis-keyed generic message.
- Links: "Forgot password" → `reset-password` (`:126-132`), "Sign in with KYC" → `/{lang}/login/kyc` (`:156-166`), "Sign up" → `register` (`:167-176`).
- Loading state: `login/loading.tsx` shows a spinner. The button spins while pending.

**KYC login (`login/kyc`)** — `[lang]/(auth)/login/kyc/page.tsx:4` → `DiditForLogin` (`login/kyc/didit.tsx:28-119`)
- Uses the Didit workflow for SSR action `GetAccessToken` (`:33`).
- On completion: `Declined` shows the Declined screen and `Pending` shows the Pending screen (`:47-68`).
- Otherwise it calls `getApiTravellerServiceSsrPublicActionsGetEmailApi({ sessionId, kycSessionProvider: "Didit" })`, which is `GET /api/traveller-service/ssr-public-actions/get-email`.
  - If `isExistingAccount`, it shows "logging in…" and calls `loginViaSSRAction(sessionId,"Didit","/{lang}/")` (`login/kyc/login-via-ssr-action.ts:9-59`). That calls `getApiTravellerServiceSsrPublicActionsGetAccessTokenApi` (`POST /api/traveller-service/ssr-public-actions/get-access-token`, body `{sessionId, kycSessionProvider, scope: all scopes}`), then `signIn("ssr-token", { accessToken, expiresIn })` (`packages/utils/auth/auth.ts:170-205`).
  - If there is no account, it goes to `router.push("/{lang}/register?evidenceId=…")` (`didit.tsx:94`).
  - **[BUG]** `register/page.tsx:25-31` reads `sessionId`, not `evidenceId`, so the traveller lands on a fresh Didit CreateTraveller verification (a second KYC).
- Error screen offers "Back to login" and "Try again" (reload) (`didit.tsx:121-178`).
- Didit runs with `debug` (`:116`).
- **[DEAD CODE]** `login/kyc/kyc.tsx:20` (`KYCForLogin`, old `@ayasofyazilim/kyc` evidence-session flow with MRZ + liveness) is not imported anywhere.

**Registration (`register`)** — `[lang]/(auth)/register/page.tsx:20-81`
- Without `sessionId` it renders `DiditForRegister` (`register/didit.tsx:27-94`, workflow `CreateTraveller`). On completion (after the Declined/Pending screens) it calls get-email:
  - existing account → "Verification complete, reset your password" with a link to `/reset-password?sessionId&email` (`:113-136`);
  - new → a link to `/register?sessionId=…` (`:138-159`).
- With `sessionId` the server calls get-email again. On failure it shows "Verification failed" with Register/Sign-in links (`page.tsx:39-68`). Otherwise it renders `CreateTravellerForm` (`register/create-traveller-form.tsx:66-285`).
  - Fields: email (prefilled from KYC, editable, validated), phone (optional, `PhoneInput` parsed into `ituCountryCode`/`localNumber`), phone type (Mobile/Home/Work/Fax/Other), password (min 6, with a generator) (`:33-60`).
  - Submit calls `postCreateTravellerActionApi({ email:{emailAddress,type:"PERSONAL"}, password, sessionId, kycSessionProvider:"Didit", telephone? })`, which is `POST /api/traveller-service/ssr-public-actions/create-traveller` (`:97-129`).
  - On success it toasts. If `returnTo` is set (the validate flow), it auto-logs in with `loginViaSSRAction(sessionId,"Didit",returnTo)`. Otherwise it goes to `/{lang}/login?email=…`.
- There is no username field: the account is created from the KYC identity.
- **[DEAD CODE]** `register/kyc.tsx:22` (`KYCForRegister`) and `ssr/components/auth/register-form.tsx:23` (classic username/email/password sign-up via `signUpServerApi` → `POST /api/account/register`) are not imported.

**Forgot / reset password (`reset-password`)** — `[lang]/(auth)/reset-password/page.tsx:19-78`
- Password reset is KYC-based; there is no email reset code. Without `sessionId` and `email` it renders `DiditForResetPassword` (`reset-password/didit.tsx:27-69`, workflow `SetPassword`, decline → `/login`). On completion it calls get-email:
  - existing → a "Reset password" link to `?sessionId&email`;
  - not existing → a "Register" link.
- With both params the server calls get-email and renders `ResetPasswordForm` (`reset-password/reset-password-form.tsx:28-92`).
  - It is a SchemaForm with one field, `newPassword` (min length 8, password widget with generator).
  - Submit calls `postSetPasswordActionApi({ newPassword, sessionId, kycSessionProvider:"Didit" })`, which is `POST /api/traveller-service/ssr-public-actions/set-password`.
  - On success it shows the toast "RegistrationCompletedSuccessfully" (a reused string) and goes to `/login?email=`.
  - The button is disabled if `email` is empty.
- Password rules are inconsistent: register min 6, reset min 8, change-password min 6 (HTML only), login none.
- **[DEAD CODE]**
  - `reset-password/kyc.tsx` (`KYCForResetPassword`).
  - `ssr/components/auth/reset-password-form.tsx` (email-code reset via `sendPasswordResetCodeApi` → `POST /api/account/send-password-reset-code`).
  - `ssr/components/auth/new-password-form.tsx` (`resetPasswordApi` → `POST /api/account/reset-password`).
  - The route handler `ssr/app/api/auth/reset-password/route.ts:4-31`, which proxies to `/api/account/reset-password` with `__tenant = TENANT_ID || "F3B84A96-…"`.

**Logout**
- The navbar sign-out icon calls `signOutServer({ redirectTo: "/" })` and then `router.refresh()` (`navbar/index.tsx:193-205`).
- `/logout` page (`[lang]/(auth)/logout/page.tsx:18-22`) signs out on mount and redirects to `/{lang}/login`.
- `signOutServer` (`packages/utils/auth/auth-actions.ts:32-52`) deletes the server-side token cache entry and signs out of next-auth.

**Session model and refresh**
- next-auth v5 beta, `strategy: "jwt"`. Tokens are stripped from the cookie (`auth.ts:249-267`).
- Access and refresh tokens live in a server-side store: an in-memory L1 plus an optional Redis L2 (`packages/utils/auth/token-store.ts`, Redis TTL = token lifetime `:135-136`).
- The `session` callback resolves the token and silently refreshes it with a `refresh_token` grant when it is within 60 s of expiry. Refreshes are de-duplicated per user (`auth.ts:64-114`, `:228-243`).
- KYC (`ssr-token`) logins have **no refresh token**, so the session ends when the access token expires (`auth.ts:70-76`).
- Cookie names are prefixed with the app directory (`ssr.authjs.session-token`) (`auth.ts:119`, `:215-219`).

**Stale-session handling**
- The `(public)` layout probes `my-document-affiliations` and classifies the session as usable, anonymous, revoked or unverifiable (`(public)/layout.tsx:44-98`).
- A revoked session renders `StaleSessionCleaner` (`ssr/components/global/stale-session-cleaner.tsx:18-41`), which calls `signOutServer({ redirect:false })` and refreshes. There is no redirect.
- An unverifiable session keeps the signed-in chrome.
- `/validate` has its own probe (§7).

**Tenant handling** — none for travellers.
- Login and register pass `tenantId: ""`.
- Explore sends a hard-coded country tenant (§12).

**Other auth screens**
- The `(auth)` layout (`[lang]/(auth)/layout.tsx:18-61`) is a centred card with the `ServerHealth` badge, a `CountrySelector` language switcher and a WebGL `LightRays` backdrop.
- Not present: social login, OTP/SMS, passkey/WebAuthn, "remember me", MFA.

## 2. Onboarding & identity verification

**Didit is the only KYC provider in use.**
- The root layout fetches `getDiditWorkflowsApi` (`GET /api/traveller-service/ssr-public-actions/didit-workflows`) and `getEvidenceLevelRequirementsApi` (`GET …/evidence-level-requirements`), both best-effort, and wraps the app in `DiditConfigProvider` with `NEXT_PUBLIC_DIDIT_API_KEY` (`[lang]/layout.tsx:61-96`).
- `getWorkflowForAction(actionType)` maps an SSR action to the workflow for its minimum evidence level (`packages/ui/src/unirefund/didit-verification/didit-config-provider.tsx:52-70`).
- The `DiditVerification` component (`packages/ui/src/unirefund/didit-verification/didit-verification.tsx`) creates the session through `POST /api/session` (`ssr/app/api/session/route.ts` → `handlers.ts:6-63`, a proxy to `https://verification.didit.me/v3/session/` that forwards the api key from the request body) and then runs `DiditSdk.shared.startVerification`.

**SSR action types in use:**

| Action type | Used by |
| --- | --- |
| `GetAccessToken` | login/kyc, validate |
| `CreateTraveller` | register |
| `SetPassword` | reset-password |
| `ProveDocument`, `ScanDocument` | exist in `UniRefund_TravellerService_Enums_SSRActionType` (`packages/saas/TravellerService/types.gen.ts:157-162`) but are **never used** in ssr |

**When verification is required**
- Any registration, any password reset, KYC login, and `/validate` for an anonymous or revoked session.
- Result handling: `Declined` and `Pending` screens (login, register, validate). Reset-password handles neither; it just calls get-email.
- Liveness, MRZ and NFC are configured inside the Didit workflow, not in ssr code.
- The old `@ayasofyazilim/kyc` component (MRZ required, liveness required for login) survives only in the dead `kyc.tsx` files.

**[DEAD CODE]** `ssr/providers/didit-config-loader.tsx:9` (duplicate loader) and `ssr/components/didit-verification/didit-verification.tsx:9` (localized wrapper) are not imported.

## 3. Identity documents

**List + set active** — navbar only, via `TravellerDocumentSwitcher` (`ssr/components/global/navbar/traveller-document-switcher.tsx:31-247`), mounted at `navbar/index.tsx:181-185`.
- Data: `getMyDocumentAffiliationsApi` → `GET /api/traveller-service/travellers/my-document-affiliations`. It is a **required** call in the `(main)` layout (`(main)/layout.tsx:21-24`) and optional in `(public)`.
- Display: the active document is chosen by the JWT claim `TravellerDocumentId`, not by the DTO's `isActive`/`isPrimary`.
- With a single document it is a plain label showing the icon and `identificationNumber` (`:85-95`).
- With several it is a dropdown: each item shows number + localized `DocumentType.{identificationType}` with a check on the active one. Selecting an item then "Switch to {n}" (`:190-243`):
  - calls `postSetActiveDocumentApi(id)` → `POST /api/traveller-service/travellers/my-document-affiliations/{travellerDocumentId}/set-active`;
  - then `refreshSessionAfterAffiliationSwitch()`, a refresh_token grant (`packages/utils/auth/auth-actions.ts:141-173`);
  - then `sessionUpdate({ info })` and `router.refresh()`, with a spinner while switching.
- **[GAP]** A KYC-login session has no refresh token, so `refreshSessionAfterAffiliationSwitch` throws "No refresh token available". The traveller gets an error toast even though set-active already succeeded server-side.
- Not shown: `isPrimary`, `evidenceLevel`, full name, expiry.

**Add document** — none.
- There is no MRZ, OCR, NFC or manual document entry, and no document detail, delete/deactivate or expiry handling in ssr.

**`/document-capture`** — `[lang]/(main)/document-capture/page.tsx:4-25`, `client.tsx:20-33`
- A live camera capture of an ID-1 card (`DocumentCapture`, ML detector tier, `expectCard`, `autoExtract`, `autoStart={false}`) whose extraction goes through `extractCaptureViaAction` (§9). The result is shown on screen only; nothing is saved or linked to a traveller.
- Not linked from any navigation, so it is reachable by URL only. It is a main route, so authentication is needed unless it is listed in `PUBLIC_ROUTES`.
- **[STUB / demo]**
- The copy "No frame leaves this device" (`ssr/language-data/core/Default/resources/en.json:3`) contradicts the upload to the extraction API.

## 4. Tags — list

**Route** — `[lang]/(main)/tags/page.tsx:42-93` → `TagsView` (`tags/_components/tags-view.tsx:13-50`)

**Data**
- `getTagsCrossTenantsByTravellerIdClaimApi({ ...searchParams, sorting:"issueDate desc", skipCount, maxResultCount: 20 })` → `GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim` (required) (`page.tsx:14`, `:54-63`).
- `getStickerManualVerificationsMyApi({ maxResultCount:20, sorting:"creationTime desc" })` → `GET /api/tag-service/sticker-manual-verification/my` (optional; a 403 is tolerated) (`:27-32`).

**Filters, search, sort**
- **No filter UI and no search box.** Every query parameter other than `page` is forwarded unvalidated to the endpoint (`page.tsx:54-60`). The endpoint accepts `issuedStartDate`, `issuedEndDate`, `merchantIds[]`, `status[]` and `tagIds[]` (`packages/saas/TagService/types.gen.ts:4135-4144`), so filtering works only by hand-crafted URL.
- Sort is fixed to issue date, newest first.

**Pagination** — server-side, 20 per page via `?page=`. Shows "Page {0} of {1}" and numbered links with ellipsis (`tag-table-view.tsx:95-115`, `:188-240`).

**Table** (`tag-table-view.tsx:117-186`) — raw `Table` primitives, not MasterDataGrid. Columns:
- tag number (link to `tags/{tagNumber}`);
- status (localized `Tags.Status.*`, colour-coded `:39-66`);
- risk (`risk.riskLevel`: Green / Red / EvaluationFailed badge, `-` if none; `:68-78`, `:160-174`);
- merchant title;
- refund amount (`refund ?? grossRefund ?? 0` as a raw number plus currency code, not locale-formatted).

**Pending verifications** — `tags/_components/pending-verifications.tsx:18-77`
- A section above the table listing manual sticker verifications with status `Created` or `Invalid`: sticker line number, upload date, status badge and `invalidReason`.
- Completed ones are hidden because the DTO has no tag id.

**Toolbar actions**
- "Upload for verification" (§6), gated by `TagService.StickerManualVerifications.Upload`.
- "Claim tag" (§6), gated by `TagService.Tags.TravellerSelfAssign` (`tag-claim.tsx:15-19`).

**Empty state** — "No tags" with an Explore link (`tag-table-view.tsx:245-273`).

**Error state** — `ErrorComponent` **with** `signOutServer`, so any error signs the traveller out (§0).

**Not present** — counters or totals (other than the page info line), grouping (by status, trip or merchant), infinite scroll, pull-to-refresh.

## 5. Tags — detail

**Route** — `[lang]/(main)/tags/[tagNumber]/page.tsx:23-43`
- Data: `getTagsCrossTenantsByTravellerIdClaimByTagNumberApi(tagNumber)` → `GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim/{tagNumber}`, which returns `TagPublicDetailDto`.
- Error: `ErrorComponent` without sign-out.

**`TagDetailClient`** — `tags/[tagNumber]/_components/tag-details.tsx:29-77`
- Header: back link to `/tags`, title, tag number.
- **Tag information** (`tag-information.tsx:14-56`): tag number, issue date (`formatReadableDate`), status badge (`status-badge.tsx:30-39`).
  - The status is the **raw enum string, not localized**.
  - Its colour map checks non-existent values such as "refund", "closed" and "validated".
- **Merchant** (`merchant-info.tsx:9-43`): name, and address when present.
- **Traveller** (`traveller-information.tsx:9-53`): first + last name, document ("passport") number, nationality.
- **Invoice summary** (`invoice-summary.tsx:21-95`):
  - the **first invoice only**: number, total amount, VAT amount (`Intl` currency, default TRY);
  - refund amount = the first `totals[]` entry whose `totalType` contains "refund" (`tag-details.tsx:17-27`).
- **[STUB]** The "Download PDF" button has no handler (`invoice-summary.tsx:84-91`).

**Not shown** — invoice line items, multiple invoices, fee breakdown (the DTO/pricing carries `touristFee`/`agentFee`/`earlyRefundFee`/`netRefundAmount` but they are not rendered), `exportValidationExpirationDate` / deadlines, status timeline or history, risk, payout card for the tag.

**Actions** — none (no pin-card-to-tag, early refund, cancel or correction).

## 6. Tag lookup / public tag / QR

**`/tag` — manual lookup** (`[lang]/(public)/tag/page.tsx:15-22` → `TagSearchForm`, `tag/_components/tag-search-form.tsx:19-124`)
- Fields: tag number and passport (document) number. Both are required (`Tags.Search.MissingFields`).
- The values are encoded with `encodeTagSlug` from `@unirefund/qr`; values containing `,`, `{` or `}` are refused (`Tags.Search.InvalidCharacters`). Then it pushes `/{lang}/tag/{slug}`.
- The anonymous navbar shows "Claim Tag" → `/tag` (`(public)/layout.tsx:136-140`).
- Public only if `tag` is in `PUBLIC_ROUTES`.

**`/tag/[slug]` — QR / slug landing** (`[lang]/(public)/tag/[slug]/page.tsx:133-254`)
- The slug is decoded with `decodeTagSlug` into `{ tagNumber, tagId, travellerDocumentNumber, stickerLineNumber }`. Branches:
  1. `stickerLineNumber` → `getPublicTagByStickerLineNumberApi` → `GET /api/tag-service/public/tag/by-sticker-line-number` (`:150-178`).
  2. `tagNumber` + `travellerDocumentNumber` → `getPublicTagApi` → `GET /api/tag-service/public/tag`. A plain read with no claim (`:182-204`).
  3. `tagId` → `getPublicTagByTagIdApi` → `GET /api/tag-service/public/tag/by-tag-id/{id}` (`:216-243`).
  4. Anything else → `TagSearchForm` prefilled (`:247-253`).
- A failed lookup shows a destructive alert with the server message and a "Try again" link to `/tag` (`:73-98`).
- **`PublicTagDetails`** (`tag/[slug]/_components/public-tag-details.tsx:49-315`):
  - tag info (raw status string);
  - merchant;
  - traveller (name, document number, nationality);
  - first invoice (number, total, VAT);
  - "Totals" block: sales amount, VAT, refund/gross, matched by substring on `totalType` (`:65-75`).
- **Claim** (`claimPropsFor`, `page.tsx:122-131`): offered only when the tag has no `traveller.travellerDocumentNumber`, and only in branches 1 and 3. An overlay covers the traveller card (`public-tag-details.tsx:178-187`):
  - anonymous: "Log in to claim" → `/{lang}/login?redirectTo=/{lang}/tag/{slug}`;
  - authenticated: "Claim tag" → `postTagTravellerSelfAssignApi({ tagNumber, salesAmount })` with `salesAmount` from the `SalesAmount` total → `POST /api/tag-service/tag/traveller-self-assign`, then `router.refresh()` (`claim-tag-button.tsx:12-66`).
  - **No `isActionGranted` gate here**, unlike `/tags`.

**Claim-tag modal** — shared by `/tags` and `/validate`: `ClaimTagModal` (`[lang]/(public)/validate/_components/claim-tag-modal.tsx:59-431`)
- **Scan tab**: `BarcodeCameraScanner` (QR). `slugFromScan` takes the text after `/tag/` (`:53-57`), then `decodeTagSlug`. Only a `tagId` is used; a scan without one is silently ignored (`:112-124`).
  - It then calls `getPublicTagByTagIdApi` (`:87-110`) and shows a confirm card (tag number, merchant, sales amount + currency).
  - Confirm calls self-assign with the sales amount from totals, falling back to the sum of invoice totals (`:164-198`).
- **Manual tab**: tag number (alphanumeric only) and sales amount (locale-aware grouping/decimal `AmountInput`, `amount-input.tsx:102-152`).
  - It claims **directly** with the typed values; there is no lookup (`:128-157`).
- Success screen: "Scan another" / "Done". Errors toast the server message.
- In `/tags`, a successful claim triggers `router.refresh()` (`tag-claim.tsx:33-37`).

**Sticker manual verification** ("Upload for verification", `tags/_components/upload-verification-dialog.tsx:95-323`)
- Takes two required photos (sticker, and the tax-free form it is stuck on) through `<input capture="environment">`, plus the sticker line number.
- The images are resized and compressed to JPEG base64 by `prepareStickerPicture` (`ssr/utils/utils-image.ts:65-106`).
- The front photo is QR-decoded (`decodeBarcodeFromImage` + `decodeTagScan`) to prefill the line number without overwriting a typed value (`:148-164`).
- Submit calls `postStickerManualVerificationApi({ stickerLineNumber, frontPictureBase64, backPictureBase64 })` → `POST /api/tag-service/sticker-manual-verification` (`:187-212`). On success it toasts and refreshes; on error the dialog stays open with both photos kept.
- Gate: `TagService.StickerManualVerifications.Upload`.

## 7. Validation (export / customs validation by the traveller) — `/validate`

**Entry** — `[lang]/(public)/validate/page.tsx:46-103`
- Params: `?qrValue=` (required; otherwise a "missing QR value" message, `:57-65`) and optional `diditSessionId`.
- Public only if `validate` is in `PUBLIC_ROUTES`.
- **Session probe** (`:32-44`): no session → anonymous; no access token → revoked; `getMyDocumentAffiliationsApi` succeeds → usable; 401 → revoked; any other error → unverifiable.
  - **usable** → `ValidateClient`, with the pre-captured location read from the httpOnly cookie `validate_location` keyed by `diditSessionId` (20-minute TTL) (`validate-location-actions.ts:28-62`).
  - **unverifiable** → `ValidateUnavailable`, a retry that re-runs the probe (`validate-unavailable.tsx:13-35`).
  - **anonymous / revoked** → `DiditForValidate`. For revoked it first clears the stale session through `signOutServer({ redirect:false })` (`didit-for-validate.tsx:75-82`).

**KYC path** (`DiditForValidate`, `validate/_components/didit-for-validate.tsx:39-276`)
1. **Location first.** `navigator.geolocation.getCurrentPosition` with high accuracy and a 15 s timeout. States: idle / requesting / denied (retry) / blocked (reload); unsupported browser → blocked (`:84-124`, `:204-262`).
2. **Didit** with the `GetAccessToken` workflow. Declined and Pending screens (`:132-152`).
3. On success it saves the location cookie keyed by the Didit sessionId (`:158-160`) and calls get-email:
   - **new** traveller → `/{lang}/register?sessionId=…&returnTo=/{lang}/validate?qrValue=…&diditSessionId=…`. After creating the traveller, the register form auto-logs in back to validate (§1).
   - **existing** traveller → `loginViaSSRAction(sessionId,"Didit", same validate URL)` (`:162-197`).

**Signed-in path** (`ValidateClient`, `validate/_components/validate-client.tsx:29-236`; state machine `use-validate-flow.ts:62-413`). The steps:
1. **Location.** Skipped if pre-captured. Otherwise "Allow location" (the call is made before setState, for iOS user-activation; `use-validate-flow.ts:236-302`). The Permissions API is watched (`:126-144`). Error states: `location-blocked` (reload) and `location-denied` (retry), each with localized reasons (unsupported, blocked, denied, timeout, unavailable).
2. **Flight / boarding pass** (`FlightInfoStep`, `flight-info-step.tsx:265-494`).
   - Laid out as a boarding pass. Editable fields: departure IATA, destination IATA (3 characters, uppercased), flight number, PNR, passenger name. The `checkInSequenceNumber` is shown when read.
   - "Scan boarding pass" opens `BarcodeCameraScanner` for Aztec, Data Matrix, QR and PDF417.
   - The read is parsed as IATA BCBP (mandatory section only) by `parseBcbp` (`:21-66`) and **merged** over typed values. A code with no flight fields is refused and the camera stays open (`:285-302`). `rawBarcodeData` is sent along.
   - Submit is enabled only if at least one of flightNumber, departure, destination, PNR, seat or passengerName is present (`:72-83`, `:483-491`).
3. **Payout card** (`PayoutCardStep`, `payout-card-step.tsx:39-265`).
   - Loads `getMyTravellerCardsApi({ type:"Card", maxResultCount:100 })` → `GET /api/refund-service/traveller-cards/mine`. **Cards only; bank accounts can't be chosen here.**
   - Preselects the last-used card, then the default, never an expired one (`preferred-token.ts:8-17`). A choice carried over from a retry wins.
   - Expired cards are shown disabled (`card-option.tsx:29-96`).
   - "Add card" (the `AddCardDialog` from §9) is shown if `grants.add`; a newly added card is selected immediately (`:133-159`).
   - Submit pins the card with `postTagTravellerPayoutTokenApi({ payoutTokenId })` → `POST /api/tag-service/tag/traveller-payout-token` if `grants.pin`; without that grant it skips the pin and continues (`:104-124`).
   - Pin failure shows a warning, "Try again", and "Continue anyway" (`:216-262`).
   - Load failure offers retry and add-card.
   - **[GAP]** With zero cards and no `RefundService.TravellerCards.Create` grant, the traveller can't proceed: submit needs a selection.
4. **Scan.** `postQrEvidenceScanApi({ qrValue, requestBody:{ latitude, longitude, flightTicket } })` → `POST /api/export-validation-service/qr-evidence/{qrValue}/scan` (`use-validate-flow.ts:151-204`).
   - The payout card is **not** sent with the scan.
   - On success it calls `router.refresh()` and enriches the result with `getTagsCrossTenantsByTravellerIdClaimApi({ tagIds: green + alreadyCleared + red + customsRejected, maxResultCount: 999 })`. The enrichment is best-effort: raw ids are shown if it fails.
5. **Result** (`ScanResultView`, `scan-result-view.tsx:294-380`).
   - No green, red or customs tags → an info "no tags" message.
   - Otherwise an "all green" banner if there are no red or customs tags, then accordion sections (default open, with a count badge):
     - **Green** — validated;
     - **Red** — alert and description, plus a **suggested exit points** card listing post name and exit point name (`:255-292`);
     - **Customs rejected** — notice.
   - Each row shows tag number, sales amount + currency and merchant title. Skeletons show while enriching.
   - `alreadyClearedTagIds` are fetched and categorized but **never rendered**.
   - The "no suggested exit points" copy is unreachable, because the card returns null when the list is empty (`:261-263`).
6. **Claim missing tags.** After a result, a sticky "Claim missing tags" button opens `ClaimTagModal` (§6) with no grant gate (`validate-client.tsx:211-233`). When it closes after at least one claim, the scan re-runs with the same location and ticket, and the claimed tags are highlighted "Latest claimed" (`use-validate-flow.ts:332-356`, `scan-result-view.tsx:113-119`).

**Error handling**
- **401** → `session-expired` state ("redirecting to sign in") plus `router.refresh()`, which re-probes and lands on KYC (`use-validate-flow.ts:196-199`).
- **"QR record is not active"** → `scan-error` → "Your QR code expired" with a **Rescan QR** modal (`rescan-qr-modal.tsx:29-110`). The modal runs a QR camera, applies `extractValidateQrValue` to the scanned URL or token, and re-runs the scan with the retained location and flight ticket. It closes only on success and keeps the last scanned value to avoid re-submitting it (`use-validate-flow.ts:364-390`).
- **"distance"** in the message → localized "too far from the airport". Other messages are shown raw (`validate-client.tsx:238-247`).
- Generic failure → `failed` with "Try again", which rewinds to flight info, or to the start if there is no location (`use-validate-flow.ts:325-330`).
- `justRegistered` (a `diditSessionId` is present) triggers one `router.refresh()` so the navbar picks up the affiliations (`:108-114`).

**[FLAGGED OFF]** The `LocationDetails` geolocation debug panel is hidden behind `CONFIG.SHOWLOCATION = false` (`validate-client.tsx:25-27`, `:158-160`; `location-details.tsx:19-51`).

## 8. Refunds

**Refund method choice** — only "which saved **card**", chosen in the validate payout step (§7.3) or by the default card on `/account/cards` (§9).
- Bank tokens can be saved and set as default in `/account/cards`, but the validate picker filters to `type: "Card"`, and the move-open-refunds prompt is offered only for cards (`cards-view.tsx:93-94`).
- There is no cash, wallet or refund-point option. Wallet tokens are dropped from display (`cards-view.tsx:74-83`).

**Where refunds are paid**
- The pinned card: `POST tag/traveller-payout-token` applies to all of the traveller's open tags server-side, with no per-tag choice.
- Otherwise the default card.
- "Move open refunds" (§9) re-pins them.

**Refund status and amount** — only as tag status and amount in the list (§4) and on the detail page (§5).
- Open refunds are detected client-side for the cards screen: statuses `Open`, `PreIssued`, `Issued`, `WaitingGoodsValidation`, `WaitingStampValidation`, `ExportValidated`, excluding Red risk (`ssr/components/payout-cards/open-refunds.ts:10-27`).

**Not present**
- **Early refund**: only the `EarlyRefunded` status label exists.
- Refund history, payout tracking, receipt download (the detail button is a stub), fee breakdown.

## 9. Payout cards — `/account/cards`

**Route** — `[lang]/(main)/account/cards/page.tsx:52-86` → `CardsView` (`account/cards/_components/cards-view.tsx:47-424`). It is one tab of `account/layout.tsx:12-77`.
- Data: `getMyTravellerCardsApi({})` → `GET /api/refund-service/traveller-cards/mine` (required).
- If `cardGrants(policies).moveRefunds`, it also calls `getTagsCrossTenantsByTravellerIdClaimApi({ status: OPEN_REFUND_STATUSES, maxResultCount: 999 })`, which feeds the boolean `hasOpenRefunds` (`page.tsx:23-50`, `:79-83`).
- `travellerId` comes from the `TravellerId` claim; it is needed by the create endpoints (`page.tsx:17-21`).

**Grants** (`ssr/components/payout-cards/card-grants.ts:8-52`; every one also needs its group policy)

| Action | Policies |
| --- | --- |
| setDefault | `RefundService.TravellerCards` + `.SetDefault` |
| rename | `+ .UpdateNickname` |
| remove | `+ .Delete` |
| add | `+ .Create` |
| addBank | `+ .CreateBank` |
| pin | `TagService.Tags` + `TagService.Tags.TravellerSetPayoutToken` |
| moveRefunds | setDefault **and** `TagService.Tags` + `.GetTagsByTravellerId` + `.TravellerSetPayoutToken` |

A missing grant means the control isn't rendered.

**Layout** — two sections: **Cards** and **Bank accounts**. Each has:
- a **hero**, chosen by `partitionTokens` (default → usable last-used → first non-expired → first; an expired default keeps the slot) (`account/cards/partition-tokens.ts:32-46`);
- compact rows for the rest.
- Card hero: `CreditCardPreview` with masked number, holder and MM/YY expiry, flagged when expired.
- Bank hero: `BankAccountPreview` with bank name / nickname, masked IBAN and holder.
- On-face actions (`token-hero-actions.tsx:15-100`): nickname button (rename), default star or "set default" star, Expired / Last used badges, delete.
- Rows (`card-row.tsx:16-116`, `bank-row.tsx:14-100`): brand icon (`CardBrandIcon`, `getCardBrand(maskedNumber)`) or bank icon, nickname or masked tail, expiry, Default / Expired / Last used badges, set-default, delete.
- Empty states: "No cards" and "No bank accounts".

**Add card** — `AddCardDialog` (`ssr/components/payout-cards/add-card-dialog.tsx:56-329`), shared with validate.
- **Manual entry**: `CreditCardInput` with number, MM/YY expiry and holder name (no CVC), plus an optional nickname. A live `CreditCardPreview` updates as you type.
- Validation: at least 12 digits, Luhn, a valid MM/YY (`:133-144`).
- **Camera scan**:
  - `DocumentCapture` runs above the form with `autoExtract`, `detectorTier="ml"`, `expectCard`, `maxAttempts=5`, `maxSeconds=30` (`:240-251`).
  - Each attempt calls `extractCaptureViaAction` (`ssr/components/card-extraction/capture-adapter.ts:59-108`): `toUploadDocuments` makes a JPEG crop, then `submitExtractionRunAction` → `POST {EXTRACTION_SUBMIT_URL root}/submit` with `X-Api-Key` and an idempotency key = capture id (`card-extraction/actions.ts:160-200`), then `waitForExtractionRunAction` → `POST …/{runId}/wait-for-terminal?timeoutMs=` in 5 s slices up to 15 s (`:215-230`).
  - This is a **third-party Document Extraction API** (`auth-dx.clomerce.com`), not the Unirefund gateway.
  - The run's `card_number` and expiry fields prefill the form. A Luhn failure only warns. No card number → error toast and back to the form (`add-card-dialog.tsx:108-131`, `readCardFields` `capture-adapter.ts:177-197`). "Enter manually" exits the scanner.
- Submit: `postTravellerCardsApi({ travellerId, cardNumber, cardExpiryMonth, cardExpiryYear, holderName?, nickname? })` → `POST /api/refund-service/traveller-cards`.
- Afterwards: `/account/cards` refreshes and, if there are open refunds, shows the move prompt (`cards-view.tsx:142-151`); validate selects the new card.
- **Not present**: NFC card read, Google Pay / Apple Pay / native card scan.

**Add bank account** — `add-bank-dialog.tsx:22-197`
- Fields: IBAN (required, mod-97 validated before any network call; `ssr/utils/utils-iban.ts:22-37`), bank name, BIC, account holder, nickname.
- `bankCountryCode` is derived from the first two IBAN characters.
- Submit: `postTravellerBankTokenApi` → `POST /api/refund-service/traveller-cards/bank`.

**Set default** — `postTravellerCardsByIdSetDefaultApi(id)` → `POST /api/refund-service/traveller-cards/{id}/set-default`.
- For a card with open refunds it opens `MoveRefundsDialog` in "afterDefault" mode; otherwise it toasts (`cards-view.tsx:91-116`).
- Expired cards get no set-default control.

**Rename** — `EditNicknameDialog` (`edit-nickname-dialog.tsx:20-98`), max 100 characters. `putTravellerCardsByIdNicknameApi` → `PUT /api/refund-service/traveller-cards/{id}/nickname`, then `handlePutResponse`.

**Delete** — `DeleteCardDialog` (`delete-card-dialog.tsx:32-204`) with a plan from `deletePlan` (`open-refunds.ts:38-55`). Banks always use `plain`.

| Plan | When | Behaviour |
| --- | --- | --- |
| `plain` | no open refunds | confirm, then `DELETE /api/refund-service/traveller-cards/{id}` |
| `moveToHero` | a usable hero other than this card exists | "Your open refunds move to •••• 1234" |
| `choose` | otherwise | pick a target from the non-expired cards (preselected by last-used / default) |
| `noTarget` | no usable target | "Add card" (if granted) or "Delete anyway" |

- Move-and-delete = set default on the target (if it isn't already) → pin (`traveller-payout-token`) → delete (`move-refunds.ts:33-59`, `move-calls.ts:6-15`).
- Failures (`defaultFailed`, `pinFailed` with or without the default changed, `deleteFailed`) show an amber notice with retry. A retry skips an already-done set-default (`nextFailure`, `move-refunds.ts:61-75`).

**Move open refunds** — `MoveRefundsDialog` (`move-refunds-dialog.tsx:31-130`)
- Shown after set-default or after adding a card when there are open refunds. Modes: "afterAdd" ("Use •••• 1234 for your refunds?") and "afterDefault".
- Confirm runs `moveOpenRefunds` (set-default if needed, then pin) and toasts "moved". "Not now" or "Close" dismisses.
- Pure-logic unit tests exist: `card-grants.test.ts`, `open-refunds.test.ts`, `move-refunds.test.ts` and `fill.test.ts` under `ssr/components/payout-cards/`. `apps/ssr/package.json` now has a `test:unit` script, which AGENTS.md says ssr lacks.

**Pin a card to one specific tag** — not supported. The pin endpoint takes only `payoutTokenId` and moves every open tag at once.

## 10. Profile & account

**Account tabs** — `[lang]/(main)/account/layout.tsx:12-77`: Account settings / Cards / Change password.

**Profile** — `account/page.tsx:38-75`
- Data: `myProfileApi()` → `GET /api/account/my-profile` (required) and `getProfilePictureApi(sub)` → `GET /api/account/profile-picture/{id}` (optional; type 1 = URL, type 2 = base64; `:14-21`).
- `AccountSettings` (`account/_components/account-form.tsx:26-241`) has separate forms for:
  - first + last name;
  - username (required, min 3);
  - phone (free-text `tel`, no verification);
  - email (required, **no verification flow**).
- Every "Save" sends the **whole** profile: `putPersonalInfomationApi({ userName, name, surname, phoneNumber, email, concurrencyStamp })` → `PUT /api/account/my-profile`, then `handlePutResponse` (`:63-79`).
- **[STUB] Profile picture.** `AvatarUploader` (`account/_components/avatar-uploader.tsx`) offers pick, crop (react-easy-crop) and "Update", but `handleUpload` only sets a local `blob:` preview (`account-form.tsx:48-61`). Nothing is uploaded, and it reverts on reload. Invalid type or size throws instead of showing a message.

**Change password** — `account/change-password/change-password.tsx:19-222`
- Fields: current, new and confirm (min 6, each with a show/hide toggle). A mismatch uses a native `alert()`.
- Submit: `postPasswordChangeApi({ currentPassword, newPassword })` → `POST /api/account/my-profile/change-password`, then `handlePutResponse`; the fields are cleared on success.
- For a KYC-only account the "current password" is whatever was set at registration.

**Account deletion** — **no in-app deletion in ssr.**
- `/account-deletion` (`[lang]/(public)/account-deletion/page.tsx:37-131`, always public) is a legal page. It describes the **mobile app's** Profile → Delete Account flow (10-second disabled button) and a by-request route.
- **[TODO(legal)]** The contact email, timeframe, deletion scope, retention periods and in-progress refund outcome are all shown as visible TODO notes.

**Privacy** — `/privacy` (`[lang]/(public)/privacy/page.tsx`, always public, `LAST_UPDATED` 2026-08-17)
- A long `LegalDocument` covering controller, scope, a data-collected table (identity, biometric, account, refund, payment card, boarding pass, location, camera, photos, device, notifications), biometric, sharing (Didit, Novu, Chatwoot, CARTO), transfers, retention, rights, security, children, changes, contact.
- It links to account-deletion and contains several TODO(legal) notes.
- Its payment-card text ("photographing a card … the photograph is not uploaded") describes the mobile app. ssr's scan **does** upload frames (§9).

**FAQ / help** — none, apart from the chatbot (§13).

## 11. Notifications

**Novu in-app inbox**
- A bell button in the navbar opens a popover with `NotificationInbox` (`ssr/components/global/navbar/index.tsx:143-180` → `packages/ui/src/notification/inbox.tsx:6-91`, `@novu/nextjs` `<Inbox>` / `<InboxContent>` with `applicationIdentifier`, `backendUrl`, `socketUrl`, `subscriberId = session.user.sub`).
- Shown only when `NOVU_APP_IDENTIFIER`, `NOVU_APP_URL`, `NOVU_SOCKET_URL` and `sub` are all present. In `(public)` it also requires a signed-in session (`(public)/layout.tsx:114-122`).
- Localization strings come from `Default` + `AbpUiNavigation`.
- The notification click handlers are commented out (`inbox.tsx:74-86`), so the default Novu behaviour applies.
- Preferences: only whatever Novu's stock Inbox exposes; there is no custom preferences UI.

**Push / web push** — none. There is no service worker, `Notification` API or push subscription in ssr.

## 12. Explore / map — `/explore`

**Route** — `[lang]/(public)/explore/page.tsx:49-246`, a client page. Public only if `explore` is in `PUBLIC_ROUTES`.

**Map** — Leaflet via `@repo/ayasofyazilim-ui/components/map`.
- Starts centred on Istanbul at zoom 9 (`:36-38`). The height is filled by `useViewportFill`.
- Tile layers:
  - OpenStreetMap (default, with ODbL attribution; the CARTO default was dropped because it now needs an API key, `:40-45`);
  - Esri street;
  - Esri satellite.
- Controls: fullscreen, layers, zoom, **locate** (browser geolocation), **address search** (Photon/komoot geocoder: `packages/ayasofyazilim-ui/src/components/place-autocomplete.tsx:119`; selection pans the map and drops a marker).

**Layers** (merchants on by default)

| Layer | Action | Route |
| --- | --- | --- |
| Merchants | `getPublicMerchantsViewportApi({ south,north,west,east, sector })` | `GET /api/crm-service/public/merchants/viewport` |
| Customs | `getPublicCustomsViewportApi(bounds)` | `GET /api/crm-service/public/customs/viewport` |
| Refund points | `getPublicRefundPointsViewportApi(bounds)` | `GET /api/crm-service/public/refund-points/viewport` |

- All three are sent with a **hard-coded `__tenant = df64152b-9f76-e06b-d43f-3a1bd9644ea9`** (`packages/actions/unirefund/CRMService/actions.ts:1080-1091`), because anonymous viewport calls need a country tenant (UNI-1659).
- Refetched on `moveend` with a 350 ms debounce (`use-viewport-layer.ts:65`). A layer that is switched off never fetches.

**Pins** (`explore/_components/place-markers.tsx:15-96`) — a popup shows:
- name (trimmed);
- address, or "no address";
- merchant sector badges (truncated, full name in the tooltip);
- **Directions** deep links to Google Maps and Apple Maps (destination only; `directions.ts`).

**Clusters** — when the backend returns clusters, bubbles show a count; clicking zooms in 3 levels (`place-markers.tsx:128-161`, `page.tsx:110-119`).

**Sector filter** (`sector-control.tsx:189-293`)
- The options are derived from the sectors of the merchant pins currently on screen; there is no anonymous sector list. The selection is sent as `sector` and kept even if it scrolls out of view. An "All" option clears it.

**Status banner** — Loading, Error, "zoom in to see places", or Empty (`page.tsx:252-281`).

**Not present** — list view, merchant detail page, search by merchant name, opening hours, distance sorting.

## 13. Settings & misc

**Language switching**
- Navbar `LanguageSelector` (`ssr/components/global/navbar/language-selector.tsx:85-168`): a searchable dropdown fed by `getPublicLanguagesApi` → `GET /api/administration-service/public-languages` (request-memoized, `packages/actions/core/AdministrationService/actions.ts:202-209`). Switching pushes the same path under the new locale. It is shown only when more than one language exists.
- The `(auth)` layout has a `CountrySelector` whose `changeLocale` does a full navigation (`[lang]/(auth)/layout.tsx:31-39`, `ssr/providers/i18n.tsx:27-31`).
- The middleware persists the `locale` cookie.
- Bundles exist only for `en` and `tr` (`ssr/language-data/get-translations.ts:4-10`); anything else falls back to `en`.

**Theme** — no theme switcher and no ThemeProvider. Dark-mode Tailwind classes exist in places; the brand primary colour is set inline on `<html>` (`[lang]/layout.tsx:81`).

**Chatbot** — Chatwoot `ChatbotWidget` (`packages/ui/src/chatbot/index.tsx`) in both the `(main)` and `(public)` layouts (`(main)/layout.tsx:119-124`, `(public)/layout.tsx:185-190`).
- Rendered only when `CHATBOT_URL` and `CHATBOT_TOKEN` are set.
- For signed-in users it sets Chatwoot custom attributes: `accessToken`, `preferredLanguage`, `name`, `surname`, `userId`. The widget is re-keyed per user.

**Server health** — a badge on the auth screens only: healthy / unhealthy / loading with a tooltip. `checkHealth()` fetches `${GATEWAY_URL}/api/health` (`ssr/components/server-health/index.tsx:75-189`, `actions.ts:3-14`).

**Marketplace buttons** — App Store and Google Play buttons in the footer (`ssr/components/marketplace-button/index.tsx`, `ssr/components/global/footer.tsx:132-156`). **[STUB]** Both link to `url: "#"` (`(main)/layout.tsx:88-99`, `(public)/layout.tsx:154-165`).

**Landing page `/`** — `[lang]/(public)/page.tsx` → `client.tsx:9-80`
- An "Online" pill, which is static and not tied to health.
- "Welcome" or "Welcome back {name} {surname}", and a description.
- CTAs: "Explore merchants", and "Check your tags" (signed in) or "Log in to check your tags".
- **[STUB]** Hard-coded stats: 500+ merchants, 100% faster refunds, %80 less paperwork.

**Footer** — logo, description, a links section (Explore / Tags / Account), policy links (Privacy, Account deletion), copyright year, store buttons.

**SEO / metadata**
- Root: `title = APPLICATION_NAME` (capitalized), `description: "Unirefund Taxfree APP"`, a `pentestbx-site-verification` meta tag (`[lang]/layout.tsx:42-52`).
- The viewport disables user zoom (`maximumScale:1, userScalable:false`, `:31-40`).
- Privacy and account-deletion have their own titles, descriptions and `robots: index`.

**Error pages**
- `[lang]/not-found.tsx` shows an animated "page not found" with an Explore action. The `[...notFound]` catch-all calls `notFound()`.
- `(main)/error.tsx` is an error boundary showing "Something went wrong", **the raw `error.message`**, and "Try again".
- `/unauthorized` (`[lang]/(main)/unauthorized/page.tsx`) is a static "not found or unauthorized" page with a Home link. Nothing links to it.

**Offline** — no offline or PWA support: no service worker, no manifest.

**Route handlers under `ssr/app/api/`**

| Route | What it does |
| --- | --- |
| `/api/auth/[...nextauth]` | next-auth handlers |
| `/api/session` | Didit session proxy |
| `/api/health` | returns "Ok" |
| `/api/token-store` | token-store diagnostic: mode, connected, latency; public |
| `/api/` | proxies `GET /api/abp/application-localization`. Only used by `getLocalizationResources` (`ssr/utils.ts:16-29`), which only the unused `language-data/unirefund/SSRService/index.ts:12` calls. **[DEAD CODE]** |
| `/api/token` | Superset guest-token minting with hard-coded `admin`/`admin` credentials (`ssr/app/api/token/route.ts:34-52`). Not used by any ssr UI. **[DEAD CODE, and a public unauthenticated endpoint]** |
| `/api/auth/reset-password` | unused (§1) |

## 14. Anything else a traveller can do

- **Sticker manual verification upload** (§6): photos of the sticker and form, reviewed by a refund agent who then creates the tag.
- **Claim / self-assign a tag** from four entry points:
  - the `/tags` modal;
  - the `/validate` post-result modal;
  - the `/tag/[slug]` claim overlay;
  - `/tag` manual lookup, which is read-only (no claim when both number and document are given).
- **Document capture demo** at `/document-capture` (§3).
- **Chat with support** (Chatwoot), when configured.
- There is no traveller "trips", receipts, or VAT calculator feature.

---

## Flat API table

| # | Server action (`packages/actions/…`) | SDK method → HTTP route | Used by (feature §) |
| --- | --- | --- | --- |
| 1 | `core/AccountService/actions.signInServerApi` | next-auth `credentials` → `POST {GATEWAY}/connect/token` (password grant) | Password login (§1) |
| 2 | *(utils)* `fetchScopes` | `GET {GATEWAY}/.well-known/openid-configuration` | Login, KYC login (§1) |
| 3 | *(utils)* `fetchNewAccessTokenByRefreshToken` / `refreshSessionAfterAffiliationSwitch` | `POST {GATEWAY}/connect/token` (refresh_token grant) | Silent refresh (§1), document switch (§3) |
| 4 | *(utils)* `signOutServer` | token-cache delete + next-auth signOut | Logout, stale-session cleanup, ErrorComponent (§1) |
| 5 | `unirefund/TravellerService/actions.getApiTravellerServiceSsrPublicActionsGetEmailApi` | `ssrActionPublic.getApiTravellerServiceSsrPublicActionsGetEmail` → `GET /api/traveller-service/ssr-public-actions/get-email` | KYC login, register, reset-password, validate KYC (§1, §2, §7) |
| 6 | `unirefund/TravellerService/actions.getApiTravellerServiceSsrPublicActionsGetAccessTokenApi` | `postApiTravellerServiceSsrPublicActionsGetAccessToken` → `POST /api/traveller-service/ssr-public-actions/get-access-token` | `loginViaSSRAction`: KYC login, post-register auto-login, validate (§1, §7) |
| 7 | `unirefund/TravellerService/post-actions.postCreateTravellerActionApi` | `postApiTravellerServiceSsrPublicActionsCreateTraveller` → `POST /api/traveller-service/ssr-public-actions/create-traveller` | Registration (§1) |
| 8 | `unirefund/TravellerService/post-actions.postSetPasswordActionApi` | `postApiTravellerServiceSsrPublicActionsSetPassword` → `POST /api/traveller-service/ssr-public-actions/set-password` | Reset password (§1) |
| 9 | `unirefund/TravellerService/actions.getDiditWorkflowsApi` | `getApiTravellerServiceSsrPublicActionsDiditWorkflows` → `GET /api/traveller-service/ssr-public-actions/didit-workflows` | Didit config (§2), root layout |
| 10 | `unirefund/TravellerService/actions.getEvidenceLevelRequirementsApi` | `getApiTravellerServiceSsrPublicActionsEvidenceLevelRequirements` → `GET /api/traveller-service/ssr-public-actions/evidence-level-requirements` | Didit config (§2), root layout |
| 11 | *(route handler)* `/api/session` | proxy → `POST https://verification.didit.me/v3/session/` | Every Didit flow (§2) |
| 12 | `unirefund/TravellerService/actions.getMyDocumentAffiliationsApi` | `traveller.getApiTravellerServiceTravellersMyDocumentAffiliations` → `GET /api/traveller-service/travellers/my-document-affiliations` | Document switcher, main layout (required), public layout probe, validate probe (§0, §3, §7) |
| 13 | `unirefund/TravellerService/post-actions.postSetActiveDocumentApi` | `postApiTravellerServiceTravellersMyDocumentAffiliationsByTravellerDocumentIdSetActive` → `POST /api/traveller-service/travellers/my-document-affiliations/{travellerDocumentId}/set-active` | Switch active document (§3) |
| 14 | `unirefund/TagService/actions.getTagsCrossTenantsByTravellerIdClaimApi` | `tag.getApiTagServiceTagCrossTenantsByTravellerIdClaim` → `GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim` | Tag list (§4); validate enrichment by `tagIds` (§7); open-refund detection on cards (§9) |
| 15 | `unirefund/TagService/actions.getTagsCrossTenantsByTravellerIdClaimByTagNumberApi` | `…ByTravellerIdClaimByTagNumber` → `GET /api/tag-service/tag/cross-tenants/by-traveller-id-claim/{tagNumber}` | Tag detail (§5) |
| 16 | `unirefund/TagService/actions.getStickerManualVerificationsMyApi` | `stickerManualVerification.getApiTagServiceStickerManualVerificationMy` → `GET /api/tag-service/sticker-manual-verification/my` | Pending verifications (§4) |
| 17 | `unirefund/TagService/post-actions.postStickerManualVerificationApi` | `postApiTagServiceStickerManualVerification` → `POST /api/tag-service/sticker-manual-verification` | Upload for verification (§6) |
| 18 | `unirefund/TagService/actions.getPublicTagApi` | `tagPublic.getApiTagServicePublicTag` → `GET /api/tag-service/public/tag` | `/tag/[slug]` number + document branch (§6) |
| 19 | `unirefund/TagService/actions.getPublicTagByStickerLineNumberApi` | `getApiTagServicePublicTagByStickerLineNumber` → `GET /api/tag-service/public/tag/by-sticker-line-number` | `/tag/[slug]` sticker branch (§6) |
| 20 | `unirefund/TagService/actions.getPublicTagByTagIdApi` | `getApiTagServicePublicTagByTagIdById` → `GET /api/tag-service/public/tag/by-tag-id/{id}` | `/tag/[slug]` tagId branch; claim-modal scan lookup (§6) |
| 21 | `unirefund/TagService/post-actions.postTagTravellerSelfAssignApi` | `tag.postApiTagServiceTagTravellerSelfAssign` → `POST /api/tag-service/tag/traveller-self-assign` | Claim tag: modal (scan and manual) and slug overlay (§6, §7) |
| 22 | `unirefund/TagService/post-actions.postTagTravellerPayoutTokenApi` | `tag.postApiTagServiceTagTravellerPayoutToken` → `POST /api/tag-service/tag/traveller-payout-token` | Validate payout pin (§7); move open refunds (§9) |
| 23 | `unirefund/ExportValidationService/post-actions.postQrEvidenceScanApi` | `qrEvidence.postApiExportValidationServiceQrEvidenceByQrValueScan` → `POST /api/export-validation-service/qr-evidence/{qrValue}/scan` | Validate scan, re-scan after claim, rescan-QR (§7) |
| 24 | `unirefund/RefundService/actions.getMyTravellerCardsApi` | `travellerCard.getApiRefundServiceTravellerCardsMine` → `GET /api/refund-service/traveller-cards/mine` | Cards page (§9); validate picker with `type=Card` (§7) |
| 25 | `unirefund/RefundService/post-actions.postTravellerCardsApi` | `postApiRefundServiceTravellerCards` → `POST /api/refund-service/traveller-cards` | Add card (§9, §7) |
| 26 | `unirefund/RefundService/post-actions.postTravellerBankTokenApi` | `postApiRefundServiceTravellerCardsBank` → `POST /api/refund-service/traveller-cards/bank` | Add bank account (§9) |
| 27 | `unirefund/RefundService/post-actions.postTravellerCardsByIdSetDefaultApi` | `postApiRefundServiceTravellerCardsByIdSetDefault` → `POST /api/refund-service/traveller-cards/{id}/set-default` | Set default; move-refunds step (§9) |
| 28 | `unirefund/RefundService/put-actions.putTravellerCardsByIdNicknameApi` | `putApiRefundServiceTravellerCardsByIdNickname` → `PUT /api/refund-service/traveller-cards/{id}/nickname` | Rename card / bank (§9) |
| 29 | `unirefund/RefundService/delete-actions.deleteTravellerCardsByIdApi` | `deleteApiRefundServiceTravellerCardsById` → `DELETE /api/refund-service/traveller-cards/{id}` | Delete card / bank; move-and-delete (§9) |
| 30 | *(ssr-local)* `components/card-extraction/actions.submitExtractionRunAction` | `POST {EXTRACTION_SUBMIT_URL root}/submit` (third-party, `X-Api-Key`) | Card camera scan (§9); document-capture demo (§3) |
| 31 | *(ssr-local)* `components/card-extraction/actions.waitForExtractionRunAction` | `POST {root}/{runId}/wait-for-terminal?timeoutMs=` | Same as 30 |
| 32 | `core/AccountService/actions.myProfileApi` | `profile.getApiAccountMyProfile` → `GET /api/account/my-profile` | Profile (§10) |
| 33 | `core/AccountService/put-actions.putPersonalInfomationApi` | `profile.putApiAccountMyProfile` → `PUT /api/account/my-profile` | Edit name / username / phone / email (§10) |
| 34 | `core/AccountService/actions.getProfilePictureApi` | `account.getApiAccountProfilePictureById` → `GET /api/account/profile-picture/{id}` | Avatar display (§10) |
| 35 | `core/AccountService/post-actions.postPasswordChangeApi` | `profile.postApiAccountMyProfileChangePassword` → `POST /api/account/my-profile/change-password` | Change password (§10) |
| 36 | `core/AdministrationService/actions.getPublicLanguagesApi` | `languagePublic.getApiAdministrationServicePublicLanguages` → `GET /api/administration-service/public-languages` | Language selector; main and public layouts (§13) |
| 37 | *(utils)* `getApplicationConfiguration` | `abpApplicationConfiguration.getApiAbpApplicationConfiguration` → `GET /api/abp/application-configuration`; plus `countrySetting.getApiAdministrationServiceCountrySettingsInfo` → `GET /api/administration-service/country-settings/info` | Granted policies for every client gate (§0) |
| 38 | `unirefund/CRMService/actions.getPublicMerchantsViewportApi` | `merchantPublic.getApiCrmServicePublicMerchantsViewport` → `GET /api/crm-service/public/merchants/viewport` | Explore (§12) |
| 39 | `unirefund/CRMService/actions.getPublicCustomsViewportApi` | `customPublic.getApiCrmServicePublicCustomsViewport` → `GET /api/crm-service/public/customs/viewport` | Explore (§12) |
| 40 | `unirefund/CRMService/actions.getPublicRefundPointsViewportApi` | `refundPointPublic.getApiCrmServicePublicRefundPointsViewport` → `GET /api/crm-service/public/refund-points/viewport` | Explore (§12) |
| 41 | *(ssr-local)* `components/server-health/actions.checkHealth` | `GET {GATEWAY}/api/health` | Auth-screen health badge (§13) |
| 42 | *(ssr-local)* `validate-location-actions.save/readValidateLocation` | httpOnly cookie `validate_location` (no backend) | Validate location carry-over (§7) |
| 43 | Novu `<Inbox>` (client SDK) | `NOVU_APP_URL` / `NOVU_SOCKET_URL` | Notifications (§11) |
| 44 | Photon geocoder (client) | `https://photon.komoot.io/api` | Explore address search (§12) |

**Imported but only from dead code:**
- `core/AccountService/actions.signUpServerApi` (`POST /api/account/register`)
- `sendPasswordResetCodeApi` (`POST /api/account/send-password-reset-code`)
- `resetPasswordApi` (`POST /api/account/reset-password`)
- route handlers `/api/auth/reset-password` and `/api/token` (Superset)

## Open questions (not determinable from code)

1. **Production `PUBLIC_ROUTES` / `UNAUTHORIZED_ROUTES`** per environment are not in the repo (`.env.example` says `"/"`, local `.env` says `/,explore,tag,validate`). Whether `/explore`, `/tag` and `/validate` are anonymous in dev, uat and prod is unknown.
2. **Novu inbox UI at runtime:** whether the stock `<Inbox>` shows the preferences screen in this configuration, and which workflows or channels travellers receive. Not verified.
3. **Didit workflow contents:** which checks (document, liveness, NFC, face match) each evidence level runs are configured in Didit and the backend, not in code.
4. **Refund-token lifecycle:** the Redis L2 entry's TTL equals the access-token lifetime (`token-store.ts:135-136`). Whether a refresh still succeeds after an instance restart once the access token has expired (L1 is empty and Redis has evicted the entry) needs a runtime check.
5. **Which tags `traveller-payout-token` actually moves** (the server rule), and whether a bank token can be pinned. ssr only ever pins cards.
6. **`self-assign` server validation** of the typed `salesAmount` in the manual claim path (tolerance, currency): backend behaviour, not visible in code.
7. **`get-email` / `get-access-token` behaviour** for Pending or partially completed Didit sessions: the UI handles Declined and Pending only for login, register and validate.
8. **Whether `/document-capture` and `/unauthorized` are meant to ship** or are leftovers. Neither is linked.
9. **Production intent of `/api/token`:** it mints Superset guest tokens with hard-coded `admin`/`admin` and is reachable without authentication (it lives under `api`, which the middleware matcher excludes). Unused by ssr UI.
10. **Localization completeness:** whether every `Tags.Status.*`, `Tags.Risk.*` and `DocumentType.*` key exists in `tr`. Not checked (`pnpm i18n:*` was not run).
11. **Chatwoot data sharing:** the widget sends the traveller's **access token** as a custom attribute. Whether that is intended, and what the bot does with it, is not visible here.
