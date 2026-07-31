# Quick Access Is Scan QR For Every Role — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tab bar's prominent centre slot launch the QR scanner for all three roles — traveller, refund point, merchant — instead of only two.

**Architecture:** The centre slot is the `explore` `Tabs.Screen` in `src/app/(auth)/_layout.tsx`, and a `scansFromCenterTab` boolean decides whether pressing it opens the camera (traveller, merchant) or navigates to the storefront map (refund point). That boolean is deleted rather than extended: with every role scanning there, nothing is left to branch on. The refund point's old scan surface — a `ScanEntry` card on its Home — becomes a duplicate of the centre slot and is deleted with the component, which had no other consumer.

**Tech Stack:** React Native 0.81.5 / Expo ~54, expo-router ~6 `Tabs`, TypeScript strict, NativeWind, Zustand (`useUserStore` for role), jest.

**Spec:** `c:\unirefund\docs\superpowers\specs\2026-07-30-quick-access-scan-all-roles-design.md`

**Repo:** `c:\unirefund\super-app` — the only repo touched. Note `c:\unirefund` itself is **not** a git repo; `super-app` is. Run every command below from `c:\unirefund\super-app`.

## Global Constraints

- **No new dependencies, no SDK regeneration, no backend or web changes.** Mobile only.
- **No new localization keys and no `npm run init`.** Every string used already exists: `MobileApp.Qr.ScanButton`, `MobileApp.Qr.ScanTitle`, `MobileApp.Home.RefundPointPlaceholder`.
- **Never hardcode user-visible text** — read it through `useLocalization()`'s `t()`. (`.claude/rules/i18n.md`)
- **Do not touch the scan pipeline.** `useQrScanLauncher`, `useScanRouting`, `scanDestination`, `classifyScan` and `QrScanner` are already role-correct via `isStaff`; this change only alters which surface launches them.
- **Leave `MobileApp.Navigation.Explore` in `src/localization/resources/*.json`** even though it becomes unused. Removing it would force a regeneration for no behavioural gain.
- **Leave `AGENTS.md` alone.** Its "no automated test suite" line is stale, and its correction is out of scope.
- **Measured baselines that must not change:**
  - `npx tsc --noEmit` → exit 0, no output.
  - `npx eslint .` → exit 0, `19 problems (0 errors, 19 warnings)`.
  - `npx jest` → `Test Suites: 4 failed, 15 passed, 19 total` / `Tests: 218 passed, 218 total`. The 4 failures are pre-existing: `src/components/__tests__/{BottomSheet,Button,DebouncedPressable,Toast}.test.tsx` all die at the `@testing-library/react-native` import, which cannot resolve `react-native` under this jest config.
- **On TDD for this change:** there is no test-first cycle available and the plan does not fake one. The change adds no pure logic (it deletes a boolean and a component), and a component test over the tab layout is impossible while RNTL cannot load. Each task's cycle is therefore: typecheck + lint + the unchanged jest baseline, then a device check. The behaviour genuinely under test — which destination a scan routes to per role — is already covered by `src/utils/qr/__tests__/scanDestination.test.ts`, which this change must leave green and untouched.

---

## File Structure

| File | Action | Responsibility after the change |
| --- | --- | --- |
| `src/app/(auth)/_layout.tsx` | Modify | Owns the tab set. The centre slot unconditionally opens the scanner; `QrScanner` mounts for every role. `TabRoutes` keeps `isStaff` (profile long-press + affiliation sheet) and loses `isMerchant`. |
| `src/screens/refund-point/Home/HomeScreen.tsx` | Modify | Refund-point Home: the placeholder string, nothing else. No scan card. |
| `src/screens/shared/_components/ScanEntry.tsx` | **Delete** | — (its single consumer was refund-point Home) |

Unchanged and deliberately so: `src/hooks/useQrScanLauncher.tsx`, `src/hooks/useScanRouting.ts`, `src/utils/qr/scanDestination.ts`, `src/components/QrScanner.tsx`, `src/screens/shared/Explore/ExploreScreen.tsx`, `src/app/(auth)/explore.tsx`, both `src/localization/resources/*.json`, and the traveller and merchant Home screens.

---

## Task 1: The centre slot scans for every role

**Files:**
- Modify: `src/app/(auth)/_layout.tsx` — the `TabRoutes` signature (lines 55-70), the `explore` `Tabs.Screen` (lines 132-164), the `QrScanner` mount (lines 189-199), and the `<TabRoutes />` call site (line 49)

**Interfaces:**
- Consumes: `useQrScanLauncher()` from `@/hooks/useQrScanLauncher`, already imported in this file, returning `{ visible, open, close, onScanned, subtitle, openManualEntry, manualEntryLabel }`. Nothing about it changes.
- Produces: `TabRoutes({ isStaff }: { isStaff: boolean })` — a one-prop component. Task 2 does not consume it.

- [ ] **Step 1: Branch off main**

`main` is the default branch and is currently clean. Do not commit to it directly.

```bash
git checkout -b feat/quick-access-scan-all-roles
```

- [ ] **Step 2: Record the baseline so you can prove you did not move it**

```bash
npx tsc --noEmit; echo "TSC EXIT: $?"
npx eslint . 2>&1 | tail -3
npx jest 2>&1 | tail -4
```

Expected, exactly:
- `TSC EXIT: 0` with no diagnostics above it
- `✖ 19 problems (0 errors, 19 warnings)`
- `Test Suites: 4 failed, 15 passed, 19 total` and `Tests: 218 passed, 218 total`

If any of these three differs from the above **before you have edited anything**, stop and report it — the baseline in this plan is wrong and the rest of the verification is meaningless.

- [ ] **Step 3: Shrink the `TabRoutes` signature**

`isTraveller` and the `isMerchant` prop exist only to compute `scansFromCenterTab`. Both go. `isStaff` stays — `handleLongPress` and the `{isStaff && <SwitchAffilationSheet …>}` render both read it.

Replace lines 55-70:

```tsx
function TabRoutes({
  isStaff,
  isMerchant,
}: {
  isStaff: boolean;
  isMerchant: boolean;
}) {
  const { t } = useLocalization();
  const sheetRef = useRef<BottomSheetModal>(null);
  const segment = useSegments();
  const isTraveller = !isStaff;
  // Scanning is the highest-frequency action for travellers (their own tags)
  // and merchants (customer tags and store stickers), so both get it in the
  // prominent center slot. Refund points keep the storefront map there.
  const scansFromCenterTab = isTraveller || isMerchant;
  const scan = useQrScanLauncher();
```

with:

```tsx
function TabRoutes({ isStaff }: { isStaff: boolean }) {
  const { t } = useLocalization();
  const sheetRef = useRef<BottomSheetModal>(null);
  const segment = useSegments();
  const scan = useQrScanLauncher();
```

- [ ] **Step 4: Update the call site**

Line 49, inside `TabLayout`'s `NovuProvider`:

```tsx
        <TabRoutes isStaff={isStaff} isMerchant={isMerchant} />
```

becomes:

```tsx
        <TabRoutes isStaff={isStaff} />
```

Leave `TabLayout`'s own destructure at line 20 alone — `const { role, isMerchant, isRefundPoint } = useUserStore();` still needs `isMerchant` for `const isStaff = isMerchant || isRefundPoint;` on line 28.

- [ ] **Step 5: Make the `explore` slot unconditionally a scan action**

Replace the whole `explore` `Tabs.Screen` block (lines 132-164 in the original file):

```tsx
        <Tabs.Screen
          name="explore"
          listeners={
            scansFromCenterTab
              ? {
                  // Center tab is a scan action — open the scanner instead of
                  // navigating to the Explore map (travellers reach it from
                  // Home; merchants have no use for it).
                  tabPress: (e) => {
                    e.preventDefault();
                    scan.open();
                  },
                }
              : undefined
          }
          options={{
            title: scansFromCenterTab
              ? t("MobileApp.Qr.ScanButton")
              : t("MobileApp.Navigation.Explore"),
            tabBarLabel: () => null,
            tabBarIcon: () => (
              <View className="bg-primary rounded-full p-2 w-16 h-16 items-center justify-center -mt-6 elevation-sm ">
                <Ionicons
                  size={32}
                  name={
                    scansFromCenterTab ? "qr-code-outline" : "location-outline"
                  }
                  color="#fff"
                />
              </View>
            ),
          }}
        />
```

with:

```tsx
        {/* Scanning is the highest-frequency action for every role — a
            traveller's own tags, a merchant's customer tags and store
            stickers, a refund point's counter work — so it owns the prominent
            center slot outright. The slot is still backed by `explore` because
            expo-router has no route-less tab and this is the route already
            doing the job; it just never navigates there. Travellers reach the
            map by push from Home, and no other role has an entry point. */}
        <Tabs.Screen
          name="explore"
          listeners={{
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

Keep the block in its current position between the `create-tag` and `faq` screens — tab order is the render order, and moving it would move the button.

- [ ] **Step 6: Mount `QrScanner` unconditionally**

Replace lines 189-199, dedenting the element by two spaces now that the conditional wrapper is gone:

```tsx
      {scansFromCenterTab && (
        <QrScanner
          visible={scan.visible}
          onScanned={scan.onScanned}
          onCancel={scan.close}
          title={t("MobileApp.Qr.ScanTitle")}
          subtitle={scan.subtitle}
          onManualEntry={scan.openManualEntry}
          manualEntryLabel={scan.manualEntryLabel}
        />
      )}
```

with:

```tsx
      <QrScanner
        visible={scan.visible}
        onScanned={scan.onScanned}
        onCancel={scan.close}
        title={t("MobileApp.Qr.ScanTitle")}
        subtitle={scan.subtitle}
        onManualEntry={scan.openManualEntry}
        manualEntryLabel={scan.manualEntryLabel}
      />
```

Note `subtitle={scan.subtitle}` is passed through untouched. `useQrScanLauncher` already resolves it to `MobileApp.Qr.ScanTagSubtitleStaff` for a refund point, because it computes `isStaff` from the store itself. That is why no wording change is needed here.

- [ ] **Step 7: Confirm `scansFromCenterTab` is fully gone**

```bash
grep -rn "scansFromCenterTab\|isTraveller" src/
```

Expected: no output. Any hit means a branch was missed.

- [ ] **Step 8: Verify against the baseline**

```bash
npx tsc --noEmit; echo "TSC EXIT: $?"
npx eslint . 2>&1 | tail -3
npx jest 2>&1 | tail -4
```

Expected: byte-identical to Step 2. `TSC EXIT: 0`, `19 problems (0 errors, 19 warnings)`, `4 failed, 15 passed`, `218 passed`.

A **new** eslint warning here most likely means an unused import or variable was left behind — `isMerchant` in `TabRoutes`, or an `Ionicons`/`View` import that is in fact still used by other tabs. Fix the cause, do not silence the rule.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(auth\)/_layout.tsx
git commit -m "feat(tabs): scan from the center slot for every role

Refund points reached the camera one level deeper than everyone else while
the prominent slot held a storefront map they have no counter use for.
Scanning is now unconditional there, so scansFromCenterTab has nothing left
to branch on and goes, along with the isMerchant prop and isTraveller local
that only fed it.

Explore keeps the carrier route -- expo-router has no route-less tab -- and
stays reachable by push from traveller Home. Refund points lose their only
entry to it, matching merchants.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 10: Device check — the reason this task exists**

`expo-camera` is native, so this cannot be confirmed from a terminal. Rebuild and run:

```bash
npm run android    # or: npm run ios
```

Log in as a **refund point** and confirm:
1. The centre slot shows the QR icon, not the location pin.
2. Pressing it opens the camera and does **not** navigate to the map.
3. The scanner subtitle is the staff wording (tags and store stickers — no mention of airport validation).
4. A scanned sticker still lands on `/sticker-tag`; a scanned tag on `/tag-preview`. Routing is unchanged, so a failure here is a pre-existing bug, not this task's.
5. "Can't scan? Enter it manually" still opens `/manual-entry`.

Then as a **traveller**: the centre slot still opens the camera, and Home's "Tax free locations" card still opens the map. Then as a **merchant**: centre slot still scans, Home still reaches create-tag and connected-devices. Finally, as either staff role, long-press Profile and confirm the affiliation sheet still presents — it shares the `isStaff` value this task kept.

---

## Task 2: Drop the refund point's duplicate scan card

Reviewable independently of Task 1: keeping `ScanEntry` as a second entry point was a live option and was rejected, so a reviewer could accept Task 1 and reject this.

**Files:**
- Modify: `src/screens/refund-point/Home/HomeScreen.tsx`
- Delete: `src/screens/shared/_components/ScanEntry.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: nothing. This task only removes a consumer and its component.

- [ ] **Step 1: Prove `ScanEntry` has exactly one consumer**

```bash
grep -rn "ScanEntry" src/
```

Expected, exactly these three hits — two in the screen edited next, one in the component itself:

```
src/screens/refund-point/Home/HomeScreen.tsx:2:import { ScanEntry } from "@/screens/shared/_components/ScanEntry";
src/screens/refund-point/Home/HomeScreen.tsx:13:        <ScanEntry />
src/screens/shared/_components/ScanEntry.tsx:11:export function ScanEntry() {
```

If any other file imports it, **stop** — the deletion in Step 3 is wrong and this task needs re-planning.

- [ ] **Step 2: Reduce refund-point Home to its placeholder**

Replace the entire contents of `src/screens/refund-point/Home/HomeScreen.tsx`:

```tsx
import { useLocalization } from "@/providers/LocalizationProvider";
import TabPage from "@/templates/TabPage";
import React from "react";
import { Text, View } from "react-native";

export default function Page() {
  const { t } = useLocalization();

  return (
    <TabPage title={t("MobileApp.Home.Title")}>
      {/* Scanning lives on the center tab for every role now, so Home does not
          duplicate it -- the same reason traveller and merchant Home don't. */}
      <View className="flex-1 items-center justify-center">
        <Text className="text-muted text-base">
          {t("MobileApp.Home.RefundPointPlaceholder")}
        </Text>
      </View>
    </TabPage>
  );
}
```

Two things went: the `ScanEntry` import and element, and the outer `<View className="flex-1">` that only existed to stack the card above the centred text. The screen is now visibly unfinished — `MobileApp.Home.RefundPointPlaceholder` is literally `"Refund Point Home Page"`. That is accepted: the capability moved to a more prominent place, and filling this screen is a separate change.

- [ ] **Step 3: Delete the component**

```bash
git rm src/screens/shared/_components/ScanEntry.tsx
```

- [ ] **Step 4: Confirm nothing references it**

```bash
grep -rn "ScanEntry" src/
```

Expected: no output.

- [ ] **Step 5: Verify against the baseline**

```bash
npx tsc --noEmit; echo "TSC EXIT: $?"
npx eslint . 2>&1 | tail -3
npx jest 2>&1 | tail -4
```

Expected: still identical to Task 1 Step 2. `TSC EXIT: 0`, `19 problems (0 errors, 19 warnings)`, `4 failed, 15 passed`, `218 passed`.

A dangling import would surface here as a tsc error, which is the real check on Step 3.

- [ ] **Step 6: Commit**

```bash
git add src/screens/refund-point/Home/HomeScreen.tsx
git commit -m "refactor(home): drop the refund point's duplicate scan card

ScanEntry existed because the refund point's center slot held the map. Now
that the slot scans, the card is a second route to the same camera -- which
is exactly what traveller and merchant Home avoid. Refund-point Home was its
only consumer, so the component goes with it.

Home is left with just its placeholder string. Giving it real content is a
separate change.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Device check**

On the same build as Task 1 Step 10, as a **refund point**: Home shows the placeholder text centred and nothing else — no leftover scan card, no empty gap where it was. The centre slot still scans.

---

## Done when

- [ ] All of Task 1 and Task 2 checked off.
- [ ] `npx tsc --noEmit` exit 0; `npx eslint .` still `0 errors, 19 warnings`; `npx jest` still `4 failed, 15 passed` / `218 passed`.
- [ ] `grep -rn "scansFromCenterTab\|ScanEntry" src/` returns nothing.
- [ ] Device-verified as all three roles per the checks above.
- [ ] `QR_FEATURE_CHECKLIST.md` gains a Phase 9 entry recording the change and pointing at the spec and this plan, matching how Phases 5-8 are written. Include the unchecked device-verification line if the device check has not been run.
- [ ] PR opened per `AGENTS.md`: what changed and why, linked to its issue, building on both platforms.
