# Upgrading a traveller document's evidence level

**Date:** 2026-08-05
**Repo:** `super-app`
**Builds on:** `2026-08-05-traveller-documents-page-design.md`, which shipped the
Documents page and explicitly left this out of scope: *"the `didit-upgrade-options`
endpoint (per-document evidence upgrade flow) — it is a separate endpoint with its
own decision surface (which upgrade, at what level) and does not belong in the same
screen as first-time proving."* This spec is that separate project.

## Problem

A traveller document carries an evidence level — `None`, `Low`, `Medium`, `High` —
and the Documents page now shows it on every row. It shows it and nothing more. A
traveller looking at a passport badged `Low` has no way to raise it, even though the
backend exposes exactly that: a per-document list of the Didit workflows that would
take it higher.

`GET /travellers/my-document-affiliations/{travellerDocumentId}/didit-upgrade-options`
is in the generated SDK with no wrapper and no caller.

## Goal

From the Documents page, a traveller can see what a given document can be upgraded
to and raise it, by running the Didit workflow the backend nominates for the target
level and proving the resulting session.

## What the backend gives us

```ts
// GET .../my-document-affiliations/{travellerDocumentId}/didit-upgrade-options
type DocumentDiditUpgradeOptionsDto = {
  travellerDocumentId: string;
  currentLevel: EvidenceLevel;
  upgradeOptions: Array<{ level: EvidenceLevel; workflowId: string }>;
};
```

Three properties of this contract drive the whole design:

1. **It is pre-filtered.** The SDK documents it as returning *"all upgradeable Didit
   workflow options (levels strictly higher than the document's current level)"*. An
   empty array therefore means nothing higher is on offer — the client never filters.
2. **It hands back an explicit `workflowId`.** Every existing Didit flow in this app
   resolves its workflow *from an SSR action type* via `utils/didit/workflow.ts`.
   Here the workflow is named by the API. That difference is the one real change to
   existing code this project needs.
3. **Step 3 needs no new endpoint.** Applying the upgrade is
   `POST /ssr-actions/prove-document` with the approved session — the wrapper
   `postProveDocumentApi` already exists.

It requires two grants the app does not check yet:
`TravellerService.Travellers` and
`TravellerService.Travellers.GetDocumentDiditUpgradeOptions`. Both are real keys in
`data/policies/policies.gen.json` (lines 596 and 621), so they typecheck against the
generated `Policies` union.

## Scope

| Surface | What changes |
| --- | --- |
| `hooks/useDiditVerify.tsx` | Gains `verifyWithWorkflow(workflowId)`; `verify(action)` delegates to it |
| `actions/TravellerService/actions.ts` | Gains `getDocumentUpgradeOptionsApi` |
| `screens/traveller/Documents/useDocumentUpgrade.ts` | *(new)* target, options fetch, `upgrade()` |
| `screens/traveller/Documents/_components/UpgradeDocumentSheet.tsx` | *(new)* the level picker |
| `screens/traveller/Documents/_components/DocumentCard.tsx` | Optional `onUpgrade` → an Upgrade pill |
| `screens/traveller/Documents/DocumentsScreen.tsx` | Sheet ref, pill wiring, not-permitted line |
| `screens/traveller/Documents/useTravellerDocuments.ts` | Gains `canUpgrade` |
| `localization/resources/{en-US,tr-TR}.json` | `MobileApp.Documents.Upgrade.*` |

Deliberately out of scope:

- **No downgrade.** No endpoint, and no reason a traveller would want one.
- **No bulk upgrade.** Each document is proved by its own verification session.
- **No caching options across sheet opens.** A completed upgrade invalidates them, so
  each open refetches. Caching would mean showing a level that is no longer offered.
- **`currentLevel` is shown only in the sheet header.** The row badge already carries
  the document's level; repeating it on the row would be redundant.
- **No web-app counterpart.**

## Design

### Splitting `useDiditVerify`

`useDiditVerify.verify(action)` today does two things: resolve an SSR action to a
workflow id, then run that workflow and reduce its five terminal states to *approved
`sessionId`* or *`null` plus the right toast*. Upgrading needs only the second half,
because the API already named the workflow.

```ts
verifyWithWorkflow(workflowId: string): Promise<string | null>   // the reducer
verify(action: SSRActionType): Promise<string | null>            // resolve, then delegate
```

`verify`'s signature does not change, so `useTravellerDidit`'s three auth flows
(login, register, password reset) and `useTravellerDocuments.addDocument` are
untouched. The five-state reduction continues to exist exactly once — which is the
reason that hook was extracted in the first place, and the reason this project must
not simply call `startVerificationWithWorkflow` a second time from a new hook.

### `useDocumentUpgrade`

```ts
export type UpgradeOutcome = "upgraded" | "other-document" | "aborted" | "failed";

useDocumentUpgrade(refreshList: () => Promise<unknown>): {
  target: TravellerDocument | null;
  currentLevel: EvidenceLevel | null;
  options: DiditWorkflowOption[];
  loading: boolean;
  error: string | null;
  isUpgrading: boolean;
  open(document: TravellerDocument): void;
  reload(): void;
  upgrade(option: DiditWorkflowOption): Promise<UpgradeOutcome>;
};
```

**`refreshList` is injected rather than re-derived.** The previous project's final
review parked a finding that `useDocumentSwitcher` and `useTravellerDocuments` each
fetch the affiliations list independently, so a mutation through one does not refresh
the other. This hook takes the list's `refresh` as a dependency instead of becoming a
third copy of that fetch.

**Four outcomes, not a boolean.** The previous project shipped `switchTo` returning a
boolean and had to be corrected, because a boolean could not distinguish "the switch
happened but the session is stale" from "the switch failed". The same trap is here in
a sharper form: `prove-document` resolves *which* document from the session's
document number, so a traveller who taps Upgrade on their passport and then scans a
different document has genuinely upgraded that other document. Merging that into
"success" would tell them their passport moved when it did not.

### The sheet and the pill

`DocumentCard` gains an optional `onUpgrade?: () => void`. Given it, the row renders
an Upgrade pill beside the existing Set-primary pill; without it, the row is exactly
as it is today — the same additive-prop discipline `TabPage.headerAccessory` follows.

`UpgradeDocumentSheet` is presentational: it takes `sheetRef`, `currentLevel`,
`options`, `loading`, `error`, `isUpgrading`, an `onRetry`, and an `onPick`, and owns
no state. It shows a spinner, then the level rows, or the empty state, or the
load-failed state with Retry.

**The sheet decides its own dismissal, from the outcome `onPick` resolves to:**

```ts
onPick: (option: DiditWorkflowOption) => Promise<UpgradeOutcome>;
// inside the sheet:
const outcome = await onPick(option);
if (outcome === "upgraded" || outcome === "other-document") {
  sheetRef.current?.dismiss();
}
```

Stated explicitly because the previous project left the equivalent rule implicit and
shipped a sheet whose dismissal contradicted its own spec. `"aborted"` and `"failed"`
must leave the sheet mounted; nothing else may dismiss it.

`DiditWorkflowOption` is a local alias for
`UniRefund_TravellerService_TravellerDocuments_DiditWorkflowOptionDto`
(`{ level: EvidenceLevel; workflowId: string }`), exported from `useDocumentUpgrade.ts`
so the sheet imports it from one place.

**Pill visibility:**

| Condition | Pill |
| --- | --- |
| `canUpgrade` false | Hidden on every row; one `Upgrade.NotPermitted` line under the list |
| `evidenceLevel === "High"` | Hidden — the endpoint filters to strictly-higher levels, so asking would spend a request to learn nothing |
| `evidenceLevel` absent | **Shown.** The field is optional on the DTO; when we do not know the level, let the fetch answer rather than guessing |
| otherwise | Shown |

```ts
canUpgrade = canAdd
  && grantedPolicies["TravellerService.Travellers"]
  && grantedPolicies["TravellerService.Travellers.GetDocumentDiditUpgradeOptions"]
```

`canAdd` — the existing `SSRActions` + `SSRActions.ProveDocument` pair — is part of
the conjunction because upgrading must *prove* as well as *read options*. Reading the
options and then being refused at the last step would waste the traveller's document
photos, the same reasoning that put the gate on the Add button.

A missing grant hides the pill rather than disabling it per row, but the reason is
still stated once under the list. A tenant misconfiguration that leaves no trace on
screen is invisible to both the traveller and whoever they report it to; repeating a
disabled chip on every row would be noise.

### Data flow

1. Tap the Upgrade pill → `open(document)` and present the sheet.
2. The hook fetches that one document's options — lazily, one request, never N
   requests for N rows.
3. Tap a level → `upgrade(option)`:
   - `verifyWithWorkflow(option.workflowId)` → `null` ⇒ **`"aborted"`**.
   - `postProveDocumentApi(sessionId)` rejects ⇒ **`"failed"`**.
   - Otherwise `await refreshList()`, then compare the returned `travellerDocumentId`
     with the target's: equal ⇒ **`"upgraded"`**, different ⇒ **`"other-document"`**.
4. The sheet dismisses on `"upgraded"` and `"other-document"` — in both cases
   something changed and the options on screen are now stale. It stays open on
   `"aborted"` and `"failed"`, where retrying is the sensible next action.

## Error handling

| Situation | Behaviour |
| --- | --- |
| `canUpgrade` false | Pill hidden everywhere; `Upgrade.NotPermitted` line under the list |
| Row already at `High` | Pill hidden; no request |
| Options fetch rejects | `Upgrade.LoadFailed` in the sheet + Retry running `reload()` |
| Options fetch returns `[]` | `Upgrade.NoneAvailable` in the sheet |
| `verifyWithWorkflow` → `null` | `"aborted"`; **no toast from this hook**; sheet stays open |
| `prove-document` rejects | `Upgrade.Failed` toast; sheet stays open |
| Returned id equals the target | `Upgrade.Success` with the new level; list refetched; sheet dismissed |
| Returned id differs | `Upgrade.OtherDocument` naming the number that changed; list refetched; sheet dismissed |
| Second tap while `isUpgrading` | Ignored, the guard shape `addDocument`'s `isAdding` uses |

**The empty state's copy is deliberately neutral** — "No upgrade is available for this
document right now." An empty array means *either* the document is already at the top
*or* the tenant has no workflow configured above its level. `currentLevel` would let
us tell them apart, but "already at the highest level" said to a traveller sitting at
`Low` because of a server misconfiguration would be a lie, and the misconfiguration
is not something they can act on. One sentence that is true in both cases.

**Nothing toasts on `"aborted"`.** `verifyWithWorkflow` has already shown the right
message for declined, pending and failed, and cancelled is deliberately silent
because the traveller chose it. A toast here would double every one of those.

## Localization

New keys under `MobileApp.Documents.Upgrade.*` in both
`localization/resources/en-US.json` and `tr-TR.json`, then `npm run init` to
regenerate the bundles — `TranslationKey` derives from the generated `en-US.gen.json`,
so `tsc` rejects a new key until that runs. Never edit `*.gen.json`; it is gitignored.

| Key | EN |
| --- | --- |
| `Pill` | Upgrade |
| `Title` | Upgrade document |
| `CurrentLevel` | Current level: {level} |
| `ToLevel` | Upgrade to {level} |
| `Upgrading` | Upgrading… |
| `NoneAvailable` | No upgrade is available for this document right now. |
| `LoadFailed` | Could not load upgrade options. |
| `Success` | Document upgraded to {level} |
| `OtherDocument` | That verification matched {number}, so it was updated instead. |
| `Failed` | Could not upgrade the document. Please try again. |
| `NotPermitted` | Upgrading a document is not available for your account. |

`Documents.Retry` is reused rather than duplicated. Interpolation is `{name}`-style,
per `providers/LocalizationProvider.tsx:28-33`.

**`{level}` is a nested lookup, not the raw enum value.** The three keys that
interpolate a level resolve it through `Documents.EvidenceLevel.*` first, so the level
name has one definition and stays consistent with the row badge:

```tsx
t("MobileApp.Documents.Upgrade.ToLevel", {
  level: t(`MobileApp.Documents.EvidenceLevel.${option.level}`),
})
```

Those level keys currently render as raw `None` / `Low` / `Medium` / `High`. Passing
`option.level` directly would happen to produce the same string today and silently
diverge the moment that copy changes again.

## Testing

Test files that render — components or `renderHook` — must be named
`*.router.test.ts(x)` or their suite fails to load under the default Jest project.
Measure the suite with `npx jest "^(?!.*worktrees).*$"`; a bare `npm test` at the repo
root also runs sibling worktrees' tests.

- **`getDocumentUpgradeOptionsApi`** — new
  `actions/TravellerService/__tests__/actions.test.ts`, mirroring the existing
  `post.test.ts` mock shape: the document id is sent as a **path** parameter, and
  `customHeaders` reach the client.
- **`useDiditVerify`** — two cases guarding the split: `verifyWithWorkflow(id)` runs
  that exact id and never calls `resolveWorkflowId`; `verify(action)` still resolves
  and then delegates. The seven existing terminal-state tests must pass **unedited**
   — if they need changing, the split leaked behaviour.
- **`useDocumentUpgrade`** — all four outcomes (`aborted` makes no POST; `failed`;
  `upgraded`; `other-document`), `refreshList` called after a successful prove, the
  `isUpgrading` re-entrancy guard, and an options-fetch rejection setting `error`.
- **`UpgradeDocumentSheet`** — loading, the options list, the empty state, load-failed
  plus a working Retry, `onPick` receiving the tapped option, and controls disabled
  while upgrading. **Not optional:** the previous project shipped a spec/code
  divergence precisely because its sheet had no test of its own and was stubbed to
  `() => null` everywhere it was rendered.
- **`DocumentCard`** — the Upgrade pill renders when `onUpgrade` is supplied and not
  otherwise, mirroring the existing set-primary pill tests.

**Manual checks** (need a traveller account and a real document):

- A document at `Low` shows the pill; one at `High` does not.
- Tapping it lists the levels the backend offers, with the current level in the header.
- Completing a higher-level Didit flow raises the badge on that row.
- Scanning a *different* document mid-flow reports the other-document message and
  moves that document's badge instead.
- Cancelling the Didit sheet leaves the upgrade sheet open with no toast.
- An account without the two upgrade grants sees no pill and the one explanatory line.
- Airplane mode with the sheet open shows the load-failed state and a working Retry.
- Turkish renders every new string.

## Non-goals

- No backend change; every endpoint already exists in the generated SDK.
- No regeneration of `src/saas/**`.
- No change to how `addDocument` reports added-vs-updated. Proving an existing
  document through **Add document** still says "Document verification updated"; that
  remains true, and the Upgrade flow simply has clearer messages of its own.
