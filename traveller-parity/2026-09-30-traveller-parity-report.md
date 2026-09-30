# Traveller parity: web `apps/ssr` vs `super-app`

Both apps serve the same traveller: tags, documents, payout cards, airport validation. This report lists what each one can do today and where they differ. It is **step 1: inventory only**. No code was changed.

- **ssr:** `web-app` @ `671c4944d` (`origin/main`), worktree `C:\unirefund\web-app-wt-traveller-parity`, branch `feat/traveller-parity`
- **super-app:** @ `0f582db` (`origin/main`), branch `feat/traveller-web-parity`
- **Method:** a static read of both codebases (two full inventories, linked below). About ten high-impact claims were re-checked by hand. Nothing was exercised at runtime yet.
- **Full inventories** with `path:line` citations and API tables:
  [2026-09-30-inventory-ssr.md](2026-09-30-inventory-ssr.md), [2026-09-30-inventory-super-app.md](2026-09-30-inventory-super-app.md)

Legend: **=** same in both · **≈** both, but they behave differently · **WEB** ssr only · **APP** super-app only · **—** neither

## 1. Parity matrix

### Auth & session

| Capability | | Notes |
| --- | --- | --- |
| Password login (host-level, no tenant) | = | Same `connect/token` password grant, every scope requested |
| Didit KYC login (`GetAccessToken`) | ≈ | **WEB bug:** a new traveller is sent to `register?evidenceId=`, but register reads `sessionId`, so they go through KYC a second time. APP goes straight to the create form. |
| Register via Didit (`CreateTraveller`) | ≈ | WEB also asks for phone *type*. Password minimums: WEB register 6 / reset 8; APP register none / reset 6. |
| Reset password via Didit (`SetPassword`) | = | |
| **Change password while signed in** | WEB | `POST /api/account/my-profile/change-password`. APP has none. |
| Resume an action after login (claim / validate) | ≈ | APP re-runs the pending claim or validate automatically. WEB returns to the page (`redirectTo`), and you click again. |
| A failed load signs you out | WEB | On 4 ssr pages any failed required call signs the traveller out (`ErrorComponent` + `signOutServer`). APP shows an error with Retry. |

### Identity & documents

| Capability | | Notes |
| --- | --- | --- |
| List my documents | ≈ | WEB: navbar dropdown, number + type only. APP: full screen with name, type, Primary badge, evidence level. |
| Set active document | ≈ | Both call `set-active`, then refresh the token. **WEB** throws for KYC-login sessions (no refresh token), even though the switch already succeeded server-side. |
| **Set primary document** | APP | `…/set-primary` |
| **Add a document** (Didit `ProveDocument` → `POST ssr-actions/prove-document`) | APP | |
| "Verify account", verified badge, setup strip | APP | **APP bug:** Profile → Verify Account runs Didit but never posts the approved session (Add document does). |
| Delete a document, document expiry | — | The backend DTO has no expiry field. |

### Tags: list

| Capability | | Notes |
| --- | --- | --- |
| Cross-tenant list, 20 per page | = | `tag/cross-tenants/by-traveller-id-claim` |
| Sort | APP | Newest/oldest toggle. WEB is fixed newest-first. |
| Search | APP | Client-side, searches only the current page of 20 |
| Filters | APP | Issue-date range. **APP bug:** the Tag number, Export date and Paid date fields light the badge but are never sent. WEB has no filter UI (URL parameters only). |
| Status filter | — | The endpoint accepts `status[]`; neither app exposes it. |
| Deadline urgency chip ("N days left") | APP | |
| Headline amount on the row | ≈ | WEB: refund (or gross). APP: purchase amount. |
| Risk shown to the traveller | ≈ | WEB always shows a Green/Red badge. APP shows a dot only with `TagRisks.ViewRiskLevel`. **Needs a decision.** |
| Home dashboard ("You'll receive", already paid, latest tag, shortcuts) | APP | **APP bug:** the totals cover only the 20 newest tags. |

### Tags: detail

| Capability | | Notes |
| --- | --- | --- |
| Tag number, date, status, merchant, traveller | ≈ | **WEB shows the status as a raw enum string** (not localized), with a colour map keyed to values that don't exist. |
| Invoices | ≈ | WEB: **first invoice only**, no lines. APP: every invoice with its lines, tax base and VAT rate. |
| Amounts: VAT, fees, net refund, exchange rate | APP | WEB shows only one refund total. |
| "Validate by" deadline + countdown | APP | Traveller-only by design (see memory: tag-detail parity) |
| Progress timeline (Issued → Validated → Refund) | APP | |
| Receipt / PDF download | — | **WEB has a "Download PDF" button with no handler.** |
| Which card this tag pays to | — | Neither shows it |

### Tag lookup, QR, claim

| Capability | | Notes |
| --- | --- | --- |
| Public tag page: by tag id, by number + document, by sticker | = | Same three anonymous endpoints |
| Traveller's name/document on the anonymous page | ≈ | **WEB shows name, document number and nationality to anyone with the link.** APP hides the block from non-staff because the endpoint is anonymous. **Needs a decision (privacy).** |
| Manual lookup (tag number + passport) | ≈ | WEB: `/tag`, linked from the navbar. APP: `/manual-entry` exists, but its "can't scan?" link is flagged off. |
| Claim a tag by scanning | = | `traveller-self-assign` with the sales amount |
| **Claim a tag by typing number + sales amount** | WEB | The claim modal's Manual tab. APP's claim modal is scan-only. |
| Claim entry points | ≈ | WEB: `/tags` toolbar, the validate results, the `/tag/[slug]` overlay. APP: the scan tab, the preview, the validate results. The WEB slug overlay has no grant check; the `/tags` one does. |
| Sticker photo upload for manual review | = | WEB lists only Created/Invalid uploads. APP lists every status, including Approved. |
| Scan before choosing a role / logging in | APP | Role-gate "Scan QR" pill |

### Airport validation

| Capability | | Notes |
| --- | --- | --- |
| Location → boarding pass (BCBP scan or manual) → payout card pin → scan → results | = | Same endpoints and step order; clearly built together |
| Anonymous entry | ≈ | WEB runs Didit inline, then auto-registers or logs in and returns. APP: "Log in to validate" → login screen (which offers Didit) → resume. |
| "Already validated" results bucket | APP | **WEB fetches `alreadyClearedTagIds` and never renders them.** |
| Suggested exit points, customs-rejected, expired-QR rescan, claim missing tags + re-scan | = | |
| "Too far from the airport" message | ≈ | WEB localizes it; APP shows the server's message |

### Payout cards

| Capability | | Notes |
| --- | --- | --- |
| List, add by typing, set default, rename, delete | = | Same grant table and same delete plans (plain / moveToHero / choose / noTarget) |
| Move open refunds after add / default / delete | = | |
| Card capture | ≈ | WEB: camera → document-extraction API. APP: NFC tap (Android), platform scan, ML Kit OCR → the same extraction API as a fallback. |
| **Bank accounts (IBAN)** | WEB | APP has `AddBankSheet` built but **flagged off**. **APP bug:** its Home and Profile "N saved" counts still include banks. |
| Pin a card to one specific tag | — | The endpoint pins every open tag at once |

### Profile & account

| Capability | | Notes |
| --- | --- | --- |
| Edit name, surname, username, phone | = | `PUT /api/account/my-profile` |
| Edit email | ≈ | WEB saves it (no verification). **APP bug:** the email field is editable but never sent. |
| **Profile picture upload** | APP | **WEB is a stub:** crop + preview, never uploaded, lost on reload. APP bug: a failed upload leaves the loading overlay stuck. |
| **Delete account in-app** | APP | `DELETE /api/identity/gdprs`, 10 s countdown. WEB has only a legal page that describes the mobile flow. |
| Privacy page | = | WEB hosts it; APP opens `ssr.unirefund.com/en/privacy` |
| FAQ | APP | Static FAQ tab |
| **Support chat (Chatwoot)** | WEB | Only when `CHATBOT_*` is set. It sends the traveller's access token as a custom attribute. |
| Profile QR | — | APP's encodes the literal `"UNIREFUND"` (stub) |

### Notifications, explore, misc

| Capability | | Notes |
| --- | --- | --- |
| Novu in-app inbox | ≈ | APP marks everything read on open. WEB uses the stock Novu inbox. |
| Push notifications | — | Neither registers for push |
| Notification preferences | — | APP's row is a disabled stub |
| Explore map: 3 layers, sector filter, place search, locate, directions | = | Both send the same hard-coded country tenant (UNI-1659) |
| Cluster tap zooms in | WEB | APP: `TODO` at `ExploreMap.tsx:215` |
| Explore as a first-class entry | ≈ | WEB: public page and navbar. APP: only a tile on Home. |
| Language en/tr | = | |
| Theme / dark mode | — | |
| Deep links from web QR URLs | ? | APP claims `tur.unirefund.com` universal links but has **no route** for `/{lang}/validate` or `/tag/<slug>`. Unverified on a device. |

## 2. Gaps, grouped by what to build

**Missing from super-app** (the web has it):
1. Change password while signed in
2. Bank accounts as a payout method (built, flagged off)
3. Manual claim by tag number + sales amount
4. A reachable manual lookup (the link is flagged off)
5. Saving an email change (currently a bug)
6. Support chat, if wanted on mobile
7. Cluster tap on the map

**Missing from ssr** (the app has it):
1. Document management: add a document (prove-document), set primary, a full documents page
2. Rich tag detail: all invoices + lines, fees + net refund, deadline, timeline, localized status
3. Tag list sort, date filter, deadline chips
4. "Already validated" bucket in validate results
5. Real profile picture upload
6. In-app account deletion
7. Home dashboard / refund summary
8. FAQ
9. Verified badge and setup strip
10. Card capture by NFC / native scan (the device-only parts can't come to web; the rest can)

**Divergences that need a product decision, not code:**
- Should travellers see their **risk level** (web yes, app grant-gated)?
- Should the **anonymous public tag page** show the traveller's name and document number (web yes, app no)?
- Which **headline amount** does a tag row show: refund or purchase?
- One **password rule** for register / reset / change.
- Should a failed page load **sign the traveller out** (web) or offer Retry (app)?

## 3. Bugs found along the way (not parity, but real)

**ssr**
- KYC login → register uses `evidenceId` where register reads `sessionId`, so new travellers do KYC twice. *Verified.*
- "Download PDF" on the tag detail has no handler. *Verified.*
- **`/api/token` is an unauthenticated GET** that mints Superset guest tokens with hard-coded `admin`/`admin`. The middleware skips `/api`. It is live only where `SUPERSET_URL` is set (not in the local `.env`). *Verified in code; the deployment env is unchecked.*
- Switching the active document fails for KYC-login sessions (no refresh token).
- The document-capture copy and the privacy page say card frames never leave the device; ssr uploads them.
- The App Store / Google Play buttons link to `#`.

**super-app**
- The edit-profile email is never sent. *Verified.*
- The filter sheet's Tag number / Export date / Paid date are no-ops for travellers. *Verified.*
- Verify Account never posts the approved Didit session. *Verified.*
- The Home totals cover only the first 20 tags.
- The bank count includes hidden bank tokens.
- A failed avatar upload leaves the loading overlay stuck.
- A failed Explore layer fetch is only logged, with no UI.

## 4. Not verified yet

- Which ABP grants a real traveller account actually holds. That decides which card / upload / pin / add-document controls render in **both** apps.
- Production `PUBLIC_ROUTES` for ssr: whether `/explore`, `/tag` and `/validate` work signed out in uat or prod.
- Universal-link behaviour for web QR URLs on a device.
- Nothing above has been clicked through yet. The next pass should walk each "≈" row in both apps, with ssr on `http://localhost:3010` and super-app on CPadNFC, before any fix is planned.
