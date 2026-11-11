# Detailed (invoice-style) create-tag page — web

**Date:** 2026-11-11 · **App:** `web-app/apps/web` · **Status:** draft for approval

## Why

The current create-tag page (`operations/tax-free-tags/new`) is minimal: the
cashier picks a product-group chip, types an amount, and repeat amounts for the
same group are merged into one line. The backend is about to add a **Product**
entity that belongs to a product group (Phone › iPhone 18). Some tenants need a
detailed, invoice-style screen with one line for each item sold. Other tenants
keep the minimal page, so **it stays as it is**.

## Goals

- A new page where the cashier builds the invoice line by line, as on a normal
  invoice.
- Each row on screen is sent as **its own** `invoiceLines[]` entry. There is no
  merging by product group.
- It is ready to take a product picker once the Product entity and the new line
  fields reach the SDK, without a redesign.

## Non-goals

- Deciding which tenants get the page. No sidebar entry and no tenant
  switch: the page is reachable only by URL for now (user decision).
- Changing the old page, or `TagForm` / `invoice.ts` behaviour that the old page
  and `scan-sticker` rely on.
- super-app and pos-app. This is web only (user decision).
- Product catalogue management (CRUD).

## Anti-goals

- Posting a body that drops or changes what the cashier entered without saying
  so. Today the line has no quantity or unit price, so `amount` must equal
  qty × unit price exactly as shown on screen.
- Inventing backend fields. Nothing is sent that the generated SDK type lacks.

## Route and permissions

- `apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/new-detailed/`
  with `page.tsx` and `client.tsx`. *(Route name is my call.)*
- The `page.tsx` server code is the same as `new/page.tsx`: the same `guardPage`
  set (`TagService.Tags` + `.Create`, `CRMService.Countries` + `.ViewList`,
  `CRMService.Merchants` + `.ViewProductGroupList`) and the same
  `getApiRequests` for countries, the agent's own merchant and its product
  groups.
- The client keeps the same permission checks as the old page: who can pick a
  merchant (`Merchants.ViewList`, never for agents) and who sees the quote
  (`Tags.PreviewCreationCalculation`).
- No sidebar item means policy-audit rule R3 does not apply. R1 and R2 are
  satisfied by `guardPage`.

## Layout (user picked option A: two columns)

Below `lg` the panel stacks under the invoice. *(Breakpoint is my call.)*

**Left column (about 2/3)**
1. **Merchant card**: the existing `MerchantSelector`, in `select` mode or
   `readonly` for agents.
2. **Invoice card**: the invoice number (blank → generated on submit, with the
   same hint as today) and the issue date (the `DatePicker`, keyed on
   `invoice.uuid`, as today).
3. **Lines table** with these columns:
   `Product group | Qty | Unit price | VAT % | Amount | delete`.
   - *Product group*: a select of the merchant's product groups, defaulting to
     the merchant's `isDefault` group. It sits where the product search will
     go later (see "Product hook").
   - *Qty*: an integer of 1 or more, default 1.
   - *Unit price*: a decimal greater than 0, typed by the cashier.
   - *VAT %*: read-only, the selected group's `vatRate`.
   - *Amount*: read-only, qty × unit price, rounded to the cent.
   - The rows are **editable in place**, not added once and frozen. "⊕ Add
     line" adds an empty row. The trash icon removes a row.
   - Empty state: with no merchant, or a merchant with no product groups,
     the left column shows the same `Empty` messages as `TagForm`.

**Right column (about 1/3, sticky)**
1. **Traveller**: the existing `AddTravellerDialog`. It stays optional: no
   traveller → `Draft`, traveller → `Issued`.
2. `SalesPersonSelector` and `PayoutTokenSelector`, reused unchanged.
3. **Totals**: net (Σ taxBase), VAT (Σ taxAmount) and total (Σ amount),
   worked out locally. Below them is the server quote
   (`postTagPreviewCalculationApi`, debounced 600 ms, keyed on the submit
   body), with the same "not a guarantee" note.
4. The minimum-sale warning, the merchant signature (the traveller signature
   comes from the traveller dialog, as today), and the **Issue tag** button.

## Line model

The screen state for each row is
`{ key, productGroupId, quantity, unitPriceInput }`. `key` is a client uuid, so
two rows with the same group are still separate rows. This becomes the post
body in one pure function:

```
amount    = round2(quantity × unitPrice)
taxAmount = amount × rate / (100 + rate)     // same formula as addInvoiceLine
taxBase   = amount − taxAmount
→ { amount, taxAmount, taxBase, taxRate: rate, productGroupId }
```

- A row that is incomplete (no group, a qty below 1, or a price that is not a
  valid positive number) is **not sent**. It counts as invalid, and Issue
  stays disabled while any row is invalid. *(My call: don't silently drop
  half-typed rows.)*
- The invoice totals are summed from the built lines with `withUpdatedTotals`,
  reused from `components/tag-form/invoice.ts`. That keeps the old file's
  "exact sums, not rounded" invariant.
- `invoiceForSubmit` is reused for the invoice-number fallback.
- Changing the merchant clears the rows, because groups belong to the
  merchant. The invoice number and date are kept, as on the old page.
- Quantity and unit price are **not sent**: the SDK line has no fields for
  them yet. They exist only on screen and inside `amount`.
- Unit price accepts at most 2 decimals, which input validation enforces.
  *(My call: keeps `amount` = qty × price exact and recoverable.)*
- Local totals sum the **valid** rows only. The server quote runs only when
  every row is valid, so a half-typed row never produces a quote.
  *(My call.)*
- The quote is keyed on a **stable** body: the built lines, the issue date and
  the raw (unresolved) invoice number. It does not go through
  `invoiceForSubmit`, because that embeds `Date.now()` for a blank number and
  would change the key on every render. The real submit still goes through
  `invoiceForSubmit`. *(My call. The old page's `quoteKey` looks like it has
  this re-quote-every-render bug. That is out of scope here, but worth
  checking.)*
- No change to `TagForm`. The new page composes the components that are
  already separate (`MerchantSelector`, `AddTravellerDialog`, `SignaturePad`,
  the selectors) and gets its own small empty state and default-group logic
  in `new-detailed/_components`. *(My call: no risk to the old page or
  `scan-sticker`.)*

The line logic lives in a pure `.ts` module next to the page
(`new-detailed/_components/lines.ts`) with `node --test` unit tests. That is
the only TDD-able part of `apps/web`.

## Product hook (built later, when the backend ships)

What the backend needs to add for this page to be complete (to pass on to the
backend team):

- a Product lookup for a merchant: id, name, `productGroupId`, and optionally a
  default price;
- on `InvoiceLineRequestDto`: `productId`, `quantity`, `unitPrice`.

When it ships, the *Product group* cell becomes a product search. The group and
VAT come from the chosen product, and its price (if any) pre-fills *Unit
price*, which the cashier can still edit. *(My call: the receipt is the source
of truth.)* No code for this is written now, beyond keeping the product-group
cell its own component so it can be swapped.

## Assumptions to verify

- The create endpoint accepts **several lines with the same
  `productGroupId`**. Nothing in the type forbids it, but the backend may
  merge or reject them. **Decision (user): build as designed. The page gets
  reworked when the new Product endpoint lands**, so same-group behaviour on
  today's endpoint is not a blocker. Still check it with one create on dev
  and record the result in the PR.
- The preview-calculation endpoint takes the same per-line body.

## Done means

- The page renders at `/{lang}/operations/tax-free-tags/new-detailed` for a
  merchant agent (`siggi.merchant`) and for a user who can pick a merchant.
- It issues a tag with 2+ lines, including two lines in the same group. On the
  tag detail page that tag shows the lines as entered. (If the detail page
  itself groups lines, that is a display matter for that page and not a
  blocker here: check the API response instead.)
- The old `new` page is unchanged.
- New UI strings are in TagService `en.json` + `tr.json` (Turkish by Claude,
  reusing existing terms). Every required component has a `data-testid`.
- The web gates hold at their baseline: type-check, lint, test:unit,
  i18n:missing, policy:audit.
