# Analytics "Who can see it" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One "Who can see it" dialog, opened as a row action in the four analytics grids, that edits an item's role/user allow-list.

**Architecture:** A pure `affiliations.ts` module owns diffing and the "leave unseen fields alone" rule. A presentational `AffiliationsForm` (SchemaForm) renders it. Thin per-kind wrappers in the existing `dashboard-dialogs.tsx` / `data-source-dialogs.tsx` call the actions and carry the permission gates. Pages fetch the role and user lists as optional reads.

**Tech Stack:** Next.js 16 `apps/web`, `@repo/ayasofyazilim-ui` (`MasterDataGrid`, `SchemaForm`, `CustomSelectableWidget`), `@repo/actions`, Node `node:test` via `pnpm --filter web test:unit`.

**Spec:** `c:\unirefund\docs\superpowers\specs\2026-11-18-analytics-affiliations-design.md`

## Global Constraints

- All paths are relative to the web-app worktree root. `A` = `apps/web/src/app/[lang]/(main)/(unirefund)/settings/analytics`.
- Follow `web-app/AGENTS.md` and `.claude/rules/*`: actions only through `@repo/actions`, no hardcoded UI strings, `data-testid` on every `Button`/`Switch`/…, no `useEffect`.
- Every gate is the endpoint's full pair: group + leaf (`AnalyticService.EmbeddedDashboards`, `AnalyticService.EmbeddedDashboards.<Leaf>`; same under `AnalyticService.AnalyticsDataSources`).
- Empty-list copy is fixed by the spec. Override: "To hide it from everyone, switch it off instead." Host default and own rows: "Only admins will see it."
- Host dialogs are roles-only; host `userIds` are never added or removed.
- A field whose picker list could not be loaded is not rendered and reaches the backend unchanged.
- `IdentityRoleDto` / `IdentityUserDto` below are `Volo_Abp_Identity_IdentityRoleDto` / `Volo_Abp_Identity_IdentityUserDto` from `@repo/core-saas/IdentityService`.
- Write few comments; explain only a non-obvious why.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A selected role or user missing from the picker list** — a platform role the tenant lacks, a deleted user, or user #1001. `CustomSelectableWidget` filters selections to known options, so saving would silently remove it. Expected: it stays selected (labelled by its raw key) and survives the save. → `withMissingOptions` test, Task 1.
2. **Caller without `AbpIdentity.Users` or `AbpIdentity.Roles`.** Expected: that picker is hidden and its current values are sent back unchanged. → `mergeEditable` tests, Task 1.
3. **An override saved with both lists empty.** Expected: refused with the "switch it off instead" message, and no request is sent. → `emptyVerdict` test, Task 1.
4. **Saving an own or host row with nothing changed.** Expected: no request; the dialog just closes. → `diffAffiliations` returns `null`, Task 1.
5. **The host GET fails** (403 or network). Expected: the dialog shows the load error, not an empty form that would invite overwriting. Manual check in Task 6, since component code has no unit runner.

---

### Task 1: Worktree and the pure affiliations module

**Files:**
- Create: `A/_components/affiliations.ts`
- Test: `A/_components/affiliations.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Affiliations = { roleNames: string[]; userIds: string[] };
  export type AffiliationsDiff = { roleNamesToAdd: string[]; roleNamesToRemove: string[]; userIdsToAdd: string[]; userIdsToRemove: string[] };
  export type EditableFields = { roles: boolean; users: boolean };
  export type EmptyRule = "block" | "warn";
  export function toAffiliations(dto?: { roleNames?: string[] | null; userIds?: string[] | null } | null): Affiliations; // nulls → [], de-duplicated
  export function mergeEditable(current: Affiliations, edited: Partial<Affiliations>, editable: EditableFields): Affiliations; // non-editable field → current; editable but undefined → current
  export function diffAffiliations(current: Affiliations, next: Affiliations): AffiliationsDiff | null; // null when nothing changed
  export function emptyVerdict(next: Affiliations, rule: EmptyRule): "ok" | "warn" | "block";
  export function withMissingOptions<T>(options: T[], keys: string[], getKey: (o: T) => string, make: (key: string) => T): T[];
  ```

- [ ] **Step 1: Create the worktree.** Use superpowers:using-git-worktrees. Branch `feat/analytics-affiliations` from `origin/main` (`git switch --no-track -c`), worktree at `C:\unirefund\web-app-wt-analytics-affiliations`. Never touch `web-app-wt-verification` or `web-app-wt-manual-verification`. Follow memory `web-app-verification-constraints` item 5:
  - clone `packages/ayasofyazilim-ui` and `packages/utils` locally from `C:\unirefund\web-app` at the pinned SHAs;
  - copy `apps/web/.env`;
  - run `pnpm install`, then `cd apps/web && pnpm run init`.

  `init` also refreshes the gitignored `policies.json`, which is the whole fix for the audit's "missing permissions" row.
- [ ] **Step 2: Measure baselines.** Run `pnpm --filter web test:unit` (expect 0 failures; record the count). Run the dev server once so `next-env.d.ts` exists, then `pnpm --filter web type-check` (expect the 2 TS2307 `capture-core/detectors/mrz` errors). Record both numbers.
- [ ] **Step 3: Write the failing tests** in `affiliations.test.ts`, in the `data-source.test.ts` style (`node:test` `describe`/`it`, `node:assert/strict`):
  - `toAffiliations(null)` → `{ roleNames: [], userIds: [] }`; `toAffiliations({ roleNames: ["a", "a"], userIds: null })` → `{ roleNames: ["a"], userIds: [] }`.
  - `mergeEditable({roleNames:["r"],userIds:["u"]}, {roleNames:[],userIds:[]}, {roles:true,users:false})` → `{ roleNames: [], userIds: ["u"] }`.
  - `mergeEditable(cur, {}, {roles:true,users:true})` → `cur` (undefined edited fields keep the current values).
  - `diffAffiliations({roleNames:["A","B"],userIds:["u1"]}, {roleNames:["B","C"],userIds:[]})` → `{ roleNamesToAdd: ["C"], roleNamesToRemove: ["A"], userIdsToAdd: [], userIdsToRemove: ["u1"] }`.
  - `diffAffiliations(x, {roleNames:[...x.roleNames].reverse(), userIds:x.userIds})` → `null` (order-insensitive).
  - `emptyVerdict({roleNames:[],userIds:[]}, "block")` → `"block"`; same with `"warn"` → `"warn"`; any non-empty → `"ok"`.
  - `withMissingOptions([{name:"A"}], ["A","Ghost"], o=>o.name, k=>({name:k}))` → `[{name:"A"},{name:"Ghost"}]`; with keys `["A"]` → the input unchanged, with no duplicates.
- [ ] **Step 4: Run** `pnpm --filter web test:unit`. Expected: FAIL, because `./affiliations` cannot be resolved. Don't pass the `[lang]` path directly; the glob treats it as a character class.
- [ ] **Step 5: Implement `affiliations.ts`** (plain `.ts`, no React).
- [ ] **Step 6: Run** `pnpm --filter web test:unit`. Expected: baseline count plus the new tests, 0 failures.
- [ ] **Step 7: Commit:** `git add` the two files; message `feat(web): add the analytics affiliation diff helpers`.

### Task 2: Affiliation actions

**Files:**
- Modify: `packages/actions/unirefund/AnalyticService/put-actions.ts`
- Modify: `packages/actions/unirefund/AnalyticService/post-actions.ts:30-44,97-111`

**Interfaces:**
- Produces:
  ```ts
  putEmbeddedDashboardTenantGridAffiliationsApi(data: PutApiAnalyticServiceEmbeddedDashboardsTenantGridByIdAffiliationsData, session?: Session | null)
  putAnalyticDataSourceTenantGridAffiliationsApi(data: PutApiAnalyticServiceAnalyticsDataSourcesTenantGridByIdAffiliationsData, session?: Session | null)
  postEmbeddedDashboardAffiliationsByIdApi(data: PostApiAnalyticServiceEmbeddedDashboardsAffiliationsData, session?: Session | null) // was (id: string); it sent no body
  postAnalyticDataSourceAffiliationsByIdApi(data: PostApiAnalyticServiceAnalyticsDataSourcesByIdAffiliationsData, session?: Session | null) // unchanged signature
  ```
  All four return `structuredResponse` on success and `return structuredError` on failure.
- Consumes: the existing GETs `getEmbeddedDashboardAffiliationsByIdApi(id)` and `getAnalyticDataSourceAffiliationsByIdApi(id)` in `actions.ts`, unchanged.

- [ ] **Step 1: Add the two PUT actions** beside the `...TenantGridEnabledApi` pair. Use the `embeddedDashboardTenantGrid` / `analyticsDataSourceTenantGrid` client members.
- [ ] **Step 2: Fix the POST actions.** Make `postEmbeddedDashboardAffiliationsByIdApi` take the full data object and forward it. Switch both affiliation POSTs from `structuredSuccessResponse` to `structuredResponse` (`.claude/rules/api-actions.md`). Confirm nothing else calls the old signature: `grep -rn postEmbeddedDashboardAffiliationsByIdApi apps packages` shows only its definition.
- [ ] **Step 3: Run** `pnpm --filter web type-check`. Expected: the baseline error count from Task 1, Step 2.
- [ ] **Step 4: Commit:** `feat(actions): analytics tenant-grid affiliation PUTs; send the dashboard manage body`.

### Task 3: The shared form and its strings

**Files:**
- Create: `A/_components/affiliations-form.tsx`
- Modify: `apps/web/src/language-data/unirefund/AnalyticService/resources/en.json`, `.../tr.json`

**Interfaces:**
- Consumes: Task 1's exports.
- Produces:
  ```ts
  export function AffiliationsForm(props: {
    formId: string;                                  // also the data-testid prefix
    value: Affiliations;
    roles: Volo_Abp_Identity_IdentityRoleDto[] | null; // null → roleNames not rendered
    users: Volo_Abp_Identity_IdentityUserDto[] | null; // null → userIds not rendered
    emptyRule: EmptyRule;
    defaultRoleNames?: string[];                     // given only for an override
    disabled: boolean;
    onSubmit: (next: Affiliations) => void;          // already merged via mergeEditable; never called on "block"
  }): JSX.Element
  ```

- [ ] **Step 1: Add the keys** to `en.json` / `tr.json`:

  | Key | en | tr |
  |---|---|---|
  | `Affiliations.Action` | Who can see it | Kimler görebilir |
  | `Affiliations.Empty.Blocked` | Choose at least one role or user. To hide it from everyone, switch it off instead. | En az bir rol veya kullanıcı seçin. Herkesten gizlemek için kapatın. |
  | `Affiliations.Empty.Warning` | Only admins will see it. | Yalnızca yöneticiler görebilir. |
  | `Affiliations.HostDefault` | Platform default | Platform varsayılanı |
  | `Affiliations.HostDefault.None` | Admins only | Yalnızca yöneticiler |
  | `Affiliations.LoadError` | Couldn't load who can see it. | Kimlerin görebileceği yüklenemedi. |
  | `Form.Affiliations.roleNames` | Roles | Roller |
  | `Form.Affiliations.userIds` | Users | Kullanıcılar |

  Then run `cd apps/web && pnpm run init`.
- [ ] **Step 2: Implement `AffiliationsForm`.**
  - Render `SchemaForm<Affiliations>` over `$UniRefund_AnalyticService_AnalyticsCatalog_SetCatalogItemAffiliationsDto`, with `createUiSchemaWithResource({ resources: t.AnalyticService, name: "Form.Affiliations", extend })`.
  - Pickers:
    - `roleNames` uses `"ui:widget": "Role"`, built with `CustomSelectableWidget<IdentityRoleDto>` (`getKey`/`getLabel` = `name`).
    - `userIds` uses `"ui:widget": "User"` (`getKey` = `id`, `getLabel` = `userName`).
    - Pass both option lists through `withMissingOptions`, so values outside the list stay selected.
  - Exclude an unrendered field with `filter={{ type: "exclude", keys }}` and mark it `"ui:widget": "hidden"` (the AGENTS.md `i18n:missing` note).
  - Seed `formData` from `value`. Track the live data in `useState` via `onChange`; show `Affiliations.Empty.Warning` when `emptyVerdict` is `"warn"` and `Affiliations.Empty.Blocked` when it is `"block"`. On submit, merge with `mergeEditable`, refuse on `"block"`, else call `onSubmit`.
  - When `defaultRoleNames` is given, show `Affiliations.HostDefault`: the names joined with ", ", or `Affiliations.HostDefault.None` when empty.
  - Submit text is `t.Default["Edit.Save"]`.
- [ ] **Step 3: Run** `pnpm --filter web type-check` (baseline) and `pnpm --filter web lint` (0 errors).
- [ ] **Step 4: Commit:** `feat(web): shared analytics "Who can see it" form`.

### Task 4: Tenant grids — override and own rows

**Files:**
- Modify: `A/_components/dashboard-dialogs.tsx`, `A/_components/data-source-dialogs.tsx`
- Modify: `A/dashboard-availability/_components/table.tsx`, `A/dashboard-availability/page.tsx`
- Modify: `A/data-source-availability/_components/table.tsx`, `A/data-source-availability/page.tsx`

**Interfaces:**
- Consumes: `AffiliationsForm` (Task 3); `toAffiliations`, `diffAffiliations` (Task 1); the PUT and POST actions (Task 2).
- Produces:
  ```ts
  DashboardTenantAffiliationsForm(props: DialogControls & { row: UniRefund_AnalyticService_EmbeddedDashboards_EmbeddedDashboardGridItemDto; roles: IdentityRoleDto[] | null; users: IdentityUserDto[] | null })
  DataSourceTenantAffiliationsForm(props: DialogControls & { row: UniRefund_AnalyticService_AnalyticsDataSources_AnalyticsDataSourceGridItemDto; roles: IdentityRoleDto[] | null; users: IdentityUserDto[] | null })
  ```
  Each table also gains the props `roles: IdentityRoleDto[] | null; users: IdentityUserDto[] | null`.

- [ ] **Step 1: Write the wrappers.** `value = toAffiliations(row.effectiveAffiliations)`.
  - **`row.isHostManaged` (override):**
    - gate `[group, "<group>.SetAffiliations"]` inline with `isActionGranted` and return early without it;
    - `emptyRule="block"`, `defaultRoleNames = toAffiliations(row.defaultAffiliations).roleNames`;
    - submit `put…TenantGridAffiliationsApi({ id: row.id, requestBody: next })`, then `handlePutResponse`.
  - **Own row:**
    - gate `[group, "<group>.ManageAffiliations"]`;
    - `emptyRule="warn"`;
    - `diffAffiliations(value, next)`: `null` → `close()` with no request; else `post…AffiliationsByIdApi({ id: row.id, requestBody: diff })`, then `handlePostResponse`.
  - Both: `setPreventClose(true)` while saving, `close()` in `.finally()`, as in the existing dialogs.

  The inline gates also keep `pnpm policy:audit` R1 satisfied: the two importing tables gate different leaves.
- [ ] **Step 2: Add the row action to both tenant tables.**
  - Settings: `id: "analytics-dashboard-affiliations"` / `"analytics-data-source-affiliations"`, `type: "dialog"`, label/title `t.AnalyticService["Affiliations.Action"]`, icon `LucideUsers`.
  - Hide it when `roles === null && users === null`, or the row's grant is missing (`isHostManaged ? canSetAffiliations : canManageAffiliations`).
- [ ] **Step 3: Fetch the lists in both pages.** Add optional requests, `agent-cash-report/page.tsx` pattern:
  - `const { policies } = await getApplicationConfiguration()`;
  - `Promise.allSettled([isRequirementMet(["AbpIdentity.Roles"], policies) ? getAllRolesApi(session) : Promise.reject(new Error("not granted")), isRequirementMet(["AbpIdentity.Users"], policies) ? getUsersApi({ maxResultCount: 1000, sorting: "userName" }) : Promise.reject(new Error("not granted"))])`.

  Resolve:
  - `roles = fulfilled ? value.data.items ?? [] : null`;
  - `users = fulfilled && value.type === "success" ? value.data.items ?? [] : null`.

  If `pnpm policy:audit` prints a different `needs [...]` for either action, use its set.
- [ ] **Step 4: Run the gates.** `type-check` (baseline), `lint` (0 errors), `pnpm policy:audit` (pass), `pnpm i18n:missing --app=web` (NEEDS_KEY 0), `pnpm form:order` (pass).
- [ ] **Step 5: Commit:** `feat(web): tenants choose who sees analytics items`.

### Task 5: Host catalog grids

**Files:**
- Modify: `A/_components/dashboard-dialogs.tsx`, `A/_components/data-source-dialogs.tsx`
- Modify: `A/dashboards/_components/table.tsx`, `A/dashboards/page.tsx`, `A/data-sources/_components/table.tsx`, `A/data-sources/page.tsx`

**Interfaces:**
- Consumes: `AffiliationsForm`, `toAffiliations`, `diffAffiliations`; `get…AffiliationsByIdApi(id)` (existing); the POST actions (Task 2).
- Produces:
  ```ts
  DashboardHostAffiliationsForm(props: DialogControls & { dashboardId: string; roles: IdentityRoleDto[] | null })
  DataSourceHostAffiliationsForm(props: DialogControls & { dataSourceId: string; roles: IdentityRoleDto[] | null })
  ```
  The host tables gain `roles: IdentityRoleDto[] | null`.

- [ ] **Step 1: Write the host wrappers.**
  - **Gates:** inline on both `[group, "<group>.ViewAffiliations"]` and `[group, "<group>.ManageAffiliations"]`.
  - **Loading the current list without `useEffect`:** create the promise once with `useState(() => get…AffiliationsByIdApi(id).then((r) => ({ ok: true as const, value: toAffiliations(r.data) }), () => ({ ok: false as const })))`. Read it with React `use()` in a child inside `<Suspense fallback={<Skeleton className="h-24 w-full" />}>`. When `ok: false`, render `Affiliations.LoadError` and no form.
  - **Form:** `users={null}` (roles only, so host user ids are never diffed), `emptyRule="warn"`.
  - **Save:** diff + POST as in Task 4.
- [ ] **Step 2: Add the row action to both host tables.** Same ids, label and icon as Task 4. Hide when `roles === null` or either grant is missing.
- [ ] **Step 3: Fetch roles in both host pages** (no user list), using Task 4's pattern.
- [ ] **Step 4: Run** the Task 4 gate list again; same expectations.
- [ ] **Step 5: Commit:** `feat(web): host sets the default audience of analytics items`.

### Task 6: Ledger, full gates, dev QA

**Files:**
- Modify: `docs/wiki-implementation-status.md`

- [ ] **Step 1: Bump the ledger.**
  - Header: **Wiki reviewed up to** → `Daily-Report-2026-11-17`; commit `b599622`; audit date 2026-11-18; 219 reports.
  - Add `## What the 2026-11-18 pass did`, covering:
    - 22 reports, 4 with frontend items;
    - clients level with dev-api on all services except UNI-1889 (CRM, Traveller, Refund; held in `feat/uni-1889-email-verification` until UNI-1920);
    - `policies.json` is gitignored and generated by `init`, so not a gap;
    - analytics affiliations built in this branch;
    - the Administration `vatStatementInvoiceNumberPrefix` drift sits in core-saas (core-project's).
  - In "Open", rewrite the Wallet row's blocker: its swagger now publishes and the client is level. Whether the staff passes are wired was not checked; say so.
  - Add a change-log line.
- [ ] **Step 2: Run the full gates at the final commit.**
  - `pnpm --filter web test:unit`: 0 failures;
  - `pnpm --filter web exec tsc --noEmit`: baseline;
  - `lint`: 0 errors;
  - `pnpm policy:audit`, `pnpm i18n:missing --app=web`, `pnpm form:order`, `pnpm grid:keys`: all pass.
- [ ] **Step 3: QA on dev, tenant side.** Run the worktree's dev server on a free port. Never run `next build` while it is up. Sign in as `admin` / `1q2w3E*`, tenant **Faroe Islands**, then open `settings/analytics/dashboard-availability`:
  - **Own row:** create a throwaway dashboard. Add one role, save, reopen: the role shows. Remove it, save: the "Only admins will see it" warning showed before saving.
  - **Host row:** open "Who can see it". The platform default caption shows. Clear both lists: saving is refused with the block message. Pick one role and save: the badge reads "Customized" and reopening shows that role. Then **Reset to default** at once, because this host dashboard is shared on dev.
  - Repeat the own-row check on `data-source-availability`.
  - Delete the throwaway dashboard.
  - Capture screenshots after a settle, per AGENTS.md.
- [ ] **Step 4: QA the host side.** Ask the user for a host admin login. With it, open `settings/analytics/dashboards`: add and remove a role on a throwaway item, and confirm a failed load shows `Affiliations.LoadError`. Without it, record the host pages as unverified.
- [ ] **Step 5: Commit the ledger:** `docs: record the 2026-11-18 wiki pass`. Then use superpowers:finishing-a-development-branch. The PR body says which QA parts were unverified.
