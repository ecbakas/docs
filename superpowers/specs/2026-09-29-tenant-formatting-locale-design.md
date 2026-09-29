# Tenant formatting locale — design

**Date:** 2026-09-29 · **Scope:** backend (AdministrationService) + `web-app` (`apps/web`, `packages/utils`, `packages/ayasofyazilim-ui`) · **Status:** approved 2026-09-29

## Problem

Dates and times must follow each tenant's conventions (day/month order, 12- or
24-hour clock), and that has to hold at 100 tenants, not only the three we run
today. Right now it holds for none of them:

1. **The tenant locale is guessed from a 5-entry map.**
   `getLocaleFromCountryCode` (`packages/utils/app-config/localization.ts`) knows
   GB, US, IE, TR and DE. Every other country falls back to `"en-UK"`, which is not
   a valid BCP 47 tag (ICU happens to alias it to `en-GB`). Faroe Islands, Iceland
   and Azerbaijan are all on the fallback today.
2. **A generic guess does not work either.** Combining the UI language with the
   tenant's country (`en-FO`, `en-IS`, `en-AZ`, `en-TR`) silently resolves to bare
   `en` — US order, 12-hour clock — because CLDR has no English data for most
   regions. Measured on Node 22 / ICU 77.1 and Chrome 153:

   | Tag     | Resolves to | Clock | Sample              |
   | ------- | ----------- | ----- | ------------------- |
   | `en-UK` | `en-GB`     | 24h   | 29/09/2026, 8:11    |
   | `en-FO` | `en`        | 12h   | 09/29/2026, 8:11 AM |
   | `en-IS` | `en`        | 12h   | 09/29/2026, 8:11 AM |
   | `tr-TR` | `tr-TR`     | 24h   | 29.09.2026 8:11     |
   | `en-JP` | Node `en` / Chrome `en-JP` | 12h / 24h | differs per runtime |

3. **Date pickers get their locale three different ways.** `SchemaForm` never
   sets `formContext.locale`, so its date widgets fall back to `DatePicker`'s
   default `"en-US"` in ~115 of 117 forms — even with the UI in Turkish. Of the 7
   direct `<DatePicker>` / `<DateRangePicker>` call sites, 5 pass the UI language
   (`locale={lang}`) and 2 pass `useLocalization().locale`.

## Decision

**The user's chosen UI language decides the language dates are written in; the
tenant decides the conventions within that language.** A Türkiye tenant's user
who picks English gets English month names and English-style dates, not Turkish
ones.

The tenant expresses its conventions the way ABP already models them: each
registered language is a pair of a formatting culture and a UI culture
(`tr-TR`/`tr`, `en-GB`/`en`). The frontend validates the pair it picks and uses
it everywhere dates are formatted or entered.

## Backend contract

No new key and no new endpoint. The source is app-config's
`localization.languages`, the tenant's enabled languages as
`{ cultureName, uiCultureName }` pairs. It is already in the response;
`normalize.ts` now keeps it as `ApplicationConfiguration.languages`.

What the backend configures per tenant: for each UI language the tenant offers,
a language whose **culture name carries a region the runtime has data for**, for
example `en-GB` / `en` and `tr-TR` / `tr`. Today the Faroe Islands tenant has one
enabled language, `en` / `en`, which names no region, so it resolves through the
fallbacks below.

- **Only cultures with real CLDR data work.** `en-FO`, `en-IS`, `en-AZ` and
  `en-TR` do not exist in CLDR and would format US-style, so `normalize.ts` drops
  them on the server and the tenant falls back. For an English UI on those
  tenants, register `en-GB` (or `en-IE`, `en-DK`, `en-150`).
- **The UI culture stays bare** (`en`, `tr`). The sidebar switcher routes by the
  UI culture's language (`/tr/…`), never by the culture name, which the locale
  middleware would reject.
- **Check before configuring:** whether ABP language records are per tenant or
  host-wide. If they are host-wide, one `en-GB` registration applies to every
  tenant and overrides the country map (a US tenant's English would become
  `en-GB`).

`Abp.Localization.DefaultLanguage` and `localization.currentCulture` are not
needed. The default language is one of the registered languages, and
`currentCulture` is a single culture per request: `Accept-Language` set to
`tr-TR`, `en-GB` and `de-DE`, and `?culture=en-GB`, all returned `en`.

## Frontend resolution

One resolver in `packages/utils/app-config`, feeding `useLocalization().locale`:

Given the route language the user picked (`lang`):

1. The registered language whose UI culture is in that language: its culture
   name, trimmed and canonicalised, **only if it names a region** and
   `Intl.DateTimeFormat.supportedLocalesOf` keeps it. A bare `en` says nothing
   about conventions, so it counts as not configured. A malformed value
   (`en_GB`, `zz-ZZ`) is ignored rather than thrown on — the resolver runs on
   every page.
2. Otherwise the existing country map (GB, US, IE, TR, DE), **only when the
   mapped locale is in the user's language**. A Türkiye tenant maps to `tr-TR`
   for a Turkish reader and is skipped for an English one.
3. Otherwise, for English, `en-GB`. That is what today's invalid `"en-UK"`
   fallback already resolves to in ICU, so English dates on Faroe Islands,
   Iceland and Azerbaijan do not change. For any other language, its home
   region (`tr` → `tr-TR`, `de` → `de-DE`).

The result is `useLocalization().dateLocale`, which the date pickers (through the
provider below) and `formatToLocalizedDate` (grid date cells, `DateTooltip`) use.
`useLocalization().locale` keeps its country-based meaning for **money and
numbers**, so the amounts on a printed tag or invoice do not change with the
clerk's UI language. Changing money formatting is a separate product decision.

## Date pickers

- `DatePicker` / `DateRangePicker` (`packages/ayasofyazilim-ui/custom/date-picker`)
  stop defaulting to `"en-US"`. With no `locale` prop they inherit the nearest
  react-aria `I18nProvider` (`useLocale()`).
- `apps/web` mounts one react-aria `I18nProvider` with the resolved tenant
  locale inside its `(main)` providers, where app-config is available. Every
  picker and `SchemaForm` date widget there inherits it.
- The 7 explicit `locale=` props and the 2 `formContext={{ locale }}` props are
  removed, so there is one source.
- `apps/ssr` needs no provider: its travellers are not tenant staff, and its root
  already mounts a react-aria `I18nProvider` with the UI language, which pickers
  now inherit instead of `"en-US"`.
- `@react-aria/i18n` resolves to one instance from both `apps/web` and
  `react-aria-components` (3.12.13), so the inherited context is the same one
  the app sets. A version split would silently break this.

## Server rendering

Already done (2026-09-29, `ayasofyazilim-ui`): `DateInput` renders its segments
only after hydration. Node's ICU and the browser's disagree on formatted output
(U+202F vs U+0020 before AM in `en-US`; `en-JP` above), so no tenant locale can be
guaranteed to render identically on both sides. This is what makes the locale
choice safe to vary per tenant.

## Testing

- Resolver unit tests: valid value, unsupported value, `null`, legacy fallback,
  and no `en-UK` output.
- `ayasofyazilim-ui` Jest: a picker with no `locale` prop inherits the provider's
  locale; the existing hydration test keeps passing.
- Manual: one 12-hour and one 24-hour tenant, in both UI languages, on a form
  date field, a grid date column and a direct `DatePicker`.

## Resolved question

A single formatting culture per tenant would also pick the **language** of month
and day names, showing Turkish names to an English reader on a Türkiye tenant.
Resolved 2026-09-29 in favour of the user's choice: the culture is chosen per UI
language, from the pairs the tenant registers. Switching language in the sidebar
switches date formatting with it.
