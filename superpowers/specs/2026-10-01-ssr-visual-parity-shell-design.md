# ssr visual parity, sub-project 1: tokens and the shell

**Goal.** `web-app/apps/ssr` should look and navigate like super-app's traveller app, with the same navigation, the same pages and the same routes. Both apps share one token set and font, taken from `web-app/apps/web`. This is sub-project 1 of 4.

## Sub-projects (user decision, 2026-10-01)

Each sub-project gets its own spec, plan and pull request, in this order:

1. **Tokens and shell:** the shared tokens and font in both apps, the island everywhere, the page header, the app's route names, the Profile hub and the FAQ page. This spec covers it.
2. **Home dashboard, Tags list and tag detail.**
3. **Profile in full:** identity hero, verification strip, edit profile, cards, and documents (this pulls in roadmap Wave 3's documents page).
4. **The rest:** Explore controls, the notifications sheet, and the sign-in screens.

## Decisions (user, 2026-10-01)

1. **The island on every screen size.** This is the app's floating bottom bar, with the same five slots everywhere, desktop included.
2. **Signed-out visitors also get the island.**
   - Home goes to `/`, which shows today's landing hero.
   - Tags and Profile go to sign-in.
   - FAQ and Scan work without signing in.
3. **Tokens and fonts.** `apps/web`'s light tokens and its Geist font become the Unirefund design tokens, in **both** ssr and super-app.
4. **No redirects.** Nothing is in production yet, so old ssr URLs are dropped. The one exception is the QR contract below.
5. **Footer and chat.**
   - The footer is no longer rendered, but `Footer` stays in the codebase.
   - The floating chat bubble goes. The FAQ page opens the chat.
   - `ChatbotWidget` stays in the codebase.

## The QR contract (binding on all four sub-projects)

QR codes are generated outside ssr, and a phone's own camera opens them straight in a browser. These two routes must keep working signed out, with their current shapes.

| Producer | QR content | ssr route |
| --- | --- | --- |
| pos-app receipt (`resolveTagLink`) | backend `publicLink`, or `https://<ssr-host>/tag/<slug>` | `/tag/<slug>` (the locale is added by the middleware) |
| apps/web tag print and tag summary | `tagDetails.publicLink` | `/tag/<slug>` |
| apps/web sticker labels (`buildTagUrl`) | `https://<ssr-host>/tag/<slug>` with the `s` key | `/tag/<slug>` |
| apps/web airport kiosk rolling QR | `{base}/{lang}/validate?qrValue=…` | `/{lang}/validate` |

- **Decoding.** Slugs and validate values are decoded only through `@unirefund/qr` (the `unirefund-qr` repo). ssr never reimplements that format.
- **`/tag` lookup page.** The bare `/tag` page also stays. The slug page falls back to it when a slug carries too little, and its "Try again" link points there.

## Section 1: tokens, fonts and the page frame

**Source of truth:** the light `:root` block in `apps/web/src/components/styles/custom.css`.

| Token | Value |
| --- | --- |
| `--radius` | `0.65rem` |
| `--background` / `--card` / `--popover` | `oklch(1 0 0)` |
| `--foreground` / `--card-foreground` / `--popover-foreground` | `oklch(0.141 0.005 285.823)` |
| `--primary` | `oklch(0.577 0.245 27.325)` |
| `--primary-foreground` | `oklch(0.971 0.013 17.38)` |
| `--secondary` / `--muted` / `--accent` | `oklch(0.967 0.001 286.375)` |
| `--secondary-foreground` / `--accent-foreground` | `oklch(0.21 0.006 285.885)` |
| `--muted-foreground` | `oklch(0.552 0.016 285.938)` |
| `--destructive` | `oklch(0.577 0.245 27.325)` |
| `--border` / `--input` | `oklch(0.92 0.004 286.32)` |
| `--ring` | `oklch(0.704 0.191 22.216)` |

**Status tokens.** `apps/web` has none, because it uses Tailwind palette colours. Both apps add the same extra set, using super-app's current values, which are already Tailwind 600 shades:

| Token | Base | Surface | Strong |
| --- | --- | --- | --- |
| success | `#16a34a` | `#f0fdf4` | `#15803d` |
| warning | `#d97706` | `#fffbeb` | `#b45309` |
| info | `#2563eb` | `#eff6ff` | `#1d4ed8` |
| error | `#dc2626` | `#fef2f2` | — |
| recent | `#7c3aed` | `#f5f3ff` | — |

**Fonts.**
- **Geist** is the sans font in both apps.
- **Geist Mono** is the serial font, `font-serial`. It is used for tag, document and card numbers.
  - `apps/web`'s own `--font-mono` currently points at the Geist sans file. This work does not change that.

**In web-app:**
- The light core tokens above move into one shared file, `packages/ui/src/styles/unirefund-tokens.css`, exported as `@repo/ui/styles/unirefund-tokens.css` through a new `exports` entry.
- `apps/web` imports the shared file and drops those lines from `custom.css`, so its **computed values are unchanged**.
- `apps/web` keeps its chart, sidebar, `--logo-secondary` and `.dark` tokens.
- ssr imports the shared file after `@repo/ayasofyazilim-ui/globals.css` and adds the status tokens to its Tailwind v4 theme, so classes like `bg-success/15` and `text-info-strong` work.
- ssr loads fonts as follows, and drops Figtree and the inline `--primary` style on `<html>`:
  - **Geist** through `next/font/local`, from a copy of `apps/web/public/GeistVariable.woff2` in `apps/ssr/public`.
  - **Geist Mono** through `next/font/google` (`Geist_Mono`), as `--font-serial`.
- The `ayasofyazilim-ui` submodule is **not** changed.

**In super-app:**
- `src/global.css` (RGB channels) and its hex mirror `src/utils/theme.ts` take the same values, converted from oklch.
- The existing sync test (`utils/__tests__/theme.test.ts`) and the hex ban (`components/rnr/__tests__/tokens.test.ts`) keep holding.
- The radius goes to `0.65rem`, mapped into `tailwind.config.js`, so `rounded-md` and `rounded-lg` follow the token.
- Fonts load through `expo-font` from `@expo-google-fonts/geist` and `@expo-google-fonts/geist-mono`, using static weights 400, 500, 600, 700 and 800. React Native cannot drive a variable font's weight axis, so NativeWind's `font-*` weight classes map to the matching family names.
- **Visible change:** the page goes from grey (`#f4f5f7`) to white.
- Dark mode is out of scope; only the light tokens are shared.

**Surfaces.**
- The shared `Card` is `rounded-xl shadow-sm`, and lives in the submodule. ssr adds a small local `Surface` primitive instead: `rounded-md border border-border bg-card`, no shadow, matching the app's card.
- The shell's new pieces use `Surface`. Sub-projects 2 and 3 move the existing pages onto it.

**Page frame.**
- Tab pages sit in a centred `max-w-3xl` column with `px-4 pt-4`.
- The bottom padding clears the island.
- Explore stays full-bleed.

## Section 2: the island and the page header

**`TabIsland`.** A client component, fixed at the bottom centre on every screen size, 20 px above the bottom plus the safe-area inset.

- **Geometry.** Ported from super-app's `src/components/blobChain.ts`, with its tests:
  - two capsules (Home + Tags, FAQ + Profile) and a centre circle, joined by fillets;
  - the constants `BAR_RADIUS 30`, `BAR_H_PADDING 16`, `BAR_BOTTOM_GAP 20`, `SLOT_PITCH 48`, `GAP 58` and `FILLET 10`, scaled down on narrow viewports.
- **Drawing.** One SVG path, filled with `card` at 92%, with a backdrop blur and a hairline `border`. The centre circle is `primary`, with a red shadow.
- **Active slot.** A `foreground` circle marker (inset 5 px), with a white icon. Other icons are `muted`. The marker moves between slots with a CSS transition.
- **Labels.** There are no text labels, only `aria-label`s.
- **Which slot is active.** It is derived from the pathname:

  | Pathname | Active slot |
  | --- | --- |
  | `/` | Home |
  | `/tags*` | Tags |
  | `/faq` | FAQ |
  | `/profile*` | Profile |

  Scan is never active.
- **Icons.** The app's Ionicons glyphs, inlined as small SVG components. Ionicons is MIT licensed, so this adds no dependency.
  - Home: `home` / `home-outline`
  - Tags: `pricetags` / `pricetags-outline`
  - Scan: `qr-code-outline`
  - FAQ: `help-circle` / `help-circle-outline`
  - Profile: `person` / `person-outline`
  - Header: `notifications`, `arrow-back`

  The rest of ssr keeps `lucide-react`.

**Scan.** The centre button opens a full-screen overlay titled "Scan QR code", built on `BarcodeCameraScanner` (`@repo/ayasofyazilim-ui/custom/barcode-camera-scanner`).
- **Routing.** A pure helper routes the result through `@unirefund/qr`:

  | Scanned value | Destination |
  | --- | --- |
  | `isValidateScan` is true | `/{lang}/validate?qrValue=<extractValidateQrValue>` |
  | `slugFromScan` returns a slug | `/{lang}/tag/<slug>` (tags and stickers) |
  | anything else | an "Unrecognised code" toast |

- **Camera problems.** If the camera is denied or missing, the overlay says so.
- **No manual entry.** There is no manual-entry link (decision 3 of Wave 2).

**Signed out.**
- The island is the same.
- Home goes to `/` (the hero).
- Tags and Profile go to `/{lang}/login?redirectTo=<target>`.
- FAQ and Scan work.

**Where the island is hidden.**
- The `(auth)` layout, which holds the sign-in screens.
- The `/validate` flow, which is a focused full-screen flow in both apps and keeps its own back control.

It is shown everywhere else, including `/explore` and `/tag/<slug>`.

**`PageHeader`.**
- **Title:** `text-3xl font-bold`, with an optional accessory under it. On Home the accessory is the document pill.
- **Back button:** a 40 px round bordered back button on sub-pages (tag detail, the profile sub-pages, `/tag/<slug>`).
- **Right slot, signed in:** the bell with a red unread count. It opens the existing Novu inbox, still as a popover; sub-project 4 turns it into a sheet.
- **Right slot, signed out:** a "Sign in" button.

Page bodies pad their bottom to clear the island.

## Section 3: routes, and where the navbar's controls go

| Route | Shell content | Later |
| --- | --- | --- |
| `/` | **Signed in:** a PageHeader ("Hello, {name}", document pill, bell) over an interim body with today's Tags and Explore buttons. **Signed out:** today's landing hero, unchanged, with the island over it. | Sub-project 2: the app's Home dashboard |
| `/tags`, `/tags/[tagNumber]` | Today's pages under the PageHeader: "Tags", and back on the detail page | Sub-project 2 |
| `/faq` | New (below) | |
| `/profile` | New hub (below) | Sub-project 3 |
| `/profile/edit-profile` | Today's account form, moved from `/account` | Sub-project 3 |
| `/profile/cards` | Today's cards page, moved from `/account/cards` | Sub-project 3 |
| `/profile/change-password` | Moved from `/account/change-password`. Web-only until the app gains it (Wave 3). | |
| `/explore` | Unchanged, full-bleed, reached from Home | Sub-project 4 |
| `/tag/<slug>`, `/{lang}/validate`, `/tag` | Unchanged (the QR contract) | |
| `/privacy`, `/account-deletion` | Kept: the store-listed legal pages, linked from Profile | |
| `/account`, `/account/cards`, `/account/change-password` | **Removed**, with the account tab layout. No redirects. | |

`(auth)`, `/document-capture`, `/unauthorized` and `/logout` are not touched. `/document-capture` belongs to the extraction work.

**Controls from the old navbar.**

| Control | New home |
| --- | --- |
| Bell | PageHeader right slot |
| Sign in | PageHeader right slot, when signed out |
| Document switcher | Home's header accessory: `TravellerDocumentSwitcher`, restyled as the app's `ActiveDocumentPill` (plain text with one document, a bordered pill with a chevron with two or more) |
| Language | Profile hub row |
| Log out | Profile hub row |

`DefaultNavbar` and `Footer` are no longer rendered in `(main)` or `(public)`, but both stay in the codebase.

**Profile hub (shell version).** The app's `SettingsGroup` look:
- a small uppercase kicker for each group;
- a `rounded-md` bordered list;
- rows with a 36 px icon bubble, a title, an optional value and a chevron;
- dividers inset 60 px.

| Group | Rows |
| --- | --- |
| Account | Personal information → `/profile/edit-profile` |
| Wallet | Cards → `/profile/cards` |
| App | Language (opens the existing language list in a dialog); Change password → `/profile/change-password` |
| Legal | Privacy policy → `/privacy`; Account deletion → `/account-deletion` |
| Session | Log out (red) |

Each row that calls an endpoint stays gated on its endpoint's group and leaf grant, as today. Sub-project 3 adds:
- the identity hero;
- the verification strip;
- the documents row;
- row counts.

**FAQ (`/faq`).**
- **Header:** `PageHeader` "FAQ".
- **Content:** two sections, "Tax Free" and "Tags", with three questions each. The strings come from super-app's `MobileApp.FAQ.*` (en-US and tr-TR), added as new `SSRService` keys in `en.json` and `tr.json`.
- **Questions:** each is the app's accordion card, with a help icon square and a chevron. Only one is open at a time.
- **Chat with support:** a button that opens Chatwoot through `@repo/ui/chatbot/trigger`. The widget is mounted with its bubble hidden. The button shows only when Chatwoot is configured.

## Section 4: testing and delivery

**Unit tests.** These are `node:test`, `.ts` only, under ssr's `test:unit`:
- island geometry, ported from super-app's `blobChain` tests;
- the active slot for a pathname, signed in and signed out, including the signed-out Home → `/` rule;
- scan routing: fixtures built with `buildTagUrl`, `buildValidateUrl`, a sticker slug, pos-app's locale-less URL, and an unrelated URL;
- the Profile hub's rows for a given grant set;
- the FAQ's single-open rule.

**Gates.**
- **ssr:** `test:unit`, `type-check`, `lint` (0 errors, including the `data-testid` rule), and `build` (stop the dev server first).
- **apps/web:** `type-check` and `build`, because it imports the shared token file.
- **super-app:** full `npx jest`, `npm run typecheck` (exactly the 1 known error), and eslint on the touched files.

**Manual pass.**
- **ssr with Playwright:** at 375, 768 and 1440 px wide, signed in as the dev test traveller and signed out. Cover every island destination, the scanner overlay (Chromium fake camera: both flags and a Y4M file), and a camera-style open of a `/tag/<slug>` URL and a `/{lang}/validate?qrValue=` URL.
- **super-app on CPadNFC through Metro:** Geist loads, and the new colours show on Home, Tags and Profile. Screenshots go side by side with the ssr ones.

**Delivery.**
- **unirefund-web:** a new worktree on `feat/ssr-visual-parity-shell`, cut from `feat/ssr-visual-parity` (the user's umbrella branch). The PR targets `feat/ssr-visual-parity`, which collects sub-projects 1–4 and then merges to `main`.
- **unirefund-mobile:** `feat/unirefund-tokens` from `main`, in the shared checkout. It doesn't touch #64 or #65's files.

## Out of scope

- The page contents that sub-projects 2–4 own: Home dashboard, tag rows and detail, the Profile hero, cards, documents, Explore controls, the notifications sheet, and sign-in screens.
- Dark mode in either app.
- Changing the `ayasofyazilim-ui` submodule, or `apps/web`'s computed look.
- Any change to QR formats, or to `unirefund-qr`.
