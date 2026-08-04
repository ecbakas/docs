# Optional invoice number on tag creation

**Date:** 2026-08-04
**Repos:** `super-app`, `web-app`

## Problem

Every tag-create form makes the invoice number mandatory: a red `*` on the label,
and a submit button that stays disabled until something is typed. An operator
ringing up a sale from a sticker has no paper invoice number to copy in a good
share of cases, so the field blocks a create it has no business blocking.

The API has never required it. `InvoiceRequestDto` omits `invoiceNumber` from its
`required` list, marks it `nullable`, and describes it as *"The invoice number as
issued by the merchant or system. Optional field for external reference."* The
client is stricter than the contract it posts against.

One screen already acts on that: super-app's merchant `CreateTag` renders no
invoice-number field at all and posts `INV-${Date.now()}`.

## Goal

Wherever a tag-create form displays an invoice-number input, the field becomes
optional and says that leaving it empty generates one. Submitting blank posts a
generated `INV-<epoch-ms>` number, reusing the format merchant `CreateTag`
already ships.

## Scope

Every surface that *renders an input* for `invoiceNumber`:

| Surface | Repo | Why |
| --- | --- | --- |
| `components/tag-form/tag-form.tsx` | web-app | The shared field, used by `scan-sticker` and `tax-free-tags/new` |
| `tax-free-tags/new-old/_components/invoice-form.tsx` | web-app | Legacy page, still reachable, own copy of the field |
| `screens/staff/StickerTag/StickerTagScreen.tsx` | super-app | Sticker-line tag creation |

Deliberately out of scope:

- **`refunds/[refundId]/tags/_components/factura.tsx`** — labelled "Invoice
  number" but read-only display of a refund's `referenceNumber`, not an input.
- **`screens/merchant/CreateTag`** (super-app) — no input to make optional. It is
  touched only to import the shared generator instead of repeating the literal,
  so the two flows cannot drift to different formats.

## Design

### Where the number comes from

Generated client-side at **submit** time, not on mount or blur. The field stays
visibly empty while the operator works, which is what makes the description true;
seeding it would put a number on screen that the operator would then reasonably
try to reconcile against the paper in front of them.

The format is `INV-${Date.now()}`, lifted from merchant `CreateTag`.

**Accepted risk:** `Date.now()` is millisecond-precision, so two creates in the
same millisecond collide. Two operators tapping Create inside the same
millisecond is not a human-reachable rate, `invoiceNumber` carries no uniqueness
constraint in the DTO, and this format is already in production on the merchant
path. Not worth a UUID suffix that would make the number unreadable aloud.

**Cross-repo duplication is accepted.** super-app is React Native with no package
shared with web-app, so the format exists once per repo. Each definition carries a
comment naming the other.

### Resolution is a pure function, in both repos

```ts
/** `now` is injected rather than read from the clock so this stays testable. */
export function generateInvoiceNumber(now: number): string {
  return `INV-${now}`;
}

/** A typed number wins; blank or whitespace-only falls back to a generated one. */
export function resolveInvoiceNumber(
  typed: string | null | undefined,
  now: number
): string {
  return typed?.trim() || generateInvoiceNumber(now);
}
```

Two functions rather than one because the two callers ask different questions.
The forms resolve *typed-or-generated*; super-app's merchant `CreateTag` has no
field to read and only ever generates, so it calls `generateInvoiceNumber`
directly instead of passing an empty string to a resolver.

- **super-app:** `screens/shared/_components/tag-calculator/line.ts`, beside
  `generateUUID` — the module both `useStickerTag` and `useCreateTag` already
  import from.
- **web-app:** `components/tag-form/invoice.ts`, beside `buildInitialInvoice`.

Injecting `now` mirrors the discipline `buildStickerTagRequest` already applies to
`issueDate` ("passed in rather than read from the clock so this stays pure") and
is what lets the fallback be asserted without freezing time.

super-app's request builders keep `invoiceNumber: string` **required**. The caller
resolves blank to generated before calling, so the builders stay pure, their
signatures stay honest about always emitting a number, and their existing tests
keep passing unchanged.

### The field itself

- The red `*` is removed from the label. No "(optional)" suffix — the description
  below carries that, and both would be redundant.
- A description sits under the input, always visible. Not conditional on the field
  being empty: a hint that disappears as you type reads as a validation message
  rather than an explanation of the field.

| Locale | Text |
| --- | --- |
| EN | Leave empty to have one generated automatically. |
| TR | Boş bırakırsanız otomatik olarak oluşturulur. |

Keys:

- web-app: `TagService.InvoiceNumber.AutoGeneratedHint` (`en.json`, `tr.json`) —
  matches the dotted style of the neighbouring `InvoiceNumber.Placeholder`.
- super-app: `MobileApp.Qr.StickerTag.InvoiceNumberHint` (`en-US.json`,
  `tr-TR.json`), then `npm run init` to regenerate the bundles.

### Submit gates removed

Four files currently refuse a blank invoice number, and every one of those checks
goes:

| Location | Gate |
| --- | --- |
| `scan-sticker/client.tsx` | `!invoice.invoiceNumber` in the Issue-tag `disabled` expression |
| `tax-free-tags/new/client.tsx` | `if (!invoice.invoiceNumber) return false` in `canSubmit` |
| `tax-free-tags/new-old/client.tsx` | `if (!invoices.invoiceNumber) return false` |
| `useStickerTag.ts` | `!invoiceNumber.trim()` in the `submit` guard **and** in `canSubmit` |

Every other condition on those gates — at least one line, a resolved merchant, a
complete traveller, a merchant's VAT identity — stays exactly as it is. Only the
invoice-number clause is dropped.

## Changes by file

### web-app

1. **`components/tag-form/invoice.ts`** — add `resolveInvoiceNumber`. Add
   `invoiceForSubmit(invoice, now)` returning the invoice with its number
   resolved, so both consuming pages share one call site and cannot disagree
   about when generation happens.
2. **`components/tag-form/tag-form.tsx`** — drop the `*`; add the hint as
   `<p className="text-muted-foreground text-xs">`, the same treatment the
   existing `Form.NewTag.SelectProductGroup` hint gets in this file.
3. **`scan-sticker/client.tsx`** — drop the gate; post through `invoiceForSubmit`
   on **both** branches of `handleIssueTag` (the merchant `postTagApi` path and
   the Refund Point `postTagByStickerLineApi` path). Missing one would make the
   behaviour depend on the operator's role.
4. **`tax-free-tags/new/client.tsx`** — drop the `canSubmit` clause; post through
   `invoiceForSubmit`.
5. **`tax-free-tags/new-old/`** — same two changes, plus `client.tsx:102` stops
   seeding `invoiceNumber` with `t.TagService["InvoiceNumber.Placeholder"]`. That
   line already posts a literal `"INV-001"` for anyone who does not clear the
   field; with the field optional it would also mean nobody ever reaches
   generation on this page, because the value is never blank.
6. **`language-data/unirefund/TagService/resources/{en,tr}.json`** — the new key.
7. **`scan-sticker/README.md`** — the create-preconditions list says "an invoice
   number is entered"; it is no longer a precondition.

### super-app

1. **`screens/shared/_components/tag-calculator/line.ts`** — add
   `resolveInvoiceNumber`.
2. **`components/Input.tsx`** — additive optional `description?: string`, rendered
   under the bordered field, inside the component's own wrapper. A sibling
   `<Text>` in the screen would land below the wrapper's `mb-3` and read as
   detached from the field it describes. Rendered only when passed, so no existing
   caller changes.
3. **`screens/staff/StickerTag/StickerTagScreen.tsx`** — pass `description` to the
   invoice-number `Input`.
4. **`screens/staff/StickerTag/useStickerTag.ts`** — drop the invoice-number
   clause from the `submit` guard and from `canSubmit`; call
   `resolveInvoiceNumber(invoiceNumber, Date.now())` where the trimmed value is
   passed to the builders today. Both builder calls, merchant and by-sticker-line.
5. **`screens/merchant/CreateTag/useCreateTag.ts`** — replace the inline
   `` `INV-${Date.now()}` `` with `generateInvoiceNumber(Date.now())` so the
   format has one definition in this repo.
6. **`localization/resources/{en-US,tr-TR}.json`** — the new key; run `npm run init`.

## Testing

`super-app` has the vitest suite; `web-app/apps/web` has no unit tests, so
verification there is typecheck plus lint.

**New cases in `tag-calculator/__tests__/line.test.ts`**, which is where the
functions live:

- a typed number is returned trimmed, unchanged
- an empty string yields `INV-<now>`
- a whitespace-only string yields `INV-<now>` — the case a bare truthiness check
  on the untrimmed value gets wrong, and the one an operator produces by tapping
  the field and typing a space
- `null` and `undefined` yield `INV-<now>`
- `generateInvoiceNumber` formats the injected `now`, so a frozen value asserts
  the exact string rather than a regex

Existing builder tests (`invoiceNumber: "INV-2026-1183"` asserted through both
`buildStickerTagRequest` and `buildMerchantTagRequest`) must keep passing
untouched. If they need editing, the resolution leaked into the builders.

**Manual checks:**

- super-app sticker flow: Create enabled with the invoice field empty, and the
  created tag carries an `INV-…` number.
- web `scan-sticker`, both roles: Issue-tag enabled with the field empty.
- web `tax-free-tags/new`: Create enabled with the field empty, still refused
  under the `MIN_TOTAL_AMOUNT` floor.
- Both locales render the description.

## Non-goals

- No change to the placeholder (`INV-001` / `FAT-001`). It illustrates the format
  an operator would type; the description covers the empty case.
- No echo of the generated number back into the field before submit.
- No backend change. This relies only on `invoiceNumber` being nullable, which it
  already is.
