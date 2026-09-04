# Design: Customs actions on the super-app tag detail

**Date:** 2026-08-31
**Repo:** `super-app`
**Branch point:** `f0298fe` (`main`) — "fix(super-app): repair the duplicate-merge damage on main".

**Scope:** four customs actions added to the tag detail's pinned footer, reusing the two sheets and the payload builder the bulk Validate screen already has; three predicates in `src/utils/customsTags.ts` widened to serve both screens; one new pure selector plus its tests; two new action wrappers for the risk-correction endpoints; two new render tests; a handful of localization keys in both resources.

## Goal

A customs officer looking at one tag can act on it there — export-validate it, deny it, or correct a decision already committed — without going back to the bulk Validate screen and finding it in a list.

## Why

super-app already does customs validation, but only in bulk. `screens/customs/Validate` selects many tags and acts on them together, via [`ExportValidateSheet`](../../../super-app/src/screens/customs/Validate/_components/ExportValidateSheet.tsx) and [`DenyReasonsSheet`](../../../super-app/src/screens/customs/Validate/_components/DenyReasonsSheet.tsx). The tag detail screen — the screen you land on from a QR scan, from the tags list, from a notification — offers a customs officer **nothing at all**. `canIssueTags(role)` is false for customs and `isMerchant` is false, so both footer slots on that screen are empty for them today.

The web portal has the same actions on its tag detail, so this is a parity gap as well as a usability one.

Two facts discovered while designing this make the slice much smaller than it first appeared, and both are worth recording because they contradict reasonable assumptions:

1. **Eligibility ships inline.** `isCurrentUserEligible` is a field on `UniRefund_TagService_Tags_TagRiskInfoDto`, and `TagDetailDto.risk` is that same block. The web tag detail page calls a separate `getTagRiskEligibilityApi` ([page.tsx](../../../web-app/apps/web/src/app/%5Blang%5D/%28main%29/%28unirefund%29/operations/tax-free-tags/%5BtagId%5D/page.tsx)) — mobile does not need to. **This slice adds no new reads.**
2. **The correction endpoints reuse the existing payloads.** `CorrectTagRiskOutcomesToApprovedDto.items` is `ExportValidateTagItem[]` — the same shape the bulk export-validation already sends — and `CorrectTagRiskOutcomesToDeniedDto.items` is `DenyTagRiskOutcomeItem[]`, the same shape the batch deny already sends. **This slice adds no new UI.**

## Decisions (agreed with user)

1. **Correction endpoints are in scope.** A tag whose customs decision is final is *not* merely explained — it can be changed. This is a new capability for mobile: `isTagSelectable` currently excludes finally-decided tags precisely because "mobile has no correction endpoints", and that comment stops being true.
2. **Pinned footer buttons**, not a menu and not inside the Risk block. Reuses the `action` / `secondaryAction` slots added to `ModalTemplate` in the tag-detail rebuild. Customs sees no footer actions today, so nothing is displaced.
3. **Both correction actions are confirmed, not fired on tap.** Re-approving a denied tag and revoking an export-validated one both reverse a decision customs has already committed. The web equivalents sit behind a desk and a dialog; a phone in an airport is a worse place to do it by accident.
4. **Each button reads its own grant.** Four separate permissions govern these, and a user may hold some and not others.

## The action matrix

Which actions a tag offers is a function of its final decision and the caller's grants:

| `risk.finalRiskLevel` | Primary | Secondary | Endpoint | Payload |
| --- | --- | --- | --- | --- |
| absent | Export validate | Deny | `putApiTagServiceTagExportValidations` / `postApiTagServiceTagRiskOutcomesDeny` | `ExportValidateTagItem` / `DenyTagRiskOutcomeItem` |
| `Red` (denied) | Re-approve | — | `postApiTagServiceTagRiskOutcomesCorrectToApproved` | `ExportValidateTagItem` |
| `Green` (validated) | — | Revoke | `postApiTagServiceTagRiskOutcomesCorrectToDenied` | `DenyTagRiskOutcomeItem` |

Grants, one per action:

- Export validate → `TagService.Tags` + `TagService.Tags.ExportValidations`
- Deny → `TagService.TagRisks` + `TagService.TagRisks.DenyOutcomes`
- Re-approve → `TagService.TagRisks` + `TagService.TagRisks.CorrectOutcomesToApproved`
- Revoke → `TagService.TagRisks` + `TagService.TagRisks.CorrectOutcomesToDenied`

Above all of it sits eligibility: no action is offered unless `isTagActionable(tag)` — Green tags are actionable anywhere, any other level requires the backend to have marked this user eligible for the tag's active flags. An ineligible tag shows **why** instead of a dead control; that explanation is something the bulk list cannot give, because there a non-selectable row is simply un-tappable.

## The selector

The decision above is pure, so it lives in `src/utils/customsTags.ts` beside the predicates it builds on, and is where the tests concentrate.

```ts
export type CustomsTagAction =
  | "exportValidate"
  | "deny"
  | "correctToApproved"
  | "correctToDenied";

export interface CustomsActionGrants {
  exportValidate: boolean;
  deny: boolean;
  correctToApproved: boolean;
  correctToDenied: boolean;
}

/** Which customs actions this tag offers this user, in footer order. */
export function customsActionsFor(
  tag: { risk?: UniRefund_TagService_Tags_TagRiskInfoDto },
  grants: CustomsActionGrants,
): CustomsTagAction[];
```

Three existing predicates — `isTagActionable`, `hasFinalDecision`, `isTagSelectable` — are typed to `UniRefund_TagService_Tags_TagListItemDto` today but read nothing except `risk`. They widen to the same structural `{ risk?: TagRiskInfoDto }` parameter so one definition serves the list and the detail. That is the whole change to them; their logic is unchanged, and `CustomsTagRow` keeps compiling because a `TagListItemDto` satisfies the structural type.

`isTagSelectable` keeps its current meaning — actionable *and* not finally decided — because the bulk screen still cannot correct. Its docblock, which today explains that exclusion by saying mobile has no correction endpoints, needs rewriting: the endpoints exist after this change, they are simply not wired into the bulk flow.

## Wiring

**New actions** in `src/actions/TagService/post.ts`, beside `postTagRiskDenyBatchApi`. Note the existing pair is split across two files by HTTP verb, per this repo's action-file convention: `postTagRiskDenyBatchApi` lives in `post.ts`, `putTagExportValidationsApi` in `put.ts`. Both new endpoints are POSTs, so both go in `post.ts`:

```ts
postTagRiskCorrectToApprovedApi(items: ExportValidateTagItem[])
postTagRiskCorrectToDeniedApi(items: DenyTagRiskOutcomeItem[])
```

The two existing wrappers — `putTagExportValidationsApi` ([put.ts:27](../../../super-app/src/actions/TagService/put.ts#L27)) and `postTagRiskDenyBatchApi` ([post.ts:87](../../../super-app/src/actions/TagService/post.ts#L87)) — already take arrays, so the single-tag case is a one-element array. Each item carries its own `tagId` (`ExportValidateTagItem.tagId`, `DenyTagRiskOutcomeItem.tagId`), so a one-element array is self-describing and needs no separate id argument. `DenyTagRiskOutcomeItem.reasons` must be non-empty — an empty list is rejected with `TagRiskOutcomeReasonsRequired`, which `DenyReasonsSheet` already enforces inline. All four responses are per-item result lists, and [`summarizeResults`](../../../super-app/src/utils/customsTags.ts) already counts them without treating a nullish `succeeded` as success. A one-element batch that comes back `succeeded: false` is a *failed* action with a business reason, not an error — the toast must say so rather than claiming success.

**`TagDetailScreen`** gains: the footer actions from `customsActionsFor`, the two sheets, a confirmation step for the two corrections, and a `reload()` after any success — the same pattern the assign-traveller flow already uses, including its blocking overlay while the request is in flight.

Both sheets are hosted at **screen level**, never inside another sheet's children: a hook called inside a `<BottomSheet>` child loses context in this app — `useToast()` throws and `useLocalization()` silently renders raw i18n keys.

## Error handling

- A rejected request keeps the screen as it is and toasts the failure; the tag is unchanged and the officer can retry.
- A resolved request whose single item reports `succeeded: false` is reported as a refusal, with the server's `errorMessage` when it sent one. `TagExportValidationResultDto` carries `errorCode` and `errorMessage` for exactly this.
- A successful action reloads the detail, so the status badge, the progress rail and the risk block all restate the new truth rather than the screen guessing at it.
- Ineligible or ungranted tags render an explanation, not a disabled button.

## Testing

The logic is in the selector, so that is where the tests are:

- `customsActionsFor` across the matrix — no final decision, final Red, final Green — crossed with each grant present and absent, plus the ineligible case returning nothing at all.
- The widened predicates keep their existing tests and gain one apiece proving a `TagDetailDto`-shaped object is accepted.
- Render tests (`*.router.test.tsx`, the project that can resolve `react-native`): which buttons appear per state; an ineligible tag showing the reason rather than a control; a correction action opening a confirmation before its sheet.
- A one-element batch returning `succeeded: false` surfacing as a failure — the case `summarizeResults` exists for and the one most likely to be mis-reported as success.

Gates are `npm run typecheck` and `npm test`; this repo has no CI. `npm run init` must run before typecheck sees a new i18n key. The known baseline failure is `ui/__tests__/tokens.test.ts`.

## Out of scope

- **The bulk Validate screen keeps its current rule.** Correcting from the list means selecting a mix of finally-decided and undecided tags and routing them to different endpoints; that is its own design.
- **Merchant and refund-point actions** — later slices, per the agreed decomposition.
- **`getTagRiskEligibilityApi`** — unnecessary, per the finding above.
