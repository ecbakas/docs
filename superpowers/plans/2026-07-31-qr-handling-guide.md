# QR Handling Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `docs/qr/` — nine files documenting every QR-triggered action across `super-app`, `web-app/apps/web` and `web-app/apps/ssr`, with the API usage contract (who must call which endpoint) as the primary view.

**Architecture:** One registry (`actions-and-routes.md`) is the single source of fact; the other eight files are views onto it, joined by a permanent action id `A##`. Because every join is mechanical, a zero-dependency Node checker (`docs/qr/_verify/check.mjs`) enforces them, and it is written **first** so every content task has a failing test to satisfy.

**Tech Stack:** Markdown. Node 22 (`node --version` → `v22.19.0`) for the checker, zero dependencies, no `package.json`. The `docs/` directory is its own git repo on `main`.

**Spec:** `docs/superpowers/specs/2026-07-31-qr-handling-guide-design.md`. Read it before Task 1.

## Global Constraints

- **No application code changes.** This plan writes documentation only. Defects found go in the Findings table (Task 13), never fixed here.
- **Action ids are `A##`** — two digits, zero-padded, assigned in registry order, **permanent, never renumbered**.
- **Test flow ids are `TF-A##`**, matching their action id exactly.
- **Marker strings are exact.** The checker string-matches them:
  - registry `Endpoint` cell for an action that calls no endpoint: `— client only`
  - `endpoints.md` `Actions` cell for a contrast-only row: `— contrast`
  - a permission cell for an endpoint needing **no token at all**: `— anonymous`
  - a permission cell for an endpoint needing a **token but no grant**: `— authenticated, no grant`
  - an intentionally-not-applicable cell: `—`
  - All use U+2014 EM DASH, matching the rest of `docs/`.
- **A missing `**Requires permissions:**` line means "no permission required" — which is not the same as anonymous.** Decide which of the two markers applies by reading the method's own doc comment and its documented status codes. Ruled 2026-07-31 after Task 2 found the case: `POST /api/export-validation-service/qrEvidence/{qrValue}/scan` carries no annotation, yet its comment reads *"the traveller scans the kiosk's QR with their own authenticated device. The current user's TravellerDocumentId claim identifies whose tags to clear"* and it lists 401/403 — so it needs a login and `— anonymous` would be false. Its sibling `.../scanWithTravellerInfo` **is** annotated (`ExportValidationService.QrEvidence.ScanWithTravellerInfo`). `TagPublicService` is the genuinely anonymous case; one of its methods says so outright.
- **Every one of the nine files carries a `Verified against:` line** — the date plus the commit surveyed for each of the three apps. Get commits with `git -C <app> rev-parse --short HEAD`.
- **No placeholders.** The checker fails the build on `TBD`, `TODO`, `FIXME`, `fill in later`, `verify this later`.
- **In `endpoints.md`, only the main endpoint table may use `Endpoint` as its first header cell.** The overlapping-endpoint and anti-pattern tables must lead with a different column name, or the parser will absorb their rows.
- **Verification command:** `node docs/qr/_verify/check.mjs [check names…]`. No arguments runs every check.
- **Voice:** match `docs/QR.md` and `web-app/apps/web/src/app/[lang]/(main)/(unirefund)/operations/scan-sticker/README.md` — plain declarative prose, tables for anything enumerable, no marketing tone, no second-person instructions outside `test-flows.md`.
- **Never state intended behaviour as actual.** If the code does something the design did not intend, document what the code does and add a Findings row.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `docs/qr/_verify/check.mjs` | Structural checker. Enforces the joins the guide promises. Not part of the guide. |
| `docs/qr/README.md` | Foundations: QR types, wire format, where codes come from, how each app resolves a QR, login/session resolution, action-id index, Findings. |
| `docs/qr/actions-and-routes.md` | **The registry.** Route→action index, then one row per action. Every other file derives from this. |
| `docs/qr/endpoints.md` | The API usage contract. Endpoint-first, plus overlapping-endpoint decision tables and anti-patterns. |
| `docs/qr/permissions-by-role.md` | The registry regrouped by role. |
| `docs/qr/traveller.md` | Perspective chapter, `T1`/`T2`/`T3`. |
| `docs/qr/merchant.md` | Perspective chapter, `M1`/`M2`/`M3`. |
| `docs/qr/refund-point.md` | Perspective chapter, `R1`/`R2`/`R3`. |
| `docs/qr/customs.md` | Perspective chapter, `C1`/`C2`/`C3`. |
| `docs/qr/test-flows.md` | One `TF-A##` per action, plus test-data preamble and coverage table. |
| `docs/QR.md` | **Modified** — gains a link to the guide and a Customs column. Existing numbers untouched. |

---

## The derivation protocol

Every registry row is produced by walking one chain. Tasks 2–4 each apply it; it is
stated once here.

1. **Start at the route.** Find the UI control that begins the action.
2. **Follow to the client wrapper.** `super-app/src/actions/<Service>/actions.ts` (also `post.ts`), or `web-app/packages/actions/unirefund/<Service>/{actions,post-actions,put-actions,delete-actions,search}.ts`. Record it as `file:line`.
3. **Read the SDK method off the wrapper body.** It reads `client.<group>.<method>(data)`.
4. **Read the permission from the SDK.** In `web-app/packages/saas/<Service>/sdk.gen.ts` or `super-app/src/saas/<Service>/sdk.gen.ts`, find the method and read the `**Requires permissions:**` line in its doc comment.

**Worked example — a merchant issuing a tag from a sticker on web:**

| Field | Value | How it was found |
| --- | --- | --- |
| Route | `apps/web` · `[lang]/(main)/(unirefund)/operations/scan-sticker` | the page directory |
| UI entry | `client.tsx`, the `Issue tag` button | reading the page |
| Client wrapper | `postTagApi` — `web-app/packages/actions/unirefund/TagService/post-actions.ts:34` | `grep -n "export async function postTagApi"` |
| SDK method | `client.tag.postApiTagServiceTag` | the wrapper body, line 37 |
| Endpoint | `POST /api/tag-service/tag` | the `url:` in the SDK method |
| Permission | `TagService.Tags, TagService.Tags.Create` | the `**Requires permissions:**` line above `postApiTagServiceTag` |

**Two things to mine beyond the permission line.** The SDK doc comments carry
ownership and semantics the permission alone does not:

- `POST /tag/traveller-self-assign/by-tag-id` is documented **"Host use only."**, and *"No sales-amount proof is required because the Guid id is itself unguessable."* Its permission is `TagService.Tags.TravellerSelfAssignByTagId`.
- `POST /tag/traveller-self-assign` is the sibling, permission `TagService.Tags.TravellerSelfAssign`, and it *does* take sales-amount proof.

Two near-identical endpoints, two permissions, two credential models. That prose is
the source for `endpoints.md`'s `Intended caller` and `Must not call` columns. **Read
the whole doc comment, not just the permission line.**

**Absence of a `**Requires permissions:**` line means no *permission* is required — it
does not mean no *token* is required.** Never leave the cell blank, and pick between
the two markers by reading the doc comment and the documented status codes:
`— anonymous` for an endpoint that needs no token (`TagPublicService`, one of whose
methods says outright that the unguessable Guid id is the credential), and
`— authenticated, no grant` for one that needs a login but holds no permission gate
(the airport self-validation scan — see Global Constraints for the worked case).

**Cross-check both SDK copies.** `super-app/src/saas/` and `web-app/packages/saas/`
are separate generations — both currently carry 52 `TagService` annotations. Where an
endpoint's annotation differs between them, record both in the row and add a Findings
entry.

---

## Task 1: Scaffold and the checker

**Files:**
- Create: `docs/qr/_verify/check.mjs`
- Create: `docs/qr/README.md`, `docs/qr/actions-and-routes.md`, `docs/qr/endpoints.md`, `docs/qr/permissions-by-role.md`, `docs/qr/traveller.md`, `docs/qr/merchant.md`, `docs/qr/refund-point.md`, `docs/qr/customs.md`, `docs/qr/test-flows.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `check.mjs` with named checks `files`, `stamps`, `placeholders`, `registry`, `perspectives`, `endpoints`, `permissions`, `testflows`. Every later task runs a subset. The marker strings `— client only`, `— contrast`, `— anonymous` and the table header names below are the contract every later task writes against.

- [ ] **Step 1: Write the checker**

Create `docs/qr/_verify/check.mjs`:

```js
#!/usr/bin/env node
/**
 * Structural verification for docs/qr/.
 *
 * The guide makes mechanical promises about itself — every action id joined
 * across five files, every endpoint reachable, no permission cell blank. Those
 * are checked mechanically rather than by eye.
 *
 * Zero dependencies.
 *   node docs/qr/_verify/check.mjs            # every check
 *   node docs/qr/_verify/check.mjs registry   # named checks only
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const GUIDE = [
  "README.md",
  "traveller.md",
  "merchant.md",
  "refund-point.md",
  "customs.md",
  "actions-and-routes.md",
  "endpoints.md",
  "permissions-by-role.md",
  "test-flows.md",
];
const PERSPECTIVES = ["traveller.md", "merchant.md", "refund-point.md", "customs.md"];

const CLIENT_ONLY = "— client only";
const CONTRAST = "— contrast";
const ID_RE = /^A\d{2}$/;
const ID_ANYWHERE = /\bA\d{2}\b/g;

const failures = [];
const fail = (msg) => failures.push(msg);
const read = (f) => readFileSync(join(ROOT, f), "utf8");

/**
 * Header and body rows of every markdown table in `md` whose header's first cell
 * is `headFirstCell`. Several such tables merge into one result, so the registry
 * may be split per app and endpoints.md per service.
 */
function table(md, headFirstCell) {
  let head = null;
  const rows = [];
  let inside = false;
  for (const line of md.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      inside = false;
      continue;
    }
    const cells = trimmed.split("|").slice(1, -1).map((c) => c.trim());
    if (!inside) {
      if (cells[0] === headFirstCell) {
        inside = true;
        head = cells;
      }
      continue;
    }
    if (/^:?-{3,}:?$/.test(cells[0])) continue;
    rows.push(cells);
  }
  return { head, rows };
}

const checks = {};

checks.files = () => {
  for (const f of GUIDE) {
    if (!existsSync(join(ROOT, f))) fail(`missing file: ${f}`);
  }
};

checks.stamps = () => {
  for (const f of GUIDE) {
    if (!read(f).includes("Verified against:")) {
      fail(`${f}: no "Verified against:" line`);
    }
  }
};

checks.placeholders = () => {
  // "<sha>" and "<title>" catch a Task 1 stub whose template was never filled in.
  const banned = ["TBD", "TODO", "FIXME", "fill in later", "verify this later", "<sha>", "<title>"];
  for (const f of GUIDE) {
    read(f)
      .split(/\r?\n/)
      .forEach((line, i) => {
        for (const b of banned) {
          if (line.includes(b)) fail(`${f}:${i + 1}: placeholder "${b}"`);
        }
      });
  }
};

let registry = null;

function loadRegistry() {
  if (registry) return registry;
  const ids = new Set();
  const byId = new Map();
  const endpoints = new Set();
  registry = { ids, byId, endpoints };

  const { head, rows } = table(read("actions-and-routes.md"), "ID");
  if (!head) {
    fail("actions-and-routes.md: no table whose first header cell is `ID`");
    return registry;
  }
  for (const c of ["Actor", "Endpoint", "Permission"]) {
    if (!head.includes(c)) fail(`actions-and-routes.md: table has no \`${c}\` column`);
  }
  const iActor = head.indexOf("Actor");
  const iEnd = head.indexOf("Endpoint");
  const iPerm = head.indexOf("Permission");

  for (const cells of rows) {
    const id = cells[0];
    if (!ID_RE.test(id)) {
      fail(`actions-and-routes.md: bad action id "${id}" (want A## )`);
      continue;
    }
    if (ids.has(id)) fail(`actions-and-routes.md: duplicate action id ${id}`);
    ids.add(id);

    const endpoint = iEnd >= 0 ? (cells[iEnd] ?? "") : "";
    const perm = iPerm >= 0 ? (cells[iPerm] ?? "") : "";
    if (!perm) fail(`${id}: empty Permission cell — a permission string or "— anonymous"`);
    if (!endpoint) fail(`${id}: empty Endpoint cell — an endpoint or "${CLIENT_ONLY}"`);

    byId.set(id, { endpoint, perm, actor: iActor >= 0 ? (cells[iActor] ?? "") : "" });
    if (endpoint && endpoint !== CLIENT_ONLY) endpoints.add(endpoint);
  }
  return registry;
}

checks.registry = () => {
  loadRegistry();
};

checks.perspectives = () => {
  const { ids } = loadRegistry();
  const seen = new Map();
  for (const f of PERSPECTIVES) {
    for (const id of new Set(read(f).match(ID_ANYWHERE) ?? [])) {
      if (!ids.has(id)) {
        fail(`${f}: mentions ${id}, which has no registry row`);
        continue;
      }
      if (!seen.has(id)) seen.set(id, []);
      seen.get(id).push(f);
    }
  }
  for (const id of ids) {
    const where = seen.get(id) ?? [];
    if (where.length === 0) fail(`${id}: narrated in no perspective chapter`);
    else if (where.length > 1) {
      fail(`${id}: narrated in ${where.length} chapters (${where.join(", ")}) — want exactly one`);
    }
  }
};

checks.endpoints = () => {
  const reg = loadRegistry();
  const { head, rows } = table(read("endpoints.md"), "Endpoint");
  if (!head) {
    fail("endpoints.md: no table whose first header cell is `Endpoint`");
    return;
  }
  for (const c of ["Permission", "Must not call", "Instead use", "Actions"]) {
    if (!head.includes(c)) fail(`endpoints.md: table has no \`${c}\` column`);
  }
  const iPerm = head.indexOf("Permission");
  const iMustNot = head.indexOf("Must not call");
  const iInstead = head.indexOf("Instead use");
  const iActions = head.indexOf("Actions");

  const documented = new Set();
  const covered = new Set();

  for (const cells of rows) {
    const ep = cells[0];
    const actions = iActions >= 0 ? (cells[iActions] ?? "") : "";
    if (iPerm >= 0 && !(cells[iPerm] ?? "")) fail(`endpoints.md: "${ep}" has an empty Permission cell`);
    if (!actions) {
      fail(`endpoints.md: "${ep}" has an empty Actions cell — action ids or "${CONTRAST}"`);
      continue;
    }
    const mustNot = iMustNot >= 0 ? (cells[iMustNot] ?? "") : "";
    const instead = iInstead >= 0 ? (cells[iInstead] ?? "") : "";
    if (mustNot && mustNot !== "—" && !instead) {
      fail(`endpoints.md: "${ep}" forbids a caller but names no "Instead use"`);
    }
    if (actions === CONTRAST) continue;

    documented.add(ep);
    for (const id of actions.match(ID_ANYWHERE) ?? []) {
      if (!reg.ids.has(id)) fail(`endpoints.md: "${ep}" lists ${id}, which has no registry row`);
      covered.add(id);
    }
  }

  for (const ep of reg.endpoints) {
    if (!documented.has(ep)) fail(`endpoints.md: no row for registry endpoint "${ep}"`);
  }
  for (const ep of documented) {
    if (!reg.endpoints.has(ep)) {
      fail(`endpoints.md: "${ep}" claims actions but no registry row reaches it — mark "${CONTRAST}" or add the action`);
    }
  }
  for (const [id, row] of reg.byId) {
    if (row.endpoint === CLIENT_ONLY) {
      if (covered.has(id)) fail(`${id} is "${CLIENT_ONLY}" but appears in endpoints.md`);
    } else if (!covered.has(id)) {
      fail(`${id}: calls "${row.endpoint}" but no endpoints.md row lists it`);
    }
  }
};

checks.permissions = () => {
  const { ids } = loadRegistry();
  const found = new Set(read("permissions-by-role.md").match(ID_ANYWHERE) ?? []);
  for (const id of ids) if (!found.has(id)) fail(`${id}: missing from permissions-by-role.md`);
  for (const id of found) if (!ids.has(id)) fail(`permissions-by-role.md: mentions ${id}, no registry row`);
};

checks.testflows = () => {
  const { ids } = loadRegistry();
  const md = read("test-flows.md");
  const flows = new Set(
    (md.match(/^#{2,4}\s+TF-A\d{2}\b/gm) ?? []).map((h) => h.match(/A\d{2}/)[0])
  );
  for (const id of ids) if (!flows.has(id)) fail(`${id}: no "TF-${id}" heading in test-flows.md`);
  for (const id of flows) if (!ids.has(id)) fail(`test-flows.md: TF-${id} has no registry row`);
};

function report() {
  if (!failures.length) return;
  console.error(`${failures.length} failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
}

const requested = process.argv.slice(2);
const names = requested.length ? requested : Object.keys(checks);
for (const n of names) {
  if (!checks[n]) {
    console.error(`unknown check: ${n}`);
    console.error(`known: ${Object.keys(checks).join(", ")}`);
    process.exit(2);
  }
}

checks.files();
if (failures.length) {
  report();
  process.exit(1);
}
for (const n of names) if (n !== "files") checks[n]();
report();
if (!failures.length) console.log(`OK — ${names.join(", ")}`);
process.exit(failures.length ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node docs/qr/_verify/check.mjs files`

Expected: FAIL, exit 1, nine `missing file:` lines.

- [ ] **Step 3: Create the nine files as stubs**

Each file gets a title, a one-line purpose, and the stamp line. Get the commits first:

```bash
for a in super-app web-app; do echo "$a $(git -C /c/unirefund/$a rev-parse --short HEAD 2>/dev/null || echo 'not-a-repo')"; done
```

Write into every one of the nine files a `Verified against:` line of this shape,
with the real values:

```markdown
_Verified against: 2026-07-31 · super-app `<sha>` · web-app `<sha>`._
```

Stub bodies, one per file — enough that the structural checks have something to
read, no invented facts:

```markdown
# QR handling — <title>

<one sentence saying what this file answers.>

_Verified against: 2026-07-31 · super-app `<sha>` · web-app `<sha>`._
```

- [ ] **Step 4: Verify the file and stamp checks pass**

Run: `node docs/qr/_verify/check.mjs files stamps placeholders`

Expected: PASS — `OK — files, stamps, placeholders`.

- [ ] **Step 5: Verify the join checks still fail**

Run: `node docs/qr/_verify/check.mjs registry`

Expected: FAIL, exit 1, `actions-and-routes.md: no table whose first header cell is `ID``.

This is the failing test the next three tasks satisfy.

- [ ] **Step 6: Commit**

```bash
cd /c/unirefund/docs
git add qr/
git commit -m "docs(qr): scaffold the guide and its structural checker

check.mjs enforces the joins the guide promises about itself — every
action id present in the registry, one perspective chapter, endpoints.md,
permissions-by-role.md and test-flows.md, and every endpoint reachable
from an action. Written before the content so each task has a failing
check to satisfy.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Registry — `super-app` actions

**Files:**
- Modify: `docs/qr/actions-and-routes.md`

**Interfaces:**
- Consumes: the marker strings and the `ID | Action | Actor | Trigger | App | Route | UI entry | Client wrapper | SDK method | Endpoint | Permission | Cap # | Cell` header from Task 1.
- Produces: action ids for every `super-app` action. Tasks 3 and 4 continue the same numbering; Tasks 5–12 join against these ids.

- [ ] **Step 1: Write the registry table header and the route→action index heading**

Add to `docs/qr/actions-and-routes.md`, above the tables:

```markdown
## Route → action

<a table of route to the action ids reachable from it, filled in as the three
registry sections land.>

## Actions — `super-app`

| ID | Action | Actor | Trigger | App | Route | UI entry | Client wrapper | SDK method | Endpoint | Permission | Cap # | Cell |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

The header cells must match exactly — the checker indexes by name.

- [ ] **Step 2: Walk these routes and derive one row each**

Apply [the derivation protocol](#the-derivation-protocol) to every action on:

`src/app/(public)/role-select.tsx`, `(public)/traveller-login.tsx`,
`(public)/staff-login.tsx`, `src/app/manual-entry.tsx`, `src/app/tag-preview.tsx`,
`src/app/sticker-tag.tsx`, `src/app/validate.tsx`,
`src/app/(auth)/create-tag.tsx`, `src/app/(auth)/tags/index.tsx`,
`src/app/(auth)/tags/[tagId].tsx`, `src/app/(auth)/index.tsx` (the Home scan CTA).

Also cover the client-only actions, which take `— client only` in `Endpoint` and
`— anonymous` in `Permission`:
`src/utils/qr/classifyScan.ts`, `src/utils/qr/scanDestination.ts`,
`src/hooks/useQrScanLauncher.tsx`, `src/hooks/useScanRouting.ts`,
`src/store/pendingScan.ts` with `src/hooks/useResumePendingScan.tsx`.

Wrappers are in `src/actions/<Service>/actions.ts` and `post.ts`. The `TagService`
ones already exist and are the likely majority: `getTags`, `getTenantTags`,
`getTagDetailsById`, `getPublicTagByTagId`, `getPublicTag`,
`postTagTravellerSelfAssign`, `postTagTravellerSelfAssignByTagId`,
`getOwnedTagByTagNumber`, `getFullTagDetail`, `getStickerLineByNumber`,
`getStickerLineMerchantInfo`, `getMerchantsForTagCreation`,
`getPublicTagByStickerLineNumber`, `getTagDetailByTagNumber`. Airport validation
uses `src/actions/ExportValidationService/actions.ts` → `postQrEvidenceScan`.

Assign `Cap #` from `docs/QR.md`'s catalogue and `Cell` from its grid; use `—` for
an action that is not QR-triggered.

- [ ] **Step 3: Verify the registry parses**

Run: `node docs/qr/_verify/check.mjs registry`

Expected: PASS — `OK — registry`. Any failure names the row and the column.

- [ ] **Step 4: Verify the downstream joins still fail**

Run: `node docs/qr/_verify/check.mjs perspectives`

Expected: FAIL — one `narrated in no perspective chapter` per new id. Correct at this point.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/docs
git add qr/actions-and-routes.md
git commit -m "docs(qr): registry rows for super-app

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Registry — `web-app/apps/web` actions

**Files:**
- Modify: `docs/qr/actions-and-routes.md`

**Interfaces:**
- Consumes: the table header and the id sequence from Task 2. Continue numbering; do not renumber Task 2's rows.
- Produces: action ids for every `apps/web` action.

- [ ] **Step 1: Add the section heading and table**

```markdown
## Actions — `web-app/apps/web`

| ID | Action | Actor | Trigger | App | Route | UI entry | Client wrapper | SDK method | Endpoint | Permission | Cap # | Cell |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

- [ ] **Step 2: Walk these routes and derive one row each**

All paths under `web-app/apps/web/src/app/[lang]/(main)/(unirefund)/` unless noted:

- `operations/scan-sticker` — `client.tsx`. Its `README.md` already documents the whole page; use it, but re-derive every permission from the SDK rather than trusting the README's prose.
- `operations/tax-free-tags` — the list, `[tagId]` detail (`_components/assign-traveller.tsx`, `_components/tag-actions.tsx`, `_components/print-tag.tsx`), and `new/client.tsx`.
- `operations/tax-free-tags/_components/customs/assign-draft-content.tsx` and `assign-draft-sheet.tsx` — the bulk scan-and-assign (`#17`).
- `operations/tags` — `_components/customs-tags-workspace.tsx`.
- `[lang]/(external)/qr` — `_components/rolling-qr-card.tsx`, the kiosk (`#20`).
- `operations/refund/_components/refund-filters/tags-panel.tsx` — `#21`, present but commented out. Give it a row, mark the `Action` cell as disabled, and cite `#21`'s "leave disabled" decision.

Wrappers are in `web-app/packages/actions/unirefund/<Service>/`. `classifyScan` in
`scan-sticker/client.tsx:161` is local to that page — it is a client-only action.

Excluded, per the spec: `operations/tax-free-tags/new-old/` (name it once as dead in
a note under the table, no rows) and `file/verification/[fileId]/create-tag`.

- [ ] **Step 3: Cross-check the two SDK generations**

For every `TagService` endpoint you recorded, compare the annotation in
`web-app/packages/saas/TagService/sdk.gen.ts` against
`super-app/src/saas/TagService/sdk.gen.ts`:

```bash
cd /c/unirefund
grep -c "Requires permissions" web-app/packages/saas/TagService/sdk.gen.ts super-app/src/saas/TagService/sdk.gen.ts
```

Both read 52 as of this plan. Where an individual endpoint's annotation differs,
record both strings in the `Permission` cell and note the row id — Task 13 turns it
into a Findings row.

- [ ] **Step 4: Verify the registry still parses**

Run: `node docs/qr/_verify/check.mjs registry`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/docs
git add qr/actions-and-routes.md
git commit -m "docs(qr): registry rows for apps/web

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Registry — `web-app/apps/ssr` actions, and the route index

**Files:**
- Modify: `docs/qr/actions-and-routes.md`

**Interfaces:**
- Consumes: the table header and id sequence from Tasks 2–3.
- Produces: the complete registry. Tasks 5–12 read it and add nothing to it.

- [ ] **Step 1: Add the section heading and table**

```markdown
## Actions — `web-app/apps/ssr`

| ID | Action | Actor | Trigger | App | Route | UI entry | Client wrapper | SDK method | Endpoint | Permission | Cap # | Cell |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

- [ ] **Step 2: Walk these routes and derive one row each**

All under `web-app/apps/ssr/src/app/[lang]/`:

- `(public)/tag/page.tsx` and `_components/tag-search-form.tsx` — manual tag lookup (`#9`).
- `(public)/tag/[slug]/page.tsx`, `_components/public-tag-details.tsx`, `_components/claim-tag-button.tsx` — the anonymous read and the claim (`#1`, `#2`, `#3`, `#4`).
- `(public)/validate/` — `page.tsx`, `_components/validate-client.tsx`, `use-validate-flow.ts`, `flight-info-step.tsx`, `scan-result-view.tsx`, `rescan-qr-modal.tsx`, `claim-tag-modal.tsx`, `didit-for-validate.tsx`, `validate-location-actions.ts` (`#5`, `#6`, `#7`, `#8`).
- `(main)/tags/page.tsx`, `_components/tag-claim.tsx`, `[tagNumber]/page.tsx`.
- `(auth)/login/page.tsx` and `(auth)/login/kyc/` — the login and KYC gate the claim defers through.

SSR resolves a tag QR by **routing**, not scanning: the code encodes a URL the
phone's own camera opens. Record the trigger as `Tag QR` with the UI entry naming
the route segment rather than a scanner component.

- [ ] **Step 3: Fill in the route→action index**

Complete the `## Route → action` table at the top of the file: one row per route,
listing the action ids reachable from it. Every id in the three tables must appear
at least once here.

- [ ] **Step 4: Verify**

Run: `node docs/qr/_verify/check.mjs files stamps placeholders registry`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/docs
git add qr/actions-and-routes.md
git commit -m "docs(qr): registry rows for apps/ssr, and the route index

Completes the registry. SSR resolves a tag QR by routing rather than
scanning, so its rows name a route segment where the other apps name a
scanner component.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `endpoints.md` — the API usage contract

**Files:**
- Modify: `docs/qr/endpoints.md`

**Interfaces:**
- Consumes: the complete registry from Task 4 — its `Endpoint`, `Permission`, `Actor` and `ID` columns.
- Produces: one row per endpoint, keyed by the same `METHOD /path` strings the registry uses. Task 6 and Task 13 cite it.

- [ ] **Step 1: Write the main table**

Header must match exactly:

```markdown
## Endpoints

| Endpoint | Permission | Intended caller | Also called by | Must not call | Instead use | Actions | Body contract |
| --- | --- | --- | --- | --- | --- | --- | --- |
```

One row per distinct endpoint in the registry. `Actions` lists the ids that reach
it. `Endpoint` strings must be byte-identical to the registry's, or the checker
reports a missing row.

`Must not call` needs a **reason**, one of three kinds:
- *no grant* — verifiable from the annotation.
- *wrong DTO* — the request type has no field for something the caller has. `POST /tag/by-sticker-line` takes `CreateTagByStickerLineRequestDto`, which carries no merchant-signature field, so a merchant calling it silently drops a captured signature. No 403 ever reports this.
- *side effect* — `merchantId` on the Refund Point path is ignored once the sticker line is allocated, but on an unallocated line it permanently allocates the whole sticker header.

Every non-empty `Must not call` must have an `Instead use`. If there genuinely is no
alternative, write that sentence in the cell — do not leave it blank.

- [ ] **Step 2: Add contrast rows for the plausible wrong answers**

Endpoints no QR flow calls, but that someone would reach for. Give each `— contrast`
in `Actions`, its real permission, and one line on why it is wrong here. At minimum
the `SettingService` product-group list (`SettingService.ProductGroups`,
`SettingService.ProductGroups.ViewList`) — it is the global catalogue and carries no
per-merchant `vatRate`.

- [ ] **Step 3: Write the overlapping-endpoint decision tables**

A subsection per question. **These tables must not use `Endpoint` as their first
header cell** — lead with the caller's need. Start from this one, which is already
derived:

```markdown
### I need a merchant's product groups

| Caller and need | Correct endpoint | Permission |
| --- | --- | --- |
| Merchant staff pricing a tag for their own store | `GET /api/crm-service/merchants/{id}/product-group` | `CRMService.Merchants, CRMService.Merchants.ViewProductGroupList` |
| Refund Point pricing for a merchant it does not own | `GET /api/tag-service/sticker-header/sticker-line/{stickerLineNumber}/merchant-info` | `TagService.StickerHeaders, TagService.StickerHeaders.ViewMerchantInfo` |
| Admin maintaining the global catalogue | `SettingService` ProductGroups CRUD | `SettingService.ProductGroups.*` |

`productGroupId` is the global id; `isDefault` and `vatRate` come from the
per-merchant relation. So the catalogue has no rate to price an amount against, and
the `TagService` projection is the only way a Refund Point gets a foreign merchant's
rates at all.
```

Then write the same shape for:
- **Resolve a merchant's identity** — the sticker line's own `merchantName`/`vatNumber`, `TagService` merchant-info, CRM merchant detail, `GET /api/tag-service/tag/merchants-for-creation`. Which is correct depends on whether the caller owns the merchant and whether the book is allocated.
- **Look up a tag** — by id, by tag number, by encrypted tag number, and the three `TagPublicService` reads. Split by whether the caller is authenticated and whether the id is the credential.
- **Create a tag** — `POST /api/tag-service/tag` (`TagService.Tags.Create`) versus `POST /api/tag-service/tag/by-sticker-line` (`TagService.Tags.CreateByStickerLine`). This is `#29`, already decided; record it so it is findable from the endpoint.
- **Assign a traveller** — `POST /api/tag-service/tag/{id}/assign-traveller` (`TagService.Tags.AssignTraveller`) versus `POST /api/tag-service/tag/traveller-self-assign` (`TagService.Tags.TravellerSelfAssign`) versus `POST /api/tag-service/tag/traveller-self-assign/by-tag-id` (`TagService.Tags.TravellerSelfAssignByTagId`, documented **"Host use only."**, no sales-amount proof because the Guid is unguessable). Staff-assigns and traveller-claims are different operations; the names hide that.

- [ ] **Step 4: Write the anti-patterns section**

Lead each entry with the **symptom**, then the reason, then the correct call — a
reader recognises the symptom before the rule. Seed with the two on record:

- *"403 for merchant staff on a lookup that works for a Refund Point"* → `#15`/`#26`: web called `getStickerLineMerchantInfoApi` for every role. Merchants resolve identity via CRM instead.
- *"tag created, but the merchant signature is missing"* / *"an unallocated book got allocated to the wrong store"* → `#29`: every role posted to `by-sticker-line`.

- [ ] **Step 5: Verify both directions of endpoint coverage**

Run: `node docs/qr/_verify/check.mjs registry endpoints`

Expected: PASS. Failures name the endpoint and whether it is unreached, undocumented, or missing an `Instead use`.

- [ ] **Step 6: Commit**

```bash
cd /c/unirefund/docs
git add qr/endpoints.md
git commit -m "docs(qr): the API usage contract

Endpoint-first: intended caller, forbidden callers with the reason, and
the correct alternative for each. The reason matters because only 'no
grant' surfaces as a 403 — a wrong DTO silently drops a captured
signature, and a merchantId on an unallocated sticker line permanently
allocates the book.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `permissions-by-role.md`

**Files:**
- Modify: `docs/qr/permissions-by-role.md`

**Interfaces:**
- Consumes: the registry's `Actor`, `Permission` and `ID` columns; `endpoints.md`'s `Intended caller`.
- Produces: nothing later tasks depend on structurally.

- [ ] **Step 1: Write one section per role**

Roles: Traveller, Merchant, Refund Point, Customs. Per section:

```markdown
| Permission | Actions | Endpoints |
| --- | --- | --- |
```

Every action id in the registry must appear in at least one role section — the
checker enforces it.

- [ ] **Step 2: Write the anonymous section**

A separate section for actions needing no permission, and why that is deliberate.
`TagPublicService` carries no annotations at all;
`getApiTagServicePublicTagByTagIdById` states the reason itself — *"Anonymous — the
unguessable Guid id is the credential."* The traveller's whole scan-before-login path
rests on it.

- [ ] **Step 3: Write the session-claims section**

Claims decide which branch runs *before* any permission is consulted, so they are
documented apart from permissions:

- `super-app` — `utils/rolePreference.ts` is a device-level UX preference and is **not** authoritative; the real role is resolved after login in `providers/SessionProvider.tsx` from CRM affiliations (`resolveRoleFromAffiliations`), travellers fast-pathed from the sign-in route. `grantedPolicies` arrives as `Record<Policies, boolean>`, where `Policies` is `keyof typeof policies` over `src/data/policies/policies.gen.json`.
- `apps/web` — `session.user.MerchantId` / `RefundPointId` / `CustomsId`, each `string | string[]`. **The Refund Point claim wins when both it and `MerchantId` are present.** State the consequence: treating a stray `MerchantId` as authoritative there would resolve, display and post the operator's *own* store instead of the one being booked for, permanently allocating an unallocated book to a store nobody picked.
- `apps/ssr` — NextAuth; public routes need no session, and the claim path additionally requires KYC.

- [ ] **Step 4: Write the "what this file does not know" section**

Which permissions an ABP role actually **holds** is backend configuration, absent
from this repository. Say so, and separate:

- **Code-derived** — route, wrapper, endpoint, required permission. Cited.
- **Observed** — a claim that a role does or does not hold a grant. Only two are on record, both from real 403s: merchants do not hold `TagService.Tags.CreateByStickerLine` (`#29`), and merchant staff do not hold `TagService.StickerHeaders.ViewMerchantInfo` (`#15`).

Infer nothing further. Point a reader who needs the true matrix at the session's own
`grantedPolicies`, and say where to read it in each app.

- [ ] **Step 5: Verify**

Run: `node docs/qr/_verify/check.mjs registry permissions`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /c/unirefund/docs
git add qr/permissions-by-role.md
git commit -m "docs(qr): permissions grouped by role

Separates code-derived facts from the two observed grant claims the
codebase actually establishes, and documents session claims apart from
permissions since they decide the branch before any permission is read.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `README.md` — foundations and indexes

**Files:**
- Modify: `docs/qr/README.md`

**Interfaces:**
- Consumes: the complete registry; `endpoints.md`.
- Produces: the action-id index every reader enters through. Task 13 appends the Findings table here.

- [ ] **Step 1: Write the QR types and wire format section**

`@unirefund/qr` (`github:ayasofyazilim-clomerce/unirefund-qr`, version `0.1.0`) is the
shared codec. Its exports, verified from `dist/types/index.d.ts`:

- `base64UrlDecode`, `base64UrlEncode`
- `decodeTagScan`, `decodeTagSlug`, `encodeTagSlug`, `slugFromScan`, `UnencodableTagFieldError`, `TagSlugData`, `TagSlugInput`
- `buildTagUrl`, `resolveTagLink`, `ResolveTagLinkArgs`, `ResolveTagLinkResult`
- `buildValidateUrl`, `extractValidateQrValue`, `isValidateScan`

Slug keys: `i` tag id, `n` tag number, `t` traveller document number, `s` sticker line
number. State the precedence rules: a slug carrying `s` is a **sticker** even when it
also carries tag fields, because a slug with `s` came from a sticker and the sticker
flow resolves the tag from it anyway; a slug carrying only `t` identifies nothing
openable. Name `@unirefund/qr/vectors.json` as the fixture any parser change must
still satisfy.

**Be precise about the scope of the claim.** The library is the single source of truth
for **decoding**, and for **encoding the sticker QR** — but not for every code
printed. Do not write "one library decides the format"; that is the assumption that
would let a real divergence pass unnoticed. Point at the next section.

- [ ] **Step 2: Write the "where codes come from" producer table**

```markdown
| Code | Produced by | Content authored by |
| --- | --- | --- |
| Sticker QR | `apps/web` · `operations/stickers/[stickerId]/_components/print-sticker-lines-action.ts` | client — `buildTagUrl` from `@unirefund/qr`, encoding only the `s` key |
| Tag QR | `apps/web` · `operations/tax-free-tags/[tagId]/_components/print-tag.tsx`, via `react-qr-code` | **the backend** — the value is `TagDetailDto.publicLink`, not built locally |
| Code128 tag-number barcode | `pos-app` · `src/screens/(auth)/Tags/TagDetail/_components/tagPrintTemplate.ts` — `printBarcode(tag.tagDetail.tagNumber, "code128")` | nobody — a bare tag number, which is exactly why `#28` existed |
| Validate QR | `apps/web` · `[lang]/(external)/qr/_components/rolling-qr-card.tsx`, the airport kiosk | server-issued and rolling, so it expires mid-flow by design (`#7`) |
```

Then the two consequences:

- **The tag QR has two possible authors.** `print-tag.tsx` imports `react-qr-code` and encodes `tagDetails.publicLink`; it never calls `buildTagUrl`. Whether `publicLink` and `buildTagUrl` agree is not answerable from this repository, so it is a Findings row, not a paragraph. If they ever diverge, a printed tag QR and a printed sticker QR resolve differently and nothing catches it.
- **`pos-app` produces a code no app could resolve.** A bare tag number is not a slug; the mobile scanner's default symbologies include `code-128`, so the barcode *is* read and then decoded to nothing — the whole of `#28`. Fixed now, and worth naming because a producer sharing no code with its consumers is how that gap opened.

Note that `pos-app` ships `src/screens/(auth)/DeviceSettings/BarcodeTestScreen.tsx`,
which uses `base64UrlEncode` to print arbitrary test barcodes on a device. Task 12
names it in the test-data preamble.

`pos-app` gets **no** action or endpoint rows. It appears here and nowhere else.

- [ ] **Step 3: Write "how each app resolves a QR"**

Carried from `docs/QR.md` and expanded:

- `apps/ssr` barely scans. A tag QR encodes `{ssrBaseUrl}/tag/{slug}`, so the traveller's own camera app opens the browser and `/tag/[slug]` decodes server-side. Resolution is routing. Its only in-app cameras are the boarding-pass scanner and the expired-QR rescan modal.
- `super-app` scans in-app: `src/utils/qr/classifyScan.ts` turns a raw string into a navigation decision client-side. This is why mobile needed an explicit `sticker` kind that SSR never did — a URL routes itself.
- `apps/web` additionally supports a **wedge / keyboard** barcode scanner: a keydown buffer in a ref, reset by a 500 ms gap, committed on `Enter`. Mobile deliberately has none — no wedge exists on a phone — which is why a bare undecodable string is read as a sticker line number on web and stays `unknown` on mobile.

Add that `classifyScan` is **not** shared: `apps/web` defines its own at
`operations/scan-sticker/client.tsx:161`, `super-app` at `src/utils/qr/classifyScan.ts`.
Decoding is shared via `@unirefund/qr`; classification is per-app product policy, and
`super-app`'s own file comment argues that is correct. Record it as a decision on the
record.

- [ ] **Step 4: Write "which QR each party may not use"**

A merchant or refund point scanning a **validate** QR is refused with a specific
message, not a generic failure (`#22`). Explain the ordering that makes it possible,
once, here: validate is checked **first** because it is the one code that does not
decode — it is a plain URL, so `decodeTagScan` yields empty fields and it would
otherwise fall through to the wedge path and be looked up as a line number, surfacing
as "sticker not found" rather than "wrong QR".

- [ ] **Step 5: Write the login and session resolution section**

Per app, as specified in Task 6 Step 3. Cross-link rather than duplicating: the claim
detail lives in `permissions-by-role.md`; `README.md` carries the flow — role gate,
login route, role resolution, tenant/affiliation selection, and the deferred-scan
resume (`src/store/pendingScan.ts` + `src/hooks/useResumePendingScan.tsx`, called from
`src/app/(auth)/_layout.tsx`), which is what lets a scan taken before login survive
the `(public)`→`(auth)` swap.

- [ ] **Step 6: Write the indexes and the reading guide**

- **Action-id index** — id, one-line name, owning chapter. Every registry id.
- A link to the route→action index in `actions-and-routes.md`. Do not copy it.
- **How to read the permission column** — the four-step chain, stated so a reader can re-run it on any row, and the rule that a missing annotation means anonymous.
- A short note on the division of labour with `docs/QR.md`: it owns capability numbers, per-app support and decisions; this guide owns routes, actions, endpoint ownership, permissions and tests. The ✅/❌ marks are never duplicated here.

- [ ] **Step 7: Verify**

Run: `node docs/qr/_verify/check.mjs files stamps placeholders registry endpoints permissions`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /c/unirefund/docs
git add qr/README.md
git commit -m "docs(qr): foundations, producers and the indexes

Records that the tag QR has two possible authors — print-tag.tsx encodes
the backend's publicLink and never calls buildTagUrl — so the wire-format
section stops short of claiming one library decides every printed code.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `traveller.md`

**Files:**
- Modify: `docs/qr/traveller.md`

**Interfaces:**
- Consumes: registry rows whose `Actor` is Traveller or Anonymous.
- Produces: narration for those ids. The checker requires each id in **exactly one** perspective chapter, so anything narrated here must not be narrated in Tasks 9–11.

- [ ] **Step 1: Write the three cells**

- **T1 · Validate QR** — the traveller verifies identity and views their assigned tags; manual verification sends them to customs. Cover the full flow in both apps: auth gate (defer to login), geolocation, flight ticket by BCBP scan or manual entry, the scan, and the result buckets (green / already validated / red with exit points / rejected), plus the rolling-QR-expired rescan and session-expired states.
- **T2 · Sticker QR** — the traveller sees the tag linked to the sticker if one exists, and can claim it if the store made no assignment. Include the dedicated "no tag on this sticker yet" state.
- **T3 · Tag QR** — the traveller sees the tag's details and can claim it if unassigned.

- [ ] **Step 2: Write the cross-cutting traveller sections**

- **Scan before login.** Public anonymous read first, then login/KYC to claim. `/tag-preview` is a **root** route in `super-app`, not under `(public)`, so it works logged in or out.
- **Deferred claim intent.** "Login to claim" stores the intent, routes to `/traveller-login`, and `useResumePendingScan` resumes it inside `(auth)/_layout.tsx`. On SSR the equivalent defers through `(auth)/login` and `login/kyc`.
- **Only a Draft tag is claimable.** An already-issued or divergent tag says so instead of offering the action.
- **Manual entry** (`#9`) — `/manual-entry` has Sticker and Tag modes; a traveller's public read needs a passport number where staff see no such field.
- **Claiming from the validation results** (`#8`) — scan-only on mobile, because `/manual-entry` covers typed entry. Closing after any claim re-runs the scan, since a claimed tag is not a validated tag and only the scan endpoint decides its bucket. Record the accepted limitation from `QR_FEATURE_CHECKLIST.md` Phase 8: if the post-claim rescan fails, the screen shows the generic validation-failed state with nothing saying the claim itself succeeded — the claim is already committed server-side regardless.

- [ ] **Step 3: Verify no id is double-narrated**

Run: `node docs/qr/_verify/check.mjs registry perspectives`

Expected: FAIL — remaining ids belong to Tasks 9–11 and report `narrated in no perspective chapter`. **No failure may say `narrated in 2 chapters`.** If one does, an id is in the wrong chapter.

- [ ] **Step 4: Commit**

```bash
cd /c/unirefund/docs
git add qr/traveller.md
git commit -m "docs(qr): the traveller perspective

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `merchant.md`

**Files:**
- Modify: `docs/qr/merchant.md`

**Interfaces:**
- Consumes: registry rows whose `Actor` is Merchant.
- Produces: narration for those ids, and none narrated in Task 8.

- [ ] **Step 1: Write the three cells**

- **M1 · Validate QR** — nothing to do with it; scanning raises an invalid-QR warning (`#22`).
- **M2 · Sticker QR** — sees the linked tag if one exists and can assign a traveller there; if unlinked, creates a tag and establishes the link.
- **M3 · Tag QR** — sees the tag's details and can assign a traveller.

- [ ] **Step 2: Write the create-a-tag section**

Both apps. The points that must appear:

- Merchants create through `POST /api/tag-service/tag`, which their `TagService.Tags.Create` grant covers. They do **not** hold `TagService.Tags.CreateByStickerLine` (`#29`).
- The sticker binds in the **same call** — `CreateTagRequestDto.stickerLineNumber` — so no separate assign is needed.
- The body carries `merchant: { vatNumber, countryCode, externalIdentifier? }` and **no** `merchantId` field at all; the merchant identifies itself by VAT number and country.
- With a traveller attached the tag is created `Issued`; without one, `Draft`, for the traveller to claim later by scanning the same sticker.
- Merchants capture **both** signatures — `merchantIndividualSignatureBase64` always, `travellerSignatureBase64` when a traveller is attached.
- Merchant staff resolve the sticker's merchant **without** `TagService.StickerHeaders.ViewMerchantInfo`, which they do not hold (`#15`): allocation from `stickerLine.merchantId`, identity from the sticker line or CRM, product groups from CRM. Only Refund Points call the merchant-info endpoint.
- A merchant scanning a sticker allocated to a **different** store gets a terminal "belongs to another store" refusal, decided client-side by comparing `stickerLine.merchantId` against the session's merchant id **case-insensitively** — the same GUID arriving from two systems, neither trusted to share casing.
- An **unallocated** book is allocated by creating the tag, permanently, to whichever merchant is sent — which is why the allocation warning shows even when the merchant is themselves.
- A used sticker opens its tag instead of a create form (`#14`).

- [ ] **Step 3: Write the assign-a-traveller section**

`POST /api/tag-service/tag/{id}/assign-traveller`, `TagService.Tags.AssignTraveller`.
Distinguish it from the traveller's own self-assign endpoints — different operations,
different permissions, and the names hide it. Cross-link the decision table in
`endpoints.md`.

- [ ] **Step 4: Verify**

Run: `node docs/qr/_verify/check.mjs registry perspectives`

Expected: FAIL only with `narrated in no perspective chapter` for Task 10–11 ids. No `narrated in 2 chapters`.

- [ ] **Step 5: Commit**

```bash
cd /c/unirefund/docs
git add qr/merchant.md
git commit -m "docs(qr): the merchant perspective

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `refund-point.md`

**Files:**
- Modify: `docs/qr/refund-point.md`

**Interfaces:**
- Consumes: registry rows whose `Actor` is Refund Point.
- Produces: narration for those ids, none overlapping Tasks 8–9.

- [ ] **Step 1: Write the three cells**

- **R1 · Validate QR** — nothing; invalid-QR warning.
- **R2 · Sticker QR** — sees the linked tag if one exists and can assign a traveller; if unlinked, creates a tag and establishes the link.
- **R3 · Tag QR** — sees the tag's details and can assign a traveller.

- [ ] **Step 2: Write the create-by-sticker-line section**

- Refund Points create through `POST /api/tag-service/tag/by-sticker-line`, gated on `TagService.Tags.CreateByStickerLine` — the grant that exists for issuing on behalf of a merchant they do not own.
- The body carries `stickerLineNumber`, `merchantId` **only** when the line is not yet allocated, and `travellerSignatureBase64` when a traveller is attached. `CreateTagByStickerLineRequestDto` has **no merchant-signature field**, so a Refund Point captures the traveller pad only.
- An **allocated** book is never told who its merchant is: the sticker line already names it and the backend documents `merchantId` as ignored once allocated, so the page derives `isAllocated = Boolean(stickerLine.merchantId)` and omits the parameter.
- An **unallocated** book requires the operator to pick a merchant, via `GET /api/tag-service/tag/merchants-for-creation` (`TagService.Tags.ViewMerchantsForCreation`), and creating the tag allocates the whole sticker header to that pick, permanently.
- A merchant pick **discards the invoice lines**, because lines are priced against the product groups of the merchant resolved when they were added. Without that, an operator who changed their mind about the store would post the first store's amounts against the second store's VAT rates — and the create allocates the book, so there is nothing to correct afterwards.
- Refund Points **do** call `GET .../merchant-info` (`TagService.StickerHeaders.ViewMerchantInfo`) — it is their grant, and merchants never call it.

- [ ] **Step 3: Write the assign-a-traveller section**

Same endpoint and permission as the merchant path (`TagService.Tags.AssignTraveller`);
cross-link rather than restating, and note where the Refund Point's flow differs.

- [ ] **Step 4: Write the both-claims-present warning**

A Refund Point operator can also carry a store affiliation. **The Refund Point claim
wins**, and `ownMerchantId` — the only merchant id the merchant-only lookup and create
path may use — is derived from the role check rather than read off the session, because
treating a stray `MerchantId` as authoritative would resolve, display and post the
operator's own store instead of the one being booked for.

- [ ] **Step 5: Verify**

Run: `node docs/qr/_verify/check.mjs registry perspectives`

Expected: FAIL only with `narrated in no perspective chapter` for Task 11 ids.

- [ ] **Step 6: Commit**

```bash
cd /c/unirefund/docs
git add qr/refund-point.md
git commit -m "docs(qr): the refund point perspective

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: `customs.md`

**Files:**
- Modify: `docs/qr/customs.md`

**Interfaces:**
- Consumes: registry rows whose `Actor` is Customs.
- Produces: the last unnarrated ids. After this task `perspectives` must pass.

- [ ] **Step 1: Write the three cells**

`C1` validate QR, `C2` sticker QR, `C3` tag QR — on the same axes as the other
chapters. Where a cell is genuinely meaningless, say so; "Customs has no sticker
flow" is information, not an omission.

- [ ] **Step 2: Write the bulk scan-and-assign section**

`#17`, web only. `operations/tax-free-tags/_components/customs/assign-draft-content.tsx`
and `assign-draft-sheet.tsx`. Cover: scanning N tags into a list, the camera opened on
demand so the stream is not running while the agent reviews tags, the tabs for camera
versus keyboard entry, traveller search via `SearchTraveller`, and the assign call.
Note that this capability is deliberately **web-only** — `#17`'s decision is "stays
web-only", so `super-app` has no equivalent.

- [ ] **Step 3: Write the rolling validate-QR kiosk section**

`#20`, `[lang]/(external)/qr`. `rolling-qr-card.tsx` gates on `CustomsId`;
`no-kiosk-view.tsx` is the refusal. This is the **producer** of the validate QR the
traveller scans in `T1` — cross-link the producer table in `README.md`. `#20`'s
decision is "stays a web kiosk", so `super-app` has no equivalent.

- [ ] **Step 4: Write the customs tag-list section**

`operations/tax-free-tags/page.tsx` overrides the status filter for a customs session
and defaults to today's issued tags unless the user picked a date range, cleared the
filter with `issuedAll=1`, or is looking up a traveller. `operations/tags` is the
customs workspace.

- [ ] **Step 5: Verify every id is now narrated exactly once**

Run: `node docs/qr/_verify/check.mjs registry perspectives`

Expected: PASS — `OK — registry, perspectives`.

- [ ] **Step 6: Commit**

```bash
cd /c/unirefund/docs
git add qr/customs.md
git commit -m "docs(qr): the customs perspective

The fourth party, web only. Owns the bulk scan-and-assign sheet and
generates the validate QR travellers scan, so it is a producer as well
as a consumer.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: `test-flows.md`

**Files:**
- Modify: `docs/qr/test-flows.md`

**Interfaces:**
- Consumes: every registry id.
- Produces: one `TF-A##` heading per id. The checker matches headings against `/^#{2,4}\s+TF-A\d{2}\b/m`, so the heading must lead with `TF-A##`.

- [ ] **Step 1: Write the test-data preamble**

The fixtures every flow draws on, named once so a flow can reference instead of
explaining: a printed sticker whose book is **not** allocated; one allocated to the
tester's own store; one allocated to a **different** store; a `Draft` tag with no
traveller; an `Issued` tag; a traveller account with KYC complete and one without;
staff accounts for merchant, refund point and customs; a boarding pass with a
scannable BCBP barcode.

Name `pos-app`'s `src/screens/(auth)/DeviceSettings/BarcodeTestScreen.tsx` here: it
prints arbitrary test barcodes on a device and is the only way to produce a scannable
code without real printed stock, which several flows would otherwise be blocked on.

- [ ] **Step 2: Write one flow per action id**

Format — no file paths in the steps, and every gate carries an `EXPECT`:

```markdown
### TF-A17 — Merchant assigns a traveller to an existing tag

**App:** `super-app` (mobile) · **Role:** Merchant staff
**Needs:** a merchant account; a `Draft` tag issued by your own store

1. Launch the app, choose **Staff** at the role gate, log in.
   EXPECT the merchant home, with the scan action available.
2. Tap **Scan** and point the camera at the tag QR.
   EXPECT the tag detail for that tag, showing no traveller.
3. …

**Negative cases**

- Scan the traveller's airport validate QR instead.
  EXPECT a specific "wrong QR" refusal, not a generic failure and not "not found".
- Scan a tag issued by a different store.
  EXPECT …
```

Give every flow at least one negative case. Draw them from the refusal states the
perspective chapters recorded — wrong QR type, a book allocated to another merchant,
an incomplete traveller, an expired validate QR.

- [ ] **Step 3: Write the coverage table**

Every action id → its flow, at the end of the file. An action with no flow shows as a
hole rather than being invisible.

- [ ] **Step 4: State what has not been run**

These flows are written to be run against a deployed environment; none is claimed to
have been executed. Link to `docs/QR.md`'s "Verification still outstanding" and
`QR_FEATURE_CHECKLIST.md`'s unchecked native-verification boxes rather than restating
them.

- [ ] **Step 5: Verify**

Run: `node docs/qr/_verify/check.mjs registry testflows`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /c/unirefund/docs
git add qr/test-flows.md
git commit -m "docs(qr): QA-runnable test flow per action

Preconditions in test-data terms up front, so a missing fixture is
visible before someone starts a flow rather than three steps in.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Findings, `QR.md` integration, and the full verification pass

**Files:**
- Modify: `docs/qr/README.md`
- Modify: `docs/QR.md`

**Interfaces:**
- Consumes: every note taken during Tasks 2–12.
- Produces: the finished guide. `node docs/qr/_verify/check.mjs` passes with no arguments.

- [ ] **Step 1: Write the Findings table in `docs/qr/README.md`**

Each row: the file, what disagrees with what, and the action ids affected. Seed with
the three already established, then add everything Tasks 2–12 turned up — a control
gated on a permission its endpoint does not require, an endpoint whose requirement no
UI checks, a stale SDK generation, a route that outlived its capability entry.

The three on record:

| Finding | Detail |
| --- | --- |
| The tag QR has two possible authors | `print-tag.tsx` encodes `TagDetailDto.publicLink`; the sticker print flow uses `buildTagUrl`. Drift would make a printed tag QR and a printed sticker QR resolve differently, with nothing to catch it. Not answerable from this repository. |
| Three endpoints return "product groups" | Only two carry a `vatRate`. Not a defect, but the trap behind `#15`. Resolved by the decision table in `endpoints.md`. |
| `classifyScan` is duplicated, not shared | `apps/web` at `operations/scan-sticker/client.tsx:161`, `super-app` at `src/utils/qr/classifyScan.ts`. Decoding is shared; classification is per-app by design, argued in `super-app`'s own file comment. Recorded so the divergence is on the record. |

If the pass found nothing beyond these, say so explicitly. An empty Findings section
is a result; a missing one is ambiguous.

- [ ] **Step 2: Re-derive every registry row**

Machine checks cannot catch a wrong citation. For each row, re-read the cited
`file:line` and re-check the `**Requires permissions:**` annotation. A row that cannot
be re-derived is corrected or removed — never left standing.

Spot-check helper:

```bash
cd /c/unirefund
grep -n "Requires permissions" web-app/packages/saas/TagService/sdk.gen.ts | head -60
```

- [ ] **Step 3: Update `docs/QR.md`**

Exactly two changes, plus new numbers:

1. Add a link to `docs/qr/README.md` near the top, saying the catalogue answers *what exists* and the guide answers *how it works and how to test it*.
2. Add a **Customs** column to the role×QR-type grid, with `C1`/`C2`/`C3`, and rows in the behaviour table beneath it.
3. For any Findings row that is a real defect, append a **new** capability number at the end so it enters the existing decision process.

Do **not** edit or renumber any existing capability number, ✅/❌ mark or decision.

- [ ] **Step 4: Run every check**

Run: `node docs/qr/_verify/check.mjs`

Expected: PASS — `OK — files, stamps, placeholders, registry, perspectives, endpoints, permissions, testflows`.

- [ ] **Step 5: Confirm the stamps are real**

Every one of the nine files must carry a `Verified against:` line whose commits match
the tree that was actually surveyed:

```bash
cd /c/unirefund
git -C super-app rev-parse --short HEAD
git -C web-app rev-parse --short HEAD
grep -h "Verified against" docs/qr/*.md | sort -u
```

Expected: one distinct stamp line, and its shas match the two commands above. If a
task landed against a different commit, re-verify that file's rows rather than editing
the stamp.

- [ ] **Step 6: Commit**

```bash
cd /c/unirefund/docs
git add qr/ QR.md
git commit -m "docs(qr): findings, QR.md integration, full verification pass

All eight structural checks pass. QR.md gains a link to the guide and a
Customs column; no existing capability number, mark or decision changed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes

Checked against the spec section by section.

**Spec coverage.** Primary purpose → Task 5. Files → Task 1 creates all nine. Spine and id rules → Global Constraints + Task 1's checker. What counts as an action → the route lists in Tasks 2–4. Seed inventory → Tasks 2–4 verbatim. Registry schema → Task 2 Step 1 header. Sourcing rule → the derivation protocol, with a verified worked example. Where codes come from → Task 7 Step 2. Endpoint ownership, overlapping endpoints, anti-patterns → Task 5 Steps 1–4. Permissions by role → Task 6. Foundations chapter → Task 7. Test flows → Task 12. Findings → Task 13 Step 1. Verification items 1–6 → Task 13 Steps 2, 4, 5 plus the per-task checker runs. Risks and Out of scope → Global Constraints and the exclusion notes in Tasks 3 and 7.

**Deviation from the spec, deliberate:** the spec lists nine files; this plan adds a
tenth artifact, `_verify/check.mjs`. It is tooling, not guide content, which is why it
sits under `_verify/` and is excluded from the `GUIDE` list the checker itself walks.

**Type consistency.** The marker strings `— client only`, `— contrast`, `— anonymous`
are declared once in Global Constraints and used identically in the checker and in
Tasks 2–5. They are **literal U+2014 em dashes** in `check.mjs`'s `CLIENT_ONLY` and
`CONTRAST` constants, so the file is UTF-8, not ASCII — write it with UTF-8 encoding
and do not substitute a hyphen. This was exercised: a fixture whose `Endpoint` cell
read `— client only` was correctly rejected when it also appeared in `endpoints.md`.
The registry header is
written identically in Tasks 2, 3 and 4. Check names — `files`, `stamps`,
`placeholders`, `registry`, `perspectives`, `endpoints`, `permissions`, `testflows` —
match between the checker's `checks` object and every `Run:` line. `TF-A##` heading
shape matches the checker's regex.

**Ordering.** The registry must be complete before Task 5, because `endpoints.md` is
derived from it and the `endpoints` check compares both directions. Perspective tasks
8–11 may be reordered among themselves; `perspectives` only passes once all four land.
