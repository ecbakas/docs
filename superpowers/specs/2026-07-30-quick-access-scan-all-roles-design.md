# Design: Quick access is Scan QR for every role

**Date:** 2026-07-30
**Repo:** `super-app` (branch `main`)
**Scope:** mobile only. No backend, no web, no SDK regeneration.

## Goal

The prominent centre slot of the tab bar — the raised red circle, the app's one piece of quick access — must launch the QR scanner for all three roles: traveller, refund point, merchant. Today it does so for two of them.

## What is true today

The centre slot is registered as the `explore` `Tabs.Screen` in `src/app/(auth)/_layout.tsx`. A flag decides what pressing it does:

```ts
const scansFromCenterTab = isTraveller || isMerchant;
```

| Role | Centre slot | Scan reachable from |
| --- | --- | --- |
| Traveller | Scan QR (`tabPress` intercepted, camera opens) | centre slot |
| Merchant | Scan QR (`tabPress` intercepted, camera opens) | centre slot |
| Refund point | Explore map (navigates to `/(auth)/explore`) | `ScanEntry` card on Home |

So a refund point — whose entire job at the counter is reading a traveller's tag or a sticker book — reaches the camera one level deeper than anyone else, while the slot built for the highest-frequency action holds a storefront map they have no use for.

Scanning is already correct for refund points once they get there: `useQrScanLauncher` reads `isStaff` for its prompt copy, and `useScanRouting` / `scanDestination` already branch on `isStaff` for the destination. **No routing or scanner behaviour changes in this design** — only which surface launches it.

## Decisions (agreed with user)

1. **The centre slot is unconditionally Scan QR.** `scansFromCenterTab` is deleted rather than extended, because with all three roles scanning there is nothing left to branch on.
2. **Explore is dropped for refund points.** It keeps no entry point for them — the same position merchants have been in, and the existing code comment already says merchants have no use for it. The screen stays registered and reachable by push from traveller Home.
3. **`ScanEntry` is deleted.** Refund-point Home was its only consumer, and Home duplicating the centre slot is precisely what traveller and merchant Home already avoid.
4. **Refund-point Home keeps only its placeholder.** It reduces to the centred `MobileApp.Home.RefundPointPlaceholder` string. Giving it real content — the `LatestTag` hero card the other two roles have — is a separate change, deliberately not bundled here.
5. **Approach: reuse the existing carrier route.** The centre button stays bolted to the `explore` `Tabs.Screen`.

### Why the slot keeps the name `explore`

expo-router has no route-less tab: every tab-bar item is a `Tabs.Screen`, so the button needs some route behind it. Two alternatives were considered and rejected:

- **A dedicated `(auth)/scan.tsx`** would name the slot honestly, at the cost of a screen whose only purpose is to never render, a deep-link guard for `/scan`, and a typed-routes regeneration.
- **A custom `tabBarButton`** in place of `tabPress` + `preventDefault` would fire no navigation event at all, but `preventDefault` already works correctly for two of three roles, so this is churn with no defect behind it.

`explore` is the route already doing this job. It stays, with a comment saying so, and remains a real screen — just one reached by push rather than by pressing its own tab.

## Changes

### `src/app/(auth)/_layout.tsx`

`TabRoutes` loses the `isMerchant` prop and the `isTraveller` local; both existed only to compute `scansFromCenterTab`. `isStaff` stays — the profile long-press and `SwitchAffilationSheet` need it. `TabLayout` still reads `isMerchant` from the store for its own `isStaff`.

The `explore` screen becomes unconditional:

```tsx
<Tabs.Screen
  name="explore"
  listeners={{
    // The centre slot is a scan action for every role, so it never navigates
    // to the map it is named after. Travellers reach Explore by push from
    // Home; nobody else has an entry point.
    tabPress: (e) => {
      e.preventDefault();
      scan.open();
    },
  }}
  options={{
    title: t("MobileApp.Qr.ScanButton"),
    tabBarLabel: () => null,
    tabBarIcon: () => (
      <View className="bg-primary rounded-full p-2 w-16 h-16 items-center justify-center -mt-6 elevation-sm ">
        <Ionicons size={32} name="qr-code-outline" color="#fff" />
      </View>
    ),
  }}
/>
```

`QrScanner` at the end of `TabRoutes` mounts unconditionally, no longer gated on `scansFromCenterTab`.

The comment currently at lines 66-68 is rewritten: scanning is the highest-frequency action for every role, so it owns the prominent slot outright.

### `src/screens/refund-point/Home/HomeScreen.tsx`

Drop the `ScanEntry` import and element. With only the centred placeholder left, the redundant `<View className="flex-1">` wrapper collapses into the centring view.

### `src/screens/shared/_components/ScanEntry.tsx`

Deleted.

## Deliberately not changed

- **`useQrScanLauncher`, `useScanRouting`, `scanDestination`, `QrScanner`** — role-correct already. A refund point pressing the new centre slot gets the staff subtitle and the staff destinations because that logic keys off `isStaff`, not off which surface opened the camera.
- **Pre-login scan surfaces** — `SeamScanPill` on the role gate and the button on `TravellerLoginScreen` already offer scanning before a role exists. Untouched.
- **The `explore` screen itself** — `ExploreScreen` and the traveller Home card that pushes to it are unchanged.
- **`MobileApp.Navigation.Explore`** becomes orphaned when the title ternary collapses (`ExploreScreen` renders `MobileApp.Explore.Title` instead). Left in `src/localization/resources/*.json`: an unused key costs nothing, and removing it would mean a `npm run init` regeneration for no behavioural gain.

## Localization

None. `MobileApp.Qr.ScanButton`, `MobileApp.Qr.ScanTitle` and `MobileApp.Qr.ScanTagSubtitleStaff` all exist and are already rendered for the other roles through the same components. No `npm run init`.

## Testing

**No new tests.** Two reasons, and the second is a hard limit rather than a judgement call:

1. The change adds no pure logic — it deletes a boolean and a component. The logic worth asserting (`scanDestination`, `classifyScan`) already has coverage under `src/utils/qr/__tests__/` and is untouched, so those suites staying green is the regression signal.
2. A component test over the tab layout is not currently possible in this repo. `@testing-library/react-native` fails to load under the jest config — it cannot resolve `react-native`, and every test file that imports it dies at import.

### Baseline, measured

`AGENTS.md` claims the project has no automated suite. That is stale, but the true state is not "green" either:

```
Test Suites: 4 failed, 15 passed, 19 total
Tests:       218 passed, 218 total
```

The 4 failures are `src/components/__tests__/{BottomSheet,Button,DebouncedPressable,Toast}.test.tsx` — all four fail at the `@testing-library/react-native` import, before running an assertion. The 15 passing suites are entirely pure-logic modules. **This is the pre-existing baseline; this change must not alter it.** Fixing the RNTL config, and correcting `AGENTS.md`, are both out of scope here.

Gate before the PR:

```
npm run typecheck   # tsc --noEmit, must be clean
npm test            # must still read: 4 failed, 15 passed, 218 tests passed
npm run lint
```

Then on-device checks:

| Role | Check |
| --- | --- |
| Refund point | Centre slot opens the camera, with the staff subtitle. A scanned sticker still lands on `/sticker-tag`; a tag on `/tag-preview`. The map is no longer reachable, as intended. |
| Refund point | Home shows the placeholder and nothing else; no leftover scan card. |
| Traveller | Centre slot still opens the camera. Home's "Tax free locations" card still pushes Explore, and Explore renders normally when reached that way. |
| Merchant | Unchanged: centre slot scans, Home still reaches create-tag and connected-devices. |
| All | Profile long-press still presents the affiliation sheet for staff (it shares the `isStaff` value being kept). |

## Risks

| Risk | Mitigation |
| --- | --- |
| A refund point wanted the storefront map | It was reachable only from the slot being reclaimed, and the role has no counter workflow that needs it. Restoring it later is a Home card, mirroring traveller Home. |
| Pushing `/(auth)/explore` while its tab press is intercepted misbehaves | This is already how travellers reach Explore today; interception applies to the tab press, not to programmatic navigation. Unchanged behaviour, but on the device checklist. |
| Refund-point Home now looks unfinished | It already was — the string is literally "Refund Point Home Page". The capability moved to a more prominent place, not away. Filling that screen is its own change. |

## Not verifiable here

The camera, as ever, needs a device: `expo-camera` is native, so the centre slot's behaviour for refund points cannot be confirmed in this environment. A real refund-point login is also needed to confirm the role resolves to `refundPoint` and therefore to the staff scan copy.
