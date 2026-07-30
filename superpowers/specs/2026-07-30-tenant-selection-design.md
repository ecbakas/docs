# Tenant selection: one source of truth

**App:** super-app
**Date:** 2026-07-30

## Problem

On the staff login screen the selected tenant sometimes has to be changed and set
back before login works. The workaround succeeds because it rewrites
AsyncStorage, which is what login actually reads — the screen and the request
were reading two different things.

Four independent defects produce the symptom.

### 1. Logout wipes storage but not memory

`signOut()` calls `AsyncStorage.clear()`, removing `debug_tenantId` and
`debug_environment`, but never resets the `tenantId` / `environment` React state.
`SessionProvider` sits above the router, so it is not remounted on logout.

The login screen therefore shows tenant X and environment `live` while storage
holds no tenant and no environment. `loginWithCredentials` reads
`getStoredTenantId()` and `getApiUrl()` reads `getStoredEnvironment()`, so the
request goes to the **`dev` gateway with no `__tenant` header** and comes back
"Invalid username or password!". Changing the tenant and setting it back rewrites
storage, which is the reported workaround.

`AsyncStorage.clear()` also wipes `theme_preference` and `locale`, so logout
silently resets the user's language and theme.

`signOut()` also never calls `setAccessToken(null)`, leaving the dead token
exposed as `session` (consumed by `AvatarModal`).

### 2. Cold start deletes the saved tenant

The `didInitEnvRef` guard on the environment-change effect is consumed by the
mount render, before the async bootstrap applies the stored environment. When the
stored environment is not `dev`, applying it fires the effect a second time,
which clears the tenant from state *and* storage — deleting the selection that
was just restored.

### 3. The Picker can display a lie

`selectedValue={tenantId}` against a list that loads asynchronously and is
filtered in the screen (`e2e`, `manual-`, `manuals`). When the id has no matching
item, Android's native Picker renders item 0 — "Without Tenant" — while state
still holds the id. The tenants cache key is not environment-scoped either, so a
cold start can show another environment's tenants.

### 4. Two sources of truth

`utils/environment.ts` documents itself as the single source of truth for the
persisted environment and tenant, but `SessionProvider` writes the raw
`"debug_tenantId"` key directly and stores `""` instead of removing the key.
Login reads storage rather than the state the user sees. That gap is what makes
defects 1 and 2 possible at all.

## Scope

- Correctness: the tenant the screen shows is always the tenant the request uses.
- Selector UX: replace the Picker with a searchable list showing resolved names.
- A tenant is required for staff login.
- The debug menu stops maintaining a parallel copy of the same state.

**Logout semantics:** the tenant is cleared in state and storage; the
environment is kept, so the next login targets the gateway the tester was already
on.

**Assumption:** host/admin users can no longer sign in from the staff screen.
Staff accounts are provisioned per tenant, hosts administer via the portal, and
the traveller screen remains the tenant-less login path. No debug escape hatch —
a toggle that clears the tenant while login requires one is a trap.

## Architecture

Selection moves out of `SessionProvider` into a dedicated store, following the
existing pattern (`user.ts`, `tag.ts`, `pendingScan.ts` — plain `create()`, no
`persist` middleware, so the existing `debug_tenantId` / `debug_environment` keys
are kept and existing installs do not reset).

### `src/store/tenant.ts`

```ts
type TenantOption = { id: string; name: string };

interface TenantStore {
  environment: AppEnvironment;
  tenantId: string | null;        // null = no tenant
  tenants: TenantOption[];        // unfiltered: public list + manual, active env
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;

  hydrate: () => Promise<void>;                      // once, at launch
  setEnvironment: (env: AppEnvironment) => Promise<void>;
  setTenantId: (id: string | null) => Promise<void>;
  loadTenants: (opts?: { force?: boolean }) => Promise<void>;
  addManualTenant: (tenant: TenantOption) => Promise<void>;  // debug by-name
  reset: () => Promise<void>;                        // logout
}
```

The store also exports the async read API the actions layer already calls —
`getStoredTenantId()`, `getStoredEnvironment()`, `getGatewayUrl()` — with
unchanged signatures.

`status` describes the fetch lifecycle only. `error` is the single user-facing
message, and a cleared-because-missing selection (invariant 5) sets `error` while
`status` stays `"ready"` — that case is not a fetch failure.

`hydrate()` reads the persisted environment, the persisted tenant, and the
cached list for that environment. It does **not** await the network, so bootstrap
is never blocked on a tenants fetch.

`loadTenants()` is triggered by `TenantInput` on mount — cache-first, refetching
when the cached entry is older than the existing 30-minute TTL, or always when
`force`. `SessionProvider` stops fetching tenants entirely; today it fetches on
every launch even for an already-authenticated user who will never see a
selector.

### Invariants

**1. Single owner, no import cycle.** `utils/environment.ts` becomes pure
config: `AppEnvironment`, `APP_ENVIRONMENTS`, `DEFAULT_ENVIRONMENT`,
`extractApexDomain`, `buildGatewayUrl`, `ENVIRONMENT_URLS`. No state, no
AsyncStorage, and it imports nothing from the store. The store owns the storage
keys, every write, and the read API. Only the four import lines in the actions
layer move; `.claude/rules/api-actions.md` is updated to name the new path.

**2. Hydration gate.** `hydrate()` is awaited in `SessionProvider`'s bootstrap
before any API call, and the async readers await it internally. Today
`getStoredEnvironment()` re-reads AsyncStorage on every call; the gate preserves
that correctness once state is the truth. An action firing before hydration
blocks rather than silently resolving to the `dev` default.

**3. Environment change is event-driven.** `setEnvironment()` persists the
environment, clears the tenant, then reloads the list. The `didInitEnvRef` effect
is deleted — **defect 2 gone** — per `.claude/rules/avoid-use-effect.md`.

**4. The list cache is per environment** (`public_tenants_cache_v2:<env>`), so a
cold start cannot show another environment's tenants. Each entry holds
`{ timestamp, items, manual }` — `items` from the public endpoint, `manual` from
the debug by-name lookup. `tenants` is `items` concatenated with `manual`, which
is how a manually resolved tenant survives `loadTenants({ force: true })` without
needing a per-item flag.

**5. The selection is validated against the list.** When a list loads
**successfully** and lacks the persisted id, the store clears the selection and
sets `error`. A *failed* fetch never clears a selection. The `e2e` / `manual-` /
`manuals` filter moves out of `StaffLoginScreen` and is applied only to the login
modal's rows; `tenants` itself stays unfiltered, and name resolution and
validation always use the unfiltered list. **Defect 3 gone at the data level.**

**6. Logout resets the tenant only.** `signOut()` calls
`useTenantStore.getState().reset()` — clearing `tenantId` in state and storage,
keeping `environment` and the cached list. `AsyncStorage.clear()` is replaced by
explicit awaited clears of what logout owns: tokens, role preference, tenant,
country settings, plus `setAccessToken(null)`. **Defects 1 and 4 gone**, and
theme/locale survive.

## Staff login selector

`src/components/TenantInput/`, mirroring `CountryInput/`, because both the staff
login screen and the debug menu need tenant selection.

**`TenantInput.tsx`** — label plus a `Pressable` field with a business icon
showing the **resolved tenant name** (or "Select a tenant"), a chevron, and the
store's `error` beneath it. It renders a name, never an id, so nothing can
display "Without Tenant" while state holds something else. Calls `loadTenants()`
on mount.

Both components take `includeInternal?: boolean` (default `false`), which is the
single switch deciding whether `e2e` / `manual-` / `manuals` rows are listed. The
staff login screen leaves it off; the debug menu passes `true`. Filtering happens
only in the modal's row list — never in `tenants`, and never in the name lookup
the field renders.

**`TenantSelectionModal.tsx`** — `Modal` with `animationType="slide"`, following
`CountrySelectionModal`: header with title, close and refresh
(`loadTenants({ force: true })`, replacing the button beside the Picker), a
search `Input` (`iconName="search-outline"`), and a `FlashList` with a checkmark
on the selected row. Search is case-insensitive `includes`, not the `startsWith`
the country modal uses, so "retail" matches "Acme Travel Retail". Explicit
loading, error-with-retry, "no tenants", and "no match for '<query>'" states.

A `Modal` rather than a `@gorhom/bottom-sheet`: every gorhom sheet in this
codebase holds short static content, and a `FlashList` plus keyboard inside a
detached sheet needs `BottomSheetFlatList` and fights the sheet height.
`CountrySelectionModal` already solves search + `FlashList` + long list, and
gives more visible rows with the keyboard up. It slides up from the bottom, so
the interaction is unchanged.

**Tenant required for staff.** The `Without Tenant` option is removed and
`isSubmitDisabled = !tenantId || !email || !password`.

**Environment chips stay** as the three `live` / `uat` / `dev` chips. What
changes is that switching visibly clears the tenant and shows the list reloading,
instead of doing it through an effect that also fired on cold start.

**i18n.** The current block hardcodes "Environment", "Tenant Selection" and
"Without Tenant", violating `.claude/rules/i18n.md`. New keys go in
`src/localization/resources/{en-US,tr-TR}.json` under `MobileApp.Auth.Staff.*`
(field label, required validation) and `MobileApp.TenantSelection.*` (modal
title, search placeholder, empty and error states), then `npm run init`.

**Traveller login.** `await setStoredTenantId("")` becomes
`await useTenantStore.getState().setTenantId(null)` — same intent, but it clears
the state too, so a staff tenant cannot linger in the UI after a traveller signs
in.

## Debug menu

- Environment: the same three-chip component as the login screen. It currently
  offers only `live` / `dev`, so a tester on `uat` sees nothing selected.
- Tenant: `TenantInput` over the unfiltered list, replacing the two radio rows.
- The `setTenantId("")` piggybacked on the live chip is removed —
  `setEnvironment()` owns that.
- **Keep** the resolve-by-name lookup: it is the only way to reach a tenant
  missing from the public list, including the `e2e` / `manual-` ones. On success
  it calls `addManualTenant()`, which stores it in the cache entry's `manual`
  array, so it is selectable, displays by name, survives validation, and survives
  a forced refresh.
- Delete the "Settings will reset to defaults when app is restarted" note — it is
  false. Replace with: the environment persists, the tenant clears on logout.

## Edge cases

1. **List fetch fails with a valid tenant already persisted** — selection stays,
   login still works, modal shows error and Retry.
2. **Cold start offline** with a cached per-environment list — selection
   restores, no error.
3. **Environment switched while the modal is open** — the modal closes, since its
   list changed underneath.
4. **`hydrate()` fails** — fall back to `DEFAULT_ENVIRONMENT` and no tenant, log
   via `logger`, bootstrap continues (matching the existing catch).
5. **Two rapid environment taps** — writes are serialized, and a `loadTenants`
   result whose environment no longer matches the current one is discarded.
6. **Backend rejects the tenant at login** — unchanged; the error text from
   `loginWithCredentials` surfaces as today.

## Testing

`AGENTS.md` claims there is no automated suite, but `jest` + `jest-expo/node`
and tests across `src/utils/**` and `src/components/__tests__` exist. That claim
is corrected as part of this work.

New `src/store/__tests__/tenant.test.ts`, using AsyncStorage's official Jest
mock, one test per defect:

- `reset()` clears the tenant in state and storage and keeps the environment
  (defect 1).
- Hydrating a stored non-`dev` environment does not wipe the stored tenant
  (defect 2).
- A successful list lacking the persisted id clears it and sets `error`; a failed
  fetch leaves it alone (defect 3).
- `setEnvironment()` clears the tenant and refetches; stale-environment results
  are discarded.
- `getStoredTenantId()` awaits hydration instead of returning the default (the
  ordering that keeps the actions layer correct).
- A manually added tenant stays in `tenants` across `loadTenants({ force: true })`
  and is never cleared by validation.

Manual verification on Android and iOS per `AGENTS.md`: logout then login (the
reported bug), cold start with a `live` or `uat` tenant, environment switch,
offline start, and a traveller login after a staff session.

## Files

**New**
- `src/store/tenant.ts`
- `src/store/__tests__/tenant.test.ts`
- `src/components/TenantInput/TenantInput.tsx`
- `src/components/TenantInput/TenantSelectionModal.tsx`

**Changed**
- `src/utils/environment.ts` — reduced to pure config
- `src/providers/SessionProvider.tsx` — tenant/environment state removed;
  `hydrate()` awaited in bootstrap; explicit logout resets
- `src/screens/shared/StaffLoginScreen.tsx` — `TenantInput`, required tenant,
  i18n, shared environment chips
- `src/screens/traveller/TravellerLoginScreen.tsx` — clear via the store
- `src/app/(modals)/debug-menu.tsx` — shared chips and `TenantInput`
- `src/actions/auth/actions.ts`, `src/actions/AccountService/post.ts` — import
  the read API from the store
- `src/localization/resources/{en-US,tr-TR}.json` — new keys
- `.claude/rules/api-actions.md` — new import path for the read API
- `AGENTS.md` — correct the "no test suite" claim

## Out of scope

- Changing which tenants the backend exposes as public.
- Mobile host/admin login.
- Any other `AsyncStorage` consumer's persistence strategy.
