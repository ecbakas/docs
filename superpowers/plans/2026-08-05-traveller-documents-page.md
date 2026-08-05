# Traveller Documents Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give super-app travellers a Documents page (list, add via Didit + `prove-document`, set-primary) plus a Home-header document switcher that calls `set-active` and refreshes the access token.

**Architecture:** A `useTravellerDocuments()` hook wraps `getMyDocumentAffiliations` with `useAsyncFetch`, structurally copying the existing `useCards`. Which document is *active* is never read from the DTO's `isActive` field — it is derived from the `TravellerDocumentId` JWT claim in `useUserStore`, the same choice web-app's SSR switcher makes, so both surfaces stay consistent without new global state. Switching calls `set-active` then `useSession().fetchNewAccessToken()`, which republishes the token and re-decodes the claim.

**Tech Stack:** React Native 0.81 / Expo ~54, Expo Router ~6 (file-based), NativeWind 4 + Tailwind, Zustand 5, `@gorhom/bottom-sheet`, `@didit-protocol/sdk-react-native`, Jest + jest-expo + `@testing-library/react-native` 13.

**Spec:** `docs/superpowers/specs/2026-08-05-traveller-documents-page-design.md`

---

## Global Constraints

All paths are relative to `c:\unirefund\super-app` unless stated otherwise. Run every command from that directory.

- **`npm run init` must run before any code calls a new `t()` key.** `TranslationKey` is `NestedKeyOf<typeof enUS>` where `enUS` is the **generated** `src/data/language-data/en-US.gen.json` (`src/localization/config.ts:26-34`). A `t("MobileApp.Documents.Title")` call will fail `tsc` until that file contains the key. This is why Task 1 comes first.
- **`npm run init` needs network access** to `https://dev-api.unirefund.com` and throws on failure. If it cannot reach the backend, Task 1 is blocked and every later task fails typecheck. Do not work around it by hand-editing `*.gen.json`.
- **Never edit `src/data/language-data/*.gen.json` or `src/data/policies/*.gen.json`.** They are generated and gitignored (`.gitignore:27`) — never `git add` them.
- **Never edit `src/saas/**`.** Generated SDK; regenerate with `npm run gen` only if the API schema changes, which it does not here.
- **All API calls go through `src/actions/**` wrappers.** Screens, components, and hooks must never import a generated SDK client directly (`.claude/rules/api-actions.md`).
- **No hardcoded user-visible text.** Every string goes through `useLocalization().t()` (`.claude/rules/i18n.md`).
- **Use `src/components/**` primitives** (`Button`, `BottomSheet`, `Ionicons`, `SafeAreaView`) and NativeWind `className`; compose classes with `cn()` from `src/utils/cn.ts` (`.claude/rules/ui-components.md`).
- **Path alias `@/*` → `./src/*`** for all internal imports; external imports grouped before internal.
- **TypeScript strict mode.** No implicit `any`, no unchecked nulls.
- **Test file naming decides which Jest project runs the file.** `jest.config.js` defines two projects. Anything that **renders** — a component *or* a `renderHook` call — must be named `*.router.test.ts(x)` to get the `jest-expo/android` preset. Under the default `node` project, rendering reaches nativewind's web JSX runtime, which requires `react-native-web`, a package this app does not depend on. Pure-function tests use plain `*.test.ts`.
- **KYC provider is always the string literal `"Didit"`.**

### Verification baseline (measured 2026-08-05, before any change)

| Command | Baseline |
| --- | --- |
| `npm run typecheck` | Clean, no output |
| `npm test` | **Test Suites: 7 failed, 26 passed, 33 total. Tests: 346 passed, 346 total.** |
| `npm run lint` | Run once at the start and record the count; treat that as the floor |

The 7 failing suites are **pre-existing and unrelated** — they fail to *load*, not to assert. They are render-based suites sitting in the wrong Jest project (`node` instead of `router`), so `@testing-library/react-native` cannot resolve `react-native`:

```
src/components/__tests__/BottomSheet.test.tsx
src/components/__tests__/Button.test.tsx
src/components/__tests__/DebouncedPressable.test.tsx
src/components/__tests__/SafeAreaView.test.tsx
src/components/__tests__/Toast.test.tsx
src/templates/__tests__/Modal.test.tsx
src/templates/__tests__/TabPage.test.tsx
```

**Do not fix them and do not add tests to those two directories.** Every task's success criterion is: 7 failed suites and no more, and the passing test count strictly greater than the previous task's. Never report "tests pass" — report the numbers.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/localization/resources/{en-US,tr-TR}.json` | The `Documents` string namespace |
| `src/store/user.types.ts` | `JwtUser.TravellerDocumentId` claim |
| `src/utils/traveller.ts` | `getTravellerDocumentIdFromClaims` — claim → id |
| `src/actions/TravellerService/post.ts` | The three POST wrappers, nothing else |
| `src/hooks/useDiditVerify.tsx` | Run a Didit workflow for an SSR action → approved sessionId or null |
| `src/screens/traveller/Documents/useTravellerDocuments.ts` | Documents page server state + its two mutations |
| `src/screens/traveller/Documents/_components/DocumentCard.tsx` | One document row, props only |
| `src/screens/traveller/Documents/DocumentsScreen.tsx` | Page shell and its four states |
| `src/screens/traveller/Documents/openDocuments.ts` | The route href and how to navigate to it |
| `src/screens/traveller/Documents/useDocumentSwitcher.ts` | Switcher state + the set-active/token-refresh sequence |
| `src/screens/traveller/Documents/_components/DocumentSwitcherSheet.tsx` | The switcher bottom sheet, props only |
| `src/screens/traveller/Home/_components/ActiveDocumentPill.tsx` | Home header entry point, three states |
| `src/templates/TabPage.tsx` | Gains an optional `headerAccessory` slot |
| `src/app/(auth)/profile/documents.tsx` | Route wrapper |

---

## Task 1: Localization keys

The first task because `TranslationKey` is derived from the generated bundle — nothing downstream typechecks without it.

**Files:**
- Modify: `src/localization/resources/en-US.json`
- Modify: `src/localization/resources/tr-TR.json`

**Interfaces:**
- Consumes: nothing
- Produces: the `MobileApp.Documents.*` key namespace used by Tasks 5–9. Interpolation is `{name}`-style named placeholders, replaced by `interpolate()` at `src/providers/LocalizationProvider.tsx:28-33`.

- [ ] **Step 1: Add the `Documents` namespace to `src/localization/resources/en-US.json`**

Insert as a new top-level key after the existing `"Cards"` block. The file's top-level keys are namespaces *without* the `MobileApp.` prefix — `init.ts` merges this whole file under a `MobileApp` resource (`init.ts:151-158`), which is why the code reads `t("MobileApp.Documents.Title")`.

```json
  "Documents": {
    "Title": "My Documents",
    "Description": "Passports and ID cards linked to your account",
    "Empty": "No documents yet",
    "EmptyDescription": "Add a passport or ID card so your tax-free tags can be issued in your name.",
    "AddDocument": "Add document",
    "Added": "Document added",
    "Updated": "Document verification updated",
    "AddFailed": "Could not add the document. Please try again.",
    "AddNotPermitted": "Adding a document is not available for your account.",
    "Primary": "Primary",
    "SetPrimary": "Set as primary",
    "SetPrimarySuccess": "Primary document updated",
    "SetPrimaryFailed": "Could not set the primary document.",
    "InUse": "In use",
    "LoadFailed": "Could not load your documents.",
    "Retry": "Retry",
    "Busy": "Please wait for the current change to finish.",
    "SwitchSuccess": "Switched to {number}",
    "SwitchFailed": "Could not switch documents. Please try again.",
    "SwitchNeedsRelogin": "Document switched, but your session could not be refreshed. Please sign in again.",
    "Switch": {
      "Title": "Switch document",
      "SwitchTo": "Switch to {number}",
      "Switching": "Switching…"
    },
    "EvidenceLevel": {
      "None": "Unverified",
      "Low": "Basic",
      "Medium": "Verified",
      "High": "Fully verified"
    },
    "Type": {
      "Passport": "Passport",
      "IdCard": "ID card",
      "DriverLicense": "Driver's licence",
      "ResidencePermit": "Residence permit",
      "HealthInsurance": "Health insurance card"
    }
  }
```

- [ ] **Step 2: Add the same namespace to `src/localization/resources/tr-TR.json`**

Same position, same key structure. A missing `tr-TR` key silently falls back to `en-US` (`LocalizationProvider.tsx:90-93`), so an omission here ships untranslated without failing anything — both locales land in this one step.

```json
  "Documents": {
    "Title": "Belgelerim",
    "Description": "Hesabınıza bağlı pasaport ve kimlik kartları",
    "Empty": "Henüz belge yok",
    "EmptyDescription": "Vergisiz alışveriş etiketlerinizin adınıza düzenlenebilmesi için bir pasaport veya kimlik kartı ekleyin.",
    "AddDocument": "Belge ekle",
    "Added": "Belge eklendi",
    "Updated": "Belge doğrulaması güncellendi",
    "AddFailed": "Belge eklenemedi. Lütfen tekrar deneyin.",
    "AddNotPermitted": "Hesabınız için belge ekleme kullanılamıyor.",
    "Primary": "Birincil",
    "SetPrimary": "Birincil yap",
    "SetPrimarySuccess": "Birincil belge güncellendi",
    "SetPrimaryFailed": "Birincil belge ayarlanamadı.",
    "InUse": "Kullanımda",
    "LoadFailed": "Belgeleriniz yüklenemedi.",
    "Retry": "Tekrar dene",
    "Busy": "Lütfen mevcut işlemin tamamlanmasını bekleyin.",
    "SwitchSuccess": "{number} belgesine geçildi",
    "SwitchFailed": "Belge değiştirilemedi. Lütfen tekrar deneyin.",
    "SwitchNeedsRelogin": "Belge değiştirildi ancak oturumunuz yenilenemedi. Lütfen tekrar giriş yapın.",
    "Switch": {
      "Title": "Belge değiştir",
      "SwitchTo": "{number} belgesine geç",
      "Switching": "Değiştiriliyor…"
    },
    "EvidenceLevel": {
      "None": "Doğrulanmamış",
      "Low": "Temel",
      "Medium": "Doğrulanmış",
      "High": "Tam doğrulanmış"
    },
    "Type": {
      "Passport": "Pasaport",
      "IdCard": "Kimlik kartı",
      "DriverLicense": "Sürücü belgesi",
      "ResidencePermit": "İkamet izni",
      "HealthInsurance": "Sağlık sigortası kartı"
    }
  }
```

- [ ] **Step 3: Regenerate the bundles**

Run: `npm run init`
Expected: exits 0 with no error. It rewrites `src/data/language-data/{en-US,tr-TR}.gen.json` and `src/data/policies/policies.gen.json`.

If it fails with a fetch/network error, **stop and report it** — the rest of the plan cannot typecheck. Do not hand-edit the generated files.

- [ ] **Step 4: Verify the key reached the generated bundle**

Run: `node -e "console.log(Object.keys(require('./src/data/language-data/en-US.gen.json').MobileApp.Documents).join(', '))"`
Expected: prints the key list including `Title, Description, Empty, ..., SwitchNeedsRelogin, Switch, EvidenceLevel, Type`.

- [ ] **Step 5: Verify typecheck still clean**

Run: `npm run typecheck`
Expected: no output.

- [ ] **Step 6: Commit**

Only the two authored resource files. The `*.gen.json` outputs are gitignored — if `git status` shows them, do not add them.

```bash
git add src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git commit -m "feat(i18n): add Documents strings for the traveller documents page"
```

---

## Task 2: `TravellerDocumentId` claim and its reader

**Files:**
- Modify: `src/store/user.types.ts` (the `JwtUser` interface, after the `TravellerId` field at line 31)
- Modify: `src/utils/traveller.ts` (append after `getTravellerIdFromClaims`, which ends at line 84)
- Test: `src/utils/__tests__/traveller.test.ts` (append; the file already has a `getTravellerIdFromClaims` describe block at lines 103-124 to mirror)

**Interfaces:**
- Consumes: nothing
- Produces: `getTravellerDocumentIdFromClaims(jwtUser?: JwtUser | null): string` — returns `""` when the claim is absent. Tasks 5 and 8 both call it.

- [ ] **Step 1: Write the failing test**

Append to `src/utils/__tests__/traveller.test.ts`. Add `getTravellerDocumentIdFromClaims` to the existing import block at the top of the file (line 1-6).

The existing `jwt()` helper at line 99 only builds a `TravellerId`, so this needs its own builder.

```ts
function documentJwt(travellerDocumentId?: string | string[]): JwtUser {
  return { TravellerDocumentId: travellerDocumentId } as unknown as JwtUser;
}

describe("getTravellerDocumentIdFromClaims", () => {
  it("reads a string claim", () => {
    expect(getTravellerDocumentIdFromClaims(documentJwt("doc-1"))).toBe("doc-1");
  });

  // ABP emits a repeated claim as an array, which is exactly the shape a
  // traveller with more than one document produces — the case this feature
  // exists for, and the one a naive implementation gets wrong.
  it("takes the first entry of an array claim", () => {
    expect(
      getTravellerDocumentIdFromClaims(documentJwt(["doc-1", "doc-2"])),
    ).toBe("doc-1");
  });

  it("returns an empty string for an empty array", () => {
    expect(getTravellerDocumentIdFromClaims(documentJwt([]))).toBe("");
  });

  it.each([undefined, null])("returns an empty string for %s", (value) => {
    expect(getTravellerDocumentIdFromClaims(value)).toBe("");
  });

  it("returns an empty string when the claim is absent", () => {
    expect(getTravellerDocumentIdFromClaims(documentJwt())).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/utils/__tests__/traveller.test.ts`
Expected: FAIL — `getTravellerDocumentIdFromClaims` is not exported from `@/utils/traveller`.

- [ ] **Step 3: Add the claim to `JwtUser`**

In `src/store/user.types.ts`, directly after the `TravellerId?: string[] | string;` field:

```ts
  /**
   * The document the current session acts as. Present for traveller accounts
   * with at least one document. Same repeated-claim caveat as `TravellerId` —
   * see `getTravellerDocumentIdFromClaims`.
   */
  TravellerDocumentId?: string[] | string;
```

- [ ] **Step 4: Write the reader**

Append to `src/utils/traveller.ts`:

```ts
/**
 * The document the current session acts as, from the access-token claims.
 *
 * This — not `TravellerDocumentAffiliationDto.isActive` — is the source of
 * truth for "which document is active". That DTO field is itself derived from
 * this claim, so reading the claim keeps every surface consistent from one
 * value that `fetchNewAccessToken` already refreshes. Returns "" when there is
 * no claim; callers must treat that as "unknown", not as a valid id.
 */
export function getTravellerDocumentIdFromClaims(
  jwtUser?: JwtUser | null,
): string {
  const claim = jwtUser?.TravellerDocumentId;
  if (Array.isArray(claim)) return claim[0] ?? "";
  return claim ?? "";
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/utils/__tests__/traveller.test.ts`
Expected: PASS. The new describe block contributes **6** tests — `it.each([undefined, null])` counts as two.

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/store/user.types.ts src/utils/traveller.ts src/utils/__tests__/traveller.test.ts
git commit -m "feat(traveller): read the active TravellerDocumentId from token claims"
```

---

## Task 3: POST action wrappers

**Files:**
- Create: `src/actions/TravellerService/post.ts`
- Test: `src/actions/TravellerService/__tests__/post.test.ts`

**Interfaces:**
- Consumes: `fetchRequest` from `@/utils/customFetch` — signature `fetchRequest<T>(request: (customHeaders: Record<string,string>) => Promise<T>, apiName: string): Promise<T>`; `getTravellerServiceClient(customHeaders?)` from `../lib`.
- Produces, all used by Tasks 5 and 8:
  - `postProveDocumentApi(sessionId: string): Promise<UniRefund_TravellerService_SSRActions_ProveDocumentResultDto>` — the result has `travellerDocumentId?: string` and `level?: EvidenceLevel`
  - `postSetPrimaryDocumentApi(travellerDocumentId: string): Promise<unknown>`
  - `postSetActiveDocumentApi(travellerDocumentId: string): Promise<unknown>`

The service currently has only `actions.ts`; `.claude/rules/api-actions.md` puts POSTs in `post.ts`. The `Api` suffix follows that rule's checklist even though the older sibling `actions.ts` predates it.

- [ ] **Step 1: Write the failing test**

Create `src/actions/TravellerService/__tests__/post.test.ts`. A plain `.test.ts` — nothing renders, so it belongs to the `node` project.

```ts
import {
  postProveDocumentApi,
  postSetActiveDocumentApi,
  postSetPrimaryDocumentApi,
} from "../post";
// `@/actions/lib`, not `../lib`: this file sits in `__tests__/`, so a relative
// `../lib` would target `src/actions/TravellerService/lib` — a module that does
// not exist — and the mock would silently fail to intercept the one `post.ts`
// actually imports. The alias resolves to the same `src/actions/lib` the source
// reaches via its own `../lib`. Same idiom as `src/actions/auth/__tests__/actions.test.ts`.
import { getTravellerServiceClient } from "@/actions/lib";

// `fetchRequest` is the auth/retry wrapper; here it just runs the callback so
// the assertions are about what the SDK is asked for, not about token refresh.
jest.mock("@/utils/customFetch", () => ({
  fetchRequest: jest.fn(
    (request: (headers: Record<string, string>) => Promise<unknown>) =>
      request({ Authorization: "Bearer test" }),
  ),
}));

const proveDocument = jest.fn().mockResolvedValue({});
const setPrimary = jest.fn().mockResolvedValue({});
const setActive = jest.fn().mockResolvedValue({});

jest.mock("@/actions/lib", () => ({
  getTravellerServiceClient: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (getTravellerServiceClient as jest.Mock).mockResolvedValue({
    ssrAction: {
      postApiTravellerServiceSsrActionsProveDocument: proveDocument,
    },
    traveller: {
      postApiTravellerServiceTravellersMyDocumentAffiliationsByTravellerDocumentIdSetPrimary:
        setPrimary,
      postApiTravellerServiceTravellersMyDocumentAffiliationsByTravellerDocumentIdSetActive:
        setActive,
    },
  });
});

describe("postProveDocumentApi", () => {
  // The endpoint requires both fields. Omitting kycSessionProvider, or spelling
  // the provider differently, is a 400 the UI can only report as a generic
  // failure — so pin the exact body.
  it("posts the session id with the Didit provider", async () => {
    await postProveDocumentApi("session-1");

    expect(proveDocument).toHaveBeenCalledWith({
      requestBody: { sessionId: "session-1", kycSessionProvider: "Didit" },
    });
  });

  it("passes the auth headers through to the client", async () => {
    await postProveDocumentApi("session-1");

    expect(getTravellerServiceClient).toHaveBeenCalledWith({
      Authorization: "Bearer test",
    });
  });
});

describe("postSetPrimaryDocumentApi", () => {
  // travellerDocumentId is a path parameter, not a body field.
  it("sends the document id as the path parameter", async () => {
    await postSetPrimaryDocumentApi("doc-1");

    expect(setPrimary).toHaveBeenCalledWith({ travellerDocumentId: "doc-1" });
  });
});

describe("postSetActiveDocumentApi", () => {
  it("sends the document id as the path parameter", async () => {
    await postSetActiveDocumentApi("doc-2");

    expect(setActive).toHaveBeenCalledWith({ travellerDocumentId: "doc-2" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/actions/TravellerService/__tests__/post.test.ts`
Expected: FAIL — cannot resolve module `../post`.

- [ ] **Step 3: Write the implementation**

Create `src/actions/TravellerService/post.ts`:

```ts
import { fetchRequest } from "@/utils/customFetch";
import { getTravellerServiceClient } from "../lib";

/**
 * Didit is the only KYC provider this app runs, so the provider is fixed here
 * rather than exposed as a parameter — the same call `useTravellerDidit` makes
 * with its module-level `KYC_PROVIDER`.
 */
const KYC_PROVIDER = "Didit" as const;

/**
 * Prove a traveller document from an approved Didit evidence session.
 *
 * The backend resolves *which* document from the session's document number, so
 * a session for a document already on the account raises that document's
 * evidence level instead of adding a row. Callers must compare the returned
 * `travellerDocumentId` against the list they already had to tell the two
 * apart.
 */
export async function postProveDocumentApi(sessionId: string) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getTravellerServiceClient(customHeaders);
    return await client.ssrAction.postApiTravellerServiceSsrActionsProveDocument(
      { requestBody: { sessionId, kycSessionProvider: KYC_PROVIDER } },
    );
  }, "postProveDocumentApi");
}

/**
 * Mark a document as the traveller's primary one. Clears the previous primary
 * server-side, so callers must refetch rather than patch a single row.
 * Returns no useful body.
 */
export async function postSetPrimaryDocumentApi(travellerDocumentId: string) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getTravellerServiceClient(customHeaders);
    return await client.traveller.postApiTravellerServiceTravellersMyDocumentAffiliationsByTravellerDocumentIdSetPrimary(
      { travellerDocumentId },
    );
  }, "postSetPrimaryDocumentApi");
}

/**
 * Switch which document the session acts as. Changes the `TravellerDocumentId`
 * claim the *next* token carries — the current access token keeps the old one,
 * so callers must follow this with `useSession().fetchNewAccessToken()` or
 * every subsequent request still acts as the previous document.
 */
export async function postSetActiveDocumentApi(travellerDocumentId: string) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getTravellerServiceClient(customHeaders);
    return await client.traveller.postApiTravellerServiceTravellersMyDocumentAffiliationsByTravellerDocumentIdSetActive(
      { travellerDocumentId },
    );
  }, "postSetActiveDocumentApi");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/actions/TravellerService/__tests__/post.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/actions/TravellerService/post.ts src/actions/TravellerService/__tests__/post.test.ts
git commit -m "feat(traveller): add prove-document, set-primary and set-active actions"
```

---

## Task 4: Extract `useDiditVerify`

A verbatim move, not a rewrite. `verify()` currently lives privately inside `useTravellerDidit` (`src/hooks/useTravellerDidit.tsx:30-70`) and Add-document needs the identical five-terminal-state reduction. Copying it would mean two places to fix the next time a Didit state changes meaning.

The extraction gets its own tests: this reducer is the single gate deciding whether a Didit result becomes proof, and both the auth flows and Add-document now depend on it. Characterisation tests written against the moved code also prove the move preserved behaviour, which is the thing an extraction can silently get wrong.

**Files:**
- Create: `src/hooks/useDiditVerify.tsx`
- Modify: `src/hooks/useTravellerDidit.tsx`
- Test: `src/hooks/__tests__/useDiditVerify.router.test.ts` (`.router.` — it uses `renderHook`)

**Interfaces:**
- Consumes: `resolveWorkflowId(action)` from `@/utils/didit/workflow`; `startVerificationWithWorkflow` from `@didit-protocol/sdk-react-native`.
- Produces: `useDiditVerify(): { verify: (action: SSRActionType) => Promise<string | null> }` — resolves to the `sessionId` on an Approved completion, `null` on cancelled / failed / Declined / Pending (each already toasted except cancelled). Task 5 calls `verify("ProveDocument")`.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useDiditVerify.router.test.ts`:

```ts
import { useDiditVerify } from "@/hooks/useDiditVerify";
import { resolveWorkflowId } from "@/utils/didit/workflow";
import { startVerificationWithWorkflow } from "@didit-protocol/sdk-react-native";
import { renderHook } from "@testing-library/react-native";

jest.mock("@/utils/didit/workflow", () => ({
  resolveWorkflowId: jest.fn(),
}));
jest.mock("@didit-protocol/sdk-react-native", () => ({
  startVerificationWithWorkflow: jest.fn(),
}));

// `t` returns the key, so assertions name the message rather than its English.
jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key, languageCode: "tr" }),
}));

const show = jest.fn();
jest.mock("@/providers/ToastProvider", () => ({
  useToastRef: () => ({ current: { show } }),
}));

const resolve = resolveWorkflowId as jest.MockedFunction<
  typeof resolveWorkflowId
>;
const startVerification =
  startVerificationWithWorkflow as jest.MockedFunction<
    typeof startVerificationWithWorkflow
  >;

/** A `completed` result carrying the given decision. */
function completed(status: string, sessionId = "session-1") {
  return { type: "completed", session: { status, sessionId } };
}

beforeEach(() => {
  jest.clearAllMocks();
  resolve.mockResolvedValue("workflow-1");
});

function verifyHook() {
  const { result } = renderHook(() => useDiditVerify());
  return result.current.verify;
}

it("runs the workflow the action resolves to, in the active language", async () => {
  startVerification.mockResolvedValue(completed("Approved") as never);

  await verifyHook()("ProveDocument");

  expect(resolve).toHaveBeenCalledWith("ProveDocument");
  expect(startVerification).toHaveBeenCalledWith("workflow-1", {
    config: { languageCode: "tr", loggingEnabled: __DEV__ },
  });
});

it("returns the session id when the verification is approved", async () => {
  startVerification.mockResolvedValue(completed("Approved", "session-7") as never);

  await expect(verifyHook()("ProveDocument")).resolves.toBe("session-7");
  expect(show).not.toHaveBeenCalled();
});

it("reports an unavailable workflow and never starts a verification", async () => {
  resolve.mockResolvedValue("");

  await expect(verifyHook()("ProveDocument")).resolves.toBeNull();
  expect(startVerification).not.toHaveBeenCalled();
  expect(show).toHaveBeenCalledWith(
    "error",
    "MobileApp.Auth.Verification.NotAvailable",
  );
});

// The traveller chose to cancel; a toast would scold them for it.
it("is silent when the traveller cancels", async () => {
  startVerification.mockResolvedValue({ type: "cancelled" } as never);

  await expect(verifyHook()("ProveDocument")).resolves.toBeNull();
  expect(show).not.toHaveBeenCalled();
});

it("reports a failed verification", async () => {
  startVerification.mockResolvedValue({
    type: "failed",
    error: { type: "network", message: "boom" },
  } as never);

  await expect(verifyHook()("ProveDocument")).resolves.toBeNull();
  expect(show).toHaveBeenCalledWith(
    "error",
    "MobileApp.Auth.Verification.Failed",
  );
});

// Declined and Pending both *complete*, so only the decision separates them
// from an approval. Yielding a session id for either would post a rejected or
// unfinished verification as proof.
it("returns no session id for a declined decision", async () => {
  startVerification.mockResolvedValue(completed("Declined") as never);

  await expect(verifyHook()("ProveDocument")).resolves.toBeNull();
  expect(show).toHaveBeenCalledWith(
    "error",
    "MobileApp.Auth.Verification.DeclinedDescription",
  );
});

it("returns no session id for a pending decision", async () => {
  startVerification.mockResolvedValue(completed("Pending") as never);

  await expect(verifyHook()("ProveDocument")).resolves.toBeNull();
  expect(show).toHaveBeenCalledWith(
    "info",
    "MobileApp.Auth.Verification.PendingDescription",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/hooks/__tests__/useDiditVerify.router.test.ts`
Expected: FAIL — cannot resolve module `@/hooks/useDiditVerify`.

- [ ] **Step 3: Create the new hook**

Create `src/hooks/useDiditVerify.tsx` with the body moved out of `useTravellerDidit`, unchanged:

```tsx
import { useLocalization } from "@/providers/LocalizationProvider";
import { useToastRef } from "@/providers/ToastProvider";
import type { UniRefund_TravellerService_Enums_SSRActionType as SSRActionType } from "@/saas/TravellerService";
import { resolveWorkflowId } from "@/utils/didit/workflow";
import { startVerificationWithWorkflow } from "@didit-protocol/sdk-react-native";
import { useCallback } from "react";

/**
 * Runs the Didit workflow for an SSR action and reduces the five terminal
 * states to one answer: an approved `sessionId`, or `null`.
 *
 * Extracted from `useTravellerDidit` so the auth flows (login / register /
 * reset) and Add-document share one copy of this handling. Cancelled is the
 * only silent `null` — the traveller chose it, and a toast would scold them for
 * it. Approved is the only state that yields a session id, which is what keeps
 * a Declined or Pending verification from being posted as proof.
 */
export function useDiditVerify() {
  const { t, languageCode } = useLocalization();
  const toastRef = useToastRef();

  const verify = useCallback(
    async (action: SSRActionType): Promise<string | null> => {
      const workflowId = await resolveWorkflowId(action);
      if (!workflowId) {
        toastRef.current?.show(
          "error",
          t("MobileApp.Auth.Verification.NotAvailable"),
        );
        return null;
      }
      const result = await startVerificationWithWorkflow(workflowId, {
        config: { languageCode, loggingEnabled: __DEV__ },
      });
      if (result.type === "cancelled") return null;
      if (result.type === "failed") {
        toastRef.current?.show("error", t("MobileApp.Auth.Verification.Failed"));
        return null;
      }
      // `type === "completed"` — branch on the verification decision.
      const status = String(result.session.status);
      if (status === "Declined") {
        toastRef.current?.show(
          "error",
          t("MobileApp.Auth.Verification.DeclinedDescription"),
        );
        return null;
      }
      if (status === "Pending") {
        toastRef.current?.show(
          "info",
          t("MobileApp.Auth.Verification.PendingDescription"),
        );
        return null;
      }
      return result.session.sessionId; // Approved
    },
    [languageCode, t, toastRef],
  );

  return { verify };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/hooks/__tests__/useDiditVerify.router.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Consume it from `useTravellerDidit`**

In `src/hooks/useTravellerDidit.tsx`:

1. Delete the whole local `verify` `useCallback` (lines 30-70).
2. Add `const { verify } = useDiditVerify();` beside the existing `const [isBusy, setIsBusy] = useState(false);`.
3. Add `import { useDiditVerify } from "@/hooks/useDiditVerify";`.
4. Remove the now-unused imports: `resolveWorkflowId`, `startVerificationWithWorkflow`, and `languageCode` from the `useLocalization()` destructure (keep `t` — the three flows still use it for their own error toasts).
5. Leave `isBusy`, `loginWithDidit`, `registerWithDidit`, `resetWithDidit`, `KYC_PROVIDER`, `goToCreateTraveller` and `goToReset` exactly as they are. `isBusy` tracks the multi-step flows, not `verify`, so it does not move.

The three `useCallback` dependency arrays already list `verify`; that stays correct.

- [ ] **Step 6: Verify nothing else referenced the removed imports**

Run: `npm run lint`
Expected: no new errors versus the baseline count. An unused-import error here means step 5.4 removed too little.

- [ ] **Step 7: Verify typecheck**

Run: `npm run typecheck`
Expected: no output.

- [ ] **Step 8: Verify the suite**

Run: `npm test`
Expected: **Test Suites: 7 failed, 28 passed, 35 total. Tests: 363 passed** — the 346 baseline plus 6 from Task 2 (which extended an existing suite), 4 from Task 3, and 7 from this task. The consumer refactor itself must add nothing and break nothing.

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useDiditVerify.tsx src/hooks/useTravellerDidit.tsx src/hooks/__tests__/useDiditVerify.router.test.ts
git commit -m "refactor(didit): extract verify() into a shared useDiditVerify hook"
```

---

## Task 5: `useTravellerDocuments`

**Files:**
- Create: `src/screens/traveller/Documents/useTravellerDocuments.ts`
- Test: `src/screens/traveller/Documents/__tests__/useTravellerDocuments.router.test.ts`

The `.router.test.ts` suffix is mandatory: this uses `renderHook`, which renders, and only the `router` Jest project can resolve `react-native`. `src/screens/shared/Tags/TagDetail/__tests__/useTagDetail.router.test.ts` is the precedent.

**Interfaces:**
- Consumes: `getMyDocumentAffiliations()` from `@/actions/TravellerService/actions` (returns `Array<UniRefund_TravellerService_Travellers_TravellerDocumentAffiliationDto>`); `postProveDocumentApi`, `postSetPrimaryDocumentApi` from Task 3; `useDiditVerify` from Task 4; `getTravellerDocumentIdFromClaims` from Task 2; `useAsyncFetch` from `@/hooks/useAsyncFetch`; `useToast()` from `@/providers/ToastProvider` (methods `.success(msg)`, `.error(msg)`).
- Produces:

```ts
export type TravellerDocument =
  UniRefund_TravellerService_Travellers_TravellerDocumentAffiliationDto;

export function useTravellerDocuments(): {
  documents: TravellerDocument[];
  activeDocumentId: string;
  loading: boolean;
  error: string | null;
  pendingId: string | null;
  isAdding: boolean;
  canAdd: boolean;
  refresh: () => Promise<TravellerDocument[] | undefined>;
  setPrimary: (travellerDocumentId: string) => Promise<void>;
  addDocument: () => Promise<void>;
};
```

Task 7 consumes every field.

- [ ] **Step 1: Write the failing test**

Create `src/screens/traveller/Documents/__tests__/useTravellerDocuments.router.test.ts`:

```ts
import { getMyDocumentAffiliations } from "@/actions/TravellerService/actions";
import {
  postProveDocumentApi,
  postSetPrimaryDocumentApi,
} from "@/actions/TravellerService/post";
import useUserStore from "@/store/user";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useTravellerDocuments } from "../useTravellerDocuments";

jest.mock("@/actions/TravellerService/actions", () => ({
  getMyDocumentAffiliations: jest.fn(),
}));
jest.mock("@/actions/TravellerService/post", () => ({
  postProveDocumentApi: jest.fn(),
  postSetPrimaryDocumentApi: jest.fn(),
}));

const verify = jest.fn();
jest.mock("@/hooks/useDiditVerify", () => ({
  useDiditVerify: () => ({ verify }),
}));

// `t` returns the key so assertions name the message rather than its English.
jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

const toast = { success: jest.fn(), error: jest.fn() };
jest.mock("@/providers/ToastProvider", () => ({
  useToast: () => toast,
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const readList = getMyDocumentAffiliations as jest.MockedFunction<
  typeof getMyDocumentAffiliations
>;
const prove = postProveDocumentApi as jest.MockedFunction<
  typeof postProveDocumentApi
>;
const setPrimaryApi = postSetPrimaryDocumentApi as jest.MockedFunction<
  typeof postSetPrimaryDocumentApi
>;

const passport = {
  affiliationId: "aff-1",
  travellerId: "tr-1",
  travellerDocumentId: "doc-1",
  travellerDocumentFullName: "JOHN SMITH",
  identificationNumber: "P1234567",
  identificationType: "Passport" as const,
  isPrimary: true,
  isActive: true,
  evidenceLevel: "Low" as const,
};

const idCard = {
  ...passport,
  affiliationId: "aff-2",
  travellerDocumentId: "doc-2",
  identificationNumber: "12345678901",
  identificationType: "IdCard" as const,
  isPrimary: false,
  isActive: false,
};

/** A signed-in traveller holding both grants prove-document requires. */
function signIn(travellerDocumentId = "doc-1", granted = true) {
  useUserStore.setState({
    user: {
      jwtUser: { TravellerDocumentId: travellerDocumentId },
      grantedPolicies: {
        "TravellerService.SSRActions": granted,
        "TravellerService.SSRActions.ProveDocument": granted,
      },
    },
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  readList.mockResolvedValue([passport, idCard]);
  signIn();
});

describe("the list", () => {
  it("exposes the affiliations and the active id from the token claim", async () => {
    const { result } = renderHook(() => useTravellerDocuments());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.documents).toHaveLength(2);
    // From the claim, not from `isActive` on the DTO.
    expect(result.current.activeDocumentId).toBe("doc-1");
  });
});

describe("addDocument", () => {
  it("does not run a verification without the ProveDocument grant", async () => {
    signIn("doc-1", false);
    const { result } = renderHook(() => useTravellerDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canAdd).toBe(false);
    await act(async () => {
      await result.current.addDocument();
    });

    expect(verify).not.toHaveBeenCalled();
    expect(prove).not.toHaveBeenCalled();
  });

  it("does not post when the verification yields no session", async () => {
    verify.mockResolvedValue(null);
    const { result } = renderHook(() => useTravellerDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addDocument();
    });

    expect(verify).toHaveBeenCalledWith("ProveDocument");
    expect(prove).not.toHaveBeenCalled();
    // `verify` owns the messaging for its own non-approved states.
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reports a failed post and leaves the list alone", async () => {
    verify.mockResolvedValue("session-1");
    prove.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useTravellerDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));
    readList.mockClear();

    await act(async () => {
      await result.current.addDocument();
    });

    expect(toast.error).toHaveBeenCalledWith("MobileApp.Documents.AddFailed");
    expect(readList).not.toHaveBeenCalled();
  });

  it("says added when the proved document was not already on the account", async () => {
    verify.mockResolvedValue("session-1");
    prove.mockResolvedValue({ travellerDocumentId: "doc-3", level: "High" });
    const { result } = renderHook(() => useTravellerDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addDocument();
    });

    expect(toast.success).toHaveBeenCalledWith("MobileApp.Documents.Added");
  });

  // Re-proving a passport already on the account raises its evidence level
  // instead of adding a row. Calling that "added" sends the traveller looking
  // for a row that never appears.
  it("says updated when the proved document was already on the account", async () => {
    verify.mockResolvedValue("session-1");
    prove.mockResolvedValue({ travellerDocumentId: "doc-2", level: "High" });
    const { result } = renderHook(() => useTravellerDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addDocument();
    });

    expect(toast.success).toHaveBeenCalledWith("MobileApp.Documents.Updated");
  });

  it("refetches the list after a successful prove", async () => {
    verify.mockResolvedValue("session-1");
    prove.mockResolvedValue({ travellerDocumentId: "doc-3", level: "High" });
    const { result } = renderHook(() => useTravellerDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));
    readList.mockClear();

    await act(async () => {
      await result.current.addDocument();
    });

    expect(readList).toHaveBeenCalledTimes(1);
  });
});

describe("setPrimary", () => {
  it("posts, refetches and reports success", async () => {
    setPrimaryApi.mockResolvedValue({});
    const { result } = renderHook(() => useTravellerDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));
    readList.mockClear();

    await act(async () => {
      await result.current.setPrimary("doc-2");
    });

    expect(setPrimaryApi).toHaveBeenCalledWith("doc-2");
    expect(readList).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith(
      "MobileApp.Documents.SetPrimarySuccess",
    );
  });

  // A second tap must say something. Returning silently leaves the traveller
  // watching a row that never changes.
  it("refuses a second mutation while one is in flight", async () => {
    let release: (value: unknown) => void = () => {};
    setPrimaryApi.mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );
    const { result } = renderHook(() => useTravellerDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.setPrimary("doc-2");
    });
    await act(async () => {
      await result.current.setPrimary("doc-1");
    });

    expect(toast.error).toHaveBeenCalledWith("MobileApp.Documents.Busy");
    expect(setPrimaryApi).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({});
      await first;
    });
  });

  // The failure may be partial, or the list may already be stale; refetching
  // guarantees the screen shows what the server holds.
  it("still refetches when the post fails", async () => {
    setPrimaryApi.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useTravellerDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));
    readList.mockClear();

    await act(async () => {
      await result.current.setPrimary("doc-2");
    });

    expect(toast.error).toHaveBeenCalledWith(
      "MobileApp.Documents.SetPrimaryFailed",
    );
    expect(readList).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/screens/traveller/Documents/__tests__/useTravellerDocuments.router.test.ts`
Expected: FAIL — cannot resolve module `../useTravellerDocuments`.

- [ ] **Step 3: Write the implementation**

Create `src/screens/traveller/Documents/useTravellerDocuments.ts`:

```ts
import { getMyDocumentAffiliations } from "@/actions/TravellerService/actions";
import {
  postProveDocumentApi,
  postSetPrimaryDocumentApi,
} from "@/actions/TravellerService/post";
import useAsyncFetch from "@/hooks/useAsyncFetch";
import { useDiditVerify } from "@/hooks/useDiditVerify";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useToast } from "@/providers/ToastProvider";
import type { UniRefund_TravellerService_Travellers_TravellerDocumentAffiliationDto } from "@/saas/TravellerService";
import useUserStore from "@/store/user";
import { logger } from "@/utils/logger";
import { getTravellerDocumentIdFromClaims } from "@/utils/traveller";
import { useCallback, useMemo, useState } from "react";

export type TravellerDocument =
  UniRefund_TravellerService_Travellers_TravellerDocumentAffiliationDto;

/**
 * Owns the Documents screen's server state: the list, the two mutations that
 * act on it, their toasts, and which row is mid-flight.
 *
 * Mutations refetch rather than patching local state. Set-primary in particular
 * has a side effect on a *different* row — it clears the previous primary — so
 * a local patch would leave two rows badged primary.
 *
 * `activeDocumentId` comes from the token claim, never from the DTO's
 * `isActive`. That field is itself derived from the claim, and the claim is the
 * copy `fetchNewAccessToken` refreshes, so reading it keeps this screen and the
 * Home pill agreeing without shared state between them.
 */
export function useTravellerDocuments() {
  const { t } = useLocalization();
  const toast = useToast();
  const { verify } = useDiditVerify();
  const { user } = useUserStore();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const { data, loading, error, execute } = useAsyncFetch(
    getMyDocumentAffiliations,
  );

  const documents = useMemo<TravellerDocument[]>(() => data ?? [], [data]);

  const activeDocumentId = getTravellerDocumentIdFromClaims(user?.jwtUser);

  // `prove-document` requires both grants. Checking here keeps a traveller
  // whose tenant has not granted them from photographing a passport only to be
  // refused at the last step.
  const canAdd = Boolean(
    user?.grantedPolicies?.["TravellerService.SSRActions"] &&
      user?.grantedPolicies?.["TravellerService.SSRActions.ProveDocument"],
  );

  const refresh = useCallback(() => execute(), [execute]);

  const setPrimary = useCallback(
    async (travellerDocumentId: string) => {
      if (pendingId) {
        toast.error(t("MobileApp.Documents.Busy"));
        return;
      }
      setPendingId(travellerDocumentId);
      try {
        await postSetPrimaryDocumentApi(travellerDocumentId);
        toast.success(t("MobileApp.Documents.SetPrimarySuccess"));
      } catch (err) {
        logger.error("Set primary document failed", err);
        toast.error(t("MobileApp.Documents.SetPrimaryFailed"));
      } finally {
        // Outside the try/catch branches on purpose: a partial failure, or a
        // list that was already stale, both end with the screen showing what
        // the server holds rather than an optimistic guess.
        await execute();
        setPendingId(null);
      }
    },
    [execute, pendingId, t, toast],
  );

  const addDocument = useCallback(async () => {
    if (!canAdd || isAdding) return;
    setIsAdding(true);
    try {
      const sessionId = await verify("ProveDocument");
      // Cancelled, declined, pending or failed. `verify` has already said so
      // where saying so is warranted; adding a toast here would double it.
      if (!sessionId) return;

      const knownIds = new Set(documents.map((d) => d.travellerDocumentId));
      const result = await postProveDocumentApi(sessionId);
      await execute();

      const wasKnown =
        !!result?.travellerDocumentId &&
        knownIds.has(result.travellerDocumentId);
      toast.success(
        t(
          wasKnown
            ? "MobileApp.Documents.Updated"
            : "MobileApp.Documents.Added",
        ),
      );
    } catch (err) {
      logger.error("Prove document failed", err);
      toast.error(t("MobileApp.Documents.AddFailed"));
    } finally {
      setIsAdding(false);
    }
  }, [canAdd, documents, execute, isAdding, t, toast, verify]);

  return {
    documents,
    activeDocumentId,
    loading,
    error,
    pendingId,
    isAdding,
    canAdd,
    refresh,
    setPrimary,
    addDocument,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/screens/traveller/Documents/__tests__/useTravellerDocuments.router.test.ts`
Expected: PASS, 10 tests (1 list + 6 addDocument + 3 setPrimary).

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/screens/traveller/Documents/useTravellerDocuments.ts src/screens/traveller/Documents/__tests__/useTravellerDocuments.router.test.ts
git commit -m "feat(documents): add useTravellerDocuments with add and set-primary"
```

---

## Task 6: `DocumentCard`

Presentational only — no hooks, no fetching. Its tests assert the badge and pill combinations, which is where a props-only component still gets logic wrong: a set-primary pill on a row that is already primary, or a missing type label.

**Files:**
- Create: `src/screens/traveller/Documents/_components/DocumentCard.tsx`
- Test: `src/screens/traveller/Documents/__tests__/DocumentCard.router.test.tsx` (`.router.` — it renders)

**Interfaces:**
- Consumes: `TravellerDocument` from Task 5.
- Produces: `DocumentCard` with props `{ document: TravellerDocument; isActive: boolean; onSetPrimary?: () => void; disabled?: boolean }`. Task 7 renders it.

- [ ] **Step 1: Write the failing test**

Create `src/screens/traveller/Documents/__tests__/DocumentCard.router.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { DocumentCard } from "../_components/DocumentCard";
import type { TravellerDocument } from "../useTravellerDocuments";

// `t` returns the key, so the assertions below name keys rather than English.
jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

const passport: TravellerDocument = {
  affiliationId: "aff-1",
  travellerId: "tr-1",
  travellerDocumentId: "doc-1",
  travellerDocumentFullName: "JOHN SMITH",
  identificationNumber: "P1234567",
  identificationType: "Passport",
  isPrimary: true,
  isActive: true,
  evidenceLevel: "High",
};

const idCard: TravellerDocument = {
  ...passport,
  affiliationId: "aff-2",
  travellerDocumentId: "doc-2",
  identificationNumber: "12345678901",
  identificationType: "IdCard",
  isPrimary: false,
  evidenceLevel: "Low",
};

it("shows the holder name, type label and number", () => {
  render(<DocumentCard document={passport} isActive={false} />);

  expect(screen.getByText("JOHN SMITH")).toBeTruthy();
  expect(
    screen.getByText("MobileApp.Documents.Type.Passport · P1234567"),
  ).toBeTruthy();
});

it("badges the primary document and its evidence level", () => {
  render(<DocumentCard document={passport} isActive={false} />);

  expect(screen.getByText("MobileApp.Documents.Primary")).toBeTruthy();
  expect(
    screen.getByText("MobileApp.Documents.EvidenceLevel.High"),
  ).toBeTruthy();
  expect(screen.queryByText("MobileApp.Documents.InUse")).toBeNull();
});

// `isActive` is the caller's answer from the JWT claim, not the DTO's field.
it("badges the active document only when the caller says so", () => {
  render(<DocumentCard document={idCard} isActive />);

  expect(screen.getByText("MobileApp.Documents.InUse")).toBeTruthy();
});

// Offering "set as primary" on the row that already is primary would be a
// no-op the traveller can tap.
it("offers no set-primary action on the primary document", () => {
  render(
    <DocumentCard
      document={passport}
      isActive={false}
      onSetPrimary={jest.fn()}
    />,
  );

  expect(screen.queryByText("MobileApp.Documents.SetPrimary")).toBeNull();
});

it("offers set-primary on a non-primary document and reports the press", () => {
  const onSetPrimary = jest.fn();
  render(
    <DocumentCard document={idCard} isActive={false} onSetPrimary={onSetPrimary} />,
  );

  fireEvent.press(screen.getByText("MobileApp.Documents.SetPrimary"));
  expect(onSetPrimary).toHaveBeenCalledTimes(1);
});

it("swallows the press while another mutation is in flight", () => {
  const onSetPrimary = jest.fn();
  render(
    <DocumentCard
      document={idCard}
      isActive={false}
      onSetPrimary={onSetPrimary}
      disabled
    />,
  );

  fireEvent.press(screen.getByText("MobileApp.Documents.SetPrimary"));
  expect(onSetPrimary).not.toHaveBeenCalled();
});

it("renders without a set-primary action when none is given", () => {
  render(<DocumentCard document={idCard} isActive={false} />);

  expect(screen.queryByText("MobileApp.Documents.SetPrimary")).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/screens/traveller/Documents/__tests__/DocumentCard.router.test.tsx`
Expected: FAIL — cannot resolve module `../_components/DocumentCard`.

- [ ] **Step 3: Write the component**

```tsx
import { Ionicons, type IoniconsTypes } from "@/components/Ionicons";
import { useLocalization } from "@/providers/LocalizationProvider";
import type { UniRefund_Shared_KYCEnums_Enums_IdentificationType as IdentificationType } from "@/saas/TravellerService";
import { cn } from "@/utils/cn";
import { Pressable, Text, View } from "react-native";
import type { TravellerDocument } from "../useTravellerDocuments";

/** Only passport and ID card get their own glyph; the rest read as documents. */
const TYPE_ICONS: Record<IdentificationType, IoniconsTypes> = {
  Passport: "airplane-outline",
  IdCard: "card-outline",
  DriverLicense: "car-outline",
  ResidencePermit: "home-outline",
  HealthInsurance: "medkit-outline",
};

function Badge({ label, className }: { label: string; className?: string }) {
  return (
    <View className={cn("rounded-full bg-gray-100 px-2 py-1", className)}>
      <Text className="text-[10px] font-semibold text-gray-700">{label}</Text>
    </View>
  );
}

/**
 * One traveller document. Pure presentation: the caller decides whether this is
 * the active document and whether set-primary is offered, so the same row
 * renders identically wherever it is used.
 */
export function DocumentCard({
  document,
  isActive,
  onSetPrimary,
  disabled,
}: {
  document: TravellerDocument;
  isActive: boolean;
  onSetPrimary?: () => void;
  disabled?: boolean;
}) {
  const { t } = useLocalization();
  const type = document.identificationType;

  return (
    <View className="gap-2 rounded-2xl border border-gray-200 bg-white p-4">
      <View className="flex-row items-center gap-3">
        <View className="size-10 items-center justify-center rounded-full bg-gray-100">
          <Ionicons
            name={type ? TYPE_ICONS[type] : "document-text-outline"}
            size={20}
            color="#374151"
          />
        </View>
        <View className="flex-1">
          <Text
            className="text-base font-semibold text-gray-900"
            numberOfLines={1}
          >
            {document.travellerDocumentFullName ?? ""}
          </Text>
          <Text className="text-sm text-gray-600" numberOfLines={1}>
            {[
              type ? t(`MobileApp.Documents.Type.${type}`) : null,
              document.identificationNumber,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        {document.isPrimary && (
          <Badge
            label={t("MobileApp.Documents.Primary")}
            className="bg-amber-100"
          />
        )}
        {isActive && (
          <Badge
            label={t("MobileApp.Documents.InUse")}
            className="bg-green-100"
          />
        )}
        {document.evidenceLevel && (
          <Badge
            label={t(
              `MobileApp.Documents.EvidenceLevel.${document.evidenceLevel}`,
            )}
          />
        )}

        {onSetPrimary && !document.isPrimary && (
          <Pressable
            onPress={onSetPrimary}
            disabled={disabled}
            hitSlop={6}
            className={cn(
              "ml-auto rounded-full border border-primary px-3 py-1",
              disabled && "opacity-50",
            )}
          >
            <Text className="text-xs font-semibold text-primary">
              {t("MobileApp.Documents.SetPrimary")}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/screens/traveller/Documents/__tests__/DocumentCard.router.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: no output. A failure on the two template-literal `t()` calls means Task 1's `npm run init` did not land the `Type.*` or `EvidenceLevel.*` keys — re-run it.

- [ ] **Step 6: Verify lint**

Run: `npm run lint`
Expected: no new errors versus baseline.

- [ ] **Step 7: Commit**

```bash
git add src/screens/traveller/Documents/_components/DocumentCard.tsx src/screens/traveller/Documents/__tests__/DocumentCard.router.test.tsx
git commit -m "feat(documents): add the DocumentCard row"
```

---

## Task 7: Documents screen, route and Profile entry point

**Files:**
- Create: `src/screens/traveller/Documents/openDocuments.ts`
- Create: `src/screens/traveller/Documents/DocumentsScreen.tsx`
- Create: `src/app/(auth)/profile/documents.tsx`
- Modify: `src/app/(auth)/profile/_layout.tsx` (add to the `Stack.Screen` list, currently `index`, `edit-profile`, `cards`)
- Modify: `src/screens/traveller/Profile/ProfileScreen.tsx` (insert a row into `menuItems`, after the `MobileApp.Cards.Title` entry at lines 61-65)
- Test: `src/screens/traveller/Documents/__tests__/openDocuments.router.test.tsx`

**Interfaces:**
- Consumes: `useTravellerDocuments` (Task 5), `DocumentCard` (Task 6).
- Produces: `DOCUMENTS_HREF` (`"/(auth)/profile/documents"`) and `openDocuments()`, imported by `ProfileScreen`.

- [ ] **Step 1: Write the failing router test**

Create `src/screens/traveller/Documents/__tests__/openDocuments.router.test.tsx`. Modelled on the existing `Cards/__tests__/openCards.router.test.tsx`, but simpler: Documents has one entry point, so the route tree only has to prove back returns to the profile page.

```tsx
import * as profileLayout from "@/app/(auth)/profile/_layout";
import { Tabs } from "expo-router";
import {
  fireEvent,
  renderRouter,
  screen,
  testRouter,
} from "expo-router/testing-library";
import React from "react";
import { Pressable, Text } from "react-native";
import { openDocuments } from "../openDocuments";

/**
 * Documents sits inside the Profile tab's stack and is reached only from the
 * profile page, so the stack always holds `profile/index` underneath and back
 * must land there. `profile/_layout` is the app's real module, so this cannot
 * pass while the route is unregistered. The screens are stubs; only navigation
 * state is under test.
 */

function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

const routes = {
  "(auth)/_layout": TabsLayout,
  "(auth)/index": () => <Text>Home screen</Text>,
  "(auth)/profile/_layout": profileLayout,
  "(auth)/profile/index": () => (
    <Pressable testID="open-documents" onPress={openDocuments}>
      <Text>Open documents</Text>
    </Pressable>
  ),
  "(auth)/profile/documents": () => <Text>Documents screen</Text>,
  // Declared by the real profile layout; stubbed so it warns about nothing.
  "(auth)/profile/cards": () => <Text>Cards screen</Text>,
  "(auth)/profile/edit-profile": () => <Text>Edit profile screen</Text>,
};

describe("documents, opened from the profile page", () => {
  it("navigates to the documents route", () => {
    const { getPathname } = renderRouter(routes, { initialUrl: "/profile" });

    fireEvent.press(screen.getByTestId("open-documents"));
    expect(getPathname()).toBe("/profile/documents");
  });

  it("goes back to the profile page", () => {
    const { getPathname } = renderRouter(routes, { initialUrl: "/profile" });

    fireEvent.press(screen.getByTestId("open-documents"));
    testRouter.back();
    expect(getPathname()).toBe("/profile");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/screens/traveller/Documents/__tests__/openDocuments.router.test.tsx`
Expected: FAIL — cannot resolve module `../openDocuments`.

- [ ] **Step 3: Write `openDocuments.ts`**

```ts
import { router } from "expo-router";

/** Documents lives inside the Profile tab's stack. */
export const DOCUMENTS_HREF = "/(auth)/profile/documents" as const;

/**
 * Open the traveller's documents screen.
 *
 * Reached only from the Profile settings row, so the tab's stack already holds
 * `profile/index` and back returns there. No `withAnchor` for that reason — and
 * if a second entry point is ever added from outside the Profile tab, read the
 * comment in `Cards/openCards.ts` before wiring it, because that is the case it
 * exists to handle.
 */
export function openDocuments() {
  router.push(DOCUMENTS_HREF);
}
```

- [ ] **Step 4: Register the route**

Create `src/app/(auth)/profile/documents.tsx`:

```tsx
import DocumentsScreen from "@/screens/traveller/Documents/DocumentsScreen";

export default function Page() {
  return <DocumentsScreen />;
}
```

In `src/app/(auth)/profile/_layout.tsx`, add after the `cards` entry:

```tsx
      <Stack.Screen name="documents" options={{}} />
```

- [ ] **Step 5: Write `DocumentsScreen.tsx`**

```tsx
import Button from "@/components/Button";
import { Ionicons } from "@/components/Ionicons";
import { useLocalization } from "@/providers/LocalizationProvider";
import { ModalTemplate } from "@/templates/Modal";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { DocumentCard } from "./_components/DocumentCard";
import { useTravellerDocuments } from "./useTravellerDocuments";

export default function DocumentsScreen() {
  const { t } = useLocalization();
  const {
    documents,
    activeDocumentId,
    loading,
    error,
    pendingId,
    isAdding,
    canAdd,
    refresh,
    setPrimary,
    addDocument,
  } = useTravellerDocuments();

  const isEmpty = documents.length === 0;

  return (
    <ModalTemplate
      title={t("MobileApp.Documents.Title")}
      description={t("MobileApp.Documents.Description")}
      // ModalTemplate renders its back arrow only when `backAction` is given,
      // so this must be a real handler, not a no-op.
      backAction={() => router.back()}
    >
      {loading && isEmpty ? (
        <View className="items-center py-10">
          <ActivityIndicator />
        </View>
      ) : error && isEmpty ? (
        <View className="items-center gap-3 py-10">
          <Text className="text-center text-gray-600">
            {t("MobileApp.Documents.LoadFailed")}
          </Text>
          <Button
            action={{
              onPress: () => void refresh(),
              label: t("MobileApp.Documents.Retry"),
            }}
            containerClassName="w-40"
          />
        </View>
      ) : (
        <View className="gap-3 pb-8">
          {/* Every mutation ends in a refetch, and `useAsyncFetch` swallows its
              own errors rather than rethrowing — so a refetch can fail while a
              good list is on screen. Keep the rows and offer a retry instead of
              replacing what the traveller was reading. */}
          {error && (
            <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
              <Text className="flex-1 text-sm text-amber-900">
                {t("MobileApp.Documents.LoadFailed")}
              </Text>
              <Pressable onPress={() => void refresh()} hitSlop={8}>
                <Text className="text-sm font-semibold text-amber-900">
                  {t("MobileApp.Documents.Retry")}
                </Text>
              </Pressable>
            </View>
          )}

          {isEmpty ? (
            <View className="items-center gap-2 rounded-2xl border border-dashed border-gray-300 p-6">
              <Ionicons name="document-text-outline" size={32} color="#9CA3AF" />
              <Text className="text-base font-semibold text-gray-900">
                {t("MobileApp.Documents.Empty")}
              </Text>
              <Text className="text-center text-sm text-gray-600">
                {t("MobileApp.Documents.EmptyDescription")}
              </Text>
            </View>
          ) : (
            documents.map((document) => {
              // Every id on this DTO is optional. Falling back to `""` would
              // post set-primary against an empty id and badge a document as
              // in-use whenever the claim is also empty — so a row without an
              // id simply gets no action instead.
              const id = document.travellerDocumentId;
              return (
                <DocumentCard
                  key={id ?? document.affiliationId}
                  document={document}
                  isActive={!!id && id === activeDocumentId}
                  onSetPrimary={id ? () => void setPrimary(id) : undefined}
                  disabled={pendingId !== null}
                />
              );
            })
          )}

          <Button
            action={{
              onPress: () => void addDocument(),
              label: t("MobileApp.Documents.AddDocument"),
            }}
            iconName="add-outline"
            isLoading={isAdding}
            disabled={!canAdd}
          />
          {/* Disabled rather than hidden: a missing grant is a tenant
              configuration problem, and a button that simply vanishes is
              invisible to both the traveller and whoever they report it to. */}
          {!canAdd && (
            <Text className="text-center text-xs text-gray-500">
              {t("MobileApp.Documents.AddNotPermitted")}
            </Text>
          )}
        </View>
      )}
    </ModalTemplate>
  );
}
```

- [ ] **Step 6: Add the Profile row**

In `src/screens/traveller/Profile/ProfileScreen.tsx`, add `import { openDocuments } from "../Documents/openDocuments";` beside the existing `openCards` import, then insert into `menuItems` directly after the `MobileApp.Cards.Title` entry:

```tsx
    {
      title: t("MobileApp.Documents.Title"),
      icon: "document-text-outline",
      onPress: openDocuments,
    },
```

- [ ] **Step 7: Run the router test to verify it passes**

Run: `npx jest src/screens/traveller/Documents/__tests__/openDocuments.router.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 8: Verify typecheck and lint**

Run: `npm run typecheck`
Expected: no output.

Run: `npm run lint`
Expected: no new errors versus baseline.

- [ ] **Step 9: Commit**

```bash
git add src/screens/traveller/Documents/openDocuments.ts src/screens/traveller/Documents/DocumentsScreen.tsx src/screens/traveller/Documents/__tests__/openDocuments.router.test.tsx "src/app/(auth)/profile/documents.tsx" "src/app/(auth)/profile/_layout.tsx" src/screens/traveller/Profile/ProfileScreen.tsx
git commit -m "feat(documents): add the traveller documents screen and its profile entry"
```

---

## Task 8: `useDocumentSwitcher`

**Files:**
- Create: `src/screens/traveller/Documents/useDocumentSwitcher.ts`
- Test: `src/screens/traveller/Documents/__tests__/useDocumentSwitcher.router.test.ts`

**Interfaces:**
- Consumes: `getMyDocumentAffiliations`; `postSetActiveDocumentApi` (Task 3); `getTravellerDocumentIdFromClaims` (Task 2); `TravellerDocument` (Task 5); `useSession()` from `@/providers/SessionProvider`, whose `fetchNewAccessToken: () => Promise<boolean | null>` resolves truthy on success.
- Produces:

```ts
export function useDocumentSwitcher(): {
  documents: TravellerDocument[];
  activeDocumentId: string;
  selectedId: string;
  select: (travellerDocumentId: string) => void;
  switchTo: (travellerDocumentId: string) => Promise<boolean>;
  isSwitching: boolean;
};
```

`switchTo` resolves `true` only when both the POST and the token refresh succeeded — Task 9 uses that to decide whether to dismiss the sheet.

- [ ] **Step 1: Write the failing test**

Create `src/screens/traveller/Documents/__tests__/useDocumentSwitcher.router.test.ts`:

```ts
import { getMyDocumentAffiliations } from "@/actions/TravellerService/actions";
import { postSetActiveDocumentApi } from "@/actions/TravellerService/post";
import useUserStore from "@/store/user";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useDocumentSwitcher } from "../useDocumentSwitcher";

jest.mock("@/actions/TravellerService/actions", () => ({
  getMyDocumentAffiliations: jest.fn(),
}));
jest.mock("@/actions/TravellerService/post", () => ({
  postSetActiveDocumentApi: jest.fn(),
}));

const fetchNewAccessToken = jest.fn();
jest.mock("@/providers/SessionProvider", () => ({
  useSession: () => ({ fetchNewAccessToken }),
}));

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

const toast = { success: jest.fn(), error: jest.fn() };
jest.mock("@/providers/ToastProvider", () => ({
  useToast: () => toast,
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const readList = getMyDocumentAffiliations as jest.MockedFunction<
  typeof getMyDocumentAffiliations
>;
const setActive = postSetActiveDocumentApi as jest.MockedFunction<
  typeof postSetActiveDocumentApi
>;

const documents = [
  {
    affiliationId: "aff-1",
    travellerDocumentId: "doc-1",
    identificationNumber: "P1234567",
    identificationType: "Passport" as const,
    isPrimary: true,
  },
  {
    affiliationId: "aff-2",
    travellerDocumentId: "doc-2",
    identificationNumber: "12345678901",
    identificationType: "IdCard" as const,
    isPrimary: false,
  },
];

function signIn(travellerDocumentId = "doc-1") {
  useUserStore.setState({
    user: { jwtUser: { TravellerDocumentId: travellerDocumentId } },
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  readList.mockResolvedValue(documents);
  fetchNewAccessToken.mockResolvedValue(true);
  signIn();
});

describe("initial state", () => {
  it("selects the active document from the token claim", async () => {
    const { result } = renderHook(() => useDocumentSwitcher());

    await waitFor(() => expect(result.current.documents).toHaveLength(2));
    expect(result.current.activeDocumentId).toBe("doc-1");
    expect(result.current.selectedId).toBe("doc-1");
  });

  // With no claim there is nothing to switch between and no point paying for
  // the request on the app's landing screen.
  it("issues no request without a claim", async () => {
    signIn("");
    renderHook(() => useDocumentSwitcher());

    await waitFor(() => expect(readList).not.toHaveBeenCalled());
  });
});

describe("switchTo", () => {
  it("posts then refreshes the token, in that order", async () => {
    const calls: string[] = [];
    setActive.mockImplementation(async () => {
      calls.push("setActive");
      return {};
    });
    fetchNewAccessToken.mockImplementation(async () => {
      calls.push("refresh");
      return true;
    });

    const { result } = renderHook(() => useDocumentSwitcher());
    await waitFor(() => expect(result.current.documents).toHaveLength(2));

    let outcome = false;
    await act(async () => {
      outcome = await result.current.switchTo("doc-2");
    });

    expect(setActive).toHaveBeenCalledWith("doc-2");
    // The old token still carries the old claim until it is replaced, so the
    // order is not cosmetic.
    expect(calls).toEqual(["setActive", "refresh"]);
    expect(outcome).toBe(true);
    expect(toast.success).toHaveBeenCalled();
  });

  it("resets the selection and does not refresh when the post fails", async () => {
    setActive.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useDocumentSwitcher());
    await waitFor(() => expect(result.current.documents).toHaveLength(2));

    act(() => result.current.select("doc-2"));
    expect(result.current.selectedId).toBe("doc-2");

    let outcome = true;
    await act(async () => {
      outcome = await result.current.switchTo("doc-2");
    });

    expect(fetchNewAccessToken).not.toHaveBeenCalled();
    expect(result.current.selectedId).toBe("doc-1");
    expect(outcome).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      "MobileApp.Documents.SwitchFailed",
    );
  });

  // The switch DID happen server-side; only the token is stale. Calling this
  // "switch failed" would have the traveller retry something already done.
  it("reports a stale session, not a failure, when the refresh fails", async () => {
    setActive.mockResolvedValue({});
    fetchNewAccessToken.mockResolvedValue(false);

    const { result } = renderHook(() => useDocumentSwitcher());
    await waitFor(() => expect(result.current.documents).toHaveLength(2));

    let outcome = true;
    await act(async () => {
      outcome = await result.current.switchTo("doc-2");
    });

    expect(toast.error).toHaveBeenCalledWith(
      "MobileApp.Documents.SwitchNeedsRelogin",
    );
    expect(toast.error).not.toHaveBeenCalledWith(
      "MobileApp.Documents.SwitchFailed",
    );
    expect(outcome).toBe(false);
  });

  it("refetches the list after a successful switch", async () => {
    setActive.mockResolvedValue({});
    const { result } = renderHook(() => useDocumentSwitcher());
    await waitFor(() => expect(result.current.documents).toHaveLength(2));
    readList.mockClear();

    await act(async () => {
      await result.current.switchTo("doc-2");
    });

    expect(readList).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/screens/traveller/Documents/__tests__/useDocumentSwitcher.router.test.ts`
Expected: FAIL — cannot resolve module `../useDocumentSwitcher`.

- [ ] **Step 3: Write the implementation**

Create `src/screens/traveller/Documents/useDocumentSwitcher.ts`:

```ts
import { getMyDocumentAffiliations } from "@/actions/TravellerService/actions";
import { postSetActiveDocumentApi } from "@/actions/TravellerService/post";
import useAsyncFetch from "@/hooks/useAsyncFetch";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useSession } from "@/providers/SessionProvider";
import { useToast } from "@/providers/ToastProvider";
import useUserStore from "@/store/user";
import { logger } from "@/utils/logger";
import { getTravellerDocumentIdFromClaims } from "@/utils/traveller";
import { useCallback, useMemo, useState } from "react";
import type { TravellerDocument } from "./useTravellerDocuments";

/**
 * State for the document switcher: the list, which document the session acts
 * as, which the traveller has tapped, and the switch itself.
 *
 * Fetching is gated on the claim through `useAsyncFetch`'s own `immediate`
 * flag rather than an effect here. An account with no `TravellerDocumentId` has
 * nothing to switch between, and this hook mounts on Home — the app's landing
 * screen — so an ungated fetch would add a round-trip there for every staff
 * login. When the claim arrives, `immediate` flips true and `useAsyncFetch`
 * fetches; a later *change* of claim does not refetch, which is correct because
 * `switchTo` refetches explicitly.
 */
export function useDocumentSwitcher() {
  const { t } = useLocalization();
  const toast = useToast();
  const { fetchNewAccessToken } = useSession();
  const { user } = useUserStore();
  const [isSwitching, setIsSwitching] = useState(false);

  const activeDocumentId = getTravellerDocumentIdFromClaims(user?.jwtUser);

  const { data, execute } = useAsyncFetch(getMyDocumentAffiliations, {
    immediate: Boolean(activeDocumentId),
  });

  // `null` = untouched, so the selection tracks the claim. Derived rather than
  // synced with an effect: a completed switch changes the claim, and an effect
  // mirroring it into state would leave one render showing the old document,
  // then correct itself in front of the traveller. See
  // `.claude/rules/avoid-use-effect.md`.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const selectedId = pickedId ?? activeDocumentId;

  const documents = useMemo<TravellerDocument[]>(() => data ?? [], [data]);

  const select = useCallback((travellerDocumentId: string) => {
    setPickedId(travellerDocumentId);
  }, []);

  const switchTo = useCallback(
    async (travellerDocumentId: string): Promise<boolean> => {
      if (isSwitching) return false;
      setIsSwitching(true);
      try {
        await postSetActiveDocumentApi(travellerDocumentId);
      } catch (err) {
        logger.error("Set active document failed", err);
        toast.error(t("MobileApp.Documents.SwitchFailed"));
        // Back to untouched, so the selection falls through to the claim again.
        setPickedId(null);
        setIsSwitching(false);
        return false;
      }

      // The POST has landed: the account is switched. Everything below is about
      // catching the session up, and a failure there is a different problem.
      try {
        const refreshed = await fetchNewAccessToken();
        await execute();
        if (!refreshed) {
          toast.error(t("MobileApp.Documents.SwitchNeedsRelogin"));
          return false;
        }
        const label =
          documents.find((d) => d.travellerDocumentId === travellerDocumentId)
            ?.identificationNumber ?? "";
        toast.success(t("MobileApp.Documents.SwitchSuccess", { number: label }));
        // The claim now names the switched-to document, so drop the pick and let
        // the selection track the claim again.
        setPickedId(null);
        return true;
      } catch (err) {
        logger.error("Token refresh after document switch failed", err);
        toast.error(t("MobileApp.Documents.SwitchNeedsRelogin"));
        return false;
      } finally {
        setIsSwitching(false);
      }
    },
    [documents, execute, fetchNewAccessToken, isSwitching, t, toast],
  );

  return {
    documents,
    activeDocumentId,
    selectedId,
    select,
    switchTo,
    isSwitching,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/screens/traveller/Documents/__tests__/useDocumentSwitcher.router.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/screens/traveller/Documents/useDocumentSwitcher.ts src/screens/traveller/Documents/__tests__/useDocumentSwitcher.router.test.ts
git commit -m "feat(documents): add useDocumentSwitcher with the set-active token refresh"
```

---

## Task 9: Switcher sheet, TabPage slot and the Home pill

**Files:**
- Create: `src/screens/traveller/Documents/_components/DocumentSwitcherSheet.tsx`
- Create: `src/screens/traveller/Home/_components/ActiveDocumentPill.tsx`
- Modify: `src/templates/TabPage.tsx` (add the optional prop; the header row is lines 28-42)
- Modify: `src/screens/traveller/Home/HomeScreen.tsx` (the `TabPage` call at line 48)
- Test: `src/screens/traveller/Home/__tests__/ActiveDocumentPill.router.test.tsx`

**Interfaces:**
- Consumes: `useDocumentSwitcher` (Task 8), `BottomSheet` from `@/components/BottomSheet`.
- Produces: `ActiveDocumentPill` (no props), rendered by `HomeScreen`; `TabPage`'s new optional `headerAccessory?: React.ReactNode`.

- [ ] **Step 1: Write the failing test**

Create `src/screens/traveller/Home/__tests__/ActiveDocumentPill.router.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { ActiveDocumentPill } from "../_components/ActiveDocumentPill";

const switcher = {
  documents: [] as { travellerDocumentId: string; identificationNumber: string }[],
  activeDocumentId: "",
  selectedId: "",
  select: jest.fn(),
  switchTo: jest.fn(),
  isSwitching: false,
};

jest.mock("@/screens/traveller/Documents/useDocumentSwitcher", () => ({
  useDocumentSwitcher: () => switcher,
}));

// The sheet renders a portal that needs a provider; the pill's own behaviour is
// what is under test, so stand the sheet in for one.
jest.mock(
  "@/screens/traveller/Documents/_components/DocumentSwitcherSheet",
  () => ({
    DocumentSwitcherSheet: () => null,
  }),
);

const passport = {
  travellerDocumentId: "doc-1",
  identificationNumber: "P1234567",
};
const idCard = {
  travellerDocumentId: "doc-2",
  identificationNumber: "12345678901",
};

beforeEach(() => {
  jest.clearAllMocks();
  switcher.documents = [];
  switcher.activeDocumentId = "";
});

it("renders nothing without an active document", () => {
  render(<ActiveDocumentPill />);

  expect(screen.queryByTestId("active-document-pill")).toBeNull();
  expect(screen.queryByTestId("active-document-label")).toBeNull();
});

// One document means nothing to switch between; a pressable pill would promise
// a choice that does not exist.
it("renders a plain label for a single document", () => {
  switcher.documents = [passport];
  switcher.activeDocumentId = "doc-1";

  render(<ActiveDocumentPill />);

  expect(screen.getByTestId("active-document-label")).toBeTruthy();
  expect(screen.queryByTestId("active-document-pill")).toBeNull();
  expect(screen.getByText("P1234567")).toBeTruthy();
});

it("renders a pressable pill for two or more documents", () => {
  switcher.documents = [passport, idCard];
  switcher.activeDocumentId = "doc-1";

  render(<ActiveDocumentPill />);

  expect(screen.getByTestId("active-document-pill")).toBeTruthy();
  expect(screen.getByText("P1234567")).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/screens/traveller/Home/__tests__/ActiveDocumentPill.router.test.tsx`
Expected: FAIL — cannot resolve `../_components/ActiveDocumentPill`.

- [ ] **Step 3: Write the switcher sheet**

Create `src/screens/traveller/Documents/_components/DocumentSwitcherSheet.tsx`:

```tsx
import { BottomSheet } from "@/components/BottomSheet";
import Button from "@/components/Button";
import { Ionicons } from "@/components/Ionicons";
import { useLocalization } from "@/providers/LocalizationProvider";
import { cn } from "@/utils/cn";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import { Pressable, Text, View } from "react-native";
import type { TravellerDocument } from "../useTravellerDocuments";

/**
 * Select-then-confirm, mirroring the web navbar switcher: tapping a row only
 * selects it, and a separate confirm row performs the switch. Switching on the
 * first tap would make a mis-tap change which document every subsequent tag and
 * refund is issued against.
 */
export function DocumentSwitcherSheet({
  sheetRef,
  documents,
  activeDocumentId,
  selectedId,
  isSwitching,
  onSelect,
  onConfirm,
}: {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  documents: TravellerDocument[];
  activeDocumentId: string;
  selectedId: string;
  isSwitching: boolean;
  onSelect: (travellerDocumentId: string) => void;
  onConfirm: (travellerDocumentId: string) => Promise<boolean>;
}) {
  const { t } = useLocalization();

  const selected = documents.find(
    (d) => d.travellerDocumentId === selectedId,
  );

  async function handleConfirm() {
    if (!selectedId || selectedId === activeDocumentId) return;
    const switched = await onConfirm(selectedId);
    // Dismiss only on a clean switch. A failure keeps the sheet open so the
    // traveller can retry without reopening it.
    if (switched) sheetRef.current?.dismiss();
  }

  return (
    <BottomSheet ref={sheetRef}>
      <BottomSheetView className="gap-3 p-4">
        <Text className="text-xl font-bold">
          {t("MobileApp.Documents.Switch.Title")}
        </Text>

        {documents.map((document) => {
          // Optional on the DTO. An `?? ""` fallback would make a row without an
          // id compare equal to an empty claim and selectable as `""`, which
          // set-active would reject — so such a row is inert.
          const id = document.travellerDocumentId;
          const isSelected = !!id && id === selectedId;
          const isActive = !!id && id === activeDocumentId;
          return (
            <Pressable
              key={id ?? document.affiliationId}
              onPress={() => id && onSelect(id)}
              disabled={isSwitching || !id}
              className={cn(
                "flex-row items-center gap-3 rounded-2xl border p-3",
                isSelected ? "border-primary bg-gray-50" : "border-gray-200",
                (isSwitching || !id) && "opacity-50",
              )}
            >
              <View className="flex-1">
                <Text
                  className="text-sm font-semibold text-gray-900"
                  numberOfLines={1}
                >
                  {document.identificationNumber ?? ""}
                </Text>
                <Text className="text-xs text-gray-600" numberOfLines={1}>
                  {document.identificationType
                    ? t(`MobileApp.Documents.Type.${document.identificationType}`)
                    : ""}
                </Text>
              </View>
              {isActive && (
                <Ionicons name="checkmark" size={18} color="#16A34A" />
              )}
            </Pressable>
          );
        })}

        <Button
          action={{
            onPress: handleConfirm,
            label: isSwitching
              ? t("MobileApp.Documents.Switch.Switching")
              : t("MobileApp.Documents.Switch.SwitchTo", {
                  number: selected?.identificationNumber ?? "",
                }),
          }}
          iconName="repeat-outline"
          isLoading={isSwitching}
          disabled={!selectedId || selectedId === activeDocumentId}
        />
      </BottomSheetView>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Write the pill**

Create `src/screens/traveller/Home/_components/ActiveDocumentPill.tsx`:

```tsx
import { Ionicons } from "@/components/Ionicons";
import { DocumentSwitcherSheet } from "@/screens/traveller/Documents/_components/DocumentSwitcherSheet";
import { useDocumentSwitcher } from "@/screens/traveller/Documents/useDocumentSwitcher";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useRef } from "react";
import { Pressable, Text, View } from "react-native";

/**
 * The Home header's document indicator, and the only entry point to switching.
 *
 * Three states, matching the web navbar switcher: nothing at all without an
 * active document (no claim, or a staff login), a plain label when there is
 * only one document and so nothing to switch between, and a pressable pill
 * otherwise.
 */
export function ActiveDocumentPill() {
  const sheetRef = useRef<BottomSheetModal>(null);
  const {
    documents,
    activeDocumentId,
    selectedId,
    select,
    switchTo,
    isSwitching,
  } = useDocumentSwitcher();

  if (!activeDocumentId || documents.length === 0) return null;

  const active = documents.find(
    (d) => d.travellerDocumentId === activeDocumentId,
  );
  const label = active?.identificationNumber ?? "";

  if (documents.length === 1) {
    return (
      <View
        testID="active-document-label"
        className="max-w-[45%] flex-row items-center gap-1"
      >
        <Ionicons name="document-text-outline" size={14} color="#6B7280" />
        <Text className="text-xs text-gray-600" numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        testID="active-document-pill"
        onPress={() => sheetRef.current?.present()}
        hitSlop={6}
        className="max-w-[45%] flex-row items-center gap-1 rounded-full border border-gray-300 px-2 py-1"
      >
        <Ionicons name="document-text-outline" size={14} color="#374151" />
        <Text className="text-xs font-semibold text-gray-800" numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={14} color="#374151" />
      </Pressable>
      <DocumentSwitcherSheet
        sheetRef={sheetRef}
        documents={documents}
        activeDocumentId={activeDocumentId}
        selectedId={selectedId}
        isSwitching={isSwitching}
        onSelect={select}
        onConfirm={switchTo}
      />
    </>
  );
}
```

- [ ] **Step 5: Add the `headerAccessory` slot to `TabPage`**

In `src/templates/TabPage.tsx`, add to `TabPageProps`:

```tsx
  /**
   * Optional node rendered in the header row, between the title and the
   * notification bell. Optional so every existing caller renders unchanged.
   */
  headerAccessory?: React.ReactNode;
```

Destructure it, and render it inside the existing header `View` between the title `Text` and the notification `Pressable`:

```tsx
        <View className="flex-row items-center justify-between mb-4">
          <Text className="font-bold text-3xl">{title}</Text>
          {headerAccessory}
          <Pressable className="relative" onPress={openNotifications}>
```

The accessory caps its own width (`max-w-[45%]`) and truncates, so a long document number cannot squeeze the title.

- [ ] **Step 6: Wire it into traveller Home**

In `src/screens/traveller/Home/HomeScreen.tsx`, import the pill and pass it:

```tsx
import { ActiveDocumentPill } from "./_components/ActiveDocumentPill";
```

```tsx
    <TabPage
      title={t("MobileApp.Home.Title")}
      headerAccessory={<ActiveDocumentPill />}
    >
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx jest src/screens/traveller/Home/__tests__/ActiveDocumentPill.router.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 8: Verify typecheck and lint**

Run: `npm run typecheck`
Expected: no output.

Run: `npm run lint`
Expected: no new errors versus baseline.

- [ ] **Step 9: Commit**

```bash
git add src/screens/traveller/Documents/_components/DocumentSwitcherSheet.tsx src/screens/traveller/Home/_components/ActiveDocumentPill.tsx src/screens/traveller/Home/__tests__/ActiveDocumentPill.router.test.tsx src/templates/TabPage.tsx src/screens/traveller/Home/HomeScreen.tsx
git commit -m "feat(documents): add the Home document switcher pill and sheet"
```

---

## Task 10: Full verification

**Files:** none — this task changes nothing. If a check fails, fix it and re-run everything from Step 1.

- [ ] **Step 1: Format**

Run: `npm run format`
Then: `git diff --stat` — if Prettier touched files, commit with `style: prettier`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors above the baseline recorded at the start.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no output.

- [ ] **Step 4: Full suite**

Run: `npm test`
Expected: **Test Suites: 7 failed, 33 passed, 40 total** — the same 7 pre-existing load failures named in the Global Constraints, plus **seven** new suites passing:

```
src/actions/TravellerService/__tests__/post.test.ts                        (Task 3)
src/hooks/__tests__/useDiditVerify.router.test.ts                          (Task 4)
src/screens/traveller/Documents/__tests__/useTravellerDocuments.router.test.ts  (Task 5)
src/screens/traveller/Documents/__tests__/DocumentCard.router.test.tsx     (Task 6)
src/screens/traveller/Documents/__tests__/openDocuments.router.test.tsx    (Task 7)
src/screens/traveller/Documents/__tests__/useDocumentSwitcher.router.test.ts    (Task 8)
src/screens/traveller/Home/__tests__/ActiveDocumentPill.router.test.tsx    (Task 9)
```

Task 2 extended an existing suite rather than adding one.

Tests: 346 baseline + 6 (Task 2) + 4 (Task 3) + 7 (Task 4) + 10 (Task 5) + 7 (Task 6) + 2 (Task 7) + 6 (Task 8) + 3 (Task 9) = **391 passed**.

Report the actual numbers. If a *new* suite appears in the failed list, that is a real regression — fix it. Do not report success without pasting these counts.

- [ ] **Step 5: Build and run on Android**

Run: `npm run android`
Expected: builds and launches with no errors. `AGENTS.md` requires zero build errors before a PR.

- [ ] **Step 6: Build and run on iOS**

Run: `npm run ios`
Expected: builds and launches with no errors.

- [ ] **Step 7: Manual checks, signed in as a traveller**

- [ ] Profile → Documents lists the account's documents; Primary and *in use* badges are on the right rows; back returns to Profile.
- [ ] Add document, using a passport already on the account → *Document verification updated*, the evidence badge reflects the new level, and no duplicate row appears.
- [ ] Add document, using a document not on the account → a new row appears.
- [ ] Cancel the Didit sheet mid-flow → no toast, no change to the list.
- [ ] Set primary on a non-primary document → the badge moves and the previous primary loses it.
- [ ] An account without `TravellerService.SSRActions.ProveDocument` → the Add button is disabled with the not-permitted copy, and tapping it starts no verification.
- [ ] Home header: no pill for a staff login; a plain label for a single-document traveller; a pressable pill for a multi-document traveller.
- [ ] Switch active from the pill → the pill's number updates without restarting the app, and a subsequent tag or refund request acts as the new document.
- [ ] Airplane mode on the Documents page → the load-failed pane appears with a working Retry.
- [ ] Switch the app language to Turkish → every new string renders translated, with no raw `MobileApp.Documents.*` keys on screen.

- [ ] **Step 8: Report**

State the measured suite counts, the typecheck and lint results, and which manual checks were performed on which platform. Name anything not verified rather than implying it passed.
