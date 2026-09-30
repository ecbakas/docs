# web-app permission gates — design

- **Date:** 2026-09-30
- **Repo:** `web-app` (`apps/web` only; `apps/ssr` is out of scope)
- **Branch:** a new branch off `main` in the existing `C:\unirefund\web-app`
  checkout (no worktree) — `feat/permission-gates`
- **Status:** design approved in conversation; this document awaits review

## Goal

No signed-in user of the staff portal should ever be offered a control that
answers 403, or land on a page that fails because of a permission they lack.

1. Every button, row/table action, link and client fetch that calls an endpoint
   renders only when the user holds **all** of the permissions on that
   endpoint's `**Requires permissions:**` docblock (group **and** leaf).
2. Without the update permission, an edit form is served read-only, with no
   submit button.
3. Without the view permission, a page opened by pasted URL renders an in-place
   "no permission" screen listing the permissions **this user** is missing; a
   section of a page simply does not render (and is not fetched).
4. A repo check keeps it that way: a new ungated or under-gated call fails CI.

## Users have different permissions

This is the constraint every part of the design answers to.

- Every check reads the **signed-in user's own grants at request time** —
  `getApplicationConfiguration()` on the server (React-`cache`d per request),
  `useApplicationConfiguration().policies` on the client. Nothing is keyed on a
  role name, so custom roles and mixed sets (siggi.super) get exactly what their
  grants allow, and an affiliation switch is picked up on the next request.
- Partial sets degrade one piece at a time. For one entity:

  | User holds            | Detail page            | Edit form            | Delete action | Grid "New" |
  | --------------------- | ---------------------- | -------------------- | ------------- | ---------- |
  | View only             | renders                | read-only, no submit | hidden        | hidden     |
  | View + Edit           | renders                | editable             | hidden        | hidden     |
  | View + Delete         | renders                | read-only            | shown         | hidden     |
  | Create only (no View) | "no permission" screen | —                    | —             | —          |
  | Nothing               | "no permission" screen | —                    | —             | —          |

- A page whose content comes from **independently grantable** endpoints (two
  tabs, two sections) is guarded with an **any-of**, so a user holding only one
  side still gets in and sees only that side. Gating such a page on one leaf
  would lock out whoever holds the other.
- The static audit (below) never decides who sees what. It only proves a gate
  exists and names the endpoint's full permission set; who passes it is decided
  at runtime.
- Layout selection by role or party stays as it is — the refund route's
  `@admin` / `@refundPoint` split on `session.user.role`, the customs layout
  from the `CustomsId` claim. Those choose a layout; grants still gate
  everything inside it.

## Current state (measured 2026-09-30)

- `isUnauthorized({ requiredPolicies, lang })` (`packages/utils/policies/utils.ts`,
  submodule) gates `page.tsx` by `permanentRedirect` to `/[lang]/unauthorized`.
  `isActionGranted(required, granted)` hides client controls. Both are AND.
- **~130 of 254 `page.tsx` files never call `isUnauthorized`** — e.g. `devices`,
  most of `file/*`, `finance/payout-batches`, `operations/tags`. A pasted URL
  gets whatever the backend's 403 turns into.
- `/unauthorized` is hardcoded English ("Something went wrong!"), names no
  permission, and is reached by `permanentRedirect` — likely a cacheable 308,
  so a browser may keep bouncing a URL after the grant is added.
- `ErrorComponent` (`packages/ui`) already renders a `missingPolicies` badge
  list; 4 pages pass it, listing what the page *requires* rather than what the
  user *lacks*, and at least one gates on the leaf alone while its badges show
  the pair.
- 6 forms use the right shape (`readonly={!hasEditGrant}` +
  `"ui:submitButtonOptions": { norender: !hasEditGrant }`) but gate on the leaf
  only — e.g. airport details checks `CRMService.Airports.Edit` without
  `CRMService.Airports`. 75 of 122 `SchemaForm` files check no permission.
- A throwaway probe (not committed):
  - 908 SDK methods, 752 with a `Requires permissions` line, 156 without;
  - 676 server actions: 623 call exactly one SDK method, **none call two**, 53
    call none (AWS, Novu, …); every call resolves to a known SDK method;
  - 383 of 469 `apps/web/src` files that import `@repo/actions` call an action
    whose permissions do not appear in that file — 178 involving a write. This
    is an **upper bound**: the probe only looked inside the one file, so gates
    held in a parent count as gaps.
- `public-permissions/all` returns a display name per permission with its
  parent chain ("Role management" › "Edit"), so the forbidden screen can show
  readable names.
- CI (`lint-pull-requests.yml`) runs `pnpm unit-test` — which is only
  `@repo/ayasofyazilim-ui`'s tests — then `pnpm lint`. `apps/web`'s `test:unit`
  is not in CI.

## Design

### 1. Runtime pieces (all in `apps/web`)

Nothing lands in `packages/utils`, so every PR stays inside one repo with no
submodule pointer bump. `isUnauthorized` stays exported there for `ssr`;
nothing in `apps/web` imports it after the sweep.

**`src/utils/policies.ts`** — pure, covered by `test:unit`.

- `missingPolicies(required: Policy[], granted): Policy[]` — what this user
  lacks, in `required` order.
- `grantedAny(alternatives: Policy[][], granted): boolean` — true when any one
  alternative is fully held.
- A `PolicyRequirement` type: `Policy[]` (AND) or `{ anyOf: Policy[][] }`, and
  `missingFor(requirement, granted)` returning the missing set to display — for
  an `anyOf`, the smallest alternative's missing set.

**`guardPage({ requires, lang })`** — `src/components/permission-guard/guard.tsx`,
server only. Reads grants via `getApplicationConfiguration()`, returns `null`
when satisfied, otherwise the `<NoPermission>` element. Usage in `page.tsx` or
a `layout.tsx` whose children all share the requirement:

```tsx
const denied = await guardPage({
  requires: ["CRMService.Airports", "CRMService.Airports.View"],
  lang,
});
if (denied) return denied;
```

A page's `requires` is the union of the pairs of its **required** reads (the
`requiredRequests` of `getApiRequests`). Optional reads are not in it.

**`<NoPermission missing lang>`** — `src/components/permission-guard/no-permission.tsx`.

- In place: the URL is kept; renders as a **single root element** (the
  `SidebarInset` `*:h-0 *:grow` rule).
- Lists only the missing permissions: readable name ("Airports › View") with the
  raw key (`CRMService.Airports.View`) beneath it, so the user can read it and an
  admin can grant exactly that string.
- Readable names come from `public-permissions/all`, fetched server-side with
  the page's locale and cached for an hour; on any failure it falls back to the
  raw key alone.
- Title, body and Go-home link text are new keys in the `Default` resources,
  en + tr. `/unauthorized` is localized with the same keys and stays as the
  fallback for anything outside this sweep.

**Sections, controls, forms** — existing patterns, made complete:

- Optional section without its grant: the fetch is **skipped** (not fetched then
  hidden), and the section renders nothing.
- Row/table actions: `hidden: !isActionGranted(pair, grantedPolicies)`.
- `RowLink` `linkCondition`: the **target page's** view pair, so the link
  becomes plain text exactly when the target would deny.
- Edit forms: `readonly={!canEdit}` plus `norender: !canEdit` on the submit.
- `new/` pages: `guardPage` on the Create pair.
- Route handlers under `app/api/**` that call an action check the same pair and
  answer 403 with a JSON body naming the missing permissions.

### 2. `pnpm policy:audit`

`scripts/policy-audit.mjs` beside `check-grid-keys.mjs`, pure logic in
`scripts/lib/policy-audit-core.mjs`. Exit 1 on any violation. Nothing is
generated or committed, so nothing goes stale after an SDK regen.

**Inputs**

- *Endpoint → permissions* from every `packages/{saas,core-saas}/*/sdk.gen.ts`
  docblock paired with its `public <method>(`. Endpoints with no line require
  only authentication and are skipped. A docblock permission missing from
  `packages/utils/policies/policies.json` is reported — it cannot be written as
  a literal.
- *Action → endpoint* from `packages/actions`: each exported function and the
  SDK method it calls. Actions with none are skipped.
- *App code* parsed with the TypeScript compiler API against `apps/web`'s
  tsconfig, so a gate array held in a named constant counts — including one
  imported from another module (e.g. `TAG_ACTION_RULES` in
  `src/utils/tag-actions.ts`).

**Gate calls:** `guardPage`, `isActionGranted`, `grantedAny`, `missingPolicies`,
`missingFor`, and `isUnauthorized` during the migration. `RowLink`'s
`linkCondition` counts through the `isActionGranted` call inside it.

**Rules**

| #   | Rule | Catches |
| --- | ---- | ------- |
| R1 | Every call to an action whose endpoint requires `P` is **covered**: its own file has a gate naming all of `P`, or *every* file importing it is covered. A `page.tsx` also counts gates in its ancestor `layout.tsx` files. | ungated buttons, row actions, forms and client fetches; leaf-only gates |
| R2 | Every `page.tsx` under `(main)` calls `guardPage`, or is allowlisted with a reason (account pages, home, `/unauthorized`). | pages closed only by hiding the link, which a pasted URL still opens |
| R3 | A sidebar item in `src/components/sidebar-layout/data.ts` whose `href` resolves to a page requires exactly what that page's `guardPage` requires. | menu links into a forbidden screen; links hidden from someone who could open the page |

"Every importer" in R1 means a shared component reached from three routes is
covered only when all three gate it — the correct rule when different users
land on different routes, and it removes the probe's parent-gate false
positives.

**Allowlist:** `scripts/policy-audit.allow.json`, entries
`{ "file", "action" | "page", "reason" }`. An entry matching no violation is
itself an error, so the list cannot rot. Reserved for real exceptions — a
dynamic policy name, a gate the parser cannot follow.

**Output:** grouped by route, plus `--json` (used by the verification harness
below for the page → requirement map).

**Known blind spots**, handled by hand in the sweep:

- A gate with the right strings wrapped around the wrong element — review.
- Permissions the backend checks **without** failing the call.
  `TagService.TagRisks.FilterByRisk` has no `Requires permissions` line; without
  it the API drops the risk filter and returns the unfiltered page. The sweep
  keeps a hand-checked list: risk filters must gate on `TagService.TagRisks` +
  `.FilterByRisk`; two sites still read `TagService.TagRisks.View`, which is
  typed but never granted (`canViewTagRisks` in
  `tax-free-tags/_components/customs/customs-filter.tsx`, and
  `tax-free-tags/[tagId]/page.tsx`); `TagsNameSpace.ViewEarnings` and
  `.ViewTotals` are display-only and stay single-policy.

**Tests** (`node --test scripts/lib`): gated call; leaf-only gate; shared
component gated by only some importers; gate via imported constant; ancestor
layout gate; stale allowlist entry; docblock permission absent from
`policies.json`.

### 3. Sweep and delivery

**Phase 1 — foundation (PR 1).** `policies.ts` + tests, `guardPage`,
`<NoPermission>`, i18n keys, localized `/unauthorized`, the audit + its tests +
empty allowlist, and two reference conversions: airport details (leaf-only →
pair, read-only form) and `devices` (no guard → `guardPage`). The PR records the
baseline audit count.

**Phase 2 — sweep (one PR per area).** Areas own disjoint files so they can run
in parallel:

1. shared `src/components/**` — first, because under R1 their gaps surface in
   every route that uses them;
2. `(unirefund)/parties`;
3. `(unirefund)/operations`;
4. `(unirefund)/finance`;
5. `(unirefund)` settings, file, devices, reports, home, management;
6. `(core)/*`, plus `sidebar-layout/data.ts` (R3) — the only task touching it.

Per page: `isUnauthorized` → `guardPage` with the pair; guard ungated pages;
optional reads → skipped fetch + hidden section; row/table actions; `RowLink`
conditions; read-only forms; Create-guarded `new/`; the blind-spot list above.
Phase 1 lands every i18n key the sweep needs; if a task needs another, it
edits only its own service's resource files and `init` runs once, centrally.

`guardPage` and `isUnauthorized` coexist, so each area merges independently
without breaking `main`.

**Phase 3 — lock in (last PR).** Audit at 0 violations, every allowlist entry
reasoned; add a step to `lint-pull-requests.yml` running
`node --test scripts/lib` and `pnpm policy:audit`.

### 4. Verification

1. **Gates per PR:** `pnpm --filter web type-check`, `pnpm --filter web lint`,
   `pnpm --filter web test:unit`, `node --test scripts/lib`,
   `pnpm policy:audit` (at or below the previous count; 0 at the end).
2. **uat permission names:** the sweep writes hundreds of new literals and dev
   still defines names uat has dropped. Before each PR:
   `GATEWAY_URL=https://uat-api.unirefund.com SUPPORTED_LOCALES=en,tr pnpm --filter web run init`
   then `npx tsc --noEmit -p apps/web`, so every unknown literal shows at once
   instead of one per uat build. Re-run `init` against dev afterwards, and
   leave the regenerated `policies.json` (submodule) and `*.gen.json` unstaged.
3. **Grant matrix** (scratch Playwright harness, not committed):
   - sign in as siggi.merchant, siggi.refund, siggi.customs, siggi.super and
     admin (tenant Faroe Islands) and read each account's granted policies;
   - combine with `policy:audit --json`'s page → requirement map to get the
     **expected** outcome of every page without a path id, per account;
   - visit each and assert the "no permission" screen appears exactly where
     expected and no page shows a backend-403 error.
4. **Spot checks** against the partial-grant table, screenshots per account:
   one entity detail page per area (read-only vs editable, delete, create), and
   a pasted URL to a denied page showing only that user's missing permissions
   with readable names.

**Unverified by design:** detail pages needing a record id are checked only
where the test tenant has data; a page with neither data nor a test account that
reaches it is covered by the audit alone and will be listed, not claimed.

## Working in the shared checkout

- Branch off `main` in `C:\unirefund\web-app` as the first plan step, after
  `git status` and `git reflog --date=iso | head` show no foreign activity.
- Re-read `git branch --show-current` before every commit; stage explicit paths
  only — never `git add -A`, never stage `packages/ayasofyazilim-ui` or
  `packages/utils`; no `git reset --hard`, no `git stash`.
- Never `next build` while a `next dev` server is up. Builds are the user's to
  run; the plan runs type-check, lint and tests only.

## Out of scope

- `apps/ssr` — only 2 files use these helpers (`tags/_components/tag-claim.tsx`,
  `upload-verification-dialog.tsx`); the audit can be pointed at it later.
- Changing `isUnauthorized`, `isActionGranted` or their `@ts-nocheck` inside the
  `packages/utils` submodule.
- Adding `apps/web`'s `test:unit` to CI (worth doing; separate change).
- Backend changes, including permissions the backend enforces imperatively
  rather than by attribute — invisible to the docblocks, so to this design.
