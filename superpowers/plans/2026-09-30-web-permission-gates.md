# web-app permission gates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No signed-in `apps/web` user is ever offered a control that answers 403 or lands on a page that fails for a permission they lack; a pasted URL to a denied page shows an in-place "no permission" screen naming exactly what that user is missing; and a repo check keeps it that way.

**Architecture:** Pure requirement helpers (`src/utils/policies.ts`) decide allow / deny / error from the signed-in user's own grants. A server `guardPage` renders `<NoPermission>` in place of a page; client controls keep using `isActionGranted`, now always with the endpoint's full group + leaf pair. A static audit (`scripts/policy-audit.mjs`) maps every server action to its SDK docblock's `**Requires permissions:**` set and fails when a call is not gated on all of it; the sweep drives that audit to zero, area by area, and CI keeps it there.

**Tech Stack:** Next.js 16 App Router (`apps/web`), TypeScript 6.0.2 compiler API (audit), Node's built-in test runner (`test:unit` via `tsx`; `node --test` for the audit), Playwright (verification harness, not committed).

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-09-30-web-permission-gates-design.md` — read it before any task.

## Global Constraints

- Repo `C:\unirefund\web-app`, branch `feat/permission-gates` cut from `origin/main` in that checkout (no worktree). Every task's work lands on that branch.
- Scope is `apps/web`, root `scripts/`, root `package.json` and `.github/workflows/lint-pull-requests.yml`. Never edit `packages/utils` or `packages/ayasofyazilim-ui` (git submodules), `packages/saas` / `packages/core-saas` (generated), or `packages/actions` (the audit reads it).
- Every endpoint gate names the **full** docblock set — group **and** leaf, exactly as the audit prints it under `needs [...]`. Never gate on the leaf alone.
- Every `page.tsx` guards itself; a layout's guard never stands in for a page's (Next's partial rendering skips layouts on sibling navigation). A `layout.tsx` guards only the fetches it makes itself.
- A read only an optional section needs is **skipped** when not granted, never fetched-then-hidden.
- Code that renders on every page (`(main)/layout.tsx`, providers, the sidebar) must never call `guardPage`; it skips its call instead.
- No hardcoded UI strings. New keys go in `apps/web/src/language-data/core/Default/resources/{en,tr}.json` (both files), then `pnpm --filter web run init` regenerates the bundle. Never stage `apps/web/src/language-data/i18n/*` or `packages/utils/policies/policies.json` after `init`.
- A page returns exactly one root element (`SidebarInset` applies `*:h-0 *:grow` to every direct child).
- Write very few comments; match the file you are in.
- Shared checkout: before every commit run `test "$(git branch --show-current)" = feat/permission-gates`; stage explicit paths only (`GIT_LITERAL_PATHSPECS=1` because of `[lang]` and `(group)` segments); never `git add -A`, never `git add <directory>`, never stage `packages/ayasofyazilim-ui` or `packages/utils`; never `git reset --hard`, never `git stash`; do not push.
- Commit messages via a quoted heredoc (`git commit -F - <<'EOF'`), ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Never run `next build` (the user runs builds). Check nothing is listening on port 3000 before starting `pnpm --filter web dev`, and never start a second one.
- `$SCRATCH` below means your session scratchpad directory — never a path inside the repo.

## Review Focus

- **The grants could not be loaded** (config fetch failed, session half-expired): a user must see the retry error, not "ask an admin for 40 permissions" — pinned by the `guardDecision` tests in Task 1.
- **The permission-name endpoint is slow or down:** the page must still render the denial within ~3 s, showing raw keys — pinned by `buildPermissionLabels(null)` in Task 2 and the `AbortSignal.timeout(3000)` in Task 5; the timeout itself is reviewed, not simulated.
- **A user holding only one side of an any-of page** sees that side and nothing of the other is fetched — pinned by the `missingFor` any-of tests (Task 1) and playbook P2; spot-checked in Task 21.
- **A shared component reached from several routes** is gated by some importers and not others — pinned by the "requires every importer" audit test (Task 3).
- **Parallel-slot and intercepting pages** (`@admin/page.tsx`, `@modal/(.)details/[id]/page.tsx`) are opened by soft navigation yet still need their own guard — pinned by the R2 slot/intercept audit test (Task 3).

---

## File Structure

| Path (repo-relative) | Responsibility |
| --- | --- |
| `apps/web/src/utils/policies.ts` | pure requirement logic: `missingPolicies`, `grantedAny`, `missingFor`, `isRequirementMet`, `guardDecision`, types `PolicyRequirement`, `GrantedPolicies`, `GuardDecision` |
| `apps/web/src/utils/policies.test.ts` | its `test:unit` suite |
| `apps/web/src/utils/permission-labels.ts` | pure `buildPermissionLabels(groups)` over the `public-permissions/all` payload |
| `apps/web/src/utils/permission-labels.test.ts` | its suite |
| `apps/web/src/components/permission-guard/guard.tsx` | server `guardPage({ requires, lang })` |
| `apps/web/src/components/permission-guard/guard-route.ts` | server `guardRoute(requires)` for route handlers |
| `apps/web/src/components/permission-guard/no-permission.tsx` | the in-place denial screen |
| `apps/web/src/app/[lang]/(main)/unauthorized/page.tsx` | rewritten: localized, renders `<NoPermission missing={[]}>` |
| `apps/web/src/language-data/core/Default/resources/{en,tr}.json` | 3 new keys |
| `scripts/lib/policy-audit-core.mjs` | the audit, pure and in-memory |
| `scripts/lib/policy-audit-core.test.mjs` | its `node --test` suite |
| `scripts/policy-audit.mjs` | CLI: reads the repo, prints, exits 1 on violations |
| `scripts/policy-audit.allow.json` | reasoned exceptions |
| `package.json` | `policy:audit` script |
| `.github/workflows/lint-pull-requests.yml` | audit step (Task 19) |
| every file under `apps/web/src` the audit reports | the sweep (Tasks 7–18) |

---

### Task 1: Branch, baselines and requirement helpers

**Files:**
- Create: `apps/web/src/utils/policies.ts`
- Test: `apps/web/src/utils/policies.test.ts`

**Interfaces:**
- Consumes: `Policy`, `Policies` types from `@repo/utils/policies` (type-only imports).
- Produces:
  - `type GrantedPolicies = Partial<Policies> | Record<string, boolean | undefined> | null | undefined`
  - `type PolicyRequirement = readonly Policy[] | { anyOf: readonly (readonly Policy[])[] }`
  - `missingPolicies(required: readonly Policy[], granted: GrantedPolicies): Policy[]`
  - `grantedAny(alternatives: readonly (readonly Policy[])[], granted: GrantedPolicies): boolean`
  - `missingFor(requirement: PolicyRequirement, granted: GrantedPolicies): Policy[]`
  - `isRequirementMet(requirement: PolicyRequirement, granted: GrantedPolicies): boolean`
  - `type GuardDecision = { kind: "allow" } | { kind: "deny"; missing: Policy[] } | { kind: "error" }`
  - `guardDecision(requirement: PolicyRequirement, config: { user: { isAuthenticated: boolean }; policies: GrantedPolicies }): GuardDecision`

- [ ] **Step 1: Confirm the checkout is free and cut the branch**

```bash
cd /c/unirefund/web-app
git status --short                 # must print nothing
git reflog --date=iso | head -5    # no checkout/commit you did not make in the last hour; if there is one, stop and ask
git fetch origin main
git switch -c feat/permission-gates origin/main
git branch --show-current          # feat/permission-gates
```

- [ ] **Step 2: Record the gate baselines**

```bash
cd /c/unirefund/web-app
pnpm --filter web type-check; echo "type-check exit $?"
pnpm --filter web test:unit 2>&1 | tail -8
pnpm --filter web lint 2>&1 | tail -3
```

Expected: type-check exit 0; `test:unit` 0 failures. Write the three results into `$SCRATCH/baseline.txt` — later tasks compare against them. If type-check is not 0, stop and report: a dirty baseline hides real errors.

- [ ] **Step 3: Write the failing test**

Create `apps/web/src/utils/policies.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Policy } from "@repo/utils/policies";
import { grantedAny, guardDecision, isRequirementMet, missingFor, missingPolicies } from "./policies";

const P = (...names: string[]) => names as Policy[];
const granted = { "CRMService.Airports": true, "CRMService.Airports.View": true, "CRMService.Airports.Edit": false };

describe("missingPolicies", () => {
  it("returns only what the user lacks, in the required order", () => {
    assert.deepEqual(
      missingPolicies(P("CRMService.Airports.Delete", "CRMService.Airports", "CRMService.Airports.Edit"), granted),
      ["CRMService.Airports.Delete", "CRMService.Airports.Edit"]
    );
  });

  it("treats an explicit false the same as an absent key", () => {
    assert.deepEqual(missingPolicies(P("CRMService.Airports.Edit"), granted), ["CRMService.Airports.Edit"]);
  });

  it("treats missing grants (signed out, failed config) as holding nothing", () => {
    assert.deepEqual(missingPolicies(P("CRMService.Airports"), undefined), ["CRMService.Airports"]);
    assert.deepEqual(missingPolicies(P("CRMService.Airports"), null), ["CRMService.Airports"]);
  });

  it("is satisfied by an empty requirement", () => {
    assert.deepEqual(missingPolicies(P(), {}), []);
  });
});

describe("grantedAny", () => {
  it("passes when one alternative is fully held", () => {
    assert.equal(grantedAny([P("TagService.Tags", "TagService.Tags.View"), P("CRMService.Airports")], granted), true);
  });

  it("fails when every alternative is missing something", () => {
    assert.equal(grantedAny([P("CRMService.Airports", "CRMService.Airports.Edit"), P("X")], granted), false);
  });
});

describe("missingFor", () => {
  it("behaves like missingPolicies for an AND requirement", () => {
    assert.deepEqual(missingFor(P("CRMService.Airports", "CRMService.Airports.Edit"), granted), ["CRMService.Airports.Edit"]);
  });

  it("returns nothing when any alternative of an any-of is met", () => {
    assert.deepEqual(missingFor({ anyOf: [P("X", "X.View"), P("CRMService.Airports.View")] }, granted), []);
  });

  it("shows the closest alternative when none is met", () => {
    assert.deepEqual(
      missingFor({ anyOf: [P("X", "X.View"), P("CRMService.Airports", "CRMService.Airports.Edit")] }, granted),
      ["CRMService.Airports.Edit"]
    );
  });

  it("keeps the first alternative on a tie", () => {
    assert.deepEqual(missingFor({ anyOf: [P("X"), P("Y")] }, {}), ["X"]);
  });
});

describe("guardDecision", () => {
  const signedIn = { user: { isAuthenticated: true }, policies: granted };

  it("allows a met requirement", () => {
    assert.deepEqual(guardDecision(P("CRMService.Airports", "CRMService.Airports.View"), signedIn), { kind: "allow" });
  });

  it("denies with the missing list for a signed-in user", () => {
    assert.deepEqual(guardDecision(P("CRMService.Airports", "CRMService.Airports.Edit"), signedIn), {
      kind: "deny",
      missing: ["CRMService.Airports.Edit"],
    });
  });

  it("reports an error, not a denial, when the configuration could not be loaded", () => {
    assert.deepEqual(
      guardDecision(P("CRMService.Airports"), { user: { isAuthenticated: false }, policies: {} }),
      { kind: "error" }
    );
  });

  it("still allows an empty requirement when the configuration failed", () => {
    assert.deepEqual(guardDecision(P(), { user: { isAuthenticated: false }, policies: {} }), { kind: "allow" });
  });
});

describe("isRequirementMet", () => {
  it("is the negation of a non-empty missingFor", () => {
    assert.equal(isRequirementMet(P("CRMService.Airports.View"), granted), true);
    assert.equal(isRequirementMet(P("CRMService.Airports.Edit"), granted), false);
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `cd /c/unirefund/web-app/apps/web && node --import tsx --test src/utils/policies.test.ts`
Expected: FAIL — `Cannot find module './policies'`.

- [ ] **Step 5: Write the implementation**

Create `apps/web/src/utils/policies.ts`:

```ts
import type { Policies, Policy } from "@repo/utils/policies";

export type GrantedPolicies = Partial<Policies> | Record<string, boolean | undefined> | null | undefined;

/** AND over `Policy[]`; `anyOf` passes when any one alternative is fully held. */
export type PolicyRequirement = readonly Policy[] | { anyOf: readonly (readonly Policy[])[] };

export function missingPolicies(required: readonly Policy[], granted: GrantedPolicies): Policy[] {
  return required.filter((policy) => !(granted as Record<string, boolean | undefined> | null | undefined)?.[policy]);
}

export function grantedAny(alternatives: readonly (readonly Policy[])[], granted: GrantedPolicies): boolean {
  return alternatives.some((alternative) => missingPolicies(alternative, granted).length === 0);
}

/**
 * What to show a user who fails `requirement`: for an any-of, the alternative
 * they are closest to (fewest missing, first on a tie). Empty when met.
 */
export function missingFor(requirement: PolicyRequirement, granted: GrantedPolicies): Policy[] {
  if (!("anyOf" in requirement)) return missingPolicies(requirement, granted);
  let best: Policy[] | undefined;
  for (const alternative of requirement.anyOf) {
    const missing = missingPolicies(alternative, granted);
    if (missing.length === 0) return [];
    if (!best || missing.length < best.length) best = missing;
  }
  return best ?? [];
}

export function isRequirementMet(requirement: PolicyRequirement, granted: GrantedPolicies): boolean {
  return missingFor(requirement, granted).length === 0;
}

export type GuardDecision = { kind: "allow" } | { kind: "deny"; missing: Policy[] } | { kind: "error" };

/**
 * A failed configuration fetch yields no user and no grants, which would
 * otherwise read as "missing everything" - show the retry error instead.
 */
export function guardDecision(
  requirement: PolicyRequirement,
  config: { user: { isAuthenticated: boolean }; policies: GrantedPolicies }
): GuardDecision {
  const missing = missingFor(requirement, config.policies);
  if (missing.length === 0) return { kind: "allow" };
  if (!config.user.isAuthenticated) return { kind: "error" };
  return { kind: "deny", missing };
}
```

- [ ] **Step 6: Run it to see it pass**

Run: `cd /c/unirefund/web-app/apps/web && node --import tsx --test src/utils/policies.test.ts`
Expected: PASS, 15 tests, 0 fail.

- [ ] **Step 7: Type-check**

Run: `cd /c/unirefund/web-app && pnpm --filter web type-check`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
cd /c/unirefund/web-app
test "$(git branch --show-current)" = feat/permission-gates
GIT_LITERAL_PATHSPECS=1 git add -- apps/web/src/utils/policies.ts apps/web/src/utils/policies.test.ts
git commit -F - <<'EOF'
feat(web): add requirement helpers for permission gates

AND and any-of requirements, the missing set to show a denied user, and a
guard decision that reports a failed configuration load as an error rather
than as missing every permission.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Readable permission names

**Files:**
- Create: `apps/web/src/utils/permission-labels.ts`
- Test: `apps/web/src/utils/permission-labels.test.ts`

**Interfaces:**
- Produces: `interface PermissionGroup { name?; displayName?; permissions?: PermissionNode[] }`, `interface PermissionNode { name?; displayName?; parentName?; children? }`, `buildPermissionLabels(groups: readonly PermissionGroup[] | null | undefined): Record<string, string>` — a group maps to its display name, a top-level permission to its own, a child to `"<parent> › <own>"`; empty names fall back to the key.

Note: `GET /api/administration-service/public-permissions/all` returned English display names for `Accept-Language: tr`, `?culture=tr` and the culture cookie alike (checked 2026-09-30 on dev). Turkish pages will show English names above the raw keys; the screen's own text is localized. Do not add a translation layer for them.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/utils/permission-labels.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPermissionLabels } from "./permission-labels";

// Trimmed from a real GET /api/administration-service/public-permissions/all.
const GROUPS = [
  {
    name: "AbpIdentity",
    displayName: "Identity management",
    permissions: [
      {
        name: "AbpIdentity.Roles",
        displayName: "Role management",
        parentName: "",
        children: [
          { name: "AbpIdentity.Roles.Update", displayName: "Edit", parentName: "AbpIdentity.Roles", children: [] },
        ],
      },
    ],
  },
];

describe("buildPermissionLabels", () => {
  it("labels a group by its display name", () => {
    assert.equal(buildPermissionLabels(GROUPS)["AbpIdentity"], "Identity management");
  });

  it("labels a top-level permission by its own display name", () => {
    assert.equal(buildPermissionLabels(GROUPS)["AbpIdentity.Roles"], "Role management");
  });

  it("labels a child as parent › own", () => {
    assert.equal(buildPermissionLabels(GROUPS)["AbpIdentity.Roles.Update"], "Role management › Edit");
  });

  it("falls back to the key when a display name is empty", () => {
    const labels = buildPermissionLabels([{ name: "G", displayName: "", permissions: [{ name: "G.X", displayName: null }] }]);
    assert.equal(labels["G"], "G");
    assert.equal(labels["G.X"], "G.X");
  });

  it("returns an empty map for a missing or failed payload", () => {
    assert.deepEqual(buildPermissionLabels(undefined), {});
    assert.deepEqual(buildPermissionLabels(null), {});
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /c/unirefund/web-app/apps/web && node --import tsx --test src/utils/permission-labels.test.ts`
Expected: FAIL — `Cannot find module './permission-labels'`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/utils/permission-labels.ts`:

```ts
export interface PermissionNode {
  name?: string | null;
  displayName?: string | null;
  parentName?: string | null;
  children?: PermissionNode[] | null;
}
export interface PermissionGroup {
  name?: string | null;
  displayName?: string | null;
  permissions?: PermissionNode[] | null;
}

/**
 * Readable name per permission key from `public-permissions/all`:
 * a group is its display name; a child is "<parent> › <own>".
 */
export function buildPermissionLabels(groups: readonly PermissionGroup[] | null | undefined): Record<string, string> {
  const labels: Record<string, string> = {};
  const visit = (nodes: readonly PermissionNode[] | null | undefined, parentLabel: string | undefined) => {
    for (const node of nodes ?? []) {
      if (!node.name) continue;
      const own = node.displayName || node.name;
      labels[node.name] = parentLabel ? `${parentLabel} › ${own}` : own;
      visit(node.children, own);
    }
  };
  for (const group of groups ?? []) {
    if (group.name) labels[group.name] = group.displayName || group.name;
    visit(group.permissions, undefined);
  }
  return labels;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd /c/unirefund/web-app/apps/web && node --import tsx --test src/utils/permission-labels.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/web-app
test "$(git branch --show-current)" = feat/permission-gates
GIT_LITERAL_PATHSPECS=1 git add -- apps/web/src/utils/permission-labels.ts apps/web/src/utils/permission-labels.test.ts
git commit -F - <<'EOF'
feat(web): build readable permission names from the public permission list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Audit core

**Files:**
- Create: `scripts/lib/policy-audit-core.mjs`
- Test: `scripts/lib/policy-audit-core.test.mjs`

**Interfaces:**
- Consumes: `typescript` (root devDependency, 6.0.2).
- Produces (all exported from `policy-audit-core.mjs`):
  - `parseSdkDocblocks(source: string): Map<sdkMethod, string[] | null>` — `null` = no permission line.
  - `parseActions(source: string, fileName?): Map<exportedName, sdkMethod[]>` — follows `cache(fn)` and local helpers.
  - `analyzeAppFile(source, fileName): { imports: {specifier, names}[], gates: Set<string>, guardPage: {all: string[]} | {anyOf: string[][]} | null | undefined }` — `undefined` = no `guardPage` call.
  - `resolveImport(fromFile, specifier, appFiles, actionModules): string | null` — app-relative path, `"@actions:<key>"`, or `null`.
  - `parseNav(source): { href, effective: string[] }[]`
  - `audit({ appFiles: Map, actionModules: Map, sdkSources: string[], knownPolicies: Set|null, navSource: string|null, allowlist: {rule, file, action?, href?, reason}[] }): { violations, pages: Record<route, {file, requires}>, warnings: string[] }`
  - Violation shapes: `{rule:"R1", file, action, required, missing}`, `{rule:"R2", file}`, `{rule:"R3", file, href, nav, requires}`, `{rule:"R0", file, problem}`.

What counts as a gate: string literals inside the arguments of `guardPage`, `guardRoute`, `isActionGranted`, `grantedAny`, `missingPolicies`, `missingFor`, `isRequirementMet`, `isUnauthorized`; inside `policies:` / `requiredPolicies:` / `requires:` properties and JSX attributes; inside a same-file constant referenced from any of those; and every gate literal of a plain `.ts` module the file imports (rule tables such as `src/utils/tag-actions.ts`). A call is covered when its own file holds all required literals, or when **every** file importing it is covered; a route file (`page|layout|route|default|template`) must cover itself.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/policy-audit-core.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeAppFile,
  audit,
  parseActions,
  parseNav,
  parseSdkDocblocks,
  resolveImport,
} from "./policy-audit-core.mjs";

const SDK = `
export class AirportService {
  /**
   * Service docblock that is not a method.
   */
  constructor() {}

  /**
   * Returns the airport with the given id.
   * **Requires permissions:** CRMService.Airports, CRMService.Airports.View
   * @param data The data for the request.
   */
  public getApiCrmServiceAirportsById(data) {}

  /**
   * **Requires permissions:** CRMService.Airports, CRMService.Airports.Edit
   */
  public putApiCrmServiceAirportsById(data) {}

  /**
   * **Requires permissions:** CRMService.Airports, CRMService.Airports.Delete
   */
  public deleteApiCrmServiceAirportsById(data) {}

  /**
   * Public lookup, no permission line.
   */
  public getApiCrmServicePublicAirports() {}
}
`;

const ACTIONS = `
"use server";
import { cache } from "react";
async function getAirportByIdApiUncached(id) {
  const client = await getCRMServiceClient();
  return client.airport.getApiCrmServiceAirportsById({ id });
}
export const getAirportByIdApi = cache(getAirportByIdApiUncached);
export async function putAirportByIdApi(data) {
  const client = await getCRMServiceClient();
  return client.airport.putApiCrmServiceAirportsById(data);
}
export async function deleteAirportByIdApi(id) {
  const client = await getCRMServiceClient();
  return client.airport.deleteApiCrmServiceAirportsById({ id });
}
export async function getPublicAirportsApi() {
  const client = await getCRMServiceClient();
  return client.airport.getApiCrmServicePublicAirports();
}
export async function getAwsThingApi() {
  return fetch("https://example.com");
}
`;

const ACTION_IMPORT = `@repo/actions/unirefund/CRMService/actions`;
const PAGE = "src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/page.tsx";
const FORM = "src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/_components/form.tsx";

function run(appFiles, extra = {}) {
  return audit({
    appFiles: new Map(Object.entries(appFiles)),
    actionModules: new Map([["unirefund/CRMService/actions", ACTIONS]]),
    sdkSources: [SDK],
    knownPolicies: new Set([
      "CRMService.Airports",
      "CRMService.Airports.View",
      "CRMService.Airports.Edit",
      "CRMService.Airports.Delete",
    ]),
    navSource: null,
    ...extra,
  });
}
const r1 = (result) => result.violations.filter((v) => v.rule === "R1");

const guardedPage = (body = "") => `
import { getAirportByIdApi } from "${ACTION_IMPORT}";
import { guardPage } from "@/src/components/permission-guard/guard";
import { AirportForm } from "./_components/form";
export default async function Page() {
  const denied = await guardPage({ requires: ["CRMService.Airports", "CRMService.Airports.View"], lang: "en" });
  if (denied) return denied;
  ${body}
  return <AirportForm />;
}`;

describe("parseSdkDocblocks", () => {
  it("pairs each permission line with the method it documents", () => {
    const map = parseSdkDocblocks(SDK);
    assert.deepEqual(map.get("getApiCrmServiceAirportsById"), [
      "CRMService.Airports",
      "CRMService.Airports.View",
    ]);
    assert.deepEqual(map.get("deleteApiCrmServiceAirportsById"), [
      "CRMService.Airports",
      "CRMService.Airports.Delete",
    ]);
  });

  it("records a method without a permission line as null", () => {
    assert.equal(parseSdkDocblocks(SDK).get("getApiCrmServicePublicAirports"), null);
  });

  it("does not let a non-method docblock swallow the next method's", () => {
    assert.equal(parseSdkDocblocks(SDK).size, 4);
  });
});

describe("parseActions", () => {
  it("follows a cache() wrapper to the local function that calls the SDK", () => {
    assert.deepEqual(parseActions(ACTIONS).get("getAirportByIdApi"), ["getApiCrmServiceAirportsById"]);
  });

  it("maps a plain exported action to its SDK method", () => {
    assert.deepEqual(parseActions(ACTIONS).get("putAirportByIdApi"), ["putApiCrmServiceAirportsById"]);
  });

  it("gives an action that calls no SDK method an empty list", () => {
    assert.deepEqual(parseActions(ACTIONS).get("getAwsThingApi"), []);
  });

  it("does not export the uncached helper", () => {
    assert.equal(parseActions(ACTIONS).has("getAirportByIdApiUncached"), false);
  });
});

describe("analyzeAppFile", () => {
  it("collects strings from gate calls, including a same-file constant", () => {
    const info = analyzeAppFile(
      `const EDIT = ["CRMService.Airports", "CRMService.Airports.Edit"] as const;
       const canEdit = isActionGranted([...EDIT], grantedPolicies);
       const title = "Not a gate";`,
      "x.tsx"
    );
    assert.deepEqual([...info.gates].sort(), ["CRMService.Airports", "CRMService.Airports.Edit"]);
  });

  it("collects strings from policies props and JSX attributes", () => {
    const info = analyzeAppFile(
      `const rules = [{ policies: ["A", "A.B"] }];
       const el = <Gate requires={["C", "C.D"]} />;`,
      "x.tsx"
    );
    assert.deepEqual([...info.gates].sort(), ["A", "A.B", "C", "C.D"]);
  });

  it("reads a guardPage requirement, AND and any-of", () => {
    assert.deepEqual(
      analyzeAppFile(`await guardPage({ requires: ["A", "A.View"], lang })`, "p.tsx").guardPage,
      { all: ["A", "A.View"] }
    );
    assert.deepEqual(
      analyzeAppFile(`await guardPage({ requires: { anyOf: [["A", "A.View"], ["B", "B.View"]] }, lang })`, "p.tsx")
        .guardPage,
      { anyOf: [["A", "A.View"], ["B", "B.View"]] }
    );
  });

  it("reports undefined when the file never calls guardPage", () => {
    assert.equal(analyzeAppFile(`export default function Page() {}`, "p.tsx").guardPage, undefined);
  });
});

describe("resolveImport", () => {
  const files = new Set(["src/components/a.tsx", "src/utils/b.ts", "src/app/x/_components/c.tsx"]);
  const actions = new Map([["unirefund/CRMService/actions", ""]]);
  it("resolves the @/src alias, the @/components alias and relative paths", () => {
    assert.equal(resolveImport("src/app/x/page.tsx", "@/src/components/a", files, actions), "src/components/a.tsx");
    assert.equal(resolveImport("src/app/x/page.tsx", "@/components/a", files, actions), "src/components/a.tsx");
    assert.equal(resolveImport("src/app/x/page.tsx", "./_components/c", files, actions), "src/app/x/_components/c.tsx");
  });
  it("tags action modules and ignores external packages", () => {
    assert.equal(resolveImport("src/a.tsx", ACTION_IMPORT, files, actions), "@actions:unirefund/CRMService/actions");
    assert.equal(resolveImport("src/a.tsx", "next/link", files, actions), null);
  });
});

describe("audit R1", () => {
  it("passes a page whose guard names the read's full pair", () => {
    const result = run({ [PAGE]: guardedPage(), [FORM]: `export function AirportForm() {}` });
    assert.deepEqual(r1(result), []);
  });

  it("flags a leaf-only gate and names the missing group", () => {
    const result = run({
      [PAGE]: guardedPage(),
      [FORM]: `import { putAirportByIdApi } from "${ACTION_IMPORT}";
        export function AirportForm() { const ok = isActionGranted(["CRMService.Airports.Edit"], g); }`,
    });
    assert.deepEqual(r1(result), [
      {
        rule: "R1",
        file: FORM,
        action: "putAirportByIdApi",
        required: ["CRMService.Airports", "CRMService.Airports.Edit"],
        missing: ["CRMService.Airports"],
      },
    ]);
  });

  it("accepts a gate held by the importing page", () => {
    const result = run({
      [PAGE]: guardedPage(`const canEdit = isActionGranted(["CRMService.Airports", "CRMService.Airports.Edit"], g);`),
      [FORM]: `import { putAirportByIdApi } from "${ACTION_IMPORT}"; export function AirportForm() {}`,
    });
    assert.deepEqual(r1(result), []);
  });

  it("requires every importer of a shared component to gate it", () => {
    const shared = "src/components/delete-airport.tsx";
    const other = "src/app/[lang]/(main)/(unirefund)/parties/other/page.tsx";
    const result = run({
      [shared]: `import { deleteAirportByIdApi } from "${ACTION_IMPORT}"; export function DeleteAirport() {}`,
      [PAGE]: `import { DeleteAirport } from "@/src/components/delete-airport";
        export default async function Page() {
          await guardPage({ requires: [], lang });
          const ok = isActionGranted(["CRMService.Airports", "CRMService.Airports.Delete"], g);
        }`,
      [other]: `import { DeleteAirport } from "@/src/components/delete-airport";
        export default async function Page() { await guardPage({ requires: [], lang }); }`,
    });
    assert.deepEqual(
      r1(result).map((v) => [v.file, v.action]),
      [[shared, "deleteAirportByIdApi"]]
    );
  });

  it("does not let a layout's guard cover its page", () => {
    const layout = "src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/layout.tsx";
    const result = run({
      [layout]: `export default async function Layout({ children }) {
        const denied = await guardPage({ requires: ["CRMService.Airports", "CRMService.Airports.View"], lang });
        return children; }`,
      [PAGE]: `import { getAirportByIdApi } from "${ACTION_IMPORT}";
        export default async function Page() { await guardPage({ requires: [], lang }); }`,
    });
    assert.deepEqual(r1(result).map((v) => v.file), [PAGE]);
  });

  it("counts gates from an imported plain .ts rules module", () => {
    const rules = "src/utils/airport-grants.ts";
    const result = run({
      [rules]: `export const AIRPORT_RULES = { edit: { policies: ["CRMService.Airports", "CRMService.Airports.Edit"] } };`,
      [PAGE]: guardedPage(),
      [FORM]: `import { putAirportByIdApi } from "${ACTION_IMPORT}";
        import { AIRPORT_RULES } from "@/src/utils/airport-grants";
        export function AirportForm() {}`,
    });
    assert.deepEqual(r1(result), []);
  });

  it("skips actions whose endpoint has no permission line or no SDK call", () => {
    const result = run({
      [FORM]: `import { getPublicAirportsApi, getAwsThingApi } from "${ACTION_IMPORT}"; export function F() {}`,
    });
    assert.deepEqual(r1(result), []);
  });
});

describe("audit R2", () => {
  it("flags a (main) page without guardPage, including slot and intercepting pages", () => {
    const slot = "src/app/[lang]/(main)/(unirefund)/operations/refund/@admin/page.tsx";
    const intercept = "src/app/[lang]/(main)/(core)/management/logs/audit/@modal/(.)details/[id]/page.tsx";
    const result = run({
      [PAGE]: `export default function Page() {}`,
      [slot]: `export default function P() {}`,
      [intercept]: `export default function P() {}`,
    });
    assert.deepEqual(
      result.violations.filter((v) => v.rule === "R2").map((v) => v.file).sort(),
      [PAGE, slot, intercept].sort()
    );
  });

  it("keeps slot and intercepting pages out of the route map", () => {
    const slot = "src/app/[lang]/(main)/(unirefund)/operations/refund/@admin/page.tsx";
    const result = run({ [slot]: `export default async function P() { await guardPage({ requires: [], lang }); }` });
    assert.deepEqual(Object.keys(result.pages), []);
  });

  it("ignores pages outside (main)", () => {
    const login = "src/app/[lang]/(auth)/login/page.tsx";
    assert.deepEqual(run({ [login]: `export default function Page() {}` }).violations, []);
  });
});

describe("parseNav and audit R3", () => {
  const nav = `export const navItems = [
    { key: "parties", policies: ["CRMService"], items: [
      { key: "airports", href: "parties/airports", policies: ["CRMService.Airports"] },
    ] },
  ];`;
  const listPage = "src/app/[lang]/(main)/(unirefund)/parties/airports/page.tsx";

  it("gives each linked item its ancestors' policies too", () => {
    assert.deepEqual(parseNav(nav), [
      { href: "parties/airports", effective: ["CRMService", "CRMService.Airports"] },
    ]);
  });

  it("flags a nav item whose effective requirement differs from its page", () => {
    const result = run(
      { [listPage]: `export default async function P() { await guardPage({ requires: ["CRMService.Airports", "CRMService.Airports.View"], lang }); }` },
      { navSource: nav }
    );
    assert.equal(result.violations.filter((v) => v.rule === "R3").length, 1);
  });

  it("accepts a nav item that matches its page exactly", () => {
    const result = run(
      { [listPage]: `export default async function P() { await guardPage({ requires: ["CRMService", "CRMService.Airports"], lang }); }` },
      { navSource: nav }
    );
    assert.deepEqual(result.violations, []);
  });
});

describe("allowlist", () => {
  it("suppresses a matching violation", () => {
    const result = run(
      { [PAGE]: `export default function Page() {}` },
      { allowlist: [{ rule: "R2", file: PAGE, reason: "public landing page" }] }
    );
    assert.deepEqual(result.violations, []);
  });

  it("reports an entry that matches nothing, and one without a reason", () => {
    const result = run(
      { [PAGE]: guardedPage(), [FORM]: `export function AirportForm() {}` },
      { allowlist: [{ rule: "R2", file: PAGE, reason: "stale" }, { rule: "R2", file: "x", reason: "" }] }
    );
    assert.deepEqual(
      result.violations.map((v) => v.problem),
      ["allowlist entry matches no violation", "allowlist entry has no reason"]
    );
  });
});

describe("warnings", () => {
  it("warns, without failing, about a docblock permission missing from policies.json", () => {
    const result = run({}, { knownPolicies: new Set(["CRMService.Airports"]) });
    assert.equal(result.violations.length, 0);
    assert.ok(result.warnings.some((w) => w.includes("CRMService.Airports.View")));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /c/unirefund/web-app && node --test scripts/lib/policy-audit-core.test.mjs`
Expected: FAIL — `Cannot find module '.../policy-audit-core.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/policy-audit-core.mjs`:

```js
import path from "node:path";
import ts from "typescript";

export const GATE_FUNCTIONS = new Set([
  "guardPage",
  "guardRoute",
  "isActionGranted",
  "grantedAny",
  "missingPolicies",
  "missingFor",
  "isRequirementMet",
  "isUnauthorized",
]);
export const GATE_PROPERTIES = new Set(["policies", "requiredPolicies", "requires"]);
const ROUTE_FILE = /(^|\/)(page|layout|route|default|template)\.(ts|tsx)$/;
const SDK_METHOD = /^(get|post|put|delete|patch)Api\w+$/;

const DOCBLOCK = /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*public (\w+)\(/g;

/** sdk.gen.ts source -> Map<sdkMethod, string[] | null>; null = no permission line. */
export function parseSdkDocblocks(source) {
  const out = new Map();
  for (const [, doc, method] of source.matchAll(DOCBLOCK)) {
    const line = /\*\*Requires permissions:\*\*\s*([^\n]*)/.exec(doc);
    out.set(
      method,
      line ? line[1].split(",").map((s) => s.trim()).filter(Boolean) : null
    );
  }
  return out;
}

function parse(fileName, source) {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
}

function functionBody(node) {
  if (!node) return undefined;
  if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return node.body;
  }
  return undefined;
}

/** actions module source -> Map<exportedName, sdkMethod[]> (local helpers flattened). */
export function parseActions(source, fileName = "actions.ts") {
  const sf = parse(fileName, source);
  const direct = new Map();
  const localCalls = new Map();
  const exported = new Set();

  const record = (name, node) => {
    const sdk = new Set();
    const locals = new Set();
    const walk = (n) => {
      if (ts.isCallExpression(n)) {
        const callee = n.expression;
        if (ts.isPropertyAccessExpression(callee) && SDK_METHOD.test(callee.name.text)) {
          sdk.add(callee.name.text);
        } else if (ts.isIdentifier(callee)) {
          locals.add(callee.text);
        }
        for (const arg of n.arguments) if (ts.isIdentifier(arg)) locals.add(arg.text);
      }
      ts.forEachChild(n, walk);
    };
    walk(node);
    direct.set(name, sdk);
    localCalls.set(name, locals);
  };

  for (const st of sf.statements) {
    const isExported = st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isFunctionDeclaration(st) && st.name) {
      record(st.name.text, st);
      if (isExported) exported.add(st.name.text);
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        record(d.name.text, d.initializer);
        if (isExported) exported.add(d.name.text);
      }
    }
  }

  const flatten = (name, seen = new Set()) => {
    if (seen.has(name) || !direct.has(name)) return new Set();
    seen.add(name);
    const all = new Set(direct.get(name));
    for (const local of localCalls.get(name)) for (const m of flatten(local, seen)) all.add(m);
    return all;
  };
  const out = new Map();
  for (const name of exported) out.set(name, [...flatten(name)]);
  return out;
}

function stringsIn(node, out) {
  const walk = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.add(n.text);
    ts.forEachChild(n, walk);
  };
  walk(node);
}

function identifiersIn(node, out) {
  const walk = (n) => {
    if (ts.isIdentifier(n)) out.add(n.text);
    ts.forEachChild(n, walk);
  };
  walk(node);
}

function calleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return undefined;
}

/** Guard requirement of a guardPage({ requires }) argument. */
function readRequires(arg, consts) {
  if (!arg || !ts.isObjectLiteralExpression(arg)) return null;
  const prop = arg.properties.find(
    (p) => ts.isPropertyAssignment(p) && p.name && p.name.getText() === "requires"
  );
  if (!prop) return null;
  let value = prop.initializer;
  if (ts.isIdentifier(value) && consts.has(value.text)) value = consts.get(value.text);
  while (ts.isAsExpression(value) || ts.isSatisfiesExpression?.(value)) value = value.expression;
  if (ts.isArrayLiteralExpression(value)) {
    const all = new Set();
    stringsIn(value, all);
    return { all: [...all] };
  }
  if (ts.isObjectLiteralExpression(value)) {
    const anyOfProp = value.properties.find(
      (p) => ts.isPropertyAssignment(p) && p.name.getText() === "anyOf"
    );
    if (anyOfProp && ts.isArrayLiteralExpression(anyOfProp.initializer)) {
      return {
        anyOf: anyOfProp.initializer.elements.map((el) => {
          const s = new Set();
          stringsIn(el, s);
          return [...s];
        }),
      };
    }
  }
  return null;
}

/**
 * One app source file -> what the audit needs from it.
 * imports: [{ specifier, names }]; gates: Set<string>; guardPage: requirement | null | undefined
 * (undefined = no guardPage call; null = a call whose requirement could not be read).
 */
export function analyzeAppFile(source, fileName) {
  const sf = parse(fileName, source);
  const imports = [];
  const consts = new Map();
  const gateRefs = new Set();
  const gates = new Set();
  let guardPage;

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const names = [];
      const bindings = st.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) names.push((el.propertyName ?? el.name).text);
      }
      if (st.importClause?.name) names.push("default");
      imports.push({ specifier: st.moduleSpecifier.text, names });
    }
    if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      imports.push({ specifier: st.moduleSpecifier.text, names: [] });
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer) consts.set(d.name.text, d.initializer);
      }
    }
  }

  const collectGate = (node) => {
    stringsIn(node, gates);
    identifiersIn(node, gateRefs);
  };

  const walk = (n) => {
    if (ts.isCallExpression(n)) {
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
        imports.push({ specifier: n.arguments[0].text, names: [] });
      }
      const name = calleeName(n.expression);
      if (name && GATE_FUNCTIONS.has(name)) {
        n.arguments.forEach(collectGate);
        if (name === "guardPage") guardPage = readRequires(n.arguments[0], consts);
      }
    }
    if (ts.isPropertyAssignment(n) && GATE_PROPERTIES.has(n.name.getText())) collectGate(n.initializer);
    if (ts.isJsxAttribute(n) && GATE_PROPERTIES.has(n.name.getText()) && n.initializer) collectGate(n.initializer);
    ts.forEachChild(n, walk);
  };
  walk(sf);

  // Same-file constants referenced from a gate context contribute their strings.
  const seen = new Set();
  const pending = [...gateRefs];
  while (pending.length) {
    const ref = pending.pop();
    if (seen.has(ref) || !consts.has(ref)) continue;
    seen.add(ref);
    const init = consts.get(ref);
    stringsIn(init, gates);
    const inner = new Set();
    identifiersIn(init, inner);
    pending.push(...inner);
  }

  return { imports, gates, guardPage };
}

const ALIASES = [
  ["@/components/", "src/components/"],
  ["@/language-data/", "src/language-data/"],
  ["@/providers/", "src/providers/"],
  ["@/utils/", "src/utils/"],
  ["@/utils", "src/utils"],
  ["@/", ""],
];
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

/** Resolves an import to an app-relative posix path, "@actions:<key>", or null (external). */
export function resolveImport(fromFile, specifier, appFiles, actionModules) {
  if (specifier.startsWith("@repo/actions/")) {
    const key = specifier.slice("@repo/actions/".length);
    for (const k of [key, `${key}/index`]) if (actionModules.has(k)) return `@actions:${k}`;
    return null;
  }
  let base;
  if (specifier.startsWith(".")) {
    base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  } else {
    const alias = ALIASES.find(([a]) => specifier === a || specifier.startsWith(a));
    if (!alias) return null;
    base = alias[1] + specifier.slice(alias[0].length);
  }
  for (const ext of EXTENSIONS) if (appFiles.has(base + ext)) return base + ext;
  return null;
}

/** Static route of a page, or null for non-pages and parallel/intercepting slots. */
function routePathOf(file) {
  const m = /^src\/app\/\[lang\]\/(.*)\/page\.tsx$/.exec(file);
  if (!m || /\/@|\(\.+\)/.test(`/${m[1]}`)) return null;
  return m[1]
    .split("/")
    .filter((seg) => !/^\(.*\)$/.test(seg) && !seg.startsWith("@"))
    .join("/");
}

function sameSet(a, b) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/** Sidebar data.ts -> [{ href, effective: string[] }], where effective includes every ancestor's policies. */
export function parseNav(source, fileName = "data.ts") {
  const sf = parse(fileName, source);
  const out = [];
  const visit = (node, inherited) => {
    if (ts.isObjectLiteralExpression(node)) {
      let own = [];
      let href;
      for (const p of node.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const key = p.name.getText();
        if (key === "policies" && ts.isArrayLiteralExpression(p.initializer)) {
          const s = new Set();
          stringsIn(p.initializer, s);
          own = [...s];
        }
        if (key === "href" && (ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer))) {
          href = p.initializer.text.replace(/^\/+|\/+$/g, "");
        }
      }
      const effective = [...new Set([...inherited, ...own])];
      if (href) out.push({ href, effective });
      ts.forEachChild(node, (c) => visit(c, effective));
      return;
    }
    ts.forEachChild(node, (c) => visit(c, inherited));
  };
  visit(sf, []);
  return out;
}

/**
 * The whole audit, in memory.
 * appFiles: Map<app-relative posix path, source>; actionModules: Map<key, source>;
 * sdkSources: string[]; knownPolicies: Set<string>; navSource: string | null;
 * allowlist: [{ rule, file, action?, reason }]
 */
export function audit({ appFiles, actionModules, sdkSources, knownPolicies, navSource, allowlist = [] }) {
  const methodPolicies = new Map();
  for (const src of sdkSources) for (const [m, p] of parseSdkDocblocks(src)) methodPolicies.set(m, p);

  const actionPolicies = new Map();
  for (const [key, src] of actionModules) {
    for (const [name, methods] of parseActions(src, `${key}.ts`)) {
      const set = new Set();
      for (const m of methods) for (const p of methodPolicies.get(m) ?? []) set.add(p);
      actionPolicies.set(`${key}#${name}`, [...set]);
    }
  }

  const warnings = [];
  for (const [m, pols] of methodPolicies) {
    for (const p of pols ?? []) {
      if (knownPolicies && !knownPolicies.has(p)) warnings.push(`${m}: "${p}" is not in policies.json`);
    }
  }

  const analyzed = new Map();
  for (const [file, src] of appFiles) analyzed.set(file, analyzeAppFile(src, file));

  const importers = new Map();
  const edges = new Map();
  for (const [file, info] of analyzed) {
    const resolved = [];
    for (const imp of info.imports) {
      const target = resolveImport(file, imp.specifier, appFiles, actionModules);
      if (!target) continue;
      resolved.push({ target, names: imp.names });
      if (!target.startsWith("@actions:")) {
        if (!importers.has(target)) importers.set(target, new Set());
        importers.get(target).add(file);
      }
    }
    edges.set(file, resolved);
  }

  // A file's gates include those of the plain .ts modules it imports (rule tables, grant helpers).
  const gatesOf = new Map();
  for (const [file, info] of analyzed) {
    const set = new Set(info.gates);
    for (const { target } of edges.get(file)) {
      if (target.endsWith(".ts") && analyzed.has(target)) for (const g of analyzed.get(target).gates) set.add(g);
    }
    gatesOf.set(file, set);
  }

  const memo = new Map();
  const covered = (file, required, stack = new Set()) => {
    const key = `${file}|${required.join(",")}`;
    if (memo.has(key)) return memo.get(key);
    if (required.every((p) => gatesOf.get(file).has(p))) return memo.set(key, true).get(key);
    if (ROUTE_FILE.test(file)) return memo.set(key, false).get(key);
    const ups = [...(importers.get(file) ?? [])].filter((u) => !stack.has(u));
    if (ups.length === 0) return memo.set(key, false).get(key);
    const next = new Set(stack).add(file);
    return memo.set(key, ups.every((u) => covered(u, required, next))).get(key);
  };

  const violations = [];
  for (const [file] of analyzed) {
    for (const { target, names } of edges.get(file)) {
      if (!target.startsWith("@actions:")) continue;
      const key = target.slice("@actions:".length);
      for (const name of names) {
        const required = actionPolicies.get(`${key}#${name}`);
        if (!required || required.length === 0) continue;
        if (!covered(file, required)) {
          const missing = required.filter((p) => !gatesOf.get(file).has(p));
          violations.push({ rule: "R1", file, action: name, required, missing });
        }
      }
    }
  }

  const pages = {};
  for (const [file, info] of analyzed) {
    if (!/^src\/app\/\[lang\]\/\(main\)\/(.*\/)?page\.tsx$/.test(file)) continue;
    if (info.guardPage === undefined) violations.push({ rule: "R2", file });
    const route = routePathOf(file);
    if (route !== null) pages[route.replace(/^\(main\)\//, "")] = { file, requires: info.guardPage ?? null };
  }

  if (navSource) {
    for (const { href, effective } of parseNav(navSource)) {
      const page = pages[href];
      if (!page || !page.requires) continue;
      const req = page.requires;
      const ok = req.all
        ? sameSet(effective, req.all)
        : req.anyOf.every((alt) => effective.every((p) => alt.includes(p)));
      if (!ok) violations.push({ rule: "R3", file: page.file, href, nav: effective, requires: req });
    }
  }

  const used = new Set();
  const remaining = violations.filter((v) => {
    const i = allowlist.findIndex(
      (a) => a.rule === v.rule && a.file === v.file && (a.action === undefined || a.action === v.action) && (a.href === undefined || a.href === v.href)
    );
    if (i === -1) return true;
    used.add(i);
    return false;
  });
  allowlist.forEach((a, i) => {
    if (!a.reason) remaining.push({ rule: "R0", file: a.file, problem: "allowlist entry has no reason" });
    else if (!used.has(i)) remaining.push({ rule: "R0", file: a.file, problem: "allowlist entry matches no violation" });
  });

  return { violations: remaining, pages, warnings };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd /c/unirefund/web-app && node --test scripts/lib/policy-audit-core.test.mjs`
Expected: PASS, 29 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/web-app
test "$(git branch --show-current)" = feat/permission-gates
GIT_LITERAL_PATHSPECS=1 git add -- scripts/lib/policy-audit-core.mjs scripts/lib/policy-audit-core.test.mjs
git commit -F - <<'EOF'
feat(scripts): add the permission-gate audit core

Maps each server action to its SDK docblock's Requires permissions set and
reports calls no gate covers (R1), (main) pages without guardPage (R2) and
sidebar items whose effective requirement differs from their page (R3).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Audit CLI, script entry and allowlist

**Files:**
- Create: `scripts/policy-audit.mjs`
- Create: `scripts/policy-audit.allow.json`
- Modify: `package.json` (root) — the `scripts` block

**Interfaces:**
- Consumes: `audit` from Task 3.
- Produces: `pnpm policy:audit` (exit 0/1); `node scripts/policy-audit.mjs --path <apps/web-relative prefix> [--path …] [--json]`. `--json` prints `{ violations, pages, warnings }`; `pages` maps each static `(main)` route (route groups and slots stripped, e.g. `parties/airports`) to `{ file, requires }` — used by Task 21.

- [ ] **Step 1: Write the CLI**

Create `scripts/policy-audit.mjs`:

```js
#!/usr/bin/env node
/**
 * Every endpoint-calling control in apps/web must be gated on the full
 * "**Requires permissions:**" set its SDK docblock names (group AND leaf).
 *
 *   pnpm policy:audit                              # whole app, exit 1 on any violation
 *   node scripts/policy-audit.mjs --path <prefix>  # only files under <prefix> (apps/web-relative, repeatable)
 *   node scripts/policy-audit.mjs --json           # machine-readable, incl. the page -> requirement map
 *
 * R1 action calls are covered by a gate in the file or in every importer (route files cover themselves)
 * R2 every (main) page.tsx calls guardPage
 * R3 a sidebar item's effective policies match its page's guardPage requirement
 * R0 allowlist hygiene (scripts/policy-audit.allow.json)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { audit } from "./lib/policy-audit-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.join(ROOT, "apps/web");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|gen)\.ts$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}
const posix = (p) => p.split(path.sep).join("/");

const appFiles = new Map();
for (const f of walk(path.join(APP, "src"))) appFiles.set(posix(path.relative(APP, f)), fs.readFileSync(f, "utf8"));

const actionModules = new Map();
const actionsRoot = path.join(ROOT, "packages/actions");
for (const f of walk(actionsRoot)) {
  actionModules.set(posix(path.relative(actionsRoot, f)).replace(/\.tsx?$/, ""), fs.readFileSync(f, "utf8"));
}

const sdkSources = [];
for (const pkg of ["packages/saas", "packages/core-saas"]) {
  const dir = path.join(ROOT, pkg);
  for (const svc of fs.readdirSync(dir)) {
    const f = path.join(dir, svc, "sdk.gen.ts");
    if (fs.existsSync(f)) sdkSources.push(fs.readFileSync(f, "utf8"));
  }
}

const policiesPath = path.join(ROOT, "packages/utils/policies/policies.json");
const knownPolicies = fs.existsSync(policiesPath)
  ? new Set(Object.keys(JSON.parse(fs.readFileSync(policiesPath, "utf8"))))
  : null;
const navPath = path.join(APP, "src/components/sidebar-layout/data.ts");
const navSource = fs.existsSync(navPath) ? fs.readFileSync(navPath, "utf8") : null;
const allowPath = path.join(ROOT, "scripts/policy-audit.allow.json");
const allowlist = fs.existsSync(allowPath) ? JSON.parse(fs.readFileSync(allowPath, "utf8")) : [];

const args = process.argv.slice(2);
const prefixes = args.flatMap((a, i) => (a === "--path" && args[i + 1] ? [args[i + 1]] : []));
const asJson = args.includes("--json");

const result = audit({ appFiles, actionModules, sdkSources, knownPolicies, navSource, allowlist });
const shown = prefixes.length
  ? result.violations.filter((v) => v.rule !== "R0" && prefixes.some((p) => v.file.startsWith(p)))
  : result.violations;

if (asJson) {
  console.log(JSON.stringify({ ...result, violations: shown }, null, 1));
} else {
  const byFile = new Map();
  for (const v of shown) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file).push(v);
  }
  for (const [file, list] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`\n${file}`);
    for (const v of list) {
      if (v.rule === "R1") console.log(`  R1 ${v.action} needs [${v.required.join(", ")}] - not gated here: [${v.missing.join(", ")}]`);
      else if (v.rule === "R2") console.log("  R2 page does not call guardPage");
      else if (v.rule === "R3") console.log(`  R3 nav "${v.href}" requires [${v.nav.join(", ")}] but the page requires ${JSON.stringify(v.requires)}`);
      else console.log(`  R0 ${v.problem}`);
    }
  }
  const count = (r) => shown.filter((v) => v.rule === r).length;
  console.log(`\npolicy-audit: ${shown.length} violation(s) - R1 ${count("R1")}, R2 ${count("R2")}, R3 ${count("R3")}, R0 ${count("R0")}`);
  if (result.warnings.length) console.log(`${result.warnings.length} warning(s): docblock permissions missing from policies.json (run --json to list)`);
}
process.exit(shown.length === 0 ? 0 : 1);
```

- [ ] **Step 2: Confirm the five redirect-only pages are still redirect-only**

```bash
cd "/c/unirefund/web-app/apps/web/src/app/[lang]/(main)"
for f in "(unirefund)/operations/rule-engine/page.tsx" "(unirefund)/parties/airports/[airportId]/page.tsx" "(unirefund)/parties/exit-points/[exitPointId]/page.tsx" "(unirefund)/parties/franchise-hqs/[partyId]/page.tsx" "(unirefund)/settings/templates/page.tsx"; do
  grep -q "redirect(" "$f" && ! grep -q "@repo/actions" "$f" && echo "ok   $f" || echo "FAIL $f"
done
```

Expected: five `ok` lines. A `FAIL` line means that page now fetches — leave it out of the allowlist; the sweep guards it.

- [ ] **Step 3: Write the allowlist**

Create `scripts/policy-audit.allow.json`:

```json
[
  { "rule": "R2", "file": "src/app/[lang]/(main)/unauthorized/page.tsx", "reason": "It is the denial page itself; guarding it would loop." },
  { "rule": "R2", "file": "src/app/[lang]/(main)/(unirefund)/operations/rule-engine/page.tsx", "reason": "Redirect-only: fetches nothing; the target page guards itself." },
  { "rule": "R2", "file": "src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/page.tsx", "reason": "Redirect-only: fetches nothing; the target page guards itself." },
  { "rule": "R2", "file": "src/app/[lang]/(main)/(unirefund)/parties/exit-points/[exitPointId]/page.tsx", "reason": "Redirect-only: fetches nothing; the target page guards itself." },
  { "rule": "R2", "file": "src/app/[lang]/(main)/(unirefund)/parties/franchise-hqs/[partyId]/page.tsx", "reason": "Redirect-only: fetches nothing; the target page guards itself." },
  { "rule": "R2", "file": "src/app/[lang]/(main)/(unirefund)/settings/templates/page.tsx", "reason": "Redirect-only: fetches nothing; the target page guards itself." }
]
```

Drop any entry whose Step 2 line said `FAIL`.

- [ ] **Step 4: Add the script entry**

In the root `package.json`, directly after the line `"grid:keys": "node scripts/check-grid-keys.mjs",` add:

```json
    "policy:audit": "node scripts/policy-audit.mjs",
```

- [ ] **Step 5: Record the baseline**

```bash
cd /c/unirefund/web-app
pnpm policy:audit > "$SCRATCH/audit-baseline.txt"; echo "exit $?"
tail -2 "$SCRATCH/audit-baseline.txt"
```

Expected: exit 1, last line close to `policy-audit: 864 violation(s) - R1 623, R2 241, R3 0, R0 0` (measured on the prototype at `origin/main` 671c4944d; `main` may have moved). `R0` must be 0 — a non-zero R0 means an allowlist path is misspelled. Warnings must be 0 on dev's `policies.json`. Record the exact numbers for the commit message.

- [ ] **Step 6: Commit**

```bash
cd /c/unirefund/web-app
test "$(git branch --show-current)" = feat/permission-gates
GIT_LITERAL_PATHSPECS=1 git add -- scripts/policy-audit.mjs scripts/policy-audit.allow.json package.json
git commit -F - <<'EOF'
feat(scripts): add pnpm policy:audit

Baseline at this commit: <paste the last line of audit-baseline.txt>.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: guardPage, guardRoute and the denial screen

**Files:**
- Create: `apps/web/src/components/permission-guard/no-permission.tsx`
- Create: `apps/web/src/components/permission-guard/guard.tsx`
- Create: `apps/web/src/components/permission-guard/guard-route.ts`
- Modify: `apps/web/src/language-data/core/Default/resources/en.json`, `tr.json` (after the `"GoHome"` line)
- Modify: `apps/web/src/app/[lang]/(main)/unauthorized/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `guardDecision`, `PolicyRequirement` (Task 1); `buildPermissionLabels`, `PermissionGroup` (Task 2); `getApplicationConfiguration` from `@repo/utils/app-config/fetch`; `getTranslations` from `@/src/language-data/get-translations`; `ErrorComponent` from `@repo/ui/components/error-component`.
- Produces:
  - `guardPage({ requires, lang }: { requires: PolicyRequirement; lang: string }): Promise<JSX.Element | null>` — `import { guardPage } from "@/src/components/permission-guard/guard"`.
  - `guardRoute(requires: PolicyRequirement): Promise<Response | null>` — `import { guardRoute } from "@/src/components/permission-guard/guard-route"`; 403 body `{ error: "Forbidden", missingPolicies }`, 401 when the configuration failed.
  - `NoPermission({ missing: { key: string; label?: string }[]; lang: string; languageData })` — root `<section role="alert" data-testid="no-permission">`.
  - Keys `Default["NoPermission.Title"]`, `Default["NoPermission.Description"]`, `Default["Unauthorized.Description"]`.

- [ ] **Step 1: Add the i18n keys**

In `apps/web/src/language-data/core/Default/resources/en.json`, directly after `"GoHome": "Go Home",` add:

```json
  "NoPermission.Title": "You don't have permission to view this page",
  "NoPermission.Description": "Ask an administrator to grant you the permissions below.",
  "Unauthorized.Description": "You are not authorized to view this page. If you think this is a mistake, contact your administrator.",
```

In `tr.json`, directly after `"GoHome": "Ana sayfaya dön",` add:

```json
  "NoPermission.Title": "Bu sayfayı görüntüleme yetkiniz yok",
  "NoPermission.Description": "Aşağıdaki yetkileri bir yöneticiden talep edin.",
  "Unauthorized.Description": "Bu sayfayı görüntüleme yetkiniz yok. Bunun bir hata olduğunu düşünüyorsanız yöneticinizle iletişime geçin.",
```

- [ ] **Step 2: Regenerate the bundle**

```bash
cd /c/unirefund/web-app
pnpm --filter web run init
git status --short    # expect only the two resources files; i18n/*.gen.json is gitignored
git -C packages/utils status --short   # policies.json may show as modified — leave it, never stage it
```

- [ ] **Step 3: Write the denial screen**

Create `apps/web/src/components/permission-guard/no-permission.tsx`:

```tsx
import { buttonVariants } from "@repo/ayasofyazilim-ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ayasofyazilim-ui/components/empty";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { Home, LockKeyhole } from "lucide-react";
import Link from "next/link";

export function NoPermission({
  missing,
  lang,
  languageData,
}: {
  missing: { key: string; label?: string }[];
  lang: string;
  languageData: {
    "NoPermission.Title": string;
    "NoPermission.Description": string;
    GoHome: string;
  };
}) {
  return (
    <section
      role="alert"
      data-testid="no-permission"
      className="flex h-full min-h-96 w-full items-center justify-center px-4 py-12"
    >
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockKeyhole />
          </EmptyMedia>
          <EmptyTitle>{languageData["NoPermission.Title"]}</EmptyTitle>
          <EmptyDescription>
            {languageData["NoPermission.Description"]}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {missing.length > 0 && (
            <ul className="flex w-full flex-col gap-2 text-left">
              {missing.map(({ key, label }) => (
                <li key={key} className="rounded-md border px-3 py-2">
                  {label && <div className="text-sm font-medium">{label}</div>}
                  <code className="text-xs text-muted-foreground">{key}</code>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/${lang}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            data-testid="no-permission-go-home"
          >
            <Home />
            <span>{languageData.GoHome}</span>
          </Link>
        </EmptyContent>
      </Empty>
    </section>
  );
}
```

`button.tsx` and `empty.tsx` in `@repo/ayasofyazilim-ui` carry no `"use client"`, so this renders as a server component.

- [ ] **Step 4: Write the page guard**

Create `apps/web/src/components/permission-guard/guard.tsx`:

```tsx
import "server-only";
import { getTranslations } from "@/src/language-data/get-translations";
import {
  buildPermissionLabels,
  type PermissionGroup,
} from "@/src/utils/permission-labels";
import { guardDecision, type PolicyRequirement } from "@/src/utils/policies";
import ErrorComponent from "@repo/ui/components/error-component";
import { getApplicationConfiguration } from "@repo/utils/app-config/fetch";
import { NoPermission } from "./no-permission";

async function getPermissionLabels(
  lang: string
): Promise<Record<string, string>> {
  try {
    const response = await fetch(
      `${process.env.GATEWAY_URL}/api/administration-service/public-permissions/all`,
      {
        headers: { "Accept-Language": lang },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(3000),
      }
    );
    if (!response.ok) return {};
    const data = (await response.json()) as { groups?: PermissionGroup[] };
    return buildPermissionLabels(data.groups);
  } catch {
    return {};
  }
}

export async function guardPage({
  requires,
  lang,
}: {
  requires: PolicyRequirement;
  lang: string;
}) {
  const decision = guardDecision(requires, await getApplicationConfiguration());
  if (decision.kind === "allow") return null;
  const t = await getTranslations(lang);
  if (decision.kind === "error") {
    return <ErrorComponent languageData={t.Default} />;
  }
  const labels = await getPermissionLabels(lang);
  return (
    <NoPermission
      lang={lang}
      languageData={t.Default}
      missing={decision.missing.map((key) => ({ key, label: labels[key] }))}
    />
  );
}
```

- [ ] **Step 5: Write the route-handler guard**

Create `apps/web/src/components/permission-guard/guard-route.ts`:

```ts
import "server-only";
import { guardDecision, type PolicyRequirement } from "@/src/utils/policies";
import { getApplicationConfiguration } from "@repo/utils/app-config/fetch";

export async function guardRoute(
  requires: PolicyRequirement
): Promise<Response | null> {
  const decision = guardDecision(requires, await getApplicationConfiguration());
  if (decision.kind === "allow") return null;
  if (decision.kind === "error") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(
    { error: "Forbidden", missingPolicies: decision.missing },
    { status: 403 }
  );
}
```

- [ ] **Step 6: Localize `/unauthorized`**

Replace the whole of `apps/web/src/app/[lang]/(main)/unauthorized/page.tsx` with:

```tsx
import { NoPermission } from "@/src/components/permission-guard/no-permission";
import { getTranslations } from "@/src/language-data/get-translations";

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations(lang);
  return (
    <NoPermission
      missing={[]}
      lang={lang}
      languageData={{
        ...t.Default,
        "NoPermission.Description": t.Default["Unauthorized.Description"],
      }}
    />
  );
}
```

- [ ] **Step 7: Type-check and lint**

```bash
cd /c/unirefund/web-app
pnpm --filter web type-check; echo "exit $?"
cd apps/web && npx eslint src/components/permission-guard "src/app/[lang]/(main)/unauthorized/page.tsx"
```

Expected: type-check exit 0; eslint 0 errors. A `t.Default["NoPermission.Title"]` type error means Step 2's `init` did not run against a reachable `GATEWAY_URL`.

- [ ] **Step 8: Commit**

```bash
cd /c/unirefund/web-app
test "$(git branch --show-current)" = feat/permission-gates
GIT_LITERAL_PATHSPECS=1 git add -- \
  apps/web/src/components/permission-guard/no-permission.tsx \
  apps/web/src/components/permission-guard/guard.tsx \
  apps/web/src/components/permission-guard/guard-route.ts \
  apps/web/src/language-data/core/Default/resources/en.json \
  apps/web/src/language-data/core/Default/resources/tr.json \
  "apps/web/src/app/[lang]/(main)/unauthorized/page.tsx"
git commit -F - <<'EOF'
feat(web): render an in-place no-permission screen from guardPage

Lists only the permissions the signed-in user lacks, readable name over the
raw key, and shows the retry error when the configuration could not load.
guardRoute gives route handlers the same check as a 403 body. The
/unauthorized fallback is localized.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Reference conversions — airport detail and devices list

These two routes are the worked examples every sweep task copies. Keep them exact.

**Files:**
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/layout.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/details/page.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/details/_components/info-form.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/_components/delete-airport.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/devices/page.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/(unirefund)/devices/_components/table.tsx`

**Interfaces:**
- Consumes: `guardPage` (Task 5); `isActionGranted` from `@repo/utils/policies`; `useApplicationConfiguration` from `@repo/utils/app-config`.

- [ ] **Step 1: Guard the airport layout's own read**

In `parties/airports/[airportId]/layout.tsx`, add the import beside the others:

```tsx
import { guardPage } from "@/src/components/permission-guard/guard";
```

and directly after `const { airportId, lang } = await params;` add:

```tsx
  const denied = await guardPage({
    requires: ["CRMService.Airports", "CRMService.Airports.View"],
    lang,
  });
  if (denied) return denied;
```

- [ ] **Step 2: Guard the details page**

In `parties/airports/[airportId]/details/page.tsx`, add the same import and, directly after `const { airportId, lang } = await params;`, the same five lines (`requires: ["CRMService.Airports", "CRMService.Airports.View"]`).

- [ ] **Step 3: Gate the edit form on the pair**

In `details/_components/info-form.tsx` replace

```tsx
  const hasEditGrant = isActionGranted(
    ["CRMService.Airports.Edit"],
    grantedPolicies
  );
```

with

```tsx
  const hasEditGrant = isActionGranted(
    ["CRMService.Airports", "CRMService.Airports.Edit"],
    grantedPolicies
  );
```

The file already sets `readonly={!hasEditGrant}` and `"ui:submitButtonOptions": { norender: !hasEditGrant, … }` — that is pattern P5, unchanged.

- [ ] **Step 4: Hide delete without its grant**

In `_components/delete-airport.tsx` add imports:

```tsx
import { useApplicationConfiguration } from "@repo/utils/app-config";
import { isActionGranted } from "@repo/utils/policies";
```

and directly after `const { airportId, lang } = useParams<{ airportId: string; lang: string }>();` add:

```tsx
  const { policies: grantedPolicies } = useApplicationConfiguration();
  if (
    !isActionGranted(
      ["CRMService.Airports", "CRMService.Airports.Delete"],
      grantedPolicies
    )
  ) {
    return null;
  }
```

- [ ] **Step 5: Guard the devices list and gate its controls**

In `devices/page.tsx` add `import { guardPage } from "@/src/components/permission-guard/guard";` and directly after `const { lang } = await params;`:

```tsx
  const denied = await guardPage({
    requires: ["DeviceService.Devices", "DeviceService.Devices.ViewList"],
    lang,
  });
  if (denied) return denied;
```

In `devices/_components/table.tsx`:
- the `ip` renderer's `isActionGranted(["DeviceService.Devices.Detail"], grantedPolicies)` becomes `isActionGranted(["DeviceService.Devices", "DeviceService.Devices.Detail"], grantedPolicies)` — the pair `devices/[deviceId]` reads with (P4);
- the `new-device` table action gains, right after `id: "new-device",`:

```tsx
            hidden: !isActionGranted(
              ["DeviceService.Devices", "DeviceService.Devices.Create"],
              grantedPolicies
            ),
```

- [ ] **Step 6: The audit is clean for these files**

```bash
cd /c/unirefund/web-app
node scripts/policy-audit.mjs \
  --path "src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/" \
  --path "src/app/[lang]/(main)/(unirefund)/devices/page.tsx" \
  --path "src/app/[lang]/(main)/(unirefund)/devices/_components/"
```

Expected: `policy-audit: 0 violation(s)`, exit 0.

- [ ] **Step 7: See it in the browser for different grant sets**

1. Save the grant-fetch script below as `$SCRATCH/harness/grants.mjs` and run it from that directory (`node grants.mjs`). It writes `grants-<user>.json` per test account (dev, tenant Faroe Islands). Expected output — five lines like `siggi.merchant: 188 granted policies`.

```js
// node grants.mjs  -> grants-<user>.json per test account (granted policy map)
import fs from "node:fs";

const GATEWAY = process.env.GATEWAY_URL ?? "https://dev-api.unirefund.com";
const TENANT = "Faroe Islands";
const PASSWORD = "1q2w3E*";
export const ACCOUNTS = ["siggi.merchant", "siggi.refund", "siggi.customs", "siggi.super", "admin"];
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36" };

const json = async (res) => {
  if (!res.ok) throw new Error(`${res.url} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const disco = await json(await fetch(`${GATEWAY}/.well-known/openid-configuration`, { headers: UA }));
const tenant = await json(
  await fetch(`${GATEWAY}/api/abp/multi-tenancy/tenants/by-name/${encodeURIComponent(TENANT)}`, { headers: UA })
);
if (!tenant.success) throw new Error(`tenant "${TENANT}" not found`);

for (const username of ACCOUNTS) {
  const token = await json(
    await fetch(disco.token_endpoint, {
      method: "POST",
      headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded", __tenant: tenant.tenantId },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "Angular",
        username,
        password: PASSWORD,
        scope: disco.scopes_supported.join(" "),
      }),
    })
  );
  const config = await json(
    await fetch(`${GATEWAY}/api/abp/application-configuration?includeLocalizationResources=false`, {
      headers: { ...UA, Authorization: `Bearer ${token.access_token}`, __tenant: tenant.tenantId },
    })
  );
  const granted = config.auth?.grantedPolicies ?? {};
  fs.writeFileSync(`grants-${username}.json`, JSON.stringify(granted, null, 1));
  console.log(`${username}: ${Object.keys(granted).length} granted policies`);
}
```

2. See who holds what for airports:

```bash
cd "$SCRATCH/harness"
for f in grants-*.json; do printf '%-26s' "$f"; node -e 'const g=require("./'"$f"'");console.log(["CRMService.Airports","CRMService.Airports.View","CRMService.Airports.Edit","CRMService.Airports.Delete"].map(p=>(g[p]?"Y":"-")+p.split(".").pop()).join(" "))'; done
```

3. If nothing listens on port 3000, start `pnpm --filter web dev` in the background from `/c/unirefund/web-app` and wait until `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/en/login` answers 200.
4. With Playwright MCP, sign in as `admin` (tenant Faroe Islands, password `1q2w3E*`), open `/en/parties/airports`, copy one airport id, and open `/en/parties/airports/<id>/details`: editable form, submit button and delete shown.
5. Sign in as an account with View but not Edit per step 2 (if none has that exact set, use any account lacking Edit): same URL renders read-only with no submit and no delete.
6. Sign in as an account lacking `CRMService.Airports.View`: same pasted URL renders the denial screen listing only the missing keys, each with "Airports › View"-style names. Open the `/tr/` variant: title/description/button in Turkish, names in English (expected, see Task 2).
A slow or failing `public-permissions/all` is not simulated here — breaking `GATEWAY_URL` would break the whole app. The 3 s timeout and the raw-key fallback are covered by code review and the `buildPermissionLabels(null)` test; say so in the report.

Take a screenshot per state into `$SCRATCH` and name them in the report. Stop the dev server only if you started it.

- [ ] **Step 8: Type-check, lint, commit**

```bash
cd /c/unirefund/web-app
pnpm --filter web type-check; echo "exit $?"
cd apps/web && npx eslint \
  "src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/layout.tsx" \
  "src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/details/page.tsx" \
  "src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/details/_components/info-form.tsx" \
  "src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/_components/delete-airport.tsx" \
  "src/app/[lang]/(main)/(unirefund)/devices/page.tsx" \
  "src/app/[lang]/(main)/(unirefund)/devices/_components/table.tsx"
cd /c/unirefund/web-app
test "$(git branch --show-current)" = feat/permission-gates
GIT_LITERAL_PATHSPECS=1 git add -- \
  "apps/web/src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/layout.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/details/page.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/details/_components/info-form.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/parties/airports/[airportId]/_components/delete-airport.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/devices/page.tsx" \
  "apps/web/src/app/[lang]/(main)/(unirefund)/devices/_components/table.tsx"
git commit -F - <<'EOF'
feat(web): gate the airport detail and devices list on their full pairs

Reference shapes for the sweep: page and layout guards, a read-only form
without the edit pair, delete and create hidden without theirs.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Sweep playbook

Tasks 7–18 apply these patterns to every file the audit reports in their area. Read all of it before starting any of them; each pattern is written out here once so the tasks stay short. Task 6's files are the worked examples.

**Deciding the set.** The audit's R1 line for a file is the source of truth: `R1 putFooApi needs [Svc.Foo, Svc.Foo.Edit]`. Gate on exactly that list — both names. If a list contains a name `tsc` rejects (not in `policies.json`), stop and report it; never substitute a similar-looking name.

**P1 — page guard.** Every `page.tsx` under `(main)` calls `guardPage` first, before any fetch:

```tsx
import { guardPage } from "@/src/components/permission-guard/guard";
// …
  const { lang } = await params;
  const denied = await guardPage({
    requires: ["CRMService.Merchants", "CRMService.Merchants.View"],
    lang,
  });
  if (denied) return denied;
```

`requires` is the union of the sets of every action in the page's **required** requests (the `Promise.all` in `getApiRequests`, or the first fetch). Replace an existing `await isUnauthorized({ requiredPolicies, lang })` with this, delete its import, and correct its list to the audit's pair. A page that fetches nothing and renders a client workspace takes the union of the sets that workspace needs to show anything at all. A page serving two independently grantable areas (tabs, role-specific halves) uses an any-of so a user holding either gets in:

```tsx
  const denied = await guardPage({
    requires: {
      anyOf: [
        ["TagService.Tags", "TagService.Tags.View"],
        ["TagService.Tags", "TagService.Tags.ViewSummary"],
      ],
    },
    lang,
  });
```

An `isUnauthorized({ …, redirect: false })` used as a boolean becomes `isRequirementMet(pair, (await getApplicationConfiguration()).policies)`.

**P2 — optional read.** A read that only one section needs is skipped without its grant, and the section renders only when the result arrived:

```tsx
import { getApplicationConfiguration } from "@repo/utils/app-config/fetch";
import { isRequirementMet } from "@/src/utils/policies";
// …
  const { policies } = await getApplicationConfiguration();
  const optionalRequests = await Promise.allSettled([
    isRequirementMet(["CRMService.Merchants", "CRMService.Merchants.ViewAffiliations"], policies)
      ? getMerchantAffiliationsApi(merchantId, session)
      : Promise.reject(new Error("not granted")),
  ]);
```

`getApplicationConfiguration` is React-`cache`d per request, so calling it again costs nothing. Code that runs on every page — `(main)/layout.tsx`, providers, the sidebar — uses P2, never P1.

**P3 — client control.** A button, dialog trigger, menu item or row/table action that calls an action renders only with that action's set:

```tsx
import { useApplicationConfiguration } from "@repo/utils/app-config";
import { isActionGranted } from "@repo/utils/policies";
// …
  const { policies: grantedPolicies } = useApplicationConfiguration();
  const canDelete = isActionGranted(["CRMService.Airports", "CRMService.Airports.Delete"], grantedPolicies);
```

then `{canDelete && <Button …/>}`, an early `return null` after all hooks (Task 6 Step 4), or on a grid action `hidden: !isActionGranted([...], grantedPolicies)` (Task 6 Step 5). Never `disabled` in place of hidden. A client fetch on mount (search, lookups) is not called without its set; show nothing for that piece.

**P4 — links into another page.** `RowLink`'s `linkCondition` and any plain `<Link>` to a detail page use the **target page's** `guardPage` set, so the link becomes text exactly when the target would deny. Grep the area for `linkCondition` and fix every leaf-only one.

**P5 — edit form without the edit set.** Keep the form, make it read-only, drop the submit:

```tsx
  const canEdit = isActionGranted(["CRMService.Airports", "CRMService.Airports.Edit"], grantedPolicies);
  // uiSchema extend:
  "ui:submitButtonOptions": { norender: !canEdit, submitText: … },
  // <SchemaForm … readonly={!canEdit} />
```

A form inside a create/edit dialog needs no P5: its trigger is hidden by P3.

**P6 — `new/` pages** guard on the Create set (P1 with the create action's pair).

**P7 — shared component, several routes.** When a component under `_components/` or `src/components/` is imported by routes that gate differently, gate inside the component (P3) rather than asking every importer. When the set depends on a runtime value (party type, tag status), put the table **and the `isActionGranted` call that reads it** in a plain `.ts` module — the shape `src/utils/tag-actions.ts` already uses — so the audit can read the literals:

```ts
// parties/_components/party-grants.ts
import { isActionGranted, type Policy } from "@repo/utils/policies";
import type { GrantedPolicies } from "@/src/utils/policies";

const UPSERT_ADDRESS = {
  merchants: ["CRMService.Merchants", "CRMService.Merchants.UpSertAddress"],
  // one row per party type, copied from the audit's needs [...] lines
} as const satisfies Record<string, readonly Policy[]>;

export function canUpsertAddress(
  partyType: keyof typeof UPSERT_ADDRESS,
  granted: GrantedPolicies
) {
  return isActionGranted([...UPSERT_ADDRESS[partyType]], granted);
}
```

The audit reads a same-file constant passed to a gate call. From a `.ts` module it credits the importing component only with the gate literals behind the symbols it imports by name (the helper's own gate calls and the constants they reference); a namespace or default import credits the whole module (changed in Task 19 — importing an unrelated symbol used to credit everything). A bare exported table with no gate call in its module earns no credit, even when the importer gates on it — import the helper, not the table.

**P8 — stale permission badges.** Once a page guards itself, delete `missingPolicies={[…]}` from its `ErrorComponent`s — an error after the guard is not a permission error.

**P9 — layout reads.** A `layout.tsx` that fetches guards that fetch with P1 (Task 6 Step 1). Its child pages still guard themselves.

**P10 — route handlers** call `guardRoute(pair)` first and return its response when non-null:

```ts
import { guardRoute } from "@/src/components/permission-guard/guard-route";
// …
  const denied = await guardRoute(["FileService.File", "FileService.File.GetPresignedUrl"]);
  if (denied) return denied;
```

**P11 — allowlist.** Only for what no pattern fits (a page any signed-in user may open that still reaches R2, a gate the parser cannot read). Add `{ "rule", "file", "action"?, "reason" }` to `scripts/policy-audit.allow.json` with a reason a reviewer can check. A stale entry fails the audit, so remove entries you make obsolete.

**Per-task loop.**

1. `node scripts/policy-audit.mjs --path <prefix> [--path …] > "$SCRATCH/<task>-before.txt"`; note the count.
2. Fix route files first (P1, P6, P9), then their `_components` (P3–P5, P7), then P4 and P8 greps over the whole area.
3. Re-run the audit for the area until it prints `0 violation(s)`.
4. `pnpm --filter web type-check` exits 0; `npx eslint <each edited file>` from `apps/web` has 0 errors; `pnpm --filter web test:unit` still passes.
5. Stage only your files and commit:

```bash
cd /c/unirefund/web-app
test "$(git branch --show-current)" = feat/permission-gates
GIT_LITERAL_PATHSPECS=1 git status --porcelain -- <each prefix, as apps/web/…> scripts/policy-audit.allow.json | cut -c4- > "$SCRATCH/stage.txt"
cat "$SCRATCH/stage.txt"    # every line must be a file you edited in this task — delete any other line
GIT_LITERAL_PATHSPECS=1 git add --pathspec-from-file="$SCRATCH/stage.txt"
git diff --cached --stat
git commit -F - <<'EOF'
feat(web): gate <area> on the full Requires permissions pairs

Audit for this area: <before> -> 0.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

A large area may commit per sub-folder; each commit must leave type-check green.

---

### Task 7: Sweep — shared code

**Files:** every file the audit reports under these prefixes (apps/web-relative):
- `src/components/`, `src/providers/`, `src/utils/`
- `src/app/[lang]/(main)/layout.tsx`
- `src/app/[lang]/(external)/`
- `src/app/api/`

**Interfaces:** consumes the playbook and Tasks 1–5. Produces self-gating shared components that later tasks rely on (their importers need no gate for them).

Prototype baseline (2026-09-30): 16 R1, no R2 in these prefixes. Known items and the pattern each takes:

| File | Action(s) | Pattern |
| --- | --- | --- |
| `(main)/layout.tsx` | `getUserAffiliationsApi` | P2 — runs on every page; skip the call without the pair and render the shell without affiliations |
| `components/sidebar-layout/nav/affiliation-switcher.tsx` | `getUserAffiliationsApi`, `postUserAffiliationApi` | P3 — no switcher without View; no switch action without SetPrimary |
| `providers/device.tsx` | `getDevicesApi`, `patchDeviceByIdApi`, `postDeviceApi` | P2/P3 — the provider wraps every page; skip each call without its pair, never throw or block rendering |
| `utils/require-host.ts` | `getInfoForCurrentTenantApi` | read how its callers use it first; skip the call without `UniRefund.Settings` + `.GetInfo` and treat "unknown" the way the function already treats a failed call |
| `components/search-traveller.tsx` | three `getTravellersBy…Api` | P3 — offer only the search modes whose pair is held; with none, render nothing |
| `components/scan-traveller-camera.tsx` | `postApiKycServiceIdVerificationsVerifyByPhoto` | P3 |
| `components/payout-token-selector.tsx` | `getTravellerCardsByTravellerIdApi` | P3 |
| `app/api/file/[fileId]/route.ts` | `getFilePresignedUrlApi` | P10 |
| `(external)/qr/**` | `getDevicesApi`, `postDeviceApi`, `postCustomsValidationQrGenerateApi` | first find out whether these routes run signed in (check `apps/web/.env` `PUBLIC_ROUTES` and the middleware); if signed in, P3; if anonymous kiosk, P11 with that evidence as the reason |

- [ ] **Step 1:** Run the per-task loop's step 1 for the prefixes above.
- [ ] **Step 2:** Apply the table, then any file the audit reports that the table does not list.
- [ ] **Step 3:** Loop steps 3–5. Commit message area: `shared components, providers and route handlers`.
- [ ] **Step 4:** Browser check (dev as in Task 6 Step 7): sign in as the account with the fewest grants and open three pages — the shell, sidebar and affiliation switcher render without errors.

### Task 8: Sweep — parties shared components and merchants

**Files:** audit prefixes `src/app/[lang]/(main)/(unirefund)/parties/_components/`, `src/app/[lang]/(main)/(unirefund)/parties/merchants/`. Prototype baseline: 47 + 68 violations.

`parties/_components` is imported by every party type. Gate there with P7: the existing `getPermissionKeyByPartyType(...)`-style helpers return a single leaf computed at runtime, which is both leaf-only and unreadable to the audit — replace each with a `.ts` rules module of full pairs per party type, filled from the audit's `needs [...]` lines for every party route. Do this first; Tasks 9–11 depend on it.

- [ ] **Step 1:** Loop step 1 for both prefixes.
- [ ] **Step 2:** `parties/_components` first (P7), then merchants (P1–P6, P8, P9).
- [ ] **Step 3:** Loop steps 3–5; commit `_components` and `merchants` as two commits.

### Task 9: Sweep — refund points, tax free, tax offices

**Files:** prefixes `…/(unirefund)/parties/refund-points/`, `…/parties/tax-free/`, `…/parties/tax-offices/` (full form `src/app/[lang]/(main)/(unirefund)/parties/<name>/`). Baseline: 40 + 23 + 21.

`refund-points/[partyId]/contracts/[contractId]/layout.tsx` already calls `isUnauthorized` — convert to P9 and make every page under it guard itself (P1).

- [ ] **Step 1:** Loop step 1.
- [ ] **Step 2:** Apply the playbook.
- [ ] **Step 3:** Loop steps 3–5.

### Task 10: Sweep — customs, individuals, travellers, tour guides

**Files:** prefixes `…/parties/customs/`, `…/parties/individuals/`, `…/parties/travellers/`, `…/parties/tour-guides/`. Baseline: 21 + 15 + 22 + 30.

`parties/customs/[partyId]/*` and `individuals` pages have no guard today. The traveller contact forms (`travellers/[travellerId]/_components/contact/*-form.tsx`) call `put…ByTravellerIdApi` with no gate: P5 on the form with `TravellerService.Travellers` + the `UpSert…` leaf the audit names.

- [ ] **Step 1:** Loop step 1.
- [ ] **Step 2:** Apply the playbook.
- [ ] **Step 3:** Loop steps 3–5.

### Task 11: Sweep — airports, exit points, franchise HQs

**Files:** prefixes `…/parties/airports/` (Task 6 already did `[airportId]/`), `…/parties/exit-points/`, `…/parties/franchise-hqs/`, plus any file directly under `…/parties/` the audit still reports. Baseline: 10 (before Task 6) + 30 + 24.

`franchise-hqs/[partyId]/layout.tsx` calls `isUnauthorized` — P9, and every page under it P1. `exit-points/[exitPointId]/posts/@modal/(.)details/[postId]/page.tsx` is an intercepting page: it needs P1 too.

- [ ] **Step 1:** Loop step 1.
- [ ] **Step 2:** Apply the playbook.
- [ ] **Step 3:** Loop steps 3–5.

### Task 12: Sweep — tags, refunds, export validations

**Files:** prefixes `…/(unirefund)/operations/tax-free-tags/`, `…/operations/tags/`, `…/operations/refunds/`, `…/operations/refund/`, `…/operations/export-validations/`. Baseline: 30 + 7 + 16 + 11 + 9.

Beyond the audit — permissions the backend applies without failing the call (spec, "Known blind spots"):
- `tax-free-tags/_components/customs/customs-filter.tsx` `canViewTagRisks` and `tax-free-tags/[tagId]/page.tsx:219` read `TagService.TagRisks.View`, which is typed but granted to nobody. Risk **filters and risk sorting** gate on `["TagService.TagRisks", "TagService.TagRisks.FilterByRisk"]`; a tag's own risk level display on `["TagService.TagRisks.ViewRiskLevel"]` (single, display-only). Without FilterByRisk the API silently drops the filter, so an ungated filter looks like it worked.
- `TagService.TagsNameSpace.ViewEarnings` / `.ViewTotals` stay single-policy display gates — do not "fix" them into pairs.
- `tax-free-tags/page.tsx` shows role-specific layouts from one route and today passes `missingPolicies` badges (P8). Its guard is an any-of over the sets its variants need (P1).
- `operations/refund/@admin/page.tsx` and `@refundPoint/page.tsx` are slots picked by `session.user.role` in `refund/layout.tsx`; keep the layout's role pick, and give **each** slot page its own P1.

- [ ] **Step 1:** Loop step 1.
- [ ] **Step 2:** Apply the playbook and the list above.
- [ ] **Step 3:** Loop steps 3–5.

### Task 13: Sweep — remaining operations

**Files:** prefix `src/app/[lang]/(main)/(unirefund)/operations/` minus the Task 12 folders — i.e. `events/`, `rule-engine/`, `scan-sticker/`, `stickers/`, `manual-verifications/`, `anomaly-detection/`, `address-geocoding/`, `document-capture/`. Baseline: about 53.

`operations/rule-engine/page.tsx` is allowlisted as redirect-only (Task 4); its sub-pages are not.

- [ ] **Step 1:** Loop step 1 — pass one `--path` per folder.
- [ ] **Step 2:** Apply the playbook.
- [ ] **Step 3:** Loop steps 3–5.

### Task 14: Sweep — finance

**Files:** prefix `src/app/[lang]/(main)/(unirefund)/finance/`. Baseline: about 71.

The siggi.* test accounts hold **no** `FinanceService` policies on dev; verify finance screens as `admin` (Faroe Islands). Several finance pages have no guard today (`cross-tenant-payouts`, `frontline-incentive`, `marketing-incentive`, `payout-batches`, `tour-guide-fee`). `payout-batches/[batchId]/_components/batch-actions.tsx` already uses a `Policy[]` table — check each row is the full pair.

- [ ] **Step 1:** Loop step 1.
- [ ] **Step 2:** Apply the playbook.
- [ ] **Step 3:** Loop steps 3–5.

### Task 15: Sweep — settings

**Files:** prefix `src/app/[lang]/(main)/(unirefund)/settings/`. Baseline: about 69.

The `settings/templates/*` rebate and refund editors are `useForm` + zod, not `SchemaForm`: P5 there means disabling every input and hiding the save button without the edit set, using the form's existing `disabled` plumbing. `settings/templates/page.tsx` is allowlisted as redirect-only.

- [ ] **Step 1:** Loop step 1.
- [ ] **Step 2:** Apply the playbook.
- [ ] **Step 3:** Loop steps 3–5.

### Task 16: Sweep — file, devices, reports, home, management

**Files:** prefixes `…/(unirefund)/file/`, `…/(unirefund)/devices/` (Task 6 did the list page and table), `…/(unirefund)/reports/`, `…/(unirefund)/home/`, `…/(unirefund)/management/`. Baseline: about 90.

`home/dashboard`, `home/analytics`, `home/realtime` are landing pages: each widget is an optional section (P2), and the page's own guard is only what every widget shares — often nothing, in which case P11 with the reason "landing page; each widget gates itself".

- [ ] **Step 1:** Loop step 1.
- [ ] **Step 2:** Apply the playbook.
- [ ] **Step 3:** Loop steps 3–5.

### Task 17: Sweep — account and identity

**Files:** prefixes `src/app/[lang]/(main)/(core)/account/`, `src/app/[lang]/(main)/(core)/management/identity/`. Baseline: 5 + part of 138.

`account/*` pages are self-service: `AccountService` endpoints carry no permission line, so R1 is silent there and only R2 fires. Give each P11 with the reason "self-service account page, any signed-in user" unless the page calls an action that does carry a set, in which case P1. Identity (`roles`, `users`, `claim-types`, …) pages use `isUnauthorized` with single names today — convert each to P1 with the audit's pair.

- [ ] **Step 1:** Loop step 1.
- [ ] **Step 2:** Apply the playbook.
- [ ] **Step 3:** Loop steps 3–5.

### Task 18: Sweep — rest of core, and the sidebar (R3)

**Files:** prefix `src/app/[lang]/(main)/(core)/` minus Task 17's folders (`management/_components`, `language-management`, `logs`, `openiddict`, `saas`, `text-templates`); then `src/components/sidebar-layout/data.ts`.

`management/logs/audit/@modal/(.)details/[id]/page.tsx` and `logs/audit/details/[id]/page.tsx` both need P1.

R3 runs only once pages have guards, so do `data.ts` last. For each R3 line, set the item's `policies` so that **its own plus every ancestor item's** equals the page's `guardPage` set. A parent item gated on something unrelated to its children (e.g. `management/identity` on `UniRefund.Settings` above `AbpIdentity.*` children) hides pages from users who may open them — move that policy down to the children that actually need it, or drop it. For an any-of page, the item's effective set must sit inside every alternative (usually just the group).

- [ ] **Step 1:** Loop step 1 for the core prefixes; apply the playbook; loop steps 3–4.
- [ ] **Step 2:** `node scripts/policy-audit.mjs | grep " R3 "` — fix each in `data.ts`; re-run until no R3 remains.
- [ ] **Step 3:** `node --import tsx --test src/components/sidebar-layout/map-nav-item.test.ts` from `apps/web` still passes.
- [ ] **Step 4:** Loop step 5 (include `apps/web/src/components/sidebar-layout/data.ts`).

---

### Task 19: Lock it in

**Files:**
- Modify: `scripts/lib/policy-audit-core.mjs` (`GATE_FUNCTIONS`)
- Modify: `scripts/lib/policy-audit-core.test.mjs`
- Modify: `.github/workflows/lint-pull-requests.yml`

- [ ] **Step 1: No `apps/web` file uses `isUnauthorized` any more**

Run: `cd /c/unirefund/web-app && grep -rln "isUnauthorized" apps/web/src`
Expected: no output. Any hit is a missed page — convert it (P1) before continuing.

- [ ] **Step 2: Write the failing test**

Append to `scripts/lib/policy-audit-core.test.mjs`:

```js
describe("retired gates", () => {
  it("no longer counts isUnauthorized as a gate", () => {
    const result = run({
      [PAGE]: `import { getAirportByIdApi } from "${ACTION_IMPORT}";
        export default async function Page() {
          await guardPage({ requires: [], lang });
          await isUnauthorized({ requiredPolicies: ["CRMService.Airports", "CRMService.Airports.View"], lang });
        }`,
    });
    assert.deepEqual(r1(result).map((v) => v.action), ["getAirportByIdApi"]);
  });
});
```

Run: `node --test scripts/lib/policy-audit-core.test.mjs` — Expected: FAIL on `retired gates`.

- [ ] **Step 3: Retire it**

In `scripts/lib/policy-audit-core.mjs` delete the line `  "isUnauthorized",` from `GATE_FUNCTIONS`.

Run: `node --test scripts/lib/policy-audit-core.test.mjs` — Expected: PASS, 30 tests.

- [ ] **Step 4: The whole app is clean**

Run: `cd /c/unirefund/web-app && pnpm policy:audit; echo "exit $?"`
Expected: `policy-audit: 0 violation(s) - R1 0, R2 0, R3 0, R0 0`, exit 0. Then review `scripts/policy-audit.allow.json` end to end: every reason must be checkable by a reader.

- [ ] **Step 5: Add the CI step**

In `.github/workflows/lint-pull-requests.yml`, job `lint_and_test`, directly after the step

```yaml
      - name: Lint
        run: pnpm lint
```

add

```yaml
      - name: Permission gate audit
        run: |
          node --test scripts/lib/policy-audit-core.test.mjs
          pnpm policy:audit
```

- [ ] **Step 6: Commit**

```bash
cd /c/unirefund/web-app
test "$(git branch --show-current)" = feat/permission-gates
GIT_LITERAL_PATHSPECS=1 git add -- scripts/lib/policy-audit-core.mjs scripts/lib/policy-audit-core.test.mjs .github/workflows/lint-pull-requests.yml
git commit -F - <<'EOF'
ci: fail pull requests that add an ungated endpoint call

isUnauthorized no longer counts as a gate now that every page uses guardPage.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 20: uat permission names

The sweep wrote hundreds of permission literals, type-checked against **dev**'s `policies.json`. dev still defines names uat dropped, so check against uat once, now, instead of one name per failed uat build.

- [ ] **Step 1: Type-check against uat's names**

```bash
cd /c/unirefund/web-app
GATEWAY_URL=https://uat-api.unirefund.com SUPPORTED_LOCALES=en,tr pnpm --filter web run init
npx tsc --noEmit -p apps/web 2>&1 | tee "$SCRATCH/uat-tsc.txt" | tail -5
```

- [ ] **Step 2: Restore dev's**

```bash
cd /c/unirefund/web-app
pnpm --filter web run init
git -C packages/utils status --short   # policies.json may differ from HEAD — never stage it
git status --short                     # nothing but files you meant to change
```

- [ ] **Step 3: Report**

If `uat-tsc.txt` lists `TS2322`/`TS2345` errors on permission literals, list each name and file for the user. Do **not** change them: a name dev has and uat lacks is a backend deployment gap, and the user decides whether to wait for uat or special-case it. Two `TS2307 '@/public/unirefund.png'` lines are local noise, not findings.

### Task 21: Grant matrix and spot checks

Verification only; nothing here is committed.

- [ ] **Step 1: Inputs**

```bash
mkdir -p "$SCRATCH/harness"
cd /c/unirefund/web-app && node scripts/policy-audit.mjs --json > "$SCRATCH/harness/audit.json"
cd "$SCRATCH/harness" && node grants.mjs    # the Task 6 script; re-run so grants are today's
```

- [ ] **Step 2: Write the visit harness**

Save as `$SCRATCH/harness/visit.mjs`:

```js
// node visit.mjs  (needs audit.json from `node scripts/policy-audit.mjs --json`, grants-*.json from grants.mjs,
// and apps/web dev on BASE_URL) -> matrix.json + a printed list of mismatches and error pages
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("C:/unirefund/web-app/apps/web/package.json");
const { chromium } = require("@playwright/test");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const LANG = process.env.LANG_PREFIX ?? "en";
const PASSWORD = "1q2w3E*";
const ACCOUNTS = ["siggi.merchant", "siggi.refund", "siggi.customs", "siggi.super", "admin"];

const audit = JSON.parse(fs.readFileSync("audit.json", "utf8"));
const met = (req, g) => (req.all ? req.all.every((p) => g[p]) : req.anyOf.some((alt) => alt.every((p) => g[p])));
const routes = Object.entries(audit.pages).filter(([route, info]) => !route.includes("[") && info.requires);

const rows = [];
for (const username of ACCOUNTS) {
  const grants = JSON.parse(fs.readFileSync(`grants-${username}.json`, "utf8"));
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();

  await page.goto(`${BASE}/${LANG}/login`);
  const tenantTrigger = page.getByTestId("tenant-select-trigger");
  if (await tenantTrigger.count()) {
    await tenantTrigger.click();
    await page.getByText("Faroe Islands", { exact: true }).click();
  }
  await page.getByTestId("userName-input").fill(username);
  await page.getByTestId("password-input").fill(PASSWORD);
  await page.getByTestId("submit-button").click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 });

  for (const [route, info] of routes) {
    const expected = met(info.requires, grants) ? "open" : "denied";
    await page.goto(`${BASE}/${LANG}/${route}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    const url = new URL(page.url()).pathname;
    let actual = "open";
    let message = "";
    if (url.endsWith("/unauthorized")) actual = "redirected";
    else if (url.endsWith("/login")) actual = "signed-out";
    else if (await page.getByTestId("no-permission").count()) actual = "denied";
    else if (await page.locator('section[role="alert"]').count()) {
      actual = "error";
      message = (await page.locator('section[role="alert"]').first().innerText()).slice(0, 200);
    }
    rows.push({ username, route, expected, actual, message });
    process.stdout.write(expected === actual ? "." : "x");
  }
  await browser.close();
  console.log(` ${username}`);
}

fs.writeFileSync("matrix.json", JSON.stringify(rows, null, 1));
const bad = rows.filter((r) => r.expected !== r.actual);
console.log(`\n${rows.length} visits, ${bad.length} not as expected`);
for (const r of bad) console.log(`${r.username.padEnd(15)} ${r.expected.padEnd(7)} -> ${r.actual.padEnd(10)} /${r.route} ${r.message}`);
```

- [ ] **Step 3: Run it**

Dev must be up on port 3000 (Task 6 Step 7). Run in the background — about 120 static routes × 5 accounts:

```bash
cd "$SCRATCH/harness" && node visit.mjs 2>&1 | tee visit.log
```

Expected: `N visits, 0 not as expected`. For each mismatch:
- `open -> denied` or `denied -> open`: the page's `guardPage` set disagrees with what the account holds — fix the guard, re-run that route.
- `open -> error`: read the message; a permission error is a missed optional read (P2), anything else (missing query params, empty tenant data) is recorded, not fixed here.
- `-> redirected`: a leftover `isUnauthorized` — Task 19 Step 1 should have caught it.
Commit fixes per the per-task loop, then re-run until clean.

- [ ] **Step 4: Spot checks against the spec's partial-grant table**

For one entity detail page per area (parties, operations, finance as admin, settings, core identity), with Playwright MCP, for the admin account and for one account holding View without Edit/Delete: screenshot editable vs read-only, delete and create shown vs hidden. Paste a denied URL for an account lacking View and confirm the list shows only that account's missing names. Check one any-of page as an account holding only one side.

- [ ] **Step 5: Report**

Write for the user: the matrix totals, every mismatch and its fix, the error pages left unfixed and why, the spot-check screenshots, the uat findings from Task 20, and — explicitly — the pages verified by the audit only (detail pages with no record in the Faroe Islands tenant, or a permission no test account reaches).
