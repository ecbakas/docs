# ssr visual parity, sub-project 4: Explore, the notifications sheet and sign-in

**Goal.** `web-app/apps/ssr`'s Explore map, notifications and sign-in screens look and behave like super-app's traveller equivalents. This is the last of the four sub-projects.

It builds on:
- **Sub-project 1** ([spec](2026-10-01-ssr-visual-parity-shell-design.md), #312): the tokens, the island and its `blob-chain` geometry, `PageHeader` and its bell, and the decision that Explore stays full-bleed and the island stays hidden on `(auth)`.
- **Sub-projects 2 and 3** (#313, #314, #315): `PinnedBar`, page-width sheets, `node:test` pure modules, and the single centred column.

**The reference is super-app's code:**
- `src/screens/shared/Explore/` (`ExploreScreen`, `_components/ExploreMap`, `MapControls`, `PlaceSearch`, `LayersSheet`, `SectorSheet`, `PlaceDetailSheet`, `useViewportLayer`, `_lib/*`);
- `src/providers/NotificationsProvider.tsx`, `src/screens/shared/Notifications/` (`NotificationsSheet`, `_components/NotificationItem`, `NotificationsSkeleton`) and the bell in `src/templates/TabPage.tsx`;
- `src/templates/Auth.tsx`, `src/screens/traveller/TravellerLoginScreen.tsx`, `DiditScreen.tsx`, `src/screens/shared/ResetPasswordScreen.tsx`, `src/hooks/useTravellerDidit.ts`.

## Decisions (user, 2026-10-06)

1. **One spec, three PRs**, stacked:
   - **4a:** Explore.
   - **4b:** the notifications sheet.
   - **4c:** sign-in.
2. **The map moves to MapLibre.** ssr uses `maplibre-gl` with the app's key-less OpenFreeMap "Liberty" style, so the map itself looks the same as the app's.
3. **Explore stays public.** Signed-out visitors keep the landing page's "Explore merchants" link. This differs from the app, which shows the map only signed in. The data is anonymous either way.
4. **Sign-in covers login, Didit login, register, reset and logout.**
   - There is no role gate, because ssr is traveller-only.
   - There are no onboarding slides, because the landing page does that job.
5. **The three section designs below were approved as presented.** That includes dropping the auth layout's server-health badge and light-ray backdrop.

## Approach

This is the earlier sub-projects' approach:
- Port the app's pure logic into ssr as `.ts` modules with `node:test` tests.
- Build web components that copy the app's classes on the shared tokens, with the app's class translation: `text-muted` and `text-placeholder` become `text-muted-foreground`, and a neutral `bg-muted` becomes `bg-muted-foreground`.
- Every bottom sheet is a page-width `Drawer` (`mx-auto w-full max-w-3xl md:border-x`).

## Grants

Nothing in this sub-project calls a gated endpoint:
- the Explore viewport endpoints are anonymous;
- Novu is gated only by having a subscriber id;
- the sign-in endpoints are public.

The rule stands for anything a later change adds: a control renders only with its endpoint's group and leaf grant (memory `gate-every-action-by-grant`).

## Section 1 (4a): Explore, `/{lang}/explore`

**The map.**
- A client component on `maplibre-gl`, loaded only by this page with its stylesheet. It uses the style `https://tiles.openfreemap.org/styles/liberty`.
- It starts on Istanbul (`[28.9966448299549, 41.011903723721645]`, lng/lat) at zoom 9.
- It shows the app's attribution line, "© OpenFreeMap © OpenMapTiles Data from OpenStreetMap", bottom right and above the island.
- The map fills the viewport behind the island. The page has no header or bell, and the island stays visible with no active slot, as today.

**Pins and clusters.**
- Pins are HTML markers with the app's teardrop: `w-8 aspect-square rounded-full rounded-bl-none shadow-lg`, rotated −45° with the icon counter-rotated.

  | Layer | Icon | Fill |
  | --- | --- | --- |
  | merchants | `storefront-outline` | `bg-primary` |
  | customs | `business-outline` | `bg-warning` |
  | refund points | `wallet-outline` | `bg-success` |

  The icons are the shell's Ionicons; lucide icons and today's raw amber and emerald fills go.
- A cluster is the app's count bubble: `size-12 rounded-full border-2 border-primary-foreground bg-primary shadow-lg`. Tapping it still zooms in by 3 levels, as the web does today. The app's bubble is not interactive.
- Tapping a pin opens the place sheet.

**Data.** This stays as today:
- the three anonymous CRM viewport actions, with the existing `EXPLORE_COUNTRY_TENANT` header;
- one fetch per enabled layer, from the map's bounds after it moves, debounced 350 ms;
- spans wider than 180° on either axis are skipped;
- a clustered response yields only clusters;
- a failed fetch keeps the previous pins;
- out-of-order responses are discarded.

Sector options are derived from the merchant pins in view. The last non-empty set is kept while zoomed out into clusters, and turning merchants off clears the chosen sector.

**Controls,** copied from the app:
- **Search** across the top (`absolute inset-x-0 top-4 px-4`):
  - an input with a search icon and a clear button;
  - Photon geocoding (`https://photon.komoot.io/api?q=…&lang=…&limit=6`) with a 350 ms debounce;
  - results in a dropdown (`mt-2 max-h-64 rounded-md border border-border bg-card shadow-lg`), one two-line label per row.

  Picking a result flies the map there at zoom 15 or more, clears the query and closes the list.
- **The control chain,** floating above the island:
  - It is drawn with the island's `blob-chain` geometry, grouped 2‑1‑2: layers and sector, then locate, then zoom out and zoom in.
  - Each control is a 40 px icon button.
  - The sector button turns `text-primary` while a sector is active.
  - Locate shows a spinner while it is working.

**Sheets** (page-width `Drawer`s):
- **Layers:** a checkbox row per layer, with its pin icon and a check or empty circle. Toggling a row does not close the sheet. Merchants is on by default, the other two off.
- **Sector:** a radio list starting with "All sectors". Choosing one closes the sheet. With no options in view, the sector button does nothing.
- **Place:**
  - the name;
  - the address, or "No address";
  - sector badges (`variant="outline"`);
  - "Google Maps" and "Apple Maps" buttons that open the existing directions URLs.

  This replaces today's popup.

**States.**
- A failed layer shows the app's amber banner under the search bar: `rounded-md border border-warning/40 bg-warning-surface px-4 py-3 text-sm text-warning`.
- The search dropdown shows loading, empty and error.
- Locate uses the browser's geolocation. A denied, unsupported or unavailable result gets its own toast.

**Removed:**
- the street/satellite switch and the fullscreen control;
- the stock top-right zoom, locate, layers and sector controls;
- the pin popup;
- the bottom status pill ("Loading places…", "Zoom in…").

The UI kit's `map` component is untouched, since other screens use it.

## Section 2 (4b): the notifications sheet

**Where it opens.** The bell stays in `PageHeader`, shown signed in when Novu is configured. A tap opens a page-width bottom sheet `70vh` tall instead of today's popover.

**Data.**
- One `NotificationsProvider` in the shell wraps `NovuProvider` from `@novu/nextjs/hooks`.
  - It is keyed by the subscriber id and disconnects its socket on unmount, so one account never sees another's feed (memory `superapp-novu-shared-inbox`).
  - It reads the existing `notificationConfig` (`NOVU_APP_IDENTIFIER`, `NOVU_APP_URL`, `NOVU_SOCKET_URL`, and the session's `sub`).
- The sheet uses Novu's `useNotifications`: the list, `hasMore`, `fetchMore`, `readAll`, `refetch`, loading and error.
- The bell's badge uses `useCounts` for the server's unread total. It is hidden at 0 and capped at "99+", as today.

**The sheet,** copied from the app:
- **Header:** "Notifications" (`text-xl font-bold`) and a round close button (`size-9 rounded-full bg-foreground/5`).
- **Summary:** "{n} notifications", plus " • {m} unread" when there are unread ones, over a rule.
- **Row:**
  - **Unread:** `bg-info-surface border-2 border-info/40`, a `h-1 bg-info` bar along the bottom, and a "NEW" pill.
  - **Read:** `bg-card border border-border`.
  - **Every row:**
    - a `w-14 h-14 rounded-md bg-info` bell tile;
    - the subject, or a default subject;
    - the body clamped to two lines, with "Show more" / "Show less" past 100 characters;
    - a clock and a relative time.
  - **The relative time:**
    - "Just now";
    - "{n} minutes ago", "{n} hours ago", "{n} days ago";
    - then a short localized date and time.
- **Load more:** a button while more pages exist, with a spinner while loading.

**Behaviour,** as in the app:
- Opening the sheet marks every notification read; closing it refetches.
- Tapping a row only expands or collapses it. Notifications' redirect links are no longer followed, which matches the app.

**States.**
- A skeleton on the first load.
- The app's empty state: a bell-off tile, "No notifications", and a description.
- **An error state the app lacks:** "Couldn't load notifications." with Try again, rather than a feed that silently looks empty.

**Removed from ssr:**
- the Radix popover;
- Novu's stock inbox UI: tabs, the filter menu, preferences, per-row menus.

`@repo/ui/notification` stays in the package for `apps/web`.

`.env.example` gains `NOVU_SOCKET_URL`, which the code already reads.

## Section 3 (4c): sign-in

**One frame for every `(auth)` page,** copied from the app's `Auth` template.

A full-screen `bg-primary` canopy holds:
- a round `size-10` back button to `/{lang}`, in place of the app's role pill;
- the white Unirefund mark (`@repo/ui/logo`, in `primary-foreground`);
- the screen's title (display size) and description (`text-primary-foreground/80`);
- on the right, a language chip with the app's translucent flag pill (`bg-card/20 rounded-full px-3 py-2`). It replaces today's `CountrySelector`.

A white card (`rounded-t-md bg-card`) rises 20 px over the canopy and runs to the bottom of the viewport. Its content scrolls inside it with `px-5`.

On wide screens the canopy stays full-width, and the column (the canopy text and the card) is centred at `max-w-md`.

The island stays hidden on `(auth)`, as sub-project 1 decided.

**Removed from the frame:**
- the grey page, the WebGL light rays and the server-health badge. Their components stay in the codebase.
- the `@ayasofyazilim/kyc/styles.css` import, the dead `kyc.tsx` files in `login/kyc`, `register` and `reset-password`, and the `@ayasofyazilim/kyc` dependency, which nothing else imports. The stylesheet re-declares `:root` with generic tokens, which is the off-brand override recorded in memory `web-app-ssr-kyc-css-overrides-tokens`.

**Login, `/{lang}/login`.**
- **Canopy:** the app's traveller title and description.
- **Fields:**
  - "Email or username", with a mail icon;
  - "Password", with a lock icon and a show/hide toggle.

  Both use the app's field shape: a label above, a bordered `h-12` box with the icon inside.
- **Buttons and links:**
  - a right-aligned "Forgot your password?" link to `/{lang}/reset-password`;
  - **Log In**, full width;
  - an outline "Continue with identity verification" button with a fingerprint icon, to `/{lang}/login/kyc`, with the app's caption under it;
  - a footer above a rule: "Don't have an account? **Create account**", to `/{lang}/register`.
- Submit stays disabled until both fields are filled.
- The server's error shows under the password field, as in the app, not as a toast. `?error=` still toasts the invalid-token message.
- **Fixed:**
  - the relative `reset-password` and `register` links;
  - the default redirect, which today produces `/{lang}//`. The target becomes `redirectTo` when present, otherwise `/{lang}`.
- Test ids `login-form`, `userName-input`, `password-input`, `password-link`, `submit-button`, `kyc-login-button` and `signup-link` are kept.

**Didit steps** (`/login/kyc`, and `/register` and `/reset-password` without a session):
- Today's flows sit inside the card under each screen's canopy title.
- The declined, pending, error and logging-in panels fit inside the card instead of today's `min-h-screen` panels, which overflow it.
- Every widget mount creates a real Didit session, so nothing remounts the widget before navigating away (memory `didit-widget-mount-creates-session`).

**Register form** (`/register?sessionId=…`), copied from the app's `DiditScreen`:
- **Fields:**
  - "Email", prefilled from Didit;
  - "Password", with a toggle and today's 6-character minimum;
  - "Phone", optional.

  The phone-type select goes; the number is sent as `MOBILE`, as the app does.
- **Sign Up** submits to today's create-traveller action.
- On success, it signs in with the Didit session through today's `loginViaSSRAction` and lands on `returnTo` or `/{lang}`. Today it sends the traveller to the login form. An error shows inline.

**Reset form** (`/reset-password?sessionId=…&email=…`), copied from the app's `ResetPasswordScreen`:
- The email in a chip (`rounded-md bg-foreground/5 p-4`, person icon).
- "New password" and "Confirm new password", sharing one show/hide toggle.
- A password shorter than 6 characters shows "too short" under the first field. A mismatch shows under the second. Today's form asks for 8; the server's own policy still applies.
- Submit goes to today's set-password action. On success: a toast, then `/{lang}/login?email=…`. An error shows inline.

**Logout,** `/{lang}/logout`: today's sign-out spinner, inside the same frame.

## Ported logic (`node:test`, `.ts`, relative imports)

| Module | From super-app | Provides |
| --- | --- | --- |
| `apps/ssr/src/utils/explore/viewport.ts` | `_lib/viewportRequest.ts`, `normalizeViewport.ts` | the bounds-to-request mapping, the 180° span check, the clusters-or-places normalisation (where ssr's hook does not already) |
| `apps/ssr/src/utils/explore/photon.ts` | `_lib/photon.ts`, `usePlaceSearch.ts` | the request URL and the de-duplicated result label |
| `apps/ssr/src/utils/explore/layers.ts` | `_lib/layers.ts` | each layer's icon key and fill class |
| `apps/ssr/src/utils/notifications/relative-time.ts` | `NotificationItem`'s `formatRelativeTime` | the relative-time rule, with an injected `now` |
| `apps/ssr/src/utils/notifications/summary.ts` | the sheet's summary line | the count and unread parts, and the show-more threshold |
| `apps/ssr/src/utils/auth/login-redirect.ts` | — (web-only) | the post-login target |
| `apps/ssr/src/utils/auth/password-rules.ts` | `ResetPasswordScreen` | too-short and mismatch |

`sector-control.tsx`'s `deriveSectorOptions` and `directions.ts` already exist in ssr and are reused.

## Strings

New and changed `SSRService` keys, in en and tr, with values from super-app's `en-US.json` and `tr-TR.json`:
- **`Explore.*`:**
  - new: `Controls.{ZoomIn,ZoomOut,Locate}`, `Search.{Placeholder,Clear}`, `Location.{Denied,Unavailable,Unsupported}`, and the search dropdown's loading and empty text;
  - today's `Layers`, `Layer.*`, `Sector`, `Sector.All`, `Place.NoAddress` and `Error` keep their keys, and take the app's wording where it differs.
- **`Notifications.*`:** new, with the app's `Title`, `Loading`, `NoNotifications`, `NoNotificationsDescription`, `DefaultSubject`, `NewBadge`, `ShowMore`, `ShowLess`, `NotificationCount`, `UnreadCount`, `LoadMore` and `RelativeTime.*`, plus a web-only `LoadFailed`.
- **`Auth.*`:** new keys for the app's traveller login copy, `Register.*` and `Reset.*`. Today's `Auth.*` keys keep their names.

Placeholders are `{0}` and `{1}`. Then run `pnpm --filter ssr run init`. Keys that end up unused are listed in each PR, not removed.

## Verification

**Gates** for each PR. Re-measure each baseline first.
- `pnpm --filter ssr test:unit`: 332 at 3b's head, plus the new suites.
- `pnpm --filter ssr type-check`: 0.
- `pnpm --filter ssr lint`: 0 errors.
- `pnpm --filter web type-check`: 0.
- `pnpm --filter ssr build` and `pnpm --filter web build`, with no dev server running on that checkout.

**Manual pass**, on this worktree's own ssr dev server at 375 px and 1280 px, never on the user's :3001:
- **4a:**
  - the map and pins;
  - pan and zoom, with fetches;
  - each sheet;
  - the sector filter;
  - search, then flying to a result;
  - locate, denied in the headless browser;
  - the island and control chain not overlapping.
- **4b:**
  - Needs `NOVU_SOCKET_URL` in the local, never committed `.env`. Without it there is no bell.
  - The badge, opening the sheet, rows, show more, load more, and the empty state.
  - Opening the sheet marks the dev test traveller's feed read, which is accepted for that account.
- **4c:**
  - Login: with `tur-a25y29041`, and with wrong credentials (the error under the password field).
  - Redirects with and without `redirectTo`.
  - The language chip, and the frame at both widths.
  - Each Didit page opened once and left, since every mount creates a session.
  - The register and reset forms need a real Didit session id, so they are recorded as not verified.

## Delivery

- **Worktree:** `C:\unirefund\web-app-wt-visual-parity-profile`.
- **4a:** branch `feat/ssr-visual-parity-explore`, cut from 3b's head (`feat/ssr-visual-parity-profile-cards`, #315).
- **4b:** branch `feat/ssr-visual-parity-notifications`, cut from 4a.
- **4c:** branch `feat/ssr-visual-parity-sign-in`, cut from 4b.
- Each PR targets the branch below it and is retargeted as that branch merges. Each gets its own plan, task reviews, final review and PR.
- unirefund-web only; super-app has no change.

## Out of scope

- The role gate, the onboarding slides, staff login and tenant selection.
- The app's old Explore list view and search-by-name (dropped in the app too).
- Notification deep links and Novu preferences.
- The dead email-token reset forms in `S/components/auth/` and `/api/auth/reset-password`.
- MapLibre in `apps/web`, and any change to the UI kit's `map`.
- The hard-coded `EXPLORE_COUNTRY_TENANT` (UNI-1659).
