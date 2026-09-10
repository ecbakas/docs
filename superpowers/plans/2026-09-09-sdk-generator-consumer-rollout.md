# SDK generator consumer rollout — Implementation Plan (2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all five consumers onto the published `@ayasofyazilim-clomerce/sdk-generator@0.1.0`, collapsing 21 duplicated core runtimes into 5 and landing the binary-response fix in every repo — which is what actually fixes the `.xlsx` export.

**Architecture:** Two shapes. The npm consumers (web-app, ayasofyazilim-core-project) swap the dependency and regenerate, which centralizes their cores for the first time. The vendored consumers (super-app, pos-app, core-mobile) already have a shared core; they delete their forked `generator.mjs`, adopt the package, and regenerate to pick up the patch. Every repo keeps its own thin `index.mjs` CLI, because it reads a repo-local `API_LIST.json`.

**Tech Stack:** `@ayasofyazilim-clomerce/sdk-generator@0.1.0` (GitHub Packages), pnpm (web-app, core-project), npm (super-app, pos-app, core-mobile), hey-api 0.60.1 and swagger-parser 13.0.0 both owned by the generator.

**Spec:** `docs/superpowers/specs/2026-09-09-sdk-generator-shared-core-design.md`
**Plan 1 (complete, published):** `docs/superpowers/plans/2026-09-09-sdk-generator-shared-core.md`

## Global Constraints

- The dependency is exactly `"@ayasofyazilim-clomerce/sdk-generator": "0.1.0"` — pinned, no caret. Reproducible generated output matters more than automatic upgrades here.
- Remove `"@ayasofyazilim/sdk_generator"` wherever it appears. web-app and core-project currently pin it to `"latest"`, so leaving it lets a floating install pull the old un-patched generator.
- Remove each consumer's own `@hey-api/openapi-ts` and `@apidevtools/swagger-parser` declarations. The generator owns both versions and resolves its own nested copies; consumer declarations never affected generation and are now actively misleading. Keep `commander` where `index.mjs` uses it.
- Every repo needs `@ayasofyazilim-clomerce:registry=https://npm.pkg.github.com` in its `.npmrc`. web-app already has one; super-app, pos-app, core-mobile and core-project do not.
- **Never put `_authToken` in a repo `.npmrc`.** It goes in the developer's own `~/.npmrc`, and in CI from a secret. web-app's committed `.npmrc` documents this and is the model to copy.
- **Shared checkouts.** Other agent sessions work in these directories. Never run `git stash`, `git reset --hard`, or `git checkout <branch>` in a shared checkout. Stage only the files the task names — never `git add -A`. If a repo's `git status` shows changes the task did not make, leave them alone and say so in the report.
- **web-app and super-app are worked in git worktrees, not in place.** web-app's checkout sits on another session's branch (`feat/explore-merchants-viewport`) and super-app's has six uncommitted foreign files. The other three repos are clean on `main` and are worked in place.
- **core-mobile must land before or with super-app, never after.** super-app carries core-mobile as the `core` remote and the two sync via a real `git merge core/main`. A one-sided deletion of the vendored generator makes that merge conflict, or silently re-forks super-app.
- Verification baselines live in each repo's own `AGENTS.md`. **Re-measure them; never quote a remembered number.** A regenerated SDK changes type surfaces, so the only meaningful check is "same as this repo's baseline before my change".
- After regenerating, run the affected package's own prettier pass. Without it the diff is thousands of lines of quote and indentation churn that hides the real change.
- The expected core diff in super-app, pos-app and core-mobile is **the patch and nothing else** — they already generate on hey-api 0.60.1. Any other change means an assumption is wrong: stop and investigate rather than committing it.

## Verification shared by every task

After regenerating, in the package or `src/saas` directory that owns the shared core:

```bash
# exactly one shared core, no per-service copies
find . -maxdepth 2 -name core -type d
# the fix is present
grep -A1 "else if (response.ok)" core/request.ts
# no single-dot specifiers left
grep -rn "'\./core/\|\"\./core/" */*.ts | head
# regenerating twice is a no-op
```

---

### Task 1: web-app — 17 cores to 2, and the reported bug fixed

**Files:**
- Worktree: `C:/unirefund/web-app-sdk` (new, from `origin/main`)
- Modify: `packages/saas/package.json`, `packages/saas/index.mjs`
- Modify: `packages/core-saas/package.json`, `packages/core-saas/index.mjs`
- Regenerate: `packages/saas/{13 services}`, `packages/core-saas/{4 services}`
- Delete: 17 per-service `core/` directories (by regeneration, not by hand)

**Interfaces:**
- Consumes: the published `@ayasofyazilim-clomerce/sdk-generator@0.1.0`.
- Produces: `packages/saas/core/` and `packages/core-saas/core/`, each a single shared runtime carrying the `response.ok` blob fallback. Nothing outside these packages imports `core/…`, verified by grep, so no consumer code changes.

This task is first because it is the one that fixes the reported `.xlsx` export.

- [ ] **Step 1: Create an isolated worktree**

The live checkout is on another session's branch. Do not switch it.

```bash
cd /c/unirefund/web-app
git fetch origin
git worktree add /c/unirefund/web-app-sdk -b chore/sdk-generator-shared-core origin/main
cd /c/unirefund/web-app-sdk
git branch --show-current   # expect chore/sdk-generator-shared-core
```

- [ ] **Step 2: Swap the dependency in both SDK packages**

In `packages/saas/package.json`, inside `dependencies`, remove these three lines:

```json
    "@ayasofyazilim/sdk_generator": "latest",
    "@apidevtools/swagger-parser": "^12.0.0",
    "@hey-api/openapi-ts": "^0.83.1",
```

and add:

```json
    "@ayasofyazilim-clomerce/sdk-generator": "0.1.0",
```

Leave `@workspace/typescript-config` and `commander` untouched — `index.mjs` needs `commander`.

Apply the same change to `packages/core-saas/package.json`. Its swagger-parser and hey-api version strings may differ; remove them whatever they say.

- [ ] **Step 3: Point both index.mjs files at the new package**

In `packages/saas/index.mjs` and `packages/core-saas/index.mjs`, change the first import:

```js
import { default as SDKGenerator } from "@ayasofyazilim-clomerce/sdk-generator";
```

Nothing else in either file changes. They keep their `commander` CLI and their own `API_LIST.json`.

- [ ] **Step 4: Install**

```bash
cd /c/unirefund/web-app-sdk
pnpm install
```

`.npmrc` already maps the scope. If this fails with `ERR_PNPM_FETCH_401`, your `~/.npmrc` lacks a `//npm.pkg.github.com/:_authToken` with `read:packages` — fix that, do not add a token to the repo.

- [ ] **Step 5: Record the typecheck baseline BEFORE regenerating**

```bash
cd /c/unirefund/web-app-sdk/apps/web
pnpm run init && npx tsc --noEmit 2>&1 | tee /tmp/tsc-before.txt | tail -5
grep -c "error TS" /tmp/tsc-before.txt
```

Write that number in your report. apps/web is expected to show TS2307 errors for the `mrz` capture-SDK subpath without a private token; that is the baseline, not a regression.

- [ ] **Step 6: Regenerate both packages**

```bash
cd /c/unirefund/web-app-sdk/packages/saas && pnpm gen
cd /c/unirefund/web-app-sdk/packages/core-saas && pnpm gen
```

Use `pnpm gen` (which runs `index.mjs`), never `new.mjs` — `new.mjs` deletes `core/` and the client and breaks `packages/actions`.

- [ ] **Step 7: Verify the centralization**

```bash
cd /c/unirefund/web-app-sdk
for P in packages/saas packages/core-saas; do
  echo "--- $P"
  (cd $P && find . -maxdepth 2 -name core -type d)
  (cd $P && grep -c "else if (response.ok)" core/request.ts)
  (cd $P && grep -rn "'\./core/" */*.ts | head -3)
done
```

Expected per package: exactly `./core`, a count of `1`, and no single-dot hits. 17 core directories become 2.

- [ ] **Step 8: Prettier pass on both packages**

`packages/saas` has a `format` script; `packages/core-saas` does not, so run the same prettier invocation directly there:

```bash
cd /c/unirefund/web-app-sdk/packages/saas && pnpm format
cd /c/unirefund/web-app-sdk/packages/core-saas && npx prettier --write "**/*.{ts,md}" --trailing-comma es5
```

- [ ] **Step 9: Confirm regeneration is idempotent**

```bash
cd /c/unirefund/web-app-sdk/packages/saas && pnpm gen && pnpm format
cd /c/unirefund/web-app-sdk && git status --porcelain packages/saas | head
```

Expected: no output. A second generation must change nothing.

- [ ] **Step 10: Typecheck against the recorded baseline**

```bash
cd /c/unirefund/web-app-sdk/apps/web
pnpm run init && npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Must equal Step 5's number. If higher, the new count and the new errors go in your report — do not commit.

- [ ] **Step 11: Run the unit tests**

```bash
cd /c/unirefund/web-app-sdk/apps/web && pnpm test:unit
```

- [ ] **Step 12: Commit**

Stage explicitly — this is a worktree off `main`, but the discipline matters and web-app's `lint-staged` can sweep an unstaged submodule pointer into your commit.

```bash
cd /c/unirefund/web-app-sdk
git add packages/saas packages/core-saas pnpm-lock.yaml
git commit -m "chore: adopt @ayasofyazilim-clomerce/sdk-generator, share one core per package"
git show --name-only --oneline HEAD | head -20
```

`pnpm-lock.yaml` **must** be in that list. The dependency swap changes it, and a commit whose `package.json` names a dependency the lockfile does not resolve fails CI's `--frozen-lockfile` install. (Corrected during execution: the original staging list omitted it.)

Check that last output for anything you did not intend to stage, particularly a submodule pointer bump.

---

### Task 2: core-mobile — drop the vendored fork

**Files:**
- Create: `.npmrc`
- Modify: `package.json`, `src/saas/index.mjs`
- Delete: `src/saas/generator.mjs`
- Regenerate: `src/saas/{4 services}` + `src/saas/core/`

**Interfaces:**
- Consumes: the published package.
- Produces: `src/saas/core/request.ts` carrying the patch. The 4 service directories keep their existing `../core/…` imports unchanged, because this repo is already centralized.

Worked **in place** — the checkout is clean on `main`. This runs before super-app.

- [ ] **Step 1: Confirm the checkout is still clean**

```bash
cd /c/unirefund/core
git status --porcelain
git branch --show-current
```

Expected: no output, `main`. If there are changes you did not make, stop and report — another session owns them.

- [ ] **Step 2: Add the registry mapping**

Create `.npmrc` at the repo root:

```
# The @ayasofyazilim-clomerce SDK generator is published to GitHub Packages,
# not the public npm registry. This line only maps the scope; it is committed.
#
# NEVER add an _authToken line here. Your credential goes in your own
# ~/.npmrc, outside the repo:
#
#   //npm.pkg.github.com/:_authToken=<PAT with read:packages>
#
# CI writes the same line from a secret.
@ayasofyazilim-clomerce:registry=https://npm.pkg.github.com
```

- [ ] **Step 3: Swap the dependencies**

In `package.json`, remove `"@apidevtools/swagger-parser": "^10.1.0"` and any `"@hey-api/openapi-ts"` entry, and add to the same section:

```json
    "@ayasofyazilim-clomerce/sdk-generator": "0.1.0",
```

- [ ] **Step 4: Replace src/saas/index.mjs**

The vendored file has two latent bugs: its CLI is guarded by `if (!isMain)`, which is inverted and only works by accident on Windows, and `parseArgs` references `PKG.version` without importing `PKG`. Replace the whole file:

```js
#! /usr/bin/env node

import SDKGenerator from "@ayasofyazilim-clomerce/sdk-generator";
import API_LIST from "./API_LIST.json" with { type: "json" };

function printHelpAndExit() {
  const filterChoices = API_LIST.map((x) => x.output).join(", ");
  console.log(`
Usage:
  node index.mjs -u <url> [-f <filter>]

Options:
  -u, --url <string>     Webgateway url (required)
  -f, --filter <string>  Output name to filter. One of: ${filterChoices}
  -h, --help             Show this help message
`);
  process.exit(0);
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "-u":
      case "--url":
        options.url = argv[++i];
        break;
      case "-f":
      case "--filter":
        options.filter = argv[++i];
        break;
      case "-h":
      case "--help":
        printHelpAndExit();
        break;
      default:
        console.error(`Unknown argument: ${argv[i]}`);
        printHelpAndExit();
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));

if (!options.url) {
  console.error("Error: -u, --url <string> is required\n");
  printHelpAndExit();
}

const filterChoices = API_LIST.map((x) => x.output);
if (options.filter && !filterChoices.includes(options.filter)) {
  console.error(
    `Error: invalid filter "${options.filter}". Must be one of: ${filterChoices.join(", ")}\n`,
  );
  process.exit(1);
}

await SDKGenerator.generateApi({
  api_list: options.filter
    ? API_LIST.filter((x) => x.output === options.filter)
    : API_LIST,
  base_url: options.url,
  webgateway_port: "",
});
```

This drops the broken `isMain` guard entirely — the file is only ever run as a CLI — and drops the `-v` flag that referenced the missing `PKG`.

- [ ] **Step 5: Delete the vendored generator**

```bash
cd /c/unirefund/core
git rm src/saas/generator.mjs
```

- [ ] **Step 6: Install**

```bash
npm install
```

- [ ] **Step 7: Record the typecheck baseline BEFORE regenerating**

```bash
cd /c/unirefund/core
npm run init && npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Note it in your report. `npm run init` needs `SUPPORTED_LOCALES` set, or tsc reports three phantom TS2307s that are not real.

- [ ] **Step 8: Regenerate**

This repo's `gen` script points at a placeholder domain (`your-gateway-domain.example.com`) because it is the generic template, so pass the real gateway explicitly:

```bash
cd /c/unirefund/core/src/saas
node index.mjs -u "https://dev-api.unirefund.com"
```

- [ ] **Step 9: Verify the core diff is ONLY the patch**

```bash
cd /c/unirefund/core
git diff --stat src/saas/core/
git diff src/saas/core/request.ts
```

Expected: `request.ts` changed, and the only hunk is the added `} else if (response.ok) { return await response.blob(); }`. If any other core file changed, or `request.ts` shows other hunks, **stop and report** — this repo already generates on hey-api 0.60.1, so anything else contradicts the plan's assumptions.

- [ ] **Step 10: Verify centralization held**

```bash
cd /c/unirefund/core/src/saas
find . -maxdepth 2 -name core -type d
grep -c "else if (response.ok)" core/request.ts
```

Expected: `./core` only, count `1`.

- [ ] **Step 11: Typecheck and test against baseline**

```bash
cd /c/unirefund/core
npm run init && npx tsc --noEmit 2>&1 | grep -c "error TS"
npm test 2>&1 | tail -20
```

The tsc count must equal Step 7's. Report the test result against this repo's `AGENTS.md` baseline, re-measured — do not quote a remembered figure.

- [ ] **Step 12: Commit, staging only your own files**

```bash
cd /c/unirefund/core
git add .npmrc package.json package-lock.json src/saas
git commit -m "chore: adopt @ayasofyazilim-clomerce/sdk-generator, drop the vendored fork"
git show --name-only --oneline HEAD | head -20
```

---

### Task 3: super-app — drop the vendored fork

**Files:**
- Worktree: `C:/unirefund/super-app-sdk` (new, from `origin/main`)
- Create: `.npmrc`
- Modify: `package.json`, `src/saas/index.mjs`
- Delete: `src/saas/generator.mjs`
- Regenerate: `src/saas/{12 services}` + `src/saas/core/`

**Interfaces:**
- Consumes: the published package. Its `src/saas/index.mjs` is byte-identical to core-mobile's and pos-app's before the change, so it takes the same replacement.
- Produces: `src/saas/core/request.ts` carrying the patch.

Worked in a **worktree** — the live checkout has six uncommitted foreign files. Must land after or with Task 2.

- [ ] **Step 1: Create an isolated worktree with real node_modules**

```bash
cd /c/unirefund/super-app
git fetch origin
git worktree add /c/unirefund/super-app-sdk -b chore/sdk-generator-adopt origin/main
cd /c/unirefund/super-app-sdk
git branch --show-current
```

Do not junction or symlink `node_modules` from the main checkout — a junctioned `node_modules` makes the Expo dev client fail with "Unable to load script", and removing it later can recurse into the main checkout. This task never starts Expo, but the install must be real anyway.

- [ ] **Step 2: Add the registry mapping**

Create `.npmrc` at the worktree root with exactly the content given in Task 2 Step 2.

- [ ] **Step 3: Swap the dependencies**

In `package.json`, remove `"@apidevtools/swagger-parser": "^10.1.0"` and any `"@hey-api/openapi-ts"` entry, and add:

```json
    "@ayasofyazilim-clomerce/sdk-generator": "0.1.0",
```

- [ ] **Step 4: Replace src/saas/index.mjs**

Use exactly the file given in Task 2 Step 4 — the two repos' originals are byte-identical (md5 `548ef241e350c3bcd2cd7d207486d93c`), so the replacement is the same.

- [ ] **Step 5: Delete the vendored generator**

```bash
cd /c/unirefund/super-app-sdk
git rm src/saas/generator.mjs
```

- [ ] **Step 6: Install**

```bash
npm install
```

- [ ] **Step 7: Record the baselines BEFORE regenerating**

```bash
cd /c/unirefund/super-app-sdk
npm run init && npx tsc --noEmit 2>&1 | grep -c "error TS"
npm test 2>&1 | grep -E "Tests:|Suites:" | tail -3
```

Record both. Note that `npm test` in this repo also picks up sibling worktrees' tests if any are nested; if the numbers look implausible, say so rather than treating them as the baseline.

- [ ] **Step 8: Regenerate**

```bash
cd /c/unirefund/super-app-sdk
npm run gen
```

- [ ] **Step 9: Verify the core diff is ONLY the patch**

```bash
cd /c/unirefund/super-app-sdk
git diff --stat src/saas/core/
git diff src/saas/core/request.ts
```

Same expectation as Task 2 Step 9: one hunk, the `response.ok` branch. Anything else — stop and report.

- [ ] **Step 10: Verify centralization held**

```bash
cd /c/unirefund/super-app-sdk/src/saas
find . -maxdepth 2 -name core -type d
grep -c "else if (response.ok)" core/request.ts
```

- [ ] **Step 11: Typecheck and test against baselines**

```bash
cd /c/unirefund/super-app-sdk
npm run init && npx tsc --noEmit 2>&1 | grep -c "error TS"
npm test 2>&1 | grep -E "Tests:|Suites:" | tail -3
```

Both must match Step 7. Prettier is not a gate in this repo — it fails repo-wide on CRLF regardless of this change, so do not treat that as a regression.

- [ ] **Step 12: Commit**

```bash
cd /c/unirefund/super-app-sdk
git add .npmrc package.json package-lock.json src/saas
git commit -m "chore: adopt @ayasofyazilim-clomerce/sdk-generator, drop the vendored fork"
git show --name-only --oneline HEAD | head -20
```

---

### Task 4: pos-app — drop the vendored fork

**Files:**
- Create: `.npmrc`
- Modify: `package.json`, `src/saas/index.mjs`
- Delete: `src/saas/generator.mjs`
- Regenerate: `src/saas/{17 services}` + `src/saas/core/`

**Interfaces:**
- Consumes: the published package. Same byte-identical `index.mjs` replacement as Tasks 2 and 3.
- Produces: `src/saas/core/request.ts` carrying the patch. 17 services, the largest service count of any consumer.

Worked **in place** — clean on `main`.

- [ ] **Step 1: Confirm the checkout is still clean**

```bash
cd /c/unirefund/pos-app
git status --porcelain
git branch --show-current
```

Expected: no output, `main`. Anything else — stop and report.

- [ ] **Step 2: Add the registry mapping**

Create `.npmrc` at the repo root with exactly the content given in Task 2 Step 2.

- [ ] **Step 3: Swap the dependencies**

In `package.json`, remove `"@apidevtools/swagger-parser": "^12.0.0"` and any `"@hey-api/openapi-ts"` entry, and add:

```json
    "@ayasofyazilim-clomerce/sdk-generator": "0.1.0",
```

- [ ] **Step 4: Replace src/saas/index.mjs**

Use exactly the file given in Task 2 Step 4 — this repo's original is byte-identical to the other two.

- [ ] **Step 5: Delete the vendored generator**

```bash
cd /c/unirefund/pos-app
git rm src/saas/generator.mjs
```

- [ ] **Step 6: Install**

```bash
npm install
```

- [ ] **Step 7: Record the baselines BEFORE regenerating**

```bash
cd /c/unirefund/pos-app
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm test 2>&1 | grep -E "Tests:|Suites:" | tail -3
```

Record both. Prettier is **not** a gate in this repo — a large number of files fail it at baseline.

- [ ] **Step 8: Regenerate**

```bash
cd /c/unirefund/pos-app
npm run gen
```

- [ ] **Step 9: Verify the core diff is ONLY the patch**

```bash
cd /c/unirefund/pos-app
git diff --stat src/saas/core/
git diff src/saas/core/request.ts
```

One hunk, the `response.ok` branch. Anything else — stop and report.

- [ ] **Step 10: Verify centralization held**

```bash
cd /c/unirefund/pos-app/src/saas
find . -maxdepth 2 -name core -type d
grep -c "else if (response.ok)" core/request.ts
```

- [ ] **Step 11: Typecheck and test against baselines**

```bash
cd /c/unirefund/pos-app
npx tsc --noEmit 2>&1 | grep -c "error TS"
npm test 2>&1 | grep -E "Tests:|Suites:" | tail -3
```

Both must match Step 7.

- [ ] **Step 12: Commit**

```bash
cd /c/unirefund/pos-app
git add .npmrc package.json package-lock.json src/saas
git commit -m "chore: adopt @ayasofyazilim-clomerce/sdk-generator, drop the vendored fork"
git show --name-only --oneline HEAD | head -20
```

---

### Task 5: ayasofyazilim-core-project — 4 cores to 1

**Files:**
- Create: `.npmrc`
- Modify: `packages/core-saas/package.json`, `packages/core-saas/index.mjs`
- Regenerate: `packages/core-saas/{4 services}`
- Delete: 4 per-service `core/` directories (by regeneration)

**Interfaces:**
- Consumes: the published package. Its `index.mjs` is byte-identical to web-app's two (md5 `ff14a45e6d0e6e595090cd053f202fa5`), so it takes the same one-line import change as Task 1 Step 3.
- Produces: `packages/core-saas/core/`, a single shared runtime with the patch.

Worked **in place** — clean on `main`. This repo is the base template web-app's `core-saas` is synced from, so its result should match web-app's `packages/core-saas` after Task 1.

- [ ] **Step 1: Confirm the checkout is still clean**

```bash
cd /c/unirefund/ayasofyazilim-core-project
git status --porcelain
git branch --show-current
```

- [ ] **Step 2: Add the registry mapping**

Create `.npmrc` at the repo root with exactly the content given in Task 2 Step 2.

- [ ] **Step 3: Swap the dependencies**

In `packages/core-saas/package.json`, remove `"@ayasofyazilim/sdk_generator"`, `"@apidevtools/swagger-parser"` and `"@hey-api/openapi-ts"`, and add:

```json
    "@ayasofyazilim-clomerce/sdk-generator": "0.1.0",
```

Keep `commander`.

- [ ] **Step 4: Point index.mjs at the new package**

In `packages/core-saas/index.mjs`, change the first import to:

```js
import { default as SDKGenerator } from "@ayasofyazilim-clomerce/sdk-generator";
```

Nothing else changes.

- [ ] **Step 5: Install**

```bash
cd /c/unirefund/ayasofyazilim-core-project
pnpm install
```

- [ ] **Step 6: Record the typecheck baseline BEFORE regenerating**

```bash
cd /c/unirefund/ayasofyazilim-core-project
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

- [ ] **Step 7: Regenerate**

```bash
cd /c/unirefund/ayasofyazilim-core-project/packages/core-saas
pnpm gen
```

Never `new.mjs`.

- [ ] **Step 8: Verify the centralization**

```bash
cd /c/unirefund/ayasofyazilim-core-project/packages/core-saas
find . -maxdepth 2 -name core -type d
grep -c "else if (response.ok)" core/request.ts
grep -rn "'\./core/" */*.ts | head -3
```

Expected: `./core` only, count `1`, no single-dot hits. 4 core directories become 1.

- [ ] **Step 9: Prettier pass**

This package has no `format` script, so invoke prettier directly with the same options web-app's `packages/saas` uses:

```bash
cd /c/unirefund/ayasofyazilim-core-project/packages/core-saas && npx prettier --write "**/*.{ts,md}" --trailing-comma es5
```

- [ ] **Step 10: Confirm the result matches web-app's core-saas**

Task 1 produced the same package in web-app from the same template. They should now agree ignoring whitespace:

```bash
diff -w -r /c/unirefund/ayasofyazilim-core-project/packages/core-saas/core \
          /c/unirefund/web-app-sdk/packages/core-saas/core && echo "cores agree"
```

If they differ, report the diff — it means one repo generated against a different gateway state, and the two are supposed to stay in sync.

- [ ] **Step 11: Typecheck against baseline**

```bash
cd /c/unirefund/ayasofyazilim-core-project
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Must equal Step 6's number.

- [ ] **Step 12: Commit**

```bash
cd /c/unirefund/ayasofyazilim-core-project
git add .npmrc packages/core-saas pnpm-lock.yaml
git commit -m "chore: adopt @ayasofyazilim-clomerce/sdk-generator, share one core"
git show --name-only --oneline HEAD | head -20
```

---

## Acceptance test for the original report

After Task 1, with the worktree's dev server running:

```bash
cd /c/unirefund/web-app-sdk/apps/web && pnpm dev
```

Open `/en/finance/agent-cash-report`, set a window, run the report, click Export. The downloaded file must begin with the bytes `PK\x03\x04` and open in Excel — not be a 9-byte file containing the word `undefined`.

```bash
head -c 4 ~/Downloads/agent-cash-report-*.xlsx | od -c | head -1
```

## After all five tasks

- Deprecate the old package so a floating install cannot resurrect the un-patched generator. Needs npm publish rights on `@ayasofyazilim/sdk_generator`:
  `npm deprecate @ayasofyazilim/sdk_generator "moved to @ayasofyazilim-clomerce/sdk-generator on GitHub Packages"`
- Add the GitHub Packages credential to each repo's CI that installs dependencies (super-app, pos-app, core-mobile have no `.npmrc` today, so their CI has never needed one).
- ~~Grep each consumer for non-json, non-binary 2xx responses.~~ **Resolved during execution, no grep needed.** The new branch fires only when `Content-Type` matches none of the four existing branches — and in exactly that case the old code returned `undefined`, so any call site reaching it was already broken. A call site that worked did so by matching one of the four untouched branches. The change can therefore only convert a broken `undefined` into a working `Blob`; it cannot break something that worked. Measured bound in web-app: only two services declare a `Blob`/`File` response, four carry documented binary endpoints, and 28 response types are declared `string` and travel the untouched `text/*` branch.

### Follow-up: core-project's tenant forms (filed 2026-09-10)

`ayasofyazilim-core-project`'s two tenant forms —
`apps/web/src/app/[lang]/(main)/(core)/management/saas/tenants/new/_components/form.tsx`
and `.../tenants/[tenantId]/_components/form.tsx` — reference
`Volo_Saas_Host_Dtos_SaasTenantCreateDto` / `...UpdateDto`, which the backend has
renamed to `UniRefund_SaasService_Tenants_SaasTenantCustomCreateDto` /
`...CustomUpdateDto`. Task 5's regeneration surfaced this as 4 new `TS2724`
errors (7745 → 7749).

**These forms are already broken against the live backend**; core-project's
SaasService SDK had simply never been regenerated, so the stale types kept them
compiling. The regeneration removed that crutch rather than causing the problem.

web-app has already migrated its equivalents — same file paths, new DTO names —
so a working reference exists. It is not a mechanical port: the two versions
differ by roughly 230 lines each and web-app's are ~40 lines longer, so the work
includes deciding which of web-app's changes belong in a generic template and
which are product-specific. That judgment is why this was filed rather than
folded into the rollout.

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| web-app: swap dep, drop vestigial deps, regenerate, 17 cores → 2 | 1 |
| web-app: prettier pass after regeneration | 1 |
| super-app: drop fork, add `.npmrc`, regenerate | 3 |
| pos-app: drop fork, add `.npmrc`, regenerate | 4 |
| core-mobile: drop fork, add `.npmrc`, regenerate | 2 |
| core-mobile lands before super-app | Task order 2 → 3, stated in both |
| ayasofyazilim-core-project: 4 cores → 1 | 5 |
| Each repo keeps its own thin `index.mjs` | 1, 2, 3, 4, 5 |
| Fix the vendored `index.mjs` `isMain` and `PKG` bugs | 2, 3, 4 (the file is replaced) |
| Core diff must be the patch and nothing else | 2, 3, 4 (Step 9 each) |
| Re-measure baselines, never quote | Global Constraints + every task's Step 7-ish |
| Acceptance test on the real export | "Acceptance test" section |

**Placeholder scan:** no TBD/TODO. Every edit names the exact lines to remove and the exact text to add. The one repeated file (`index.mjs`) is given in full in Task 2 and referenced by md5 from Tasks 3 and 4, which is a verifiable identity rather than a "similar to Task N".

**Type consistency:** the dependency string `"@ayasofyazilim-clomerce/sdk-generator": "0.1.0"` and the import specifier `@ayasofyazilim-clomerce/sdk-generator` are identical in all five tasks. `SDKGenerator.generateApi({ api_list, base_url, webgateway_port })` matches the published package's exported shape.

**Ordering check:** Task 5 Step 10 diffs core-project's generated core against web-app's, so it depends on Task 1 having produced `/c/unirefund/web-app-sdk`. If Task 5 runs before Task 1, or the web-app worktree has been removed, skip that step and say so rather than treating the missing path as a failure.
