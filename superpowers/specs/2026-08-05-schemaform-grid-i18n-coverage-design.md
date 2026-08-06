# Closing the localization gaps in generated forms and tables

**Date:** 2026-08-05
**Scope:** `web-app/apps/web`
**Status:** approved design, ready for implementation planning
**Companion:** [2026-08-05-unused-i18n-keys-design.md](2026-08-05-unused-i18n-keys-design.md) removed unreachable keys. This is the inverse: keys that should exist and don't.

## Problem

Two components render UI from generated schemas, and both have localization gaps — but for
entirely different reasons.

**`MasterDataGrid` is not wired at all.** Its chrome keys already exist in `core/Default` in both
locales (`table.noResults` → "Veri yok", all of `pagination.*`, `column.*`, `filter.*`). But **none
of the 82 call sites passes the `t` prop**, so `getTranslations(key, t)` falls through its
`t?.[key] ?? key` path and renders *the key itself*. Today the search box placeholder reads
`toolbar.search` and an empty table reads `table.noResults`. The `|| "No results."` fallback at
`table-body-renderer.tsx:310` is dead code — a key string is always truthy.

**`SchemaForm` is wired but incomplete.** `createUiSchemaWithResource` derives a `ui:title` for
each schema property from `resources[`\``${name}.${property}`\``]`. A missing key falls back to
`lodash.startCase(property)`, so the field shows an English-ish label rather than breaking. It is
never visibly broken, and always wrong in Turkish.

`apps/ssr` has zero of both components. Everything here is `apps/web`.

## Goals

- Every `MasterDataGrid` renders localized chrome in both locales, with the completeness enforced
  by the type checker rather than by inspection.
- A committed checker reports which schema-derived form keys are genuinely missing, distinguishing
  them from keys that would never be looked up.
- No invented Turkish. Gaps get English plus a tracked hand-off to a translator.

## Non-goals

- Turkish translation content. English lands; Turkish is a translator's job (see Phase B2).
- Changing which schema fields render. Where a field should be excluded rather than labelled, the
  tooling recommends and stops (Phase B3).
- `apps/ssr`, and the `tanstack-table` component that `MasterDataGrid` supersedes.
- Migrating `getResourceData` call sites to `getTranslations`.

## Phase A — MasterDataGrid

### A1. Reconcile the drifted key reads

The grid reads 67 distinct keys. 48 already exist in `core/Default` with Turkish. The other 19 are
a naming drift *inside the package*: the code grew snake_case and undotted reads while the type and
the JSON kept the dotted camelCase convention. `use-columns.tsx` reads `t?.["column.edit"]` on line
563 and `t?.["edit"]` on line 606 — the same button, two conventions.

Five drifted reads have correct twins in `core/Default`; renaming the read is the whole fix. Note
that three of them (`cancel`, `edit`, `save`) have twins the code **already reads elsewhere**, so
renaming merges two reads into one and the distinct key count drops from 67 to 64:

| code reads | becomes | site |
| --- | --- | --- |
| `actions` | `column.actions` | `hooks/use-columns.tsx:400` |
| `cancel` | `column.cancel` | `hooks/use-columns.tsx:594` — merges with the read at `:597` |
| `edit` | `column.edit` | `hooks/use-columns.tsx:606` — merges with the read at `:563` |
| `open_menu` | `column.openMenu` | `hooks/use-columns.tsx:472` |
| `save` | `column.save` | `hooks/use-columns.tsx:584` — merges with the read at `:587` |

The remaining 14 get renamed to the same convention **and** created:

| code reads | becomes | site |
| --- | --- | --- |
| `select_all` | `column.selectAll` | `hooks/use-columns.tsx:376` |
| `select_row` | `column.selectRow` | `hooks/use-columns.tsx:384` |
| `validation.invalid_boolean` | `validation.invalidBoolean` | `components/table/cell-renderer.tsx:159` |
| `validation.invalid_email` | `validation.invalidEmail` | `components/table/cell-renderer.tsx:83` |
| `validation.invalid_enum` | `validation.invalidEnum` | `components/table/cell-renderer.tsx:170` |
| `validation.invalid_integer` | `validation.invalidInteger` | `components/table/cell-renderer.tsx:129` |
| `validation.invalid_number` | `validation.invalidNumber` | `components/table/cell-renderer.tsx:98` |
| `validation.invalid_url` | `validation.invalidUrl` | `components/table/cell-renderer.tsx:87` |
| `validation.invalid_uuid` | `validation.invalidUuid` | `components/table/cell-renderer.tsx:91` |
| `validation.max_length` | `validation.maxLength` | `components/table/cell-renderer.tsx:72` (+1) |
| `validation.max_value` | `validation.maxValue` | `components/table/cell-renderer.tsx:115` (+3) |
| `validation.min_length` | `validation.minLength` | `components/table/cell-renderer.tsx:61` (+1) |
| `validation.min_value` | `validation.minValue` | `components/table/cell-renderer.tsx:104` (+3) |
| `validation.must_be_integer` | `validation.mustBeInteger` | `components/table/cell-renderer.tsx:131` |

The nine existing `|| "..."` fallbacks in `cell-renderer.tsx` supply the exact English text for
those keys, so no English needs inventing here.

### A2. Make the type checker the completeness gate

`MasterDataGridResources` currently declares 78 keys and `extends Record<string, string>`. That
index signature is *why* the drift was invisible: every string key type-checks, so neither the 19
undeclared reads nor the 71 declared-but-unread keys produced an error.

Redefine it as exactly the **64** keys the code reads after A1's renames, all required, with no index
signature. A missing or misspelled key then becomes a compile error. `DefaultResource`
(`typeof en.json`) contains 50 of those already and all 64 once A1's 14 additions land, so the app's
object stays assignable and `tsc` — not a reviewer — proves coverage.

The arithmetic, since the plan will assert it: 67 keys read today → minus 3 merged by rename = 64
distinct. Of those, 50 are already in `core/Default` (the original 48, plus `column.actions` and
`column.openMenu`, which exist in the JSON but were not previously read) and 14 must be created.

### A3. Wire it once

Add a `MasterDataGridProvider` inside the grid folder, supplied once from
`apps/web/src/app/[lang]/(main)/layout.tsx`. The grid prefers its existing `t` prop and falls back
to the provider, so per-call-site overrides still work and all 82 files stay untouched.

The alternative — passing `t` at each of 82 call sites — was rejected: it is 82 diffs, and the 83rd
grid someone adds silently renders raw keys again. With a provider, A2's required-key type proves the
one supplied object is complete.

### A4. Remove the dead fallback

Delete `|| "No results."` at `table-body-renderer.tsx:310`; it can never fire. `getTranslations`
keeps `?? key` as a loud development signal — with the provider always supplying values, that path
should be unreachable in the app, and a raw key appearing in UI is the symptom that says otherwise.

## Phase B — SchemaForm

### B1. `scripts/find-missing-i18n.mjs`

The inverse of the unused-key detector. For every `createUiSchemaWithResource` call site it resolves
the schema, derives the keys `uiSchemaFromSchema` would look up, and diffs against the service's
`en.json`.

Resolution took four iterations during design, and each failure mode is a hard requirement — a
naive version produces confidently wrong output:

1. **Brace-balanced argument extraction.** A fixed look-ahead window mispairs `name` with a sibling
   call's `schema`. Files legitimately contain several calls; one produced the nonsense key
   `Form.address.chainCodeId` by pairing `name: "Form.address"` with the whole merchant DTO.
2. **Import-alias resolution.** Call sites use
   `import { $UniRefund_CRMService_Customs_CreateHQCustomDto as $CreateHQCustomDto }`, so the
   identifier at the call site is not the identifier in `schemas.gen.ts`.
3. **Dotted property paths.** Nested calls pass `schema: $CreateHQCustomDto.properties.address`.
   Capturing only the leading `$identifier` silently derives keys for the wrong object.
4. **`extend` override modelling.** This is the one that matters most. An outer call passes the full
   DTO, and its `extend` block splices in nested `createUiSchemaWithResource({name: "Form.address"})`
   results that **overwrite** the outer pass's titles. Without modelling this, the checker demands
   `Form.Custom.address.*` and `Form.Custom.telephone.*` keys that are never looked up.

Every gap is classified:

- **`NEEDS_KEY`** — the derived title would render and no key exists.
- **`SUPPRESSED`** — the property carries a custom `ui:field`/`ui:widget`, `displayLabel: false`, or
  is overridden by a nested call. Reported for visibility, not filled.
- **`ABP_PLUMBING`** — infrastructure fields (`extraProperties`, `concurrencyStamp`, `sourceRoleId`,
  `sendConfirmationEmail`) that should not render at all.

The checker **must report call sites it cannot resolve** rather than skipping them. A silent skip
reads as coverage. Five sites are currently unresolvable: one local non-generated schema
(`$passwordSchema`) and four where the resource service is ambiguous between `Default` and a service
resource.

Scale measured during design: 143 call sites, 138 resolved, 1,941 derived keys, and a **naive** gap
of 543 keys — of which 528 sit in files using a custom widget or `extend`. Modelling the overrides is
what separates roughly a hundred real gaps from four hundred phantom ones. Adding those phantoms
would be permanent invisible bloat: they sit under the `Form.` prefix, which the unused-key
detector's layer 3 can never report.

### B2. Fill `NEEDS_KEY` with English, queue Turkish

`en` comes from the schema property's `title` where the generated schema provides one, otherwise
`lodash.startCase(property)`.

**Correction, found during implementation:** the claim that this leaves the English UI unchanged is
true only for plain field labels. Enum members take a different path — `uiSchemaFromSchema` builds
`ui:enumNames` as `resources[...] || key`, falling back to the **raw enum key**, never to
`startCase` (`schema-form/utils/schemas.ts:246-248`). So an enum dropdown was rendering `DRAFT` and
`WAITINGAPPROVAL` literally. Filling those keys is a real, positive English change, affecting roughly
two thirds of the 174. The work is right; the "no English UI changes" rationale was wrong for enum
keys, and the reason five all-caps members needed hand-correction is that this path never split them. `tr` receives
the same English string, and every such key is appended to `scripts/i18n-untranslated.json`:

```json
[
  { "service": "CRMService", "key": "Form.Custom.status.DRAFT", "en": "Draft" }
]
```

That file is the translator's work queue: fill `tr` in the resource file, delete the entry. A
verification step asserts every queued key still exists in both locale files, so a stale queue is
caught rather than quietly diverging.

Existing translations are reused **only when the parent path matches**, never on a bare leaf name.
The measured reason: leaf matching offered `Form.Tenant.connectionStrings.default` the value from
`inbox.filters.dropdownOptions.default` ("Tümü" — "All"), and `Form.type` the value from
`Form.address.type` ("Adres Tipi" — "Address Type"). Both are confidently wrong, and a wrong Turkish
label is worse than an English fallback because an English-reading reviewer cannot spot it.

The queue file is load-bearing, not bookkeeping. A `tr` value equal to its `en` value is
indistinguishable from a legitimate identical translation ("Email", "Fax"), so nothing can rediscover
these keys by inspection. Without the queue the hand-off silently never happens.

The 14 new keys from Phase A follow the same rule and enter the same queue.

### B3. Report ABP plumbing, do not translate it

`ABP_PLUMBING` fields get a recommendation to exclude them from the schema via the existing
`filter` mechanism, and nothing else. Changing which fields render is a behaviour change outside this
work, and translating a field that should not be visible entrenches the bug.

## Verification

- `pnpm --filter web run type-check` — load-bearing for Phase A. After A2 the required-key interface
  fails the build if the supplied resource object misses any of the 67 keys.
- `pnpm --filter web run lint`.
- `node scripts/find-missing-i18n.mjs --app=web` — zero `NEEDS_KEY`; `SUPPRESSED`, `ABP_PLUMBING`
  and unresolved counts reported and non-blocking.
- `node scripts/find-unused-i18n.mjs --app=web` — still zero, confirming the added keys are reachable
  and the renames did not orphan the five reused keys.
- Every key in `scripts/i18n-untranslated.json` exists in both `en.json` and `tr.json` of its service.
- `pnpm --filter web run init` before either type-check, per the companion spec.

**Manual checks, which cannot be automated here and must not be claimed as verified:** one table and
one form in `tr`. Phase A's is the important one — a single provider feeds all 82 grids, so a wiring
mistake is uniform rather than local. `apps/web` has no unit-test runner and the Playwright suite does
not cover grid chrome.

## Risks

- **Provider is a single point of failure** for 82 grids. Mitigated by the required-key type plus the
  manual check; the failure mode is loud (raw keys everywhere), not subtle.
- **`SUPPRESSED` is a heuristic** over `extend` shapes and `ui:*` hints. If it misjudges, it
  over-reports, which is the safe direction — the alternative is silently omitting a real gap.
- **English-in-`tr` is invisible.** Accepted deliberately; the queue file is the mitigation.
- **Renaming the five reused keys** is the only change that could orphan existing translations. The
  unused-key detector catches it: those five keys are read as literals in the package, so if a rename
  is botched they immediately report as unreachable.

## Sequencing

Phase A then Phase B. A is self-contained, has no content dependency, and delivers the visible win
(every table stops showing raw keys). B's checker is useful before its gaps are filled, so the script
lands before the key additions.
