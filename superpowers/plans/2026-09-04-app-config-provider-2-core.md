# ApplicationConfiguration Provider — core-mobile (Plan 2 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React Native ApplicationConfiguration layer in the template repo so super-app and pos-app inherit it, replacing the two redundant application-configuration round-trips with one.

**Architecture:** A pure logic layer (`src/config/`), a partially-persisted zustand store, one consolidated action, and a provider that owns the fetch lifecycle. `SessionProvider.getUserData` stops calling `getGrantedPoliciesApi` and `getCurrentUserIdApi` and reads both from the single configuration.

**Tech Stack:** Expo, React Native, TypeScript, zustand + `persist`, AsyncStorage, jest with the `jest-expo` preset.

**Spec:** `docs/superpowers/specs/2026-09-04-application-configuration-provider-design.md`

## Global Constraints

- `npm run init` MUST run before `tsc` in a fresh clone and after pulling new locale bundles. It needs `SUPPORTED_LOCALES` set in `.env`/`.env.local`; without it you get three phantom `TS2307`s that look like broken source.
- Gate baselines from `AGENTS.md`, measured 2026-08-27: `npm run typecheck` clean, `npm test` 17 suites / 85 tests all passing, `npm run lint` 0 errors / 14 warnings. **Re-measure all three before starting** — the baseline is older than this plan and must be confirmed, not quoted.
- `prettier --check` is NOT a gate: 105 files fail repo-wide at baseline. Format only files you touch; never `--write` the repo.
- The application-configuration call MUST always pass `includeLocalizationResources: false`.
- Time zone MUST come from `timing.timeZone.iana.timeZoneName`. NEVER `setting.values["Abp.Timing.TimeZone"]`, which is a Windows zone id.
- Boolean setting parsing MUST be case-insensitive — real payloads carry both `"True"` and `"false"`.
- `policies` and `user` MUST NOT be persisted. Only `country` and `settings` go to AsyncStorage. `useUserStore` is not persisted today, and persisting grants lets a cold start paint permission-bearing UI from a dead session.
- `objectExtensions` MUST be dropped by the normalizer. It is the largest block in the response, nothing consumes it, and this store is persisted.
- `core`'s `fetchRequest` throws on failure (`Promise<T>`). Do not write `ApiResult`-style `.success` checks here — that is pos-app's contract.
- `UserProfile.grantedPolicies` MUST keep being populated. It is the existing consumer surface; the store is an addition, not a replacement.

---

### Task 1: Pure types, keys and parsers

**Files:**
- Create: `core/src/config/appConfigTypes.ts`
- Create: `core/src/config/appConfigKeys.ts`
- Create: `core/src/config/appConfigParse.ts`
- Test: `core/src/config/__tests__/appConfigParse.test.ts`
- Test: `core/src/config/__tests__/appConfigKeys.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ApplicationConfiguration`, `RawApplicationConfiguration`, `CountryInfo`; `SETTING_KEYS`, `FEATURE_KEYS`; `getSetting(values, key)`, `getBooleanSetting(values, key, fallback?)`, `getNumberSetting(values, key, fallback)`, `getFeature(values, key)`, `getBooleanFeature(values, key, fallback?)`.

- [ ] **Step 1: Confirm the gate baseline before changing anything**

```bash
cd core
git status --short
npm run init
npm run typecheck
npm test
npm run lint
```

Record the actual numbers. If `npm test` does not report 17 suites / 85 tests, the `AGENTS.md` baseline has drifted — use what you measured and say so in the final report. If `git status` shows unrelated files, stop and report rather than stashing.

- [ ] **Step 2: Write the failing parser test**

Create `src/config/__tests__/appConfigParse.test.ts`:

```ts
import {
  getBooleanSetting,
  getFeature,
  getNumberSetting,
  getSetting,
} from "../appConfigParse";

const settings: Record<string, string | null> = {
  "Abp.Identity.User.IsUserNameUpdateEnabled": "True",
  "CountryManagement.EarlyRefund.EarlyRefundAvailable": "false",
  "Abp.Identity.Password.RequiredLength": "6",
  "Abp.Identity.OAuthLogin.Scope": null,
  "Broken.Number": "not-a-number",
  "Shouty.Boolean": "FALSE",
};

describe("getSetting", () => {
  it("returns the raw string", () => {
    expect(getSetting(settings, "Abp.Identity.Password.RequiredLength")).toBe("6");
  });

  it("returns null for a null value", () => {
    expect(getSetting(settings, "Abp.Identity.OAuthLogin.Scope")).toBeNull();
  });

  it("returns null for a missing key", () => {
    expect(getSetting(settings, "Nope.Missing")).toBeNull();
  });
});

describe("getBooleanSetting", () => {
  it("parses capitalised True, as ABP actually sends it", () => {
    expect(
      getBooleanSetting(settings, "Abp.Identity.User.IsUserNameUpdateEnabled"),
    ).toBe(true);
  });

  it("parses lowercase false", () => {
    expect(
      getBooleanSetting(
        settings,
        "CountryManagement.EarlyRefund.EarlyRefundAvailable",
      ),
    ).toBe(false);
  });

  it("parses uppercase FALSE", () => {
    expect(getBooleanSetting(settings, "Shouty.Boolean")).toBe(false);
  });

  it("returns the fallback for a missing key", () => {
    expect(getBooleanSetting(settings, "Nope.Missing", true)).toBe(true);
  });

  it("defaults the fallback to false", () => {
    expect(getBooleanSetting(settings, "Nope.Missing")).toBe(false);
  });

  it("returns the fallback for an unparseable value", () => {
    expect(getBooleanSetting(settings, "Broken.Number", true)).toBe(true);
  });

  it("returns the fallback for a null value", () => {
    expect(
      getBooleanSetting(settings, "Abp.Identity.OAuthLogin.Scope", true),
    ).toBe(true);
  });
});

describe("getNumberSetting", () => {
  it("parses a numeric string", () => {
    expect(
      getNumberSetting(settings, "Abp.Identity.Password.RequiredLength", 8),
    ).toBe(6);
  });

  it("returns the fallback for NaN", () => {
    expect(getNumberSetting(settings, "Broken.Number", 8)).toBe(8);
  });
});

describe("getFeature", () => {
  it("returns a string enum value untouched", () => {
    expect(getFeature({ "Identity.TwoFactor": "Optional" }, "Identity.TwoFactor")).toBe(
      "Optional",
    );
  });
});
```

- [ ] **Step 3: Write the failing keys test**

A typo in a key resolves to `undefined`, which `getBooleanSetting` reads as `false`, which silently hides a feature. This test is the guard.

Create `src/config/__tests__/appConfigKeys.test.ts`:

```ts
import { FEATURE_KEYS, SETTING_KEYS } from "../appConfigKeys";

describe("SETTING_KEYS", () => {
  it("matches the exact strings the backend sends", () => {
    expect(SETTING_KEYS.earlyRefundAvailable).toBe(
      "CountryManagement.EarlyRefund.EarlyRefundAvailable",
    );
  });

  it("does not expose the Windows time zone setting", () => {
    // setting.values["Abp.Timing.TimeZone"] is "GMT Standard Time", which
    // Intl.DateTimeFormat rejects. IANA comes from timing.timeZone.iana.
    expect(Object.values(SETTING_KEYS)).not.toContain("Abp.Timing.TimeZone");
  });
});

describe("FEATURE_KEYS", () => {
  it("matches the exact strings the backend sends", () => {
    expect(FEATURE_KEYS.twoFactor).toBe("Identity.TwoFactor");
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd core && npm test -- appConfig`
Expected: FAIL — `Cannot find module '../appConfigParse'`.

- [ ] **Step 5: Write `appConfigTypes.ts`**

```ts
import type { Volo_Abp_AspNetCore_Mvc_ApplicationConfigurations_ApplicationConfigurationDto } from "@/saas/AccountService";
import type { UniRefund_AdministrationService_CountrySettings_CountrySettingInfoDto } from "@/saas/AdministrationService";

export type RawApplicationConfiguration =
  Volo_Abp_AspNetCore_Mvc_ApplicationConfigurations_ApplicationConfigurationDto;

export type CountryInfo =
  UniRefund_AdministrationService_CountrySettings_CountrySettingInfoDto;

export interface ApplicationConfigurationUser {
  isAuthenticated: boolean;
  id: string | null;
  userName: string | null;
  name: string | null;
  surName: string | null;
  email: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  /** ABP identity roles (e.g. ["admin"]) — NOT a CRM party type. */
  roles: string[];
  sessionId: string | null;
}

export interface ApplicationConfigurationTenant {
  id: string | null;
  name: string | null;
  isAvailable: boolean;
  isHost: boolean;
}

export interface ApplicationConfigurationCountry {
  currency: string;
  countryCode2: string | null;
  countryCode3: string | null;
  countryName: string | null;
}

export interface ApplicationConfiguration {
  user: ApplicationConfigurationUser;
  tenant: ApplicationConfigurationTenant;
  country: ApplicationConfigurationCountry;
  /** IANA, e.g. "Europe/London". Never a Windows zone id. */
  timeZone: string;
  policies: Record<string, boolean>;
  settings: Record<string, string | null>;
  features: Record<string, string | null>;
}
```

- [ ] **Step 6: Write `appConfigKeys.ts`**

```ts
/**
 * Setting keys, as named constants so a typo fails `appConfigKeys.test.ts`
 * rather than resolving to `undefined` and reading as `false`.
 *
 * `Abp.Timing.TimeZone` is deliberately absent. Its value is a Windows zone id
 * ("GMT Standard Time") which `Intl.DateTimeFormat` rejects; the IANA zone
 * comes from `timing.timeZone.iana.timeZoneName`.
 *
 * Only keys with a live consumer belong here. The backend exposes settings to
 * clients one at a time via ABP's `IsVisibleToClients`, and as of 2026-09-04
 * `EarlyRefundAvailable` is the only `CountryManagement.*` key in the payload.
 */
export const SETTING_KEYS = {
  earlyRefundAvailable: "CountryManagement.EarlyRefund.EarlyRefundAvailable",
} as const;

export const FEATURE_KEYS = {
  /** A string enum ("Optional"), not a boolean — read with `getFeature`. */
  twoFactor: "Identity.TwoFactor",
} as const;
```

- [ ] **Step 7: Write `appConfigParse.ts`**

```ts
type Values = Record<string, string | null>;

export function getSetting(values: Values, key: string): string | null {
  return values[key] ?? null;
}

/**
 * ABP sends every setting as a string and is not consistent about casing: the
 * same payload carries both `"True"` and `"false"`. A `=== "true"` check reads
 * roughly half the settings as false.
 */
export function getBooleanSetting(
  values: Values,
  key: string,
  fallback = false,
): boolean {
  const raw = values[key];
  if (raw === null || raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}

/**
 * Trims and rejects empty input before parsing. Both matter: `Number("")` and
 * `Number("   ")` are `0`, not `NaN`, so a `NaN`-only guard silently turns a
 * blank setting into `0` — which for the numeric password-policy keys would
 * mean `RequiredLength: 0`.
 */
export function getNumberSetting(
  values: Values,
  key: string,
  fallback: number,
): number {
  const raw = values[key]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function getFeature(values: Values, key: string): string | null {
  return values[key] ?? null;
}

export function getBooleanFeature(
  values: Values,
  key: string,
  fallback = false,
): boolean {
  return getBooleanSetting(values, key, fallback);
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd core && npm test -- appConfig`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd core
git add src/config
git commit -m "feat(app-config): add pure types, keys and setting parsers"
```

---

### Task 2: Normalizer

**Files:**
- Create: `core/src/config/isHostTenant.ts`
- Create: `core/src/config/normalizeApplicationConfiguration.ts`
- Test: `core/src/config/__tests__/normalizeApplicationConfiguration.test.ts`
- Test fixture: `core/src/config/__tests__/applicationConfiguration.fixture.ts`

**Interfaces:**
- Consumes: types from Task 1.
- Produces: `isHostTenant(tenantId)` → boolean; `normalizeApplicationConfiguration(raw, countryInfo)` → `ApplicationConfiguration`; `EMPTY_APPLICATION_CONFIGURATION`.

- [ ] **Step 1: Write the fixture**

Trimmed from a live authenticated staff session on 2026-09-04, tenant "Faroe Islands". GUIDs and the email are redacted; every key name and value shape is verbatim.

Create `src/config/__tests__/applicationConfiguration.fixture.ts`:

```ts
import type { RawApplicationConfiguration } from "../appConfigTypes";

export const applicationConfigurationFixture = {
  auth: {
    grantedPolicies: {
      "TagService.Tags": true,
      "TagService.Tags.Create": true,
      "UniRefund.Settings.GetValues": true,
    },
  },
  setting: {
    values: {
      "Abp.Localization.DefaultLanguage": "en",
      // A Windows zone id. Never read this for a time zone.
      "Abp.Timing.TimeZone": "GMT Standard Time",
      "Abp.Identity.User.IsUserNameUpdateEnabled": "True",
      "Abp.Identity.OAuthLogin.Scope": null,
      "CountryManagement.EarlyRefund.EarlyRefundAvailable": "false",
    },
  },
  currentUser: {
    isAuthenticated: true,
    id: "00000000-0000-0000-0000-00000000user",
    tenantId: "00000000-0000-0000-0000-000000tenant",
    userName: "admin",
    name: "admin",
    surName: null,
    email: "redacted@example.com",
    emailVerified: false,
    phoneNumber: null,
    phoneNumberVerified: false,
    roles: ["admin"],
    sessionId: "00000000-0000-0000-0000-00000session",
  },
  features: { values: { "Identity.TwoFactor": "Optional" } },
  globalFeatures: { enabledFeatures: [] },
  multiTenancy: { isEnabled: true },
  currentTenant: {
    id: "00000000-0000-0000-0000-000000tenant",
    name: "Faroe Islands",
    isAvailable: true,
  },
  timing: {
    timeZone: {
      iana: { timeZoneName: "Europe/London" },
      windows: { timeZoneId: "GMT Standard Time" },
    },
  },
  clock: { kind: "Unspecified" },
  // The largest block in the real response and consumed by nothing.
  objectExtensions: { modules: { Identity: { entities: {} } } },
} as unknown as RawApplicationConfiguration;
```

- [ ] **Step 2: Write the failing normalizer test**

Create `src/config/__tests__/normalizeApplicationConfiguration.test.ts`:

```ts
import {
  EMPTY_APPLICATION_CONFIGURATION,
  normalizeApplicationConfiguration,
} from "../normalizeApplicationConfiguration";
import { applicationConfigurationFixture } from "./applicationConfiguration.fixture";

const country = {
  tenantId: "00000000-0000-0000-0000-000000tenant",
  tenantName: "Faroe Islands",
  timeZone: "Europe/London",
  currency: "GBP",
  countryCode2: "FO",
  countryCode3: "FRO",
  countryName: "Faroe Islands",
};

describe("normalizeApplicationConfiguration", () => {
  it("takes the IANA time zone, not the Windows id", () => {
    const config = normalizeApplicationConfiguration(
      applicationConfigurationFixture,
      undefined,
    );
    expect(config.timeZone).toBe("Europe/London");
  });

  it("falls back to UTC when timing is absent", () => {
    expect(normalizeApplicationConfiguration({}, undefined).timeZone).toBe("UTC");
  });

  it("drops objectExtensions so it never reaches AsyncStorage", () => {
    const config = normalizeApplicationConfiguration(
      applicationConfigurationFixture,
      undefined,
    );
    expect("objectExtensions" in config).toBe(false);
  });

  it("carries policies through", () => {
    const config = normalizeApplicationConfiguration(
      applicationConfigurationFixture,
      undefined,
    );
    expect(config.policies["TagService.Tags.Create"]).toBe(true);
    expect(config.policies["Nope.Missing"]).toBeUndefined();
  });

  it("maps the current user, keeping roles as identity roles", () => {
    const config = normalizeApplicationConfiguration(
      applicationConfigurationFixture,
      undefined,
    );
    expect(config.user.id).toBe("00000000-0000-0000-0000-00000000user");
    expect(config.user.roles).toEqual(["admin"]);
  });

  it("reports a real tenant as not host", () => {
    const config = normalizeApplicationConfiguration(
      applicationConfigurationFixture,
      undefined,
    );
    expect(config.tenant.name).toBe("Faroe Islands");
    expect(config.tenant.isHost).toBe(false);
  });

  it("treats a null tenant id as host", () => {
    const config = normalizeApplicationConfiguration(
      { currentTenant: { id: null, name: null, isAvailable: true } },
      undefined,
    );
    expect(config.tenant.isHost).toBe(true);
  });

  it("treats Guid.Empty as host, as country-settings reports it", () => {
    const config = normalizeApplicationConfiguration({}, {
      ...country,
      tenantId: "00000000-0000-0000-0000-000000000000",
    });
    expect(config.tenant.isHost).toBe(true);
  });

  it("fills the country block from country-settings", () => {
    const config = normalizeApplicationConfiguration(
      applicationConfigurationFixture,
      country,
    );
    expect(config.country.currency).toBe("GBP");
    expect(config.country.countryCode2).toBe("FO");
    expect(config.country.countryName).toBe("Faroe Islands");
  });

  it("defaults currency to TRY when country-settings is unavailable", () => {
    const config = normalizeApplicationConfiguration(
      applicationConfigurationFixture,
      undefined,
    );
    expect(config.country.currency).toBe("TRY");
    expect(config.country.countryCode2).toBeNull();
  });

  it("exposes an empty, fail-closed default", () => {
    expect(EMPTY_APPLICATION_CONFIGURATION.policies).toEqual({});
    expect(EMPTY_APPLICATION_CONFIGURATION.user.isAuthenticated).toBe(false);
    expect(EMPTY_APPLICATION_CONFIGURATION.tenant.isHost).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd core && npm test -- normalizeApplicationConfiguration`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `isHostTenant.ts`**

```ts
/**
 * Whether a tenant id denotes the host (no tenant selected).
 *
 * The backend represents "no tenant" two different ways depending on the
 * endpoint: application-configuration returns `currentTenant.id` as `null`,
 * while country-settings returns `tenantId` as `Guid.Empty` — the string
 * "00000000-0000-0000-0000-000000000000". That value is truthy, so a bare
 * `!tenantId` check reports every host session as a tenant.
 */
const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";

export function isHostTenant(tenantId: string | null | undefined): boolean {
  if (!tenantId) return true;
  return tenantId.toLowerCase() === EMPTY_GUID;
}
```

- [ ] **Step 5: Write `normalizeApplicationConfiguration.ts`**

```ts
import { isHostTenant } from "./isHostTenant";
import type {
  ApplicationConfiguration,
  CountryInfo,
  RawApplicationConfiguration,
} from "./appConfigTypes";

/** Matches the value the app historically hardcoded, so the UI never regresses. */
const DEFAULT_CURRENCY = "TRY";
const DEFAULT_TIME_ZONE = "UTC";

export const EMPTY_APPLICATION_CONFIGURATION: ApplicationConfiguration = {
  user: {
    isAuthenticated: false,
    id: null,
    userName: null,
    name: null,
    surName: null,
    email: null,
    emailVerified: false,
    phoneNumber: null,
    roles: [],
    sessionId: null,
  },
  tenant: { id: null, name: null, isAvailable: false, isHost: true },
  country: {
    currency: DEFAULT_CURRENCY,
    countryCode2: null,
    countryCode3: null,
    countryName: null,
  },
  timeZone: DEFAULT_TIME_ZONE,
  policies: {},
  settings: {},
  features: {},
};

/**
 * Projects the raw ABP payload onto the app's contract.
 *
 * Deliberately drops `objectExtensions`, `localization.*`, `globalFeatures`,
 * `clock` and `multiTenancy`: nothing consumes them, and this result is
 * persisted to AsyncStorage — `objectExtensions` alone is the largest block in
 * the response.
 *
 * `country` comes from a second endpoint because application-configuration
 * exposes none of `currency`, `countryCode2`, `countryCode3` or `countryName`.
 * When the backend marks those settings visible-to-clients, read them from
 * `settings` here and the caller can stop fetching `countryInfo`.
 */
export function normalizeApplicationConfiguration(
  raw: RawApplicationConfiguration,
  countryInfo: CountryInfo | undefined,
): ApplicationConfiguration {
  const tenantId = raw.currentTenant?.id ?? countryInfo?.tenantId ?? null;

  return {
    user: {
      isAuthenticated: raw.currentUser?.isAuthenticated ?? false,
      id: raw.currentUser?.id ?? null,
      userName: raw.currentUser?.userName ?? null,
      name: raw.currentUser?.name ?? null,
      surName: raw.currentUser?.surName ?? null,
      email: raw.currentUser?.email ?? null,
      emailVerified: raw.currentUser?.emailVerified ?? false,
      phoneNumber: raw.currentUser?.phoneNumber ?? null,
      roles: raw.currentUser?.roles ?? [],
      sessionId: raw.currentUser?.sessionId ?? null,
    },
    tenant: {
      id: tenantId,
      name: raw.currentTenant?.name ?? countryInfo?.tenantName ?? null,
      isAvailable: raw.currentTenant?.isAvailable ?? false,
      isHost: isHostTenant(tenantId),
    },
    country: {
      // `||`, not `??`: the backend can send an empty string, and `??` would
      // pass it through. See the time zone below for why that matters.
      currency: countryInfo?.currency || DEFAULT_CURRENCY,
      countryCode2: countryInfo?.countryCode2 ?? null,
      countryCode3: countryInfo?.countryCode3 ?? null,
      countryName: countryInfo?.countryName ?? null,
    },
    // The IANA zone. `setting.values["Abp.Timing.TimeZone"]` is a Windows id
    // and `Intl.DateTimeFormat` throws on it.
    //
    // `||` rather than `??` is load-bearing: an empty string survives `??`,
    // and this value reaches `Intl.DateTimeFormat`, which throws
    // `RangeError: Invalid time zone specified:` on `""`. Neither field has a
    // meaningful falsy value, so coercing them costs nothing.
    timeZone:
      raw.timing?.timeZone?.iana?.timeZoneName ||
      countryInfo?.timeZone ||
      DEFAULT_TIME_ZONE,
    policies: (raw.auth?.grantedPolicies ?? {}) as Record<string, boolean>,
    settings: raw.setting?.values ?? {},
    features: raw.features?.values ?? {},
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd core && npm test -- appConfig normalizeApplicationConfiguration`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd core
git add src/config
git commit -m "feat(app-config): normalize the ABP payload onto one contract"
```

---

### Task 3: Store

**Files:**
- Create: `core/src/store/application-configuration.ts`
- Test: `core/src/store/__tests__/application-configuration.test.ts`

**Interfaces:**
- Consumes: `ApplicationConfiguration`, `EMPTY_APPLICATION_CONFIGURATION`, `SETTING_KEYS`, `getBooleanSetting` from Tasks 1–2.
- Produces: default export `useApplicationConfigurationStore` with state `{ configuration, isLoaded }` and actions `setConfiguration(config)`, `clearConfiguration()`. Named exports `useIsHost()`, `useTenantTimeZone()`, `useAppCurrency()`, `useSettingFlag(key, fallback?)`.

- [ ] **Step 1: Write the failing store test**

Create `src/store/__tests__/application-configuration.test.ts`:

```ts
import useApplicationConfigurationStore from "../application-configuration";
import { EMPTY_APPLICATION_CONFIGURATION } from "@/config/normalizeApplicationConfiguration";

const populated = {
  ...EMPTY_APPLICATION_CONFIGURATION,
  user: { ...EMPTY_APPLICATION_CONFIGURATION.user, id: "u1", isAuthenticated: true },
  tenant: { id: "t1", name: "Faroe Islands", isAvailable: true, isHost: false },
  country: {
    currency: "GBP",
    countryCode2: "FO",
    countryCode3: "FRO",
    countryName: "Faroe Islands",
  },
  timeZone: "Europe/London",
  policies: { "TagService.Tags": true },
  settings: { "CountryManagement.EarlyRefund.EarlyRefundAvailable": "true" },
};

describe("useApplicationConfigurationStore", () => {
  beforeEach(() => {
    useApplicationConfigurationStore.getState().clearConfiguration();
  });

  it("starts empty and unloaded", () => {
    const state = useApplicationConfigurationStore.getState();
    expect(state.isLoaded).toBe(false);
    expect(state.configuration.policies).toEqual({});
  });

  it("stores a configuration and marks itself loaded", () => {
    useApplicationConfigurationStore.getState().setConfiguration(populated);
    const state = useApplicationConfigurationStore.getState();
    expect(state.isLoaded).toBe(true);
    expect(state.configuration.tenant.name).toBe("Faroe Islands");
    expect(state.configuration.policies["TagService.Tags"]).toBe(true);
  });

  it("clears back to the fail-closed empty configuration", () => {
    useApplicationConfigurationStore.getState().setConfiguration(populated);
    useApplicationConfigurationStore.getState().clearConfiguration();
    const state = useApplicationConfigurationStore.getState();
    expect(state.configuration.policies).toEqual({});
    expect(state.configuration.user.isAuthenticated).toBe(false);
    expect(state.isLoaded).toBe(false);
  });

  it("persists only country and settings, never policies or user", () => {
    // A cold start must not be able to paint permission-bearing UI from a
    // dead session's grants.
    const persisted = useApplicationConfigurationStore.persist
      ? (useApplicationConfigurationStore.persist.getOptions().partialize?.({
          ...useApplicationConfigurationStore.getState(),
          configuration: populated,
        }) as Record<string, unknown>)
      : {};
    const config = (persisted as { configuration?: Record<string, unknown> })
      .configuration;
    expect(config).toBeDefined();
    expect(Object.keys(config ?? {}).sort()).toEqual(["country", "settings"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd core && npm test -- application-configuration`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the store**

This is the **first persisted store in core** — `grep -rn "persist(" core/src` returns nothing. Both required dependencies are already present (`zustand@^5.0.8`, `@react-native-async-storage/async-storage@2.2.0`, matching super-app exactly), so no install is needed. Use the same `persist` + `createJSONStorage` shape super-app uses in its `country-settings.ts`.

Note the import split: `EMPTY_APPLICATION_CONFIGURATION` is a value defined in `normalizeApplicationConfiguration.ts`, but the `ApplicationConfiguration` **type** lives in `appConfigTypes.ts` and is not re-exported by the normalizer. Importing the type from the normalizer will not compile.

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { SETTING_KEYS } from "@/config/appConfigKeys";
import { getBooleanSetting } from "@/config/appConfigParse";
import type { ApplicationConfiguration } from "@/config/appConfigTypes";
import { EMPTY_APPLICATION_CONFIGURATION } from "@/config/normalizeApplicationConfiguration";

interface ApplicationConfigurationStore {
  configuration: ApplicationConfiguration;
  /** False until a fetch has landed, so consumers can tell empty from unknown. */
  isLoaded: boolean;
  setConfiguration: (configuration: ApplicationConfiguration) => void;
  clearConfiguration: () => void;
}

const useApplicationConfigurationStore = create<ApplicationConfigurationStore>()(
  persist(
    (set) => ({
      configuration: EMPTY_APPLICATION_CONFIGURATION,
      isLoaded: false,
      setConfiguration: (configuration) => set({ configuration, isLoaded: true }),
      clearConfiguration: () =>
        set({ configuration: EMPTY_APPLICATION_CONFIGURATION, isLoaded: false }),
    }),
    {
      name: "application-configuration-storage",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      /**
       * Only the tenant-wide facts survive a restart. `policies` and `user`
       * are session-scoped: persisting grants would let a cold start render
       * permission-bearing UI from a session that is already dead, and
       * `isLoaded` must start false so a stale country block is never mistaken
       * for a completed fetch.
       */
      partialize: (state) => ({
        configuration: {
          country: state.configuration.country,
          settings: state.configuration.settings,
        },
      }),
      merge: (persisted, current) => {
        const saved = (persisted as { configuration?: Partial<ApplicationConfiguration> })
          ?.configuration;
        return {
          ...current,
          configuration: {
            ...current.configuration,
            country: saved?.country ?? current.configuration.country,
            settings: saved?.settings ?? current.configuration.settings,
          },
        };
      },
    },
  ),
);

export default useApplicationConfigurationStore;

export const useIsHost = () =>
  useApplicationConfigurationStore((state) => state.configuration.tenant.isHost);

export const useTenantTimeZone = () =>
  useApplicationConfigurationStore((state) => state.configuration.timeZone);

export const useAppCurrency = () =>
  useApplicationConfigurationStore((state) => state.configuration.country.currency);

/** Reads a boolean setting. Fail-closed by default. */
export const useSettingFlag = (key: string, fallback = false) =>
  useApplicationConfigurationStore((state) =>
    getBooleanSetting(state.configuration.settings, key, fallback),
  );

export const useEarlyRefundAvailable = () =>
  useSettingFlag(SETTING_KEYS.earlyRefundAvailable);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd core && npm test -- application-configuration`
Expected: PASS. If `persist.getOptions().partialize` is not reachable in this zustand version, replace that assertion with a direct call to the `partialize` function exported for the purpose — do not delete the assertion, it is the guard on the persistence boundary.

- [ ] **Step 5: Commit**

```bash
cd core
git add src/store/application-configuration.ts src/store/__tests__
git commit -m "feat(app-config): add the partially-persisted configuration store"
```

---

### Task 4: Consolidate the action

**Files:**
- Modify: `core/src/actions/AccountService/actions.ts`

**Interfaces:**
- Consumes: `normalizeApplicationConfiguration`, `CountryInfo` from Task 2; the existing `getCountrySettingsInfo` from `src/actions/AdministrationService/actions.ts`.
- Produces: `getApplicationConfigurationApi(): Promise<ApplicationConfiguration>`. `getGrantedPoliciesApi` and `getCurrentUserIdApi` are deleted.

- [ ] **Step 1: Write the consolidated action**

Replace `getGrantedPoliciesApi` and `getCurrentUserIdApi` in `src/actions/AccountService/actions.ts` with one function. They fetched the same response twice to read one field each.

```ts
export async function getApplicationConfigurationApi() {
  const [configResult, countryResult] = await Promise.allSettled([
    fetchRequest(async (customHeaders) => {
      const client = await getAccountServiceClient(customHeaders);
      // `includeLocalizationResources: false` is what keeps this at ~19 KB /
      // ~225 ms instead of ~397 KB / ~900 ms.
      return await client.abpApplicationConfiguration.getApiAbpApplicationConfiguration(
        { includeLocalizationResources: false },
      );
    }, "getApplicationConfigurationApi"),
    getCountrySettingsInfo(),
  ]);

  if (configResult.status === "rejected") {
    throw configResult.reason;
  }

  // The country lookup is independent: losing it costs the currency and
  // country code, not the session's permissions.
  return normalizeApplicationConfiguration(
    configResult.value,
    countryResult.status === "fulfilled"
      ? (countryResult.value as CountryInfo)
      : undefined,
  );
}
```

Add the imports at the top of the file:

```ts
import { getCountrySettingsInfo } from "../AdministrationService/actions";
import { normalizeApplicationConfiguration } from "@/config/normalizeApplicationConfiguration";
import type { CountryInfo } from "@/config/appConfigTypes";
```

`fetchRequest` in this repo throws rather than returning a result object, which is why the rejection is re-thrown rather than mapped. Leave `getProfilePictureByIdApi` and `getUserProfileApi` untouched.

- [ ] **Step 2: Type-check**

Run: `cd core && npm run typecheck`
Expected: errors only where `getGrantedPoliciesApi` / `getCurrentUserIdApi` were imported — that is `src/providers/SessionProvider.tsx`, fixed in Task 5. Confirm the list is exactly that:

Run: `grep -rn "getGrantedPoliciesApi\|getCurrentUserIdApi" core/src --include="*.ts" --include="*.tsx"`

- [ ] **Step 3: Commit**

```bash
cd core
git add src/actions/AccountService/actions.ts
git commit -m "perf(app-config): fetch application configuration once, not twice"
```

---

### Task 5: Provider and SessionProvider wiring

**Files:**
- Create: `core/src/providers/ApplicationConfigurationProvider.tsx`
- Modify: `core/src/providers/SessionProvider.tsx`
- Modify: `core/src/app/_layout.tsx`

**Interfaces:**
- Consumes: `getApplicationConfigurationApi` (Task 4), `useApplicationConfigurationStore` (Task 3).
- Produces: `ApplicationConfigurationProvider`, and `useApplicationConfiguration()` returning `{ configuration, isLoaded, refresh }` where `refresh: () => Promise<void>`.

- [ ] **Step 1: Locate the composition site**

It is `core/src/app/_layout.tsx` — expo-router lives under `src/app` in this repo, not a top-level `app/`. Read it first:

Run: `grep -n "Provider" core/src/app/_layout.tsx`

Mount `ApplicationConfigurationProvider` inside `SessionProvider` (it needs a token) and above anything that reads configuration.

- [ ] **Step 2: Write the provider**

```tsx
import { getApplicationConfigurationApi } from "@/actions/AccountService/actions";
import useApplicationConfigurationStore from "@/store/application-configuration";
import { logger } from "@/utils/logger";
import { createContext, use, useCallback, useMemo, type PropsWithChildren } from "react";

const ApplicationConfigurationContext = createContext<{
  refresh: () => Promise<void>;
}>({ refresh: async () => undefined });

/**
 * Reload the configuration. Call after anything that can change the session's
 * grants or tenant — a tenant switch, an affiliation switch, a token refresh.
 */
export const useApplicationConfigurationRefresh = () =>
  use(ApplicationConfigurationContext).refresh;

export function useApplicationConfiguration() {
  const configuration = useApplicationConfigurationStore(
    (state) => state.configuration,
  );
  const isLoaded = useApplicationConfigurationStore((state) => state.isLoaded);
  const refresh = useApplicationConfigurationRefresh();
  return useMemo(
    () => ({ configuration, isLoaded, refresh }),
    [configuration, isLoaded, refresh],
  );
}

export function ApplicationConfigurationProvider({ children }: PropsWithChildren) {
  const setConfiguration = useApplicationConfigurationStore(
    (state) => state.setConfiguration,
  );

  /**
   * Never throws. A failed load leaves whatever the store holds — on a cold
   * start that is the fail-closed empty configuration with an empty policy
   * map, so permission-gated UI stays hidden.
   */
  const refresh = useCallback(async () => {
    try {
      setConfiguration(await getApplicationConfigurationApi());
    } catch (error) {
      logger.error("Failed to load application configuration:", error);
    }
  }, [setConfiguration]);

  const value = useMemo(() => ({ refresh }), [refresh]);

  return (
    <ApplicationConfigurationContext.Provider value={value}>
      {children}
    </ApplicationConfigurationContext.Provider>
  );
}
```

- [ ] **Step 3: Rewire `getUserData` in `SessionProvider.tsx`**

Replace the three-call `Promise.all` at lines ~222–225. The user id now comes from the configuration rather than its own round-trip.

```ts
    let userResult;
    let configResult;

    try {
      [userResult, configResult] = await Promise.all([
        getUserProfileApi(),
        getApplicationConfigurationApi(),
      ]);
    } catch (error) {
      console.error("Failed to fetch user data:", error);
      return;
    }

    const userData = userResult ? userResult : null;
    const userId = configResult?.user.id ?? null;
    const grantedPolicies = configResult?.policies ?? null;

    // The store is what new code reads; `user.grantedPolicies` stays populated
    // for the existing consumers.
    useApplicationConfigurationStore.getState().setConfiguration(configResult);
```

Keep the profile-picture block, the `decodeJWT` call, the `if (!userData || !userId || !jwtUser || !grantedPolicies) return;` guard and the `setUser({...})` call exactly as they are — `grantedPolicies` still flows into the user store.

Update the imports: drop `getCurrentUserIdApi` and `getGrantedPoliciesApi`, add `getApplicationConfigurationApi` and `useApplicationConfigurationStore`.

Delete the stale comment at the top of `getUserData` about country settings being fetched in parallel — this function has never fetched them, and after this change the configuration call does.

- [ ] **Step 4: Clear the store on sign-out**

In the `signOut` callback (around line 281, where `clearUser()` is called), add:

```ts
    useApplicationConfigurationStore.getState().clearConfiguration();
```

A store left populated is the next account's data on screen.

- [ ] **Step 5: Mount the provider**

Add `ApplicationConfigurationProvider` to the composition site found in Step 1, inside `SessionProvider`.

- [ ] **Step 6: Type-check and test**

Run: `cd core && npm run typecheck`
Expected: clean, matching the Task 1 Step 1 baseline.

Run: `cd core && npm test`
Expected: the Task 1 Step 1 suite/test counts plus the new suites, all passing.

- [ ] **Step 7: Commit**

```bash
cd core
git add src/providers src/store app
git commit -m "feat(app-config): mount ApplicationConfigurationProvider and consolidate session load"
```

---

### Task 6: Verification

**Files:** none modified.

- [ ] **Step 1: Full gate run**

```bash
cd core
npm run init
npm run typecheck
npm test
npm run lint
```

Expected: matches the numbers recorded in Task 1 Step 1, plus the new suites. Report the actual counts, not the `AGENTS.md` figures.

- [ ] **Step 2: Confirm the duplicate call is gone**

```bash
grep -rn "getApiAbpApplicationConfiguration" core/src --include="*.ts"
```

Expected: exactly one hit outside `src/saas/` — inside `getApplicationConfigurationApi`. Two hits means a caller was missed.

- [ ] **Step 3: Format only what you touched**

```bash
cd core
npx prettier --write src/config src/store/application-configuration.ts \
  src/providers/ApplicationConfigurationProvider.tsx \
  src/providers/SessionProvider.tsx src/actions/AccountService/actions.ts
```

Never `--write` the repo: 105 files fail `prettier --check` at baseline and it is not a gate.

- [ ] **Step 4: Update `AGENTS.md` gate baselines**

Replace the baseline table numbers and the measurement date with what you measured, since the suite count changed. This is what the next session will quote.

- [ ] **Step 5: Commit**

```bash
cd core
git add AGENTS.md src
git commit -m "docs: re-measure gate baselines after app-config provider"
```
