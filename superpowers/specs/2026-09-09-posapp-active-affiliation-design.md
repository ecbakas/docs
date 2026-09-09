# SP2: active affiliation as the source of truth — pos-app

**Date:** 2026-09-09
**Repo:** `pos-app` (`unirefund-pos`)
**Branch point:** `feat/session-boundary-hygiene` (SP1) — **not `main`**; this depends on SP1's `resetSessionData` and `setActiveUserId`
**Program:** [2026-09-09-posapp-parity-program-design.md](2026-09-09-posapp-parity-program-design.md) — sub-project 2 of 7
**Covers:** the rest of T1 (reload product groups on every login) and the correctness half of T7 (affiliation switcher)

## Goal

The app always knows which merchant it is acting as, and merchant-scoped data —
merchant detail, product groups, tags — is refetched whenever that changes.

## Why

T1 asked for product groups to reload on login. They cannot, because **the app
does not know which merchant to load them for.**

Two independent bugs produce that.

**The acting merchant is a list index.** `MerchantProvider.getTravellerData`
picks it blind:

```ts
const idToUse = merchantList?.items?.[0]?.id || "";
```

A cashier affiliated with three stores gets whichever the API happened to
return first — and it decides the merchant every tag is created against, since
`createSale` reuses the cached `merchantInfo`.

**The active affiliation is read from a claim that lags.** `SignalrProvider`
derives it from the JWT:

```ts
const selectedAffiliationId = useMemo(() => {
  const merchantId = user?.jwtUser?.MerchantId;
  if (!merchantId) return null;
  if (Array.isArray(merchantId)) return merchantId[0] || null;
  return merchantId;
}, [user?.jwtUser?.MerchantId]);
```

super-app hit this and documented it in
[`useActivePartyId`](../../../super-app/src/hooks/useActivePartyId.ts): the
token minted by the refresh straight after `SetActiveAffiliation` still carries
the **previous** party's claim, verified on device. `isPrimary` on the
affiliation list moves server-side the moment the switch lands, so that is the
source of truth. The claim is only useful as a fallback for the window before
the list arrives.

The `Array.isArray(...) ? [0]` branch above is the same bug twice over: for a
multi-party account ABP repeats the claim, and claim order does not say which
one is active.

**And nothing merchant-scoped refetches on a switch.** `MerchantProvider`'s
fetch is `useEffect(..., [])` — mount only — and `changeAffiliation` does not
remount it. So after a switch, `merchantId`, `merchantInfo`, `productGroups` and
`tags` all still describe the previous store, indefinitely.

## Decisions

1. **`isPrimary` first, claim as fallback.** Ported from super-app, minus the
   party types pos-app has no surface for: its `JwtUser` carries only
   `MerchantId`, so there is no Customs or RefundPoint branch to port.
2. **Affiliation state moves out of `SignalrProvider` into its own provider.**
   Today `connectToSignalR` both fetches the affiliation list and opens the
   socket, keyed on `selectedAffiliationId`. Once the active id is *derived
   from* that list, leaving them together is a cycle: list → active id →
   connect → list. The extraction is what breaks it, not a tidiness exercise.
3. **The merchant list stays, and the active party selects from it.** Rather
   than calling `getMerchantsByIdApi(activePartyId)` directly, keep today's
   `getMerchantsApi()` and pick `items.find(m => m.id === activePartyId)`,
   falling back to `items[0]`. Two reasons: a `partyId` whose `partyType` is not
   a merchant would otherwise be sent to a merchant endpoint, and a POS that
   cannot resolve its merchant cannot sell anything — so the old behaviour
   survives as an explicitly-labelled degraded path rather than as the primary
   one.
4. **A switch clears the cart and the scanned card.** Cart items carry
   `productGroupId` values belonging to the *previous* merchant; submitting them
   against the new one would post wrong data. This is the same hazard as T2 at a
   different boundary.
5. **The switch result is surfaced but not yet rendered.** `changeAffiliation`
   starts returning `{ok, message?}` instead of `Promise<void>`, so a failure is
   observable. Presenting it is SP7's job, along with the rest of the switcher
   UI. Adding user-facing copy here would pull `npm run init` — which reads
   `.env` and fetches ABP localization — into a sub-project that otherwise needs
   no new keys.
6. **The redundant socket teardown inside `changeAffiliation` goes away.** The
   connect effect is already keyed on `selectedAffiliationId` and its cleanup
   stops the connection, so a switch tears down and reconnects on its own. The
   manual `stop()` inside the switch handler is a second mechanism for the same
   thing.

## Design

### 1. `src/hooks/useActivePartyId.ts` — new

```ts
export function useActivePartyId(
  affiliations: GetApiCrmServiceUserAffiliationsResponse,
): string | null
```

- `affiliations.find((a) => a.isPrimary)?.partyId` when present.
- Otherwise the JWT `MerchantId` claim: a bare string as-is; an array matched
  against the affiliation list rather than trusted by order, with `claim[0]` as
  the last resort.
- `null` when neither is available.

Pure and hook-only so it can be tested without a provider.

### 2. `src/providers/AffiliationProvider.tsx` — new

Owns the list, the active party and the switch. Context:

```ts
type AffiliationSwitchResult = { ok: boolean; message?: string };

type AffiliationContextType = {
  affiliations: GetApiCrmServiceUserAffiliationsResponse;
  selectedAffiliationId: string | null;
  changeAffiliation: (partyId: string) => Promise<AffiliationSwitchResult>;
  switchingPartyId: string | null;
};
```

Four members, not six: an `isLoading` flag and a public `reload` have no caller
in this sub-project — `changeAffiliation` reloads internally — and SP7 can add
whichever it actually needs.

`loadAffiliations` calls `getUserAffiliationsApi()` and reads the `ApiResult`
envelope — `result.success && result.data`, not a `try`/`catch`, which pos-app's
`fetchRequest` never triggers. Runs once on mount.

`changeAffiliation(partyId)`:

1. No-op when a switch is in flight or `partyId` is already active.
2. `postSetActiveAffilationApi({ partyId })` — on `!success`, return
   `{ok: false, message}` without touching any state.
3. `fetchNewAccessToken()` so every later request carries the switched session.
4. `loadAffiliations()` — the copy in state still marks the party just switched
   away from, and `isPrimary` is what names the active one.
5. Clear the cart, the scanned card and merchant-scoped data (decision 4).
6. Return `{ok: true}`.

`switchingPartyId` rather than a boolean, so SP7 can show which row is in
flight.

### 3. `src/store/merchant.ts` — one new action

`clearMerchantData()`: clears `merchantId`, `merchantInfo`, `productGroups`,
`tags`, `tagDetails`, `tagCount`, `error` and sets `isLoading` true. It keeps
`activeUserId`, `preferencesByUser` and `preferenceDefaults`.

SP1's `resetSessionData()` is then exactly `clearMerchantData()` plus
`activeUserId: null`, and is re-expressed that way so the two cannot drift. This
distinction matters: a session boundary forgets who is signed in, an affiliation
switch does not — and clearing `activeUserId` on a switch would silently drop
the cashier's preferences.

### 4. `src/providers/MerchantProvider.tsx` — key the fetch off the active party

- Reads `selectedAffiliationId` from `useAffiliation()`.
- `getTravellerData` takes the active party id and selects the merchant from the
  list per decision 3.
- The effect becomes `useEffect(..., [selectedAffiliationId])`, replacing the
  mount-only `[]`. It returns early while the id is `null` so it does not fire a
  merchant fetch before the affiliation list has arrived.

This is the line that closes T1: login mounts the provider with a resolved
active party, and a switch re-runs it.

### 5. `src/providers/SignalrProvider.tsx` — consume, don't own

- `affilations`, `selectedAffiliationId`, `changeAffiliation` and
  `changingAffiliation` leave `SignalRContextType`; `selectedAffiliationId`
  comes from `useAffiliation()`.
- `connectToSignalR` no longer calls `getUserAffiliationsApi`.
- The connect effect's cleanup also clears `devices`: they belong to the party
  whose socket just closed.
- `setChangingAffiliation(false)` inside the connect success path goes with it.

### 6. `src/app/(auth)/_layout.tsx` — provider order

`AffiliationProvider` must sit above `MerchantProvider`, which now depends on
it, and `SignalrProvider` stays innermost:

```
AffiliationProvider > MerchantProvider > SignalrProvider > Stack
```

### 7. `src/screens/(auth)/ConnectedDevices/_components/AffilationSwitch.tsx`

Swap `useSignalR()` for `useAffiliation()` and `changingAffiliation` for
`switchingPartyId !== null`. No visual change — SP7 replaces this component
wholesale.

## Testing

New — `src/hooks/__tests__/useActivePartyId.test.ts`:

- prefers `isPrimary` over the JWT claim, including when the claim names a
  different party
- falls back to a bare string claim when no affiliation is primary
- resolves an array claim against the affiliation list rather than by order
- falls back to `claim[0]` when no array entry matches
- returns `null` with neither a primary nor a claim
- returns `null` for an empty affiliation list and no claim

New — `src/providers/__tests__/AffiliationProvider.test.tsx`:

- loads affiliations on mount and publishes the primary as active
- a switch posts, refreshes the token, then reloads the list — asserted in that
  order, since a reload before the refresh would read the old session
- tracks the switch in `switchingPartyId` and clears it afterwards
- a failed post returns `{ok: false}` with the server's message and does **not**
  refresh the token or reload
- a switch for the already-active party makes no request
- a switch clears the cart and the scanned payout card
- a switch preserves `activeUserId` and the user's preferences — the regression
  that would defeat T8 from this direction

New — `src/providers/__tests__/MerchantProvider.test.tsx`:

- selects the merchant matching the active party, not the first in the list
- refetches merchant detail and product groups when the active party changes
- fires no merchant fetch while the active party is `null`
- falls back to the first merchant when the active party matches none, and does
  not leave the app without a merchant

Extended — `src/store/__tests__/merchantPreferences.test.ts`:

- `clearMerchantData` preserves `activeUserId` where `resetSessionData` clears it

## Risks

**The `partyId` → merchant-id assumption.** Decision 3's `find` is what keeps
this safe: if a `partyId` is not a merchant id, the lookup misses and the
fallback runs, which is today's behaviour. Nothing is sent to a merchant
endpoint that did not come out of the merchant list.

**A switch now clears the cart.** Deliberate (decision 4), but it is a
user-visible behaviour change: a half-built sale does not survive changing
store. The alternative — carrying product groups from one merchant into a tag
issued by another — is worse.

**`MerchantProvider`'s effect gains a dependency.** A `selectedAffiliationId`
that changes identity without changing value would refetch on a loop. It is a
`string | null` derived through `useMemo`, so this is safe by type, and the
early return on `null` covers the pre-load window.

## Out of scope

The switcher's UI, its error presentation and its trigger placement are SP7.
This sub-project leaves `AffilationSwitch` looking exactly as it does today,
wired to a source of truth that is now correct.
