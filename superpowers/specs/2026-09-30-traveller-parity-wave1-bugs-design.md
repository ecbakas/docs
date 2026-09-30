# Traveller parity — Wave 1: confirmed bugs

Part of the [traveller parity roadmap](2026-09-30-traveller-parity-roadmap.md). Every
item here was found by the 2026-09-30 inventory. Items marked *verified* were re-checked by
reading the code at the cited line. None of them is a new feature.

**Checkouts:**
- ssr: worktree `C:\unirefund\web-app-wt-traveller-parity`, branch `feat/traveller-parity`, base `origin/main` @ `671c4944d`.
  - `packages/utils` is a local clone of the submodule at `63d2019` (= `web-utils` `origin/main`).
- super-app: `C:\unirefund\super-app`, branch `feat/traveller-web-parity`, base `origin/main` @ `0f582db`.

## ssr

### S1. Delete the public Superset token route (security) — *verified*
`apps/ssr/src/app/api/token/route.ts`:
- `GET` mints Superset guest tokens by logging in with hard-coded `admin`/`admin`.
- `proxy.ts:41`'s matcher excludes `api`, so it needs no session.
- Nothing in `apps/` or `packages/` calls it.

**Change:** delete the file. No replacement.
**Verify:** `curl -s -o /dev/null -w "%{http_code}" localhost:3010/api/token?dashboardId=x` returns 404.

### S2. KYC login no longer asks a new traveller to verify twice — *verified*
`app/[lang]/(auth)/login/kyc/didit.tsx:94` pushes `/{lang}/register?evidenceId=…`, but
`register/page.tsx:31` reads `sessionId`, so the traveller lands on a fresh Didit
`CreateTraveller` run.

**Change:** push `?sessionId=`. The register page then calls get-email and renders the create form.
**Verify:** browser — KYC login with an identity that has no account lands directly on the create form.

### S3. KYC logins keep their refresh token — *verified*
The backend's `get-access-token` response (`LoginViaSSRActionResponseDto`) carries an
optional `refreshToken`. ssr drops it in two places:
- `login-via-ssr-action.ts:39-46` destructures only `accessToken` / `expiresIn`;
- the `ssr-token` Credentials provider (`packages/utils/auth/auth.ts:170-205`) hard-codes `""`.

**Consequences today:**
1. A KYC session dies when the access token expires (`resolveAccessToken`, `auth.ts:70-76`).
2. Switching the active document throws "No refresh token available" after set-active has already succeeded (`auth-actions.ts:141-148`).

super-app already keeps this token (`SessionProvider.tsx:454-458`).

**Change:**
- `loginViaSSRAction` passes `refreshToken` (when present) to `signIn("ssr-token", …)`.
- The provider accepts an optional `refreshToken` credential and hands it to `getUserData` and `setTokenCache`.
- An absent token stays `""`, so today's behaviour is unchanged when the backend omits it.
- The existing refresh path already keys off a non-empty `refresh_token`, so no other change is needed.

**Delivery:** `auth.ts` is in the `packages/utils` submodule. Commit it on a branch inside
the submodule, open a `web-utils` PR, and bump the pointer in the web-app PR (the web-app PR
depends on it).

**Verify:**
- type-check.
- Browser — KYC login, then switch the active document from the navbar: it succeeds with no error toast.
- The session survives past the access-token lifetime.

### S4. Remove the dead "Download PDF" button — *verified*
`tags/[tagNumber]/_components/invoice-summary.tsx:84-91` renders a button with no handler.
No SDK has a tag PDF or receipt endpoint.

**Change:** remove the button and its now-unused `InvoiceSummary.DownloadPDF` key (en + tr).
A receipt download would be a backend feature first.

### S5. Gate claim and risk controls by their grant pairs
ssr has one claim gate, which checks only the leaf, and two claim entry points with none.
The rule is group + leaf.

**Change:** a `apps/ssr/src/components/tags/tag-grants.ts` module (pure, like `payout-cards/card-grants.ts`):
- `canClaimTag` = `TagService.Tags` + `TagService.Tags.TravellerSelfAssign`
- `canViewRisk` = `TagService.TagRisks` + `TagService.TagRisks.ViewRiskLevel`

**Applied at:**
- `tags/_components/tag-claim.tsx:15` (replace the leaf-only check);
- `validate/_components/validate-client.tsx:211-233` ("Claim missing tags": no button without the grant);
- `tag/[slug]` claim overlay — signed-in "Claim tag" only. Anonymous users still get "Log in to claim", because they have no grants yet;
- `tags/_components/tag-table-view.tsx:138-174` — the risk column, shown only with `canViewRisk`.

The test traveller holds all four policies, so nothing visibly changes for them.
**Test:** `tag-grants.test.ts` under `test:unit` (group missing, leaf missing, both held).

### S6. "Never leaves the device" copy — DROPPED (user decision, 2026-09-30)
Four strings say a card photo is read only on the device:
- `DocumentCapture.Description`;
- `Privacy.Collect.PaymentCard.Collected`, `Privacy.Collect.Camera.Collected` and `Privacy.Sharing.P3`.

Today both apps can send the photo to the document-extraction service. **The copy stays as
it is.** The card-scan behaviour will be changed later so that the copy becomes true, so do
not reword it in this wave.

## super-app

### M1. Edit profile saves the email — *verified*
`screens/shared/Profile/EditProfileScreen.tsx:43-49` builds `updatedProfile` without `emailInput`.
**Change:** include `email: emailInput`.
**Test:** extend the screen's router test — the `editProfile` mock receives the edited email.

### M2. The traveller filter sheet offers only what the endpoint applies — *verified*
For the Traveller scope, `useLoadTags.queryToParams` (`hooks/useLoadTags.tsx:151-156`) sends
only the issue-date range and `status`. `TagFilterSheet` still shows four fields that change
nothing: Tag number, Export date, Paid date, and (with `ViewRiskLevel`, which travellers hold)
Risk-evaluation date. The cross-tenant endpoint accepts none of them.

**Change:**
- `TagFilterSheet` takes a `scope` prop and, for `"Traveller"`, renders only the issue-date range.
- `TagScreen.tsx:1249` passes it.
- The filter badge counts only fields the scope sends, so a stale query cannot light it.

**Test:** router test — the Traveller sheet renders the issue-date control only; the staff sheet is unchanged.

### M3. Verify Account records its result — *verified*
`screens/traveller/Profile/useVerifyAccount.ts:55-61` logs the approved Didit session and
never posts it. Add document (`useTravellerDocuments.ts:118-146`) runs the same
`ProveDocument` workflow and does post it.

**Change:**
- On `approved`, call `postProveDocumentApi(sessionId)`, then refetch what the profile's badge and setup strip read.
- Show the Approved alert only after the post succeeds; a failed post shows the Failed alert.
- Gate the Verify Account row and the setup-strip identity step on `TravellerService.SSRActions` + `.ProveDocument` (the same pair Add document uses).

**Test:** hook test — approved → posts once → refetches; post failure → Failed alert; not approved → no post.

### M4. Home totals cover every tag
`useHomeStatus` builds the summary from the tag store, which holds one page (at most 20).
No traveller-scoped totals endpoint exists (`/tag/summary` is staff-only).

**Change:** Home fetches the traveller's tags unpaged with `maxResultCount: 999` (the same
bound `useHasOpenRefunds` uses), sorted `issueDate desc`, on each focus, and derives the
summary from that list. Until the list lands, or if it fails, the summary uses the loaded
page. The latest-tag card and the list screen's paging are untouched.
**Test:** the `homeStatus.logic` tests already cover the derivation. Add a hook test that the summary reads the unpaged fetch, not the store page.

### M5. Payout counts match what is shown — *verified*
`screens/traveller/Profile/useProfileIdentity.ts:85` counts `Card || Bank`, but bank tokens
are hidden (bank payout is off). The Home and Profile "N saved" figures and the setup
strip's payout step count banks.
**Change:** count `Card` only.
**Test:** extend the existing test.

### M6. A failed avatar upload does not leave the overlay stuck — *verified*
`screens/shared/Profile/_components/AvatarModal.tsx:56-70`: the `uploadImage()` promise has
no `catch`, so a rejection leaves `/loading` on screen, and that screen blocks hardware back.
**Change:** add a `catch`: `router.back()` plus an error toast.
**Test:** router test — a rejected upload pops the overlay and shows the error.

### M7. Explore says when a layer fails — *verified*
`screens/shared/Explore/_components/useViewportLayer.ts:64-74` sets `status: "error"`, and
nothing renders it (the code's own comment says so).
**Change:** when any enabled layer is in `error`, the Explore screen shows a small
non-blocking banner ("Couldn't load places — move the map to retry"). Already-drawn pins stay.
**Test:** router test on the screen with a failing layer fetcher.

### M8. Delete account is gated by its grant
`DELETE /api/identity/gdprs` requires `IdentityService.Gdprs` + `.DeleteUserData`. The user
added the grant to the traveller role on 2026-09-30.

**Change:**
- A `useCanDeleteAccount()` hook (the pattern of `useCanUploadVerification`).
- `IdentityProfileScreen` and `ProfileScreen` pass `onAccountDeletion` to `useLegalMenuItems` only when it returns true. A missing handler already drops the row.

**Test:** router test — the row is present with the pair and absent without it.

## Verification and delivery

**Gates:**
- ssr: `pnpm --filter ssr type-check`, `pnpm --filter ssr lint` (baseline 0 errors), `pnpm --filter ssr test:unit`.
- super-app: `npm run typecheck` (baseline 1 known error), `npm test`, and `npx eslint` on the touched files.
- Re-measure every baseline before starting; both checkouts are shared.

**Manual pass:**
- ssr on `http://localhost:3010`, signed in as `tur-a25y29041`: S2 (if a fresh identity is available), S3, S4, S5.
- super-app on CPadNFC via Metro 8095, same account: M1–M8. JS only, no rebuild.

**Three PRs:**
1. `web-utils` — S3's provider change.
2. `unirefund-web` — S1–S5 plus the `packages/utils` pointer bump. Merge after 1.
3. `unirefund-mobile` — M1–M8.

**Out of scope:** S6's privacy/capture copy (see above), the unused `kyc.tsx` / classic-form dead code in ssr, the
sign-out-on-error behaviour (wave 5), and everything in waves 2–5.
