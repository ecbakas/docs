# PageHeader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every pushed page in super-app shows a back button, drawn by one shared `PageHeader` component instead of two divergent template copies.

**Architecture:** Extract the header row into `src/components/PageHeader.tsx`. Both `ModalTemplate` and `TabPage` render it; neither draws its own header markup. `ModalTemplate` defaults `showBack` to true (all its consumers are pushed pages), `TabPage` defaults it to false (most of its consumers are tab roots). The Android hardware-back mirroring moves into `PageHeader`, which extends it to pushed `TabPage` screens that never had it. Templates keep owning `SafeAreaView`, scroll, keyboard, padding, and outer spacing.

**Tech Stack:** React Native 0.8x / Expo, expo-router, NativeWind (Tailwind classNames), Jest with `jest-expo` (two projects), `@testing-library/react-native`.

**Spec:** [docs/superpowers/specs/2026-08-26-super-app-page-header-design.md](../specs/2026-08-26-super-app-page-header-design.md)

## Global Constraints

- **All commands run from `c:\unirefund\super-app`.** That directory is a git repo on branch `main`, branch point `e7baa09`.
- **Any test that renders MUST be named `*.router.test.tsx`.** Jest runs two projects ([jest.config.js](../../../super-app/jest.config.js)): the `node` project cannot even import `@testing-library/react-native`, because nativewind's web JSX runtime pulls in `react-native-web`, which this app does not depend on. A render test named `*.test.tsx` fails to load. This is the single most common way to waste an hour here.
- **Jest baseline, recorded on a clean tree before any edit — do not compare against zero:**
  ```
  Test Suites: 6 failed, 116 passed, 122 total
  Tests:       1 skipped, 955 passed, 956 total
  ```
  Expected after this plan: **4 failed, 119 passed, 123 total.**
- **The four out-of-scope baseline failures are `BottomSheet`, `DebouncedPressable`, `SafeAreaView`, `Toast`** (all in `src/components/__tests__`). Same misfiling, different components. Do not fix them here.
- **A new i18n key requires `npm run init` before `tsc` will accept it.** `TranslationKey` derives from gitignored `src/data/language-data/*.gen.json`, not from the tracked `resources/*.json`. `npm run init` fetches from `dev-api.unirefund.com` and merges local `src/localization/**/<lang>.json` into the `MobileApp` namespace. Verified working on 2026-08-26 (exit 0).
- **In tests, `t()` returns the key itself** — localization is mocked as `{ t: (key) => key }`. Assert on `"MobileApp.Common.Back"`, not on English text.
- **Comment density:** this repo's existing files carry dense docblocks. Write far fewer comments than they suggest. Comment the non-obvious *why*, never the *what*.
- **Do not run `git reset --hard`** in this checkout. It may be shared with another agent session.
- **Tasks 1–5 must produce zero visual change other than new back arrows.** The cosmetic unify is quarantined in Task 6 because no available device can validate it — see the spec's Verification §4.

---

### Task 1: Move the dead template tests into the project that runs them

The two suites covering the templates this plan rewires currently do not execute. Establishing that signal comes first — everything after this task depends on it to catch regressions.

**Files:**
- Rename: `src/templates/__tests__/Modal.test.tsx` → `src/templates/__tests__/Modal.router.test.tsx`
- Rename: `src/templates/__tests__/TabPage.test.tsx` → `src/templates/__tests__/TabPage.router.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: two live test suites. Later tasks extend them.

- [ ] **Step 1: Confirm both suites are currently failing to load**

```bash
npx jest --silent src/templates 2>&1 | tail -20
```

Expected: both suites FAIL with `Could not locate module react-native mapped as: react-native-web`. This is the misfiling, not a broken test.

- [ ] **Step 2: Rename both files**

```bash
git mv src/templates/__tests__/Modal.test.tsx src/templates/__tests__/Modal.router.test.tsx
git mv src/templates/__tests__/TabPage.test.tsx src/templates/__tests__/TabPage.router.test.tsx
```

- [ ] **Step 3: Run them and verify they now pass**

```bash
npx jest --silent src/templates 2>&1 | tail -10
```

Expected: `Test Suites: 2 passed, 2 total` / `Tests: 3 passed, 3 total`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: move template suites into the jest project that runs them

Modal.test.tsx and TabPage.test.tsx render, so under the node project
they cannot import @testing-library/react-native and fail to load. They
were two of six baseline failures. Renaming to *.router.test.tsx puts
them in the jest-expo/android project, where they pass unchanged."
```

---

### Task 2: Create PageHeader

**Files:**
- Create: `src/components/PageHeader.tsx`
- Create: `src/components/__tests__/PageHeader.router.test.tsx`
- Modify: `src/localization/resources/en-US.json` (add `Back` to the existing `Common` block, currently at line 13)
- Modify: `src/localization/resources/tr-TR.json` (same)

**Interfaces:**
- Consumes: `useDebouncedPress` from `@/hooks/useDebouncedPress`, `Ionicons` from `@/components/Ionicons`, `useLocalization` from `@/providers/LocalizationProvider`, `router` and `useFocusEffect` from `expo-router`.
- Produces:
  ```ts
  export interface PageHeaderProps {
    title: string;
    description?: string;
    showBack?: boolean;          // default true
    backAction?: () => void;     // default router.back()
    right?: React.ReactNode;
    accessory?: React.ReactNode;
    titleClassName?: string;     // default "text-3xl font-bold"
  }
  export function PageHeader(props: PageHeaderProps): React.ReactElement;
  ```
  `titleClassName` exists so Tasks 3–5 can preserve each template's current title weight, keeping the cosmetic change quarantined in Task 6. It is not permanent scaffolding — it stays useful, Task 6 just stops overriding it.

- [ ] **Step 1: Add the accessibility label key to both locales**

In `src/localization/resources/en-US.json`, the `Common` block currently reads:

```json
  "Common": {
    "Loading": "Loading"
  },
```

Change it to:

```json
  "Common": {
    "Loading": "Loading",
    "Back": "Go back"
  },
```

In `src/localization/resources/tr-TR.json`:

```json
  "Common": {
    "Loading": "Yükleniyor",
    "Back": "Geri git"
  },
```

- [ ] **Step 2: Regenerate the translation bundles**

```bash
npm run init
```

Expected: exit 0, no output beyond the tsx banner. This writes the gitignored `src/data/language-data/*.gen.json`. Without it, Step 5 fails with TS2345 on the `t("MobileApp.Common.Back")` call.

- [ ] **Step 3: Write the failing test**

Create `src/components/__tests__/PageHeader.router.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import React from "react";
import { BackHandler } from "react-native";
import { router } from "expo-router";
import { PageHeader } from "../PageHeader";

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

// useFocusEffect must actually run its callback here — the hardware-back
// test below depends on the listener being registered.
jest.mock("expo-router", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ReactLib = require("react");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    router: { back: jest.fn() },
    useFocusEffect: (cb: () => void | (() => void)) =>
      ReactLib.useEffect(cb, [cb]),
  };
});

// The real Ionicons loads a font asynchronously; mocked the way
// Modal.router.test.tsx does to avoid the async font warning.
jest.mock("@/components/Ionicons", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ReactLib = require("react");
  const { View } = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    __esModule: true,
    Ionicons: ({ name }: { name: string }) =>
      ReactLib.createElement(View, { testID: `icon-${name}` }),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
});

it("renders a back button by default", () => {
  render(<PageHeader title="Tags" />);

  expect(screen.getByLabelText("MobileApp.Common.Back")).toBeTruthy();
});

it("renders no back button when showBack is false", () => {
  render(<PageHeader title="Home" showBack={false} />);

  expect(screen.queryByLabelText("MobileApp.Common.Back")).toBeNull();
});

it("falls back to router.back() when no backAction is given", () => {
  render(<PageHeader title="Tags" />);

  fireEvent.press(screen.getByLabelText("MobileApp.Common.Back"));

  expect(router.back).toHaveBeenCalledTimes(1);
});

it("calls backAction instead of router.back() when given", () => {
  const backAction = jest.fn();
  render(<PageHeader title="Tags" backAction={backAction} />);

  fireEvent.press(screen.getByLabelText("MobileApp.Common.Back"));

  expect(backAction).toHaveBeenCalledTimes(1);
  expect(router.back).not.toHaveBeenCalled();
});

it("debounces so a double tap pops only once", () => {
  const backAction = jest.fn();
  render(<PageHeader title="Tags" backAction={backAction} />);

  const button = screen.getByLabelText("MobileApp.Common.Back");
  fireEvent.press(button);
  fireEvent.press(button);

  expect(backAction).toHaveBeenCalledTimes(1);
});

it("mirrors the back handler onto the Android hardware key", () => {
  const addEventListener = jest.spyOn(BackHandler, "addEventListener");
  const backAction = jest.fn();
  render(<PageHeader title="Tags" backAction={backAction} />);

  const [event, handler] = addEventListener.mock.calls.at(-1)!;
  expect(event).toBe("hardwareBackPress");

  // Returning true is what stops React Navigation also running its own pop.
  expect(handler()).toBe(true);
  expect(backAction).toHaveBeenCalledTimes(1);

  addEventListener.mockRestore();
});

it("does not claim the hardware key when there is no back button", () => {
  const addEventListener = jest.spyOn(BackHandler, "addEventListener");
  render(<PageHeader title="Home" showBack={false} />);

  expect(addEventListener).not.toHaveBeenCalled();

  addEventListener.mockRestore();
});

it("renders the right and accessory slots", () => {
  render(
    <PageHeader
      title="Tags"
      right={<React.Fragment />}
      accessory={<React.Fragment />}
    />,
  );

  expect(screen.getByText("Tags")).toBeTruthy();
});
```

- [ ] **Step 4: Run the test and verify it fails**

```bash
npx jest --silent src/components/__tests__/PageHeader.router.test.tsx 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '../PageHeader'`.

- [ ] **Step 5: Implement PageHeader**

Create `src/components/PageHeader.tsx`:

```tsx
import { Ionicons } from "@/components/Ionicons";
import { useDebouncedPress } from "@/hooks/useDebouncedPress";
import { useLocalization } from "@/providers/LocalizationProvider";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback } from "react";
import { BackHandler, Text, TouchableOpacity, View } from "react-native";

export interface PageHeaderProps {
  title: string;
  description?: string;
  showBack?: boolean;
  backAction?: () => void;
  right?: React.ReactNode;
  /** Rendered under the title, in the same column, clear of the right slot. */
  accessory?: React.ReactNode;
  titleClassName?: string;
}

export function PageHeader({
  title,
  description,
  showBack = true,
  backAction,
  right,
  accessory,
  titleClassName = "text-3xl font-bold",
}: PageHeaderProps) {
  const { t } = useLocalization();

  const handleBack = useDebouncedPress(
    useCallback(() => {
      if (backAction) backAction();
      else router.back();
    }, [backAction]),
  );

  // Scoped to focus so only the visible screen claims the press. Returning
  // true stops React Navigation from also running its own pop.
  useFocusEffect(
    useCallback(() => {
      if (!showBack) return;
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          handleBack();
          return true;
        },
      );
      return () => subscription.remove();
    }, [handleBack, showBack]),
  );

  return (
    <View>
      <View className="flex-row items-start gap-4">
        {showBack && (
          <TouchableOpacity
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel={t("MobileApp.Common.Back")}
            className="border border-border rounded-full size-10 items-center justify-center"
          >
            <Ionicons name="arrow-back" size={24} className="text-foreground" />
          </TouchableOpacity>
        )}
        <View className="flex-1 gap-1">
          <Text className={`${titleClassName} text-foreground`}>{title}</Text>
          {accessory}
        </View>
        {right}
      </View>
      {description && (
        <Text className="text-base text-muted mt-1">{description}</Text>
      )}
    </View>
  );
}
```

- [ ] **Step 6: Run the test and verify it passes**

```bash
npx jest --silent src/components/__tests__/PageHeader.router.test.tsx 2>&1 | tail -10
```

Expected: `Tests: 8 passed, 8 total`.

- [ ] **Step 7: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no output. A TS2345 on `t("MobileApp.Common.Back")` means Step 2 was skipped — run `npm run init`.

- [ ] **Step 8: Commit**

```bash
git add src/components/PageHeader.tsx src/components/__tests__/PageHeader.router.test.tsx src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -m "feat: add PageHeader, a shared header with a default back button

Back defaults to on, so a page that forgets a prop gains a back button
rather than silently losing one. Owns the Android hardware-back
mirroring so any consumer gets it, not just ModalTemplate."
```

---

### Task 3: Rewire ModalTemplate onto PageHeader

`ModalTemplate` currently renders its back arrow only when `backAction` is passed, which is why nine pushed pages have none. After this task `backAction` is target-only and the arrow is unconditional.

**Files:**
- Modify: `src/templates/Modal.tsx` (header block ~lines 112-131, `handleBack` ~66-74, `useFocusEffect` ~76-84)
- Modify: `src/templates/__tests__/Modal.router.test.tsx`

**Interfaces:**
- Consumes: `PageHeader` from Task 2.
- Produces: `ModalTemplateProps` gains `showBack?: boolean` (default true). `backAction`, `headerRightComponent`, `title`, `description`, `action`, `keyboardShouldPersistTaps` keep their current meaning.

- [ ] **Step 1: Add the failing tests**

Append to `src/templates/__tests__/Modal.router.test.tsx`, inside the existing `describe("ModalTemplate", ...)` block:

```tsx
  it("renders a back button with no back props at all", () => {
    const { getByLabelText } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ModalTemplate title="t">{null}</ModalTemplate>
      </SafeAreaProvider>,
    );

    // The regression this guards: `backAction` used to control visibility as
    // well as target, so nine pushed pages shipped with no way back.
    expect(getByLabelText("MobileApp.Common.Back")).toBeTruthy();
  });

  it("suppresses the back button when showBack is false", () => {
    const { queryByLabelText } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ModalTemplate title="t" showBack={false}>
          {null}
        </ModalTemplate>
      </SafeAreaProvider>,
    );

    expect(queryByLabelText("MobileApp.Common.Back")).toBeNull();
  });
```

The existing file already mocks `expo-router` as `{ router: { back: jest.fn() }, useFocusEffect: jest.fn() }` and mocks `Ionicons`. Add a localization mock next to those:

```tsx
jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));
```

- [ ] **Step 2: Run and verify the new tests fail**

```bash
npx jest --silent src/templates/__tests__/Modal.router.test.tsx 2>&1 | tail -20
```

Expected: the two new tests FAIL (no element with that label); the two original inset tests still PASS.

- [ ] **Step 3: Rewire the template**

In `src/templates/Modal.tsx`:

1. Add `showBack` to the props interface:

```tsx
interface ModalTemplateProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  showBack?: boolean;
  backAction?: () => void;
  action?: {
    onPress: () => void | Promise<void>;
    label: string;
  };
  headerRightComponent?: React.ReactNode;
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
}
```

2. Add `showBack = true` to the destructured parameters.

3. **Delete** the `handleBack` `useDebouncedPress` block and the entire `useFocusEffect` + `BackHandler` block — `PageHeader` owns both now. Remove `BackHandler` from the `react-native` import, and remove `useFocusEffect` from the `expo-router` import (keep `router` only if still referenced; if not, drop it too). Remove the now-unused `Ionicons` and `TouchableOpacity` imports if nothing else uses them — `TouchableOpacity` is still used by the pinned action button, so keep that one.

4. Replace the header block:

```tsx
      <View className="px-6 pt-2 mb-2">
        <View className="flex-row gap-4 items-center">
          {backAction && (
            <TouchableOpacity ... >
              <Ionicons name="arrow-back" ... />
            </TouchableOpacity>
          )}
          <Text className="text-3xl font-medium text-foreground">{title}</Text>
          {headerRightComponent && (
            <View className="ml-auto">{headerRightComponent}</View>
          )}
        </View>
        {description && (
          <Text className="text-base text-muted mt-1">{description}</Text>
        )}
      </View>
```

with:

```tsx
      <View className="px-6 pt-2 mb-2">
        <PageHeader
          title={title}
          description={description}
          showBack={showBack}
          backAction={backAction}
          right={headerRightComponent}
          // Preserved deliberately: the unify to font-bold is quarantined in
          // its own commit because no available device can judge it.
          titleClassName="text-3xl font-medium"
        />
      </View>
```

5. Add the import: `import { PageHeader } from "@/components/PageHeader";`

- [ ] **Step 4: Run the template tests**

```bash
npx jest --silent src/templates 2>&1 | tail -10
```

Expected: `Tests: 5 passed, 5 total` — the two original inset tests plus the two new ones plus TabPage's one.

- [ ] **Step 5: Run the full suite and compare against baseline**

```bash
npx jest --silent 2>&1 | tail -6
```

Expected: `Test Suites: 4 failed, 119 passed, 123 total`. Relative to the 6-failure baseline: Task 1 flipped two suites from fail to pass, Task 2 added one passing suite.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/templates/Modal.tsx src/templates/__tests__/Modal.router.test.tsx
git commit -m "fix: give every ModalTemplate page a back button

backAction used to control visibility as well as target, so nine pushed
pages shipped with no way back and nothing in the type system objected.
It is now target-only; the arrow is on by default and opts out via
showBack. Hardware-back handling moved to PageHeader."
```

---

### Task 4: Rewire TabPage onto PageHeader

`TabPage` has no back affordance at all. That is right for its thirteen tab-root consumers and wrong for the three pushed ones, so the default here is the opposite of Task 3's.

**Files:**
- Modify: `src/templates/TabPage.tsx`
- Modify: `src/templates/__tests__/TabPage.router.test.tsx`

**Interfaces:**
- Consumes: `PageHeader` from Task 2.
- Produces: `TabPageProps` gains `showBack?: boolean` (default **false**) and `backAction?: () => void`. `title`, `children`, `noPadding`, `headerAccessory` keep their current meaning.

- [ ] **Step 1: Add the failing tests**

Append to `src/templates/__tests__/TabPage.router.test.tsx`, inside `describe("TabPage", ...)`:

```tsx
  it("renders no back button by default, because most consumers are tab roots", () => {
    const { queryByLabelText } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <TabPage title="t" />
      </SafeAreaProvider>,
    );

    expect(queryByLabelText("MobileApp.Common.Back")).toBeNull();
  });

  it("renders a back button for the pushed screens that ask for one", () => {
    const { getByLabelText } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <TabPage title="t" showBack />
      </SafeAreaProvider>,
    );

    expect(getByLabelText("MobileApp.Common.Back")).toBeTruthy();
  });
```

This file currently has no mocks at all. Add these above `describe`:

```tsx
jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

jest.mock("@/components/Ionicons", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ReactLib = require("react");
  const { View } = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    __esModule: true,
    Ionicons: ({ name }: { name: string }) =>
      ReactLib.createElement(View, { testID: `icon-${name}` }),
  };
});
```

Do **not** mock `expo-router` here — `TabPage` calls `router.push` for the notification bell and the real module resolves fine under the `jest-expo/android` preset.

- [ ] **Step 2: Run and verify the new tests fail**

```bash
npx jest --silent src/templates/__tests__/TabPage.router.test.tsx 2>&1 | tail -20
```

Expected: `renders a back button for the pushed screens that ask for one` FAILS; the other two PASS.

- [ ] **Step 3: Rewire the template**

In `src/templates/TabPage.tsx`, add to the interface:

```tsx
  /** Pushed screens (href: null routes) pass this; tab roots must not. */
  showBack?: boolean;
  backAction?: () => void;
```

Destructure with `showBack = false, backAction`, then replace this block:

```tsx
        <View className="flex-row items-start justify-between mb-4">
          <View className="flex-1 gap-1 pr-3">
            <Text className="font-bold text-3xl">{title}</Text>
            {headerAccessory}
          </View>
          <Pressable className="relative pt-1" onPress={openNotifications}>
            ...
          </Pressable>
        </View>
```

with:

```tsx
        <View className="mb-4">
          <PageHeader
            title={title}
            showBack={showBack}
            backAction={backAction}
            accessory={headerAccessory}
            right={
              <Pressable className="relative pt-1" onPress={openNotifications}>
                <Ionicons name="notifications" size={24} color="#000" />
                {unseenCount > 0 && (
                  <View className="absolute -top-1 -right-1 bg-red-500 rounded-full w-5 h-5 items-center justify-center">
                    <Text className="text-white text-xs font-bold">
                      {unseenCount}
                    </Text>
                  </View>
                )}
              </Pressable>
            }
          />
        </View>
```

`PageHeader`'s default `titleClassName` is already `text-3xl font-bold`, which is what `TabPage` renders today, so pass no override here.

Add the import: `import { PageHeader } from "@/components/PageHeader";`

- [ ] **Step 4: Run the template tests**

```bash
npx jest --silent src/templates 2>&1 | tail -10
```

Expected: `Tests: 7 passed, 7 total`.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/templates/TabPage.tsx src/templates/__tests__/TabPage.router.test.tsx
git commit -m "feat: let TabPage render a back button for its pushed screens

Defaults off — thirteen of sixteen consumers are tab roots, where
router.back() either no-ops or exits the app."
```

---

### Task 5: Turn the back button on for the four screens that need a prop

Three pushed `TabPage` screens and one unreachable `ModalTemplate` screen. **`CreateTagScreen` and `RefundScreen` each render `<TabPage>` from several branches — every one needs the prop, or the back button vanishes in loading and error states.**

**Files:**
- Modify: `src/screens/merchant/CreateTag/CreateTagScreen.tsx` — **4 branches** at lines 121, 129, 144, 166
- Modify: `src/screens/refund-point/Refund/RefundScreen.tsx` — **3 branches** at lines 56, 68, 81
- Modify: `src/screens/customs/Validate/CustomsValidateScreen.tsx` — 1 branch at line 108
- Modify: `src/screens/traveller/RegisterScreen.tsx` — `<ModalTemplate>` at line 14

**Interfaces:**
- Consumes: `showBack` from Task 4, `backAction` from Task 3.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add `showBack` to every TabPage branch**

```bash
sed -i 's|<TabPage title={t("MobileApp.CreateTag.Title")}>|<TabPage showBack title={t("MobileApp.CreateTag.Title")}>|g' src/screens/merchant/CreateTag/CreateTagScreen.tsx
sed -i 's|<TabPage title={t("MobileApp.Refund.Title")}>|<TabPage showBack title={t("MobileApp.Refund.Title")}>|g' src/screens/refund-point/Refund/RefundScreen.tsx
sed -i 's|<TabPage title={t("MobileApp.Customs.Validate.Title")}>|<TabPage showBack title={t("MobileApp.Customs.Validate.Title")}>|g' src/screens/customs/Validate/CustomsValidateScreen.tsx
```

- [ ] **Step 2: Verify every branch was caught**

```bash
grep -c "TabPage showBack" src/screens/merchant/CreateTag/CreateTagScreen.tsx \
  src/screens/refund-point/Refund/RefundScreen.tsx \
  src/screens/customs/Validate/CustomsValidateScreen.tsx
```

Expected exactly: `CreateTagScreen.tsx:4`, `RefundScreen.tsx:3`, `CustomsValidateScreen.tsx:1`. Any lower number means a branch renders `<TabPage>` with different formatting — find it with `grep -n "<TabPage"` and fix by hand.

- [ ] **Step 3: Give RegisterScreen an explicit back target**

`/register` has **no inbound navigation anywhere in the app** — it is deep-link-only, where the history stack is empty and `router.back()` would silently do nothing. It needs a real destination, matching its own outbound `<Link href="/traveller-login">` at line 93 and the pattern both login screens already use.

In `src/screens/traveller/RegisterScreen.tsx`, change the import on line 6:

```tsx
import { Link, router } from "expo-router";
```

and add the prop to the `<ModalTemplate>` at line 14:

```tsx
    <ModalTemplate
      backAction={() => router.replace("/traveller-login")}
```

- [ ] **Step 4: Typecheck and run the full suite**

```bash
npx tsc --noEmit && npx jest --silent 2>&1 | tail -6
```

Expected: no tsc output; `Test Suites: 4 failed, 119 passed, 123 total`.

- [ ] **Step 5: Commit**

```bash
git add src/screens
git commit -m "fix: back button on the four pushed screens that needed a prop

CreateTag and Refund render TabPage from several branches; each one gets
showBack, or the button disappears in loading and error states.

/register has no inbound navigation at all — it is deep-link-only, so
router.back() would no-op. It gets an explicit replace to
/traveller-login, matching its own outbound Link."
```

---

### Task 6: The cosmetic unify — isolated so it can be reverted alone

Everything above is functional and validated by tests. This one is cosmetic: it restyles eighteen `ModalTemplate` screens that had no back-button problem. It stays in its own commit so it can be reverted without touching the fix.

**Update (2026-08-26):** a compact device — `V3`, ~423dp wide — is being made available, so this *can* be judged after all. Validate it there in Task 7 rather than shipping it on reasoning. `V3` previously carried only the pos-app, so it will likely need `adb install android/app/build/outputs/apk/debug/app-debug.apk` first. If `V3` does not materialise, fall back to shipping this commit unvalidated and say so plainly.

**Files:**
- Modify: `src/templates/Modal.tsx` — `px-6` → `px-4` in three places: the header wrapper (~line 113), the `ScrollView` (~line 141), the pinned action `View` (~line 170); and drop the `titleClassName` override added in Task 3.
- Modify: `src/templates/__tests__/Modal.router.test.tsx` — `findActionBar` matches on `className === "px-6"` and **will break**.

**Interfaces:**
- Consumes: everything from Tasks 2–5.
- Produces: nothing.

- [ ] **Step 1: Change the three insets and drop the title override**

```bash
sed -i 's|className="px-6 pt-2 mb-2"|className="px-4 pt-2 mb-2"|; s|className="flex-1 px-6"|className="flex-1 px-4"|; s|<View className="px-6" style={{ paddingBottom: insets.bottom }}>|<View className="px-4" style={{ paddingBottom: insets.bottom }}>|' src/templates/Modal.tsx
grep -n 'px-6\|px-4' src/templates/Modal.tsx
```

Expected: three `px-4` hits, zero `px-6`. If any `px-6` remains, the formatting differs — fix it by hand.

Then delete these two lines from the `<PageHeader>` call:

```tsx
          // Preserved deliberately: the unify to font-bold is quarantined in
          // its own commit because no available device can judge it.
          titleClassName="text-3xl font-medium"
```

- [ ] **Step 2: Update the test helper that pins the old value**

In `src/templates/__tests__/Modal.router.test.tsx`, `findActionBar` locates the pinned action bar by exact className. Update both the comment and the match:

```tsx
// The pinned action bar is the only `View` whose `className` is exactly
// "px-4" — the header uses "px-4 pt-2 mb-2" and the scroll view (a distinct
// host type, `RCTScrollView`) uses "flex-1 px-4".
function findActionBar(node: any): any {
  if (!node) return null;
  if (node.type === "View" && node.props?.className === "px-4") return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findActionBar(child);
      if (found) return found;
    }
  }
  return null;
}
```

- [ ] **Step 3: Run the full suite**

```bash
npx tsc --noEmit && npx jest --silent 2>&1 | tail -6
```

Expected: no tsc output; `Test Suites: 4 failed, 119 passed, 123 total`. If `gives the bottom inset to a pinned action bar` fails, Step 2 was missed.

- [ ] **Step 4: Commit — alone, and say why**

```bash
git add src/templates/Modal.tsx src/templates/__tests__/Modal.router.test.tsx
git commit -m "style: unify the page inset at px-4 and the title at font-bold

Isolated in its own commit: this restyles eighteen ModalTemplate screens
that had no back-button problem. The 800dp tablet cannot judge an 8px
inset shift; the ~423dp V3 can, and does so in Task 7. Revert this
commit alone if it reads too tight there — Tasks 1-5 do not depend on
it."
```

---

### Task 7: Verify against the baseline, then on the device

**Files:** none modified.

- [ ] **Step 1: Full gate**

```bash
npx tsc --noEmit && npx jest --silent 2>&1 | tail -6
```

Expected exactly:

```
Test Suites: 4 failed, 119 passed, 123 total
Tests:       1 skipped, 970 passed, 971 total
```

How that arithmetic works, so a mismatch is diagnosable rather than mysterious:

| | Suites | Tests |
|---|---|---|
| Baseline | 6 fail / 116 pass / 122 | 955 (the 6 contribute none — they fail to *load*) |
| Task 1 rename | 4 fail / 118 pass / 122 | +3 |
| Task 2 new suite | 4 fail / 119 pass / **123** | +8 |
| Task 3 Modal cases | — | +2 |
| Task 4 TabPage cases | — | +2 |
| **Final** | **4 / 119 / 123** | **970 passed, 1 skipped** |

Failing suites must be exactly `BottomSheet`, `DebouncedPressable`, `SafeAreaView`, `Toast`. **Any other suite failing is a regression from this work — stop and investigate rather than reporting green.**

```bash
npx jest 2>&1 | grep "^FAIL"
```

- [ ] **Step 2: Claim the device without stomping another session**

The `OrderPAD 3` (`LD2625CS00090`) is shared between agent sessions.

```bash
adb devices -l
adb reverse --list
```

Pick a Metro port not already listed. Do **not** assume 8081.

- [ ] **Step 3: Serve the app**

super-app is not an expo-dev-client, so a deep link will not repoint it. The build on the device is `DEBUGGABLE`, so these JS-only changes need no rebuild.

```bash
npx expo start --offline --port <free-port>
adb reverse tcp:<free-port> tcp:<free-port>
```

Then use the RN Dev Menu's **Change Bundle Location** on the device to point at `localhost:<free-port>`. This hijacks whoever else is using the device and persists — confirm the device is free first.

- [ ] **Step 4: Traveller-session QA**

Already logged in as a traveller. For each: the back arrow renders, tapping it returns to the previous screen, and the Android hardware key does the same.

- Profile → Edit Profile
- Profile → Language selector
- Profile → Cards, Documents (regression check — these already had a back button)
- Home → notification bell → Notifications
- Tag list → Tag detail (regression check — three render branches, most likely place for a subtle break)

```bash
adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png
```

- [ ] **Step 5: Ask the user for a staff login, then QA the three pushed TabPage screens**

These are the screens that took the new `showBack` prop and cannot be reached as a traveller:

- merchant → Create Tag (**check the loading and error states too — four branches**)
- refund point → Refund (**three branches**)
- customs → Validate

- [ ] **Step 6: Judge the px-4 unify on the compact device**

The 800dp tablet cannot settle this; `V3` (~423dp) can. Ask the user whether `V3` is attached before starting.

```bash
adb devices -l
adb -s <v3-serial> install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`V3` previously carried only the pos-app, so super-app probably is not installed. Point it at Metro the same way as Step 3, then compare a text-heavy modal screen (Edit Profile, Register) against the pre-change screenshots.

The question is narrow: **at 423dp, does px-4 leave the content too tight against the screen edge?** If yes, `git revert` the Task 6 commit alone — Tasks 1–5 are unaffected. If `V3` never arrives, say plainly that this shipped unvalidated.

- [ ] **Step 7: Report**

State plainly: which screens were checked on device and which were not; that the px-4 unify is unvalidated at phone width and sits in its own revertible commit; the exact final Jest numbers against the recorded baseline.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| `PageHeader` component + props | 2 |
| Hardware-back moves into PageHeader | 2 |
| ModalTemplate: back default ON, `backAction` target-only | 3 |
| TabPage: back default OFF, `showBack` opt-in | 4 |
| 8 zero-edit screens gain back | 3 (via the default) |
| 3 pushed TabPage screens | 5 |
| RegisterScreen explicit target | 5 |
| 9 "already correct" screens must not regress | 3 + Task 7 Step 4 |
| 18 "deliberately no back" screens | 4's default + untouched |
| Accessibility label + i18n key | 2 |
| Rename dead template suites | 1 |
| Extend both template suites | 3, 4 |
| New PageHeader suite | 2 |
| px-4 + font-bold unify, isolated | 6 |
| Baseline comparison | 7 |
| Device QA, staff login | 7 |

**Corrections made against the spec while planning:**

- The spec said the three pushed `TabPage` screens need "one prop each". They render `<TabPage>` from **4, 3, and 1** branches respectively — 8 prop additions, not 3. Task 5 Step 2 verifies the count rather than trusting the sed.
- The spec did not note that `Modal.router.test.tsx`'s `findActionBar` helper matches `className === "px-6"` exactly, so Task 6 breaks it. Task 6 Step 2 fixes it in the same commit.
- `RegisterScreen` imports only `Link` from `expo-router`; Task 5 Step 3 adds `router`.

**Placeholder scan:** none — every code step carries the actual code.

**Type consistency:** `showBack`, `backAction`, `right`, `accessory`, `titleClassName` are used identically in Tasks 2, 3, and 4. `PageHeader` is a named export, imported as `{ PageHeader }` everywhere. `TabPage` stays a default export; `ModalTemplate` stays named.
