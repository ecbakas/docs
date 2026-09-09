# SP4: the UI kit foundation — pos-app

**Date:** 2026-09-09
**Repo:** `pos-app` (`unirefund-pos`)
**Branch point:** `feat/tenant-memory` (SP3), which sits on SP2 → SP1 — **not `main`**
**Program:** [2026-09-09-posapp-parity-program-design.md](2026-09-09-posapp-parity-program-design.md) — sub-project 4 of 7
**Covers:** the substrate T3/T4/T5 need. **Ships no user-visible feature of its own**, with one exception noted below.

## Goal

pos-app can build super-app's tag screens out of the same components super-app
builds them from.

## Why

super-app's tag list and detail are assembled almost entirely out of a shared
kit: `Text` carries the type scale, `Card` the panel, `Badge` the status chip,
`Skeleton` the loading shape, `BlobPagination` the pager, `MoreActionsSheet`
the overflow. pos-app has none of it. Its tag list is one 348-line file with an
inline row component and a status map written in Tailwind's default palette —
which its own [`AGENTS.md`](../../../pos-app/AGENTS.md) forbids ("Colour is
always a semantic token, never a hex or a Tailwind default-palette class").

Porting the screens without the kit would mean hand-writing every class string
at each site, which is how super-app's own pre-kit code drifted: eleven
hand-written cards differing only in which grey the border was.

## Decisions

Two were put to the user and answered:

1. **`Button` is replaced outright, accepting the app-wide restyle.** super-app's
   API is a superset of pos-app's — same `action` / `isLoading` /
   `containerClassName` / `textClassName` / `iconName` / `iconColor` — so no
   call site breaks. But the look changes everywhere: `rounded-xl` → pill,
   `py-4` → `py-3`, `text-lg` → `text-base`, `text-white` → the
   `primary-foreground` token. Four files import it.
2. **`Input` is added alongside, not replaced.** pos-app's is a labelled form
   field (`title` and `iconName` both required, `mb-3`, hardcoded greys);
   super-app's is a bare control with a `size` prop, which is what the tag
   search pill needs. They do different jobs, and migrating login, register,
   sale, customer and the traveller search is a change with real risk on every
   data-entry screen of a POS terminal — not something to smuggle into a
   substrate sub-project. Recorded as a known duplication.

And, from the program's constraints:

3. **`BlobMaterial` ports SVG-only.** Its `GlassContainer`/`GlassView` branch is
   iOS 26 and its `BlurView` branch is pre-26 iOS. There is no `ios/` directory
   in this repo, so Android's path — a `react-native-svg` `Path` filled
   `colors.card` at `fillOpacity` 0.92 with a hairline `colors.border` stroke —
   is the only one that ever ran. No `expo-blur` or `expo-glass-effect`
   dependency is added; `react-native-svg` 15.12.1 is already present.
4. **Only what has a consumer comes across.** Dropped: `PageHeader` (pos-app's
   `ModalTemplate` owns its own header, and swapping it would rewrite a
   template every screen uses), `GlassIsland` and `blobBarChain` + the `BAR_*`
   constants (no tab island — pos-app's `(auth)` is a plain `Stack`),
   `groupsAround` (tab-bar only), `SelectField` (no consumer until a later
   sub-project), `BlobActionRow` and `ActionFooterRow` (the user chose
   `ModalTemplate`'s footer over the blob chain for tag actions).
5. **The six tag utility modules move out of SP4.** The program doc put
   `tagStatus`, `tagAmounts`, `tagDeadline`, `tagJourney`, `tagActions` and
   `actionTier` here. That was wrong: SP4 would ship a pile of modules with no
   caller. `tagStatus` and `tagDeadline` go to SP5 with the card that reads
   them; the other four to SP6 with the detail screen.
6. **`useTabBarInset` has no pos-app equivalent, so `BottomChrome` uses the
   safe-area bottom inset instead.** In super-app that hook returns the floating
   tab island's height and 0 outside a tab navigator — which is every screen
   here. The pager still has to clear the system navigation bar, and
   `insets.bottom` is what does that.

## What lands

### Tokens

`tailwind.config.js` gains three colours and one font family; `global.css`
gains their variables. pos-app's palette is otherwise already super-app's.

| Token | Value | Needed by |
| --- | --- | --- |
| `primary-foreground` | `255 255 255` | every filled `Button`, `Badge variant="solid"`, `Text tone="onPrimary"` |
| `input` | `209 213 219` | `Card variant="dashed"`, `Input`'s border, `MoreActionsSheet`'s row divider |
| `placeholder` | `156 163 175` | `Input`'s icon and placeholder |
| `font-serial` | `platformSelect({ ios: "Menlo", default: "monospace" })` | a tag number is a docket serial; SP5's card sets it in a monospace face so digits line up down the list |

`background` stays white. super-app uses `#f4f5f7` so its white cards stand
out, but its `Card` also carries `border border-border`, so a card reads
correctly on white too — and changing pos-app's page background would touch
every screen for no gain here.

### `src/utils/theme.ts` — new

super-app's `colors` object, minus nothing: the palette in the form the handful
of non-className props need (`placeholderTextColor`, `ActivityIndicator`'s
`color`, `react-native-svg` fills). Its test parses `global.css` and fails if a
token drifts, is added on one side only, or is removed.

### `src/components/ui/` — new

`Text`, `Card`, `Badge`, `Button`, `Input`, `Label`, and the `index.ts` barrel.
All port verbatim except `Button` (see below) and the barrel (no `SelectField`).

`src/components/Button.tsx` is **deleted** and its four import sites move to
`@/components/ui`. A re-export shim would leave two paths to the same
component and no reason to prefer either.

### `src/components/` — new

| File | Note |
| --- | --- |
| `Skeleton.tsx` | verbatim; `SkeletonRoot` needs `MobileApp.Common.Loading` |
| `skeletonClassName.ts` | verbatim |
| `blobChain.ts` | `blobChain`, its types and the `round` helper only |
| `BlobMaterial.tsx` | SVG-only per decision 3 |
| `BlobRow.tsx` | verbatim (`ROW_RADIUS` 20, `ROW_GAP` 10, `FILLET` 7, `GAP` 26) |
| `BlobPagination.tsx` | verbatim, with the pager's a11y labels re-namespaced |
| `BottomChrome.tsx` | `useTabBarInset` → `useSafeAreaInsets().bottom` per decision 6 |
| `MoreActionsSheet.tsx` | verbatim |

### `src/components/BottomSheet.tsx` — modified

Gains `busy`, which locks **every** dismissal route at once — backdrop
`pressBehavior`, pan-to-close, and the Android back key — because leaving any
one live defeats the others. Read through a ref by the back-press subscription,
which registers once and would otherwise close over `busy` as it stood at
mount. `MoreActionsSheet` does not need it; SP7's switcher does, and it belongs
with the component rather than with its first caller.

Its container also moves onto tokens: `bg-white` → `bg-card`,
`border-gray-400` → `border-border`. That is a small visual change to every
sheet (a lighter border) in a file already being edited, and the current
spelling violates the repo's own semantic-token rule.

### `src/templates/Modal.tsx` — modified

The footer gains a **secondary action and an overflow**, which is the user's
chosen answer to T5. Today `action` renders one full-width `bg-primary py-4
rounded-full` button. It becomes:

- `action` — the primary, rendered as `Button` (filled, `size="md"`)
- `secondaryAction?` — beside it, rendered as `Button variant="outline"`
- `moreActions?: MoreAction[]` — an overflow control that presents a
  `MoreActionsSheet`

The two pills sit in a row and the overflow is a trailing icon button. The
existing single-`action` behaviour is unchanged when the new props are absent,
so no current caller moves.

### i18n

Four keys in both locales, under a new `Common` namespace rather than borrowed
from `Tags`: the pager and the overflow sheet are generic.

| Key | en-US | tr-TR |
| --- | --- | --- |
| `MobileApp.Common.Loading` | Loading… | Yükleniyor… |
| `MobileApp.Common.MoreActions` | More actions | Diğer işlemler |
| `MobileApp.Common.Pager.First` | First page | İlk sayfa |
| `MobileApp.Common.Pager.Previous` | Previous page | Önceki sayfa |
| `MobileApp.Common.Pager.Next` | Next page | Sonraki sayfa |
| `MobileApp.Common.Pager.Last` | Last page | Son sayfa |

super-app namespaces the pager's labels `MobileApp.Tags.Pager.*`. Diverging is
deliberate: the component is not tag-specific, and SP5 should not have to own
keys for a pager it merely uses.

## Testing

New — `src/utils/__tests__/theme.test.ts`: parses `global.css` and asserts every
`colors` entry matches its variable, that neither side has an entry the other
lacks, and that no value is a bare hex outside the file.

New — `src/components/__tests__/blobChain.test.ts`: the geometry is pure and is
where a silent regression would hide.

- a single group of one slot is a circle: width `2 * radius`, one centre
- slot centres are `slotPitch` apart within a group
- `segments` covers each group, and a one-slot group's segment is square
- a `gap` wider than `2 * (radius + fillet)` throws rather than emitting a path
  with a straight waist
- the path closes (`Z`) and starts at the left cap's centre line
- `[2, 1, 2]` — the pager's own shape — yields three segments and five centres

New — `src/components/__tests__/uiTokens.test.ts`: asserts no file under
`src/components/ui/` contains a hex literal or a Tailwind default-palette colour
class, which is the rule that decayed in the code this kit replaces.

New — `src/components/__tests__/Skeleton.test.tsx`: `SkeletonRoot` announces
once as a `progressbar`; `Skeleton` merges a caller's className last.

New — `src/components/__tests__/MoreActionsSheet.test.tsx`: dismisses before
running an action (the two-detached-sheets trap), runs nothing when dismissed
without a selection, renders a description and the destructive tone.

Extended — `src/components/__tests__/BottomSheet.test.tsx`: `busy` blocks the
Android back key while open, and does not swallow it while closed.

Extended — `src/templates/__tests__/Modal.test.tsx`: a single action still
renders alone; a secondary renders beside it; two or more `moreActions` present
the overflow; the footer's measured height still reaches the scroll view's
padding.

## Risks

**The Button restyle is app-wide and was explicitly accepted.** Four import
sites, no API change, but every button on the terminal changes shape. It is the
one user-visible change in an otherwise invisible sub-project, and it is worth
a look on-device before merge rather than after.

**Two `Input` components will drift.** Accepted deliberately (decision 2). The
mitigation is that they are named for their jobs — `@/components/Input` is the
labelled form field, `@/components/ui` is the control — and that migrating the
forms is recorded as a follow-up rather than forgotten.

**`BottomChrome` is ported ahead of its consumer.** Nothing renders it until
SP5. Its correctness rests on the blobChain tests and on SP5 exercising it for
real; the alternative — deferring it to SP5 — would split the pager across two
sub-projects.

## Out of scope

The tag screens themselves (SP5, SP6), the tag utility modules that go with
them (decision 5), and migrating pos-app's form `Input` (decision 2).
