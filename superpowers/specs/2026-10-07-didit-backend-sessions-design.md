# Didit: start every verification from a backend-created session

**Goal.** No frontend holds a Didit API key or workflow ID. web-app and super-app ask the UniRefund backend for a Didit session and hand it to the Didit SDK. The backend picks the Didit account and fails over when one is out of credits.

**Source:** the user's doc [Didit: backend-created sessions — frontend migration](https://claude.ai/code/artifact/3adfc5b8-62c1-475d-9293-d62a27cd901c) (2026-09-29). This spec is the frontend design built on it; where the code disagreed with the doc, the code won and the difference is noted.

## Decisions (user, 2026-10-07)

1. **No fallback and no backward compatibility.** The old path is deleted, not kept alongside.
2. **Merge waits for the backend on uat.** `POST /api/kyc-service/public-didit-sessions` is live on dev but not on uat (checked 2026-10-07). Deploying either frontend to uat before the backend gets there breaks every Didit flow.
3. **Scope is web-app and super-app.** pos-app, rotating the leaked key and retiring `workflowId` from `didit-workflows` are separate work (the doc's rollout step 3).

## Why this is more than a refactor

`NEXT_PUBLIC_DIDIT_API_KEY` is inlined into the browser bundle of both web apps. The browser posts it to `/api/session`, which forwards whatever `api_key` and `workflow_id` it receives to Didit's `v3/session`. Anyone who reads the bundle can create Didit sessions on our account, through our own route or directly.

## The backend contract

Both endpoints are anonymous and already in both repos' generated `KYCService` clients (no regeneration).

| Call | Input | Output used |
| --- | --- | --- |
| `POST /api/kyc-service/public-didit-sessions` | `{ evidenceLevel: "Low" \| "Medium" \| "High" }` | `verificationUrl` (web), `sessionToken` (mobile) |
| `GET /api/kyc-service/public-didit-sessions/{id}` | — | Not used. No flow needs to poll. |

- **Tenant:** no `__tenant` header and no bearer token, so sessions come from the shared Didit accounts. That is the context today's `didit-workflows` call and every follow-up SSR action (`get-email`, `get-access-token`, `create-traveller`, `set-password`, `prove-document`) already run in, so a session is created and later read through the same accounts.
- **Errors** arrive as ABP's `{ error: { code } }`:

| `error.code` | The app shows |
| --- | --- |
| `UniRefund.KYCService:010022` (no account can serve) | "Identity verification isn't available right now. Please try again later." |
| `UniRefund.KYCService:010025` (Didit unreachable) | The same message |
| Anything else, or no code | The existing generic verification error |

- `vendorData` is not sent: no flow uses it today.

## Choosing the evidence level

Both apps keep using `GET /api/traveller-service/ssr-public-actions/evidence-level-requirements` to turn an SSR action into a level.

- The action's `minimumEvidenceLevel` is sent as is. `"None"` is sent as `"Low"`, the lowest level Didit serves.
- **No guessing.** If the requirements list failed to load, or does not name the action, the flow is *unavailable* and shows the message above. Today super-app silently falls back to a hardcoded workflow ID and web sends an empty one; both go.

## web-app

All five Didit screens live in `apps/ssr`. `apps/web` shows no Didit at all; it only carries the key, the proxy route and the config fetch.

**New server action** `postPublicDiditSessionApi({ evidenceLevel })` in `packages/actions/unirefund/KYCService/post-actions.ts`, following the POST pattern (`structuredResponse` / returned `structuredError`, which keeps `code`). It uses a new token-less `getPublicKYCServiceClient()` in `packages/actions/unirefund/lib.ts`, beside the existing `getPublicCRMServiceClient`. The doc's browser-side `fetch` is not used: app code reaches the backend only through `@repo/actions`.

**`DiditVerification`** (`packages/ui/src/unirefund/didit-verification/didit-verification.tsx`):
- Props drop `apiKey`, `workflowId`, `sessionEndpoint`, `sessionUrl` and `vendorData` (no caller passes the last three). It takes `action: SSRActionType`, plus `unavailableText` and `errorText`.
- On mount it resolves the level from `useDiditConfig()`, calls the server action once and starts the SDK with `verificationUrl`. The existing once-per-mount guard stays: every session it creates is real.
- A failure calls `onError` **once**, from the async path, with the localized message in `error.message`. Today it calls `onError` during render, so it fires on every re-render; `verify-view` carries a guard against exactly that.

**`DiditConfigProvider`** keeps only `evidenceLevelRequirements`, and replaces `getWorkflowForLevel` / `getWorkflowForAction` with `getLevelForAction(action)`. `apiKey` and `workflows` go.

**The ssr wrapper becomes the one entry point.** `apps/ssr/src/components/didit-verification/didit-verification.tsx` exists but nothing imports it. It now injects `loadingText`, `unavailableText` and `errorText` from `t.SSRService`, plus a default `declineText` (`Login.BackToLogin`) that a caller may override. The five call sites import it and pass `action` instead of `apiKey` + `workflowId`. That also fixes the four screens that render the component's hard-coded English "Loading verification..." and "Back" today.

| Screen | File | `action` |
| --- | --- | --- |
| Login (KYC) | `(auth)/login/kyc/didit.tsx` | `GetAccessToken` |
| Register | `(auth)/register/didit.tsx` | `CreateTraveller` |
| Reset password | `(auth)/reset-password/didit.tsx` | `SetPassword` |
| Validate | `(public)/validate/_components/didit-for-validate.tsx` | `GetAccessToken` |
| Profile verify / add document | `(main)/profile/verify/_components/verify-view.tsx` | `ProveDocument` |

`verify-view` keeps its own `declineText` (`Header.Back`) and its `diditFailed` state; only the render-time guard it needed becomes unnecessary.

**Deleted:**
- `packages/ui/.../didit-verification/handlers.ts`, and its export from `index.tsx`.
- `apps/ssr/src/app/api/session/route.ts` and `apps/web/src/app/api/session/route.ts`.
- `apps/ssr/src/providers/didit-config-loader.tsx` (unused).
- The `getDiditWorkflowsApi` call in the ssr root layout, and the action itself.
- In `apps/web`: `DiditConfigProvider` and both Didit fetches in `providers-data.ts`. They were the only requests in its `getApiRequests`, so that function and the `error` path it fed go too: two fewer backend calls before every staff page renders.
- `NEXT_PUBLIC_DIDIT_API_KEY` from `Dockerfile` (the `ARG`, the `ENV` and its comment), `.github/workflows/deploy.yml` (build arg and header comment), `docs/deployment.md`, `AGENTS.md` (deployment section: build-time values drop from three to two) and both `.env.example` files.

**Left alone:** the commented-out Didit block in `apps/web` `customs-filter.tsx`.

**New i18n keys** (`SSRService`, en + tr): `Verification.Unavailable` with the message above. The generic failure reuses `Verification.ErrorDescription`.

## super-app

**New action** `postPublicDiditSessionApi(evidenceLevel)` in `src/actions/KYCService/post.ts`. It uses a new `getPublicKYCServiceClient` built on the existing `createPublicServiceClient` in `src/actions/lib.ts`, and does **not** go through `fetchRequest`. That helper always sends `Authorization: Bearer <token>` and retries a 401 with a refresh, neither of which an anonymous call wants.

**`src/utils/didit/workflow.ts` → `src/utils/didit/level.ts`**, exporting `resolveEvidenceLevel(action): Promise<"Low" | "Medium" | "High" | null>`.
- Only the requirements list is fetched; `getDiditWorkflows` and its action wrapper go, as does `DEFAULT_WORKFLOW_ID`.
- The module-level cache keeps a successful load only. Today a failed load is cached as an empty list for the life of the process, which with no fallback would leave Didit unavailable until the app restarts.

**`useDiditVerify.runVerification(action)`:**
1. `resolveEvidenceLevel(action)`; `null` → `{ type: "unavailable" }`.
2. `postPublicDiditSessionApi(level)`. An `ApiError` whose body code is `010022` or `010025` → `{ type: "unavailable" }`. Any other error is thrown, as SDK rejections are today, so callers keep reporting their own message.
3. `startVerification(sessionToken, { languageCode, loggingEnabled: __DEV__, showCloseButton: true, showExitConfirmation: true })`. The RN SDK has no URL entry point; `startVerification(token, config)` is its token one, and returns the same result shape, so `reduceResult` is unchanged.

The debug log swaps `workflowId` for the level and `diditCredentialName`, which is what support needs to find the account.

`verify()` already toasts `MobileApp.Auth.Verification.NotAvailable` for `unavailable`. **Profile's Verify Account** (`useVerifyAccount.ts`) maps `unavailable` to the Failed alert because the state was unreachable; its comment asks for its own copy if the fallback goes. It gets `MobileApp.Profile.Verification.UnavailableTitle` / `UnavailableMessage` (en-US + tr-TR).

Every consumer of the approved `sessionId` (`getTravellerEmail`, `signInWithDidit`, `postCreateTraveller`, `postSetPassword`, `postProveDocumentApi`) is unchanged.

## Testing

**super-app** (jest is the gate):
- `useDiditVerify.router.test.ts` rewritten against `startVerification` and the new action: approved, declined, pending, cancelled, failed; unknown level → unavailable; `010022` and `010025` → unavailable; another API error rethrown; the token passed is `sessionToken`.
- New `level.test.ts`: exact level, `None` → `Low`, action missing → `null`, failed load → `null` **and retried on the next call**.
- New test for `postPublicDiditSessionApi`: sends the level, no `Authorization` header, no `__tenant`.
- `useVerifyAccount` test: `unavailable` → the new alert keys.
- Gates: `npm run typecheck`, `npm test`, `npm run lint` against their re-measured baselines.

**web-app** has no component test runner. Gates are `pnpm --filter ssr type-check` / `lint`, `pnpm --filter web type-check` / `lint`, `pnpm --filter web test:unit`, `pnpm policy:audit` and `pnpm i18n:missing`, plus a grep proving `NEXT_PUBLIC_DIDIT_API_KEY`, `/api/session`, `workflowId` and `getDiditWorkflows` are gone from both repos' sources.

**Live proof on dev**, one verification per app (each creates a real Didit session, so no more than one): ssr `/en/login/kyc` and super-app login on a CPad. Confirm in the network log that `public-didit-sessions` is called and that no request carries an API key.

## Branches

Both repos' checkouts are on `feat/map-improvement`, which is another session's work. Each repo gets `feat/didit-backend-sessions` from `origin/main`, in a worktree outside the repo.
