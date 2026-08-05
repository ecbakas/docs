# Traveller documents page and document switcher

**Date:** 2026-08-05
**Repos:** `super-app`

## Problem

A traveller's identity documents are what every tax-free tag and refund hangs off,
and the app gives no way to see them. `GET /travellers/my-document-affiliations`
is already wired up in super-app — but only as a fallback inside
`utils/card/traveller-id.ts`, which reads `affiliations[0].travellerId` and throws
the rest of the payload away. The traveller cannot see which documents their
account holds, which one is primary, which one the current session is acting as,
or how strongly each is verified.

Adding a document is likewise unreachable. `POST /ssr-actions/prove-document`
exists in the generated SDK with no wrapper and no caller, so the one path that
turns a Didit evidence session into a proved document on the account is dead code
in this repo.

Switching the active document has a working reference in web-app
(`apps/ssr/src/components/global/navbar/traveller-document-switcher.tsx`) and no
mobile counterpart at all.

## Goal

Travellers get a Documents page listing their documents, an **Add document**
button that proves a new one through Didit + `prove-document`, a **Set primary**
action per document, and a document switcher on Home that changes which document
the session acts as.

## Scope

| Surface | What it does |
| --- | --- |
| `screens/traveller/Documents/` | The page: list, add, set-primary |
| `screens/traveller/Home/_components/ActiveDocumentPill.tsx` | Header pill showing the active document; opens the switcher |
| `screens/traveller/Documents/_components/DocumentSwitcherSheet.tsx` | The switcher itself (set-active) |
| `actions/TravellerService/post.ts` | Three new POST wrappers |
| `hooks/useDiditVerify.tsx` | `verify()` extracted out of `useTravellerDidit` |

Deliberately out of scope:

- **`didit-upgrade-options`** — the per-document evidence-upgrade flow. It is a
  separate endpoint with its own decision surface (which upgrade, at what level)
  and does not belong in the same screen as first-time proving.
- **Document deletion.** No endpoint exists on `my-document-affiliations`.
- **A "Manage documents" link from the switcher sheet into the Documents page.**
  It would make Home a second entry point into the Profile stack, which is the
  exact situation `openCards` has a paragraph of comment explaining; not worth
  inheriting that for a link the Profile row already provides.
- **set-active on the Documents page.** The page shows an *in use* badge but does
  not switch. One switching surface, one place where the token refresh happens.
- **Any web-app counterpart.** web-app SSR has the switcher already and no
  documents page; adding one there is its own project.

## Design

### Navigation

Documents lives in the Profile tab's stack, exactly where Cards lives:

```
/(auth)/profile/documents        →  DocumentsScreen
```

Reached from a single entry point: a **Documents** row in the traveller Profile
settings list, placed directly after the existing Payout Methods row.

`openDocuments()` mirrors `openCards()` — a plain `router.push(DOCUMENTS_HREF)`
with no `withAnchor`. The href is exported as a const so the route string has one
definition. Unlike Cards there is no Home entry point, so the stack always holds
`profile/index` underneath and back returns to the profile page.

`profile/_layout.tsx` gains `<Stack.Screen name="documents" />` alongside the
three it already registers.

### Active document comes from the JWT, not from `isActive`

`TravellerDocumentAffiliationDto.isActive` is documented in the generated types as
*"True when this document matches the TravellerDocumentId claim of the current
JWT."* It is derived from the token, not stored. The web switcher reads the active
id from `session.user.TravellerDocumentId` and never touches `isActive`
(`traveller-document-switcher.tsx:52-60`); this design does the same.

That choice is what keeps the two surfaces consistent without new global state.
`useUserStore.user.jwtUser` is already global and already re-decoded on every auth
path, so after a switch both the Home pill and any mounted list re-derive the
active document from one refreshed source.

Two supporting edits:

- **`store/user.types.ts`** — add `TravellerDocumentId?: string[] | string` to
  `JwtUser`, with the same repeated-claim caveat the neighbouring `TravellerId`
  and `MerchantId` fields carry. ABP emits a repeated claim as an array.
- **`utils/traveller.ts`** — add `getTravellerDocumentIdFromClaims(jwtUser)`
  returning `""` when absent, directly mirroring `getTravellerIdFromClaims`
  (including tolerating the array form). `""` means *unknown*, never a valid id.

### Actions layer

New file `actions/TravellerService/post.ts` — the service currently has only
`actions.ts`, and `.claude/rules/api-actions.md` puts POSTs in `post.ts`. Each
wrapper follows the house pattern: resolve the client from `actions/lib.ts`, wrap
in `fetchRequest`, pass `customHeaders` through, unique `apiName` for logs.

```ts
/** Prove a document from an approved Didit evidence session. */
export async function postProveDocumentApi(sessionId: string) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getTravellerServiceClient(customHeaders);
    return await client.ssrAction.postApiTravellerServiceSsrActionsProveDocument({
      requestBody: { sessionId, kycSessionProvider: "Didit" },
    });
  }, "postProveDocumentApi");
}

export async function postSetPrimaryDocumentApi(travellerDocumentId: string) { /* set-primary */ }
export async function postSetActiveDocumentApi(travellerDocumentId: string) { /* set-active */ }
```

`kycSessionProvider` is fixed to `"Didit"` inside the wrapper rather than being a
parameter. Didit is the only provider the app runs, and the existing
`useTravellerDidit` already hardcodes a module-level `KYC_PROVIDER` constant for
the same reason.

Both affiliation endpoints take `travellerDocumentId` as a **path** parameter and
return `unknown` — callers must refetch rather than read a body.

Naming: the `Api` suffix follows the explicit checklist in
`.claude/rules/api-actions.md`, even though the sibling `actions.ts` predates that
rule and does not use it. New file, current rule.

### Didit verification, extracted

`useTravellerDidit.verify(action)` already does exactly what Add-document needs:
resolve the workflow for an SSR action, run the native SDK, and reduce the five
terminal states to *approved `sessionId`* or *`null` plus the right toast*. It is
private to that hook.

Extract it to **`hooks/useDiditVerify.tsx`** returning `{ verify }`, and have
`useTravellerDidit` consume it. The extraction is verbatim — same
`resolveWorkflowId` call, same `languageCode`/`loggingEnabled` config, same
cancelled/failed/Declined/Pending/Approved branches, same existing
`MobileApp.Auth.Verification.*` toast keys via `useToastRef`. `useTravellerDidit`
keeps its own `isBusy`, which tracks its three multi-step flows and is not part of
what `verify` does.

Copying the branches into a second hook instead would mean two places to fix the
next time a Didit terminal state changes meaning.

Add-document calls `verify("ProveDocument")`. `ProveDocument` is a member of
`SSRActionType`, so `resolveWorkflowId` resolves its minimum evidence level from
`evidence-level-requirements` and picks the matching workflow with no new
plumbing.

### Add-document is permission-gated

`prove-document` requires `TravellerService.SSRActions` **and**
`TravellerService.SSRActions.ProveDocument`. Both are real keys in
`data/policies/policies.gen.json`, so `user.grantedPolicies` can answer before the
request:

```ts
const canAdd = Boolean(
  user?.grantedPolicies?.["TravellerService.SSRActions"] &&
    user?.grantedPolicies?.["TravellerService.SSRActions.ProveDocument"],
);
```

This follows the precedent in `StickerTagScreen`, which gates tag creation on the
exact grant the endpoint it calls requires.

The button stays **visible but disabled**, with `Documents.AddNotPermitted`
explaining why, rather than disappearing. A missing grant on a traveller account is
a tenant-configuration problem; hiding the button makes it invisible to both the
traveller and whoever they report it to, whereas launching a full Didit
verification only to 403 at the last step wastes the traveller's time on
document photos that are then discarded.

`grantedPolicies` is non-null by construction — `SessionProvider` refuses to adopt
a session without it (`SessionProvider.tsx:199`) — so a false reading here means
genuinely not granted, not "not loaded yet".

### Screens and components

```
screens/traveller/Documents/
  DocumentsScreen.tsx
  useTravellerDocuments.ts
  openDocuments.ts
  _components/DocumentCard.tsx
  _components/DocumentSwitcherSheet.tsx
  useDocumentSwitcher.ts
```

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `useTravellerDocuments()` | The page's server state: `documents`, `activeDocumentId`, `loading`, `error`, `pendingId`, `canAdd`, `refresh`, `setPrimary`, `addDocument` | `getMyDocumentAffiliations`, the two post actions, `useDiditVerify`, `useUserStore` |
| `DocumentsScreen` | `ModalTemplate` shell; loading / load-failed / empty / list states; Add button | the hook, `DocumentCard`, `Button` |
| `DocumentCard` | One affiliation rendered: type icon, full name, identification number, type label, Primary / in-use / evidence-level badges, optional Set-primary pill | props only — no hooks, no fetching |
| `useDocumentSwitcher()` | `documents`, `activeDocumentId`, `selectedId`, `select`, `switchTo`, `isSwitching`; owns the set-active → token-refresh sequence | `getMyDocumentAffiliations`, `postSetActiveDocumentApi`, `useSession`, `useUserStore` |
| `DocumentSwitcherSheet` | Bottom sheet: rows to select, checkmark on active, confirm row "Switch to {number}" | `useDocumentSwitcher`, `BottomSheet` |
| `ActiveDocumentPill` | The Home header entry point; three-state per below | `useDocumentSwitcher`, `DocumentSwitcherSheet` |

`useTravellerDocuments` is built on `useAsyncFetch(getMyDocumentAffiliations)` and
follows `useCards` structurally: a `pendingId` single-flight guard, a shared
`runMutation` helper that refetches and toasts, and `useToast()` for messages.

`DocumentSwitcherSheet` lives under `Documents/_components/` because it is
document-domain, and is imported by Home. The sheet and the page never render at
once, so two copies of the list cost nothing in correctness — the only value that
crosses surfaces is the active id, and that comes from the store.

### The Home pill

`templates/TabPage.tsx` gains an **optional** `headerAccessory?: React.ReactNode`,
rendered in the existing header row between the title and the notification bell.
Optional means every current caller — every tab of every role — renders
identically to today. Only traveller `HomeScreen` passes it.

The pill's three states mirror the web switcher's degenerate-case handling
(`traveller-document-switcher.tsx:78-93`):

| Condition | Render |
| --- | --- |
| No `TravellerDocumentId` claim | Nothing, **and no request is made** |
| Exactly one document | A plain non-interactive label with the identification number — nothing to switch between |
| Two or more | A pressable pill (type icon + number + chevron) opening the sheet |

Gating the fetch on the claim is what keeps this from adding a round-trip to the
app's landing screen for accounts that can never use it.

The pill truncates to a single line with a max width so a long identification
number cannot squeeze the "Home" title.

### Data flow

**Add document**

1. Tap Add document → `verify("ProveDocument")`.
2. `null` (cancelled / declined / pending / failed) → stop. `verify` has already
   toasted where a toast is warranted.
3. Approved `sessionId` → `postProveDocumentApi(sessionId)` → `{ travellerDocumentId, level }`.
4. Refetch the list.
5. Toast: if `travellerDocumentId` was **already present** in the pre-call list,
   the document existed and only its evidence level moved — say *updated*.
   Otherwise say *added*.

Step 5 matters because `prove-document` resolves the document from the session's
document number rather than creating one unconditionally. Re-proving a passport
already on the account is a legitimate, likely action, and reporting it as "added"
would have the traveller looking for a row that never appears.

**Set primary**

`postSetPrimaryDocumentApi(id)` → refetch → toast. Guarded by `pendingId`; a
second tap while one is in flight gets a busy toast rather than a silent no-op.

Refetch rather than local patch: set-primary clears the previous primary on a
*different* row, so patching one row leaves the list showing two primaries.

**Switch active**

1. Pill → sheet. Rows are selectable; the active row carries a checkmark.
2. Confirm row → `postSetActiveDocumentApi(selectedId)`.
3. `await fetchNewAccessToken()` from `useSession()` — the mobile counterpart of
   web's `refreshSessionAfterAffiliationSwitch`. It re-exchanges the refresh
   token, republishes the access token, and re-runs `getUserData`, which decodes
   the new JWT into `useUserStore`.
4. The claim changes → the pill and any mounted list re-derive the active document.
5. Refetch the list, dismiss the sheet, success toast.

The refresh is mandatory, not an optimisation: the account's active document has
changed server-side, and every subsequent request still carries the old
`TravellerDocumentId` claim until the token is replaced.

## Error handling

| Failure | Behaviour |
| --- | --- |
| `ProveDocument` policy not granted | Add button disabled with `Documents.AddNotPermitted`; no Didit run, no POST |
| Workflow unresolvable for `ProveDocument` | Existing `MobileApp.Auth.Verification.NotAvailable` toast; no POST |
| `prove-document` returns 403 despite the grant | `Documents.AddFailed` — the grant check is an early filter, not a guarantee |
| Didit cancelled | Silent — the traveller chose it |
| Didit declined / pending / failed | Existing `MobileApp.Auth.Verification.*` toasts; no POST |
| `prove-document` rejects | `Documents.AddFailed`; list untouched |
| Initial list load fails, nothing on screen | Full-pane message + Retry button |
| Refetch fails with rows on screen | Amber inline banner + Retry, rows kept |
| `set-primary` rejects | `Documents.SetPrimaryFailed`, then refetch anyway |
| Second mutation while one is in flight | `Documents.Busy` |
| `set-active` rejects | `Documents.SwitchFailed`; `selectedId` resets to the active id; sheet stays open |
| `set-active` succeeds, `fetchNewAccessToken()` fails | `Documents.SwitchNeedsRelogin`; sheet closes; list refetches |

Two rows deserve their reasoning stated:

**Keeping rows on a failed refetch.** Every mutation here ends in a refetch, and
`useAsyncFetch` swallows its own errors rather than rethrowing, so a trailing
refetch can fail while a perfectly good list is on screen. Replacing the list with
an error pane would throw away what the traveller was reading because a background
call failed. Same treatment `CardsScreen` already applies, for the same reason.

**`SwitchNeedsRelogin` as its own message.** This is the one state web cannot
reach, because there the refresh happens server-side within the same request
cycle. On mobile the POST can succeed and the token exchange can then fail, which
leaves the account switched while the session still carries the old claim.
Reporting that as "switch failed" would be actively wrong — the traveller would
retry a switch that already happened. The message tells them to sign in again.

**`set-primary` refetches even on failure.** The failure may be partial or the
local list may already be stale; refetching guarantees the screen shows what the
server holds rather than an optimistic guess.

## Localization

New keys under `MobileApp.Documents.*` in `localization/resources/en-US.json` and
`tr-TR.json`, then `npm run init` to regenerate the bundles. `*.gen.json` is never
edited directly.

| Group | Keys |
| --- | --- |
| Page chrome | `Title`, `Description`, `Empty`, `EmptyDescription` |
| Add | `AddDocument`, `Added`, `Updated`, `AddFailed`, `AddNotPermitted` |
| Primary | `Primary`, `SetPrimary`, `SetPrimarySuccess`, `SetPrimaryFailed` |
| Active | `InUse` |
| Switcher | `Switch.Title`, `Switch.SwitchTo`, `Switch.Switching`, `SwitchSuccess`, `SwitchFailed`, `SwitchNeedsRelogin` |
| Shared | `LoadFailed`, `Retry`, `Busy` |
| Enums | `EvidenceLevel.{None,Low,Medium,High}`, `Type.{Passport,IdCard,DriverLicense,ResidencePermit,HealthInsurance}` |

`Switch.SwitchTo` interpolates the identification number.

All five `IdentificationType` members get a key even though only Passport and
IdCard get distinct icons (`BookUser` / `LucideIdCard` on web → Ionicons
equivalents here). An unmapped value would otherwise render a raw enum string in
front of the traveller. Unmapped types fall back to the passport icon.

Both locales are authored in the same change — a missing `tr-TR` key falls back to
`en-US` silently, so it would ship untranslated without failing anything.

## Changes by file

1. **`store/user.types.ts`** — add `TravellerDocumentId?: string[] | string` to
   `JwtUser`.
2. **`utils/traveller.ts`** — add `getTravellerDocumentIdFromClaims`.
3. **`actions/TravellerService/post.ts`** *(new)* — `postProveDocumentApi`,
   `postSetPrimaryDocumentApi`, `postSetActiveDocumentApi`.
4. **`hooks/useDiditVerify.tsx`** *(new)* — `verify(action)` extracted verbatim.
5. **`hooks/useTravellerDidit.tsx`** — consume `useDiditVerify`; drop the local
   `verify` and the imports it alone needed. All three exported flows and `isBusy`
   keep their current signatures.
6. **`screens/traveller/Documents/openDocuments.ts`** *(new)* — `DOCUMENTS_HREF`,
   `openDocuments()`.
7. **`screens/traveller/Documents/useTravellerDocuments.ts`** *(new)*.
8. **`screens/traveller/Documents/_components/DocumentCard.tsx`** *(new)*.
9. **`screens/traveller/Documents/DocumentsScreen.tsx`** *(new)*.
10. **`screens/traveller/Documents/useDocumentSwitcher.ts`** *(new)*.
11. **`screens/traveller/Documents/_components/DocumentSwitcherSheet.tsx`** *(new)*.
12. **`screens/traveller/Home/_components/ActiveDocumentPill.tsx`** *(new)*.
13. **`templates/TabPage.tsx`** — optional `headerAccessory` prop.
14. **`screens/traveller/Home/HomeScreen.tsx`** — pass `<ActiveDocumentPill />` as
    `headerAccessory`.
15. **`app/(auth)/profile/documents.tsx`** *(new)* — route wrapper.
16. **`app/(auth)/profile/_layout.tsx`** — register `documents`.
17. **`screens/traveller/Profile/ProfileScreen.tsx`** — Documents row after Payout
    Methods, `icon: "document-text-outline"`, `onPress: openDocuments`.
18. **`localization/resources/{en-US,tr-TR}.json`** — the new keys; `npm run init`.

## Testing

`npm test` (Jest + `jest-expo`) green, `npm run lint` clean, and the app builds on
both Android and iOS — per `AGENTS.md`, zero failing tests and zero build errors
before a PR.

**`utils/__tests__/traveller.test.ts`** — `getTravellerDocumentIdFromClaims` for
the string claim, the array claim (returns the first element), an empty array,
`undefined` `jwtUser`, and an absent claim. The array case is the one a naive
implementation gets wrong, and it is the shape ABP actually emits for a traveller
with more than one document.

**`screens/traveller/Documents/__tests__/useTravellerDocuments.test.ts`** —
`addDocument` across all five branches:

- `verify` returns `null` → `postProveDocumentApi` never called, no refetch
- `postProveDocumentApi` rejects → failure toast, list unchanged
- returned `travellerDocumentId` absent from the pre-call list → *added* toast
- returned `travellerDocumentId` present in the pre-call list → *updated* toast
- refetch after a successful prove is awaited before the toast fires
- `canAdd` false → `addDocument` runs no Didit verification at all

Plus `setPrimary`: happy path refetches and toasts; a second call while
`pendingId` is set produces the busy toast and no second request; a rejection
still refetches.

**`screens/traveller/Documents/__tests__/useDocumentSwitcher.test.ts`** —
`switchTo` calls `postSetActiveDocumentApi` then `fetchNewAccessToken`, in that
order; a POST rejection resets `selectedId` to the active id and does not refresh
the token; a POST success with a `fetchNewAccessToken` failure yields the relogin
message and not the failure message.

**`screens/traveller/Documents/__tests__/openDocuments.router.test.tsx`** —
pushes `/(auth)/profile/documents`, mirroring the existing
`Cards/__tests__/openCards.router.test.tsx`.

**`screens/traveller/Home/__tests__/ActiveDocumentPill.test.tsx`** — renders null
and issues no fetch with no claim; renders a non-pressable label with one
document; renders a pressable pill with two.

**Manual checks:**

- Profile → Documents lists the account's documents with correct Primary and
  in-use badges; back returns to Profile.
- Add document with a passport already on the account → *updated*, evidence badge
  reflects the new level, no duplicate row.
- Add document with a document not on the account → new row appears.
- Cancel the Didit sheet mid-flow → no toast, no list change.
- An account without the `ProveDocument` grant sees the Add button disabled with
  the not-permitted copy, and cannot start a Didit run.
- Set primary on a second document → badge moves, previous primary loses it.
- Home pill absent for a staff login; a plain label for a single-document
  traveller; a working sheet for a multi-document traveller.
- Switch active → pill updates without an app restart, and a subsequent tag or
  refund request carries the new document.
- Airplane mode on the Documents page → load-failed pane with a working Retry.
- Both locales render every new string.

## Non-goals

- No backend change. Every endpoint used here already exists in the generated SDK.
- No regeneration of `src/saas/**`.
- No change to how `utils/card/traveller-id.ts` resolves the traveller id — it
  keeps its existing claim-then-affiliations fallback.
- No caching of the affiliations list across surfaces. The two hooks each fetch;
  the shared value that matters is the JWT claim.
