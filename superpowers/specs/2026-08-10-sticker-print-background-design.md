# Sticker label print background

## Problem

`Print sticker labels` on the sticker details page prints one blank 70x100mm page
per sticker line, carrying nothing but a 20x20mm QR code. The pre-printed sticker
artwork lives at `apps/web/public/unirefund_sticker_70x100mm.pdf` and is not used,
so labels can only be printed onto stock that already carries the artwork.

Operators need the option to print the artwork and the QR together, onto blank
stock, without losing the existing blank-label behaviour.

## Scope

`web-app/apps/web` only. One component, one new dependency, two i18n keys. No
server action, API, or backend change - the PDF is a static public asset.

## Behaviour

A second toggle, `Add background`, sits beside the existing `Only unused lines`
toggle in the dialog's control row:

```
+----------------------------------------------------------+
|  [o] Only unused lines   [o] Add background   3 label(s)  |
+----------------------------------------------------------+
```

When on, every 70x100mm page shows the PDF artwork edge to edge behind the QR.
**The QR does not move**: it stays 20x20mm, 20mm from the top, 10mm from the
right, exactly where it prints today. The artwork was designed around that spot.

The toggle defaults to off and is not persisted across dialog opens.

It is a `Switch` rather than a `Checkbox`, matching its neighbour - two adjacent
toggles of different types read as accidental.

## Rendering pipeline

`pdfjs-dist@^5.4.296` is added to `apps/web/package.json`. That is the version
`react-pdf@^10.2.0` already resolves inside `@repo/ayasofyazilim-ui`, so the pnpm
store holds it already.

Switching the toggle on runs, inside the `onCheckedChange` handler:

```
fetch("/unirefund_sticker_70x100mm.pdf")
  -> pdfjs.getDocument(...).promise -> getPage(1)
  -> scale = 827 / page.getViewport({ scale: 1 }).width
  -> viewport = page.getViewport({ scale })
  -> render to an offscreen canvas sized viewport.width x viewport.height
  -> canvas.toDataURL("image/png") -> cached in state
```

827px is 70mm at 300 DPI, so the canvas comes out 827 wide and - for artwork with
a true 70:100 page box - 1181 tall. The canvas takes its height from the scaled
viewport rather than a hardcoded 1181, so artwork with a slightly different page
box rasterises undistorted; the `<img>` then stretches it to the label. Deriving
`scale` from the page's own rendered width, rather than assuming a
198.43 x 283.46pt MediaBox, keeps the output at 300 DPI either way. The PDF's
actual page size was not verifiable while writing this spec.

The work happens in the event handler, not a `useEffect` - the repo's
`avoid-use-effect` rule treats this as an event-driven update.

The data URL is cached in state, so toggling off and on again does not re-render
the PDF. It is cleared when the dialog closes, alongside the labels.

### Worker

```ts
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();
```

`@repo/ayasofyazilim-ui` points its worker at jsDelivr. That pattern is
deliberately not copied here: a printed sticker is permanent, and a CDN outage
silently degrading a print run is a bad trade. If Turbopack will not resolve the
bundler URL, the fallback is copying the worker into `public/` from `init.ts`.

## Print path

`StickerLabelPage` takes an optional `backgroundUrl` and renders it beneath the
existing QR:

```tsx
{backgroundUrl && (
  <img alt="" className="absolute inset-0 h-full w-full" src={backgroundUrl} />
)}
```

`useReactToPrint` and `LABEL_PAGE_STYLE` are untouched. The preview and the print
come from the same DOM, so the preview shows exactly what prints.

This is an `<img>` and not a CSS `background-image` on purpose. Background images
print only when the operator has ticked `Background graphics` in the browser's
print dialog; an `<img>` always prints. Relying on a print-dialog checkbox would
mean a whole book quietly printing without artwork.

The image fills the label rather than fitting inside it. The artwork is the label,
so any aspect-ratio mismatch is a fault in the asset, not something to letterbox
around.

## Failure modes

| Case                     | Behaviour                                                                 |
| ------------------------ | ------------------------------------------------------------------------- |
| PDF fetch or render fails | Toast `StickerHeader.PrintLabels.BackgroundUnavailable`; the toggle reverts to off. A run never prints without artwork while the toggle reads on. |
| Background still rendering | Print button disabled, via an `isBackgroundPending` flag separate from the existing label-fetch `isPending`. |
| QR unencodable            | Unchanged. The dashed placeholder now sits on the artwork.                |

## i18n

New keys in `apps/web/src/language-data/unirefund/TagService/resources/`, both
`en.json` and `tr.json`:

| Key                                              | en                                                                                | tr                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `StickerHeader.PrintLabelsBackground`            | Add background                                                                    | Arka plan ekle                                                                              |
| `StickerHeader.PrintLabels.BackgroundUnavailable` | The label background could not be loaded. Labels will print without it.           | Etiket arka planı yüklenemedi. Etiketler arka plan olmadan yazdırılacak.                    |

`i18n/*.gen.json` is generated - never edited by hand.

## Test IDs

`print-sticker-lines-background` on the `Switch`,
`print-sticker-lines-background-label` on its `Label`, following the existing
`print-sticker-lines-unused-only` pair.

## Verification

`apps/web` has no unit-test runner and the print modal has no Playwright
coverage today, so this feature is verified by:

1. `pnpm run init` - required before `tsc` resolves the new i18n keys
2. `pnpm --filter web type-check`
3. `pnpm --filter web lint`
4. Manual print preview: artwork fills the page edge to edge, QR sits at
   20mm from the top and 10mm from the right, page count is unchanged,
   and the toggle-off path still prints blank labels.

## Out of scope

- Replacing `react-to-print` with generated-PDF output (`pdf-lib`). Considered
  and rejected: vector artwork and exact point placement are not worth two new
  dependencies, a preview that diverges from the output, and in-browser
  generation of books running to thousands of pages.
- Committing a pre-rasterised PNG beside the PDF. Rejected as a second asset to
  keep in sync.
- Changing QR size or position.
