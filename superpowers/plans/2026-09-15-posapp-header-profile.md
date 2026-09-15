# pos-app Centralized Header & Profile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pos-app draws one header on every page, with a back arrow by default; the Card Reader diagnostics page is gone, Connected Devices loses its entry points, and Profile becomes identity-first with the store switcher in its header.

**Architecture:** Extract super-app's `PageHeader` into `pos-app/src/components/PageHeader.tsx` and have `ModalTemplate` consume it, so 17 screens inherit the arrow from one prop default instead of being edited. Then port `SettingsGroup` and `ProfileHero` and reassemble `ProfileScreen` on top of them, with a new `StoreSwitcherPill` in the header's right slot.

**Tech Stack:** Expo ~54 / RN 0.81.5 / React 19.1 / TypeScript ~5.9 strict, Expo Router ~6, NativeWind 4 + Tailwind 3.4, Zustand 5, `@gorhom/bottom-sheet` 5, jest-expo + `@testing-library/react-native`.

**Spec:** [2026-09-15-posapp-header-profile-design.md](../specs/2026-09-15-posapp-header-profile-design.md)

## Global Constraints

Every task's requirements implicitly include this section.

- **Repo:** `C:\unirefund\pos-app`, branching from `main` @ `e63354f`. Work on a feature branch, not `main`.
- **Gates, re-measured at baseline before you start** — `npm run typecheck` clean (0 errors), `npm test` 67 suites / 818 tests all passing, `npm run lint` 0 errors / 34 warnings. Hold them. Don't fix pre-existing warnings.
- **`npm run init` must run before `tsc` can see a new i18n key.** `src/data/language-data/*.gen.json` is gitignored and regenerated from `src/localization/resources/*.json`. `init.ts` reads `.env` for `EXPO_PUBLIC_GATEWAY_URL`, `SUPPORTED_LOCALES`, `EXPO_PUBLIC_GLITCHTIP_DSN`. **A task that adds a key and skips `npm run init` will see a bogus `tsc` failure.**
- **`prettier --check` is NOT a gate** — 228 files fail repo-wide at baseline. Format only the files you touch. **Never** run prettier on a file mirrored from `core` (`src/config/{appConfigTypes,appConfigKeys,appConfigParse,isHostTenant,normalizeApplicationConfiguration}.ts`, `src/actions/AccountService/types.ts`, `src/store/user.ts`, `src/store/application-configuration.ts`). **No file in this plan is mirrored**, so this is a hazard only if you wander.
- **`core.autocrlf=true` in this repo.** Files are LF in the committed blob, many are CRLF on disk. Don't treat a whole-file diff as real divergence without `git show`.
- **Locale files are UTF-8 with Turkish characters** (`ş`, `ğ`, `ı`, `ü`, `ö`, `ç`). Edit them with the Edit tool or a UTF-8-explicit script. A careless `>` redirect under PowerShell will mangle them.
- **React Compiler is on.** Do not add `React.memo`, `useCallback`, or `useMemo` to steady props — the compiler already memoises callbacks and JSX elements. The one thing it cannot fix is a zustand subscription: use selector hooks, never a bare `useStore()`.
- **Colour is always a semantic token**, never a hex or a Tailwind default-palette class (`bg-gray-100` is wrong; `bg-card`, `text-muted`, `border-border`, `text-foreground` are right). Concrete values come from `src/utils/theme.ts`.
- **Reach for `@/components/ui`** (`Text`, `Card`, `Badge`, `Button`, `Input`, `Label`) rather than raw react-native equivalents. Note there are two `Input`s — `@/components/ui` is the bare control, `@/components/Input` the labelled form field.
- **Path alias:** `@/*` → `./src/*`.
- Tests live in `__tests__/` beside their source and are named `*.test.tsx` / `*.test.ts`. There is **no** `.router.test` convention here — that is super-app's.

---

## File Structure

**Created:**

| File | Responsibility |
| --- | --- |
| `src/components/PageHeader.tsx` | The one header: title, description, back arrow, right slot, accessory. Owns the Android hardware back key while focused. |
| `src/components/__tests__/PageHeader.test.tsx` | Its tests. |
| `src/components/SettingsGroup.tsx` | One labelled card of settings rows. Presentational. |
| `src/components/__tests__/SettingsGroup.test.tsx` | Its tests. |
| `src/components/StoreSwitcherPill.tsx` | Header trigger for the store switcher sheet. |
| `src/components/__tests__/StoreSwitcherPill.test.tsx` | Its tests. |
| `src/screens/(auth)/Profile/_components/ProfileHero.tsx` | Identity card: avatar, name, role badge, organization row. |
| `src/screens/(auth)/Profile/_components/__tests__/ProfileHero.test.tsx` | Its tests. |
| `src/screens/(auth)/Profile/useMerchantIdentity.ts` | Which store this account acts for, and how many it has. |
| `src/screens/(auth)/Profile/__tests__/useMerchantIdentity.test.ts` | Its tests. |
| `src/screens/(auth)/Profile/__tests__/ProfileScreen.test.tsx` | Assembly test. |

**Modified:** `src/templates/Modal.tsx`, `src/templates/__tests__/Modal.test.tsx`, `src/screens/(auth)/Home/HomeScreen.tsx`, `src/screens/(public)/LoginScreen.tsx`, `src/screens/(public)/RegisterScreen.tsx`, `src/screens/(auth)/ConnectedDevices/ConnectedDevicesScreen.tsx`, `src/screens/(auth)/ConnectedDevices/__tests__/ConnectedDevicesScreen.test.tsx`, `src/screens/(auth)/Profile/ProfileScreen.tsx`, `src/localization/resources/en-US.json`, `src/localization/resources/tr-TR.json`.

**Deleted:** `src/app/(auth)/card-reader.tsx`, `src/screens/(auth)/CardReader/` (whole dir), `src/templates/TabPage.tsx`, `src/templates/__tests__/TabPage.test.tsx`, `src/screens/(auth)/ConnectedDevices/_components/AffilationSwitch.tsx`, `src/screens/(auth)/Profile/_components/UserCard.tsx`.

---

### Task 1: Remove the Card Reader page

Deletes a diagnostics screen. **The card-reading machinery underneath it stays** — `RefundCardScanModal` in the sale flow depends on all of it. Deleting `src/hooks/useCardReader.tsx`, `src/hooks/useCardCapabilities.tsx`, `src/store/cardCapabilities.ts`, or `modules/sunmi-card-reader` would break the refund-card scan on a POS terminal.

**Files:**
- Delete: `src/app/(auth)/card-reader.tsx`
- Delete: `src/screens/(auth)/CardReader/CardReaderScreen.tsx`
- Delete: `src/screens/(auth)/CardReader/__tests__/CardReaderScreen.test.tsx`
- Modify: `src/screens/(auth)/Home/HomeScreen.tsx` (remove the Card Reader tile)
- Modify: `src/localization/resources/en-US.json`, `src/localization/resources/tr-TR.json`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Later tasks must not reference `CardReaderScreen`.

- [ ] **Step 1: Confirm the baseline before removing anything**

```bash
cd /c/unirefund/pos-app
git checkout -b feat/centralized-header-profile
npm run init
npm test 2>&1 | tail -5
```

Expected: `Tests: 818 passed, 818 total` / `Test Suites: 67 passed, 67 total`. Write the real numbers down — every later task compares against them.

- [ ] **Step 2: Prove nothing outside the deleted files imports them**

```bash
grep -rn "CardReader/CardReaderScreen\|(auth)/card-reader" --include=*.ts --include=*.tsx src/
```

Expected: exactly two hits, both in files being deleted (`src/app/(auth)/card-reader.tsx`) or in `HomeScreen.tsx`. If anything else appears, stop and report it.

- [ ] **Step 3: Delete the route, the screen and its test**

```bash
git rm src/app/\(auth\)/card-reader.tsx
git rm -r src/screens/\(auth\)/CardReader
```

- [ ] **Step 4: Remove the Card Reader tile from HomeScreen**

In `src/screens/(auth)/Home/HomeScreen.tsx`, delete this whole block:

```tsx
        <View className="flex-row gap-2">
          <CardAction
            title={t("MobileApp.Home.CardReader")}
            icon="card-outline"
            onPress={() => {
              router.push("/(auth)/card-reader");
            }}
          />
        </View>
```

Leave every other tile alone. (The Connected Devices tile goes in Task 5, not here.)

- [ ] **Step 5: Remove the i18n keys from both locales**

In `src/localization/resources/en-US.json` and `src/localization/resources/tr-TR.json`, delete the `"CardReader"` entry from the `Home` object, and delete the whole top-level `"CardReader"` block. Use the Edit tool — these files contain Turkish characters that a shell redirect can mangle.

- [ ] **Step 6: Regenerate the i18n bundle and typecheck**

```bash
npm run init && npm run typecheck
```

Expected: clean, 0 errors. `npm run init` is required — without it `tsc` still sees the old bundle and will disagree with the source of truth.

- [ ] **Step 7: Run the full suite**

```bash
npm test 2>&1 | tail -5
```

Expected: **66 suites / fewer tests** than baseline — `CardReaderScreen.test.tsx` had 278 lines of tests and is gone. All remaining pass. Specifically confirm `RefundCardScanModal.test.tsx` still passes; it exercises the machinery this task deliberately kept.

- [ ] **Step 8: Lint the touched files and commit**

```bash
npm run lint 2>&1 | tail -3
npx prettier --write "src/screens/(auth)/Home/HomeScreen.tsx" src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git add -A
git commit -m "feat(pos-app): remove the Card Reader diagnostics page

The screen was a test harness over useCardReader/useCardCapabilities. Those
hooks, the cardCapabilities store and modules/sunmi-card-reader all stay —
Sale/_components/RefundCardScanModal is their real consumer."
```

---

### Task 2: Extract `PageHeader`

Creates the component. Does **not** wire it into anything — Task 3 does that, so a reviewer can judge the component on its own before a dozen screens change.

**Files:**
- Create: `src/components/PageHeader.tsx`
- Create: `src/components/__tests__/PageHeader.test.tsx`
- Modify: `src/localization/resources/en-US.json`, `src/localization/resources/tr-TR.json` (add `Common.Back`)

**Interfaces:**
- Consumes: `@/components/Ionicons`, `@/hooks/useDebouncedPress`, `@/providers/LocalizationProvider`, `@/utils/cn`, `expo-router`.
- Produces:
  ```ts
  export interface PageHeaderProps {
    title: string;
    description?: string;
    showBack?: boolean;      // default true
    backAction?: () => void; // default router.back()
    backDisabled?: boolean;
    right?: React.ReactNode;
    accessory?: React.ReactNode;
    backLabel?: string;
    titleClassName?: string; // default "text-3xl font-medium text-foreground"
  }
  export function PageHeader(props: PageHeaderProps): React.JSX.Element;
  ```
  Task 3 consumes `PageHeader`; Task 10 passes `right`.

- [ ] **Step 1: Add the `Common.Back` key to both locales**

In `src/localization/resources/en-US.json`, inside the existing `"Common"` object (which currently holds `Loading`, `MoreActions`, `Pager`), add:

```json
    "Back": "Go back",
```

In `src/localization/resources/tr-TR.json`, in the same place:

```json
    "Back": "Geri dön",
```

Then regenerate so `tsc` can see it:

```bash
npm run init
```

- [ ] **Step 2: Write the failing test**

Create `src/components/__tests__/PageHeader.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import React from "react";
import { BackHandler, Text as RNText } from "react-native";
import { PageHeader } from "../PageHeader";

// useFocusEffect must actually run its callback: the hardware-back cases
// below depend on the listener being registered. Same shape as Modal.test.tsx.
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

// The real Ionicons loads a font asynchronously.
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

// `t` echoes the key. This matters: the real context's DEFAULT value returns
// the empty string outside a provider (the `throw` in useLocalization is
// unreachable, because the context default is non-null). Asserting against ""
// would therefore pass whether or not the hook was wired up at all.
jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

describe("PageHeader", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders the back control by default", () => {
    render(<PageHeader title="Profile" />);

    expect(screen.getByTestId("icon-arrow-back")).toBeTruthy();
    expect(screen.getByText("Profile")).toBeTruthy();
  });

  it("omits the back control under showBack={false}", () => {
    render(<PageHeader title="Login" showBack={false} />);

    expect(screen.queryByTestId("icon-arrow-back")).toBeNull();
  });

  it("calls a supplied backAction instead of router.back", () => {
    const backAction = jest.fn();
    render(<PageHeader title="Sale" backAction={backAction} />);

    fireEvent.press(screen.getByTestId("icon-arrow-back"));

    expect(backAction).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
  });

  it("falls back to router.back when no backAction is given", () => {
    render(<PageHeader title="Tags" />);

    fireEvent.press(screen.getByTestId("icon-arrow-back"));

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("blocks the arrow while backDisabled", () => {
    const backAction = jest.fn();
    render(<PageHeader title="Sale" backAction={backAction} backDisabled />);

    fireEvent.press(screen.getByTestId("icon-arrow-back"));

    expect(backAction).not.toHaveBeenCalled();
  });

  it("claims the Android hardware key and pops, when not disabled", () => {
    const addEventListener = jest.spyOn(BackHandler, "addEventListener");
    render(<PageHeader title="Tags" />);

    const [event, handler] = addEventListener.mock.calls.at(-1)!;
    expect(event).toBe("hardwareBackPress");

    expect(handler()).toBe(true);
    expect(router.back).toHaveBeenCalledTimes(1);

    addEventListener.mockRestore();
  });

  it("swallows the Android hardware key while backDisabled", () => {
    const addEventListener = jest.spyOn(BackHandler, "addEventListener");
    render(<PageHeader title="Sale" backDisabled />);

    const [, handler] = addEventListener.mock.calls.at(-1)!;

    // Still returns true: falling through would hand the press to React
    // Navigation, which would pop the screen the disable is meant to hold.
    expect(handler()).toBe(true);
    expect(router.back).not.toHaveBeenCalled();

    addEventListener.mockRestore();
  });

  it("registers no hardware listener when there is no back control", () => {
    const addEventListener = jest.spyOn(BackHandler, "addEventListener");
    render(<PageHeader title="Login" showBack={false} />);

    expect(addEventListener).not.toHaveBeenCalled();

    addEventListener.mockRestore();
  });

  it("labels the back control from the localization hook", () => {
    render(<PageHeader title="Profile" />);

    expect(screen.getByLabelText("MobileApp.Common.Back")).toBeTruthy();
  });

  it("prefers an explicit backLabel, for callers inside a bottom sheet", () => {
    render(<PageHeader title="Filters" backLabel="Kapat" />);

    expect(screen.getByLabelText("Kapat")).toBeTruthy();
    expect(screen.queryByLabelText("MobileApp.Common.Back")).toBeNull();
  });

  it("renders description, right slot and accessory", () => {
    render(
      <PageHeader
        title="Tags"
        description="All issued tags"
        right={<RNText>RIGHT</RNText>}
        accessory={<RNText>ACCESSORY</RNText>}
      />,
    );

    expect(screen.getByText("All issued tags")).toBeTruthy();
    expect(screen.getByText("RIGHT")).toBeTruthy();
    expect(screen.getByText("ACCESSORY")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx jest src/components/__tests__/PageHeader.test.tsx 2>&1 | tail -15
```

Expected: FAIL — `Cannot find module '../PageHeader'`.

- [ ] **Step 4: Write the implementation**

Create `src/components/PageHeader.tsx`:

```tsx
import { Ionicons } from "@/components/Ionicons";
import { Text } from "@/components/ui";
import { useDebouncedPress } from "@/hooks/useDebouncedPress";
import { useLocalization } from "@/providers/LocalizationProvider";
import { cn } from "@/utils/cn";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback } from "react";
import { BackHandler, TouchableOpacity, View } from "react-native";

export interface PageHeaderProps {
  title: string;
  description?: string;
  showBack?: boolean;
  backAction?: () => void;
  /**
   * Holds the screen while it is mid-flight — a login in progress, a form
   * submitting. Blocks the arrow and the Android hardware key together, since
   * leaving either live defeats the other.
   */
  backDisabled?: boolean;
  right?: React.ReactNode;
  /** Rendered under the title, in the same column, clear of the right slot. */
  accessory?: React.ReactNode;
  /**
   * Overrides the hook-resolved accessibility label for the back control.
   *
   * For callers inside a `<BottomSheet>`, where a hook loses its context. Note
   * the failure is silent rather than loud: `LocalizationContext` has a
   * non-null default whose `t` returns "", so a header that misses the
   * provider announces nothing at all rather than throwing. The host resolves
   * the string and passes it down, the way `MoreActionsSheet` already does.
   */
  backLabel?: string;
  titleClassName?: string;
}

// expo-router's useFocusEffect calls useNavigation() regardless of what the
// callback does, so mounting it unconditionally would force every consumer —
// including screens that never show a back button — to render inside a
// navigation context just to satisfy a hook they have no use for. Mounting
// this only when showBack is true keeps that requirement scoped to screens
// that actually need it: conditionally rendering a component is legal, since
// the rules of hooks constrain a single component's own render, not whether
// a sibling is rendered at all.
function BackHandlerOnFocus({
  onBack,
  disabled,
}: {
  onBack: () => void;
  disabled?: boolean;
}) {
  // Scoped to focus so only the visible screen claims the press. Returning
  // true stops React Navigation from also running its own pop — which is why
  // `disabled` still returns it rather than falling through.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (!disabled) onBack();
          return true;
        },
      );
      return () => subscription.remove();
    }, [onBack, disabled]),
  );

  return null;
}

/**
 * The app's one page header.
 *
 * Lifted out of `ModalTemplate`, which mixed it with a keyboard-avoiding
 * scroll body and a footer action bar — so a screen that wanted a header had
 * to take the whole template, and two screens hand-rolled their own instead.
 *
 * The back arrow defaults to *on*. `ModalTemplate` used to draw one only when
 * a `backAction` prop was passed, and 12 of its 17 callers never passed one,
 * which left a dozen pushed screens with no visible way back on a terminal
 * whose Android navigation is a thin gesture bar.
 */
export function PageHeader({
  title,
  description,
  showBack = true,
  backAction,
  backDisabled,
  right,
  accessory,
  backLabel,
  // pos-app's own title styling, kept rather than super-app's `font-bold`:
  // this change centralizes the header, it does not restyle every screen.
  titleClassName = "text-3xl font-medium text-foreground",
}: PageHeaderProps) {
  const { t } = useLocalization();

  // Debounced so a rapid double tap can't pop two screens.
  const handleBack = useDebouncedPress(
    useCallback(() => {
      if (backAction) backAction();
      else router.back();
    }, [backAction]),
  );

  return (
    <View>
      {showBack && (
        <BackHandlerOnFocus onBack={handleBack} disabled={backDisabled} />
      )}
      <View className="flex-row items-start gap-4">
        {showBack && (
          <TouchableOpacity
            onPress={handleBack}
            disabled={backDisabled}
            accessibilityRole="button"
            accessibilityLabel={backLabel ?? t("MobileApp.Common.Back")}
            accessibilityState={{ disabled: Boolean(backDisabled) }}
            className={cn(
              "border border-border rounded-full size-10 items-center justify-center",
              backDisabled && "opacity-50",
            )}
          >
            <Ionicons name="arrow-back" size={24} className="text-foreground" />
          </TouchableOpacity>
        )}
        <View className="flex-1 gap-1">
          <Text className={titleClassName}>{title}</Text>
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

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest src/components/__tests__/PageHeader.test.tsx 2>&1 | tail -15
```

Expected: PASS, 11 tests.

If `getByLabelText` fails on the `TouchableOpacity`, it is because the press target is the `TouchableOpacity` while the testID sits on the mocked `Ionicons` child — both queries are valid and resolve to different nodes. That is fine; do not move the testID.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint 2>&1 | tail -3
npx prettier --write src/components/PageHeader.tsx src/components/__tests__/PageHeader.test.tsx src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git add -A
git commit -m "feat(pos-app): add the shared PageHeader component

Ported from super-app, plus a backLabel override. pos-app's
LocalizationContext has a non-null default whose t() returns \"\", so a
consumer that misses the provider — a BottomSheet child — announces an empty
accessibility label rather than throwing. Not yet wired into any template."
```

---

### Task 3: `ModalTemplate` consumes `PageHeader`

The widest-reaching task in the plan. Nine screens gain a back arrow **without being edited**, because the default changed. Two public screens opt out.

**Files:**
- Modify: `src/templates/Modal.tsx`
- Modify: `src/templates/__tests__/Modal.test.tsx`
- Modify: `src/screens/(public)/LoginScreen.tsx`, `src/screens/(public)/RegisterScreen.tsx`

**Interfaces:**
- Consumes: `PageHeader` from Task 2.
- Produces: `ModalTemplateProps` gains `showBack?: boolean` (default `true`). Every later task that renders a screen through `ModalTemplate` inherits the arrow.

- [ ] **Step 1: Write the failing test**

Append to `src/templates/__tests__/Modal.test.tsx`. Note the file's existing `expo-router` and `Ionicons` mocks already cover what these need; do not re-declare them.

```tsx
describe("ModalTemplate back arrow default", () => {
  beforeEach(() => jest.clearAllMocks());

  // ModalTemplate used to draw an arrow only when `backAction` was passed, and
  // 12 of its 17 callers never passed one. The default is now on.
  it("shows the back arrow without a backAction", () => {
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ModalTemplate title="Product groups">{null}</ModalTemplate>
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId("icon-arrow-back")).toBeTruthy();
  });

  it("pops via router.back when the arrow has no explicit action", () => {
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ModalTemplate title="Product groups">{null}</ModalTemplate>
      </SafeAreaProvider>,
    );

    fireEvent.press(screen.getByTestId("icon-arrow-back"));

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("omits the arrow under showBack={false}, for a public entry screen", () => {
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ModalTemplate title="Login" showBack={false}>
          {null}
        </ModalTemplate>
      </SafeAreaProvider>,
    );

    expect(screen.queryByTestId("icon-arrow-back")).toBeNull();
  });

  it("keeps busy mapped onto the header's disabled state", () => {
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ModalTemplate title="Sale" busy>
          {null}
        </ModalTemplate>
      </SafeAreaProvider>,
    );

    fireEvent.press(screen.getByTestId("icon-arrow-back"));

    expect(router.back).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest src/templates/__tests__/Modal.test.tsx 2>&1 | tail -20
```

Expected: the three new arrow-presence tests FAIL (`Unable to find an element with testID: icon-arrow-back`), because `ModalTemplate` still gates the arrow on `backAction`. The existing tests still pass.

- [ ] **Step 3: Rewrite `ModalTemplate`'s header**

In `src/templates/Modal.tsx`:

**3a.** Add the import and drop the ones the header block no longer needs:

```tsx
import { PageHeader } from "@/components/PageHeader";
```

Remove `Text`, `TouchableOpacity` and `useFocusEffect` from their import statements **only if nothing else in the file still uses them** — check first; `TouchableOpacity` is still used by the overflow button at the bottom.

**3b.** Add `showBack` to `ModalTemplateProps`, next to `backAction`:

```tsx
  /**
   * Defaults to true. Pass false only where there is genuinely nothing
   * behind the screen — the public login and register entries.
   */
  showBack?: boolean;
```

**3c.** Add it to the destructured parameter list with its default:

```tsx
  showBack = true,
```

**3d.** Delete this entire block — `PageHeader` owns it now:

```tsx
  // Mirror the visual back button on the Android hardware back key so a custom
  // `backAction` is honored there too. Scoped to focus (via useFocusEffect) so
  // only the visible screen claims the press, and returning true stops React
  // Navigation from also running its own pop — which is why `busy` still
  // returns it rather than falling through. `handleBack` is already debounced.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (!busy) handleBack();
          return true;
        },
      );
      return () => subscription.remove();
    }, [handleBack, busy]),
  );
```

...and the `handleBack` declaration directly above it:

```tsx
  const handleBack = useDebouncedPress(
    useCallback(() => {
      if (backAction) {
        backAction();
      } else {
        router.back();
      }
    }, [backAction]),
  );
```

Then drop `BackHandler` from the `react-native` import.

**3e.** Replace the header JSX. Delete from `<View className="px-6 pt-2 mb-2">` through its closing `</View>` (the block containing the back `TouchableOpacity`, the title `Text`, `headerRightComponent` and the `description`), and put in its place:

```tsx
      <View className="px-6 pt-2 mb-2">
        <PageHeader
          title={title}
          description={description}
          showBack={showBack}
          backAction={backAction}
          backDisabled={busy}
          right={headerRightComponent}
        />
      </View>
```

- [ ] **Step 4: Run the template tests**

```bash
npx jest src/templates/__tests__/Modal.test.tsx 2>&1 | tail -20
```

Expected: PASS, including the four existing `ModalTemplate busy` cases. Those still work because `busy` now arrives as `backDisabled`, and because `PageHeader`'s hardware handler is mounted whenever `showBack` is true.

- [ ] **Step 5: Opt the two public screens out**

In `src/screens/(public)/LoginScreen.tsx`, the `ModalTemplate` call at roughly line 61 becomes:

```tsx
    <ModalTemplate
      title={t("MobileApp.Auth.Login.Title")}
      keyboardShouldPersistTaps="handled"
      busy={isLoading}
      showBack={false}
    >
```

Make the same `showBack={false}` addition to the `ModalTemplate` call in `src/screens/(public)/RegisterScreen.tsx`.

**Consequence to be aware of, and accept:** with `showBack={false}`, `PageHeader` mounts no hardware-back listener on these screens. Today `ModalTemplate` registers one unconditionally and swallows the press. After this change, Android's own back behaviour applies on Login and Register — which is what a public entry screen should do.

- [ ] **Step 6: Run the full suite**

```bash
npm run typecheck && npm test 2>&1 | tail -8
```

Expected: typecheck clean; all suites pass. A failure in `LoginScreen.test.tsx` here would mean it asserts on the absence of an arrow — read it before changing it.

- [ ] **Step 7: Lint and commit**

```bash
npm run lint 2>&1 | tail -3
npx prettier --write src/templates/Modal.tsx src/templates/__tests__/Modal.test.tsx "src/screens/(public)/LoginScreen.tsx" "src/screens/(public)/RegisterScreen.tsx"
git add -A
git commit -m "feat(pos-app): route ModalTemplate's header through PageHeader

The back arrow now defaults to on, so nine pushed screens gain one without
being edited: ConnectedDevices, BarcodeTest, DeviceSettings, ProductGroups,
EditProfile, Profile, AddProduct, TagScreen, LanguageSelection. Login and
Register pass showBack={false} — nothing sits behind them.

ModalTemplate sheds its own BackHandler/useFocusEffect block; PageHeader owns
the hardware key now, and busy maps onto backDisabled."
```

---

### Task 4: Delete the dead `TabPage` template

Zero consumers, and it carries an inline title that would drift from `PageHeader` the moment either changed.

**Files:**
- Delete: `src/templates/TabPage.tsx`, `src/templates/__tests__/TabPage.test.tsx`

**Interfaces:**
- Consumes: nothing. Produces: nothing.

- [ ] **Step 1: Prove it really has no consumers**

```bash
grep -rn "templates/TabPage\|from \"../TabPage\"\|from \"./TabPage\"" --include=*.ts --include=*.tsx src/
```

Expected: only `src/templates/__tests__/TabPage.test.tsx`. If a screen appears, **stop** — the premise of this task is wrong; report it instead of deleting.

- [ ] **Step 2: Delete both files**

```bash
git rm src/templates/TabPage.tsx src/templates/__tests__/TabPage.test.tsx
```

- [ ] **Step 3: Verify**

```bash
npm run typecheck && npm test 2>&1 | tail -5
```

Expected: typecheck clean; suite count drops by one more.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(pos-app): delete the unused TabPage template

No screen imported it. Its inline title would have drifted from PageHeader."
```

---

### Task 5: Drop the Connected Devices entry points

The route and screen stay registered and compiling. Only the ways in go. The affiliation switch moves to the header in Task 9.

**Files:**
- Modify: `src/screens/(auth)/Home/HomeScreen.tsx`
- Modify: `src/screens/(auth)/ConnectedDevices/ConnectedDevicesScreen.tsx`
- Modify: `src/screens/(auth)/ConnectedDevices/__tests__/ConnectedDevicesScreen.test.tsx`
- Delete: `src/screens/(auth)/ConnectedDevices/_components/AffilationSwitch.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. After this task, **no source file links to `/(auth)/connected-devices`**. That is intended.

- [ ] **Step 1: Remove the Home tile**

In `src/screens/(auth)/Home/HomeScreen.tsx`, delete:

```tsx
        <View className="flex-row gap-2">
          <CardAction
            title={t("MobileApp.Home.ConnectedDevices")}
            icon="phone-portrait-outline"
            onPress={() => {
              router.push("/(auth)/connected-devices");
            }}
          />
        </View>
```

Leave the `MobileApp.Home.ConnectedDevices` i18n key in place — `ConnectedDevicesScreen` still exists and may want it.

- [ ] **Step 2: Remove `AffilationSwitch` from the screen**

In `src/screens/(auth)/ConnectedDevices/ConnectedDevicesScreen.tsx`, delete the import:

```tsx
import { AffilationSwitch } from "./_components/AffilationSwitch";
```

and its render, which is the first child inside the `<View>` under the `ScrollView`:

```tsx
          <AffilationSwitch />
```

**Keep** the comment and the `changingAffiliation` logic directly beneath it — an affiliation switch still tears the hub connection down and back up, whichever control started it. Only the trigger moved.

- [ ] **Step 3: Delete the component**

```bash
git rm "src/screens/(auth)/ConnectedDevices/_components/AffilationSwitch.tsx"
```

- [ ] **Step 4: Update the screen's test**

Open `src/screens/(auth)/ConnectedDevices/__tests__/ConnectedDevicesScreen.test.tsx` and remove any assertion or mock that refers to `AffilationSwitch`, `MerchantSwitch.Title`, or `useStoreSwitcher`. Read the file first — if it has none, this step is a no-op and that is fine.

- [ ] **Step 5: Verify nothing still links to the route**

```bash
grep -rn "connected-devices" --include=*.ts --include=*.tsx src/
```

Expected: only `src/app/(auth)/connected-devices.tsx` (the route file itself). No `router.push` to it anywhere.

- [ ] **Step 6: Run and commit**

```bash
npm run typecheck && npm test 2>&1 | tail -5
npm run lint 2>&1 | tail -3
npx prettier --write "src/screens/(auth)/Home/HomeScreen.tsx" "src/screens/(auth)/ConnectedDevices/ConnectedDevicesScreen.tsx" "src/screens/(auth)/ConnectedDevices/__tests__/ConnectedDevicesScreen.test.tsx"
git add -A
git commit -m "feat(pos-app): drop the Connected Devices entry points

The route and screen stay registered; nothing links to them. AffilationSwitch
is deleted — the switcher moves to the Profile header. The screen's
changingAffiliation skeleton logic stays: a switch still cycles the hub
connection whichever control started it."
```

---

### Task 6: `SettingsGroup`

Replaces `ActionList` on the redesigned Profile rather than extending it: `ActionList` puts its heading *inside* the same card as its rows, and the point of grouping here is that the heading sits outside so several cards stack under one scroll view. `ActionList` is unchanged and still backs other screens.

**Files:**
- Create: `src/components/SettingsGroup.tsx`
- Create: `src/components/__tests__/SettingsGroup.test.tsx`

**Interfaces:**
- Consumes: `@/components/ui` (`Text`), `@/components/Ionicons`, `@/hooks/useDebouncedPress`, `@/utils/cn`.
- Produces:
  ```ts
  export interface SettingsRowProps {
    title: string;
    icon: IoniconsTypes;
    onPress: () => void | Promise<void>;
    disabled?: boolean;
    value?: string;
    primary?: boolean;
    destructive?: boolean;
    testID?: string;
  }
  export interface SettingsGroupProps {
    title?: string;
    rows: SettingsRowProps[];
    className?: string;
  }
  export function SettingsGroup(props: SettingsGroupProps): React.JSX.Element;
  ```
  Task 10 builds `ProfileScreen` out of these.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/SettingsGroup.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { SettingsGroup } from "../SettingsGroup";

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

describe("SettingsGroup", () => {
  it("renders the heading above the card", () => {
    render(
      <SettingsGroup
        title="Account"
        rows={[
          { title: "Personal Info", icon: "person-outline", onPress: jest.fn() },
        ]}
      />,
    );

    expect(screen.getByText("Account")).toBeTruthy();
    expect(screen.getByText("Personal Info")).toBeTruthy();
  });

  // An unlabelled group is how the sign-out row stands alone at the bottom.
  it("renders without a heading", () => {
    render(
      <SettingsGroup
        rows={[{ title: "Log Out", icon: "log-out-outline", onPress: jest.fn() }]}
      />,
    );

    expect(screen.getByText("Log Out")).toBeTruthy();
  });

  it("fires a row's onPress", () => {
    const onPress = jest.fn();
    render(
      <SettingsGroup
        rows={[{ title: "Device Settings", icon: "phone-portrait-outline", onPress }]}
      />,
    );

    fireEvent.press(screen.getByText("Device Settings"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows a row's right-hand value", () => {
    render(
      <SettingsGroup
        rows={[
          {
            title: "App Language",
            icon: "language-outline",
            value: "Türkçe",
            onPress: jest.fn(),
          },
        ]}
      />,
    );

    expect(screen.getByText("Türkçe")).toBeTruthy();
  });

  it("does not fire a disabled row", () => {
    const onPress = jest.fn();
    render(
      <SettingsGroup
        rows={[
          {
            title: "Notification Preferences",
            icon: "notifications-outline",
            disabled: true,
            onPress,
          },
        ]}
      />,
    );

    fireEvent.press(screen.getByText("Notification Preferences"));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("renders every row it is given", () => {
    render(
      <SettingsGroup
        title="Device"
        rows={[
          { title: "Device Settings", icon: "phone-portrait-outline", onPress: jest.fn() },
          { title: "Printer Settings", icon: "print-outline", onPress: jest.fn() },
        ]}
      />,
    );

    expect(screen.getByText("Device Settings")).toBeTruthy();
    expect(screen.getByText("Printer Settings")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest src/components/__tests__/SettingsGroup.test.tsx 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../SettingsGroup'`.

- [ ] **Step 3: Write the implementation**

Create `src/components/SettingsGroup.tsx`:

```tsx
import { Ionicons, type IoniconsTypes } from "@/components/Ionicons";
import { Text } from "@/components/ui";
import { useDebouncedPress } from "@/hooks/useDebouncedPress";
import { cn } from "@/utils/cn";
import React from "react";
import { Pressable, View } from "react-native";

export interface SettingsRowProps {
  title: string;
  icon: IoniconsTypes;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  /**
   * Right-hand value shown before the chevron — the current language, a
   * store name. Kept out of the title so the label column stays scannable.
   */
  value?: string;
  /** Renders the row in the primary colour, for a call to action. */
  primary?: boolean;
  /** Renders the row in the error colour, for a destructive action. */
  destructive?: boolean;
  testID?: string;
}

export interface SettingsGroupProps {
  /** Section heading above the card. Omit for an unlabelled group. */
  title?: string;
  rows: SettingsRowProps[];
  className?: string;
}

function SettingsRow({
  title,
  icon,
  onPress,
  disabled,
  value,
  primary,
  destructive,
  testID,
}: SettingsRowProps) {
  const tone = destructive ? "error" : primary ? "primary" : "default";
  // `Pressable` + `useDebouncedPress` rather than `DebouncedPressable`: that
  // component's prop type accepts no accessibility props, and a settings row
  // needs a role and a disabled state. Same debounce, same guarantees.
  const handlePress = useDebouncedPress(onPress);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={cn(
        "flex-row items-center gap-3 px-4 py-3.5 active:bg-foreground/5",
        disabled && "opacity-50",
      )}
    >
      <View className="size-9 items-center justify-center rounded-full bg-foreground/5">
        <Ionicons
          name={icon}
          size={18}
          className={
            destructive
              ? "text-error"
              : primary
                ? "text-primary"
                : "text-foreground"
          }
        />
      </View>

      <Text variant="body" tone={tone} className="flex-1" numberOfLines={1}>
        {title}
      </Text>

      {!!value && (
        <Text variant="label" tone="muted" numberOfLines={1}>
          {value}
        </Text>
      )}

      <Ionicons name="chevron-forward" size={16} className="text-muted" />
    </Pressable>
  );
}

/**
 * One labelled group of settings rows.
 *
 * Replaces `ActionList` for the identity-first profile rather than extending
 * it: that component puts the heading *inside* the same card as the rows, and
 * the point of grouping here is that the heading sits outside so several cards
 * stack under one scroll view. `ActionList` still backs the other screens, so
 * it is unchanged.
 *
 * Colours come from semantic tokens throughout, so the group follows the app
 * rather than pinning a grey from Tailwind's default scale.
 */
export function SettingsGroup({ title, rows, className }: SettingsGroupProps) {
  return (
    <View className={cn("gap-2", className)}>
      {title !== undefined && (
        <Text
          variant="captionStrong"
          tone="muted"
          className="px-1 uppercase tracking-wide"
        >
          {title}
        </Text>
      )}

      <View className="overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map((row, index) => (
          <React.Fragment key={row.title}>
            {index > 0 && <View className="ml-[52px] h-[1px] bg-border" />}
            <SettingsRow {...row} />
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

export default SettingsGroup;
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx jest src/components/__tests__/SettingsGroup.test.tsx 2>&1 | tail -10
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint 2>&1 | tail -3
npx prettier --write src/components/SettingsGroup.tsx src/components/__tests__/SettingsGroup.test.tsx
git add -A
git commit -m "feat(pos-app): add SettingsGroup for the redesigned profile

Heading outside the card, so several groups stack under one scroll view —
which is what ActionList cannot do. ActionList is unchanged.

Rows use Pressable + useDebouncedPress rather than DebouncedPressable: that
component's prop type accepts no accessibility props, and a settings row needs
a role and a disabled state."
```

---

### Task 7: `useMerchantIdentity`

Deliberately simpler than super-app's `useStaffIdentity`. That hook resolves between three roles and four claim sources because super-app serves merchants, refund points and customs from one screen. pos-app is merchant-only, so this reads the affiliation list and the existing `useActivePartyId` and stops.

**Files:**
- Create: `src/screens/(auth)/Profile/useMerchantIdentity.ts`
- Create: `src/screens/(auth)/Profile/__tests__/useMerchantIdentity.test.ts`
- Modify: `src/localization/resources/en-US.json`, `src/localization/resources/tr-TR.json`

**Interfaces:**
- Consumes: `useAffiliation` from `@/providers/AffiliationProvider` (`{ affiliations, selectedAffiliationId, changeAffiliation, switchingPartyId }`), `useActivePartyId` from `@/hooks/useActivePartyId`.
- Produces:
  ```ts
  export interface MerchantIdentity {
    /** The store this account acts for, empty when it cannot be named. */
    organizationName: string;
    affiliationCount: number;
  }
  export function useMerchantIdentity(): MerchantIdentity;
  ```
  Task 8 renders it; Task 10 calls it.

- [ ] **Step 1: Add the identity i18n keys to both locales**

In `src/localization/resources/en-US.json`, inside the existing `"Profile"` object:

```json
    "Role": { "Merchant": "Merchant" },
    "Organization": {
      "Label": "Store",
      "CountSuffix": "stores"
    },
```

In `src/localization/resources/tr-TR.json`, same place:

```json
    "Role": { "Merchant": "Satıcı" },
    "Organization": {
      "Label": "Mağaza",
      "CountSuffix": "mağaza"
    },
```

**Why a bare suffix and not an interpolated string.** `t` is declared and
implemented as `(key: TranslationKey) => string` — a nested lookup with **no
placeholder substitution** (`src/providers/LocalizationProvider.tsx:74`). A key
like `"{count} affiliations"` would render the braces literally. So the caller
composes `` `${count} ${t(...CountSuffix)}` ``, which reads correctly in both
languages: "2 stores", and "2 mağaza" (Turkish takes no plural suffix after a
numeral).

Also worth knowing for every task that adds a key: a **missing** key does not
return empty — `t` falls back to `en-US` and then to the literal string
`"error: <key>"`. A stray `error: MobileApp...` on screen means a key was added
to one locale and not the other, or `npm run init` was skipped.

Then:

```bash
npm run init
```

- [ ] **Step 2: Write the failing test**

Create `src/screens/(auth)/Profile/__tests__/useMerchantIdentity.test.ts`:

```ts
import { renderHook } from "@testing-library/react-native";
import { useMerchantIdentity } from "../useMerchantIdentity";

const mockUseAffiliation = jest.fn();
jest.mock("@/providers/AffiliationProvider", () => ({
  useAffiliation: () => mockUseAffiliation(),
}));

const mockUseActivePartyId = jest.fn();
jest.mock("@/hooks/useActivePartyId", () => ({
  useActivePartyId: (...args: unknown[]) => mockUseActivePartyId(...args),
}));

const affiliation = (partyId: string, partyName: string | null) => ({
  partyId,
  partyName,
  isPrimary: false,
});

describe("useMerchantIdentity", () => {
  beforeEach(() => jest.clearAllMocks());

  it("names the active store", () => {
    mockUseAffiliation.mockReturnValue({
      affiliations: [
        affiliation("party-a", "Ataköy AVM"),
        affiliation("party-b", "Kanyon"),
      ],
      selectedAffiliationId: "party-a",
    });
    mockUseActivePartyId.mockReturnValue("party-a");

    const { result } = renderHook(() => useMerchantIdentity());

    expect(result.current.organizationName).toBe("Ataköy AVM");
    expect(result.current.affiliationCount).toBe(2);
  });

  // Naming the wrong store is worse than naming none: a merchant reads this
  // to confirm which store they are issuing tags for.
  it("names nothing when the active party is not in the list", () => {
    mockUseAffiliation.mockReturnValue({
      affiliations: [affiliation("party-a", "Ataköy AVM")],
      selectedAffiliationId: null,
    });
    mockUseActivePartyId.mockReturnValue("party-z");

    const { result } = renderHook(() => useMerchantIdentity());

    expect(result.current.organizationName).toBe("");
    expect(result.current.affiliationCount).toBe(1);
  });

  it("names nothing when the matched affiliation has no name", () => {
    mockUseAffiliation.mockReturnValue({
      affiliations: [affiliation("party-a", null)],
      selectedAffiliationId: "party-a",
    });
    mockUseActivePartyId.mockReturnValue("party-a");

    const { result } = renderHook(() => useMerchantIdentity());

    expect(result.current.organizationName).toBe("");
  });

  it("survives an empty affiliation list", () => {
    mockUseAffiliation.mockReturnValue({
      affiliations: [],
      selectedAffiliationId: null,
    });
    mockUseActivePartyId.mockReturnValue(null);

    const { result } = renderHook(() => useMerchantIdentity());

    expect(result.current.organizationName).toBe("");
    expect(result.current.affiliationCount).toBe(0);
  });

  // The list's isPrimary is the source of truth, not the JWT claim — the token
  // minted right after a switch still carries the PREVIOUS party. That rule
  // lives in useActivePartyId; this asserts the hook actually defers to it.
  it("reads the active party through useActivePartyId", () => {
    const affiliations = [affiliation("party-a", "Ataköy AVM")];
    mockUseAffiliation.mockReturnValue({
      affiliations,
      selectedAffiliationId: null,
    });
    mockUseActivePartyId.mockReturnValue("party-a");

    renderHook(() => useMerchantIdentity());

    expect(mockUseActivePartyId).toHaveBeenCalledWith(affiliations);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
npx jest "src/screens/(auth)/Profile/__tests__/useMerchantIdentity.test.ts" 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../useMerchantIdentity'`.

- [ ] **Step 4: Write the implementation**

Create `src/screens/(auth)/Profile/useMerchantIdentity.ts`:

```ts
import { useActivePartyId } from "@/hooks/useActivePartyId";
import { useAffiliation } from "@/providers/AffiliationProvider";

export interface MerchantIdentity {
  /** The store this account acts for; empty when it cannot be named. */
  organizationName: string;
  affiliationCount: number;
}

/**
 * Which store this account is acting for, for the Profile hero.
 *
 * Deliberately simpler than super-app's `useStaffIdentity`, which resolves
 * between three roles and four claim sources because one screen there serves
 * merchants, refund points and customs. pos-app is merchant-only and its
 * `JwtUser` carries no party claim but `MerchantId`, so there is nothing to
 * disambiguate.
 *
 * The active party comes from `useActivePartyId`, which reads the list's
 * `isPrimary` rather than the access token: `SetActiveAffiliation` moves
 * `isPrimary` server-side immediately, while the token minted by the refresh
 * straight after a switch still carries the PREVIOUS party's claim.
 *
 * Returns an empty name rather than guessing. A hero row reading
 * "Store —" is worse than no row, because a merchant reads it to confirm which
 * store they are issuing tags for.
 */
export function useMerchantIdentity(): MerchantIdentity {
  const { affiliations } = useAffiliation();
  const activePartyId = useActivePartyId(affiliations);

  const active = affiliations.find(
    (affiliation) => affiliation.partyId === activePartyId,
  );

  return {
    organizationName: active?.partyName ?? "",
    affiliationCount: affiliations.length,
  };
}
```

- [ ] **Step 5: Run to verify it passes**

```bash
npx jest "src/screens/(auth)/Profile/__tests__/useMerchantIdentity.test.ts" 2>&1 | tail -10
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint 2>&1 | tail -3
npx prettier --write "src/screens/(auth)/Profile/useMerchantIdentity.ts" "src/screens/(auth)/Profile/__tests__/useMerchantIdentity.test.ts" src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git add -A
git commit -m "feat(pos-app): add useMerchantIdentity for the profile hero

Reads the active store through useActivePartyId (the list's isPrimary, not the
JWT claim, which lags a switch by one issuance). Returns an empty name rather
than guessing — a hero row naming the wrong store is worse than no row."
```

---

### Task 8: `ProfileHero`

The identity card. Everything sits in normal flow — the outgoing `UserCard` pins its QR button at `absolute right-8 top-4`, a guess at the header's position that Task 3 already invalidated.

**Files:**
- Create: `src/screens/(auth)/Profile/_components/ProfileHero.tsx`
- Create: `src/screens/(auth)/Profile/_components/__tests__/ProfileHero.test.tsx`

**Interfaces:**
- Consumes: `@/store/user` (`useUserStore` → `user.name`, `user.surname`, `user.profilePicture`), `@/components/Image` (default export, props `{ source, width, height, borderRadius?, transition? }`), the existing `./AvatarModal` (`{ sheetRef }`) and `./QrCodeModal` (`{ sheetRef, image }`).
- Produces:
  ```ts
  export type HeroBadgeTone = "success" | "warning" | "neutral";
  export interface HeroBadge { label: string; icon: IoniconsTypes; tone: HeroBadgeTone; detail?: string }
  export interface HeroDetailRow { icon: IoniconsTypes; label: string; value: string; testID?: string }
  export interface ProfileHeroProps {
    badge: HeroBadge;
    detailRow?: HeroDetailRow;
    showQrCode?: boolean;   // default false
    avatarLabel: string;
    qrLabel: string;
  }
  export function ProfileHero(props: ProfileHeroProps): React.JSX.Element;
  ```
  `avatarLabel` / `qrLabel` arrive as props rather than being resolved by a hook, so the component stays usable from inside a sheet — the same rule `PageHeader.backLabel` follows. Task 10 passes `t("MobileApp.Avatar.ProfilePicture")` and `t("MobileApp.QrCode.ProfileCard")`.

- [ ] **Step 1: Write the failing test**

Create `src/screens/(auth)/Profile/_components/__tests__/ProfileHero.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { ProfileHero } from "../ProfileHero";

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

jest.mock("@/components/Image", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ReactLib = require("react");
  const { View } = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    __esModule: true,
    default: () => ReactLib.createElement(View, { testID: "avatar-image" }),
    blurhash: "x",
  };
});

// The two sheets render through a portal and contribute nothing in place.
jest.mock("../AvatarModal", () => ({ AvatarModal: () => null }));
jest.mock("../QrCodeModal", () => ({ QrCodeModal: () => null }));

const mockUser = jest.fn();
jest.mock("@/store/user", () => ({
  __esModule: true,
  default: () => ({ user: mockUser() }),
}));

const badge = {
  label: "Merchant",
  icon: "briefcase-outline" as const,
  tone: "neutral" as const,
};

const labels = { avatarLabel: "Profile Picture", qrLabel: "Profile Card" };

describe("ProfileHero", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.mockReturnValue({
      name: "Ertuğrul",
      surname: "Bakas",
      profilePicture: null,
    });
  });

  it("renders the full name and the role badge", () => {
    render(<ProfileHero badge={badge} {...labels} />);

    expect(screen.getByText("Ertuğrul Bakas")).toBeTruthy();
    expect(screen.getByText("Merchant")).toBeTruthy();
  });

  it("joins around a missing surname without a trailing space", () => {
    mockUser.mockReturnValue({ name: "Ertuğrul", surname: null });

    render(<ProfileHero badge={badge} {...labels} />);

    expect(screen.getByText("Ertuğrul")).toBeTruthy();
  });

  // Only worth saying when there is more than one, in which case *which* one
  // is active is the thing the reader is checking.
  it("shows the badge detail when given one", () => {
    render(
      <ProfileHero badge={{ ...badge, detail: "2 affiliations" }} {...labels} />,
    );

    expect(screen.getByText("2 affiliations")).toBeTruthy();
  });

  it("renders the detail row when the store can be named", () => {
    render(
      <ProfileHero
        badge={badge}
        detailRow={{
          icon: "business-outline",
          label: "Store",
          value: "Ataköy AVM",
          testID: "hero-organization",
        }}
        {...labels}
      />,
    );

    expect(screen.getByTestId("hero-organization")).toBeTruthy();
    expect(screen.getByText("Ataköy AVM")).toBeTruthy();
  });

  it("omits the detail row entirely when not given one", () => {
    render(<ProfileHero badge={badge} {...labels} />);

    expect(screen.queryByTestId("hero-organization")).toBeNull();
  });

  it("withholds the QR control by default", () => {
    render(<ProfileHero badge={badge} {...labels} />);

    expect(screen.queryByTestId("profile-hero-qr")).toBeNull();
  });

  it("offers the QR control under showQrCode", () => {
    render(<ProfileHero badge={badge} showQrCode {...labels} />);

    expect(screen.getByTestId("profile-hero-qr")).toBeTruthy();
  });

  it("labels the avatar control from its prop", () => {
    render(<ProfileHero badge={badge} {...labels} />);

    expect(screen.getByLabelText("Profile Picture")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest "src/screens/(auth)/Profile/_components/__tests__/ProfileHero.test.tsx" 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../ProfileHero'`.

- [ ] **Step 3: Write the implementation**

Create `src/screens/(auth)/Profile/_components/ProfileHero.tsx`:

```tsx
import Image from "@/components/Image";
import { Ionicons, type IoniconsTypes } from "@/components/Ionicons";
import { Text } from "@/components/ui";
import useUserStore from "@/store/user";
import { cn } from "@/utils/cn";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import React, { useRef } from "react";
import { Pressable, View } from "react-native";
import { AvatarModal } from "./AvatarModal";
import { QrCodeModal } from "./QrCodeModal";

/** How a badge reads: an assurance, a warning, or a plain statement of fact. */
export type HeroBadgeTone = "success" | "warning" | "neutral";

export interface HeroBadge {
  label: string;
  icon: IoniconsTypes;
  tone: HeroBadgeTone;
  /** Secondary text after a separator dot — a qualifier on the badge. */
  detail?: string;
}

export interface HeroDetailRow {
  icon: IoniconsTypes;
  /** What the value is — the store. */
  label: string;
  /** The value itself, emphasised over the label. */
  value: string;
  testID?: string;
}

export interface ProfileHeroProps {
  badge: HeroBadge;
  detailRow?: HeroDetailRow;
  showQrCode?: boolean;
  /**
   * Accessibility labels arrive as props rather than from `useLocalization`,
   * so this stays correct if it is ever rendered inside a `<BottomSheet>` —
   * a hook there loses its context and `t` silently returns "".
   */
  avatarLabel: string;
  qrLabel: string;
}

const BADGE_TEXT: Record<HeroBadgeTone, string> = {
  success: "text-success",
  warning: "text-warning",
  neutral: "text-muted",
};

/**
 * The identity card at the top of Profile: who the account is, a badge saying
 * how it stands, and the store it currently acts for.
 *
 * Presentational — what the badge *means* belongs to the caller. Replaces
 * `UserCard`, which pinned its QR button at `absolute right-8 top-4`, a guess
 * at the header's position that any change to the header breaks. Everything
 * here is in normal flow.
 */
export function ProfileHero({
  badge,
  detailRow,
  showQrCode = false,
  avatarLabel,
  qrLabel,
}: ProfileHeroProps) {
  const { user } = useUserStore();
  const qrRef = useRef<BottomSheetModal>(null);
  const avatarRef = useRef<BottomSheetModal>(null);

  const fullName = [user?.name, user?.surname].filter(Boolean).join(" ");

  return (
    <View className="gap-4 rounded-3xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-3">
        <Pressable
          testID="profile-hero-avatar"
          onPress={() => avatarRef.current?.present()}
          accessibilityRole="button"
          accessibilityLabel={avatarLabel}
          className="relative"
        >
          <Image source={user?.profilePicture} width={64} height={64} />
          <View className="absolute -bottom-1 -right-1 rounded-full border border-border bg-card p-1">
            <Ionicons name="camera" size={14} className="text-foreground" />
          </View>
        </Pressable>

        <View className="flex-1 gap-1">
          <Text
            variant="subheading"
            numberOfLines={1}
            // The name comes from the account, so it can be long enough to
            // push the badge below out of the row if it were allowed to.
            ellipsizeMode="tail"
          >
            {fullName}
          </Text>

          <View className="flex-row items-center gap-1.5">
            <Ionicons
              name={badge.icon}
              size={14}
              className={BADGE_TEXT[badge.tone]}
            />
            <Text
              variant="captionStrong"
              className={cn(BADGE_TEXT[badge.tone])}
              numberOfLines={1}
            >
              {badge.label}
            </Text>
            {badge.detail && (
              <>
                <Text variant="caption" tone="muted">
                  ·
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {badge.detail}
                </Text>
              </>
            )}
          </View>
        </View>

        {showQrCode && (
          <Pressable
            testID="profile-hero-qr"
            onPress={() => qrRef.current?.present()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={qrLabel}
            className="size-10 items-center justify-center rounded-full bg-foreground/5 active:bg-foreground/10"
          >
            <Ionicons name="qr-code" size={20} className="text-foreground" />
          </Pressable>
        )}
      </View>

      {detailRow && (
        <View
          testID={detailRow.testID ?? "profile-hero-detail"}
          className="flex-row items-center gap-2 rounded-xl bg-foreground/5 px-3 py-2.5"
        >
          <Ionicons name={detailRow.icon} size={16} className="text-muted" />
          <Text variant="label" tone="muted" numberOfLines={1}>
            {detailRow.label}
          </Text>
          <Text
            variant="labelStrong"
            className="flex-1 text-right"
            numberOfLines={1}
          >
            {detailRow.value}
          </Text>
        </View>
      )}

      <QrCodeModal sheetRef={qrRef} image={user?.profilePicture || ""} />
      <AvatarModal sheetRef={avatarRef} />
    </View>
  );
}

export default ProfileHero;
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx jest "src/screens/(auth)/Profile/_components/__tests__/ProfileHero.test.tsx" 2>&1 | tail -10
```

Expected: PASS, 8 tests.

If the `QrCodeModal` import fails to resolve as a named export, open `src/screens/(auth)/Profile/_components/QrCodeModal.tsx` and match its actual export shape — same for `AvatarModal`. Adjust both the component and the test mocks together.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint 2>&1 | tail -3
npx prettier --write "src/screens/(auth)/Profile/_components/ProfileHero.tsx" "src/screens/(auth)/Profile/_components/__tests__/ProfileHero.test.tsx"
git add -A
git commit -m "feat(pos-app): add ProfileHero, the identity card

Everything in normal flow, unlike UserCard's absolutely-positioned QR button.
Accessibility labels arrive as props so the card stays correct if it is ever
rendered inside a sheet."
```

---

### Task 9: `StoreSwitcherPill`

The header trigger. Renders `null` when there is nothing to switch to — a control that can only reopen the store you are already on is furniture.

**Files:**
- Create: `src/components/StoreSwitcherPill.tsx`
- Create: `src/components/__tests__/StoreSwitcherPill.test.tsx`

**Interfaces:**
- Consumes: `useStoreSwitcher` from `@/providers/StoreSwitcherProvider` → `{ canSwitch: boolean; activePartyName?: string; open: () => void }`. The provider is already mounted once for the whole `(auth)` group.
- Produces:
  ```ts
  export interface StoreSwitcherPillProps { label: string }
  export function StoreSwitcherPill(props: StoreSwitcherPillProps): React.JSX.Element | null;
  ```
  Task 10 passes `t("MobileApp.MerchantSwitch.Title")` and renders it as `headerRightComponent`.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/StoreSwitcherPill.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { StoreSwitcherPill } from "../StoreSwitcherPill";

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

const mockSwitcher = jest.fn();
jest.mock("@/providers/StoreSwitcherProvider", () => ({
  useStoreSwitcher: () => mockSwitcher(),
}));

describe("StoreSwitcherPill", () => {
  beforeEach(() => jest.clearAllMocks());

  // A switcher that can only reopen the store you are already on is furniture.
  it("renders nothing with a single affiliation", () => {
    mockSwitcher.mockReturnValue({
      canSwitch: false,
      activePartyName: "Ataköy AVM",
      open: jest.fn(),
    });

    render(<StoreSwitcherPill label="Switch merchant" />);

    expect(screen.queryByTestId("open-store-switcher")).toBeNull();
  });

  it("names the active store when there is more than one", () => {
    mockSwitcher.mockReturnValue({
      canSwitch: true,
      activePartyName: "Ataköy AVM",
      open: jest.fn(),
    });

    render(<StoreSwitcherPill label="Switch merchant" />);

    expect(screen.getByTestId("open-store-switcher")).toBeTruthy();
    expect(screen.getByText("Ataköy AVM")).toBeTruthy();
  });

  it("opens the switcher sheet on press", () => {
    const open = jest.fn();
    mockSwitcher.mockReturnValue({
      canSwitch: true,
      activePartyName: "Ataköy AVM",
      open,
    });

    render(<StoreSwitcherPill label="Switch merchant" />);
    fireEvent.press(screen.getByTestId("open-store-switcher"));

    expect(open).toHaveBeenCalledTimes(1);
  });

  // The list has not landed yet: the control still works, it just has no name
  // to show, and must not render an empty text node where one would be.
  it("still renders before the affiliation list arrives", () => {
    mockSwitcher.mockReturnValue({
      canSwitch: true,
      activePartyName: undefined,
      open: jest.fn(),
    });

    render(<StoreSwitcherPill label="Switch merchant" />);

    expect(screen.getByTestId("open-store-switcher")).toBeTruthy();
    expect(screen.getByLabelText("Switch merchant")).toBeTruthy();
  });

  it("names the store in the accessibility label when known", () => {
    mockSwitcher.mockReturnValue({
      canSwitch: true,
      activePartyName: "Kanyon",
      open: jest.fn(),
    });

    render(<StoreSwitcherPill label="Switch merchant" />);

    expect(screen.getByLabelText("Switch merchant: Kanyon")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest src/components/__tests__/StoreSwitcherPill.test.tsx 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../StoreSwitcherPill'`.

- [ ] **Step 3: Write the implementation**

Create `src/components/StoreSwitcherPill.tsx`:

```tsx
import { Ionicons } from "@/components/Ionicons";
import { Text } from "@/components/ui";
import { useDebouncedPress } from "@/hooks/useDebouncedPress";
import { useStoreSwitcher } from "@/providers/StoreSwitcherProvider";
import React from "react";
import { Pressable } from "react-native";

export interface StoreSwitcherPillProps {
  /**
   * The switcher's title, resolved by the caller. A prop rather than a hook
   * call so the pill is safe to render from a sheet's subtree.
   */
  label: string;
}

/**
 * Opens the store switcher from a page header.
 *
 * A bordered pill, matching the back control `PageHeader` already draws, so
 * the store name reads as a button and not as a second title. Capped at
 * `max-w-40` because the title beside it is the `flex-1` column: an uncapped
 * store name would shrink the *title* rather than itself.
 *
 * Renders nothing when there is only one affiliation. Only Profile passes this
 * — a cashier mid-sale must not be one mis-tap from swapping stores.
 */
export function StoreSwitcherPill({ label }: StoreSwitcherPillProps) {
  const { canSwitch, activePartyName, open } = useStoreSwitcher();
  const handlePress = useDebouncedPress(open);

  if (!canSwitch) return null;

  return (
    <Pressable
      testID="open-store-switcher"
      accessibilityRole="button"
      accessibilityLabel={
        activePartyName ? `${label}: ${activePartyName}` : label
      }
      className="border border-border rounded-full h-10 max-w-40 flex-row items-center gap-1.5 px-3"
      onPress={handlePress}
    >
      <Ionicons name="swap-horizontal" size={18} className="text-foreground" />
      {!!activePartyName && (
        <Text variant="label" className="shrink" numberOfLines={1}>
          {activePartyName}
        </Text>
      )}
    </Pressable>
  );
}

export default StoreSwitcherPill;
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx jest src/components/__tests__/StoreSwitcherPill.test.tsx 2>&1 | tail -10
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint 2>&1 | tail -3
npx prettier --write src/components/StoreSwitcherPill.tsx src/components/__tests__/StoreSwitcherPill.test.tsx
git add -A
git commit -m "feat(pos-app): add StoreSwitcherPill for the page header

Bordered pill matching PageHeader's back control, capped at max-w-40 so a long
store name shrinks itself rather than the title. Null with one affiliation."
```

---

### Task 10: Reassemble `ProfileScreen`

Wires Tasks 6-9 together and retires `UserCard`.

**Files:**
- Modify: `src/screens/(auth)/Profile/ProfileScreen.tsx`
- Create: `src/screens/(auth)/Profile/__tests__/ProfileScreen.test.tsx`
- Delete: `src/screens/(auth)/Profile/_components/UserCard.tsx`
- Modify: `src/localization/resources/en-US.json`, `src/localization/resources/tr-TR.json`

**Interfaces:**
- Consumes: `SettingsGroup` + `SettingsRowProps` (Task 6), `useMerchantIdentity` (Task 7), `ProfileHero` + `HeroBadge` + `HeroDetailRow` (Task 8), `StoreSwitcherPill` (Task 9), `PageHeader` via `ModalTemplate`'s `headerRightComponent` (Task 3).
- Produces: the finished screen. Nothing consumes it.

- [ ] **Step 1: Add the group-heading keys to both locales**

In `src/localization/resources/en-US.json`, inside `"Profile"` (beside the `Role`/`Organization` objects added in Task 7):

```json
    "Group": {
      "Account": "Account",
      "App": "App",
      "Device": "Device"
    },
```

In `src/localization/resources/tr-TR.json`:

```json
    "Group": {
      "Account": "Hesap",
      "App": "Uygulama",
      "Device": "Cihaz"
    },
```

Then:

```bash
npm run init
```

- [ ] **Step 2: Write the failing test**

Create `src/screens/(auth)/Profile/__tests__/ProfileScreen.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ProfileScreen from "../ProfileScreen";

const metrics = {
  insets: { top: 47, bottom: 34, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

jest.mock("expo-router", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ReactLib = require("react");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    router: { push: jest.fn(), back: jest.fn() },
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void | (() => void)) =>
      ReactLib.useEffect(cb, [cb]),
  };
});

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

// `t` echoes the key, so the assertions below name what they mean.
jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({
    t: (key: string) => key,
    activeLocale: "en-US",
  }),
}));

jest.mock("@/providers/SessionProvider", () => ({
  useSession: () => ({ signOut: jest.fn() }),
}));

const mockSwitcher = jest.fn();
jest.mock("@/providers/StoreSwitcherProvider", () => ({
  useStoreSwitcher: () => mockSwitcher(),
}));

const mockIdentity = jest.fn();
jest.mock("../useMerchantIdentity", () => ({
  useMerchantIdentity: () => mockIdentity(),
}));

jest.mock("@/store/user", () => ({
  __esModule: true,
  default: () => ({ user: { name: "Ertuğrul", surname: "Bakas" } }),
}));

jest.mock("@/components/Image", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ReactLib = require("react");
  const { View } = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    __esModule: true,
    default: () => ReactLib.createElement(View, { testID: "avatar-image" }),
    blurhash: "x",
  };
});

jest.mock("../_components/AvatarModal", () => ({ AvatarModal: () => null }));
jest.mock("../_components/QrCodeModal", () => ({ QrCodeModal: () => null }));
jest.mock("../_components/PrinterModal", () => ({ PrinterModal: () => null }));

jest.mock("@gorhom/bottom-sheet", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ReactLib = require("react");
  const { View } = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  const Modal = ReactLib.forwardRef(
    ({ children }: { children: React.ReactNode }, ref: any) => {
      ReactLib.useImperativeHandle(ref, () => ({
        present: jest.fn(),
        dismiss: jest.fn(),
      }));
      return ReactLib.createElement(View, null, children);
    },
  );
  return {
    __esModule: true,
    BottomSheetModal: Modal,
    BottomSheetView: View,
    BottomSheetBackdrop: View,
  };
});

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ProfileScreen />
    </SafeAreaProvider>,
  );

describe("ProfileScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSwitcher.mockReturnValue({
      canSwitch: false,
      activePartyName: undefined,
      open: jest.fn(),
    });
    mockIdentity.mockReturnValue({
      organizationName: "Ataköy AVM",
      affiliationCount: 1,
    });
  });

  it("renders the three labelled groups", () => {
    renderScreen();

    expect(screen.getByText("MobileApp.Profile.Group.Account")).toBeTruthy();
    expect(screen.getByText("MobileApp.Profile.Group.App")).toBeTruthy();
    expect(screen.getByText("MobileApp.Profile.Group.Device")).toBeTruthy();
  });

  it("lists the rows each group owns", () => {
    renderScreen();

    expect(screen.getByText("MobileApp.Profile.Personal Info")).toBeTruthy();
    expect(screen.getByText("MobileApp.Profile.App Language")).toBeTruthy();
    expect(screen.getByText("MobileApp.Profile.DeviceSettings")).toBeTruthy();
    expect(screen.getByText("MobileApp.Profile.PrinterSettings")).toBeTruthy();
    expect(screen.getByText("MobileApp.Profile.Logout")).toBeTruthy();
  });

  // The switcher moved to the header; a duplicate row would be two controls
  // that could disagree.
  it("no longer lists the store switcher as a row", () => {
    mockSwitcher.mockReturnValue({
      canSwitch: true,
      activePartyName: "Ataköy AVM",
      open: jest.fn(),
    });

    renderScreen();

    expect(screen.queryByText("MobileApp.MerchantSwitch.Title")).toBeNull();
  });

  it("withholds the header pill with a single affiliation", () => {
    renderScreen();

    expect(screen.queryByTestId("open-store-switcher")).toBeNull();
  });

  it("puts the switcher in the header when there is more than one store", () => {
    mockSwitcher.mockReturnValue({
      canSwitch: true,
      activePartyName: "Ataköy AVM",
      open: jest.fn(),
    });
    mockIdentity.mockReturnValue({
      organizationName: "Ataköy AVM",
      affiliationCount: 2,
    });

    renderScreen();

    expect(screen.getByTestId("open-store-switcher")).toBeTruthy();
  });

  it("names the store in the hero", () => {
    renderScreen();

    expect(screen.getByTestId("profile-hero-organization")).toBeTruthy();
  });

  it("omits the hero's store row when it cannot be named", () => {
    mockIdentity.mockReturnValue({
      organizationName: "",
      affiliationCount: 0,
    });

    renderScreen();

    expect(screen.queryByTestId("profile-hero-organization")).toBeNull();
  });

  it("carries a back arrow, since Profile is a pushed screen", () => {
    renderScreen();

    expect(screen.getByTestId("icon-arrow-back")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
npx jest "src/screens/(auth)/Profile/__tests__/ProfileScreen.test.tsx" 2>&1 | tail -20
```

Expected: FAIL — the group headings don't exist yet; the screen still renders `UserCard` and `ActionList`.

- [ ] **Step 4: Rewrite the screen**

Replace the whole of `src/screens/(auth)/Profile/ProfileScreen.tsx` with:

```tsx
import AppVersion from "@/components/AppVersion";
import { SettingsGroup, type SettingsRowProps } from "@/components/SettingsGroup";
import { StoreSwitcherPill } from "@/components/StoreSwitcherPill";
import { useGuardedNavigation } from "@/hooks/useGuardedNavigation";
import { locales } from "@/localization/config";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useSession } from "@/providers/SessionProvider";
import { ModalTemplate } from "@/templates/Modal";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef } from "react";
import { ScrollView } from "react-native";
import { PrinterModal } from "./_components/PrinterModal";
import {
  ProfileHero,
  type HeroBadge,
  type HeroDetailRow,
} from "./_components/ProfileHero";
import { useMerchantIdentity } from "./useMerchantIdentity";

export default function ProfileScreen() {
  const { showPrinterModal } = useLocalSearchParams();
  const { signOut } = useSession();
  const { t, activeLocale } = useLocalization();
  const guardNav = useGuardedNavigation();
  const identity = useMerchantIdentity();
  const sheetRef = useRef<BottomSheetModal>(null);

  const badge: HeroBadge = {
    label: t("MobileApp.Profile.Role.Merchant"),
    icon: "briefcase-outline",
    // Neutral, not success: the badge reports which role the account holds, and
    // a green tick would read as an assurance about the account's standing that
    // nothing here has actually checked.
    tone: "neutral",
    // Only worth saying when there is more than one, in which case *which* one
    // is active is the thing the reader is checking.
    // `t` does no interpolation (see Task 7), so the count is composed here.
    detail:
      identity.affiliationCount > 1
        ? `${identity.affiliationCount} ${t("MobileApp.Profile.Organization.CountSuffix")}`
        : undefined,
  };

  // Omitted entirely when the store cannot be named — see `useMerchantIdentity`.
  // A row reading "Store —" would be worse than no row.
  const detailRow: HeroDetailRow | undefined = identity.organizationName
    ? {
        icon: "business-outline",
        label: t("MobileApp.Profile.Organization.Label"),
        value: identity.organizationName,
        testID: "profile-hero-organization",
      }
    : undefined;

  const accountRows: SettingsRowProps[] = [
    {
      title: t("MobileApp.Profile.Personal Info"),
      icon: "person-outline",
      onPress: () => guardNav(() => router.push("/(auth)/profile/edit-profile")),
    },
  ];

  const appRows: SettingsRowProps[] = [
    {
      title: t("MobileApp.Profile.App Language"),
      icon: "language-outline",
      // The language's own name, so the row reads correctly whichever locale
      // is active — "English" in English, "Türkçe" in Turkish.
      value: locales[activeLocale].nativeName,
      onPress: () => guardNav(() => router.push("/(modals)/language-selector")),
    },
  ];

  const deviceRows: SettingsRowProps[] = [
    {
      title: t("MobileApp.Profile.DeviceSettings"),
      icon: "phone-portrait-outline",
      onPress: () => guardNav(() => router.push("/(auth)/device-settings")),
    },
    {
      title: t("MobileApp.Profile.PrinterSettings"),
      icon: "print-outline",
      onPress: () => sheetRef.current?.present(),
    },
  ];

  const sessionRows: SettingsRowProps[] = [
    {
      title: t("MobileApp.Profile.Logout"),
      icon: "log-out-outline",
      destructive: true,
      onPress: () => void signOut(),
    },
  ];

  useEffect(() => {
    if (showPrinterModal === "true") {
      sheetRef.current?.present();
    }
  }, [showPrinterModal]);

  return (
    <ModalTemplate
      title={t("MobileApp.Profile.Title")}
      headerRightComponent={
        <StoreSwitcherPill label={t("MobileApp.MerchantSwitch.Title")} />
      }
      noScroll
    >
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-4 pb-4"
      >
        <ProfileHero
          badge={badge}
          detailRow={detailRow}
          showQrCode
          avatarLabel={t("MobileApp.Avatar.ProfilePicture")}
          qrLabel={t("MobileApp.QrCode.ProfileCard")}
        />

        <SettingsGroup
          title={t("MobileApp.Profile.Group.Account")}
          rows={accountRows}
        />
        <SettingsGroup
          title={t("MobileApp.Profile.Group.App")}
          rows={appRows}
        />
        <SettingsGroup
          title={t("MobileApp.Profile.Group.Device")}
          rows={deviceRows}
        />
        <SettingsGroup rows={sessionRows} />

        <AppVersion />
      </ScrollView>

      <PrinterModal sheetRef={sheetRef} />
    </ModalTemplate>
  );
}
```

**Note:** `locales` is exported from `@/localization/config` keyed by locale code, each entry carrying `nativeName` (`"English"`, `"Türkçe"`), so `locales[activeLocale].nativeName` resolves. `useGuardedNavigation` lives at `src/hooks/useGuardedNavigation.tsx`. `AvatarModal`, `QrCodeModal` and `PrinterModal` are all **named** exports — the imports above match.

- [ ] **Step 5: Delete `UserCard`**

```bash
grep -rn "UserCard" --include=*.tsx src/
```

Expected: no hits outside `UserCard.tsx` itself, now that the screen no longer imports it. Then:

```bash
git rm "src/screens/(auth)/Profile/_components/UserCard.tsx"
```

- [ ] **Step 6: Run the screen test**

```bash
npx jest "src/screens/(auth)/Profile/__tests__/ProfileScreen.test.tsx" 2>&1 | tail -20
```

Expected: PASS, 8 tests.

- [ ] **Step 7: Run the full suite and every gate**

```bash
npm run init && npm run typecheck && npm test 2>&1 | tail -8 && npm run lint 2>&1 | tail -3
```

Expected: typecheck clean, all suites pass, lint at 0 errors and no more than 34 warnings.

- [ ] **Step 8: Commit**

```bash
npx prettier --write "src/screens/(auth)/Profile/ProfileScreen.tsx" "src/screens/(auth)/Profile/__tests__/ProfileScreen.test.tsx" src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git add -A
git commit -m "feat(pos-app): rebuild Profile around ProfileHero and SettingsGroup

Account / App / Device / sign-out groups under an identity card, with the
store switcher as a header pill rather than a menu row. UserCard is deleted —
this screen was its only consumer."
```

---

### Task 11: Final verification

No new code. This is the pass that catches what task-by-task green suites miss.

- [ ] **Step 1: Confirm the gates against the recorded baseline**

```bash
cd /c/unirefund/pos-app
npm run init
npm run typecheck
npm test 2>&1 | tail -8
npm run lint 2>&1 | tail -3
```

Expected: typecheck **0 errors**; lint **0 errors**, warnings ≤ 34; tests all passing.

Suite count should be **71**: 67 at baseline, minus 2 deleted (`CardReaderScreen.test.tsx`, `TabPage.test.tsx`), plus 6 new (`PageHeader`, `SettingsGroup`, `StoreSwitcherPill`, `ProfileHero`, `useMerchantIdentity`, `ProfileScreen`). Recompute from the baseline **you actually recorded in Task 1** rather than trusting this number — `AGENTS.md` notes a previous entry claimed 441 when the real count was 442. Reconcile any difference before proceeding; an unexplained drop means a suite stopped being collected, which looks identical to a suite passing.

- [ ] **Step 2: Confirm the Card Reader machinery survived**

```bash
npx jest RefundCardScanModal useCardReader useCardCapabilities cardCapabilities 2>&1 | tail -8
```

Expected: all pass. This is the regression that would ship a POS terminal unable to scan a refund card.

- [ ] **Step 3: Confirm no dangling references**

```bash
grep -rn "CardReaderScreen\|templates/TabPage\|AffilationSwitch\|Profile/_components/UserCard" --include=*.ts --include=*.tsx src/
```

Expected: **no output**.

- [ ] **Step 4: Confirm every screen that should have an arrow has one**

```bash
grep -rn "showBack" --include=*.tsx src/screens/
```

Expected: exactly two hits, both `showBack={false}` — `LoginScreen.tsx` and `RegisterScreen.tsx`. Any other screen opting out is a deviation from the spec and must be justified or reverted.

- [ ] **Step 5: Confirm the locale files still parse as UTF-8 JSON**

```bash
PYTHONIOENCODING=utf-8 python -c "
import json,sys
for f in ['en-US','tr-TR']:
    d=json.load(open('src/localization/resources/%s.json'%f,encoding='utf-8'))
    p=d['Profile']
    sys.stdout.write(f+' Group='+json.dumps(p['Group'],ensure_ascii=False)+' Role='+json.dumps(p['Role'],ensure_ascii=False)+chr(10))
    sys.stdout.write(f+' Back='+json.dumps(d['Common']['Back'],ensure_ascii=False)+chr(10))
    assert 'CardReader' not in d, 'CardReader block survived in '+f
    assert 'CardReader' not in d['Home'], 'Home.CardReader survived in '+f
"
```

Expected: both locales print their groups with Turkish characters **intact** (`Satıcı`, `Mağaza`, `Geri dön`), and both assertions pass. Mangled characters here mean a non-UTF-8 write somewhere upstream — fix it before merging.

- [ ] **Step 6: Report**

Report the final numbers against the Task 1 baseline: suites, tests, typecheck errors, lint errors and warnings. **Do not claim completion without pasting the actual command output.** If anything regressed, say so plainly rather than describing the change as done.

---

## Self-Review

**Spec coverage.** Every section maps to a task: Card Reader removal → 1; `PageHeader` → 2; `ModalTemplate` consumes it + opt-outs → 3; `TabPage` deleted → 4; Connected Devices entry points + `AffilationSwitch` → 5; `SettingsGroup` → 6; `useMerchantIdentity` → 7; `ProfileHero` → 8; `StoreSwitcherPill` → 9; Profile assembly + `UserCard` deletion + `Group.*` keys → 10; gates → 11. The spec's "Out of scope" items (`FaqScreen`, `HomeScreen`, the two `Input`s, sheet migration) have no task, correctly.

**Type consistency.** `SettingsRowProps` is defined in Task 6 and consumed by that exact name in Task 10. `HeroBadge` / `HeroDetailRow` are defined in Task 8 and consumed in Task 10. `MerchantIdentity` returns `{ organizationName, affiliationCount }` in Task 7 and is destructured by those names in Task 10. `StoreSwitcherPillProps.label` in Task 9 matches Task 10's call. `PageHeaderProps.backDisabled` in Task 2 is what Task 3 maps `busy` onto.

**Two assumptions checked against the source and corrected before this plan was finalised**, rather than left for the implementer to hit:

1. **`t` does no interpolation.** Declared *and implemented* as `(key: TranslationKey) => string` — a nested lookup with no placeholder substitution. An `"{count} affiliations"` key would have rendered the braces literally. Task 7 now ships a bare `CountSuffix` and Task 10 composes the count. Related: a missing key returns `"error: <key>"`, not `""`, so a one-locale key addition is visible on screen rather than silent.
2. **`DebouncedPressable` accepts no accessibility props.** Its prop type is a closed interface without `accessibilityRole` / `accessibilityState`, so the first draft of `SettingsRow` would not have typechecked. Task 6 now uses `Pressable` + `useDebouncedPress` directly — the same debounce, without touching a shared component.

**Verified as correct, so no task needs to discover them:** `locales[activeLocale].nativeName` resolves (`"English"` / `"Türkçe"`); `useGuardedNavigation` is at `src/hooks/useGuardedNavigation.tsx`; `AvatarModal` / `QrCodeModal` / `PrinterModal` are named exports; `UserProfile` really does carry `name` and `surname` (via `Volo_Abp_Account_ProfileDto`), so `ProfileHero`'s name join is not porting a latent bug.

**One risk that remains, by design.** Task 3 flips a default that changes nine screens at once without editing them. That is the point — but it is also why Task 3 is its own task with its own review gate, and why Task 11 Step 4 greps for stray `showBack` opt-outs.
