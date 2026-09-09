# pos-app Session Boundary Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A session boundary leaves nothing of the previous user behind, and two cashiers sharing one POS terminal each keep their own preferences.

**Architecture:** One new module (`src/store/sessionReset.ts`) owns the list of what a session holds, and is called from both `signIn` and `signOut`. `src/store/merchant.ts` splits its single device-global persisted bucket into terminal hardware (still flat and shared) plus a `preferencesByUser` map keyed by user id, projected onto the existing flat preference fields so no consumer changes.

**Tech Stack:** TypeScript strict, Expo 54 / RN 0.81, zustand 5 with `persist` + `createJSONStorage`, AsyncStorage 2.2, Jest 29 (`jest-expo`) + `@testing-library/react-native`.

**Spec:** [docs/superpowers/specs/2026-09-09-posapp-session-boundary-hygiene-design.md](../specs/2026-09-09-posapp-session-boundary-hygiene-design.md)

**Program:** [docs/superpowers/specs/2026-09-09-posapp-parity-program-design.md](../specs/2026-09-09-posapp-parity-program-design.md) — sub-project 1 of 7

## Global Constraints

- **Repo:** `C:\unirefund\pos-app`. Branch off `main` at `bff7134`. Work in a checkout that has `node_modules`.
- **Never edit these `core`-mirrored files:** `src/config/{appConfigTypes,appConfigKeys,appConfigParse,isHostTenant,normalizeApplicationConfiguration}.ts`, `src/actions/AccountService/types.ts`, `src/store/user.ts`, and `src/store/application-configuration.ts` above its `// Everything below is a pos-app-only addition` marker. `src/store/merchant.ts`, `src/store/traveller.ts`, `src/store/payout.ts` and `src/store/printProgress.ts` are **not** mirrored and are free to change.
- **Gates, re-measured not quoted:** `npm run typecheck` clean (0 errors); `npm test` 39 suites / 441 tests all passing *before* your changes, and all still passing plus your new ones after; `npm run lint` 0 errors / 35 warnings.
- **`prettier --check` is NOT a gate** (228 files fail at baseline). Format only files you touch. Never run `prettier --write` on a mirrored file.
- **`core.autocrlf=true` here.** Files are LF in the committed blob, often CRLF on disk. Do not port a diff from another checkout — re-do edits.
- TypeScript strict: no implicit `any`, no unchecked nulls.
- **Write few comments.** Explain a non-obvious *why*; do not narrate the code.
- Colour is always a semantic token, never a hex or Tailwind default-palette class. (No styling in this plan, but it applies if you touch a view.)
- Jest 29 → the flag is `--testPathPattern` (singular), not `--testPathPatterns`.
- AsyncStorage is globally mocked in `jest-setup.ts` with the official in-memory mock, so round-trip persistence assertions work in tests with no extra setup.

## Existing names you must use exactly

Getting any of these wrong silently no-ops:

| Thing | Exact name |
| --- | --- |
| print-progress store default export | `usePrintProgress` (from `@/store/printProgress`) |
| its clear action | `clearStage()` — **not** `clearPrintStage`, which is only a local alias in the sale/tag-detail screens |
| traveller store default export | `useTravellerStore` (from `@/store/traveller`) |
| its reset action | `clearTravellerInfo()` — resets traveller identity **and** `items` (the cart) |
| payout store default export | `usePayoutStore` (from `@/store/payout`) |
| its clear action | `clearPayoutCard()` |
| merchant store default export | `useMerchantStore` (from `@/store/merchant`) |
| logger | `import { logger } from "@/utils/logger"` |
| token clear | `clearTokens()` from `@/utils/auth/token` — already `async` |

## File Structure

| File | Responsibility |
| --- | --- |
| `src/store/sessionReset.ts` (create) | The single list of what one session owns, and the one function that discards it. |
| `src/store/__tests__/sessionReset.test.ts` (create) | Proves the reset clears session state and *preserves* preferences. |
| `src/store/merchant.ts` (modify) | Gains `preferencesByUser` / `preferenceDefaults` / `activeUserId`, `setActiveUserId`, `resetSessionData`; loses `merchantId` + `merchantInfo` from `partialize`; migrates v3 → v4. |
| `src/store/__tests__/merchantPreferences.test.ts` (create) | Per-user isolation, the projection, the cap, the migration. |
| `src/store/traveller.ts` (modify) | Drops the dead optional `clearItems?`. |
| `src/providers/SessionProvider.tsx` (modify) | Calls the reset on both boundaries; publishes `activeUserId`; awaits `clearTokens()`. |
| `src/providers/__tests__/SessionProvider.test.tsx` (modify) | Adds the boundary assertions, including "no `AsyncStorage.clear()`". |
| `src/screens/(auth)/Profile/ProfileScreen.tsx` (modify) | `signOut()` → `void signOut()`. |
| `src/providers/MerchantProvider.tsx` (modify) | Drops the duplicate `createdTagIds` AsyncStorage read/write. |

---

### Task 1: Per-user preference map in the merchant store

**Files:**
- Modify: `src/store/merchant.ts`
- Test: `src/store/__tests__/merchantPreferences.test.ts` (create)

**Interfaces:**
- Consumes: `APP_DEFAULTS`, `AfterTagCreate`, `ReceiptTemplateVersion`, `SaleScreenVersion` from `@/config/defaults` (already imported by this file).
- Produces, for later tasks:
  - `useMerchantStore.getState().setActiveUserId(userId: string | null): void`
  - `useMerchantStore.getState().resetSessionData(): void`
  - state fields `preferencesByUser: Record<string, UserPreferences>`, `preferenceDefaults: PreferenceDefaults`, `activeUserId: string | null`
  - `export const PREFERENCE_USER_LIMIT = 10`
  - `export type UserPreferences`, `export type PreferenceDefaults`

- [ ] **Step 1: Read the file you are about to change**

Run: `sed -n '1,60p' src/store/merchant.ts` and `sed -n '140,185p' src/store/merchant.ts`

You need the exact shape of the `MerchantStore` interface, the `persist` config (`name: "merchant-storage"`, `version: 3`, its `migrate`, its `partialize`) and `CREATED_TAG_IDS_MAX = 50`.

- [ ] **Step 2: Confirm the baseline is green before you touch anything**

Run: `npm test 2>&1 | tail -20`
Expected: `Tests: 441 passed`, `Test Suites: 39 passed`. If it is not, stop and report — do not build on a red baseline.

- [ ] **Step 3: Write the failing test file**

Create `src/store/__tests__/merchantPreferences.test.ts`:

```ts
import useMerchantStore, {
  PREFERENCE_USER_LIMIT,
  type UserPreferences,
} from "@/store/merchant";
import { APP_DEFAULTS } from "@/config/defaults";
import AsyncStorage from "@react-native-async-storage/async-storage";

const INITIAL = useMerchantStore.getState();

function resetStore() {
  useMerchantStore.setState({
    ...INITIAL,
    preferencesByUser: {},
    preferenceDefaults: {
      hideSignatures: APP_DEFAULTS.hideSignatures,
      afterTagCreate: APP_DEFAULTS.afterTagCreate,
      saleScreenVersion: APP_DEFAULTS.saleScreenVersion,
      receiptTemplate: APP_DEFAULTS.receiptTemplate,
      diditWorkflowId: APP_DEFAULTS.diditWorkflowId,
    },
    activeUserId: null,
  });
}

beforeEach(() => {
  resetStore();
});

describe("per-user preferences", () => {
  it("keeps two users' preferences independent", () => {
    const store = useMerchantStore.getState();

    store.setActiveUserId("user-a");
    useMerchantStore.getState().setReceiptTemplate("v1");
    useMerchantStore.getState().setHideSignatures(false);

    useMerchantStore.getState().setActiveUserId("user-b");
    useMerchantStore.getState().setReceiptTemplate("v2");

    expect(useMerchantStore.getState().receiptTemplate).toBe("v2");

    useMerchantStore.getState().setActiveUserId("user-a");
    expect(useMerchantStore.getState().receiptTemplate).toBe("v1");
    expect(useMerchantStore.getState().hideSignatures).toBe(false);
  });

  it("reads preferenceDefaults for a user with no entry", () => {
    useMerchantStore.setState({
      preferenceDefaults: {
        ...useMerchantStore.getState().preferenceDefaults,
        receiptTemplate: "v1",
      },
    });

    useMerchantStore.getState().setActiveUserId("brand-new-user");

    expect(useMerchantStore.getState().receiptTemplate).toBe("v1");
    expect(useMerchantStore.getState().preferencesByUser).toEqual({});
  });

  it("does not leak one user's value to another with no entry", () => {
    useMerchantStore.getState().setActiveUserId("user-a");
    useMerchantStore.getState().setDiditWorkflowId("workflow-a");

    useMerchantStore.getState().setActiveUserId("user-b");

    expect(useMerchantStore.getState().diditWorkflowId).toBe(
      APP_DEFAULTS.diditWorkflowId,
    );
  });

  it("creates an entry lazily, on first write only", () => {
    useMerchantStore.getState().setActiveUserId("user-a");
    expect(useMerchantStore.getState().preferencesByUser).toEqual({});

    useMerchantStore.getState().setSaleScreenVersion("v1");
    expect(
      Object.keys(useMerchantStore.getState().preferencesByUser),
    ).toEqual(["user-a"]);
  });

  it("ignores a preference write when no user is active", () => {
    useMerchantStore.getState().setActiveUserId(null);
    useMerchantStore.getState().setReceiptTemplate("v1");

    expect(useMerchantStore.getState().preferencesByUser).toEqual({});
  });

  it("keeps createdTagIds per user", () => {
    useMerchantStore.getState().setActiveUserId("user-a");
    useMerchantStore.getState().addCreatedTagId("tag-a");

    useMerchantStore.getState().setActiveUserId("user-b");
    expect(useMerchantStore.getState().createdTagIds).toEqual([]);

    useMerchantStore.getState().setActiveUserId("user-a");
    expect(useMerchantStore.getState().createdTagIds).toEqual(["tag-a"]);
  });

  it("evicts the oldest-written user past the limit", () => {
    for (let i = 0; i < PREFERENCE_USER_LIMIT + 2; i += 1) {
      useMerchantStore.getState().setActiveUserId(`user-${i}`);
      useMerchantStore.getState().setDiditWorkflowId(`workflow-${i}`);
    }

    const users = Object.keys(useMerchantStore.getState().preferencesByUser);
    expect(users).toHaveLength(PREFERENCE_USER_LIMIT);
    expect(users).not.toContain("user-0");
    expect(users).toContain(`user-${PREFERENCE_USER_LIMIT + 1}`);
  });
});

describe("resetSessionData", () => {
  it("clears session data but preserves preferences", () => {
    useMerchantStore.getState().setActiveUserId("user-a");
    useMerchantStore.getState().setReceiptTemplate("v1");
    useMerchantStore.getState().setMerchantId("merchant-1");
    useMerchantStore.getState().setProductGroups([]);

    useMerchantStore.getState().resetSessionData();

    const state = useMerchantStore.getState();
    expect(state.merchantId).toBeUndefined();
    expect(state.merchantInfo).toBeUndefined();
    expect(state.productGroups).toBeUndefined();
    expect(state.tags).toBeUndefined();
    expect(state.activeUserId).toBeNull();
    expect(state.isLoading).toBe(true);
    expect(state.preferencesByUser["user-a"]?.receiptTemplate).toBe("v1");
  });
});

describe("v3 to v4 migration", () => {
  it("lifts flat preferences into preferenceDefaults and drops merchant identity", () => {
    const migrate = (
      useMerchantStore.persist.getOptions() as {
        migrate?: (state: unknown, version: number) => unknown;
      }
    ).migrate;

    const migrated = migrate?.(
      {
        merchantId: "merchant-1",
        merchantInfo: { id: "merchant-1" },
        printerType: "sunmi",
        lineLength: 48,
        hideSignatures: false,
        afterTagCreate: "showSummary",
        saleScreenVersion: "v1",
        receiptTemplate: "detailed",
        diditWorkflowId: "workflow-legacy",
      },
      3,
    ) as Record<string, unknown>;

    expect(migrated.preferenceDefaults).toEqual({
      hideSignatures: false,
      afterTagCreate: "showSummary",
      saleScreenVersion: "v1",
      receiptTemplate: "v1",
      diditWorkflowId: "workflow-legacy",
    });
    expect(migrated.preferencesByUser).toEqual({});
    expect(migrated.merchantId).toBeUndefined();
    expect(migrated.merchantInfo).toBeUndefined();
    expect(migrated.printerType).toBe("sunmi");
    expect(migrated.lineLength).toBe(48);
  });
});

describe("persistence", () => {
  it("persists the preference map and not the projected fields", async () => {
    useMerchantStore.getState().setActiveUserId("user-a");
    useMerchantStore.getState().setReceiptTemplate("v1");

    await new Promise((resolve) => setTimeout(resolve, 0));

    const raw = await AsyncStorage.getItem("merchant-storage");
    const persisted = JSON.parse(raw ?? "{}") as {
      state: Record<string, unknown>;
    };

    expect(
      (persisted.state.preferencesByUser as Record<string, UserPreferences>)[
        "user-a"
      ]?.receiptTemplate,
    ).toBe("v1");
    expect(persisted.state.receiptTemplate).toBeUndefined();
    expect(persisted.state.merchantId).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx jest --testPathPattern merchantPreferences -v`
Expected: FAIL. `setActiveUserId`, `resetSessionData`, `PREFERENCE_USER_LIMIT` and `UserPreferences` do not exist yet, so most cases fail on `TypeError: ... is not a function` or a TS/import error.

- [ ] **Step 5: Add the types, the limit and the state fields**

In `src/store/merchant.ts`, beside the existing `CREATED_TAG_IDS_MAX`:

```ts
// Cap how many users' preferences the terminal retains. One entry appears per
// cashier who ever changes a setting or completes a sale here, so without a
// cap the blob grows for the life of the device.
export const PREFERENCE_USER_LIMIT = 10;

export type PreferenceDefaults = {
  hideSignatures: boolean;
  afterTagCreate: AfterTagCreate;
  saleScreenVersion: SaleScreenVersion;
  receiptTemplate: ReceiptTemplateVersion;
  diditWorkflowId: string;
};

export type UserPreferences = PreferenceDefaults & {
  createdTagIds: string[];
  updatedAt: number;
};
```

Add to the `MerchantStore` interface:

```ts
  preferencesByUser: Record<string, UserPreferences>;
  preferenceDefaults: PreferenceDefaults;
  activeUserId: string | null;
  setActiveUserId: (userId: string | null) => void;
  resetSessionData: () => void;
```

- [ ] **Step 6: Add the projection helpers above the store factory**

```ts
const DEFAULT_PREFERENCES: PreferenceDefaults = {
  hideSignatures: APP_DEFAULTS.hideSignatures,
  afterTagCreate: APP_DEFAULTS.afterTagCreate,
  saleScreenVersion: APP_DEFAULTS.saleScreenVersion,
  receiptTemplate: APP_DEFAULTS.receiptTemplate,
  diditWorkflowId: APP_DEFAULTS.diditWorkflowId,
};

/** The flat fields a projection writes. Persisting these is what made the
 * settings device-global, so they stay out of `partialize`. */
function project(
  preferences: UserPreferences | undefined,
  defaults: PreferenceDefaults,
) {
  return {
    hideSignatures: preferences?.hideSignatures ?? defaults.hideSignatures,
    afterTagCreate: preferences?.afterTagCreate ?? defaults.afterTagCreate,
    saleScreenVersion:
      preferences?.saleScreenVersion ?? defaults.saleScreenVersion,
    receiptTemplate: preferences?.receiptTemplate ?? defaults.receiptTemplate,
    diditWorkflowId: preferences?.diditWorkflowId ?? defaults.diditWorkflowId,
    createdTagIds: preferences?.createdTagIds ?? [],
  };
}

function writePreference(
  state: MerchantStore,
  patch: Partial<Omit<UserPreferences, "updatedAt">>,
) {
  const userId = state.activeUserId;
  if (!userId) return {};

  const existing = state.preferencesByUser[userId];
  const entry: UserPreferences = {
    ...state.preferenceDefaults,
    createdTagIds: [],
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  };

  const next = { ...state.preferencesByUser, [userId]: entry };
  const userIds = Object.keys(next);
  if (userIds.length > PREFERENCE_USER_LIMIT) {
    userIds
      .sort((a, b) => (next[a]?.updatedAt ?? 0) - (next[b]?.updatedAt ?? 0))
      .slice(0, userIds.length - PREFERENCE_USER_LIMIT)
      .forEach((id) => delete next[id]);
  }

  return { preferencesByUser: next, ...patch };
}
```

`Date.now()` has millisecond resolution, so a burst of writes in one tick produces equal `updatedAt` values. That is fine and deliberate: `Array.prototype.sort` has been required to be stable since ES2019 and `Object.keys` returns string keys in insertion order, so ties evict oldest-inserted first — exactly the intent. Do not reach for a monotonic counter instead; it would reset on app restart and make freshly written entries sort as older than persisted ones.

- [ ] **Step 7: Wire the state fields, setters and the two new actions**

Add to the store factory's returned object:

```ts
      preferencesByUser: {},
      preferenceDefaults: DEFAULT_PREFERENCES,
      activeUserId: null,
      setActiveUserId: (userId: string | null) =>
        set((state) => ({
          activeUserId: userId,
          ...project(
            userId ? state.preferencesByUser[userId] : undefined,
            state.preferenceDefaults,
          ),
        })),
      resetSessionData: () =>
        set({
          merchantId: undefined,
          merchantInfo: undefined,
          productGroups: undefined,
          tags: undefined,
          tagDetails: undefined,
          tagCount: undefined,
          error: null,
          isLoading: true,
          activeUserId: null,
        }),
```

Rewrite the five preference setters and the two `createdTagIds` writers to go through `writePreference`:

```ts
      setHideSignatures: (value: boolean) =>
        set((state) => writePreference(state, { hideSignatures: value })),
      setAfterTagCreate: (value: AfterTagCreate) =>
        set((state) => writePreference(state, { afterTagCreate: value })),
      setSaleScreenVersion: (value: SaleScreenVersion) =>
        set((state) => writePreference(state, { saleScreenVersion: value })),
      setReceiptTemplate: (value: ReceiptTemplateVersion) =>
        set((state) => writePreference(state, { receiptTemplate: value })),
      setDiditWorkflowId: (value: string) =>
        set((state) => writePreference(state, { diditWorkflowId: value })),
      setCreatedTagIds: (tagIds: string[]) =>
        set((state) => writePreference(state, { createdTagIds: tagIds })),
      addCreatedTagId: (tagId: string) =>
        set((state) =>
          writePreference(state, {
            createdTagIds: [...state.createdTagIds, tagId].slice(
              -CREATED_TAG_IDS_MAX,
            ),
          }),
        ),
```

- [ ] **Step 8: Bump the persist version, migrate, and re-cut `partialize`**

Replace `version: 3` with `version: 4`. Extend `migrate` — keep the existing `receiptTemplate` legacy remap exactly as it is, then add:

```ts
        if (version < 4) {
          state.preferenceDefaults = {
            hideSignatures:
              (state.hideSignatures as boolean) ?? APP_DEFAULTS.hideSignatures,
            afterTagCreate:
              (state.afterTagCreate as AfterTagCreate) ??
              APP_DEFAULTS.afterTagCreate,
            saleScreenVersion:
              (state.saleScreenVersion as SaleScreenVersion) ??
              APP_DEFAULTS.saleScreenVersion,
            receiptTemplate:
              (state.receiptTemplate as ReceiptTemplateVersion) ??
              APP_DEFAULTS.receiptTemplate,
            diditWorkflowId:
              (state.diditWorkflowId as string) ?? APP_DEFAULTS.diditWorkflowId,
          };
          state.preferencesByUser = {};
          delete state.merchantId;
          delete state.merchantInfo;
        }
```

`migrate`'s signature gains the version argument: `migrate: (persistedState, version) => {`.

Replace `partialize` with:

```ts
      partialize: (state) => ({
        printerType: state.printerType,
        lineLength: state.lineLength,
        bluetoothPrinter: state.bluetoothPrinter,
        preferencesByUser: state.preferencesByUser,
        preferenceDefaults: state.preferenceDefaults,
      }),
```

Add `onRehydrateStorage` so the pre-login projection uses the migrated defaults rather than `APP_DEFAULTS`:

```ts
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.setActiveUserId(null);
      },
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx jest --testPathPattern merchantPreferences -v`
Expected: PASS, all 10 cases.

- [ ] **Step 10: Verify nothing else regressed**

Run: `npm run typecheck` — expected clean.
Run: `npm test 2>&1 | tail -20` — expected 40 suites, 451 tests, all passing.
Run: `npm run lint 2>&1 | tail -5` — expected 0 errors, 35 warnings.

If `typecheck` reports errors in `DeviceSettingsScreen`, `tagPrintTemplate`, `SaleScreen*` or `PrinterModal`, the projection is wrong — those files must compile untouched. Fix the store, not the consumer.

- [ ] **Step 11: Commit**

```bash
git add src/store/merchant.ts src/store/__tests__/merchantPreferences.test.ts
git commit -m "feat(store): key merchant preferences by user id

Two cashiers sharing a terminal each keep their own setup. The five
preference fields plus createdTagIds move behind a preferencesByUser map,
projected onto the existing flat fields so no consumer changes. Terminal
hardware (printer type, bluetooth pairing, line length) stays device-global.

merchantId and merchantInfo leave partialize entirely: they are a login
cache MerchantProvider refetches on every entry into (auth), and persisting
them device-globally let one user create a tag against another's merchant.

The v3 to v4 migration lifts the terminal's current settings into
preferenceDefaults rather than dropping them, so a POS on receiptTemplate v2
does not silently jump to v3 on update."
```

---

### Task 2: The session reset registry

**Files:**
- Create: `src/store/sessionReset.ts`
- Modify: `src/store/traveller.ts`
- Test: `src/store/__tests__/sessionReset.test.ts` (create)

**Interfaces:**
- Consumes from Task 1: `useMerchantStore.getState().resetSessionData()`.
- Produces: `export async function resetSessionScopedState(): Promise<void>` from `@/store/sessionReset`.

- [ ] **Step 1: Write the failing test**

Create `src/store/__tests__/sessionReset.test.ts`:

```ts
import { resetSessionScopedState } from "@/store/sessionReset";
import useMerchantStore from "@/store/merchant";
import usePayoutStore from "@/store/payout";
import usePrintProgress from "@/store/printProgress";
import useTravellerStore from "@/store/traveller";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@/utils/logger", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { logger } = jest.requireMock("@/utils/logger");

describe("resetSessionScopedState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useMerchantStore.setState({ preferencesByUser: {}, activeUserId: null });
  });

  it("empties the cart and the traveller", async () => {
    useTravellerStore.getState().setTravellerInfo({
      travellerDocumentNumber: "X1234567",
      firstName: "Ada",
      lastName: "Lovelace",
      nationalityCountryCode3: "GBR",
      residenceCountryCode3: "GBR",
      expirationDate: "2030-01-01",
      birthDate: "1815-12-10",
    });
    useTravellerStore.getState().addItem({
      productGroupId: "pg-1",
      amount: 100,
      taxRate: 20,
    });

    await resetSessionScopedState();

    expect(useTravellerStore.getState().items).toEqual([]);
    expect(useTravellerStore.getState().isTravellerSelected).toBe(false);
    expect(useTravellerStore.getState().travellerDocumentNumber).toBe("");
  });

  it("discards the scanned payout card", async () => {
    usePayoutStore
      .getState()
      .setPayoutCard({ pan: "4111111111111111" } as never);

    await resetSessionScopedState();

    expect(usePayoutStore.getState().payoutCard).toBeNull();
  });

  it("clears a stranded print stage", async () => {
    usePrintProgress.getState().setStage("Printing…");

    await resetSessionScopedState();

    expect(usePrintProgress.getState().stage).toBeNull();
  });

  it("clears merchant identity, product groups and tags", async () => {
    useMerchantStore.getState().setMerchantId("merchant-1");
    useMerchantStore.getState().setProductGroups([]);

    await resetSessionScopedState();

    const state = useMerchantStore.getState();
    expect(state.merchantId).toBeUndefined();
    expect(state.merchantInfo).toBeUndefined();
    expect(state.productGroups).toBeUndefined();
    expect(state.tags).toBeUndefined();
  });

  it("preserves every user's saved preferences", async () => {
    useMerchantStore.getState().setActiveUserId("user-a");
    useMerchantStore.getState().setReceiptTemplate("v1");

    await resetSessionScopedState();

    expect(
      useMerchantStore.getState().preferencesByUser["user-a"]?.receiptTemplate,
    ).toBe("v1");
  });

  it("removes the retired createdTagIds key", async () => {
    await AsyncStorage.setItem("createdTagIds", JSON.stringify(["tag-1"]));

    await resetSessionScopedState();

    expect(await AsyncStorage.getItem("createdTagIds")).toBeNull();
  });

  it("resolves and logs rather than throwing when storage fails", async () => {
    const spy = jest
      .spyOn(AsyncStorage, "removeItem")
      .mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(resetSessionScopedState()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();

    spy.mockRestore();
  });
});
```

Note the deliberately loose `as never` cast on the payout card: `ScannedCard` comes from `@/hooks/useCardReader`, and importing that module for one fixture would drag the card-reader native surface into this suite. Only the null-ness after the reset is under test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --testPathPattern sessionReset -v`
Expected: FAIL — `Cannot find module '@/store/sessionReset'`.

- [ ] **Step 3: Create the module**

Create `src/store/sessionReset.ts`:

```ts
import useMerchantStore from "@/store/merchant";
import usePayoutStore from "@/store/payout";
import usePrintProgress from "@/store/printProgress";
import useTravellerStore from "@/store/traveller";
import { logger } from "@/utils/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Everything one signed-in session owns, discarded in one call.
 *
 * Run on sign-in as well as sign-out: a crash, a killed process or a revoked
 * token ends a session without ever reaching `signOut`, so the guarantee has
 * to hold from the other side too. Zustand stores are module singletons and
 * survive `(auth)` unmounting, which is why an unmount is not enough.
 *
 * `useUserStore` and `useApplicationConfigurationStore` are deliberately absent
 * — both are mirrored from `core` and `signOut` already clears them; a second
 * call site would let the two drift.
 */
export async function resetSessionScopedState(): Promise<void> {
  useTravellerStore.getState().clearTravellerInfo();
  usePayoutStore.getState().clearPayoutCard();
  usePrintProgress.getState().clearStage();
  useMerchantStore.getState().resetSessionData();

  try {
    // Retired: the list now lives per-user inside `merchant-storage`.
    await AsyncStorage.removeItem("createdTagIds");
  } catch (error) {
    logger.error("Failed to clear session-scoped storage:", error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --testPathPattern sessionReset -v`
Expected: PASS, all 7 cases.

- [ ] **Step 5: Remove the dead `clearItems`**

In `src/store/traveller.ts`, delete the optional declaration `clearItems?: () => void;` from the `TravellerStore` interface and the implementation:

```ts
  clearItems: () =>
    set(() => ({
      items: [],
    })),
```

It has zero call sites, and its name reads as if it clears only the cart while `clearTravellerInfo` is what the whole app uses. Confirm with `grep -rn "clearItems" src` before deleting — expected: no hits outside `src/store/traveller.ts`.

- [ ] **Step 6: Verify**

Run: `npm run typecheck` — expected clean.
Run: `npm test 2>&1 | tail -20` — expected 41 suites, 458 tests, all passing.

- [ ] **Step 7: Commit**

```bash
git add src/store/sessionReset.ts src/store/traveller.ts src/store/__tests__/sessionReset.test.ts
git commit -m "feat(store): add the session reset registry

One place that knows what a signed-in session owns: the cart, the traveller,
the scanned refund card, a stranded print stage, and the merchant identity
cache. Preferences are explicitly preserved.

Also drops useTravellerStore.clearItems, an optional field with no callers
that reads as a cart-only reset while clearTravellerInfo is what every real
call site uses."
```

---

### Task 3: Call the reset on both session boundaries

**Files:**
- Modify: `src/providers/SessionProvider.tsx`
- Modify: `src/screens/(auth)/Profile/ProfileScreen.tsx:50`
- Test: `src/providers/__tests__/SessionProvider.test.tsx`

**Interfaces:**
- Consumes from Task 2: `resetSessionScopedState()` from `@/store/sessionReset`.
- Consumes from Task 1: `useMerchantStore.getState().setActiveUserId(userId)`.
- Produces: `signOut` becomes `() => Promise<void>` on the session context.

- [ ] **Step 1: Read the current boundaries**

Run: `sed -n '340,365p' src/providers/SessionProvider.tsx` and `sed -n '270,325p' src/providers/SessionProvider.tsx`

You need the exact bodies of `signOut`, `signIn`, and the `setUser({...})` call at the end of `getUserData`.

- [ ] **Step 2: Write the failing tests**

Append to `src/providers/__tests__/SessionProvider.test.tsx`. Add the mock beside the existing `jest.mock` block at the top of the file:

```ts
jest.mock("@/store/sessionReset", () => ({
  resetSessionScopedState: jest.fn().mockResolvedValue(undefined),
}));
```

and beside the other `requireMock` destructures:

```ts
const { resetSessionScopedState } = jest.requireMock("@/store/sessionReset");
const { clearTokens } = jest.requireMock("@/utils/auth/token");
```

Then add this describe block. Reuse whatever helper the file already uses to render the provider and reach the context — read the existing tests first and match their harness rather than inventing a second one.

```ts
describe("session boundaries", () => {
  it("resets session-scoped state on sign-out", async () => {
    const session = await renderSession();

    await act(async () => {
      await session.current?.signOut();
    });

    expect(resetSessionScopedState).toHaveBeenCalledTimes(1);
  });

  it("awaits clearTokens on sign-out", async () => {
    const session = await renderSession();

    await act(async () => {
      await session.current?.signOut();
    });

    expect(clearTokens).toHaveBeenCalledTimes(1);
  });

  it("never wipes all of AsyncStorage on sign-out", async () => {
    const clearSpy = jest.spyOn(AsyncStorage, "clear");
    const session = await renderSession();

    await act(async () => {
      await session.current?.signOut();
    });

    expect(clearSpy).not.toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("preserves the device keys a shared terminal needs across sign-out", async () => {
    await AsyncStorage.setItem("debug_tenantId", "tenant-1");
    await AsyncStorage.setItem("app_environment", "uat");
    await AsyncStorage.setItem("locale", "tr-TR");
    await AsyncStorage.setItem("public_tenants_cache_v1", "{}");
    await AsyncStorage.setItem("card-capabilities", "{}");

    const session = await renderSession();
    await act(async () => {
      await session.current?.signOut();
    });

    expect(await AsyncStorage.getItem("debug_tenantId")).toBe("tenant-1");
    expect(await AsyncStorage.getItem("app_environment")).toBe("uat");
    expect(await AsyncStorage.getItem("locale")).toBe("tr-TR");
    expect(await AsyncStorage.getItem("public_tenants_cache_v1")).toBe("{}");
    expect(await AsyncStorage.getItem("card-capabilities")).toBe("{}");
  });

  it("resets session-scoped state on sign-in", async () => {
    loginWithCredentials.mockResolvedValueOnce({
      access_token: "access-1",
      refresh_token: "refresh-1",
    });

    const session = await renderSession();
    await act(async () => {
      await session.current?.signIn("cashier@example.com", "password");
    });

    expect(resetSessionScopedState).toHaveBeenCalled();
  });

  it("publishes the resolved user id to the merchant store", async () => {
    // Arrange a successful getUserData exactly as the existing success-path
    // test in this file does, then assert the id landed.
    await renderSignedInSession();

    expect(useMerchantStore.getState().activeUserId).toBe(SIGNED_IN_USER_ID);
  });
});
```

`renderSession`, `renderSignedInSession` and `SIGNED_IN_USER_ID` stand for this file's existing harness and fixtures — do not add new ones. If the file has no reusable render helper, extract one from the existing tests as part of this step rather than duplicating setup.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest --testPathPattern SessionProvider -v`
Expected: FAIL — `resetSessionScopedState` not called, `AsyncStorage.clear` was called, device keys gone, `activeUserId` null.

- [ ] **Step 4: Make `signOut` selective and async**

```ts
  const signOut = useCallback(async () => {
    await clearTokens();
    clearUser();
    useApplicationConfigurationStore.getState().clearConfiguration();
    await resetSessionScopedState();
  }, [clearUser]);
```

The `AsyncStorage.clear()` line is deleted. It took `debug_tenantId`, `app_environment`, `locale`, the tenant cache and the learned card-reader capabilities with it — device state that must survive a cashier changing shift, and the reason SP3 cannot remember a tenant today.

- [ ] **Step 5: Reset on sign-in too**

```ts
  const signIn = useCallback(async (email: string, password: string) => {
    return loginWithCredentials(email, password).then(async (data) => {
      if (typeof data === "string") {
        return data;
      }
      await resetSessionScopedState();
      await saveToken(data.access_token, "access");
      await saveToken(data.refresh_token, "refresh");
      await getUserData(data.access_token);
    });
  }, []);
```

The reset goes after the credential check — a failed login returns an error string and must leave the current session alone — and before the tokens are stored, so no screen can observe a mix of two sessions.

- [ ] **Step 6: Publish `activeUserId` from `getUserData`**

Immediately after the existing `setUser({ ... })` call, add:

```ts
    useMerchantStore.getState().setActiveUserId(userId);
```

Add the import: `import useMerchantStore from "@/store/merchant";`

This must run before `(auth)` mounts, and it does: `RootNavigator` gates on `user?.userId`, set by the `setUser` on the line above. The same path covers a restored session at boot and a post-switch token refresh, so no separate wiring is needed.

- [ ] **Step 7: Fix the one caller**

In `src/screens/(auth)/Profile/ProfileScreen.tsx`, line 50: `signOut()` becomes `void signOut()`.

Confirm it is the only one: `grep -rn "signOut()" src` — expected hits only in `ProfileScreen.tsx` and `SessionProvider.tsx`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx jest --testPathPattern SessionProvider -v`
Expected: PASS — the existing revoke-path tests plus the 6 new boundary tests.

- [ ] **Step 9: Verify the whole gate set**

Run: `npm run typecheck` — expected clean (0 errors).
Run: `npm test 2>&1 | tail -20` — expected 41 suites, 464 tests, all passing.
Run: `npm run lint 2>&1 | tail -5` — expected 0 errors, 35 warnings.

- [ ] **Step 10: Commit**

```bash
git add src/providers/SessionProvider.tsx "src/screens/(auth)/Profile/ProfileScreen.tsx" src/providers/__tests__/SessionProvider.test.tsx
git commit -m "fix(auth): reset session-scoped state on both boundaries

signOut called AsyncStorage.clear(), wiping the selected tenant, the API
environment, the language and the learned card-reader capabilities — device
state a shared terminal needs across a shift change. It now clears only what
a session owns, and awaits clearTokens rather than leaving it in flight.

signIn resets too. Zustand stores are module singletons, so unmounting
(auth) does not clear them: user A's cart and scanned refund card were still
in memory when user B reached the sale screen. A crash or a revoked token
also ends a session without reaching signOut, so the new session has to start
clean from its own side.

getUserData publishes the resolved user id so preference reads resolve to
the cashier who is actually signed in."
```

---

### Task 4: Drop the duplicate `createdTagIds` write

**Files:**
- Modify: `src/providers/MerchantProvider.tsx:53-57` and `:88-93`

**Interfaces:**
- Consumes from Task 1: `createdTagIds` now persists inside `merchant-storage`, per user.
- Produces: nothing new. SP2 rewrites the rest of this file.

- [ ] **Step 1: Delete the mirroring effect**

Remove:

```ts
  useEffect(() => {
    if (createdTagIds.length > 0) {
      AsyncStorage.setItem("createdTagIds", JSON.stringify(createdTagIds));
    }
  }, [createdTagIds]);
```

This wrote the whole list to AsyncStorage after every single sale, duplicating what the store now persists itself.

- [ ] **Step 2: Delete the read-back**

In `getTravellerData`, remove:

```ts
      // AsyncStorage'dan createdTagIds'i çek ve güncelle
      const storedTagIds = await AsyncStorage.getItem("createdTagIds");
      if (storedTagIds) {
        const tagIds = JSON.parse(storedTagIds);
        setCreatedTagIds(tagIds);
      }
```

- [ ] **Step 3: Clean up the now-unused bindings**

`createdTagIds` and `setCreatedTagIds` drop out of the `useMerchantStore()` destructure at the top of the component. The `AsyncStorage` import goes if nothing else in the file uses it — check with `grep -n "AsyncStorage" src/providers/MerchantProvider.tsx` before removing. `useEffect` stays: the mount effect calling `getTravellerData()` still needs it.

- [ ] **Step 4: Verify**

Run: `npm run typecheck` — expected clean. An unused-import or unused-variable error here means step 3 was incomplete.
Run: `npm test 2>&1 | tail -20` — expected 41 suites, 464 tests, all passing.
Run: `npm run lint 2>&1 | tail -5` — expected 0 errors, 35 warnings. A new `no-unused-vars` warning means step 3 was incomplete.

- [ ] **Step 5: Commit**

```bash
git add src/providers/MerchantProvider.tsx
git commit -m "refactor(merchant): stop mirroring createdTagIds to a loose key

The list now persists inside merchant-storage, scoped to the signed-in user,
so the duplicate AsyncStorage copy is both redundant and device-global. Also
removes an AsyncStorage write that fired after every sale."
```

---

### Task 5: Verify the whole sub-project and open the PR

**Files:** none — verification only.

- [ ] **Step 1: Re-measure every gate from a clean state**

```bash
npm run typecheck
npm test 2>&1 | tail -20
npm run lint 2>&1 | tail -5
```

Expected: typecheck clean; 41 suites / 464 tests passing; 0 errors / 35 warnings. Report the actual numbers — do not restate these.

- [ ] **Step 2: Confirm no `core`-mirrored file was touched**

```bash
git diff --name-only main...HEAD
```

None of these may appear: `src/store/user.ts`, `src/store/application-configuration.ts`, `src/config/appConfigTypes.ts`, `src/config/appConfigKeys.ts`, `src/config/appConfigParse.ts`, `src/config/isHostTenant.ts`, `src/config/normalizeApplicationConfiguration.ts`, `src/actions/AccountService/types.ts`.

- [ ] **Step 3: Confirm the storage audit holds**

```bash
grep -rn "AsyncStorage.clear" src
```

Expected: no hits. A reintroduced `clear()` passes every test except the one that names it.

- [ ] **Step 4: Format only the files you touched**

```bash
npx prettier --write src/store/sessionReset.ts src/store/merchant.ts src/store/traveller.ts src/store/__tests__/sessionReset.test.ts src/store/__tests__/merchantPreferences.test.ts src/providers/SessionProvider.tsx src/providers/MerchantProvider.tsx src/providers/__tests__/SessionProvider.test.tsx
```

Then re-run `npm test` — prettier has reformatted a store in this repo before and diverged it 274 lines.

- [ ] **Step 5: Open the PR**

```bash
gh pr create --title "fix(pos-app): scope session state and device preferences to the signed-in user" --body "$(cat <<'BODY'
## What

- `signOut` no longer calls `AsyncStorage.clear()`. It clears only what a session owns; the selected tenant, API environment, language, tenant cache and learned card-reader capabilities now survive a shift change.
- `signIn` resets session-scoped state too. Zustand stores are module singletons, so unmounting `(auth)` never cleared them — user A's cart and scanned refund card were still in memory when user B reached the sale screen.
- Merchant preferences are keyed by user id. Two cashiers sharing a terminal each keep their own setup; terminal hardware stays device-global.
- `merchantId` / `merchantInfo` are no longer persisted, so a new session cannot create a tag against the previous user's merchant.

## Why

Three defects with one cause: the app treated a logout as a process restart.

## Notes

- Persist version 3 → 4. The migration lifts the terminal's current settings into `preferenceDefaults` rather than dropping them, so a POS on `receiptTemplate: "v2"` does not silently jump to `"v3"`.
- Sub-project 1 of 7 in the pos-app parity program. Refetching product groups against the *correct* merchant is SP2 — it needs the active-affiliation fix, not a storage change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: `sessionReset.ts` → Task 2; the `merchant.ts` split, projection, cap, `partialize` and migration → Task 1; `SessionProvider` boundaries and `activeUserId` → Task 3; `MerchantProvider` duplicate write → Task 4; the storage-audit assertions → Task 3 Step 2 and Task 5 Step 3; the dead `clearItems` → Task 2 Step 5. The spec's three risks are each covered by a verification step (Task 5 Step 3 for the omitted-key risk, Task 1 Step 3's migration case for the v3-blob risk, Task 3 Step 7 for the async-signature risk).

**Type consistency.** `resetSessionData` and `setActiveUserId` are named identically in Tasks 1, 2 and 3. `usePrintProgress.clearStage()` is used, not the screens' local `clearPrintStage` alias. `PreferenceDefaults` excludes `createdTagIds` and `updatedAt`; `UserPreferences` adds both. `PREFERENCE_USER_LIMIT` is exported from `merchant.ts` and imported by its test.

**Known soft spot.** Task 3's tests reference this file's existing render harness (`renderSession`, `renderSignedInSession`, `SIGNED_IN_USER_ID`) rather than spelling it out, because `SessionProvider.test.tsx` already has 400+ lines of setup that must not be duplicated. Step 2 instructs the implementer to read and match it, extracting a helper if none exists. This is the one place the plan defers to the existing code rather than dictating.
