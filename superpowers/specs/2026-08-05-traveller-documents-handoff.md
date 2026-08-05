# Traveller documents page — handoff

**Date:** 2026-08-05
**Repo:** `super-app`
**Branch:** `feat/traveller-documents` (14 commits, `4ee89a1..e8d8c0c`, 27 files, +1857/−51)
**Spec:** `2026-08-05-traveller-documents-page-design.md`
**Plan:** `../plans/2026-08-05-traveller-documents-page.md`

Built by subagent-driven execution: one implementer per task, a task-scoped review
after each, then a whole-branch review and one fix wave. Every task's review came
back clean; Task 8 needed one fix round.

## What shipped

| Commit | |
| --- | --- |
| `c469bcf` | i18n: `MobileApp.Documents.*` in en-US and tr-TR |
| `e6c6de5` | `JwtUser.TravellerDocumentId` + `getTravellerDocumentIdFromClaims` |
| `d884b7a` | `postProveDocumentApi` / `postSetPrimaryDocumentApi` / `postSetActiveDocumentApi` |
| `44394d1` | `useDiditVerify` extracted out of `useTravellerDidit` |
| `54b4ab2` | `useTravellerDocuments` (add + set-primary) |
| `00602ee` | `DocumentCard` |
| `b0cfe84` | `DocumentsScreen`, the `profile/documents` route, the Profile row |
| `5a75490` | `useDocumentSwitcher` (set-active + token refresh) |
| `28f9cdf` | strengthened the switch-then-refresh ordering test |
| `3221cb0` | `DocumentSwitcherSheet`, `ActiveDocumentPill`, `TabPage.headerAccessory` |
| `f866ac1` | prettier (11 branch-owned files) |
| `297d2d9` | **fix(auth):** await `getUserData` before `fetchNewAccessToken` resolves |
| `6c5e721` | **fix:** close the switcher sheet on a stale-session outcome |
| `e8d8c0c` | docs: point `useTravellerDidit`'s comment at `useDiditVerify` |

Traveller entry points: **Profile → Documents** (list, add, set-primary) and a
**pill in the Home header** (switch which document the session acts as).

## Two decisions taken during execution

**1. `SessionProvider.fetchNewAccessToken()` was fixed even though the plan did not
list that file.** It returned `success` while the inner `getToken(…).then(…)` chain
— containing the `getUserData` call that decodes the new JWT into `useUserStore` —
ran detached. The switcher therefore reported success and dismissed its sheet
before the Home pill could relabel. The token itself was never at risk
(`actions/auth/actions.ts:114` awaits `saveToken` before resolving, so API calls
always used the new token); only the UI lagged. Now awaited. **The resolved value
is deliberately still the token-refresh outcome, not `getUserData`'s** —
`SignalrProvider.tsx:171` is the other caller and the two mean different things.

**2. `switchTo` returns a three-way outcome, not a boolean.** The spec's error table
said the sheet closes on "switched but session stale"; the plan's contract said
`switchTo` returns a boolean, which cannot distinguish that from an outright
failure — so the sheet wrongly stayed open. The contradiction was the plan's, not
the implementation's. The spec governs:

```ts
export type DocumentSwitchOutcome = "success" | "failed" | "stale-session";
```

`"failed"` keeps the sheet open for a retry; `"success"` and `"stale-session"` both
dismiss it, because in both cases the switch really happened and the sheet's
checkmark would otherwise point at the wrong document.

## Verification state

**Verified:**

- `npm run typecheck` — clean.
- `npm run lint` — 31 problems, 0 errors, 31 warnings; **none in any file this
  branch created** (grep-confirmed). 31/0 is the pre-existing floor.
- `npm test` — **397 passed / 397, zero failing tests**, with exactly the 7
  pre-existing suite-load failures (see the Jest gotcha below).
- **Android native build** — `./gradlew assembleDebug`: `BUILD SUCCESSFUL in 36m 9s`,
  fresh 341 MB APK.
- **Installed and booted on a physical device** (Samsung SM-A022F / `R68RC05TWLA`):
  `ReactNativeJS: Running "main"`, no fatal exceptions. The two warnings that do
  appear (`SafeAreaView` deprecation, a `customFetch ↔ auth/actions` require cycle)
  are in files this branch never touched.
- **Metro bundles the whole app** — the Expo Router virtual entry returns HTTP 200,
  22 MB, and all eight new modules plus a `MobileApp.Documents.*` key are present in
  the bundle. This is the check `tsc` cannot give: it proves every new import
  resolves through Metro.

**NOT verified — needs a human with a traveller account and a real document:**

- [ ] Profile → Documents lists the account's documents with correct Primary and
      *in use* badges; back returns to Profile.
- [ ] Add document with a passport **already on the account** → *Document
      verification updated*, evidence badge reflects the new level, no duplicate row.
- [ ] Add document with a document **not** on the account → a new row appears.
- [ ] Cancel the Didit sheet mid-flow → no toast, no change to the list.
- [ ] Set primary on a non-primary document → badge moves, previous primary loses it.
- [ ] An account **without** `TravellerService.SSRActions.ProveDocument` → Add button
      disabled with the not-permitted copy, and tapping starts no verification.
- [ ] Home header: no pill for a staff login; a plain label for a single-document
      traveller; a pressable pill for a multi-document traveller.
- [ ] Switch active from the pill → the pill relabels without restarting the app, and
      a subsequent tag or refund request acts as the new document.
- [ ] Airplane mode on the Documents page → load-failed pane with a working Retry.
- [ ] Turkish locale → every new string renders translated, no raw
      `MobileApp.Documents.*` keys on screen.

**Cannot be verified on this host:** `npm run ios` — Windows machine, no Xcode.
`AGENTS.md` asks for both platforms before a PR, so iOS needs a Mac.

## Jest gotcha worth knowing

`npm test` at the repo root currently reports **75 suites / 33 failing tests**. That
is not this branch. `.claude/worktrees/` sits inside the repo root, so Jest crawls
sibling worktrees and runs another session's in-progress tests. To measure this repo
alone:

```bash
npx jest "^(?!.*worktrees).*$"
```

which gives 7 failed / 34 passed suites and 397/397 tests. The 7 are pre-existing
render-based suites sitting in the wrong Jest project (five in
`src/components/__tests__/`, two in `src/templates/__tests__/`); they fail to *load*,
not to assert, and `jest.config.js`'s own comments document why.

## Parked, deliberately not fixed

1. **`SessionProvider.tsx:219-234`** — if `getUserData` *throws* (realistically only
   `decodeJWT` on a malformed token), the exception now reaches the trailing `.catch`
   and becomes `return false`, turning a successful refresh into a reported failure.
   Before the fix it was an unhandled rejection with no effect on the resolved value.
   Low probability (the token was just read from storage successfully),
   `SignalrProvider` ignores the return value, and `useDocumentSwitcher` mapping it to
   `"stale-session"` is arguably the more honest signal.
2. **Test output is not pristine** — rendering `@/components/Ionicons` emits an
   `act(...)` warning because `@expo/vector-icons` sets state from an async font load.
   Pre-existing repo-wide; a `jest-setup.ts` mock would silence it.
3. **`key={id ?? affiliationId}`** in `DocumentsScreen` and `DocumentSwitcherSheet` is
   `undefined` if a row has neither optional id. Dev-console key warning only.
4. **The two hooks fetch the affiliations list independently** and derive
   `activeDocumentId` separately. A deliberate spec choice — the JWT claim is the only
   value that must agree across surfaces, and both read it from the same live Zustand
   subscription. But if both mount at once that is two calls, and a mutation through
   one will not refresh the other.
5. **No `addDocument` re-entrancy test** while `isAdding` is true (`setPrimary` has the
   equivalent). Guard is correct by inspection.
6. **`DocumentCard.tsx` import order** puts `react-native` between the `@/…` and
   relative imports — matches `CardsScreen.tsx`, so it is local convention.
7. **No `customHeaders` pass-through assertion** on set-primary / set-active.

## Device left in this state

The debug build on `R68RC05TWLA` needs Metro to run. A Metro instance was started
with `npx expo start --port 8081 --offline` and `adb -s R68RC05TWLA reverse tcp:8081
tcp:8081` is set. **`--offline` is required on this host** — plain `expo start`
crashes in its dependency-version doctor because it cannot reach expo.dev
(`TypeError: fetch failed`), even though `dev-api.unirefund.com` is reachable.
Stop Metro when finished with manual testing.
