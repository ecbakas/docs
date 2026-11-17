# Sticker manual verification by tag number, and code-based e-mail verification (web-app)

**Date:** 2026-11-17
**Tickets:**
- UNI-1875: sticker manual verification by tag number.
- UNI-1889: e-mail sync and self-service verification.
- UNI-1920: backend follow-up, assigned to Kadir Tuna.

**Source:** the backend's frontend handoff "Sticker manual verification & e-mail verification", plus dev-api Swagger re-read on 2026-11-17. Where the two disagree, Swagger wins.

## Intent

The backend shipped two features to dev (version 2384). **Only dev matters for this work.** The user said so on 2026-11-17, so no merge is gated on UAT or production deploys.

1. **Sticker pairs by tag number.** A traveller can now upload a sticker and tax-free-form pair against an existing **tag number**, not only a sticker line. A refund agent completes such a pair against that tag instead of creating a new one.
2. **Code-based e-mail verification.** A person keeps up to 5 e-mail records and verifies each with a 6-digit code. One record is primary, and the primary is the sign-in e-mail. This replaces the link-based check of the single account e-mail that web-app shipped in #383/#385.

web-app (`apps/ssr` for travellers, `apps/web` for the portal) has to adopt both. super-app follows later, under a separate design.

## Goals

- Agents can review and complete tag-number pairs. Travellers can upload them.
- Travellers (ssr) and business users (portal) manage their own e-mails: list, add, verify by code, make primary.
- Staff use the new set-primary endpoints, and no request sends the removed `isPrimary` field.
- A "Verify" button in the code e-mail opens a page that confirms the code.

## Non-goals

- super-app. That is a separate design, done after web-app.
- Backend changes. They go through UNI-1920.
- `packages/utils` and `packages/ayasofyazilim-ui` (submodules). Any gap there is reported, not patched through the submodule boundary.
- Regenerating `packages/core-saas`. It belongs to ayasofyazilim-core-project.

## Anti-goals

These would make the work a failure even if it technically ships.

- A screen that offers an action the backend will refuse for that pair or record. For example: create-tag on a tag-number pair, or Verify on a record already refused as belonging to another account.
- A sign-in e-mail that changes without the user asking.
- Hand-written column lists or forms for shapes the generated schema already describes.

## Constraints

- **Shipping order (dev only).**
  - UNI-1875 can merge as soon as it is ready.
  - UNI-1889 **must not open a PR until UNI-1920 is fixed on dev**. Today existing accounts have no record for their sign-in e-mail, and a VIRTUAL system address is primary.
- **Repo rules** (`web-app/AGENTS.md`, `.claude/rules/*`):
  - backend calls only through `@repo/actions`;
  - every visible string in `en.json` and `tr.json`;
  - `data-testid` on the listed components;
  - `guardPage` plus `isActionGranted` on the endpoint's full permission pair;
  - `pnpm policy:audit` must stay green;
  - one logical change per PR.
- **What `structuredError` carries.** It keeps the backend error `code`, but drops `error.data`. So `remainingAttempts` is unavailable unless the backend's message includes it (UNI-1920 item 4).
- **Error codes on dev.** They look like `UniRefund.TravellerService:010054`. Business errors arrive as HTTP 403, which is ABP's default.
- **Unit tests.** Only plain `.ts` modules are testable (`node --test`; no JSX). Logic worth testing lives in sibling `.ts` helpers.

## Approaches considered

1. **E-mail verification: replace the link flow, or keep both.**
   - **Replace (chosen by the user).** "My e-mails" becomes the only way to verify, and the sign-in e-mail field turns read-only.
   - **Keep both.** The link flow stays for the sign-in e-mail, and the list handles extra addresses. Rejected: two paths can disagree about what "verified" means.
2. **One PR or two.** **Two (chosen).** UNI-1889 waits on UNI-1920 and UNI-1875 does not, and the repo asks for one logical change per PR.
3. **Where the "Verify" link lands.**
   - **Reuse the existing `/validate-email` pages with a second mode for `?emailId&code` (chosen).** This matches the generic Novu template the team already uses for account e-mails.
   - A new route was the alternative. It was rejected: two pages doing the same job, and two URLs for the template to route between.

---

## Workstream 1: UNI-1875, manual verification by tag number

**Branch:** `feat/uni-1875-manual-verification-tag-number`, from `main`, in its own worktree.

### What dev's Swagger actually says

The wiki is out of date on three points:

- the upload has **no `email`**;
- there is **no `isContactEmailVerified`**;
- create-tag gained an optional `travellerSignatureBase64`.

The full contract:

- **Upload.** `POST /api/tag-service/sticker-manual-verification` takes `{ stickerLineNumber?, tagNumber?, frontPictureBase64, backPictureBase64 }`, with at least one number. It requires `TagService.StickerManualVerifications` + `.Upload`.
- **Agent list.** `GET .../sticker-manual-verification?Status&StickerLineNumber&TagNumber` (`.ViewList`). Each row has a nullable `stickerLineNumber`, plus `tagNumber` and `contactEmail`.
- **Detail.** `GET .../{id}` (`.View`) adds `tagNumber` and `contactEmail`.
- **Mine.** `GET .../my` (`.ViewMine`) adds `tagNumber`.
- **Create tag.** `POST /api/tag-service/tag/by-manual-verification` is for sticker-line pairs only. It requires `TagService.Tags` + `.CreateByManualVerification`.
- **Assign traveller.** `POST /api/tag-service/tag/by-manual-verification/assign-traveller` takes `{ manualVerificationId }` and returns a `TagDto`. It is for tag-number pairs only, and requires `TagService.Tags` + `.AssignTravellerByManualVerification`.
- **New errors.** `0100142`–`0100149`. The backend's `tr` texts for these are still English, which is a backend localization gap.

### Changes

1. **Regenerate the TagService client** (`packages/saas`, `-f Tag`, then prettier on the service). Only real contract changes should remain. Fix every type error the regeneration surfaces in both apps.
2. **Portal list** (`operations/manual-verifications`):
   - add a `tagNumber` column and a `tagNumber` string filter;
   - the page forwards `tagNumber`;
   - the detail `RowLink` must work for a pair whose `stickerLineNumber` is null, so put it on whichever number the pair has;
   - add a `contactEmail` column.
3. **Portal detail** (`operations/manual-verifications/[id]`):
   - **Heading:** `tagNumber ?? stickerLineNumber ?? title`.
   - **Details strip:** shows both numbers when present, plus the contact e-mail.
   - **Pending pair with a `tagNumber`:** replace the create-tag form with a "Complete against tag {tagNumber}" action. It calls assign-traveller, is gated on the full pair, and refreshes on success. On `0100148` (the tag belongs to another traveller), show the backend message and point to Reject.
   - **Pending pair with only a sticker line:** unchanged create-tag form. Any optional signature support is left to the builder; it is not required.
   - **Choosing the action** is a pure helper (`pairCompletion(pair)` → `"assign" | "create" | null`), with unit tests.
4. **ssr upload** (`components/verification/upload-verification-dialog.tsx`):
   - add a tag number input beside the sticker line;
   - require at least one number, with both allowed; this check is a pure helper with tests;
   - send `tagNumber`;
   - show backend refusals as returned (`0100142`, `0100143`, `0100144`, `0100101`, `0100102`, `0100145`, ...);
   - QR pre-fill of the line number stays as it is.
5. **ssr "My uploads"** (`tags/_components/verification-list*.tsx`):
   - show whichever number a pair has, null-safe;
   - add "Upload again" on Invalid pairs, opening the upload dialog pre-filled with that pair's numbers.
6. **i18n:** add new keys to `apps/web .../TagService/resources/{en,tr}.json` and ssr `SSRService`.

---

## Workstream 2: UNI-1889, code-based e-mail verification

**Branch:** `feat/uni-1889-email-verification`, worktree `C:\unirefund\web-app-wt-verification`. It already holds the ssr "My e-mails" spike, which the user approved as is. **No PR until UNI-1920 lands.**

### Contract (dev Swagger)

**Self-service.** The same routes exist under two bases:
- `api/traveller-service/my-emails`, with permissions `TravellerService.MyEmails.*`;
- `api/crm-service/my-emails`, with permissions `CRMService.MyEmails.*`.

| Route | Returns | Permission leaf |
|---|---|---|
| `GET {base}` | records | `.ViewList` |
| `POST {base}` with `{emailAddress, type}` | the new record | `.Create` |
| `POST {base}/{id}/send-verification-code` | `{maskedDestination, expiresAt}` | `.SendVerificationCode` |
| `POST {base}/{id}/confirm-verification-code` with `{code}` | `{email, becamePrimary}` | `.ConfirmVerificationCode` |
| `POST {base}/{id}/set-primary` | nothing | `.SetPrimary` |

**Staff.**
- `POST traveller-service/travellers/{id}/emails/{emailId}/set-primary` (`TravellerService.Travellers.SetPrimaryEmail`).
- `POST crm-service/emails/{id}/set-primary` (`CRMService.Emails.SetPrimary`).
- The contact-verification endpoints are already wired in the portal.

**Rules:**
- 6-digit code, 10-minute lifetime;
- 5 wrong tries, then a new code is needed;
- 60 s between codes, at most 5 codes per 24 h;
- at most 5 records per person;
- the VIRTUAL type is a response-only system address;
- the primary cannot be edited;
- crm my-emails needs a portal account linked to exactly one individual (`CRMService:010070`).

### Changes

1. **Regenerate the clients.** TravellerService is done on the branch; CRMService remains, then fix the fallout.
2. **ssr "My e-mails"** (`profile/emails`, built and approved):
   - **A refused record** (`010054`, the address is on another account): show the backend message on its row and drop its Verify action, instead of the toast. The refusal is remembered only for the page's lifetime.
   - **Remove action** on non-primary rows, once UNI-1920 adds delete. If UNI-1920 instead chooses a backend cleanup, there is nothing to build here.
   - **Unit tests** for `utils/profile/my-emails.ts`.
   - Edit Profile's e-mail field stays read-only, with a link to the screen (done).
3. **`/validate-email` code mode** in both apps:
   - **Reading the link:** `?emailId&code` (plus optional `tenantId`) selects code mode. The existing `?userId&confirmationToken` link keeps working.
   - **Signed in:** call the app's `confirm-verification-code` and show verified or failed, reusing the page's existing Empty states. On failure, link to "My e-mails" to request a new code.
   - **Signed out:** redirect to login with a return to the same URL.
   - **Which service confirms:** in ssr, traveller-service; in web, crm-service.
   - **Novu template for `email-verification-code`.** The payload has `emailId`, `code`, `partyType` and `tenantId`, but no `appName`. So the template switches on `partyType`: TRAVELLER goes to ssr, INDIVIDUAL to the portal, and other types get no button. The ready-to-paste snippet goes in the PR description for the backend team.
4. **Portal "My e-mails"** (new tab `account/emails` in the `(core)/account` layout):
   - a `MasterDataGrid` of records, with a primary / verified / unverified badge;
   - **row actions:** Verify, in a dialog with the 6-digit input, 60 s resend and lock after 5 wrong tries; Make primary, behind a confirm step;
   - **table action:** Add, in a dialog with a `SchemaForm` on `CreateMyEmailDto`, and the VIRTUAL type excluded;
   - every action gated on its `CRMService.MyEmails` pair;
   - **`010070`:** the tab shows a short "not available for this account" state instead of an error.
   - **Personal Information:** the inline link verification (#385) is replaced by a read-only e-mail field and a link to the tab, mirroring ssr.
5. **Staff, traveller e-mails** (`parties/travellers/[travellerId]/_components/contact/email-form.tsx`):
   - the `isPrimary` switch becomes a "Make primary" row action, shown only for verified non-primary rows and gated on `SetPrimaryEmail`;
   - add an `isConfirmed` column;
   - stop sending `isPrimary`.
6. **Staff, CRM party e-mails** (`parties/_components/contact/email-form.tsx`):
   - the same switch-to-action change, using `crm-service/emails/{id}/set-primary` (`CRMService.Emails.SetPrimary`);
   - stop sending `isPrimary`.
7. **Party create forms:** remove `email.isPrimary` from every create default and request:
   - merchants and sub-merchants;
   - refund points and sub-refund-points;
   - tax-free and sub-tax-free;
   - tax offices and sub-tax-offices;
   - customs and sub-customs;
   - tour guides;
   - `individual-form.tsx`.

   The regenerated CRM types will flag most of these.
8. **i18n:** `CRMService` / `AccountService` (portal) and `SSRService` (ssr), in `en` and `tr`.

---

## Workstream 3: super-app (after web-app)

This mirrors workstreams 1 and 2 in `unirefund-mobile`, under its own design document. One thing to check there: the code e-mail's ssr link should open the app if `/validate-email` is among the universal-link paths.

## Verification

- **Gates per `web-app/AGENTS.md`:**
  - `type-check`, `lint` and `test:unit` for web and ssr;
  - `policy:audit`, `grid:keys`, `form:order`;
  - `i18n:missing --app=web` and `i18n:unused`.

  Hold the stated baselines.
- **Manual check on dev:**
  - test traveller `tur-a25y29041` (ssr upload, My e-mails, validate page);
  - `siggi.refund` (agent list, detail, assign and create);
  - a portal account linked to one individual (portal My e-mails);
  - an account that is not linked to one individual (`010070`).
- **Cannot be verified locally:** the Novu e-mail's button until the template is changed. The PR description says so.

## Decisions from the builder check

Calls marked *(call)* were made by Claude and are open to correction.

1. **UNI-1875 still ships independently** *(call)*.
   - **What the check looks at.** Per the handoff, `0100145` checks the traveller's primary e-mail *record*, the one from my-emails, not the account's confirmed e-mail.
   - **Who it blocks.** On dev, existing travellers with a VIRTUAL primary are refused today, whatever web-app ships. Today's sticker-line-only upload on `main` hits the same refusal, and UNI-1920's backfill is what clears it.
   - **In UNI-1875,** the upload dialog shows `0100145`'s message as returned, with no link, because "My e-mails" isn't on `main` yet.
   - **In UNI-1889,** the dialog gains a check up front, from my-emails, and a link to "My e-mails" for this case.
2. **Novu snippet** *(call)*.
   - **Shape.** It mirrors the team's existing generic template: per-environment base URLs hard-coded in each environment's template, and no locale segment, because the app's middleware adds the locale.
   - **Branching.** It switches on `partyType` (TRAVELLER goes to ssr, INDIVIDUAL to the portal).
   - **Showing the button.** The Verify button renders only when `payload.userId` is non-empty. That keeps the button out of the e-mails staff send to contacts who have no account: the same workflow serves staff `contact-verifications/send-code`, and those contacts could never sign in to confirm.
3. **Remove is conditional on UNI-1920** *(call)*. If UNI-1920 adds `DELETE my-emails/{id}`, both the ssr screen and the portal tab get a Remove action on non-primary rows, gated on the new permission pair. If UNI-1920 chooses a backend cleanup instead, neither app gets one. This step is planned last, behind that condition.
4. **Portal Personal Information for accounts without "My e-mails"** (`CRMService:010070`, e.g. admin users) *(call, the user may override)*.
   - **These accounts keep today's behaviour from #385:** an editable e-mail field with link-based verification.
   - **Accounts linked to one individual** get the read-only field and a link to the tab.
   - **How the page tells them apart:** it reads `crm-service/my-emails`, when the `.ViewList` pair is granted, and treats `010070` as "not linked".
   - **Consequence:** `VerifiedEmailWidget` and `SendVerificationButton` stay in the portal.

## Left to the builder

- Layout and copy details within the repo's existing patterns.
- Whether the pair-completion helper lives beside the detail page or in `utils/`.
- Commit granularity.
- Whether the ssr upload dialog shows the tag number field above or below the sticker line.
