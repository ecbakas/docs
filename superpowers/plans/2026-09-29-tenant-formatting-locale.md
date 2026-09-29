# Tenant Formatting Locale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every date and date picker in `apps/web` follows the tenant's formatting locale, read from a setting the backend publishes through app-config, with no regression for tenants that have not set it.

**Architecture:** A pure resolver in `packages/utils/app-config` turns the published setting (or, until it is set, the existing country map, then `en-GB`) into `useLocalization().locale`. `DatePicker` / `DateRangePicker` in `packages/ayasofyazilim-ui` stop defaulting to `"en-US"` and inherit the nearest react-aria `I18nProvider`. `apps/web` mounts one such provider with the resolved locale inside its `(main)` providers and drops every explicit `locale=` prop.

**Tech Stack:** Next.js 16, React 19, react-aria-components / `@react-aria/i18n` 3.12.13, Node's test runner (`apps/web` `test:unit`), Jest + Testing Library (`packages/ayasofyazilim-ui`).

**Spec:** `docs/superpowers/specs/2026-09-29-tenant-formatting-locale-design.md`

## Global Constraints

- Source: ABP's existing `Abp.Localization.DefaultLanguage` (in app-config `setting.values` today). Its value format is `cultureName;uiCultureName`, and only the culture half is used, and only when it names a region. If the backend confirms `localization.currentCulture` is configurable per tenant, a later change may switch to it; this plan does not.
- Final fallback is `en-GB`. The resolver never returns `"en-UK"`.
- The resolver never throws: it runs inside `useLocalization()` on every page.
- `apps/ssr` is out of scope; it already inherits its root `I18nProvider`.
- `packages/utils` (repo `web-utils`) and `packages/ayasofyazilim-ui` (repo `ayasofyazilim-ui`) are git submodules. Commit inside each on its own branch, then record the pointer in `web-app` with `git add packages/<name>`.
- **No commits until the user says so.** The `web-app` checkout is on the unrelated branch `feat/validate-pin-payout-token` and holds other uncommitted work from this session; branch before committing anything.
- The checkout is shared with other agent sessions: never `git stash`, `git reset --hard` or `git checkout -- <path>` in it.
- Write few comments — explain a non-obvious why, never narrate.
- Gate baselines (measured 2026-09-29): `pnpm --filter web type-check` 0 errors · `pnpm --filter web lint` 0 errors / 465 warnings · `pnpm --filter web test:unit` 0 failures · `packages/ayasofyazilim-ui` `npx jest` 22 suites / 365 tests passing.

## Review Focus

- A setting with stray whitespace or casing (`" en-gb "`) — expected to work as `en-GB`. Pinned in Task 1.
- A malformed setting (`en_GB`, `english`) — expected to fall back silently, never crash the page. Pinned in Task 1.
- A tenant whose default language is a bare `en` (every tenant today) in an unmapped country (Faroe Islands) — expected to keep today's `en-GB` formatting, not drop to US format. Pinned in Task 1.
- A caller that passes `locale` explicitly — expected to still win over the provider. Pinned in Task 2.
- A date-time picker under a 24-hour locale — expected to show no AM/PM segment. Pinned in Task 2.

---

### Task 1: Resolve the tenant formatting locale

> **Revised during execution (2026-09-29).** The user's chosen UI language now decides the date language. The resolver was rebuilt as `resolveFormattingLocale({ lang, languages, countryCode2 })` over app-config's `localization.languages`, which `normalize.ts` now keeps as `ApplicationConfiguration.languages`. `Abp.Localization.DefaultLanguage` and `SETTING_KEYS.defaultLanguage` were dropped. The spec's "Frontend resolution" section and the ledger's Task 1 ruling are authoritative; the code blocks below record the first version.

**Files:**
- Modify: `web-app/packages/utils/app-config/localization.ts` (whole file)
- Modify: `web-app/packages/utils/app-config/keys.ts` (add one key to `SETTING_KEYS`)
- Modify: `web-app/packages/utils/app-config/provider.tsx:11-16` (imports) and `:65-76` (`useLocalization`)
- Test: `web-app/apps/web/src/utils/app-config/localization.test.ts` (whole file)
- Test: `web-app/apps/web/src/utils/app-config/keys.test.ts` (add one case)

**Interfaces:**
- Consumes: `getSetting(values, key): string | null` from `packages/utils/app-config/parse.ts`; `ApplicationConfiguration.settings` and `.country.countryCode2`.
- Produces: `resolveFormattingLocale({ defaultLanguage: string | null; countryCode2: string | null }): string`; `FALLBACK_FORMATTING_LOCALE = "en-GB"`; `getLocaleFromCountryCode(code2: string): string | null` (now `null` for an unknown code); `SETTING_KEYS.defaultLanguage`. `useLocalization().locale` keeps its name and type.

- [ ] **Step 1: Write the failing tests**

Replace `web-app/apps/web/src/utils/app-config/localization.test.ts` with:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FALLBACK_FORMATTING_LOCALE,
  getLocaleFromCountryCode,
  resolveFormattingLocale,
} from "@repo/utils/app-config/logic";

void describe("getLocaleFromCountryCode", () => {
  void it("maps a known country code", () => {
    assert.equal(getLocaleFromCountryCode("TR"), "tr-TR");
  });

  void it("is case-insensitive", () => {
    assert.equal(getLocaleFromCountryCode("gb"), "en-GB");
  });

  void it("returns null for an unknown code, leaving the fallback to the resolver", () => {
    assert.equal(getLocaleFromCountryCode("ZZ"), null);
    assert.equal(getLocaleFromCountryCode(""), null);
  });
});

const resolve = (defaultLanguage: string | null, countryCode2: string | null) =>
  resolveFormattingLocale({ defaultLanguage, countryCode2 });

void describe("resolveFormattingLocale", () => {
  void it("uses the culture half of ABP's culture;uiCulture value", () => {
    assert.equal(resolve("en-GB;en", "FO"), "en-GB");
    assert.equal(resolve("is-IS;en", "FO"), "is-IS");
  });

  void it("uses a regional culture given on its own", () => {
    assert.equal(resolve("tr-TR", "FO"), "tr-TR");
  });

  void it("treats a bare language as unconfigured, so today's 'en' keeps en-GB", () => {
    assert.equal(resolve("en", "FO"), "en-GB");
    assert.equal(resolve("en;en", "TR"), "tr-TR");
  });

  void it("canonicalises casing and surrounding whitespace", () => {
    assert.equal(resolve(" en-gb ;en", null), "en-GB");
  });

  void it("ignores a malformed value instead of throwing", () => {
    assert.equal(resolve("en_GB", "TR"), "tr-TR");
    assert.equal(resolve(";en", "TR"), "tr-TR");
  });

  void it("ignores a tag Intl cannot format with", () => {
    assert.equal(resolve("zz-ZZ", "TR"), "tr-TR");
  });

  void it("falls back to the country map while the value is unset", () => {
    assert.equal(resolve(null, "TR"), "tr-TR");
    assert.equal(resolve("", "US"), "en-US");
  });

  void it("keeps an unmapped tenant on en-GB, as the old en-UK fallback resolved", () => {
    assert.equal(resolve(null, "FO"), "en-GB");
    assert.equal(resolve(null, null), FALLBACK_FORMATTING_LOCALE);
    assert.equal(FALLBACK_FORMATTING_LOCALE, "en-GB");
  });
});
```

In `web-app/apps/web/src/utils/app-config/keys.test.ts`, add inside `describe("SETTING_KEYS", ...)`, after the minimum sales amount case:

```ts
  void it("matches ABP's default language setting name", () => {
    assert.equal(SETTING_KEYS.defaultLanguage, "Abp.Localization.DefaultLanguage");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `web-app/apps/web`): `node --import tsx --test src/utils/app-config/localization.test.ts src/utils/app-config/keys.test.ts`
Expected: FAIL — `resolveFormattingLocale` / `FALLBACK_FORMATTING_LOCALE` are not exported, and `SETTING_KEYS.defaultLanguage` is `undefined`.

- [ ] **Step 3: Implement the resolver and the key**

Replace `web-app/packages/utils/app-config/localization.ts` with:

```ts
export interface Localization {
  locale: string;
  timeZone: string;
  lang: string;
}

const countryToLocale = {
  GB: "en-GB",
  US: "en-US",
  IE: "en-IE",
  TR: "tr-TR",
  DE: "de-DE",
};

/**
 * For a tenant whose default language names no region, in an unmapped country.
 * It is what the retired `"en-UK"` fallback already resolved to in ICU, so no
 * tenant's formatting moved when that invalid tag went.
 */
export const FALLBACK_FORMATTING_LOCALE = "en-GB";

/** The transition map, for tenants whose default language names no region yet. */
export function getLocaleFromCountryCode(code2: string): string | null {
  const upperCode = code2.toUpperCase();
  return upperCode in countryToLocale
    ? countryToLocale[upperCode as keyof typeof countryToLocale]
    : null;
}

/**
 * The formatting culture in ABP's `cultureName;uiCultureName` value, when it
 * names a region. A bare language ("en", every tenant's value today) says
 * nothing about date order or clock, so it counts as unset.
 */
function regionalCulture(defaultLanguage: string): string | null {
  try {
    const [canonical] = Intl.getCanonicalLocales(
      defaultLanguage.split(";")[0]!.trim()
    );
    if (!canonical || !new Intl.Locale(canonical).region) return null;
    return Intl.DateTimeFormat.supportedLocalesOf([canonical]).length > 0
      ? canonical
      : null;
  } catch {
    // A malformed tag throws RangeError. This runs on every page, so a bad
    // value degrades to the fallback instead.
    return null;
  }
}

/** Backs `useLocalization().locale`. */
export function resolveFormattingLocale({
  defaultLanguage,
  countryCode2,
}: {
  defaultLanguage: string | null;
  countryCode2: string | null;
}): string {
  return (
    (defaultLanguage ? regionalCulture(defaultLanguage) : null) ??
    getLocaleFromCountryCode(countryCode2 ?? "") ??
    FALLBACK_FORMATTING_LOCALE
  );
}
```

In `web-app/packages/utils/app-config/keys.ts`, add to `SETTING_KEYS` after `minimumSalesAmount`:

```ts
  /**
   * ABP's `cultureName;uiCultureName` ("en-GB;en"); the culture half is the
   * tenant's formatting locale. Read through `resolveFormattingLocale`, never
   * directly: that is where a bare language or malformed value falls back.
   */
  defaultLanguage: "Abp.Localization.DefaultLanguage",
```

- [ ] **Step 4: Wire it into `useLocalization`**

In `web-app/packages/utils/app-config/provider.tsx`, replace the `./logic` import block with:

```ts
import {
  EMPTY_APPLICATION_CONFIGURATION,
  getSetting,
  resolveFormattingLocale,
  SETTING_KEYS,
  type ApplicationConfiguration,
  type Localization,
} from "./logic";
```

and replace the body of `useLocalization` with:

```ts
export function useLocalization(): Localization {
  const config = useContext(ApplicationConfigurationContext);
  const lang = useContext(LangContext);
  const defaultLanguage = getSetting(
    config.settings,
    SETTING_KEYS.defaultLanguage,
  );
  return useMemo(
    () => ({
      locale: resolveFormattingLocale({
        defaultLanguage,
        countryCode2: config.country.countryCode2,
      }),
      timeZone: config.timeZone,
      lang,
    }),
    [defaultLanguage, config.country.countryCode2, config.timeZone, lang],
  );
}
```

Keep the doc comment above the function as it is.

- [ ] **Step 5: Run the tests and the type-check**

Run (from `web-app/apps/web`): `node --import tsx --test src/utils/app-config/localization.test.ts src/utils/app-config/keys.test.ts`
Expected: PASS, 0 failures.

Run (from `web-app`): `pnpm --filter web type-check`
Expected: 0 errors. (`packages/utils` has no type-check of its own; `apps/web` covers it.)

- [ ] **Step 6: Commit (only once the user has approved committing)**

```bash
cd web-app/packages/utils
git checkout -b feat/tenant-formatting-locale
git add app-config/localization.ts app-config/keys.ts app-config/provider.tsx
git commit -m "feat(app-config): resolve the tenant formatting locale from a published setting"
cd ../..
git add packages/utils apps/web/src/utils/app-config/localization.test.ts apps/web/src/utils/app-config/keys.test.ts
```

(The `web-app` commit happens with Task 3.)

---

### Task 2: Date pickers inherit the nearest locale

**Files:**
- Modify: `web-app/packages/ayasofyazilim-ui/src/custom/date-picker/index.tsx` (imports; `DatePicker` props and body; `DateRangePicker` props and body)
- Test: `web-app/packages/ayasofyazilim-ui/src/test/date-picker-locale.test.tsx` (new)

**Interfaces:**
- Consumes: `useLocale()` and `I18nProvider` from `react-aria-components`.
- Produces: `DatePicker` / `DateRangePicker` with `locale?: string` and no default. When it is omitted they use the nearest `I18nProvider`'s locale. Task 3 relies on this.

- [ ] **Step 1: Write the failing test**

Create `web-app/packages/ayasofyazilim-ui/src/test/date-picker-locale.test.tsx`:

```tsx
import React from "react";
import { render } from "@testing-library/react";
import { I18nProvider } from "react-aria-components";
import { DatePicker, DateRangePicker } from "../custom/date-picker";

const date = new Date(2026, 8, 29, 8, 11);

const firstSegmentType = (container: HTMLElement) =>
  container
    .querySelector('[data-type]:not([data-type="literal"])')
    ?.getAttribute("data-type");

describe("DatePicker locale", () => {
  it("inherits the nearest I18nProvider when no locale is passed", () => {
    const { container } = render(
      <I18nProvider locale="tr-TR">
        <DatePicker id="p" defaultValue={date} />
      </I18nProvider>
    );
    expect(firstSegmentType(container)).toBe("day");
  });

  it("lets an explicit locale win over the provider", () => {
    const { container } = render(
      <I18nProvider locale="tr-TR">
        <DatePicker id="p" locale="en-US" defaultValue={date} />
      </I18nProvider>
    );
    expect(firstSegmentType(container)).toBe("month");
  });

  it("shows no AM/PM under an inherited 24-hour locale", () => {
    const { container } = render(
      <I18nProvider locale="en-GB">
        <DatePicker id="p" useTime defaultValue={date} />
      </I18nProvider>
    );
    expect(container.querySelector('[data-type="hour"]')).not.toBeNull();
    expect(container.querySelector('[data-type="dayPeriod"]')).toBeNull();
  });

  it("inherits for the range picker too", () => {
    const { container } = render(
      <I18nProvider locale="tr-TR">
        <DateRangePicker id="r" defaultValues={{ start: date, end: date }} />
      </I18nProvider>
    );
    expect(firstSegmentType(container)).toBe("day");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `web-app/packages/ayasofyazilim-ui`): `npx jest src/test/date-picker-locale.test.tsx`
Expected: 3 FAIL, 1 PASS. The three inheritance cases get `"month"` or a `dayPeriod` segment, because the pickers default to `"en-US"`. "Explicit locale wins" already passes and guards the change.

- [ ] **Step 3: Implement inheritance**

In `web-app/packages/ayasofyazilim-ui/src/custom/date-picker/index.tsx`:

1. Add `useLocale` to the `react-aria-components` import list (alphabetically after `Label`).
2. In `DatePicker`'s destructured props, change `locale = "en-US",` to `locale,`. In its props type, replace `locale?: string;` with:

   ```ts
     /** Formatting locale. Omit to inherit the nearest react-aria I18nProvider. */
     locale?: string;
   ```

3. As the first line of `DatePicker`'s body, add:

   ```ts
   const inheritedLocale = useLocale().locale;
   const effectiveLocale = locale ?? inheritedLocale;
   ```

   and change every use of `locale` below it to `effectiveLocale`. That's `<I18nProvider locale={locale}>` and the four `toLocaleDateString(locale, …)` calls in the tooltip.
4. Do the same in `DateRangePicker`: `locale = "en-US",` becomes `locale,`, the same doc comment on its `locale?: string;`, the same two lines as the first lines of its body, and `<I18nProvider locale={locale}>` becomes `<I18nProvider locale={effectiveLocale}>`.

- [ ] **Step 4: Run the tests**

Run (from `web-app/packages/ayasofyazilim-ui`): `npx jest src/test/date-picker-locale.test.tsx src/test/date-picker-hydration.test.tsx`
Expected: PASS (10 tests).

Run: `npx jest --silent`
Expected: 23 suites, 369 tests, all passing.

Run: `npx tsc --noEmit`
Expected: only the one error already there at HEAD, `src/test/schema-form-selectable-value.test.tsx(31,7) TS2353`.

Run: `npx eslint src/custom/date-picker/index.tsx src/test/date-picker-locale.test.tsx`
Expected: 0 errors.

- [ ] **Step 5: Commit (only once the user has approved committing)**

```bash
cd web-app/packages/ayasofyazilim-ui
git checkout -b fix/date-picker-locale-and-hydration
git add src/custom/date-picker/index.tsx src/custom/date-picker/datefield-rac.tsx src/test/date-picker-locale.test.tsx src/test/date-picker-hydration.test.tsx
git commit -m "fix(date-picker): inherit the surrounding locale and render segments only after hydration"
cd ../..
git add packages/ayasofyazilim-ui
```

(`datefield-rac.tsx` and `date-picker-hydration.test.tsx` are the 2026-09-29 hydration fix, still uncommitted. They ship in the same PR.)

---

### Task 3: `apps/web` formats with the tenant locale

**Files:**
- Create: `web-app/apps/web/src/providers/tenant-formatting.tsx`
- Modify: `web-app/apps/web/src/providers/providers.tsx` (import + wrap)
- Modify: `web-app/apps/web/src/app/[lang]/(main)/(unirefund)/finance/agent-cash-report/_components/client.tsx:50,159,170`
- Modify: `web-app/apps/web/src/app/[lang]/(main)/(unirefund)/finance/tour-guide-fee/_components/report.tsx:45,104`
- Modify: `web-app/apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund/_components/payment-form.tsx:7,26,52`
- Modify: `web-app/apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/new-old/_components/invoice-form.tsx:95,226`
- Modify: `web-app/apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/[tagId]/_components/change-issue-date.tsx:107`
- Modify: `web-app/apps/web/src/app/[lang]/(main)/(unirefund)/parties/_components/affiliations/drawer/step-2.tsx:6,31,54`
- Modify: `web-app/apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/new-old/_components/traveller-form.tsx:4,46,116`
- Modify: `web-app/apps/web/src/components/traveller-form.tsx:4,46,130`

**Interfaces:**
- Consumes: `useLocalization().locale` (Task 1). `DatePicker` / `DateRangePicker` inheriting their locale (Task 2). `I18nProvider` from `@react-aria/i18n`, the same instance `react-aria-components` uses (3.12.13, verified 2026-09-29).
- Produces: `TenantFormattingProvider({ children })`.

This task has no unit test: `apps/web`'s runner loads no JSX. It's verified by type-check, lint and the browser check in Step 5.

- [ ] **Step 1: Create the provider**

`web-app/apps/web/src/providers/tenant-formatting.tsx`:

```tsx
"use client";

// The scoped package, not the `react-aria` meta-package: see providers/i18n.tsx.
import { I18nProvider } from "@react-aria/i18n";
import { useLocalization } from "@repo/utils/app-config";

/**
 * Sets react-aria's locale to the tenant's formatting locale for everything
 * under (main), so every date picker inherits it instead of the UI language.
 */
export function TenantFormattingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale } = useLocalization();
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}
```

- [ ] **Step 2: Mount it inside app-config**

In `web-app/apps/web/src/providers/providers.tsx`, add `import { TenantFormattingProvider } from "./tenant-formatting";` after `import type { ProvidersData } from "./providers-data";`. Then wrap the `SessionProvider` element, so it sits directly inside `ApplicationConfigurationProvider`:

```tsx
    <ApplicationConfigurationProvider configuration={configuration} lang={lang}>
      <TenantFormattingProvider>
        <SessionProvider session={session}>
          {/* …existing DiditConfigProvider subtree, unchanged… */}
        </SessionProvider>
      </TenantFormattingProvider>
    </ApplicationConfigurationProvider>
```

- [ ] **Step 3: Remove every explicit locale**

- `agent-cash-report/_components/client.tsx`: delete `locale={lang}` on lines 159 and 170. Delete line 50, `const { lang } = useParams<{ lang: string }>();`. Then remove `useParams` from the `next/navigation` import on line 23, leaving `import { useRouter, useSearchParams } from "next/navigation";`.
- `tour-guide-fee/_components/report.tsx`: delete `locale={lang}` on line 104 and line 45, `const { lang } = useParams<{ lang: string }>();`. Then change the line-21 import to `import { usePathname, useRouter } from "next/navigation";`. Keep `localization`, which has another use.
- `operations/refund/_components/payment-form.tsx`: delete `locale={localization.locale}` on line 52, line 26 (`const localization = useLocalization();`) and the line-7 import `import { useLocalization } from "@repo/utils/app-config";`.
- `tax-free-tags/new-old/_components/invoice-form.tsx`: delete `locale={lang}` on line 226 and line 95, `const { lang } = useParams<{ lang: string }>();`. Then delete the line-34 import `import { useParams } from "next/navigation";`.
- `tax-free-tags/[tagId]/_components/change-issue-date.tsx`: delete `locale={lang}` on line 107 only. `lang` has another use, so keep its declaration.
- `parties/_components/affiliations/drawer/step-2.tsx`: delete `locale={localization.locale}` on line 54, line 31 (`const localization = useLocalization();`) and the line-6 import `import { useLocalization } from "@repo/utils/app-config";`.
- `tax-free-tags/new-old/_components/traveller-form.tsx`: delete the prop `formContext={{ locale: localization.locale }}` on line 116, line 46 (`const localization = useLocalization();`) and the line-4 import `import { useLocalization } from "@repo/utils/app-config";`.
- `components/traveller-form.tsx`: the same three deletions on lines 130, 46 and 4.

Line numbers are as of 2026-09-29. Before each deletion, confirm the variable has no other use: `grep -n "\blang\b"` / `grep -n "\blocalization\b"` in the file should show only the lines being removed.

- [ ] **Step 4: Run the gates**

Run (from `web-app`): `pnpm --filter web type-check`. Expected: 0 errors.
Run: `pnpm --filter web lint`. Expected: 0 errors, and no more than 465 warnings.
Run: `pnpm --filter web test:unit`. Expected: 0 failures.
Run: `grep -rn "locale={lang}\|locale={localization.locale}\|formContext={{ locale" apps/web/src --include=*.tsx`. Expected: no output.

- [ ] **Step 5: Check it in the browser**

On a dev server running this checkout (`apps/web`, :3000), sign in as `admin` / `1q2w3E*` in the **Faroe Islands** tenant. It has no setting published yet, and FO isn't in the country map, so it resolves to `en-GB`.

1. Open `/en/finance/vat-statements/new`. After the page settles, the **Statement date** field reads day/month/year (`29/09/2026`) with a 24-hour time and no AM/PM. Take a second capture before judging, because the segments appear only after hydration. The console shows no hydration error for the date field.
2. Open `/tr/finance/vat-statements/new`. The field is still `en-GB`, because it follows the tenant, not the UI language.
3. Open the date filter on `/en/finance/agent-cash-report`. It uses the same format as step 1.

If the dev server can't be reached, report this step as unverified. Don't imply it passed.

- [ ] **Step 6: Commit (only once the user has approved committing)**

```bash
cd web-app
git checkout -b feat/tenant-formatting-locale
git add apps/web/src/providers/tenant-formatting.tsx apps/web/src/providers/providers.tsx \
  "apps/web/src/app/[lang]/(main)/(unirefund)/finance/agent-cash-report/_components/client.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/finance/tour-guide-fee/_components/report.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/operations/refund/_components/payment-form.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/new-old/_components/invoice-form.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/[tagId]/_components/change-issue-date.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/parties/_components/affiliations/drawer/step-2.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/operations/tax-free-tags/new-old/_components/traveller-form.tsx" \
  apps/web/src/components/traveller-form.tsx
git commit -m "feat(web): format dates with the tenant's formatting locale"
```

Staged with it from Tasks 1–2: the two submodule pointers and the two `app-config` test files. Delivery order: the `web-utils` and `ayasofyazilim-ui` PRs first, then `web-app`. Until the submodule commits are pushed, the `web-app` branch can't be built by anyone else.
