# Party address forms: Google Places autofill — design

- **Date:** 2026-10-07
- **Repo:** `web-app` — `apps/web`, `packages/ui`, `packages/actions`
  (`apps/ssr` is out of scope)
- **Branch:** `feat/address-google-places` off `main`, in a **new git worktree
  outside the repo**. The `C:\unirefund\web-app` checkout is on
  `feat/map-improvement`, another session's ssr work; do not switch it.
- **Status:** design approved in conversation; this document awaits review

## Goal

When a staff user types an address into a party address form, Google suggests
places. Picking one fills the rest of the address — country, province, district,
neighbourhood, address line, postal code — so the user no longer fills every
field by hand. The user can still correct any field and saves through the
existing address endpoints, as today.

## Backend contract (already deployed, already generated)

`POST /api/crm-service/addresses/resolve-google-place` —
`client.addressPlace.postApiCrmServiceAddressesResolveGooglePlace` in
`packages/saas/CRMService`. Present in the generated SDK and in dev's live CRM
swagger (checked 2026-10-07).

- **Input** `ResolveGooglePlaceInput`: `placeId` (1–255, `^[A-Za-z0-9_-]+$`),
  `sessionToken?` (≤36, same pattern).
- **Output** `ResolvedPlaceAddressDto`, every field nullable: `countryId`,
  `adminAreaLevel1Id`, `adminAreaLevel2Id`, `neighborhoodId`, `addressLine`,
  `postalCode`, `placeId`, `latitude`, `longitude`, `formattedAddress`.
- Saves nothing. A level that matches no stored row (or several) is `null`, and
  a level below an unmatched one is never matched.
- The docblock asks callers to **send `placeId`, `latitude` and `longitude`
  back with the address save**.
- **Requires permissions:** `CRMService.AddressPlaces`,
  `CRMService.AddressPlaces.Resolve` — both already in the generated
  `policies.json`. Granted per tenant through the existing role-permission
  screens; no frontend work for that.
- **Errors:** `033001` not configured (503), `033002` unknown place (404),
  `033003` Google unreachable (502), `033004` daily limit (429).
  `structuredError` keeps the code as `UniRefund.CRMService:0330xx`.

There is **no autocomplete endpoint**. The backend only resolves a place the
user has already picked, so the as-you-type suggestions come from Google through
this app.

## Decisions

| Question                    | Decision                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where suggestions come from | A guarded **Next.js route handler** in `apps/web` proxies Google Places Autocomplete (New) with a server-only, runtime `GOOGLE_PLACES_API_KEY`. The key never reaches the browser; no build arg.  |
| Where the search lives      | **Address line is the search input** and moves to the top of the address section. Picking a suggestion fills every field; ignoring the suggestions leaves the typed text as a plain address line. |
| Which forms                 | All 12 that render `createAddressWidgets` (listed below)                                                                                                                                          |
| Where errors show           | Inline text under Address line, not a toast                                                                                                                                                       |
| Error texts                 | Our own keys in the Default `en`/`tr` resources — the backend's `tr` texts are still English, and its 033004 text carries a `{limit}` the client cannot fill                                      |

Google's own JS Autocomplete widget is ruled out: its session token is opaque, so
it cannot be handed to the backend's resolve call. The REST API takes a
caller-generated string, which is what the backend's `sessionToken` pattern
(≤36, URL-safe base64 alphabet) expects.

## Flow

1. The user types in Address line. At 3+ trimmed characters, after a 300 ms
   debounce, the search hook starts a session if none is open
   (`crypto.randomUUID()`) and calls
   `POST /api/address-places/autocomplete` with
   `{ input, sessionToken, languageCode, regionCode? }`.
   - `languageCode` — the route's `lang`.
   - `regionCode` — `code2` of the country already selected in the form, when
     there is one. It **biases** results and does not restrict them. It matters
     because the proxy calls Google from the server's IP, so Google cannot bias
     by the user's location.
   - A newer keystroke aborts the previous request (`AbortController`).
2. The route answers `{ suggestions: { placeId, mainText, secondaryText }[] }`.
3. The user picks a suggestion. The hook calls
   `postResolveGooglePlaceApi({ requestBody: { placeId, sessionToken } })` and
   retires the token; the next keystroke opens a new session.
4. On success the widget layer calls the form's `place.onResolved(dto)`. The form
   merges the result into its address with `setForm`. Because the widgets get
   the **live** address as `initialValue`, the province, district and
   neighbourhood lists load and the comboboxes show the resolved values.

## Components

### Route handler — `apps/web/src/app/api/address-places/autocomplete/route.ts` (new)

- `POST` only; `runtime = "nodejs"`, `dynamic = "force-dynamic"` declared as
  literals (as in `api/document-extraction/route.ts`).
- `guardRoute(["CRMService.AddressPlaces", "CRMService.AddressPlaces.Resolve"])`
  first — the route spends the same Google quota as resolve, so it is gated on
  the same pair. `/api` is outside the `proxy.ts` matcher, so there is no locale
  redirect.
- Validates the body; `400` on a bad shape.
  - `input`: string, trimmed length 3–200.
  - `sessionToken`: `^[A-Za-z0-9_-]{1,36}$`.
  - `languageCode`: `^[a-z]{2}(-[A-Z]{2})?$`, optional.
  - `regionCode`: `^[A-Za-z]{2}$`, optional.
- Missing `GOOGLE_PLACES_API_KEY` → `503 { code: "not-configured" }`.
- Calls `POST https://places.googleapis.com/v1/places:autocomplete` with
  `X-Goog-Api-Key`, a field mask of
  `suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat`,
  and a 5 s timeout. A Google error or timeout → `502 { code: "unavailable" }`.
  Google's error body is not forwarded.
- Parsing the body and shaping Google's response are pure functions in
  `apps/web/src/utils/address-places.ts` (+ `.test.ts`).

### Action — `packages/actions/unirefund/CRMService/post-actions.ts`

`postResolveGooglePlaceApi(data: PostApiCrmServiceAddressesResolveGooglePlaceData, session?)`
→ `client.addressPlace.postApiCrmServiceAddressesResolveGooglePlace(data)`, then
`structuredResponse`; the catch **returns** `structuredError`
(per `.claude/rules/api-actions.md`).

### Widget layer — `packages/ui/src/components/address/`

- **`types.ts`**: `AddressLookupGrants` gains `placeSearch?: boolean`;
  `AddressLanguageData` gains the `placeSearch.*` keys below. New types:
  - `PlaceSuggestion { placeId; mainText; secondaryText }` — the route's
    response conforms to it;
  - `PlaceErrorKind = "notConfigured" | "dailyLimit" | "unknownPlace" |
"unreachable" | "suggestions" | "denied" | "other"`;
  - `AddressPlaceHandlers { onResolved(dto), onAreaChange(), classifyError({ code?, status? }): PlaceErrorKind }`
    — implemented in `apps/web`, where it is unit-tested; `packages/ui` has no
    test runner, so it holds only the types and the behaviour per kind.
- **`use-place-search.ts`** (new): the session token, suggestions, the pending
  pick, the inline error and the search-off switch. Called **inside
  `AddressWidgets(...)`**, which runs as part of the form component's render,
  so this state lives in the form component. It cannot live in the widget:
  `SchemaForm` remounts whenever `schemaFormKey` changes, which a pick
  guarantees by loading new lists.
- **`address-line-search.tsx`** (new): the `addressLineWidget`. An input styled
  like the other fields with a popover suggestion list (keyboard: up, down,
  Enter, Escape).
  - Every keystroke still calls `widget.onChange(text)`, so free text keeps
    working.
  - The list ends with the attribution **Google Maps**, as a constant — Google
    forbids localizing or re-casing it — in Roboto/sans-serif, weight 400,
    12 px, `#5E5E5E` on light and `#FFFFFF` on dark (the colours Google's text
    attribution rules allow).
  - `data-testid="${id}-search"` on the input; list items carry one too.
  - Without `grants.placeSearch`, or once search is switched off, it renders the
    same plain input as today.
- **`address-form-widgets.tsx`**:
  - `createAddressWidgets({ languageData, grants, place?: AddressPlaceHandlers })`.
    Without `place`, the address line widget is today's plain input.
  - `place.onAreaChange` fires from the existing country, province and district
    change handlers. Those run only on a user's pick in a combobox, never on a
    prefill.
  - The search hook takes `regionCode` from the `countries` list it already
    holds (`code2` of `initialValue.countryId`).
  - Returns `addressLineWidget` alongside the four existing widgets.

### `apps/web` rules — `parties/_components/address-place.ts` (new, + `.test.ts`)

- `applyResolvedPlace(address, dto, { neighborhoods })` → a new address object
  (rules below).
- `clearPlace(address)` → the address without `placeId`, `latitude` and
  `longitude`.
- `placeErrorKind({ code?, status? })` → `PlaceErrorKind` for both sources: the
  resolve action's `structuredError` (`UniRefund.CRMService:0330xx`, matched on
  the suffix, falling back to the status) and the proxy's own
  `not-configured` / `unavailable` codes. Table under **Errors**.
- `useAddressPlaceHandlers(updateAddress, lookupGrants)` →
  `AddressPlaceHandlers | undefined` (`undefined` without `placeSearch`).
  `updateAddress` is `(fn: (address) => address) => void`, so it serves both the
  Addresses tab (the form _is_ the address) and the create forms (the address is
  `form.address`). Each form adds one line.

### `party-grants.ts`

- `ADDRESS_PLACE_RESOLVE = ["CRMService.AddressPlaces", "CRMService.AddressPlaces.Resolve"] as const satisfies readonly Policy[]`.
- `addressLookupGrants()` returns
  `placeSearch: isActionGranted(ADDRESS_PLACE_RESOLVE, policies) && isActionGranted(COUNTRY_LOOKUP, policies)`.
  No form computes the grant itself. A prefill writes a country id, which
  needs the country list to display.

### The 12 forms

Under `apps/web/src/app/[lang]/(main)/(unirefund)/parties/`:

- `_components/contact/address-form.tsx` — `CreateForm` and `EditForm`
- `merchants/_components/merchant-form.tsx`, `sub-merchant-form.tsx`
- `refund-points/_components/refund-point-form.tsx`, `sub-refund-point-form.tsx`
- `customs/_components/custom-form.tsx`, `sub-custom-form.tsx`
- `tax-offices/_components/tax-offices-form.tsx`, `sub-tax-offices-form.tsx`
- `tax-free/_components/tax-free-form.tsx`, `sub-tax-free-form.tsx`
- `tour-guides/_components/tour-guide-form.tsx`

Each gets:

- `addressLine: { "ui:widget": "addressLineWidget", … }`, and `"ui:order":
["addressLine", "*"]` on the address (sub-)schema.
- `place: useAddressPlaceHandlers(…)` passed to `createAddressWidgets`.
- In `contact/address-form.tsx` only: the live `form` as `initialValue` —
  `CreateForm` passes none today and `EditForm` passes the static `row`, so a
  prefill there would never load the dependent lists.

## Field rules

- **A pick overwrites** `countryId`, `adminAreaLevel1Id`, `adminAreaLevel2Id`,
  `neighborhoodId`, `addressLine`, `postalCode`, `placeId`, `latitude`,
  `longitude`. It keeps `type`, `isPrimary` and every id.
- **A `null` level becomes `EMPTY_GUID`**, so the user picks it by hand; the
  existing required-field validation blocks the save until they do. Every level
  below a `null` one is also `EMPTY_GUID`.
- **A `null` `addressLine` keeps what the user typed.** A `null` `postalCode`
  clears the field.
- **`neighborhoodId` is never written** when the neighbourhood lookup is not
  granted — the field is not in the form.
- **Stale map data:** a by-hand change of country, province or district clears
  `placeId`, `latitude` and `longitude` — the pin would otherwise point
  elsewhere. Editing address line or postal code keeps them, which covers adding
  a flat or door number.
- `placeId`, `latitude`, `longitude` stay out of the visible form (current
  `filter` exclude) but must reach the save body. Reading `SchemaForm`, nothing
  strips them (no `omitExtraData`; the `additionalProperties` keyword is removed
  before ajv's `removeAdditional`). **Verify on a real save**, including the
  customs, tax-offices and tour-guides forms, whose `runtimeDependencyConfig`
  runs `cleanFormDataForSubmit`. If either drops them, switch those three fields
  from `exclude` to `"ui:widget": "hidden"`.

## Errors

Shown as destructive text under Address line; the next keystroke clears it.

| Case                                                        | Kind            | Message                           | Afterwards                                          |
| ----------------------------------------------------------- | --------------- | --------------------------------- | --------------------------------------------------- |
| resolve `033001` (503), or the proxy's `not-configured` 503 | `notConfigured` | `placeSearch.error.notConfigured` | search off for this form; plain input keeps working |
| resolve `033004` (429)                                      | `dailyLimit`    | `placeSearch.error.dailyLimit`    | search off for this form                            |
| resolve `033002` (404)                                      | `unknownPlace`  | `placeSearch.error.unknownPlace`  | session retired; search stays on                    |
| resolve `033003` (502)                                      | `unreachable`   | `placeSearch.error.unreachable`   | retry allowed                                       |
| proxy `unavailable` 502, network error, timeout             | `suggestions`   | `placeSearch.error.suggestions`   | typed text untouched                                |
| `401` / `403` from either call                              | `denied`        | `placeSearch.error.denied`        | search off for this form                            |
| anything else from resolve                                  | `other`         | the backend's `message`           | retry allowed                                       |

## Localization

Default resource (`apps/web/src/language-data/core/Default/resources/{en,tr}.json`),
beside the existing `country.*` widget keys — the Addresses tab passes
`DefaultResource` and the create forms pass `CRMServiceResource`, which already
includes Default:

`placeSearch.searching`, `placeSearch.noResults`, `placeSearch.resolving`,
`placeSearch.error.notConfigured`, `placeSearch.error.unknownPlace`,
`placeSearch.error.unreachable`, `placeSearch.error.dailyLimit`,
`placeSearch.error.suggestions`, `placeSearch.error.denied`.

The `Google Maps` attribution is deliberately not a key.

## Configuration and ops

- `GOOGLE_PLACES_API_KEY` — `apps/web` **runtime** env, read only in the route
  handler. Add it to `apps/web/.env.example` and `docs/deployment.md`; set it in
  Coolify per environment. **Not** a Docker build arg.
- The key must belong to the **same Google Cloud project** as the backend's key.
  Otherwise the shared session token does not link the autocomplete requests to
  the backend's place lookup, and each autocomplete request bills on its own.
- Restrict it to the Places API (New) and the servers' egress IPs, not to HTTP
  referrers — it is used server-side.

## Testing and verification

- **TDD** (`pnpm --filter web test:unit`):
  - `applyResolvedPlace` — `null` levels and cascade, the neighbourhood grant,
    keeps `type`/`isPrimary`, keeps typed text on a `null` line;
  - `clearPlace`;
  - `placeErrorKind` — every code, the status fallback, the code prefix, the
    proxy's own codes, 401/403;
  - the route's body parser and the shaping of Google's response.
- **Gates**, against the AGENTS.md baselines: `type-check` (2 known errors),
  `lint` (0 errors), `test:unit`, `policy:audit`, `i18n:missing`, `grid:keys`
  (red at HEAD, unchanged).
- **Live** in a local `apps/web`:
  - the address line and dropdown render; no-grant users see today's input;
  - `placeId`/`latitude`/`longitude` reach the save request body;
  - whether dev's backend has a Google key (a resolve call tells: 033001 or
    not).
- **Without a Google key locally, only the `not-configured` path can be verified
  end to end.** Real suggestions need a key in `apps/web/.env.local` (never
  committed), or the user's own test.

## Out of scope

- `apps/ssr`, and the traveller address form (`travellers/.../contact/address-form.tsx`
  uses TravellerService DTOs and does not render the address widgets).
- A map preview or pin picker.
- The unused `CascadingAddressField`.

## Notes for the backend

- Google's terms exempt **`placeId`** from caching limits but **not
  latitude/longitude**. The backend asks for both to be saved with the address;
  whether that storage is within the Maps Platform terms is the backend's call,
  not this change's.
