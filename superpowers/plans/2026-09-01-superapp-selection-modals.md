# Super-app Selection Modals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse three full-screen pickers onto one shared frame, one generic selection modal and one country dataset, so every picker opens with a reachable header and a populated list.

**Architecture:** Four layers, bottom-up. A pure country-data module (no React Native imports, so it tests in the fast jest project); a `ListModalTemplate` that supplies the full-bleed modal frame and its safe-area insets; a generic `SelectionModal<T>` that owns search, list and row chrome; then the three callers, which become configuration. Each task leaves the app green.

**Tech Stack:** React Native 0.81 / Expo SDK 54, expo-router, NativeWind, `@shopify/flash-list`, `react-native-safe-area-context`, `react-native-circle-flags`, jest + `@testing-library/react-native`.

**Spec:** [`docs/superpowers/specs/2026-09-01-superapp-selection-modals-design.md`](../specs/2026-09-01-superapp-selection-modals-design.md)

## Global Constraints

- **Working directory:** `c:\unirefund\super-app-selection-modals` — a git worktree on branch `refactor/superapp-selection-modals`, cut from `d719a04`. **Not** `c:\unirefund\super-app`: another agent session holds that checkout on a different branch, and Task 1 was interrupted by exactly that. Do not switch branches; do not work in the shared checkout.
- **Never run `git reset --hard`, `git stash`, `git clean`, or `git checkout --` on tracked files.** These directories are shared with other agent sessions, and the two are the same repository — a destructive command in one can cost work in the other. If you find unexpected modified files, report them; do not clean them.
- **Render tests must be named `*.router.test.tsx`** (`.ts` for `renderHook`). Jest runs two projects: `node` ignores that suffix, `router` matches only it. A render test in the `node` project fails to *load*, not to assert.
- **Never import `react-native-circle-flags` from a module that a `node`-project test imports.** It resolves `react-native-web/dist/exports/Image`, which is not a dependency.
- **Use semantic colour tokens** (`text-foreground`, `bg-card`, `border-border`, …). Never `bg-white`, `text-white`, `bg-black`, `border-gray-*`, or raw hex. `src/components/ui/__tests__/tokens.test.ts` guards this and is *already red* from pre-existing violations — do not add to its list.
- **Comment density: write far fewer comments than the surrounding files suggest.** Comment the non-obvious *why* only.
- **Baselines**, measured on `d719a04` in Task 0, are the bar. Only `src/components/ui/__tests__/tokens.test.ts` may be red.
- **Localization:** every new key goes into **both** `src/localization/resources/en-US.json` and `tr-TR.json`, then the generated bundle must be rebuilt before `npm run typecheck` — `TranslationKey` derives from the bundle, not from the resources.
- **`npm run init` does not work right now.** It fetches `https://dev-api.unirefund.com`, which returns **502**. Rebuild the bundle offline instead, with `node .superpowers/sdd/2026-09-01-superapp-selection-modals/rebuild-language-data.mjs`, then confirm via `npm run check:language-data`. That script mirrors `init.ts:146-160` — it keeps the backend half of the bundle and rebuilds only the `MobileApp` half from the tracked resources, which is the only half any task here changes.

---

### Task 0: Record the baseline

**Files:** none (measurement only)

**Interfaces:**
- Consumes: nothing
- Produces: the three baseline numbers every later task compares against

- [ ] **Step 1: Confirm the branch and a clean tree**

```bash
git rev-parse --abbrev-ref HEAD   # expect: refactor/superapp-selection-modals
git log --oneline -1              # expect: d719a04 fix(super-app): inset the full-screen pickers…
git status --porcelain            # expect: no output
```

If the tree is dirty, STOP and report — do not clean it. Another session may own those files.

- [ ] **Step 2: Measure**

```bash
npm run typecheck
npm test
npm run lint
```

Record the exact suite/test/warning counts in your task report. `npm test` is expected to show `tokens.test.ts` failing and nothing else.

---

### Task 1: The pure country data module

**Files:**
- Create: `src/data/countries/countries.json` (moved with `git mv`)
- Create: `src/data/countries/phoneCodes.json` (generated)
- Create: `src/data/countries/countries.ts`
- Create: `src/data/countries/__tests__/countries.test.ts`
- Modify: `src/components/CountryInput/CountryInput.tsx:9` and `src/components/CountryInput/CountrySelectionModal.tsx:19` — import path only
- Delete: `src/components/CountryInput/countries.json` (via the move)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type CountryRecord = { alpha2: string; alpha3: string; name: string; phoneCode?: string }`
  - `buildCountries(opts: { languageCode: string; requirePhoneCode?: boolean }): CountryRecord[]`
  - `findCountryByCode(records: CountryRecord[], code: string): CountryRecord | undefined`

- [ ] **Step 1: Move the dataset and generate the dial codes**

```bash
mkdir -p src/data/countries
git mv src/components/CountryInput/countries.json src/data/countries/countries.json

node -e "
const fs = require('fs');
const legacy = JSON.parse(fs.readFileSync('src/components/PhoneInput/countries.json', 'utf8'));
const rows = JSON.parse(fs.readFileSync('src/data/countries/countries.json', 'utf8'));
const known = new Set(rows.map(r => r.alpha2.toLowerCase()));
const out = {};
for (const [code, dial] of Object.entries(legacy.phoneCodes)) if (known.has(code)) out[code] = dial;
fs.writeFileSync('src/data/countries/phoneCodes.json', JSON.stringify(out, null, 2) + '\n');
console.log(Object.keys(out).length, 'codes;', Object.keys(legacy.phoneCodes).length - Object.keys(out).length, 'dropped');
"
```

Expected output: `241 codes; 1 dropped`. The dropped one is `an` (Netherlands Antilles, dissolved 2010).

- [ ] **Step 2: Repoint the two stale imports so the app still builds**

In both `src/components/CountryInput/CountryInput.tsx` and `src/components/CountryInput/CountrySelectionModal.tsx`, change:

```ts
import countries from "./countries.json";
```

to:

```ts
import countries from "@/data/countries/countries.json";
```

- [ ] **Step 3: Write the failing test**

Create `src/data/countries/__tests__/countries.test.ts`:

```ts
import { buildCountries, findCountryByCode } from "../countries";
import phoneCodes from "../phoneCodes.json";

describe("buildCountries", () => {
  // The regression the whole change exists for: the phone picker shipped an
  // empty list because nothing ever handed it data.
  it("returns a populated list", () => {
    expect(buildCountries({ languageCode: "en" })).toHaveLength(249);
  });

  it("keeps only countries with a dial code when asked", () => {
    const dialable = buildCountries({
      languageCode: "en",
      requirePhoneCode: true,
    });
    expect(dialable).toHaveLength(241);
    expect(dialable.every((country) => Boolean(country.phoneCode))).toBe(true);
  });

  it("localizes names, falling back to English", () => {
    const turkish = buildCountries({ languageCode: "tr" });
    expect(turkish.find((c) => c.alpha2 === "DE")?.name).toBe("Almanya");

    const unknownLocale = buildCountries({ languageCode: "qq" });
    expect(unknownLocale.find((c) => c.alpha2 === "DE")?.name).toBe("Germany");
  });

  it("sorts by the localized name, not the English one", () => {
    const turkish = buildCountries({ languageCode: "tr" });
    const names = turkish.map((country) => country.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("carries the dial code with its plus sign", () => {
    const all = buildCountries({ languageCode: "en" });
    expect(all.find((c) => c.alpha2 === "DE")?.phoneCode).toBe("+49");
  });
});

describe("phoneCodes.json", () => {
  it("maps every dial code onto a country in the dataset", () => {
    const known = new Set(
      buildCountries({ languageCode: "en" }).map((c) => c.alpha2.toLowerCase()),
    );
    for (const code of Object.keys(phoneCodes)) {
      expect(known.has(code)).toBe(true);
    }
  });
});

describe("findCountryByCode", () => {
  const records = buildCountries({ languageCode: "en" });

  it("resolves a two-letter code", () => {
    expect(findCountryByCode(records, "de")?.alpha3).toBe("DEU");
  });

  it("resolves a three-letter code", () => {
    expect(findCountryByCode(records, "DEU")?.alpha2).toBe("DE");
  });

  it("returns undefined for anything else", () => {
    expect(findCountryByCode(records, "ZZ")).toBeUndefined();
    expect(findCountryByCode(records, "")).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

```bash
npx jest src/data/countries
```

Expected: FAIL — `Cannot find module '../countries'`.

- [ ] **Step 5: Write the module**

Create `src/data/countries/countries.ts`:

```ts
import countries from "./countries.json";
import phoneCodes from "./phoneCodes.json";

export type CountryRecord = {
  alpha2: string;
  alpha3: string;
  /** Localized, falling back to English. */
  name: string;
  /** e.g. "+49". Absent for the eight territories with no dial code. */
  phoneCode?: string;
};

type CountryRow = Record<string, string | number> & {
  alpha2: string;
  alpha3: string;
  en: string;
};

const rows = countries as CountryRow[];
const dialCodes = phoneCodes as Record<string, string>;

export function buildCountries(opts: {
  languageCode: string;
  requirePhoneCode?: boolean;
}): CountryRecord[] {
  const records = rows.map((row) => {
    const localized = row[opts.languageCode];
    return {
      alpha2: row.alpha2,
      alpha3: row.alpha3,
      name: typeof localized === "string" && localized ? localized : row.en,
      phoneCode: dialCodes[row.alpha2.toLowerCase()],
    };
  });

  const listed = opts.requirePhoneCode
    ? records.filter((record) => Boolean(record.phoneCode))
    : records;

  return listed.sort((a, b) => a.name.localeCompare(b.name));
}

export function findCountryByCode(
  records: CountryRecord[],
  code: string,
): CountryRecord | undefined {
  const wanted = code.toUpperCase();
  if (wanted.length === 2) {
    return records.find((record) => record.alpha2 === wanted);
  }
  if (wanted.length === 3) {
    return records.find((record) => record.alpha3 === wanted);
  }
  return undefined;
}
```

- [ ] **Step 6: Run the tests**

```bash
npx jest src/data/countries
npm run typecheck
```

Expected: all 9 tests PASS, typecheck clean.

If `resolveJsonModule` errors appear, check `tsconfig.json` — the existing JSON imports prove it is already on; do not change compiler options.

- [ ] **Step 7: Commit**

```bash
git add src/data/countries src/components/CountryInput
git commit -F - <<'MSG'
refactor(super-app): give the country data one home

The array of 249 countries moves out of CountryInput, and the 242 dial
codes are lifted out of the doomed PhoneInput copy — minus `an`, whose
country was dissolved in 2010.

`buildCountries` is deliberately free of React Native imports so it runs
in the fast jest project, which is why the flag lookup is not here.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

Use this `git commit -F - <<'MSG'` form for every commit in this plan — a quoted heredoc passes the message through literally, where `-m` with backticks and em dashes invites the shell to interpret it.

---

### Task 2: Flag lookup and the `useCountries` hook

**Files:**
- Create: `src/data/countries/flags.ts`
- Create: `src/data/countries/useCountries.ts`
- Create: `src/data/countries/index.ts`

**Interfaces:**
- Consumes: `buildCountries`, `CountryRecord`, `findCountryByCode` (Task 1)
- Produces:
  - `flagFor(alpha2: string): ImageSourcePropType`
  - `useCountries(opts?: { requirePhoneCode?: boolean }): CountryRecord[]`
  - `src/data/countries` barrel re-exporting all of the above plus Task 1's exports

- [ ] **Step 1: Write the flag lookup**

Create `src/data/countries/flags.ts`:

```ts
import type { ImageSourcePropType } from "react-native";
import { CountryFlagSources } from "react-native-circle-flags";

// Six countries in the dataset (BQ, BV, HM, SH, SJ, UM) have no asset here.
// They previously reached `<Image source={undefined}>`.
export function flagFor(alpha2: string): ImageSourcePropType {
  const key = alpha2.toLowerCase() as keyof typeof CountryFlagSources;
  return (CountryFlagSources[key] ??
    CountryFlagSources.xx) as ImageSourcePropType;
}
```

- [ ] **Step 2: Write the hook**

Create `src/data/countries/useCountries.ts`:

```ts
import { useLocalization } from "@/providers/LocalizationProvider";
import { useMemo } from "react";
import { buildCountries, type CountryRecord } from "./countries";

export function useCountries(opts?: {
  requirePhoneCode?: boolean;
}): CountryRecord[] {
  const { languageCode } = useLocalization();
  const requirePhoneCode = opts?.requirePhoneCode;

  return useMemo(
    () => buildCountries({ languageCode, requirePhoneCode }),
    [languageCode, requirePhoneCode],
  );
}
```

- [ ] **Step 3: Write the barrel**

Create `src/data/countries/index.ts`:

```ts
export {
  buildCountries,
  findCountryByCode,
  type CountryRecord,
} from "./countries";
export { flagFor } from "./flags";
export { useCountries } from "./useCountries";
```

Node-project tests must keep importing `../countries` directly — importing the barrel pulls in `flags.ts` and fails to load.

- [ ] **Step 4: Verify nothing regressed**

```bash
npm run typecheck
npx jest src/data/countries
```

Expected: clean, 9 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/data/countries
git commit -F - <<'MSG'
refactor(super-app): add the country flag lookup and its hook

Kept out of countries.ts on purpose: react-native-circle-flags resolves
react-native-web, so any module importing it cannot load in the node
jest project.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 3: `ListModalTemplate`

**Files:**
- Modify: `src/templates/Modal.tsx` — add `export` to `TemplateRoot`
- Create: `src/templates/ListModal.tsx`
- Create: `src/templates/__tests__/ListModal.router.test.tsx`

**Interfaces:**
- Consumes: `TemplateRoot` from `@/templates/Modal`, `PageHeader` from `@/components/PageHeader`
- Produces: `ListModalTemplate({ visible, onClose, title, showBack?, headerRightComponent?, children })` — `headerRightComponent` matches `ModalTemplate`'s existing prop name, not the spec's shorthand

- [ ] **Step 1: Write the failing test**

Create `src/templates/__tests__/ListModal.router.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ListModalTemplate } from "../ListModal";

// Non-zero, so an assertion cannot pass against a hardcoded 0 and prove
// nothing — the bug being fixed is exactly an inset that resolved to 0.
const metrics = {
  insets: { top: 47, bottom: 34, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useFocusEffect: jest.fn(),
}));

jest.mock("@/components/Ionicons", () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- a hoisted jest factory cannot reach a top-level import. */
  const ReactLib = require("react");
  const { View } = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    __esModule: true,
    Ionicons: ({ name }: { name: string }) =>
      ReactLib.createElement(View, { testID: `icon-${name}` }),
  };
});

// `toJSON()`'s root is the SafeAreaProvider wrapper, not anything the
// template rendered, so the frame is found by the className it owns.
function findFrame(node: any): any {
  if (!node) return null;
  if (node.props?.className === "flex-1 bg-background") return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findFrame(child);
      if (found) return found;
    }
  }
  return null;
}

function findByType(node: any, type: string): any {
  if (!node) return null;
  if (node.type === type) return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findByType(child, type);
      if (found) return found;
    }
  }
  return null;
}

function renderTemplate(
  props: Partial<React.ComponentProps<typeof ListModalTemplate>> = {},
) {
  const onClose = jest.fn();
  const utils = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ListModalTemplate visible onClose={onClose} title="Pick one" {...props}>
        <Text>body</Text>
      </ListModalTemplate>
    </SafeAreaProvider>,
  );
  return { ...utils, onClose };
}

describe("ListModalTemplate", () => {
  it("marks the Dialog full-bleed so the insets it applies are not doubled", () => {
    const { toJSON } = renderTemplate();
    const modal = findByType(toJSON(), "Modal");

    expect(modal.props.statusBarTranslucent).toBe(true);
    expect(modal.props.navigationBarTranslucent).toBe(true);
  });

  it("insets the frame from React context rather than from SafeAreaView", () => {
    const { toJSON } = renderTemplate();
    const frame = findFrame(toJSON());

    // The defect this template exists to prevent: a native SafeAreaView
    // inside a Dialog window finds no provider and pads by nothing, putting
    // the header — the only way out — under the status bar.
    expect(frame.props.style.paddingTop).toBe(47);
  });

  it("closes from the back arrow", () => {
    const { onClose } = renderTemplate();

    fireEvent.press(screen.getByLabelText("MobileApp.Common.Back"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mounts no back arrow when the host has no navigation context", () => {
    renderTemplate({ showBack: false });

    expect(screen.queryByLabelText("MobileApp.Common.Back")).toBeNull();
  });

  it("renders nothing at all while hidden", () => {
    const { toJSON } = renderTemplate({ visible: false });

    expect(findByType(toJSON(), "Modal")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest src/templates/__tests__/ListModal.router.test.tsx
```

Expected: FAIL — `Cannot find module '../ListModal'`.

- [ ] **Step 3: Export `TemplateRoot`**

In `src/templates/Modal.tsx`, change `function TemplateRoot({` to `export function TemplateRoot({`. Change nothing else in that file — its docblock is the single explanation of the inset rule and stays where it is.

- [ ] **Step 4: Write the template**

Create `src/templates/ListModal.tsx`:

```tsx
import { PageHeader } from "@/components/PageHeader";
import { TemplateRoot } from "@/templates/Modal";
import React from "react";
import { Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ListModalTemplateProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /**
   * Off for a host that portals its children — a `BottomSheetModal` renders
   * above `RootNavigator`, and the arrow mounts `useFocusEffect`, which needs
   * a navigation context that is not there.
   */
  showBack?: boolean;
  headerRightComponent?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * A full-screen modal whose body is a list. Sibling of `ModalTemplate`, minus
 * its `ScrollView`: a `FlashList` inside one fights the outer scroll for every
 * gesture, and every caller here is a list.
 */
export function ListModalTemplate({
  visible,
  onClose,
  title,
  showBack = true,
  headerRightComponent,
  children,
}: ListModalTemplateProps) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <TemplateRoot inModal>
        <View className="px-4 pt-2 mb-2">
          <PageHeader
            title={title}
            showBack={showBack}
            backAction={onClose}
            right={headerRightComponent}
          />
        </View>
        <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
          {children}
        </View>
      </TemplateRoot>
    </Modal>
  );
}
```

- [ ] **Step 5: Run the tests**

```bash
npx jest src/templates
npm run typecheck
```

Expected: the 5 new tests PASS, `Modal.router.test.tsx` still passes, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/templates
git commit -F - <<'MSG'
feat(super-app): add a list-shaped sibling to ModalTemplate

Same full-bleed Dialog and the same context-derived insets, without the
ScrollView — the callers are FlashLists, which fight an outer scroll
view for every gesture.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 4: `SelectionModal<T>`

**Files:**
- Create: `src/components/SelectionModal.tsx`
- Create: `src/components/__tests__/SelectionModal.router.test.tsx`

**Interfaces:**
- Consumes: `ListModalTemplate` (Task 3)
- Produces: `SelectionModal<T>` with exactly this prop shape:

```ts
{
  visible: boolean;
  onClose: () => void;
  title: string;
  items: T[];
  keyExtractor: (item: T) => string;
  renderRow: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  isSelected?: (item: T) => boolean;
  searchLabel?: string;
  filter?: (item: T, query: string) => boolean;
  emptyText?: string;
  noMatchText?: (query: string) => string;
  loading?: boolean;
  skeleton?: React.ReactNode;
  error?: React.ReactNode;
  showBack?: boolean;
  headerRightComponent?: React.ReactNode;
}
```

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/SelectionModal.router.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SelectionModal } from "../SelectionModal";

const metrics = {
  insets: { top: 47, bottom: 34, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useFocusEffect: jest.fn(),
}));

jest.mock("@/components/Ionicons", () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- a hoisted jest factory cannot reach a top-level import. */
  const ReactLib = require("react");
  const { View } = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    __esModule: true,
    Ionicons: ({ name }: { name: string }) =>
      ReactLib.createElement(View, { testID: `icon-${name}` }),
  };
});

type Fruit = { id: string; name: string };

const FRUIT: Fruit[] = [
  { id: "a", name: "Apple" },
  { id: "b", name: "Banana" },
  { id: "c", name: "Cherry" },
];

function renderModal(
  props: Partial<React.ComponentProps<typeof SelectionModal<Fruit>>> = {},
) {
  const onSelect = jest.fn();
  const utils = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SelectionModal<Fruit>
        visible
        onClose={jest.fn()}
        title="Pick a fruit"
        items={FRUIT}
        keyExtractor={(fruit) => fruit.id}
        renderRow={(fruit) => <Text>{fruit.name}</Text>}
        onSelect={onSelect}
        searchLabel="Search"
        filter={(fruit, query) =>
          fruit.name.toLowerCase().includes(query.toLowerCase())
        }
        noMatchText={(query) => `no match for ${query}`}
        {...props}
      />
    </SafeAreaProvider>,
  );
  return { ...utils, onSelect };
}

describe("SelectionModal", () => {
  it("lists every item", () => {
    renderModal();

    expect(screen.getByText("Apple")).toBeTruthy();
    expect(screen.getByText("Cherry")).toBeTruthy();
  });

  it("narrows the list by the query", () => {
    renderModal();

    fireEvent.changeText(screen.getByPlaceholderText("Search"), "ban");

    expect(screen.getByText("Banana")).toBeTruthy();
    expect(screen.queryByText("Apple")).toBeNull();
  });

  it("explains an empty result with the query in it", () => {
    renderModal();

    fireEvent.changeText(screen.getByPlaceholderText("Search"), "durian");

    expect(screen.getByText("no match for durian")).toBeTruthy();
  });

  it("selects the pressed row", () => {
    const { onSelect } = renderModal();

    fireEvent.press(screen.getByText("Banana"));

    expect(onSelect).toHaveBeenCalledWith(FRUIT[1]);
  });

  it("ticks only the selected row", () => {
    renderModal({ isSelected: (fruit) => fruit.id === "c" });

    expect(screen.getAllByTestId("icon-checkmark")).toHaveLength(1);
  });

  it("shows the skeleton instead of an empty list while loading", () => {
    renderModal({
      items: [],
      loading: true,
      skeleton: <Text>loading…</Text>,
      emptyText: "nothing here",
    });

    expect(screen.getByText("loading…")).toBeTruthy();
    expect(screen.queryByText("nothing here")).toBeNull();
  });

  it("shows the empty text when the source list is genuinely empty", () => {
    renderModal({ items: [], emptyText: "nothing here" });

    expect(screen.getByText("nothing here")).toBeTruthy();
  });

  it("renders a caller-supplied error block", () => {
    renderModal({ error: <Text>could not load</Text> });

    expect(screen.getByText("could not load")).toBeTruthy();
  });

  it("omits the search field when no label is given", () => {
    renderModal({ searchLabel: undefined });

    expect(screen.queryByPlaceholderText("Search")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest src/components/__tests__/SelectionModal.router.test.tsx
```

Expected: FAIL — `Cannot find module '../SelectionModal'`.

- [ ] **Step 3: Write the component**

Create `src/components/SelectionModal.tsx`:

```tsx
import { Ionicons } from "@/components/Ionicons";
import { Input, Text } from "@/components/ui";
import { ListModalTemplate } from "@/templates/ListModal";
import { colors } from "@/utils/theme";
import { FlashList } from "@shopify/flash-list";
import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

interface SelectionModalProps<T> {
  visible: boolean;
  onClose: () => void;
  title: string;
  items: T[];
  keyExtractor: (item: T) => string;
  /** The row's content. The modal owns the row's chrome and its checkmark. */
  renderRow: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  isSelected?: (item: T) => boolean;
  /** Omit to render no search field at all. */
  searchLabel?: string;
  filter?: (item: T, query: string) => boolean;
  emptyText?: string;
  noMatchText?: (query: string) => string;
  loading?: boolean;
  skeleton?: React.ReactNode;
  /** Rendered above the list; the caller owns its wording and its retry. */
  error?: React.ReactNode;
  showBack?: boolean;
  headerRightComponent?: React.ReactNode;
}

/**
 * A searchable list in a full-screen modal. Every picker in the app is one of
 * these; the three that predated it each grew their own frame, and each grew
 * the same unreachable-header bug.
 */
export function SelectionModal<T>({
  visible,
  onClose,
  title,
  items,
  keyExtractor,
  renderRow,
  onSelect,
  isSelected,
  searchLabel,
  filter,
  emptyText,
  noMatchText,
  loading,
  skeleton,
  error,
  showBack,
  headerRightComponent,
}: SelectionModalProps<T>) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed || !filter) return items;
    return items.filter((item) => filter(item, trimmed));
  }, [items, query, filter]);

  function close() {
    setQuery("");
    onClose();
  }

  function select(item: T) {
    setQuery("");
    onSelect(item);
  }

  const showSkeleton = Boolean(loading) && items.length === 0 && skeleton;
  const trimmed = query.trim();

  return (
    <ListModalTemplate
      visible={visible}
      onClose={close}
      title={title}
      showBack={showBack}
      headerRightComponent={headerRightComponent}
    >
      <View className="px-4 gap-3 flex-1">
        {searchLabel && (
          <Input
            label={searchLabel}
            iconName="search-outline"
            value={query}
            onChangeText={setQuery}
            placeholder={searchLabel}
            autoCapitalize="none"
          />
        )}

        {error}

        {showSkeleton && skeleton}

        {!showSkeleton && rows.length === 0 && (
          <Text className="mt-6 text-center text-sm text-muted">
            {trimmed.length > 0 && noMatchText ? noMatchText(trimmed) : emptyText}
          </Text>
        )}

        {rows.length > 0 && (
          <FlashList
            data={rows}
            keyExtractor={keyExtractor}
            renderItem={({ item }: { item: T }) => (
              <Pressable
                onPress={() => select(item)}
                className="flex-row items-center justify-between border-b border-border py-3"
              >
                {renderRow(item)}
                {isSelected?.(item) && (
                  <Ionicons name="checkmark" size={20} color={colors.success} />
                )}
              </Pressable>
            )}
          />
        )}
      </View>
    </ListModalTemplate>
  );
}
```

- [ ] **Step 4: Run the tests**

```bash
npx jest src/components/__tests__/SelectionModal.router.test.tsx
npm run typecheck
```

Expected: 9 tests PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/SelectionModal.tsx src/components/__tests__/SelectionModal.router.test.tsx
git commit -F - <<'MSG'
feat(super-app): add the generic selection modal

Owns the search field, the list, the row chrome and the checkmark. The
caller keeps what is genuinely its own: the row's content and, where it
has one, its error and retry.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 5: Move the tenant picker onto it

**Files:**
- Modify: `src/components/TenantInput/TenantSelectionModal.tsx` (rewritten; **path must not change** — `src/screens/shared/__tests__/StaffLoginScreen.router.test.tsx:54` mocks it by path)

**Interfaces:**
- Consumes: `SelectionModal` (Task 4)
- Produces: no API change — `TenantSelectionModal({ visible, onClose, includeInternal })` keeps its signature

This closes the first reported bug: the tenant picker's close and refresh buttons were under the status bar.

- [ ] **Step 1: Rewrite the component**

Replace the whole of `src/components/TenantInput/TenantSelectionModal.tsx` with:

```tsx
import { Ionicons } from "@/components/Ionicons";
import { SelectionModal } from "@/components/SelectionModal";
import { Button, Text } from "@/components/ui";
import { useLocalization } from "@/providers/LocalizationProvider";
import { loadTenants } from "@/store/loadTenants";
import useTenantStore from "@/store/tenant";
import type { TenantOption } from "@/store/tenant.types";
import { colors } from "@/utils/theme";
import { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { filterTenants, TENANT_ERROR_KEYS } from "./tenantList";
import { TenantSelectionSkeleton } from "./TenantSelectionSkeleton";

/**
 * Searchable tenant list. Sibling of `CountryPickerModal`: both are a
 * `SelectionModal` plus the data and the header controls they own.
 */
export function TenantSelectionModal({
  visible,
  onClose,
  includeInternal,
}: {
  visible: boolean;
  onClose: () => void;
  includeInternal: boolean;
}) {
  const { t } = useLocalization();
  const tenants = useTenantStore((state) => state.tenants);
  const tenantId = useTenantStore((state) => state.tenantId);
  const status = useTenantStore((state) => state.status);
  const errorCode = useTenantStore((state) => state.errorCode);
  const setTenantId = useTenantStore((state) => state.setTenantId);
  const environment = useTenantStore((state) => state.environment);

  // The list belongs to one environment. If that changes underneath, this view
  // is stale, so close instead of showing another gateway's tenants. The ref
  // holds the mount value so this cannot fire on mount.
  const mountedEnvironment = useRef(environment);
  useEffect(() => {
    if (mountedEnvironment.current !== environment) {
      mountedEnvironment.current = environment;
      onClose();
    }
  }, [environment, onClose]);

  const isLoading = status === "loading";

  // The internal-tenant rule is not a search: it decides what is listable at
  // all, so it stays here and the modal narrows by query on top of it.
  const listable = useMemo(
    () =>
      filterTenants(tenants, {
        query: "",
        includeInternal,
        selectedId: tenantId,
      }),
    [tenants, includeInternal, tenantId],
  );

  async function select(tenant: TenantOption) {
    await setTenantId(tenant.id);
    onClose();
  }

  return (
    <SelectionModal<TenantOption>
      visible={visible}
      onClose={onClose}
      title={t("MobileApp.TenantSelection.Title")}
      items={listable}
      keyExtractor={(tenant) => tenant.id}
      renderRow={(tenant) => (
        <Text className="flex-1 text-base text-foreground">{tenant.name}</Text>
      )}
      onSelect={select}
      isSelected={(tenant) => tenant.id === tenantId}
      searchLabel={t("MobileApp.TenantSelection.Search")}
      filter={(tenant, query) =>
        tenant.name.toLowerCase().includes(query.toLowerCase())
      }
      emptyText={t("MobileApp.TenantSelection.Empty")}
      noMatchText={(query) =>
        t("MobileApp.TenantSelection.NoMatch", { query })
      }
      loading={isLoading}
      skeleton={<TenantSelectionSkeleton />}
      error={
        errorCode === "loadFailed" ? (
          <View className="gap-2">
            <Text className="text-center text-error text-sm">
              {t(TENANT_ERROR_KEYS.loadFailed)}
            </Text>
            <Button
              action={{
                onPress: () => loadTenants({ force: true }),
                label: t("MobileApp.TenantSelection.Retry"),
              }}
              isLoading={isLoading}
            />
          </View>
        ) : undefined
      }
      headerRightComponent={
        <Pressable
          onPress={() => loadTenants({ force: true })}
          disabled={isLoading}
          hitSlop={12}
          accessibilityLabel={t("MobileApp.TenantSelection.Refresh")}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.info} />
          ) : (
            <Ionicons name="refresh" size={22} color={colors.info} />
          )}
        </Pressable>
      }
    />
  );
}
```

- [ ] **Step 2: Verify the login screen's suite still passes**

```bash
npx jest src/screens/shared/__tests__/StaffLoginScreen.router.test.tsx
npm run typecheck
```

Expected: PASS, clean. If the mock at line 54 fails to resolve, the file was moved — move it back.

- [ ] **Step 3: Commit**

```bash
git add src/components/TenantInput/TenantSelectionModal.tsx
git commit -F - <<'MSG'
fix(super-app): make the tenant picker's header reachable

It drew its own frame around a native SafeAreaView, which inside a
Dialog window pads by nothing — putting close and refresh under the
status bar. On SelectionModal it inherits the fixed frame, and the back
arrow replaces the close X.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 6: `CountryPickerModal` and its two localization keys

**Files:**
- Create: `src/components/CountryPicker/CountryPickerModal.tsx`
- Create: `src/components/CountryPicker/__tests__/CountryPickerModal.router.test.tsx`
- Modify: `src/localization/resources/en-US.json` — add two keys under `CountrySelection`
- Modify: `src/localization/resources/tr-TR.json` — same two keys

**Interfaces:**
- Consumes: `SelectionModal` (Task 4), `useCountries` / `flagFor` / `CountryRecord` (Tasks 1-2)
- Produces: `CountryPickerModal({ visible, onClose, onSelect, selectedAlpha2?, showPhoneCode?, showBack? })` where `onSelect: (country: CountryRecord) => void`

- [ ] **Step 1: Add the localization keys**

In `src/localization/resources/en-US.json`, the `CountrySelection` object currently holds only `Title`. Add three siblings:

```json
"CountrySelection": {
  "Title": "Country Selection",
  "Search": "Search countries",
  "NoMatch": "No country matches \"{query}\".",
  "Placeholder": "Select a country"
}
```

In `src/localization/resources/tr-TR.json`:

```json
"CountrySelection": {
  "Title": "Ülke Seçimi",
  "Search": "Ülke ara",
  "NoMatch": "\"{query}\" ile eşleşen ülke yok.",
  "Placeholder": "Bir ülke seçin"
}
```

Keep each file's existing key order and indentation; only `Title` already exists. `Placeholder` mirrors the existing `TenantSelection.Placeholder` and replaces a hardcoded English string in Task 8.

The close control also needs a label. `Common` currently has `Back` but no `Close` — the only "Close" in the resources is `Profile.QrCode.Close`, which is that screen's own. Add a sibling to `Common.Back` in both files:

```json
"Common": { "Back": "Go back", "Close": "Close" }
```

```json
"Common": { "Back": "Geri dön", "Close": "Kapat" }
```

**Add only the `Close` entry.** Leave each file's existing `Common.Back` value exactly as it already is — the `Back` values shown above are illustrative and may not match what is in the files. `Close` gets its own wording: `"Close"` in en-US, `"Kapat"` in tr-TR. Do **not** give `Close` the same value as `Back`; it labels a dismiss control, and a screen reader announcing "Go back" on it is the defect this key exists to avoid.

- [ ] **Step 2: Regenerate the translation-key bundles**

`npm run init` is the normal command, but it **cannot run** — it fetches `https://dev-api.unirefund.com`, which returns 502. Use the offline rebuild instead:

```bash
node .superpowers/sdd/2026-09-01-superapp-selection-modals/rebuild-language-data.mjs
npm run check:language-data
```

The rebuild mirrors `init.ts:146-160`: it keeps the bundle's backend-sourced half and rebuilds only the `MobileApp` half from the tracked resources, which is the only half this task changes. `check:language-data` must print "Generated data is up to date" — it reads local files only and never contacts the backend.

Without this, `tsc` rejects the new `t()` calls — `TranslationKey` is derived from the gitignored generated bundles, not from the resource files you just edited. **This step is the first real exercise of the offline rebuild against changed resources; if `check:language-data` reports a stale bundle, stop and report rather than working around it.**

- [ ] **Step 3: Write the failing test**

Create `src/components/CountryPicker/__tests__/CountryPickerModal.router.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CountryPickerModal } from "../CountryPickerModal";

const metrics = {
  insets: { top: 47, bottom: 34, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key, languageCode: "en" }),
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useFocusEffect: jest.fn(),
}));

jest.mock("@/components/Ionicons", () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- a hoisted jest factory cannot reach a top-level import. */
  const ReactLib = require("react");
  const { View } = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    __esModule: true,
    Ionicons: ({ name }: { name: string }) =>
      ReactLib.createElement(View, { testID: `icon-${name}` }),
  };
});

jest.mock("@/components/Image", () => ({
  __esModule: true,
  default: () => null,
}));

function renderPicker(
  props: Partial<React.ComponentProps<typeof CountryPickerModal>> = {},
) {
  const onSelect = jest.fn();
  const utils = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <CountryPickerModal
        visible
        onClose={jest.fn()}
        onSelect={onSelect}
        {...props}
      />
    </SafeAreaProvider>,
  );
  return { ...utils, onSelect };
}

describe("CountryPickerModal", () => {
  // The bug this component exists to end: PhoneCountrySelectionModal bailed
  // to [] unless a caller passed data, and no caller ever did.
  it("lists countries without any caller supplying them", () => {
    renderPicker();

    expect(screen.getByText("Germany")).toBeTruthy();
  });

  it("passes the whole record to onSelect", () => {
    const { onSelect } = renderPicker();

    fireEvent.press(screen.getByText("Germany"));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ alpha2: "DE", alpha3: "DEU" }),
    );
  });

  it("shows dial codes and hides codeless territories in phone mode", () => {
    renderPicker({ showPhoneCode: true });

    expect(screen.getByText("+49")).toBeTruthy();
    // Bouvet Island has no dial code and must not be offered as one.
    expect(screen.queryByText("Bouvet Island")).toBeNull();
  });

  it("lists codeless territories when dial codes are irrelevant", () => {
    renderPicker();

    expect(screen.getByText("Bouvet Island")).toBeTruthy();
  });

  it("offers a close control instead of a back arrow when asked", () => {
    renderPicker({ showBack: false });

    expect(screen.queryByLabelText("MobileApp.Common.Back")).toBeNull();
    expect(screen.getByTestId("icon-close")).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

```bash
npx jest src/components/CountryPicker
```

Expected: FAIL — `Cannot find module '../CountryPickerModal'`.

- [ ] **Step 5: Write the component**

Create `src/components/CountryPicker/CountryPickerModal.tsx`:

```tsx
import Image from "@/components/Image";
import { Ionicons } from "@/components/Ionicons";
import { SelectionModal } from "@/components/SelectionModal";
import { Text } from "@/components/ui";
import { flagFor, useCountries, type CountryRecord } from "@/data/countries";
import { useLocalization } from "@/providers/LocalizationProvider";
import { colors } from "@/utils/theme";
import React from "react";
import { Pressable, View } from "react-native";

/**
 * The app's country list. Reads its own data rather than taking it as a prop:
 * the picker this replaces took one, no caller passed it, and it silently
 * rendered an empty list for as long as it shipped.
 */
export function CountryPickerModal({
  visible,
  onClose,
  onSelect,
  selectedAlpha2,
  showPhoneCode,
  showBack,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (country: CountryRecord) => void;
  selectedAlpha2?: string;
  /** Dial-code mode: shows each code and drops the countries that have none. */
  showPhoneCode?: boolean;
  showBack?: boolean;
}) {
  const { t } = useLocalization();
  const countries = useCountries({ requirePhoneCode: showPhoneCode });

  return (
    <SelectionModal<CountryRecord>
      visible={visible}
      onClose={onClose}
      title={t("MobileApp.CountrySelection.Title")}
      items={countries}
      keyExtractor={(country) => country.alpha2}
      renderRow={(country) => (
        <View className="flex-1 flex-row items-center gap-3">
          <Image source={flagFor(country.alpha2)} width={20} height={20} />
          <Text className="flex-1 text-base text-foreground">
            {country.name}
          </Text>
          {showPhoneCode && (
            <Text className="text-base text-muted">{country.phoneCode}</Text>
          )}
        </View>
      )}
      onSelect={(country) => {
        onSelect(country);
        onClose();
      }}
      isSelected={(country) =>
        Boolean(selectedAlpha2) &&
        country.alpha2.toLowerCase() === selectedAlpha2?.toLowerCase()
      }
      searchLabel={t("MobileApp.CountrySelection.Search")}
      filter={(country, query) =>
        country.name.toLowerCase().includes(query.toLowerCase())
      }
      noMatchText={(query) => t("MobileApp.CountrySelection.NoMatch", { query })}
      showBack={showBack}
      headerRightComponent={
        showBack === false ? (
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel={t("MobileApp.Common.Close")}
          >
            <Ionicons name="close" size={24} color={colors.foreground} />
          </Pressable>
        ) : undefined
      }
    />
  );
}
```

- [ ] **Step 6: Run the tests**

```bash
npx jest src/components/CountryPicker
npm run typecheck
```

Expected: 5 tests PASS, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/CountryPicker src/localization/resources
git commit -F - <<'MSG'
feat(super-app): add one country picker for both callers

It reads its own data. The picker it replaces took countries as a prop
and bailed to an empty list without one, which is exactly what both of
its callers gave it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 7: Rewire both callers and delete what they replaced

**Files:**
- Modify: `src/components/PhoneInput/index.tsx`
- Modify: `src/components/CountryInput/CountryInput.tsx`
- Delete: `src/components/PhoneInput/PhoneCountrySelectionModal.tsx`
- Delete: `src/components/PhoneInput/countries.json`
- Delete: `src/components/CountryInput/CountrySelectionModal.tsx`

**Interfaces:**
- Consumes: `CountryPickerModal` (Task 6), `findCountryByCode` / `useCountries` (Tasks 1-2)
- Produces: `PhoneInput` loses its `countries` prop and its `Country` export; `CountryInput` keeps `{ value, onCountryChange, title }` but `onCountryChange` now receives a `CountryRecord`

This closes the second reported bug and the empty-list bug behind it.

- [ ] **Step 1: Rewire `PhoneInput`**

In `src/components/PhoneInput/index.tsx`:

1. Delete the `import countries from "./countries.json";` line and the `PhoneCountrySelectionModal` / `Country` import block.
2. Add `import { CountryPickerModal } from "@/components/CountryPicker/CountryPickerModal";`, `import { flagFor, useCountries, findCountryByCode } from "@/data/countries";`.
3. Delete `countries?: Country[];` from `PhoneInputProps` and `countries: countryList,` from the destructured params.
4. Replace the `flag` / `countryCallingCode` memo, which read the deleted JSON, with a lookup over the shared data:

```tsx
const countries = useCountries({ requirePhoneCode: true });

const { flag, countryCallingCode } = useMemo(() => {
  const match = findCountryByCode(countries, selectedCountryCode);
  return {
    flag: flagFor(selectedCountryCode),
    countryCallingCode: match?.phoneCode ?? "",
  };
}, [countries, selectedCountryCode]);
```

5. Replace the trailing `<PhoneCountrySelectionModal … />` with:

```tsx
<CountryPickerModal
  visible={modalVisible}
  onClose={() => setModalVisible(false)}
  onSelect={(country) =>
    setSelectedCountryCode(country.alpha2 as CountryCode)
  }
  selectedAlpha2={selectedCountryCode}
  showPhoneCode
/>
```

- [ ] **Step 2: Rewire `CountryInput`**

In `src/components/CountryInput/CountryInput.tsx`:

1. Delete `getCountryCodeFromAlpha2`, `getCountryCodeFromAlpha3`, the `CountryItemType` type, and the `countries.json` / `CountryFlagSources` / `CountrySelectionModal` imports.
2. Import `import { CountryPickerModal } from "@/components/CountryPicker/CountryPickerModal";`, `import { findCountryByCode, flagFor, useCountries, type CountryRecord } from "@/data/countries";`.
3. Change the prop type to `onCountryChange: (value: CountryRecord) => void`.
4. Replace the `selectedCountryCode` memo with:

```tsx
const countries = useCountries();
const selected = useMemo(
  () => findCountryByCode(countries, value),
  [countries, value],
);
```

5. In the trigger, use `flagFor(selected?.alpha2 ?? "xx")` for the image and `selected?.name` for the label.
6. Replace `<CountrySelectionModal … />` with:

```tsx
<CountryPickerModal
  visible={modalVisible}
  onClose={() => setModalVisible(false)}
  onSelect={onCountryChange}
  selectedAlpha2={selected?.alpha2}
  // No back arrow: this renders inside AddBankSheet, a BottomSheetModal,
  // whose portal sits above RootNavigator — the arrow's useFocusEffect
  // would find no navigation context.
  showBack={false}
/>
```

- [ ] **Step 3: Update `AddBankSheet`'s callback**

`src/screens/traveller/Cards/_components/AddBankSheet.tsx:167` passes `(country) => setCountryCode(country.countryCode2)`. Change `country.countryCode2` to `country.alpha2`. The cast comment above it still holds — `alpha2` is ISO-3166 alpha-2.

- [ ] **Step 4: Delete the replaced files**

```bash
git rm src/components/PhoneInput/PhoneCountrySelectionModal.tsx \
       src/components/PhoneInput/countries.json \
       src/components/CountryInput/CountrySelectionModal.tsx
```

- [ ] **Step 5: Verify nothing still references them**

```bash
grep -rn "PhoneCountrySelectionModal\|CountrySelectionModal\|CountryItemType\|getCountryCodeFromAlpha\|PhoneInput/countries.json" src
```

Expected: no output.

- [ ] **Step 6: Run the gates**

```bash
npm run typecheck
npm test
npm run lint
```

Expected: typecheck clean; `tokens.test.ts` the only red suite; no new lint warnings.

- [ ] **Step 7: Commit**

```bash
git add -A src/components src/screens/traveller/Cards/_components/AddBankSheet.tsx
git commit -F - <<'MSG'
fix(super-app): give the phone picker a list, and one dataset to both

The phone country picker rendered an empty list behind an unreachable
close button: it bailed to [] without a countries prop, and neither
EditProfileScreen nor DiditScreen passed one. Both country pickers now
share CountryPickerModal and one dataset, which drops a 297KB JSON whose
languages map nothing imported.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 8: Extract the shared trigger row

**Files:**
- Create: `src/components/ui/SelectField.tsx`
- Modify: `src/components/ui/index.ts` — export it
- Modify: `src/components/TenantInput/TenantInput.tsx`
- Modify: `src/components/CountryInput/CountryInput.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `SelectField({ label, value, placeholder, iconName?, leftContent?, disabled?, onPress, error? })`

- [ ] **Step 1: Write the component**

Create `src/components/ui/SelectField.tsx`:

```tsx
import { Ionicons, type IoniconsTypes } from "@/components/Ionicons";
import Text from "@/components/ui/Text";
import { cn } from "@/utils/cn";
import { colors } from "@/utils/theme";
import React from "react";
import { Pressable, View } from "react-native";

interface SelectFieldProps {
  label: string;
  /** The current selection, or undefined to show `placeholder` instead. */
  value?: string;
  placeholder: string;
  iconName?: IoniconsTypes;
  /** Replaces the leading icon — a flag, for instance. */
  leftContent?: React.ReactNode;
  disabled?: boolean;
  onPress: () => void;
  error?: string;
}

/** A field that opens a picker. The trigger half of every `SelectionModal`. */
export function SelectField({
  label,
  value,
  placeholder,
  iconName,
  leftContent,
  disabled,
  onPress,
  error,
}: SelectFieldProps) {
  return (
    <View className="mb-3">
      <Text className="text-lg font-bold text-foreground mb-2">{label}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled) }}
        className={cn(
          "bg-card border-input rounded-2xl border flex-row items-center px-3",
          disabled && "opacity-50",
        )}
      >
        {leftContent ??
          (iconName && (
            <Ionicons name={iconName} size={24} color={colors.placeholder} />
          ))}
        <Text className="flex-1 text-foreground py-4 pl-4">
          {value ?? placeholder}
        </Text>
        <Ionicons
          name="chevron-down-outline"
          size={16}
          color={colors.placeholder}
        />
      </Pressable>
      {error && <Text className="text-sm text-error mt-2">{error}</Text>}
    </View>
  );
}
```

- [ ] **Step 2: Export it**

Add to `src/components/ui/index.ts`, keeping the file's alphabetical ordering:

```ts
export { SelectField } from "./SelectField";
```

- [ ] **Step 3: Adopt it in `TenantInput`**

Replace the `<View className="mb-3">…</View>` block in `src/components/TenantInput/TenantInput.tsx` with:

```tsx
<SelectField
  label={t("MobileApp.Auth.Staff.Tenant")}
  value={displayText}
  placeholder={t("MobileApp.TenantSelection.Placeholder")}
  iconName="business-outline"
  disabled={disabled}
  onPress={() => setModalVisible(true)}
  error={errorCode ? t(TENANT_ERROR_KEYS[errorCode]) : undefined}
/>
```

`displayText` already falls back to the placeholder itself, so pass it as `value` unchanged. Keep `<TenantSelectionModal />` rendered as a sibling, inside a wrapping fragment.

- [ ] **Step 4: Adopt it in `CountryInput`**

`CountryInput` has no localization hook today — its placeholder was a hardcoded English string. Add the import and the hook call:

```tsx
import { useLocalization } from "@/providers/LocalizationProvider";
// …inside the component, above the existing state:
const { t } = useLocalization();
```

Then replace its `<View className="mb-3">…</View>` trigger with:

```tsx
<SelectField
  label={title}
  value={selected?.name}
  placeholder={t("MobileApp.CountrySelection.Placeholder")}
  leftContent={
    <Image source={flagFor(selected?.alpha2 ?? "xx")} width={24} height={24} />
  }
  onPress={() => setModalVisible(true)}
/>
```

That retires the hardcoded `"Select a Country"`. Note `useLocalization` works here even though this renders inside a `BottomSheetModal` portal: `LocalizationProvider` sits *above* `BottomSheetModalProvider` in the root layout, unlike `RootNavigator`.

- [ ] **Step 5: Run the gates**

```bash
npm run typecheck
npx jest src/screens/shared/__tests__/StaffLoginScreen.router.test.tsx
npm run lint
```

Expected: clean; the login suite still passes.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui src/components/TenantInput src/components/CountryInput
git commit -F - <<'MSG'
refactor(super-app): give the two select fields one trigger

Both rendered a byte-identical pressable. Folding them together also
retires the hardcoded English 'Select a Country' placeholder.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 9: Full gate and on-device QA

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything above
- Produces: the evidence that the two reported bugs are actually fixed

An inset bug does not reproduce in jest. The device pass is the one that matters.

- [ ] **Step 1: Run the full gate**

```bash
npm run typecheck
npm test
npm run lint
```

Compare against Task 0's numbers. Any new red is a regression to fix, not to explain away. `tokens.test.ts` stays the only failing suite.

- [ ] **Step 2: Confirm the bundle actually shrank**

```bash
git diff --stat d719a04 HEAD -- '*.json' | tail -3
```

Expected: `src/components/PhoneInput/countries.json` deleted, `src/data/countries/phoneCodes.json` added, `countries.json` shown as a rename.

- [ ] **Step 3: Start Metro and load the app on the device**

```bash
adb devices                        # confirm a device is attached
npx expo start --offline           # note the port it prints — never assume 8081
adb reverse tcp:<PORT> tcp:<PORT>  # identical ports on both sides
adb shell am start -a android.intent.action.VIEW \
  -d "unirefundsuperapp://expo-development-client/?url=http://localhost:<PORT>"
```

- [ ] **Step 4: Walk the three pickers**

For each, screenshot with `adb exec-out screencap -p > <name>.png` and confirm by eye:

1. **Tenant picker** — staff login screen, tap the tenant field. The back arrow and the refresh control must both be fully below the status bar and must both respond. Search narrows the list. Picking a tenant closes the modal and updates the field.
2. **Phone country picker** — Profile → Edit profile, tap the flag. **The list must have countries in it** — this is the bug the device pass exists to prove. Dial codes show on the right, search narrows, picking one updates the flag and the `+code`.
3. **Bank country picker** — Cards → Add bank account, tap the country field. It opens over the sheet with a close X and **no** back arrow. Confirm it does not crash: a back arrow here would throw for want of a navigation context.

- [ ] **Step 5: Report**

State what you saw per picker, attach the screenshots, and name anything still wrong. Do not claim the bugs are fixed without the device evidence.
