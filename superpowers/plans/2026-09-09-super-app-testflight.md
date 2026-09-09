# super-app TestFlight Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `super-app` a one-button, reviewer-gated TestFlight release from a self-hosted macOS runner.

**Architecture:** A `workflow_dispatch`-only GitHub Actions job on a labelled self-hosted mac: write `.env` from secrets → `npm ci` → `npm run init` → typecheck + lint → `expo prebuild --platform ios --clean` (which runs `pod install`, which is what fires the Didit bitcode strip) → import a distribution certificate and named profile into a throwaway keychain → `xcodebuild archive` → `-exportArchive` → `altool --validate-app` → `altool --upload-app`. Signing settings are applied by an env-gated branch in the existing `withSigningTeam.js` config plugin, **not** on the `xcodebuild` command line, because command-line build settings leak onto the CocoaPods targets.

**Tech Stack:** GitHub Actions (self-hosted macOS runner), Expo SDK 54 prebuild, `xcodebuild`, `xcrun altool`, App Store Connect API key (`.p8`), `security`(1) keychain tooling, Jest (`node` project) for the config-plugin and workflow-invariant tests.

**Spec:** [`docs/superpowers/specs/2026-09-09-super-app-testflight-design.md`](../specs/2026-09-09-super-app-testflight-design.md)

## Global Constraints

- Repo: `super-app` (`ayasofyazilim-clomerce/unirefund-mobile`), private, default branch `main`.
- **Branch before the first commit.** Do not commit to `main`.
- Bundle identifier: `com.clomerce.unirefundsuperapp`. Apple team default: `SMN73535BW`.
- Node 20 (`.nvmrc`, `engines.node >= 20.0.0`).
- Xcode floor on the runner: **16.1** (Expo 54 / RN 0.81, `deploymentTarget: "15.5"`).
- Gates that must hold, per `super-app/AGENTS.md`: `npm run typecheck` clean (0 errors); `npm run lint` 0 errors / 89 warnings. **`npm test` has a deterministic baseline failure** (`src/components/ui/__tests__/tokens.test.ts`, 3 of 4 assertions) plus a load-dependent flake (`CardScannerModal.router.test.tsx`) — a full-suite run showing **1 failing suite** is green. New tests added by this plan must not add to that count.
- `npm run init` must run before `typecheck`; it writes the gitignored `src/data/**/*.gen.json`. It needs `SUPPORTED_LOCALES` set and egress to `dev-api.unirefund.com`.
- New Jest tests belong to the **`node`** project. Do **not** name them `*.router.test.*` — that suffix routes to the native preset and is only for tests that render.
- Action pins (verified 2026-09-09; all three are lightweight tags resolving directly to these commits):
  - `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` # v7.0.1
  - `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` # v7.0.0
  - `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` # v7.0.1
- Never print a secret to a step log, not even truncated.
- Comment density: match the surrounding files, which are heavily commented and explain *why*. This repo's `with*.js` plugins and `web-app`'s workflows are the reference register.

## Prerequisites and hazards

**Another session is actively editing `app.config.js`.** It gained NFC payment AIDs mid-planning. Task 2 touches that file, so either work in a git worktree (see `superpowers:using-git-worktrees`) or re-read the file immediately before editing and rebase rather than overwrite. **Never run `git reset --hard` or `git stash` in the `super-app` checkout** — a second agent's uncommitted work may be sitting there.

**Nothing past Task 3's static checks can be executed from a Windows dev box.** The archive, signing and upload steps are verifiable only by a `dry_run: true` dispatch on the mac. The plan says so at each point rather than implying otherwise.

## File Structure

| File | Responsibility |
| --- | --- |
| `withSigningTeam.js` (modify) | Emit Manual signing + a named profile when CI sets `EXPO_IOS_PROVISIONING_PROFILE`; Automatic otherwise. App target only. |
| `__tests__/withSigningTeam.test.ts` (create) | Prove both branches, and that the Pods targets stay untouched. |
| `app.config.js` (modify, `ios` block) | `buildNumber` fed by `IOS_BUILD_NUMBER`. |
| `__tests__/app-config.test.ts` (create) | Prove `buildNumber` resolution set and unset. |
| `.github/workflows/testflight.yml` (create) | The pipeline. |
| `__tests__/testflight-workflow.test.ts` (create) | Enforce the spec's security invariants as assertions, so a later edit cannot quietly reintroduce them. |
| `docs/testflight.md` (create) | Runner provisioning, secret production, rotation, `dry_run` procedure. |
| `AGENTS.md` (modify) | One pointer to the runbook. |
| `package.json` / `package-lock.json` (modify) | `js-yaml` + `@types/js-yaml` devDependencies for the workflow test. |

Root-level `__tests__/` is a new directory. It is picked up by the `node` Jest project (rootDir is the repo root, and jest-expo's default `testMatch` includes `**/__tests__/**/*.[jt]s?(x)`), and it keeps the plugin tests beside the plugins they test rather than under `src/`, which holds app code only.

---

### Task 1: `withSigningTeam.js` manual-signing branch

**Files:**
- Modify: `super-app/withSigningTeam.js`
- Create: `super-app/__tests__/withSigningTeam.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the contract the workflow depends on — setting env var `EXPO_IOS_PROVISIONING_PROFILE` to a profile **name** makes the plugin write `CODE_SIGN_STYLE = "Manual"`, `PROVISIONING_PROFILE_SPECIFIER = "\"<name>\""` (pre-quoted) and `CODE_SIGN_IDENTITY = "\"Apple Distribution\""` onto the app target's build configurations only. `EXPO_APPLE_TEAM_ID` continues to override the `SMN73535BW` default.

- [ ] **Step 1: Create the branch**

```bash
cd /c/unirefund/super-app
git checkout -b feat/testflight-pipeline
git status --short   # expect: clean, or ONLY another session's files — do not touch those
```

- [ ] **Step 2: Write the failing test**

Create `super-app/__tests__/withSigningTeam.test.ts`.

Two things drive this test's shape. The plugin reads `process.env` at **module scope**, so every case must `jest.resetModules()` and re-`require` after setting the environment. And `withXcodeProject` is mocked to invoke its action immediately, which turns the plugin into a plain function over a stub project — the mock factory contains only a self-contained arrow function, so it is safe to hoist.

```ts
// The plugin reads process.env at module scope, so each case sets the
// environment, resets the module registry and re-requires it. Mutating
// process.env after the require would be a no-op.
jest.mock("@expo/config-plugins", () => ({
  // The real withXcodeProject defers the action into config.mods; running it
  // eagerly reduces the plugin to a pure function over the stub below.
  withXcodeProject: (config: unknown, action: (c: unknown) => unknown) =>
    action(config),
}));

const BUNDLE_ID = "com.clomerce.unirefundsuperapp";

type Settings = Record<string, string>;

function makeConfig() {
  // Two app-target configurations (Debug + Release), one CocoaPods target, and
  // a bare comment string — the real pbxXCBuildConfigurationSection is
  // interleaved with those, which is why the plugin guards on `buildSettings`.
  const appDebug = { buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: BUNDLE_ID } as Settings };
  const appRelease = { buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: BUNDLE_ID } as Settings };
  const podTarget = { buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: "org.cocoapods.OpenSSL" } as Settings };
  const attributes: Record<string, unknown> = {};

  return {
    config: {
      ios: { bundleIdentifier: BUNDLE_ID },
      modResults: {
        pbxXCBuildConfigurationSection: () => ({
          "1A::Debug": appDebug,
          "1A::Debug_comment": "Debug",
          "1B::Release": appRelease,
          "2A::Pods": podTarget,
        }),
        addTargetAttribute: (key: string, value: unknown) => {
          attributes[key] = value;
        },
      },
    },
    appDebug,
    appRelease,
    podTarget,
    attributes,
  };
}

function runPlugin(env: Record<string, string | undefined>) {
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  jest.resetModules();
  const withSigningTeam = require("../withSigningTeam.js");
  const fixture = makeConfig();
  withSigningTeam(fixture.config);
  process.env = saved;
  return fixture;
}

describe("withSigningTeam", () => {
  it("keeps Automatic signing when EXPO_IOS_PROVISIONING_PROFILE is unset", () => {
    const { appDebug, appRelease } = runPlugin({
      EXPO_IOS_PROVISIONING_PROFILE: undefined,
      EXPO_APPLE_TEAM_ID: undefined,
    });

    for (const target of [appDebug, appRelease]) {
      expect(target.buildSettings.CODE_SIGN_STYLE).toBe("Automatic");
      expect(target.buildSettings.DEVELOPMENT_TEAM).toBe("SMN73535BW");
      // A specifier under Automatic signing makes Xcode ignore the profile it
      // would otherwise manage, so it must be absent, not merely empty.
      expect(target.buildSettings).not.toHaveProperty("PROVISIONING_PROFILE_SPECIFIER");
    }
  });

  it("switches the app target to Manual signing when a profile name is set", () => {
    const { appDebug, appRelease } = runPlugin({
      EXPO_IOS_PROVISIONING_PROFILE: "Unirefund App Store",
      EXPO_APPLE_TEAM_ID: undefined,
    });

    for (const target of [appDebug, appRelease]) {
      expect(target.buildSettings.CODE_SIGN_STYLE).toBe("Manual");
      // Pre-quoted: the pbxproj writer does not quote values, and a profile
      // name contains spaces.
      expect(target.buildSettings.PROVISIONING_PROFILE_SPECIFIER).toBe('"Unirefund App Store"');
      expect(target.buildSettings.CODE_SIGN_IDENTITY).toBe('"Apple Distribution"');
      expect(target.buildSettings.DEVELOPMENT_TEAM).toBe("SMN73535BW");
    }
  });

  it("never touches a CocoaPods target", () => {
    // This is the regression guard for the whole design decision: passing these
    // settings on the xcodebuild command line would apply them to every target,
    // and a Pods target inheriting an app-bundle-id profile fails the archive
    // with "Provisioning profile doesn't include the bundle identifier
    // org.cocoapods.…".
    const { podTarget } = runPlugin({
      EXPO_IOS_PROVISIONING_PROFILE: "Unirefund App Store",
    });

    expect(podTarget.buildSettings).toEqual({
      PRODUCT_BUNDLE_IDENTIFIER: "org.cocoapods.OpenSSL",
    });
  });

  it("honours EXPO_APPLE_TEAM_ID and records the team attribute", () => {
    const { appRelease, attributes } = runPlugin({
      EXPO_APPLE_TEAM_ID: "ABCDE12345",
      EXPO_IOS_PROVISIONING_PROFILE: undefined,
    });

    expect(appRelease.buildSettings.DEVELOPMENT_TEAM).toBe("ABCDE12345");
    expect(attributes.DevelopmentTeam).toBe("ABCDE12345");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx jest __tests__/withSigningTeam.test.ts
```

Expected: the two Manual-signing cases FAIL — `CODE_SIGN_STYLE` is `"Automatic"` and `PROVISIONING_PROFILE_SPECIFIER` is undefined, because the plugin has no Manual branch yet. The Automatic case and the team-id case should already PASS.

- [ ] **Step 4: Add the Manual branch to the plugin**

In `super-app/withSigningTeam.js`, add below the existing `TEAM_ID` line:

```js
// Set only by CI. Local device builds keep Automatic signing, which resolves
// through an Xcode-authenticated Apple ID; CI has no such session and instead
// imports a distribution certificate and a *named* profile into a throwaway
// keychain, which only manual signing will select. Unset, the emitted project
// is byte-identical to what it was before CI existed.
const PROFILE = process.env.EXPO_IOS_PROVISIONING_PROFILE?.trim();
```

and replace these two lines inside the per-configuration loop:

```js
      buildSettings.CODE_SIGN_STYLE = "Automatic";
      buildSettings.DEVELOPMENT_TEAM = TEAM_ID;
```

with:

```js
      if (PROFILE) {
        // Values are written to the pbxproj verbatim, and a profile name
        // contains spaces — so quote here rather than relying on the writer.
        buildSettings.CODE_SIGN_STYLE = "Manual";
        buildSettings.PROVISIONING_PROFILE_SPECIFIER = `"${PROFILE}"`;
        buildSettings.CODE_SIGN_IDENTITY = '"Apple Distribution"';
      } else {
        buildSettings.CODE_SIGN_STYLE = "Automatic";
      }
      buildSettings.DEVELOPMENT_TEAM = TEAM_ID;
```

Leave `project.addTargetAttribute("DevelopmentTeam", TEAM_ID)` and the bundle-identifier filter untouched. Extend the file's existing header comment to mention that CI drives the Manual branch.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest __tests__/withSigningTeam.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Confirm the repo gates still hold**

```bash
npm run typecheck   # expect: clean, 0 errors
npm run lint        # expect: 0 errors (89 warnings is the baseline)
```

- [ ] **Step 7: Commit**

```bash
git add withSigningTeam.js __tests__/withSigningTeam.test.ts
git commit -m "feat(ios): env-gated manual signing in withSigningTeam

CI has no Xcode-authenticated Apple ID, so Automatic signing cannot resolve a
profile there. EXPO_IOS_PROVISIONING_PROFILE switches the app target to Manual
with a named profile; unset, the emitted project is unchanged.

Applied here rather than on the xcodebuild command line because command-line
build settings hit every target, and a Pods target inheriting an app-bundle-id
profile fails the archive. The existing PRODUCT_BUNDLE_IDENTIFIER filter is
what confines it to the app target; a test pins that."
```

---

### Task 2: `ios.buildNumber` from the environment

**Files:**
- Modify: `super-app/app.config.js` (the `ios` block)
- Create: `super-app/__tests__/app-config.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: the contract the workflow depends on — `IOS_BUILD_NUMBER` sets `expo.ios.buildNumber`; unset it is `"1"`.

- [ ] **Step 1: Re-read the file before editing**

```bash
git log --oneline -3 -- app.config.js
sed -n '30,40p' app.config.js
```

Another session has been editing this file. Confirm `bundleIdentifier: "com.clomerce.unirefundsuperapp",` is still on the line you are about to anchor to, and that no `buildNumber` key has appeared in the meantime.

- [ ] **Step 2: Write the failing test**

Create `super-app/__tests__/app-config.test.ts`:

```ts
// app.config.js evaluates process.env when the module is first required, so
// each case sets the environment, resets the registry and re-requires.
function loadConfig(buildNumber: string | undefined) {
  const saved = process.env.IOS_BUILD_NUMBER;
  if (buildNumber === undefined) delete process.env.IOS_BUILD_NUMBER;
  else process.env.IOS_BUILD_NUMBER = buildNumber;

  jest.resetModules();
  // Babel transforms the file's `export default`, so the object is under
  // `.default`.
  const mod = require("../app.config.js");
  const config = (mod.default ?? mod).expo;

  if (saved === undefined) delete process.env.IOS_BUILD_NUMBER;
  else process.env.IOS_BUILD_NUMBER = saved;
  return config;
}

describe("app.config.js ios.buildNumber", () => {
  it("defaults to \"1\" when IOS_BUILD_NUMBER is unset", () => {
    expect(loadConfig(undefined).ios.buildNumber).toBe("1");
  });

  it("uses IOS_BUILD_NUMBER when CI sets it", () => {
    expect(loadConfig("437").ios.buildNumber).toBe("437");
  });

  it("trims whitespace and falls back on an empty value", () => {
    // A GitHub Actions expression that resolves to nothing yields an empty
    // string, not an absent variable — which would otherwise produce an
    // invalid empty CFBundleVersion.
    expect(loadConfig("  437  ").ios.buildNumber).toBe("437");
    expect(loadConfig("").ios.buildNumber).toBe("1");
  });

  it("keeps the marketing version hand-edited", () => {
    // Only buildNumber is derived; `version` is deliberately not automated.
    expect(loadConfig(undefined).version).toBe("1.0.0");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx jest __tests__/app-config.test.ts
```

Expected: the first three cases FAIL with `undefined` for `ios.buildNumber`. The `version` case PASSES.

- [ ] **Step 4: Add the key**

In `app.config.js`, immediately after `bundleIdentifier: "com.clomerce.unirefundsuperapp",`:

```js
      // TestFlight rejects a duplicate CFBundleVersion for a given `version`,
      // so CI feeds github.run_number in — see .github/workflows/testflight.yml.
      // Local builds never upload and do not care, so they get "1". The
      // fallback also covers an Actions expression that resolved to an empty
      // string, which would otherwise be an invalid empty CFBundleVersion.
      buildNumber: process.env.IOS_BUILD_NUMBER?.trim() || "1",
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest __tests__/app-config.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Confirm the gates**

```bash
npm run typecheck   # expect: clean
npm run lint        # expect: 0 errors
```

- [ ] **Step 7: Commit**

```bash
git add app.config.js __tests__/app-config.test.ts
git commit -m "feat(ios): derive ios.buildNumber from IOS_BUILD_NUMBER

There was no buildNumber at all, so every archive was CFBundleVersion 1 and
the second TestFlight upload of a version would be rejected. CI passes
github.run_number; local builds get \"1\". The trim-and-fallback also covers an
Actions expression that resolved to an empty string."
```

---

### Task 3: the workflow, and its invariants as tests

**Files:**
- Create: `super-app/.github/workflows/testflight.yml`
- Create: `super-app/__tests__/testflight-workflow.test.ts`
- Modify: `super-app/package.json`, `super-app/package-lock.json`

**Interfaces:**
- Consumes: `EXPO_IOS_PROVISIONING_PROFILE` (Task 1) and `IOS_BUILD_NUMBER` (Task 2).
- Produces: a `workflow_dispatch` workflow named `TestFlight` with inputs `dry_run` (boolean) and `build_number` (string), requiring the 15 secrets listed in Task 4.

- [ ] **Step 1: Add the YAML parser used by the test**

```bash
npm install --save-dev js-yaml@^4 @types/js-yaml
```

`js-yaml` currently resolves only as a transitive dependency; the test must not rely on hoisting that a future dedupe could remove. Note the v4 API is `load`, not the removed `safeLoad`.

- [ ] **Step 2: Write the failing invariant test**

Create `super-app/__tests__/testflight-workflow.test.ts`. These assertions are the spec's security posture made executable — the point is that a later edit reintroducing a `pull_request` trigger on a self-hosted runner fails a test rather than passing review.

```ts
import * as fs from "fs";
import * as path from "path";
import { load } from "js-yaml";

const WORKFLOW = path.join(__dirname, "..", ".github", "workflows", "testflight.yml");

type Step = { name?: string; if?: string; run?: string; uses?: string };
type Job = {
  "runs-on": string[];
  environment?: string;
  permissions?: Record<string, string>;
  steps: Step[];
};

function readWorkflow() {
  const doc = load(fs.readFileSync(WORKFLOW, "utf8")) as Record<string, unknown>;
  // js-yaml 4 uses the YAML 1.2 core schema, where `on` is the string key it
  // looks like. Under YAML 1.1 it would have been parsed as boolean true, so
  // accept either rather than depending on the schema version.
  const triggers = (doc.on ?? (doc as Record<string, unknown>)["true"]) as Record<string, unknown>;
  const jobs = doc.jobs as Record<string, Job>;
  return { doc, triggers, job: jobs.testflight };
}

describe("testflight workflow", () => {
  it("is triggerable only by workflow_dispatch", () => {
    // A self-hosted runner must never be reachable from an event an outside
    // contributor can cause. This is the single most important assertion here.
    const { triggers } = readWorkflow();
    expect(Object.keys(triggers)).toEqual(["workflow_dispatch"]);
  });

  it("runs on the dedicated runner label, not bare self-hosted", () => {
    const { job } = readWorkflow();
    expect(job["runs-on"]).toContain("macos-testflight");
  });

  it("is gated on the testflight environment", () => {
    // Where the required-reviewer rule and the secrets live.
    const { job } = readWorkflow();
    expect(job.environment).toBe("testflight");
  });

  it("requests no token permission beyond reading contents", () => {
    const { doc, job } = readWorkflow();
    const permissions = (job.permissions ?? doc.permissions) as Record<string, string>;
    expect(permissions).toEqual({ contents: "read" });
  });

  it("does not cancel a run in progress", () => {
    // Cancelling mid-archive would skip teardown and leave a keychain and a
    // provisioning profile on a persistent machine.
    const { doc } = readWorkflow();
    expect((doc.concurrency as Record<string, unknown>)["cancel-in-progress"]).toBe(false);
  });

  it("tears the keychain down even when the job fails", () => {
    const { job } = readWorkflow();
    const teardown = job.steps.filter(
      (s) => s.if?.includes("always()") && s.run?.includes("delete-keychain"),
    );
    expect(teardown).toHaveLength(1);
  });

  it("removes every secret file that lands outside the workspace", () => {
    // RUNNER_TEMP and the workspace are cleaned by the runner; these two paths
    // are in the runner user's home and are not.
    const { job } = readWorkflow();
    const teardown = job.steps.find((s) => s.if?.includes("always()") && s.run?.includes("delete-keychain"));
    expect(teardown?.run).toContain("Provisioning Profiles");
    expect(teardown?.run).toContain(".appstoreconnect/private_keys");
    expect(teardown?.run).toContain("rm -f .env");
  });

  it("makes the upload step skippable", () => {
    // dry_run must be able to exercise the whole chain without consuming a
    // build number or notifying testers.
    const { job } = readWorkflow();
    const upload = job.steps.find((s) => s.run?.includes("--upload-app"));
    expect(upload).toBeDefined();
    expect(upload?.if).toContain("dry_run");
  });

  it("validates the IPA before uploading it", () => {
    const { job } = readWorkflow();
    const runs = job.steps.map((s) => s.run ?? "");
    const validate = runs.findIndex((r) => r.includes("--validate-app"));
    const upload = runs.findIndex((r) => r.includes("--upload-app"));
    expect(validate).toBeGreaterThanOrEqual(0);
    expect(validate).toBeLessThan(upload);
  });

  it("never echoes a secret", () => {
    const { job } = readWorkflow();
    for (const step of job.steps) {
      // Secrets reach files by base64 decode, never through a shell echo whose
      // chunking can defeat log masking.
      expect(step.run ?? "").not.toMatch(/echo[^\n]*\$\{\{\s*secrets\./);
    }
  });

  it("pins every action to a 40-character commit SHA", () => {
    const { job } = readWorkflow();
    const uses = job.steps.map((s) => s.uses).filter(Boolean) as string[];
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) {
      expect(ref).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  it("does not pass signing settings on the xcodebuild command line", () => {
    // Task 1's plugin owns these. On the command line they would also hit the
    // CocoaPods targets and fail the archive.
    const { job } = readWorkflow();
    for (const step of job.steps) {
      expect(step.run ?? "").not.toMatch(/PROVISIONING_PROFILE_SPECIFIER=/);
      expect(step.run ?? "").not.toMatch(/CODE_SIGN_STYLE=/);
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx jest __tests__/testflight-workflow.test.ts
```

Expected: every case FAILS on `ENOENT` reading `.github/workflows/testflight.yml`.

- [ ] **Step 4: Write the workflow**

Create `super-app/.github/workflows/testflight.yml`:

```yaml
name: TestFlight
run-name: "TestFlight ${{ inputs.dry_run && '(dry run)' || 'upload' }} · build ${{ inputs.build_number || github.run_number }} 🚀"

# Builds and ships super-app to TestFlight from a self-hosted macOS runner.
# Design and the rejected alternatives: docs/superpowers/specs/2026-09-09-super-app-testflight-design.md
# Runner provisioning and secret production: docs/testflight.md
#
# DISPATCH ONLY, deliberately. An iOS archive takes 20-40 minutes on one
# serialised mac and every TestFlight upload notifies testers, so per-merge
# delivery would be both slow and noisy. More importantly, a self-hosted runner
# must never be reachable from an event an outside contributor can cause —
# `__tests__/testflight-workflow.test.ts` asserts the trigger list stays exactly
# this, so adding `pull_request` here fails a test rather than merely a review.
#
# ONE ARTIFACT, NO ENVIRONMENT MATRIX. Unlike web-app's deploy.yml, this app
# picks its gateway at *runtime* (staff login screen and debug menu, defaulting
# to dev — see src/utils/environment.ts); only the apex domain is baked in. One
# IPA therefore serves dev, uat and live.
#
# REQUIRED SECRETS — all 15 on the `testflight` Environment, which is also where
# the required-reviewer rule lives (Settings > Environments > testflight). That
# rule is the only thing between repo write access and your testers' devices,
# and it is UI configuration, deliberately not expressible here.
#
#   Signing and upload
#     IOS_DIST_CERT_P12_BASE64        Apple Distribution identity, base64 .p12
#     IOS_DIST_CERT_PASSWORD          password set on that export
#     IOS_PROVISIONING_PROFILE_BASE64 App Store profile, base64
#     IOS_PROVISIONING_PROFILE_NAME   the profile's exact name; this is what
#                                     PROVISIONING_PROFILE_SPECIFIER matches
#     ASC_API_KEY_P8_BASE64           App Store Connect key, Developer role
#     ASC_API_KEY_ID / ASC_ISSUER_ID  shown beside that key
#
#   Build configuration (written to .env for init.ts; EXPO_PUBLIC_* are inlined
#   into the JS bundle)
#     GATEWAY_URL, SUPPORTED_LOCALES, EXPO_PUBLIC_GATEWAY_URL,
#     EXPO_PUBLIC_OAUTH_CLIENT_ID, EXPO_PUBLIC_DEEP_LINK_HOST,
#     EXPO_PUBLIC_EXTRACTION_URL, EXPO_PUBLIC_EXTRACTION_API_KEY,
#     EXPO_PUBLIC_EXTRACTION_PROJECT_ID
#
#   Optional: EXPO_APPLE_TEAM_ID overrides withSigningTeam.js's SMN73535BW
#   default. Unset it resolves to an empty string, which that plugin treats as
#   absent.
#
# SUPPORTED_LOCALES must stay a SUPERSET of every runtime value: it decides which
# i18n bundles init.ts generates.

on:
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Archive, export and validate — but do not upload"
        type: boolean
        default: false
      build_number:
        description: "Override CFBundleVersion (default: this run's number)"
        type: string
        required: false

# Never cancel in flight: teardown would be skipped, leaving a keychain and a
# provisioning profile behind on a machine that persists between runs.
concurrency:
  group: testflight
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  testflight:
    name: ${{ inputs.dry_run && 'Dry run' || 'Upload to TestFlight' }}
    runs-on: [self-hosted, macOS, macos-testflight]
    environment: testflight
    timeout-minutes: 90
    env:
      IOS_BUILD_NUMBER: ${{ inputs.build_number || github.run_number }}
      BUNDLE_ID: com.clomerce.unirefundsuperapp
      # Read by withSigningTeam.js during prebuild. Its presence is what
      # switches the app target from Automatic to Manual signing.
      EXPO_IOS_PROVISIONING_PROFILE: ${{ secrets.IOS_PROVISIONING_PROFILE_NAME }}
      EXPO_APPLE_TEAM_ID: ${{ secrets.EXPO_APPLE_TEAM_ID }}
    steps:
      # `clean: true` (the default) runs `git clean -ffdx`, and -x removes
      # ignored files — so a stale ios/ or node_modules from the previous run on
      # this persistent workspace cannot poison this one.
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .nvmrc

      # package-lock.json pins @unirefund/qr to git+ssh://git@github.com/…, so
      # `npm ci` would attempt SSH and fail without a deploy key on this mac.
      # The repo is public, so rewrite the transport instead of managing a key.
      - name: Fetch git dependencies over HTTPS
        run: git config --global url."https://github.com/".insteadOf ssh://git@github.com/

      # init.ts reads .env through dotenv, and the EXPO_PUBLIC_* values are
      # inlined into the JS bundle at build time. Written with a quoted heredoc
      # so no value is expanded or echoed.
      - name: Write .env from secrets
        env:
          GATEWAY_URL: ${{ secrets.GATEWAY_URL }}
          SUPPORTED_LOCALES: ${{ secrets.SUPPORTED_LOCALES }}
          EXPO_PUBLIC_GATEWAY_URL: ${{ secrets.EXPO_PUBLIC_GATEWAY_URL }}
          EXPO_PUBLIC_OAUTH_CLIENT_ID: ${{ secrets.EXPO_PUBLIC_OAUTH_CLIENT_ID }}
          EXPO_PUBLIC_DEEP_LINK_HOST: ${{ secrets.EXPO_PUBLIC_DEEP_LINK_HOST }}
          EXPO_PUBLIC_EXTRACTION_URL: ${{ secrets.EXPO_PUBLIC_EXTRACTION_URL }}
          EXPO_PUBLIC_EXTRACTION_API_KEY: ${{ secrets.EXPO_PUBLIC_EXTRACTION_API_KEY }}
          EXPO_PUBLIC_EXTRACTION_PROJECT_ID: ${{ secrets.EXPO_PUBLIC_EXTRACTION_PROJECT_ID }}
        run: |
          install -m 600 /dev/null .env
          {
            printf 'GATEWAY_URL=%s\n'                       "$GATEWAY_URL"
            printf 'SUPPORTED_LOCALES=%s\n'                 "$SUPPORTED_LOCALES"
            printf 'EXPO_PUBLIC_GATEWAY_URL=%s\n'           "$EXPO_PUBLIC_GATEWAY_URL"
            printf 'EXPO_PUBLIC_OAUTH_CLIENT_ID=%s\n'       "$EXPO_PUBLIC_OAUTH_CLIENT_ID"
            printf 'EXPO_PUBLIC_DEEP_LINK_HOST=%s\n'        "$EXPO_PUBLIC_DEEP_LINK_HOST"
            printf 'EXPO_PUBLIC_EXTRACTION_URL=%s\n'        "$EXPO_PUBLIC_EXTRACTION_URL"
            printf 'EXPO_PUBLIC_EXTRACTION_API_KEY=%s\n'    "$EXPO_PUBLIC_EXTRACTION_API_KEY"
            printf 'EXPO_PUBLIC_EXTRACTION_PROJECT_ID=%s\n' "$EXPO_PUBLIC_EXTRACTION_PROJECT_ID"
          } >> .env

      - name: Install dependencies
        run: npm ci

      # Writes the gitignored src/data/**/*.gen.json that TranslationKey derives
      # from. Without it tsc fails on the import (TS2307) rather than naming the
      # missing codegen. Always fetches from dev-api.<domain>, whatever the app's
      # runtime default is.
      - name: Generate policy and localization data
        run: npm run init

      # Two minutes of gates before a 30-minute archive. `npm test` is NOT run:
      # src/components/ui/__tests__/tokens.test.ts fails 3 of 4 assertions at
      # baseline on pre-existing colour-token violations, and
      # CardScannerModal.router.test.tsx flakes under parallel load, so the suite
      # cannot exit 0 — see AGENTS.md. A gate that is allowed to fail is not a
      # gate. Re-add a test step once tokens.test.ts is green.
      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      # ios/ is gitignored, so it is generated here rather than checked out.
      # --clean matters twice over: it guarantees the config plugins re-run, and
      # `pod install` re-extracts DiditSDK from the CocoaPods cache, which is the
      # only moment withDiditBitcodeStrip.js can strip the bitcode Apple rejects
      # with error 90482. A cached ios/ would silently ship the rejected binary.
      - name: Prebuild the iOS project
        run: npx expo prebuild --platform ios --clean

      # A throwaway keychain per run. Decoding uses `openssl base64` rather than
      # base64(1), whose decode flag differs between BSD and GNU builds.
      - name: Import the signing identity
        env:
          IOS_DIST_CERT_P12_BASE64: ${{ secrets.IOS_DIST_CERT_P12_BASE64 }}
          IOS_DIST_CERT_PASSWORD: ${{ secrets.IOS_DIST_CERT_PASSWORD }}
          IOS_PROVISIONING_PROFILE_BASE64: ${{ secrets.IOS_PROVISIONING_PROFILE_BASE64 }}
        run: |
          set -euo pipefail

          KEYCHAIN="$RUNNER_TEMP/testflight-$GITHUB_RUN_ID.keychain-db"
          KEYCHAIN_PW="$(openssl rand -base64 24)"
          echo "::add-mask::$KEYCHAIN_PW"
          echo "KEYCHAIN=$KEYCHAIN"       >> "$GITHUB_ENV"
          echo "KEYCHAIN_PW=$KEYCHAIN_PW" >> "$GITHUB_ENV"

          # Record the existing search list so teardown can put it back.
          ORIGINAL_KEYCHAINS="$(security list-keychains -d user | tr -d '"' | tr '\n' ' ')"
          echo "ORIGINAL_KEYCHAINS=$ORIGINAL_KEYCHAINS" >> "$GITHUB_ENV"

          security create-keychain -p "$KEYCHAIN_PW" "$KEYCHAIN"
          # -lut 21600: without a long auto-lock timeout the keychain can lock
          # part-way through the archive and codesign starts failing mid-build.
          security set-keychain-settings -lut 21600 "$KEYCHAIN"
          security unlock-keychain -p "$KEYCHAIN_PW" "$KEYCHAIN"

          install -m 600 /dev/null "$RUNNER_TEMP/dist.p12"
          printf '%s' "$IOS_DIST_CERT_P12_BASE64" | openssl base64 -d -A -out "$RUNNER_TEMP/dist.p12"
          security import "$RUNNER_TEMP/dist.p12" \
            -k "$KEYCHAIN" -P "$IOS_DIST_CERT_PASSWORD" \
            -f pkcs12 -T /usr/bin/codesign -T /usr/bin/security

          # THE line that decides whether a headless archive returns. Without it
          # codesign raises a GUI keychain-access prompt that nobody can answer,
          # and the job hangs to its 90-minute timeout instead of failing.
          security set-key-partition-list \
            -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PW" "$KEYCHAIN" > /dev/null

          # codesign only searches keychains on the user search list.
          security list-keychains -d user -s "$KEYCHAIN" $ORIGINAL_KEYCHAINS

          # Xcode finds a profile by UUID under this exact directory. It is in
          # the runner user's HOME, outside the workspace, so the next run's
          # `git clean` will not remove it — teardown must.
          PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
          mkdir -p "$PROFILE_DIR"
          install -m 600 /dev/null "$RUNNER_TEMP/profile.mobileprovision"
          printf '%s' "$IOS_PROVISIONING_PROFILE_BASE64" \
            | openssl base64 -d -A -out "$RUNNER_TEMP/profile.mobileprovision"
          PROFILE_UUID="$(security cms -D -i "$RUNNER_TEMP/profile.mobileprovision" | plutil -extract UUID raw -)"
          cp "$RUNNER_TEMP/profile.mobileprovision" "$PROFILE_DIR/$PROFILE_UUID.mobileprovision"
          echo "PROFILE_UUID=$PROFILE_UUID" >> "$GITHUB_ENV"

      # prebuild names the workspace and scheme from expo.name, and this repo
      # carries conflicting evidence about it: app.config.js says "Unirefund"
      # while withDiditBitcodeStrip.js quotes a product name of
      # "UnirefundSuperapp". Read it back instead of hardcoding a guess, and fail
      # loudly if the shape is not the single app scheme we expect.
      - name: Resolve the workspace and scheme
        run: |
          set -euo pipefail
          WORKSPACE="$(ls -d ios/*.xcworkspace | head -1)"
          SCHEME="$(xcodebuild -list -json -workspace "$WORKSPACE" | python3 -c '
          import json, sys
          schemes = [s for s in json.load(sys.stdin)["workspace"]["schemes"] if not s.startswith("Pods")]
          assert len(schemes) == 1, f"expected exactly one app scheme, got {schemes}"
          print(schemes[0])
          ')"
          echo "WORKSPACE=$WORKSPACE" >> "$GITHUB_ENV"
          echo "SCHEME=$SCHEME"       >> "$GITHUB_ENV"
          echo "Archiving scheme '$SCHEME' from '$WORKSPACE'"

      # No signing settings here on purpose. withSigningTeam.js already wrote
      # them onto the app target's build configurations only; passing them on
      # this command line would also apply them to every CocoaPods target, and a
      # Pods target inheriting an app-bundle-id profile fails the archive with
      # "Provisioning profile doesn't include the bundle identifier
      # org.cocoapods.…". OTHER_CODE_SIGN_FLAGS is the exception: it only tells
      # codesign which keychain to search and assigns no profile.
      - name: Archive
        run: |
          set -euo pipefail
          xcodebuild archive \
            -workspace "$WORKSPACE" \
            -scheme "$SCHEME" \
            -configuration Release \
            -destination 'generic/platform=iOS' \
            -archivePath "$RUNNER_TEMP/super-app.xcarchive" \
            OTHER_CODE_SIGN_FLAGS="--keychain $KEYCHAIN"

      - name: Export the IPA
        env:
          PROFILE_NAME: ${{ secrets.IOS_PROVISIONING_PROFILE_NAME }}
          TEAM_ID: ${{ secrets.EXPO_APPLE_TEAM_ID }}
        run: |
          set -euo pipefail
          # app-store-connect is the post-Xcode-15.3 spelling of the old
          # app-store; the Xcode 16.1 floor makes it safe. uploadSymbols ships
          # the dSYMs so crash reports are symbolicated.
          cat > "$RUNNER_TEMP/ExportOptions.plist" <<PLIST
          <?xml version="1.0" encoding="UTF-8"?>
          <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
          <plist version="1.0">
          <dict>
            <key>method</key><string>app-store-connect</string>
            <key>signingStyle</key><string>manual</string>
            <key>teamID</key><string>${TEAM_ID:-SMN73535BW}</string>
            <key>uploadSymbols</key><true/>
            <key>stripSwiftSymbols</key><true/>
            <key>provisioningProfiles</key>
            <dict>
              <key>${BUNDLE_ID}</key><string>${PROFILE_NAME}</string>
            </dict>
          </dict>
          </plist>
          PLIST

          xcodebuild -exportArchive \
            -archivePath "$RUNNER_TEMP/super-app.xcarchive" \
            -exportOptionsPlist "$RUNNER_TEMP/ExportOptions.plist" \
            -exportPath "$RUNNER_TEMP/export"

          IPA="$(ls "$RUNNER_TEMP"/export/*.ipa | head -1)"
          echo "IPA=$IPA" >> "$GITHUB_ENV"

      # altool locates its key by FILENAME, searching ./private_keys,
      # ~/private_keys, ~/.private_keys and ~/.appstoreconnect/private_keys for
      # AuthKey_<KEY_ID>.p8. That last path is in HOME, outside the workspace,
      # so teardown must delete it.
      - name: Stage the App Store Connect key
        env:
          ASC_API_KEY_P8_BASE64: ${{ secrets.ASC_API_KEY_P8_BASE64 }}
          ASC_API_KEY_ID: ${{ secrets.ASC_API_KEY_ID }}
        run: |
          set -euo pipefail
          mkdir -p "$HOME/.appstoreconnect/private_keys"
          KEY="$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_API_KEY_ID}.p8"
          install -m 600 /dev/null "$KEY"
          printf '%s' "$ASC_API_KEY_P8_BASE64" | openssl base64 -d -A -out "$KEY"

      # Catches the 90482-class rejections (the bitcode one this repo already
      # hit) before a build number is consumed or a tester is notified.
      - name: Validate the IPA
        env:
          ASC_API_KEY_ID: ${{ secrets.ASC_API_KEY_ID }}
          ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
        run: |
          set -euo pipefail
          xcrun altool --validate-app -f "$IPA" -t ios \
            --apiKey "$ASC_API_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

      # The only irreversible step in the job.
      - name: Upload to TestFlight
        if: ${{ !inputs.dry_run }}
        env:
          ASC_API_KEY_ID: ${{ secrets.ASC_API_KEY_ID }}
          ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
        run: |
          set -euo pipefail
          xcrun altool --upload-app -f "$IPA" -t ios \
            --apiKey "$ASC_API_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

      - name: Keep the IPA and dSYMs
        if: always() && env.IPA != ''
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: super-app-${{ env.IOS_BUILD_NUMBER }}
          path: |
            ${{ runner.temp }}/export/*.ipa
            ${{ runner.temp }}/super-app.xcarchive/dSYMs
          retention-days: 30
          if-no-files-found: warn

      # Leave the machine as it was found. `|| true` throughout: teardown must
      # not mask the real failure that brought us here.
      - name: Tear down
        if: always()
        run: |
          security list-keychains -d user -s ${ORIGINAL_KEYCHAINS:-login.keychain-db} || true
          security delete-keychain "${KEYCHAIN:-}" || true
          rm -f "$HOME/Library/MobileDevice/Provisioning Profiles/${PROFILE_UUID:-none}.mobileprovision" || true
          rm -rf "$HOME/.appstoreconnect/private_keys" || true
          rm -f "$RUNNER_TEMP/dist.p12" "$RUNNER_TEMP/profile.mobileprovision" || true
          # .env is gitignored, so it SURVIVES between runs on this persistent
          # workspace; the next checkout's git clean is too late to be the only
          # defence.
          rm -f .env || true

      - name: Summarise
        if: always()
        run: |
          {
            echo "### super-app build ${IOS_BUILD_NUMBER}"
            echo
            echo "- scheme: \`${SCHEME:-unresolved}\`"
            echo "- bundle: \`${BUNDLE_ID}\`"
            if [ "${{ inputs.dry_run }}" = "true" ]; then
              echo "- **Dry run** — validated only. Nothing was uploaded and no tester was notified."
            else
              echo "- Uploaded to App Store Connect. Processing takes a few minutes before it appears in TestFlight."
            fi
          } >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 5: Re-verify the three action pins**

All three SHAs in the workflow were resolved and verified on 2026-09-09, but a pin is worth checking rather than trusting from a document — a wrong SHA is a hard failure at run time:

```bash
for r in actions/checkout actions/setup-node actions/upload-artifact; do
  t=$(gh api repos/$r/releases/latest --jq .tag_name)
  typ=$(gh api repos/$r/git/ref/tags/$t --jq .object.type)
  sha=$(gh api repos/$r/git/ref/tags/$t --jq .object.sha)
  [ "$typ" = "tag" ] && sha=$(gh api repos/$r/git/tags/$sha --jq .object.sha)
  echo "$r $t $sha"
done
```

Expected, matching the `uses:` lines:

| Action | Tag | Commit |
| --- | --- | --- |
| `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | v7.0.0 | `820762786026740c76f36085b0efc47a31fe5020` |
| `actions/upload-artifact` | v7.0.1 | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` |

If a newer release has landed since, take the newer commit SHA and update the trailing tag comment with it. Never leave a `uses:` line on a mutable tag — Task 3's invariant test asserts a 40-character SHA and will fail.

- [ ] **Step 6: Run the invariant test to verify it passes**

```bash
npx jest __tests__/testflight-workflow.test.ts
```

Expected: 12 passed. If `is triggerable only by workflow_dispatch` fails with a key of `"true"`, the js-yaml schema is treating `on` as a boolean — the test already accepts both spellings, so a failure means the trigger list itself is wrong.

- [ ] **Step 7: Validate the YAML independently of the test**

```bash
python -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/testflight.yml')); print('parsed ok, jobs:', list(d['jobs']))"
```

Expected: `parsed ok, jobs: ['testflight']`. This is a syntax check only — `actionlint` is unavailable here (no Go toolchain), so **the authoritative syntax check is GitHub's own**: after pushing, `gh workflow list` and `gh workflow view TestFlight` will report a workflow that failed to parse. Do that in Task 5 and treat it as the real gate.

- [ ] **Step 8: Confirm the repo gates**

```bash
npm run typecheck   # expect: clean
npm run lint        # expect: 0 errors
```

- [ ] **Step 9: Commit**

```bash
git add .github/workflows/testflight.yml __tests__/testflight-workflow.test.ts package.json package-lock.json
git commit -m "feat(ci): TestFlight pipeline on a self-hosted macOS runner

Dispatch-only: prebuild (which runs pod install, and so the Didit bitcode
strip) -> archive -> export -> altool validate -> upload. One IPA, no
environment matrix, because this app switches gateway at runtime.

dry_run exercises the whole signing chain without consuming a build number or
notifying testers.

The invariant test is the point of the security argument rather than a
restatement of it: the trigger list, the runner label, the environment gate,
minimal permissions, always() teardown of the two secret paths outside the
workspace, and the absence of command-line signing settings are all asserted,
so a later edit reintroducing them fails a test."
```

---

### Task 4: the provisioning runbook

**Files:**
- Create: `super-app/docs/testflight.md`
- Modify: `super-app/AGENTS.md`

**Interfaces:**
- Consumes: the secret names from Task 3.
- Produces: nothing code-facing.

- [ ] **Step 1: Write the runbook**

Create `super-app/docs/testflight.md` covering, in this order:

1. **What the pipeline does** — one paragraph and a pointer to the spec.
2. **Runner requirements** — Apple silicon mac; Xcode **16.1+** (Expo 54 / RN 0.81, `deploymentTarget: "15.5"`); CocoaPods; Node 20; ~60 GB free for Xcode, the iOS SDK, DerivedData and the Pods cache.
3. **Runner host setup** — a dedicated **non-admin** macOS user; FileVault on; automatic login off; the GitHub Actions runner installed as a launchd service under that user with the label `macos-testflight`; `sudo xcodebuild -license accept`; and one interactive `xcodebuild` run to download the iOS platform SDK, because the first invocation on a fresh Xcode prompts and a prompt on a headless machine is an eventual timeout.
4. **Network egress** — `dev-api.unirefund.com` (for `npm run init`), `github.com`, `registry.npmjs.org`, `cdn.cocoapods.org`, Apple's upload endpoints.
5. **Producing each of the 15 secrets** — the table from the spec, expanded into commands:
   - `.p12`: Xcode → Settings → Accounts → Manage Certificates → right-click the Apple Distribution identity → Export, then `openssl base64 -A -in dist.p12 | pbcopy`.
   - `.mobileprovision`: developer.apple.com → Profiles → an **App Store** profile for `com.clomerce.unirefundsuperapp`, then `openssl base64 -A -in profile.mobileprovision | pbcopy`. `IOS_PROVISIONING_PROFILE_NAME` is the name shown in that list, character-exact.
   - `.p8`: App Store Connect → Users and Access → Integrations → Keys → **Developer** role. **Downloadable once.** `openssl base64 -A -in AuthKey_XXXX.p8 | pbcopy`.
   - Note that all three base64 values use `openssl base64 -A` so the output is a single line.
6. **Creating the environment** — `Settings → Environments → New environment → testflight`, add required reviewers, then add all 15 secrets to that environment rather than the repository, so they do not decrypt for any other workflow.
7. **Running a release** — Actions → TestFlight → Run workflow. Use `dry_run: true` first after any change to the pipeline. Explain that `build_number` need only be set to recover from a numbering collision.
8. **Rotation** — the distribution certificate and the profile both expire annually; the failure mode is a signing error mid-archive, not a warning. Note that re-issuing the certificate invalidates the old `.p12` and both secrets must be updated together.
9. **Troubleshooting** — at minimum: the archive hanging to timeout means `set-key-partition-list` did not take; *"Provisioning profile doesn't include the bundle identifier org.cocoapods.…"* means signing settings reached the Pods targets, so check that nothing passes them on the `xcodebuild` command line; error 90482 means `pod install` did not run and `withDiditBitcodeStrip.js` never fired, so check that `--clean` is still on the prebuild; a `403` from `altool` means the ASC key role is too low, and `App Manager` is the documented next step — not `Admin`.

- [ ] **Step 2: Add the pointer to `AGENTS.md`**

The file has no release section. Add one after "On-device QA":

```markdown
## Releases

iOS betas ship through `.github/workflows/testflight.yml` — a dispatch-only job
on a self-hosted mac (Actions → TestFlight → Run workflow). Run it with
`dry_run: true` after any change to the pipeline: that exercises prebuild,
signing, archive and Apple's own validation without consuming a build number or
notifying testers. Runner provisioning, the 15 required secrets and the
troubleshooting table are in [docs/testflight.md](docs/testflight.md); the design
and the rejected alternatives are in the spec linked from that file.

`version` in `app.config.js` stays hand-edited. Only `ios.buildNumber` is
derived, from `github.run_number`.
```

- [ ] **Step 3: Verify the links resolve**

```bash
ls docs/testflight.md
grep -n "docs/testflight.md" AGENTS.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/testflight.md AGENTS.md
git commit -m "docs: TestFlight runner provisioning and release runbook

Covers the Xcode 16.1 floor, the non-admin runner user, how to produce each of
the 15 secrets, annual cert/profile rotation, and the four failure modes worth
recognising on sight — including the keychain partition-list hang, which
presents as a job that never returns rather than one that fails."
```

---

### Task 5: full-gate verification and handoff

**Files:** none modified.

**Interfaces:** consumes everything above.

- [ ] **Step 1: Run the whole suite and compare against the baseline**

```bash
npm test 2>&1 | tail -30
```

Expected, per `AGENTS.md`: **1 failing suite** (`tokens.test.ts`), 3 failing tests. The three new suites from this plan must all pass, raising the totals but not the failure count. If a second suite fails, check whether it is `CardScannerModal.router.test.tsx` — the documented load-dependent flake — and re-run it alone before treating it as a regression:

```bash
npx jest CardScannerModal.router.test.tsx
```

- [ ] **Step 2: Re-confirm the two hard gates**

```bash
npm run typecheck   # expect: clean, 0 errors
npm run lint        # expect: 0 errors, 89 warnings
```

- [ ] **Step 3: Push the branch and let GitHub parse the workflow**

```bash
git push -u origin feat/testflight-pipeline
gh workflow list --all
gh workflow view TestFlight
```

This is the authoritative YAML check that `actionlint` would otherwise have provided. A workflow that fails to parse is reported here without ever running. Do not proceed while it reports a parse error.

- [ ] **Step 4: Report honestly what is and is not proven**

State plainly in the handoff:

- **Proven here:** the two config-file behaviours (Tasks 1–2), the workflow's structural and security invariants (Task 3), YAML parse acceptance by GitHub (Step 3), and that the repo gates hold.
- **Not proven, and not provable without the mac:** prebuild, `pod install` and the bitcode strip, the keychain import, scheme resolution, the archive, the export, `altool --validate-app`, and the upload.
- **Next action is the user's**, and blocks on their hardware: register the runner with the `macos-testflight` label, create the `testflight` environment with required reviewers, add the 15 secrets, then dispatch with `dry_run: true`.

Do not describe the pipeline as working. It is a pipeline that lints, parses and holds its invariants.

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: the two source changes → Tasks 1–2; the 16-step workflow table and the keychain/`altool` detail sections → Task 3 Step 4; the seven security-posture items → Task 3's invariant test (items 1, 2, 4, 5, 6, 7) and the runbook (item 3, the `Developer` ASC role); the 15 secrets → Task 3's header comment and Task 4 Step 1; runner provisioning → Task 4; the verification split → Task 5. The spec's "out of scope" list needs no task by definition.

**Placeholder scan.** No `TBD`/`TODO`. Every code step carries the literal content, and all three action SHAs are resolved and verified rather than described. Task 3 Step 5 re-checks them, which is a verification instruction over known values, not a gap. One case is worth calling out because it was caught here: the `actions/upload-artifact` pin was first written from memory as a v4 SHA that did not match the current release, so the plan's own verification step earned its place before an executor ever ran it.

**Type consistency.** `EXPO_IOS_PROVISIONING_PROFILE` (env var), `IOS_PROVISIONING_PROFILE_NAME` (secret) and `PROVISIONING_PROFILE_SPECIFIER` (build setting) are three distinct names for related things and are used consistently: the secret feeds the env var, which the plugin writes into the build setting. `IOS_BUILD_NUMBER` is the env var; `ios.buildNumber` the config key; `CFBundleVersion` the resulting plist key. The quoted forms asserted in Task 1's test (`'"Unirefund App Store"'`, `'"Apple Distribution"'`) match exactly what Task 1 Step 4 writes.
