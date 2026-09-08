# Grid Server-Filter Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tabbed Filters popover with a permanently visible chip bar on the 53 grids that define `serverFilters`, and stop rendering the client column-filter builder on those grids.

**Architecture:** A new `ServerFilterBar` renders inside the grid container above the table. It reads its state only from `useSearchParams()` and writes only through `router.push`, so the URL stays the single source of truth. Per-type value editors move out of the existing `ServerFilterContent` into a shared `filter-value-editor.tsx` used by both the chip popovers and the unchanged sidebar form. `ServerFilterConfig` does not change, so no app code is touched.

**Tech Stack:** React 19, TanStack Table v8, Tailwind v4, shadcn-derived primitives already vendored in this package (`command`, `badge`, `popover`, `input-group`), `next/navigation` for URL state, jest + ts-jest + @testing-library/react.

**Spec:** [docs/superpowers/specs/2026-09-08-grid-server-filter-bar-design.md](../specs/2026-09-08-grid-server-filter-bar-design.md)

**Approved visual reference:** <https://claude.ai/code/artifact/8bf0b8ff-bf9c-4c6e-ac91-d8c2bf978b98> — where this plan and the mockup disagree about appearance, the mockup is the intent.

## Global Constraints

- **All work is inside `packages/ayasofyazilim-ui`.** This is a git submodule of `web-app`. Commit inside it, then bump the pointer in `web-app` as the final task. Expected diff under `apps/` is **zero files**.
- **`ServerFilterConfig` must not change.** Same eight `type` variants, same `key` / `label` / `placeholder` / `when` / `validator`, same `keyFrom` / `keyTo` on `date-range`. 53 grids and 188 filters depend on it compiling unchanged.
- **No new runtime dependencies.** Build only from primitives already in `src/components/` and `src/custom/`. The package must not gain `nuqs`, `cmdk` (already present transitively via `command.tsx` — do not add it directly), or any filter library.
- **No new i18n keys.** Use only `filter.addFilter`, `filter.selectColumn`, `filter.resetFilters`, `filter.apply`, `filter.clear`, `filter.to`, which are already declared in `MasterDataGridResources`. Two keys are **deleted**: `toolbar.client` and `toolbar.server`.
- **Read resource keys through `getTranslations(key, t)`** from `../../utils/translation-utils`, never `t?.["key"]` directly — `scripts/check-grid-keys.mjs` in `web-app` parses literal reads and every declared key must be read by something.
- **Import primitives by relative path** (`../../../../components/button`), matching the sibling files in this directory. Do not use the `@repo/ayasofyazilim-ui/...` alias for primitives inside `master-data-grid/`, because `server-filter.tsx` mixes both and the relative form is what the rest of the folder uses.
- **Every URL mutation deletes `skipCount`.** Paging is `skipCount`/`maxResultCount`; a filter applied from page 3 must not skip the first rows of the new result set.
- **No comments in the code.** The user's standing instruction for this repository.
- **Run `pnpm test` from `packages/ayasofyazilim-ui`** for the jest suite. `jest-environment.js` and `jest.setup.ts` are already configured; `moduleNameMapper` maps `@repo/ayasofyazilim-ui/*` to `src/*`.

---

### Task 1: Filter-key helpers

Pure functions the bar and its tests both need: which URL keys a filter owns, which filters are visible, and how a value reads as chip text. Extracting them first means the bar's own tests can stay about behaviour rather than formatting.

**Files:**
- Create: `src/custom/master-data-grid/utils/server-filter-utils.ts`
- Test: `src/test/server-filter-utils.test.ts`

**Interfaces:**
- Consumes: `ServerFilterConfig`, `Localization` from `../types` and `../../date-tooltip`.
- Produces:
  - `urlKeysOf(filter: ServerFilterConfig): string[]`
  - `visibleFilters(filters: ServerFilterConfig[] | undefined): ServerFilterConfig[]`
  - `readFilterValue(filter: ServerFilterConfig, params: URLSearchParams): ServerFilterValue | undefined`
  - `formatFilterValue(filter: ServerFilterConfig, value: ServerFilterValue, localization?: Localization): string`
  - `type ServerFilterValue = string | number | boolean | string[] | { from?: string; to?: string }`

- [ ] **Step 1: Write the failing test**

Create `src/test/server-filter-utils.test.ts`:

```tsx
import {
  formatFilterValue,
  readFilterValue,
  urlKeysOf,
  visibleFilters,
} from "../custom/master-data-grid/utils/server-filter-utils";
import type { ServerFilterConfig } from "../custom/master-data-grid/types";

const localization = { locale: "en-GB", timeZone: "UTC", lang: "en" };

const str: ServerFilterConfig = {
  type: "string",
  key: "userName",
  label: "User Name",
  placeholder: "Filter with User Name",
};

const range: ServerFilterConfig = {
  type: "date-range",
  key: "creationTime",
  keyFrom: "minCreationTime",
  keyTo: "maxCreationTime",
  label: "Created",
  placeholder: "Filter with Created",
};

const select: ServerFilterConfig = {
  type: "select",
  key: "merchantId",
  label: "Merchant",
  placeholder: "Filter with Merchant",
  options: [
    { label: "Karaca Home", value: "8f1b-0001" },
    { label: "Vakko", value: "8f1b-0002" },
  ],
};

const multi: ServerFilterConfig = {
  type: "array",
  key: "statuses",
  label: "Status",
  placeholder: "Filter with Status",
  options: [
    { label: "Paid", value: "Paid" },
    { label: "Sent", value: "Sent" },
    { label: "Cancelled", value: "Cancelled" },
    { label: "Error", value: "Error" },
  ],
};

const bool: ServerFilterConfig = {
  type: "boolean",
  key: "notActive",
  label: "Active",
  placeholder: "Filter with Active",
  options: [
    { label: "No", value: true },
    { label: "Yes", value: false },
  ],
};

describe("urlKeysOf", () => {
  it("returns the single key for a plain filter", () => {
    expect(urlKeysOf(str)).toEqual(["userName"]);
  });

  it("returns both endpoint keys for a range, not the control key", () => {
    expect(urlKeysOf(range)).toEqual(["minCreationTime", "maxCreationTime"]);
  });
});

describe("visibleFilters", () => {
  it("drops a filter whose when is false", () => {
    const hidden: ServerFilterConfig = { ...str, key: "hidden", when: false };
    expect(visibleFilters([str, hidden]).map((f) => f.key)).toEqual([
      "userName",
    ]);
  });

  it("keeps a filter with when undefined or true", () => {
    const shown: ServerFilterConfig = { ...str, key: "shown", when: true };
    expect(visibleFilters([str, shown])).toHaveLength(2);
  });

  it("returns an empty array for undefined", () => {
    expect(visibleFilters(undefined)).toEqual([]);
  });
});

describe("readFilterValue", () => {
  it("reads a string", () => {
    const params = new URLSearchParams("userName=john");
    expect(readFilterValue(str, params)).toBe("john");
  });

  it("returns undefined when the key is absent", () => {
    expect(readFilterValue(str, new URLSearchParams())).toBeUndefined();
  });

  it("reads a repeated parameter as an array", () => {
    const params = new URLSearchParams("statuses=Paid&statuses=Sent");
    expect(readFilterValue(multi, params)).toEqual(["Paid", "Sent"]);
  });

  it("reads a single repeated parameter as a one-item array", () => {
    expect(readFilterValue(multi, new URLSearchParams("statuses=Paid"))).toEqual(
      ["Paid"]
    );
  });

  it("reads false as false, not as absent", () => {
    expect(readFilterValue(bool, new URLSearchParams("notActive=false"))).toBe(
      false
    );
  });

  it("reads a number", () => {
    const num: ServerFilterConfig = {
      type: "number",
      key: "minTotalAmount",
      label: "Min",
      placeholder: "Min",
    };
    expect(readFilterValue(num, new URLSearchParams("minTotalAmount=25"))).toBe(
      25
    );
  });

  it("reads a range from both endpoint keys", () => {
    const params = new URLSearchParams(
      "minCreationTime=2026-09-01&maxCreationTime=2026-09-08"
    );
    expect(readFilterValue(range, params)).toEqual({
      from: "2026-09-01",
      to: "2026-09-08",
    });
  });

  it("reads a half-open range", () => {
    const params = new URLSearchParams("minCreationTime=2026-09-01");
    expect(readFilterValue(range, params)).toEqual({
      from: "2026-09-01",
      to: undefined,
    });
  });

  it("returns undefined for a range with neither bound", () => {
    expect(readFilterValue(range, new URLSearchParams())).toBeUndefined();
  });
});

describe("formatFilterValue", () => {
  it("shows a string as itself", () => {
    expect(formatFilterValue(str, "john", localization)).toBe("john");
  });

  it("shows the option label, not the raw value", () => {
    expect(formatFilterValue(select, "8f1b-0001", localization)).toBe(
      "Karaca Home"
    );
  });

  it("falls back to the raw value when no option matches", () => {
    expect(formatFilterValue(select, "8f1b-9999", localization)).toBe(
      "8f1b-9999"
    );
  });

  it("shows up to two array labels then a remainder", () => {
    expect(
      formatFilterValue(multi, ["Paid", "Sent", "Cancelled", "Error"], localization)
    ).toBe("Paid, Sent +2");
  });

  it("shows two array labels with no remainder", () => {
    expect(formatFilterValue(multi, ["Paid", "Sent"], localization)).toBe(
      "Paid, Sent"
    );
  });

  it("uses the config's own boolean labels, so an inverted pair still reads right", () => {
    expect(formatFilterValue(bool, true, localization)).toBe("No");
    expect(formatFilterValue(bool, false, localization)).toBe("Yes");
  });

  it("formats a range in the localization's locale and zone", () => {
    expect(
      formatFilterValue(
        range,
        { from: "2026-09-01T00:00:00Z", to: "2026-09-08T00:00:00Z" },
        localization
      )
    ).toBe("01/09/2026 – 08/09/2026");
  });

  it("formats a half-open range with only the bound that is set", () => {
    expect(
      formatFilterValue(range, { from: "2026-09-01T00:00:00Z" }, localization)
    ).toBe("01/09/2026 – ");
  });

  it("formats a single date", () => {
    const date: ServerFilterConfig = {
      type: "date",
      key: "validOn",
      label: "Valid on",
      placeholder: "Valid on",
    };
    expect(formatFilterValue(date, "2026-09-08T00:00:00Z", localization)).toBe(
      "08/09/2026"
    );
  });

  it("joins string-array entries", () => {
    const tags: ServerFilterConfig = {
      type: "string-array",
      key: "tagNumbers",
      label: "Tag numbers",
      placeholder: "Tag numbers",
    };
    expect(formatFilterValue(tags, ["TR1", "TR2"], localization)).toBe(
      "TR1, TR2"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/ayasofyazilim-ui && pnpm test src/test/server-filter-utils.test.ts`
Expected: FAIL — `Cannot find module '../custom/master-data-grid/utils/server-filter-utils'`

- [ ] **Step 3: Write minimal implementation**

Create `src/custom/master-data-grid/utils/server-filter-utils.ts`:

```ts
import type { Localization } from "../../date-tooltip";
import type { ServerFilterConfig } from "../types";

export type ServerFilterValue =
  | string
  | number
  | boolean
  | string[]
  | { from?: string; to?: string };

export function urlKeysOf(filter: ServerFilterConfig): string[] {
  return filter.type === "date-range"
    ? [filter.keyFrom, filter.keyTo]
    : [filter.key];
}

export function visibleFilters(
  filters: ServerFilterConfig[] | undefined
): ServerFilterConfig[] {
  return (filters ?? []).filter((filter) => filter.when !== false);
}

export function readFilterValue(
  filter: ServerFilterConfig,
  params: URLSearchParams
): ServerFilterValue | undefined {
  if (filter.type === "date-range") {
    const from = params.get(filter.keyFrom) ?? undefined;
    const to = params.get(filter.keyTo) ?? undefined;
    return from || to ? { from, to } : undefined;
  }

  if (filter.type === "array" || filter.type === "string-array") {
    const all = params.getAll(filter.key).filter(Boolean);
    return all.length ? all : undefined;
  }

  const raw = params.get(filter.key);
  if (raw === null || raw === "") return undefined;

  if (filter.type === "boolean") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    return undefined;
  }

  if (filter.type === "number") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return raw;
}

function formatDate(value: string, localization?: Localization): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(localization?.locale, {
    timeZone: localization?.timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function labelOf(
  options: ReadonlyArray<{ label: string; value: string }>,
  value: string
): string {
  const hit = options.find((option) => option.value === value);
  return hit ? hit.label : value;
}

export function formatFilterValue(
  filter: ServerFilterConfig,
  value: ServerFilterValue,
  localization?: Localization
): string {
  if (filter.type === "date-range") {
    const range = value as { from?: string; to?: string };
    const from = range.from ? formatDate(range.from, localization) : "";
    const to = range.to ? formatDate(range.to, localization) : "";
    return `${from} – ${to}`;
  }

  if (filter.type === "date") {
    return formatDate(String(value), localization);
  }

  if (filter.type === "boolean") {
    const hit = filter.options.find((option) => option.value === value);
    return hit ? hit.label : String(value);
  }

  if (filter.type === "select") {
    return labelOf(filter.options, String(value));
  }

  if (filter.type === "array") {
    const values = value as string[];
    const shown = values.slice(0, 2).map((v) => labelOf(filter.options, v));
    const rest = values.length - shown.length;
    return rest > 0 ? `${shown.join(", ")} +${rest}` : shown.join(", ");
  }

  if (filter.type === "string-array") {
    return (value as string[]).join(", ");
  }

  return String(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/ayasofyazilim-ui && pnpm test src/test/server-filter-utils.test.ts`
Expected: PASS, 24 tests

- [ ] **Step 5: Commit**

```bash
git add src/custom/master-data-grid/utils/server-filter-utils.ts src/test/server-filter-utils.test.ts
git commit -m "feat(master-data-grid): filter-key and chip-value helpers"
```

---

### Task 2: URL writer

The one place that turns a filter mutation into a query string. Isolated from React so the `skipCount` rule and the narrow reset are testable without rendering.

**Files:**
- Create: `src/custom/master-data-grid/utils/server-filter-url.ts`
- Test: `src/test/server-filter-url.test.ts`

**Interfaces:**
- Consumes: `urlKeysOf`, `ServerFilterValue` from Task 1.
- Produces:
  - `applyFilterToParams(params: URLSearchParams, filter: ServerFilterConfig, value: ServerFilterValue | undefined): URLSearchParams`
  - `clearFiltersFromParams(params: URLSearchParams, filters: ServerFilterConfig[]): URLSearchParams`

Both return a new `URLSearchParams` and never mutate the argument.

- [ ] **Step 1: Write the failing test**

Create `src/test/server-filter-url.test.ts`:

```tsx
import {
  applyFilterToParams,
  clearFiltersFromParams,
} from "../custom/master-data-grid/utils/server-filter-url";
import type { ServerFilterConfig } from "../custom/master-data-grid/types";

const str: ServerFilterConfig = {
  type: "string",
  key: "userName",
  label: "User Name",
  placeholder: "p",
};

const multi: ServerFilterConfig = {
  type: "array",
  key: "statuses",
  label: "Status",
  placeholder: "p",
  options: [
    { label: "Paid", value: "Paid" },
    { label: "Sent", value: "Sent" },
  ],
};

const bool: ServerFilterConfig = {
  type: "boolean",
  key: "notActive",
  label: "Active",
  placeholder: "p",
  options: [
    { label: "No", value: true },
    { label: "Yes", value: false },
  ],
};

const range: ServerFilterConfig = {
  type: "date-range",
  key: "creationTime",
  keyFrom: "minCreationTime",
  keyTo: "maxCreationTime",
  label: "Created",
  placeholder: "p",
};

describe("applyFilterToParams", () => {
  it("sets a string value", () => {
    const out = applyFilterToParams(new URLSearchParams(), str, "john");
    expect(out.get("userName")).toBe("john");
  });

  it("does not mutate the params it was given", () => {
    const input = new URLSearchParams("sorting=name%20asc");
    applyFilterToParams(input, str, "john");
    expect(input.has("userName")).toBe(false);
  });

  it("removes the key when the value is undefined", () => {
    const out = applyFilterToParams(
      new URLSearchParams("userName=john"),
      str,
      undefined
    );
    expect(out.has("userName")).toBe(false);
  });

  it("removes the key for an empty string", () => {
    const out = applyFilterToParams(
      new URLSearchParams("userName=john"),
      str,
      ""
    );
    expect(out.has("userName")).toBe(false);
  });

  it("appends one entry per array value", () => {
    const out = applyFilterToParams(new URLSearchParams(), multi, [
      "Paid",
      "Sent",
    ]);
    expect(out.getAll("statuses")).toEqual(["Paid", "Sent"]);
  });

  it("replaces a previous array rather than adding to it", () => {
    const out = applyFilterToParams(
      new URLSearchParams("statuses=Paid&statuses=Sent"),
      multi,
      ["Cancelled"]
    );
    expect(out.getAll("statuses")).toEqual(["Cancelled"]);
  });

  it("removes the key for an empty array", () => {
    const out = applyFilterToParams(
      new URLSearchParams("statuses=Paid"),
      multi,
      []
    );
    expect(out.has("statuses")).toBe(false);
  });

  it("writes false as false rather than dropping it", () => {
    const out = applyFilterToParams(new URLSearchParams(), bool, false);
    expect(out.get("notActive")).toBe("false");
  });

  it("writes both bounds of a range", () => {
    const out = applyFilterToParams(new URLSearchParams(), range, {
      from: "2026-09-01",
      to: "2026-09-08",
    });
    expect(out.get("minCreationTime")).toBe("2026-09-01");
    expect(out.get("maxCreationTime")).toBe("2026-09-08");
  });

  it("writes only the bound that is set and clears the other", () => {
    const out = applyFilterToParams(
      new URLSearchParams("maxCreationTime=2026-09-08"),
      range,
      { from: "2026-09-01" }
    );
    expect(out.get("minCreationTime")).toBe("2026-09-01");
    expect(out.has("maxCreationTime")).toBe(false);
  });

  it("removes both bounds when the range is cleared", () => {
    const out = applyFilterToParams(
      new URLSearchParams(
        "minCreationTime=2026-09-01&maxCreationTime=2026-09-08"
      ),
      range,
      undefined
    );
    expect(out.has("minCreationTime")).toBe(false);
    expect(out.has("maxCreationTime")).toBe(false);
  });

  it("drops skipCount on every mutation, so paging restarts", () => {
    const out = applyFilterToParams(
      new URLSearchParams("skipCount=20&maxResultCount=10"),
      str,
      "john"
    );
    expect(out.has("skipCount")).toBe(false);
    expect(out.get("maxResultCount")).toBe("10");
  });

  it("drops skipCount when a filter is removed too", () => {
    const out = applyFilterToParams(
      new URLSearchParams("skipCount=20&userName=john"),
      str,
      undefined
    );
    expect(out.has("skipCount")).toBe(false);
  });

  it("leaves unrelated query the page owns alone", () => {
    const out = applyFilterToParams(
      new URLSearchParams("sorting=name%20asc&tab=summary"),
      str,
      "john"
    );
    expect(out.get("sorting")).toBe("name asc");
    expect(out.get("tab")).toBe("summary");
  });
});

describe("clearFiltersFromParams", () => {
  it("removes every key the config declares", () => {
    const out = clearFiltersFromParams(
      new URLSearchParams(
        "userName=john&statuses=Paid&minCreationTime=2026-09-01"
      ),
      [str, multi, range]
    );
    expect(out.has("userName")).toBe(false);
    expect(out.has("statuses")).toBe(false);
    expect(out.has("minCreationTime")).toBe(false);
  });

  it("keeps sorting, which today's reset discards", () => {
    const out = clearFiltersFromParams(
      new URLSearchParams("sorting=name%20asc&userName=john"),
      [str]
    );
    expect(out.get("sorting")).toBe("name asc");
  });

  it("keeps a query key no filter declares", () => {
    const out = clearFiltersFromParams(
      new URLSearchParams("tab=summary&userName=john"),
      [str]
    );
    expect(out.get("tab")).toBe("summary");
  });

  it("drops skipCount", () => {
    const out = clearFiltersFromParams(
      new URLSearchParams("skipCount=20&userName=john"),
      [str]
    );
    expect(out.has("skipCount")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/ayasofyazilim-ui && pnpm test src/test/server-filter-url.test.ts`
Expected: FAIL — `Cannot find module '../custom/master-data-grid/utils/server-filter-url'`

- [ ] **Step 3: Write minimal implementation**

Create `src/custom/master-data-grid/utils/server-filter-url.ts`:

```ts
import type { ServerFilterConfig } from "../types";
import { urlKeysOf, type ServerFilterValue } from "./server-filter-utils";

function isEmpty(value: ServerFilterValue | undefined): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    const range = value as { from?: string; to?: string };
    return !range.from && !range.to;
  }
  return false;
}

export function applyFilterToParams(
  params: URLSearchParams,
  filter: ServerFilterConfig,
  value: ServerFilterValue | undefined
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  urlKeysOf(filter).forEach((key) => next.delete(key));
  next.delete("skipCount");

  if (isEmpty(value)) return next;

  if (filter.type === "date-range") {
    const range = value as { from?: string; to?: string };
    if (range.from) next.set(filter.keyFrom, range.from);
    if (range.to) next.set(filter.keyTo, range.to);
    return next;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => next.append(filter.key, String(entry)));
    return next;
  }

  next.set(filter.key, String(value));
  return next;
}

export function clearFiltersFromParams(
  params: URLSearchParams,
  filters: ServerFilterConfig[]
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  filters.forEach((filter) => {
    urlKeysOf(filter).forEach((key) => next.delete(key));
  });
  next.delete("skipCount");
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/ayasofyazilim-ui && pnpm test src/test/server-filter-url.test.ts`
Expected: PASS, 19 tests

- [ ] **Step 5: Commit**

```bash
git add src/custom/master-data-grid/utils/server-filter-url.ts src/test/server-filter-url.test.ts
git commit -m "feat(master-data-grid): url writer for server filters"
```

---

### Task 3: Extract the value editors

A pure move of the per-type controls out of `ServerFilterContent` so the chip popover and the sidebar form share one implementation. Behaviour must not change; the existing sidebar is the regression surface.

**Files:**
- Create: `src/custom/master-data-grid/components/filters/filter-value-editor.tsx`
- Modify: `src/custom/master-data-grid/components/filters/server-filter.tsx` (replace the per-type JSX in the `serverFilters.map` body with `<FilterValueEditor>`)
- Test: `src/test/filter-value-editor.test.tsx`

**Interfaces:**
- Consumes: `ServerFilterValue` from Task 1.
- Produces:

```ts
export interface FilterValueEditorProps {
  filter: ServerFilterConfig;
  value: ServerFilterValue | undefined;
  locale?: string;
  error?: string;
  resetSignal?: number;
  onChange: (value: ServerFilterValue | undefined) => void;
  onCommit?: () => void;
}
export function FilterValueEditor(props: FilterValueEditorProps): JSX.Element;
```

`onChange` fires on every interaction. `onCommit` fires when the control reaches a committable state — a picker closing, or Enter in a text field. `resetSignal` is the existing `resetCount` remount key that `server-filter.tsx` already uses to clear `DatePicker` and `Selectable`.

- [ ] **Step 1: Write the failing test**

Create `src/test/filter-value-editor.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { FilterValueEditor } from "../custom/master-data-grid/components/filters/filter-value-editor";
import type { ServerFilterConfig } from "../custom/master-data-grid/types";

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia;
});

const str: ServerFilterConfig = {
  type: "string",
  key: "userName",
  label: "User Name",
  placeholder: "Filter with User Name",
};

describe("FilterValueEditor", () => {
  it("renders a text input carrying the current value", () => {
    render(
      <FilterValueEditor filter={str} value="john" onChange={jest.fn()} />
    );
    expect(screen.getByDisplayValue("john")).toBeInTheDocument();
  });

  it("reports each keystroke through onChange", () => {
    const onChange = jest.fn();
    render(<FilterValueEditor filter={str} value="" onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText("Filter with User Name"), {
      target: { value: "jo" },
    });
    expect(onChange).toHaveBeenCalledWith("jo");
  });

  it("commits on Enter", () => {
    const onCommit = jest.fn();
    render(
      <FilterValueEditor
        filter={str}
        value="john"
        onChange={jest.fn()}
        onCommit={onCommit}
      />
    );
    fireEvent.keyDown(screen.getByDisplayValue("john"), { key: "Enter" });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("commits on blur", () => {
    const onCommit = jest.fn();
    render(
      <FilterValueEditor
        filter={str}
        value="john"
        onChange={jest.fn()}
        onCommit={onCommit}
      />
    );
    fireEvent.blur(screen.getByDisplayValue("john"));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("renders a number input for a number filter", () => {
    const num: ServerFilterConfig = {
      type: "number",
      key: "minTotalAmount",
      label: "Min total",
      placeholder: "Min total",
    };
    render(<FilterValueEditor filter={num} value={25} onChange={jest.fn()} />);
    expect(screen.getByDisplayValue("25")).toHaveAttribute("type", "number");
  });

  it("shows a validation message when one is passed", () => {
    render(
      <FilterValueEditor
        filter={str}
        value="jo"
        error="Too short"
        onChange={jest.fn()}
      />
    );
    expect(screen.getByText("Too short")).toBeInTheDocument();
  });

  it("renders one entry per option for a boolean filter, using its own labels", () => {
    const bool: ServerFilterConfig = {
      type: "boolean",
      key: "notActive",
      label: "Active",
      placeholder: "Active",
      options: [
        { label: "No", value: true },
        { label: "Yes", value: false },
      ],
    };
    render(
      <FilterValueEditor filter={bool} value={undefined} onChange={jest.fn()} />
    );
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("adds a tag on Enter for a string-array filter", () => {
    const tags: ServerFilterConfig = {
      type: "string-array",
      key: "tagNumbers",
      label: "Tag numbers",
      placeholder: "Tag numbers",
    };
    const onChange = jest.fn();
    render(
      <FilterValueEditor filter={tags} value={["TR1"]} onChange={onChange} />
    );
    const input = screen.getByPlaceholderText("Tag numbers");
    fireEvent.change(input, { target: { value: "TR2" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["TR1", "TR2"]);
  });

  it("does not add a duplicate tag", () => {
    const tags: ServerFilterConfig = {
      type: "string-array",
      key: "tagNumbers",
      label: "Tag numbers",
      placeholder: "Tag numbers",
    };
    const onChange = jest.fn();
    render(
      <FilterValueEditor filter={tags} value={["TR1"]} onChange={onChange} />
    );
    const input = screen.getByPlaceholderText("Tag numbers");
    fireEvent.change(input, { target: { value: "TR1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/ayasofyazilim-ui && pnpm test src/test/filter-value-editor.test.tsx`
Expected: FAIL — `Cannot find module '.../filters/filter-value-editor'`

- [ ] **Step 3: Write the editor**

Create `src/custom/master-data-grid/components/filters/filter-value-editor.tsx`. Move the branch bodies out of `server-filter.tsx`'s `serverFilters.map` verbatim — the `DatePicker` branch, the `DateRangePicker` branch, the `string-array` tag branch, the `Selectable` branch for `select`/`array`/`boolean`, and the `InputGroup` fallback for `string`/`number` — changing only how they read and report their value:

```tsx
"use client";

import { Badge } from "../../../../components/badge";
import {
  Field,
  FieldError,
  FieldLabel,
} from "../../../../components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "../../../../components/input-group";
import {
  DatePicker,
  DateRangePicker,
} from "../../../date-picker";
import { Selectable } from "../../../selectable";
import { X, XCircle } from "lucide-react";
import type { ServerFilterConfig } from "../../types";
import type { ServerFilterValue } from "../../utils/server-filter-utils";

export interface FilterValueEditorProps {
  filter: ServerFilterConfig;
  value: ServerFilterValue | undefined;
  locale?: string;
  error?: string;
  resetSignal?: number;
  onChange: (value: ServerFilterValue | undefined) => void;
  onCommit?: () => void;
}

export function FilterValueEditor({
  filter,
  value,
  locale,
  error,
  resetSignal = 0,
  onChange,
  onCommit,
}: FilterValueEditorProps) {
  const label = <FieldLabel htmlFor={filter.key}>{filter.label}</FieldLabel>;
  const err = error ? <FieldError>{error}</FieldError> : null;

  if (filter.type === "date") {
    const current = value as string | undefined;
    return (
      <Field key={`${filter.key}-${resetSignal}`} className="gap-1">
        {label}
        <DatePicker
          id={filter.key}
          locale={locale}
          defaultValue={current ? new Date(current) : undefined}
          onChange={(date) => {
            onChange(date ? date.toISOString() : undefined);
            onCommit?.();
          }}
        />
        {err}
      </Field>
    );
  }

  if (filter.type === "date-range") {
    const range = (value as { from?: string; to?: string } | undefined) ?? {};
    return (
      <Field key={`${filter.key}-${resetSignal}`} className="gap-1">
        {label}
        <DateRangePicker
          id={filter.key}
          locale={locale}
          defaultValues={{
            start: range.from ? new Date(range.from) : undefined,
            end: range.to ? new Date(range.to) : undefined,
          }}
          onChange={(next) => {
            onChange({
              from: next.start?.toISOString(),
              to: next.end?.toISOString(),
            });
            onCommit?.();
          }}
        />
        {err}
      </Field>
    );
  }

  if (filter.type === "string-array") {
    const tags = (value as string[] | undefined) ?? [];
    return (
      <Field className="gap-1">
        {label}
        <InputGroup>
          <InputGroupInput
            id={filter.key}
            type="text"
            placeholder={filter.placeholder}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              const input = event.currentTarget;
              const trimmed = input.value.trim();
              if (trimmed && !tags.includes(trimmed)) {
                onChange([...tags, trimmed]);
              }
              input.value = "";
            }}
          />
        </InputGroup>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                {tag}
                <button
                  type="button"
                  className="ml-1 rounded-full hover:bg-muted"
                  onClick={() => onChange(tags.filter((t) => t !== tag))}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {err}
      </Field>
    );
  }

  if (
    filter.type === "select" ||
    filter.type === "array" ||
    filter.type === "boolean"
  ) {
    const selected = filter.options.filter((option) =>
      Array.isArray(value)
        ? value.some((entry) => String(entry) === String(option.value))
        : String(value) === String(option.value)
    );
    return (
      <Field className="gap-1">
        {label}
        <Selectable
          id={filter.key}
          key={`${filter.key}-${resetSignal}`}
          singular={filter.type !== "array"}
          options={filter.options}
          defaultValue={selected}
          getKey={(option) => String(option.value)}
          getLabel={(option) => option.label}
          onChange={(picked) => {
            const values = picked.map((option) => option.value);
            onChange(
              filter.type === "array"
                ? (values as string[])
                : (values[0] as ServerFilterValue | undefined)
            );
            onCommit?.();
          }}
          searchPlaceholderText={filter.placeholder}
          makeAChoiceText={filter.placeholder}
        />
        {err}
      </Field>
    );
  }

  const text = typeof value === "string" || typeof value === "number" ? value : "";
  return (
    <Field className="gap-1">
      {label}
      <InputGroup>
        <InputGroupInput
          id={filter.key}
          type={filter.type === "number" ? "number" : "text"}
          value={text}
          placeholder={filter.placeholder}
          onChange={(event) =>
            onChange(
              event.target.value === "" ? undefined : event.target.value
            )
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCommit?.();
            }
          }}
          onBlur={() => onCommit?.()}
          className={error ? "border-destructive" : ""}
        />
        {text !== "" && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton onClick={() => onChange(undefined)}>
              <XCircle />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
      {err}
    </Field>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/ayasofyazilim-ui && pnpm test src/test/filter-value-editor.test.tsx`
Expected: PASS, 9 tests

- [ ] **Step 5: Rewrite `server-filter.tsx` to consume it**

In `src/custom/master-data-grid/components/filters/server-filter.tsx`, replace everything inside `<FieldGroup className={"gap-3 max-h-80"}>` — the whole `serverFilters.map` render body with its five `if (filter.type === ...)` branches — with:

```tsx
{serverFilters.map((filter) => {
  if (filter.when === false) return null;
  return (
    <FilterValueEditor
      key={filter.key}
      filter={filter}
      value={localValues[filter.key] as ServerFilterValue | undefined}
      locale={locale}
      error={errors[filter.key]}
      resetSignal={resetCount}
      onChange={(next) => onValueChange(filter, next as FilterValue)}
      onCommit={
        filter.type === "string" || filter.type === "number"
          ? handleApply
          : undefined
      }
    />
  );
})}
```

Delete the now-unused imports (`Badge`, `DatePicker`, `DateRangePicker`, `Selectable`, `InputGroup*`, `X`, `XCircle`, `ScrollBar` stays) and add:

```tsx
import { FilterValueEditor } from "./filter-value-editor";
import type { ServerFilterValue } from "../../utils/server-filter-utils";
```

Keep `localValues`, `onValueChange`, `clearSingleFilter`, `handleApply`, `handleReset` and the Apply/Clear footer exactly as they are — the sidebar keeps its explicit Apply.

- [ ] **Step 6: Verify the sidebar still works and nothing else broke**

Run: `cd packages/ayasofyazilim-ui && pnpm test`
Expected: the full suite passes, including `master-data-grid-row-count.test.tsx`

Run: `cd ../.. && pnpm --filter web type-check`
Expected: 2 errors, both TS2307 on `capture-core/detectors/mrz`

- [ ] **Step 7: Commit**

```bash
git add src/custom/master-data-grid/components/filters/filter-value-editor.tsx \
        src/custom/master-data-grid/components/filters/server-filter.tsx \
        src/test/filter-value-editor.test.tsx
git commit -m "refactor(master-data-grid): share the filter value editors"
```

---

### Task 4: The chip bar

**Files:**
- Create: `src/custom/master-data-grid/components/filters/server-filter-bar.tsx`
- Test: `src/test/server-filter-bar.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces:

```ts
export interface ServerFilterBarProps<TData> {
  config: MasterDataGridConfig<TData>;
}
export function ServerFilterBar<TData>(
  props: ServerFilterBarProps<TData>
): JSX.Element | null;
```

Returns `null` when `visibleFilters(config.serverFilters)` is empty.

Required `data-testid` values, per [data-testid.md](../../../web-app/.claude/rules/data-testid.md) — every `Button` in this repo carries one:
- `server-filter-add` — the Add Filter trigger
- `server-filter-reset` — the Reset trigger
- `server-filter-chip-<key>` — a chip's edit button
- `server-filter-remove-<key>` — a chip's remove button
- `server-filter-option-<key>` — a palette entry

- [ ] **Step 1: Write the failing test**

Create `src/test/server-filter-bar.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { ServerFilterBar } from "../custom/master-data-grid/components/filters/server-filter-bar";
import type {
  MasterDataGridConfig,
  ServerFilterConfig,
} from "../custom/master-data-grid/types";

const push = jest.fn();
let search = new URLSearchParams();

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia;
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => push(...args) }),
  usePathname: () => "/en/management/logs/audit",
  useSearchParams: () => search,
}));

beforeEach(() => {
  push.mockClear();
  search = new URLSearchParams();
});

const filters: ServerFilterConfig[] = [
  {
    type: "string",
    key: "userName",
    label: "User Name",
    placeholder: "Filter with User Name",
  },
  {
    type: "string",
    key: "url",
    label: "URL",
    placeholder: "Filter with URL",
  },
  {
    type: "date-range",
    key: "executionTime",
    keyFrom: "startTime",
    keyTo: "endTime",
    label: "Date",
    placeholder: "Filter with Date",
  },
  {
    type: "select",
    key: "httpMethod",
    label: "HTTP Method",
    placeholder: "Filter with HTTP Method",
    options: [
      { label: "GET", value: "GET" },
      { label: "POST", value: "POST" },
    ],
  },
];

function config(
  serverFilters: ServerFilterConfig[] = filters
): MasterDataGridConfig<{ name: string }> {
  return {
    localization: { locale: "en-GB", timeZone: "UTC", lang: "en" },
    schema: { type: "object", properties: { name: { type: "string" } } },
    serverFilters,
    t: {
      "filter.addFilter": "Add Filter",
      "filter.selectColumn": "Select column...",
      "filter.resetFilters": "Reset filters",
    } as MasterDataGridConfig<{ name: string }>["t"],
  };
}

const lastPush = () => String(push.mock.calls[push.mock.calls.length - 1][0]);

describe("ServerFilterBar", () => {
  it("renders nothing when no filters are configured", () => {
    const { container } = render(<ServerFilterBar config={config([])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders only the Add Filter trigger when nothing is applied", () => {
    render(<ServerFilterBar config={config()} />);
    expect(screen.getByTestId("server-filter-add")).toBeInTheDocument();
    expect(screen.queryByTestId("server-filter-chip-userName")).toBeNull();
  });

  it("renders a chip for each filter present in the URL", () => {
    search = new URLSearchParams("userName=john&httpMethod=POST");
    render(<ServerFilterBar config={config()} />);
    expect(screen.getByTestId("server-filter-chip-userName")).toHaveTextContent(
      "john"
    );
    expect(
      screen.getByTestId("server-filter-chip-httpMethod")
    ).toHaveTextContent("POST");
    expect(screen.queryByTestId("server-filter-chip-url")).toBeNull();
  });

  it("renders a range chip from both endpoint keys", () => {
    search = new URLSearchParams(
      "startTime=2026-09-01T00:00:00Z&endTime=2026-09-08T00:00:00Z"
    );
    render(<ServerFilterBar config={config()} />);
    expect(
      screen.getByTestId("server-filter-chip-executionTime")
    ).toHaveTextContent("01/09/2026 – 08/09/2026");
  });

  it("offers only unset filters in the palette", () => {
    search = new URLSearchParams("userName=john");
    render(<ServerFilterBar config={config()} />);
    fireEvent.click(screen.getByTestId("server-filter-add"));
    expect(screen.getByTestId("server-filter-option-url")).toBeInTheDocument();
    expect(screen.queryByTestId("server-filter-option-userName")).toBeNull();
  });

  it("never offers a filter whose when is false", () => {
    render(
      <ServerFilterBar
        config={config([
          ...filters,
          {
            type: "string",
            key: "secret",
            label: "Secret",
            placeholder: "Secret",
            when: false,
          },
        ])}
      />
    );
    fireEvent.click(screen.getByTestId("server-filter-add"));
    expect(screen.queryByTestId("server-filter-option-secret")).toBeNull();
  });

  it("removes a filter and drops skipCount", () => {
    search = new URLSearchParams("userName=john&skipCount=20&sorting=url%20asc");
    render(<ServerFilterBar config={config()} />);
    fireEvent.click(screen.getByTestId("server-filter-remove-userName"));
    const url = lastPush();
    expect(url).not.toContain("userName");
    expect(url).not.toContain("skipCount");
    expect(url).toContain("sorting=url+asc");
  });

  it("removes both endpoint keys when a range chip is removed", () => {
    search = new URLSearchParams(
      "startTime=2026-09-01&endTime=2026-09-08&userName=john"
    );
    render(<ServerFilterBar config={config()} />);
    fireEvent.click(screen.getByTestId("server-filter-remove-executionTime"));
    const url = lastPush();
    expect(url).not.toContain("startTime");
    expect(url).not.toContain("endTime");
    expect(url).toContain("userName=john");
  });

  it("shows Reset only when something is applied", () => {
    render(<ServerFilterBar config={config()} />);
    expect(screen.queryByTestId("server-filter-reset")).toBeNull();
    search = new URLSearchParams("userName=john");
    render(<ServerFilterBar config={config()} />);
    expect(screen.getByTestId("server-filter-reset")).toBeInTheDocument();
  });

  it("resets the config's keys but keeps sorting", () => {
    search = new URLSearchParams("userName=john&startTime=2026-09-01&sorting=url%20asc");
    render(<ServerFilterBar config={config()} />);
    fireEvent.click(screen.getByTestId("server-filter-reset"));
    const url = lastPush();
    expect(url).not.toContain("userName");
    expect(url).not.toContain("startTime");
    expect(url).toContain("sorting=url+asc");
  });

  it("commits a text value into the URL", () => {
    render(<ServerFilterBar config={config()} />);
    fireEvent.click(screen.getByTestId("server-filter-add"));
    fireEvent.click(screen.getByTestId("server-filter-option-userName"));
    const input = screen.getByPlaceholderText("Filter with User Name");
    fireEvent.change(input, { target: { value: "john" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(lastPush()).toContain("userName=john");
  });

  it("does not push while a validator is failing", () => {
    const withValidator: ServerFilterConfig[] = [
      {
        type: "string",
        key: "email",
        label: "Email",
        placeholder: "Filter with Email",
        validator: {
          safeParse: (value: unknown) =>
            String(value).includes("@")
              ? { success: true, data: value }
              : {
                  success: false,
                  error: { issues: [{ message: "Invalid email" }] },
                },
        } as unknown as ServerFilterConfig["validator"],
      },
    ];
    render(<ServerFilterBar config={config(withValidator)} />);
    fireEvent.click(screen.getByTestId("server-filter-add"));
    fireEvent.click(screen.getByTestId("server-filter-option-email"));
    const input = screen.getByPlaceholderText("Filter with Email");
    fireEvent.change(input, { target: { value: "john" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText("Invalid email")).toBeInTheDocument();
  });

  it("filters the palette by the typed query", () => {
    render(<ServerFilterBar config={config()} />);
    fireEvent.click(screen.getByTestId("server-filter-add"));
    fireEvent.change(screen.getByPlaceholderText("Select column..."), {
      target: { value: "method" },
    });
    expect(
      screen.getByTestId("server-filter-option-httpMethod")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("server-filter-option-url")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/ayasofyazilim-ui && pnpm test src/test/server-filter-bar.test.tsx`
Expected: FAIL — `Cannot find module '.../filters/server-filter-bar'`

- [ ] **Step 3: Write the bar**

Create `src/custom/master-data-grid/components/filters/server-filter-bar.tsx`:

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, X } from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Button } from "../../../../components/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../../../components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../../components/popover";
import { cn } from "../../../../lib/utils";
import type { MasterDataGridConfig, ServerFilterConfig } from "../../types";
import {
  applyFilterToParams,
  clearFiltersFromParams,
} from "../../utils/server-filter-url";
import {
  formatFilterValue,
  readFilterValue,
  visibleFilters,
  type ServerFilterValue,
} from "../../utils/server-filter-utils";
import { getTranslations } from "../../utils/translation-utils";
import { FilterValueEditor } from "./filter-value-editor";

export interface ServerFilterBarProps<TData> {
  config: MasterDataGridConfig<TData>;
}

export function ServerFilterBar<TData>({
  config,
}: ServerFilterBarProps<TData>) {
  const { t, localization } = config;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, ServerFilterValue | undefined>
  >({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filters = useMemo(
    () => visibleFilters(config.serverFilters),
    [config.serverFilters]
  );

  const params = useMemo(
    () => new URLSearchParams(searchParams?.toString() ?? ""),
    [searchParams]
  );

  const applied = useMemo(
    () =>
      filters
        .map((filter) => ({
          filter,
          value: readFilterValue(filter, params),
        }))
        .filter((entry) => entry.value !== undefined || entry.filter.key in drafts),
    [filters, params, drafts]
  );

  const pushParams = useCallback(
    (next: URLSearchParams) => {
      const query = next.toString();
      startTransition(() => {
        router.push(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router]
  );

  const commit = useCallback(
    (filter: ServerFilterConfig, value: ServerFilterValue | undefined) => {
      if (filter.validator && value !== undefined && value !== "") {
        const result = filter.validator.safeParse(value);
        if (!result.success) {
          setErrors((prev) => ({
            ...prev,
            [filter.key]: result.error.issues[0]?.message ?? "",
          }));
          return;
        }
      }
      setErrors((prev) => ({ ...prev, [filter.key]: "" }));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[filter.key];
        return next;
      });
      setOpenKey(null);
      pushParams(applyFilterToParams(params, filter, value));
    },
    [params, pushParams]
  );

  const remove = useCallback(
    (filter: ServerFilterConfig) => {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[filter.key];
        return next;
      });
      setErrors((prev) => ({ ...prev, [filter.key]: "" }));
      setOpenKey(null);
      pushParams(applyFilterToParams(params, filter, undefined));
    },
    [params, pushParams]
  );

  if (!filters.length) return null;

  const unset = filters.filter(
    (filter) =>
      readFilterValue(filter, params) === undefined &&
      !(filter.key in drafts)
  );
  const hasApplied = filters.some(
    (filter) => readFilterValue(filter, params) !== undefined
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {applied.map(({ filter, value }) => {
        const draft = filter.key in drafts ? drafts[filter.key] : value;
        const text =
          value === undefined
            ? ""
            : formatFilterValue(filter, value, localization);
        return (
          <Popover
            key={filter.key}
            open={openKey === filter.key}
            onOpenChange={(open) => setOpenKey(open ? filter.key : null)}
          >
            <div className="inline-flex h-7 items-stretch overflow-hidden rounded-full border bg-secondary text-xs">
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-testid={`server-filter-chip-${filter.key}`}
                  className="inline-flex min-w-0 items-center gap-1.5 px-2.5 hover:bg-muted"
                >
                  <span className="text-muted-foreground">{filter.label}</span>
                  <span
                    className={cn(
                      "max-w-[24ch] truncate font-semibold",
                      !text && "font-normal text-muted-foreground"
                    )}
                  >
                    {text || filter.placeholder}
                  </span>
                </button>
              </PopoverTrigger>
              <button
                type="button"
                data-testid={`server-filter-remove-${filter.key}`}
                aria-label={filter.label}
                className="border-l px-1.5 text-muted-foreground hover:bg-destructive hover:text-white"
                onClick={() => remove(filter)}
              >
                <X className="size-3" />
              </button>
            </div>
            <PopoverContent align="start" className="w-72">
              <FilterValueEditor
                filter={filter}
                value={draft}
                locale={localization?.locale}
                error={errors[filter.key]}
                onChange={(next) =>
                  setDrafts((prev) => ({ ...prev, [filter.key]: next }))
                }
                onCommit={() => commit(filter, draft)}
              />
            </PopoverContent>
          </Popover>
        );
      })}

      <Popover open={paletteOpen} onOpenChange={setPaletteOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="server-filter-add"
            className="h-7 border-dashed text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3" />
            {getTranslations("filter.addFilter", t)}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <Command>
            <CommandInput
              placeholder={getTranslations("filter.selectColumn", t)}
            />
            <CommandList>
              <CommandEmpty>
                {getTranslations("filter.selectColumn", t)}
              </CommandEmpty>
              {unset.map((filter) => (
                <CommandItem
                  key={filter.key}
                  value={filter.label}
                  data-testid={`server-filter-option-${filter.key}`}
                  onSelect={() => {
                    setPaletteOpen(false);
                    setDrafts((prev) => ({
                      ...prev,
                      [filter.key]: undefined,
                    }));
                    setOpenKey(filter.key);
                  }}
                >
                  {filter.label}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {hasApplied && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="server-filter-reset"
          className="ml-auto h-7 text-xs text-muted-foreground"
          onClick={() => {
            setDrafts({});
            setErrors({});
            setOpenKey(null);
            pushParams(clearFiltersFromParams(params, filters));
          }}
        >
          {getTranslations("filter.resetFilters", t)}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/ayasofyazilim-ui && pnpm test src/test/server-filter-bar.test.tsx`
Expected: PASS, 13 tests

If `CommandItem`'s `onSelect` does not fire under `fireEvent.click` in jsdom, `cmdk` needs a pointer-event shim. Add to the test's `beforeAll` rather than changing the component:

```tsx
Element.prototype.scrollIntoView = jest.fn();
```

- [ ] **Step 5: Commit**

```bash
git add src/custom/master-data-grid/components/filters/server-filter-bar.tsx \
        src/test/server-filter-bar.test.tsx
git commit -m "feat(master-data-grid): chip bar for server filters"
```

---

### Task 5: Mount the bar and retire the tabs

**Files:**
- Modify: `src/custom/master-data-grid/components/master-data-grid.tsx` (render the bar above the table; pass `isServerFiltered` down)
- Modify: `src/custom/master-data-grid/components/toolbar/toolbar.tsx:171-191` (skip the Filters button when server-filtered)
- Modify: `src/custom/master-data-grid/components/filters/multi-filter-dialog.tsx` (drop the tabs and the server tab)
- Modify: `src/custom/master-data-grid/components/filters/index.ts` (export the bar)
- Modify: `src/custom/master-data-grid/types.ts:555,563` (delete `toolbar.client` and `toolbar.server`)
- Test: `src/test/server-filter-primacy.test.tsx`

**Interfaces:**
- Consumes: `ServerFilterBar` from Task 4, `visibleFilters` from Task 1.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing test**

Create `src/test/server-filter-primacy.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MasterDataGrid } from "../custom/master-data-grid/components/master-data-grid";
import type {
  MasterDataGridConfig,
  ServerFilterConfig,
} from "../custom/master-data-grid/types";

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = jest.fn();
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/en/management/logs/audit",
  useSearchParams: () => new URLSearchParams("userName=john"),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

interface Row {
  name: string;
}

const data: Row[] = [{ name: "row-0" }];

const serverFilters: ServerFilterConfig[] = [
  {
    type: "string",
    key: "userName",
    label: "User Name",
    placeholder: "Filter with User Name",
  },
];

const base: MasterDataGridConfig<Row> = {
  localization: { locale: "en-GB", timeZone: "UTC", lang: "en" },
  schema: { type: "object", properties: { name: { type: "string" } } },
  columns: [{ id: "name", accessorKey: "name", header: "Name" }],
  rowCount: 4312,
};

describe("server filter primacy", () => {
  it("renders the chip bar when serverFilters is defined", () => {
    render(
      <MasterDataGrid data={data} config={{ ...base, serverFilters }} />
    );
    expect(screen.getByTestId("server-filter-add")).toBeInTheDocument();
    expect(
      screen.getByTestId("server-filter-chip-userName")
    ).toHaveTextContent("john");
  });

  it("renders no client Filters button on a server-filtered grid", () => {
    render(
      <MasterDataGrid data={data} config={{ ...base, serverFilters }} />
    );
    expect(screen.queryByText("Filters")).toBeNull();
  });

  it("still renders the client Filters button when there are no serverFilters", () => {
    render(
      <MasterDataGrid
        data={data}
        config={{
          ...base,
          t: { "toolbar.filters": "Filters" } as MasterDataGridConfig<Row>["t"],
        }}
      />
    );
    expect(screen.getByText("Filters")).toBeInTheDocument();
    expect(screen.queryByTestId("server-filter-add")).toBeNull();
  });

  it("renders no chip bar when every filter is hidden by when", () => {
    render(
      <MasterDataGrid
        data={data}
        config={{
          ...base,
          serverFilters: [{ ...serverFilters[0]!, when: false }],
        }}
      />
    );
    expect(screen.queryByTestId("server-filter-add")).toBeNull();
  });

  it("keeps the sidebar rather than the bar for a right-located grid", () => {
    render(
      <MasterDataGrid
        data={data}
        config={{ ...base, serverFilters, serverFilterLocation: "right" }}
      />
    );
    expect(screen.queryByTestId("server-filter-add")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/ayasofyazilim-ui && pnpm test src/test/server-filter-primacy.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="server-filter-add"]`

- [ ] **Step 3: Mount the bar in `master-data-grid.tsx`**

Add the imports:

```tsx
import { ServerFilterBar } from "./filters/server-filter-bar";
import { visibleFilters } from "../utils/server-filter-utils";
```

Immediately after the `configWithDefaults` object literal, derive the flag:

```tsx
const isServerFiltered =
  serverFilterLocation === "toolbar" &&
  visibleFilters(serverFilters).length > 0;
```

In the returned JSX, insert the bar between `<Toolbar ... />` and the `<div className={cn("relative w-full border rounded-md overflow-hidden flex", ...)}>` that wraps the table:

```tsx
{isServerFiltered && <ServerFilterBar config={configWithDefaults} />}
```

Pass the flag to the toolbar by adding one prop to the existing `<Toolbar>` call:

```tsx
isServerFiltered={isServerFiltered}
```

- [ ] **Step 4: Suppress the client Filters button in `toolbar.tsx`**

Add `isServerFiltered?: boolean;` to `ToolbarProps<TData>` and destructure it in the signature with a `= false` default. Then change the guard at line 171 from:

```tsx
{config.enableFiltering && (
```

to:

```tsx
{config.enableFiltering && !isServerFiltered && (
```

Apply the same change to the second reader at line ~455, where `config.enableSearch || config.enableFiltering` decides whether the toolbar row renders at all:

```tsx
config.enableSearch ||
(config.enableFiltering && !isServerFiltered) ||
```

- [ ] **Step 5: Drop the tabs from `multi-filter-dialog.tsx`**

Replace the `filterContent` definition with the client content alone, and delete the now-unused `Tabs` imports and the `ServerFilterContent` import:

```tsx
const filterContent = (
  <ClientFilterContent setOpen={setOpen} table={table} config={config} />
);
```

- [ ] **Step 6: Delete the two dead resource keys**

In `src/custom/master-data-grid/types.ts`, delete lines declaring `"toolbar.client": string;` and `"toolbar.server": string;` from `MasterDataGridResources`.

Export the bar from `src/custom/master-data-grid/components/filters/index.ts`:

```tsx
export { ServerFilterBar } from "./server-filter-bar";
```

- [ ] **Step 7: Run the tests**

Run: `cd packages/ayasofyazilim-ui && pnpm test`
Expected: the whole suite green, including the five new primacy tests

- [ ] **Step 8: Commit**

```bash
git add src/custom/master-data-grid/components/master-data-grid.tsx \
        src/custom/master-data-grid/components/toolbar/toolbar.tsx \
        src/custom/master-data-grid/components/filters/multi-filter-dialog.tsx \
        src/custom/master-data-grid/components/filters/index.ts \
        src/custom/master-data-grid/types.ts \
        src/test/server-filter-primacy.test.tsx
git commit -m "feat(master-data-grid): server filters become the primary surface"
```

---

### Task 6: Remove the app-side keys and verify the gates

The two deleted declarations have matching entries in `apps/web`'s resource files. `check-grid-keys.mjs` compares the interface against what the component reads, and `find-unused-i18n.mjs` compares the resources against what the app reaches — both must come out at their recorded baselines.

**Files:**
- Modify: `apps/web/src/language-data/core/Default/resources/en.json` (remove `toolbar.client`, `toolbar.server`)
- Modify: `apps/web/src/language-data/core/Default/resources/tr.json` (remove `toolbar.client`, `toolbar.server`)
- Modify: `web-app` submodule pointer for `packages/ayasofyazilim-ui`

**Interfaces:**
- Consumes: the deleted declarations from Task 5.
- Produces: nothing.

- [ ] **Step 1: Remove the two keys from both locales**

Delete these lines from `apps/web/src/language-data/core/Default/resources/en.json`:

```json
  "toolbar.client": "Client",
  "toolbar.server": "Server",
```

And from `tr.json`:

```json
  "toolbar.client": "Tablo",
  "toolbar.server": "Sunucu",
```

Edit them out by hand or with a targeted `sed`. Do **not** round-trip the file through `json.dump` — these files carry blank-line grouping and one irregular `"key":"value"` spacing that a reformat would rewrite into a 200-line diff.

- [ ] **Step 2: Regenerate the i18n bundle**

Run: `cd apps/web && pnpm run init`
Expected: completes, ending with the `Processing resource:` list. The bundle under `src/language-data/i18n/` is gitignored but `tsc` fails on the import without it.

- [ ] **Step 3: Run every gate**

```bash
cd packages/ayasofyazilim-ui && pnpm test
cd ../.. && pnpm --filter web type-check
pnpm --filter ssr type-check
pnpm --filter web lint
pnpm --filter web test:unit
pnpm grid:keys
pnpm i18n:missing --app=web
pnpm i18n:unused --app=web
```

Expected, against the baselines in `web-app/AGENTS.md`:

| Command | Expected |
| --- | --- |
| submodule `pnpm test` | green, including the four new suites |
| `web type-check` | **2 errors**, both TS2307 on `capture-core/detectors/mrz` |
| `ssr type-check` | clean |
| `web lint` | **0 errors / 465 warnings** |
| `web test:unit` | **174 tests, 0 failures** (1 skipped) |
| `grid:keys` | exit 1 with **only** `pagination.totalItems` — `toolbar.client`/`toolbar.server` must not appear on either side |
| `i18n:missing --app=web` | NEEDS_KEY **11** |
| `i18n:unused --app=web` | **6** |

`grid:keys` and `i18n:missing` are red at HEAD for reasons that predate this work. A third `type-check` error, a new `grid:keys` entry, or a seventh unused key is yours.

- [ ] **Step 4: Commit both repos**

```bash
cd packages/ayasofyazilim-ui
git log --oneline -5
cd ../..
git add packages/ayasofyazilim-ui apps/web/src/language-data/core/Default/resources/en.json apps/web/src/language-data/core/Default/resources/tr.json
git commit -m "feat(web): pick up the grid server-filter bar"
```

Confirm the app-side diff is only the two resource files plus the submodule pointer:

```bash
git show --stat HEAD
```

- [ ] **Step 5: Check the layouts the spec flagged**

The bar adds a row above 53 grids. Read these three for a container that would now overflow, since none can be driven locally:

- `apps/web/src/app/[lang]/(main)/(unirefund)/finance/franchise-hq-statements/page.tsx` — the grid sits under a `CurrencyTotals` strip
- `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/page.tsx`
- `apps/web/src/app/[lang]/(main)/(unirefund)/file/verification/page.tsx`

Look for a fixed height or `overflow-hidden` on an ancestor that assumed the old chrome height. If one needs a change, that is an app-side edit and breaks the zero-diff expectation — report it rather than fixing it silently.

---

## Self-Review

**Spec coverage.** Every section maps to a task: *Primacy* → Task 5; *The chip bar* → Task 4 (palette, chip, Reset, always-rendered) with `+ Filter`/Reset labels from the constraint block; *Value editors* → Task 3; *Commit semantics* → Task 2 (`skipCount`, narrow reset) and Tasks 3–4 (pickers commit on change, text on Enter/blur, validator blocks); *Value formatting* → Task 1; *Contract stability* → the global constraint plus Task 6 Step 4's diff check; *Localization* → Tasks 5 and 6; *Testing* → all nine spec bullets appear as named tests; *Verification* → Task 6 Step 3; *Risks* → Task 6 Step 5 (layout), Task 4's `flex-wrap` (overflow).

**Placeholder scan.** No TBDs. Every code step carries the code. The one conditional instruction (Task 4's `scrollIntoView` shim) states the exact line and where it goes.

**Type consistency.** `ServerFilterValue` is defined once in Task 1 and imported by Tasks 2–4. `urlKeysOf` / `visibleFilters` / `readFilterValue` / `formatFilterValue` keep the same names throughout. `applyFilterToParams` / `clearFiltersFromParams` are used in Task 4 with the signatures Task 2 defines. `FilterValueEditorProps` fields match every call site: Task 3's `server-filter.tsx` rewrite passes `resetSignal`, Task 4's chip popover omits it, and both are valid against the optional field.

**One deliberate omission.** The spec's `array` chips commit "when the popover closes"; the implementation commits on each `Selectable` change instead, because `Selectable` reports the full selection on every pick and closing the popover would need a second state channel. The visible difference is one navigation per pick rather than one per popover — noted here so a reviewer does not read it as a mistake.
