# Design: One tag-creation component for `scan-sticker` and `tax-free-tags/new`

**Date:** 2026-07-30
**Repo:** `unirefund-web` (branch `dev`, at `e9b3b9ad3`)
**Scope:** `web-app/apps/web`

## Goal

`operations/scan-sticker` and `operations/tax-free-tags/new` both create a tax-free
tag, and both have grown their own merchant block, invoice fields and
product-group entry. Each page ended up with the better version of a different
part. Merge them into **one** component, take the better half of each, and read
every string from `TagService`.

The traveller half is already done: both pages import the same
`@/components/add-traveller-dialog`, which wraps the same `TravellerForm` and
signature pad. Nothing there changes.

## What differs today

| Piece | `scan-sticker/client.tsx` | `tax-free-tags/new` | Keep |
| --- | --- | --- | --- |
| Merchant | four branches (foreign-allocation / allocated / is-merchant / picker), VAT + address lines, allocation warnings, via **TagService** `searchMerchantsForTagCreation` | `Popover` + `AsyncSelectBase` with a `Store` icon, reused as the `Empty` state's call to action, via **CRMService** `searchMerchants` | `new`'s presentation |
| Invoice number | plain `Input` | `InputGroup` + `Hash` addon | `new` |
| Issue date | **absent** — always "now" | `DatePicker` in a `Calendar` frame, `onChange` wired | `new` |
| Product groups | **chips** + one amount + `Add`, then a line list with `Delete`; merge-on-add, rounded to the cent | switch-per-row + amount-per-row, `X product groups enabled` | `scan-sticker` |
| Totals | `toFixed(2)` | `Intl.NumberFormat` for VAT and total | `new` |
| Traveller | shared `AddTravellerDialog` | shared `AddTravellerDialog` | already one |

## The merchant block is not just a different look

This is the one part that cannot simply be replaced with `new`'s version. The two
pages differ in every layer beneath the button:

| | `tax-free-tags/new` | `scan-sticker` |
| --- | --- | --- |
| Action | `searchMerchants` (CRMService) | `searchMerchantsForTagCreation` (TagService) |
| Permission | `CRMService.Merchants.ViewList` | `TagService.Tags.ViewMerchantsForCreation` |
| Generated DTO | `..._Merchants_MerchantListResponseDto` | `..._Merchants_MerchantForTagCreationDto` |
| Extra rules | none | sticker-book allocation: an allocated book's merchant is fixed, an unallocated one is allocated **permanently** by creating the tag, and a merchant scanning another store's book is refused client-side |

Those rules are documented at length in
[`scan-sticker/README.md`](../../../web-app/apps/web/src/app/%5Blang%5D/(main)/(unirefund)/operations/scan-sticker/README.md)
and must not move into a component that `tax-free-tags/new` also renders.

**Decision (agreed with user): share the look, inject the data.** A generic
`MerchantSelector<T>` owns `new`'s popover, `Store` icon and empty-state CTA. The
fetch action, the value, the read-only branches and the warning copy are all
props. Every permission gate, endpoint choice and allocation rule stays in the
page it belongs to.

## Where it lives

`apps/web/src/components/tag-form/`, beside the already-shared
`add-traveller-dialog.tsx` and `signature-pad.tsx`:

| File | Exports |
| --- | --- |
| `invoice.ts` | `buildInitialInvoice`, `withUpdatedTotals`, `addInvoiceLine`, `removeInvoiceLine` — pure, no JSX |
| `merchant-selector.tsx` | `MerchantSelector<T>` |
| `tag-form.tsx` | `TagForm<T>` — the tag-creation component |

Three files rather than one because the invoice arithmetic is the part worth
testing in isolation, and the merchant selector is the part with two callers that
disagree about where its data comes from.

## `TagForm<TMerchant>`

Renders, identically on both pages: the header row, the merchant block, invoice
number, issue date, product-group entry, and the totals footer.

```
title/subtitle ──────────────────────── [ 👤 Add traveller ]   ← AddTravellerDialog
┌────────────────────────────────────────────────────────────┐
│ Merchant     <MerchantSelector />                          │
│ Invoice No.  [ # INV-001 ]      Issue date [ 📅 30/07/26 ] │
│ Product groups                              2 lines        │
│  (Clothing 20%) (Electronics 10%) (Food 8%)                │  ← chips, aria-pressed
│  Amount [ 1200.00 ]                          [ Add ]       │
│  ├ Clothing 20%        1.200,00        [ Delete ]          │
│  └ Electronics 10%       450,00        [ Delete ]          │
│  VAT 240,91                    TOTAL     1.650,00          │
└────────────────────────────────────────────────────────────┘
{children}   ← page extras
```

Props:

```ts
{
  title: ReactNode;
  subtitle?: ReactNode;
  merchant: MerchantSelectorProps<TMerchant>;
  invoice: UniRefund_TagService_Invoices_InvoiceRequestDto;
  setInvoice: (invoice: UniRefund_TagService_Invoices_InvoiceRequestDto) => void;
  productGroups: UniRefund_SettingService_ProductGroupMerchants_ProductGroupMerchantRelationDto[];
  countries: UniRefund_CRMService_Countries_CountryDto[];
  traveller: UniRefund_TagService_Travellers_TravellerRequestDto | null;
  setTraveller: (t: UniRefund_TagService_Travellers_TravellerRequestDto | null) => void;
  onTravellerSignatureChange?: (signature: string | undefined) => void;
  disabled?: boolean;
  testId: string;
  children?: ReactNode;
}
```

`children` is where each page puts what only it has — sales person, payout token,
signature pads, its own action buttons. The component does not know about any of
them.

`invoice` is **not** nullable here. Both pages hold it as
`InvoiceRequestDto | null` — scan-sticker because there is no invoice until a
scan resolves, `tax-free-tags/new` only because its initialiser is typed that way
— and both already guard before rendering the form. Narrowing at the two call
sites keeps every `invoices?.` and `invoices &&` guard out of the shared
component.

The single amount field beside the chips uses `new`'s `InputGroup` +
`Banknote` addon, not scan-sticker's plain `Input`, so it matches the invoice
number field's visual language. Only the chip-and-`Add` *model* comes from
scan-sticker; the field styling is `new`'s throughout.

### Its own state, and no `useEffect`

`TagForm` holds only `selectedGroupId` and `amountInput`. Both must reset
whenever the product-group set changes, which today happens imperatively at every
call site that loads product groups — each `handleScan` branch and the merchant
pick.

Owning the state means owning the reset, and it is done with React's documented
"adjust state when a prop changes" pattern: derive a `groupsKey` from the group
ids and `setState` during render when it differs from the last one seen. No
`useEffect`, per [`avoid-use-effect.md`](../../../web-app/.claude/rules/avoid-use-effect.md).
`selectedGroupId` resets to the merchant's default group, which is what both
pages do now.

## `MerchantSelector<TMerchant>`

```ts
type MerchantSelectorProps<T> = {
  testId: string;
  disabled?: boolean;
  notice?: { text: string; tone: "muted" | "warning" | "error" };
  details?: { vatNumber?: string | null; address?: string | null };
} & (
  | { mode: "select"; fetchAction: ...; value: T | null; onChange: (m: T | null) => void }
  | { mode: "readonly"; name: string }
  | { mode: "hint"; text: string }
);
```

- `select` renders `new`'s popover **and** its `Empty` + CTA variant.
- `readonly` renders the name as text — an allocated book, or an operator who is
  the merchant.
- `hint` renders muted copy for "you have no way to choose one".
- `notice` is the allocation warning line; `details` the VAT and address lines.

`fetchAction` is typed from `AsyncSelectBase`'s own `fetchAction` prop rather than
a hand-written signature, so the two call sites keep their own generated DTOs and
nothing new is invented.

scan-sticker's four branches map on directly:

| scan-sticker state | Selector |
| --- | --- |
| `isForeignAllocation` | `readonly` + `notice: error` |
| `isMerchantAllocated` | `readonly` + `notice: muted` |
| `isMerchantUser` | `readonly` + `notice: warning` (the book is still unallocated) |
| `canPickMerchant` | `select` + `notice: warning` |
| none of the above | `hint` |

## Types

Everything comes from `packages/saas`:
`UniRefund_TagService_Invoices_InvoiceRequestDto`,
`UniRefund_SettingService_ProductGroupMerchants_ProductGroupMerchantRelationDto`,
`UniRefund_TagService_Travellers_TravellerRequestDto`,
`UniRefund_CRMService_Countries_CountryDto`,
`UniRefund_CRMService_Merchants_MerchantListResponseDto`,
`UniRefund_CRMService_Merchants_MerchantForTagCreationDto`, and
`$UniRefund_TagService_Travellers_TravellerRequestDto` for scan-sticker's
required-field check.

The only new types are `TagForm`'s and `MerchantSelector`'s props. Those describe
UI configuration, not an API payload, so they are not a generated-schema
substitute.

## Language keys

New keys in `apps/web/src/language-data/unirefund/TagService/resources/en.json`
and `tr.json`, then `pnpm run init` (never edit `language-data/i18n/` by hand):

| Key | en | tr |
| --- | --- | --- |
| `Form.NewTag.AddLine` | Add | Ekle |
| `Form.NewTag.RemoveLine` | Remove | Kaldır |
| `Form.NewTag.SelectProductGroup` | Select a product group to add an amount | Tutar eklemek için bir ürün grubu seçin |
| `Form.NewTag.LineCount` | line | satır |
| `Form.NewTag.LineCountPlural` | lines | satır |

Retired: `Form.NewTag.EnabledGroups` and `Form.NewTag.EnabledGroupsPlural`. Chips
have no enabled/disabled state, so the counter becomes a line count.

`SelectMerchant` ("Select merchant", a button label) and
`AssignSticker.SelectMerchant` ("Choose the merchant this tag belongs to", a hint
sentence) both stay — they say different things.

**Deliberate boundary.** Generic widget copy stays on `Default`:
`Select.Placeholder`, `Select.EmptyValue`, `Select.ResultLabel`, `From`, `To`,
`Close`, `Save`, `Clear`, `Done`. Those belong to `AsyncSelect`, `DatePicker` and
`Dialog`, are used across the whole app, and mirroring them into `TagService`
would give two sources of truth for one string. Only copy that is about tag
creation moves to `TagService`.

## What each page keeps

### `scan-sticker/client.tsx`

Unchanged: page states, the wedge listener and camera, `classifyScan`, `openTag`,
`lookupOwnMerchant`, `lookupMerchantInfo`, the allocation flags,
`REQUIRED_TRAVELLER_FIELDS` / `isTravellerComplete`, both create endpoints, the
`Rescan` reset, and the merchant `SignaturePad` (merchant users only — a Refund
Point's `CreateTagByStickerLineRequestDto` has no field for it).

Its `scanned` branch becomes one `TagForm` with the merchant mapping above, the
signature pad and both buttons as `children`. Roughly 300 lines leave the file;
its `README.md` needs its "Building the invoice" and "Resolving the merchant"
sections repointed at the shared component.

### `tax-free-tags/new/client.tsx`

Unchanged: `SalesPersonSelector`, `PayoutTokenSelector`, `MIN_TOTAL_AMOUNT` and
its `canSubmit` guard, the single `postTagApi`.

Deleted: `new/_components/invoice-form.tsx` and `getInitialInvoiceLines`.

## Behaviour changes, on purpose

1. **`new` moves to chips.** It loses switch-per-row, the "X product groups
   enabled" counter, and the pre-enabled zero-amount lines for default groups —
   chips have no enabled state, so a line exists only once an amount is added. It
   gains merge-on-add and the cent rounding, which stop a repeated add from
   posting `0.30000000000000004` as a refund basis.
2. **`new` stops seeding the invoice number with the placeholder.**
   `buildInitialInvoice` starts it `""` and passes the placeholder as
   `placeholder`. Seeding it as a value is why an operator who did not clear the
   field first posted `INV-0011234`; scan-sticker already fixed this.
3. **scan-sticker gains a real issue date.** It previously always sent "now".
4. **The merchant row is always visible.** `tax-free-tags/new` currently *hides*
   the merchant row when there are no product groups and moves the picker into
   the `Empty` state's call to action. That cannot work for scan-sticker, whose
   merchant is often `readonly` or a `hint` with no picker to promote — a Refund
   Point would lose the allocation warning, and a merchant would lose the name of
   the store the book belongs to. So `TagForm` always renders the
   `MerchantSelector` row at the top, and when there are no product groups the
   `Empty` renders *below* it in place of the invoice fields. `new` therefore
   shows its picker in the row rather than centred in the empty state.
5. **`data-testid` prefixes.** `TagForm` takes a `testId`. `tax-free-tags/new`
   passes `new-tag-v2`, so its existing ids are unchanged; scan-sticker passes
   `scan-sticker`, so its currently-unprefixed ids (`invoice-number-input`,
   `add-line-button`, `product-group-chip-*`, `remove-line-*`) gain the prefix.
   Nothing in the repo references any of them. This also brings scan-sticker in
   line with [`data-testid.md`](../../../web-app/.claude/rules/data-testid.md),
   which asks for a page-or-feature prefix.

## Out of scope

`tax-free-tags/new-old/` stays on disk, untouched and unrouted. It is the
pre-rewrite page and deleting it is a separate decision.

## Testing

`apps/web` has **no unit test runner** — only Playwright. (`packages/ayasofyazilim-ui`
has Jest and `@testing-library/react`, but it is a separate repository mounted as
a submodule, so it cannot hold tests for `apps/web` code.)

`apps/web` **does** have Playwright (`apps/web/playwright.config.ts`, `pnpm test`,
specs under `apps/web/tests/`), but nothing in the suite covers either page:
`tests/unirefund/parties/tag/new/create.tag.spec.ts` is misleadingly named — it
drives `/parties/tax-free/new`, which creates a tax-free *party*, not a tag. No
spec references any `data-testid` this change touches, which is what makes the
prefix change safe.

No new e2e spec is added here. Every project in the config depends on a
`setup-*` job pointing at `tests/core/auth/auth.setup.ts`, which is not in the
tree, and each needs a `TEST_*_URL` and a live tenant. Both pages also branch on
session role, so a spec would need two authenticated roles to be worth writing.
That is its own piece of work.

Verification is therefore:

- `pnpm build`, lint and type-check, as with the rest of this app
- a manual pass over both pages in **both** roles, since the merchant branch and
  the Refund Point branch render different selector modes and post to different
  endpoints

`invoice.ts` is written as pure functions specifically so it can hold tests when
infrastructure arrives: merge-on-add summing before rounding, VAT-inclusive tax
from the combined amount, and totals derived from lines rather than maintained.

## Risks

| Risk | Mitigation |
| --- | --- |
| Sharing the merchant block bleeds allocation rules into `tax-free-tags/new` | the selector takes only presentation props; every rule, permission and endpoint stays in the page |
| `new` users lose the pre-enabled default product-group lines | intended — `selectedGroupId` still defaults to the merchant's default group, so the first `Add` needs no chip click |
| The two merchant DTOs get confused | `MerchantSelector` is generic; neither concrete DTO is imported by the shared component |
| scan-sticker's README drifts from the code | the two sections it documents move, so they are repointed in the same change |

## Not verifiable here

Real merchant and Refund Point logins against a live tenant — specifically that
the shared selector renders the right mode for an allocated versus unallocated
sticker book, and that both create endpoints still succeed. Camera behaviour
needs a device.

## Follow-ups (triaged by the final whole-branch review, 2026-07-31)

Implemented on `feat/shared-tag-form` (13 + 4 commits, `e9b3b9ad3..d49f0a4b8`). The
final review recommended merge after fixes; those fixes landed. What follows was
triaged as deliberately **not** part of this branch.

### Worth a ticket, highest value first

1. **Out-of-order product-group response on `tax-free-tags/new`.** `handleMerchantPick`
   sets the merchant synchronously but the groups from an un-tokened promise. Pick A,
   pick B before A resolves, A lands last, and `merchant` is B while `productGroups`
   are A's - so pricing uses A's `vatRate` under B's `vatNumber`, and `canSubmit`
   checks neither. Pre-existing and unchanged by this branch. `scan-sticker` is immune,
   because it writes merchant and groups from one `setScannedData`. Needs a request
   token or an `AbortController`. This is the only deferred item that can post
   cross-merchant data.
2. **`/new` never filters product groups by `isActive`.** `scan-sticker` filters at all
   three sites, with the reason stated in its README: an inactive group carries a
   retired VAT rate, and a line must never be priced against one. `/new` passes the
   endpoint's output straight through, so a retired group is clickable there today.
   Pre-existing, but the two pages now render the same chips from the same component
   with different data hygiene - exactly the divergence this refactor exists to remove.
   Left out because changing which groups are selectable is a business decision.
3. **`Select.ResultLabel` / `Select.EmptyValue` copy is wrong repo-wide.**
   `AsyncSelectBase` uses `resultText` as a group **heading**, but the `Default` value is
   "0 search result." So the merchant dropdown now shows "0 search result." above N
   results. Six other call sites share this, so the shared picker matches house idiom -
   but the strings themselves want fixing in `core/Default/resources/*.json`.
4. **`type="number"` dead-ends a comma decimal separator.** Typing `1,50` leaves the
   input in bad-input state: the value reads empty, `Add` greys out, and nothing says
   why - while `inputMode="decimal"` invites the comma on a Turkish keypad. Fix with
   `type="text"` plus normalisation, or surface a hint.
5. **Empty-state copy for the foreign-allocation (`readonly`) state.** It says "This
   merchant has no product groups configured yet", which is false - the book belongs to
   another store and that store was never asked. Mitigated: the always-visible merchant
   row carries `AssignSticker.MerchantAllocated` in `text-destructive font-semibold`,
   and three guards block the create. Accurate copy needs page-owned empty-state text,
   i.e. a new `TagForm` prop, which was ruled out as disproportionate. The `hint` mode
   half of this was fixed.
6. **Orphaned `Form.NewTag.MinAmountHint`** has no readers. It also means `/new`'s
   `MIN_TOTAL_AMOUNT = 100` guard disables Create with no on-screen explanation.

### Latent, not reachable today

7. **`readonly` mode's reset identity is `merchant.name`**, which can degrade to `"-"` or
   `""` and is not guaranteed unique. Unreachable while `readonly` renders no picker and
   every other merchant change tears the form down. Closing it needs a merchant id in
   `readonly` mode - the same prop as (5).
8. **`merchantKey`'s ternary has no exhaustiveness check**, so a future fourth
   `MerchantSelectorProps` mode would fall silently into the `"hint"` constant.
9. **`key={line.productGroupId}` and `removeInvoiceLine` assume a non-null id.** Proved
   unreachable: `addInvoiceLine` always sets it from a required `string`, and neither
   page hydrates a server-sourced invoice. It would matter if one ever did.

### Standing constraint

`withUpdatedTotals` returns **unrounded** sums on purpose, so `totalAmount` and
`vatAmount` stay the exact sums of their lines. Cosmetic tidiness belongs to
`Intl.NumberFormat` at the point of display. A future `toFixed`, `String(...)`, CSV or
print path that prints the raw value would surface `60.599999999999994`. The function's
doc comment records this and both rejected alternatives - in a codebase with no unit
test runner for `apps/web`, that comment is the only guard.

### Verification still outstanding

A **manual two-role pass** over both pages - as a merchant and as a Refund Point - was
never performed. Both create endpoints and all three merchant-selector modes are
unexercised by any automated test, and a create permanently allocates a sticker book.
`apps/web` has no unit test runner; its Playwright suite covers neither page and cannot
run without `tests/core/auth/auth.setup.ts` and a live tenant.

`invoice.ts` uses only `import type` and so runs directly under `tsx`. Its invariant
assertions have been written and thrown away three times. They would be worth keeping as
a real test file - Node 22 can run `node --experimental-strip-types --test` with no new
dependencies.
