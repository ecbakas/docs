# Traveller parity — Wave 2: tags

Part of the [traveller parity roadmap](2026-09-30-traveller-parity-roadmap.md). This wave makes the **tag** experience equivalent in `web-app/apps/ssr` and `super-app`. super-app's traveller tag view is the reference; ssr catches up to it. super-app gains the typed claim path that web already has.

## Decisions (user, 2026-10-01)

1. **A tag row leads with the purchase amount** (`salesAmount`), as super-app does today. The user may change this later, so each app picks the headline in one small, tested helper.
2. **The anonymous public tag page hides the traveller block** (name, document number, nationality), as super-app already does. Anyone holding the receipt's QR can open that page.
3. **Number-plus-passport lookup is not advertised in either app.**
   - super-app's scanner "can't scan?" link stays hidden: `SHOW_MANUAL_ENTRY_LINK = false`, set on 2026-09-29.
   - ssr drops its navbar link to `/tag`.
   - Both routes stay reachable directly.

## Facts this design rests on

- **Same data source.** Both apps read a signed-in tag from `GET tag/cross-tenants/by-traveller-id-claim/{tagNumber}`, which returns `TagPublicDetailDto`. The public page uses the anonymous `public/tag*` endpoints, which return the same DTO.
- **Totals are limited for travellers.** The DTO's `totals` are filtered by the backend to `SalesAmount`, `VatAmount` and `GrossRefund`. So the traveller's amounts are purchase, VAT and gross refund, plus a "fees are applied when the refund is issued" note. No fee or net rows can appear in either app.
- **The list row** (`TagListItemForTravellerCrossTenantsDto`) carries everything the row needs: `salesAmount`, `currency`, `isEarlyRefunded`, `exportValidationExpirationDate`, `refundExpirationDate`, `status` and `risk`.
- **The reference logic** in super-app is pure and tested:
  - `src/utils/tagDeadline.ts`
  - `src/utils/tagJourney.ts`
  - `src/utils/tagAmounts.ts`
  - `src/utils/tagMoney.ts`
  - `src/utils/tagDateRange.ts`
  - tests in `src/utils/__tests__/`

## Approach

Port super-app's pure tag logic into ssr as plain `.ts` modules, with their tests moved to ssr's `test:unit` (Node's runner, no JSX), and build ssr's screens on top. Both apps then derive deadlines, journey steps, amount rows and date ranges the same way; only the UI differs.

Rejected alternatives:
- A shared package: the apps are in different repos and run on different runtimes.
- Patching ssr's components in place: that leaves two independent sets of logic that will drift.

## Section 1 — ssr tag detail and public tag page

**Ported logic** goes in `apps/ssr/src/utils/tag/`, one module per super-app source, each with its tests ported:
- `tag-deadline.ts` (from `tagDeadline.ts`)
- `tag-journey.ts` (from `tagJourney.ts`)
- `tag-amounts.ts` (from `tagAmounts.ts`)
- `tag-date-range.ts` (from `tagDateRange.ts`)
- `tag-headline.ts`: `tagHeadlineAmount(tag)` returns the purchase amount and its currency. This is the single switch for decision 1.

The ports keep super-app's behaviour exactly, including that **step completion follows the tag's `status`**, not only which fields are present (see memory `superapp-tag-detail-web-parity`). Where super-app's code is React-Native-free it ports verbatim; translation lookups are passed in as label keys.

**Shared section components** go in `apps/ssr/src/components/tag-detail/`. Both pages use them:

| Component | Shows |
| --- | --- |
| Identity card | tag number; **localized** status badge with its colour (reusing the 17 existing `Tags.Status.*` keys, which replaces the raw enum string and the dead colour map); the headline amount from `tagHeadlineAmount`; an "Early" chip when `isEarlyRefunded`; and the page's claim control, when there is one (see below) |
| Deadline card | "Validate by {date}" with a countdown: "N days left", "Last day", "Overdue by N days". Info tone normally, warning within 14 days, error within 3, per `tag-deadline`. The traveller DTO has no `refundExpirationDate`, so only the export-validation face can appear, as in the app. |
| Journey | Issued → Export validated (or waiting / rejected) → Refund. Cancelled replaces the steps that haven't happened. The pending export step carries "Validate by {date}". The Issued step carries the store name. |
| Amounts | Purchase, of which VAT, gross refund. The fees note when there are no fee rows and the tag isn't paid. An exchange-rate footnote when the rate isn't 1. |
| Purchase | **Every** invoice, each collapsible: number, total, VAT, issue date. Lines show description, amount, tax base and a VAT-rate badge. |
| Store | name and address |
| Traveller | name, document number, nationality, residence |

**Pages:**
- `(main)/tags/[tagNumber]` renders all sections. It replaces `tag-information.tsx`, `invoice-summary.tsx`, `merchant-info.tsx`, `traveller-information.tsx` and `status-badge.tsx`, which are deleted once nothing imports them.
- `(public)/tag/[slug]` renders the same sections **except Traveller** (decision 2). The claim control ("Claim this tag" when signed in and granted, "Log in to claim" when anonymous) moves into the identity card. It used to sit over the now-removed traveller card. `claimPropsFor` (Wave 1) is unchanged.

**Strings:** new `SSRService` keys, en and tr, for the deadline, journey and amount labels, worded like super-app's (`MobileApp.TagDetail.*`).

## Section 2 — ssr tag list and validate

**`(main)/tags`:**
- **Sort:** a newest/oldest toggle on issue date. The URL param `sort=asc|desc` (default `desc`) becomes `sorting: "issueDate <dir>"`.
- **Issue-date filter:** the presets Any time / Today / Last 7 / Last 30 / Last 120 days, from `tag-date-range`. The URL param `issued=<preset>` maps to `issuedStartDate` and `issuedEndDate`, sent together or not at all.
- **URL hardening:** the page forwards only what a pure `parseTagListParams(searchParams)` returns: page, sort, issued. Today it forwards every query parameter unchecked. Unknown or invalid values fall back to the defaults.
- **Row:**
  - the **purchase amount** via `tagHeadlineAmount`, formatted with `Intl` in the tag's currency;
  - an "Early" chip;
  - a **deadline chip** from `tag-deadline`: "N days left" within 14 days, "Last day", "Overdue". It uses the export-validation deadline, or the refund deadline once validated;
  - the risk badge, still behind its Wave 1 grant.
- **Not added:** a search box (the traveller endpoint has no text search, and the app's search only filters the loaded page) and a status filter (neither app has one).
- The layout stays a table; making it responsive is out of scope.

**Validate results:** add the **"Already validated"** group. `alreadyClearedTagIds` are fetched and categorized today but never rendered. They become a fourth accordion group (blue) beside green, red and customs-rejected, with the same row content.

## Section 3 — super-app claim, its grant, and the ssr lookup link

**Claim grant gate.** No super-app claim path checks `TagService.Tags` + `TagService.Tags.TravellerSelfAssign` today. Add a `useCanClaimTag()` hook, following `useCanUploadVerification`, and apply it everywhere a claim can start:
- `TagPreviewScreen` "Claim this tag": rendered only with the grant.
- `ValidateScreen` "Claim another tag": rendered only with the grant.
- the new Tags-tab entry below.
- `useResumePendingScan`: a pending claim without the grant does not POST. It opens the tag preview instead.

**Manual claim mode.** `screens/traveller/Validate/ClaimTagModal.tsx` (scan-only today) gets an "Enter manually" mode with the same behaviour as web's claim modal:
- fields: tag number (alphanumeric) and sales amount (locale-aware decimal, following web's `AmountInput` grouping and decimal rules);
- submit: `postTagTravellerSelfAssign({ tagNumber, salesAmount })` directly, with no lookup;
- success: the same "Scan another / Done" screen as the scan path; server errors show as a toast.
- The pure parts (tag-number validation, amount parsing) go in a `.ts` module with tests.

**Tags-tab entry.** A "Claim a tag" control on the traveller's Tags tab, traveller-only and behind `useCanClaimTag`, opens the same modal with both modes. Web has the equivalent on `/tags`. In the app, manual claim would otherwise be reachable only from validate results.

**ssr lookup link (decision 3).** Remove the navbar action `url: \`/${lang}/tag\`` from `apps/ssr/src/app/[lang]/(public)/layout.tsx` (around line 138). `/tag` stays as a route. The lookup-failed page's "Try again" link back to `/tag`, and the slug page's prefilled-form fallback, are unchanged.

## Verification

**Gates:**
- ssr: `pnpm --filter ssr test:unit` (41 now; ported and new suites add to it), `type-check`, `lint` (0 errors).
- super-app: `npx jest`, `npm run typecheck` (exactly the 1 known baseline error), and `npx eslint` on the touched files.
- Re-measure every baseline first; super-app's checkout is shared.

**Manual pass:**
- ssr on `:3010`, signed in as the dev test traveller: the detail sections, the public page without the traveller block, sort and filter, the row chips, the Already validated group (if a scan is possible), and the missing navbar link.
- super-app on CPadNFC through Metro: the Tags-tab Claim entry and the manual mode, **up to but not including Submit**, plus the grant gates.

## Delivery

**ssr:** a new branch `feat/traveller-parity-tags` in the existing worktree, from `origin/main` (`5deb213e5`). Wave 1's ssr commits are already on `main` there.
- Push the branch **as soon as it has its first commit**, so an auto-push cannot strand a PR (memory `shared-checkout-hazard`, 2026-10-01).
- No `packages/utils` change is expected.

**super-app:** a new branch `feat/traveller-parity-tags`, **stacked on `feat/traveller-web-parity`** (PR #64, not yet merged). Wave 2 touches `TagScreen.tsx` and the claim paths that #64 also changes. Its PR targets `feat/traveller-web-parity` until #64 merges, then is retargeted to `main`.

**Two PRs:** `unirefund-web` and `unirefund-mobile`.

## Out of scope

- A responsive or card layout for the ssr list.
- Search and status filters.
- Fee and net rows (the backend doesn't send them to travellers).
- Receipt or PDF download (no endpoint).
- Pinning a card to one tag.
- Everything in Waves 3–5.
