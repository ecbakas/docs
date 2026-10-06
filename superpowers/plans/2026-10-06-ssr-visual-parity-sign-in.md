# ssr visual parity 4c: sign-in — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `(auth)` page in `web-app/apps/ssr` (login, Didit login, register, reset password, logout) sits in super-app's `Auth` frame — a red canopy over a rising white card — with the app's login, register and reset forms.

**Architecture:**
- Pages render a shared client `AuthFrame({ title, description, children })`. Each screen has its own canopy title. The `(auth)` layout only paints `bg-primary`.
- The forms are plain controlled React forms on a shared `AuthField` and `PasswordToggle`. They copy the app's `Input` and `PasswordToggle`.
- Three pure modules carry the rules, with `node:test` tests:
  - the post-login target;
  - the password checks;
  - the register phone payload.
- The old auth layout loses the light rays, the server-health badge, the `CountrySelector` and the `@ayasofyazilim/kyc` stylesheet. The package itself and its three dead `kyc.tsx` users are removed.

**Tech Stack:** Next.js 16.2 App Router (webpack), React 19 with the React Compiler lint rules, Tailwind v4, the UI kit (`@repo/ayasofyazilim-ui`), `node:test` via `tsx`.

**Spec:** `C:\unirefund\docs\superpowers\specs\2026-10-06-ssr-visual-parity-explore-notifications-sign-in-design.md`, **Section 3**. Also: Decisions 4–5, Approach, Grants, Ported logic, Strings, Verification and Delivery.

**Reference (super-app):**
- `src/templates/Auth.tsx`;
- `src/screens/traveller/TravellerLoginScreen.tsx`;
- `src/screens/traveller/DiditScreen.tsx`;
- `src/screens/shared/ResetPasswordScreen.tsx`;
- `src/components/rnr/Input.tsx`;
- `src/components/PasswordToggle.tsx`;
- the language pill in `src/screens/shared/RoleGateScreen.tsx:134-151`;
- `src/components/brand/marks.ts` (`UNIREFUND_MARK`).

**Worktree and branch:**
- Worktree: `C:\unirefund\web-app-wt-visual-parity-profile`.
- New branch: `feat/ssr-visual-parity-sign-in`, cut from `feat/ssr-visual-parity-notifications` (head `3279d29a0`, PR #317).
- PR target: `feat/ssr-visual-parity-notifications`.
- `S/` means `apps/ssr/src`; `A/` means `apps/ssr/src/app/[lang]/(auth)`.

## Global Constraints

**The frame (spec Section 3)**
- **Canopy:** a full-screen `bg-primary` canopy. It holds:
  - a round `size-10` back button to `/{lang}`;
  - the white Unirefund mark;
  - the screen's title (display size) and description (`text-primary-foreground/80`);
  - on the right, a language chip with the app's translucent flag pill (`bg-card/20 rounded-full px-3 py-2`).
- **Card:** a white card (`rounded-t-md bg-card`) rises 20 px over the canopy and runs to the bottom of the viewport. Its content scrolls inside it with `px-5`.
- **Wide screens:** the canopy stays full width. The column (the canopy text and the card) is centred at `max-w-md`.
- **The island** stays hidden on `(auth)`.

**Removed**
- The grey page, the WebGL light rays and the server-health badge. **Their components stay in the codebase.**
- The `@ayasofyazilim/kyc/styles.css` import, the dead `kyc.tsx` files in `login/kyc`, `register` and `reset-password`, and the `@ayasofyazilim/kyc` dependency.

**Login**
- **Copy:** the canopy uses the app's traveller title and description.
- **Fields:**
  - "Email or username", with a mail icon;
  - "Password", with a lock icon and a show/hide toggle.

  Both have a label above and a bordered `h-12` box with the icon inside.
- **Links and buttons:**
  - a right-aligned "Forgot your password?" link to `/{lang}/reset-password`;
  - **Log In**, full width;
  - an outline "Continue with identity verification" button with a fingerprint icon, to `/{lang}/login/kyc`, with the app's caption under it;
  - a footer above a rule: "Don't have an account? **Create an account**", to `/{lang}/register`.
- **Submit** stays disabled until both fields are filled.
- **Errors:** the server's error shows under the password field, not as a toast. `?error=` still toasts the invalid-token message.
- **Fixed:** the relative `reset-password` and `register` links, and the default redirect (today `/{lang}//`). The target becomes `redirectTo` when present, otherwise `/{lang}`.
- **Test ids are kept:** `login-form`, `userName-input`, `password-input`, `password-link`, `submit-button`, `kyc-login-button`, `signup-link`.

**Didit steps**
- They sit inside the card.
- The declined, pending, error and logging-in panels fit inside the card instead of using `min-h-screen`.
- **Every widget mount creates a real Didit session, so nothing may remount the widget before navigating away.**

**Register**
- **Fields:**
  - "Email", prefilled;
  - "Password", with a toggle and a 6-character minimum;
  - "Phone", optional.
- No phone-type select. The phone is sent as `MOBILE`.
- **Sign Up** submits to `postCreateTravellerActionApi`. On success, it signs in through `loginViaSSRAction` and lands on `returnTo`, otherwise on `/{lang}`.
- Errors show inline.

**Reset**
- The email shows in a chip (`rounded-md bg-foreground/5 p-4`, person icon).
- "New password" and "Confirm new password" share one toggle.
- Fewer than 6 characters shows "too short" under the first field. A mismatch shows under the second.
- On success: a toast, then `/{lang}/login?email=…`. Errors show inline.

**Logout:** today's spinner, inside the same frame.

**Sheets** are page width: `className="mx-auto w-full max-w-3xl md:border-x"`. Without a description, add `aria-describedby={undefined}`.

**Strings**
- Flat `SSRService` keys in `S/language-data/unirefund/SSRService/resources/{en,tr}.json`, with values from super-app's `en-US.json` and `tr-TR.json`.
- Edit them with the Edit tool and never re-serialise the file. Then run `pnpm --filter ssr run init`.
- Unused keys are listed in the PR, not removed.

**Lint and code style**
- apps/ssr's ESLint treats the React Compiler rules as **errors**: `react-hooks/set-state-in-effect`, and purity (no `Date.now()` during render). Never add an eslint-disable for them. Derive state during render, and call `setState` only in event handlers or callbacks.
- Comments are rare.

**Grants:** nothing in this sub-project calls a gated endpoint, because the sign-in endpoints are public.

**Shared checkout rules**
- Never run `git reset --hard`, `git stash`, `git checkout --`, `git add -A` or `git add .`. Stage files by path.
- Never push.
- Never commit `.env`, `*.gen.json` or submodule pointers.
- Never modify `packages/utils` or `packages/ayasofyazilim-ui`; they are submodules.

**Servers**
- Never touch the user's dev server on :3001.
- A smoke server runs detached on PORT 3005.
- Stop only `node.exe` processes whose command line contains `web-app-wt-visual-parity-profile`, and never while a build from this worktree is running.
- Never run `next build` in a task.

**Commits** end with exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Use a quoted heredoc: `git commit -F - <<'EOF'`.

**Gates for every task**, from the worktree root:
- `pnpm --filter ssr test:unit` (baseline 395/395 at `3279d29a0`);
- `pnpm --filter ssr type-check` (0);
- `pnpm --filter ssr lint` (0 errors, baseline 459 warnings);
- `pnpm --filter web type-check` (0).

## Plan decisions

These are rulings on points the spec leaves open, or where its literal text conflicts with its goal.

1. **The mark is the app's single-contour "U", not `@repo/ui/logo`.**
   - The spec names `@repo/ui/logo`, but its icon is the older two-path mark with a detached tick. The app replaced that in `marks.ts`; see memory `superapp-official-mark-vs-stale-logo`.
   - Parity is the spec's goal, so `BrandMark` inlines `UNIREFUND_MARK` (one 386-character path).
2. **The frame is a component that pages render, not the layout.**
   - Every screen has its own canopy title, and a layout cannot read its page's strings.
   - `A/layout.tsx` only paints `min-h-dvh bg-primary`, so a slow page never flashes white.
   - The three `loading.tsx` files render `AuthFrameLoading`, which is the frame with a spinner.
3. **The language chip copies the app's flags and its pill.**
   - The flags are the app's circle-flag images (`react-native-circle-flags`, MIT), copied to `apps/ssr/public/flags/`, with its licence.
   - `/flags` is added to the proxy matcher's exclusions. Without that, the locale step rewrites `/flags/en.webp` to `/en/flags/en.webp`. `docext` and `maplibre` were excluded for the same reason.
   - The chip opens a page-width sheet listing English and Türkçe, in their own names, as the app does. Picking one calls the existing `changeLocale`, which reloads the page in the new locale.
4. **Only same-site `redirectTo` targets are honoured.** A target counts as same-site when it starts with `/`, but not `//` or `/\`. Anything else, including a malformed escape, goes to `/{lang}`.
   - The proxy encodes the parameter twice: `?redirectTo=%252Fen%252Fprofile`. `useSearchParams` removes one layer, and `loginRedirectTarget` decodes once more.
5. **Canopy titles per page:**
   - **`/login`:** `Auth.Traveller.Title` and `Auth.Traveller.Description`.
   - **`/login/kyc`:** `Auth.Traveller.Title` and `Auth.Traveller.Info`.
   - **`/register`** (Didit step, form and failure): `Auth.Register.Title` and `Auth.Register.Description`.
   - **`/reset-password`:** `Auth.Reset.Title` and `Auth.Reset.Description`.
   - **`/logout`:** `Logout.Title` and `Logout.Description`.
6. **Register's too-short message** reuses `Auth.Reset.TooShort` ("Password must be at least 6 characters."), so both forms say the same thing.
7. **`S/components/auth/login-form.tsx` is deleted,** because the new form replaces it. Its siblings (the email-token forms and `schema.ts`) stay, as spec "Out of scope" says.
8. **The Didit login keeps landing on `/{lang}/`.** Its flow is unchanged apart from its panels.
9. **The password toggle switches its accessible name** ("Show password" / "Hide password"), as the app's does. It has no `aria-pressed`.

## Review Focus

These are the inputs most likely to bite a traveller, with where each is pinned:

1. **An off-site or malformed `redirectTo`** (`https://…`, `//host`, `/\host`, a broken `%` escape, no leading slash) must land on `/{lang}`, never off-site. Task 1 tests.
2. **A twice-encoded `redirectTo` from the proxy** (`%2Fen%2Fprofile` after `useSearchParams`) must land on `/en/profile`. Task 1 test.
3. **Wrong credentials** must show the message under the password field, keep both values and re-enable Log In, with no toast. Task 5 code; Task 7 manual pass.
4. **Opening and closing the language sheet, or any re-render of the frame, must not remount the Didit widget.**
   - The frame's tree is fixed, and the sheet's state lives inside `LanguageChip`. That is the Task 3 code.
   - The Task 7 manual pass checks for exactly one Didit session request per page visit.
5. **A reset password of 5 characters, or two that don't match,** must show the message under the right field and send no request. Task 1 tests; Task 6 wiring.

(Also pinned in Task 1: register with the phone left empty sends no `telephone`.)

---

### Task 0 (controller): branch and baselines

- [ ] `git -C C:\unirefund\web-app-wt-visual-parity-profile switch -c feat/ssr-visual-parity-sign-in` from `feat/ssr-visual-parity-notifications` at `3279d29a0`.
- [ ] Re-measure the four gates and record them in the ledger.

---

### Task 1: The post-login target, password and phone rules (web-app)

**Files:**
- Create: `S/utils/auth/login-redirect.ts`, `S/utils/auth/login-redirect.test.ts`.
- Create: `S/utils/auth/password-rules.ts`, `S/utils/auth/password-rules.test.ts`.
- Create: `S/utils/auth/register-payload.ts`, `S/utils/auth/register-payload.test.ts`.

**Interfaces:**
- Produces:
  - `loginRedirectTarget(raw: string | null | undefined, lang: string): string`;
  - `MIN_PASSWORD_LENGTH = 6`;
  - `isPasswordTooShort(password: string): boolean`;
  - `resetPasswordError(newPassword: string, confirmPassword: string): PasswordRuleError | null`, where `PasswordRuleError = { field: "new" | "confirm"; reason: "tooShort" | "mismatch" }`;
  - `registerTelephone(phone: { countryCallingCode?: string; nationalNumber?: string } | null | undefined): RegisterTelephone | undefined`, where `RegisterTelephone = { ituCountryCode: string; areaCode: string; localNumber: string; type: "MOBILE" }`.

- [ ] **Step 1: Write the failing tests.**

`S/utils/auth/login-redirect.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loginRedirectTarget } from "./login-redirect";

describe("loginRedirectTarget", () => {
  it("falls back to the locale home without a target", () => {
    assert.equal(loginRedirectTarget(null, "en"), "/en");
    assert.equal(loginRedirectTarget(undefined, "tr"), "/tr");
    assert.equal(loginRedirectTarget("", "en"), "/en");
  });

  it("keeps a same-site path", () => {
    assert.equal(loginRedirectTarget("/en/profile", "en"), "/en/profile");
  });

  it("decodes the proxy's second encoding layer", () => {
    assert.equal(loginRedirectTarget("%2Fen%2Fprofile", "en"), "/en/profile");
  });

  it("keeps a query string", () => {
    assert.equal(
      loginRedirectTarget("/en/tags?status=open", "en"),
      "/en/tags?status=open"
    );
  });

  it("refuses an absolute URL", () => {
    assert.equal(loginRedirectTarget("https://evil.example/x", "en"), "/en");
  });

  it("refuses a protocol-relative URL, encoded or not", () => {
    assert.equal(loginRedirectTarget("//evil.example", "en"), "/en");
    assert.equal(loginRedirectTarget("%2F%2Fevil.example", "en"), "/en");
  });

  it("refuses a backslash host", () => {
    assert.equal(loginRedirectTarget("/\\evil.example", "en"), "/en");
  });

  it("refuses a malformed escape", () => {
    assert.equal(loginRedirectTarget("%E0%A4%A", "en"), "/en");
  });

  it("refuses a path without a leading slash", () => {
    assert.equal(loginRedirectTarget("en/profile", "en"), "/en");
  });
});
```

`S/utils/auth/password-rules.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPasswordTooShort,
  MIN_PASSWORD_LENGTH,
  resetPasswordError,
} from "./password-rules";

describe("isPasswordTooShort", () => {
  it("uses a 6-character minimum", () => {
    assert.equal(MIN_PASSWORD_LENGTH, 6);
    assert.equal(isPasswordTooShort(""), true);
    assert.equal(isPasswordTooShort("12345"), true);
    assert.equal(isPasswordTooShort("123456"), false);
  });
});

describe("resetPasswordError", () => {
  it("flags a short first password under the first field", () => {
    assert.deepEqual(resetPasswordError("12345", "12345"), {
      field: "new",
      reason: "tooShort",
    });
  });

  it("reports too short before a mismatch", () => {
    assert.deepEqual(resetPasswordError("123", "456"), {
      field: "new",
      reason: "tooShort",
    });
  });

  it("flags a mismatch under the second field", () => {
    assert.deepEqual(resetPasswordError("123456", "123457"), {
      field: "confirm",
      reason: "mismatch",
    });
  });

  it("does not trim before comparing", () => {
    assert.deepEqual(resetPasswordError("Secret1 ", "Secret1"), {
      field: "confirm",
      reason: "mismatch",
    });
  });

  it("passes two matching passwords of 6 or more", () => {
    assert.equal(resetPasswordError("123456", "123456"), null);
  });
});
```

`S/utils/auth/register-payload.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerTelephone } from "./register-payload";

describe("registerTelephone", () => {
  it("sends nothing without a phone", () => {
    assert.equal(registerTelephone(undefined), undefined);
    assert.equal(registerTelephone(null), undefined);
  });

  it("sends nothing without a national number", () => {
    assert.equal(
      registerTelephone({ countryCallingCode: "90", nationalNumber: "" }),
      undefined
    );
  });

  it("sends the number as MOBILE with its calling code", () => {
    assert.deepEqual(
      registerTelephone({
        countryCallingCode: "90",
        nationalNumber: "5321234567",
      }),
      {
        ituCountryCode: "+90",
        areaCode: "",
        localNumber: "5321234567",
        type: "MOBILE",
      }
    );
  });

  it("leaves the calling code empty when it is unknown", () => {
    assert.deepEqual(registerTelephone({ nationalNumber: "5321234567" }), {
      ituCountryCode: "",
      areaCode: "",
      localNumber: "5321234567",
      type: "MOBILE",
    });
  });
});
```

- [ ] **Step 2: Run them and watch them fail.** `pnpm --filter ssr test:unit` reports `Cannot find module` for the three new modules.

- [ ] **Step 3: Implement.**

`S/utils/auth/login-redirect.ts`:

```ts
export function loginRedirectTarget(
  raw: string | null | undefined,
  lang: string
): string {
  const fallback = `/${lang}`;
  if (!raw) return fallback;
  let target: string;
  try {
    target = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  const sameSite =
    target.startsWith("/") &&
    !target.startsWith("//") &&
    !target.startsWith("/\\");
  return sameSite ? target : fallback;
}
```

`S/utils/auth/password-rules.ts`:

```ts
export const MIN_PASSWORD_LENGTH = 6;

export type PasswordRuleError = {
  field: "new" | "confirm";
  reason: "tooShort" | "mismatch";
};

export function isPasswordTooShort(password: string): boolean {
  return password.length < MIN_PASSWORD_LENGTH;
}

export function resetPasswordError(
  newPassword: string,
  confirmPassword: string
): PasswordRuleError | null {
  if (isPasswordTooShort(newPassword)) {
    return { field: "new", reason: "tooShort" };
  }
  if (newPassword !== confirmPassword) {
    return { field: "confirm", reason: "mismatch" };
  }
  return null;
}
```

`S/utils/auth/register-payload.ts`:

```ts
export type RegisterTelephone = {
  ituCountryCode: string;
  areaCode: string;
  localNumber: string;
  type: "MOBILE";
};

export function registerTelephone(
  phone:
    | { countryCallingCode?: string; nationalNumber?: string }
    | null
    | undefined
): RegisterTelephone | undefined {
  if (!phone?.nationalNumber) return undefined;
  return {
    ituCountryCode: phone.countryCallingCode
      ? `+${phone.countryCallingCode}`
      : "",
    areaCode: "",
    localNumber: phone.nationalNumber,
    type: "MOBILE",
  };
}
```

- [ ] **Step 4: Run the gates.** `test:unit` should report 395 + 19 = **414/414**. There are 9 + 6 + 4 = 19 `it` blocks; count the `it(` calls if your total differs, and report the exact figure. type-check should give 0, lint 0 errors, and web type-check 0.

- [ ] **Step 5: Commit.**

```bash
git add apps/ssr/src/utils/auth/login-redirect.ts apps/ssr/src/utils/auth/login-redirect.test.ts apps/ssr/src/utils/auth/password-rules.ts apps/ssr/src/utils/auth/password-rules.test.ts apps/ssr/src/utils/auth/register-payload.ts apps/ssr/src/utils/auth/register-payload.test.ts
git commit -F - <<'EOF'
feat(ssr): add the sign-in redirect, password and phone rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Strings, icons and flags (web-app)

**Files:**
- Modify: `S/language-data/unirefund/SSRService/resources/en.json` and `tr.json`.
- Modify: `apps/ssr/scripts/gen-ionicons.mjs`, then regenerate `S/components/shell/ionicons.tsx`.
- Create: `apps/ssr/public/flags/en.webp`, `apps/ssr/public/flags/tr.webp` and `apps/ssr/public/flags/LICENSE.txt`.
- Modify: `S/proxy.ts`, the matcher only.

**Interfaces:**
- Produces:
  - the 27 keys below;
  - the icons `IoEyeOutline`, `IoEyeOffOutline`, `IoFingerPrintOutline` and `IoPersonCircleOutline`;
  - `/flags/en.webp` and `/flags/tr.webp`, served without the proxy.

- [ ] **Step 1: Strings.**
  - Insert these 27 lines directly after the `"Auth.userNameOrEmail.required"` line in each file, using the Edit tool.
  - Keep the files' two-space indentation and the trailing commas.

`en.json`:

```json
  "Auth.Traveller.Title": "Traveller Login",
  "Auth.Traveller.Description": "Sign in to collect your tax-free refunds and track your tags.",
  "Auth.Traveller.EmailOrUsername": "Email or username",
  "Auth.Traveller.Continue": "Continue with identity verification",
  "Auth.Traveller.Info": "New here? Verify your identity to get started — no password needed.",
  "Auth.Traveller.CreateAccount": "Create an account",
  "Auth.Traveller.Error": "Something went wrong while signing in. Please try again.",
  "Auth.Login.Submit": "Log In",
  "Auth.ShowPassword": "Show password",
  "Auth.HidePassword": "Hide password",
  "Auth.Register.Title": "Create an Account",
  "Auth.Register.Description": "Create an account to benefit from all the features of the app.",
  "Auth.Register.Email": "Email",
  "Auth.Register.Password": "Password",
  "Auth.Register.Phone": "Phone number (optional)",
  "Auth.Register.Submit": "Sign Up",
  "Auth.Register.Success": "Your account was created successfully.",
  "Auth.Register.Error": "Something went wrong while creating your account. Please try again.",
  "Auth.Reset.Title": "Reset Password",
  "Auth.Reset.Description": "Verify your identity, then choose a new password.",
  "Auth.Reset.NewPassword": "New password",
  "Auth.Reset.ConfirmPassword": "Confirm new password",
  "Auth.Reset.TooShort": "Password must be at least 6 characters.",
  "Auth.Reset.Mismatch": "Passwords do not match.",
  "Auth.Reset.Submit": "Set new password",
  "Auth.Reset.Success": "Your password has been updated. Please log in.",
  "Auth.Reset.Error": "Could not update your password. Please try again.",
```

`tr.json`:

```json
  "Auth.Traveller.Title": "Yolcu Girişi",
  "Auth.Traveller.Description": "Tax-Free iadelerinizi toplamak ve etiketlerinizi takip etmek için giriş yapın.",
  "Auth.Traveller.EmailOrUsername": "E-posta veya kullanıcı adı",
  "Auth.Traveller.Continue": "Kimlik doğrulama ile devam et",
  "Auth.Traveller.Info": "Yeni misiniz? Başlamak için kimliğinizi doğrulayın — şifre gerekmez.",
  "Auth.Traveller.CreateAccount": "Hesap oluştur",
  "Auth.Traveller.Error": "Giriş yapılırken bir hata oluştu. Lütfen tekrar deneyin.",
  "Auth.Login.Submit": "Giriş Yap",
  "Auth.ShowPassword": "Şifreyi göster",
  "Auth.HidePassword": "Şifreyi gizle",
  "Auth.Register.Title": "Hesap Oluştur",
  "Auth.Register.Description": "Hesap oluşturarak uygulamanın tüm özelliklerinden faydalanabilirsiniz.",
  "Auth.Register.Email": "E-posta",
  "Auth.Register.Password": "Şifre",
  "Auth.Register.Phone": "Telefon numarası (isteğe bağlı)",
  "Auth.Register.Submit": "Kayıt Ol",
  "Auth.Register.Success": "Hesabınız başarıyla oluşturuldu.",
  "Auth.Register.Error": "Hesabınız oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.",
  "Auth.Reset.Title": "Şifre Sıfırla",
  "Auth.Reset.Description": "Kimliğinizi doğrulayın, ardından yeni bir şifre belirleyin.",
  "Auth.Reset.NewPassword": "Yeni şifre",
  "Auth.Reset.ConfirmPassword": "Yeni şifreyi onayla",
  "Auth.Reset.TooShort": "Şifre en az 6 karakter olmalıdır.",
  "Auth.Reset.Mismatch": "Şifreler eşleşmiyor.",
  "Auth.Reset.Submit": "Yeni şifreyi belirle",
  "Auth.Reset.Success": "Şifreniz güncellendi. Lütfen giriş yapın.",
  "Auth.Reset.Error": "Şifreniz güncellenemedi. Lütfen tekrar deneyin.",
```

Then run `pnpm --filter ssr run init`.

**Check the result:**
- `grep -c '^  "' en.json tr.json` gives **903** for each, up from 876.
- `node -e` key parity: the en and tr key sets are equal.
- No duplicate keys in either file.

- [ ] **Step 2: Icons.**
  - In `apps/ssr/scripts/gen-ionicons.mjs`, append `"eye-outline", "eye-off-outline", "finger-print-outline", "person-circle-outline",` after `"arrow-down-circle-outline",` in `NAMES`.
  - Run `node apps/ssr/scripts/gen-ionicons.mjs`. It fetches from unpkg, so it needs network.
  - **Check the result:**
    - `grep -c "^export function Io" S/components/shell/ionicons.tsx` gives **71**, up from 67;
    - the four new exports exist;
    - `git diff --stat` on `ionicons.tsx` shows only additions.

- [ ] **Step 3: Flags.** Copy the app's circle flags at their largest density:

```bash
mkdir -p apps/ssr/public/flags
cp /c/unirefund/super-app/node_modules/react-native-circle-flags/lib/module/language/en-flag/en@3x.webp apps/ssr/public/flags/en.webp
cp /c/unirefund/super-app/node_modules/react-native-circle-flags/lib/module/language/tr-flag/tr@3x.webp apps/ssr/public/flags/tr.webp
cp /c/unirefund/super-app/node_modules/react-native-circle-flags/LICENSE apps/ssr/public/flags/LICENSE.txt
```

  - Both images are under 4 KB.
  - If a source path is missing, report NEEDS_CONTEXT. Do not substitute other images.

- [ ] **Step 4: Proxy.** In `S/proxy.ts`, change the matcher string to:

```ts
    "/((?!api|_next/static|_next/image|favicon.ico|docext|maplibre|flags).*)",
```

- [ ] **Step 5: Gates**, plus a check that the flags are served:
  - Start the smoke server detached on PORT 3005:

    `Start-Process cmd.exe '/c','set PORT=3005&& pnpm run dev > %TEMP%\ssr-4c-smoke.log 2>&1' -WorkingDirectory C:\unirefund\web-app-wt-visual-parity-profile\apps\ssr -WindowStyle Hidden`, with the log at `$env:TEMP\ssr-4c-smoke.log`

  - `curl -s -o /dev/null -w "%{http_code} %{content_type}" http://localhost:3005/flags/en.webp` must print `200 image/webp`.
  - Stop only this worktree's `node.exe` processes.

- [ ] **Step 6: Commit.**

```bash
git add apps/ssr/src/language-data/unirefund/SSRService/resources/en.json apps/ssr/src/language-data/unirefund/SSRService/resources/tr.json apps/ssr/scripts/gen-ionicons.mjs apps/ssr/src/components/shell/ionicons.tsx apps/ssr/public/flags/en.webp apps/ssr/public/flags/tr.webp apps/ssr/public/flags/LICENSE.txt apps/ssr/src/proxy.ts
git commit -F - <<'EOF'
feat(ssr): add the sign-in strings, icons and language flags

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: The frame (web-app)

**Files:**
- Create in `S/components/auth-frame/`: `brand-mark.tsx`, `password-toggle.tsx`, `auth-field.tsx`, `language-chip.tsx`, `auth-frame.tsx`.
- Rewrite: `A/layout.tsx`, `A/login/loading.tsx`, `A/register/loading.tsx`, `A/reset-password/loading.tsx`, `A/logout/page.tsx`.

**Interfaces:**
- Consumes:
  - from Task 2: `IoEyeOutline`, `IoEyeOffOutline`, the existing `IoArrowBack`, `IoChevronDown` and `IoCheckmark`, `/flags/{en,tr}.webp`, and the keys `Auth.ShowPassword` and `Auth.HidePassword`;
  - existing keys: `Header.Back`, `ChangeLocale`, `Loading`, `Logout.Title` and `Logout.Description`.
- Produces:
  - `BrandMark({ className })`;
  - `PasswordToggle({ visible, onToggle, disabled?, testId? })`;
  - `AuthField(props)`: input props plus `id`, `label`, `icon`, `error?: string | boolean | null` and `trailing?: ReactNode`;
  - `LanguageChip()`;
  - `AuthFrame({ title?, description?, children })`;
  - `AuthFrameLoading()`.

- [ ] **Step 1: `brand-mark.tsx`.** This is the app's `UNIREFUND_MARK` (plan decision 1).

```tsx
const MARK_PATH =
  "M13.6754 91.0936L63.6754 74.4096C76.6261 70.0883 90 79.7377 90 93.403V245.813C90 295.57 130.294 335.906 180 335.906C229.706 335.906 270 295.57 270 245.813V36.1633C270 27.4717 275.602 19.773 283.866 17.1073L333.866 0.979444C346.779 -3.18575 360 6.45445 360 20.0354V245.813C360 345.064 279.411 426 180 426C80.5887 426 0 345.327 0 245.813V110.087C0 101.469 5.50859 93.8187 13.6754 91.0936Z";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      height={34}
      viewBox="0 0 360 426"
      width={29}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={MARK_PATH} />
    </svg>
  );
}
```

- [ ] **Step 2: `password-toggle.tsx`.**

```tsx
"use client";
import { IoEyeOffOutline, IoEyeOutline } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";

export function PasswordToggle({
  visible,
  onToggle,
  disabled,
  testId,
}: {
  visible: boolean;
  onToggle: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  const { t } = useTranslations();
  return (
    <button
      aria-label={
        visible ? t.SSRService["Auth.HidePassword"] : t.SSRService["Auth.ShowPassword"]
      }
      className="mr-2 flex size-9 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-50"
      data-testid={testId}
      disabled={disabled}
      onClick={onToggle}
      type="button"
    >
      {visible ? <IoEyeOffOutline size={24} /> : <IoEyeOutline size={24} />}
    </button>
  );
}
```

- [ ] **Step 3: `auth-field.tsx`.** This is the app's `Input` (`size="lg"`): a label above, then a bordered box with the icon inside. The border turns red when the field has an error, and primary while it has focus.

```tsx
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import type { ComponentProps, ComponentType, ReactNode } from "react";

type FieldIcon = ComponentType<{ size?: number; className?: string }>;

export function AuthField({
  id,
  label,
  icon: Icon,
  error,
  trailing,
  className,
  disabled,
  ...input
}: Omit<ComponentProps<"input">, "id"> & {
  id: string;
  label: string;
  icon: FieldIcon;
  error?: string | boolean | null;
  trailing?: ReactNode;
}) {
  const message = typeof error === "string" && error ? error : null;
  return (
    <div className={cn("mb-3", className)}>
      <Label className="mb-1.5 block" htmlFor={id}>
        {label}
      </Label>
      <div
        className={cn(
          "flex h-12 items-center rounded-md border bg-card",
          error ? "border-error" : "border-input focus-within:border-primary",
          disabled && "bg-foreground/5"
        )}
      >
        <Icon
          className={cn("ml-3 shrink-0", error ? "text-error" : "text-muted-foreground")}
          size={20}
        />
        <input
          aria-describedby={message ? `${id}-error` : undefined}
          aria-invalid={error ? true : undefined}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-base text-foreground outline-none placeholder:text-muted-foreground disabled:text-muted-foreground"
          disabled={disabled}
          id={id}
          {...input}
        />
        {trailing}
      </div>
      {message ? (
        <p
          className="mt-1.5 text-sm font-medium text-error"
          id={`${id}-error`}
          role="alert"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: `language-chip.tsx`.** The pill copies `RoleGateScreen.tsx:134-151`: a 22 px round flag and a 14 px chevron. Its page-width sheet lists the two locales in their own names.
  - **The sheet's open state must live here and nowhere else.** The frame around a Didit widget must never re-render into a different tree when this opens (Review Focus 4).

```tsx
"use client";
import { IoCheckmark, IoChevronDown } from "@/src/components/shell/ionicons";
import { i18n, isLocale, type Locale } from "@/src/language-data/i18n-config";
import { useTranslations } from "@/src/providers/i18n";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@repo/ayasofyazilim-ui/components/drawer";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useState } from "react";

const LANGUAGE_NAMES: Record<Locale, string> = { en: "English", tr: "Türkçe" };

export function LanguageChip() {
  const { t, changeLocale } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  const [open, setOpen] = useState(false);
  const active: Locale = isLocale(lang) ? lang : "en";

  function choose(code: Locale) {
    setOpen(false);
    if (code !== active) changeLocale?.(code);
  }

  return (
    <>
      <button
        aria-label={t.SSRService.ChangeLocale}
        className="flex items-center rounded-full bg-card/20 px-3 py-2"
        data-testid="auth-language-chip"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Image
          alt=""
          className="size-[22px] rounded-full"
          height={22}
          src={`/flags/${active}.webp`}
          unoptimized
          width={22}
        />
        <IoChevronDown className="ml-1 text-primary-foreground" size={14} />
      </button>
      <Drawer onOpenChange={setOpen} open={open}>
        <DrawerContent
          aria-describedby={undefined}
          className="mx-auto w-full max-w-3xl md:border-x"
          data-testid="auth-language-sheet"
        >
          <DrawerTitle className="px-4 pt-4 pb-2 text-xl font-bold text-foreground">
            {t.SSRService.ChangeLocale}
          </DrawerTitle>
          <div className="px-4 pb-6">
            {i18n.locales.map((code) => (
              <button
                aria-current={code === active ? "true" : undefined}
                className="flex w-full items-center gap-3 rounded-md px-2 py-3 text-left hover:bg-foreground/5"
                data-testid={`auth-language-${code}`}
                key={code}
                onClick={() => choose(code)}
                type="button"
              >
                <Image
                  alt=""
                  className="size-8 rounded-full"
                  height={32}
                  src={`/flags/${code}.webp`}
                  unoptimized
                  width={32}
                />
                <span className="flex-1 text-base font-medium text-foreground">
                  {LANGUAGE_NAMES[code]}
                </span>
                {code === active ? (
                  <IoCheckmark className="text-primary" size={22} />
                ) : null}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
```

- [ ] **Step 5: `auth-frame.tsx`.** This is the app's `Auth` template:
  - canopy padding `pt-3` (12 px) and `pb-10`, which is the 20 px card overlap plus 20 px;
  - the mark at `mt-5`;
  - the title at `mt-4`, and the description at `mt-1.5`;
  - the card at `-mt-5`, scrolling inside with `pt-5`.

  **Do not make any element in this tree conditional on state.** `children` must keep its position, or a Didit widget inside it remounts and opens a new session.

```tsx
"use client";
import { IoArrowBack } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import { LanguageChip } from "./language-chip";

export function AuthFrame({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  const { t } = useTranslations();
  const { lang } = useParams<{ lang: string }>();
  return (
    <div className="flex h-dvh flex-col bg-primary" data-testid="auth-frame">
      <div className="mx-auto w-full max-w-md shrink-0 px-5 pt-3 pb-10">
        <div className="flex items-center justify-between">
          <Link
            aria-label={t.SSRService["Header.Back"]}
            className="flex size-10 items-center justify-center rounded-full border border-primary-foreground/30 text-primary-foreground"
            data-testid="auth-back"
            href={`/${lang}`}
          >
            <IoArrowBack size={24} />
          </Link>
          <LanguageChip />
        </div>
        <BrandMark className="mt-5 text-primary-foreground" />
        {title ? (
          <h1
            className="mt-4 text-3xl font-bold text-primary-foreground"
            data-testid="auth-title"
          >
            {title}
          </h1>
        ) : null}
        {description ? (
          <p className="mt-1.5 text-base text-primary-foreground/80">
            {description}
          </p>
        ) : null}
      </div>
      <main
        className="mx-auto -mt-5 flex min-h-0 w-full max-w-md flex-1 flex-col overflow-y-auto rounded-t-md bg-card px-5 pt-5 pb-6"
        data-testid="auth-card"
      >
        {children}
      </main>
    </div>
  );
}

export function AuthFrameLoading() {
  const { t } = useTranslations();
  return (
    <AuthFrame>
      <div className="flex flex-1 items-center justify-center" role="status">
        <LoaderCircle
          aria-hidden="true"
          className="size-8 animate-spin text-primary"
        />
        <span className="sr-only">{t.SSRService.Loading}</span>
      </div>
    </AuthFrame>
  );
}
```

- [ ] **Step 6: The layout.** Replace `A/layout.tsx` entirely. This drops the light rays, the server-health badge, the `CountrySelector`, the grey page and the KYC stylesheet. The `light-rays` and `server-health` components stay in the codebase.

```tsx
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-primary">{children}</div>;
}
```

- [ ] **Step 7: The loading files.** Replace each of `A/login/loading.tsx`, `A/register/loading.tsx` and `A/reset-password/loading.tsx` with:

```tsx
import { AuthFrameLoading } from "@/src/components/auth-frame/auth-frame";

export default function Loading() {
  return <AuthFrameLoading />;
}
```

- [ ] **Step 8: Logout.** Replace `A/logout/page.tsx`. The sign-out effect and its ref guard are unchanged; only the markup moves into the frame.

```tsx
"use client";

import { AuthFrame } from "@/src/components/auth-frame/auth-frame";
import { useTranslations } from "@/src/providers/i18n";
import { signOutServer } from "@repo/utils/auth";
import { LoaderCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";

export default function Page() {
  const { lang } = useParams<{ lang: string }>();
  const { t } = useTranslations();
  const startedRef = useRef(false);

  // Sign out the moment the page is reached: there is no user event to hang it
  // on. The ref guards against a second run.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void signOutServer({ redirectTo: `/${lang}/login` });
  }, [lang]);

  return (
    <AuthFrame
      description={t.SSRService["Logout.Description"]}
      title={t.SSRService["Logout.Title"]}
    >
      <div className="flex flex-1 items-center justify-center" role="status">
        <LoaderCircle
          aria-hidden="true"
          className="size-8 animate-spin text-primary"
        />
      </div>
    </AuthFrame>
  );
}
```

- [ ] **Step 9: Gates**, plus a compile smoke:
  - Run the dev server detached on PORT 3005.
  - `curl` `/en/login` and `/en/register`. Both should answer 200 and compile.
  - Grep the log for `Error`, `Module not found` and `⨯`.
  - Stop only this worktree's `node.exe` processes.
  - Until Tasks 5 and 6, the pages still render their old content, now without a frame. That is expected.

- [ ] **Step 10: Commit.**

```bash
git add apps/ssr/src/components/auth-frame "apps/ssr/src/app/[lang]/(auth)/layout.tsx" "apps/ssr/src/app/[lang]/(auth)/login/loading.tsx" "apps/ssr/src/app/[lang]/(auth)/register/loading.tsx" "apps/ssr/src/app/[lang]/(auth)/reset-password/loading.tsx" "apps/ssr/src/app/[lang]/(auth)/logout/page.tsx"
git commit -F - <<'EOF'
feat(ssr): add the app's sign-in frame and drop the old auth backdrop

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Remove the KYC package (web-app)

**Files:**
- Delete: `A/login/kyc/kyc.tsx`, `A/register/kyc.tsx` and `A/reset-password/kyc.tsx`. Nothing imports any of them; check with `grep -rn "from \"./kyc\"" "apps/ssr/src/app/[lang]/(auth)"`, which must print nothing.
- Modify: `apps/ssr/next.config.js`. Remove `"@ayasofyazilim/kyc",` from `transpilePackages`.
- Modify: `apps/ssr/package.json` and `pnpm-lock.yaml`, through pnpm.

**Interfaces:** none.

- [ ] **Step 1: Delete the three files.** Use `git rm`, naming each by path.
- [ ] **Step 2: Edit `next.config.js`.**
- [ ] **Step 3: Remove the dependency.** Run `pnpm --filter ssr remove @ayasofyazilim/kyc` from the worktree root.
- [ ] **Step 4: Check the lockfile.**
  - `git diff pnpm-lock.yaml | grep '^+[^+]'` must print **nothing**: the removal only deletes entries.
  - If it prints added or changed lines (for example, a re-resolved version elsewhere), **do not hand-edit**. Report DONE_WITH_CONCERNS with those lines, and the controller rules on them.
  - `grep -rn "ayasofyazilim/kyc" apps/ssr --include=*.ts --include=*.tsx --include=*.js --include=*.json --include=*.css` must print nothing. Exclude `node_modules`.
- [ ] **Step 5: Gates.**
- [ ] **Step 6: Commit.**

```bash
git add apps/ssr/next.config.js apps/ssr/package.json pnpm-lock.yaml
git commit -F - <<'EOF'
chore(ssr): remove the unused KYC package and its dead screens

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

  The `git rm` from Step 1 is already staged.

---

### Task 5: Login and the Didit panels (web-app)

**Files:**
- Create: `A/login/_components/traveller-login-form.tsx`.
- Rewrite: `A/login/page.tsx` and `A/login/kyc/page.tsx`.
- Modify: `A/login/kyc/didit.tsx`, `A/register/didit.tsx` and `A/reset-password/didit.tsx`. Change the panel wrappers only.
- Delete: `S/components/auth/login-form.tsx`. Its only importer is `A/login/page.tsx`. Leave the other files in `S/components/auth/` alone.

**Interfaces:**
- Consumes:
  - from Task 1: `loginRedirectTarget`;
  - from Task 3: `AuthFrame`, `AuthField` and `PasswordToggle`;
  - from Task 2: the icons `IoMailOutline`, `IoLockClosedOutline` and `IoFingerPrintOutline`, and the keys `Auth.Traveller.*` and `Auth.Login.Submit`;
  - existing: `Auth.password.label`, `Auth.password.forgot`, `Auth.dontHaveAnAccount`, `Auth.ResetPasswordError`, `Login.LoggingIn`;
  - `signInServerApi` from `@repo/actions/core/AccountService/actions`, which redirects on success and returns `{ type: "error", message }` otherwise;
  - `normalizeLoginError` from `@/src/utils`.
- Produces: `TravellerLoginForm()`.

- [ ] **Step 1: `A/login/_components/traveller-login-form.tsx`.**

```tsx
"use client";
import { AuthField } from "@/src/components/auth-frame/auth-field";
import { PasswordToggle } from "@/src/components/auth-frame/password-toggle";
import {
  IoFingerPrintOutline,
  IoLockClosedOutline,
  IoMailOutline,
} from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { normalizeLoginError } from "@/src/utils";
import { loginRedirectTarget } from "@/src/utils/auth/login-redirect";
import { signInServerApi } from "@repo/actions/core/AccountService/actions";
import { Button, buttonVariants } from "@repo/ayasofyazilim-ui/components/button";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { cn } from "@repo/ayasofyazilim-ui/lib/utils";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";

export function TravellerLoginForm() {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const { lang } = useParams<{ lang: string }>();
  const searchParams = useSearchParams();
  const [userName, setUserName] = useState(() => searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const tokenError = searchParams.get("error");
  const canSubmit = userName.length > 0 && password.length > 0 && !isPending;

  useEffect(() => {
    if (tokenError) toast.error(copy["Auth.ResetPasswordError"]);
  }, [tokenError, copy]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    const redirectTo = loginRedirectTarget(searchParams.get("redirectTo"), lang);
    startTransition(async () => {
      const response = await signInServerApi({
        userName,
        password,
        tenantId: "",
        redirectTo,
      });
      if (response && response.type !== "success") {
        setError(
          normalizeLoginError(response.message) || copy["Auth.Traveller.Error"]
        );
      }
    });
  }

  return (
    <form data-testid="login-form" onSubmit={handleSubmit}>
      <AuthField
        autoCapitalize="none"
        autoComplete="username"
        data-testid="userName-input"
        disabled={isPending}
        error={Boolean(error)}
        icon={IoMailOutline}
        id="login-username"
        label={copy["Auth.Traveller.EmailOrUsername"]}
        onChange={(event) => setUserName(event.target.value)}
        placeholder={copy["Auth.Traveller.EmailOrUsername"]}
        value={userName}
      />
      <AuthField
        autoComplete="current-password"
        data-testid="password-input"
        disabled={isPending}
        error={error}
        icon={IoLockClosedOutline}
        id="login-password"
        label={copy["Auth.password.label"]}
        onChange={(event) => setPassword(event.target.value)}
        placeholder={copy["Auth.password.label"]}
        trailing={
          <PasswordToggle
            disabled={isPending}
            onToggle={() => setShowPassword((shown) => !shown)}
            visible={showPassword}
          />
        }
        type={showPassword ? "text" : "password"}
        value={password}
      />
      <div className="flex justify-end">
        <Link
          className="text-sm font-semibold text-foreground"
          data-testid="password-link"
          href={`/${lang}/reset-password`}
        >
          {copy["Auth.password.forgot"]}
        </Link>
      </div>
      <Button
        className="mt-6 h-12 w-full rounded-full"
        data-testid="submit-button"
        disabled={!canSubmit}
        type="submit"
      >
        {isPending ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
            <span className="sr-only">{copy["Login.LoggingIn"]}</span>
          </>
        ) : (
          copy["Auth.Login.Submit"]
        )}
      </Button>
      <Link
        aria-disabled={isPending || undefined}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "mt-6 h-12 w-full gap-2 rounded-full border-primary bg-card text-primary hover:bg-primary/5 hover:text-primary",
          isPending && "pointer-events-none opacity-50"
        )}
        data-testid="kyc-login-button"
        href={`/${lang}/login/kyc`}
      >
        <IoFingerPrintOutline size={20} />
        {copy["Auth.Traveller.Continue"]}
      </Link>
      <p className="mt-2 px-2 text-center text-xs text-muted-foreground">
        {copy["Auth.Traveller.Info"]}
      </p>
      <div className="mt-6 flex items-center justify-center gap-1 border-t border-border pt-5 text-sm">
        <span className="text-muted-foreground">
          {copy["Auth.dontHaveAnAccount"]}
        </span>
        <Link
          className="font-semibold text-primary"
          data-testid="signup-link"
          href={`/${lang}/register`}
        >
          {copy["Auth.Traveller.CreateAccount"]}
        </Link>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: `A/login/page.tsx`.**

```tsx
"use server";

import { AuthFrame } from "@/src/components/auth-frame/auth-frame";
import { getTranslations } from "@/src/language-data/get-translations";
import { TravellerLoginForm } from "./_components/traveller-login-form";

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations(lang);
  return (
    <AuthFrame
      description={t.SSRService["Auth.Traveller.Description"]}
      title={t.SSRService["Auth.Traveller.Title"]}
    >
      <TravellerLoginForm />
    </AuthFrame>
  );
}
```

- [ ] **Step 3: `A/login/kyc/page.tsx`.**

```tsx
import { AuthFrame } from "@/src/components/auth-frame/auth-frame";
import { getTranslations } from "@/src/language-data/get-translations";
import { DiditForLogin } from "./didit";

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations(lang);
  return (
    <AuthFrame
      description={t.SSRService["Auth.Traveller.Info"]}
      title={t.SSRService["Auth.Traveller.Title"]}
    >
      <DiditForLogin />
    </AuthFrame>
  );
}
```

- [ ] **Step 4: The Didit panels.** There are eight wrappers across the three `didit.tsx` files: two in `login/kyc`, three in `register` and three in `reset-password`. Change each one's class string, and nothing else in those files:
  - `className="flex flex-col items-center justify-center min-h-screen p-4"` becomes `className="flex flex-1 flex-col items-center justify-center py-8"`.
  - `className="flex text-center flex-col items-center justify-center min-h-screen p-4"` becomes `className="flex flex-1 flex-col items-center justify-center py-8 text-center"`.

  Afterwards, `grep -c "min-h-screen"` on each of the three files must print 0.

- [ ] **Step 5: Delete `S/components/auth/login-form.tsx`** with `git rm`. Then `grep -rn "components/auth/login-form" apps/ssr/src` must print nothing.

- [ ] **Step 6: Gates**, plus a compile smoke on PORT 3005:
  - `/en/login` answers 200.
  - The HTML contains each kept test id. Check `login-form`, `userName-input`, `password-input`, `password-link`, `submit-button`, `kyc-login-button` and `signup-link` with `curl -s … | grep -o 'data-testid="[a-zA-Z-]*"' | sort -u`.
  - `/en/login/kyc` answers 200. **Fetching it server-side does not mount the widget** (that happens in a browser), so it creates no Didit session.
  - Grep the log for errors.
  - Stop only this worktree's processes.

- [ ] **Step 7: Commit.**

```bash
git add "apps/ssr/src/app/[lang]/(auth)/login/_components/traveller-login-form.tsx" "apps/ssr/src/app/[lang]/(auth)/login/page.tsx" "apps/ssr/src/app/[lang]/(auth)/login/kyc/page.tsx" "apps/ssr/src/app/[lang]/(auth)/login/kyc/didit.tsx" "apps/ssr/src/app/[lang]/(auth)/register/didit.tsx" "apps/ssr/src/app/[lang]/(auth)/reset-password/didit.tsx"
git commit -F - <<'EOF'
feat(ssr): move login and the Didit steps into the app's sign-in frame

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

  The `git rm` from Step 5 is already staged.

---

### Task 6: Register and reset (web-app)

**Files:**
- Rewrite: `A/register/create-traveller-form.tsx`, `A/register/page.tsx`, `A/reset-password/reset-password-form.tsx` and `A/reset-password/page.tsx`.

**Interfaces:**
- Consumes:
  - from Task 1: `loginRedirectTarget`, `isPasswordTooShort`, `resetPasswordError` and `registerTelephone`;
  - from Task 3: `AuthFrame`, `AuthField` and `PasswordToggle`;
  - from Task 2: `IoPersonCircleOutline` and the keys `Auth.Register.*` and `Auth.Reset.*`;
  - `loginViaSSRAction(sessionId, "Didit", redirectTo)` from `A/login/kyc/login-via-ssr-action.ts`, which redirects on success and returns `{ type: "error", message }` otherwise;
  - `postCreateTravellerActionApi` and `postSetPasswordActionApi` from `@repo/actions/unirefund/TravellerService/post-actions`. Both return `{ type: "success", … }` or `{ type: …, message }`;
  - `PhoneInput` from `@repo/ayasofyazilim-ui/custom/phone-input`. It takes `id`, `placeholder`, `disabled`, `className` and `onChange({ value, parsed })`, where `parsed` is libphonenumber's `PhoneNumber | undefined`. It keeps its own value.

- [ ] **Step 1: `A/register/create-traveller-form.tsx`.**

```tsx
"use client";
import { loginViaSSRAction } from "@/src/app/[lang]/(auth)/login/kyc/login-via-ssr-action";
import { AuthField } from "@/src/components/auth-frame/auth-field";
import { PasswordToggle } from "@/src/components/auth-frame/password-toggle";
import { IoLockClosedOutline, IoMailOutline } from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { loginRedirectTarget } from "@/src/utils/auth/login-redirect";
import { isPasswordTooShort } from "@/src/utils/auth/password-rules";
import { registerTelephone } from "@/src/utils/auth/register-payload";
import { postCreateTravellerActionApi } from "@repo/actions/unirefund/TravellerService/post-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { Label } from "@repo/ayasofyazilim-ui/components/label";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { PhoneInput } from "@repo/ayasofyazilim-ui/custom/phone-input";
import { LoaderCircle } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

type ParsedPhone = { countryCallingCode?: string; nationalNumber?: string } | null;

export function CreateTravellerForm({
  lang,
  email,
  sessionId,
  returnTo,
}: {
  lang: string;
  email: string | null | undefined;
  sessionId: string;
  returnTo?: string;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const [emailAddress, setEmailAddress] = useState(email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState<ParsedPhone>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canSubmit = emailAddress.length > 0 && password.length > 0 && !isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setFormError(null);
    if (isPasswordTooShort(password)) {
      setPasswordError(copy["Auth.Reset.TooShort"]);
      return;
    }
    setPasswordError(null);
    const telephone = registerTelephone(phone);
    startTransition(async () => {
      const created = await postCreateTravellerActionApi({
        email: { emailAddress, type: "PERSONAL" },
        password,
        sessionId,
        kycSessionProvider: "Didit",
        ...(telephone ? { telephone } : {}),
      });
      if (created.type !== "success") {
        setFormError(created.message || copy["Auth.Register.Error"]);
        return;
      }
      toast.success(copy["Auth.Register.Success"]);
      const login = await loginViaSSRAction(
        sessionId,
        "Didit",
        loginRedirectTarget(returnTo, lang)
      );
      if (login?.type === "error") {
        setFormError(login.message || copy["Auth.Traveller.Error"]);
      }
    });
  }

  return (
    <form data-testid="kyc-registration-form" onSubmit={handleSubmit}>
      <AuthField
        autoCapitalize="none"
        autoComplete="email"
        data-testid="email-input"
        disabled={isPending}
        icon={IoMailOutline}
        id="register-email"
        label={copy["Auth.Register.Email"]}
        onChange={(event) => setEmailAddress(event.target.value)}
        placeholder={copy["Auth.Register.Email"]}
        required
        type="email"
        value={emailAddress}
      />
      <AuthField
        autoComplete="new-password"
        data-testid="password-input"
        disabled={isPending}
        error={passwordError}
        icon={IoLockClosedOutline}
        id="register-password"
        label={copy["Auth.Register.Password"]}
        onChange={(event) => setPassword(event.target.value)}
        placeholder={copy["Auth.Register.Password"]}
        trailing={
          <PasswordToggle
            disabled={isPending}
            onToggle={() => setShowPassword((shown) => !shown)}
            visible={showPassword}
          />
        }
        type={showPassword ? "text" : "password"}
        value={password}
      />
      <div className="mb-3">
        <Label className="mb-1.5 block" htmlFor="register-phone">
          {copy["Auth.Register.Phone"]}
        </Label>
        <PhoneInput
          className="[&_button]:h-12! [&_input]:h-12!"
          disabled={isPending}
          id="register-phone"
          onChange={({ parsed }) => setPhone(parsed ?? null)}
          placeholder={copy["Auth.Register.Phone"]}
        />
      </div>
      {formError ? (
        <p
          className="mt-2 text-sm font-medium text-error"
          data-testid="register-error"
          role="alert"
        >
          {formError}
        </p>
      ) : null}
      <Button
        className="mt-6 h-12 w-full rounded-full"
        data-testid="submit-button"
        disabled={!canSubmit}
        type="submit"
      >
        {isPending ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
            <span className="sr-only">{copy.Loading}</span>
          </>
        ) : (
          copy["Auth.Register.Submit"]
        )}
      </Button>
    </form>
  );
}
```

  **If type-check rejects `setPhone(parsed ?? null)`,** libphonenumber's branded `CountryCallingCode` or `NationalNumber` is not assignable. Map it explicitly:

  `setPhone(parsed ? { countryCallingCode: String(parsed.countryCallingCode), nationalNumber: String(parsed.nationalNumber) } : null)`

  Do not cast.

- [ ] **Step 2: `A/register/page.tsx`.**
  - The page keeps its existing logic and its three branches: a failed email lookup, the form, and the Didit step.
  - Each branch's existing JSX is wrapped in `<AuthFrame description={t.SSRService["Auth.Register.Description"]} title={t.SSRService["Auth.Register.Title"]}>…</AuthFrame>`. Write the frame once, around a single `content` variable, so the three branches share it. The full file:

```tsx
"use server";

import { AuthFrame } from "@/src/components/auth-frame/auth-frame";
import { getTranslations } from "@/src/language-data/get-translations";
import { getBaseLink } from "@/src/utils";
import { getApiTravellerServiceSsrPublicActionsGetEmailApi } from "@repo/actions/unirefund/TravellerService/actions";
import { buttonVariants } from "@repo/ayasofyazilim-ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ayasofyazilim-ui/components/empty";
import { FileXCorner } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CreateTravellerForm } from "./create-traveller-form";
import { DiditForRegister } from "./didit";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{
    sessionId?: string;
    returnTo?: string;
  }>;
}) {
  const { lang } = await params;
  const { sessionId, returnTo } = (await searchParams) || {};
  const t = await getTranslations(lang);
  let content: ReactNode = <DiditForRegister />;
  if (sessionId) {
    const getEmailResponse =
      await getApiTravellerServiceSsrPublicActionsGetEmailApi({
        sessionId,
        kycSessionProvider: "Didit",
      });
    content =
      getEmailResponse.type !== "success" || !getEmailResponse.data ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileXCorner />
            </EmptyMedia>
            <EmptyTitle>{t.SSRService["Verification.Failed"]}</EmptyTitle>
            <EmptyDescription>
              {t.SSRService["Verification.FailedDescription"]}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center gap-2">
            <Link
              data-testid="register-link"
              className={buttonVariants({ variant: "default", size: "sm" })}
              href={getBaseLink("register", lang)}
            >
              {t.SSRService["Register"]}
            </Link>
            <Link
              data-testid="login-link"
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={getBaseLink("login", lang)}
            >
              {t.SSRService["Auth.signIn"]}
            </Link>
          </EmptyContent>
        </Empty>
      ) : (
        <CreateTravellerForm
          email={getEmailResponse.data.email}
          lang={lang}
          returnTo={returnTo}
          sessionId={sessionId}
        />
      );
  }
  return (
    <AuthFrame
      description={t.SSRService["Auth.Register.Description"]}
      title={t.SSRService["Auth.Register.Title"]}
    >
      {content}
    </AuthFrame>
  );
}
```

- [ ] **Step 3: `A/reset-password/reset-password-form.tsx`.**

```tsx
"use client";
import { AuthField } from "@/src/components/auth-frame/auth-field";
import { PasswordToggle } from "@/src/components/auth-frame/password-toggle";
import {
  IoLockClosedOutline,
  IoPersonCircleOutline,
} from "@/src/components/shell/ionicons";
import { useTranslations } from "@/src/providers/i18n";
import { resetPasswordError } from "@/src/utils/auth/password-rules";
import { postSetPasswordActionApi } from "@repo/actions/unirefund/TravellerService/post-actions";
import { Button } from "@repo/ayasofyazilim-ui/components/button";
import { toast } from "@repo/ayasofyazilim-ui/components/sonner";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

type ResetError = { field: "new" | "confirm" | "form"; message: string };

export function ResetPasswordForm({
  lang,
  email,
  sessionId,
}: {
  lang: string;
  email: string | null | undefined;
  sessionId: string;
}) {
  const { t } = useTranslations();
  const copy = t.SSRService;
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<ResetError | null>(null);
  const [isPending, startTransition] = useTransition();
  const canSubmit =
    Boolean(email) &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    !isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    const rule = resetPasswordError(newPassword, confirmPassword);
    if (rule) {
      setError({
        field: rule.field,
        message:
          rule.reason === "tooShort"
            ? copy["Auth.Reset.TooShort"]
            : copy["Auth.Reset.Mismatch"],
      });
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await postSetPasswordActionApi({
        newPassword,
        sessionId,
        kycSessionProvider: "Didit",
      });
      if (response.type !== "success") {
        setError({
          field: "form",
          message: response.message || copy["Auth.Reset.Error"],
        });
        return;
      }
      toast.success(copy["Auth.Reset.Success"]);
      router.push(`/${lang}/login?email=${encodeURIComponent(email ?? "")}`);
    });
  }

  return (
    <form data-testid="reset-password-form" onSubmit={handleSubmit}>
      {email ? (
        <div
          className="mb-4 flex items-center gap-3 rounded-md bg-foreground/5 p-4"
          data-testid="reset-email"
        >
          <IoPersonCircleOutline className="shrink-0 text-primary" size={22} />
          <span className="flex-1 text-sm font-medium text-foreground">
            {email}
          </span>
        </div>
      ) : null}
      <AuthField
        autoComplete="new-password"
        data-testid="new-password-input"
        disabled={isPending}
        error={error?.field === "new" ? error.message : null}
        icon={IoLockClosedOutline}
        id="reset-new-password"
        label={copy["Auth.Reset.NewPassword"]}
        onChange={(event) => setNewPassword(event.target.value)}
        placeholder={copy["Auth.Reset.NewPassword"]}
        trailing={
          <PasswordToggle
            disabled={isPending}
            onToggle={() => setShowPassword((shown) => !shown)}
            visible={showPassword}
          />
        }
        type={showPassword ? "text" : "password"}
        value={newPassword}
      />
      <AuthField
        autoComplete="new-password"
        data-testid="confirm-password-input"
        disabled={isPending}
        error={error?.field === "confirm" ? error.message : null}
        icon={IoLockClosedOutline}
        id="reset-confirm-password"
        label={copy["Auth.Reset.ConfirmPassword"]}
        onChange={(event) => setConfirmPassword(event.target.value)}
        placeholder={copy["Auth.Reset.ConfirmPassword"]}
        type={showPassword ? "text" : "password"}
        value={confirmPassword}
      />
      {error?.field === "form" ? (
        <p
          className="mt-2 text-sm font-medium text-error"
          data-testid="reset-error"
          role="alert"
        >
          {error.message}
        </p>
      ) : null}
      <Button
        className="mt-6 h-12 w-full rounded-full"
        data-testid="submit-button"
        disabled={!canSubmit}
        type="submit"
      >
        {isPending ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
            <span className="sr-only">{copy.Loading}</span>
          </>
        ) : (
          copy["Auth.Reset.Submit"]
        )}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: `A/reset-password/page.tsx`.** The same shape as register. The failure panel keeps its strings, and the frame uses the Reset title and description:

```tsx
"use server";

import { AuthFrame } from "@/src/components/auth-frame/auth-frame";
import { getTranslations } from "@/src/language-data/get-translations";
import { getBaseLink } from "@/src/utils";
import { getApiTravellerServiceSsrPublicActionsGetEmailApi } from "@repo/actions/unirefund/TravellerService/actions";
import { buttonVariants } from "@repo/ayasofyazilim-ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ayasofyazilim-ui/components/empty";
import { FileXCorner } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DiditForResetPassword } from "./didit";
import { ResetPasswordForm } from "./reset-password-form";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{
    sessionId?: string;
    email?: string;
  }>;
}) {
  const { lang } = await params;
  const { sessionId, email } = await searchParams;
  const t = await getTranslations(lang);
  let content: ReactNode = <DiditForResetPassword />;
  if (sessionId && email) {
    const getEmailResponse =
      await getApiTravellerServiceSsrPublicActionsGetEmailApi({
        sessionId,
        kycSessionProvider: "Didit",
      });
    content =
      getEmailResponse.type !== "success" || !getEmailResponse.data ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileXCorner />
            </EmptyMedia>
            <EmptyTitle>{t.SSRService["Verification.Failed"]}</EmptyTitle>
            <EmptyDescription>
              {t.SSRService["Verification.UnableToVerify"]}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center gap-2">
            <Link
              data-testid="login-link"
              className={buttonVariants({ variant: "default", size: "sm" })}
              href={getBaseLink("login", lang)}
            >
              {t.SSRService["Auth.signIn"]}
            </Link>
            <Link
              data-testid="register-link"
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={getBaseLink("register", lang)}
            >
              {t.SSRService["Register"]}
            </Link>
          </EmptyContent>
        </Empty>
      ) : (
        <ResetPasswordForm
          email={getEmailResponse.data.email}
          lang={lang}
          sessionId={sessionId}
        />
      );
  }
  return (
    <AuthFrame
      description={t.SSRService["Auth.Reset.Description"]}
      title={t.SSRService["Auth.Reset.Title"]}
    >
      {content}
    </AuthFrame>
  );
}
```

- [ ] **Step 5: Gates**, plus a compile smoke on PORT 3005:
  - `/en/register?sessionId=00000000-0000-0000-0000-000000000000` answers 200, and its HTML contains `register-link` and `auth-frame`. The lookup fails, so the failure panel renders inside the frame.
  - `/en/reset-password?sessionId=00000000-0000-0000-0000-000000000000&email=a%40b.c` behaves the same way.
  - Grep the log for errors, then stop only this worktree's processes.

- [ ] **Step 6: Commit.**

```bash
git add "apps/ssr/src/app/[lang]/(auth)/register/create-traveller-form.tsx" "apps/ssr/src/app/[lang]/(auth)/register/page.tsx" "apps/ssr/src/app/[lang]/(auth)/reset-password/reset-password-form.tsx" "apps/ssr/src/app/[lang]/(auth)/reset-password/page.tsx"
git commit -F - <<'EOF'
feat(ssr): bring the app's register and reset forms into the sign-in frame

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7 (controller): gates, builds, manual pass, PR

- [ ] **Gates and builds.**
  - Run the four gates.
  - With no dev server running on this worktree, run `pnpm --filter ssr build` and `pnpm --filter web build`.
  - If the build crashes with `WasmHash`, run `rm -rf apps/ssr/.next/cache` and build again.
  - Never stop node processes while a build is running.
- [ ] **Manual pass** on `next start` (PORT 3005), at 375 px and 1280 px.
  - **Login with `tur-a25y29041`.** It should land on `/en`.
  - **Signed-out redirect.** Signed out, `/en/profile` should go to the login page with `redirectTo`. Logging in should land on `/en/profile`.
  - **Wrong password.** The message shows under the password field, both values stay, Log In re-enables, and no toast appears.
  - **Language chip.** The sheet opens at page width. Pick Türkçe on `/en/login`: it should go to `/tr/login` with Turkish copy.
  - **The frame at both widths.** At 1280 px the canopy is full width and the column is `max-w-md`.
  - **Didit pages.** Open `/en/login/kyc`, `/en/register` and `/en/reset-password` **once each** and leave. Count the Didit session requests per visit; it should be exactly one. Open and close the language sheet once on `/en/login/kyc`, and confirm no second session request is made.
  - **Failure panels.** `/en/register?sessionId=0000…` and the reset equivalent should show the failure panel in the frame.
  - **`/en/logout`** while signed in shows the frame, then lands on the login page.
  - **Not verified:** the register and reset forms against a real Didit session.
- [ ] **PR.**
  - Push, then open a PR into `feat/ssr-visual-parity-notifications`.
  - The body lists:
    - the plan decisions;
    - the unused keys (grep each old `Auth.*`, `CompleteRegistration`, `PhoneType` and `SelectPhoneType.*` key under `apps/ssr/src`);
    - the removed dependency;
    - what was not verified.
  - Keep vulnerability detail out of it. Say only "only same-site redirect targets are followed".
