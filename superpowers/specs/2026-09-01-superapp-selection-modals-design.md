# Design: One selection modal, one country dataset

**Date:** 2026-09-01
**Repo:** `super-app`
**Branch point:** `d719a04` (`refactor/superapp-selection-modals`, cut from `main`) — "fix(super-app): inset the full-screen pickers from React context".

**Scope:** three full-screen pickers collapse onto one shared frame and one generic selection modal; the two country pickers collapse into one component reading one dataset; the second 297KB country JSON is deleted; the phone country picker — currently empty — starts listing countries. Plus a shared trigger row for the two identical select fields, three new test suites, and no new localization keys.

## Goal

Every full-screen picker in the app opens with its header reachable and its list populated, and the next one someone adds inherits both properties instead of re-deriving them.

## Why

Two bugs were reported from the device:

1. The tenant picker's **close and refresh buttons cannot be tapped**.
2. The profile phone field's flag icon opens a modal with **no way back out**.

Both are the same defect, and `d719a04` had already diagnosed and fixed it for two *other* pickers: `SafeAreaView` is a native view that finds its insets by walking up the **native** view hierarchy for a `SafeAreaProvider`. An RN `Modal` is its own Android Dialog window, so from inside one that walk never reaches the root provider, the frame is inset by nothing, and the header — the only way out — lands under the status bar. `edgeToEdgeEnabled: true` ([app.config.js:68](../../../super-app/app.config.js)) is what makes the Dialog full-bleed in the first place.

Three files still carry the broken shape:

| File | Symptom |
| --- | --- |
| [`TenantSelectionModal.tsx`](../../../super-app/src/components/TenantInput/TenantSelectionModal.tsx) | close + refresh under the status bar |
| [`PhoneCountrySelectionModal.tsx`](../../../super-app/src/components/PhoneInput/PhoneCountrySelectionModal.tsx) | close under the status bar |
| [`CountrySelectionModal.tsx`](../../../super-app/src/components/CountryInput/CountrySelectionModal.tsx) | same, not reported |

Patching each one's frame would close the two tickets. It would not explain why three near-identical components drifted into the same bug, and it would leave the worse defect below in place.

## What the investigation found

Three facts, each verified rather than inferred, and each one a reason to centralize rather than patch:

1. **The phone country picker is empty, not just unreachable.** `PhoneCountrySelectionModal` returns `[]` when its `countries` prop is undefined, and neither caller passes one — [`EditProfileScreen.tsx:87`](../../../super-app/src/screens/shared/Profile/EditProfileScreen.tsx) and [`DiditScreen.tsx:139`](../../../super-app/src/screens/traveller/DiditScreen.tsx) both omit it. Tapping the flag opens a blank list behind an untappable close button. Fixing only the inset would trap the user in an empty screen instead of a full one.

2. **There are two country datasets totalling 562KB, and one of them is almost entirely dead.** `PhoneInput/countries.json` (297KB) holds a `languages` map no module imports, and a per-language `countries` map that is unreachable because of fact 1 — only its 242 `phoneCodes` are live. `CountryInput/countries.json` (265KB) is a proper array of 249 countries with `alpha2`, `alpha3` and names in 40 languages. The two are compatible: exactly one phone code (`an`, Netherlands Antilles, dissolved 2010) has no matching country row, no `alpha2` is duplicated, and both carry the `en` and `tr` that `languageCode` resolves to ([LocalizationProvider.tsx:74](../../../super-app/src/providers/LocalizationProvider.tsx) splits the locale on `-`).

3. **The dead `countries` prop has nothing to be wired to.** `getCountrySettingsInfo` returns a single tenant-wide country, currency and time zone ([SessionProvider.tsx:280-289](../../../super-app/src/providers/SessionProvider.tsx)) — not an allow-list. The prop was speculative. It goes.

Beyond the modals, `TenantInput` and `CountryInput` render a byte-identical `bg-card border-input rounded-2xl border flex-row items-center px-3` pressable with a leading icon, a value line and a chevron.

## Decisions (agreed with user)

1. **Centralize rather than patch.** The user's instruction was explicit: "maybe they can be centralized… we don't have to keep as is."
2. **One country picker, one dataset.** The two country modals become one component. This is the only option in which the empty-list bug cannot silently return, because there is no second data path left to forget to feed.
3. **Both country pickers gain a search box.** The phone variant has none today; 241 countries without one is the picker's other papercut.
4. **The existing `inModal` work landed first**, as `d719a04` on its own branch off `main`, rather than being carried as uncommitted WIP on the unrelated `fix/superapp-require-abp-permission-pairs` branch. Verified before committing: typecheck clean, 35 tests across its 3 suites pass, eslint clean.
5. **`TenantSelectionModal` keeps its file path.** [`StaffLoginScreen.router.test.tsx:54`](../../../super-app/src/screens/shared/__tests__/StaffLoginScreen.router.test.tsx) mocks it by path; moving it would break a test for no gain.

## Architecture

Four layers, each usable and testable without the ones above it.

### 1. Data — `src/data/countries/`

`CountryInput/countries.json` moves here unchanged and becomes the single dataset. The 242 `phoneCodes` are extracted from the doomed `PhoneInput/countries.json` into a small sibling file, dropping `an`. `PhoneInput/countries.json` is then deleted: **−297KB of bundle**, since Metro bundles JSON whole and nothing tree-shakes it.

The module splits along a line jest forces. `react-native-circle-flags` resolves `react-native-web/dist/exports/Image`, which this app does not depend on, so **any module importing it cannot load in the fast `node` jest project** — the same trap `mrz` and nativewind set. Probed, not assumed:

```
Cannot find module 'react-native-web/dist/exports/Image'
  from 'node_modules/react-native-circle-flags/lib/module/CircleFlag.js'
```

So the flag lookup lives apart from the data, and the data stays testable without a renderer:

```ts
// countries.ts — pure, no RN imports, tested in the `node` project
type CountryRecord = {
  alpha2: string;
  alpha3: string;
  name: string;          // localized, falling back to `en`
  phoneCode?: string;    // "+90"
};
buildCountries(opts: { languageCode: string; requirePhoneCode?: boolean }): CountryRecord[]
findCountryByCode(records: CountryRecord[], code: string): CountryRecord | undefined

// flags.ts — UI only
flagFor(alpha2: string): ImageSourcePropType   // `xx` placeholder when absent

// useCountries.ts — thin memo over buildCountries
useCountries(opts?: { requirePhoneCode?: boolean }): CountryRecord[]
```

`buildCountries` sorts by `localeCompare`; `useCountries` supplies `languageCode` and memoizes on it. `findCountryByCode` switches on code length and absorbs today's `getCountryCodeFromAlpha2` / `getCountryCodeFromAlpha3` — exported from `CountryInput.tsx`, imported nowhere outside it. It takes an already-localized list rather than reaching for the raw JSON, so the name `CountryInput` displays follows the app's language, which today's English-only lookup does not.

Counts to assert, not assume: 249 countries; 241 with a phone code; the 8 without are `BQ BV CW TF HM SX UM EH`. Six (`BQ BV HM SH SJ UM`) have no flag asset in `react-native-circle-flags` and take the library's `xx` placeholder — which today's `CountrySelectionModal` does *not* apply, passing `undefined` to `<Image source>`.

### 2. Frame — `src/templates/ListModal.tsx`

`ListModalTemplate` — a full-screen modal whose body is a list rather than a form:

```
<Modal statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose>
  <TemplateRoot inModal>                     // exported from templates/Modal.tsx
    <PageHeader title showBack backAction right={headerRight} />
    <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
      {children}
```

`TemplateRoot` gains an `export` keyword and stays in [`templates/Modal.tsx`](../../../super-app/src/templates/Modal.tsx), so the inset rule and the docblock explaining it live in exactly one place. `ListModalTemplate` deliberately supplies **no** `ScrollView` — `ModalTemplate` does, and a `FlashList` inside one fights the outer scroll for every gesture.

### 3. Picker — `src/components/SelectionModal.tsx`

`SelectionModal<T>` owns what all three modals repeat: the search field, the `FlashList`, the empty and no-match copy, and the row chrome (`Pressable` + bottom border + trailing checkmark on the selected row).

```ts
{
  visible, onClose, title,
  items: T[], keyExtractor: (item: T) => string,
  renderRow: (item: T) => React.ReactNode,   // row *content* only
  onSelect: (item: T) => void,
  isSelected?: (item: T) => boolean,
  searchLabel?: string,                       // omitted => no search box
  filter?: (item: T, query: string) => boolean,
  emptyText, noMatchText,
  loading?: boolean, skeleton?: React.ReactNode, error?: React.ReactNode,
  showBack?: boolean, headerRight?: React.ReactNode,
}
```

It is deliberately not a god-component: the tenant picker's error-and-retry block stays the caller's and arrives as the `error` node, and callers render row content while the modal renders row chrome.

### 4. Callers

| Component | Change |
| --- | --- |
| `TenantSelectionModal` | Same path, becomes configuration. Refresh moves into `headerRight`; the back arrow replaces the close X. The environment-change effect and its `useRef` mount guard are unchanged. |
| `CountryPickerModal` (new) | Replaces **both** country modals, which are deleted. Calls `useCountries` itself, so no caller can forget to feed it — that omission is the whole empty-list bug. `showPhoneCode` both renders the trailing dial code and selects `requirePhoneCode`. |
| `PhoneInput` | Renders it with `showPhoneCode`, which is the entire fix for the empty list. Drops the dead `countries` prop and the `Country` type it exported. |
| `CountryInput` | Passes `showBack={false}` plus a close X — see the constraint below. |
| `SelectField` (new) | The shared trigger row for `TenantInput` and `CountryInput`. `PhoneInput` keeps its `Input leftContent`, a genuinely different shape. |

### The one place the back arrow is unsafe

`CountryInput` is rendered inside [`AddBankSheet`](../../../super-app/src/screens/traveller/Cards/_components/AddBankSheet.tsx), which is a `BottomSheetModal` and therefore portals its children. In [`app/_layout.tsx:66-88`](../../../super-app/src/app/_layout.tsx) the provider order is:

```
GestureHandlerRootView > SafeAreaProvider > SessionProvider > LocalizationProvider
  > ToastProvider > BottomSheetModalProvider > ThemeProvider > RootNavigator
```

The portal host sits **inside** `SafeAreaProvider` and `LocalizationProvider` but **above** `RootNavigator`. So a portaled sheet child keeps safe-area insets and translations, and loses navigation context. `PageHeader` mounts `BackHandlerOnFocus` — and therefore `useFocusEffect` — only when `showBack` is true, so the country picker opened from the bank sheet must pass `showBack={false}` and offer a close X instead. Every other caller is on a route and takes the arrow.

## Testing

| Suite | Covers |
| --- | --- |
| `src/templates/__tests__/ListModal.router.test.tsx` | both translucent flags set; `paddingTop` tracks `insets.top` rather than collapsing to 0; the back arrow calls `onClose`; `showBack={false}` mounts no arrow |
| `src/components/__tests__/SelectionModal.router.test.tsx` | filtering, no-match copy, checkmark on the selected row, `onSelect` fires |
| `src/data/countries/__tests__/countries.test.ts` | the list is non-empty; every phone code resolves to a known `alpha2`; lookups by alpha2/alpha3; a missing localization falls back to `en` |

The non-empty assertion is the one that would have caught the phone picker. Render suites **must** carry the `.router.test.tsx` suffix — jest runs two projects and a render test in the `node` project fails to load.

## Verification

Baselines are re-measured on the branch point, not quoted: `AGENTS.md` records them as of 2026-08-27, and only `src/components/ui/__tests__/tokens.test.ts` is expected red.

- `npm run typecheck` — clean
- `npm test` — no new failures against a baseline measured on `d719a04`
- `npm run lint` — no new errors or warnings
- `npm run init` **is** required. The tenant picker needs nothing new — `Common.Back`, `TenantSelection.{Title,Search,Refresh,Empty,NoMatch,Retry,LoadFailed}` all already exist in both resource files — but `CountrySelection` currently holds **only** `Title`. Four keys go into `en-US.json` and `tr-TR.json`: `CountrySelection.Search` and `.NoMatch` for decision 3's search box, `CountrySelection.Placeholder` to retire the hardcoded English `"Select a Country"` in `CountryInput`, and `Common.Close` to label the close control the bank-sheet variant carries instead of a back arrow — `Common` has `Back` but no `Close`, and the only existing one is `Profile.QrCode.Close`, which belongs to that screen. `TranslationKey` is derived from the gitignored generated bundles, so `npm run init` must run before `tsc` will accept any of those `t()` calls.
- On-device Android, since an inset bug only truly reproduces there: open all three pickers, confirm the header is tappable, the lists are populated, search filters, and selection writes back.

## Out of scope

- Defaulting the phone country from `countrySettings.country` instead of the hardcoded `TR` in `PhoneInput`.
- The `tokens.test.ts` colour-token violations. New code uses semantic tokens; the existing list is its own PR.
- The remaining RN `Modal` call sites (`QrScanner`, `KycCameraModal`, `NfcCardModal`, `CardScannerModal`, and the device screens). They are not list pickers; whether they want `ListModalTemplate` is a separate question.

## Risks

- **Visual drift on the country pickers.** They lose `transparent` and move from `bg-card` to the frame's `bg-background`, matching the tenant picker and the two pickers `d719a04` already converted. Intended, but it is a visible change to screens nobody asked to have restyled.
- **`SelectionModal` growing into a god-component.** Mitigated by keeping error rendering and row content with the caller; if a fourth caller wants a fourth state flag, that is the signal to stop extending it.
- **Localization coverage.** The phone picker's names currently come from a 25-language map and will come from a 40-language one. `en` and `tr` — the only locales the app ships — are present in both, so this is a widening, not a swap.
