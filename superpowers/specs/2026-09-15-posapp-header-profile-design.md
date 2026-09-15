# Centralized header, redesigned Profile, Card Reader removal — pos-app

**Date:** 2026-09-15
**Repo:** `pos-app` (`unirefund-pos`)
**Branch point:** `main` @ `e63354f`
**Reference app:** `super-app` — this ports three of its patterns, it does not invent them

## Goal

pos-app draws one header, in one component, on every screen and sheet that has
one — with a back arrow by default. The Card Reader diagnostics page is gone,
Connected Devices no longer greets the user on Home, Profile becomes
identity-first, and the store switcher moves into the Profile header.

## Why

pos-app's header exists, but only inside `ModalTemplate` — 165 lines that mix a
title row, a back arrow, a `BackHandler` subscription, a keyboard-avoiding
scroll body and a footer action bar. A screen that wants a header must take the
whole template. Two screens (`HomeScreen`, `FaqScreen`) opted out and hand-rolled
their own, and every bottom sheet writes its own `text-xl font-bold` title.
super-app hit the same wall and extracted `PageHeader`, which its three templates
now share. This is that extraction.

The back arrow is the sharper problem. `ModalTemplate` renders one **only when a
`backAction` prop is passed**, and 12 of its 17 callers don't pass one — so
ProductGroups, Device Settings, Edit Profile, the tag list and the language
selector are all pushed screens with no visible way back. On a POS terminal
whose Android navigation is a thin gesture bar, that is a real dead end.

## Decisions

Six were put to the user and answered.

1. **The Connected Devices page survives; only its entry points go.** The route
   and screen stay registered and compiling. The Home tile is deleted and
   nothing replaces it — the page becomes reachable only by deep link. This was
   chosen over deleting the page (which would throw away a working device list)
   and over re-homing it in Profile or the debug menu.
2. **The store switcher renders in the header, but only Profile passes it.**
   Not on every screen the way super-app's `TabPage` does it. A cashier
   mid-sale must not be one mis-tap from swapping stores, and the sale screen's
   header is already carrying a title and a back arrow at terminal width.
3. **Profile is a full port: `ProfileHero` + `SettingsGroup`.** Not a reskin of
   the existing `UserCard` + `ActionList`, and not a reordering of the current
   rows.
4. **The back arrow defaults to on.** `showBack = true`, matching super-app,
   with per-screen opt-out. Chosen over preserving today's behaviour, which is
   what produced the 12 dead ends.
5. **One `PageHeader` serves pages and sheets, via an optional label prop.** Not
   a second `SheetHeader` component. See "The sheet hazard" below.
6. **`src/templates/TabPage.tsx` is deleted** (zero consumers), and **the Legal
   group is omitted** from Profile (pos-app has no privacy-policy or
   account-deletion link anywhere in its source or locale files, and a merchant
   staff account is not one its holder deletes from the app).

## The sheet hazard

This is the one thing in the port that cannot be copied verbatim.

In pos-app, a hook called inside a `<BottomSheet>` child loses its context. The
sheet renders through a portal, so `useLocalization()` there resolves nothing
and **renders the raw i18n key**. `MoreActionsSheet` already documents this and
takes its strings as props for exactly this reason.

super-app's `PageHeader` calls `useLocalization()` internally, for one string:
the back button's `accessibilityLabel`. Dropped into a pos-app sheet as-is, it
would ship `MobileApp.Common.Back` to a screen reader.

So the ported `PageHeader` takes an optional `backLabel?: string`. Pages omit it
and the hook supplies the label; a sheet's host resolves the string and passes
it down, the way `MoreActionsSheet` already does. One component, honest in both
contexts.

## What changes

### 1. Card Reader removal

Deleted:

- `src/app/(auth)/card-reader.tsx`
- `src/screens/(auth)/CardReader/CardReaderScreen.tsx` (477 lines)
- `src/screens/(auth)/CardReader/__tests__/CardReaderScreen.test.tsx` (278 lines)
- The `CardReader` tile in `HomeScreen.tsx`
- `MobileApp.Home.CardReader` and the `MobileApp.CardReader.*` block from
  `src/localization/resources/{en-US,tr-TR}.json`

**Explicitly kept** — the screen was a diagnostics harness over machinery the
sale flow depends on:

| Kept | Because |
| --- | --- |
| `src/hooks/useCardReader.tsx` | `Sale/_components/RefundCardScanModal.tsx` |
| `src/hooks/useCardCapabilities.tsx` | same |
| `src/store/cardCapabilities.ts` | same, plus its own test |
| `modules/sunmi-card-reader` | the native module behind both |
| `src/store/payout.ts` | `CustomerScreen`, `SaleScreen`, `SaleScreenV2`, `AffiliationProvider`, `sessionReset` |

Verified: no import of the deleted files survives outside the deleted files.

### 2. `src/components/PageHeader.tsx`

Ported from `super-app/src/components/PageHeader.tsx`.

```ts
export interface PageHeaderProps {
  title: string;
  description?: string;
  showBack?: boolean;          // default true
  backAction?: () => void;     // default router.back()
  backDisabled?: boolean;      // blocks arrow AND hardware key together
  right?: React.ReactNode;
  accessory?: React.ReactNode; // under the title, in the same column
  backLabel?: string;          // pos-app addition — see "The sheet hazard"
  titleClassName?: string;
}
```

The inner `BackHandlerOnFocus` component is mounted **only when `showBack`**.
`useFocusEffect` calls `useNavigation()` regardless of what its callback does, so
mounting it unconditionally would force every consumer — including screens with
no arrow — to render inside a navigation context to satisfy a hook it has no use
for. Conditionally rendering a *sibling component* is legal; the rules of hooks
constrain a single component's own render.

`backDisabled` blocks the arrow and the Android hardware key together, because
leaving either live defeats the other.

### 3. `ModalTemplate` consumes it

`src/templates/Modal.tsx` replaces its inline header `<View>` with
`<PageHeader>` and **deletes its own `useFocusEffect` + `BackHandler` block**,
which `PageHeader` now owns. Prop mapping:

| `ModalTemplate` prop | `PageHeader` prop |
| --- | --- |
| `title`, `description` | same |
| `backAction` | same |
| `busy` | `backDisabled` |
| `headerRightComponent` | `right` |
| *(new)* `showBack` | `showBack`, default `true` |

`ModalTemplate` keeps everything else it does — the keyboard-avoiding scroll
body, the footer action bar, `MoreActionsSheet` overflow, the bottom-inset
ownership. Only the header moves.

**Screens are not otherwise edited.** They keep passing the props they pass
today; the arrow appears because the default changed. The exceptions are the two
opt-outs:

| Screen | `showBack` | Why |
| --- | --- | --- |
| `(public)/LoginScreen` | `false` | Public entry screen; nothing behind it |
| `(public)/RegisterScreen` | `false` | same |

Every other `ModalTemplate` caller gains an arrow: `ConnectedDevices`,
`BarcodeTest`, `DeviceSettings`, `ProductGroups`, `EditProfile`, `Profile`,
`AddProduct`, `TagScreen`, `LanguageSelection`. Each is a pushed route with a
real destination behind it. The five that already pass `backAction`
(`CustomerScreen`, `SaleScreen`, `SaleScreenV2`, `TagDetailScreen`,
`TagDetailView`) are unaffected — their custom action still wins.

New key `MobileApp.Common.Back` ("Go back" / "Geri dön") in both locales.

### 4. `src/templates/TabPage.tsx` deleted

Zero consumers. It carried its own inline title that would drift from
`PageHeader` the moment either changed.

### 5. Connected Devices

- The `ConnectedDevices` tile is removed from `HomeScreen.tsx`.
- `src/screens/(auth)/ConnectedDevices/_components/AffilationSwitch.tsx` is
  deleted, along with its render inside `ConnectedDevicesScreen`. Its job moves
  to the header pill.
- The screen's `changingAffiliation` skeleton logic stays — an affiliation
  switch still tears the hub connection down and back up, whichever control
  started it.
- The route stays registered. Nothing links to it.

### 6. Profile

**New — `src/components/SettingsGroup.tsx`** (ported): one labelled group of
rows, heading *outside* the card so several cards stack under one scroll view.
This is why it replaces `ActionList` here rather than extending it — `ActionList`
puts its heading inside the same card as its rows.

```ts
export interface SettingsRowProps {
  title: string;
  icon: IoniconsTypes;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  value?: string;       // right-hand value before the chevron
  primary?: boolean;
  destructive?: boolean;
  testID?: string;
}
```

**New — `src/screens/(auth)/Profile/_components/ProfileHero.tsx`** (ported):
avatar (→ the existing `AvatarModal`), full name, a role badge, a QR button (→
the existing `QrCodeModal`), and an optional organization detail row. Everything
sits in normal flow — pos-app's `UserCard` pins its QR button at
`absolute right-8 top-4`, a guess at the header's position that this change
would break anyway.

The badge tone is **neutral, not success**: it states which role the account
holds, and a green tick would read as an assurance about the account's standing
that nothing has checked.

**New — `src/screens/(auth)/Profile/useMerchantIdentity.ts`**: deliberately
*simpler* than super-app's `useStaffIdentity`. That hook resolves between three
roles and four claim sources because super-app serves merchants, refund points
and customs from one screen. pos-app is merchant-only, so this reads
`useAffiliation()` and the existing `useActivePartyId` and returns
`{ organizationName, affiliationCount }`. Porting the three-role resolver would
be importing a decision pos-app does not have to make.

**`ProfileScreen` structure:**

```
ModalTemplate  title=Profile  headerRightComponent=<StoreSwitcherPill/>
  ProfileHero   name · "Merchant" badge (· "N affiliations" when >1)
                · organization detail row (omitted when unnameable)
  ACCOUNT       Personal Info                      → profile/edit-profile
  APP           App Language        [native name]  → (modals)/language-selector
  DEVICE        Device Settings                    → (auth)/device-settings
                Printer Settings                   → PrinterModal sheet
  (unlabelled)  Logout                             destructive
  AppVersion
```

The organization row is **omitted entirely** when the active affiliation cannot
be named. A row reading "Organization —" is worse than no row, because a
merchant reads it to confirm which store they are issuing tags for.

`App Language` carries the locale's own native name as its `value` — "English"
in English, "Türkçe" in Turkish — so the row reads correctly whichever locale is
active.

**Deleted:** `src/screens/(auth)/Profile/_components/UserCard.tsx`
(`ProfileScreen` is its only consumer) and the `MerchantSwitch` row from the
menu. `AvatarModal`, `QrCodeModal` and `PrinterModal` all survive, now presented
by `ProfileHero` and the Device group.

New keys in both locales: `MobileApp.Profile.Group.Account`, `.Group.App`,
`.Group.Device`, `.Role.Merchant`, `.Organization.Label`,
`.Organization.OfCount`. `Group.Device` has no super-app counterpart (super-app
groups Account / Wallet / App); it exists because pos-app's device concerns are
the terminal's, not the account's.

`ProfileHero`'s two accessibility labels **reuse pos-app's existing keys** —
`MobileApp.Avatar.ProfilePicture` and `MobileApp.QrCode.ProfileCard` — rather
than porting super-app's `Profile.Profile Picture` / `Profile.QrCode.Title`.
Adding a second key for a string the app already has is how locale files rot.

### 7. `src/components/StoreSwitcherPill.tsx`

A bordered pill — swap icon plus the active store name — matching the back
control `PageHeader` already draws, so the name reads as a button and not as a
second title. `max-w-40` and `numberOfLines={1}`, because the title beside it is
the `flex-1` column: an uncapped store name would shrink the *title* rather than
itself.

Renders `null` when `!canSwitch`. Opens the existing
`StoreSwitcherProvider` sheet, which is already mounted once for the whole
`(auth)` group. Passed as `headerRightComponent` by `ProfileScreen` only.

Accessibility label names the current store:
`"Switch store: Ataköy AVM"`.

## Components and their boundaries

| Unit | Does | Depends on |
| --- | --- | --- |
| `PageHeader` | Draws title, description, back arrow, right slot, accessory; owns the hardware back key while focused | `useLocalization` (overridable), `expo-router` |
| `SettingsGroup` | One labelled card of rows | presentational |
| `ProfileHero` | Identity card: avatar, name, badge, detail row | `useUserStore`, `AvatarModal`, `QrCodeModal` |
| `useMerchantIdentity` | Which store this account acts for, and how many it has | `useAffiliation`, `useActivePartyId` |
| `StoreSwitcherPill` | Header trigger for the switcher sheet | `useStoreSwitcher` |

`ProfileHero` and `SettingsGroup` are presentational and role-agnostic — what
the badge *means* belongs to the caller. That is what keeps `ProfileScreen`
readable as a description of the screen rather than a layout.

## Testing

pos-app's convention is plain `*.test.tsx` under `__tests__` (there is no
`.router.test` requirement here — that is super-app's).

New:

- `PageHeader.test.tsx` — arrow renders by default; hidden under
  `showBack={false}`; `backAction` called on press; `router.back()` when none;
  `backDisabled` blocks both the press and the hardware key; `backLabel`
  overrides the hook-resolved accessibility label.
- `SettingsGroup.test.tsx` — rows, dividers, `value`, `disabled`, `destructive`.
- `ProfileHero.test.tsx` — badge detail appears only when count > 1; detail row
  omitted when the organization cannot be named.
- `ProfileScreen.test.tsx` — the four groups render in order; the switcher pill
  appears only when `canSwitch`.
- `useMerchantIdentity.test.ts` — resolution and the unnameable case.

Changed:

- `ConnectedDevicesScreen.test.tsx` — drop `AffilationSwitch` assertions.
- `CardReaderScreen.test.tsx` — deleted with its screen.
- `src/templates/__tests__/Modal.test.tsx` — header assertions now target
  `PageHeader`, and it gains a case for the flipped back-arrow default.
- `src/templates/__tests__/TabPage.test.tsx` — deleted with its template.

## Gates

Baseline to hold, per `pos-app/AGENTS.md` (re-measure, don't trust the numbers):

| Command | Baseline |
| --- | --- |
| `npm run typecheck` | clean |
| `npm test` | 67 suites / 818 tests |
| `npm run lint` | 0 errors / 34 warnings |

`npm run init` must run **before** `tsc` can see the new i18n keys —
`src/data/language-data/*.gen.json` is gitignored and regenerated from
`src/localization/resources/*.json`. It reads `.env` for `SUPPORTED_LOCALES`.

`prettier --check` is **not** a gate (228 files fail at baseline). Format only
touched files, and never a file mirrored from `core`. None of the files in this
change are mirrored.

## Out of scope

- `FaqScreen` and `HomeScreen` keep their hand-rolled layouts. Both are
  header-less by design (Home leads with the logo lockup; FAQ renders a bare
  accordion), so neither has a header to centralize. Migrating them is a
  separate judgement about what those screens should look like.
- pos-app's two `Input` components stay duplicated. Already recorded as a
  follow-up in `AGENTS.md`.
- Bottom sheets are **not** migrated to `PageHeader` in this change. The
  `backLabel` prop exists so they *can* be, one at a time, once the pages are
  settled — adopting it across `TagFilterSheet`, `PrinterModal`,
  `SearchTravellerModal` and `RefundCardScanModal` in the same commit would mean
  the header lands and the sheet regressions land together, with no way to tell
  which caused what.
