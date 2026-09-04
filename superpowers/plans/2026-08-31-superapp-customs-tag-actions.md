# Customs Actions on the Tag Detail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customs officer viewing one tag can export-validate it, deny it, or correct a decision already committed — from that tag's own screen.

**Architecture:** Four actions in the tag detail's pinned footer. Which appear is decided by one pure selector over the tag's `risk` block and the caller's grants; the two sheets and the payload builder already exist on the bulk Validate screen and are reused unchanged. Two new POST wrappers cover the risk-correction endpoints, which take the same item shapes as the existing bulk calls.

**Tech Stack:** React Native 0.81 / Expo 54, TypeScript strict, NativeWind 4, Zustand, `@gorhom/bottom-sheet`, Jest (two projects: `node` and `router`).

**Spec:** `docs/superpowers/specs/2026-08-31-superapp-customs-tag-actions-design.md`

## Global Constraints

- **Repo:** `C:\unirefund\super-app`. Branch from `main` at `f0298fe` or later.
- **Colour is always a semantic token.** Never a Tailwind default-scale class (`bg-gray-200`), never a bare `bg-white`/`text-white`, never a raw hex. `src/components/ui/__tests__/tokens.test.ts` fails the build on all three.
- **Reach for `@/components/ui` first** — `Text`, `Button`, `Card`, `Badge` — before writing a class that sets colour, size or weight.
- **No hardcoded user-visible text.** Keys go in `src/localization/resources/en-US.json` and `tr-TR.json`, then `npm run init` regenerates the bundle `TranslationKey` derives from. Without that regen, `tsc` fails at the `t("…")` call site.
- **Never call generated SDK clients from screens.** Always add or reuse a wrapper under `src/actions/**`.
- **Tests that render must be named `*.router.test.tsx`** (or `.ts` for `renderHook`). Under the `node` project a rendered component reaches nativewind's web JSX runtime, which needs `react-native-web` — not a dependency here — so the suite fails to *load*.
- **Hooks called inside `<BottomSheet>` children lose context.** `useToast()` throws; `useLocalization()` silently renders raw i18n keys. Call them in the sheet's host and pass values down.
- **Gates:** `npm run typecheck` and `npm test`. No CI. Known baseline failure: `src/components/ui/__tests__/tokens.test.ts` (3 of 4 assertions) — do not add to it.
- **Avoid `useEffect`** for anything derivable or event-driven; prefer `useMemo`/handlers.

---

### Task 1: Widen the customs predicates to serve both screens

**Files:**
- Modify: `src/utils/customsTags.ts:105-140`
- Test: `src/utils/__tests__/customsTags.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `isTagActionable(tag: CustomsRiskBearing): boolean`, `hasFinalDecision(tag: CustomsRiskBearing): boolean`, `isTagSelectable(tag: CustomsRiskBearing): boolean`, and the exported type `CustomsRiskBearing = { risk?: UniRefund_TagService_Tags_TagRiskInfoDto }`.

The three predicates are typed to `UniRefund_TagService_Tags_TagListItemDto` but read nothing except `risk`. The tag detail passes a `TagDetailDto`, which carries the same `risk` block. Widening the parameter to a structural type lets one definition serve both screens.

- [ ] **Step 1: Write the failing test**

Append to `src/utils/__tests__/customsTags.test.ts`:

```ts
describe("predicates accept any risk-bearing tag", () => {
  // The tag detail passes a TagDetailDto, the list a TagListItemDto. Both
  // carry the same `risk` block and the predicates read nothing else, so one
  // definition has to serve both rather than the detail growing a copy.
  const detailShaped: CustomsRiskBearing = {
    risk: { riskLevel: "Green" },
  };

  it("treats a Green tag as actionable whatever shape it arrived in", () => {
    expect(isTagActionable(detailShaped)).toBe(true);
  });

  it("reads a final decision off the same block", () => {
    expect(hasFinalDecision({ risk: { finalRiskLevel: "Red" } })).toBe(true);
    expect(hasFinalDecision({ risk: { riskLevel: "Red" } })).toBe(false);
  });

  it("still excludes a finally-decided tag from bulk selection", () => {
    expect(
      isTagSelectable({ risk: { riskLevel: "Green", finalRiskLevel: "Green" } }),
    ).toBe(false);
  });

  it("treats a tag with no risk block as not actionable", () => {
    expect(isTagActionable({})).toBe(false);
  });
});
```

Add `CustomsRiskBearing` to the existing import from `@/utils/customsTags` at the top of that file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/utils/__tests__/customsTags.test.ts --selectProjects node`
Expected: FAIL — `CustomsRiskBearing` is not exported, so the suite does not compile.

- [ ] **Step 3: Write minimal implementation**

In `src/utils/customsTags.ts`, add the type and change the three signatures. Import `UniRefund_TagService_Tags_TagRiskInfoDto` alongside the existing type imports.

```ts
/**
 * Anything carrying a customs risk block. The list row and the tag detail are
 * different DTOs, but these predicates read only `risk`, so one structural
 * parameter serves both rather than the detail screen growing a second copy of
 * the rules.
 */
export type CustomsRiskBearing = {
  risk?: UniRefund_TagService_Tags_TagRiskInfoDto;
};

export function isTagActionable(tag: CustomsRiskBearing): boolean {
  if (tag.risk?.riskLevel === "Green") return true;
  return tag.risk?.isCurrentUserEligible === true;
}

export function hasFinalDecision(tag: CustomsRiskBearing): boolean {
  const final = tag.risk?.finalRiskLevel;
  return final === "Green" || final === "Red";
}

export function isTagSelectable(tag: CustomsRiskBearing): boolean {
  return isTagActionable(tag) && !hasFinalDecision(tag);
}
```

Rewrite `isTagSelectable`'s docblock — it currently says mobile has no correction endpoints, which stops being true in Task 2:

```ts
/**
 * The bulk selection gate: actionable AND not already finally-decided.
 *
 * The tag detail *can* correct a finally-decided tag (see
 * `customsActionsFor`), but the bulk screen cannot: a mixed selection would
 * have to route each tag to a different endpoint. So a settled tag stays out
 * of the list's selection rather than being sent to a call guaranteed to
 * reject it.
 */
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/utils/__tests__/customsTags.test.ts --selectProjects node`
Expected: PASS, including every pre-existing case.

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no output. `CustomsTagRow` still compiles — a `TagListItemDto` satisfies the structural type.

- [ ] **Step 5: Commit**

```bash
git add src/utils/customsTags.ts src/utils/__tests__/customsTags.test.ts
git commit -m "refactor(super-app): widen the customs predicates to any risk-bearing tag"
```

---

### Task 2: Add the two risk-correction action wrappers

**Files:**
- Modify: `src/actions/TagService/post.ts` (append after `postTagRiskDenyBatchApi`, currently ending at line 94)

**Interfaces:**
- Consumes: nothing.
- Produces: `postTagRiskCorrectToApprovedApi(data: PostApiTagServiceTagRiskOutcomesCorrectToApprovedData)` and `postTagRiskCorrectToDeniedApi(data: PostApiTagServiceTagRiskOutcomesCorrectToDeniedData)`, both returning the SDK's per-item result list.

Both endpoints take the same item shapes the existing bulk calls already send, so no new payload builders are needed.

- [ ] **Step 1: Write the implementation**

There is no unit test for these — they are three-line `fetchRequest` wrappers with no branching, exactly like the six already in this file, none of which are unit-tested either. Their behaviour is covered by the render tests in Task 5.

Append to `src/actions/TagService/post.ts`:

```ts
/**
 * Re-approves tags customs had denied, committing an export validation in the
 * same move — hence the export-validation item shape rather than a bare id.
 * Each item is processed independently, so one tag failing its guards does not
 * roll back the others.
 */
export async function postTagRiskCorrectToApprovedApi(
  data: PostApiTagServiceTagRiskOutcomesCorrectToApprovedData,
) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getTagServiceClient(customHeaders);
    return await client.tagRisk.postApiTagServiceTagRiskOutcomesCorrectToApproved(
      data,
    );
  }, "postTagRiskCorrectToApprovedApi");
}

/**
 * Revokes tags customs had export-validated, which is a denial — hence the
 * deny item shape, `reasons` and all. Each item is processed independently.
 */
export async function postTagRiskCorrectToDeniedApi(
  data: PostApiTagServiceTagRiskOutcomesCorrectToDeniedData,
) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getTagServiceClient(customHeaders);
    return await client.tagRisk.postApiTagServiceTagRiskOutcomesCorrectToDenied(
      data,
    );
  }, "postTagRiskCorrectToDeniedApi");
}
```

Add both `Data` types to the existing `@/saas/TagService` type import at the top of the file.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/actions/TagService/post.ts
git commit -m "feat(super-app): add the tag-risk correction action wrappers"
```

---

### Task 3: The action selector

**Files:**
- Modify: `src/utils/customsTags.ts` (append after `isTagSelectable`)
- Test: `src/utils/__tests__/customsTagActions.test.ts` (create)

**Interfaces:**
- Consumes: `CustomsRiskBearing`, `isTagActionable`, `hasFinalDecision` from Task 1.
- Produces: `type CustomsTagAction = "exportValidate" | "deny" | "correctToApproved" | "correctToDenied"`, `interface CustomsActionGrants { exportValidate: boolean; deny: boolean; correctToApproved: boolean; correctToDenied: boolean }`, and `customsActionsFor(tag: CustomsRiskBearing, grants: CustomsActionGrants): CustomsTagAction[]`.

This is where the whole decision lives. The screen renders whatever this returns.

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/customsTagActions.test.ts`:

```ts
import {
  customsActionsFor,
  type CustomsActionGrants,
  type CustomsRiskBearing,
} from "@/utils/customsTags";

/** Every grant held — the common case for a customs officer. */
const ALL: CustomsActionGrants = {
  exportValidate: true,
  deny: true,
  correctToApproved: true,
  correctToDenied: true,
};

const NONE: CustomsActionGrants = {
  exportValidate: false,
  deny: false,
  correctToApproved: false,
  correctToDenied: false,
};

/** Eligible and undecided: the tag an officer normally meets. */
const undecided: CustomsRiskBearing = { risk: { riskLevel: "Green" } };
const denied: CustomsRiskBearing = {
  risk: { riskLevel: "Green", finalRiskLevel: "Red" },
};
const validated: CustomsRiskBearing = {
  risk: { riskLevel: "Green", finalRiskLevel: "Green" },
};

describe("an undecided tag", () => {
  it("offers export validation and deny", () => {
    expect(customsActionsFor(undecided, ALL)).toEqual([
      "exportValidate",
      "deny",
    ]);
  });

  it("offers neither correction", () => {
    const actions = customsActionsFor(undecided, ALL);
    expect(actions).not.toContain("correctToApproved");
    expect(actions).not.toContain("correctToDenied");
  });
});

describe("a tag customs denied", () => {
  it("offers only re-approval", () => {
    expect(customsActionsFor(denied, ALL)).toEqual(["correctToApproved"]);
  });
});

describe("a tag customs export-validated", () => {
  it("offers only revocation", () => {
    expect(customsActionsFor(validated, ALL)).toEqual(["correctToDenied"]);
  });
});

describe("eligibility gates everything", () => {
  // A Red tag requires one of the user's exit-point posts to be a candidate
  // post for its active flags; the backend answers that on the risk block.
  it("offers nothing when the user is not eligible for this tag", () => {
    expect(
      customsActionsFor({ risk: { riskLevel: "Red" } }, ALL),
    ).toEqual([]);
  });

  it("offers the pair once the backend marks the user eligible", () => {
    expect(
      customsActionsFor(
        { risk: { riskLevel: "Red", isCurrentUserEligible: true } },
        ALL,
      ),
    ).toEqual(["exportValidate", "deny"]);
  });

  it("offers nothing for a tag with no risk block at all", () => {
    expect(customsActionsFor({}, ALL)).toEqual([]);
  });
});

describe("each action reads its own grant", () => {
  it("offers nothing without any grant", () => {
    expect(customsActionsFor(undecided, NONE)).toEqual([]);
  });

  it("offers deny alone when only that grant is held", () => {
    expect(customsActionsFor(undecided, { ...NONE, deny: true })).toEqual([
      "deny",
    ]);
  });

  it("offers export validation alone when only that grant is held", () => {
    expect(
      customsActionsFor(undecided, { ...NONE, exportValidate: true }),
    ).toEqual(["exportValidate"]);
  });

  it("withholds re-approval on a denied tag without that grant", () => {
    expect(
      customsActionsFor(denied, { ...ALL, correctToApproved: false }),
    ).toEqual([]);
  });

  it("withholds revocation on a validated tag without that grant", () => {
    expect(
      customsActionsFor(validated, { ...ALL, correctToDenied: false }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/utils/__tests__/customsTagActions.test.ts --selectProjects node`
Expected: FAIL — `customsActionsFor` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/utils/customsTags.ts`:

```ts
/** The four customs operations a single tag can offer. */
export type CustomsTagAction =
  | "exportValidate"
  | "deny"
  | "correctToApproved"
  | "correctToDenied";

/**
 * One flag per action, because four separate backend permissions govern these
 * and a user may hold some and not others. A single "is customs" boolean would
 * offer buttons the server then refuses.
 */
export interface CustomsActionGrants {
  exportValidate: boolean;
  deny: boolean;
  correctToApproved: boolean;
  correctToDenied: boolean;
}

/**
 * Which customs actions this tag offers this user, in the order the footer
 * shows them (primary first).
 *
 * Eligibility gates everything: a Green tag is actionable anywhere, any other
 * level needs the backend to have marked this user eligible for the tag's
 * active flags. Past that, an undecided tag can be validated or denied, and a
 * settled one can only be corrected — in the opposite direction to its
 * standing decision.
 */
export function customsActionsFor(
  tag: CustomsRiskBearing,
  grants: CustomsActionGrants,
): CustomsTagAction[] {
  if (!isTagActionable(tag)) return [];

  if (!hasFinalDecision(tag)) {
    const actions: CustomsTagAction[] = [];
    if (grants.exportValidate) actions.push("exportValidate");
    if (grants.deny) actions.push("deny");
    return actions;
  }

  // Settled. The only move is the opposite of the standing decision.
  if (tag.risk?.finalRiskLevel === "Red") {
    return grants.correctToApproved ? ["correctToApproved"] : [];
  }
  return grants.correctToDenied ? ["correctToDenied"] : [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/utils/__tests__/customsTagActions.test.ts --selectProjects node`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/customsTags.ts src/utils/__tests__/customsTagActions.test.ts
git commit -m "feat(super-app): add the customs action selector for a single tag"
```

---

### Task 4: Localization keys

**Files:**
- Modify: `src/localization/resources/en-US.json`
- Modify: `src/localization/resources/tr-TR.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the keys Task 5 calls `t()` with, all under `Customs.Validate`, which already exists in both files.

- [ ] **Step 1: Add the keys to both resources**

Add to the `Customs.Validate` object in `en-US.json`:

```json
"ActionExportValidate": "Export validate",
"ActionDeny": "Deny",
"ActionReapprove": "Re-approve",
"ActionRevoke": "Revoke validation",
"NotEligible": "You cannot action this tag",
"NotEligibleDescription": "This tag is flagged for a control point your post does not cover.",
"AlreadyValidated": "Customs has already validated this tag.",
"AlreadyDenied": "Customs has already denied this tag.",
"ConfirmReapproveTitle": "Re-approve this tag?",
"ConfirmReapproveBody": "Customs denied this tag. Re-approving records an export validation against it.",
"ConfirmRevokeTitle": "Revoke this validation?",
"ConfirmRevokeBody": "Customs export-validated this tag. Revoking denies it and records your reasons.",
"ConfirmContinue": "Continue",
"ConfirmCancel": "Cancel",
"ActionSucceeded": "Tag updated",
"ActionRefused": "The server refused this change"
```

And the same keys in `tr-TR.json`:

```json
"ActionExportValidate": "Gümrük onayı ver",
"ActionDeny": "Reddet",
"ActionReapprove": "Yeniden onayla",
"ActionRevoke": "Onayı geri al",
"NotEligible": "Bu etikette işlem yapamazsınız",
"NotEligibleDescription": "Bu etiket, görev noktanızın kapsamadığı bir kontrol noktası için işaretlenmiş.",
"AlreadyValidated": "Gümrük bu etiketi zaten onayladı.",
"AlreadyDenied": "Gümrük bu etiketi zaten reddetti.",
"ConfirmReapproveTitle": "Bu etiket yeniden onaylansın mı?",
"ConfirmReapproveBody": "Gümrük bu etiketi reddetmişti. Yeniden onaylamak, etikete bir ihracat onayı kaydeder.",
"ConfirmRevokeTitle": "Bu onay geri alınsın mı?",
"ConfirmRevokeBody": "Gümrük bu etiketi onaylamıştı. Geri almak etiketi reddeder ve gerekçelerinizi kaydeder.",
"ConfirmContinue": "Devam et",
"ConfirmCancel": "Vazgeç",
"ActionSucceeded": "Etiket güncellendi",
"ActionRefused": "Sunucu bu değişikliği kabul etmedi"
```

- [ ] **Step 2: Regenerate the bundle**

Run: `npm run init`
Expected: completes without error. Without this, `tsc` rejects every new `t("…")` call in Task 5.

- [ ] **Step 3: Verify both locales carry identical key paths**

Run:

```bash
node -e "
const a=require('./src/localization/resources/en-US.json').Customs.Validate;
const b=require('./src/localization/resources/tr-TR.json').Customs.Validate;
const A=Object.keys(a).sort(), B=Object.keys(b).sort();
const onlyA=A.filter(k=>!B.includes(k)), onlyB=B.filter(k=>!A.includes(k));
console.log('en-only:',onlyA,'tr-only:',onlyB);
process.exit(onlyA.length||onlyB.length?1:0);
"
```

Expected: `en-only: [] tr-only: []`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -m "feat(super-app): add localization for the customs tag actions"
```

---

### Task 5: Wire the actions into the tag detail

**Files:**
- Create: `src/screens/shared/Tags/TagDetail/_components/CustomsActions.tsx`
- Modify: `src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx`
- Test: `src/screens/shared/Tags/TagDetail/__tests__/CustomsActions.router.test.tsx` (create)

**Interfaces:**
- Consumes: `customsActionsFor`, `CustomsTagAction`, `CustomsActionGrants`, `buildExportValidationPayload`, `summarizeResults` from `@/utils/customsTags`; `putTagExportValidationsApi` from `@/actions/TagService/put`; `postTagRiskDenyBatchApi`, `postTagRiskCorrectToApprovedApi`, `postTagRiskCorrectToDeniedApi` from `@/actions/TagService/post`; `ExportValidateSheet` and `DenyReasonsSheet` from `@/screens/customs/Validate/_components/…`.
- Produces: `useCustomsTagActions({ tagId, tagDetail, onDone })` returning `{ actions, primary, secondary, sheets, notice }` — consumed only by `TagDetailScreen`.

`CustomsActions.tsx` owns the four actions, both sheets, the confirmation step, and the submit calls. `TagDetailScreen` only places the footer buttons and renders the returned sheets — keeping the screen a composition, as the tag-detail rebuild left it.

Both sheets are rendered by `TagDetailScreen` at screen level, never nested inside another sheet: hooks inside a `<BottomSheet>` child lose context here.

- [ ] **Step 1: Write the failing test**

Create `src/screens/shared/Tags/TagDetail/__tests__/CustomsActions.router.test.tsx`:

```tsx
import type { TagDetailData } from "@/actions/TagService/types";
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import TagDetailScreen from "../TagDetailScreen";

/**
 * Which customs actions the footer offers, and — the part worth guarding —
 * when it must offer none. An ineligible or settled tag gets an explanation
 * rather than a dead control.
 */

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({
    t: (key: string) => key,
    formatCurrency: (amount: number) => String(amount),
    formatDate: (value: string) => value,
  }),
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
  useFocusEffect: () => undefined,
}));
jest.mock("@/providers/ToastProvider", () => ({
  useToastRef: () => ({ current: null }),
}));
jest.mock("@/actions/TagService/post", () => ({
  postApiTagServiceTagByIdAssignTraveller: jest.fn(),
  postTagRiskDenyBatchApi: jest.fn(),
  postTagRiskCorrectToApprovedApi: jest.fn(),
  postTagRiskCorrectToDeniedApi: jest.fn(),
}));
jest.mock("@/actions/TagService/put", () => ({
  putTagExportValidationsApi: jest.fn(),
}));
jest.mock("@/hooks/useLoadTags", () => ({ loadTags: jest.fn() }));
jest.mock("@/hooks/useDevices", () => ({
  useDevices: () => ({
    devices: [],
    isLoading: false,
    error: false,
    refresh: jest.fn(),
  }),
}));
jest.mock("@/actions/DeviceService/post", () => ({ postPrintTagApi: jest.fn() }));
jest.mock(
  "@/screens/shared/_components/SearchTraveller/SearchTraveller",
  () => ({ SearchTraveller: () => null }),
);
jest.mock("react-native-qrcode-svg", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../_components/PrintTagSheet", () => ({ PrintTagSheet: () => null }));

const mockUseTagDetail = jest.fn();
jest.mock("../useTagDetail", () => ({
  useTagDetail: () => mockUseTagDetail(),
}));

const mockUserStore = jest.fn();
jest.mock("@/store/user", () => ({
  __esModule: true,
  default: () => mockUserStore(),
}));

const CUSTOMS_GRANTS = {
  "TagService.Tags.ExportValidations": true,
  "TagService.TagRisks.DenyOutcomes": true,
  "TagService.TagRisks.CorrectOutcomesToApproved": true,
  "TagService.TagRisks.CorrectOutcomesToDenied": true,
};

function setCustoms(policies: Record<string, boolean> = CUSTOMS_GRANTS) {
  mockUserStore.mockReturnValue({
    role: "customs",
    isMerchant: false,
    user: { grantedPolicies: policies },
  });
}

function tagWith(risk: Record<string, unknown>): TagDetailData {
  return {
    scope: "Staff",
    tagDetail: {
      id: "tag-1",
      tagNumber: "TAG-1",
      status: "Issued",
      issueDate: "2026-08-01T00:00:00Z",
      exportValidationExpirationDate: "2026-11-01T00:00:00Z",
      traveller: { travellerDocumentNumber: "P1" },
      risk,
    },
    riskHistory: [],
  } as TagDetailData;
}

function renderScreen(data: TagDetailData) {
  mockUseTagDetail.mockReturnValue({
    tagDetailData: data,
    status: "ready",
    reload: jest.fn(),
  });
  return render(<TagDetailScreen tagId="tag-1" tagNumber="TAG-1" />, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 375, height: 812 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

beforeEach(() => jest.clearAllMocks());

it("offers validate and deny on an undecided eligible tag", () => {
  setCustoms();
  renderScreen(tagWith({ riskLevel: "Green" }));

  expect(
    screen.getByText("MobileApp.Customs.Validate.ActionExportValidate"),
  ).toBeTruthy();
  expect(screen.getByText("MobileApp.Customs.Validate.ActionDeny")).toBeTruthy();
});

it("offers only re-approval on a denied tag", () => {
  setCustoms();
  renderScreen(tagWith({ riskLevel: "Green", finalRiskLevel: "Red" }));

  expect(
    screen.getByText("MobileApp.Customs.Validate.ActionReapprove"),
  ).toBeTruthy();
  expect(
    screen.queryByText("MobileApp.Customs.Validate.ActionExportValidate"),
  ).toBeNull();
});

it("offers only revocation on a validated tag", () => {
  setCustoms();
  renderScreen(tagWith({ riskLevel: "Green", finalRiskLevel: "Green" }));

  expect(
    screen.getByText("MobileApp.Customs.Validate.ActionRevoke"),
  ).toBeTruthy();
  expect(screen.queryByText("MobileApp.Customs.Validate.ActionDeny")).toBeNull();
});

it("explains an ineligible tag instead of showing a dead control", () => {
  setCustoms();
  renderScreen(tagWith({ riskLevel: "Red" }));

  expect(screen.getByText("MobileApp.Customs.Validate.NotEligible")).toBeTruthy();
  expect(
    screen.queryByText("MobileApp.Customs.Validate.ActionExportValidate"),
  ).toBeNull();
});

it("offers nothing to a customs user holding no action grants", () => {
  setCustoms({});
  renderScreen(tagWith({ riskLevel: "Green" }));

  expect(
    screen.queryByText("MobileApp.Customs.Validate.ActionExportValidate"),
  ).toBeNull();
  expect(screen.queryByText("MobileApp.Customs.Validate.ActionDeny")).toBeNull();
});

it("offers no customs actions to a merchant", () => {
  mockUserStore.mockReturnValue({
    role: "merchant",
    isMerchant: true,
    user: { grantedPolicies: CUSTOMS_GRANTS },
  });
  renderScreen(tagWith({ riskLevel: "Green" }));

  expect(
    screen.queryByText("MobileApp.Customs.Validate.ActionExportValidate"),
  ).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/shared/Tags/TagDetail/__tests__/CustomsActions.router.test.tsx --selectProjects router`
Expected: FAIL — no action text is rendered.

- [ ] **Step 3: Write the hook**

Create `src/screens/shared/Tags/TagDetail/_components/CustomsActions.tsx`:

```tsx
import {
  postTagRiskCorrectToApprovedApi,
  postTagRiskCorrectToDeniedApi,
  postTagRiskDenyBatchApi,
} from "@/actions/TagService/post";
import { putTagExportValidationsApi } from "@/actions/TagService/put";
import type { TagDetail } from "@/actions/TagService/types";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useToastRef } from "@/providers/ToastProvider";
import type { UniRefund_TagService_Tags_TagDenyReason } from "@/saas/TagService";
import { DenyReasonsSheet } from "@/screens/customs/Validate/_components/DenyReasonsSheet";
import { ExportValidateSheet } from "@/screens/customs/Validate/_components/ExportValidateSheet";
import useUserStore from "@/store/user";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  buildExportValidationPayload,
  customsActionsFor,
  isTagActionable,
  summarizeResults,
  type CustomsTagAction,
  type ExportValidationFields,
} from "@/utils/customsTags";
import { logger } from "@/utils/logger";
import { isStaffRole } from "@/utils/roles";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import React, { useCallback, useMemo, useRef, useState } from "react";

/** Which sheet the pending action needs, once its confirmation has passed. */
type PendingSheet = "exportValidate" | "deny" | null;

/**
 * The customs actions for one tag: which are offered, the sheets they open,
 * and the confirmation the two corrections go through first.
 *
 * Lives beside the screen rather than in it so `TagDetailScreen` stays a
 * composition. The sheets are *returned* rather than rendered here, because
 * they must be mounted at screen level — a hook called inside a
 * `<BottomSheet>` child loses context in this app.
 */
export function useCustomsTagActions({
  tagId,
  tagDetail,
  onDone,
}: {
  tagId: string;
  tagDetail: TagDetail;
  onDone: () => Promise<void> | void;
}) {
  const { t } = useLocalization();
  const toastRef = useToastRef();
  const { role, user } = useUserStore();
  const validateSheetRef = useRef<BottomSheetModal>(null);
  const denySheetRef = useRef<BottomSheetModal>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirming, setConfirming] = useState<CustomsTagAction | null>(null);
  // Which endpoint the open sheet should submit to. A correction reuses the
  // same sheet as its plain counterpart, so the sheet alone cannot say.
  const [pendingAction, setPendingAction] = useState<CustomsTagAction | null>(
    null,
  );

  const grants = useMemo(() => {
    const policies = user?.grantedPolicies;
    return {
      exportValidate: !!policies?.["TagService.Tags.ExportValidations"],
      deny: !!policies?.["TagService.TagRisks.DenyOutcomes"],
      correctToApproved:
        !!policies?.["TagService.TagRisks.CorrectOutcomesToApproved"],
      correctToDenied:
        !!policies?.["TagService.TagRisks.CorrectOutcomesToDenied"],
    };
  }, [user?.grantedPolicies]);

  // Customs actions are for staff only; a traveller reads the public DTO and
  // holds none of these grants anyway, but the role check keeps the intent
  // explicit rather than relying on an empty policy map.
  const actions = useMemo(
    () => (isStaffRole(role) ? customsActionsFor(tagDetail, grants) : []),
    [role, tagDetail, grants],
  );

  /** Reports a one-item batch honestly: a refusal is not a success. */
  const report = useCallback(
    (results: { succeeded?: boolean | null }[] | undefined) => {
      const { success } = summarizeResults(results ?? []);
      if (success > 0) {
        toastRef.current?.show(
          "success",
          t("MobileApp.Customs.Validate.ActionSucceeded"),
        );
        return true;
      }
      toastRef.current?.show(
        "error",
        t("MobileApp.Customs.Validate.ActionRefused"),
      );
      return false;
    },
    [t, toastRef],
  );

  const submitValidation = useCallback(
    async (fields: ExportValidationFields) => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      validateSheetRef.current?.dismiss();
      try {
        const payload = buildExportValidationPayload(
          new Date().toISOString(),
          fields,
        );
        const items = [{ tagId, ...payload }];
        const results =
          pendingAction === "correctToApproved"
            ? await postTagRiskCorrectToApprovedApi({ requestBody: { items } })
            : await putTagExportValidationsApi({ requestBody: { items } });
        if (report(results ?? [])) await onDone();
      } catch (error) {
        logger.warn("[Customs] tag action failed", error);
        toastRef.current?.show(
          "error",
          getApiErrorMessage(error) ??
            t("MobileApp.Customs.Validate.ActionRefused"),
        );
      } finally {
        setIsSubmitting(false);
        setPendingAction(null);
      }
    },
    [isSubmitting, pendingAction, tagId, report, onDone, t, toastRef],
  );

  const submitDenial = useCallback(
    async (reasons: UniRefund_TagService_Tags_TagDenyReason[]) => {
      if (isSubmitting || reasons.length === 0) return;
      setIsSubmitting(true);
      denySheetRef.current?.dismiss();
      try {
        const items = [{ tagId, reasons }];
        const results =
          pendingAction === "correctToDenied"
            ? await postTagRiskCorrectToDeniedApi({ requestBody: { items } })
            : await postTagRiskDenyBatchApi({ requestBody: { items } });
        if (report(results ?? [])) await onDone();
      } catch (error) {
        logger.warn("[Customs] tag action failed", error);
        toastRef.current?.show(
          "error",
          getApiErrorMessage(error) ??
            t("MobileApp.Customs.Validate.ActionRefused"),
        );
      } finally {
        setIsSubmitting(false);
        setPendingAction(null);
      }
    },
    [isSubmitting, pendingAction, tagId, report, onDone, t, toastRef],
  );

  /** Opens the sheet an action needs, after any confirmation it requires. */
  const open = useCallback((action: CustomsTagAction) => {
    setPendingAction(action);
    const sheet: PendingSheet =
      action === "deny" || action === "correctToDenied"
        ? "deny"
        : "exportValidate";
    if (sheet === "deny") denySheetRef.current?.present();
    else validateSheetRef.current?.present();
  }, []);

  const start = useCallback(
    (action: CustomsTagAction) => {
      // The two corrections reverse a decision customs already committed, so
      // they ask first. The plain pair goes straight to its sheet.
      if (action === "correctToApproved" || action === "correctToDenied") {
        setConfirming(action);
        return;
      }
      open(action);
    },
    [open],
  );

  const confirm = useCallback(() => {
    const action = confirming;
    setConfirming(null);
    if (action) open(action);
  }, [confirming, open]);

  const label: Record<CustomsTagAction, string> = {
    exportValidate: t("MobileApp.Customs.Validate.ActionExportValidate"),
    deny: t("MobileApp.Customs.Validate.ActionDeny"),
    correctToApproved: t("MobileApp.Customs.Validate.ActionReapprove"),
    correctToDenied: t("MobileApp.Customs.Validate.ActionRevoke"),
  };

  const toAction = (action: CustomsTagAction) => ({
    onPress: () => start(action),
    label: label[action],
  });

  return {
    actions,
    isSubmitting,
    confirming,
    confirmTitle:
      confirming === "correctToApproved"
        ? t("MobileApp.Customs.Validate.ConfirmReapproveTitle")
        : t("MobileApp.Customs.Validate.ConfirmRevokeTitle"),
    confirmBody:
      confirming === "correctToApproved"
        ? t("MobileApp.Customs.Validate.ConfirmReapproveBody")
        : t("MobileApp.Customs.Validate.ConfirmRevokeBody"),
    confirm,
    cancelConfirm: () => setConfirming(null),
    primary: actions[0] ? toAction(actions[0]) : undefined,
    secondary: actions[1] ? toAction(actions[1]) : undefined,
    // Shown in place of the actions when the backend says this officer cannot
    // act on this tag — something the bulk list cannot explain.
    notice:
      isStaffRole(role) && actions.length === 0 && !isTagActionable(tagDetail)
        ? {
            title: t("MobileApp.Customs.Validate.NotEligible"),
            body: t("MobileApp.Customs.Validate.NotEligibleDescription"),
          }
        : undefined,
    validateSheetRef,
    denySheetRef,
    submitValidation,
    submitDenial,
  };
}

/** The two sheets, mounted by the screen at screen level. */
export function CustomsActionSheets({
  actions,
}: {
  actions: ReturnType<typeof useCustomsTagActions>;
}) {
  return (
    <>
      <ExportValidateSheet
        sheetRef={actions.validateSheetRef}
        isSubmitting={actions.isSubmitting}
        onSubmit={actions.submitValidation}
        onCancel={() => actions.validateSheetRef.current?.dismiss()}
      />
      <DenyReasonsSheet
        sheetRef={actions.denySheetRef}
        isSubmitting={actions.isSubmitting}
        onSubmit={actions.submitDenial}
        onCancel={() => actions.denySheetRef.current?.dismiss()}
      />
    </>
  );
}
```

- [ ] **Step 4: Wire it into the screen**

In `TagDetailScreen.tsx`, call the hook after `useTagDetail` resolves — below the `const { tagDetail } = tagDetailData;` line:

```tsx
const customs = useCustomsTagActions({
  tagId,
  tagDetail,
  onDone: reload,
});
```

Extend the footer selection. Replace the existing `primaryAction` / `secondaryAction` pair with:

```tsx
// Customs actions take the footer when the tag offers any: a customs officer
// is never also the merchant who can print, so the slots cannot collide.
const primaryAction = customs.primary ?? assignAction ?? printAction;
const secondaryAction = customs.secondary ?? (assignAction ? printAction : undefined);
```

Render the sheets and the confirmation beside the existing `PrintTagSheet`, and the notice inside the scroll body above `TagIdentityCard`:

```tsx
{customs.notice ? (
  <Card tone="warning">
    <Text variant="labelStrong">{customs.notice.title}</Text>
    <Text variant="caption" tone="muted" className="mt-1">
      {customs.notice.body}
    </Text>
  </Card>
) : null}
```

```tsx
<CustomsActionSheets actions={customs} />
{customs.confirming ? (
  <View
    accessibilityRole="alert"
    className="absolute inset-0 z-20 items-center justify-center bg-foreground/40 px-8"
  >
    <Card className="w-full gap-3">
      <Text variant="subheading">{customs.confirmTitle}</Text>
      <Text variant="body" tone="muted">
        {customs.confirmBody}
      </Text>
      <View className="mt-2 gap-2">
        <Button
          action={{
            onPress: customs.confirm,
            label: t("MobileApp.Customs.Validate.ConfirmContinue"),
          }}
        />
        <Button
          variant="outline"
          action={{
            onPress: customs.cancelConfirm,
            label: t("MobileApp.Customs.Validate.ConfirmCancel"),
          }}
        />
      </View>
    </Card>
  </View>
) : null}
```

Add `Button` and `Card` to the existing `@/components/ui` import, and import `CustomsActionSheets` / `useCustomsTagActions` from `./_components/CustomsActions`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/screens/shared/Tags/TagDetail --selectProjects router node`
Expected: PASS — the six new cases plus every pre-existing TagDetail suite.

- [ ] **Step 6: Commit**

```bash
git add src/screens/shared/Tags/TagDetail/
git commit -m "feat(super-app): offer the customs actions on a tag's own screen"
```

---

### Task 6: Full gates and a device check

**Files:** none — verification only.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: no output after the `check:language-data` preflight reports up to date.

- [ ] **Step 2: Full suite**

Run: `npm test`
Expected: only `src/components/ui/__tests__/tokens.test.ts` fails, with 3 failing assertions. Any other failure is a regression from this work.

- [ ] **Step 3: Lint, attributing every warning**

Run: `npm run lint`
Expected: 0 errors. The repo-wide warning total is not a useful gate on a shared checkout — confirm instead that **no warning names a file this plan touched**: `customsTags.ts`, `post.ts`, `CustomsActions.tsx`, `TagDetailScreen.tsx`, or any of the new test files.

- [ ] **Step 4: Device check**

The three device traps this plan is most exposed to are invisible to `tsc` and jest, so this step is not optional:

1. Start Metro and wire the devices: `.\dev-superapp-devices.ps1` from `C:\unirefund`.
2. Sign in as a **customs** user — the tests mock the store, so this is the first time the real grant map is exercised.
3. Open a tag from the customs Validate list. Confirm the footer shows the expected pair.
4. Open the deny sheet and confirm its labels are **words, not raw i18n keys** — raw keys mean the sheet is mounted inside another sheet and `useLocalization()` has lost context.
5. Fire one action and confirm the toast, and that the screen's status badge and progress rail restate the new decision after the reload.
6. On a settled tag, confirm the confirmation dialog appears before the sheet.

- [ ] **Step 5: Commit any fixes, then open the PR**

```bash
git push -u origin feat/superapp-customs-tag-actions
gh pr create --base main --title "feat(super-app): offer the customs actions on a tag's own screen" --body-file <notes>
```

State plainly in the PR body which of the six device steps were actually performed and which were not.

---

## Self-Review

**Spec coverage.** Action matrix → Task 3. Four grants → Task 3 + Task 5. Eligibility gating and the explanation → Tasks 3 and 5. Confirmation on corrections → Task 5. Widened predicates → Task 1. New wrappers → Task 2. Reuse of both sheets and `buildExportValidationPayload` → Task 5. `summarizeResults` treating a refusal honestly → Task 5 `report`. Reload after success → Task 5 `onDone: reload`. Sheets hosted at screen level → Task 5 Step 4 and device step 4. i18n → Task 4. Testing section → Tasks 1, 3, 5. Out-of-scope items are absent from the plan, as intended.

**Placeholder scan.** No TBDs; every code step carries real code; no "similar to Task N".

**Type consistency.** `CustomsRiskBearing` (Task 1) is the parameter of `customsActionsFor` (Task 3) and is satisfied by the `TagDetail` passed in Task 5. `CustomsActionGrants` field names match the grant strings read in Task 5. `ExportValidateSheet`'s `onSubmit(fields: ExportValidationFields)` and `DenyReasonsSheet`'s `onSubmit(reasons: DenyReason[])` match `submitValidation` / `submitDenial`. `summarizeResults` takes `{ succeeded?: boolean | null }[]`, which is what `report` accepts.

**One gap found and closed during review:** Task 5's `primaryAction` originally would have let a merchant's assign action outrank a customs action on the same tag. Roles are disjoint in practice, but the precedence is now explicit and commented rather than incidental.
