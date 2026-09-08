# MasterDataGrid: make server filters the primary surface, behind a chip bar

**Date:** 2026-09-08
**Scope:** `packages/ayasofyazilim-ui` (the grid submodule). Expected app-side diff
is zero.
**Follows:** [2026-09-08-web-app-server-filters-design.md](2026-09-08-web-app-server-filters-design.md),
which took `serverFilters` coverage from 21 grids to 53 and 188 filters.

## Problem

`serverFilters` is now the real filter surface on 53 of `apps/web`'s 98 grids, but
the component still treats it as the secondary one.

**It is behind a tab, and the wrong tab is default.**
`components/filters/multi-filter-dialog.tsx` renders `<Tabs defaultValue="client">`,
so opening **Filters** lands on the client column-filter builder with the server
filters one click away.

**Active server filters are invisible.** The toolbar's Filters badge counts
`table.getState().columnFilters.length` — client filters only. A grid with three
server filters applied from the URL shows no badge, so a filtered result set looks
unfiltered.

**The surface it competes with is wrong on exactly these grids.**
`manualPagination` is inferred from `rowCount != null`, which is true for every
grid the previous change wired. `manualFiltering` is **not** inferred; it defaults
to false, so `getFilteredRowModel()` filters only the rows on the current page
while the footer reports `totalCount`. Filtering `status = Paid` on the client tab
narrows the visible ten rows and says nothing about the other four thousand.

**The form does not scale.** 188 filters across 53 grids, with `file/file-types`
and `management/identity/users` at 14 each and `management/logs/audit` at 12, all
rendered as stacked labelled inputs inside a `max-h-80` scrolling popover.

## Decisions

Taken with the user on 2026-09-08:

1. **Hide the client builder when `serverFilters` is defined.** It is not a
   demotion behind a tab — the misleading surface becomes unreachable on the grids
   where it misleads.
2. **Build our own chip bar on primitives already vendored.** No new dependency.
3. **No operators.** A chip is field plus value. Match semantics stay wherever the
   backend puts them.

## Library survey

Reviewed before choosing to build:

| Project | Model | Why not adopted |
| --- | --- | --- |
| [bazza/ui `data-table-filter`](https://ui.bazza.dev/docs/data-table-filter) | Linear-style chip bar; `+ Filter` → command palette → chip with operator and value. MIT, shadcn registry, 812★. v0.2 dropped the TanStack dependency and added `strategy: 'server'` | The interaction model this design copies. Its own source is not vendored: it needs `nuqs` for URL state where the grid already owns that layer, and its operator model assumes a query language ABP does not have |
| [openstatus data-table-filters](https://data-table.openstatus.dev/) | Faceted sidebar, 10 control types, nuqs or zustand, 2.2k★, explicitly "a playbook, not a library" | Closest to the existing sidebar mode, which this design keeps. Offers patterns to copy rather than a component to install |
| [sadmann7 shadcn-table](https://www.shadcn.io/template/sadmann7-shadcn-table) | Whole table plus faceted filters, Drizzle-coupled server side | Replaces the table we already have |
| [ReUI Filters](https://reui.io/components/filters) | Filter primitives | Documentation would not render; not evaluated |

**Why build rather than vendor.** `command.tsx`, `badge.tsx` and `popover.tsx` are
already in `@repo/ayasofyazilim-ui`, so the interaction model costs no dependency
and raises no conflict with
[ui-components.md](../../../web-app/.claude/rules/ui-components.md)'s ban on
third-party UI libraries. Vendoring bazza would also mean mapping its five column
types and operator set onto flat SDK query params (`userName?: string`,
`minCreationTime?: string`) where most operators have no server meaning.

## Design

### Primacy

In `master-data-grid.tsx`, a grid is **server-filtered** when
`config.serverFilters` is non-empty after `when === false` entries are dropped.

For a server-filtered grid with `serverFilterLocation === "toolbar"` (the default):

- The toolbar renders **no Filters button**, and `MultiFilterDialog` is not
  mounted. `enableFiltering` continues to govern the client builder for the other
  45 grids, whose behaviour is unchanged.
- `ServerFilterBar` renders above the table, inside the grid container. Active
  filters are continuously visible, which is what replaces the badge — no badge
  work is needed, and none is done.

For `serverFilterLocation: "left" | "right"`, the existing sidebar panel keeps
rendering `ServerFilterContent` unchanged. `operations/export-validations` is the
only grid using it and a vertical rail suits stacked inputs.

`manualFiltering` is deliberately untouched. Turning client column filters into
server round-trips is a larger behavioural change and was declined.

### The chip bar

New `components/filters/server-filter-bar.tsx`.

```
[+ Filter]  [User name: john ×]  [Created: 1 – 5 Feb ×]  [Status: Paid, Sent ×]  [Reset]
```

- **`+ Filter`** opens a `Command` palette listing only filters whose key is absent
  from the URL. `when === false` filters never appear. Choosing one adds its chip
  and opens that chip's value editor.
- **A chip** reads `label: value`. Clicking it reopens the editor. `×` removes the
  filter; for `date-range` that deletes both `keyFrom` and `keyTo`.
- **Reset** clears every filter key the config declares, and nothing else — unlike
  today's `handleReset`, which pushes a bare pathname and so also discards
  `sorting` and any unrelated query the page put there.
- The bar renders even with nothing active, as a lone `+ Filter` button: one row of
  chrome, and the affordance has to be discoverable.

### Value editors

`server-filter.tsx` already implements every editor the bar needs — `DatePicker`,
`DateRangePicker`, `Selectable` (with `singular` for `select` versus `array`), the
`Badge`-based tag input for `string-array`, and `InputGroup` for `string` and
`number`. These move to `components/filters/filter-value-editor.tsx` and are
consumed by both the chip popover and the sidebar form, so the two cannot diverge.

Extraction is a pure move: no behaviour change, and `server-filter.tsx` keeps its
own Apply/Reset footer for the sidebar.

### Commit semantics

The URL is the single source of truth; the bar holds no draft state across chips.

- `select`, `array`, `boolean`, `date`, `date-range` commit when their popover
  closes.
- `string`, `number` and `string-array` commit on Enter or on blur.
- There is no Apply button. Adding a chip is applying it.
- Every mutation `params.delete("skipCount")`, matching the fix already made to
  `handleApply`: paging is expressed as `skipCount`/`maxResultCount`, so filtering
  from page 3 otherwise skips the first rows of the filtered set.
- A `validator` that fails blocks the commit and shows its message inside the chip
  editor, as `handleApply` does today.

### Value formatting

Chip values format through `config.localization`, so dates render in the tenant's
locale and time zone rather than the browser's, and `select`/`array` chips show
their option `label` rather than the raw value — without this a `merchantId` chip
would read as a GUID. `boolean` uses the config's own option labels, so the
inverted Yes/No on `identity/users`' `notActive` still reads correctly. An `array`
chip with more than two values shows the first two and a `+N` remainder.

### Contract stability

`ServerFilterConfig` is unchanged — same eight variants, same
`key`/`label`/`placeholder`/`when`/`validator` and `keyFrom`/`keyTo`. **All 53
grids and 188 filters work with no app-side edit**, which is the constraint that
makes this landable in one submodule change. `placeholder` keeps a job: it labels
the input inside the chip editor and the palette's search box.

### Localization

No new resource keys. The bar reuses `filter.addFilter` ("Add Filter"),
`filter.selectColumn` ("Select column…") for the palette search, and
`filter.resetFilters` — all three already declared in `MasterDataGridResources` and
present in both locales.

Two keys **must be removed**: `toolbar.client` and `toolbar.server` are read only
by the tab triggers this change deletes, and `grid:keys` fails a declared key that
nothing reads. Drop them from `MasterDataGridResources` and from
`apps/web/src/language-data/core/Default/resources/{en,tr}.json`, then confirm
`i18n:unused` does not grow.

## Testing

Unlike the app-side grids, this is testable: the submodule runs jest and
`src/test/master-data-grid-row-count.test.tsx` is the precedent for testing grid
internals. Red-green on:

- URL params render the matching chips, and only those.
- A filter with `when: false` never appears in the palette.
- Adding a chip writes its key; removing deletes it.
- Removing a `date-range` chip deletes both `keyFrom` and `keyTo`.
- Every mutation clears `skipCount`.
- Reset clears the config's keys and leaves `sorting` alone.
- A failing `validator` blocks the commit and surfaces its message.
- Chip values format per type: option label not raw value, localized date,
  config-supplied boolean labels, `+N` past two array values.
- A grid with `serverFilters` renders no client Filters button; a grid without one
  still does.

## Verification

| Command | Expected |
| --- | --- |
| `pnpm --filter @repo/ayasofyazilim-ui test` | existing suites plus the new ones, green |
| `pnpm --filter web type-check` | 2 errors — the `capture-core/detectors/mrz` baseline |
| `pnpm --filter web lint` | 0 errors / 465 warnings |
| `pnpm --filter web test:unit` | 174 tests, 0 failures (1 skipped) |
| `pnpm grid:keys` | still only `pagination.totalItems`; no new drift, and `toolbar.client`/`toolbar.server` gone from both sides |
| `pnpm i18n:unused --app=web` | 6, unchanged |

`grid:keys` and `i18n:missing` are red at HEAD for reasons that predate this work;
[web-app/AGENTS.md](../../../web-app/AGENTS.md) records why.

**Not verifiable locally.** No grid can be driven end to end — `pnpm test` is
Playwright against a live deployment and its auth-setup file is absent from the
checkout. Jest covers the bar's URL behaviour and rendering; the visual result on a
real screen is unverified until someone opens it.

## Risks

- **Layout.** The bar adds a row above 53 grids. Several sit in tight flex columns
  (`finance/franchise-hq-statements` under a totals strip,
  `operations/manual-verifications`). The bar must not force the table to overflow
  its container; the implementation checks the grids with the most chrome.
- **Chip overflow.** 14 active filters will not fit one row. The bar wraps rather
  than scrolls horizontally, so nothing hides off-edge.
- **Removing a surface.** Anyone relying on the client builder on a server-filtered
  grid loses it. That is intended: what it reported there was wrong.
