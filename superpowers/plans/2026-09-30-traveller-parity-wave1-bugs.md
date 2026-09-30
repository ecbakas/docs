# Traveller Parity — Wave 1 (Bugs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the thirteen confirmed traveller bugs: five in web `apps/ssr` (S1–S5) and eight in `super-app` (M1–M8).

**Architecture:** Two independent tracks in two repos.
- Tasks 1–5 run in the web-app worktree. Task 5 also changes the `packages/utils` submodule.
- Tasks 6–13 run in the shared super-app checkout.
- Logic worth testing is pulled into plain `.ts` modules: ssr's Node `test:unit` loads no JSX, and super-app's node jest project needs no React Native. Screens only wire those modules in.

**Tech Stack:**
- ssr: Next.js 16, next-auth v5, pnpm; Node `node:test` via `test:unit`.
- super-app: React Native 0.81 + Expo 54, zustand, jest (`node` and `router` projects), `@testing-library/react-native`.

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-09-30-traveller-parity-wave1-bugs-design.md`, part of the roadmap in `2026-09-30-traveller-parity-roadmap.md` in the same folder.

## Global Constraints

**Checkouts**
- **ssr worktree:** `C:\unirefund\web-app-wt-traveller-parity`, branch `feat/traveller-parity`, base `origin/main` @ `671c4944d`. Never touch `C:\unirefund\web-app`; it is another session's checkout.
- **super-app:** `C:\unirefund\super-app`, branch `feat/traveller-web-parity`, base `0f582db`. This checkout is **shared** with other sessions.

**Git hygiene (both repos)**
- Run `git branch --show-current` immediately before every commit.
- Stage explicit paths only. Never `git add -A`, `git add .`, `git stash`, or `git reset --hard`.
- Write commit messages as a quoted heredoc (`git commit -F - <<'EOF' … EOF`), with no backticks or backslashes in the text.
- End every commit message with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Do not push** and do not open PRs. The user finishes the branch.

**Grants**
- Every gate is group **and** leaf. A control without its grant is not rendered. Disabling it is not enough.

**ssr**
- Never run `next build`. ssr dev is running on `:3010` from this worktree; leave it running.
- `packages/utils` in the worktree is a local clone at `63d2019`. Only Task 5 changes it.

**super-app**
- Never run native builds (`expo run:*`, gradle). The user runs those.
- Metro on 8095 serves CPadNFC (`LD38266200649`). Fast Refresh picks up saved files; do not reload the device.
- After adding an i18n key, run `npm run init` (it regenerates a gitignored bundle).
- Render tests must be named `*.router.test.ts(x)`. Plain `*.test.ts` runs in the `node` project and cannot import React Native.

**Comments**
- Keep code comments rare and short; the existing files' long docblocks are not the style to copy.

**Test accounts (dev)**
- Traveller: `tur-a25y29041` / `1q2w3E*`.

## Review Focus

Inputs the spec implies but no feature test would naturally exercise. Each one is pinned by a test in the task named.

1. **KYC login when the backend omits `refreshToken`.** Must behave exactly as today, with no literal `"undefined"` stored as a refresh token. Pinned in Task 5 (`ssrTokenCredentials` with `null` / `undefined`).
2. **An anonymous visitor on `/tag/[slug]` for an unowned tag.** Must still see "Log in to claim"; the new grant gate applies only to signed-in users. Pinned in Task 4 (`claimPropsFor`).
3. **A traveller whose stored query still holds a hidden field** (for example an export date left from an earlier build). The filter badge must not count it, but must still count statuses, which are sent. Pinned in Task 7 (`countTravellerFilters`).
4. **Verify Account approved, but `prove-document` fails.** Must show the Failed alert, never Approved, and must not refetch. Pinned in Task 8.
5. **Home before the unpaged fetch lands, or after it fails.** The summary falls back to the loaded page rather than showing zero. Pinned in Task 9.

---

## Task 0: Measure baselines (both repos)

**Files:** none changed.

- [ ] **Step 1: ssr state and gates**

```bash
cd /c/unirefund/web-app-wt-traveller-parity
git branch --show-current            # expect feat/traveller-parity
git status --short                   # expect empty
pnpm --filter ssr type-check 2>&1 | tail -5
pnpm --filter ssr lint 2>&1 | tail -3
pnpm --filter ssr test:unit 2>&1 | tail -8
```

Record each result.
- Expected: type-check exits 0; lint shows 0 errors (the warnings are all in `public/docext`); every `test:unit` test passes.
- If anything is red **before** any change, stop and report it; do not start Task 1.

- [ ] **Step 1b: Make `apps/web` type-checkable in the worktree**

Task 5 changes the shared `packages/utils`, so `web` must type-check too. The worktree was set up for ssr only. Copy web's gitignored generated files from the main checkout (read-only there), then take a baseline:

```bash
cd /c/unirefund/web-app-wt-traveller-parity
mkdir -p apps/web/src/language-data/i18n
cp /c/unirefund/web-app/apps/web/src/language-data/i18n/*.gen.json apps/web/src/language-data/i18n/
[ -f apps/web/next-env.d.ts ] || cp /c/unirefund/web-app/apps/web/next-env.d.ts apps/web/next-env.d.ts
git status --short     # must still be empty: these files are gitignored
pnpm --filter web type-check 2>&1 | tail -5
```
Record the result as the `web` baseline. It may carry errors that are not yours (for example the 2 known `mrz` TS2307s without the Packages token). Task 5 compares against this list.

- [ ] **Step 2: super-app state and gates**

```bash
cd /c/unirefund/super-app
git branch --show-current            # expect feat/traveller-web-parity
git status --short                   # note any files that are not yours; leave them alone
npm run typecheck 2>&1 | tail -5     # baseline: exactly 1 error, tabBackNavigation.router.test.tsx:119
npx jest 2>&1 | tail -6              # baseline: all suites pass (1 skipped test)
```

Record the counts. A later run is compared against these numbers, not against AGENTS.md.

---

## Task 1 (S1): Delete the public Superset token route

**Files:**
- Delete: `apps/ssr/src/app/api/token/route.ts`

- [ ] **Step 1: Prove nothing calls it**

```bash
cd /c/unirefund/web-app-wt-traveller-parity
git grep -n "api/token" -- apps packages | grep -v "token-store"
```
Expected: only `apps/ssr/src/app/api/token/route.ts` itself, or no output. If anything else references it, stop and report.

- [ ] **Step 2: Confirm it answers today**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3010/api/token"
```
Expected: `400`. With no `dashboardId`, the handler replies "Dashboard id not found" before calling Superset, so this is safe to call.

- [ ] **Step 3: Delete it**

```bash
git rm -q apps/ssr/src/app/api/token/route.ts
```

- [ ] **Step 4: Verify**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3010/api/token"
pnpm --filter ssr type-check 2>&1 | tail -5
```
- The curl must print `404`.
- If type-check reports TS2307 errors under `apps/ssr/.next/`, they come from the running dev server's generated types for the deleted route:
  - delete only the named generated files, for example `rm -rf apps/ssr/.next/types/app/api/token apps/ssr/.next/dev/types/app/api/token`;
  - then re-run type-check. It must exit 0.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # feat/traveller-parity
git commit -q -F - <<'EOF'
fix(ssr): delete the unauthenticated Superset token route

It minted Superset guest tokens with hard-coded admin credentials, sat
outside the auth middleware, and nothing in the repo called it.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2 (S2): KYC login sends a new traveller to the create form

**Files:**
- Modify: `apps/ssr/src/app/[lang]/(auth)/login/kyc/didit.tsx:94`

- [ ] **Step 1: Make the change**

In `didit.tsx`, replace:

```tsx
          router.push(`/${lang}/register?evidenceId=${sessionId}`);
```

with:

```tsx
          router.push(`/${lang}/register?sessionId=${sessionId}`);
```

`register/page.tsx:31` reads `sessionId` and renders `CreateTravellerForm` when it is present.

- [ ] **Step 2: Verify**

```bash
cd /c/unirefund/web-app-wt-traveller-parity
git grep -n "register?evidenceId" -- apps/ssr     # expect no output
pnpm --filter ssr type-check 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add "apps/ssr/src/app/[lang]/(auth)/login/kyc/didit.tsx"
git branch --show-current
git commit -q -F - <<'EOF'
fix(ssr): hand a new KYC traveller to the create form

KYC login pushed register?evidenceId, but the register page reads
sessionId, so a traveller without an account was sent through a second
Didit verification.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3 (S4): Remove the dead Download PDF button

**Files:**
- Modify: `apps/ssr/src/app/[lang]/(main)/tags/[tagNumber]/_components/invoice-summary.tsx`
- Modify: `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json:250`
- Modify: `apps/ssr/src/language-data/unirefund/SSRService/resources/tr.json:250`

- [ ] **Step 1: Remove the button**

In `invoice-summary.tsx`:
- Delete the `import { Button } from "@repo/ayasofyazilim-ui/components/button";` line.
- Change `import { Download, Receipt } from "lucide-react";` to `import { Receipt } from "lucide-react";`.
- Delete this whole block:

```tsx
        <Button
          data-testid="download-pdf-button"
          className="flex w-full gap-2"
          variant="default"
        >
          <Download className="h-4 w-4" />
          {t.SSRService["InvoiceSummary.DownloadPDF"]}
        </Button>
```

- [ ] **Step 2: Remove the key in both locales**

- In `en.json`, delete the line `  "InvoiceSummary.DownloadPDF": "Download PDF",`.
- In `tr.json`, delete the line `  "InvoiceSummary.DownloadPDF": "PDF İndir",`.
- If the deleted line was the last entry in its object, remove the trailing comma from the line above it.

- [ ] **Step 3: Verify**

```bash
cd /c/unirefund/web-app-wt-traveller-parity
node -e 'for (const f of ["en","tr"]) JSON.parse(require("fs").readFileSync(`apps/ssr/src/language-data/unirefund/SSRService/resources/${f}.json`,"utf8")); console.log("json ok")'
git grep -n "DownloadPDF\|download-pdf-button" -- apps/ssr ':!**/*.gen.json'   # expect no output
pnpm --filter ssr type-check 2>&1 | tail -3
pnpm --filter ssr lint 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add "apps/ssr/src/app/[lang]/(main)/tags/[tagNumber]/_components/invoice-summary.tsx" apps/ssr/src/language-data/unirefund/SSRService/resources/en.json apps/ssr/src/language-data/unirefund/SSRService/resources/tr.json
git branch --show-current
git commit -q -F - <<'EOF'
fix(ssr): drop the tag detail's Download PDF button

It had no handler, and no SDK exposes a tag PDF or receipt endpoint.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4 (S5): Gate claim and risk controls by their grant pairs

**Files:**
- Create: `apps/ssr/src/components/tags/tag-grants.ts`
- Create: `apps/ssr/src/components/tags/tag-grants.test.ts`
- Create: `apps/ssr/src/app/[lang]/(public)/tag/[slug]/claim-props.ts`
- Create: `apps/ssr/src/app/[lang]/(public)/tag/[slug]/claim-props.test.ts`
- Modify: `apps/ssr/src/app/[lang]/(public)/tag/[slug]/page.tsx` (remove the local `claimPropsFor` at :117-131; its callers are at :172 and :237)
- Modify: `apps/ssr/src/app/[lang]/(main)/tags/_components/tag-claim.tsx:5,15-19`
- Modify: `apps/ssr/src/app/[lang]/(public)/validate/_components/validate-client.tsx` (`:211-233`)
- Modify: `apps/ssr/src/app/[lang]/(main)/tags/_components/tag-table-view.tsx` (the Risk header at `:127` and the Risk cell at `:160-174`)

**Interfaces:**
- Produces: `tagGrants(granted: Granted): { claim: boolean; viewRisk: boolean }`, where `Granted = Record<string, boolean | undefined> | null | undefined`.
- Produces: `claimPropsFor(data: TagPublicDetail, opts: { isAuthenticated: boolean; canClaim: boolean; loginUrl: string }): { isAuthenticated: boolean; loginUrl: string; salesAmount: number } | undefined`.

- [ ] **Step 1: Write the failing tests**

`apps/ssr/src/components/tags/tag-grants.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tagGrants } from "./tag-grants";

const ALL = {
  "TagService.Tags": true,
  "TagService.Tags.TravellerSelfAssign": true,
  "TagService.TagRisks": true,
  "TagService.TagRisks.ViewRiskLevel": true,
};

describe("tagGrants", () => {
  it("allows both when every grant is held", () => {
    assert.deepEqual(tagGrants(ALL), { claim: true, viewRisk: true });
  });

  it("allows nothing without grants", () => {
    assert.deepEqual(tagGrants(undefined), { claim: false, viewRisk: false });
  });

  it("needs the group as well as the leaf", () => {
    assert.equal(tagGrants({ ...ALL, "TagService.Tags": false }).claim, false);
    assert.equal(
      tagGrants({ ...ALL, "TagService.TagRisks": false }).viewRisk,
      false
    );
  });

  it("needs the leaf as well as the group", () => {
    assert.equal(
      tagGrants({ ...ALL, "TagService.Tags.TravellerSelfAssign": false }).claim,
      false
    );
    assert.equal(
      tagGrants({ ...ALL, "TagService.TagRisks.ViewRiskLevel": false })
        .viewRisk,
      false
    );
  });
});
```

`apps/ssr/src/app/[lang]/(public)/tag/[slug]/claim-props.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { claimPropsFor } from "./claim-props";

const unowned = {
  totals: [{ totalType: "SalesAmount", amount: 250 }],
} as Parameters<typeof claimPropsFor>[0];
const owned = {
  ...unowned,
  traveller: { travellerDocumentNumber: "P123" },
} as Parameters<typeof claimPropsFor>[0];
const loginUrl = "/en/login?redirectTo=x";

describe("claimPropsFor", () => {
  it("offers nothing on a tag someone already owns", () => {
    assert.equal(
      claimPropsFor(owned, { isAuthenticated: true, canClaim: true, loginUrl }),
      undefined
    );
  });

  it("offers the claim to a signed-in traveller holding the grant", () => {
    assert.deepEqual(
      claimPropsFor(unowned, {
        isAuthenticated: true,
        canClaim: true,
        loginUrl,
      }),
      { isAuthenticated: true, loginUrl, salesAmount: 250 }
    );
  });

  it("hides the claim from a signed-in user without the grant", () => {
    assert.equal(
      claimPropsFor(unowned, {
        isAuthenticated: true,
        canClaim: false,
        loginUrl,
      }),
      undefined
    );
  });

  it("still invites an anonymous visitor to log in", () => {
    assert.deepEqual(
      claimPropsFor(unowned, {
        isAuthenticated: false,
        canClaim: false,
        loginUrl,
      }),
      { isAuthenticated: false, loginUrl, salesAmount: 250 }
    );
  });

  it("falls back to a zero sales amount", () => {
    assert.equal(
      claimPropsFor({} as Parameters<typeof claimPropsFor>[0], {
        isAuthenticated: true,
        canClaim: true,
        loginUrl,
      })?.salesAmount,
      0
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd /c/unirefund/web-app-wt-traveller-parity/apps/ssr
node --import tsx --test "src/components/tags/tag-grants.test.ts" "src/app/[lang]/(public)/tag/[slug]/claim-props.test.ts"
```
Expected: both fail with a module-not-found error for `./tag-grants` / `./claim-props`.

- [ ] **Step 3: Implement the two modules**

`apps/ssr/src/components/tags/tag-grants.ts`:

```ts
type Granted = Record<string, boolean | undefined> | null | undefined;

const has = (granted: Granted, ...required: string[]) =>
  required.every((policy) => granted?.[policy]);

export function tagGrants(granted: Granted) {
  return {
    claim: has(
      granted,
      "TagService.Tags",
      "TagService.Tags.TravellerSelfAssign"
    ),
    viewRisk: has(
      granted,
      "TagService.TagRisks",
      "TagService.TagRisks.ViewRiskLevel"
    ),
  };
}
```

`apps/ssr/src/app/[lang]/(public)/tag/[slug]/claim-props.ts`:

```ts
import type { UniRefund_TagService_Tags_TagPublicDetailDto as TagPublicDetail } from "@repo/saas/TagService";

// Offered only while nobody owns the tag. An anonymous visitor is always invited
// to log in; a signed-in one needs the self-assign grant.
export function claimPropsFor(
  data: TagPublicDetail,
  {
    isAuthenticated,
    canClaim,
    loginUrl,
  }: { isAuthenticated: boolean; canClaim: boolean; loginUrl: string }
) {
  if (data.traveller?.travellerDocumentNumber) return undefined;
  if (isAuthenticated && !canClaim) return undefined;
  const salesAmount =
    data.totals?.find((total) => total.totalType === "SalesAmount")?.amount ??
    0;
  return { isAuthenticated, loginUrl, salesAmount };
}
```

- [ ] **Step 4: Run them to verify they pass**

The same command as Step 2. Expected: every test passes.

- [ ] **Step 5: Wire the slug page**

In `apps/ssr/src/app/[lang]/(public)/tag/[slug]/page.tsx`:
- Delete the local `claimPropsFor` function and its doc comment (`:117-131`).
- Add these imports:

```ts
import { tagGrants } from "@/src/components/tags/tag-grants";
import { getApplicationConfiguration } from "@repo/utils/app-config/fetch";
import { claimPropsFor } from "./claim-props";
```

- Replace `const [t, session] = await Promise.all([getTranslations(lang), auth()]);` with:

```ts
  const [t, session, { policies }] = await Promise.all([
    getTranslations(lang),
    auth(),
    getApplicationConfiguration(),
  ]);
  const canClaim = tagGrants(policies).claim;
```

- In **both** `claimPropsFor(result.data, { … })` calls, add `canClaim,` beside `isAuthenticated: !!session,`.

- [ ] **Step 6: Wire the /tags claim button**

In `apps/ssr/src/app/[lang]/(main)/tags/_components/tag-claim.tsx`:
- Replace `import { isActionGranted } from "@repo/utils/policies";` with `import { tagGrants } from "@/src/components/tags/tag-grants";`.
- Replace:

```tsx
  const hasGrant = isActionGranted(
    ["TagService.Tags.TravellerSelfAssign"],
    grantedPolicies
  );
```
with:
```tsx
  const hasGrant = tagGrants(grantedPolicies).claim;
```

- [ ] **Step 7: Wire validate's "Claim missing tags"**

In `apps/ssr/src/app/[lang]/(public)/validate/_components/validate-client.tsx`:
- Add these imports:

```ts
import { tagGrants } from "@/src/components/tags/tag-grants";
import { useApplicationConfiguration } from "@repo/utils/app-config";
```

- After `const { t } = useTranslations();` add:

```ts
  const { policies: grantedPolicies } = useApplicationConfiguration();
  const canClaim = tagGrants(grantedPolicies).claim;
```

- Change the guard `{state === "validated" && scanResult && (` (just above the `missing-tags-button`) to:

```tsx
      {state === "validated" && scanResult && canClaim && (
```

- [ ] **Step 8: Gate the risk column**

In `apps/ssr/src/app/[lang]/(main)/tags/_components/tag-table-view.tsx`:
- Add these imports:

```ts
import { tagGrants } from "@/src/components/tags/tag-grants";
import { useApplicationConfiguration } from "@repo/utils/app-config";
```

- After `const { t } = useTranslations();` in `TagTableView` add:

```ts
  const { policies: grantedPolicies } = useApplicationConfiguration();
  const showRisk = tagGrants(grantedPolicies).viewRisk;
```

- Wrap the Risk header:

```tsx
            {showRisk && <TableHead>{t.SSRService["Tags.Risk"]}</TableHead>}
```

- Wrap the whole Risk `<TableCell>…</TableCell>` (the one holding `riskLevel ? (…) : (…)`) in `{showRisk && ( … )}`.

- [ ] **Step 9: Gates**

```bash
cd /c/unirefund/web-app-wt-traveller-parity
pnpm --filter ssr test:unit 2>&1 | tail -6
pnpm --filter ssr type-check 2>&1 | tail -3
pnpm --filter ssr lint 2>&1 | tail -3
```
Expected: every test passes, type-check exits 0, lint shows 0 errors.

- [ ] **Step 10: Commit**

```bash
git add apps/ssr/src/components/tags/tag-grants.ts apps/ssr/src/components/tags/tag-grants.test.ts "apps/ssr/src/app/[lang]/(public)/tag/[slug]/claim-props.ts" "apps/ssr/src/app/[lang]/(public)/tag/[slug]/claim-props.test.ts" "apps/ssr/src/app/[lang]/(public)/tag/[slug]/page.tsx" "apps/ssr/src/app/[lang]/(main)/tags/_components/tag-claim.tsx" "apps/ssr/src/app/[lang]/(public)/validate/_components/validate-client.tsx" "apps/ssr/src/app/[lang]/(main)/tags/_components/tag-table-view.tsx"
git branch --show-current
git commit -q -F - <<'EOF'
fix(ssr): gate tag claim and risk on their grant pairs

The tags-page claim checked only the leaf, and the public tag overlay
and validate's claim-missing-tags button checked nothing. Risk was shown
without TagRisks.ViewRiskLevel. All four now read one pure tagGrants
module; anonymous visitors are still invited to log in to claim.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5 (S3): KYC logins keep their refresh token (submodule + pointer bump)

**Files:**
- Create: `apps/ssr/src/app/[lang]/(auth)/login/kyc/ssr-token-credentials.ts`
- Create: `apps/ssr/src/app/[lang]/(auth)/login/kyc/ssr-token-credentials.test.ts`
- Modify: `apps/ssr/src/app/[lang]/(auth)/login/kyc/login-via-ssr-action.ts:39-46`
- Modify (submodule): `packages/utils/auth/auth.ts:170-205`, the `ssr-token` provider
- Modify (superproject): the `packages/utils` gitlink

**Interfaces:**
- Produces: `ssrTokenCredentials(token: { accessToken: string; expiresIn: number; refreshToken?: string | null }): { accessToken: string; expiresIn: string; refreshToken: string }`.

- [ ] **Step 1: Write the failing test**

`apps/ssr/src/app/[lang]/(auth)/login/kyc/ssr-token-credentials.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ssrTokenCredentials } from "./ssr-token-credentials";

describe("ssrTokenCredentials", () => {
  it("passes the refresh token through", () => {
    assert.deepEqual(
      ssrTokenCredentials({
        accessToken: "a",
        expiresIn: 3600,
        refreshToken: "r",
      }),
      { accessToken: "a", expiresIn: "3600", refreshToken: "r" }
    );
  });

  it("sends an empty string when the backend returns none", () => {
    assert.equal(
      ssrTokenCredentials({ accessToken: "a", expiresIn: 1 }).refreshToken,
      ""
    );
    assert.equal(
      ssrTokenCredentials({ accessToken: "a", expiresIn: 1, refreshToken: null })
        .refreshToken,
      ""
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /c/unirefund/web-app-wt-traveller-parity/apps/ssr
node --import tsx --test "src/app/[lang]/(auth)/login/kyc/ssr-token-credentials.test.ts"
```
Expected: FAIL, because `./ssr-token-credentials` cannot be found.

- [ ] **Step 3: Implement it**

`apps/ssr/src/app/[lang]/(auth)/login/kyc/ssr-token-credentials.ts`:

```ts
// next-auth stringifies credentials, so an absent token must be "" rather than
// undefined, which would arrive as the string "undefined".
export function ssrTokenCredentials(token: {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string | null;
}) {
  return {
    accessToken: token.accessToken,
    expiresIn: String(token.expiresIn),
    refreshToken: token.refreshToken ?? "",
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

The same command as Step 2. Expected: PASS.

- [ ] **Step 5: Use it in the login action**

In `login-via-ssr-action.ts`:
- Add `import { ssrTokenCredentials } from "./ssr-token-credentials";`.
- Replace:

```ts
    const { accessToken, expiresIn } = tokenResponse.data;

    // Use signIn with the SSR token provider
    await signIn("ssr-token", {
      accessToken,
      expiresIn: String(expiresIn),
      redirect: true,
      redirectTo,
    });
```
with:
```ts
    await signIn("ssr-token", {
      ...ssrTokenCredentials(tokenResponse.data),
      redirect: true,
      redirectTo,
    });
```

- [ ] **Step 6: Branch inside the submodule**

```bash
cd /c/unirefund/web-app-wt-traveller-parity/packages/utils
git rev-parse --short HEAD        # expect 63d2019
git remote set-url origin https://github.com/ayasofyazilim-clomerce/web-utils.git
git checkout -q -b fix/ssr-token-refresh
git branch --show-current         # fix/ssr-token-refresh
```

- [ ] **Step 7: Accept the token in the provider**

In `packages/utils/auth/auth.ts`, inside the `Credentials({ id: "ssr-token", … })` block:
- Change `credentials: { accessToken: {}, expiresIn: {} },` to `credentials: { accessToken: {}, expiresIn: {}, refreshToken: {} },`.
- Replace:

```ts
          const user_data = await getUserData(
            credentials.accessToken as string,
            "", // SSR login doesn't provide refresh token
            expirationDate
          );
          // Cache the access token server-side (no refresh token for SSR)
          if (user_data.sub) {
            await setTokenCache(
              user_data.sub,
              "",
              credentials.accessToken as string,
              expirationDate
            );
          }
```
with:
```ts
          const refreshToken =
            typeof credentials.refreshToken === "string"
              ? credentials.refreshToken
              : "";
          const user_data = await getUserData(
            credentials.accessToken as string,
            refreshToken,
            expirationDate
          );
          if (user_data.sub) {
            await setTokenCache(
              user_data.sub,
              refreshToken,
              credentials.accessToken as string,
              expirationDate
            );
          }
```

`resolveAccessToken` (`auth.ts:70-76`) already refreshes whenever the cached `refresh_token` is non-empty. An empty one keeps today's "use until expiry" branch, so nothing else changes.

- [ ] **Step 8: Gates**

```bash
cd /c/unirefund/web-app-wt-traveller-parity
pnpm --filter ssr test:unit 2>&1 | tail -6
pnpm --filter ssr type-check 2>&1 | tail -3
pnpm --filter web type-check 2>&1 | tail -3     # packages/utils is shared, so web must still compile
pnpm --filter ssr lint 2>&1 | tail -3
```
Expected: all green. `web` type-check must be as clean as it was at Task 0. If `web` was red at Task 0, compare the error lists.

- [ ] **Step 9: Commit inside the submodule first**

```bash
cd /c/unirefund/web-app-wt-traveller-parity/packages/utils
git add auth/auth.ts
git branch --show-current   # fix/ssr-token-refresh
git commit -q -F - <<'EOF'
fix(auth): keep the refresh token of an SSR-token login

get-access-token returns a refresh token, but the ssr-token provider
stored an empty one, so a KYC session died at its first expiry and a
document switch could not refresh the session.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
git log --oneline -1
```

- [ ] **Step 10: Commit the ssr change and the pointer bump**

```bash
cd /c/unirefund/web-app-wt-traveller-parity
git add "apps/ssr/src/app/[lang]/(auth)/login/kyc/ssr-token-credentials.ts" "apps/ssr/src/app/[lang]/(auth)/login/kyc/ssr-token-credentials.test.ts" "apps/ssr/src/app/[lang]/(auth)/login/kyc/login-via-ssr-action.ts" packages/utils
git diff --cached --stat     # expect the 3 ssr files plus "packages/utils | 2 +-"
git branch --show-current    # feat/traveller-parity
git commit -q -F - <<'EOF'
fix(ssr): keep the refresh token of a KYC login

Passes the refreshToken that get-access-token returns through to the
ssr-token provider, and bumps packages/utils to the provider change that
stores it. KYC sessions now refresh, and switching the active document
no longer fails for them.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

The `packages/utils` commit exists only locally. The web-utils PR has to merge before this web-app commit is buildable by anyone else. Say so in the final report.

---

## Task 6 (M1): Edit profile saves the email

**Files:**
- Create: `super-app/src/screens/shared/Profile/profileUpdate.ts`
- Create: `super-app/src/screens/shared/Profile/__tests__/profileUpdate.test.ts`
- Modify: `super-app/src/screens/shared/Profile/EditProfileScreen.tsx:43-49`

**Interfaces:**
- Produces: `buildProfileUpdate<T extends object>(user: T | null | undefined, fields: ProfileFields): T & ProfileFields`, where `ProfileFields = { name; surname; userName; email; phoneNumber }`, all strings.

- [ ] **Step 1: Write the failing test**

`src/screens/shared/Profile/__tests__/profileUpdate.test.ts`:

```ts
import { buildProfileUpdate } from "../profileUpdate";

const fields = {
  name: "Ada",
  surname: "Lovelace",
  userName: "ada",
  email: "new@example.com",
  phoneNumber: "+905551112233",
};

it("sends every edited field, including the email", () => {
  expect(
    buildProfileUpdate({ email: "old@example.com", userId: "u1" }, fields),
  ).toEqual({ userId: "u1", ...fields });
});

it("works before the profile has loaded", () => {
  expect(buildProfileUpdate(undefined, fields)).toEqual(fields);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /c/unirefund/super-app
npx jest src/screens/shared/Profile/__tests__/profileUpdate.test.ts
```
Expected: FAIL, "Cannot find module '../profileUpdate'".

- [ ] **Step 3: Implement it**

`src/screens/shared/Profile/profileUpdate.ts`:

```ts
export interface ProfileFields {
  name: string;
  surname: string;
  userName: string;
  email: string;
  phoneNumber: string;
}

export function buildProfileUpdate<T extends object>(
  user: T | null | undefined,
  fields: ProfileFields,
): T & ProfileFields {
  return { ...(user ?? ({} as T)), ...fields };
}
```

- [ ] **Step 4: Use it in the screen**

In `EditProfileScreen.tsx`:
- Add `import { buildProfileUpdate } from "./profileUpdate";`.
- Replace:

```tsx
    const updatedProfile = {
      ...user,
      name: nameInput,
      surname: surnameInput,
      phoneNumber: phoneNumber.number,
      userName: usernameInput,
    };
```
with:
```tsx
    const updatedProfile = buildProfileUpdate(user, {
      name: nameInput,
      surname: surnameInput,
      userName: usernameInput,
      email: emailInput,
      phoneNumber: phoneNumber.number,
    });
```

- [ ] **Step 5: Verify**

```bash
npx jest src/screens/shared/Profile/__tests__/profileUpdate.test.ts
npm run typecheck 2>&1 | tail -3     # still only the 1 baseline error
npx eslint src/screens/shared/Profile/profileUpdate.ts src/screens/shared/Profile/EditProfileScreen.tsx src/screens/shared/Profile/__tests__/profileUpdate.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/screens/shared/Profile/profileUpdate.ts src/screens/shared/Profile/__tests__/profileUpdate.test.ts src/screens/shared/Profile/EditProfileScreen.tsx
git branch --show-current   # feat/traveller-web-parity
git commit -q -F - <<'EOF'
fix(profile): save the edited email

The email field was editable and required but never sent, so the
profile kept the old address.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 7 (M2): The traveller filter sheet offers only what the endpoint applies

**Files:**
- Create: `super-app/src/screens/shared/Tags/Tag/_components/travellerFilters.ts`
- Create: `super-app/src/screens/shared/Tags/Tag/_components/__tests__/travellerFilters.test.ts`
- Create: `super-app/src/screens/shared/Tags/Tag/_components/__tests__/TagFilterSheet.router.test.tsx`
- Modify: `super-app/src/screens/shared/Tags/Tag/_components/TagFilterSheet.tsx` (props at `:47-65`, body at `:163-213`)
- Modify: `super-app/src/screens/shared/Tags/Tag/TagScreen.tsx` (`:630` and `:1249-1255`)

**Interfaces:**
- Produces: `countTravellerFilters(query: TagQuery): number`.
- Produces: a new `TagFilterSheet` prop, `travellerScope?: boolean` (default `false`).

- [ ] **Step 1: Write the failing count test**

`src/screens/shared/Tags/Tag/_components/__tests__/travellerFilters.test.ts`:

```ts
import { EMPTY_TAG_QUERY, type TagQuery } from "@/store/tag";
import { countTravellerFilters } from "../travellerFilters";

const query = (patch: Partial<TagQuery>): TagQuery => ({
  ...EMPTY_TAG_QUERY,
  ...patch,
});

it("counts nothing on an empty query", () => {
  expect(countTravellerFilters(EMPTY_TAG_QUERY)).toBe(0);
});

it("counts the issue-date range once", () => {
  expect(
    countTravellerFilters(
      query({ issuedStartDate: "2026-09-01", issuedEndDate: "2026-09-30" }),
    ),
  ).toBe(1);
});

it("counts statuses, which the traveller endpoint does send", () => {
  expect(countTravellerFilters(query({ statuses: ["Issued"] as never }))).toBe(1);
});

it("ignores fields the traveller endpoint never receives", () => {
  expect(
    countTravellerFilters(
      query({
        tagNumber: "T-1",
        exportStartDate: "2026-09-01",
        exportEndDate: "2026-09-30",
        paidStartDate: "2026-09-01",
        paidEndDate: "2026-09-30",
      }),
    ),
  ).toBe(0);
});
```

If `@/store/tag` pulls React Native and the `node` project cannot load it, rename the file to `travellerFilters.router.test.ts`. Change nothing else.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /c/unirefund/super-app
npx jest src/screens/shared/Tags/Tag/_components/__tests__/travellerFilters
```
Expected: FAIL, because `../travellerFilters` cannot be found.

- [ ] **Step 3: Implement it**

`src/screens/shared/Tags/Tag/_components/travellerFilters.ts`:

```ts
import type { TagQuery } from "@/store/tag";

// The traveller endpoint applies only the issue-date range and statuses
// (useLoadTags.queryToParams), so only those may light the badge.
export function countTravellerFilters(query: TagQuery): number {
  return (
    (query.issuedStartDate !== undefined ? 1 : 0) +
    (query.statuses.length > 0 ? 1 : 0)
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

The same command as Step 2. Expected: PASS.

- [ ] **Step 5: Write the failing sheet test**

`src/screens/shared/Tags/Tag/_components/__tests__/TagFilterSheet.router.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import React from "react";
import { EMPTY_TAG_QUERY } from "@/store/tag";
import { TagFilterSheet } from "../TagFilterSheet";

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

jest.mock("@/components/BottomSheet", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const react = require("react");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    BottomSheet: react.forwardRef(
      (props: { children: React.ReactNode }, _ref: unknown) => props.children,
    ),
  };
});

jest.mock("@gorhom/bottom-sheet", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const rn = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { BottomSheetScrollView: rn.ScrollView };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/components/Ionicons", () => ({ Ionicons: () => null }));

jest.mock("../../landscape/_components/RailControls", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const react = require("react");
  const { Text, View } = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  const Labelled = ({ label }: { label: string }) =>
    react.createElement(Text, null, label);
  return {
    RailSection: ({ children }: { children: React.ReactNode }) =>
      react.createElement(View, null, children),
    RailTextInput: Labelled,
    RailDateRange: Labelled,
    RailChips: Labelled,
  };
});

function renderSheet(travellerScope: boolean) {
  return render(
    <TagFilterSheet
      sheetRef={{ current: null }}
      query={EMPTY_TAG_QUERY}
      onApply={jest.fn()}
      canViewRisk
      travellerScope={travellerScope}
    />,
  );
}

it("offers a traveller only the issue-date range", () => {
  renderSheet(true);

  expect(screen.getByText("MobileApp.Tags.IssueDate")).toBeTruthy();
  expect(screen.queryByText("MobileApp.Tags.TagNumber")).toBeNull();
  expect(screen.queryByText("MobileApp.Tags.Rail.ExportDate")).toBeNull();
  expect(screen.queryByText("MobileApp.Tags.Rail.PaidDate")).toBeNull();
  expect(
    screen.queryByText("MobileApp.Tags.Rail.RiskEvaluationDate"),
  ).toBeNull();
});

it("keeps every field for staff", () => {
  renderSheet(false);

  expect(screen.getByText("MobileApp.Tags.TagNumber")).toBeTruthy();
  expect(screen.getByText("MobileApp.Tags.Rail.ExportDate")).toBeTruthy();
  expect(screen.getByText("MobileApp.Tags.Rail.PaidDate")).toBeTruthy();
  expect(
    screen.getByText("MobileApp.Tags.Rail.RiskEvaluationDate"),
  ).toBeTruthy();
});
```

- [ ] **Step 6: Run it to verify it fails**

```bash
npx jest src/screens/shared/Tags/Tag/_components/__tests__/TagFilterSheet.router.test.tsx
```
Expected: the traveller case FAILS, finding `MobileApp.Tags.TagNumber`, and the staff case passes. If it fails to *load* instead, add the missing module mock the error names (the pattern above) until the failure is the assertion.

- [ ] **Step 7: Implement the prop**

In `TagFilterSheet.tsx`:
- Add `travellerScope = false,` to the destructured props, and to the prop type:

```ts
  /** The traveller endpoint applies only the issue-date range. */
  travellerScope?: boolean;
```

- Replace the body from `<RailSection first title={t("MobileApp.Tags.Rail.GroupTraveller")}>` through the closing `)}` of the `canFilterByRisk` block with:

```tsx
          {!travellerScope && (
            <RailSection first title={t("MobileApp.Tags.Rail.GroupTraveller")}>
              <RailTextInput
                label={t("MobileApp.Tags.TagNumber")}
                value={draft.tagNumber}
                onChange={(tagNumber) => patch({ tagNumber })}
              />
            </RailSection>
          )}

          <RailSection
            first={travellerScope}
            title={t("MobileApp.Tags.Rail.GroupDates")}
          >
            <RailDateRange
              label={t("MobileApp.Tags.IssueDate")}
              start={draft.issuedStartDate}
              end={draft.issuedEndDate}
              onChange={({ start, end }) =>
                patch({ issuedStartDate: start, issuedEndDate: end })
              }
            />
            {!travellerScope && (
              <>
                <RailDateRange
                  label={t("MobileApp.Tags.Rail.ExportDate")}
                  start={draft.exportStartDate}
                  end={draft.exportEndDate}
                  onChange={({ start, end }) =>
                    patch({ exportStartDate: start, exportEndDate: end })
                  }
                />
                <RailDateRange
                  label={t("MobileApp.Tags.Rail.PaidDate")}
                  start={draft.paidStartDate}
                  end={draft.paidEndDate}
                  onChange={({ start, end }) =>
                    patch({ paidStartDate: start, paidEndDate: end })
                  }
                />
              </>
            )}
            {canViewRisk && !travellerScope && (
              <RailDateRange
                label={t("MobileApp.Tags.Rail.RiskEvaluationDate")}
                start={draft.lastRiskEvaluationStartDate}
                end={draft.lastRiskEvaluationEndDate}
                onChange={({ start, end }) =>
                  patch({
                    lastRiskEvaluationStartDate: start,
                    lastRiskEvaluationEndDate: end,
                  })
                }
              />
            )}
          </RailSection>

          {canFilterByRisk && !travellerScope && (
            <RailSection title={t("MobileApp.Tags.Rail.GroupNarrow")}>
              <RailChips
                label={t("MobileApp.Tags.Rail.RiskLevel")}
                options={RISK_LEVELS.map((level) => ({
                  value: level,
                  label: t(`MobileApp.Tags.RiskLabel.${level}`),
                }))}
                value={draft.riskLevels}
                onChange={(riskLevels) => patch({ riskLevels })}
              />
            </RailSection>
          )}
```

- [ ] **Step 8: Wire TagScreen**

In `TagScreen.tsx`:
- Add `import { countTravellerFilters } from "./_components/travellerFilters";`.
- Replace `const activeFilterCount = countRailFilters(query);` with:

```tsx
  const activeFilterCount = isStaff
    ? countRailFilters(query)
    : countTravellerFilters(query);
```

- In the `<TagFilterSheet … />` element, add `travellerScope={!isStaff}`.

- [ ] **Step 9: Verify**

```bash
npx jest src/screens/shared/Tags/Tag
npm run typecheck 2>&1 | tail -3
npx eslint src/screens/shared/Tags/Tag/_components/TagFilterSheet.tsx src/screens/shared/Tags/Tag/_components/travellerFilters.ts src/screens/shared/Tags/Tag/TagScreen.tsx src/screens/shared/Tags/Tag/_components/__tests__/TagFilterSheet.router.test.tsx src/screens/shared/Tags/Tag/_components/__tests__/travellerFilters.test.ts
```
Expected: every suite under `Tags/Tag` passes, including the existing `TagScreen*` suites, and typecheck shows only the baseline error.

- [ ] **Step 10: Commit**

```bash
git add src/screens/shared/Tags/Tag/_components/travellerFilters.ts src/screens/shared/Tags/Tag/_components/__tests__/travellerFilters.test.ts src/screens/shared/Tags/Tag/_components/__tests__/TagFilterSheet.router.test.tsx src/screens/shared/Tags/Tag/_components/TagFilterSheet.tsx src/screens/shared/Tags/Tag/TagScreen.tsx
git branch --show-current
git commit -q -F - <<'EOF'
fix(tags): offer a traveller only the filters their list applies

The cross-tenant traveller endpoint takes the issue-date range and
statuses only. Tag number, export date, paid date and risk-evaluation
date lit the badge and narrowed nothing, so they are hidden for the
traveller scope and the badge counts what is sent.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 8 (M3): Verify Account records its result

**Files:**
- Modify: `super-app/src/screens/traveller/Documents/useDocumentSwitcher.ts` (the return object at `:69-80`)
- Modify: `super-app/src/screens/traveller/Profile/useVerifyAccount.ts`
- Modify: `super-app/src/screens/traveller/Profile/IdentityProfileScreen.tsx`
- Modify: `super-app/src/screens/traveller/Profile/ProfileScreen.tsx`
- Create: `super-app/src/screens/traveller/Profile/__tests__/useVerifyAccount.router.test.ts`

**Interfaces:**
- Produces: `useVerifyAccount(options?: { onRecorded?: () => void }): (() => Promise<void>) | undefined`. It returns `undefined` without `TravellerService.SSRActions` + `.ProveDocument`.
- Produces: `useDocumentSwitcher()` now also returns `refetch: () => Promise<unknown>`.
- Consumes: `postProveDocumentApi(sessionId: string)` from `@/actions/TravellerService/post`.

- [ ] **Step 1: Write the failing test**

`src/screens/traveller/Profile/__tests__/useVerifyAccount.router.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import useUserStore from "@/store/user";
import type { UserProfile } from "@/store/user.types";
import { useVerifyAccount } from "../useVerifyAccount";

const mockRunVerification = jest.fn();
jest.mock("@/hooks/useDiditVerify", () => ({
  useDiditVerify: () => ({
    runVerification: (...args: unknown[]) => mockRunVerification(...args),
  }),
}));

const mockProve = jest.fn();
jest.mock("@/actions/TravellerService/post", () => ({
  postProveDocumentApi: (...args: unknown[]) => mockProve(...args),
}));

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

jest.mock("@/utils/logger", () => ({
  logger: { debug: jest.fn(), error: jest.fn() },
}));

function signIn(granted: boolean) {
  useUserStore.getState().setUser({
    userId: "u1",
    grantedPolicies: {
      "TravellerService.SSRActions": granted,
      "TravellerService.SSRActions.ProveDocument": granted,
    },
  } as unknown as UserProfile);
}

let alert: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  useUserStore.getState().clearUser();
  alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});
afterEach(() => alert.mockRestore());

it("records an approved verification, then refreshes and confirms", async () => {
  signIn(true);
  mockRunVerification.mockResolvedValue({ type: "approved", sessionId: "s1" });
  mockProve.mockResolvedValue({ travellerDocumentId: "d1" });
  const onRecorded = jest.fn();
  const { result } = renderHook(() => useVerifyAccount({ onRecorded }));

  await act(() => result.current!());

  expect(mockProve).toHaveBeenCalledTimes(1);
  expect(mockProve).toHaveBeenCalledWith("s1");
  expect(onRecorded).toHaveBeenCalledTimes(1);
  expect(alert.mock.calls[0][0]).toBe(
    "MobileApp.Profile.Verification.ApprovedTitle",
  );
});

it("reports a failure when the approval cannot be recorded", async () => {
  signIn(true);
  mockRunVerification.mockResolvedValue({ type: "approved", sessionId: "s1" });
  mockProve.mockRejectedValue(new Error("500"));
  const onRecorded = jest.fn();
  const { result } = renderHook(() => useVerifyAccount({ onRecorded }));

  await act(() => result.current!());

  expect(onRecorded).not.toHaveBeenCalled();
  expect(alert.mock.calls[0][0]).toBe(
    "MobileApp.Profile.Verification.FailedTitle",
  );
});

it("records nothing when the verification is not approved", async () => {
  signIn(true);
  mockRunVerification.mockResolvedValue({ type: "declined" });
  const { result } = renderHook(() => useVerifyAccount());

  await act(() => result.current!());

  expect(mockProve).not.toHaveBeenCalled();
  expect(alert.mock.calls[0][0]).toBe(
    "MobileApp.Profile.Verification.DeclinedTitle",
  );
});

it("offers nothing without the prove-document grant", () => {
  signIn(false);

  expect(renderHook(() => useVerifyAccount()).result.current).toBeUndefined();
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /c/unirefund/super-app
npx jest src/screens/traveller/Profile/__tests__/useVerifyAccount.router.test.ts
```
Expected: FAIL. `mockProve` is never called, and the no-grant case returns a function.

- [ ] **Step 3: Implement the hook**

In `useVerifyAccount.ts`, add these imports:

```ts
import { postProveDocumentApi } from "@/actions/TravellerService/post";
import useUserStore from "@/store/user";
import { isActionGranted } from "@/utils/policies";
```

Replace the whole `export function useVerifyAccount() { … }` with:

```ts
export function useVerifyAccount({
  onRecorded,
}: { onRecorded?: () => void } = {}) {
  const { t } = useLocalization();
  const { runVerification } = useDiditVerify();
  const user = useUserStore((state) => state.user);
  const canVerify = isActionGranted(user?.grantedPolicies, [
    "TravellerService.SSRActions",
    "TravellerService.SSRActions.ProveDocument",
  ]);

  const verify = useCallback(async () => {
    const show = (key: string) =>
      Alert.alert(
        t(`MobileApp.Profile.Verification.${key}Title`),
        t(`MobileApp.Profile.Verification.${key}Message`),
      );
    try {
      const outcome = await runVerification(VERIFY_ACCOUNT_ACTION);
      if (outcome.type === "approved") {
        await postProveDocumentApi(outcome.sessionId);
        onRecorded?.();
      } else if (outcome.type === "failed") {
        logger.error("Didit verification failed", outcome.error);
      }
      show(VERIFICATION_ALERT_KEY[outcome.type]);
    } catch (error) {
      logger.error("Verify account failed", error);
      show("Failed");
    }
  }, [onRecorded, runVerification, t]);

  return canVerify ? verify : undefined;
}
```

Delete the old doc comment above the function if it now describes behaviour that is gone (the "only logged" session id).

- [ ] **Step 4: Run it to verify it passes**

The same command as Step 2. Expected: all 4 PASS.

- [ ] **Step 5: Expose the switcher's refetch**

In `useDocumentSwitcher.ts`, add `refetch,` to the returned object, after `isSwitching,`.

- [ ] **Step 6: Wire the identity profile**

In `IdentityProfileScreen.tsx`:
- Change `const verifyAccount = useVerifyAccount();` to:

```tsx
  const verifyAccount = useVerifyAccount({
    onRecorded: identity.switcher.refetch,
  });
```

  The line `const identity = useProfileIdentity();` must stay **above** it; it already is.
- In `handleSetupStep`, change `if (key === "identity") return verifyAccount();` to:

```tsx
    if (key === "identity") return verifyAccount ? verifyAccount() : openDocuments();
```

- In `accountRows`, replace the Verify Account row object with a conditional spread:

```tsx
    ...(verifyAccount
      ? [
          {
            title: t("MobileApp.Profile.VerifyAccount"),
            icon: "checkmark-done-outline" as const,
            onPress: verifyAccount,
          },
        ]
      : []),
```

  If `SettingsRowProps["icon"]` is typed so that `as const` is unnecessary, drop it.

- [ ] **Step 7: Wire the classic profile**

In `ProfileScreen.tsx`, replace the first `menuItems` entry (the Verify Account one) with:

```tsx
    ...(verifyAccount
      ? [
          {
            title: t("MobileApp.Profile.VerifyAccount"),
            icon: "checkmark-done-outline",
            primary: true,
            fullWidth: true,
            onPress: verifyAccount,
          } satisfies ActionItemProps,
        ]
      : []),
```

- [ ] **Step 8: Verify**

```bash
npx jest src/screens/traveller
npm run typecheck 2>&1 | tail -3
npx eslint src/screens/traveller/Profile/useVerifyAccount.ts src/screens/traveller/Profile/IdentityProfileScreen.tsx src/screens/traveller/Profile/ProfileScreen.tsx src/screens/traveller/Documents/useDocumentSwitcher.ts src/screens/traveller/Profile/__tests__/useVerifyAccount.router.test.ts
```
Expected: every traveller suite passes, including `IdentityProfileScreen.router.test.tsx` (it mocks `useVerifyAccount` as returning a function). Typecheck shows only the baseline error.

- [ ] **Step 9: Commit**

```bash
git add src/screens/traveller/Profile/useVerifyAccount.ts src/screens/traveller/Profile/__tests__/useVerifyAccount.router.test.ts src/screens/traveller/Profile/IdentityProfileScreen.tsx src/screens/traveller/Profile/ProfileScreen.tsx src/screens/traveller/Documents/useDocumentSwitcher.ts
git branch --show-current
git commit -q -F - <<'EOF'
fix(profile): record an approved Verify Account on the server

Verify Account ran Didit ProveDocument and only logged the approved
session. It now posts prove-document like Add document does, refreshes
the documents behind the badge, and says Approved only once recorded.
The row is offered only with the prove-document grant pair.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 9 (M4): Home totals cover every tag

**Files:**
- Create: `super-app/src/screens/traveller/Home/useAllTravellerTags.ts`
- Modify: `super-app/src/screens/traveller/Home/useHomeStatus.ts`
- Modify: `super-app/src/screens/traveller/Home/HomeScreen.tsx` (the `useFocusEffect` at `:49-54`)
- Modify: `super-app/src/screens/traveller/Home/__tests__/useHomeStatus.router.test.ts`

**Interfaces:**
- Produces: `useAllTravellerTags(): { tags: TagListItem[] | undefined; refresh: () => Promise<unknown> }`. It does not fetch on mount; `refresh` runs it.
- Produces: `HomeStatus.refreshSummary: () => void`.

- [ ] **Step 1: Write the failing test**

In `useHomeStatus.router.test.ts`, below the existing `jest.mock("@/hooks/useAsyncFetch", …)`, add:

```ts
let mockAllTags: unknown[] | undefined;
const mockRefreshAll = jest.fn();
jest.mock("../useAllTravellerTags", () => ({
  useAllTravellerTags: () => ({ tags: mockAllTags, refresh: mockRefreshAll }),
}));
```

In `beforeEach`, add `mockAllTags = undefined;`.

Append these tests:

```ts
it("totals every tag once the unpaged list has landed", () => {
  const tag = (id: string, refund: number) => ({
    id,
    tagNumber: id,
    status: "Issued",
    currency: "TRY",
    refund,
    issueDate: new Date(NOW).toISOString(),
    travellerDocumentNumber: "P1",
  });
  useTagStore.getState().setLoading(false);
  useTagStore.getState().setTags({ items: [tag("a", 100)], totalCount: 2 });
  mockAllTags = [tag("a", 100), tag("b", 50)];

  const { result } = renderHook(() => useHomeStatus());

  expect(result.current.summary.expected[0]).toMatchObject({
    currency: "TRY",
    amount: 150,
  });
});

it("falls back to the loaded page until the unpaged list lands", () => {
  useTagStore.getState().setLoading(false);
  useTagStore.getState().setTags({
    items: [
      {
        id: "a",
        tagNumber: "a",
        status: "Issued",
        currency: "TRY",
        refund: 100,
        issueDate: new Date(NOW).toISOString(),
        travellerDocumentNumber: "P1",
      },
    ],
    totalCount: 1,
  });

  const { result } = renderHook(() => useHomeStatus());

  expect(result.current.summary.expected[0]).toMatchObject({ amount: 100 });
  result.current.refreshSummary();
  expect(mockRefreshAll).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /c/unirefund/super-app
npx jest src/screens/traveller/Home/__tests__/useHomeStatus.router.test.ts
```
Expected: FAIL. `jest.mock` cannot find `../useAllTravellerTags`.

- [ ] **Step 3: Implement the hook**

`src/screens/traveller/Home/useAllTravellerTags.ts`:

```ts
import { getTags } from "@/actions/TagService/actions";
import useAsyncFetch from "@/hooks/useAsyncFetch";
import { TAG_UNPAGED_MAX } from "@/hooks/useLoadTags";

const fetchAllTags = () =>
  getTags({ maxResultCount: TAG_UNPAGED_MAX, sorting: "issueDate desc" });

// The list screen holds one page; Home's totals need every tag. There is no
// traveller-scoped totals endpoint (tag/summary is staff-only).
export function useAllTravellerTags() {
  const { data, execute } = useAsyncFetch(fetchAllTags, { immediate: false });
  return { tags: data?.items, refresh: execute };
}
```

If `getTags`' parameter type does not accept `sorting`, check the generated `GetApiTagServiceTagCrossTenantsByTravellerIdClaimData` for the exact key and use it.

- [ ] **Step 4: Use it in useHomeStatus**

In `useHomeStatus.ts`:
- Add `import { useAllTravellerTags } from "./useAllTravellerTags";`.
- Add `refreshSummary: () => void;` to `HomeStatus`.
- In the doc comment on `payoutMethodCount`, change "Saved cards and banks" to "Saved cards" (Task 10 makes this true).
- After the `useProfileIdentity()` line, add:

```ts
  const { tags: allTags, refresh: refreshSummary } = useAllTravellerTags();
```

- Change the `summary` memo to:

```ts
  const summary = useMemo(
    () => buildRefundSummary(allTags ?? tags ?? [], fallbackCurrency),
    [allTags, tags, fallbackCurrency],
  );
```

- Add a stable wrapper. Home's focus effect depends on it, so it must not change identity between renders. Add `useCallback` to the `react` import:

```ts
  const refreshAll = useCallback(() => {
    void refreshSummary();
  }, [refreshSummary]);
```

- Add `refreshSummary: refreshAll,` to the returned object.
- `execute` from `useAsyncFetch` must itself be stable. Confirm it is a `useCallback` in `src/hooks/useAsyncFetch.ts`.
- The latest-tag card (`LatestTag`) keeps reading the store; it is out of scope here.

- [ ] **Step 5: Refresh it on focus**

In `HomeScreen.tsx`:
- After `const status = useHomeStatus();` add `const { refreshSummary } = status;`.
- Change the focus effect to:

```tsx
  useFocusEffect(
    useCallback(() => {
      if (isTagQueryActive(useTagStore.getState().query)) resetQuery();
      void loadTags(true);
      refreshSummary();
    }, [resetQuery, refreshSummary]),
  );
```

- [ ] **Step 6: Verify**

```bash
npx jest src/screens/traveller/Home
npm run typecheck 2>&1 | tail -3
npx eslint src/screens/traveller/Home/useAllTravellerTags.ts src/screens/traveller/Home/useHomeStatus.ts src/screens/traveller/Home/HomeScreen.tsx src/screens/traveller/Home/__tests__/useHomeStatus.router.test.ts
```
Expected: every Home suite passes. Suites that render `HomeScreen` (`StatusHome`, `HomeUploadEntry`, `HomeShortcutTiles`) may need one of two fixes:
- If a suite mocks `useHomeStatus`, add `refreshSummary: jest.fn()` to the object its mock returns.
- If it reaches the real `useAllTravellerTags`, add `jest.mock("../useAllTravellerTags", () => ({ useAllTravellerTags: () => ({ tags: undefined, refresh: jest.fn() }) }))`.

Stage any suite you had to touch in Step 7.

- [ ] **Step 7: Commit**

```bash
git add src/screens/traveller/Home/useAllTravellerTags.ts src/screens/traveller/Home/useHomeStatus.ts src/screens/traveller/Home/HomeScreen.tsx src/screens/traveller/Home/__tests__/useHomeStatus.router.test.ts
# plus any src/screens/traveller/Home/__tests__/*.router.test.tsx that Step 6 had to touch
git branch --show-current
git commit -q -F - <<'EOF'
fix(home): total every tag, not just the loaded page

Home's refund summary read the tag store, which holds one page of 20.
It now fetches the traveller's tags unpaged on focus and falls back to
the page until that lands.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 10 (M5): Payout counts match what is shown

**Files:**
- Modify: `super-app/src/screens/traveller/Profile/profileIdentity.logic.ts`
- Modify: `super-app/src/screens/traveller/Profile/useProfileIdentity.ts:78-88`
- Modify: `super-app/src/screens/traveller/Profile/__tests__/profileIdentity.test.ts`

**Interfaces:**
- Produces: `countPayoutMethods(items: { type?: string | null }[] | null | undefined): number`.

- [ ] **Step 1: Write the failing test**

Append to `profileIdentity.test.ts`, and add `countPayoutMethods` to its import from `"../profileIdentity.logic"`:

```ts
describe("countPayoutMethods", () => {
  it("counts cards", () => {
    expect(countPayoutMethods([{ type: "Card" }, { type: "Card" }])).toBe(2);
  });

  // Bank payout is switched off in the app, and the Cards screen hides bank
  // tokens, so the count must not credit them.
  it("does not count bank or wallet tokens", () => {
    expect(
      countPayoutMethods([{ type: "Bank" }, { type: "Wallet" }, { type: "Card" }]),
    ).toBe(1);
  });

  it("is zero before the list loads", () => {
    expect(countPayoutMethods(undefined)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /c/unirefund/super-app
npx jest src/screens/traveller/Profile/__tests__/profileIdentity.test.ts
```
Expected: FAIL, because `countPayoutMethods` is not exported.

- [ ] **Step 3: Implement it**

Append to `profileIdentity.logic.ts`:

```ts
export function countPayoutMethods(
  items: { type?: string | null }[] | null | undefined,
): number {
  return (items ?? []).filter((item) => item.type === "Card").length;
}
```

In `useProfileIdentity.ts`:
- Add `countPayoutMethods` to the import from `@/screens/traveller/Profile/profileIdentity.logic`.
- Replace the `payoutMethodCount` memo body with `() => countPayoutMethods(cardData?.items),`, dropping its old comment.

- [ ] **Step 4: Verify**

```bash
npx jest src/screens/traveller/Profile src/screens/traveller/Home
npm run typecheck 2>&1 | tail -3
npx eslint src/screens/traveller/Profile/profileIdentity.logic.ts src/screens/traveller/Profile/useProfileIdentity.ts src/screens/traveller/Profile/__tests__/profileIdentity.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/screens/traveller/Profile/profileIdentity.logic.ts src/screens/traveller/Profile/useProfileIdentity.ts src/screens/traveller/Profile/__tests__/profileIdentity.test.ts
git branch --show-current
git commit -q -F - <<'EOF'
fix(profile): count only the payout methods the app shows

Bank tokens are hidden while bank payout is off, but Home, Profile and
the setup strip still counted them as saved methods.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 11 (M6): A failed avatar upload does not leave the overlay stuck

**Files:**
- Modify: `super-app/src/screens/shared/Profile/_components/AvatarModal.tsx` (`handleSave`, `:56-70`)
- Modify: `super-app/src/localization/resources/en-US.json` and `tr-TR.json` (the `Profile` object, beside `"Profile Picture Updated"`)
- Create: `super-app/src/screens/shared/Profile/_components/__tests__/AvatarModal.router.test.tsx`

- [ ] **Step 1: Add the string (both locales)**

In `en-US.json`, inside the `"Profile": { … }` object, after `"Profile Picture Updated": "Profile picture updated",`, add:

```json
    "Profile Picture Update Failed": "Couldn't update your profile picture. Please try again.",
```

In `tr-TR.json`, at the same place:

```json
    "Profile Picture Update Failed": "Profil fotoğrafı güncellenemedi. Lütfen tekrar deneyin.",
```

Then:

```bash
cd /c/unirefund/super-app
npm run init
```

- [ ] **Step 2: Write the failing test**

`src/screens/shared/Profile/_components/__tests__/AvatarModal.router.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import React from "react";
import useUserStore from "@/store/user";
import type { UserProfile } from "@/store/user.types";
import { AvatarModal } from "../AvatarModal";

const mockShow = jest.fn();
const mockUpload = jest.fn();

jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));
jest.mock("@/providers/SessionProvider", () => ({
  useSession: () => ({ session: "token" }),
}));
jest.mock("@/providers/ToastProvider", () => ({
  useToastRef: () => ({ current: { show: (...a: unknown[]) => mockShow(...a) } }),
}));
jest.mock("@/actions/AccountService/post", () => ({
  uploadProfilePictureApi: (...a: unknown[]) => mockUpload(...a),
}));
jest.mock("@/actions/AccountService/actions", () => ({
  getProfilePictureByIdApi: jest.fn(),
}));
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest
    .fn()
    .mockResolvedValue({ canceled: false, assets: [{ uri: "file://new.jpg" }] }),
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("@/components/BottomSheet", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const react = require("react");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    BottomSheet: react.forwardRef(
      (props: { children: React.ReactNode }, _ref: unknown) => props.children,
    ),
  };
});
jest.mock("@gorhom/bottom-sheet", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const rn = require("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { BottomSheetView: rn.View };
});
jest.mock("@/components/Image", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/Ionicons", () => ({ Ionicons: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  useUserStore.getState().setUser({
    userId: "u1",
    profilePicture: "file://old.jpg",
  } as unknown as UserProfile);
});

it("closes the overlay and says so when the upload fails", async () => {
  mockUpload.mockRejectedValue(new Error("413"));
  render(<AvatarModal sheetRef={{ current: null }} />);

  await act(async () => {
    fireEvent.press(screen.getByText("MobileApp.Profile.Continue"));
  });
  await act(async () => {
    fireEvent.press(screen.getByText("MobileApp.Profile.Save"));
  });

  expect(router.push).toHaveBeenCalledWith("/loading");
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(mockShow).toHaveBeenCalledWith(
    "error",
    "MobileApp.Profile.Profile Picture Update Failed",
  );
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npx jest src/screens/shared/Profile/_components/__tests__/AvatarModal.router.test.tsx
```
Expected: FAIL on `router.back` being called 0 times, possibly with an unhandled rejection. If it fails to *load*, mock the module the error names (for example `@/components/rnr`'s `Badge`), then re-run until the failure is the assertion.

- [ ] **Step 4: Implement the catch**

In `AvatarModal.tsx`:
- Add `import { logger } from "@/utils/logger";`.
- Replace `handleSave` with:

```tsx
  function handleSave() {
    sheetRef.current?.dismiss();
    router.push("/loading");
    uploadImage()
      .then((newProfilePicture) => {
        if (newProfilePicture) {
          updateUser({ profilePicture: newProfilePicture });
          setSelectedImage(newProfilePicture);
          toastRef.current?.show(
            "success",
            t("MobileApp.Profile.Profile Picture Updated"),
          );
        }
        router.back();
      })
      .catch((error: unknown) => {
        logger.error("Profile picture upload failed", error);
        router.back();
        toastRef.current?.show(
          "error",
          t("MobileApp.Profile.Profile Picture Update Failed"),
        );
      });
  }
```

- [ ] **Step 5: Verify**

```bash
npx jest src/screens/shared/Profile
npm run typecheck 2>&1 | tail -3
npx eslint src/screens/shared/Profile/_components/AvatarModal.tsx src/screens/shared/Profile/_components/__tests__/AvatarModal.router.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add src/screens/shared/Profile/_components/AvatarModal.tsx src/screens/shared/Profile/_components/__tests__/AvatarModal.router.test.tsx src/localization/resources/en-US.json src/localization/resources/tr-TR.json
git branch --show-current
git commit -q -F - <<'EOF'
fix(profile): recover from a failed profile picture upload

The upload had no catch, so a rejection left the loading overlay on
screen and blocked the back button. It now closes the overlay and says
the update failed.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

If the other session also has uncommitted edits in `en-US.json` or `tr-TR.json` (check `git diff` first), stage only your hunk. Write `git diff <file> | awk …` to a patch, `git apply --cached` it, then confirm with `git diff --cached <file>`.

---

## Task 12 (M7): Explore says when a layer fails

**Files:**
- Modify: `super-app/src/screens/shared/Explore/ExploreScreen.tsx` (after the three `useViewportLayer` calls at `:74-91`; render after `<PlaceSearch … />`)
- Modify: `super-app/src/screens/shared/Explore/__tests__/explore.router.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `explore.router.test.tsx`. `getPublicMerchantsViewportApi` is already imported there for the cluster test; if it is not, import it from `@/actions/CRMService/actions`.

```tsx
it("says so when a layer fails to load", async () => {
  (getPublicMerchantsViewportApi as jest.Mock).mockRejectedValueOnce(
    new Error("503"),
  );

  render(<ExploreScreen />);

  await waitFor(() => {
    expect(screen.getByText("MobileApp.Explore.Error")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /c/unirefund/super-app
npx jest src/screens/shared/Explore/__tests__/explore.router.test.tsx -t "fails to load"
```
Expected: FAIL. `MobileApp.Explore.Error` is not found.

- [ ] **Step 3: Implement the banner**

In `ExploreScreen.tsx`:
- Import `Text` from `@/components/rnr` if it is not already imported.
- After the three `useViewportLayer` calls, add:

```tsx
  const layerFailed =
    (active.merchants && merchants.status === "error") ||
    (active.customs && customs.status === "error") ||
    (active.refundPoints && refundPoints.status === "error");
```

- Immediately after `<PlaceSearch onSelectResult={handleSelectSearchResult} />`, add:

```tsx
        {layerFailed && (
          <View
            pointerEvents="none"
            className="absolute inset-x-0 top-20 px-4"
          >
            <View className="rounded-md border border-warning/40 bg-warning-surface px-4 py-3">
              <Text className="text-sm text-warning">
                {t("MobileApp.Explore.Error")}
              </Text>
            </View>
          </View>
        )}
```

- Delete the now-stale "No banner/toast exists for this yet" comment in `_components/useViewportLayer.ts:65-68`, keeping the `logger.error` line.

- [ ] **Step 4: Verify**

```bash
npx jest src/screens/shared/Explore
npm run typecheck 2>&1 | tail -3
npx eslint src/screens/shared/Explore/ExploreScreen.tsx src/screens/shared/Explore/_components/useViewportLayer.ts src/screens/shared/Explore/__tests__/explore.router.test.tsx
```
Expected: every Explore suite passes. The existing tests keep passing because their mocks resolve.

- [ ] **Step 5: Commit**

```bash
git add src/screens/shared/Explore/ExploreScreen.tsx src/screens/shared/Explore/_components/useViewportLayer.ts src/screens/shared/Explore/__tests__/explore.router.test.tsx
git branch --show-current
git commit -q -F - <<'EOF'
fix(explore): say when a map layer fails to load

A failed viewport fetch set the layer's status to error and nothing
rendered it, so the map just stayed empty. A non-blocking banner now
shows while any enabled layer is in error; pins already drawn stay.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 13 (M8): Delete account is gated by its grant

**Files:**
- Create: `super-app/src/hooks/useCanDeleteAccount.ts`
- Create: `super-app/src/hooks/__tests__/useCanDeleteAccount.router.test.ts`
- Modify: `super-app/src/screens/traveller/Profile/IdentityProfileScreen.tsx` (`:49-55`, `:183`)
- Modify: `super-app/src/screens/traveller/Profile/ProfileScreen.tsx` (`:19-25`, `:86`)
- Modify: `super-app/src/screens/traveller/Profile/__tests__/IdentityProfileScreen.router.test.tsx`

**Interfaces:**
- Produces: `useCanDeleteAccount(): boolean`, true only with `IdentityService.Gdprs` + `IdentityService.Gdprs.DeleteUserData`.

- [ ] **Step 1: Write the failing hook test**

`src/hooks/__tests__/useCanDeleteAccount.router.test.ts`:

```ts
import { renderHook } from "@testing-library/react-native";
import { useCanDeleteAccount } from "@/hooks/useCanDeleteAccount";
import useUserStore from "@/store/user";
import type { UserProfile } from "@/store/user.types";

function signIn(grantedPolicies: Record<string, boolean>) {
  useUserStore.getState().setUser({
    userId: "u1",
    grantedPolicies,
  } as unknown as UserProfile);
}

beforeEach(() => useUserStore.getState().clearUser());

it("allows deletion with the group and the leaf", () => {
  signIn({
    "IdentityService.Gdprs": true,
    "IdentityService.Gdprs.DeleteUserData": true,
  });
  expect(renderHook(() => useCanDeleteAccount()).result.current).toBe(true);
});

it("holds it back with the leaf alone", () => {
  signIn({ "IdentityService.Gdprs.DeleteUserData": true });
  expect(renderHook(() => useCanDeleteAccount()).result.current).toBe(false);
});

it("holds it back before the profile has loaded", () => {
  expect(renderHook(() => useCanDeleteAccount()).result.current).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /c/unirefund/super-app
npx jest src/hooks/__tests__/useCanDeleteAccount.router.test.ts
```
Expected: FAIL, "Cannot find module '@/hooks/useCanDeleteAccount'".

- [ ] **Step 3: Implement it**

`src/hooks/useCanDeleteAccount.ts`:

```ts
import useUserStore from "@/store/user";
import { isActionGranted } from "@/utils/policies";

// DELETE /api/identity/gdprs requires both policies.
export function useCanDeleteAccount(): boolean {
  const user = useUserStore((state) => state.user);
  return isActionGranted(user?.grantedPolicies, [
    "IdentityService.Gdprs",
    "IdentityService.Gdprs.DeleteUserData",
  ]);
}
```

- [ ] **Step 4: Run it to verify it passes**

The same command as Step 2. Expected: all 3 PASS.

- [ ] **Step 5: Write the failing screen test**

In `IdentityProfileScreen.router.test.tsx`, replace:

```ts
jest.mock("@/screens/shared/Profile/useLegalMenuItems", () => ({
  useLegalMenuItems: () => [],
}));
```
with:
```ts
const mockUseLegalMenuItems = jest.fn((_onAccountDeletion?: () => void) => []);
jest.mock("@/screens/shared/Profile/useLegalMenuItems", () => ({
  useLegalMenuItems: (onAccountDeletion?: () => void) =>
    mockUseLegalMenuItems(onAccountDeletion),
}));

let mockCanDelete = false;
jest.mock("@/hooks/useCanDeleteAccount", () => ({
  useCanDeleteAccount: () => mockCanDelete,
}));
```

Add inside the `describe`:

```ts
  it("offers account deletion only with its grant", () => {
    mockedUseProfileIdentity.mockReturnValue(identity(false));

    mockCanDelete = false;
    render(<IdentityProfileScreen />);
    expect(mockUseLegalMenuItems).toHaveBeenLastCalledWith(undefined);

    mockCanDelete = true;
    render(<IdentityProfileScreen />);
    expect(mockUseLegalMenuItems).toHaveBeenLastCalledWith(
      expect.any(Function),
    );
  });
```

- [ ] **Step 6: Run it to verify it fails**

```bash
npx jest src/screens/traveller/Profile/__tests__/IdentityProfileScreen.router.test.tsx
```
Expected: the new test FAILS, because the handler is passed even when `mockCanDelete` is false.

- [ ] **Step 7: Wire both profile screens**

In **both** `IdentityProfileScreen.tsx` and `ProfileScreen.tsx`:
- Add `import { useCanDeleteAccount } from "@/hooks/useCanDeleteAccount";`.
- Replace `const legalMenuItems = useLegalMenuItems(openDeleteAccount);` with:

```tsx
  const canDeleteAccount = useCanDeleteAccount();
  const legalMenuItems = useLegalMenuItems(
    canDeleteAccount ? openDeleteAccount : undefined,
  );
```

- Change `<DeleteAccountModal sheetRef={deleteAccountRef} />` to:

```tsx
        {canDeleteAccount && <DeleteAccountModal sheetRef={deleteAccountRef} />}
```

- [ ] **Step 8: Verify**

```bash
npx jest src/hooks src/screens/traveller src/screens/shared/Profile
npm run typecheck 2>&1 | tail -3
npx eslint src/hooks/useCanDeleteAccount.ts src/hooks/__tests__/useCanDeleteAccount.router.test.ts src/screens/traveller/Profile/IdentityProfileScreen.tsx src/screens/traveller/Profile/ProfileScreen.tsx src/screens/traveller/Profile/__tests__/IdentityProfileScreen.router.test.tsx
```

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useCanDeleteAccount.ts src/hooks/__tests__/useCanDeleteAccount.router.test.ts src/screens/traveller/Profile/IdentityProfileScreen.tsx src/screens/traveller/Profile/ProfileScreen.tsx src/screens/traveller/Profile/__tests__/IdentityProfileScreen.router.test.tsx
git branch --show-current
git commit -q -F - <<'EOF'
fix(profile): offer account deletion only with its grant

DELETE /api/identity/gdprs requires IdentityService.Gdprs and its
DeleteUserData leaf. The traveller role holds both on dev since
2026-09-30; without them the row and its sheet are not rendered.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 14: Final gates and the manual pass

**Files:** none changed, unless a gate finds something.

- [ ] **Step 1: ssr gates**

```bash
cd /c/unirefund/web-app-wt-traveller-parity
git log --oneline origin/main..HEAD        # expect exactly Tasks 1-5 (5 commits)
git status --short                         # expect empty
pnpm --filter ssr test:unit 2>&1 | tail -6
pnpm --filter ssr type-check 2>&1 | tail -3
pnpm --filter ssr lint 2>&1 | tail -3
git -C packages/utils log --oneline -1     # the fix/ssr-token-refresh commit
```

- [ ] **Step 2: super-app gates**

```bash
cd /c/unirefund/super-app
git log --oneline 0f582db..HEAD            # expect Tasks 6-13 (8 commits); list any foreign ones separately
npm run typecheck 2>&1 | tail -3           # only the baseline error
npx jest 2>&1 | tail -6                    # compare with the Task 0 counts
```

- [ ] **Step 3: Manual browser pass (ssr, `http://localhost:3010`)**

Sign in as `tur-a25y29041` / `1q2w3E*`, then check:
- **S4:** `/en/tags` → open a tag. There is no Download PDF button.
- **S5:** the risk column shows on `/en/tags` (the traveller holds `ViewRiskLevel`), and "Claim tag" is still offered.
- **S3:** a password login does not exercise it. It needs a Didit KYC login, so mark S3 **unverified at runtime** unless the user can do a KYC login. Do not claim otherwise.

- [ ] **Step 4: Manual device pass (super-app, CPadNFC `LD38266200649`, Metro 8095)**

Fast Refresh has already delivered the changes. Sign in as the traveller, then check, taking every screenshot after a settle (`adb -s LD38266200649 shell "input tap X Y; sleep 2"`):
- **M1:** Profile → Personal Info → change the email → Save → reopen: the new email shows. Set it back afterwards.
- **M2:** Tags → filter sheet shows only Issue date.
- **M4 / M5:** Home totals and the "N saved" count look right for the account.
- **M8:** Profile → Account Deletion row is present. Open the sheet and **do not press delete**.
- **M3, M6, M7:** these need a Didit run, a failing upload and a failing network respectively. Rely on their tests and say so.

- [ ] **Step 5: Report**

Report, per repo:
- the commits;
- the gate numbers against the Task 0 baselines;
- which manual checks ran and which are unverified;
- that nothing is pushed;
- the delivery order: `web-utils` PR (the submodule commit) first, then `unirefund-web` with the pointer bump, and `unirefund-mobile` independently.
