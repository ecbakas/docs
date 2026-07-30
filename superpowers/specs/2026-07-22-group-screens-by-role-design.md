# Design: Group `src/screens` by user role (with per-role Home/FAQ/Profile)

**Date:** 2026-07-22
**Scope:** `src/screens/**` and the `@/screens` importers in `src/app/**`. Adds per-role Home/FAQ/Profile screens + role dispatchers, plus supporting UserCard prop and localization keys.

## Goal

Reorganize `src/screens/**` into role folders (`shared/`, `merchant/`, `refund-point/`, `traveller/`) and make Home, FAQ, and Profile role-specific, dispatched at their routes by `useUserStore().role`.

## Roles

`UserRole` (see [src/store/user.ts](../../../src/store/user.ts)) = `traveller` | `merchant` | `refundPoint`. Derived from backend after login.

## Decisions (agreed with user)

1. Reorganize `src/screens` only (plus the route files that import them). No URL/route-name changes.
2. Cross-role screens live in `shared/`. Each role folder is **self-contained** for Home/FAQ/Profile — merchant and refund-point get their **own copies** even where currently identical (no shared "staff" screen).
3. `refund-point/` **is** created (holds its Home/FAQ/Profile).
4. `Validate` (ValidateScreen + Validate/) moves to `traveller/` — validation is traveller-only.
5. Naming: `merchant`, `refund-point`, `traveller`, `shared`. Existing PascalCase sub-folders preserved.
6. Home/FAQ/Profile diverge per role — **extract now** into per-role files (not internal branching, not deferred).

## Per-role screen content

**Home** (route `app/(auth)/index.tsx` → dispatcher):
- traveller: scan-QR button + "Latest tag" section + FAQ preview (current behavior, relocated).
- merchant: "Latest tag" section + "Create Tag" quick action (placeholder → info toast); **no** FAQ preview.
- refund-point: placeholder screen — localized "Refund Point Home Page".

**FAQ** (route `app/(auth)/faq.tsx` → dispatcher):
- traveller: current FAQ content (relocated).
- merchant / refund-point: placeholder — localized "Role FAQ section" (a copy in each folder).

**Profile** (route `app/(auth)/profile/index.tsx` → dispatcher):
- traveller: current full Profile (Verify Account, Personal Info, App Language, Notification Preferences, Logout, Delete Account; UserCard QR shown).
- merchant / refund-point: Personal Info, App Language, Notification Preferences, Logout only. **No** Verify Account, **no** Delete Account, UserCard QR hidden (a copy in each folder).

**EditProfileScreen** stays shared (same for all roles).

## Role dispatchers

Each of the three routes renders:
```tsx
const { role } = useUserStore();
if (role === "merchant") return <MerchantX />;
if (role === "refundPoint") return <RefundPointX />;
return <TravellerX />;   // default incl. role === null
```

## Target structure

```
src/screens/
  shared/
    _components/ Faq.tsx, LastestTag.tsx        (used across roles/screens)
    Profile/
      EditProfileScreen.tsx
      _components/ UserCard, QrCodeModal, AvatarModal, DeleteAccountModal
    Tags/  Explore/  Notifications/
    LanguageSelectionScreen · RoleGateScreen · ResetPasswordScreen · StaffLoginScreen · TagPreviewScreen
  merchant/
    Home/HomeScreen · FAQ/FaqScreen · Profile/ProfileScreen
    ConnectedDevices/
  refund-point/
    Home/HomeScreen · FAQ/FaqScreen · Profile/ProfileScreen
  traveller/
    Home/HomeScreen · FAQ/FaqScreen · Profile/ProfileScreen
    RegisterScreen · TravellerLoginScreen · DiditScreen
    ValidateScreen.tsx + Validate/
```

## Supporting changes

- **`UserCard`**: add `showQrCode?: boolean` (default `true`); guard the QR Pressable with it. Staff Profiles pass `false`.
- **Localization** (add to `src/localization/resources/en-US.json` + `tr-TR.json`, then `npm run init`):
  - `MobileApp.Home.CreateTag`, `MobileApp.Home.CreateTagComingSoon`, `MobileApp.Home.RefundPointPlaceholder`
  - `MobileApp.FAQ.RolePlaceholder`
- Toast API for placeholder: `toastRef.current?.show("info", t("MobileApp.Home.CreateTagComingSoon"))`.

## Shared building blocks (component moves)

- `Faq.tsx` (generic renderer): `(auth)/FAQ/_components/Faq.tsx` → `shared/_components/Faq.tsx`. Consumers: traveller Home + traveller FAQ.
- `LastestTag.tsx`: `(auth)/Home/_components/LastestTag.tsx` → `shared/_components/LastestTag.tsx`. Consumers: traveller Home + merchant Home.
- Profile modals (`UserCard`, `QrCodeModal`, `AvatarModal`, `DeleteAccountModal`): `(auth)/Profile/_components/*` → `shared/Profile/_components/*`. `UserCard` imports `./QrCodeModal` + `./AvatarModal` (stay siblings — valid). `DeleteAccountModal` used only by traveller Profile.

## Move mapping (relocations of existing files)

| Current | New |
|---|---|
| `(auth)/Home/HomeScreen.tsx` | `traveller/Home/HomeScreen.tsx` |
| `(auth)/Home/_components/LastestTag.tsx` | `shared/_components/LastestTag.tsx` |
| `(auth)/FAQ/FaqScreen.tsx` | `traveller/FAQ/FaqScreen.tsx` |
| `(auth)/FAQ/_components/Faq.tsx` | `shared/_components/Faq.tsx` |
| `(auth)/Profile/ProfileScreen.tsx` | `traveller/Profile/ProfileScreen.tsx` |
| `(auth)/Profile/EditProfileScreen.tsx` | `shared/Profile/EditProfileScreen.tsx` |
| `(auth)/Profile/_components/*` | `shared/Profile/_components/*` |
| `(auth)/Tags/**` | `shared/Tags/**` |
| `(auth)/Explore/**` | `shared/Explore/**` |
| `(auth)/ConnectedDevices/**` | `merchant/ConnectedDevices/**` |
| `(modals)/Notifications/**` | `shared/Notifications/**` |
| `(modals)/LanguageSelectionScreen.tsx` | `shared/LanguageSelectionScreen.tsx` |
| `(public)/RoleGateScreen.tsx` | `shared/RoleGateScreen.tsx` |
| `(public)/ResetPasswordScreen.tsx` | `shared/ResetPasswordScreen.tsx` |
| `(public)/StaffLoginScreen.tsx` | `shared/StaffLoginScreen.tsx` |
| `(public)/RegisterScreen.tsx` | `traveller/RegisterScreen.tsx` |
| `(public)/TravellerLoginScreen.tsx` | `traveller/TravellerLoginScreen.tsx` |
| `(public)/DiditScreen.tsx` | `traveller/DiditScreen.tsx` |
| `ValidateScreen.tsx` | `traveller/ValidateScreen.tsx` |
| `Validate/**` | `traveller/Validate/**` |
| `TagPreviewScreen.tsx` | `shared/TagPreviewScreen.tsx` |

## New files

- `merchant/Home/HomeScreen.tsx`, `merchant/FAQ/FaqScreen.tsx`, `merchant/Profile/ProfileScreen.tsx`
- `refund-point/Home/HomeScreen.tsx`, `refund-point/FAQ/FaqScreen.tsx`, `refund-point/Profile/ProfileScreen.tsx`

## Route-file import updates

Dispatchers: `app/(auth)/index.tsx`, `app/(auth)/faq.tsx`, `app/(auth)/profile/index.tsx`.
Path-only updates: `app/(auth)/profile/edit-profile.tsx`, `connected-devices.tsx`, `explore.tsx`, `tags/index.tsx`, `tags/[tagId].tsx`, `(modals)/notifications.tsx`, `app/(modals)/language-selector.tsx`, `app/(public)/{role-select,reset-password,staff-login,register,traveller-login,didit}.tsx`, `app/tag-preview.tsx`, `app/validate.tsx`.

## Relative-import fixes inside relocated traveller screens

- `traveller/Home/HomeScreen.tsx`: `../FAQ/_components/Faq` → `@/screens/shared/_components/Faq`; `./_components/LastestTag` → `@/screens/shared/_components/LastestTag`.
- `traveller/FAQ/FaqScreen.tsx`: `./_components/Faq` → `@/screens/shared/_components/Faq`.
- `traveller/Profile/ProfileScreen.tsx`: `./_components/DeleteAccountModal` → `@/screens/shared/Profile/_components/DeleteAccountModal`; `./_components/UserCard` → `@/screens/shared/Profile/_components/UserCard`.
- `shared/Profile/EditProfileScreen.tsx`, `shared/_components/Faq.tsx`, `shared/Profile/_components/UserCard.tsx`: no cross-folder relatives (verified) — no edits.

## Verification

- `npm run typecheck` passes.
- `npm run lint` reports no new errors.
- `git grep -nE "@/screens/\((auth|public|modals)\)"` → nothing.
- No stray empty folders under `src/screens`.
- Routes/URLs unchanged; only the rendered component per role changes for Home/FAQ/Profile.

## Risks

- Localization `npm run init` fetches backend resources; if unavailable in this environment, new keys fall back to the key string until the user runs it. Non-fatal.
- New per-role screens are net-new UI; verified via typecheck + manual review (no unit tests for presentational screens, matching repo convention).
