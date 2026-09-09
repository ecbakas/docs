# SDK generator: shared core + binary-response fix — Implementation Plan (1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `OpenAPI-SDK-generator` into a published GitHub Packages package that emits one shared `core/` per generation root and permanently fixes the binary-response bug that corrupts `.xlsx` downloads.

**Architecture:** The post-generation filesystem work moves into a new dependency-free module (`core-postprocess.mjs`) so it is unit-testable without installing `@hey-api/openapi-ts`. `generator.mjs` keeps orchestration only. The binary fix is applied to generated output by `patchResponseBody()`, which throws when its anchor is absent, so a hey-api change fails generation instead of silently restoring the bug.

**Tech Stack:** Node ESM (`.mjs`), `node:test` + `node:assert` (no test dependency), `@hey-api/openapi-ts@0.60.1` (pinned), GitHub Actions, GitHub Packages npm registry.

**Spec:** `docs/superpowers/specs/2026-09-09-sdk-generator-shared-core-design.md`

## Global Constraints

- Package name is exactly `@ayasofyazilim-clomerce/sdk-generator`. The scope is forced: GitHub Packages requires it to match the publishing repo's owner, and no `unirefund` org exists.
- `@hey-api/openapi-ts` is pinned to exactly `0.60.1` — no caret, no bump. `0.86.0` is the last version shipping the legacy client; `0.87.0` removed it. A range that crosses 0.87.0 breaks generation entirely.
- The generated client shape does not change. `client: { name: "legacy/fetch", bundle: true }` stays.
- `patchResponseBody()` must throw, never warn, when its anchor is missing.
- The blob fallback is scoped to `response.ok` so error-response handling is untouched.
- Repo is public; nothing secret goes in it. Publishing uses `GITHUB_TOKEN` inside Actions only.
- The `test` script is exactly `node --test`, with no path and no glob. Corrected during execution: the originally planned `node --test test/` is broken on Node 22.19.0 — Node treats a directory argument as a module to load and fails with `Cannot find module '<abs>/test'`, discovering 1 "test" and failing it. A `test/*.mjs` glob works only where the shell expands it, so it is not safe for a `cmd`-based Windows run. Bare `node --test` uses Node's own recursive discovery, needs no shell expansion, and gives 5/5 identically on Windows and `ubuntu-latest`.
- This plan ends at a pushed tag. The first publish is fired by the repo owner; do not attempt `npm publish` locally (the available token lacks `write:packages`).

## Scope

This is plan 1 of 2. It covers the generator repo only. The four consumer migrations (web-app, super-app, pos-app, ayasofyazilim-core-project) are plan 2, written after the package is published, because their dependency version does not exist until then.

---

### Task 1: Working copy and the shared-core post-processor

**Files:**
- Create: `C:\unirefund\OpenAPI-SDK-generator` (clone)
- Create: `core-postprocess.mjs`
- Test: `test/core-postprocess.test.mjs`
- Modify: `package.json` (add the `test` script only)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `CORE_DIR` (string `"core"`), `centralizeCore(serviceDir, alreadyCentralized, root = ".") -> boolean`, `rewriteCoreImports(serviceDir) -> void`. Task 2 adds `patchResponseBody` to this same module. Task 3 imports all of them into `generator.mjs`.

Why a separate module: `generator.mjs` imports `@hey-api/openapi-ts` at top level, so importing it in a test forces a full dependency install. These functions touch only `node:fs`, so isolating them keeps the tests dependency-free and fast.

- [ ] **Step 1: Clone the repo and branch**

```bash
cd /c/unirefund
gh repo clone ayasofyazilim-clomerce/OpenAPI-SDK-generator
cd OpenAPI-SDK-generator
git checkout -b feat/shared-core-and-binary-fix
```

`/c/unirefund` is not itself a git repo, so this sits alongside `web-app`, `super-app` and the rest exactly as they do.

- [ ] **Step 2: Add the test script**

In `package.json`, inside `"scripts"`, add:

```json
"test": "node --test"
```

- [ ] **Step 3: Write the failing test**

Create `test/core-postprocess.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CORE_DIR, centralizeCore, rewriteCoreImports } from "../core-postprocess.mjs";

// Builds a throwaway generation root holding one service that still has its
// own freshly generated `core/`, the way hey-api leaves it.
function makeRoot(serviceNames) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdkgen-"));
  for (const name of serviceNames) {
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, CORE_DIR), { recursive: true });
    fs.writeFileSync(path.join(dir, CORE_DIR, "request.ts"), "// core runtime\n");
    fs.writeFileSync(
      path.join(dir, `${name}Client.ts`),
      [
        "import type { BaseHttpRequest } from './core/BaseHttpRequest';",
        "import { OpenAPI } from \"./core/OpenAPI\";",
        "export * from './sdk.gen';",
      ].join("\n"),
    );
  }
  return root;
}

test("first service donates its core to the shared folder", () => {
  const root = makeRoot(["AService"]);
  const centralized = centralizeCore(path.join(root, "AService"), false, root);

  assert.equal(centralized, true);
  assert.ok(fs.existsSync(path.join(root, CORE_DIR, "request.ts")));
  assert.equal(fs.existsSync(path.join(root, "AService", CORE_DIR)), false);
});

test("later services drop their duplicate core", () => {
  const root = makeRoot(["AService", "BService"]);
  centralizeCore(path.join(root, "AService"), false, root);
  const centralized = centralizeCore(path.join(root, "BService"), true, root);

  assert.equal(centralized, true);
  assert.equal(fs.existsSync(path.join(root, "BService", CORE_DIR)), false);
  assert.ok(fs.existsSync(path.join(root, CORE_DIR, "request.ts")));
});

test("core specifiers are repointed one level up", () => {
  const root = makeRoot(["AService"]);
  centralizeCore(path.join(root, "AService"), false, root);

  const src = fs.readFileSync(path.join(root, "AService", "AServiceClient.ts"), "utf8");
  assert.match(src, /from '\.\.\/core\/BaseHttpRequest'/);
  assert.match(src, /from "\.\.\/core\/OpenAPI"/);
  assert.doesNotMatch(src, /'\.\/core\//);
  assert.doesNotMatch(src, /"\.\/core\//);
});

test("unrelated specifiers are left alone", () => {
  const root = makeRoot(["AService"]);
  centralizeCore(path.join(root, "AService"), false, root);

  const src = fs.readFileSync(path.join(root, "AService", "AServiceClient.ts"), "utf8");
  assert.match(src, /from '\.\/sdk\.gen'/);
});

test("rewriting twice is a no-op", () => {
  const root = makeRoot(["AService"]);
  centralizeCore(path.join(root, "AService"), false, root);
  const once = fs.readFileSync(path.join(root, "AService", "AServiceClient.ts"), "utf8");

  rewriteCoreImports(path.join(root, "AService"));
  const twice = fs.readFileSync(path.join(root, "AService", "AServiceClient.ts"), "utf8");

  assert.equal(twice, once);
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../core-postprocess.mjs'`.

- [ ] **Step 5: Write the implementation**

Create `core-postprocess.mjs`:

```js
import fs from "node:fs";
import path from "node:path";

// Name of the single, shared core runtime folder kept at the generation root.
export const CORE_DIR = "core";

// hey-api emits an identical `core/` runtime inside every generated service.
// Rather than keep N duplicate copies, keep one at `<root>/core` and repoint
// every service's `./core/...` specifiers at it.
//
// The first service in a run donates its freshly generated core, so the shared
// copy always matches the version that just ran; later services drop theirs.
export function centralizeCore(serviceDir, alreadyCentralized, root = ".") {
  const sharedCore = path.join(root, CORE_DIR);
  const serviceCore = path.join(serviceDir, CORE_DIR);

  if (fs.existsSync(serviceCore)) {
    if (alreadyCentralized) {
      fs.rmSync(serviceCore, { recursive: true, force: true });
    } else {
      fs.rmSync(sharedCore, { recursive: true, force: true });
      fs.renameSync(serviceCore, sharedCore);
      alreadyCentralized = true;
    }
  }

  rewriteCoreImports(serviceDir);
  return alreadyCentralized;
}

// Rewrite `./core/...` specifiers to `../core/...`. The lookahead keeps the
// match scoped to module specifiers, and makes the rewrite idempotent:
// `'../core/...'` no longer matches.
export function rewriteCoreImports(serviceDir) {
  for (const entry of fs.readdirSync(serviceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    const filePath = path.join(serviceDir, entry.name);
    const source = fs.readFileSync(filePath, "utf8");
    const updated = source.replace(/(['"])\.\/core(?=['"/])/g, "$1../core");
    if (updated !== source) fs.writeFileSync(filePath, updated);
  }
}
```

This is the super-app/pos-app fork's logic with one change: `root` is a parameter instead of an implicit `process.cwd()`, which is what makes the tests above possible.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 5 tests.

- [ ] **Step 7: Commit**

```bash
git add core-postprocess.mjs test/core-postprocess.test.mjs package.json
git commit -m "feat: add shared-core post-processor with tests"
```

---

### Task 2: The binary-response patch

**Files:**
- Modify: `core-postprocess.mjs`
- Modify: `test/core-postprocess.test.mjs`

**Interfaces:**
- Consumes: `CORE_DIR` from Task 1.
- Produces: `patchResponseBody(root = ".") -> boolean` — `true` when it patched, `false` when already patched, throws `Error` when the anchor is missing. Task 3 calls it once per run, after the last `centralizeCore`.

Anchor rationale: `response.text()` occurs exactly once in `core/request.ts`, verified against both the raw hey-api output and the prettier-formatted variant. It is the last branch of the content-type chain, so appending an `else if` after its closing brace is the minimal correct edit.

- [ ] **Step 1: Write the failing test**

Append to `test/core-postprocess.test.mjs`:

```js
import { patchResponseBody } from "../core-postprocess.mjs";

// Verbatim hey-api 0.60.1 legacy output: tab-indented, single-quoted. This is
// what the patch actually sees, since prettier runs later in the consumer.
const RAW_REQUEST_TS = [
  "export const getResponseBody = async (response: Response): Promise<unknown> => {",
  "\tif (response.status !== 204) {",
  "\t\ttry {",
  "\t\t\tconst contentType = response.headers.get('Content-Type');",
  "\t\t\tif (contentType) {",
  "\t\t\t\tconst binaryTypes = ['application/octet-stream', 'application/pdf'];",
  "\t\t\t\tif (contentType.includes('application/json')) {",
  "\t\t\t\t\treturn await response.json();",
  "\t\t\t\t} else if (binaryTypes.some(type => contentType.includes(type))) {",
  "\t\t\t\t\treturn await response.blob();",
  "\t\t\t\t} else if (contentType.includes('multipart/form-data')) {",
  "\t\t\t\t\treturn await response.formData();",
  "\t\t\t\t} else if (contentType.includes('text/')) {",
  "\t\t\t\t\treturn await response.text();",
  "\t\t\t\t}",
  "\t\t\t}",
  "\t\t} catch (error) {",
  "\t\t\tconsole.error(error);",
  "\t\t}",
  "\t}",
  "\treturn undefined;",
  "};",
  "",
].join("\n");

// The same function after a consumer's prettier pass: spaces, double quotes.
const PRETTIER_REQUEST_TS = RAW_REQUEST_TS.replace(/\t/g, "  ").replace(/'/g, '"');

function rootWithCore(contents) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sdkgen-patch-"));
  fs.mkdirSync(path.join(root, CORE_DIR), { recursive: true });
  fs.writeFileSync(path.join(root, CORE_DIR, "request.ts"), contents);
  return root;
}

test("adds a blob fallback after the text branch", () => {
  const root = rootWithCore(RAW_REQUEST_TS);
  assert.equal(patchResponseBody(root), true);

  const src = fs.readFileSync(path.join(root, CORE_DIR, "request.ts"), "utf8");
  assert.match(src, /\} else if \(response\.ok\) \{/);
  // The new branch follows the text branch, and the pre-existing binary
  // branch is still the first blob return.
  assert.ok(src.indexOf("response.text()") < src.indexOf("response.ok"));
  assert.equal(src.match(/response\.blob\(\)/g).length, 2);
});

test("patches the prettier-formatted variant too", () => {
  const root = rootWithCore(PRETTIER_REQUEST_TS);
  assert.equal(patchResponseBody(root), true);

  const src = fs.readFileSync(path.join(root, CORE_DIR, "request.ts"), "utf8");
  assert.match(src, /\} else if \(response\.ok\) \{/);
});

test("patching twice leaves the file unchanged", () => {
  const root = rootWithCore(RAW_REQUEST_TS);
  patchResponseBody(root);
  const once = fs.readFileSync(path.join(root, CORE_DIR, "request.ts"), "utf8");

  assert.equal(patchResponseBody(root), false);
  const twice = fs.readFileSync(path.join(root, CORE_DIR, "request.ts"), "utf8");
  assert.equal(twice, once);
});

test("throws when the anchor is gone, naming the file", () => {
  const root = rootWithCore("export const getResponseBody = async () => undefined;\n");

  assert.throws(() => patchResponseBody(root), /hey-api legacy template has changed/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `patchResponseBody is not a function` (the import resolves, the export does not exist).

- [ ] **Step 3: Write the implementation**

Append to `core-postprocess.mjs`:

```js
// hey-api's legacy `getResponseBody` returns undefined for any 2xx whose
// Content-Type falls outside its four branches: json, a six-entry binary
// allow-list, multipart, and text/*. An .xlsx download
// (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet) matches
// none of them, so a perfectly good body is discarded and the caller ends up
// saving the string "undefined" with an .xlsx extension.
//
// The bug is identical in every legacy version (0.60.1 through 0.86.0) and the
// legacy client was deleted in 0.87.0, so there is no upstream fix to wait for.
// It can only be corrected here, on the generated output.
//
// `response.text()` appears exactly once in request.ts and is the last branch
// of the chain, which makes it a safe anchor to append after.
const TEXT_BRANCH_END =
  /(return\s+await\s+response\.text\(\)\s*;)(\r?\n)([ \t]*)\}/;

const ALREADY_PATCHED = /else\s+if\s*\(\s*response\.ok\s*\)/;

export function patchResponseBody(root = ".") {
  const file = path.join(root, CORE_DIR, "request.ts");
  const source = fs.readFileSync(file, "utf8");

  if (ALREADY_PATCHED.test(source)) return false;

  if (!TEXT_BRANCH_END.test(source)) {
    throw new Error(
      `sdk-generator: could not find the text/ branch of getResponseBody in ${file}. ` +
        "The hey-api legacy template has changed, so the binary-response patch " +
        "was NOT applied. Binary downloads (.xlsx and friends) will silently " +
        "corrupt until this is re-checked - see README.md.",
    );
  }

  const patched = source.replace(
    TEXT_BRANCH_END,
    (_match, ret, newline, indent) => {
      const unit = indent.includes("\t") ? "\t" : "  ";
      return [
        ret,
        `${newline}${indent}} else if (response.ok) {`,
        `${newline}${indent}${unit}return await response.blob();`,
        `${newline}${indent}}`,
      ].join("");
    },
  );

  fs.writeFileSync(file, patched);
  return true;
}
```

Scoped to `response.ok` on purpose: error bodies keep whatever handling they have today, so `catchErrorCodes` still reads what it reads now.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add core-postprocess.mjs test/core-postprocess.test.mjs
git commit -m "feat: patch generated getResponseBody to return blobs for unknown 2xx types"
```

---

### Task 3: Wire the post-processor into generation

**Files:**
- Modify: `generator.mjs`
- Modify: `index.js`
- Delete: `cli.ts`

**Interfaces:**
- Consumes: `centralizeCore`, `patchResponseBody` from Tasks 1–2.
- Produces: `generateApi({ api_list, base_url, webgateway_port, clientOptions })` — unchanged signature, new behaviour. `index.js` default-exports `{ generateApi, clean_URL, getCircularReplacer, filterApiListByOutput }`, which is the surface every consumer's `index.mjs` imports.

`cli.ts` is deleted rather than fixed: it imports `initial_api_list`, which `generator.mjs` has never exported, and it shadows its own `initial_api` so `generateApi` would receive `[]` even if the import resolved. It also passes an array where `generateApi` takes an options object. It cannot ever have run. The `bin` entry pointing at it goes too — `generator.mjs` has a shebang but no CLI, so `npx generate` currently exits silently. Each consumer keeps its own `index.mjs` CLI, because that file reads the repo's own `API_LIST.json` by a path relative to itself.

- [ ] **Step 1: Import the post-processor**

At the top of `generator.mjs`, after the existing imports:

```js
import { centralizeCore, patchResponseBody } from "./core-postprocess.mjs";
```

- [ ] **Step 2: Track centralization across the loop**

In `generateApi`, immediately before `for (const api of api_list) {`:

```js
let coreCentralized = false;
```

- [ ] **Step 3: Split the two createClient calls on exportCore**

In the first (`//schemas`) call, add `exportCore: true` as the last property. In the second (`//types`) call, add `exportCore: false`.

The types pass exists only to copy one `types.gen.ts` out of a directory that is then deleted, so generating a core runtime for it is pure waste.

- [ ] **Step 4: Centralize after each service**

Immediately before the closing `console.log(\`✅ Generating ${api.output} is done.\`);`:

```js
    // Keep one shared core folder and repoint this service's imports at it.
    coreCentralized = centralizeCore(`${api.output}Service`, coreCentralized);
```

- [ ] **Step 5: Patch the shared core once, after the loop**

After the `for` loop closes, still inside `generateApi`:

```js
  // Applied once, to the single shared core, after every service has donated
  // or dropped its copy. Throws if hey-api's template moved - a loud failure
  // here is the whole point, since the symptom otherwise is a corrupt download.
  if (coreCentralized) {
    patchResponseBody();
  }
```

Guarded on `coreCentralized` so a run that generated nothing does not read a missing file.

- [ ] **Step 6: Widen the library export**

Replace the whole of `index.js`:

```js
import {
  clean_URL,
  filterApiListByOutput,
  generateApi,
  getCircularReplacer,
} from "./generator.mjs";

export default {
  clean_URL,
  filterApiListByOutput,
  generateApi,
  getCircularReplacer,
};

export { clean_URL, filterApiListByOutput, generateApi, getCircularReplacer };
```

Named exports are added alongside the default because super-app's and pos-app's `index.mjs` import named bindings, while web-app's imports the default. Both shapes must work.

- [ ] **Step 7: Delete the dead CLI**

```bash
git rm cli.ts
```

- [ ] **Step 8: Verify the module graph still loads**

```bash
npm install
node -e "import('./index.js').then(m => console.log(Object.keys(m.default).join(',')))"
```

Expected: `clean_URL,filterApiListByOutput,generateApi,getCircularReplacer`

- [ ] **Step 9: Run the tests**

Run: `npm test`
Expected: PASS — 9 tests, unchanged. This task adds no test because it is wiring: its behaviour is covered by Tasks 1–2 plus the end-to-end regeneration in plan 2.

- [ ] **Step 10: Commit**

```bash
git add generator.mjs index.js
git commit -m "feat: emit one shared core per run and apply the binary-response patch"
```

---

### Task 4: Rename, pin, and document

**Files:**
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: the `test` script from Task 1.
- Produces: the published package identity `@ayasofyazilim-clomerce/sdk-generator@0.1.0`, which plan 2 adds to four consumers' `package.json`.

- [ ] **Step 1: Rewrite package.json**

Apply these changes, leaving `repository`, `bugs`, `homepage`, `license`, `type` and `main` as they are:

```json
{
  "name": "@ayasofyazilim-clomerce/sdk-generator",
  "version": "0.1.0",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  },
  "scripts": {
    "test": "node --test"
  },
  "dependencies": {
    "@apidevtools/swagger-parser": "^10.1.0",
    "@hey-api/openapi-ts": "0.60.1",
    "typescript": "^5.4.5"
  }
}
```

Four deliberate removals and one deliberate non-change:

- `bin` goes — it pointed at `generator.mjs`, which has no CLI.
- `scripts.gen:all` goes — it invoked the deleted `cli.ts` path.
- `scripts.init-release` and `scripts.release` go — `init-release` calls a `publish` binary that is not a dependency, and releases now come from the tag workflow.
- `devDependencies.release-it` goes with them.
- `@hey-api/openapi-ts` keeps its exact `0.60.1` — no caret. This is already the de-facto version in all four consumers, because the generator resolves its own nested copy; it is being made explicit, not changed.

- [ ] **Step 2: Add the version-ceiling comment**

`package.json` cannot hold comments, so record the constraint where a reader will look. Add this section to `README.md`:

````markdown
## Why `@hey-api/openapi-ts` is pinned to 0.60.1

The generated client uses hey-api's `legacy/fetch` client, which emits the
`core/` runtime this package post-processes.

| Version | Legacy client |
| --- | --- |
| 0.60.1 | present — pinned here |
| 0.86.0 | present — the last version that ships it |
| 0.87.0 | **removed** |

Anything from 0.87.0 onward cannot generate this client shape at all. Do not
widen the pin to a caret range.

The legacy client's `getResponseBody` discards the body of any 2xx response
whose `Content-Type` is outside its four branches — including
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, so `.xlsx`
downloads arrive as the literal string `undefined`. That bug is identical in
every version from 0.60.1 to 0.86.0 and was never fixed upstream, so
`patchResponseBody()` in `core-postprocess.mjs` fixes it on the generated
output. It throws if hey-api's template shifts under it — if generation starts
failing there, re-check the patch rather than deleting it.
````

- [ ] **Step 3: Replace the usage section of README.md**

The current usage block documents `npx generate --filter="Type"` and `--all`, which the deleted `cli.ts` never implemented. Replace everything above the section added in Step 2 with:

````markdown
# @ayasofyazilim-clomerce/sdk-generator

Generates TypeScript API clients from the ABP gateway's OpenAPI documents, and
keeps a single shared `core/` runtime per generation root instead of one copy
per service.

## Install

Published to GitHub Packages, so the consuming repo needs the scope mapped in
its `.npmrc`:

```
@ayasofyazilim-clomerce:registry=https://npm.pkg.github.com
```

Authentication belongs in your own `~/.npmrc`, never in the repo:

```
//npm.pkg.github.com/:_authToken=<PAT with read:packages>
```

```bash
pnpm add -D @ayasofyazilim-clomerce/sdk-generator
```

## Use

This package is a library. Each consuming repo keeps its own small `index.mjs`
CLI next to its `API_LIST.json`, because that list is repo-specific:

```js
import SDKGenerator from "@ayasofyazilim-clomerce/sdk-generator";
import API_LIST from "./API_LIST.json" with { type: "json" };

await SDKGenerator.generateApi({
  api_list: API_LIST,
  base_url: "https://dev-api.example.com",
  webgateway_port: "",
});
```

`generateApi` writes each service to `<Output>Service/` relative to the current
working directory, then moves the first service's `core/` to `./core` and
repoints every service's `./core/...` imports at `../core/...`. Run it from the
directory that should own the shared `core/`.

## Release

Push a tag; the `publish` workflow builds and publishes to GitHub Packages:

```bash
npm version minor
git push --follow-tags
```
````

- [ ] **Step 4: Verify the manifest is valid and the name is right**

```bash
node -e "const p=require('./package.json'); console.log(p.name, p.version, p.publishConfig.registry, p.dependencies['@hey-api/openapi-ts'])"
```

Expected: `@ayasofyazilim-clomerce/sdk-generator 0.1.0 https://npm.pkg.github.com 0.60.1`

- [ ] **Step 5: Confirm the pin resolves to a legacy-capable version**

```bash
rm -rf node_modules package-lock.json && npm install
grep -rl "binaryTypes" node_modules/@hey-api/openapi-ts | head -1
```

Expected: at least one match. An empty result means the installed hey-api has no legacy client and the pin is wrong — stop and fix it before continuing.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS — 9 tests.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json README.md
git commit -m "chore: rename to @ayasofyazilim-clomerce/sdk-generator, pin hey-api 0.60.1"
```

---

### Task 5: Publish workflow and handoff

**Files:**
- Create: `.github/workflows/publish.yml`

**Interfaces:**
- Consumes: `package.json` from Task 4 (`publishConfig.registry`, `test` script).
- Produces: a tag-triggered publish. Plan 2 depends on the published version resolving from the registry.

- [ ] **Step 1: Create the workflow**

```yaml
name: publish

on:
  push:
    tags:
      - "v*"

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://npm.pkg.github.com

      - run: npm ci

      # The post-processor is the only hand-written logic in this package and
      # the thing a hey-api change would break, so it gates every publish.
      - run: npm test

      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`GITHUB_TOKEN` with `packages: write` is enough for a package owned by the same repo, so no PAT or org secret is needed.

- [ ] **Step 2: Validate the workflow parses**

```bash
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/publish.yml')); print('workflow YAML OK')"
```

Expected: `workflow YAML OK`

- [ ] **Step 3: Confirm the package would publish the right files**

```bash
npm pack --dry-run 2>&1 | tail -20
```

Expected: `core-postprocess.mjs`, `generator.mjs`, `index.js`, `package.json`, `README.md`, `LICENSE` present; `cli.ts` absent.

- [ ] **Step 4: Commit and push the branch**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: publish to GitHub Packages on tag"
git push -u origin feat/shared-core-and-binary-fix
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --title "Shared core, GitHub Packages, and the binary-response fix" \
  --body "$(cat <<'BODY'
Emits one shared `core/` per generation root instead of one copy per service,
and permanently fixes the legacy client's handling of binary responses.

`getResponseBody` discarded the body of any 2xx whose Content-Type fell outside
its four branches, so `.xlsx` downloads reached callers as `undefined` and were
saved as a 9-byte file containing that word. The bug is identical in every
hey-api legacy version (0.60.1-0.86.0) and the legacy client was removed in
0.87.0, so `patchResponseBody()` fixes it on generated output and throws if the
template ever shifts.

Also renames the package to `@ayasofyazilim-clomerce/sdk-generator` for GitHub
Packages, pins hey-api to 0.60.1, and deletes `cli.ts` (it imported an export
that never existed and could not have run).

Consumer migrations follow as a separate plan, once this publishes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 6: STOP — hand off the publish**

Do not run `npm publish` locally; the working token lacks `write:packages`. After the PR merges, the repo owner fires the first release:

```bash
git checkout main && git pull
git tag v0.1.0
git push --follow-tags
```

Then confirm the package resolves before plan 2 begins:

```bash
npm view @ayasofyazilim-clomerce/sdk-generator version --registry=https://npm.pkg.github.com
```

Expected: `0.1.0`. A 404 here means the org still needs to permit first-time package creation for this scope. Do not work around a failed install by re-vendoring the generator — that is the duplication this plan removes.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| Port `centralizeCore` / `rewriteCoreImports` | 1 |
| `exportCore: true` / `false` split | 3 |
| `patchResponseBody`, whitespace-tolerant, throws on miss | 2 |
| Scoped to `response.ok` | 2 |
| Pin hey-api 0.60.1, record 0.86.0 ceiling | 4 |
| Rename + `publishConfig` for GitHub Packages | 4 |
| Tag-triggered Actions publish with `packages: write` | 5 |
| Tests for `centralizeCore` and `patchResponseBody` | 1, 2 |
| First publish is an owner handoff | 5 |
| Consumer migrations | plan 2 (out of scope) |

Two spec items are deliberately **not** carried out, because planning showed the spec was wrong about them:

- The spec says to fix `index.mjs`'s inverted `isMain` guard and its missing `PKG` import. Those bugs live in the *consumers'* vendored `index.mjs` (super-app, pos-app), not in this repo — upstream has no `index.mjs` at all. They move to plan 2, where those files are actually touched.
- The spec treats `cli.ts` as absent. It exists and is broken beyond use, so Task 3 deletes it and Task 4 removes its `bin` and `gen:all` references.

**Placeholder scan:** no TBD/TODO; every code step carries the literal content to write; the one task without a new test (Task 3) says why and names what covers it.

**Type consistency:** `CORE_DIR`, `centralizeCore(serviceDir, alreadyCentralized, root)`, `rewriteCoreImports(serviceDir)` and `patchResponseBody(root)` keep identical names and arities in Tasks 1, 2 and 3, and in the tests that call them.
