# Didit Backend-Created Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** web-app and super-app start every Didit verification from a session the UniRefund backend creates, and no frontend holds a Didit API key or workflow ID.

**Architecture:** web-app gets a token-less server action for `POST /api/kyc-service/public-didit-sessions`. `DiditVerification` takes an SSR `action`, turns it into an evidence level and starts the web SDK with the returned `verificationUrl`. The Next.js `/api/session` proxy, the inlined key and the `didit-workflows` fetches go. super-app gets the same call through an anonymous client and starts the RN SDK with `startVerification(sessionToken, config)` instead of `startVerificationWithWorkflow`.

**Tech Stack:** Next.js 16 + pnpm/Turborepo (web-app); React Native 0.81 + Expo 54 + jest (super-app); `@didit-protocol/sdk-web` 0.1.9; `@didit-protocol/sdk-react-native` 4.7.3; hey-api generated clients.

**Spec:** `docs/superpowers/specs/2026-10-07-didit-backend-sessions-design.md`

## Global Constraints

- No fallback and no backward compatibility: the old path is deleted, never kept beside the new one.
- Merge waits until `POST /api/kyc-service/public-didit-sessions` is on uat. On 2026-10-07 it is on dev only.
- The session call sends **no bearer token and no `__tenant` header**.
- Evidence level: `minimumEvidenceLevel` as is; `"None"` → `"Low"`. A missing level, or a failed requirements load, is *unavailable*. Never guess a level or a workflow.
- Error codes `UniRefund.KYCService:010022` and `UniRefund.KYCService:010025` → "Identity verification isn't available right now. Please try again later." Anything else → the existing generic error.
- `vendorData` is not sent.
- web-app: app code reaches the backend only through `@repo/actions`; never hardcode UI strings (en + tr keys); lint is React-Compiler strict (no synchronous `setState` in an effect).
- super-app: render tests must be named `*.router.test.ts(x)`. Never edit `src/saas/**` by hand. Do not run native builds; hand them to the user.
- Work in `C:/unirefund/web-app-wt-didit` and `C:/unirefund/super-app-wt-didit`, on branch `feat/didit-backend-sessions` from `origin/main`. Never touch the main checkouts: they hold another session's `feat/map-improvement`.
- Each web verification creates a real Didit session. Load a Didit screen only where a step says to.
- Commit messages: a quoted heredoc via `git commit -F -`, with no backticks or backslashes inside, ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A parent re-render, or React StrictMode's double effect in dev, must not create a second Didit session.** The `hasStarted` ref guard in `DiditVerification` owns this. Task 3 Step 4 pins it: exactly one session request per page load.
2. **A failed `evidence-level-requirements` load in the ssr layout must make every Didit screen report "unavailable" once.** No endless spinner and no session request. There is no web test runner, so Task 1 Step 9 pins it by reading the render path: `!evidenceLevel` → `onError(unavailableText)` once → `return null`.
3. **A 200 from the backend with no `sessionToken` must never start the RN SDK with an empty token.** It throws instead. Pinned by a test in Task 6.
4. **A network failure (not an `ApiError`) while creating the session must stay a thrown error, not become "unavailable".** Callers report throws with their own message. Pinned by a test in Task 6.
5. **An empty or failed requirements load in super-app must not be cached.** Otherwise Didit stays unavailable until the app restarts. Pinned by tests in Task 5.

---

## File map

**web-app** (`C:/unirefund/web-app-wt-didit`)

| File | Change |
| --- | --- |
| `packages/actions/unirefund/lib.ts` | + `getPublicKYCServiceClient()` |
| `packages/actions/unirefund/KYCService/post-actions.ts` | + `postPublicDiditSessionApi()` |
| `packages/actions/unirefund/TravellerService/actions.ts` | − `getDiditWorkflowsApi()` |
| `packages/ui/src/unirefund/didit-verification/didit-config-provider.tsx` | requirements only; `getLevelForAction` |
| `packages/ui/src/unirefund/didit-verification/didit-verification.tsx` | `action` prop; server action; `onError` once |
| `packages/ui/src/unirefund/didit-verification/handlers.ts` | deleted (Task 2) |
| `packages/ui/src/unirefund/didit-verification/index.tsx` | drop the `handlers` export (Task 2) |
| `apps/ssr/src/components/didit-verification/didit-verification.tsx` | the ssr entry point, injecting copy |
| `apps/ssr/src/providers/didit-config-loader.tsx` | deleted |
| `apps/ssr/src/app/[lang]/layout.tsx` | requirements only |
| 5 ssr screens (spec table) | `action` instead of `apiKey` + `workflowId` |
| `apps/ssr/src/language-data/unirefund/SSRService/resources/{en,tr}.json` | + `Verification.Unavailable` |
| `apps/ssr/src/app/api/session/route.ts`, `apps/web/src/app/api/session/route.ts` | deleted (Task 2) |
| `apps/web/src/providers/providers-data.ts`, `providers.tsx`, `src/app/[lang]/(main)/layout.tsx` | no Didit |
| `Dockerfile`, `.github/workflows/deploy.yml`, `docs/deployment.md`, `AGENTS.md` | no `NEXT_PUBLIC_DIDIT_API_KEY` (Task 2) |

**super-app** (`C:/unirefund/super-app-wt-didit`)

| File | Change |
| --- | --- |
| `src/saas/KYCService/*` | taken from commit `0d41e6f` (the regenerated client) |
| `src/utils/apiError.ts` | + `getApiErrorCode()` |
| `src/actions/lib.ts` | + `getPublicKYCServiceClient` |
| `src/actions/KYCService/post.ts` | + `postPublicDiditSessionApi()` |
| `src/utils/didit/level.ts` | new: `resolveEvidenceLevel()` |
| `src/utils/didit/workflow.ts` | deleted |
| `src/actions/TravellerService/actions.ts` | − `getDiditWorkflows()` |
| `src/hooks/useDiditVerify.tsx` | backend session → `startVerification` |
| `src/screens/traveller/Profile/useVerifyAccount.ts` | own copy for `unavailable` |
| `src/localization/resources/{en-US,tr-TR}.json` | + `Profile.Verification.Unavailable{Title,Message}` |

---

### Task 1: web-app — start every Didit verification from a backend session

**Files:**
- Modify: `packages/actions/unirefund/lib.ts` (after `getKYCServiceClient`, ~line 222)
- Modify: `packages/actions/unirefund/KYCService/post-actions.ts`
- Modify: `packages/actions/unirefund/TravellerService/actions.ts:226-235`
- Rewrite: `packages/ui/src/unirefund/didit-verification/didit-config-provider.tsx`
- Rewrite: `packages/ui/src/unirefund/didit-verification/didit-verification.tsx`
- Rewrite: `apps/ssr/src/components/didit-verification/didit-verification.tsx`
- Delete: `apps/ssr/src/providers/didit-config-loader.tsx`
- Modify: `apps/ssr/src/app/[lang]/layout.tsx`
- Modify: `apps/ssr/src/app/[lang]/(auth)/login/kyc/didit.tsx`, `(auth)/register/didit.tsx`, `(auth)/reset-password/didit.tsx`, `(public)/validate/_components/didit-for-validate.tsx`, `(main)/profile/verify/_components/verify-view.tsx`
- Modify: `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json`, `tr.json`
- Rewrite: `apps/web/src/providers/providers-data.ts`, `apps/web/src/providers/providers.tsx`
- Modify: `apps/web/src/app/[lang]/(main)/layout.tsx` (the `getProvidersData(lang)` call)

**Interfaces:**
- Produces: `postPublicDiditSessionApi(data: { evidenceLevel: "None" | "Low" | "Medium" | "High"; vendorData?: string | null }): Promise<ServerResponse<DiditSessionCreatedDto>>` from `@repo/actions/unirefund/KYCService/post-actions`.
- Produces: `useDiditConfig(): { evidenceLevelRequirements; getLevelForAction(action: SSRActionType): "Low" | "Medium" | "High" | undefined }`.
- Produces: `DiditVerification` props `{ action: SSRActionType; onComplete; onError?; onStateChange?; onDecline?; debug?; className?; loadingText?; declineText?; unavailableText: string; errorText: string }`. The ssr wrapper supplies the copy, so its callers pass `action` and the callbacks only.

There is no component test runner in web-app (`apps/ssr` has none, and `packages/ui` has none). This task's gates are type-check, lint, `policy:audit` and `i18n:missing`; Task 3 is the live proof.

- [ ] **Step 1: Create the worktree**

```bash
git -C C:/unirefund/web-app fetch origin
git -C C:/unirefund/web-app worktree add C:/unirefund/web-app-wt-didit -b feat/didit-backend-sessions origin/main
cd C:/unirefund/web-app-wt-didit
git submodule update --init --recursive
cp C:/unirefund/web-app/apps/ssr/.env apps/ssr/.env
cp C:/unirefund/web-app/apps/web/.env apps/web/.env
sed -i '/^NEXT_PUBLIC_DIDIT_API_KEY=/d' apps/ssr/.env apps/web/.env
pnpm install --frozen-lockfile
(cd apps/ssr && pnpm run init) && (cd apps/web && pnpm run init)
```

Expected: the install succeeds (it needs the GitHub Packages token in `~/.npmrc`), and both `init` runs write `src/language-data/i18n/*.gen.json`. `grep -c public-didit-sessions packages/saas/KYCService/sdk.gen.ts` prints `2`.

- [ ] **Step 2: Record the baselines**

Run each command from the worktree root and note its error and warning counts. These numbers are the gate for Steps 9 and later; AGENTS.md's numbers date from 2026-09-09 and are not current.

```bash
pnpm --filter ssr type-check
pnpm --filter ssr lint
pnpm --filter web type-check
pnpm --filter web lint
pnpm --filter @repo/ui type-check
pnpm --filter @repo/ui lint
pnpm --filter web test:unit
pnpm policy:audit
pnpm i18n:missing --app=ssr
```

- [ ] **Step 3: Add the anonymous KYC client and the server action**

In `packages/actions/unirefund/lib.ts`, directly after `getKYCServiceClient`:

```ts
/**
 * Anonymous KYC client for the public Didit-session endpoints. It carries no
 * bearer token, for the same reason as getPublicCRMServiceClient.
 */
export async function getPublicKYCServiceClient() {
  const client = new KYCServiceClient({
    BASE: process.env.GATEWAY_URL,
    HEADERS,
  });
  return withPerformanceLogging(client, "KYCService");
}
```

Replace `packages/actions/unirefund/KYCService/post-actions.ts` with:

```ts
"use server";
import type {
  PostApiKycServiceIdVerificationsVerifyByPhotoData,
  UniRefund_KYCService_DiditSessions_CreateDiditSessionInput,
} from "@repo/saas/KYCService";
import { structuredError, structuredResponse } from "@repo/utils/api";
import type { Session } from "next-auth";
import { getKYCServiceClient, getPublicKYCServiceClient } from "../lib";
export async function postApiKycServiceIdVerificationsVerifyByPhoto(
  data: PostApiKycServiceIdVerificationsVerifyByPhotoData["requestBody"],
  session?: Session | null
) {
  try {
    const client = await getKYCServiceClient(session);
    const response =
      await client.idVerification.postApiKycServiceIdVerificationsVerifyByPhoto(
        { requestBody: data }
      );
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}

/**
 * Starts a Didit session on the backend's Didit accounts. Sent with no token
 * and no __tenant, so it comes from the shared accounts: the context the SSR
 * actions that later read the session run in.
 */
export async function postPublicDiditSessionApi(
  data: UniRefund_KYCService_DiditSessions_CreateDiditSessionInput
) {
  try {
    const client = await getPublicKYCServiceClient();
    const response =
      await client.diditSessionPublic.postApiKycServicePublicDiditSessions({
        requestBody: data,
      });
    return structuredResponse(response);
  } catch (error) {
    return structuredError(error);
  }
}
```

- [ ] **Step 4: Reduce the config provider to evidence levels**

Replace `packages/ui/src/unirefund/didit-verification/didit-config-provider.tsx` with:

```tsx
"use client";

import { createContext, useContext, useMemo } from "react";

export type EvidenceLevel = "None" | "Low" | "Medium" | "High";
/** A level the backend can start a Didit session at; Didit has no "None". */
export type DiditSessionLevel = Exclude<EvidenceLevel, "None">;
export type SSRActionType =
  | "CreateTraveller"
  | "SetPassword"
  | "GetAccessToken"
  | "ScanDocument"
  | "ProveDocument";

export type EvidenceLevelRequirement = {
  actionType: SSRActionType;
  minimumEvidenceLevel: EvidenceLevel;
};

type DiditConfigContextValue = {
  evidenceLevelRequirements: EvidenceLevelRequirement[];
  /** Undefined when the requirements do not name the action. */
  getLevelForAction: (
    actionType: SSRActionType
  ) => DiditSessionLevel | undefined;
};

const DiditConfigContext = createContext<DiditConfigContextValue>({
  evidenceLevelRequirements: [],
  getLevelForAction: () => undefined,
});

export const useDiditConfig = () => useContext(DiditConfigContext);

export function DiditConfigProvider({
  evidenceLevelRequirements,
  children,
}: {
  evidenceLevelRequirements: EvidenceLevelRequirement[];
  children: React.ReactNode;
}) {
  const value = useMemo<DiditConfigContextValue>(() => {
    const requirementMap = new Map(
      evidenceLevelRequirements.map((r) => [
        r.actionType,
        r.minimumEvidenceLevel,
      ])
    );

    return {
      evidenceLevelRequirements,
      getLevelForAction: (actionType) => {
        const level = requirementMap.get(actionType);
        if (!level) return undefined;
        return level === "None" ? "Low" : level;
      },
    };
  }, [evidenceLevelRequirements]);

  return (
    <DiditConfigContext.Provider value={value}>
      {children}
    </DiditConfigContext.Provider>
  );
}
```

- [ ] **Step 5: Rewrite `DiditVerification` around the server action**

Replace `packages/ui/src/unirefund/didit-verification/didit-verification.tsx` with:

```tsx
"use client";

import type {
  DiditSdkState,
  VerificationResult,
} from "@didit-protocol/sdk-web";
import { DiditSdk } from "@didit-protocol/sdk-web";
import { postPublicDiditSessionApi } from "@repo/actions/unirefund/KYCService/post-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { type SSRActionType, useDiditConfig } from "./didit-config-provider";
export * from "@didit-protocol/sdk-web";

// The backend's "no Didit account can serve" and "Didit unreachable" codes.
const UNAVAILABLE_CODES = new Set([
  "UniRefund.KYCService:010022",
  "UniRefund.KYCService:010025",
]);

export interface DiditVerificationProps {
  /** The SSR action being verified for; it decides the evidence level. */
  action: SSRActionType;
  onComplete: (result: VerificationResult) => void;
  /** Called once when no session could be started, with the message to show. */
  onError?: (error: VerificationResult) => void;
  onStateChange?: (state: DiditSdkState) => void;
  onDecline?: () => void;
  debug?: boolean;
  className?: string;
  loadingText?: string;
  declineText?: string;
  /** Shown when no Didit account can serve right now. */
  unavailableText: string;
  /** Shown when the session could not be started for any other reason. */
  errorText: string;
}

function debugLog(debug: boolean | undefined, ...args: unknown[]): void {
  if (debug) {
    console.log(...args);
  }
}

function LoadingDisplay({
  loadingText = "Loading verification...",
}: {
  loadingText?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Loading verification"
      className="flex flex-col items-center justify-center gap-3 text-muted-foreground"
    >
      <Loader2
        className="h-8 w-8 animate-spin text-primary"
        aria-hidden="true"
      />
      <span className="text-sm">{loadingText}</span>
    </div>
  );
}

export function DiditVerification({
  action,
  onComplete,
  onError,
  onStateChange,
  onDecline,
  debug = false,
  className,
  loadingText,
  declineText = "Back",
  unavailableText,
  errorText,
}: DiditVerificationProps) {
  const containerId = useId().replace(/:/g, "-");
  const { getLevelForAction } = useDiditConfig();
  const evidenceLevel = getLevelForAction(action);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  // Every session this creates is real, so it starts once per mount however
  // often the parent re-renders.
  const hasStarted = useRef(false);

  const start = useCallback(async () => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const fail = (message: string) =>
      onError?.({ type: "failed", error: { type: "unknown", message } });

    if (!evidenceLevel) {
      fail(unavailableText);
      return;
    }

    const response = await postPublicDiditSessionApi({ evidenceLevel });
    const url =
      response.type === "success" ? response.data.verificationUrl : null;
    if (!url) {
      const code = response.type === "success" ? undefined : response.code;
      debugLog(debug, "[DiditVerification] Session error:", code);
      setStatus("error");
      fail(code && UNAVAILABLE_CODES.has(code) ? unavailableText : errorText);
      return;
    }

    setStatus("ready");
    DiditSdk.shared.startVerification({
      url,
      configuration: {
        loggingEnabled: debug,
        embedded: true,
        embeddedContainerId: `didit-container-${containerId}`,
      },
    });
  }, [evidenceLevel, onError, unavailableText, errorText, debug, containerId]);

  useEffect(() => {
    DiditSdk.shared.onStateChange = (sdkState: DiditSdkState) => {
      debugLog(debug, "[DiditVerification] SDK state:", sdkState);
      onStateChange?.(sdkState);
    };

    DiditSdk.shared.onComplete = (result: VerificationResult) => {
      debugLog(debug, "[DiditVerification] Verification complete:", result);
      onComplete(result);
    };
  }, [debug, onComplete, onStateChange]);

  useEffect(() => {
    void start();
  }, [start]);

  if (!evidenceLevel || status === "error") {
    return null;
  }

  const isLoading = status === "loading";

  return (
    <div className={cn("grid w-full justify-items-center gap-3", className)}>
      <div className="grid relative h-[520px] w-full max-w-[400px]">
        {isLoading && (
          <div className="absolute inset-0 z-10 grid place-items-center rounded-lg bg-background">
            <LoadingDisplay loadingText={loadingText} />
          </div>
        )}
        <div
          id={`didit-container-${containerId}`}
          className="min-h-[500px] [&_iframe]:w-full"
        />
      </div>
      {onDecline && !isLoading && (
        <Button
          variant="outline"
          size="sm"
          onClick={onDecline}
          data-testid="decline-button"
        >
          {declineText}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Make the ssr wrapper the one entry point, with its copy**

Replace `apps/ssr/src/components/didit-verification/didit-verification.tsx` with:

```tsx
"use client";

import { useTranslations } from "@/src/providers/i18n";
import {
  DiditVerification as DiditVerificationBase,
  type DiditVerificationProps,
} from "@repo/ui/unirefund/didit-verification";

/** The Didit widget with ssr's own copy. Every ssr screen starts Didit here. */
export function DiditVerification({
  declineText,
  ...props
}: Omit<
  DiditVerificationProps,
  "loadingText" | "unavailableText" | "errorText"
>) {
  const { t } = useTranslations();
  return (
    <DiditVerificationBase
      {...props}
      declineText={declineText ?? t.SSRService["Login.BackToLogin"]}
      errorText={t.SSRService["Verification.ErrorDescription"]}
      loadingText={t.SSRService["Loading"]}
      unavailableText={t.SSRService["Verification.Unavailable"]}
    />
  );
}
```

In `apps/ssr/src/language-data/unirefund/SSRService/resources/en.json`, after the `"Verification.ErrorDescription"` line, add:

```json
  "Verification.Unavailable": "Identity verification isn't available right now. Please try again later.",
```

In `tr.json`, after its `"Verification.ErrorDescription"` line, add:

```json
  "Verification.Unavailable": "Kimlik doğrulama şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
```

Then regenerate the bundle: `cd apps/ssr && pnpm run init`.

- [ ] **Step 7: Switch the five screens to `action`**

In each of the four files below, replace this import block:

```tsx
import {
  DiditVerification,
  useDiditConfig,
  VerificationResult,
} from "@repo/ui/unirefund/didit-verification";
```

with:

```tsx
import type { VerificationResult } from "@repo/ui/unirefund/didit-verification";
import { DiditVerification } from "@/src/components/didit-verification/didit-verification";
```

Delete the two lines that read the workflow (`const { apiKey, getWorkflowForAction } = useDiditConfig();` and `const workflowId = getWorkflowForAction("…");`). Then in the JSX, replace the two lines

```tsx
      apiKey={apiKey}
      workflowId={workflowId ?? ""}
```

with one line `action="<Action>"`, keeping the indentation:

| File | `<Action>` |
| --- | --- |
| `apps/ssr/src/app/[lang]/(auth)/login/kyc/didit.tsx` | `GetAccessToken` |
| `apps/ssr/src/app/[lang]/(auth)/register/didit.tsx` | `CreateTraveller` |
| `apps/ssr/src/app/[lang]/(auth)/reset-password/didit.tsx` | `SetPassword` |
| `apps/ssr/src/app/[lang]/(public)/validate/_components/didit-for-validate.tsx` | `GetAccessToken` |

In `apps/ssr/src/app/[lang]/(main)/profile/verify/_components/verify-view.tsx`:

Replace the import

```tsx
import {
  DiditVerification,
  useDiditConfig,
  type VerificationResult,
} from "@repo/ui/unirefund/didit-verification";
```

with

```tsx
import { DiditVerification } from "@/src/components/didit-verification/didit-verification";
import type { VerificationResult } from "@repo/ui/unirefund/didit-verification";
```

Delete

```tsx
  const { apiKey, getWorkflowForAction } = useDiditConfig();
  const workflowId = getWorkflowForAction("ProveDocument");
```

Replace

```tsx
      ) : workflowId && !diditFailed ? (
        <DiditVerification
          apiKey={apiKey}
          declineText={t.SSRService["Header.Back"]}
          loadingText={t.SSRService["Loading"]}
          onComplete={(result) => void handleComplete(result)}
          onError={() => {
            if (diditFailed) return;
            setDiditFailed(true);
            toast.error(t.SSRService["Profile.Verification.FailedTitle"]);
          }}
          workflowId={workflowId}
        />
```

with

```tsx
      ) : !diditFailed ? (
        <DiditVerification
          action="ProveDocument"
          declineText={t.SSRService["Header.Back"]}
          onComplete={(result) => void handleComplete(result)}
          onError={(e) => {
            setDiditFailed(true);
            toast.error(
              e.error?.message ?? t.SSRService["Profile.Verification.FailedTitle"]
            );
          }}
        />
```

The `if (diditFailed) return;` guard existed because `onError` used to fire on every render; it now fires once.

- [ ] **Step 8: Stop fetching workflows (ssr layout, staff portal, dead loader)**

Delete `apps/ssr/src/providers/didit-config-loader.tsx` (nothing imports it: `grep -rn didit-config-loader apps/ssr/src` prints nothing).

In `apps/ssr/src/app/[lang]/layout.tsx`, replace

```tsx
import {
  getDiditWorkflowsApi,
  getEvidenceLevelRequirementsApi,
} from "@repo/actions/unirefund/TravellerService/actions";
```

with

```tsx
import { getEvidenceLevelRequirementsApi } from "@repo/actions/unirefund/TravellerService/actions";
```

replace

```tsx
  const [workflowsResult, requirementsResult] = await Promise.allSettled([
    getDiditWorkflowsApi(),
    getEvidenceLevelRequirementsApi(),
  ]);

  const diditWorkflows =
    workflowsResult.status === "fulfilled" &&
    workflowsResult.value.type === "success"
      ? workflowsResult.value.data ?? []
      : [];

  const evidenceLevelRequirements =
    requirementsResult.status === "fulfilled" &&
    requirementsResult.value.type === "success"
      ? requirementsResult.value.data ?? []
      : [];
```

with

```tsx
  // Optional: without it every Didit screen reports itself unavailable.
  const requirementsResult = await getEvidenceLevelRequirementsApi().catch(
    () => null
  );
  const evidenceLevelRequirements =
    requirementsResult?.type === "success" ? requirementsResult.data ?? [] : [];
```

and replace

```tsx
              <DiditConfigProvider
                apiKey={process.env.NEXT_PUBLIC_DIDIT_API_KEY ?? ""}
                workflows={diditWorkflows}
                evidenceLevelRequirements={evidenceLevelRequirements}
              >
```

with

```tsx
              <DiditConfigProvider
                evidenceLevelRequirements={evidenceLevelRequirements}
              >
```

In `packages/actions/unirefund/TravellerService/actions.ts`, delete `getDiditWorkflowsApi` (the whole function, ~lines 226-235).

Replace `apps/web/src/providers/providers-data.ts` with the following. It keeps the original docblock. `auth()` still resolves before `getApplicationConfiguration()`, as it did before; do not parallelise them, because two concurrent `auth()` calls can race a token refresh.

```ts
import type { ApplicationConfiguration } from "@repo/utils/app-config";
import { getApplicationConfiguration } from "@repo/utils/app-config/fetch";
import type { Session } from "@repo/utils/auth";
import { auth } from "@repo/utils/auth/next-auth";

/**
 * Deliberately NOT in `providers.tsx`: that file carries `"use server"`, so any
 * export added to it becomes a server action the client can invoke.
 *
 * This lives on its own so `(main)/layout.tsx` can start the fetch without
 * awaiting it. <Providers> is the layout's child, so its requests used to begin
 * only after the layout's own had resolved - two serialized stages, measured at
 * ~450 ms total. Kicking the promise off in the parent overlaps them, taking
 * an authenticated page's server render to ~240 ms.
 */
export interface ProvidersData {
  session: Session | null;
  configuration: ApplicationConfiguration;
}

export async function getProvidersData(): Promise<ProvidersData> {
  const session = await auth();
  const configuration = await getApplicationConfiguration();
  return { session, configuration };
}
```

Replace `apps/web/src/providers/providers.tsx` with:

```tsx
"use server";

import { QueryProvider } from "@repo/ui/providers/query";
import { ApplicationConfigurationProvider } from "@repo/utils/app-config";
import { SessionProvider } from "@repo/utils/auth";
import DeviceProvider from "./device";
import DeviceHubProvider from "./device-hub";
import type { ProvidersData } from "./providers-data";
import { TenantFormattingProvider } from "./tenant-formatting";

interface ProvidersProps {
  children: React.ReactNode;
  lang: string;
  // The parent layout starts this fetch so it overlaps with the layout's own,
  // instead of beginning only once the layout has resolved. See providers-data.ts.
  data: Promise<ProvidersData>;
}

export default async function Providers({
  children,
  lang,
  data,
}: ProvidersProps) {
  const { session, configuration } = await data;

  return (
    <ApplicationConfigurationProvider configuration={configuration} lang={lang}>
      <SessionProvider session={session}>
        <DeviceProvider>
          <DeviceHubProvider gatewayUrl={process.env.GATEWAY_URL || ""}>
            <QueryProvider>
              <TenantFormattingProvider>{children}</TenantFormattingProvider>
            </QueryProvider>
          </DeviceHubProvider>
        </DeviceProvider>
      </SessionProvider>
    </ApplicationConfigurationProvider>
  );
}
```

In `apps/web/src/app/[lang]/(main)/layout.tsx`, change `getProvidersData(lang)` to `getProvidersData()`.

- [ ] **Step 9: Read the failure paths, then run the gates**

Read `didit-verification.tsx` once more and confirm two things:
- With `getLevelForAction` returning `undefined`, the effect calls `onError` exactly once and never calls `postPublicDiditSessionApi`, and the render returns `null` (Review Focus 2).
- No `setStatus` runs before the `await`, so the lint's set-state-in-effect rule has nothing to flag.

Then run:

```bash
pnpm --filter @repo/ui type-check && pnpm --filter @repo/ui lint
pnpm --filter ssr type-check && pnpm --filter ssr lint
pnpm --filter web type-check && pnpm --filter web lint
pnpm --filter web test:unit
pnpm policy:audit
pnpm i18n:missing --app=ssr
grep -rn "useDiditConfig\|getWorkflowFor\|workflowId\|getDiditWorkflows" apps packages/ui/src packages/actions --include=*.ts --include=*.tsx | grep -v "/saas/"
```

Expected: every command at its Step 2 baseline, with no new errors and no new warnings. The last grep prints only `useDiditConfig` inside `packages/ui/src/unirefund/didit-verification/` and the commented-out block in `apps/web/.../customs-filter.tsx`.

- [ ] **Step 10: Commit**

```bash
git add -A packages/actions packages/ui apps/ssr/src apps/web/src
git status --short   # must show only the files listed in this task
git commit -F - <<'EOF'
feat(didit): start every verification from a backend-created session

DiditVerification now takes the SSR action, reads its evidence level and asks
the backend for a session through a token-less server action, instead of
posting a browser-held API key and workflow id to the local proxy. A failure
reports once with localized copy rather than on every render. ssr screens go
through one wrapper that supplies the copy; ssr and the staff portal stop
fetching didit-workflows.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: web-app — remove the browser key and the Didit proxy

**Files:**
- Delete: `packages/ui/src/unirefund/didit-verification/handlers.ts`
- Modify: `packages/ui/src/unirefund/didit-verification/index.tsx`
- Delete: `apps/ssr/src/app/api/session/route.ts`, `apps/web/src/app/api/session/route.ts`
- Modify: `Dockerfile:50-65`, `.github/workflows/deploy.yml` (header comment + build args), `docs/deployment.md`, `AGENTS.md:465-467,480`

**Interfaces:**
- Consumes: Task 1, which removed every reader of `NEXT_PUBLIC_DIDIT_API_KEY` in app code.
- Produces: no build-time Didit value. `deploy.yml` passes only `APP`, `GATEWAY_URL` and `SUPPORTED_LOCALES`.

- [ ] **Step 1: Delete the proxy**

```bash
git rm packages/ui/src/unirefund/didit-verification/handlers.ts apps/ssr/src/app/api/session/route.ts apps/web/src/app/api/session/route.ts
```

Set `packages/ui/src/unirefund/didit-verification/index.tsx` to:

```tsx
export * from "./didit-verification";
export * from "./didit-config-provider";
```

Next's generated route types still name the deleted routes. Remove the stale artifacts so type-check does not report phantom TS2307s: `rm -rf apps/ssr/.next/types apps/web/.next/types apps/ssr/.next/dev/types apps/web/.next/dev/types`.

- [ ] **Step 2: Drop the key from the image and the workflow**

In `Dockerfile`, replace

```dockerfile
# These three, and only these three, are needed to BUILD:
#   GATEWAY_URL / SUPPORTED_LOCALES - init.ts fetches ABP policies and
#     localization from the gateway and writes them into the build. Note
#     SUPPORTED_LOCALES decides which i18n bundles exist, so the build value must
#     be a superset of every runtime value that will use this image.
#   NEXT_PUBLIC_DIDIT_API_KEY - next inlines NEXT_PUBLIC_* into the client
#     bundle at build time, so a value supplied at runtime arrives too late. It
#     is already public by design; it reaches every browser either way.
# Everything else these apps read is server-side and resolves at runtime, which
# includes TENANT_ID - so one image per environment serves every tenant.
ARG GATEWAY_URL
ARG SUPPORTED_LOCALES
ARG NEXT_PUBLIC_DIDIT_API_KEY
ENV GATEWAY_URL=$GATEWAY_URL
ENV SUPPORTED_LOCALES=$SUPPORTED_LOCALES
ENV NEXT_PUBLIC_DIDIT_API_KEY=$NEXT_PUBLIC_DIDIT_API_KEY
```

with

```dockerfile
# These two, and only these two, are needed to BUILD:
#   GATEWAY_URL / SUPPORTED_LOCALES - init.ts fetches ABP policies and
#     localization from the gateway and writes them into the build. Note
#     SUPPORTED_LOCALES decides which i18n bundles exist, so the build value must
#     be a superset of every runtime value that will use this image.
# Everything else these apps read is server-side and resolves at runtime, which
# includes TENANT_ID - so one image per environment serves every tenant.
ARG GATEWAY_URL
ARG SUPPORTED_LOCALES
ENV GATEWAY_URL=$GATEWAY_URL
ENV SUPPORTED_LOCALES=$SUPPORTED_LOCALES
```

In `.github/workflows/deploy.yml`:
- replace `#     is not a valid uat or prod artifact. NEXT_PUBLIC_DIDIT_API_KEY is inlined` plus the line after it (`#     into the client bundle for the same reason.`) with the single line `#     is not a valid uat or prod artifact.`;
- delete the two lines starting `#   NEXT_PUBLIC_DIDIT_API_KEY  - may differ per environment` and `#                                client bundle, so it is needed at BUILD time`;
- delete the build-arg line `            NEXT_PUBLIC_DIDIT_API_KEY=${{ secrets.NEXT_PUBLIC_DIDIT_API_KEY }}`.

- [ ] **Step 3: Update the docs**

In `docs/deployment.md`:
- delete the matrix row starting ``| `NEXT_PUBLIC_DIDIT_API_KEY` | **build**``;
- change `Two secrets required in each` to `One secret required in each`;
- delete the secrets row starting ``| `NEXT_PUBLIC_DIDIT_API_KEY` | Needed at build time``.

In `AGENTS.md`, replace

```markdown
Only **three** values are needed at BUILD time — `GATEWAY_URL` and
`SUPPORTED_LOCALES` (for `init.ts`) and `NEXT_PUBLIC_DIDIT_API_KEY` (Next inlines
`NEXT_PUBLIC_*` into the client bundle, so supplying it at runtime is too late).
```

with

```markdown
Only **two** values are needed at BUILD time — `GATEWAY_URL` and
`SUPPORTED_LOCALES` (for `init.ts`).
```

and change `only the three build-time values above` to `only the two build-time values above`.

lint-staged runs prettier on staged `.md` files at commit, which re-pads the tables.

- [ ] **Step 4: Prove nothing is left, then run the gates**

```bash
git grep -n "NEXT_PUBLIC_DIDIT_API_KEY\|api/session\|didit-verification/handlers\|getDiditWorkflows"
```

Expected: no output.

Then run the Task 1 Step 9 gate commands. Expected: still at baseline.

- [ ] **Step 5: Commit**

```bash
git add -A packages/ui/src/unirefund/didit-verification apps/ssr/src/app/api apps/web/src/app/api Dockerfile .github/workflows/deploy.yml docs/deployment.md AGENTS.md
git status --short   # nothing unstaged under apps/ or packages/ that this task touched
git commit -F - <<'EOF'
chore(didit): remove the browser-held key and the session proxy

The Next.js /api/session route forwarded any api_key and workflow_id it was
given to Didit, and NEXT_PUBLIC_DIDIT_API_KEY was inlined into both apps'
client bundles. Nothing reads either since sessions come from the backend,
so the route, the handler, the build arg and the docs that described them go.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: web-app — prove it on dev

**Files:** none (verification only).

**Interfaces:**
- Consumes: Tasks 1 and 2. `apps/ssr/.env` `GATEWAY_URL` must be `https://dev-api.unirefund.com`; the endpoint is not on uat.

- [ ] **Step 1: Start ssr from the worktree on a free port**

Check that nothing listens on 3105 (`netstat -ano | grep :3105`), then start the dev server detached, as a background command with a long timeout:

```bash
cd C:/unirefund/web-app-wt-didit/apps/ssr && pnpm run init && node scripts/copy-maplibre-worker.mjs && npx next dev --webpack -p 3105
```

Wait until `curl -s -o /dev/null -w "%{http_code}" http://localhost:3105/en` prints `200`.

- [ ] **Step 2: Prove the proxy is gone**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3105/api/session -H "Content-Type: application/json" -d "{}"
```

Expected: `404`.

- [ ] **Step 3: Load the KYC login once**

This creates exactly one real Didit session; do not reload. With Playwright, open `http://localhost:3105/en/login/kyc` and wait 10 s. Take a snapshot: the Didit widget is showing, not the spinner and not an error. Do not complete the verification.

- [ ] **Step 4: Read the network log**

List the page's requests.
- Exactly **one** POST to `/en/login/kyc` carries a `Next-Action` header: the server action (Review Focus 1).
- An iframe or request to `verify.didit.me/session/...` is present.
- Nothing goes to `/api/session`, and no request carries `x-api-key` or `api_key`.

Then check the dev server's log for one `public-didit-sessions` call returning 200.

- [ ] **Step 5: Prove the bundle carries no key**

```bash
grep -rl "x-api-key\|api_key\|NEXT_PUBLIC_DIDIT" C:/unirefund/web-app-wt-didit/apps/ssr/.next/static || echo "clean"
```

Expected: `clean`.

- [ ] **Step 6: Stop the dev server**

Stop the background command, and confirm that port 3105 is free.

---

### Task 4: super-app — worktree, KYC client and the anonymous session action

**Files:**
- Modify: `src/saas/KYCService/*` (from commit `0d41e6f`)
- Modify: `src/utils/apiError.ts`, Test: `src/utils/__tests__/apiError.test.ts`
- Modify: `src/actions/lib.ts`
- Modify: `src/actions/KYCService/post.ts`, Create test: `src/actions/KYCService/__tests__/post.test.ts`

**Interfaces:**
- Produces: `getApiErrorCode(error: unknown): string | undefined` from `@/utils/apiError`.
- Produces: `getPublicKYCServiceClient(customHeaders?: Record<string, string>): Promise<KYCServiceClient>` from `@/actions/lib`.
- Produces: `postPublicDiditSessionApi(evidenceLevel: CreateDiditSessionInput["evidenceLevel"]): Promise<DiditSessionCreatedDto>` from `@/actions/KYCService/post`. It throws the generated client's `ApiError` on failure.

- [ ] **Step 1: Create the worktree**

Outside the repo, because jest ignores `.claude/` paths.

```bash
git -C C:/unirefund/super-app fetch origin
git -C C:/unirefund/super-app worktree add C:/unirefund/super-app-wt-didit -b feat/didit-backend-sessions origin/main
cd C:/unirefund/super-app-wt-didit
cp C:/unirefund/super-app/.env .env
npm ci
npm run init
```

- [ ] **Step 2: Bring in the regenerated KYC client**

`origin/main` predates the regeneration; commit `0d41e6f` (on `feat/map-improvement`) carries it. Taking that folder verbatim keeps both branches byte-identical there, so they merge cleanly.

```bash
git show --stat 0d41e6f -- src/saas/core src/saas/KYCService
git checkout 0d41e6f -- src/saas/KYCService
grep -c "public-didit-sessions" src/saas/KYCService/sdk.gen.ts
```

Expected: `src/saas/core` is absent from the stat (if it is listed, also `git checkout 0d41e6f -- src/saas/core`), and the grep prints `2`.

- [ ] **Step 3: Record the baselines**

```bash
npm run typecheck
npm test
npm run lint
```

Note the counts. AGENTS.md's 2026-09-24 numbers are stale. Then commit the client:

```bash
git add src/saas
git commit -F - <<'EOF'
chore(saas): regenerate the KYC client for public Didit sessions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

- [ ] **Step 4: Write the failing test for `getApiErrorCode`**

Append to `src/utils/__tests__/apiError.test.ts`, change its import to `import { getApiErrorCode, getApiErrorMessage } from "../apiError";`, and reuse its `apiError(body, status)` helper:

```ts
describe("getApiErrorCode", () => {
  it("returns the ABP error code the body carries", () => {
    const error = apiError(
      { error: { code: "UniRefund.KYCService:010022" } },
      403,
    );
    expect(getApiErrorCode(error)).toBe("UniRefund.KYCService:010022");
  });

  it("returns undefined when the body carries no code", () => {
    expect(getApiErrorCode(apiError({ error: {} }))).toBeUndefined();
    expect(getApiErrorCode(apiError({ error: { code: null } }))).toBeUndefined();
    expect(getApiErrorCode(apiError(undefined))).toBeUndefined();
  });

  it("returns undefined for anything that is not an ApiError", () => {
    expect(getApiErrorCode(new Error("offline"))).toBeUndefined();
    expect(getApiErrorCode(undefined)).toBeUndefined();
  });
});
```

Run: `npx jest src/utils/__tests__/apiError.test.ts`
Expected: FAIL, `getApiErrorCode` is not exported.

- [ ] **Step 5: Implement it**

Append to `src/utils/apiError.ts`:

```ts
/**
 * The ABP error code a failed request carries (for example
 * `UniRefund.KYCService:010022`), or `undefined`. Branch on this, not on the
 * HTTP status: ABP returns business errors as 403.
 */
export function getApiErrorCode(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;

  const body = error.body as Volo_Abp_Http_RemoteServiceErrorResponse | undefined;
  return body?.error?.code ?? undefined;
}
```

Run: `npx jest src/utils/__tests__/apiError.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing test for the session action**

Create `src/actions/KYCService/__tests__/post.test.ts`:

```ts
import { postPublicDiditSessionApi } from "../post";

jest.mock("@/actions/lib", () => ({
  getKYCServiceClient: jest.fn(),
  getPublicKYCServiceClient: jest.fn(),
}));
jest.mock("@/utils/customFetch", () => ({ fetchRequest: jest.fn() }));

const { getKYCServiceClient, getPublicKYCServiceClient } =
  jest.requireMock("@/actions/lib");
const { fetchRequest } = jest.requireMock("@/utils/customFetch");

const createSession = jest.fn();
const SESSION = { diditSessionId: "d1", sessionToken: "tok-1" };

beforeEach(() => {
  jest.clearAllMocks();
  (getPublicKYCServiceClient as jest.Mock).mockResolvedValue({
    diditSessionPublic: { postApiKycServicePublicDiditSessions: createSession },
  });
  createSession.mockResolvedValue(SESSION);
});

it("asks the backend for a session at the given level", async () => {
  await expect(postPublicDiditSessionApi("High")).resolves.toEqual(SESSION);
  expect(createSession).toHaveBeenCalledWith({
    requestBody: { evidenceLevel: "High" },
  });
});

// A bearer would make ABP resolve the traveller's tenant instead of the shared
// Didit accounts, and fetchRequest would retry a 401 with a token refresh.
it("goes out on the anonymous client, with no headers of its own", async () => {
  await postPublicDiditSessionApi("Low");

  expect(getPublicKYCServiceClient).toHaveBeenCalledWith();
  expect(getKYCServiceClient).not.toHaveBeenCalled();
  expect(fetchRequest).not.toHaveBeenCalled();
});

it("lets the backend's error through", async () => {
  createSession.mockRejectedValue(new Error("403"));

  await expect(postPublicDiditSessionApi("Low")).rejects.toThrow("403");
});
```

Run: `npx jest src/actions/KYCService/__tests__/post.test.ts`
Expected: FAIL, `postPublicDiditSessionApi` is not exported.

- [ ] **Step 7: Implement the client and the action**

In `src/actions/lib.ts`, after `getPublicCRMServiceClient`:

```ts
export const getPublicKYCServiceClient = (
  customHeaders?: Record<string, string>,
) => createPublicServiceClient(KYCServiceClient, customHeaders);
```

Replace `src/actions/KYCService/post.ts` with:

```ts
import type {
  PostApiKycServiceIdVerificationsVerifyByPhotoData,
  UniRefund_KYCService_DiditSessions_CreateDiditSessionInput as CreateDiditSessionInput,
} from "@/saas/KYCService";
import { fetchRequest } from "@/utils/customFetch";
import { getKYCServiceClient, getPublicKYCServiceClient } from "../lib";

export async function postApiKycServiceIdVerificationsVerifyByPhoto(
  data: PostApiKycServiceIdVerificationsVerifyByPhotoData["requestBody"],
) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getKYCServiceClient(customHeaders);
    return await client.idVerification.postApiKycServiceIdVerificationsVerifyByPhoto(
      { requestBody: data },
    );
  }, "postApiKycServiceIdVerificationsVerifyByPhoto");
}

/**
 * Starts a Didit session on the backend's Didit accounts; the SDK starts from
 * its `sessionToken`. Anonymous on purpose: no bearer and no `__tenant`, so the
 * session comes from the shared accounts, the context every SSR action that
 * later reads it runs in. That is also why it skips `fetchRequest`, which
 * attaches a bearer and retries a 401 with a refresh.
 */
export async function postPublicDiditSessionApi(
  evidenceLevel: CreateDiditSessionInput["evidenceLevel"],
) {
  const client = await getPublicKYCServiceClient();
  return await client.diditSessionPublic.postApiKycServicePublicDiditSessions({
    requestBody: { evidenceLevel },
  });
}
```

Run: `npx jest src/actions/KYCService/__tests__/post.test.ts src/utils/__tests__/apiError.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/utils/apiError.ts src/utils/__tests__/apiError.test.ts src/actions/lib.ts src/actions/KYCService
git commit -F - <<'EOF'
feat(didit): add the anonymous public Didit session action

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: super-app — resolve the evidence level per action

**Files:**
- Create: `src/utils/didit/level.ts`
- Test: `src/utils/didit/__tests__/level.test.ts`

**Interfaces:**
- Consumes: `getEvidenceLevelRequirements()` from `@/actions/TravellerService/actions` (exists; returns `Array<{ actionType; minimumEvidenceLevel }>`).
- Produces: `resolveEvidenceLevel(action: SSRActionType): Promise<DiditSessionLevel | null>` and `type DiditSessionLevel = "Low" | "Medium" | "High"` from `@/utils/didit/level`.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/didit/__tests__/level.test.ts`:

```ts
import type { resolveEvidenceLevel as ResolveEvidenceLevel } from "../level";

const mockGetRequirements = jest.fn();
// Dereferenced lazily: a factory that put the mock straight into the object
// literal would capture it before it is initialised.
jest.mock("@/actions/TravellerService/actions", () => ({
  getEvidenceLevelRequirements: (...args: unknown[]) =>
    mockGetRequirements(...args),
}));

/** A fresh copy of the module, so every test starts with an empty cache. */
function loadResolver(): typeof ResolveEvidenceLevel {
  let resolver!: typeof ResolveEvidenceLevel;
  jest.isolateModules(() => {
    resolver = require("../level").resolveEvidenceLevel;
  });
  return resolver;
}

const REQUIREMENTS = [
  { actionType: "GetAccessToken", minimumEvidenceLevel: "Medium" },
  { actionType: "ProveDocument", minimumEvidenceLevel: "High" },
  { actionType: "ScanDocument", minimumEvidenceLevel: "None" },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRequirements.mockResolvedValue(REQUIREMENTS);
});

it("returns the level the backend requires for the action", async () => {
  const resolve = loadResolver();

  await expect(resolve("GetAccessToken")).resolves.toBe("Medium");
  await expect(resolve("ProveDocument")).resolves.toBe("High");
});

// Didit has no "None" level; the cheapest one it serves stands in.
it("asks for Low when the action requires no evidence", async () => {
  await expect(loadResolver()("ScanDocument")).resolves.toBe("Low");
});

it("returns null for an action the requirements do not name", async () => {
  await expect(loadResolver()("SetPassword")).resolves.toBeNull();
});

it("loads the requirements once and reuses them", async () => {
  const resolve = loadResolver();

  await resolve("GetAccessToken");
  await resolve("ProveDocument");

  expect(mockGetRequirements).toHaveBeenCalledTimes(1);
});

// With no fallback workflow, a cached failure would keep Didit unavailable
// until the app restarts.
it("returns null when the load fails, and loads again next time", async () => {
  const resolve = loadResolver();
  mockGetRequirements.mockRejectedValueOnce(new Error("offline"));

  await expect(resolve("GetAccessToken")).resolves.toBeNull();
  await expect(resolve("GetAccessToken")).resolves.toBe("Medium");
  expect(mockGetRequirements).toHaveBeenCalledTimes(2);
});

it("does not keep an empty list either", async () => {
  const resolve = loadResolver();
  mockGetRequirements.mockResolvedValueOnce([]);

  await expect(resolve("GetAccessToken")).resolves.toBeNull();
  await expect(resolve("GetAccessToken")).resolves.toBe("Medium");
});
```

Run: `npx jest src/utils/didit/__tests__/level.test.ts`
Expected: FAIL, `Cannot find module '../level'`.

- [ ] **Step 2: Implement `level.ts`**

Create `src/utils/didit/level.ts`:

```ts
import { getEvidenceLevelRequirements } from "@/actions/TravellerService/actions";
import type {
  UniRefund_Shared_KYCEnums_Enums_EvidenceLevel as EvidenceLevel,
  UniRefund_TravellerService_Enums_SSRActionType as SSRActionType,
  UniRefund_TravellerService_SSRActions_SSRActionEvidenceLevelRequirementDto as Requirement,
} from "@/saas/TravellerService";

/** A level the backend can start a Didit session at; Didit has no "None". */
export type DiditSessionLevel = Exclude<EvidenceLevel, "None">;

let requirementsPromise: Promise<Requirement[]> | null = null;

/**
 * The public, tenant-wide requirements list, loaded once. Only a successful,
 * non-empty load is kept: a cached failure would leave Didit unavailable until
 * the app restarts.
 */
function loadRequirements(): Promise<Requirement[]> {
  if (!requirementsPromise) {
    const pending = getEvidenceLevelRequirements().then((list) => {
      if (!list?.length) throw new Error("No evidence-level requirements");
      return list;
    });
    pending.catch(() => {
      requirementsPromise = null;
    });
    requirementsPromise = pending;
  }
  return requirementsPromise;
}

/**
 * The evidence level to start a Didit session at for an SSR action, from the
 * backend's evidence-level requirements. `null` when they cannot be loaded or
 * do not name the action: the caller reports Didit as unavailable rather than
 * guess a level.
 */
export async function resolveEvidenceLevel(
  action: SSRActionType,
): Promise<DiditSessionLevel | null> {
  try {
    const requirements = await loadRequirements();
    const level = requirements.find(
      (r) => r.actionType === action,
    )?.minimumEvidenceLevel;
    if (!level) return null;
    return level === "None" ? "Low" : level;
  } catch {
    return null;
  }
}
```

Run: `npx jest src/utils/didit/__tests__/level.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add src/utils/didit/level.ts src/utils/didit/__tests__/level.test.ts
git commit -F - <<'EOF'
feat(didit): resolve the evidence level an SSR action needs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: super-app — start the SDK from the backend session

**Files:**
- Modify: `src/hooks/useDiditVerify.tsx`
- Rewrite: `src/hooks/__tests__/useDiditVerify.router.test.ts`
- Modify: `src/screens/traveller/Profile/useVerifyAccount.ts`, Test: `src/screens/traveller/Profile/__tests__/useVerifyAccount.router.test.ts`
- Modify: `src/localization/resources/en-US.json`, `src/localization/resources/tr-TR.json`
- Delete: `src/utils/didit/workflow.ts`
- Modify: `src/actions/TravellerService/actions.ts` (delete `getDiditWorkflows` and its docblock)

**Interfaces:**
- Consumes: `resolveEvidenceLevel` (Task 5), `postPublicDiditSessionApi` and `getApiErrorCode` (Task 4), and `startVerification(token: string, config?: DiditConfig): Promise<VerificationResult>` from `@didit-protocol/sdk-react-native`.
- Produces: `useDiditVerify()` with the same `{ verify, runVerification }` and the same `VerificationOutcome` union, so its callers are untouched.

- [ ] **Step 1: Rewrite the hook's test**

Replace `src/hooks/__tests__/useDiditVerify.router.test.ts` with:

```ts
import { postPublicDiditSessionApi } from "@/actions/KYCService/post";
import { useDiditVerify } from "@/hooks/useDiditVerify";
import { ApiError } from "@/saas/AccountService";
import { resolveEvidenceLevel } from "@/utils/didit/level";
import { startVerification } from "@didit-protocol/sdk-react-native";
import { renderHook } from "@testing-library/react-native";

jest.mock("@/utils/didit/level", () => ({
  resolveEvidenceLevel: jest.fn(),
}));
jest.mock("@/actions/KYCService/post", () => ({
  postPublicDiditSessionApi: jest.fn(),
}));
jest.mock("@didit-protocol/sdk-react-native", () => ({
  startVerification: jest.fn(),
}));

// `t` returns the key, so assertions name the message rather than its English.
jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key, languageCode: "tr" }),
}));

// Prefixed `mock` (case insensitive): a `jest.mock()` factory may only close
// over out-of-scope variables that satisfy this, per babel-plugin-jest-hoist.
const mockShow = jest.fn();
jest.mock("@/providers/ToastProvider", () => ({
  useToastRef: () => ({ current: { show: mockShow } }),
}));

const resolveLevel = resolveEvidenceLevel as jest.MockedFunction<
  typeof resolveEvidenceLevel
>;
const createSession = postPublicDiditSessionApi as jest.MockedFunction<
  typeof postPublicDiditSessionApi
>;
const startSdk = startVerification as jest.MockedFunction<
  typeof startVerification
>;

const SESSION = {
  diditSessionId: "didit-1",
  sessionToken: "token-1",
  diditCredentialName: "Didit Account 1",
};

/** A `completed` result carrying the given decision. */
function completed(status: string, sessionId = "session-1") {
  return { type: "completed", session: { status, sessionId } };
}

/** The backend refusing to create a session, as the generated client throws it. */
function backendError(code: string): ApiError {
  return new ApiError(
    { method: "POST", url: "/api/kyc-service/public-didit-sessions" },
    {
      url: "/api/kyc-service/public-didit-sessions",
      ok: false,
      status: 403,
      statusText: "Forbidden",
      body: { error: { code } },
    },
    "Forbidden",
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resolveLevel.mockResolvedValue("High");
  createSession.mockResolvedValue(SESSION as never);
});

function verifyHook() {
  const { result } = renderHook(() => useDiditVerify());
  return result.current.verify;
}

function runHook() {
  const { result } = renderHook(() => useDiditVerify());
  return result.current.runVerification;
}

it("starts the SDK from the session the backend created at the action's level", async () => {
  startSdk.mockResolvedValue(completed("Approved") as never);

  await verifyHook()("ProveDocument");

  expect(resolveLevel).toHaveBeenCalledWith("ProveDocument");
  expect(createSession).toHaveBeenCalledWith("High");
  expect(startSdk).toHaveBeenCalledWith("token-1", {
    languageCode: "tr",
    loggingEnabled: __DEV__,
    // The reason for the 3.2.0 -> 4.7.3 upgrade: 3.2.0 drew no exit control
    // on the screen the SDK opens on, which left the traveller stranded there
    // with no system back on iOS at all. Both default to true in 4.7.3 and are
    // passed anyway, so a change of default cannot quietly bring that back.
    showCloseButton: true,
    showExitConfirmation: true,
  });
});

it("returns the session id when the verification is approved", async () => {
  startSdk.mockResolvedValue(completed("Approved", "session-7") as never);

  await expect(verifyHook()("ProveDocument")).resolves.toBe("session-7");
  expect(mockShow).not.toHaveBeenCalled();
});

it("reports Didit unavailable when the action has no level, and creates nothing", async () => {
  resolveLevel.mockResolvedValue(null);

  await expect(verifyHook()("ProveDocument")).resolves.toBeNull();
  expect(createSession).not.toHaveBeenCalled();
  expect(startSdk).not.toHaveBeenCalled();
  expect(mockShow).toHaveBeenCalledWith(
    "error",
    "MobileApp.Auth.Verification.NotAvailable",
  );
});

it.each(["UniRefund.KYCService:010022", "UniRefund.KYCService:010025"])(
  "reports Didit unavailable when the backend answers %s",
  async (code) => {
    createSession.mockRejectedValue(backendError(code));

    await expect(verifyHook()("ProveDocument")).resolves.toBeNull();
    expect(startSdk).not.toHaveBeenCalled();
    expect(mockShow).toHaveBeenCalledWith(
      "error",
      "MobileApp.Auth.Verification.NotAvailable",
    );
  },
);

// The traveller chose to cancel; a toast would scold them for it.
it("is silent when the traveller cancels", async () => {
  startSdk.mockResolvedValue({ type: "cancelled" } as never);

  await expect(verifyHook()("ProveDocument")).resolves.toBeNull();
  expect(mockShow).not.toHaveBeenCalled();
});

it("reports a failed verification", async () => {
  startSdk.mockResolvedValue({
    type: "failed",
    error: { type: "networkError", message: "boom" },
  } as never);

  await expect(verifyHook()("ProveDocument")).resolves.toBeNull();
  expect(mockShow).toHaveBeenCalledWith(
    "error",
    "MobileApp.Auth.Verification.Failed",
  );
});

// Declined and Pending both *complete*, so only the decision separates them
// from an approval. Yielding a session id for either would post a rejected or
// unfinished verification as proof.
it("returns no session id for a declined decision", async () => {
  startSdk.mockResolvedValue(completed("Declined") as never);

  await expect(verifyHook()("ProveDocument")).resolves.toBeNull();
  expect(mockShow).toHaveBeenCalledWith(
    "error",
    "MobileApp.Auth.Verification.DeclinedDescription",
  );
});

it("returns no session id for a pending decision", async () => {
  startSdk.mockResolvedValue(completed("Pending") as never);

  await expect(verifyHook()("ProveDocument")).resolves.toBeNull();
  expect(mockShow).toHaveBeenCalledWith(
    "info",
    "MobileApp.Auth.Verification.PendingDescription",
  );
});

// `runVerification` is the same reduction without the announcements, for screens
// that own copy per outcome (Profile's Verify Account). It must stay silent, and
// it must name every state `verify` collapses into `null`.
describe("runVerification", () => {
  it("carries the session id only on an approval", async () => {
    startSdk.mockResolvedValue(completed("Approved", "session-9") as never);

    await expect(runHook()("ProveDocument")).resolves.toEqual({
      type: "approved",
      sessionId: "session-9",
    });
    expect(mockShow).not.toHaveBeenCalled();
  });

  it.each([
    ["Declined", "declined"],
    ["Pending", "pending"],
  ])("reports a %s decision as %s, with no session id", async (status, type) => {
    startSdk.mockResolvedValue(completed(status) as never);

    await expect(runHook()("ProveDocument")).resolves.toEqual({ type });
    expect(mockShow).not.toHaveBeenCalled();
  });

  it("reports a cancellation", async () => {
    startSdk.mockResolvedValue({ type: "cancelled" } as never);

    await expect(runHook()("ProveDocument")).resolves.toEqual({
      type: "cancelled",
    });
  });

  // The SDK's reason rides along: it is the only diagnostic a failure leaves,
  // and Profile logs it.
  it("reports a failure and carries the SDK's reason", async () => {
    startSdk.mockResolvedValue({
      type: "failed",
      error: { type: "networkError", message: "boom" },
    } as never);

    await expect(runHook()("ProveDocument")).resolves.toEqual({
      type: "failed",
      error: { type: "networkError", message: "boom" },
    });
  });

  it("reports an unavailable action without running anything", async () => {
    resolveLevel.mockResolvedValue(null);

    await expect(runHook()("ProveDocument")).resolves.toEqual({
      type: "unavailable",
    });
    expect(startSdk).not.toHaveBeenCalled();
    expect(mockShow).not.toHaveBeenCalled();
  });

  // Any other refusal is a real failure, which callers report in their own
  // words, so it stays a throw rather than turning into "try again later".
  it("lets any other backend error through", async () => {
    const refused = backendError("UniRefund.KYCService:010024");
    createSession.mockRejectedValue(refused);

    await expect(runHook()("ProveDocument")).rejects.toBe(refused);
    expect(startSdk).not.toHaveBeenCalled();
  });

  it("lets a network error through", async () => {
    createSession.mockRejectedValue(new TypeError("Network request failed"));

    await expect(runHook()("ProveDocument")).rejects.toThrow(
      "Network request failed",
    );
    expect(startSdk).not.toHaveBeenCalled();
  });

  it("never starts the SDK without a session token", async () => {
    createSession.mockResolvedValue({ diditSessionId: "didit-1" } as never);

    await expect(runHook()("ProveDocument")).rejects.toThrow(
      "Didit session has no token",
    );
    expect(startSdk).not.toHaveBeenCalled();
  });

  // A rejected SDK call stays a throw rather than becoming a `failed` outcome —
  // callers report the two differently.
  it("lets a thrown SDK error through", async () => {
    startSdk.mockRejectedValue(new Error("native module exploded"));

    await expect(runHook()("ProveDocument")).rejects.toThrow(
      "native module exploded",
    );
  });
});
```

Run: `npx jest src/hooks/__tests__/useDiditVerify.router.test.ts`
Expected: FAIL, because the hook still calls `resolveWorkflowId` / `startVerificationWithWorkflow`.

- [ ] **Step 2: Rewrite `runVerification`**

In `src/hooks/useDiditVerify.tsx`, replace the imports with:

```tsx
import { postPublicDiditSessionApi } from "@/actions/KYCService/post";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useToastRef } from "@/providers/ToastProvider";
import type { UniRefund_TravellerService_Enums_SSRActionType as SSRActionType } from "@/saas/TravellerService";
import { getApiErrorCode } from "@/utils/apiError";
import { resolveEvidenceLevel } from "@/utils/didit/level";
import { logger } from "@/utils/logger";
import {
  startVerification,
  type VerificationError,
  type VerificationResult,
} from "@didit-protocol/sdk-react-native";
import { useCallback } from "react";

// The backend's "no Didit account can serve" and "Didit unreachable" codes.
const UNAVAILABLE_CODES = new Set([
  "UniRefund.KYCService:010022",
  "UniRefund.KYCService:010025",
]);
```

In the `VerificationOutcome` union, replace the last member's comment:

```tsx
  /** No Didit session could be started for the action, so nothing ran. */
  | { type: "unavailable" };
```

In the `useDiditVerify` docblock, replace the paragraph starting `Whichever is used, the workflow id comes from` with:

```tsx
 * Whichever is used, the session comes from the backend at the level
 * `resolveEvidenceLevel` reads for the action, so no call site can pin itself
 * to a workflow, a level or a Didit account.
```

Replace the `runVerification` callback with:

```tsx
  const runVerification = useCallback(
    async (action: SSRActionType): Promise<VerificationOutcome> => {
      const evidenceLevel = await resolveEvidenceLevel(action);
      if (!evidenceLevel) return { type: "unavailable" };

      let session: Awaited<ReturnType<typeof postPublicDiditSessionApi>>;
      try {
        session = await postPublicDiditSessionApi(evidenceLevel);
      } catch (error) {
        const code = getApiErrorCode(error);
        if (code && UNAVAILABLE_CODES.has(code)) return { type: "unavailable" };
        throw error;
      }
      if (!session.sessionToken) {
        throw new Error("Didit session has no token");
      }

      const result = await startVerification(session.sessionToken, {
        languageCode,
        loggingEnabled: __DEV__,
        showCloseButton: true,
        showExitConfirmation: true,
      });
      const outcome = reduceResult(result);

      // A recycled verification is invisible from here: evidence Didit carries
      // over from a previous session arrives looking exactly like a new
      // approval. The session id is what separates the two across consecutive
      // attempts, and the account name is what support needs to find it.
      // Kept out of the UI; support-only, as in Profile.
      logger.debug("Didit verification finished", {
        action,
        evidenceLevel,
        diditCredentialName: session.diditCredentialName,
        outcome: outcome.type,
        sessionId: outcome.type === "approved" ? outcome.sessionId : undefined,
      });
      return outcome;
    },
    [languageCode],
  );
```

Leave the docblock above it ("Deliberately does not catch...") as it is; it still holds for every error except the two unavailable codes. Add one line to it: `Only the backend's two "no account can serve" codes become \`unavailable\`.`

Run: `npx jest src/hooks/__tests__/useDiditVerify.router.test.ts`
Expected: PASS.

- [ ] **Step 3: Give Verify Account its own copy for `unavailable`**

In `src/screens/traveller/Profile/__tests__/useVerifyAccount.router.test.ts`, before the "offers nothing without the prove-document grant" test, add:

```ts
it("says verification is unavailable when no session could be started", async () => {
  signIn(true);
  mockRunVerification.mockResolvedValue({ type: "unavailable" });
  const { result } = renderHook(() => useVerifyAccount());

  await act(() => result.current!());

  expect(mockProve).not.toHaveBeenCalled();
  expect(alert.mock.calls[0]).toEqual([
    "MobileApp.Profile.Verification.UnavailableTitle",
    "MobileApp.Profile.Verification.UnavailableMessage",
  ]);
});
```

Run: `npx jest src/screens/traveller/Profile/__tests__/useVerifyAccount.router.test.ts`
Expected: FAIL, because the alert names `FailedTitle`.

In `src/localization/resources/en-US.json`, replace

```json
      "FailedMessage": "Something went wrong during verification. Please try again."
    },
    "Identity": {
```

with

```json
      "FailedMessage": "Something went wrong during verification. Please try again.",
      "UnavailableTitle": "Verification unavailable",
      "UnavailableMessage": "Identity verification isn't available right now. Please try again later."
    },
    "Identity": {
```

In `src/localization/resources/tr-TR.json`, replace

```json
      "FailedMessage": "Doğrulama sırasında bir sorun oluştu. Lütfen tekrar deneyin."
    },
    "Identity": {
```

with

```json
      "FailedMessage": "Doğrulama sırasında bir sorun oluştu. Lütfen tekrar deneyin.",
      "UnavailableTitle": "Doğrulama kullanılamıyor",
      "UnavailableMessage": "Kimlik doğrulama şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin."
    },
    "Identity": {
```

Run `npm run init` so `TranslationKey` sees the new keys.

In `src/screens/traveller/Profile/useVerifyAccount.ts`:
- In the `VERIFY_ACCOUNT_ACTION` docblock, replace the sentence starting `Naming the action rather than a workflow id is the point` with `Naming the action rather than a level is the point — \`resolveEvidenceLevel\` maps it through the backend's evidence-level requirements.`
- In the `VERIFICATION_ALERT_KEY` docblock, replace the paragraph starting `` `unavailable` borrows the Failed copy`` with:

```ts
 * `unavailable` means no Didit session could be started — no Didit account is
 * in service, or the action's evidence level could not be read — so it says
 * "try again later" rather than "something went wrong".
```

- Change `unavailable: "Failed",` to `unavailable: "Unavailable",`.

Run: `npx jest src/screens/traveller/Profile/__tests__/useVerifyAccount.router.test.ts`
Expected: PASS.

- [ ] **Step 4: Delete the workflow path**

```bash
git rm src/utils/didit/workflow.ts
```

In `src/actions/TravellerService/actions.ts`, delete `getDiditWorkflows` together with its docblock (the block starting `/**\n * Available Didit workflows keyed by evidence level`).

```bash
git grep -n "resolveWorkflowId\|getDiditWorkflows\|startVerificationWithWorkflow\|DEFAULT_WORKFLOW_ID\|didit/workflow" -- ':!src/saas'
```

Expected: no output. If a doc or rule file under `docs/` or `.claude/` names one of them, update that sentence to the backend-session flow.

- [ ] **Step 5: Run the gates**

```bash
npm run typecheck
npm test
npm run lint
```

Expected: typecheck and lint at the Task 4 baseline. Tests at the baseline plus the new and rewritten suites, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add -A src
git status --short
git commit -F - <<'EOF'
feat(didit): start the SDK from a backend-created session

runVerification now reads the action's evidence level, asks the backend for a
Didit session and starts the SDK with its token, instead of letting the SDK
create a session from a workflow id with a hardcoded fallback. The backend's
no-account-can-serve codes and an unknown level become unavailable, which
Verify Account now names in its own words; the workflow resolver goes.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: super-app — prove it on a CPad (with the user)

**Files:** none (verification only).

**Interfaces:**
- Consumes: Tasks 4–6. JS-only change: the installed `@didit-protocol/sdk-react-native` 4.7.3 already exports `startVerification`, so no native rebuild is needed.

- [ ] **Step 1: Check the device can take a JS change**

```bash
adb devices -l
adb -s <CPad serial> shell dumpsys package com.clomerce.unirefundsuperapp | grep "flags=\["
```

Expected: the bracket `flags=[` line contains `DEBUGGABLE`. If not, stop and ask the user for a debug build; do not run the build yourself.

- [ ] **Step 2: Ask the user how to serve the worktree**

Metro must serve `C:/unirefund/super-app-wt-didit`, not the main checkout, and the workspace forbids a second hand-started bundler. Ask the user to choose:
- (a) serve the worktree from their Metro session; it has a real `node_modules` from `npm ci`;
- (b) run this check after the branch is merged into a checkout their Metro already serves.

Then wait for the answer.

- [ ] **Step 3: One login verification**

On the CPad, open traveller login and start "Login with identity verification". This creates exactly one real Didit session.
- Confirm the Didit SDK opens (not the "isn't available right now" toast).
- Cancel out of it with the close button.
- Expect no toast on cancel.
- Confirm `adb -s <serial> logcat -s ReactNativeJS:V` shows the `Didit verification finished` debug line with `evidenceLevel` and `diditCredentialName`.

---

### Task 8: Finish both branches

**Files:** none new.

- [ ] **Step 1: Run every gate once more on both worktrees**

These are the Task 1 Step 9 commands in `web-app-wt-didit`, and `npm run typecheck && npm test && npm run lint` in `super-app-wt-didit`. Expected: at baseline, with the new tests passing.

- [ ] **Step 2: Whole-branch review**

Use superpowers:requesting-code-review on each branch against `origin/main`, with the spec and this plan's Review Focus as the brief. Fix what it confirms.

- [ ] **Step 3: Open the PRs**

Use superpowers:finishing-a-development-branch for each repo. Each PR body must say:
- **Do not merge until `POST /api/kyc-service/public-didit-sessions` is deployed to uat.** Re-check with `curl -s -A "Mozilla/5.0" https://uat-api.unirefund.com/swagger-json/KYC/swagger/v1/swagger.json | grep -c public-didit-sessions`; it must print `2`.
- **After merge, the user:** deletes the `NEXT_PUBLIC_DIDIT_API_KEY` secret from the dev / uat / prod GitHub Environments, removes the line from local `apps/ssr/.env` and `apps/web/.env`, and asks the backend team to rotate the Didit key that shipped to browsers (the doc's rollout step 3).
- super-app PR: the `src/saas/KYCService` change is byte-identical to the one on `feat/map-improvement`.

- [ ] **Step 4: Remove the worktrees once merged**

Run `git worktree remove C:/unirefund/web-app-wt-didit` and the same for `super-app-wt-didit`. Never `rm -rf` either directory.
