# Follow-ups: super-app selection modals

**Date:** 2026-09-01
**Branch:** `refactor/superapp-selection-modals` (`e3c522f`), cut from `main` at `e3705aa`
**Design:** [2026-09-01-superapp-selection-modals-design.md](./2026-09-01-superapp-selection-modals-design.md)
**Plan:** [../plans/2026-09-01-superapp-selection-modals.md](../plans/2026-09-01-superapp-selection-modals.md)

Everything here was found during implementation or the whole-branch review, judged non-blocking, and deliberately left out. Both reported bugs are fixed and confirmed on a physical device; the full gate holds exactly. This file exists so the non-blocking findings do not die with the scratch workspace.

## Worth doing next

### 1. The search is not diacritic-insensitive

Found on device. `SelectionModal`'s callers filter with a plain lowercase substring match, so typing `tur` or `turk` returns **no match** against `Türkiye` — the `ü` defeats it. `rki` matches.

This pre-existed in the tenant picker, and the old country picker was worse (`startsWith`). But this branch gave the **country** pickers a search box over a 241-row list, so a Turkish user typing `turk` cannot find their own country, and `MobileApp.CountrySelection.NoMatch` then states — confidently and falsely — that no country matches.

Fix by folding diacritics in one shared place; see item 4, which the same edit collapses. Verify `String.prototype.normalize` behaves on Hermes before relying on it.

### 2. Three more dial codes with no defensible value

`e3c522f` corrected the four codes that block a real country's number (`ky` → `+1345`, `do` → `+1`, `pr` → `+1`, `va` → `+39`) and pinned them with a test. Three remain wrong but were left alone deliberately, having no correct value to pick and no real users: `aq` (Antarctica), `pn` (Pitcairn), `gs` (South Georgia).

Separately, the phone picker cannot offer **Curaçao, Sint Maarten or Bonaire** — real territories with real dial codes whose only former representative in the legacy data was `an`/+599 (Netherlands Antilles, dissolved 2010), correctly dropped during consolidation. Adding their codes to `src/data/countries/phoneCodes.json` is a data-only change.

### 3. `showBack` carries two meanings and is threaded four layers for one caller

`CountryInput` → `CountryPickerModal` → `SelectionModal` → `ListModalTemplate`. In `CountryPickerModal` the same prop *also* decides whether a close X appears in `headerRightComponent`. Because `SelectionModal` exposes a single right slot, a portal-hosted picker can never have both a close X **and** a refresh control — the two callers' needs are silently mutually exclusive.

An `inPortal` boolean handled inside `ListModalTemplate` (no back arrow ⇒ supply a close control itself) would collapse all four hops and free the right slot.

### 4. The identical `filter` is written twice, and re-runs every keystroke

`TenantSelectionModal` and `CountryPickerModal` each pass their own case-insensitive `includes` arrow. That duplication is why item 1 needs two edits. Both arrows are also freshly allocated per render, so `SelectionModal`'s `useMemo` re-filters 241 rows on every keystroke.

A default `filter` on `SelectionModal` fixes the duplication, the diacritic gap and the churn together.

### 5. `PhoneInput` builds 249 rows to read one dial code

`PhoneInput` calls `useCountries({ requirePhoneCode: true })` purely to look up the selected country's `phoneCode`, and `CountryPickerModal` builds the same list again — so mounting one phone field constructs and `localeCompare`-sorts the dataset twice. A `dialCodeFor(alpha2)` export doing an O(1) read of `phoneCodes.json` (which is what the deleted code did) removes half the work.

## Smaller, genuinely optional

- **`AddBankSheet` hosts `CountryInput` inside a `BottomSheetScrollView`**, between `BottomSheetTextInput` fields — the documented "RN `Modal` nested under a `ScrollView` swallows the first tap while the keyboard is up" configuration. This branch recognised and fixed that exact hazard for `KycCameraModal` in `SearchTraveller` and left the structurally identical case here. Worst case is one lost tap: Android back still reaches `onRequestClose`, and the close X is there by design. **This is also the one picker not device-verified** — its entry point was not reachable in the traveller UI during QA.
- **`findChildrenContainer`** in `ListModal.router.test.tsx` includes `style.paddingBottom !== undefined` in its search predicate — the very property it then asserts. A dropped inset therefore fails as a `TypeError` rather than "expected 34, received undefined". `className === "flex-1"` is unique in that tree, so the clause can simply go.
- **`showSkeleton`** in `SelectionModal` types as `false | ReactNode` rather than boolean. Never rendered bare, so latent only.
- **Tests read an input's value via `(input as any).props.value`.** A supported RNTL query would be cleaner.
- **`ListModalTemplate` sets no `keyboardDismissMode`** on its `FlashList`, so with the keyboard up the last rows sit underneath it. Pre-existing in both old pickers; `keyboardDismissMode="on-drag"` is a one-liner.
- **Commit `a89a80c`'s subject** is unscoped (`test:` rather than `test(super-app):`) and names one of its three cases. Not amended — rewriting published history is the worse trade.
- **`src/data/countries/index.ts` re-exports `flagFor`**, so the barrel is the one import path poisoned for `node`-project jest tests (`react-native-circle-flags` resolves `react-native-web`, absent here). Only `../countries` is imported directly today; a comment on the barrel would stop the next author tripping it.

## Two review challenges worth recording

The whole-branch review disputed two judgement calls made during execution. Both are recorded rather than re-litigated:

1. **The `searchLabel`-without-`filter` guard.** The chosen fix renders the search box only when both props are present, on the stated grounds that it "fails safe and self-documents". The reviewer's objection stands: the failure is an *invisibly missing* search field over a 241-row list, which is the same shape as the empty-list bug this branch exists to kill — and a test now freezes it as intended behaviour. Non-blocking, but the rationale does not hold and should be revisited rather than treated as settled.
2. **`parsePhoneNumber` must stay a default import.** `libphonenumber-js`'s default export is `parsePhoneNumberFromString`, which returns `undefined`; the identically-named *named* export is `parsePhoneNumberWithError`, which throws. Now that 241 prefixes are reachable, "tidying" that import would turn every unparseable prefix into an unhandled throw inside `onChangeText`. `e3c522f` added a comment saying so; treat it as load-bearing.

## Environment notes that cost time

- **`.env` is gitignored, so `git worktree add` does not bring it across.** A fresh super-app worktree has no `EXPO_PUBLIC_GATEWAY_URL`, so every API call fails with `Network request failed` while the host pings fine. Copy `.env` from the main checkout and restart Metro with `--clear` — the values are inlined at bundle time.
- **`npm run init` needs the backend.** While `dev-api` was returning 502 it could not run at all, which blocks `tsc` on any new `t()` key because `TranslationKey` derives from the generated bundle. The offline stand-in used here mirrors `init.ts:146-160` — keep the bundle's backend half, rebuild only the `MobileApp` half from the tracked resources. Once the backend returned, the real `init` output was compared against that reconstruction: the `MobileApp` halves were **identical** in both locales.
