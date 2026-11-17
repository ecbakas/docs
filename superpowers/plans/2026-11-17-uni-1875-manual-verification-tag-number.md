# UNI-1875 Manual Verification by Tag Number: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agents can review and complete sticker pairs that cite a tax-free **tag number**, and travellers can upload them. web-app adopts backend 2384 on dev.

**Architecture:**
- **API client.** Regenerate the TagService client, then add one server action for `assign-traveller`.
- **Action choice.** Whether a pair is completed by assigning or by creating comes from a pure, tested helper, `pairCompletion`.
- **Upload validation.** The ssr "at least one number" rule is a pure, tested helper, `uploadNumbers`.
- **UI.** Components use these helpers; they don't re-derive the rules.

**Tech Stack:** Next.js 16 (web: turbopack, ssr: webpack), React 19, TypeScript 6, pnpm 10.32. Unit tests use Node's runner (`node --import tsx --test`, `.ts` only).

**Spec:** `c:\unirefund\docs\superpowers\specs\2026-11-17-sticker-and-email-verification-web-app-design.md`, Workstream 1 and "Decisions from the builder check" item 1.

**Worktree:** `C:\unirefund\web-app-wt-manual-verification`, branch `feat/uni-1875-manual-verification-tag-number`, from main `31652b294`. Already installed. `apps/web/.env` and `apps/ssr/.env` are copied in.

## Global Constraints

- **Dev only.** The PR may merge as soon as it is ready; there are no UAT or production gates.
- **Backend calls.** Only through `@repo/actions`. GET actions `throw structuredError`; POST actions `return structuredError`.
- **Strings.** Every visible string in both `en.json` and `tr.json`. Turkish reuses existing terms: "Etiket numarası" = tag number, "Etiket satır numarası" = sticker line number, "Fotoğraf çifti" = picture pair.
- **`data-testid`** on every `Label`, `Link`, `Button` and `Input`. Use kebab-case, prefixed with the feature.
- **Permission gates use the endpoint's full pair:**
  - assign: `["TagService.Tags","TagService.Tags.AssignTravellerByManualVerification"]`
  - create: `["TagService.Tags","TagService.Tags.CreateByManualVerification"]`
  - upload: `["TagService.StickerManualVerifications","TagService.StickerManualVerifications.Upload"]`
- **Without the grant, controls are not rendered.** They are never merely `disabled`.
- **No `useEffect`** except for timers or external subscriptions.
- **Do not edit** `packages/utils` or `packages/ayasofyazilim-ui` (submodules) or `packages/core-saas`.
- **Gates to hold** (AGENTS.md):
  - `pnpm --filter web type-check`: at most the 2 baseline TS2307 `capture-core/detectors/mrz` errors;
  - `pnpm --filter ssr type-check`: clean;
  - lint: no new errors;
  - `pnpm policy:audit`, `pnpm grid:keys`, `pnpm i18n:missing --app=web`: green.
- **`pnpm run init`** (in `apps/web` and `apps/ssr`) must run before any type-check after i18n keys change.
- **Error codes on dev** look like `UniRefund.TagService:0100148`. Match by suffix: `code?.endsWith("TagService:0100148")`.

## Review Focus

1. **A pending pair with both numbers is completed by assign**, never by create. The backend refuses create for any pair with a tag number (`0100146`). Pinned by a test in Task 2.
2. **Whitespace-only numbers count as absent,** both in an uploaded body and in a pair read back. Pinned by tests in Tasks 2 and 5.
3. **A pending pair with neither number** shows no completion action, only Reject. The heading falls back to the generic title, and the page does not crash. Pinned by tests in Task 2 (`pairCompletion` and `pairReference` return `null`).
4. **An agent without the assign grant sees no "Complete against tag" control at all,** not a disabled one. This is JSX, so it is not unit-testable. Checked in the Task 4 review step and in the manual QA in Task 7.
5. **"Upload again" on a rejected tag-number pair** pre-fills the tag number, not an empty sticker line. Checked in the manual QA in Task 7.

---

### Task 1: Regenerate the TagService client and add the assign action

**Files:**
- Modify (generated): `packages/saas/TagService/{sdk.gen.ts,types.gen.ts,schemas.gen.ts,TagServiceClient.ts,index.ts}`
- Modify: `packages/actions/unirefund/TagService/post-actions.ts`

**Interfaces:**
- **Produces:**
  - `postTagByManualVerificationAssignTravellerApi(data: PostApiTagServiceTagByManualVerificationAssignTravellerData)`, returning `ServerResponse<TagDto>`;
  - the regenerated types: `tagNumber?: string | null` on the four sticker DTOs, `contactEmail` on the list and detail DTOs, and `tagNumber` on `GetApiTagServiceStickerManualVerificationData`.
- **Note:** use the exact generated type and method names the regeneration emits. They are expected to be `PostApiTagServiceTagByManualVerificationAssignTravellerData` and `client.tag.postApiTagServiceTagByManualVerificationAssignTraveller`.

- [ ] **Step 1: Regenerate.**
  - In `packages/saas`, run `node index.mjs -u "https://dev-api.unirefund.com" -f Tag`.
  - Then run `npx prettier --write "TagService/**/*.ts" "core/*.ts" --trailing-comma es5`.
  - Use `index.mjs`, never `new.mjs`.
- [ ] **Step 2: Drop the line-ending-only churn.**
  - Run `git checkout -- packages/saas/core`.
  - For each of `TagServiceClient.ts` and `index.ts`: if `git diff --ignore-cr-at-eol --numstat <file>` is empty, `git checkout -- <file>`.
  - Expected: `git diff --ignore-cr-at-eol --stat packages/saas` lists only TagService files, and `grep -c "tagNumber" packages/saas/TagService/types.gen.ts` is greater than 0.
- [ ] **Step 3: Add the action.** Add `postTagByManualVerificationAssignTravellerApi` to `post-actions.ts` beside `postTagByManualVerificationApi`, following the same POST pattern (`getTagServiceClient()`, `structuredResponse`, `return structuredError`).
- [ ] **Step 4: Type-check both apps.**
  - Run `pnpm run init` in `apps/web` and in `apps/ssr`, then `pnpm --filter web type-check` and `pnpm --filter ssr type-check`.
  - Expected: web shows only the 2 baseline errors; ssr is clean. Fix any new error caused by a field becoming nullable, by null-safe reads only. No behaviour change in this task.
- [ ] **Step 5: Commit.**
  - `git add packages/saas/TagService packages/actions/unirefund/TagService/post-actions.ts` (plus any null-safety fixes).
  - Commit message: `chore(saas): regenerate TagService for manual verification by tag number`.

---

### Task 2: The pair-completion helper (web)

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/_components/pair-completion.ts`
- Test: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/_components/pair-completion.test.ts`

**Interfaces:**
- **Produces:**
  - `type PairNumbers = { stickerLineNumber?: string | null; tagNumber?: string | null }`
  - `pairReference(pair: PairNumbers): string | null`. Returns the trimmed tag number, else the trimmed sticker line, else `null`.
  - `pairCompletion(pair: PairNumbers & { status?: "Created" | "Invalid" | "Completed" }): "assign" | "create" | null`.
- **Rules for `pairCompletion`:** `null` unless the status is `"Created"`. Otherwise `"assign"` when the tag number is non-blank, `"create"` when only the sticker line is non-blank, and `null` when neither is.
- **The module imports nothing at runtime** (type imports only), so Node's runner can load it.

- [ ] **Step 1: Write the failing tests** (`node:test` with `node:assert/strict`, as in `apps/web/src/utils/date-input-value.test.ts`):

```ts
describe("pairCompletion", () => {
  it("assigns a pending pair that cites a tag", () =>
    assert.equal(pairCompletion({ status: "Created", tagNumber: "TUR-1" }), "assign"));
  it("assigns when both numbers are present", () =>
    assert.equal(pairCompletion({ status: "Created", tagNumber: "TUR-1", stickerLineNumber: "L-9" }), "assign"));
  it("creates for a sticker-line-only pair", () =>
    assert.equal(pairCompletion({ status: "Created", stickerLineNumber: "L-9", tagNumber: null }), "create"));
  it("treats a blank tag number as absent", () =>
    assert.equal(pairCompletion({ status: "Created", tagNumber: "  ", stickerLineNumber: "L-9" }), "create"));
  it("offers nothing when neither number is present", () =>
    assert.equal(pairCompletion({ status: "Created" }), null));
  it("offers nothing once reviewed", () => {
    assert.equal(pairCompletion({ status: "Invalid", tagNumber: "TUR-1" }), null);
    assert.equal(pairCompletion({ status: "Completed", stickerLineNumber: "L-9" }), null);
  });
});
describe("pairReference", () => {
  it("prefers the tag number", () =>
    assert.equal(pairReference({ tagNumber: " TUR-1 ", stickerLineNumber: "L-9" }), "TUR-1"));
  it("falls back to the sticker line", () =>
    assert.equal(pairReference({ tagNumber: "", stickerLineNumber: "L-9" }), "L-9"));
  it("is null with neither", () => assert.equal(pairReference({}), null));
});
```

- [ ] **Step 2: Run the tests and see them fail.** Run `pnpm --filter web test:unit`. Expected: FAIL, because the module is not found.
- [ ] **Step 3: Implement** both functions in `pair-completion.ts`.
- [ ] **Step 4: Run the tests and see them pass.** Run `pnpm --filter web test:unit`. Expected: PASS, with the suite count up by 9 and 0 failures.
- [ ] **Step 5: Commit.** Message: `feat(web): pick the manual-verification completion from the pair's numbers`.

---

### Task 3: Portal list, with the tag number column and filter

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/_components/table.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/page.tsx`
- Modify: `apps/web/src/language-data/unirefund/TagService/resources/{en,tr}.json`

**Interfaces:** consumes nothing new from the earlier tasks. The schema columns come from the regenerated `$UniRefund_TagService_Stickers_StickerManualVerificationListDto` (Task 1).

- [ ] **Step 1: Add the i18n keys** (en / tr):

| Key | en | tr |
|---|---|---|
| `ManualVerification.TagNumber` | "Tag number" | "Etiket numarası" |
| `ManualVerification.ContactEmail` | "Contact e-mail" | "İletişim e-postası" |
| `ManualVerification.Filter.TagNumberPlaceholder` | "Search by tag number" | "Etiket numarasına göre ara" |

- [ ] **Step 2: Update `table.tsx`.**
  - **Columns:** `["stickerLineNumber","tagNumber","travellerFullName","travellerDocumentNumber","contactEmail","status","creationTime","reviewedAt"]`.
  - **Column labels:** `t` gets `column.tagNumber` and `column.contactEmail`.
  - **Filter:** add a `tagNumber` server filter of `type: "string"`, after `stickerLineNumber`.
  - **Renderers:** both `stickerLineNumber` and `tagNumber` render a `RowLink` to the detail page, with testids `manual-verifications-line-${id}` / `manual-verifications-tag-${id}`. Each renders only when its value is non-blank, and an empty cell renders nothing. This way a pair with no sticker line is still reachable.
- [ ] **Step 3: Forward the filter in `page.tsx`.** Pass `tagNumber`, mirroring `stickerLineNumber`. Update the comment that lists the filter keys.
- [ ] **Step 4: Verify.**
  - Run `pnpm run init` (in `apps/web`), `pnpm --filter web type-check` (baseline 2) and `pnpm grid:keys` (exit 0).
  - Run `pnpm exec eslint "src/app/[lang]/(main)/(unirefund)/operations/manual-verifications"` in `apps/web`: 0 errors.
- [ ] **Step 5: Commit.** Message: `feat(web): list and filter manual verifications by tag number`.

---

### Task 4: Portal detail, with numbers, contact e-mail and "Complete against tag"

**Files:**
- Create: `apps/web/src/app/[lang]/(main)/(unirefund)/operations/manual-verifications/[id]/_components/complete-against-tag.tsx`
- Modify: `.../[id]/page.tsx`, `.../[id]/_components/details.tsx`
- Modify: `apps/web/src/language-data/unirefund/TagService/resources/{en,tr}.json`

**Interfaces:**
- **Consumes:**
  - `pairCompletion` and `pairReference` (Task 2);
  - `postTagByManualVerificationAssignTravellerApi` (Task 1);
  - `ManualVerification.TagNumber` and `ManualVerification.ContactEmail` (Task 3).
- **Produces:** `CompleteAgainstTag({ manualVerificationId: string; tagNumber: string })`, a client component.

- [ ] **Step 1: Add the i18n keys** (en / tr):

| Key | en | tr |
|---|---|---|
| `ManualVerification.Assign.Title` | "Complete against an existing tag" | "Mevcut etiketle tamamla" |
| `ManualVerification.Assign.Description` | "This pair was uploaded for tag {0}. Completing it adds the uploader to that tag; no new tag is created." | "Bu fotoğraf çifti {0} numaralı etiket için yüklendi. Tamamladığınızda yükleyen yolcu bu etikete eklenir; yeni etiket oluşturulmaz." |
| `ManualVerification.Assign.Submit` | "Complete against tag {0}" | "{0} etiketiyle tamamla" |
| `ManualVerification.Assign.Success` | "Pair completed. The traveller was added to tag {0}." | "Fotoğraf çifti tamamlandı. Yolcu {0} etiketine eklendi." |

- [ ] **Step 2: Create `complete-against-tag.tsx`.**
  - A bordered card (the same look as the create-tag form's container) with the title, the description (`{0}` = tag number) and one `Button` (`data-testid="manual-verification-assign-submit"`).
  - **Gate:** render `null` unless `isActionGranted(["TagService.Tags","TagService.Tags.AssignTravellerByManualVerification"], grantedPolicies)`.
  - **On click:** call the action with `{ requestBody: { manualVerificationId } }`, using `useTransition` and disabling the button while pending.
    - **Success:** `toast.success(Assign.Success)`, then `router.refresh()`.
    - **Failure:** show `result.message` in a persistent `text-destructive` paragraph under the button (`data-testid="manual-verification-assign-error"`), not a toast. For `0100148` the backend's text already tells the agent to reject.
- [ ] **Step 3: Update `details.tsx`.**
  - Add props `tagNumber`, `stickerLineNumber` and `contactEmail` (all `string | null | undefined`).
  - Render `Field`s for the tag number, the sticker line and the contact e-mail, each only when the value is non-blank.
  - Replace the docblock sentence saying the line number is "deliberately absent", because the heading may now show the tag number.
- [ ] **Step 4: Update `page.tsx`.**
  - **Heading:** `pairReference(pair) || t.TagService["ManualVerification.Detail.Title"]`.
  - **Details:** pass the three new props to `VerificationDetails`.
  - **Completion:** compute `const completion = pairCompletion(pair)`, then in the pending layout's right pane:
    - `"assign"` renders `<CompleteAgainstTag manualVerificationId={id} tagNumber={pair.tagNumber!.trim()} />`;
    - `"create"` renders the existing `CreateTagFromVerification`, with `stickerLineNumber={pair.stickerLineNumber!.trim()}`;
    - `null` renders neither (Reject stays in the header).
- [ ] **Step 5: Verify.**
  - Run `pnpm run init`, `pnpm --filter web type-check` (baseline 2), `pnpm policy:audit` (green: the new action's gate sits in the calling file) and eslint on the folder (0 errors).
  - **Review check:** without the grant, the card returns `null` (Review Focus 4).
- [ ] **Step 6: Commit.** Message: `feat(web): complete a tag-number pair against its existing tag`.

---

### Task 5: ssr upload, with the tag number field and the at-least-one rule

**Files:**
- Create: `apps/ssr/src/utils/verification/upload-numbers.ts`
- Test: `apps/ssr/src/utils/verification/upload-numbers.test.ts`
- Modify: `apps/ssr/src/components/verification/upload-verification-dialog.tsx`
- Modify: `apps/ssr/src/language-data/unirefund/SSRService/resources/{en,tr}.json`

**Interfaces:**
- **Produces:**
  - `uploadNumbers(input: { stickerLineNumber: string; tagNumber: string }): { stickerLineNumber?: string; tagNumber?: string } | null`. Trims both values and omits the blank ones. Returns `null` when both are blank.
  - `UploadVerificationDialog` gains optional props `initialStickerLineNumber?: string` and `initialTagNumber?: string`, used as initial state.

- [ ] **Step 1: Write the failing tests:**

```ts
it("keeps both trimmed numbers", () =>
  assert.deepEqual(uploadNumbers({ stickerLineNumber: " L-9 ", tagNumber: " TUR-1 " }), { stickerLineNumber: "L-9", tagNumber: "TUR-1" }));
it("omits a blank sticker line", () =>
  assert.deepEqual(uploadNumbers({ stickerLineNumber: "  ", tagNumber: "TUR-1" }), { tagNumber: "TUR-1" }));
it("omits a blank tag number", () =>
  assert.deepEqual(uploadNumbers({ stickerLineNumber: "L-9", tagNumber: "" }), { stickerLineNumber: "L-9" }));
it("is null when both are blank", () =>
  assert.equal(uploadNumbers({ stickerLineNumber: " ", tagNumber: "\t" }), null));
```

- [ ] **Step 2: Run the tests and see them fail.** Run `pnpm --filter ssr test:unit`. Expected: FAIL, because the module is not found.
- [ ] **Step 3: Implement `uploadNumbers`.** Then run `pnpm --filter ssr test:unit` and expect PASS.
- [ ] **Step 4: Add the i18n keys** (en / tr):

| Key | en | tr |
|---|---|---|
| `Verification.Upload.TagNumberLabel` | "Tax-free tag number" | "Etiket numarası" |
| `Verification.Upload.TagNumberPlaceholder` | "The number on your tax-free form" | "Tax-free formunuzdaki numara" |
| `Verification.Upload.NumbersHint` | "Enter the tag number, the sticker line number, or both from the same form." | "Etiket numarasını, etiket satır numarasını ya da aynı formdaki ikisini birden girin." |

- [ ] **Step 5: Update the dialog.**
  - Add `tagNumber` state, initialised from `initialTagNumber ?? ""`. The line number state is initialised from `initialStickerLineNumber ?? ""`.
  - Add a `Label`/`Input` pair (`upload-verification-tag-number-label` / `upload-verification-tag-number`) above the sticker line field.
  - Remove `required` and `<RequiredMark />` from the line number. Add the `NumbersHint` paragraph under the two fields.
  - Submit stays disabled while `uploadNumbers({ stickerLineNumber: lineNumber, tagNumber }) === null` (or a photo is missing, or the dialog is busy).
  - The request body spreads `uploadNumbers(...)` plus both pictures.
  - `reset()` also clears `tagNumber`.
  - QR pre-fill logic is unchanged and touches only the line number.
- [ ] **Step 6: Verify.** Run `pnpm run init` (in `apps/ssr`), `pnpm --filter ssr type-check` (clean) and eslint on the dialog and the new util (0 errors).
- [ ] **Step 7: Commit.** Message: `feat(ssr): upload a picture pair against a tag number`.

---

### Task 6: ssr "My uploads", showing the reference and "Upload again"

**Files:**
- Modify: `apps/ssr/src/app/[lang]/(main)/tags/_components/verification-list.tsx`
- Modify: `apps/ssr/src/language-data/unirefund/SSRService/resources/{en,tr}.json`

**Interfaces:**
- **Consumes:**
  - the `UploadVerificationDialog` initial props (Task 5);
  - `tagGrants(policies).uploadVerification`, from `@/src/components/tags/tag-grants`.

- [ ] **Step 1: Add the i18n keys** (en / tr):

| Key | en | tr |
|---|---|---|
| `Verification.TagNumber` | "Tag number" | "Etiket numarası" |
| `Verification.UploadAgain` | "Upload again" | "Tekrar yükle" |
| `Verification.TagAssigned` | "This tag was added to your tags." | "Bu etiket etiketlerinize eklendi." |

- [ ] **Step 2: Update `verification-list.tsx`.**
  - **Row title:** `Verification.TagNumber: {tagNumber}` when the tag number is non-blank, else `Verification.StickerLineNumber: {stickerLineNumber}`.
  - **Completed rows:** show `Verification.TagAssigned` when the pair has a tag number, else the existing `Verification.TagCreated`.
  - **Rejected rows:** an `Invalid` row shows a `Button` (`data-testid={`verification-upload-again-${item.id}`}`, `variant="outline"`, `size="sm"`). It is shown only when `tagGrants(policies).uploadVerification`, with `policies` from `useApplicationConfiguration()`.
  - **The dialog:** one `UploadVerificationDialog` is rendered by the list. It is keyed by the selected item's id plus an open counter, and gets `initialTagNumber` / `initialStickerLineNumber` from that item. On close, the selection clears.
- [ ] **Step 3: Verify.** Run `pnpm run init`, `pnpm --filter ssr type-check` (clean) and eslint on the file (0 errors).
- [ ] **Step 4: Commit.** Message: `feat(ssr): show the pair's tag number and re-upload a rejected pair`.

---

### Task 7: Gates, manual QA on dev, and the PR

**Files:** none new.

- [ ] **Step 1: Run the full gates** from the repo root:
  - `pnpm --filter web type-check`: 2 baseline errors;
  - `pnpm --filter ssr type-check`: clean;
  - `pnpm --filter web lint` and `pnpm --filter ssr lint`: 0 errors;
  - `pnpm --filter web test:unit` and `pnpm --filter ssr test:unit`: 0 failures;
  - `pnpm policy:audit`, `pnpm grid:keys`, `pnpm form:order`, `pnpm i18n:missing --app=web`, `pnpm i18n:unused --app=web` and `--app=ssr`.

  Record each result, and compare against the AGENTS.md baselines.
- [ ] **Step 2: Manual QA on dev.**
  - **Servers.** Start them detached:
    - web on port 3120: `pnpm --filter web dev --port 3120`;
    - ssr on port 3110, after stopping any earlier server still on 3110: `pnpm --filter ssr dev --port 3110`.
  - **Agent side (`siggi.refund`, Faroe Islands):**
    - the list shows the Tag number and Contact e-mail columns;
    - the tag-number filter round-trips through the URL;
    - the detail of a sticker-line pair shows the create form.
  - **Assign flow.** If a pending tag-number pair exists on dev, "Complete against tag" works, and on another traveller's tag it shows `0100148` inline. If none exists, say so in the PR.
  - **Traveller side (`tur-a25y29041`):**
    - the upload dialog shows both fields;
    - submit is blocked with no number;
    - an upload is refused with `0100145` (this traveller's primary e-mail is VIRTUAL until UNI-1920), and the backend message is shown.
  - **"Upload again"** on an Invalid pair pre-fills its number (Review Focus 5), if such a pair exists.
  - **Screenshots.** Take a second capture after the page settles.
- [ ] **Step 3: Push and open the PR.**
  - Push: `git push -u origin feat/uni-1875-manual-verification-tag-number`.
  - Create it with `gh pr create` against `main`, title `feat: manual verification by tag number (UNI-1875)`.
  - **Body:**
    - what changed, and why;
    - the dev Swagger differences from the wiki (no `email` on upload, no `isContactEmailVerified`);
    - the gate results;
    - the QA done, plus what could not be exercised on dev (e.g. no pending tag-number pair; upload blocked by `0100145` until UNI-1920);
    - the attribution line.
