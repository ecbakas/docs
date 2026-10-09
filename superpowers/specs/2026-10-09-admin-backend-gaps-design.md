# Admin backend gaps: table rename, deletion impact, Didit accounts

**Status:** design approved 2026-10-09
**App:** web-app, `apps/web`
**Branch:** `feat/admin-backend-gaps`, from `origin/main`

## Why

On 2026-10-09 we checked which of web-app's generated SDK routes app code actually calls. Three backend features turned out to have reached the SDK through regeneration-only commits without any UI. Every route below is already in `origin/main`'s SDK, and every policy is already in `packages/utils/policies/policies.json`.

| Feature | Routes | Reached the SDK |
|---|---|---|
| Rename a table header | `PUT /api/contract-service/{refund-table,refund-fee,rebate-table}-headers/{id}/name` | 2026-09-23 |
| Deletion impact and force delete | `GET /api/crm-service/tour-events/{id}/deletion-impact`, `DELETE …/tour-events/{id}/force`, `GET /api/setting-service/vat/{id}/deletion-impact` | 2026-08-26 |
| Didit account administration | `GET/POST /api/kyc-service/didit-credentials`, `GET/PUT/DELETE …/{id}`, `POST …/{id}/reinstate` | 2026-10-07 |

## Grants on dev, 2026-10-09

**Both host and tenant admins:**
- `*.EditName` for all three table headers
- `CRMService.TourEvents.ViewDeletionImpact` and `.ForceDelete`
- `SettingService.Vats.ViewDeletionImpact`

**Host admin only:** `KYCService.DiditCredentials.*`. A tenant admin holds none of them.

## A. Rename a table header that is in use

**Today.** These three forms take the same approach:
- `settings/templates/refund-tables/[id]/_components/form.tsx`
- `settings/templates/refund-fees/[id]/_components/form.tsx`
- `settings/templates/rebate-tables/[id]/_components/form.tsx`

Each form locks every field when the caller lacks `X.Edit` or when `formData.isEditable` is false, and Name is locked with the rest. A table assigned to a live contract therefore cannot be renamed at all.

**Backend contract.** The `/name` routes "succeed even when the table is already assigned to a contract whose validity has started". Rate and fee changes on a live table stay blocked. Tags already priced keep the old name (`TagTotal.TableName` / `TagEarning.TableName`) until they are repriced or corrected. Each route takes `{ name }`, required, 1–255 characters.

**Change.**
- A pure helper, `nameEditMode({ hasEditGrant, hasEditNameGrant, isEditable })`, returns one of:
  - `"full"`: the form is editable and the existing full save carries the name. This is today's behaviour.
  - `"name-only"`: the form is locked, but the caller holds `X.EditName`.
  - `"locked"`: the caller can do neither.
- In `"name-only"` mode:
  - Name stays enabled.
  - Every other field stays locked, and the amber read-only notice stays.
  - A **Save name** button replaces the full submit.
  - Save name calls the matching new put-action, then `handlePutResponse`.
  - A hint under the field reads: "Tags already priced keep the old name until they are repriced or corrected."
- Three put-actions are added to `packages/actions/unirefund/ContractService/put-actions.ts`: `putRefundTableHeaderNameApi`, `putRefundFeeHeaderNameApi` and `putRebateTableHeaderNameApi`. They follow the file's existing pattern of returning `structuredResponse` or `structuredError`.
- Tour-guide fee tables have no `/name` route and are left unchanged.

## B. Deletion impact and force delete

### Shared pieces in `apps/web/src/components/deletion-impact/`

- **`deletion-impact.ts`** (pure):
  - `deleteRefusal(error)` classifies an api-error's `code`:
    - `"still-referenced"` for `UniRefund.Shared:010004` ("still referenced … review the deletion impact, then force the delete");
    - `"not-deletable"` for `UniRefund.Shared:010003` ("records cannot be deleted");
    - `null` for anything else.
  - `normalizeImpact(rows)` drops empty rows and sorts by service, then by entity type.
  - A negative `count` becomes `{ unknown: true }`. The backend defines a negative count as "that service could not be reached", so it must never be shown as 0.
- **`deletion-impact-list.tsx`** renders one row per entry: service, entity type and count, or "Unknown (service unreachable)".
- **Response shape:** `Array<UniRefund_Shared_Contracts_DeleteGuards_ReferenceCountDto>` (`serviceName`, `entityType`, `count`). It carries counts only, never ids.

### Tour events

**Today:** neither event detail page has a delete action:
- `operations/events/[eventId]`
- `parties/tour-guides/[partyId]/events/[eventId]`

`deleteTourEventByTourEventIdApi` exists but is never called.

**Change.** A shared `DeleteTourEventDialog` is added and used on both detail pages. Its trigger is gated by `CRMService.TourEvents` + `.Delete`.

1. The dialog asks for confirmation, then makes the plain delete call.
2. On success, it navigates back to the list the page came from.
3. When `deleteRefusal` returns `"still-referenced"`, the dialog switches to a "still referenced" state:
   - With `ViewDeletionImpact`, it loads `getTourEventDeletionImpactApi(id)` and shows the list.
   - Without it, it shows the backend's message alone.
   - With `ForceDelete`, it offers **Delete anyway** and an unchecked **Also clean up the records that reference it** checkbox, which sends `cascade`.
   - A short note says the cleanup finishes in the background, because the backend performs it asynchronously.
   - A force delete that the backend refuses, such as a cascade into money records, shows the backend's message in the dialog.
4. Any other error shows a toast, as today.

New actions: `getTourEventDeletionImpactApi` in `CRMService/actions.ts` (GET pattern: returns `structuredSuccessResponse` and throws `structuredError`), and `deleteTourEventForceApi(id, cascade)` in `CRMService/delete-actions.ts`.

### VAT rates

**Today:** `settings/product/vats/[vatId]/_components/form.tsx` deletes through `ConfirmDialog`. When the backend refuses, all the operator sees is a `handleDeleteResponse` toast.

**Backend contract:** "A VAT rate is never deletable today", so the impact route exists only to explain why the delete was refused. There is no force route for VAT rates.

**Change:** the existing delete call stays. When `deleteRefusal(res)` is not `null` and the caller holds `SettingService.Vats.ViewDeletionImpact`, a dialog opens titled "Why this VAT rate can't be deleted", showing the backend message and the impact list. In every other case, today's toast stays. The action added is `getVatDeletionImpactApi` in `SettingService/actions.ts`.

## C. Didit accounts (host only)

**Backend contract:**
- An account is either shared (`tenantId` empty) or dedicated to one tenant. A dedicated account is tried before the shared ones, and accounts are tried in ascending `priority`. The tenant cannot be changed after creation.
- `apiKey` is write-only. Reads return `apiKeyMasked`, such as `****abcd`. An update with a blank key keeps the stored key, and a different key clears the credential-rejected flag.
- Reinstate clears both the credit-exhausted and the credential-rejected flags.
- Delete removes the account from the pool. Sessions it created stay readable.

**Menu:** add a `settings/didit-accounts` item under Settings with `hostOnly: true` and policies `KYCService.DiditCredentials` + `.ViewList`. Its "New" action needs `.Create`. The navigation label key goes in `AbpUiNavigation` resources.

**Routes:** under `apps/web/src/app/[lang]/(main)/(unirefund)/settings/didit-accounts/`. These follow the VAT CRUD pattern: `guardPage`, then `MasterDataGrid`/`RowLink`, then `SchemaForm`, then `handle*Response`.

- **`page.tsx` + `_components/table.tsx`:**
  - Server-paged `MasterDataGrid`.
  - Filters: name, active, shared or dedicated (`isShared`), tenant.
  - Columns: name (link), tenant name or "Shared", priority, active, and a health badge.
  - The badge comes from the pure helper `diditHealth(dto)`, which returns `ok`, `creditExhausted(at)` or `credentialRejected(at)`. When both flags are set, rejected wins.
- **`new/`:**
  - `SchemaForm` built from `$UniRefund_KYCService_DiditCredentials_CreateDiditCredentialDto`.
  - Tenant is a combobox over the host tenant list, and empty means Shared.
  - `apiKey` is a password input.
- **`[id]/`:**
  - `SchemaForm` built from `$…UpdateDiditCredentialDto`.
  - Tenant appears as read-only text.
  - The key field starts empty, with the hint "Leave blank to keep the current key ({apiKeyMasked})".
  - Actions:
    - **Save**, gated by `.Edit`.
    - **Delete**, gated by `.Delete`, inside a `ConfirmDialog`.
    - **Reinstate**, gated by `.Reinstate`, shown only when `diditHealth` is not `ok`.
- **New KYCService actions:** `getDiditCredentialsApi`, `getDiditCredentialByIdApi`, `postDiditCredentialApi`, `putDiditCredentialApi`, `deleteDiditCredentialApi` and `postDiditCredentialReinstateApi`. They follow each file's existing pattern.
- **i18n:** add `apps/web/src/language-data/unirefund/KYCService/{index.ts,resources/en.json,resources/tr.json}`, modelled on the other services, and register it wherever the other service resources are registered.

## Error handling

- The api-error message is always shown as the backend sends it. The UI branches only on `UniRefund.Shared:010004` and `:010003`.
- An action button whose grant is missing is not rendered, following the repo rule that every action is gated by its endpoint's group grant and leaf grant.
- A failed impact fetch inside the "still referenced" dialog shows the backend message and keeps force delete available, because the backend re-checks references live anyway.

## Testing

- **TDD with `pnpm --filter web test:unit`** for the pure modules:
  - `nameEditMode`
  - `deleteRefusal` and `normalizeImpact` (including the negative-count case)
  - `diditHealth`
- **Gates:**
  - `pnpm --filter web type-check`
  - scoped `eslint`
  - `pnpm i18n:missing --app=web` (NEEDS_KEY stays 0)
  - `pnpm i18n:unused --app=web` (no new unreachable keys)
- **Manual check on dev:**
  - As the Faroe Islands admin: rename a live table, delete a throwaway tour event created for the test (plain, then forced), and look at a VAT rate's refusal dialog.
  - As host admin, Didit accounts **read paths only**: list, filters and detail.
  - Creating, editing, deleting or reinstating a real Didit account on dev needs the user's go-ahead first, because dev's KYC sessions run through those accounts.

## Out of scope

- Tour-guide fee tables, which have no rename route.
- Deletion impact for any other entity, since no other impact routes exist yet.
- Showing which tags still carry an old table name.
