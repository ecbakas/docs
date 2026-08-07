# Shared document-capture component

Extract the document-capture UI built for `apps/web` into a reusable component
consumed by **both** `apps/web` and `apps/ssr`, composed on top of the camera
infrastructure that already exists in `packages/ayasofyazilim-ui`.

## Where it lives: `packages/ui/src/unirefund/document-capture/`

`packages/ayasofyazilim-ui` was rejected on two counts:

1. It is a **git submodule** with its own repository, shared with `tahsilet-web`,
   `upwithcrowd-web` and other org products. Changes need a separate PR plus a
   submodule pointer bump.
2. It would pull the private `@ayasofyazilim-clomerce/capture-*` packages into
   the shared design system, forcing a `read:packages` token on every consumer
   repo — including ones with no document capture at all.

`packages/ui` (`@repo/ui`) is in-repo, already a dependency of both apps, and
already carries product composites under `src/unirefund/`
(`didit-verification`, `file-upload`). It lists `@repo/ayasofyazilim-ui` as a
dev dependency, so it can compose the UI kit **without modifying the submodule**.

`@repo/ui` gains `capture-core`, `capture-react` and `capture-platform`.

## Camera ownership: the SDK does not open the camera

`capture-core`'s `resolveVideo` only acquires a stream when the element is empty:

```ts
if (input instanceof HTMLVideoElement) {
  video = input;
  if (!video.srcObject) {
    video.srcObject = await openStream(defaultConstraints());
    ownsStream = true; // and only then is it stopped on destroy
  }
}
```

So the component attaches `useCameraStream`'s shared, ref-counted stream to the
`<video>` **before** `start()`. The SDK sees a host-provided stream, sets
`ownsStream = false`, and never acquires or stops a camera.

What that buys, none of which we would get by letting the SDK open its own:

- **One permission prompt** shared with the barcode / MRZ / credit-card
  scanners. On iOS Safari and WKWebViews the grant is not persisted, so a flow
  that opens several scanners otherwise prompts once per scanner.
- Torch, camera selector, remembered device, and busy-camera retry.
- No "camera busy" race when moving between scanners mid-flow.

Attachment follows the pattern already used by `barcode-camera-scanner`: set
`srcObject` once the stream is ready, and on cleanup set `srcObject = null`
**without** stopping tracks — the manager owns the lifecycle.

`useCameraStream({ enabled })` is gated on the component's own started state so
mounting does not open the camera.

`useCapture` from `capture-react` is kept rather than dropping to raw
`capture-core`: it works unchanged here provided `start()` is called only once
`camera.status === "ready"`, which the component controls.

## Public API

Playground controls stay in the demo page. The component takes them as props.

```ts
interface DocumentCaptureProps {
  // what to detect
  detectors?: DetectorKind[]; // default ["document"]
  detectorTier?: "classical" | "ml"; // default "classical"
  expectCard?: boolean;
  stableFrames?: number;
  minConfidence?: number;

  // capture behaviour
  autoCapture?: boolean; // default true
  continuous?: boolean; // default false
  bestOf?: number; // default 1

  // extraction (entirely optional)
  onExtract?: (
    result: CaptureResult,
    ctx: ExtractContext,
  ) => Promise<ExtractionAttempt>;
  autoExtract?: boolean;
  maxAttempts?: number; // default 6
  maxSeconds?: number; // default 45
  prefer?: "rectified" | "original"; // default "rectified"

  // outcomes
  onCapture?: (result: CaptureResult) => void;
  onExtracted?: (run: ExtractionRun) => void;
  onError?: (error: Error) => void;

  // presentation
  labels: DocumentCaptureLabels; // required
  assetPath?: string; // default "/docext/"
  autoStart?: boolean; // default true
  showControls?: boolean; // default true
  showResult?: boolean; // default true
  showDiagnostics?: boolean; // default false
  testIdPrefix?: string; // default "document-capture"
  className?: string;
}
```

Two decisions worth stating:

**`labels` is required, not `useTranslations`.** A package component cannot
reach an app's i18n provider. `CameraSurfaceLabels` already establishes the
prop-based pattern in this codebase; each app maps its own dictionary.

**`onExtract` keeps transport in the app.** The component never knows about a
proxy route, so `apps/web` and `apps/ssr` each own their handler and either may
omit extraction entirely by not passing the prop. The component still owns the
retry _loop_ — attempts, time budget, `Retry-After`, retryability — and the
field table, because that logic is transport-agnostic and worth sharing.

It returns a package-owned union so no app types leak inward:

```ts
type ExtractionAttempt =
  | { status: "done"; run: ExtractionRun }
  | {
      status: "error";
      reason: ExtractionErrorKey;
      retryable: boolean;
      details?: string[];
      retryAfterMs?: number;
    };
```

## Two things that changed during implementation

**The route handler moved into `@repo/actions`.** It would otherwise have been
duplicated verbatim in both apps, and the two copies contain the auth gate and
the credential handling — the last code that should be allowed to drift. It now
lives at `packages/actions/unirefund/DocumentExtraction/`, and each app's
`app/api/document-extraction/route.ts` is a three-line re-export.

**The transport helper moved into `@repo/ui` as `submitDocumentCapture`.** The
design said transport stays app-side, but both apps speak to the same route
with the same contract, so app-side meant "duplicated". `@repo/ui` already
depends on `@repo/actions`, so it can import the wire contract without a
dependency cycle. `onExtract` remains a prop, so an app with a different
backend can still supply its own.

**Labels are all under one `DocumentCapture.` prefix in `core/Default`**, not a
per-feature namespace folder — a new `language-data` folder is reserved for
actual services. `apps/web` initially borrowed the five generic camera strings
from `TagService`; that was dropped so both apps read every label from the same
prefix and the two label builders are identical. `apps/ssr` carries only the 74
keys the component itself renders — the 32 playground-panel keys exist solely
in `apps/web`.

## Internal structure

| File                     | Responsibility                                            |
| ------------------------ | --------------------------------------------------------- |
| `index.tsx`              | `DocumentCapture` — composition and layout only           |
| `types.ts`               | Props, labels, `ExtractionAttempt`                        |
| `use-capture-session.ts` | Camera stream ↔ SDK session wiring, capture state        |
| `use-extraction.ts`      | Manual submit and the auto-extract loop                   |
| `lib.ts`                 | Key maps, formatting, object-URL lifetime, retryability   |
| `submit.ts`              | `submitDocumentCapture` — the ready-made transport        |
| `_components/*`          | Quad overlay, quality meters, capture result, field table |

## App wiring

Both apps need the same three things, because the SDK loads its engines from
each app's own origin:

1. `postinstall: capture-assets copy public/docext`
2. `/apps/*/public/docext` gitignored
3. **`docext` excluded from the middleware matcher.** The middleware treats the
   first path segment as a locale, so an unexcluded `/docext/manifest.json`
   redirects to `/en/docext/…` and serves HTML — the SHA-256 manifest check then
   fails and the engines never load, with no clue that routing caused it. This
   happens whether or not the user is signed in, because the locale redirect
   runs before the auth check.

`apps/web` keeps its existing `/api/document-extraction` handler and its
playground page, now a consumer of the shared component.

`apps/ssr` gets the same handler and an authenticated usage page under
`(main)`.

### Security note for `apps/ssr`

`apps/ssr` has a `(public)` group — the unauthenticated traveller `validate`
flow. The extraction route added here is gated on `auth()` exactly as the web
one is, and is therefore **not** usable from that public flow. Exposing
extraction to unauthenticated travellers would let anyone on the internet spend
the platform API key; doing so safely needs a per-flow guard (a scoped token or
rate limit) that is out of scope here and must be designed deliberately rather
than inherited by accident.

## Testing

`apps/web` and `apps/ssr` have no unit-test runner (Jest lives only in the
`ayasofyazilim-ui` submodule), so the gate is `type-check` + `lint` in both
apps and `@repo/ui`, plus the i18n scripts, plus manual verification against a
real camera over HTTPS.

**`next build` must not be run while a dev server is up** — both use the same
`.next`, and the build strips the dev HMR chunks, leaving the browser in a
`ChunkLoadError` reload loop.
