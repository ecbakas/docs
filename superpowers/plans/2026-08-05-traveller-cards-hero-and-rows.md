# Traveller Cards Hero + Compact Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the traveller's Cards screen, give the default card and the default bank account a prominent hero, and render every other payout method as a compact row, so a growing list stays usable.

**Architecture:** A single pure function, `partitionTokens`, splits any payout-token list into `{ hero, others }`. `useCards` runs it twice — once for cards, once for banks — and exposes four new values. `CardsScreen` renders the existing `CardPreview` for the card hero, a new `BankPanel` for the bank hero, a new `CardRow` for other cards, and the existing `BankRow` for other banks. All branching lives in the pure function, so it carries the test weight.

**Tech Stack:** Expo / React Native, TypeScript (strict), NativeWind (Tailwind classes on RN components), Jest with two projects (`node` and `router`), `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-08-05-traveller-cards-hero-and-rows-design.md`

## Global Constraints

- **Never call generated SDK clients from UI code.** No task here adds an API call; `src/saas/**` must not be edited.
- **No hardcoded user-visible text.** Every string goes through `t("MobileApp.Cards.<Key>")`. **This change adds no new i18n keys** — every key used already exists in `src/localization/resources/en-US.json`, so `npm run init` is *not* required.
- **Avoid `useEffect`.** Derived values use `useMemo`. No task here needs an effect.
- **Reuse existing UI building blocks** from `src/components/**` (`Ionicons`, `Button`) and existing utils (`cn`, `SERIAL_FONT`, `maskIban`). Do not add a UI dependency.
- **Render tests MUST be named `*.router.test.tsx`.** `jest.config.js` runs two projects; under the `node` preset a rendered component reaches nativewind's web JSX runtime, which requires `react-native-web` — not a dependency of this app. Anything that calls `render` must carry the `.router.test.` suffix to land in the android-preset project.
- **Baseline test state**, measured 2026-08-05 in the worktree at `origin/main` (4ee89a1) before any edit:
  ```
  Test Suites: 7 failed, 26 passed, 33 total
  Tests:       346 passed, 346 total
  ```
  The 7 failures are pre-existing suites in the wrong Jest project (`src/components/__tests__/*`, `src/templates/__tests__/*`), documented as such in `jest.config.js`. **Success means still exactly 7 failed suites and 0 failed tests — never "all green".**

  (An earlier draft of this plan quoted 40 suites / 391 tests. That was measured on the concurrent `feat/traveller-documents` branch, which carries 7 suites and 45 tests this branch does not. The numbers above are the ones that apply.)
- **Shared-checkout hazard.** `C:/unirefund/super-app` is a single working tree currently on branch `feat/traveller-documents` with **five uncommitted modified files belonging to unrelated in-progress work** (`src/hooks/useTravellerDidit.tsx`, `src/providers/SessionProvider.tsx`, and three files under `src/screens/traveller/Documents/`). Another session may be editing this checkout concurrently. Therefore:
  - **NEVER run `git add -A`, `git add .`, `git stash`, `git reset --hard`, or `git checkout -- .`** anywhere in this plan.
  - Every commit stages **explicit file paths only**, exactly as written in each task.

---

### Task 0: Isolate the workspace

**Files:** none modified.

**Interfaces:**
- Consumes: nothing.
- Produces: a clean branch for Tasks 1–7 to commit onto.

- [ ] **Step 1: Confirm the hazard is still present**

Run:
```bash
cd c:/unirefund/super-app && git status --short && git branch --show-current
```
Expected: possibly-modified files listed, branch `feat/traveller-documents` (or whatever the other session has moved to).

- [ ] **Step 2: Create an isolated worktree**

Use the **superpowers:using-git-worktrees** skill to create a worktree off `origin/main` for this feature. Do this rather than branching in place — the shared checkout has another session's uncommitted work in it, and switching branches under that work would disrupt it.

If the skill is unavailable, create the worktree manually. This does not touch the existing working tree or its uncommitted files:
```bash
cd c:/unirefund/super-app
git fetch origin
git worktree add ../super-app-cards -b feat/traveller-cards-hero origin/main
```

- [ ] **Step 3: Install dependencies in the worktree**

Run:
```bash
npm install
```

- [ ] **Step 3b: Get the generated bundles in place — required before `tsc` works at all**

`src/data/language-data/*.gen.json` and `src/data/policies/policies.gen.json` are **gitignored build artifacts**, so a fresh worktree has none of them. Without them `tsc` and eslint both fail with unresolved-module errors on `src/localization/config.ts`, and — more insidiously — i18n key checking silently switches off, because `TranslationKey` is derived from `typeof enUS`. A missing bundle makes every key string pass.

```bash
npm run init
```

`init.ts` writes `policies.gen.json` locally but **fetches the language bundles from the backend**, so in an environment without API access it exits 0 having produced only the policies file. If `src/data/language-data/` is still missing afterwards, copy the artifacts from a checkout that has them:

```bash
mkdir -p src/data/language-data
cp <other-checkout>/src/data/language-data/*.gen.json src/data/language-data/
```

Then confirm `npx tsc --noEmit` exits 0 and `git status --short` is empty (the copies must stay ignored). Do not commit them.

- [ ] **Step 4: Record the baseline in the worktree**

Run:
```bash
npm test 2>&1 | tail -6
```
Expected: `Test Suites: 7 failed, 26 passed, 33 total` and `Tests: 346 passed, 346 total`.

If the numbers differ from the Global Constraints baseline, **stop and report** — the branch point is not what this plan was written against.

**Status: Task 0 is already done.** The worktree exists at
`C:/unirefund/super-app/.claude/worktrees/traveller-cards-hero`, on branch
`worktree-traveller-cards-hero`, created by the harness's native worktree tool
from `origin/main` (4ee89a1). Dependencies are installed and the baseline above
is confirmed. All remaining tasks run inside that directory.

---

### Task 1: `lastFour` masked-PAN helper

**Files:**
- Modify: `src/utils/card/card.ts` (append, after `groupMaskedNumber`)
- Test: `src/utils/card/__tests__/card.test.ts` (add import + one `describe`)

**Interfaces:**
- Consumes: nothing.
- Produces: `lastFour(masked: string): string` — exported from `@/utils/card/card`. Used by Task 4 (`CardRow`).

- [ ] **Step 1: Write the failing test**

In `src/utils/card/__tests__/card.test.ts`, add `lastFour` to the existing import block at the top (keep the list alphabetical — it goes between `isExpiredCard` and `luhnValid`):

```ts
import {
  formatCardNumber,
  formatExpiryFromParts,
  getCardBrand,
  groupMaskedNumber,
  isExpiredCard,
  lastFour,
  luhnValid,
  normalizeExpiry,
  onlyDigits,
  parseExpiry,
} from "@/utils/card/card";
```

Then append this `describe` block at the end of the file:

```ts
describe("lastFour", () => {
  it("takes the last four of a masked PAN", () => {
    expect(lastFour("411111******1111")).toBe("1111");
  });

  // The mask is what the API sends; a short or empty one means a malformed
  // token, and a row is a bad place to throw. Show whatever there is.
  it("returns the whole value when it is shorter than four", () => {
    expect(lastFour("12")).toBe("12");
  });

  it("is empty for an empty mask", () => {
    expect(lastFour("")).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/utils/card/__tests__/card.test.ts -t lastFour`
Expected: FAIL — `lastFour is not a function`. Babel strips types without checking imports, so a missing export arrives as `undefined` rather than a module-resolution error.

- [ ] **Step 3: Write the minimal implementation**

In `src/utils/card/card.ts`, directly below `groupMaskedNumber`, add:

```ts
/**
 * Last four characters of the API's masked PAN (`411111******1111`), for the
 * compact card rows.
 *
 * Deliberately not built on `onlyDigits`: the mask contains `*`, which
 * `onlyDigits` strips — the same reason `groupMaskedNumber` exists separately
 * from `formatCardNumber`.
 */
export function lastFour(masked: string): string {
  return masked.slice(-4);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/utils/card/__tests__/card.test.ts`
Expected: PASS, all `card.test.ts` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/card/card.ts src/utils/card/__tests__/card.test.ts
git commit -m "feat(cards): add lastFour masked-PAN helper"
```

---

### Task 2: `partitionTokens` hero-selection rule

**Files:**
- Create: `src/screens/traveller/Cards/partitionTokens.ts`
- Test: `src/screens/traveller/Cards/__tests__/partitionTokens.test.ts`

**Interfaces:**
- Consumes: `PayoutToken` — the existing type alias exported from `src/screens/traveller/Cards/useCards.ts`, equal to `UniRefund_RefundService_TravellerCards_TravellerCardDto`. Relevant fields: `id: string`, `type: 'Card' | 'Bank' | 'Wallet'`, `isDefault: boolean`, `isExpired: boolean`, `maskedNumber: string`, `expiryMonth: number`, `expiryYear: number`, `holderName?: string | null`, `bankName?: string | null`, `nickname?: string | null`.
- Produces:
  - `type TokenPartition = { hero: PayoutToken | null; others: PayoutToken[] }`
  - `partitionTokens(tokens: PayoutToken[]): TokenPartition`

  Both used by Task 5 (`useCards`).

**Note on the test file name:** this suite does **not** render, so it must NOT carry the `.router.test.` suffix — it belongs to the fast `node` project.

- [ ] **Step 1: Write the failing test**

Create `src/screens/traveller/Cards/__tests__/partitionTokens.test.ts`:

```ts
import { partitionTokens } from "../partitionTokens";
import type { PayoutToken } from "../useCards";

/** A valid, non-default card. Override only what a case is about. */
function card(id: string, overrides: Partial<PayoutToken> = {}): PayoutToken {
  return {
    id,
    travellerId: "tr-1",
    type: "Card",
    isDefault: false,
    maskedNumber: "411111******1111",
    expiryMonth: 9,
    expiryYear: 2030,
    isExpired: false,
    ...overrides,
  };
}

/** A bank token. `isExpired` is a card concept the API leaves false here. */
function bank(id: string, overrides: Partial<PayoutToken> = {}): PayoutToken {
  return card(id, { type: "Bank", bankName: "Garanti", ...overrides });
}

describe("partitionTokens", () => {
  it("has no hero for an empty list", () => {
    expect(partitionTokens([])).toEqual({ hero: null, others: [] });
  });

  it("makes a lone token the hero", () => {
    const only = card("a");
    expect(partitionTokens([only])).toEqual({ hero: only, others: [] });
  });

  it("gives the hero slot to the default, wherever it sits", () => {
    const first = card("a");
    const preferred = card("b", { isDefault: true });

    const { hero, others } = partitionTokens([first, preferred]);

    expect(hero).toBe(preferred);
    expect(others).toEqual([first]);
  });

  // An expired card is rejected at refund time, so a traveller whose default
  // has expired needs that at the top of the screen, not two rows down.
  it("keeps an expired default in the hero slot", () => {
    const dead = card("a", { isDefault: true, isExpired: true });
    const alive = card("b");

    expect(partitionTokens([dead, alive]).hero).toBe(dead);
  });

  // Three tokens, not two: with a single non-expired candidate this would pass
  // even if the implementation picked the *last* usable one.
  it("prefers the first usable token when nothing is default", () => {
    const expired = card("a", { isExpired: true });
    const usable = card("b");
    const alsoUsable = card("c");

    const { hero, others } = partitionTokens([expired, usable, alsoUsable]);

    expect(hero).toBe(usable);
    expect(others).toEqual([expired, alsoUsable]);
  });

  it("falls back to the first token when every one is expired", () => {
    const first = card("a", { isExpired: true });
    const second = card("b", { isExpired: true });

    expect(partitionTokens([first, second]).hero).toBe(first);
  });

  // Row order is the API's order minus the hero. Nothing is sorted.
  it("preserves input order in others", () => {
    const a = card("a");
    const b = card("b");
    const c = card("c", { isDefault: true });
    const d = card("d");

    expect(partitionTokens([a, b, c, d]).others).toEqual([a, b, d]);
  });

  // No `type` branching exists: with isExpired false throughout, rule 2 lands
  // on the first account, so the rule collapses to "default, else first".
  it("needs no special case for banks", () => {
    const plain = bank("a");
    const preferred = bank("b", { isDefault: true });

    expect(partitionTokens([plain, preferred]).hero).toBe(preferred);
    expect(partitionTokens([plain]).hero).toBe(plain);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/screens/traveller/Cards/__tests__/partitionTokens.test.ts`
Expected: FAIL — `Cannot find module '../partitionTokens'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/screens/traveller/Cards/partitionTokens.ts`:

```ts
import type { PayoutToken } from "./useCards";

export type TokenPartition = {
  hero: PayoutToken | null;
  others: PayoutToken[];
};

/**
 * Split a payout-token list into the one that earns the hero slot and the rest,
 * which render as compact rows.
 *
 * The hero is the default token, else the first usable one, else simply the
 * first — so a non-empty list always yields exactly one hero and the screen
 * never changes shape between states.
 *
 * An expired default deliberately keeps the slot. An expired card is rejected at
 * refund time, so a traveller whose default has expired needs to see that at the
 * top of the screen rather than two rows down; `CardPreview` already dims the
 * face and the `Expired` badge is already in the pill cluster.
 *
 * Bank tokens need no special case. `isExpired` is a card concept the API leaves
 * false for banks, so the second rule lands on the first account and the whole
 * thing collapses to "default, else first" on its own.
 */
export function partitionTokens(tokens: PayoutToken[]): TokenPartition {
  const hero =
    tokens.find((token) => token.isDefault) ??
    tokens.find((token) => !token.isExpired) ??
    tokens[0];

  if (!hero) return { hero: null, others: [] };

  return {
    hero,
    // By reference, not by id: two distinct token objects sharing an `id` would
    // otherwise both be dropped, silently breaking "input minus exactly one
    // hero". `JSON.parse` never yields two references to one object, so this
    // removes exactly the hero and nothing else.
    others: tokens.filter((token) => token !== hero),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/screens/traveller/Cards/__tests__/partitionTokens.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/screens/traveller/Cards/partitionTokens.ts src/screens/traveller/Cards/__tests__/partitionTokens.test.ts
git commit -m "feat(cards): add partitionTokens hero-selection rule"
```

---

### Task 3: Extract `CardPill`, add `HeroPills`

**Files:**
- Create: `src/screens/traveller/Cards/_components/CardPill.tsx`
- Create: `src/screens/traveller/Cards/_components/HeroPills.tsx`
- Modify: `src/screens/traveller/Cards/CardsScreen.tsx` (delete the local `CardPill`, lines 33-55; add an import; drop the now-unused `cn` import)
- Test: `src/screens/traveller/Cards/__tests__/HeroPills.router.test.tsx`

**Interfaces:**
- Consumes: `PayoutToken` from `../useCards`.
- Produces:
  - `CardPill({ label, onPress?, disabled?, className? })` from `./_components/CardPill`
  - `HeroPills({ token, disabled, onRename, onSetDefault, onDelete })` from `./_components/HeroPills`

  Both used by Task 7 (`CardsScreen`).

`CardPill` is a pure move. `HeroPills` is the cluster both heroes carry, extracted so the card hero and the bank hero share one implementation instead of two near-identical JSX blocks. One component serves both for the same reason `partitionTokens` needs no type branching: `isExpired` is a card concept the API leaves false for banks, so the expiry branches are inert there and the bank hero gets exactly nickname / default-or-set-default / delete.

- [ ] **Step 1: Create the component**

Create `src/screens/traveller/Cards/_components/CardPill.tsx` with the body moved verbatim from `CardsScreen.tsx`:

```tsx
import { cn } from "@/utils/cn";
import { Pressable, Text } from "react-native";

/** Small pill rendered into a hero's action cluster. */
export function CardPill({
  label,
  onPress,
  disabled,
  className,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      hitSlop={6}
      className={cn("rounded-full bg-white/20 px-2 py-1", className)}
    >
      <Text className="text-[10px] font-semibold text-white">{label}</Text>
    </Pressable>
  );
}
```

- [ ] **Step 2: Remove the local copy and import the new one**

In `src/screens/traveller/Cards/CardsScreen.tsx`:

1. Delete the whole local `CardPill` function — the comment `/** Small pill rendered into CardPreview's action cluster. */` through the closing `}` of the component (lines 33-55 as of this writing).
2. Add to the import block, in alphabetical order among the `./_components/*` imports (after `AddCardSheet`, before `CardPreview`):

```tsx
import { CardPill } from "./_components/CardPill";
```

3. **Remove the now-unused `cn` import** (`import { cn } from "@/utils/cn";`). `CardPill` was its only consumer in this file. Keep the `Pressable` import — the error-banner retry still uses it.

- [ ] **Step 3: Write the failing `HeroPills` test**

Create `src/screens/traveller/Cards/__tests__/HeroPills.router.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { HeroPills } from "../_components/HeroPills";
import type { PayoutToken } from "../useCards";

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

const token: PayoutToken = {
  id: "tok-1",
  travellerId: "tr-1",
  type: "Card",
  isDefault: false,
  maskedNumber: "411111******1111",
  expiryMonth: 3,
  expiryYear: 2028,
  nickname: "Holiday card",
  isExpired: false,
};

const handlers = {
  onRename: jest.fn(),
  onSetDefault: jest.fn(),
  onDelete: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

it("offers set-default on a usable non-default token", () => {
  render(<HeroPills token={token} disabled={false} {...handlers} />);

  expect(screen.getByText("Holiday card")).toBeTruthy();
  expect(screen.getByText("MobileApp.Cards.SetDefault")).toBeTruthy();
  expect(screen.queryByText("MobileApp.Cards.Default")).toBeNull();
  expect(screen.queryByText("MobileApp.Cards.Expired")).toBeNull();
});

// Offering set-default on the token that already is default would be a no-op
// the traveller can tap.
it("badges the default token instead of offering set-default", () => {
  render(
    <HeroPills
      token={{ ...token, isDefault: true }}
      disabled={false}
      {...handlers}
    />,
  );

  expect(screen.getByText("MobileApp.Cards.Default")).toBeTruthy();
  expect(screen.queryByText("MobileApp.Cards.SetDefault")).toBeNull();
});

// An expired default keeps the hero slot, so this cluster must render for it:
// badge the expiry, and offer no set-default, which could not succeed.
it("badges an expired token and offers no set-default", () => {
  render(
    <HeroPills
      token={{ ...token, isExpired: true }}
      disabled={false}
      {...handlers}
    />,
  );

  expect(screen.getByText("MobileApp.Cards.Expired")).toBeTruthy();
  expect(screen.queryByText("MobileApp.Cards.SetDefault")).toBeNull();
});

// `partitionTokens` keeps an expired default in the hero slot on purpose, so
// this combination reaches this component in production. Both badges show, and
// set-default stays absent because it could not succeed.
it("badges a token that is both default and expired, with no set-default", () => {
  render(
    <HeroPills
      token={{ ...token, isDefault: true, isExpired: true }}
      disabled={false}
      {...handlers}
    />,
  );

  expect(screen.getByText("MobileApp.Cards.Default")).toBeTruthy();
  expect(screen.getByText("MobileApp.Cards.Expired")).toBeTruthy();
  expect(screen.queryByText("MobileApp.Cards.SetDefault")).toBeNull();
});

it("reports rename, set-default and delete presses, and swallows them when disabled", () => {
  const { unmount } = render(
    <HeroPills token={token} disabled={false} {...handlers} />,
  );

  fireEvent.press(screen.getByText("Holiday card"));
  fireEvent.press(screen.getByText("MobileApp.Cards.SetDefault"));
  fireEvent.press(screen.getByText("MobileApp.Cards.Delete"));
  expect(handlers.onRename).toHaveBeenCalledTimes(1);
  expect(handlers.onSetDefault).toHaveBeenCalledTimes(1);
  expect(handlers.onDelete).toHaveBeenCalledTimes(1);

  unmount();
  jest.clearAllMocks();
  render(<HeroPills token={token} disabled {...handlers} />);

  fireEvent.press(screen.getByText("Holiday card"));
  fireEvent.press(screen.getByText("MobileApp.Cards.SetDefault"));
  fireEvent.press(screen.getByText("MobileApp.Cards.Delete"));
  expect(handlers.onRename).not.toHaveBeenCalled();
  expect(handlers.onSetDefault).not.toHaveBeenCalled();
  expect(handlers.onDelete).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx jest src/screens/traveller/Cards/__tests__/HeroPills.router.test.tsx`
Expected: FAIL — `Cannot find module '../_components/HeroPills'`.

- [ ] **Step 5: Create `HeroPills`**

Create `src/screens/traveller/Cards/_components/HeroPills.tsx`. The cluster is today's card cluster, moved verbatim out of `CardsScreen` and given a `token` prop:

```tsx
import { useLocalization } from "@/providers/LocalizationProvider";
import type { PayoutToken } from "../useCards";
import { CardPill } from "./CardPill";

/**
 * The action cluster both heroes carry: rename, the default state, an expiry
 * badge, and delete.
 *
 * One component serves the card hero and the bank hero for the same reason
 * `partitionTokens` needs no type branching — `isExpired` is a card concept the
 * API leaves false for banks, so the expiry branches are inert there and a bank
 * hero renders exactly nickname / default-or-set-default / delete.
 */
export function HeroPills({
  token,
  disabled,
  onRename,
  onSetDefault,
  onDelete,
}: {
  token: PayoutToken;
  /** Some mutation is in flight; no pill may start another. */
  disabled: boolean;
  onRename: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  const { t } = useLocalization();

  return (
    <>
      <CardPill
        label={token.nickname || t("MobileApp.Cards.NicknameLabel")}
        onPress={onRename}
        disabled={disabled}
      />

      {token.isDefault ? (
        <CardPill
          label={t("MobileApp.Cards.Default")}
          className="bg-amber-400/90"
        />
      ) : !token.isExpired ? (
        <CardPill
          label={t("MobileApp.Cards.SetDefault")}
          onPress={onSetDefault}
          disabled={disabled}
        />
      ) : null}

      {token.isExpired && (
        <CardPill label={t("MobileApp.Cards.Expired")} className="bg-red-500" />
      )}

      <CardPill
        label={t("MobileApp.Cards.Delete")}
        onPress={onDelete}
        disabled={disabled}
      />
    </>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest src/screens/traveller/Cards/__tests__/HeroPills.router.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 7: Verify nothing broke**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: both clean. No unused-import errors — in particular `cn` must be gone from `CardsScreen.tsx`.

Note: `HeroPills` is not yet used by anything; Task 7 wires it in. That is the same shape as Tasks 4 and 5, whose components also wait for Task 7.

- [ ] **Step 8: Commit**

```bash
git add src/screens/traveller/Cards/_components/CardPill.tsx src/screens/traveller/Cards/_components/HeroPills.tsx src/screens/traveller/Cards/__tests__/HeroPills.router.test.tsx src/screens/traveller/Cards/CardsScreen.tsx
git commit -m "refactor(cards): extract CardPill and add shared HeroPills cluster"
```

---

### Task 4: `CardRow` compact row

**Files:**
- Create: `src/screens/traveller/Cards/_components/CardRow.tsx`
- Test: `src/screens/traveller/Cards/__tests__/CardRow.router.test.tsx`

**Interfaces:**
- Consumes: `lastFour` from Task 1; `PayoutToken` from `../useCards`; existing `getCardBrand`, `formatExpiryFromParts` from `@/utils/card/card`; existing `CardBrandLogo` from `./CardBrandLogo`.
- Produces: `CardRow({ token, isPending, disabled, onRename, onSetDefault, onDelete })` from `./_components/CardRow`. Used by Task 6.

The prop contract is deliberately identical to `BankRow`'s, because the two render in adjacent sections of one screen.

- [ ] **Step 1: Write the failing test**

Create `src/screens/traveller/Cards/__tests__/CardRow.router.test.tsx`. It follows the house pattern in `src/screens/traveller/Documents/__tests__/DocumentCard.router.test.tsx`: `t` returns the key, so assertions name keys rather than English.

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { CardRow } from "../_components/CardRow";
import type { PayoutToken } from "../useCards";

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

const named: PayoutToken = {
  id: "card-1",
  travellerId: "tr-1",
  type: "Card",
  isDefault: false,
  maskedNumber: "411111******1111",
  expiryMonth: 3,
  expiryYear: 2028,
  nickname: "Work card",
  isExpired: false,
};

const unnamed: PayoutToken = { ...named, id: "card-2", nickname: null };

/** Every required callback, so a case can override just the one it asserts. */
const handlers = {
  onRename: jest.fn(),
  onSetDefault: jest.fn(),
  onDelete: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

it("shows the nickname, with the last four and expiry beneath it", () => {
  render(
    <CardRow token={named} isPending={false} disabled={false} {...handlers} />,
  );

  expect(screen.getByText("Work card")).toBeTruthy();
  expect(screen.getByText("•••• 1111 · 03/28")).toBeTruthy();
});

// Without a nickname the last four becomes the title, so repeating it in the
// subtitle would print the same digits twice in one row.
it("promotes the last four to the title and drops it from the subtitle", () => {
  render(
    <CardRow token={unnamed} isPending={false} disabled={false} {...handlers} />,
  );

  expect(screen.getByText("•••• 1111")).toBeTruthy();
  expect(screen.getByText("03/28")).toBeTruthy();
  expect(screen.queryByText("•••• 1111 · 03/28")).toBeNull();
});

it("reports a press on the title as a rename", () => {
  render(
    <CardRow token={named} isPending={false} disabled={false} {...handlers} />,
  );

  fireEvent.press(screen.getByText("Work card"));
  expect(handlers.onRename).toHaveBeenCalledTimes(1);
});

it("reports set-default and delete presses", () => {
  render(
    <CardRow token={named} isPending={false} disabled={false} {...handlers} />,
  );

  fireEvent.press(screen.getByLabelText("MobileApp.Cards.SetDefault"));
  fireEvent.press(screen.getByLabelText("MobileApp.Cards.Delete"));

  expect(handlers.onSetDefault).toHaveBeenCalledTimes(1);
  expect(handlers.onDelete).toHaveBeenCalledTimes(1);
});

// Setting an expired card as the default would be a tap that cannot succeed —
// the same rule the hero's pill cluster already follows.
it("badges an expired card and offers no set-default action", () => {
  render(
    <CardRow
      token={{ ...named, isExpired: true }}
      isPending={false}
      disabled={false}
      {...handlers}
    />,
  );

  expect(screen.getByText("MobileApp.Cards.Expired")).toBeTruthy();
  expect(screen.queryByLabelText("MobileApp.Cards.SetDefault")).toBeNull();
  expect(screen.getByLabelText("MobileApp.Cards.Delete")).toBeTruthy();
});

it("swallows every press while another mutation is in flight", () => {
  render(
    <CardRow token={named} isPending={false} disabled {...handlers} />,
  );

  fireEvent.press(screen.getByText("Work card"));
  fireEvent.press(screen.getByLabelText("MobileApp.Cards.SetDefault"));
  fireEvent.press(screen.getByLabelText("MobileApp.Cards.Delete"));

  expect(handlers.onRename).not.toHaveBeenCalled();
  expect(handlers.onSetDefault).not.toHaveBeenCalled();
  expect(handlers.onDelete).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/screens/traveller/Cards/__tests__/CardRow.router.test.tsx`
Expected: FAIL — `Cannot find module '../_components/CardRow'`.

- [ ] **Step 3: Write the implementation**

Create `src/screens/traveller/Cards/_components/CardRow.tsx`:

```tsx
import { Ionicons } from "@/components/Ionicons";
import { useLocalization } from "@/providers/LocalizationProvider";
import {
  formatExpiryFromParts,
  getCardBrand,
  lastFour,
} from "@/utils/card/card";
import { cn } from "@/utils/cn";
import { SERIAL_FONT } from "@/utils/serialFont";
import { Pressable, Text, View } from "react-native";
import type { PayoutToken } from "../useCards";
import { CardBrandLogo } from "./CardBrandLogo";

/**
 * One saved card that is not the hero, with rename / set-default / delete
 * affordances.
 *
 * Deliberately the card twin of `BankRow` — same prop contract, same layout,
 * same pending/disabled behaviour. The two render in adjacent sections of one
 * screen, so they have to read as one idiom.
 */
export function CardRow({
  token,
  isPending,
  disabled,
  onRename,
  onSetDefault,
  onDelete,
}: {
  token: PayoutToken;
  /** This row is the one being changed — dims it so the traveller can tell. */
  isPending: boolean;
  /** Some mutation is in flight; no row may start another. */
  disabled: boolean;
  onRename: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  const { t } = useLocalization();

  const brand = getCardBrand(token.maskedNumber);
  const masked = `•••• ${lastFour(token.maskedNumber)}`;
  const expiry = formatExpiryFromParts(token.expiryMonth, token.expiryYear);

  return (
    <View
      className={cn(
        "flex-row items-center gap-3 rounded-2xl border border-gray-300 bg-white p-4",
        (isPending || token.isExpired) && "opacity-50",
      )}
    >
      {/* `CardBrandLogo` renders nothing for an unknown brand, which would
          collapse the leading slot — so an unknown brand gets a card glyph. */}
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-gray-100">
        {brand === "unknown" ? (
          <Ionicons name="card-outline" size={22} color="#111827" />
        ) : (
          <CardBrandLogo brand={brand} size={34} />
        )}
      </View>

      <View className="flex-1 min-w-0">
        <Pressable
          onPress={onRename}
          disabled={disabled}
          className="flex-row items-center gap-2"
        >
          <Text
            className="shrink text-base font-semibold text-gray-900"
            numberOfLines={1}
          >
            {token.nickname || masked}
          </Text>
          {token.isExpired && (
            <View className="shrink-0 rounded-full bg-red-100 px-2 py-0.5">
              <Text className="text-[10px] font-semibold uppercase text-red-700">
                {t("MobileApp.Cards.Expired")}
              </Text>
            </View>
          )}
        </Pressable>
        {/* Without a nickname the last four is already the title above, so
            printing it again here would show the same digits twice. */}
        <Text
          className="text-xs text-gray-600"
          style={{ fontFamily: SERIAL_FONT }}
        >
          {token.nickname ? `${masked} · ${expiry}` : expiry}
        </Text>
      </View>

      {/* Precedence matches `HeroPills`: default wins, then usable, then
          nothing. Setting an expired card as default cannot succeed, so that
          affordance is absent rather than disabled.

          A row should never be the default — `partitionTokens` lifts the default
          into the hero slot first. The badge branch is kept anyway, for the same
          reason `BankRow` keeps its: `partitionTokens` uses `find`, so if the API
          ever returned two tokens both flagged default, the second lands here,
          and offering "set as default" on a token that already holds it would
          mislead. Both twins must degrade the same way under the same bad data. */}
      {token.isDefault ? (
        <View className="rounded-full bg-amber-100 px-2 py-1">
          <Text className="text-[10px] font-semibold uppercase text-amber-700">
            {t("MobileApp.Cards.Default")}
          </Text>
        </View>
      ) : !token.isExpired ? (
        <Pressable
          onPress={onSetDefault}
          disabled={disabled}
          hitSlop={8}
          accessibilityLabel={t("MobileApp.Cards.SetDefault")}
        >
          <Ionicons name="star-outline" size={20} color="#6B7280" />
        </Pressable>
      ) : null}

      <Pressable
        onPress={onDelete}
        disabled={disabled}
        hitSlop={8}
        accessibilityLabel={t("MobileApp.Cards.Delete")}
      >
        <Ionicons name="trash-outline" size={20} color="#db0000" />
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/screens/traveller/Cards/__tests__/CardRow.router.test.tsx`
Expected: PASS — 6 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/screens/traveller/Cards/_components/CardRow.tsx src/screens/traveller/Cards/__tests__/CardRow.router.test.tsx
git commit -m "feat(cards): add CardRow compact row"
```

---

### Task 5: `BankPanel` hero panel

**Files:**
- Create: `src/screens/traveller/Cards/_components/BankPanel.tsx`
- Test: `src/screens/traveller/Cards/__tests__/BankPanel.router.test.tsx`

**Interfaces:**
- Consumes: existing `maskIban` from `@/utils/card/iban`.
- Produces: `BankPanel({ bankName, maskedNumber, holderName?, labels: { accountHolderLabel }, children?, className? })` from `./_components/BankPanel`. Used by Task 6.

Purely presentational, mirroring `CardPreview`'s contract: it takes the raw masked value and formats it itself, takes its labels as a prop rather than calling `t`, and has no notion of defaults or deletion — callers compose the pill cluster through `children`.

- [ ] **Step 1: Write the failing test**

Create `src/screens/traveller/Cards/__tests__/BankPanel.router.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { BankPanel } from "../_components/BankPanel";

const labels = { accountHolderLabel: "Account holder" };

it("shows the bank name, the masked IBAN and the account holder", () => {
  render(
    <BankPanel
      bankName="Garanti BBVA"
      maskedNumber="TR330006100519786457841326"
      holderName="A. Yılmaz"
      labels={labels}
    />,
  );

  expect(screen.getByText("Garanti BBVA")).toBeTruthy();
  expect(screen.getByText("TR33 •••• 1326")).toBeTruthy();
  expect(screen.getByText("Account holder")).toBeTruthy();
  expect(screen.getByText("A. Yılmaz")).toBeTruthy();
});

// `holderName` is optional on the DTO, and a blank line under the caption reads
// as a rendering bug. `CardPreview` uses the same dash.
it("falls back to a dash when no account holder is stored", () => {
  render(
    <BankPanel
      bankName="Garanti BBVA"
      maskedNumber="TR330006100519786457841326"
      labels={labels}
    />,
  );

  expect(screen.getByText("-")).toBeTruthy();
});

it("renders the action cluster it is given", () => {
  render(
    <BankPanel
      bankName="Garanti BBVA"
      maskedNumber="TR330006100519786457841326"
      labels={labels}
    >
      <Text>Default</Text>
    </BankPanel>,
  );

  expect(screen.getByText("Default")).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/screens/traveller/Cards/__tests__/BankPanel.router.test.tsx`
Expected: FAIL — `Cannot find module '../_components/BankPanel'`.

- [ ] **Step 3: Write the implementation**

Create `src/screens/traveller/Cards/_components/BankPanel.tsx`:

```tsx
import { Ionicons } from "@/components/Ionicons";
import { maskIban } from "@/utils/card/iban";
import { cn } from "@/utils/cn";
import { SERIAL_FONT } from "@/utils/serialFont";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

/**
 * The default bank account's hero: bank mark and name, masked IBAN, account
 * holder.
 *
 * Purely presentational like `CardPreview` — no notion of defaults or deletion,
 * and callers compose the top-right action cluster through `children`.
 *
 * `aspect-[2.6]`, not the card face's `aspect-[1.586]`. A bank account's whole
 * content is three short strings, and a credit-card ratio to hold them reads as
 * empty; on a 375pt phone the matched version would be ~206pt against this
 * ~126pt. The symmetry with the card face comes from shared vocabulary instead —
 * same width, radius, dark hero fill and on-panel pills.
 */
export function BankPanel({
  bankName,
  maskedNumber,
  holderName,
  labels,
  children,
  className,
}: {
  bankName: string;
  /** The raw stored IBAN; masked here, as `CardPreview` groups its own PAN. */
  maskedNumber: string;
  holderName?: string;
  labels: { accountHolderLabel: string };
  children?: ReactNode;
  className?: string;
}) {
  return (
    <View
      className={cn(
        "w-full aspect-[2.6] overflow-hidden rounded-2xl bg-gray-800 p-4 justify-between",
        className,
      )}
    >
      {/* The same soft highlight the card face uses in place of a gradient. */}
      <View className="absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white/10" />

      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 min-w-0 flex-row items-center gap-2">
          <View className="h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
            <Ionicons name="business-outline" size={18} color="#FFFFFF" />
          </View>
          <Text
            className="shrink text-base font-semibold text-white"
            numberOfLines={1}
          >
            {bankName}
          </Text>
        </View>
        <View className="flex-row flex-wrap items-center justify-end gap-1">
          {children}
        </View>
      </View>

      <Text
        style={{ fontFamily: SERIAL_FONT }}
        className="text-base tracking-widest text-white/90"
        numberOfLines={1}
      >
        {maskIban(maskedNumber)}
      </Text>

      <View>
        <Text className="text-[8px] uppercase tracking-wide text-white/50">
          {labels.accountHolderLabel}
        </Text>
        <Text
          className="text-xs font-medium uppercase text-white"
          numberOfLines={1}
        >
          {holderName || "-"}
        </Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/screens/traveller/Cards/__tests__/BankPanel.router.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/screens/traveller/Cards/_components/BankPanel.tsx src/screens/traveller/Cards/__tests__/BankPanel.router.test.tsx
git commit -m "feat(cards): add BankPanel hero for the default bank account"
```

---

### Task 6: Expose the partitions from `useCards`

**Files:**
- Modify: `src/screens/traveller/Cards/useCards.ts`

**Interfaces:**
- Consumes: `partitionTokens` from Task 2.
- Produces: `useCards()` additionally returns `heroCard: PayoutToken | null`, `otherCards: PayoutToken[]`, `heroBank: PayoutToken | null`, `otherBanks: PayoutToken[]`. It keeps returning everything it returns today (`cards`, `banks`, `loading`, `error`, `pendingId`, `refresh`, `setDefault`, `remove`, `rename`) unchanged. Used by Task 7.

No test of its own: `partitionTokens` is fully covered by Task 2, and this is two `useMemo` calls over it. Task 7's screen test exercises the wiring.

- [ ] **Step 1: Add the import**

In `src/screens/traveller/Cards/useCards.ts`, add after the `logger` import:

```ts
import { partitionTokens } from "./partitionTokens";
```

- [ ] **Step 2: Add the two memos**

Directly below the existing `banks` memo (`const banks = useMemo(...)`), add:

```ts
  // Derived, never stored: the hero is a function of the list, and the list is
  // refetched after every mutation. A stored hero would drift the moment
  // set-default cleared the previous one.
  const cardPartition = useMemo(() => partitionTokens(cards), [cards]);
  const bankPartition = useMemo(() => partitionTokens(banks), [banks]);
```

- [ ] **Step 3: Extend the return object**

Change the returned object so it reads:

```ts
  return {
    cards,
    banks,
    heroCard: cardPartition.hero,
    otherCards: cardPartition.others,
    heroBank: bankPartition.hero,
    otherBanks: bankPartition.others,
    loading,
    error,
    pendingId,
    refresh,
    setDefault,
    remove,
    rename,
  };
```

`cards` and `banks` stay so the screen's loading guard and empty-state checks need no change.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npx jest src/screens/traveller/Cards`
Expected: clean; `partitionTokens.test.ts`, `CardRow.router.test.tsx`, `BankPanel.router.test.tsx` and `openCards.router.test.tsx` all pass.

- [ ] **Step 5: Commit**

```bash
git add src/screens/traveller/Cards/useCards.ts
git commit -m "feat(cards): expose hero/others partitions from useCards"
```

---

### Task 7: Wire the screen to hero + rows

**Files:**
- Modify: `src/screens/traveller/Cards/CardsScreen.tsx`

**Interfaces:**
- Consumes: `heroCard`, `otherCards`, `heroBank`, `otherBanks` from Task 6; `CardRow` from Task 4; `BankPanel` from Task 5; `HeroPills` from Task 3.
- Produces: the finished screen. Nothing depends on it.

Both heroes get their pill cluster from `HeroPills`, so `CardsScreen` no longer names `CardPill` directly.

- [ ] **Step 1: Fix the imports**

In `src/screens/traveller/Cards/CardsScreen.tsx`, add to the `./_components/*` import group, keeping it alphabetical:

```tsx
import { BankPanel } from "./_components/BankPanel";
import { CardRow } from "./_components/CardRow";
import { HeroPills } from "./_components/HeroPills";
```

Then **remove** the `import { CardPill } from "./_components/CardPill";` line added in Task 3 — after this task the screen composes clusters through `HeroPills` and never names `CardPill` itself. Lint will catch it if you forget.

- [ ] **Step 2: Destructure the new values**

Replace the `useCards()` destructure with:

```tsx
  const {
    cards,
    banks,
    heroCard,
    otherCards,
    heroBank,
    otherBanks,
    loading,
    error,
    pendingId,
    refresh,
    setDefault,
    remove,
    rename,
  } = useCards();
```

- [ ] **Step 3: Replace the cards list**

Replace the whole `cards.map(...)` branch — everything from `) : (` after the cards `EmptyState` through the matching `)` before the `Add card` `<Button>` — with a hero plus rows:

```tsx
              <>
                {heroCard && (
                  <CardPreview
                    number={heroCard.maskedNumber}
                    holderName={heroCard.holderName ?? undefined}
                    expiry={formatExpiryFromParts(
                      heroCard.expiryMonth,
                      heroCard.expiryYear,
                    )}
                    isExpired={heroCard.isExpired}
                    labels={{
                      holderNameLabel: t("MobileApp.Cards.HolderNameLabel"),
                      expiryLabel: t("MobileApp.Cards.ExpiryLabel"),
                    }}
                  >
                    <HeroPills
                      token={heroCard}
                      disabled={pendingId !== null}
                      onRename={() => openRename(heroCard)}
                      onSetDefault={() => setDefault(heroCard.id)}
                      onDelete={() => openDelete(heroCard)}
                    />
                  </CardPreview>
                )}

                {otherCards.map((card) => (
                  <CardRow
                    key={card.id}
                    token={card}
                    isPending={pendingId === card.id}
                    disabled={pendingId !== null}
                    onRename={() => openRename(card)}
                    onSetDefault={() => setDefault(card.id)}
                    onDelete={() => openDelete(card)}
                  />
                ))}
              </>
```

- [ ] **Step 4: Replace the banks list**

Replace the `banks.map(...)` branch the same way:

```tsx
              <>
                {heroBank && (
                  <BankPanel
                    // Bank name first, unlike `BankRow`: the pill cluster below
                    // already shows the nickname, so leading with it here would
                    // print the same string twice.
                    bankName={
                      heroBank.bankName ||
                      heroBank.nickname ||
                      t("MobileApp.Cards.BanksSection")
                    }
                    maskedNumber={heroBank.maskedNumber}
                    holderName={heroBank.holderName ?? undefined}
                    labels={{
                      accountHolderLabel: t(
                        "MobileApp.Cards.AccountHolderLabel",
                      ),
                    }}
                  >
                    <HeroPills
                      token={heroBank}
                      disabled={pendingId !== null}
                      onRename={() => openRename(heroBank)}
                      onSetDefault={() => setDefault(heroBank.id)}
                      onDelete={() => openDelete(heroBank)}
                    />
                  </BankPanel>
                )}

                {otherBanks.map((bank) => (
                  <BankRow
                    key={bank.id}
                    token={bank}
                    isPending={pendingId === bank.id}
                    disabled={pendingId !== null}
                    onRename={() => openRename(bank)}
                    onSetDefault={() => setDefault(bank.id)}
                    onDelete={() => openDelete(bank)}
                  />
                ))}
              </>
```

There is no expired branch here: `isExpired` is a card concept the API leaves false for banks.

- [ ] **Step 5: Verify the whole suite**

Run:
```bash
npm run typecheck && npm run lint && npm test 2>&1 | tail -6
```
Expected: typecheck and lint clean. Tests: **exactly 7 failed suites** (the pre-existing misplaced ones) and **0 failed tests**.

Counting from the baseline: Tasks 1, 2, 3, 4 and 5 add 3 + 8 + 5 + 6 + 3 = **25 tests**, in four new suite files (`partitionTokens.test.ts`, `HeroPills.router.test.tsx`, `CardRow.router.test.tsx`, `BankPanel.router.test.tsx` — Task 1 extended an existing file). So:
```
Test Suites: 7 failed, 30 passed, 37 total
Tests:       371 passed, 371 total
```

If any suite beyond those 7 fails, or any individual test fails, stop and fix before committing.

- [ ] **Step 6: Commit**

```bash
git add src/screens/traveller/Cards/CardsScreen.tsx
git commit -m "feat(cards): render a hero plus compact rows in both sections"
```

---

### Task 8: Screen-level render test

**Files:**
- Test: `src/screens/traveller/Cards/__tests__/CardsScreen.router.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-7.
- Produces: nothing.

**Read this before starting.** This test mocks the **data source** — `@/actions/RefundService/actions` — and not `useCards`. That is deliberate: the real `useCards` and the real `partitionTokens` then run inside the test, so it covers the list-to-hero/rows wiring that Task 6 introduced and nothing else covers. Mocking `useCards` instead would only prove the screen renders what it is handed.

Everything else mocked here is scaffolding `CardsScreen` drags in and this test has no opinion about: the two providers, `expo-router` (via `ModalTemplate`), and the four bottom sheets. **If the mock surface fights back beyond the two documented remedies in Step 2, stop and report — do not loosen the assertions into something that passes vacuously.**

`getTravellerCardsMine` resolves `PagedResultDto_TravellerCardDto` — `{ items?: TravellerCardDto[] | null; totalCount?: number }` — and `useAsyncFetch` calls it on mount, so every assertion begins with an awaited `findBy*` to let that settle.

- [ ] **Step 1: Write the test**

Create `src/screens/traveller/Cards/__tests__/CardsScreen.router.test.tsx`:

```tsx
import { getTravellerCardsMine } from "@/actions/RefundService/actions";
import { render, screen } from "@testing-library/react-native";
import React from "react";
import CardsScreen from "../CardsScreen";
import type { PayoutToken } from "../useCards";

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

jest.mock("@/providers/ToastProvider", () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

// Reached through `ModalTemplate`, which owns the back arrow and the hardware
// back handler. Neither is under test here.
jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useFocusEffect: () => undefined,
}));

// The data source, NOT the hook: the real `useCards` and `partitionTokens` run,
// so this exercises the wiring from API list to hero-plus-rows.
jest.mock("@/actions/RefundService/actions", () => ({
  getTravellerCardsMine: jest.fn(),
  deleteTravellerCard: jest.fn(),
}));

jest.mock("@/actions/RefundService/post", () => ({
  postTravellerCardSetDefault: jest.fn(),
  putTravellerCardNickname: jest.fn(),
}));

// Each sheet mounts `@gorhom/bottom-sheet`, which wants a host this test has no
// reason to provide — nothing here presents a sheet.
jest.mock("../_components/AddCardSheet", () => ({ AddCardSheet: () => null }));
jest.mock("../_components/AddBankSheet", () => ({ AddBankSheet: () => null }));
jest.mock("../_components/EditNicknameSheet", () => ({
  EditNicknameSheet: () => null,
}));
jest.mock("../_components/DeleteTokenSheet", () => ({
  DeleteTokenSheet: () => null,
}));

const fetchCards = getTravellerCardsMine as jest.MockedFunction<
  typeof getTravellerCardsMine
>;

function card(
  last4: string,
  overrides: Partial<PayoutToken> = {},
): PayoutToken {
  return {
    id: `card-${last4}`,
    travellerId: "tr-1",
    type: "Card",
    isDefault: false,
    maskedNumber: `41111100000${last4}`,
    expiryMonth: 9,
    expiryYear: 2030,
    isExpired: false,
    ...overrides,
  };
}

function bank(
  last4: string,
  overrides: Partial<PayoutToken> = {},
): PayoutToken {
  return card(last4, {
    type: "Bank",
    bankName: "Garanti",
    maskedNumber: `TR3300061005197864578${last4}`,
    ...overrides,
  });
}

function resolveWith(items: PayoutToken[]) {
  fetchCards.mockResolvedValue({ items, totalCount: items.length });
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("gives the default card the hero face and the rest compact rows", async () => {
  resolveWith([card("1111"), card("2222", { isDefault: true }), card("3333")]);

  render(<CardsScreen />);

  // Only the hero renders the card-face captions. The rows show `•••• last4`,
  // and the hero's own number is grouped, so `•••• 2222` must not appear.
  expect(
    await screen.findByText("MobileApp.Cards.HolderNameLabel"),
  ).toBeTruthy();
  expect(screen.getByText("•••• 1111")).toBeTruthy();
  expect(screen.getByText("•••• 3333")).toBeTruthy();
  expect(screen.queryByText("•••• 2222")).toBeNull();

  // Two rows, so two row-level delete affordances. The hero's delete is a text
  // pill with no accessibility label, so it is not counted here.
  expect(screen.getAllByLabelText("MobileApp.Cards.Delete")).toHaveLength(2);
});

// The default is listed SECOND on purpose, so this also exercises "the default
// is not the first item" for banks.
it("gives the default bank the hero panel and the rest compact rows", async () => {
  resolveWith([
    bank("9082", { holderName: "ROW HOLDER" }),
    bank("4471", { isDefault: true, holderName: "HERO HOLDER" }),
  ]);

  render(<CardsScreen />);

  expect(
    await screen.findByText("MobileApp.Cards.AccountHolderLabel"),
  ).toBeTruthy();
  // `maskIban` keeps the country prefix and the last four.
  expect(screen.getByText("TR33 •••• 4471")).toBeTruthy();
  expect(screen.getByText("TR33 •••• 9082")).toBeTruthy();

  // `BankPanel` renders the account holder; `BankRow` does not render it at all.
  // So this is what pins *which* bank took the hero slot — the masked IBAN
  // cannot, because the panel and the row both render it through `maskIban`.
  expect(screen.getByText("HERO HOLDER")).toBeTruthy();
  expect(screen.queryByText("ROW HOLDER")).toBeNull();

  expect(screen.getAllByLabelText("MobileApp.Cards.Delete")).toHaveLength(1);
});

it("shows both empty states when nothing is saved", async () => {
  resolveWith([]);

  render(<CardsScreen />);

  expect(await screen.findByText("MobileApp.Cards.NoCards")).toBeTruthy();
  expect(screen.getByText("MobileApp.Cards.NoBanks")).toBeTruthy();
});
```

- [ ] **Step 2: Run it**

Run: `npx jest src/screens/traveller/Cards/__tests__/CardsScreen.router.test.tsx`
Expected: PASS — 3 tests.

Two remedies if it does not, and only these two:

1. **A module the mock list does not cover.** Add a mock for exactly that module and note it in the report.
2. **`react-native-safe-area-context` wants a provider.** Wrap the render:

```tsx
import { SafeAreaProvider } from "react-native-safe-area-context";

render(<CardsScreen />, {
  wrapper: ({ children }) => (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 375, height: 812 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      {children}
    </SafeAreaProvider>
  ),
});
```

If it still fights after both, **stop and report** with the failure output. Do not mock `useCards` to make it pass — that discards the reason this test exists.

- [ ] **Step 3: Verify the whole suite**

Run:
```bash
npm run typecheck && npm run lint && npm test 2>&1 | tail -6
```
Expected: typecheck and lint clean, and this task's 3 tests bring the totals to:
```
Test Suites: 7 failed, 31 passed, 38 total
Tests:       374 passed, 374 total
```

### Task 9: See it running

**Files:** none.

**Interfaces:**
- Consumes: the finished feature.
- Produces: confirmation that it works on a device, which no test in this plan provides.

Every test above runs against a renderer, not a phone. Aspect ratios, the highlight circle's position, text truncation at real widths, and the set-default re-layout are all things only a running app shows.

- [ ] **Step 1: Launch the app**

Run: `npm run android` (this runs `npm run init` first, which is harmless — no i18n keys changed).

- [ ] **Step 2: Walk the screen**

Sign in as a traveller and open Profile → Cards. Confirm:

- The default card shows the full face; other cards are single rows.
- The bank slab is visibly shorter than the card face, and its bank name, IBAN and account holder all read correctly.
- Tapping a row's star promotes that card into the hero and drops the previous default into the rows.
- Tapping a row's name opens the rename sheet; the trash opens the delete sheet.
- With one card and no banks, the cards hero renders and the banks empty state shows.
- An expired card, if you have one, appears dimmed with the `Expired` badge and **no** star.

- [ ] **Step 3: Report what you saw**

State plainly which of the above you confirmed and which you could not (for example, no expired card on the test account). Do not claim a check you did not perform.

---

## Definition of done

- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm test` → exactly 7 failed suites (the pre-existing misplaced ones), 0 failed tests, 374 tests passing across 38 suites
- [ ] Eight commits (Tasks 1-8; Tasks 0 and 9 produce none), each staging only its own explicit paths
- [ ] Task 9 walked on a device, with any unconfirmed item named
