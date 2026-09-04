# ApplicationConfiguration Provider — web-app (Plan 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one cached `/api/abp/application-configuration` fetch the single source for permissions, user, tenant and settings in web-app, collapsing ~128 duplicate calls per page render to 2.

**Architecture:** A pure logic layer (types, keys, parsers, normalizer) in `packages/utils/app-config/`, a request-cached server fetch that composes application-configuration with one `country-settings/info` call, and a client provider. The existing `useTenant` and `useGrantedPolicies` hooks become adapters over it, so no consumer call site changes.

**Tech Stack:** Next.js 16 App Router, React 19 (`cache()`), TypeScript, pnpm workspaces, `node --import tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-04-application-configuration-provider-design.md`

## Global Constraints

- The application-configuration call MUST always pass `includeLocalizationResources: false`. It is the difference between 19 KB / ~225 ms and 397 KB / ~900 ms.
- Time zone MUST come from `timing.timeZone.iana.timeZoneName`. NEVER from `setting.values["Abp.Timing.TimeZone"]`, which is a Windows id (`"GMT Standard Time"`) that `Intl.DateTimeFormat` rejects.
- Boolean setting parsing MUST be case-insensitive. Real payloads contain both `"True"` and `"false"`.
- Fail closed: when application-configuration fails, `policies` is `{}` so `isActionGranted` returns false. This matches today's `catch → return undefined`.
- The two requests MUST fail independently. A country-settings failure must not empty `policies`.
- `useTenant()` and `useGrantedPolicies()` MUST keep their current return shapes. 117 files destructure `localization`; 145 read policies.
- Pure modules MUST NOT import React, `next/*`, or anything under `../auth`. They are imported by both server and client code and by the test runner.
- Existing test style: `node:test` + `node:assert/strict`, files named `*.test.ts` under `apps/web/src`. No vitest, no jest, no JSX in tests.

---

### Task 1: Pure types, keys and parsers

**Files:**
- Create: `web-app/packages/utils/app-config/types.ts`
- Create: `web-app/packages/utils/app-config/keys.ts`
- Create: `web-app/packages/utils/app-config/parse.ts`
- Create: `web-app/packages/utils/app-config/logic.ts`
- Modify: `web-app/packages/utils/package.json` (add the `./app-config/logic` export)
- Test: `web-app/apps/web/src/utils/app-config/parse.test.ts`
- Test: `web-app/apps/web/src/utils/app-config/keys.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ApplicationConfiguration`, `RawApplicationConfiguration`, `CountryInfo` types; `SETTING_KEYS`, `FEATURE_KEYS`; `getSetting(settings, key)`, `getBooleanSetting(settings, key, fallback?)`, `getNumberSetting(settings, key, fallback)`, `getFeature(features, key)`. All re-exported from `@repo/utils/app-config/logic`.

- [ ] **Step 1: Add the subpath export**

`packages/utils/package.json` maps `./*` to `./*/index.tsx`, which would force the pure layer through a React barrel. Add an explicit entry (explicit keys win over the `./*` pattern) inside `exports`, after `"./*"`:

```json
    "./app-config/logic": "./app-config/logic.ts",
```

- [ ] **Step 2: Write the failing parser tests**

Create `apps/web/src/utils/app-config/parse.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getBooleanSetting,
  getNumberSetting,
  getSetting,
} from "@repo/utils/app-config/logic";

const settings: Record<string, string | null> = {
  "Abp.Identity.User.IsUserNameUpdateEnabled": "True",
  "CountryManagement.EarlyRefund.EarlyRefundAvailable": "false",
  "Abp.Identity.Password.RequiredLength": "6",
  "Abp.Identity.OAuthLogin.Scope": null,
  "Broken.Number": "not-a-number",
  "Shouty.Boolean": "FALSE",
};

void describe("getSetting", () => {
  void it("returns the raw string", () => {
    assert.equal(getSetting(settings, "Abp.Identity.Password.RequiredLength"), "6");
  });

  void it("returns null for a null value", () => {
    assert.equal(getSetting(settings, "Abp.Identity.OAuthLogin.Scope"), null);
  });

  void it("returns null for a missing key", () => {
    assert.equal(getSetting(settings, "Nope.Missing"), null);
  });
});

void describe("getBooleanSetting", () => {
  void it("parses capitalised True, as ABP actually sends it", () => {
    assert.equal(
      getBooleanSetting(settings, "Abp.Identity.User.IsUserNameUpdateEnabled"),
      true,
    );
  });

  void it("parses lowercase false", () => {
    assert.equal(
      getBooleanSetting(
        settings,
        "CountryManagement.EarlyRefund.EarlyRefundAvailable",
      ),
      false,
    );
  });

  void it("parses uppercase FALSE", () => {
    assert.equal(getBooleanSetting(settings, "Shouty.Boolean"), false);
  });

  void it("returns the fallback for a missing key", () => {
    assert.equal(getBooleanSetting(settings, "Nope.Missing", true), true);
  });

  void it("defaults the fallback to false", () => {
    assert.equal(getBooleanSetting(settings, "Nope.Missing"), false);
  });

  void it("returns the fallback for an unparseable value", () => {
    assert.equal(getBooleanSetting(settings, "Broken.Number", true), true);
  });

  void it("returns the fallback for a null value", () => {
    assert.equal(
      getBooleanSetting(settings, "Abp.Identity.OAuthLogin.Scope", true),
      true,
    );
  });
});

void describe("getNumberSetting", () => {
  void it("parses a numeric string", () => {
    assert.equal(
      getNumberSetting(settings, "Abp.Identity.Password.RequiredLength", 8),
      6,
    );
  });

  void it("returns the fallback for NaN", () => {
    assert.equal(getNumberSetting(settings, "Broken.Number", 8), 8);
  });

  void it("returns the fallback for a missing key", () => {
    assert.equal(getNumberSetting(settings, "Nope.Missing", 8), 8);
  });
});
```

- [ ] **Step 3: Write the failing keys test**

The whole point of this test: a typo in a key string resolves to `undefined`, which `getBooleanSetting` reads as `false`, which silently hides a feature. Assert the literals.

Create `apps/web/src/utils/app-config/keys.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FEATURE_KEYS, SETTING_KEYS } from "@repo/utils/app-config/logic";

void describe("SETTING_KEYS", () => {
  void it("matches the exact strings the backend sends", () => {
    assert.equal(
      SETTING_KEYS.earlyRefundAvailable,
      "CountryManagement.EarlyRefund.EarlyRefundAvailable",
    );
  });

  void it("does not expose the Windows time zone setting", () => {
    // setting.values["Abp.Timing.TimeZone"] is "GMT Standard Time", which
    // Intl.DateTimeFormat rejects. IANA comes from timing.timeZone.iana.
    assert.equal(
      Object.values(SETTING_KEYS).includes("Abp.Timing.TimeZone" as never),
      false,
    );
  });
});

void describe("FEATURE_KEYS", () => {
  void it("matches the exact strings the backend sends", () => {
    assert.equal(FEATURE_KEYS.twoFactor, "Identity.TwoFactor");
  });
});
```

- [ ] **Step 4: Run both tests to verify they fail**

Run: `cd web-app/apps/web && pnpm run test:unit`
Expected: FAIL — `Cannot find module '@repo/utils/app-config/logic'`.

- [ ] **Step 5: Write `types.ts`**

```ts
import type {
  Volo_Abp_AspNetCore_Mvc_ApplicationConfigurations_ApplicationConfigurationDto,
} from "@repo/core-saas/AccountService";
import type {
  UniRefund_AdministrationService_CountrySettings_CountrySettingInfoDto,
} from "@repo/core-saas/AdministrationService";

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

- [ ] **Step 6: Write `keys.ts`**

```ts
/**
 * Setting keys, as named constants so a typo fails `keys.test.ts` rather than
 * resolving to `undefined` and reading as `false`.
 *
 * `Abp.Timing.TimeZone` is deliberately absent. Its value is a Windows zone id
 * ("GMT Standard Time") which `Intl.DateTimeFormat` rejects; the IANA zone
 * comes from `timing.timeZone.iana.timeZoneName` and lands on
 * `ApplicationConfiguration.timeZone`.
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

- [ ] **Step 7: Write `parse.ts`**

```ts
type Values = Record<string, string | null>;

export function getSetting(values: Values, key: string): string | null {
  return values[key] ?? null;
}

/**
 * ABP sends every setting as a string and is not consistent about casing:
 * the same payload carries both `"True"` and `"false"`. A `=== "true"` check
 * reads roughly half the settings as false.
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

export function getNumberSetting(
  values: Values,
  key: string,
  fallback: number,
): number {
  const raw = values[key];
  if (raw === null || raw === undefined) return fallback;
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

- [ ] **Step 8: Write `logic.ts`**

Pure barrel — no React, no `next/*`, no auth imports, so both the test runner and client components can import it.

```ts
export * from "./keys";
export * from "./parse";
export * from "./types";
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd web-app/apps/web && pnpm run test:unit`
Expected: PASS — the new `parse.test.ts` and `keys.test.ts` cases green, and the 8 pre-existing test files still green.

- [ ] **Step 10: Commit**

```bash
cd web-app
git add packages/utils/app-config/types.ts packages/utils/app-config/keys.ts \
        packages/utils/app-config/parse.ts packages/utils/app-config/logic.ts \
        packages/utils/package.json \
        apps/web/src/utils/app-config/parse.test.ts \
        apps/web/src/utils/app-config/keys.test.ts
git commit -m "feat(app-config): add pure types, keys and setting parsers"
```

---

### Task 2: Normalizer

**Files:**
- Create: `web-app/packages/utils/app-config/normalize.ts`
- Modify: `web-app/packages/utils/app-config/logic.ts`
- Test: `web-app/apps/web/src/utils/app-config/normalize.test.ts`
- Test fixture: `web-app/apps/web/src/utils/app-config/application-configuration.fixture.ts`

**Interfaces:**
- Consumes: `ApplicationConfiguration`, `RawApplicationConfiguration`, `CountryInfo` from Task 1.
- Produces: `normalizeApplicationConfiguration(raw, country)` → `ApplicationConfiguration`; `EMPTY_APPLICATION_CONFIGURATION` constant. Both re-exported from `@repo/utils/app-config/logic`.

- [ ] **Step 1: Write the fixture**

Trimmed from a live authenticated staff session on 2026-09-04, tenant "Faroe Islands". GUIDs and the email are redacted; every key name and value shape is verbatim.

Create `apps/web/src/utils/app-config/application-configuration.fixture.ts`:

```ts
import type { RawApplicationConfiguration } from "@repo/utils/app-config/logic";

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
  features: {
    values: {
      "Identity.TwoFactor": "Optional",
      "SettingManagement.Enable": "true",
    },
  },
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

Create `apps/web/src/utils/app-config/normalize.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_APPLICATION_CONFIGURATION,
  normalizeApplicationConfiguration,
} from "@repo/utils/app-config/logic";
import { applicationConfigurationFixture } from "./application-configuration.fixture";

const country = {
  tenantId: "00000000-0000-0000-0000-000000tenant",
  tenantName: "Faroe Islands",
  timeZone: "Europe/London",
  currency: "GBP",
  countryCode2: "FO",
  countryCode3: "FRO",
  countryName: "Faroe Islands",
};

void describe("normalizeApplicationConfiguration", () => {
  void it("takes the IANA time zone, not the Windows id", () => {
    const config = normalizeApplicationConfiguration(
      applicationConfigurationFixture,
      undefined,
    );
    assert.equal(config.timeZone, "Europe/London");
  });

  void it("produces a time zone Intl accepts", () => {
    const config = normalizeApplicationConfiguration(
      applicationConfigurationFixture,
      undefined,
    );
    assert.doesNotThrow(() => {
      new Intl.DateTimeFormat("en-GB", { timeZone: config.timeZone }).format(
        new Date(0),
      );
    });
  });

  void it("falls back to UTC when timing is absent", () => {
    const config = normalizeApplicationConfiguration({}, undefined);
    assert.equal(config.timeZone, "UTC");
  });

  void it("drops objectExtensions", () => {
    const config = normalizeApplicationConfiguration(
      applicationConfigurationFixture,
      undefined,
    );
    assert.equal("objectExtensions" in config, false);
  });

  void it("carries policies through", () => {
    const config = normalizeApplicationConfiguration(
      applicationConfigurationFixture,
      undefined,
    );
    assert.equal(config.policies["TagService.Tags.Create"], true);
    assert.equal(config.policies["Nope.Missing"], undefined);
  });

  void it("maps the current user, keeping roles as identity roles", () => {
    const config = normalizeApplicationConfiguration(
      applicationConfigurationFixture,
      undefined,
    );
    assert.equal(config.user.isAuthenticated, true);
    assert.equal(config.user.userName, "admin");
    assert.deepEqual(config.user.roles, ["admin"]);
  });

  void it("reports a real tenant as not host", () => {
    const config = normalizeApplicationConfiguration(
      applicationConfigurationFixture,
      undefined,
    );
    assert.equal(config.tenant.name, "Faroe Islands");
    assert.equal(config.tenant.isHost, false);
  });

  void it("treats a null tenant id as host", () => {
    const config = normalizeApplicationConfiguration(
      { currentTenant: { id: null, name: null, isAvailable: true } },
      undefined,
    );
    assert.equal(config.tenant.isHost, true);
  });

  void it("treats Guid.Empty as host, as country-settings reports it", () => {
    const config = normalizeApplicationConfiguration(
      {},
      { ...country, tenantId: "00000000-0000-0000-0000-000000000000" },
    );
    assert.equal(config.tenant.isHost, true);
  });

  void it("fills the country block from country-settings", () => {
    const config = normalizeApplicationConfiguration(
      applicationConfigurationFixture,
      country,
    );
    assert.equal(config.country.currency, "GBP");
    assert.equal(config.country.countryCode2, "FO");
    assert.equal(config.country.countryName, "Faroe Islands");
  });

  void it("defaults currency to USD when country-settings is unavailable", () => {
    const config = normalizeApplicationConfiguration(
      applicationConfigurationFixture,
      undefined,
    );
    assert.equal(config.country.currency, "USD");
    assert.equal(config.country.countryCode2, null);
  });

  void it("exposes an empty, fail-closed default", () => {
    assert.deepEqual(EMPTY_APPLICATION_CONFIGURATION.policies, {});
    assert.equal(EMPTY_APPLICATION_CONFIGURATION.user.isAuthenticated, false);
    assert.equal(EMPTY_APPLICATION_CONFIGURATION.tenant.isHost, true);
    assert.equal(EMPTY_APPLICATION_CONFIGURATION.timeZone, "UTC");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web-app/apps/web && pnpm run test:unit`
Expected: FAIL — `normalizeApplicationConfiguration` is not exported.

- [ ] **Step 4: Write `normalize.ts`**

```ts
import { isHostTenant } from "./is-host-tenant";
import type {
  ApplicationConfiguration,
  CountryInfo,
  RawApplicationConfiguration,
} from "./types";

const DEFAULT_CURRENCY = "USD";
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
 * `clock` and `multiTenancy`: nothing consumes them, and `objectExtensions`
 * alone is the largest block in the response.
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
      currency: countryInfo?.currency ?? DEFAULT_CURRENCY,
      countryCode2: countryInfo?.countryCode2 ?? null,
      countryCode3: countryInfo?.countryCode3 ?? null,
      countryName: countryInfo?.countryName ?? null,
    },
    // The IANA zone. `setting.values["Abp.Timing.TimeZone"]` is a Windows id
    // and `Intl.DateTimeFormat` throws on it.
    timeZone:
      raw.timing?.timeZone?.iana?.timeZoneName ??
      countryInfo?.timeZone ??
      DEFAULT_TIME_ZONE,
    policies: (raw.auth?.grantedPolicies ?? {}) as Record<string, boolean>,
    settings: raw.setting?.values ?? {},
    features: raw.features?.values ?? {},
  };
}
```

- [ ] **Step 5: Move `is-host-tenant` so both apps and the pure layer share it**

`isHostTenant` currently lives at `apps/web/src/utils/is-host-tenant.ts` and `apps/ssr` cannot import it. Copy the file (docblock included, it explains the `Guid.Empty` rule) to `packages/utils/app-config/is-host-tenant.ts`, then make the old path re-export so its existing importers keep working:

```ts
// apps/web/src/utils/is-host-tenant.ts
export { isHostTenant } from "@repo/utils/app-config/logic";
```

- [ ] **Step 6: Extend `logic.ts`**

```ts
export * from "./is-host-tenant";
export * from "./keys";
export * from "./normalize";
export * from "./parse";
export * from "./types";
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd web-app/apps/web && pnpm run test:unit`
Expected: PASS, including the pre-existing tests that import `isHostTenant`.

- [ ] **Step 8: Commit**

```bash
cd web-app
git add packages/utils/app-config apps/web/src/utils/is-host-tenant.ts \
        apps/web/src/utils/app-config
git commit -m "feat(app-config): normalize the ABP payload onto one contract"
```

---

### Task 3: Request-cached fetch

**Files:**
- Create: `web-app/packages/utils/app-config/fetch.ts`
- Modify: `web-app/packages/utils/api/action.ts`
- Modify: `web-app/packages/utils/policies/utils.ts`

**Interfaces:**
- Consumes: `normalizeApplicationConfiguration`, `EMPTY_APPLICATION_CONFIGURATION`, `ApplicationConfiguration` from Task 2.
- Produces: `getApplicationConfiguration(): Promise<ApplicationConfiguration>` — request-scoped cached. `getGrantedPoliciesApi()` keeps its existing signature and return type (`Policies | undefined`).

- [ ] **Step 1: Write `fetch.ts`**

No `"use server"` directive: this is a server-only module, not an RPC endpoint. Putting it in `api/action.ts` (which is `"use server"`) would publish the whole config as a client-callable action.

```ts
import { cache } from "react";
import { getAccountServiceClient } from "../auth/auth-actions";
import { auth } from "../auth/auth";
import {
  EMPTY_APPLICATION_CONFIGURATION,
  normalizeApplicationConfiguration,
  type ApplicationConfiguration,
  type CountryInfo,
} from "./logic";

/**
 * The session's application configuration, fetched at most once per request.
 *
 * `cache()` is load-bearing, not an optimisation. Of 135 `isUnauthorized(...)`
 * call sites only 8 pass `grantedPolicies`; the rest each triggered their own
 * 19 KB / ~225 ms round-trip on top of the layout's. Without the cache this is
 * ~128 calls per page render.
 *
 * The two requests are independent: `Promise.allSettled` means a country
 * lookup failure leaves policies intact, and an application-configuration
 * failure still fails closed with an empty policy map.
 */
export const getApplicationConfiguration = cache(
  async (): Promise<ApplicationConfiguration> => {
    const session = await auth();
    if (!session) return EMPTY_APPLICATION_CONFIGURATION;

    const client = await getAccountServiceClient(session.user?.access_token);

    const [configResult, countryResult] = await Promise.allSettled([
      // `includeLocalizationResources: false` keeps this at 19 KB / ~225 ms
      // instead of 397 KB / ~900 ms, on every render of the (main) layout.
      client.abpApplicationConfiguration.getApiAbpApplicationConfiguration({
        includeLocalizationResources: false,
      }),
      getCountryInfo(session.user?.access_token),
    ]);

    if (configResult.status === "rejected") {
      return EMPTY_APPLICATION_CONFIGURATION;
    }

    return normalizeApplicationConfiguration(
      configResult.value,
      countryResult.status === "fulfilled" ? countryResult.value : undefined,
    );
  },
);
```

`getCountryInfo` wraps the country-settings call. Add it to the same file:

```ts
async function getCountryInfo(
  accessToken: string | undefined,
): Promise<CountryInfo | undefined> {
  const client = await getAdministrationServiceClient(accessToken);
  return await client.countrySetting.getApiAdministrationServiceCountrySettingsInfo();
}
```

- [ ] **Step 1b: Add the Administration client factory to `@repo/utils`**

`packages/utils/auth/auth-actions.ts` exports only `getAccountServiceClient`. The Administration factory exists in `packages/actions/unirefund/lib.ts`, but `@repo/utils` must not import from `@repo/actions` — `@repo/actions` already imports `structuredError` from `@repo/utils/api`, so that direction would be circular.

Add a sibling factory to `packages/utils/auth/auth-actions.ts`, mirroring `getAccountServiceClient` exactly. `@repo/utils` already depends on `@repo/core-saas`, so no new dependency is needed:

```ts
import { AdministrationServiceClient } from "@repo/core-saas/AdministrationService";

export async function getAdministrationServiceClient(accessToken?: string) {
  return new AdministrationServiceClient({
    TOKEN: accessToken,
    BASE: process.env.GATEWAY_URL,
    HEADERS: HEADERS,
  });
}
```

The `withPerformanceLogging` wrapper used by the `@repo/actions` version is deliberately omitted: it lives in that package, and this call is now made once per request rather than ~128 times, so it is no longer the thing worth instrumenting.

Import it at the top of `fetch.ts` alongside `getAccountServiceClient`.

- [ ] **Step 2: Reduce `getGrantedPoliciesApi` to a reader**

Replace the body in `packages/utils/api/action.ts`. Signature and return type are unchanged, so all existing callers keep working — and every one of them now shares the single cached fetch.

```ts
"use server";
import { getApplicationConfiguration } from "../app-config/fetch";
import { Policies } from "../policies/types";

/**
 * Kept for its ~130 existing callers. Reads the request-cached application
 * configuration rather than issuing its own round-trip.
 *
 * Prefer `useApplicationConfiguration()` in client code and
 * `getApplicationConfiguration()` on the server for anything new.
 */
export async function getGrantedPoliciesApi() {
  const config = await getApplicationConfiguration();
  return config.policies as Policies;
}
```

- [ ] **Step 3: Point `isUnauthorized` at the cached config**

In `packages/utils/policies/utils.ts`, the fall-through `await getGrantedPoliciesApi()` now resolves from cache. Only the import needs to change so it does not route through a server action:

```ts
import { getApplicationConfiguration } from "../app-config/fetch";
```

and in the body:

```ts
  const grantedPolicies =
    initalGrantedPolicies ?? (await getApplicationConfiguration()).policies;
```

Note the `??` rather than `||`: an empty-but-present policy object passed by a caller must not silently trigger a refetch.

- [ ] **Step 4: Type-check**

Run: `cd web-app && pnpm run type-check`
Expected: no new errors. `apps/web` shows 2 pre-existing `TS2307` errors for `mrz` without a GitHub Packages token — that is the baseline, not a regression. Record the exact count before this task and compare.

- [ ] **Step 5: Commit**

```bash
cd web-app
git add packages/utils/app-config/fetch.ts packages/utils/api/action.ts \
        packages/utils/policies/utils.ts
git commit -m "perf(app-config): serve policies from one request-cached fetch"
```

---

### Task 4: Provider and hook

**Files:**
- Create: `web-app/packages/utils/app-config/provider.tsx`
- Create: `web-app/packages/utils/app-config/index.tsx`

**Interfaces:**
- Consumes: `ApplicationConfiguration`, `EMPTY_APPLICATION_CONFIGURATION` from Task 2.
- Produces: `ApplicationConfigurationProvider` (props: `{ configuration: ApplicationConfiguration; children: ReactNode }`) and `useApplicationConfiguration(): ApplicationConfiguration`, exported from `@repo/utils/app-config`.

- [ ] **Step 1: Write `provider.tsx`**

```tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  EMPTY_APPLICATION_CONFIGURATION,
  type ApplicationConfiguration,
} from "./logic";

const ApplicationConfigurationContext = createContext<ApplicationConfiguration>(
  EMPTY_APPLICATION_CONFIGURATION,
);

/**
 * Defaults to the fail-closed empty configuration rather than throwing, so a
 * component rendered outside the provider hides permission-gated UI instead of
 * crashing the tree.
 */
export const useApplicationConfiguration = () =>
  useContext(ApplicationConfigurationContext);

export function ApplicationConfigurationProvider({
  configuration,
  children,
}: {
  configuration: ApplicationConfiguration;
  children: ReactNode;
}) {
  return (
    <ApplicationConfigurationContext.Provider value={configuration}>
      {children}
    </ApplicationConfigurationContext.Provider>
  );
}
```

- [ ] **Step 2: Write `index.tsx`**

`packages/utils/package.json` maps `./*` to `./*/index.tsx`, so this is what `@repo/utils/app-config` resolves to.

```tsx
export * from "./logic";
export * from "./provider";
```

- [ ] **Step 3: Type-check**

Run: `cd web-app && pnpm run type-check`
Expected: same error count as Task 3 Step 4.

- [ ] **Step 4: Commit**

```bash
cd web-app
git add packages/utils/app-config/provider.tsx packages/utils/app-config/index.tsx
git commit -m "feat(app-config): add the client provider and hook"
```

---

### Task 5: Turn `useTenant` and `useGrantedPolicies` into adapters

**Files:**
- Modify: `web-app/apps/web/src/providers/tenant.tsx`
- Modify: `web-app/packages/utils/policies/granted-policies.tsx`

**Interfaces:**
- Consumes: `useApplicationConfiguration` from Task 4.
- Produces: unchanged public shapes. `useTenant()` still returns `CountrySettingInfoDto` fields plus `localization`, `currency`, `formatToTenantDate`, `formatToTimezoneDate`. `useGrantedPolicies()` still returns `{ grantedPolicies }`.

This is the task that keeps ~400 call sites untouched. 117 files destructure only `localization`; changing its shape breaks all of them.

- [ ] **Step 1: Rewrite `tenant.tsx` to read the context**

`TenantProvider` keeps its props so `providers.tsx` need not change in this task, but ignores `tenantData` in favour of the shared configuration. Keep the `localStorage` writes — other code reads those keys.

`lang` is not in the application configuration — it is a route segment. Rather than introduce a second source of truth, keep a minimal context carrying only `lang`, fed by the prop `TenantProvider` already receives. (`useParams<{ lang: string }>()` is the established idiom for client components in this app, but it returns `undefined` for anything rendered outside the `[lang]` segment, and `useTenant` has 122 callers — the prop is already correct and already threaded.)

```tsx
"use client";

import { formatToLocalizedDate } from "@repo/ayasofyazilim-ui/custom/date-tooltip";
import { useApplicationConfiguration } from "@repo/utils/app-config";
import { createContext, JSX, useContext, useEffect, useMemo } from "react";

export type Localization = { locale: string; timeZone: string; lang: string };

/** Carries only the route's `lang`; everything else comes from the configuration. */
const LangContext = createContext<string>("en");

/**
 * Adapter over `useApplicationConfiguration`, kept because 122 files import it
 * — 117 of them for `localization` alone. New code should use
 * `useApplicationConfiguration()` directly.
 */
export const useTenant = () => {
  const config = useApplicationConfiguration();
  const lang = useContext(LangContext);

  return useMemo(() => {
    const localization: Localization = {
      locale: getLocaleFromCountryCode(config.country.countryCode2 || "UK"),
      timeZone: config.timeZone,
      lang,
    };

    return {
      tenantId: config.tenant.id ?? "",
      tenantName: config.tenant.name ?? "",
      timeZone: config.timeZone,
      currency: config.country.currency,
      countryCode2: config.country.countryCode2 ?? "",
      countryCode3: config.country.countryCode3 ?? "",
      countryName: config.country.countryName ?? "",
      localization,
      formatToTenantDate: (
        date: string | Date,
        dateOptions?: Intl.DateTimeFormatOptions,
      ) =>
        formatToLocalizedDate({
          date,
          dateOptions,
          localization,
          timeZone: localization.timeZone,
        }),
      formatToTimezoneDate: (
        date: string | Date,
        timeZone?: string,
        dateOptions?: Intl.DateTimeFormatOptions,
      ) => formatToLocalizedDate({ date, dateOptions, localization, timeZone }),
    };
  }, [config, lang]);
};
```

`lang` was previously a prop threaded through `TenantProvider`. Determine how it is available client-side before writing `useLang`:

Run: `grep -rn "useParams\|usePathname" web-app/apps/web/src/providers/*.tsx web-app/apps/web/src/components/sidebar-layout/*.tsx | head -5`

If `useParams()` exposes `lang`, define `useLang` as `String(useParams().lang ?? "en")`. If not, keep `lang` flowing as a prop on `TenantProvider` and pass it into a context alongside the configuration rather than inventing a new source of truth.

- [ ] **Step 2: Keep `TenantProvider` as a pass-through**

Retain the export so `providers.tsx` and any other mounting site keep compiling. It now provides only `lang` and keeps the `localStorage` writes:

```tsx
export function TenantProvider(props: {
  children: JSX.Element;
  tenantData?: unknown;
  lang: string;
}) {
  const config = useApplicationConfiguration();

  useEffect(() => {
    localStorage.setItem(
      "countryCode2",
      config.country.countryCode2?.toLocaleLowerCase() || "us",
    );
    localStorage.setItem("tenantTimeZone", config.timeZone);
  }, [config.country.countryCode2, config.timeZone]);

  return (
    <LangContext.Provider value={props.lang}>
      {props.children}
    </LangContext.Provider>
  );
}
```

`tenantData` is kept as an optional, ignored prop so the existing call site compiles unchanged; Task 6 removes it from the caller.

Keep `countryToLocale` and `getLocaleFromCountryCode` in this file exactly as they are.

- [ ] **Step 3: Rewrite `granted-policies.tsx` to read the context**

```tsx
"use client";
import { useApplicationConfiguration } from "@repo/utils/app-config";
import policies from "./policies.json";
import { Policies } from "./types";

import type { ReactNode } from "react";

/**
 * Adapter over `useApplicationConfiguration`, kept for its 145 importers.
 */
export const useGrantedPolicies = () => {
  const config = useApplicationConfiguration();
  return { grantedPolicies: config.policies as Policies };
};

/**
 * Retained so existing mounting sites compile. The configuration provider is
 * the source now, so this only renders its children.
 */
export function GrantedPoliciesProvider({
  children,
}: {
  children: ReactNode;
  grantedPolicies?: Policies | undefined;
}) {
  return <>{children}</>;
}
```

Leave `policies.json` in place — `policies/types.ts` derives the `Policy` union from it.

- [ ] **Step 4: Type-check**

Run: `cd web-app && pnpm run type-check`
Expected: same error count as Task 3 Step 4. If a call site destructures a `useTenant` field this adapter does not return, add that field to the returned object rather than editing the call site.

- [ ] **Step 5: Commit**

```bash
cd web-app
git add apps/web/src/providers/tenant.tsx packages/utils/policies/granted-policies.tsx
git commit -m "refactor(app-config): back useTenant and useGrantedPolicies with the shared config"
```

---

### Task 6: Mount the provider in both apps

**Files:**
- Modify: `web-app/apps/web/src/providers/providers.tsx`
- Modify: `web-app/apps/ssr/src/providers/providers.tsx`

**Interfaces:**
- Consumes: `getApplicationConfiguration` (Task 3), `ApplicationConfigurationProvider` (Task 4).
- Produces: nothing downstream.

- [ ] **Step 1: Rewire `apps/web/src/providers/providers.tsx`**

Replace the `getGrantedPoliciesApi()` + `getInfoForCurrentTenantApi(session)` pair in `getApiRequests` with the single cached call, and wrap the tree. Keep `MasterDataGridResourcesProvider`, `DiditConfigProvider`, `DeviceProvider`, `DeviceHubProvider` and `QueryProvider` nesting exactly as it is; keep the `optionalRequests` block for Didit untouched.

```tsx
  const configuration = await getApplicationConfiguration();
```

and the tree becomes:

```tsx
    <MasterDataGridResourcesProvider resources={languageData}>
      <ApplicationConfigurationProvider configuration={configuration}>
        <TenantProvider lang={lang}>
          <SessionProvider session={session}>
            <GrantedPoliciesProvider>
              <DiditConfigProvider
                apiKey={process.env.NEXT_PUBLIC_DIDIT_API_KEY ?? ""}
                workflows={diditWorkflows}
                evidenceLevelRequirements={evidenceLevelRequirements}
              >
                <DeviceProvider>
                  <DeviceHubProvider gatewayUrl={process.env.GATEWAY_URL || ""}>
                    <QueryProvider>{children}</QueryProvider>
                  </DeviceHubProvider>
                </DeviceProvider>
              </DiditConfigProvider>
            </GrantedPoliciesProvider>
          </SessionProvider>
        </TenantProvider>
      </ApplicationConfigurationProvider>
    </MasterDataGridResourcesProvider>
```

`ApplicationConfigurationProvider` must sit above `TenantProvider` and `GrantedPoliciesProvider` — both now read its context.

The existing `getApiRequests` error branch stays: `getApplicationConfiguration` never throws (it returns the empty configuration), so the `ErrorComponent` path is now driven only by the Didit calls and `getResourceData`.

- [ ] **Step 2: Rewire `apps/ssr/src/providers/providers.tsx`**

Same substitution. `apps/ssr` previously had no tenant data at all and now gains it:

```tsx
  const configuration = await getApplicationConfiguration();

  return (
    <ApplicationConfigurationProvider configuration={configuration}>
      <SessionProvider session={session}>
        <GrantedPoliciesProvider>{children}</GrantedPoliciesProvider>
      </SessionProvider>
    </ApplicationConfigurationProvider>
  );
```

- [ ] **Step 3: Type-check and build**

Run: `cd web-app && pnpm run type-check`
Run: `cd web-app && pnpm run init`

`pnpm run init` must run before tsc will see any new i18n key; this task adds none, but run it so the build reflects reality.

- [ ] **Step 4: Verify the call collapse by hand**

Start the app, sign in, open a `(main)` page with a permission guard, and count outbound `application-configuration` requests.

Run: `cd web-app && pnpm dev`

Expected: exactly one `application-configuration` request and one `country-settings/info` request per page navigation. Before this change the same navigation issued roughly 128. Record both numbers in the commit body.

- [ ] **Step 5: Commit**

```bash
cd web-app
git add apps/web/src/providers/providers.tsx apps/ssr/src/providers/providers.tsx
git commit -m "feat(app-config): mount ApplicationConfigurationProvider in web and ssr"
```

---

### Task 7: Verification

**Files:** none modified.

- [ ] **Step 1: Measure the gate baseline on a clean tree first**

Before trusting any result, confirm no foreign work is in the tree:

```bash
cd web-app && git status --short
```

If files unrelated to this plan appear, stop and report — do not stash or reset, another session may share this checkout.

- [ ] **Step 2: Unit tests**

Run: `cd web-app/apps/web && pnpm run test:unit`
Expected: PASS. The three new files plus the 8 pre-existing ones.

- [ ] **Step 3: Type-check**

Run: `cd web-app && pnpm run type-check`
Expected: the same error count recorded at Task 3 Step 4. `apps/web` carries 2 baseline `TS2307` errors for `mrz` absent a GitHub Packages token.

- [ ] **Step 4: Lint**

Run: `cd web-app && pnpm run lint`
Expected: no new findings. Do not run `prettier --check` as a gate — it fails repo-wide on CRLF line endings, which is unrelated to this change.

- [ ] **Step 5: Confirm no consumer was edited**

```bash
cd web-app
git diff --stat main...HEAD -- "apps/web/src/app" | tail -1
```

Expected: empty. This plan touches providers, `packages/utils`, and tests only. Any change under `apps/web/src/app` means an adapter shape drifted and a call site was edited to compensate — fix the adapter instead.

- [ ] **Step 6: File the backend ask**

The spec's remaining open item, and the only part of it that is not code. Raise a backend ticket to mark these settings visible-to-clients so the second request can be deleted:

- `CountryManagement.MainSettings.Currency`
- `CountryManagement.MainSettings.CountryCode3`
- `CountryManagement.MainSettings.IANATimezone`
- new equivalents for `countryCode2` and `countryName`, which have no `MainSettings` field today

Evidence to include: a live authenticated session with `UniRefund.Settings.GetValues: true` granted returns exactly one `CountryManagement.*` key in `setting.values` (`EarlyRefund.EarlyRefundAvailable`), so this is an `IsVisibleToClients` question, not a permissions one.

When it lands, the change is confined to `getCountryInfo` in `packages/utils/app-config/fetch.ts` and its two RN equivalents — read the values from `settings` and stop calling `country-settings/info`. No consumer moves.

Record the ticket reference here in the plan so the follow-up is traceable.
