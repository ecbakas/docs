# ssr visual parity, sub-project 2: Home, Tags and tag detail

**Goal.** `web-app/apps/ssr`'s traveller Home, Tags list, tag detail and public QR page look and behave like super-app's traveller screens. This is sub-project 2 of 4.

It builds on sub-project 1 ([spec](2026-10-01-ssr-visual-parity-shell-design.md), unirefund-web #312), which provides:
- the shared tokens and Geist;
- `TabIsland`, `PageHeader`, `TabPage`, `Surface` and `SettingsRow`;
- the shell context.

**The reference** is super-app's code:
- Home: `src/screens/traveller/Home/`.
- Tags list: `src/screens/shared/Tags/Tag/` (`TagScreen.tsx`).
- Tag detail: `src/screens/shared/Tags/TagDetail/`.
- Scan preview: `src/screens/shared/TagPreviewScreen.tsx`.
- Tag surfaces: `src/screens/shared/_components/` (`TagCard`, `TagRow`, `TagStates`).

**Binding from sub-project 1:** the QR contract (`/tag/<slug>`, `/{lang}/validate?qrValue=`), and the island on every screen size.

## Decisions (user, 2026-10-02)

1. **All three tag-row designs, with a switch.** The designs are Classic (the default), Compact pill and Tinted. The Profile picker row comes in sub-project 3; until then ssr shows Classic unless the cookie is set by hand.
2. **The app's search field.** It filters the loaded page by tag number or store, exactly as the app does. This reverses Wave 2's omission.
3. **The detail URL stays `/tags/[tagNumber]`.** The app uses `/tags/[tagId]?tagNumber=…`, but the traveller endpoint looks tags up by number only.
4. **A single centred column at every width.** The tag detail's 3-column grid goes.
5. **The section designs below were approved as presented:** Home, the Tags list, and tag detail with the public page.

## Approach

This is Wave 2's approach. Port the app's pure logic into `apps/ssr/src/utils/tag/` as `.ts` modules, and move their tests into ssr's `test:unit` (Node's runner, no JSX). Then build web components that copy the app's components class for class: NativeWind classes are Tailwind classes, and both apps share the tokens.

Rejected:
- **Restyling today's ayasofyazilim-ui `Card` and `Table` in place.** It keeps table markup and leaves two look-alike implementations to drift.
- **A shared package.** The apps live in different repos and run on different runtimes.

## Grants

Every control and every optional call is gated on its endpoint's group grant **and** its leaf grant (memory `gate-every-action-by-grant`). An ungated control is not rendered, and its call is not made.

| Control / call | Group + leaf |
| --- | --- |
| Upload for verification (Home tile, Verifications view) | `TagService.StickerManualVerifications` + `.Upload` |
| Tags \| Verifications switch, and the verifications call | `TagService.StickerManualVerifications` + `.ViewMine` |
| Claim a tag, Claim this tag | `TagService.Tags` + `.TravellerSelfAssign` (`tagGrants().claim`) |
| Payout methods tile, and the card-count call | `RefundService.TravellerCards` + `.ViewMine` |
| Risk dot on a row | `TagService.TagRisks` + `.ViewRiskLevel` (`tagGrants().viewRisk`) |

Two of these differ from the app on purpose: the app shows the Verifications switch and the Payout tile to every traveller.

## Section 1: Home (signed in)

**Data.** Today `(public)/page.tsx` fetches nothing.
- When there is a session, it fetches the tags from `getTagsCrossTenantsByTravellerIdClaimApi({ sorting: "issueDate desc", maxResultCount: 999 }, session)`.
  - This is the app's `useAllTravellerTags`, which exists because travellers have no totals endpoint.
  - The call is required for the dashboard.
- With the cards grant, it also fetches `getMyTravellerCardsApi({}, session)`, optional, for the count.
- The client still picks the body from `useShell().signedIn`. A revoked session gets the hero, whatever the fetch did.
- Signed out: today's hero, unchanged (sub-project 1 decision).

**Layout, top to bottom:**
1. **Header.** Sub-project 1's `PageHeader`, unchanged: "Hello, {name}", the document pill, and the bell.
2. **"You'll receive" card** (`RefundSummaryCard`):
   - A caption, "You'll receive", with " · estimated" when any contributing tag fell back to its gross refund.
   - The headline: the largest currency total, at 32 px bold, with the currency code beside it.
   - Any other expected currencies, listed under the headline.
   - A meta line, "{n} tags · {m} not yet calculated".
   - A divider, then one "{amount} {currency} already paid" row per received currency, each with a green check.
   - The card is hidden when nothing is expected and nothing has been received.
   - Amounts use `Intl` with two decimals, in the active locale.
3. **"Last tag" section**, with a "View all" link to `/{lang}/tags`.
   - The newest tag shows as the app's **hero** tag card (`TagCard variant="hero"`): it leads with the refund amount and carries the amount caption.
   - It links to `/{lang}/tags/{tagNumber}`.
   - The hero always uses the Classic anatomy. The row-design cookie affects only the list.
4. **Shortcut tiles card:**
   - **Upload for verification:** full width, with the description "Photograph your sticker and stamped receipt". It opens the existing upload dialog and needs the upload grant.
   - **Tax-Free Locations:** opens `/{lang}/explore`.
   - **Payout methods:** shows "{n} saved" and opens `/{lang}/profile/cards`. It needs the cards grant.
   - Layout follows the app: a tile with a description, or an odd tile left at the end, spans the full width; the others take half.

**No tags (the start state):**
- A dashed "No tags yet" card with the line "Shop tax-free, then scan the tag on your receipt to claim it." Its "Scan a tag" button opens the island's scan overlay.
- A red "Tax-Free Locations" action card (the app's `CardAction`).
- The tiles without the map tile.

**States:**
- **Loading:** the app's Home skeleton (summary bars and a hero card skeleton) streams while the fetch runs.
- **Failed tag call:** the app's `TagsErrorState`: an offline icon, "Couldn't load your tags", and Try again (`router.refresh()`). The header stays.

**Shell change.** The scan overlay's open state moves out of `TabIsland` into the shell context, as `openScan()`. The island and Home both open the same single `ScanOverlay`.

## Section 2: Tags list, `/[lang]/tags`

**URL.** `parseTagListParams` keeps `page`, `sort` (`desc` by default) and `issuedStartDate`/`issuedEndDate` (both or neither), and gains `view` (`tags` by default, or `verifications`). Invalid values fall back to the defaults. Search text is client state and stays out of the URL.

**Each view fetches only its own data:**
- The tags view calls today's list (20 per page).
- The verifications view calls `getStickerManualVerificationsMyApi({ maxResultCount: 20, sorting: "creationTime desc" })`, and only with the ViewMine grant.

**Layout, top to bottom:**
1. **Header:** "Tags".
2. **Toolbar** (tags view only):
   - **Search:** a rounded field, "Search tags…", with a clear button. It matches tag number or store name, case-insensitively, against the loaded page.
   - **Sort:** a round button. An arrow pointing down means newest first, up means oldest first. It toggles `sort` and resets the page.
   - **Filter:** a button with the options icon. With a date filter set it turns red (`border-primary bg-primary/10`) and shows a count badge; the count is 1 when the issue-date range is set, from the ported `countTravellerFilters`.
3. **Action button:** full width, outlined in red.
   - Tags view: "Claim a tag", with the claim grant. It opens today's claim modal.
   - Verifications view: "Upload for verification", with the upload grant. It opens today's upload dialog.
4. **Tags | Verifications switch:** a segmented pill (`rounded-full bg-foreground/5 p-1`). The active cell is `bg-card` with primary text. It is shown only with the ViewMine grant.
5. **The list**, in the row design the cookie selects:
   - **Classic** (`TagCard variant="row"`): a card per tag with an inset status rail, the serial number in Geist Mono, a status badge and an "Early" chip, then the purchase amount and a "{store} · {date}" line. A deadline chip ("N days left", "Last day" or "Overdue") appears only at warning or error tone, and the row ends with a chevron.
   - **Compact** (`TagRow tint="pill"`): flat rows with a 6 px leading status bar. The left side shows the number, the store, and "status · date". The right side shows the PURCHASE caption, the amount and the currency.
   - **Tinted** (`TagRow tint="wash"`): the same row with no bar, washed in the status colour at 10%.
   - **In every design:** the date is the app's short list date (`day: 2-digit, month: short, year: 2-digit`, for example "02 Oct 26"); the headline amount comes from `tagHeadlineAmount`; and the risk dot stays behind its grant.
   - A row links to `/{lang}/tags/{tagNumber}`.
6. **Pager:** floating above the island, styled after the app's `BlobPagination`: first, previous, "{page}/{pageCount}", next and last. It is hidden when there is one page or none. Its links keep the other params.

**Row-design cookie.** The cookie is `tag-row-design`, with the value `classic`, `pill` or `tinted`; a missing or unknown value means `classic`. The server reads it, so the first paint is already the right design. Sub-project 3's Profile picker writes it.

**Filter sheet.**
- A bottom drawer titled "Filters", with a close button.
- One "Issue date" group with Any time, Today, Last 7 days, Last 30 days and Last 120 days, from the existing `TAG_DATE_PRESETS`.
- Choices are staged. "Show results" applies them and resets the page; "Clear all" clears them.

**Verifications view.** It replaces today's pending list above the table. It shows every status:
- Each row (`rounded-md border bg-card p-3`) shows "Sticker line number: {n}", a status chip, the upload date, and either the rejection reason or a "tag created" line.
- The chips are Under review (warning), Rejected (error) and Approved (success).
- When there are none, the app's dashed empty state appears, with the camera icon, "No verifications yet", and its description.

**States:**
- **Loading:** the list streams behind five skeleton rows shaped like the selected design.
- **Error:** `TagsErrorState` with Try again.
- **No tags and no filter:** "No Tags Yet" and "Make your first purchase to create a tag" (`TagsEmptyState`).
- **Nothing matches a filter or search:** "No tags match these filters", "Try a different search, or clear the filters.", and Clear all, which clears both (`TagsNoMatchState`).

**Removed:**
- `tag-table-view.tsx`, including its duplicate `getStatusColor`;
- `tag-list-toolbar.tsx`;
- `pending-verifications.tsx`.

**Status wording.** The existing `Tags.Status.*` keys stay. Their en and tr values change to the app's `MobileApp.Tags.StatusLabel.*` wording, for example "Awaiting customs stamp".

## Section 3: tag detail and the public QR page

All section components in `apps/ssr/src/components/tag-detail/` move from ayasofyazilim-ui `Card` to `Surface` and the app's anatomy. Today's `data-testid`s stay.

**Tag detail, `/[lang]/tags/[tagNumber]`.** The data is unchanged: `getTagsCrossTenantsByTravellerIdClaimByTagNumberApi`. The page is one column.
- **Header:** a round back button to `/{lang}/tags`, and the title "Tag detail".

1. **Identity card:**
   - a 4 px status rail on the leading edge;
   - the "Tag number" caption, with the number in Geist Mono;
   - the status badge;
   - the headline amount at display size, with its caption (`tagHeadlineCaption`, for example "Estimated refund, before fees").
2. **Deadline strip** (traveller only):
   - "Validate by {date}";
   - "N days left", "Last day" or "N days overdue";
   - a "Deadline" or "Overdue" badge;
   - an info, warning or error surface, from `tagDeadline`.
3. **PROGRESS:** an eyebrow heading over the journey card. The marks are 13 px dots on a 2 px rail: done is green with a check, failed is red with a cross, current has a blue ring, and to-do has a grey outline.
4. **AMOUNTS:** `tagAmountRows`, with the fees note and the exchange-rate note.
5. **PURCHASE** (only when there are invoices): one collapsible block per invoice, with the receipt icon, "Invoice {n}" and the total. Expanded, it shows the VAT, the date, and the lines, each with "Net {amount}" and a "VAT {rate}%" badge.
6. **DETAILS:** collapsible blocks, closed by default. A block shows a leading icon, a title, an optional summary and a chevron.
   - **Traveller:** full name, document number in mono, nationality and residence.
   - **Store:** its summary is the store name; it shows the name and address.

**Detail states:**
- **Loading:** a skeleton.
- **Error:** the app's alert icon, with its own wording, "Couldn't load your tags" and "Check your connection and try again.", and Retry. A 403 shows no Retry.

**Public QR page, `/[lang]/tag/[slug]`.** The URL and data calls are unchanged; the page becomes the app's scan preview.
- **Header:** "Tax-Free Tag", with back to `/{lang}` (Home). Not back to `/tag`, which Wave 2 decided not to advertise.
- **Sections:** Identity, Deadline, AMOUNTS, PURCHASE, then DETAILS with **Store only**. There is no PROGRESS section. The Traveller block stays off the public page (Wave 2 decision 2).
- **Kind.** The server derives it with the app's `deriveTagKind`:
  - **draft:** `Draft` with no traveller;
  - **issued:** not `Draft`, with a traveller;
  - **divergent:** anything else.

  Only the kind crosses to the client. `publicTagView` still strips the traveller.
- **Closing note**, a muted panel chosen by kind:
  - draft: "This tag isn't linked to anyone yet. Claim it to add it to your account."
  - issued: "This tag is already linked to a traveller."
  - divergent: "This tag's status and traveller don't match. Please contact support."
- **Primary action**, a single button pinned above the island:

  | Kind | Signed in | Signed out |
  | --- | --- | --- |
  | draft | "Claim this tag" with the claim grant; nothing without it | "Log in to claim" → `/{lang}/login?redirectTo=/{lang}/tag/{slug}` |
  | issued | "View in my tags" → `/{lang}/tags/{tagNumber}` | "Log in to see your tags" → `/{lang}/login?redirectTo=/{lang}/tags` |
  | divergent | none | none |

  - Claiming keeps today's call and refresh. It adds the app's success and error toasts.
  - The claim control leaves the identity card, so its `claim` slot goes.
  - **Known and copied from the app:** a signed-in visitor scanning *someone else's* issued tag also gets "View in my tags", and that page then shows its error state.
- **Not found and empty sticker:** the app's centred alert, with "Tag not found. Please try scanning again." or "No tax-free tag has been issued on this sticker yet. Ask the store to complete your purchase.". The existing Try again link back to `/tag` stays.

**Pinned bars.** The Tags pager and the preview's action bar sit directly above the island. A page with a bar adds the bar's height to its island clearance. The global Toaster bottom offset rises so that toasts clear the island plus one bar.

## Ported logic (`apps/ssr/src/utils/tag/`, each with ported or new `node:test` tests)

| Module | From super-app | Provides |
| --- | --- | --- |
| `tag-money.ts` | `utils/tagMoney.ts` | `tagMoneyBucket`, `tagExpectedAmount`, `tagExpectedAmountIsEstimate` |
| `home-summary.ts` | `buildRefundSummary` in `screens/traveller/Home/homeStatus.logic.ts` | expected and received totals, sorted largest first then by currency code; `expectedTagCount`, `notCalculatedCount` |
| `tag-row-tone.ts` | `utils/tagRowTone.ts` | the pill bar and wash colours per status tone |
| `tag-row-design.ts` | `store/tagRowDesign.ts` (the type and default) | `TagRowDesign`, `parseTagRowDesign(cookieValue)`, the cookie name |
| `traveller-filters.ts` | `Tags/Tag/_components/travellerFilters.ts` | `countTravellerFilters` |
| `tag-search.ts` | `TagScreen.tsx`'s traveller page filter | `filterTagsBySearch(tags, text)` on tag number and store |
| `tag-kind.ts` | `utils/tag.ts` `deriveTagKind`, and `TagPreviewScreen`'s `buildAction` | `deriveTagKind`, and `previewActionFor(kind, { signedIn, canClaim })` for the table above |

`tag-list-params.ts` gains `view`, with tests for its default and for invalid values.

## Strings

New `SSRService` keys, in en and tr, worded like the app's keys:
- `MobileApp.Home.*`: Summary, Start and Shortcuts;
- `MobileApp.Tags.*`: SearchPlaceholder, ClearSearch, Filters, ClearFilters, ApplyFilters, Tabs, ClaimTag, the empty, no-match and error states, and LastTag and ViewAll;
- `MobileApp.Verification.*`: the row, the chips and the empty state;
- `MobileApp.TagDetail.*`: Title, Details, Purchase, and the Traveller and Store block titles;
- `MobileApp.Qr.TagPreview.*`: Title, the three notes, the four actions, NotFound, NoTagOnSticker, ClaimSuccess and ClaimError.

The tr values come from super-app's `tr-TR.json`. Then run `pnpm --filter ssr run init`. Existing keys keep their names.

## Verification

**Gates.** Re-measure each baseline first.
- `pnpm --filter ssr test:unit`: 202 at sub-project 1's head, plus the new suites.
- `pnpm --filter ssr type-check`: 0 errors.
- `pnpm --filter ssr lint`: 0 errors.
- `pnpm --filter web type-check`: 0 errors.
- `pnpm --filter ssr build`, run only with no dev server up.

**Manual pass**, on ssr dev at 375 px and at 1280 px:
- Signed in as the test traveller (`tur-a25y29041`):
  - Home: the summary, the last tag, the tiles, and Scan from the start state, if the account can be shown empty; otherwise this is reported as unverified.
  - Tags: search, sort, the filter sheet, the pager, the Verifications switch, and every row design (set the cookie by hand to `pill` and `tinted`).
  - Detail: every section, collapsing, and back.
- Public QR page, signed out and signed in:
  - an issued tag, with the note and action;
  - the not-found slug.
  - Never press Claim on a real tag.
- Use a different account or client than any device logged in as the same traveller (cross-talk).

## Delivery

- **unirefund-web only.** There is no super-app change.
- **Branch:** `feat/ssr-visual-parity-home-tags`, created in the existing worktree `C:\unirefund\web-app-wt-visual-parity` from `feat/ssr-visual-parity-shell` (head `3098af5a7`).
- **PR target:** `feat/ssr-visual-parity-shell` until #312 merges, then retarget it to `feat/ssr-visual-parity`.
- No `packages/*` change is expected.

## Out of scope

- The Profile row-design picker (sub-project 3). The rest of Profile is also sub-project 3; Explore, the notifications sheet and the sign-in screens are sub-project 4.
- The app's staff-only pieces: the purple "recently updated by you" group, the tablet grid, tag actions and the risk block.
- The app's unused Home "Needs you" action list, and its background-refresh warning banner. ssr re-renders on navigation instead.
- Server-side search, status filters, and receipt download.
