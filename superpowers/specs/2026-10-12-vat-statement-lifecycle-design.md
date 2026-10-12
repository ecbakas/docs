# VAT statement lifecycle: status, payments, history and unbilled tags

**Status:** design approved 2026-10-12
**App:** web-app, `apps/web`
**Branch:** `feat/vat-statement-lifecycle`, from `origin/main`

## Why

The SDK audit of 2026-10-09 found FinanceService VAT statement routes that reached web-app through regeneration-only commits and still have no UI. Today the app can list VAT statements, create them (single and bulk, with draft preview, hand-added tags and a corrections preview), and show one statement with its tags, corrections and a PDF download. Nothing moves a statement through dunning, records a payment, shows its history, or shows what is waiting to be billed.

This sub-project lets finance staff run a statement end to end in the web app. Every permission below is in `packages/utils/policies/policies.json`, and the Faroe Islands `admin` holds them on dev.

| Feature | Routes | Permissions (`FinanceService.VATStatementHeaders` + leaf) |
|---|---|---|
| Status and dunning | `GET /api/finance-service/vat-statement-headers/{id}/status-hint`, `PUT …/{id}/status` | `.ViewStatusHint`, `.ChangeStatus`, `.Reopen` |
| Payments | `GET …/{id}/payments` (paged), `POST …/{id}/payments` | `.ViewPayments`, `.RecordPayment` |
| History | `GET …/{id}/history` (paged) | `.ViewHistory` |
| Unbilled tags | `GET …/unbilled-tags` (paged) | `.ViewUnbilledTags` |

**Backend contract, from the SDK docblocks:**

- **Statuses:**
  - `VATStatementStatus` is `Sent` | `PaymentReminder1` | `PaymentReminder2` | `PaymentReminder3` | `DebtCollection` | `Cancelled` | `CreditNote` | `Paid`.
  - `PaymentStatus` is `NotPaid` | `PartlyPaid` | `Paid` | `OverPaid`.
- **The status hint (`VATStatementStatusHintDto`):**
  - It returns `status`, `paymentStatus`, `totalAmount`, `paidAmount` and `unpaidAmount`.
  - `allowedNextStatuses` lists the statuses the statement may move to now, for this caller. It never contains `Paid`.
  - `isTerminal` is true when the caller has no manual change available. Only `Paid` is truly terminal. A cancelled or written-off statement can be reopened by a caller holding `.Reopen`, and for that caller its reopen targets appear in `allowedNextStatuses`.
- **Changing status:** `PUT …/{id}/status` with `{ status }`.
  - Only transitions the hint reports are accepted. Anything else is refused with `UniRefund.FinanceService:01014`, and the statement is unchanged.
  - `Paid` cannot be set here; recording payments derives it.
  - It returns the new status hint.
- **Recording a payment:** `POST …/{id}/payments` with `{ amount, currency, referenceNumber, archiveId, paymentDate }`.
  - **Amount:** this payment alone, not a running total. A negative amount corrects an earlier entry. Zero is refused, and the resulting paid amount may not fall below zero.
  - **Currency:** must match the statement's currency.
  - **`paymentDate`:** when the money arrived.
  - **`archiveId`:** "identifier of the archived receipt or bank document". It is required, and its source is an open question (see below).
  - **Response:** the new status hint, with the payment status re-derived.
- **The payment ledger (`VATStatementPaymentDto`):** newest first. Each entry has `amount`, `currency`, `totalBeforePayment` (the outstanding balance just before this payment), `referenceNumber`, `archiveId`, `paymentDate` and `creationTime`.
- **History (`VATStatementHistoryEntryDto`):** ABP entity-change records.
  - **Each entry:** `changeTime`, `changeType` (Created, Updated or Deleted), `userName` (null for a background job), and `changes[]` of `{ propertyName, originalValue, newValue }`.
  - **Values are raw, as audited:** an enum is its **ordinal**, a string is **JSON-quoted**, and `originalValue` is null on Created.
- **Unbilled tags (`UnbilledTagsByMerchantDto`):** export-validated tags on no statement yet, one row per merchant.
  - **Query:** `year` and `month`. Leave both empty for every month.
  - **Row fields:**
    - `merchantId`, `merchantName`, `tagCount`, `taxAmount`, `grandTotal`, `currency`
    - `oldestExportValidationDate`, `newestExportValidationDate`
    - `periods[]`: the calendar months involved
    - `canBeBilled` and `blocker`: whether a contract covers the tags, and why not when none does
    - `pendingCorrectionCount`, `pendingCorrectionsAmount` (signed), `pendingCorrectionsTaxAmount`, `oldestPendingCorrectionDate`
  - **A correction-only row:** a merchant can have pending corrections and no unbilled tags. That row has `tagCount` 0 and no export-validation dates.
  - **`canBeBilled` null** means the check was skipped or ContractService could not be reached. It does **not** mean billable.

## A. The statement detail page

### Structure

The page follows the refund detail's pattern:

- **The layout (new):** `finance/vat-statements/[vatStatementId]/layout.tsx` loads the statement, plus the status hint when `.ViewStatusHint` is granted. It renders the breadcrumb title (moved here from `page.tsx`), the header strip, and a `TabLayout`.
- **The tabs:**
  - **Statement:** today's `page.tsx` at the existing URL, unchanged inside. Every existing link to a statement keeps working.
  - **Payments:** `…/payments/page.tsx` (new), guarded by `.ViewPayments`.
  - **History:** `…/history/page.tsx` (new), guarded by `.ViewHistory`.
- **Permissions:** a tab the caller cannot open is not listed. Each tab page has its own `guardPage`, so `policy:audit` R2 passes.

### Header strip

- **Content:**
  - invoice number, merchant and billing period;
  - a status badge and a payment-status badge;
  - **Paid / Total** and **Unpaid**, in the statement's currency;
  - on the right, the status actions and **Record payment**.
- **Source:** the figures come from the status hint, which has `paidAmount`. Without `.ViewStatusHint`, the strip uses the statement's own `status`, `paymentStatus`, `totalAmount` and `unpaidAmount`, omits Paid, and shows no status actions.
- **Placement:** the strip is shown on every tab.

### Status changes

- **Shown only with `.ChangeStatus`** and a status hint.
- **The buttons:** one per entry of `allowedNextStatuses`, in the backend's order.
  - **Normal buttons:** `PaymentReminder1`, `PaymentReminder2`, `PaymentReminder3`, `DebtCollection`, and any reopen target.
  - **Under a "More" menu:** `Cancelled` and `CreditNote`, with a destructive-style confirm.
- **`Paid` is never offered.** A `Paid` entry in the list is ignored if the backend ever sends one.
- **The confirm dialog** names the move: "Move {invoice} from {current} to {next}?" On confirm it calls `PUT …/status`.
- **On success:** the header updates from the returned hint, and `router.refresh()` re-reads the statement and history.
- **On `01014`, or another refusal:** show the backend message, then re-fetch the hint so the buttons match the backend again.
- **When `isTerminal` is true:** the badge only, no buttons.

## B. Payments

### Payments tab

- **The ledger:** a paged grid, newest first (the backend's order). Columns:
  - Payment date
  - Amount: a negative amount is shown in red with a "Correction" badge
  - Balance before (`totalBeforePayment`)
  - Bank reference
  - Archive no.
  - Recorded at (`creationTime`)
- **Dates:** shown in the tenant's time zone, as the grids show them.
- **Empty state:** "No payments recorded yet."

### Recording a payment

- **Opening it:** the header strip's **Record payment** button opens a dialog. It is shown only with `.RecordPayment`, and on every tab.
- **Fields:**
  - **Amount:** signed and non-zero. The hint reads "Enter a negative amount to correct an earlier entry; entries are never edited."
  - **Payment date:** a date without a time. It defaults to today, cannot be in the future, and is sent as the start of that day.
  - **Bank reference:** required.
  - **Archive no.:** required free text for now (see the open question).
  - **Currency:** the statement's currency, read-only, and sent automatically.
- **Checks before sending.** The backend still enforces them; these use the hint's `paidAmount` and `unpaidAmount`:
  - **Zero:** refused, and submit stays disabled.
  - **A negative amount larger than `paidAmount`:** refused ("This would take the paid total below zero").
  - **An amount larger than `unpaidAmount`:** allowed, with a warning ("The statement will be marked over-paid").
- **Confirm:** a summary of the amount, date and reference, because entries cannot be edited.
- **On success:** the header updates from the returned hint, the ledger refreshes, and the dialog closes.
- **On a refusal:** show the backend message and keep the dialog open with the entered values.

### Open question: the archive field

What `archiveId` should hold is waiting on the backend team. FileService has no archive route, and nothing in the app produces an archive id. Until they answer, the field is a required free-text "Archive / document no.", built as one component (`archive-field.tsx`). If the answer is "a FileService file id", only that component changes, to an upload that fills the id.

## C. History tab

- **A timeline, newest first.** It loads with the backend's paging, and a "Load more" button fetches the next page.
- **Each entry shows:**
  - the time, in the tenant's time zone;
  - the user, or "System" when `userName` is null;
  - the change type;
  - one line per changed property: **Field: old → new**. A Created record shows only the new value.
- **Turning raw values into readable ones** (pure helpers, tested):
  - **Strings:** JSON-quoted strings are unquoted.
  - **Dates:** ISO date-time strings are formatted in the tenant's time zone.
  - **Field labels:** known properties get their labels: status, payment status, paid amount, unpaid amount, total amount, due date, invoice number. An unknown property has its name split into words ("DueDate" becomes "Due date").
  - **Enums:** `Status` and `PaymentStatus` ordinals map to their labels **only once the mapping is confirmed on dev**. The schema lists names without numbers, so the mapping is unknown until then. Until it is confirmed, the ordinal is shown as recorded, so a wrong label is never shown.
  - **Unknown values:** shown as recorded.

## D. Unbilled tags overview

### Where

- **The page:** `finance/vat-statements/unbilled`, guarded by `.ViewUnbilledTags`.
- **Navigation:** a new Finance entry, `finance/vat-statements/unbilled`, after VAT statements. Its label is "Unbilled tags" / "Faturalanmamış etiketler", and its policies are the page's guard.

### List

- **Period filter:** a year and a month, kept in the URL. Both are empty by default, which lists every month. The contract check always runs (`skipBillableCheck` is never sent).
- **Columns, one row per merchant:**
  - Merchant
  - Tags
  - Tax amount
  - Grand total, in the row's currency
  - **Waiting since:** `oldestExportValidationDate`, with its age in days. A correction-only row uses `oldestPendingCorrectionDate`.
  - **Periods:** one chip per entry of `periods`
  - **Billable:** **Yes**, **No** with the `blocker` text, or **Not checked** when `canBeBilled` is null
  - **Pending corrections:** the count and the signed amount, hidden when the count is 0
- **Create statement:**
  - **The link:** each period chip goes to `finance/vat-statements/new?merchantId={id}&year={y}&month={m}`. The new-statement form already reads these parameters and drafts automatically.
  - **When it is shown:** only when the caller meets the new page's guard (`.Create` + `CRMService.Merchants.ViewList`), and `canBeBilled` is not false.
  - **The period format:** the backend's `periods` format is confirmed on dev. A string that does not parse as a year and a month gives a link carrying the merchant only.

## Pure helpers (tested with `test:unit`)

In `finance/vat-statements/_components/lifecycle.ts`, with `lifecycle.test.ts`:

- `statusActions(allowed)`: splits the allowed statuses into `{ primary, more }`, drops `Paid`, and keeps the backend's order.
- `paymentProblem(amount, hint)`: returns `"zero"`, `"belowZero"` or null.
- `paymentWarning(amount, hint)`: returns `"overPaid"` or null.
- `historyValue(propertyName, raw, ctx)`: the display string for one audited value, covering unquoting, dates, the enum maps once confirmed, and the fallback.
- `historyLabel(propertyName, labels)`: a known label, or the name split into words.
- `parsePeriod(period)`: returns `{ year, month }` or null.
- `newStatementHref(merchantId, period)`: builds the create link.

## Error handling

- Every refusal shows the backend message.
- An action whose permission is missing is not rendered.
- If the status hint fails to load, the header falls back to the statement's own figures and hides the status actions. The page itself does not fail.
- A failed payments or history request shows the error inside its tab only.

## Testing

- **TDD with `pnpm --filter web test:unit`:** every helper above. Cover the boundary cases:
  - an empty `allowedNextStatuses`
  - a list containing `Paid`
  - an amount of 0
  - a negative amount equal to `paidAmount` (allowed)
  - a negative amount above `paidAmount`
  - an amount exactly equal to `unpaidAmount` (no warning)
  - a quoted string
  - a null original value
  - an unconfirmed enum ordinal (shown raw)
  - a period string that does not parse
- **Gates**, all run locally before pushing:
  - `pnpm --filter web type-check`
  - `pnpm unit-test`
  - `pnpm --filter web test:unit`
  - `pnpm lint`
  - `node --test scripts/lib/policy-audit-core.test.mjs`
  - `pnpm policy:audit`
  - `pnpm i18n:missing --app=web`
  - `pnpm i18n:unused --app=web`
- **Manual checks on dev,** as the Faroe Islands `admin`:
  - **Reads:**
    - the header strip and its actions;
    - the payments and history tabs;
    - the unbilled page and its filters;
    - a create link landing on a pre-filled draft.
  - **Writes need the user's go-ahead,** on a statement the user picks: changing a status, and recording a payment.
  - **Confirming the formats:** the first status change confirms the history ordinal mapping. The unbilled page's response confirms the `periods` format.

## Out of scope

- the paged `tag-details` route, because the detail DTO already embeds the tags
- the `pending-corrections` route, because the draft preview already returns the same corrections
- editing or deleting a payment, which the backend does not offer
- deciding the archive field (the open question above)
- regrouping the Finance navigation
