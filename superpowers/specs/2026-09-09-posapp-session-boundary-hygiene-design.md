# SP1: session boundary hygiene — pos-app

**Date:** 2026-09-09
**Repo:** `pos-app` (`unirefund-pos`)
**Branch point:** `bff7134` (`main`)
**Program:** [2026-09-09-posapp-parity-program-design.md](2026-09-09-posapp-parity-program-design.md) — sub-project 1 of 7
**Covers:** T2 (clear the cart on login/logout), T8 (per-user device settings), and the storage half of T1

## Goal

A session boundary leaves nothing of the previous user behind, and two cashiers
sharing one terminal each keep their own preferences.

## Why

Three defects, all from the same cause: the app treats a logout as a process
restart, and it is not one.

**Zustand stores are module singletons.** `RootNavigator` gates `(auth)` on
`Stack.Protected guard={!!user?.userId}`, so signing out unmounts the
authenticated tree — but the stores it read survive. `signIn` resets nothing:

```ts
const signIn = useCallback(async (email: string, password: string) => {
  return loginWithCredentials(email, password).then(async (data) => {
    if (typeof data === "string") return data;
    await saveToken(data.access_token, "access");
    await saveToken(data.refresh_token, "refresh");
    await getUserData(data.access_token);
  });
}, []);
```

So user A's cart (`useTravellerStore.items`) is still in memory when user B
lands on the sale screen. `usePayoutStore.payoutCard` is worse: it holds a
scanned refund card, and its own docblock says "In-memory only; cleared once
the sale completes" — but nothing clears it if the sale never completes, so a
raw PAN can outlive the session that captured it.

**`signOut` is a blunt instrument.** It wipes every AsyncStorage key rather
than the ones it owns:

```ts
const signOut = useCallback(() => {
  clearTokens();                                                   // not awaited
  clearUser();
  useApplicationConfigurationStore.getState().clearConfiguration();
  AsyncStorage.clear();
}, [clearUser]);
```

That takes `debug_tenantId`, `app_environment`, `locale`,
`public_tenants_cache_v1` and `card-capabilities` with it — device state that
should survive, and the reason SP3 (tenant memory) cannot be built until this
changes. It also leaves `useMerchantStore`'s *in-memory* state untouched while
deleting its persisted blob, so the two disagree until the next app restart.

**`merchant-storage` mixes three lifetimes in one bucket.** Its `partialize`
persists ten fields device-globally: terminal hardware (`printerType`,
`bluetoothPrinter`, `lineLength`), user preferences (`hideSignatures`,
`afterTagCreate`, `saleScreenVersion`, `receiptTemplate`, `diditWorkflowId`),
and session identity (`merchantId`, `merchantInfo`). The last pair is the sharp
edge: `createSale` reuses cached `merchantInfo` and fetches only if it is
empty, so user B can create a tag against user A's merchant.

## Decisions

1. **The reset runs on sign-in as well as sign-out.** Sign-out alone is not
   enough — a crash, a killed process or a token revocation can end a session
   without it, so the new session must also start clean. Resetting on both ends
   is cheap and makes the guarantee independent of how the last session ended.
2. **Preferences are keyed by user id in a map, not stamped-and-discarded.**
   `cardCapabilities` uses the stamp pattern — one owner's state plus a
   `deviceKey`, discarded on mismatch — and it is wrong here. The requirement is
   that two cashiers *each keep* a setup, not that the loser's is thrown away.
3. **`merchantId` / `merchantInfo` stop being persisted entirely.** They are a
   login cache; `MerchantProvider` refetches them on every entry into `(auth)`.
   Persisting them buys one avoided fetch per cold start and costs the
   cross-user leak above. Neither the per-user bucket nor the device bucket is
   the right home — the answer is that they have no persistent home.
4. **Migration seeds existing preferences as the default for new users, rather
   than resetting them.** `migrate` runs at rehydrate, before anyone has logged
   in, so it cannot know whose settings these are. Dropping them would silently
   return a configured terminal to `APP_DEFAULTS` on update — a POS running
   `receiptTemplate: "v2"` must not jump to `"v3"` because of a refactor.
5. **The reset registry lives in a new file, not in a store.** `src/store/user.ts`
   and the top of `src/store/application-configuration.ts` are mirrored
   byte-for-byte from `core`; adding a hook to either breaks the next
   `git merge core/main`. Both already expose what is needed.

## The storage audit

Every persisted key, and what a sign-out does to it after this change:

| Key | Backend | Holds | On sign-out |
| --- | --- | --- | --- |
| `merchant-storage` | AsyncStorage | terminal hardware + the per-user preference map | **kept** (see below) |
| `card-capabilities` | AsyncStorage | learned card-reader verdicts, guarded by `deviceKey` | **kept** — describes the terminal |
| `application-configuration-storage` | AsyncStorage | country + allowlisted tenant settings | **cleared** — already, via `clearConfiguration()` |
| `debug_tenantId` | AsyncStorage | selected tenant | **kept** — SP3 depends on it; staff devices are shared within a tenant |
| `app_environment` | AsyncStorage | API environment | **kept** — a deployment property |
| `locale` | AsyncStorage | language | **kept** — needed on the login screen, before a user exists |
| `public_tenants_cache_v1` | AsyncStorage | tenant list, 30-min TTL | **kept** — a device cache, and the login screen's first read |
| `createdTagIds` | AsyncStorage | last created tag ids | **removed** — user-scoped; folded into the per-user bucket (below) |
| `accessTokenPart*` / `refreshTokenPart*` | SecureStore | tokens | **cleared** — already, via `clearTokens()` |

`clearTokens()` is currently fire-and-forget inside `signOut`. It becomes
awaited: a token left in SecureStore after the UI has returned to the login
screen is a real window, and `signOut` has no reason to be synchronous.

## Design

### 1. `src/store/sessionReset.ts` — new

One exported function, the single place that knows what a session owns:

```ts
export async function resetSessionScopedState(): Promise<void>
```

It calls, in this order:

- `useTravellerStore.getState().clearTravellerInfo()` — traveller identity **and** the cart
- `usePayoutStore.getState().clearPayoutCard()` — the scanned PAN
- `usePrintProgressStore.getState().clearPrintStage()` — a stale overlay stage
- `useMerchantStore.getState().resetSessionData()` — new action, below
- `AsyncStorage.removeItem("createdTagIds")` — retires the duplicate key

Best-effort and never throws, following
[`clearRetiredStorage`](../../../pos-app/src/utils/retiredStorage.ts): a failed
reset must not strand the user on a half-torn-down session. Failures go to
`logger.error`.

It deliberately does **not** touch `useUserStore` or
`useApplicationConfigurationStore`. Those are core-mirrored and `signOut`
already clears them; duplicating the calls here would make the two sites drift.

### 2. `src/store/merchant.ts` — split the bucket

**Shape.** The five preference fields plus `createdTagIds` move behind a
per-user map. Terminal hardware stays flat and device-global:

```ts
type UserPreferences = {
  hideSignatures: boolean;
  afterTagCreate: AfterTagCreate;
  saleScreenVersion: SaleScreenVersion;
  receiptTemplate: ReceiptTemplateVersion;
  diditWorkflowId: string;
  createdTagIds: string[];
  updatedAt: number;   // for the cap below
};
```

- `preferencesByUser: Record<string, UserPreferences>`
- `preferenceDefaults: Omit<UserPreferences, "updatedAt" | "createdTagIds">` —
  seeded from `APP_DEFAULTS`, overwritten once by the v3→v4 migration
  (decision 4). `createdTagIds` is excluded deliberately: a default list of
  previously created tags is meaningless, and a new user's entry starts `[]`.
- `activeUserId: string | null` — set by `SessionProvider` after `getUserData`,
  cleared by `resetSessionData()`

**Entries are created lazily, on a user's first preference write.** Logging in
does not allocate one; a cashier who never opens Device Settings reads
`preferenceDefaults` and occupies no slot. `addCreatedTagId` counts as a write,
so anyone who completes a sale gets an entry.

Existing selectors keep their names and signatures. `hideSignatures` and
friends become derived reads against
`preferencesByUser[activeUserId] ?? preferenceDefaults`, and their setters
write into that user's entry. Consumers (`DeviceSettingsScreen`,
`tagPrintTemplate`, `SaleScreenV2`, `PrinterModal`) are untouched — this is the
point of doing it inside the store rather than at 30 call sites.

**Cap.** The map grows by one entry per cashier who ever logs into the
terminal. Keep the 10 most recently written, dropping the oldest by
`updatedAt`, mirroring the existing `CREATED_TAG_IDS_MAX = 50` precedent in
this file.

**`partialize`** becomes: `printerType`, `lineLength`, `bluetoothPrinter`,
`preferencesByUser`, `preferenceDefaults`. `merchantId` and `merchantInfo` are
gone from it (decision 3), as are `productGroups`, `tags`, `tagDetails`,
`tagCount`, `isLoading` and `error`, which were already excluded.

**`migrate`, version 3 → 4.** Keeps the existing `receiptTemplate` legacy
remap, then lifts the five flat preference values into `preferenceDefaults` and
initialises `preferencesByUser` to `{}`. A v3 blob's `merchantId` /
`merchantInfo` are simply not carried forward.

**`resetSessionData()`** — new action clearing `merchantId`, `merchantInfo`,
`productGroups`, `tags`, `tagDetails`, `tagCount`, `error` and `activeUserId`,
and setting `isLoading` back to `true`. It does **not** clear
`preferencesByUser` or `preferenceDefaults`: those are the thing being
preserved.

Nulling `activeUserId` here is what makes the login screen read
`preferenceDefaults` rather than whoever logged out last. On sign-in the reset
runs first and `getUserData` sets the new id immediately after, so the window
where no user is active spans only the token exchange — during which nothing
writes a preference.

**Dead code removed:** `clearItems?` on `useTravellerStore` — an optional field
with zero call sites, which reads as if it clears only the cart while
`clearTravellerInfo` is what everything actually uses. Leaving it invites a
caller that resets the cart and leaves the traveller selected.

### 3. `src/providers/SessionProvider.tsx` — wire both boundaries

`signOut` becomes async and selective:

```ts
const signOut = useCallback(async () => {
  await clearTokens();
  clearUser();
  useApplicationConfigurationStore.getState().clearConfiguration();
  await resetSessionScopedState();
}, [clearUser]);
```

`signIn` resets *before* the new user's data lands, so no screen can observe a
mix of two sessions:

```ts
const signIn = useCallback(async (email: string, password: string) => {
  return loginWithCredentials(email, password).then(async (data) => {
    if (typeof data === "string") return data;
    await resetSessionScopedState();
    await saveToken(data.access_token, "access");
    await saveToken(data.refresh_token, "refresh");
    await getUserData(data.access_token);
  });
}, []);
```

`getUserData` gains one line beside its existing `setUser` call: publish the
resolved `userId` to the merchant store so preference reads resolve to the
right user. It already has `userId` in hand (`configuration.user.id`), and this
must happen before `(auth)` mounts, which it does — `RootNavigator` gates on
`user?.userId`, set in the same function.

The bootstrap effect also sets `activeUserId` on a restored session, via the
same `getUserData` path. No separate wiring.

`ProfileScreen.tsx:50` is the only `signOut()` caller; it becomes
`void signOut()`.

### 4. `src/providers/MerchantProvider.tsx` — drop the duplicate write

The `useEffect` mirroring `createdTagIds` into a loose AsyncStorage key goes
away, along with the `getItem("createdTagIds")` read in `getTravellerData` —
the store now persists that list itself, per user. This also removes an
AsyncStorage write after every single sale.

SP2 rewrites the rest of this file. SP1 touches only these two reads.

## Testing

New — `src/store/__tests__/sessionReset.test.ts`:

- clears the cart, the traveller, the scanned payout card and the print stage
- clears merchant identity, product groups and tags
- **preserves `preferencesByUser`** — the regression that would defeat T8
- removes the `createdTagIds` key
- resolves rather than throwing when an AsyncStorage call rejects

New — `src/store/__tests__/merchantPreferences.test.ts`:

- two user ids keep independent preference sets; switching `activeUserId` swaps
  the values a selector returns
- a user with no entry reads `preferenceDefaults`, not another user's values
- writing a preference with no `activeUserId` does not create an entry
- the v3→v4 migration lifts flat values into `preferenceDefaults`, applies the
  `receiptTemplate` legacy remap, and drops `merchantId` / `merchantInfo`
- the map caps at 10 users, evicting the oldest `updatedAt`
- an AsyncStorage round-trip persists the map and rehydrates it

Extended — `src/providers/__tests__/SessionProvider.test.tsx`:

- sign-in resets session-scoped state before `getUserData` resolves
- sign-out preserves `debug_tenantId`, `app_environment`, `locale`,
  `public_tenants_cache_v1` and `card-capabilities`
- sign-out no longer calls `AsyncStorage.clear()` — asserted directly, because
  a reintroduced `clear()` would pass every other test here
- sign-out awaits `clearTokens()`
- `getUserData` publishes `activeUserId`

The existing `retiredStorage.test.ts` already asserts `locale`,
`debug_environment` and `application-configuration-storage` survive boot; it
needs no change, but its intent now has a second enforcement point.

## Risks

**A key omitted from the audit now survives logout** where `AsyncStorage.clear()`
would have taken it. The table above is the full output of a `src`-wide storage
audit, and the sign-out test asserts the preserve/remove split explicitly
rather than incidentally. Genuinely dead keys remain `retiredStorage.ts`'s job.

**A live terminal's persisted blob is v3.** The migration is the only thing
standing between a configured POS and a silent reset to `APP_DEFAULTS`, so it
is tested directly against a realistic v3 payload including the legacy
`receiptTemplate` values.

**`signOut` becoming async** changes a call signature. There is exactly one
caller.

## Out of scope

Refetching product groups against the *correct* merchant is SP2 — it needs the
active-affiliation fix, not a storage change. SP1 only guarantees that stale
values are gone at the boundary. Between the reset and SP2's landing, a fresh
login shows empty product groups until `MerchantProvider`'s fetch resolves,
which is strictly better than showing the previous user's.
