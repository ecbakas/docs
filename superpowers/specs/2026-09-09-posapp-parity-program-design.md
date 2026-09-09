# pos-app ↔ super-app parity: program decomposition

**Date:** 2026-09-09
**Repo:** `pos-app` (`unirefund-pos`), Android-only, portrait-locked, merchant-only
**Branch point:** `bff7134` (`main`) — "Merge pull request #11 from ayasofyazilim-clomerce/feat/app-config-provider"

Seven scoped requests arrived together. They do not map one-to-one onto units of
work: two of them share a root cause, two more share a mechanism, and three
depend on a UI substrate pos-app does not have. This document records the
decomposition and the decisions that constrain every sub-project. Each
sub-project gets its own design doc and its own plan.

## The requests

| Id | Request |
| --- | --- |
| T1 | Reload product groups on every login |
| T2 | Clear the cart on login and logout |
| T3 | Tag list parity with super-app |
| T4 | Tag detail parity with super-app |
| T5 | super-app's action-button style on the tag detail |
| T6 | Default the login screen to the last selected tenant |
| T7 | super-app's affiliation switcher |
| T8 | Keep device settings per user id |

## Two findings that reshaped the decomposition

**T1 and T7 are one bug.** [`MerchantProvider`](../../../pos-app/src/providers/MerchantProvider.tsx)
establishes the acting merchant with `merchantList?.items?.[0]?.id` — the first
merchant in the list, not the active affiliation — and pos-app derives the
active affiliation from the JWT `MerchantId` claim
([`SignalrProvider.tsx:95`](../../../pos-app/src/providers/SignalrProvider.tsx)).
super-app proved that claim lags one issuance behind a switch, which is why
[`useActivePartyId`](../../../super-app/src/hooks/useActivePartyId.ts) reads
`isPrimary` off the affiliation list instead. So T1 cannot be fixed by adding a
refetch: until the active-party source of truth is corrected there is no right
value to refetch *for*. `changeAffiliation` also never remounts
`MerchantProvider`, so today a switch leaves product groups and `merchantId` on
the previous affiliation indefinitely.

**T6 is blocked by `signOut`.** It calls `AsyncStorage.clear()`
([`SessionProvider.tsx:346`](../../../pos-app/src/providers/SessionProvider.tsx)),
wiping every key — including `debug_tenantId`, `app_environment` and `locale`.
No amount of tenant-memory work survives that, so T6 waits on the same
selective-sign-out change T8 needs.

## Decisions

Agreed with the user before any code:

1. **Port the full super-app UI kit** rather than approximating it on pos-app's
   thinner one, and rather than porting only the pieces the tag screens touch.
2. **Tag-detail actions use pos-app's `ModalTemplate` footer**, extended with a
   secondary slot, tier prominence and an overflow sheet — not super-app's
   `BlobActionRow` chain. A merchant can hold four tag actions (assign
   traveller, change sales person, print, refund), so the overflow is required,
   not optional.
3. **Full merchant slice of the tag feature**: server-side search, a status +
   issue-date filter sheet, sort toggle, 20-per-page pagination,
   pull-to-refresh, the five list states, and the grant-gated summary bar.
4. **Preferences are per user; hardware and pre-login state stay shared.**
   `hideSignatures`, `afterTagCreate`, `saleScreenVersion`, `receiptTemplate`,
   `diditWorkflowId` and `createdTagIds` become per-user. Printer type,
   bluetooth pairing, line length, learned card-reader capabilities,
   `debug_tenantId`, `app_environment` and `locale` stay device-global — the
   first three describe the terminal, the last three are read before any user
   exists.
5. **No glass, no landscape.** Both are structural in this repo: there is no
   `ios/` directory at all, and portrait is locked twice
   ([`app.config.js:6`](../../../pos-app/app.config.js) and
   `android:screenOrientation="portrait"` in `AndroidManifest.xml:21`).

Consequences of (1) crossed with (2) and (5):

- **Not ported:** `BlobActionRow` and `ActionFooterRow` (decision 2 removes
  their only consumer), `GlassIsland` (no tab island), the whole
  `Tag/landscape/` tree, `useLandscape`, `TAG_TABLE_MIN_WIDTH_DP`,
  `isTabletDevice`, and the `Tags.Table.*` / `Tags.Rail.*` namespaces.
- **`BlobMaterial` ports SVG-only.** Its `GlassContainer`/`GlassView` branch is
  iOS 26 and its `BlurView` branch is pre-26 iOS; Android has always fallen
  through to a flat `react-native-svg` `Path` filled `colors.card` at
  `fillOpacity` 0.92 with a hairline `colors.border` stroke — super-app chose
  that after measuring Android blur at 24% janky frames on the tag list. So
  dropping glass loses nothing Android-to-Android. No `expo-blur` or glass
  dependency is added; `react-native-svg` 15.12.1 is already present.
- `BlobRow` / `blobChain` / `BlobMaterial` still come across, serving exactly
  one consumer: `BlobPagination`, which decision 3 requires.
- i18n lands at roughly **165 keys × 2 locales** rather than ~310.

## Sub-projects

| # | Sub-project | Covers | Depends on |
| --- | --- | --- | --- |
| SP1 | Session boundary hygiene | T2, T8, half of T1 | — |
| SP2 | Active affiliation as source of truth | rest of T1, correctness half of T7 | SP1 |
| SP3 | Tenant memory on login | T6 | SP1 |
| SP4 | UI kit foundation | substrate for T3/T4/T5 | — |
| SP5 | Tag list parity | T3 | SP2, SP4 |
| SP6 | Tag detail parity + action footer | T4, T5 | SP4, SP5 |
| SP7 | Affiliation switcher UI | UI half of T7 | SP2, SP4 |

Waves, sequenced so nothing edits the same file concurrently — SP1, SP2 and SP3
all touch `SessionProvider`, so they cannot overlap:

- **Wave 1:** SP1 ‖ SP4
- **Wave 2:** SP2, then SP3
- **Wave 3:** SP5 ‖ SP7
- **Wave 4:** SP6

## Constraints every sub-project inherits

**Do not edit the `core`-mirrored files.** [`AGENTS.md`](../../../pos-app/AGENTS.md)
lists them: `src/config/{appConfigTypes,appConfigKeys,appConfigParse,isHostTenant,normalizeApplicationConfiguration}.ts`,
`src/actions/AccountService/types.ts`, `src/store/user.ts`, and
`src/store/application-configuration.ts` above its
`// Everything below is a pos-app-only addition` marker. Both stores already
expose the clear functions this program needs, so nothing has to change in
them — but a session-reset hook must not be added *inside* one. `src/store/merchant.ts`
and `src/store/traveller.ts` are not mirrored and are free to change.

**`fetchRequest` has the opposite contract to super-app's.** pos-app's returns
`{success, data, message}` and never throws; super-app's returns `T` and throws.
Every ported line that uses `try`/`catch` to detect an API failure is dead code
here — which is already why `SignalrProvider.changeAffiliation` has no error to
show. Ported code gets rewritten against `ApiResult`, not adapted.

**Gates**, re-measured per sub-project rather than quoted from here:
`npm run typecheck` clean, `npm test` at 39 suites / 441 tests, `npm run lint`
at 0 errors / 35 warnings. `prettier --check` is not a gate (228 files fail at
baseline) — format only touched files, never a mirrored one. `npm run init`
must run before `tsc` can see a new i18n key.

**pos-app is light-only** (`userInterfaceStyle: "light"`), so the ported
`theme.ts` carries the light palette only.
