# Refund adjustments and recording a refund paid outside the system

**Status:** design approved 2026-10-09
**App:** web-app, `apps/web`
**Branch:** `feat/refund-adjustments-record-paid`, from `origin/main`

## Why

The SDK audit of 2026-10-09 found RefundService routes that reached web-app through regeneration-only commits and still have no UI. Both are back-office features. The policies are already in `packages/utils/policies/policies.json`, and on dev both host and tenant admins hold the grants.

| Feature | Routes | Permissions |
|---|---|---|
| Refund adjustments | `GET /api/refund-service/refund-adjustments` (paged), `GET …/open-count`, `GET …/{id}`, `POST …/{id}/acknowledge`, `POST …/{id}/settle` | `RefundService.RefundAdjustments` + `.ViewList` / `.ViewOpenCount` / `.View` / `.Acknowledge` / `.Settle` |
| Record a paid refund | `POST /api/refund-service/refunds/record-paid` | `RefundService.Refunds` + `.RecordPaid` |

**Backend contract, from the SDK docblocks:**

- **Where an adjustment comes from:** the backend opens one when a tag correction changes the net amount of a refund that was already paid.
- **Who is told:** the members of the country setting `CountryManagement.Refund.AdjustmentNotificationRole`, or the refund's creator when that setting is empty. Each operator sees only the adjustments of the refund points they are scoped to.
- **The adjustment record (`RefundAdjustmentDto`):**
  - links: `refundId` and `refundReferenceNumber` (null when the refund is not visible to the caller), `tagId`, `tagNumber`, `tagCorrectionId`, `sequenceNo`
  - amounts: `refundAmountBefore`, `refundAmountAfter`, `deltaRefundAmount` (After − Before; **positive means the traveller was underpaid, negative overpaid**), `currency`
  - lifecycle: `arisenAt`, `status` (`Open` | `Acknowledged` | `Settled`), `acknowledgedAt`/`ByUserId`, `settledAt`/`ByUserId`/`Note`, `notificationSentAt`
- **Acknowledge** is allowed only from Open. From any other state it is refused with `007001`.
- **Settle** needs a note and is allowed from Open or Acknowledged. A Settled adjustment is refused with `007001`, and a blank note with `007002`. Nothing is paid or clawed back.
- **List query:** `refundId`, `tagId`, `status`, `arisenFrom` (inclusive), `arisenTo` (exclusive), `sorting`, `skipCount`, `maxResultCount`. Newest correction first.
- **Recording a paid refund (`RecordPaidRefundDto`):** `tagIds`, `refundTypeEnum` (Cash is not accepted), `refundPointId`, `paidDate`, `payoutReference` (required), optional `paidCardDetail`, and the two signatures. It returns `{ id }`.
  - `paidDate` cannot be in the future, and cannot precede the newest tag's issue date.
  - `paidCardDetail` is `{ maskedNumber, cardExpiryMonth, cardExpiryYear, holderName? }`. `maskedNumber` is at most 25 characters (for example `411111******1111`) and is never a full card number. The month is 1–12.
  - No money moves. The refund settles as paid at once.

## A. Refund adjustments

### Where the user finds them

- **The list page:** a new page at `operations/refund-adjustments`, guarded by `RefundService.RefundAdjustments` + `.ViewList`, with an Operations nav item gated the same way. Its label key goes in `AbpUiNavigation` resources.
- **The refund detail:** each refund's detail (`operations/refunds/[refundId]`) gets an **Adjustments** tab. It is added through `grantedRefundTabs` in `refunds/_components/refund-tabs.ts` and gated by `.ViewList`. The tab renders the same table, fixed to that refund (`refundId`).
- **The tag detail:** the corrections card in `operations/tax-free-tags/[tagId]` shows a **Refund adjustments** link to the list filtered by `tagId`. The link appears only when the tag has a `refundId` and the caller holds `.ViewList`, so it costs no extra request.

### List

- **Grid:** a server-paged `MasterDataGrid` (`rowCount` set to `totalCount`).
- **Columns:**
  - arisen at
  - tag number, linking to the tag detail
  - refund reference, linking to the refund detail; plain text when `refundReferenceNumber` is null
  - amount before → after
  - delta: positive is green with "Underpaid", negative is red with "Overpaid", zero is neutral
  - status badge
- **Filters** (`createServerFilters`):
  - status: a single select of Open, Acknowledged, Settled and **All**. When the URL has no `status`, the query is `Open`. `status=All` sends no status, so all three show. Without an explicit All, clearing the filter would only bring Open back.
  - the arisen date range (`dateRange("arisenAt", "arisenFrom", "arisenTo")`)
  - `refundId` and `tagId` when they come from a link
- **Open count:** the header shows "{n} open" from `open-count` when the caller holds `.ViewOpenCount`. If that request fails, the count is simply left out. There is no sidebar badge.

### Actions

- **Acknowledge:** gated by `.Acknowledge` and offered only when the status is `Open`. A confirm dialog, then the call, then `handlePostResponse` and a refresh.
- **Settle:** gated by `.Settle` and offered when the status is `Open` or `Acknowledged`. It follows the required-note dialog in `operations/manual-verifications/[id]/_components/actions.tsx`:
  - a textarea for "How was the difference handled?"
  - Confirm disabled while the trimmed note is empty
  - the call, then a toast and `router.refresh()`
- **Errors:** any refusal shows the backend message, including `007001` and `007002`.

### Detail

Clicking a row opens a side sheet (`GET {id}`, gated by `.View`). It shows:

- every amount and the delta, as in the list
- the correction sequence number
- when the role was notified (`notificationSentAt`)
- a timeline: arisen, then acknowledged, then settled with the settle note

The DTO carries user ids only, so the timeline shows dates, not names. The Acknowledge and Settle actions also appear in the sheet.

### Pure helpers (`refund-adjustments/_components/adjustment.ts`, tested with test:unit)

- `deltaDirection(delta: number): "underpaid" | "overpaid" | "none"`
- `allowedActions(status): { acknowledge: boolean; settle: boolean }`
  - Open → both
  - Acknowledged → settle only
  - Settled → none
- `toAdjustmentQuery(searchParams)`: maps a missing `status` to `"Open"` and `"All"` to no status, and passes every other parameter through.
- `isSettleNoteValid(note: string): boolean`: the trimmed note is not empty.

## B. Recording a refund paid outside the system (refund desk)

### Where

`operations/refund` (the `@admin` and `@refundPoint` desks share `client-page.tsx` and the payment rail).

- **The switch:** the payment rail gets an **"Already paid outside the system"** switch, gated by `RefundService.Refunds` + `.RecordPaid`. The grant goes into `refund-desk-grants.ts`, on top of the grants the desk already requires.
- **What stays the same:** tag selection, refund point and signatures.
- **What changes when the switch is on:** the methods offered, the payment details, and the confirm.

### Methods

- **Offered:** the refund point's `paymentTypesResponse` without `Cash`.
- **Cash only:** if Cash is the only method left, the switch shows "This refund point only offers cash; a cash refund is recorded the normal way" and does not turn on.
- **Turning the switch on:** a selected method that is no longer offered is cleared.

### Payment details in this mode

- **Paid date:**
  - date and time, defaulting to now
  - invalid when it is in the future, or before the newest issue date among the selected rows
  - the error shows under the field, and Confirm stays disabled
- **Payout reference:** required text.
- **For `CreditCard`, the masked card:**
  - first 6 digits and last 4 digits: digits only, exactly 6 and exactly 4, so a full card number cannot be entered
  - expiry month (1–12) and expiry year (4 digits)
  - optional holder name
  - the backend makes the card details optional, but **the UI requires them** for a card so the audit record is useful
  - sent as `maskedNumber = first6 + "******" + last4`
- **Other methods** (bank transfer, IBAN transfer, wallet, cash via partner): date and reference only.

### Confirm

- **The dialog** names the act: "Record a refund that was already paid outside the system. No money will be moved."
- **The call:** `postRecordPaidRefundApi` (a new action in `RefundService/post-actions.ts`, following the return pattern), then `handlePostResponse`.
- **On success:** like a normal refund, the desk navigates to `/operations/refunds/{id}/tags`.

### Pure helpers (added to `operations/refund/_components/refund-payload.ts`, tests in `refund-payload.test.ts`)

- `recordPaidMethods(types: RefundMethod[]): RefundMethod[]`: every method except `Cash`.
- `maskedCardNumber(first6: string, last4: string): string | null`: null unless the inputs are exactly 6 and 4 digits.
- `paidDateProblem(paidDate: Date, newestIssueDate: Date | null, now: Date): "future" | "beforeIssue" | null`.
- `buildRecordPaidRefundDto({...}): RecordPaidRefundDto | null`. It returns null when:
  - the reference is blank;
  - the date has a problem;
  - the method is Cash;
  - the method is a card and the masked number or expiry is missing.

## Error handling

- Every refusal shows the backend message.
- An action whose grant is missing is not rendered. The list page and the tab are gated by `.ViewList`, the sheet's fetch by `.View`, and the count by `.ViewOpenCount`. If the count request fails, the count is hidden; the page does not fail.

## Testing

- **TDD with `pnpm --filter web test:unit`:** every pure helper above. Cover the boundary cases:
  - delta 0
  - a Settled status (no actions)
  - a note made only of spaces
  - a paid date exactly at the newest issue date (valid)
  - a paid date one minute in the future
  - first6 or last4 with the wrong length or with letters
  - a Cash method
- **Gates:** the repository's CI steps, all run locally before pushing:
  - `pnpm --filter web type-check`
  - `pnpm --filter ssr type-check`
  - `pnpm unit-test`
  - `pnpm lint`
  - `node --test scripts/lib/policy-audit-core.test.mjs`
  - `pnpm policy:audit`
  - `pnpm i18n:missing --app=web`
- **Manual check on dev**, as the Faroe Islands admin, once the machine can run a dev server:
  - the adjustments list, its filters and the open count
  - acknowledging and settling an adjustment, if dev has one; otherwise recorded as not verified
  - the refund desk's paid-outside mode with a bank transfer, up to the confirm dialog
  - the record-paid write itself only with the user's go-ahead, because it creates a real refund on dev

## Out of scope

- a live sidebar badge
- user names in the adjustment timeline
- editing or reopening a settled adjustment, which the backend does not offer
- recording a paid refund from anywhere but the refund desk
