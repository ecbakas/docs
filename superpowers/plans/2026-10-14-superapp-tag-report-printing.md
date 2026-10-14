# Tag report printing on Bluetooth printers (super-app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a tag's detail page, Print asks where (a saved Bluetooth printer or a connected device) and which layout (A4, 58 mm or 80 mm from the report catalogue), then prints the report-service PDF on the user's Bluetooth printer from inside the app.

**Architecture:** The phone fetches the tag's report PDF from `GET report-service/reports/synchronously/by-entity` for the chosen size and definition and saves it to the cache. The existing `feat/bluetooth-printing` native module rasterises it to the printer's dot width, the existing TypeScript encoders turn it into ESC/POS or CPCL, and it is sent over Bluetooth. Pure modules carry the logic: `reportOptions` for step 2's rows, `printReport` for the job, `tagActions` for the grants. The sheet is three presentational step components behind a thin container.

**Tech Stack:** React Native 0.81 / Expo 54, expo-router, Zustand + AsyncStorage, NativeWind, `@gorhom/bottom-sheet`, `expo-file-system` (new `File` / `Paths` API), Jest (two projects: node for `*.test.ts`, native for `*.router.test.tsx`), the branch's Kotlin module `modules/bluetooth-printer`.

**Spec:** `docs/superpowers/specs/2026-10-14-superapp-tag-report-printing-design.md` (read it with this plan). UI mockups: <https://claude.ai/artifact/A6qtb96YKCM6GQUmk2PM5Q> (option B was chosen).

## Global Constraints

- Work only in `C:\unirefund\super-app-safe` on branch `feat/bluetooth-printing`. Never edit `C:\unirefund\super-app`: it is the shared `main` checkout.
- Shared checkouts: never `git reset --hard` and never a bare `git stash`. Check `git status` before starting each task.
- Reports are generated with `GET /api/report-service/reports/synchronously/by-entity` only, never `POST …/reports/synchronously`.
- Local (Bluetooth) printing is Android only. On iOS the sheet offers connected devices only.
- Every control that calls an endpoint is gated on that endpoint's full group **and** leaf grants (`isActionGranted` from `@/utils/policies`).
- Report export: `ReportService.Reports` + `ReportService.Reports.CreateSynchronously`. Catalogue: `ReportService.Reports` + `ReportService.Reports.ViewDefinitionListByEntity`. Device print: the four `DeviceService` names already on `TAG_ACTION_RULES.print.policies`.
- Hooks called inside `<BottomSheet>` children lose context in this app. `useLocalization` and `useToastRef` are called in the sheet's host and passed down as props.
- Every visible string goes through `t("MobileApp.…")`, with the key in **both** `src/localization/resources/en-US.json` and `tr-TR.json`. Run `npm run init` after adding keys; `TranslationKey` is derived from the generated bundle. Printed test-page text stays ASCII English (it uses the printer's own font).
- Render tests are named `*.router.test.tsx` (the native jest project); logic tests are `*.test.ts` (the node project).
- Write few comments: explain a non-obvious why, never narrate.
- Native builds are run by the user, never by the agent: `npx expo run:android --device OrderPAD_3 --no-bundler`.
- Commit with a quoted heredoc (`git commit -q -F - <<'MSG'`), ending in `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Avoid backslashes inside heredocs.

## Review Focus

1. **A remembered layout whose definition was deactivated or removed from the catalogue.** Preselection must fall back to the fitting size rather than send a dead definition id. Test: Task 4, "ignores a remembered definition the catalogue no longer offers".
2. **A catalogue whose sizes offer only Excel or CSV.** Step 2 must still offer the Default layout row, never an empty list. Test: Task 4, "falls back to the default layout when nothing is printable".
3. **Forgetting the printer that was used last.** Its remembered layout and default must go with it, or step 1 lists a ghost first. Test: Task 5, "forgets a printer's layout with the printer".
4. **Cancel tapped while the PDF is still downloading.** Nothing may reach the printer, and the cached PDF must be deleted. Test: Task 7, "cancelled during the download sends nothing and deletes the file".
5. **A tenant whose default output format is Excel.** The default-layout export must still ask for a PDF, or the rasteriser fails. Test: Task 4, "sends only the format for the default layout".

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/actions/lib.ts` | Modify | `getReportServiceClient` |
| `src/saas/ReportService/**` | Regenerate | Catalogue endpoint; by-entity with `entityTypeId` |
| `src/utils/blob.ts` (+ test) | Create | `blobToBase64` |
| `src/actions/ReportService/actions.ts` (+ test) | Create | `getReportCatalogueApi`, `downloadEntityReportPdf` |
| `src/features/printing/reportOptions.ts` (+ test) | Create | Catalogue → step 2 rows, preselection, export params |
| `src/features/printing/profile.ts` (+ test) | Modify | `connection` field |
| `src/features/printing/status.ts` (+ test) | Modify | `jobWarningCodes` replaces English `jobWarnings`; `describeStatus` removed |
| `src/store/printerSettings.ts` (+ test) | Modify | `lastLayoutByPrinter`, `rememberPrint` |
| `src/localization/resources/{en-US,tr-TR}.json` | Modify | `Printing` group, `Profile.Printers` |
| `src/features/printing/printReport.ts` (+ test) | Create | One print job, stages, failures |
| `src/features/printing/senders.ts` | Create | Sender per connection type |
| `src/features/printing/messages.ts` (+ test) | Create | Error / warning → translation key |
| `src/features/printing/grants.ts` | Create | Report policy sets |
| `src/features/printing/support.ts` | Create | `canPrintLocally()` |
| `src/utils/tagActions.ts` (+ test) | Modify | `alsoGrantedBy`, `canPrintLocally` |
| `src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx` | Modify | Pass `canPrintLocally` |
| `src/screens/staff/Printers/*` | Modify / rename | Printers page, translated; bench tools removed |
| `src/app/(auth)/(modals)/printers.tsx` | Rename from `printer-test.tsx` | Route |
| `src/screens/shared/Profile/StaffProfileScreen.tsx` | Modify | "Printers" row |
| `src/screens/shared/Tags/TagDetail/_components/print/*` (+ router test) | Create | Three step components |
| `src/screens/shared/Tags/TagDetail/_components/PrintTagSheet.tsx` (+ router test) | Rewrite | Container |

---

### Task 1: Bring the branch up to date and measure the baseline

**Files:** none of ours; the merge result.

**Interfaces:**
- Consumes: `origin/main`, `origin/feat/bluetooth-printing`.
- Produces: `feat/bluetooth-printing` containing `main`, with the measured gate baselines recorded in the task report.

- [ ] **Step 1: Check the checkout is free**

```bash
cd /c/unirefund/super-app-safe
git status --short
git branch --show-current
```
Expected: no output from `status`, branch `feat/bluetooth-printing`. If there are changes you did not make, stop and ask: another session may be using this clone.

- [ ] **Step 2: Merge main**

```bash
git fetch origin
git merge --no-ff origin/main
```
Expected conflict candidates: `package.json`, `package-lock.json`, `src/screens/shared/Profile/StaffProfileScreen.tsx`, `metro.config.js`.
- **`package-lock.json`:** take main's (`git checkout --theirs -- package-lock.json`), then let Step 3 re-add the branch's dependency.
- **Any other file:** keep **both** sides' additions. The branch adds `expo-document-picker`, a `pdf` asset extension and a "Printer test" profile row; keep them for now, because Task 9 removes them on purpose.

Then `git add` the resolved files.

- [ ] **Step 3: Install and generate**

```bash
npm install
npm run init
```
Expected: `npm install` exits 0; `init` writes `src/data/policies/policies.gen.json` and `src/data/language-data/*.gen.json`. If `init` fails with a 5xx or 522, dev-api is down: wait and rerun. Nothing later works without it.

- [ ] **Step 4: Measure the baselines**

```bash
npm run typecheck 2>&1 | tail -5
npm test 2>&1 | tail -8
npm run lint 2>&1 | tail -3
```
Record the three results (type errors, suites/tests passed/failed, lint errors/warnings) in your task report. These are the numbers every later task must hold.

- [ ] **Step 5: Commit the merge**

```bash
git commit -q -F - <<'MSG'
Merge origin/main into feat/bluetooth-printing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
git log --oneline -1
```

---

### Task 2: ReportService SDK and client

**Files:**
- Regenerate: `src/saas/ReportService/**`
- Modify: `src/actions/lib.ts`

**Interfaces:**
- Produces: `getReportServiceClient(customHeaders?: Record<string, string>): Promise<ReportServiceClient>` in `@/actions/lib`. In `@/saas/ReportService`:
  - `client.report.getApiReportServiceReportsCatalogue(data: { entityTypeId?: string })`;
  - `client.report.getApiReportServiceReportsSynchronouslyByEntity(data: { entityTypeId: string; entityId: string; sizeId?: string; outputFormatId?: string; reportDefinitionId?: string })`;
  - types `UniRefund_ReportService_Reports_ReportCatalogueEntityTypeDto`, `GetApiReportServiceReportsCatalogueData`, `GetApiReportServiceReportsSynchronouslyByEntityData`.

- [ ] **Step 1: Regenerate the service**

```bash
npm run gen -- -f ReportService
git status --short src/saas
grep -n "getApiReportServiceReportsCatalogue\|entityTypeId: data.entityTypeId" src/saas/ReportService/sdk.gen.ts | head -3
```
Expected: changes under `src/saas/ReportService/` (and possibly `src/saas/API_LIST.json`), and both greps hit. The generator needs the GitHub Packages token in `.npmrc`; this clone has one. If it fails with 401, stop and ask the user to run it.

- [ ] **Step 2: Regenerate the policy list**

```bash
npm run init
grep -c "ReportService.Reports.ViewDefinitionListByEntity" src/data/policies/policies.gen.json
```
Expected: `1`.

- [ ] **Step 3: Add the client getter**

In `src/actions/lib.ts`, add the import beside the other `@/saas/*` client imports:

```ts
import { ReportServiceClient } from "@/saas/ReportService";
```

and add after `getAnalyticServiceClient`:

```ts
export const getReportServiceClient = (
  customHeaders?: Record<string, string>,
) => createServiceClient(ReportServiceClient, customHeaders);
```

- [ ] **Step 4: Type-check**

Run: `npm run typecheck 2>&1 | tail -5`
Expected: the Task 1 baseline, no new errors. Nothing in the app calls the by-entity endpoint yet, so its signature change breaks nothing.

- [ ] **Step 5: Commit**

```bash
git add src/saas src/actions/lib.ts
git commit -q -F - <<'MSG'
chore(saas): regenerate ReportService for the report catalogue and entityTypeId

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 3: Report actions (catalogue and PDF download)

**Files:**
- Create: `src/utils/blob.ts`, `src/utils/__tests__/blob.test.ts`
- Create: `src/actions/ReportService/actions.ts`, `src/actions/ReportService/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `getReportServiceClient` (Task 2), `fetchRequest` from `@/utils/customFetch`.
- Produces:
  - `blobToBase64(blob: Blob): Promise<string>`;
  - `getReportCatalogueApi(data: GetApiReportServiceReportsCatalogueData): Promise<UniRefund_ReportService_Reports_ReportCatalogueEntityTypeDto[]>`;
  - `type EntityReportRequest = GetApiReportServiceReportsSynchronouslyByEntityData`;
  - `downloadEntityReportPdf(data: EntityReportRequest): Promise<string>`, which resolves to a `file://` URI in the cache.

- [ ] **Step 1: Write the failing blob test**

`src/utils/__tests__/blob.test.ts`:

```ts
import { blobToBase64 } from "@/utils/blob";

let fail = false;

class FakeReader {
  result: string | null = null;
  error: Error | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL() {
    if (fail) {
      this.error = new Error("boom");
      this.onerror?.();
      return;
    }
    this.result = "data:application/pdf;base64,JVBERi0=";
    this.onload?.();
  }
}

beforeEach(() => {
  fail = false;
  (globalThis as { FileReader?: unknown }).FileReader = FakeReader;
});

it("returns the bytes without the data URL prefix", async () => {
  await expect(blobToBase64({} as Blob)).resolves.toBe("JVBERi0=");
});

it("rejects when the blob cannot be read", async () => {
  fail = true;
  await expect(blobToBase64({} as Blob)).rejects.toThrow("boom");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/utils/__tests__/blob.test.ts`
Expected: FAIL, "Cannot find module '@/utils/blob'".

- [ ] **Step 3: Implement**

`src/utils/blob.ts`:

```ts
/** A Blob's bytes as base64, without the `data:…;base64,` prefix. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("The downloaded file could not be read."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx jest src/utils/__tests__/blob.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Write the failing actions test**

`src/actions/ReportService/__tests__/actions.test.ts`:

```ts
const mockCatalogue = jest.fn();
const mockByEntity = jest.fn();
const mockWrite = jest.fn();

jest.mock("@/utils/customFetch", () => ({
  fetchRequest: (request: (headers: Record<string, string>) => unknown) =>
    request({}),
}));
jest.mock("@/actions/lib", () => ({
  getReportServiceClient: async () => ({
    report: {
      getApiReportServiceReportsCatalogue: (...args: unknown[]) =>
        mockCatalogue(...args),
      getApiReportServiceReportsSynchronouslyByEntity: (...args: unknown[]) =>
        mockByEntity(...args),
    },
  }),
}));
jest.mock("@/utils/blob", () => ({ blobToBase64: async () => "JVBERi0=" }));
jest.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache" },
  File: class {
    uri: string;
    constructor(dir: string, name: string) {
      this.uri = `${dir}/${name}`;
    }
    create() {}
    write(content: string, options: unknown) {
      mockWrite(this.uri, content, options);
    }
  },
}));

import {
  downloadEntityReportPdf,
  getReportCatalogueApi,
} from "@/actions/ReportService/actions";

beforeEach(() => jest.clearAllMocks());

it("reads one entity type's catalogue", async () => {
  mockCatalogue.mockResolvedValue([{ entityTypeId: "Tag" }]);

  await expect(getReportCatalogueApi({ entityTypeId: "Tag" })).resolves.toEqual([
    { entityTypeId: "Tag" },
  ]);
  expect(mockCatalogue).toHaveBeenCalledWith({ entityTypeId: "Tag" });
});

it("asks by-entity for the chosen layout and saves the PDF to the cache", async () => {
  mockByEntity.mockResolvedValue({ size: 10 });
  const request = {
    entityTypeId: "Tag",
    entityId: "tag-1",
    sizeId: "r80",
    outputFormatId: "Pdf",
    reportDefinitionId: "d-80",
  };

  const uri = await downloadEntityReportPdf(request);

  expect(mockByEntity).toHaveBeenCalledWith(request);
  expect(uri).toMatch(/^file:\/\/\/cache\/report-Tag-tag-1-\d+\.pdf$/);
  expect(mockWrite).toHaveBeenCalledWith(uri, "JVBERi0=", { encoding: "base64" });
});

it("lets a refused export through untouched, so its server message can be shown", async () => {
  const refusal = new Error("refused");
  mockByEntity.mockRejectedValue(refusal);

  await expect(
    downloadEntityReportPdf({ entityTypeId: "Tag", entityId: "tag-1" }),
  ).rejects.toBe(refusal);
  expect(mockWrite).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `npx jest src/actions/ReportService/__tests__/actions.test.ts`
Expected: FAIL, "Cannot find module '@/actions/ReportService/actions'".

- [ ] **Step 7: Implement**

`src/actions/ReportService/actions.ts`:

```ts
import type {
  GetApiReportServiceReportsCatalogueData,
  GetApiReportServiceReportsSynchronouslyByEntityData,
} from "@/saas/ReportService";
import { blobToBase64 } from "@/utils/blob";
import { fetchRequest } from "@/utils/customFetch";
import { File, Paths } from "expo-file-system";
import { getReportServiceClient } from "../lib";

/** What the by-entity export can render for an entity type: sizes, then formats, then definitions. */
export async function getReportCatalogueApi(
  data: GetApiReportServiceReportsCatalogueData,
) {
  return await fetchRequest(async (customHeaders) => {
    const client = await getReportServiceClient(customHeaders);
    return await client.report.getApiReportServiceReportsCatalogue(data);
  }, "getReportCatalogue");
}

export type EntityReportRequest =
  GetApiReportServiceReportsSynchronouslyByEntityData;

/**
 * Renders one entity's report and saves it to the cache, returning its
 * `file://` URI. GET by-entity, not the POST synchronous export: it resolves the
 * entity type's default size, format and definition and refuses an inactive
 * definition.
 */
export async function downloadEntityReportPdf(
  data: EntityReportRequest,
): Promise<string> {
  const blob = await fetchRequest(async (customHeaders) => {
    const client = await getReportServiceClient(customHeaders);
    // Typed `void` by the generator; the patched core hands back the body as a Blob.
    return (await client.report.getApiReportServiceReportsSynchronouslyByEntity(
      data,
    )) as unknown as Blob;
  }, "downloadEntityReportPdf");

  const file = new File(
    Paths.cache,
    `report-${data.entityTypeId}-${data.entityId}-${Date.now()}.pdf`,
  );
  file.create();
  file.write(await blobToBase64(blob), { encoding: "base64" });
  return file.uri;
}
```

- [ ] **Step 8: Run both tests**

Run: `npx jest src/utils/__tests__/blob.test.ts src/actions/ReportService/__tests__/actions.test.ts`
Expected: 5 passed.

- [ ] **Step 9: Commit**

```bash
git add src/utils/blob.ts src/utils/__tests__/blob.test.ts src/actions/ReportService
git commit -q -F - <<'MSG'
feat(printing): read the report catalogue and download a by-entity PDF

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 4: Step 2's rows from the catalogue (`reportOptions`)

**Files:**
- Create: `src/features/printing/reportOptions.ts`
- Create: `src/features/printing/__tests__/reportOptions.test.ts`

**Interfaces:**
- Consumes: `PrinterProfile` (`paper: "58" | "80" | "custom"`, `widthDots: number`) from `./profile`; the catalogue DTO from Task 2.
- Produces:

```ts
export const PDF_FORMAT_ID = "Pdf";
export type LayoutChoice = { sizeId: string | null; reportDefinitionId: string | null };
export type LayoutDefinition = { id: string; name: string; isDefault: boolean };
export type LayoutRow = {
  sizeId: string | null; name: string; isDefaultSize: boolean;
  definitions: LayoutDefinition[]; fit: "fits" | "shrunk" | "none"; shrunkToMm: number | null;
};
export const DEFAULT_LAYOUT_ROW: LayoutRow;
export function layoutRows(entry: CatalogueEntry | null | undefined, profile: Pick<PrinterProfile, "paper" | "widthDots">): LayoutRow[];
export function preselect(rows: LayoutRow[], remembered?: LayoutChoice | null): LayoutChoice;
export function exportParams(choice: LayoutChoice): { outputFormatId: string; sizeId?: string; reportDefinitionId?: string };
```

- [ ] **Step 1: Write the failing test**

`src/features/printing/__tests__/reportOptions.test.ts`:

```ts
import {
  DEFAULT_LAYOUT_ROW,
  exportParams,
  layoutRows,
  preselect,
} from "@/features/printing/reportOptions";
import type { UniRefund_ReportService_Reports_ReportCatalogueEntityTypeDto as CatalogueEntry } from "@/saas/ReportService";

const pdf = (
  ...definitions: { id: string; name: string; isDefault?: boolean }[]
) => ({ outputFormatId: "Pdf", displayName: "PDF", isDefault: true, definitions });

const TAG: CatalogueEntry = {
  entityTypeId: "Tag",
  sizes: [
    {
      sizeId: "a4",
      code: "A4",
      name: "A4",
      widthMm: 210,
      heightMm: 297,
      isDefault: true,
      outputFormats: [pdf({ id: "d-a4", name: "Tag Detail", isDefault: true })],
    },
    {
      sizeId: "r58",
      code: "RECEIPT_58",
      name: "58 mm receipt",
      widthMm: 58,
      heightMm: null,
      isDefault: false,
      outputFormats: [
        pdf({ id: "d-58", name: "Tag Detail (58 mm)", isDefault: true }),
      ],
    },
    {
      sizeId: "r80",
      code: "RECEIPT_80",
      name: "80 mm receipt",
      widthMm: 80,
      heightMm: null,
      isDefault: false,
      outputFormats: [
        pdf(
          { id: "d-80b", name: "Compact" },
          { id: "d-80", name: "Tag Detail (80 mm)", isDefault: true },
        ),
      ],
    },
  ],
};

const EXCEL_ONLY: CatalogueEntry = {
  entityTypeId: "Tag",
  sizes: [
    {
      sizeId: "a4",
      name: "A4",
      widthMm: 210,
      isDefault: true,
      outputFormats: [
        {
          outputFormatId: "Excel",
          isDefault: true,
          definitions: [{ id: "x", name: "Sheet", isDefault: true }],
        },
      ],
    },
  ],
};

const P80 = { paper: "80", widthDots: 576 } as const;
const P58 = { paper: "58", widthDots: 384 } as const;
const CUSTOM = { paper: "custom", widthDots: 512 } as const;

const fitOf = (rows: ReturnType<typeof layoutRows>, sizeId: string) =>
  rows.find((row) => row.sizeId === sizeId);

describe("layoutRows", () => {
  it("lists every size that renders as a PDF, in catalogue order", () => {
    expect(layoutRows(TAG, P80).map((row) => row.name)).toEqual([
      "A4",
      "58 mm receipt",
      "80 mm receipt",
    ]);
  });

  it("marks the size matching the paper as fitting", () => {
    const rows = layoutRows(TAG, P80);
    expect(fitOf(rows, "r80")?.fit).toBe("fits");
    expect(rows.filter((row) => row.fit === "fits")).toHaveLength(1);
  });

  it("marks a wider size as shrunk to the printable width", () => {
    expect(fitOf(layoutRows(TAG, P80), "a4")).toMatchObject({
      fit: "shrunk",
      shrunkToMm: 72,
    });
    expect(fitOf(layoutRows(TAG, P58), "r80")).toMatchObject({
      fit: "shrunk",
      shrunkToMm: 48,
    });
  });

  it("leaves a narrower size unbadged", () => {
    expect(fitOf(layoutRows(TAG, P80), "r58")).toMatchObject({
      fit: "none",
      shrunkToMm: null,
    });
  });

  it("gives custom paper no fitting size, only shrunk ones", () => {
    const rows = layoutRows(TAG, CUSTOM);
    expect(rows.some((row) => row.fit === "fits")).toBe(false);
    expect(fitOf(rows, "r80")).toMatchObject({ fit: "shrunk", shrunkToMm: 64 });
    expect(fitOf(rows, "r58")?.fit).toBe("none");
  });

  it("puts the default definition first", () => {
    expect(
      fitOf(layoutRows(TAG, P80), "r80")?.definitions.map((d) => d.id),
    ).toEqual(["d-80", "d-80b"]);
  });

  it("falls back to the default layout when nothing is printable", () => {
    expect(layoutRows(EXCEL_ONLY, P80)).toEqual([DEFAULT_LAYOUT_ROW]);
    expect(layoutRows(null, P80)).toEqual([DEFAULT_LAYOUT_ROW]);
  });
});

describe("preselect", () => {
  it("reopens on the layout last used on this printer", () => {
    expect(
      preselect(layoutRows(TAG, P80), { sizeId: "r58", reportDefinitionId: "d-58" }),
    ).toEqual({ sizeId: "r58", reportDefinitionId: "d-58" });
  });

  it("ignores a remembered definition the catalogue no longer offers", () => {
    expect(
      preselect(layoutRows(TAG, P80), { sizeId: "r80", reportDefinitionId: "gone" }),
    ).toEqual({ sizeId: "r80", reportDefinitionId: "d-80" });
  });

  it("otherwise opens on the size that fits the paper", () => {
    expect(preselect(layoutRows(TAG, P80))).toEqual({
      sizeId: "r80",
      reportDefinitionId: "d-80",
    });
  });

  it("falls back to the catalogue's default size", () => {
    expect(preselect(layoutRows(TAG, CUSTOM))).toEqual({
      sizeId: "a4",
      reportDefinitionId: "d-a4",
    });
  });

  it("opens the default-layout row when there is nothing else", () => {
    expect(preselect([DEFAULT_LAYOUT_ROW])).toEqual({
      sizeId: null,
      reportDefinitionId: null,
    });
  });
});

describe("exportParams", () => {
  it("always asks for a PDF, with the chosen size and definition", () => {
    expect(exportParams({ sizeId: "r80", reportDefinitionId: "d-80" })).toEqual({
      outputFormatId: "Pdf",
      sizeId: "r80",
      reportDefinitionId: "d-80",
    });
  });

  it("sends only the format for the default layout", () => {
    expect(exportParams({ sizeId: null, reportDefinitionId: null })).toEqual({
      outputFormatId: "Pdf",
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/features/printing/__tests__/reportOptions.test.ts`
Expected: FAIL, "Cannot find module '@/features/printing/reportOptions'".

- [ ] **Step 3: Implement**

`src/features/printing/reportOptions.ts`:

```ts
import type { UniRefund_ReportService_Reports_ReportCatalogueEntityTypeDto as CatalogueEntry } from "@/saas/ReportService";
import type { PrinterProfile } from "./profile";

/** The only format a printer can take: the phone turns PDF pages into dots. */
export const PDF_FORMAT_ID = "Pdf";
const DOTS_PER_MM = 8;

/** `null` ids leave the choice to the report service's defaults. */
export type LayoutChoice = {
  sizeId: string | null;
  reportDefinitionId: string | null;
};

export type LayoutDefinition = { id: string; name: string; isDefault: boolean };

export type LayoutRow = {
  sizeId: string | null;
  name: string;
  isDefaultSize: boolean;
  /** PDF versions, the default first. Empty on the default-layout row. */
  definitions: LayoutDefinition[];
  fit: "fits" | "shrunk" | "none";
  /** The printable width a `shrunk` row is scaled to. */
  shrunkToMm: number | null;
};

export const DEFAULT_LAYOUT_ROW: LayoutRow = {
  sizeId: null,
  name: "",
  isDefaultSize: true,
  definitions: [],
  fit: "none",
  shrunkToMm: null,
};

type Paper = Pick<PrinterProfile, "paper" | "widthDots">;

const printableMm = (paper: Paper) => Math.round(paper.widthDots / DOTS_PER_MM);

function fitFor(
  widthMm: number | undefined,
  paper: Paper,
): Pick<LayoutRow, "fit" | "shrunkToMm"> {
  if (typeof widthMm !== "number") return { fit: "none", shrunkToMm: null };
  const paperMm = paper.paper === "custom" ? null : Number(paper.paper);
  if (paperMm !== null && widthMm === paperMm) {
    return { fit: "fits", shrunkToMm: null };
  }
  if (widthMm > (paperMm ?? printableMm(paper))) {
    return { fit: "shrunk", shrunkToMm: printableMm(paper) };
  }
  return { fit: "none", shrunkToMm: null };
}

/**
 * One row per size that renders as a PDF, in catalogue order. A catalogue with
 * nothing printable still yields the default-layout row, so the step is never
 * empty.
 */
export function layoutRows(
  entry: CatalogueEntry | null | undefined,
  paper: Paper,
): LayoutRow[] {
  const rows: LayoutRow[] = [];
  for (const size of entry?.sizes ?? []) {
    if (!size.sizeId) continue;
    const format = size.outputFormats?.find(
      (f) => f.outputFormatId?.toLowerCase() === PDF_FORMAT_ID.toLowerCase(),
    );
    const definitions = (format?.definitions ?? [])
      .flatMap((d) =>
        d.id
          ? [{ id: d.id, name: d.name || d.code || "", isDefault: !!d.isDefault }]
          : [],
      )
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    if (definitions.length === 0) continue;
    rows.push({
      sizeId: size.sizeId,
      name: size.name || size.code || "",
      isDefaultSize: !!size.isDefault,
      definitions,
      ...fitFor(size.widthMm, paper),
    });
  }
  return rows.length > 0 ? rows : [DEFAULT_LAYOUT_ROW];
}

const defaultDefinitionOf = (row: LayoutRow) => row.definitions[0]?.id ?? null;

/**
 * The layout last used on this printer while the catalogue still offers it,
 * else the size that fits the paper, else the catalogue's default size.
 */
export function preselect(
  rows: LayoutRow[],
  remembered?: LayoutChoice | null,
): LayoutChoice {
  if (remembered) {
    const row = rows.find((r) => r.sizeId === remembered.sizeId);
    const known =
      remembered.reportDefinitionId === null ||
      row?.definitions.some((d) => d.id === remembered.reportDefinitionId);
    if (row && known) {
      return {
        sizeId: row.sizeId,
        reportDefinitionId:
          remembered.reportDefinitionId ?? defaultDefinitionOf(row),
      };
    }
  }
  const row =
    rows.find((r) => r.fit === "fits") ??
    rows.find((r) => r.isDefaultSize) ??
    rows[0];
  return row
    ? { sizeId: row.sizeId, reportDefinitionId: defaultDefinitionOf(row) }
    : { sizeId: null, reportDefinitionId: null };
}

/** By-entity's query for a choice. PDF is always asked for: a tenant's default may be Excel. */
export function exportParams(choice: LayoutChoice) {
  return {
    outputFormatId: PDF_FORMAT_ID,
    ...(choice.sizeId ? { sizeId: choice.sizeId } : {}),
    ...(choice.reportDefinitionId
      ? { reportDefinitionId: choice.reportDefinitionId }
      : {}),
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx jest src/features/printing/__tests__/reportOptions.test.ts`
Expected: 14 passed.

- [ ] **Step 5: Commit**

```bash
git add src/features/printing/reportOptions.ts src/features/printing/__tests__/reportOptions.test.ts
git commit -q -F - <<'MSG'
feat(printing): turn the report catalogue into layout choices for a printer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 5: Profiles know their connection; the store remembers the last print; warnings become codes

**Files:**
- Modify: `src/features/printing/profile.ts`, `src/features/printing/__tests__/profile.test.ts`
- Modify: `src/features/printing/status.ts`, `src/features/printing/__tests__/status.test.ts`
- Modify: `src/store/printerSettings.ts`, `src/store/__tests__/printerSettings.test.ts`

**Interfaces:**
- Consumes: `LayoutChoice` (Task 4).
- Produces:
  - in `profile.ts`: `type PrinterConnection = "bluetooth"`, and `PrinterProfile.connection: PrinterConnection`;
  - in `status.ts`: `type JobWarning = "offline" | "paperLow" | "paperOut" | "coverOpened"` and `jobWarningCodes(before: StatusBytes, after: StatusBytes): JobWarning[]`. `jobWarnings` and `describeStatus` are removed; Task 9 rewrites their only caller;
  - in the store: `lastLayoutByPrinter: Record<string, LayoutChoice>` and `rememberPrint(address: string, choice: LayoutChoice): void`. `rememberPrint` also sets `defaultAddress`, which is the "last used" printer the spec names.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/printing/__tests__/profile.test.ts`, adding `sanitizeProfile` and `defaultProfile` to its existing import from `@/features/printing/profile` if they are not there:

```ts
describe("connection", () => {
  it("is Bluetooth for a new printer", () => {
    expect(defaultProfile("AA:BB", "HM-E300").connection).toBe("bluetooth");
  });

  it("reads a profile saved before connections existed as Bluetooth", () => {
    expect(sanitizeProfile({ address: "AA:BB", name: "Old" })?.connection).toBe(
      "bluetooth",
    );
  });
});
```

In `src/features/printing/__tests__/status.test.ts`, change the import to `import { decodeStatus, jobWarningCodes } from "@/features/printing/status";` and replace the whole `describe("jobWarnings", …)` block with:

```ts
describe("jobWarningCodes", () => {
  const healthy = [OK, OK, OK];

  it("says nothing when the printer is fine or silent", () => {
    expect(jobWarningCodes(healthy, healthy)).toEqual([]);
    expect(jobWarningCodes([NO_ANSWER], [NO_ANSWER])).toEqual([]);
  });

  it("warns that an offline printer probably printed nothing", () => {
    expect(jobWarningCodes([OK | 0x08, OK, OK], healthy)).toEqual(["offline"]);
  });

  it("warns that the paper is low before the job", () => {
    expect(jobWarningCodes([OK, OK, OK | 0x0c], healthy)).toEqual(["paperLow"]);
  });

  it("warns that the end may be missing when paper ran out during the job", () => {
    expect(jobWarningCodes(healthy, [OK, OK, OK | 0x60])).toEqual(["paperOut"]);
  });

  it("warns that the end may be missing when the cover opened during the job", () => {
    expect(jobWarningCodes(healthy, [OK, OK | 0x04, OK])).toEqual(["coverOpened"]);
  });
});
```

Append to `src/store/__tests__/printerSettings.test.ts`:

```ts
describe("the last print", () => {
  const layout = { sizeId: "r80", reportDefinitionId: "d-80" };

  it("remembers the printer and the layout", async () => {
    const { default: store } = await loadStore();
    store.getState().saveProfile(printer);

    store.getState().rememberPrint(printer.address, layout);

    expect(store.getState().defaultAddress).toBe(printer.address);
    expect(store.getState().lastLayoutByPrinter[printer.address]).toEqual(layout);
  });

  it("forgets a printer's layout with the printer", async () => {
    const { default: store } = await loadStore();
    store.getState().saveProfile(printer);
    store.getState().rememberPrint(printer.address, layout);

    store.getState().removeProfile(printer.address);

    expect(store.getState().defaultAddress).toBeNull();
    expect(store.getState().lastLayoutByPrinter).toEqual({});
  });

  it("drops a stored layout that is malformed or belongs to no saved printer", async () => {
    const { default: store } = await loadStore({
      profiles: { [printer.address]: printer },
      defaultAddress: printer.address,
      lastLayoutByPrinter: {
        [printer.address]: { sizeId: 5, reportDefinitionId: null },
        "99:99:99:99:99:99": layout,
      },
    });

    expect(store.getState().lastLayoutByPrinter).toEqual({});
  });

  it("keeps a stored layout that is well formed", async () => {
    const { default: store } = await loadStore({
      profiles: { [printer.address]: printer },
      defaultAddress: printer.address,
      lastLayoutByPrinter: {
        [printer.address]: { sizeId: null, reportDefinitionId: null },
      },
    });

    expect(store.getState().lastLayoutByPrinter[printer.address]).toEqual({
      sizeId: null,
      reportDefinitionId: null,
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx jest src/features/printing/__tests__/profile.test.ts src/features/printing/__tests__/status.test.ts src/store/__tests__/printerSettings.test.ts`
Expected: FAIL. `connection` is undefined, `jobWarningCodes` is not exported, and `rememberPrint` is not a function.

- [ ] **Step 3: Implement `profile.ts`**

Above `export type PrinterProfile`:

```ts
/** How the phone reaches the printer. Network printers add a member here. */
export type PrinterConnection = "bluetooth";
```

In `PrinterProfile`, after `name: string;`, add `connection: PrinterConnection;`.

Change `type Settings = Omit<PrinterProfile, "address" | "name">;` to:

```ts
type Settings = Omit<PrinterProfile, "address" | "name" | "connection">;
```

Change `defaultProfile` to:

```ts
export const defaultProfile = (
  address: string,
  name: string,
): PrinterProfile => ({ address, name, connection: "bluetooth", ...DEFAULT_SETTINGS });
```

In `sanitizeProfile`'s returned object, after the `name` line, add:

```ts
    connection: oneOf(stored.connection, ["bluetooth"], "bluetooth"),
```

- [ ] **Step 4: Implement `status.ts`**

Replace `jobWarnings`, `yesNo` and `describeStatus` (everything below `decodeStatus`) with:

```ts
export type JobWarning = "offline" | "paperLow" | "paperOut" | "coverOpened";

export function jobWarningCodes(
  before: StatusBytes,
  after: StatusBytes,
): JobWarning[] {
  const start = decodeStatus(before);
  const end = decodeStatus(after);
  const warnings: JobWarning[] = [];
  // An offline ESC/POS printer accepts the data and prints nothing.
  if (start.online === false) warnings.push("offline");
  if (start.paperNearEnd && !start.paperOut) warnings.push("paperLow");
  if (end.paperOut) warnings.push("paperOut");
  else if (end.coverOpen) warnings.push("coverOpened");
  return warnings;
}
```

- [ ] **Step 5: Implement the store**

In `src/store/printerSettings.ts`, add the import:

```ts
import type { LayoutChoice } from "@/features/printing/reportOptions";
```

Extend the interface:

```ts
interface PrinterSettingsStore {
  profiles: Record<string, PrinterProfile>;
  defaultAddress: string | null;
  /** The layout each printer last printed, to preselect it next time. */
  lastLayoutByPrinter: Record<string, LayoutChoice>;
  saveProfile: (profile: PrinterProfile) => void;
  setDefault: (address: string | null) => void;
  removeProfile: (address: string) => void;
  rememberPrint: (address: string, choice: LayoutChoice) => void;
}
```

Add to the outside of the `create` call:

```ts
const isId = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

function sanitizeLayout(raw: unknown): LayoutChoice | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { sizeId, reportDefinitionId } = raw as Record<string, unknown>;
  return isId(sizeId) && isId(reportDefinitionId)
    ? { sizeId, reportDefinitionId }
    : null;
}
```

Inside the store creator, add `lastLayoutByPrinter: {},` after `defaultAddress: null,` and the action:

```ts
      rememberPrint: (address, choice) =>
        set((state) => ({
          defaultAddress: address,
          lastLayoutByPrinter: { ...state.lastLayoutByPrinter, [address]: choice },
        })),
```

Replace `removeProfile` with:

```ts
      removeProfile: (address) =>
        set((state) => {
          const without = <T,>(record: Record<string, T>) =>
            Object.fromEntries(
              Object.entries(record).filter(([key]) => key !== address),
            );
          return {
            profiles: without(state.profiles),
            lastLayoutByPrinter: without(state.lastLayoutByPrinter),
            defaultAddress:
              state.defaultAddress === address ? null : state.defaultAddress,
          };
        }),
```

`partialize` gains `lastLayoutByPrinter: state.lastLayoutByPrinter,`.

In `merge`:
- widen the cast to `{ profiles?: unknown; defaultAddress?: unknown; lastLayoutByPrinter?: unknown } | undefined`;
- after the `profiles` loop, add:

```ts
        const lastLayoutByPrinter: Record<string, LayoutChoice> = {};
        if (
          typeof stored?.lastLayoutByPrinter === "object" &&
          stored.lastLayoutByPrinter !== null
        ) {
          for (const [address, raw] of Object.entries(stored.lastLayoutByPrinter)) {
            const layout = sanitizeLayout(raw);
            if (layout && profiles[address]) lastLayoutByPrinter[address] = layout;
          }
        }
```

- and return `lastLayoutByPrinter` alongside `profiles` and `defaultAddress`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx jest src/features/printing src/store/__tests__/printerSettings.test.ts`
Expected: all pass. If `printJob.test.ts` or `testPage.test.ts` builds a `PrinterProfile` by hand without `connection`, add `connection: "bluetooth",` to that literal.

- [ ] **Step 7: Type-check**

Run: `npm run typecheck 2>&1 | tail -8`
Expected: the only new errors are in `src/screens/staff/Printers/PrinterTestScreen.tsx`, which still imports `jobWarnings` and `describeStatus`. Task 9 rewrites that file, so leave them for now and note them in your report.

- [ ] **Step 8: Commit**

```bash
git add src/features/printing/profile.ts src/features/printing/status.ts src/features/printing/__tests__ src/store
git commit -q -F - <<'MSG'
feat(printing): profiles carry their connection; remember each printer's last layout

Printer warnings become codes so the UI can translate them.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 6: Translations

**Files:**
- Modify: `src/localization/resources/en-US.json`, `src/localization/resources/tr-TR.json`

**Interfaces:**
- Produces: every `MobileApp.Printing.*` key used by Tasks 7–10, and `MobileApp.Profile.Printers`.

- [ ] **Step 1: Add the `Printing` group to `en-US.json`**

Add this object as a new top-level member, before `"Customs"`:

```json
  "Printing": {
    "Step1of2": "Step 1 of 2",
    "WhereTitle": "Where to print?",
    "Step2of2": "Step 2 of 2 · {printer}",
    "LayoutTitle": "Which layout?",
    "BluetoothPrinters": "Bluetooth printers",
    "ConnectedDevices": "Connected devices",
    "AddPrinter": "Add printer",
    "NoPrinters": "No printers yet",
    "NoTargets": "There is nothing to print to on this phone.",
    "LastUsed": "Last used",
    "Paper": "{width} mm paper",
    "PaperCustom": "Custom paper",
    "PrintsRightAway": "Prints right away",
    "Back": "Back",
    "FitsPrinter": "Fits printer",
    "TryIt": "Try it · shrunk to {mm} mm",
    "DefaultLayout": "Default layout",
    "DefaultLayoutHint": "The layout your organization set as the default",
    "Print": "Print",
    "CatalogueFailed": "Couldn't load the layouts.",
    "Retry": "Retry",
    "PrintDefault": "Print default layout",
    "Stage": {
      "downloading": "Downloading the report…",
      "preparing": "Preparing the print…",
      "printing": "Printing…"
    },
    "ConnectHint": "Connecting can take up to 20 s when the printer is off or out of range.",
    "Cancel": "Cancel",
    "StopTitle": "Stop printing?",
    "StopWarning": "Some of the tag may already be on paper.",
    "KeepPrinting": "Keep printing",
    "Stop": "Stop",
    "Printed": "Printed on {printer}",
    "Failed": "Print failed",
    "OpenPrinters": "Open Printers",
    "Errors": {
      "DownloadFailed": "Couldn't download the report. Check the connection and try again.",
      "E_UNSUPPORTED": "Printing isn't supported on this phone or app version.",
      "E_DISABLED": "Bluetooth is off.",
      "E_PERMISSION": "The app needs the Nearby devices permission to reach the printer.",
      "E_PAIR_FAILED": "Pairing failed. Printers usually take PIN 0000 or 1234.",
      "E_UNPAIR_FAILED": "This phone wouldn't unpair the printer. Forget it in Android's Bluetooth settings.",
      "E_NOT_PAIRED": "This printer is no longer paired. Pair it again on the Printers page.",
      "E_CONNECT_FAILED": "Couldn't reach the printer. Is it on, in range, and not connected to another phone?",
      "E_WRITE_FAILED": "The connection dropped. Part of the tag may have printed.",
      "E_PAPER_OUT": "The printer is out of paper.",
      "E_COVER_OPEN": "The printer's cover is open.",
      "E_BUSY": "Another print is in progress.",
      "E_CANCELLED": "Cancelled.",
      "E_PDF_FAILED": "The report couldn't be prepared for this printer.",
      "E_UNKNOWN": "Printing failed."
    },
    "Warnings": {
      "offline": "The printer reported itself offline, so it may not have printed.",
      "paperLow": "Paper is running low.",
      "paperOut": "The printer ran out of paper; the end of the print may be missing.",
      "coverOpened": "The cover opened while printing; the end of the print may be missing."
    },
    "Page": {
      "Title": "Printers",
      "PrintTestPage": "Print test page",
      "CheckPrinter": "Check printer",
      "CheckPrinterDescription": "Paper, cover and whether it answers",
      "Working": "Working",
      "TestPageSent": "Test page sent ({bytes} bytes in {seconds} s).",
      "NotSupported": "Printing needs an Android version of the app that includes the printer module. This one doesn't.",
      "NeedsPermission": "The app needs the Nearby devices (Bluetooth) permission to find and connect to printers.",
      "GrantPermission": "Grant permission",
      "OpenSettings": "Open settings",
      "BluetoothOff": "Bluetooth is off.",
      "TurnOnBluetooth": "Turn on Bluetooth",
      "Paired": "Paired devices",
      "Scan": "Scan",
      "PairHint": "Tap your printer to use it. Not listed? Turn it on and tap Scan. The pairing PIN is usually 0000 or 1234.",
      "NoPaired": "No paired devices yet.",
      "Forget": "Forget",
      "ForgetLabel": "Forget {name}",
      "ForgetTitle": "Forget {name}?",
      "ForgetBody": "It's unpaired from this phone and its print settings are deleted.",
      "Nearby": "Nearby",
      "Pair": "Pair",
      "Status": {
        "NoAnswer": "The printer doesn't answer status requests.",
        "CpclNoStatus": "CPCL printers don't answer status requests, so paper and cover can't be checked.",
        "Online": "Online",
        "Offline": "Offline",
        "CoverOpen": "Cover open",
        "CoverClosed": "Cover closed",
        "PaperOk": "Paper OK",
        "PaperLow": "Paper low",
        "PaperOut": "Paper out"
      },
      "Settings": {
        "Title": "{name} settings",
        "Language": "Printer language",
        "LanguageEscpos": "ESC/POS (most receipt printers)",
        "LanguageCpcl": "CPCL (Zebra-style, e.g. MTP-3)",
        "Paper": "Paper",
        "PaperCustom": "Custom",
        "WidthDots": "Print width (dots)",
        "WidthDotsHelp": "203 dpi heads: 384 on 58 mm paper, 576 on 80 mm.",
        "TrimMargins": "Trim side margins",
        "TrimMarginsHelp": "Crops a PDF to its content before scaling it to the width.",
        "Tone": "Black and white",
        "ToneThreshold": "Threshold (text)",
        "ToneDither": "Dither (photos)",
        "Threshold": "Threshold",
        "ThresholdHelp": "1–254. Higher prints darker.",
        "Cut": "Cut",
        "CutNone": "None (tear bar)",
        "CutPartial": "Partial",
        "CutFull": "Full",
        "TearLine": "Tear line",
        "TearLineHelp": "Prints a dashed line where the paper should be torn.",
        "FeedMm": "Feed after print (mm)",
        "FeedMmHelp": "The distance from the print head to the tear bar, so the end clears it.",
        "CutterFeeds": "The printer feeds to its own cutter before cutting.",
        "CheckStatus": "Check paper and cover",
        "CheckStatusHelp": "Asks the printer before and after each print. Printers that don't answer are printed to anyway.",
        "ShowAdvanced": "Show advanced",
        "HideAdvanced": "Hide advanced",
        "RasterCommand": "Raster command",
        "RasterGsv0": "GS v 0",
        "RasterEscStar": "ESC * (older printers)",
        "DenseLineMs": "Dense-line time (ms)",
        "DenseLineMsHelp": "How long a fully black line takes. Raise it if black areas print garbage or the printer switches off.",
        "SkipBlankRows": "Send blank lines as paper feed",
        "SkipBlankRowsHelp": "Faster. Turn it off if blank gaps come out the wrong size.",
        "BandHeight": "Band height (rows)",
        "BandHeightHelp": "Rows per GS v 0 command. Lower it if images print garbled.",
        "CpclPageRows": "Rows per CPCL page",
        "CpclPageRowsHelp": "Raise it if the print has small gaps; lower it if nothing prints.",
        "SettleMs": "Wait after connecting (ms)",
        "SettleMsHelp": "Raise it if nothing prints at all.",
        "ChunkSize": "Chunk size (bytes)",
        "ChunkDelayMs": "Extra delay between chunks (ms)",
        "ChunkDelayMsHelp": "A fixed pause on top of the pacing. Usually 0.",
        "LingerMs": "Wait before disconnecting (ms)",
        "LingerMsHelp": "Raise it if the end of a print is cut off."
      }
    }
  },
```

In the existing `"Profile"` object, add `"Printers": "Printers",`.

- [ ] **Step 2: Add the same structure to `tr-TR.json`**

Add before `"Customs"`, with the same keys:

```json
  "Printing": {
    "Step1of2": "Adım 1 / 2",
    "WhereTitle": "Nereye yazdırılsın?",
    "Step2of2": "Adım 2 / 2 · {printer}",
    "LayoutTitle": "Hangi düzen?",
    "BluetoothPrinters": "Bluetooth yazıcılar",
    "ConnectedDevices": "Bağlı cihazlar",
    "AddPrinter": "Yazıcı ekle",
    "NoPrinters": "Henüz yazıcı yok",
    "NoTargets": "Bu telefonda yazdırılabilecek bir yer yok.",
    "LastUsed": "Son kullanılan",
    "Paper": "{width} mm kağıt",
    "PaperCustom": "Özel kağıt",
    "PrintsRightAway": "Hemen yazdırır",
    "Back": "Geri",
    "FitsPrinter": "Yazıcıya uygun",
    "TryIt": "Deneyin · {mm} mm'ye küçülür",
    "DefaultLayout": "Varsayılan düzen",
    "DefaultLayoutHint": "Kurumunuzun varsayılan olarak belirlediği düzen",
    "Print": "Yazdır",
    "CatalogueFailed": "Düzenler yüklenemedi.",
    "Retry": "Tekrar dene",
    "PrintDefault": "Varsayılan düzeni yazdır",
    "Stage": {
      "downloading": "Rapor indiriliyor…",
      "preparing": "Baskı hazırlanıyor…",
      "printing": "Yazdırılıyor…"
    },
    "ConnectHint": "Yazıcı kapalıysa veya menzil dışındaysa bağlanmak 20 saniye sürebilir.",
    "Cancel": "İptal",
    "StopTitle": "Yazdırma durdurulsun mu?",
    "StopWarning": "Etiketin bir kısmı kağıda basılmış olabilir.",
    "KeepPrinting": "Yazdırmaya devam et",
    "Stop": "Durdur",
    "Printed": "{printer} yazıcısına yazdırıldı",
    "Failed": "Yazdırma başarısız",
    "OpenPrinters": "Yazıcıları aç",
    "Errors": {
      "DownloadFailed": "Rapor indirilemedi. Bağlantıyı kontrol edip tekrar deneyin.",
      "E_UNSUPPORTED": "Bu telefon veya uygulama sürümü yazdırmayı desteklemiyor.",
      "E_DISABLED": "Bluetooth kapalı.",
      "E_PERMISSION": "Yazıcıya ulaşmak için uygulamanın Yakındaki cihazlar iznine ihtiyacı var.",
      "E_PAIR_FAILED": "Eşleme başarısız. Yazıcılar genellikle 0000 veya 1234 PIN'ini kullanır.",
      "E_UNPAIR_FAILED": "Bu telefon yazıcının eşlemesini kaldıramadı. Android'in Bluetooth ayarlarından unutun.",
      "E_NOT_PAIRED": "Bu yazıcı artık eşli değil. Yazıcılar sayfasında yeniden eşleyin.",
      "E_CONNECT_FAILED": "Yazıcıya ulaşılamadı. Açık mı, menzilde mi ve başka bir telefona bağlı değil mi?",
      "E_WRITE_FAILED": "Bağlantı koptu. Etiketin bir kısmı basılmış olabilir.",
      "E_PAPER_OUT": "Yazıcıda kağıt bitti.",
      "E_COVER_OPEN": "Yazıcının kapağı açık.",
      "E_BUSY": "Başka bir yazdırma sürüyor.",
      "E_CANCELLED": "İptal edildi.",
      "E_PDF_FAILED": "Rapor bu yazıcı için hazırlanamadı.",
      "E_UNKNOWN": "Yazdırma başarısız oldu."
    },
    "Warnings": {
      "offline": "Yazıcı çevrimdışı olduğunu bildirdi; yazdırmamış olabilir.",
      "paperLow": "Kağıt azalıyor.",
      "paperOut": "Yazıcının kağıdı bitti; baskının sonu eksik olabilir.",
      "coverOpened": "Yazdırırken kapak açıldı; baskının sonu eksik olabilir."
    },
    "Page": {
      "Title": "Yazıcılar",
      "PrintTestPage": "Test sayfası yazdır",
      "CheckPrinter": "Yazıcıyı kontrol et",
      "CheckPrinterDescription": "Kağıt, kapak ve yanıt verip vermediği",
      "Working": "Çalışıyor",
      "TestPageSent": "Test sayfası gönderildi ({seconds} sn'de {bytes} bayt).",
      "NotSupported": "Yazdırma, yazıcı modülünü içeren bir Android uygulama sürümü gerektirir. Bu sürümde yok.",
      "NeedsPermission": "Yazıcıları bulup bağlanmak için uygulamanın Yakındaki cihazlar (Bluetooth) iznine ihtiyacı var.",
      "GrantPermission": "İzin ver",
      "OpenSettings": "Ayarları aç",
      "BluetoothOff": "Bluetooth kapalı.",
      "TurnOnBluetooth": "Bluetooth'u aç",
      "Paired": "Eşlenmiş cihazlar",
      "Scan": "Tara",
      "PairHint": "Kullanmak için yazıcınıza dokunun. Listede yok mu? Açıp Tara'ya dokunun. Eşleme PIN'i genellikle 0000 veya 1234'tür.",
      "NoPaired": "Henüz eşlenmiş cihaz yok.",
      "Forget": "Unut",
      "ForgetLabel": "{name} unutulsun",
      "ForgetTitle": "{name} unutulsun mu?",
      "ForgetBody": "Bu telefonla eşlemesi kaldırılır ve yazdırma ayarları silinir.",
      "Nearby": "Yakındakiler",
      "Pair": "Eşle",
      "Status": {
        "NoAnswer": "Yazıcı durum isteklerine yanıt vermiyor.",
        "CpclNoStatus": "CPCL yazıcılar durum isteklerine yanıt vermez; kağıt ve kapak kontrol edilemez.",
        "Online": "Çevrimiçi",
        "Offline": "Çevrimdışı",
        "CoverOpen": "Kapak açık",
        "CoverClosed": "Kapak kapalı",
        "PaperOk": "Kağıt var",
        "PaperLow": "Kağıt az",
        "PaperOut": "Kağıt bitti"
      },
      "Settings": {
        "Title": "{name} ayarları",
        "Language": "Yazıcı dili",
        "LanguageEscpos": "ESC/POS (çoğu fiş yazıcısı)",
        "LanguageCpcl": "CPCL (Zebra tarzı, ör. MTP-3)",
        "Paper": "Kağıt",
        "PaperCustom": "Özel",
        "WidthDots": "Baskı genişliği (nokta)",
        "WidthDotsHelp": "203 dpi kafalar: 58 mm kağıtta 384, 80 mm'de 576.",
        "TrimMargins": "Yan boşlukları kırp",
        "TrimMarginsHelp": "PDF'i genişliğe ölçeklemeden önce içeriğine göre kırpar.",
        "Tone": "Siyah beyaz",
        "ToneThreshold": "Eşik (metin)",
        "ToneDither": "Titreşim (fotoğraf)",
        "Threshold": "Eşik",
        "ThresholdHelp": "1–254. Yüksek değer daha koyu basar.",
        "Cut": "Kesim",
        "CutNone": "Yok (yırtma çubuğu)",
        "CutPartial": "Kısmi",
        "CutFull": "Tam",
        "TearLine": "Yırtma çizgisi",
        "TearLineHelp": "Kağıdın yırtılacağı yere kesikli bir çizgi basar.",
        "FeedMm": "Baskı sonrası ilerletme (mm)",
        "FeedMmHelp": "Baskı kafasından yırtma çubuğuna olan mesafe; sonu çubuğu geçsin diye.",
        "CutterFeeds": "Yazıcı kesmeden önce kağıdı kendi bıçağına kadar ilerletir.",
        "CheckStatus": "Kağıt ve kapağı kontrol et",
        "CheckStatusHelp": "Her baskıdan önce ve sonra yazıcıya sorar. Yanıt vermeyen yazıcılara yine de yazdırılır.",
        "ShowAdvanced": "Gelişmiş ayarları göster",
        "HideAdvanced": "Gelişmiş ayarları gizle",
        "RasterCommand": "Raster komutu",
        "RasterGsv0": "GS v 0",
        "RasterEscStar": "ESC * (eski yazıcılar)",
        "DenseLineMs": "Yoğun satır süresi (ms)",
        "DenseLineMsHelp": "Tamamen siyah bir satırın süresi. Siyah alanlar bozuk çıkıyor veya yazıcı kapanıyorsa artırın.",
        "SkipBlankRows": "Boş satırları kağıt ilerletme olarak gönder",
        "SkipBlankRowsHelp": "Daha hızlı. Boşluklar yanlış boyutta çıkıyorsa kapatın.",
        "BandHeight": "Bant yüksekliği (satır)",
        "BandHeightHelp": "GS v 0 komutu başına satır. Görseller bozuk çıkıyorsa düşürün.",
        "CpclPageRows": "CPCL sayfası başına satır",
        "CpclPageRowsHelp": "Baskıda küçük boşluklar varsa artırın; hiçbir şey basılmıyorsa düşürün.",
        "SettleMs": "Bağlandıktan sonra bekleme (ms)",
        "SettleMsHelp": "Hiçbir şey basılmıyorsa artırın.",
        "ChunkSize": "Parça boyutu (bayt)",
        "ChunkDelayMs": "Parçalar arası ek bekleme (ms)",
        "ChunkDelayMsHelp": "Hızlandırmanın üzerine sabit bir bekleme. Genellikle 0.",
        "LingerMs": "Bağlantıyı kesmeden önce bekleme (ms)",
        "LingerMsHelp": "Baskının sonu kesiliyorsa artırın."
      }
    }
  },
```

In `"Profile"`, add `"Printers": "Yazıcılar",`.

- [ ] **Step 3: Validate the JSON and regenerate the bundle**

```bash
node -e 'for (const f of ["en-US","tr-TR"]) { const j = require("./src/localization/resources/" + f + ".json"); console.log(f, Object.keys(j.Printing).length, j.Profile.Printers); }'
npm run init
npm run check:language-data
```
Expected: both files print the same key count plus their `Printers` label; `init` succeeds; the language-data check passes.

- [ ] **Step 4: Commit**

```bash
git add src/localization/resources
git commit -q -F - <<'MSG'
feat(printing): English and Turkish text for printing and the Printers page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 7: One print job (`printReport`), senders and messages

**Files:**
- Create: `src/features/printing/printReport.ts`, `src/features/printing/__tests__/printReport.test.ts`
- Create: `src/features/printing/senders.ts`
- Create: `src/features/printing/messages.ts`, `src/features/printing/__tests__/messages.test.ts`

**Interfaces:**
- Consumes:
  - `EntityReportRequest` (Task 3) and `exportParams`, `LayoutChoice` (Task 4);
  - `jobWarningCodes`, `JobWarning` (Task 5);
  - `encodePages` from `./printJob`, `rasterOptions` and `sendOptions` from `./profile`;
  - `printerErrorCode`, `requireBluetoothPrinter` and the types `RasterOptions`, `RasterPage`, `SendResult`, `PrinterErrorCode` from `./bluetoothPrinter`;
  - `getApiErrorMessage` from `@/utils/apiError`.
- Produces:

```ts
// printReport.ts
export type PrintStage = "downloading" | "preparing" | "printing";
export type PrintFailure =
  | { kind: "cancelled" }
  | { kind: "download"; serverMessage: string | undefined }
  | { kind: "printer"; code: PrinterErrorCode };
export class PrintReportError extends Error { readonly failure: PrintFailure }
export type PrintReportDeps = {
  download: (request: EntityReportRequest) => Promise<string>;
  rasterize: (uri: string, options: RasterOptions) => Promise<RasterPage[]>;
  send: (profile: PrinterProfile, job: PrintJob) => Promise<SendResult>;
  deleteFile: (uri: string) => void;
};
export type PrintReportInput = {
  entityTypeId: string; entityId: string; choice: LayoutChoice; profile: PrinterProfile;
  signal: AbortSignal; onStage: (stage: PrintStage) => void;
};
export function printReport(input: PrintReportInput, deps: PrintReportDeps): Promise<{ warnings: JobWarning[] }>;
// senders.ts
export type Sender = (profile: PrinterProfile, job: PrintJob) => Promise<SendResult>;
export function senderFor(profile: PrinterProfile): Sender;
// messages.ts
export const PRINTER_ERROR_KEYS: Record<PrinterErrorCode, TranslationKey>;
export const WARNING_KEYS: Record<JobWarning, TranslationKey>;
export const STAGE_KEYS: Record<PrintStage, TranslationKey>;
export function failureMessage(failure: PrintFailure, t: (key: TranslationKey) => string): string;
export function opensPrinters(failure: PrintFailure): boolean;
```

- [ ] **Step 1: Write the failing `printReport` test**

`src/features/printing/__tests__/printReport.test.ts`:

```ts
import { defaultProfile, rasterOptions } from "@/features/printing/profile";
import {
  printReport,
  PrintReportError,
  type PrintReportDeps,
} from "@/features/printing/printReport";
import { ApiError } from "@/saas/AccountService";

const OK = 0x12;
const URI = "file:///cache/report.pdf";
const profile = defaultProfile("AA:BB:CC:DD:EE:FF", "HM-E300");
const page = { width: 8, height: 1, data: new Uint8Array([0xff]), previewUri: "" };

function setup(over: Partial<PrintReportDeps> = {}) {
  const controller = new AbortController();
  const onStage = jest.fn();
  const deps: PrintReportDeps = {
    download: jest.fn(async () => URI),
    rasterize: jest.fn(async () => [page]),
    send: jest.fn(async () => ({
      bytesSent: 10,
      millis: 5,
      statusBefore: [OK, OK, OK],
      statusAfter: [OK, OK, OK],
    })),
    deleteFile: jest.fn(),
    ...over,
  };
  const run = () =>
    printReport(
      {
        entityTypeId: "Tag",
        entityId: "tag-1",
        choice: { sizeId: "r80", reportDefinitionId: "d-80" },
        profile,
        signal: controller.signal,
        onStage,
      },
      deps,
    );
  return { controller, onStage, deps, run };
}

const failureOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PrintReportError);
    return (error as PrintReportError).failure;
  }
  throw new Error("expected the print to fail");
};

it("downloads the chosen layout as a PDF, prints it, and reports each stage", async () => {
  const { deps, onStage, run } = setup();

  await expect(run()).resolves.toEqual({ warnings: [] });

  expect(deps.download).toHaveBeenCalledWith({
    entityTypeId: "Tag",
    entityId: "tag-1",
    outputFormatId: "Pdf",
    sizeId: "r80",
    reportDefinitionId: "d-80",
  });
  expect(deps.rasterize).toHaveBeenCalledWith(URI, rasterOptions(profile));
  expect(deps.send).toHaveBeenCalledWith(
    profile,
    expect.objectContaining({ bytes: expect.any(Uint8Array) }),
  );
  expect(onStage.mock.calls.map(([stage]) => stage)).toEqual([
    "downloading",
    "preparing",
    "printing",
  ]);
  expect(deps.deleteFile).toHaveBeenCalledWith(URI);
});

it("passes on the printer's warnings", async () => {
  const { run } = setup({
    send: jest.fn(async () => ({
      bytesSent: 10,
      millis: 5,
      statusBefore: [OK | 0x08, OK, OK],
      statusAfter: [OK, OK, OK],
    })),
  });

  await expect(run()).resolves.toEqual({ warnings: ["offline"] });
});

it("reports a refused download with the server's own message", async () => {
  const refusal = new ApiError(
    { method: "GET", url: "/x" } as never,
    {
      url: "/x",
      ok: false,
      status: 403,
      statusText: "Forbidden",
      body: { error: { message: "The definition is inactive." } },
    },
    "Forbidden",
  );
  const { deps, run } = setup({ download: jest.fn(async () => Promise.reject(refusal)) });

  await expect(failureOf(run())).resolves.toEqual({
    kind: "download",
    serverMessage: "The definition is inactive.",
  });
  expect(deps.rasterize).not.toHaveBeenCalled();
  expect(deps.deleteFile).not.toHaveBeenCalled();
});

it("reports a printer error by its code and still deletes the PDF", async () => {
  const { deps, run } = setup({
    send: jest.fn(async () =>
      Promise.reject(Object.assign(new Error("x"), { code: "E_PAPER_OUT" })),
    ),
  });

  await expect(failureOf(run())).resolves.toEqual({
    kind: "printer",
    code: "E_PAPER_OUT",
  });
  expect(deps.deleteFile).toHaveBeenCalledWith(URI);
});

it("treats a PDF the phone cannot render as a printer-side failure", async () => {
  const { run } = setup({
    rasterize: jest.fn(async () =>
      Promise.reject(Object.assign(new Error("x"), { code: "E_PDF_FAILED" })),
    ),
  });

  await expect(failureOf(run())).resolves.toEqual({
    kind: "printer",
    code: "E_PDF_FAILED",
  });
});

it("cancelled during the download sends nothing and deletes the file", async () => {
  const { controller, deps, run } = setup();
  deps.download = jest.fn(async () => {
    controller.abort();
    return URI;
  });

  await expect(failureOf(run())).resolves.toEqual({ kind: "cancelled" });
  expect(deps.send).not.toHaveBeenCalled();
  expect(deps.deleteFile).toHaveBeenCalledWith(URI);
});

it("reports a cancel while sending as a cancel, not an error", async () => {
  const { run } = setup({
    send: jest.fn(async () =>
      Promise.reject(Object.assign(new Error("x"), { code: "E_CANCELLED" })),
    ),
  });

  await expect(failureOf(run())).resolves.toEqual({ kind: "cancelled" });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/features/printing/__tests__/printReport.test.ts`
Expected: FAIL, "Cannot find module '@/features/printing/printReport'".

- [ ] **Step 3: Implement `printReport.ts`**

```ts
import type { EntityReportRequest } from "@/actions/ReportService/actions";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  printerErrorCode,
  type PrinterErrorCode,
  type RasterOptions,
  type RasterPage,
  type SendResult,
} from "./bluetoothPrinter";
import { encodePages, type PrintJob } from "./printJob";
import { rasterOptions, type PrinterProfile } from "./profile";
import { exportParams, type LayoutChoice } from "./reportOptions";
import { jobWarningCodes, type JobWarning } from "./status";

export type PrintStage = "downloading" | "preparing" | "printing";

export type PrintFailure =
  | { kind: "cancelled" }
  | { kind: "download"; serverMessage: string | undefined }
  | { kind: "printer"; code: PrinterErrorCode };

export class PrintReportError extends Error {
  constructor(readonly failure: PrintFailure) {
    super(failure.kind);
    this.name = "PrintReportError";
  }
}

export type PrintReportDeps = {
  download: (request: EntityReportRequest) => Promise<string>;
  rasterize: (uri: string, options: RasterOptions) => Promise<RasterPage[]>;
  send: (profile: PrinterProfile, job: PrintJob) => Promise<SendResult>;
  deleteFile: (uri: string) => void;
};

export type PrintReportInput = {
  entityTypeId: string;
  entityId: string;
  choice: LayoutChoice;
  profile: PrinterProfile;
  signal: AbortSignal;
  onStage: (stage: PrintStage) => void;
};

const cancelled = () => new PrintReportError({ kind: "cancelled" });

/**
 * Downloads one entity's report, renders it at the printer's width and sends
 * it. A cancel cannot interrupt the download itself, so its result is dropped
 * before anything reaches the printer.
 */
export async function printReport(
  input: PrintReportInput,
  deps: PrintReportDeps,
): Promise<{ warnings: JobWarning[] }> {
  const { profile, signal, onStage } = input;

  onStage("downloading");
  let uri: string;
  try {
    uri = await deps.download({
      entityTypeId: input.entityTypeId,
      entityId: input.entityId,
      ...exportParams(input.choice),
    });
  } catch (error) {
    if (signal.aborted) throw cancelled();
    throw new PrintReportError({
      kind: "download",
      serverMessage: getApiErrorMessage(error),
    });
  }

  try {
    if (signal.aborted) throw cancelled();
    onStage("preparing");
    const pages = await deps.rasterize(uri, rasterOptions(profile));
    if (signal.aborted) throw cancelled();
    onStage("printing");
    const result = await deps.send(profile, encodePages(pages, profile));
    return {
      warnings: jobWarningCodes(result.statusBefore ?? [], result.statusAfter ?? []),
    };
  } catch (error) {
    if (error instanceof PrintReportError) throw error;
    const code = printerErrorCode(error);
    throw new PrintReportError(
      code === "E_CANCELLED" || signal.aborted
        ? { kind: "cancelled" }
        : { kind: "printer", code },
    );
  } finally {
    deps.deleteFile(uri);
  }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx jest src/features/printing/__tests__/printReport.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Write the failing messages test**

`src/features/printing/__tests__/messages.test.ts`:

```ts
import { failureMessage, opensPrinters } from "@/features/printing/messages";

const t = (key: string) => key;

describe("failureMessage", () => {
  it("shows the server's own words for a refused export", () => {
    expect(
      failureMessage({ kind: "download", serverMessage: "Inactive." }, t),
    ).toBe("Inactive.");
  });

  it("falls back to our sentence when the server said nothing", () => {
    expect(failureMessage({ kind: "download", serverMessage: undefined }, t)).toBe(
      "MobileApp.Printing.Errors.DownloadFailed",
    );
  });

  it("names the printer's problem by its code", () => {
    expect(failureMessage({ kind: "printer", code: "E_PAPER_OUT" }, t)).toBe(
      "MobileApp.Printing.Errors.E_PAPER_OUT",
    );
  });
});

describe("opensPrinters", () => {
  it("sends a lost pairing or a missing permission to the Printers page", () => {
    expect(opensPrinters({ kind: "printer", code: "E_NOT_PAIRED" })).toBe(true);
    expect(opensPrinters({ kind: "printer", code: "E_PERMISSION" })).toBe(true);
    expect(opensPrinters({ kind: "printer", code: "E_DISABLED" })).toBe(true);
  });

  it("does not for a problem the printer itself must fix", () => {
    expect(opensPrinters({ kind: "printer", code: "E_PAPER_OUT" })).toBe(false);
    expect(opensPrinters({ kind: "download", serverMessage: undefined })).toBe(false);
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `npx jest src/features/printing/__tests__/messages.test.ts`
Expected: FAIL, "Cannot find module '@/features/printing/messages'".

- [ ] **Step 7: Implement `messages.ts` and `senders.ts`**

`src/features/printing/messages.ts`:

```ts
import type { TranslationKey } from "@/localization/config";
import type { PrinterErrorCode } from "./bluetoothPrinter";
import type { PrintFailure, PrintStage } from "./printReport";
import type { JobWarning } from "./status";

export const PRINTER_ERROR_KEYS: Record<PrinterErrorCode, TranslationKey> = {
  E_UNSUPPORTED: "MobileApp.Printing.Errors.E_UNSUPPORTED",
  E_DISABLED: "MobileApp.Printing.Errors.E_DISABLED",
  E_PERMISSION: "MobileApp.Printing.Errors.E_PERMISSION",
  E_PAIR_FAILED: "MobileApp.Printing.Errors.E_PAIR_FAILED",
  E_UNPAIR_FAILED: "MobileApp.Printing.Errors.E_UNPAIR_FAILED",
  E_NOT_PAIRED: "MobileApp.Printing.Errors.E_NOT_PAIRED",
  E_CONNECT_FAILED: "MobileApp.Printing.Errors.E_CONNECT_FAILED",
  E_WRITE_FAILED: "MobileApp.Printing.Errors.E_WRITE_FAILED",
  E_PAPER_OUT: "MobileApp.Printing.Errors.E_PAPER_OUT",
  E_COVER_OPEN: "MobileApp.Printing.Errors.E_COVER_OPEN",
  E_BUSY: "MobileApp.Printing.Errors.E_BUSY",
  E_CANCELLED: "MobileApp.Printing.Errors.E_CANCELLED",
  E_PDF_FAILED: "MobileApp.Printing.Errors.E_PDF_FAILED",
  E_UNKNOWN: "MobileApp.Printing.Errors.E_UNKNOWN",
};

export const WARNING_KEYS: Record<JobWarning, TranslationKey> = {
  offline: "MobileApp.Printing.Warnings.offline",
  paperLow: "MobileApp.Printing.Warnings.paperLow",
  paperOut: "MobileApp.Printing.Warnings.paperOut",
  coverOpened: "MobileApp.Printing.Warnings.coverOpened",
};

export const STAGE_KEYS: Record<PrintStage, TranslationKey> = {
  downloading: "MobileApp.Printing.Stage.downloading",
  preparing: "MobileApp.Printing.Stage.preparing",
  printing: "MobileApp.Printing.Stage.printing",
};

/** The server's words for a refused export (already localized by the backend), else ours. */
export function failureMessage(
  failure: PrintFailure,
  t: (key: TranslationKey) => string,
): string {
  if (failure.kind === "download") {
    return failure.serverMessage ?? t("MobileApp.Printing.Errors.DownloadFailed");
  }
  if (failure.kind === "printer") return t(PRINTER_ERROR_KEYS[failure.code]);
  return t("MobileApp.Printing.Errors.E_CANCELLED");
}

const FIXED_ON_PRINTERS_PAGE: readonly PrinterErrorCode[] = [
  "E_NOT_PAIRED",
  "E_PERMISSION",
  "E_DISABLED",
];

/** Failures the Printers page can fix: pairing, permission, Bluetooth off. */
export const opensPrinters = (failure: PrintFailure) =>
  failure.kind === "printer" && FIXED_ON_PRINTERS_PAGE.includes(failure.code);
```

`src/features/printing/senders.ts`:

```ts
import { requireBluetoothPrinter, type SendResult } from "./bluetoothPrinter";
import type { PrintJob } from "./printJob";
import {
  sendOptions,
  type PrinterConnection,
  type PrinterProfile,
} from "./profile";

export type Sender = (profile: PrinterProfile, job: PrintJob) => Promise<SendResult>;

const sendOverBluetooth: Sender = (profile, job) =>
  requireBluetoothPrinter().send(profile.address, job.bytes, {
    ...sendOptions(profile),
    paceMs: job.paceMs,
  });

/** One per way of reaching a printer; network printers add theirs here. */
const SENDERS: Record<PrinterConnection, Sender> = { bluetooth: sendOverBluetooth };

export const senderFor = (profile: PrinterProfile): Sender =>
  SENDERS[profile.connection];
```

- [ ] **Step 8: Run the tests and type-check**

Run: `npx jest src/features/printing && npm run typecheck 2>&1 | tail -5`
Expected: tests pass. Type-check shows only the Task 5 errors in `PrinterTestScreen.tsx`.

- [ ] **Step 9: Commit**

```bash
git add src/features/printing
git commit -q -F - <<'MSG'
feat(printing): run one report print job, with stages, cancel and coded failures

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 8: Who may print: grants, `canPrintLocally`, and the tag rule

**Files:**
- Create: `src/features/printing/grants.ts`, `src/features/printing/support.ts`
- Modify: `src/utils/tagActions.ts`, `src/utils/__tests__/tagActions.test.ts`
- Modify: `src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx`

**Interfaces:**
- Produces:
  - `REPORT_EXPORT_POLICIES` and `REPORT_CATALOGUE_POLICIES`, each `readonly Policies[]`;
  - `canPrintLocally(): boolean`;
  - `TagActionContext.canPrintLocally?: boolean`;
  - `TagActionRule.alsoGrantedBy?: { policies: readonly Policies[]; when: (ctx: Pick<TagActionContext, "canPrintLocally">) => boolean }`;
  - `hasTagActionGrants(id, ctx: Pick<TagActionContext, "policies" | "canPrintLocally">)`.

- [ ] **Step 1: Write the failing test**

Append to `src/utils/__tests__/tagActions.test.ts`:

```ts
describe("print", () => {
  const grant = (names: readonly string[]) =>
    Object.fromEntries(names.map((name) => [name, true]));
  const DEVICE = grant(TAG_ACTION_RULES.print.policies ?? []);
  const REPORT = grant([
    "ReportService.Reports",
    "ReportService.Reports.CreateSynchronously",
  ]);

  it("is offered to an account that can command a printing device", () => {
    expect(blockFor("print", { policies: DEVICE })).toBeUndefined();
  });

  it("is offered to a phone that prints the report itself", () => {
    expect(
      blockFor("print", { policies: REPORT, canPrintLocally: true }),
    ).toBeUndefined();
  });

  it("is not offered for report printing on a phone that cannot print", () => {
    expect(
      blockFor("print", { policies: REPORT, canPrintLocally: false }),
    ).toBe("missingPermission");
    expect(blockFor("print", { policies: REPORT })).toBe("missingPermission");
  });

  it("is not offered without either set", () => {
    expect(blockFor("print", { policies: {}, canPrintLocally: true })).toBe(
      "missingPermission",
    );
  });

  it("names the report export's full set as its alternative", () => {
    expect(
      [...(TAG_ACTION_RULES.print.alsoGrantedBy?.policies ?? [])].sort(),
    ).toEqual(["ReportService.Reports", "ReportService.Reports.CreateSynchronously"]);
  });

  it("answers the same for a bulk surface", () => {
    expect(
      hasTagActionGrants("print", { policies: REPORT, canPrintLocally: true }),
    ).toBe(true);
    expect(hasTagActionGrants("print", { policies: REPORT })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/utils/__tests__/tagActions.test.ts -t print`
Expected: FAIL. TypeScript reports that `canPrintLocally` and `alsoGrantedBy` don't exist (ts-jest), or the report-grant cases come back `missingPermission`.

- [ ] **Step 3: Create the grants and support modules**

`src/features/printing/grants.ts`:

```ts
import type { Policies } from "@/actions/AccountService/types";

/** GET reports/synchronously/by-entity. */
export const REPORT_EXPORT_POLICIES = [
  "ReportService.Reports",
  "ReportService.Reports.CreateSynchronously",
] as const satisfies readonly Policies[];

/** GET reports/catalogue. */
export const REPORT_CATALOGUE_POLICIES = [
  "ReportService.Reports",
  "ReportService.Reports.ViewDefinitionListByEntity",
] as const satisfies readonly Policies[];
```

`src/features/printing/support.ts`:

```ts
import { Platform } from "react-native";
import { getBluetoothPrinter } from "./bluetoothPrinter";

/** Whether this phone can print a report on its own printer. Android only until a BLE transport exists. */
export function canPrintLocally(): boolean {
  if (Platform.OS !== "android") return false;
  try {
    return getBluetoothPrinter()?.isSupported() === true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Change `tagActions.ts`**

Add the import beside the existing ones:

```ts
import { REPORT_EXPORT_POLICIES } from "@/features/printing/grants";
```

In `TagActionContext`, after `billed: boolean;`:

```ts
  /**
   * Whether this phone can print a report itself (`canPrintLocally()`). Absent
   * reads as false, so a surface that does not say offers device printing only.
   */
  canPrintLocally?: boolean;
```

In `TagActionRule`, after `policies?: readonly Policies[];`:

```ts
  /**
   * A second set that grants the action on its own while `when` holds. Print
   * is two different endpoints: command a device, or render the report and
   * print it on this phone's printer. Either is enough.
   */
  alsoGrantedBy?: {
    policies: readonly Policies[];
    when: (ctx: Pick<TagActionContext, "canPrintLocally">) => boolean;
  };
```

In the `print` rule, after its `policies` array:

```ts
    alsoGrantedBy: {
      policies: REPORT_EXPORT_POLICIES,
      when: (ctx) => ctx.canPrintLocally === true,
    },
```

Add above `hasTagActionGrants`:

```ts
function isGranted(
  rule: TagActionRule,
  ctx: Pick<TagActionContext, "policies" | "canPrintLocally">,
): boolean {
  if (isActionGranted(ctx.policies, rule.policies)) return true;
  const alternative = rule.alsoGrantedBy;
  return (
    !!alternative &&
    alternative.when(ctx) &&
    isActionGranted(ctx.policies, alternative.policies)
  );
}
```

Change `hasTagActionGrants` to:

```ts
export function hasTagActionGrants(
  id: TagActionId,
  ctx: Pick<TagActionContext, "policies" | "canPrintLocally">,
): boolean {
  // Bulk deliberately: every caller is a batch surface.
  return isGranted(TAG_ACTION_RULES[id], ctx);
}
```

In `verdictFor`, delete the `const policies = rule.policies;` line and change the permission check to:

```ts
    if (!isGranted(rule, ctx)) {
      return "missingPermission";
    }
```

- [ ] **Step 5: Pass the flag from the tag screen**

In `src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx`, add:

```ts
import { canPrintLocally } from "@/features/printing/support";
```

and in the `tagActionVerdicts({ … })` call, after `billed: …,`:

```ts
    canPrintLocally: canPrintLocally(),
```

- [ ] **Step 6: Run the tests**

Run: `npx jest src/utils/__tests__ src/screens/shared/Tags`
Expected: all pass. The existing `REQUIRED_POLICIES` pin for `print` still holds, because `policies` is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/features/printing/grants.ts src/features/printing/support.ts src/utils/tagActions.ts src/utils/__tests__/tagActions.test.ts src/screens/shared/Tags/TagDetail/TagDetailScreen.tsx
git commit -q -F - <<'MSG'
feat(printing): offer Print to a phone that can print the tag's report itself

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 9: The Printers page (promoted, translated, bench tools removed)

**Files:**
- Rename: `src/screens/staff/Printers/PrinterTestScreen.tsx` → `PrintersScreen.tsx`; `src/app/(auth)/(modals)/printer-test.tsx` → `printers.tsx`
- Modify: `src/screens/staff/Printers/_components/{StatusPanel,DeviceList,SettingsForm,BusyPanel}.tsx`, `src/screens/staff/Printers/useBluetoothPrinters.ts`
- Modify: `src/screens/staff/Printers/__tests__/{BusyPanel.router.test.tsx,useBluetoothPrinters.router.test.ts}`
- Delete: `src/screens/staff/Printers/_components/PreviewPanel.tsx`, `src/screens/staff/Printers/__tests__/PreviewPanel.router.test.tsx`, `src/features/printing/samplePdf.ts`, `assets/printing/TagDetailReport_58MM_FRO.pdf`
- Modify: `src/screens/shared/Profile/StaffProfileScreen.tsx`, `metro.config.js`, `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: `PRINTER_ERROR_KEYS` (Task 7), `senderFor` (Task 7), `REPORT_EXPORT_POLICIES` (Task 8), `decodeStatus` (existing).
- Produces:
  - the route `/(auth)/(modals)/printers`, which Task 11 navigates to;
  - `useBluetoothPrinters().error` is now `PrinterErrorCode | null` instead of an English string.

The sample-PDF preview and "Pick a PDF…" were bench tools for the first spike. Real prints now come from the tag, so they go. The user may object to this when reviewing the plan.

- [ ] **Step 1: Change the hook's error to a code, with its test first**

In `src/screens/staff/Printers/__tests__/useBluetoothPrinters.router.test.ts`, replace:

```ts
    expect(result.current.error).toMatch(/Bluetooth settings/);
```

with:

```ts
    expect(result.current.error).toBe("E_UNPAIR_FAILED");
```

Run: `npx jest src/screens/staff/Printers/__tests__/useBluetoothPrinters.router.test.ts`
Expected: FAIL on that assertion.

In `useBluetoothPrinters.ts`:
- replace the `printerErrorMessage` import with `printerErrorCode, type PrinterErrorCode`;
- change `useState<string | null>(null)` for `error` to `useState<PrinterErrorCode | null>(null)`;
- replace every `setError(printerErrorMessage(e))` with `setError(printerErrorCode(e))`.

Run the test again. Expected: PASS.

- [ ] **Step 2: Translate `BusyPanel`, with its test first**

Replace `src/screens/staff/Printers/__tests__/BusyPanel.router.test.tsx` with:

```tsx
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { BusyPanel } from "../_components/BusyPanel";

jest.mock("@/components/Ionicons", () => ({ Ionicons: () => null }));
jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));

describe("BusyPanel", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("says what is running and cancels it", () => {
    const onCancel = jest.fn();
    const { getByText } = render(<BusyPanel label="Test page" onCancel={onCancel} />);

    expect(getByText(/Test page/)).toBeTruthy();
    fireEvent.press(getByText("MobileApp.Printing.Cancel"));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("offers no Cancel on a build that cannot cancel", () => {
    const { queryByText } = render(<BusyPanel label="Test page" />);

    expect(queryByText("MobileApp.Printing.Cancel")).toBeNull();
  });
});
```

Replace `BusyPanel.tsx` with:

```tsx
import { Button, Text } from "@/components/rnr";
import { useLocalization } from "@/providers/LocalizationProvider";
import React from "react";
import { ActivityIndicator, View } from "react-native";

export function BusyPanel({
  label,
  onCancel,
}: {
  label: string;
  onCancel?: () => void;
}) {
  const { t } = useLocalization();
  return (
    <View className="mt-6 flex-row items-center gap-3 rounded-md border border-info bg-card p-4">
      <ActivityIndicator />
      <View className="flex-1">
        <Text className="text-sm font-semibold text-foreground">{label}…</Text>
        <Text className="text-xs text-muted">
          {t("MobileApp.Printing.ConnectHint")}
        </Text>
      </View>
      {onCancel ? (
        <Button
          size="sm"
          variant="outline"
          action={{ label: t("MobileApp.Printing.Cancel"), onPress: onCancel }}
        />
      ) : null}
    </View>
  );
}
```

Run: `npx jest src/screens/staff/Printers/__tests__/BusyPanel.router.test.tsx`
Expected: 2 passed.

- [ ] **Step 3: Translate `StatusPanel`**

Replace the body strings of `StatusPanel.tsx`. Its new full content:

```tsx
import { Button, Text } from "@/components/rnr";
import { useLocalization } from "@/providers/LocalizationProvider";
import React from "react";
import { Linking, View } from "react-native";

import type { BluetoothPrinters } from "../useBluetoothPrinters";

export function StatusPanel({ bt }: { bt: BluetoothPrinters }) {
  const { t } = useLocalization();

  if (!bt.supported) {
    return (
      <Panel>
        <Text className="text-sm text-foreground">
          {t("MobileApp.Printing.Page.NotSupported")}
        </Text>
      </Panel>
    );
  }

  if (bt.permitted === false) {
    return (
      <Panel>
        <Text className="text-sm text-foreground">
          {t("MobileApp.Printing.Page.NeedsPermission")}
        </Text>
        <View className="flex-row gap-2">
          <Button
            size="sm"
            action={{
              label: t("MobileApp.Printing.Page.GrantPermission"),
              onPress: () => void bt.grant(),
            }}
          />
          <Button
            size="sm"
            variant="outline"
            action={{
              label: t("MobileApp.Printing.Page.OpenSettings"),
              onPress: () => void Linking.openSettings(),
            }}
          />
        </View>
      </Panel>
    );
  }

  if (!bt.enabled) {
    return (
      <Panel>
        <Text className="text-sm text-foreground">
          {t("MobileApp.Printing.Page.BluetoothOff")}
        </Text>
        <Button
          size="sm"
          iconName="bluetooth-outline"
          action={{
            label: t("MobileApp.Printing.Page.TurnOnBluetooth"),
            onPress: bt.enable,
          }}
        />
      </Panel>
    );
  }

  return null;
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <View className="mt-4 gap-3 rounded-md border border-warning bg-card p-4">
      {children}
    </View>
  );
}
```

- [ ] **Step 4: Translate `DeviceList`**

In `DeviceList.tsx`:
- add `import { useLocalization } from "@/providers/LocalizationProvider";` and `import { PRINTER_ERROR_KEYS } from "@/features/printing/messages";`;
- add `const { t } = useLocalization();` as the first line of `DeviceList`;
- then make these replacements:

| Was | Becomes |
|---|---|
| `Paired devices` (text child) | `{t("MobileApp.Printing.Page.Paired")}` |
| `label: "Scan"` | `label: t("MobileApp.Printing.Page.Scan")` |
| the PIN hint text child | `{t("MobileApp.Printing.Page.PairHint")}` |
| `No paired devices yet.` | `{t("MobileApp.Printing.Page.NoPaired")}` |
| ``accessibilityLabel={`Forget ${displayName(device)}`}`` | `accessibilityLabel={t("MobileApp.Printing.Page.ForgetLabel", { name: displayName(device) })}` |
| `>Forget<` text | `>{t("MobileApp.Printing.Page.Forget")}<` |
| `Nearby` text child | `{t("MobileApp.Printing.Page.Nearby")}` |
| `>Pair<` text | `>{t("MobileApp.Printing.Page.Pair")}<` |
| `{bt.error ? <Text …>{bt.error}</Text> : null}` | `{bt.error ? <Text className="text-sm text-error">{t(PRINTER_ERROR_KEYS[bt.error])}</Text> : null}` |

- [ ] **Step 5: Translate `SettingsForm`**

In `SettingsForm.tsx`:
- add `import { useLocalization } from "@/providers/LocalizationProvider";`;
- add `const { t } = useLocalization();` as the first line of `SettingsForm`;
- write `const S = "MobileApp.Printing.Page.Settings" as const;` above the component;
- replace each literal as follows (every key is from Task 6):

| Literal | Replacement |
|---|---|
| `{profile.name} settings` | `{t(\`${S}.Title\`, { name: profile.name })}` |
| `"Printer language"` | `t(\`${S}.Language\`)` |
| `"ESC/POS (most receipt printers)"` | `t(\`${S}.LanguageEscpos\`)` |
| `"CPCL (Zebra-style, e.g. MTP-3)"` | `t(\`${S}.LanguageCpcl\`)` |
| `"Paper"` | `t(\`${S}.Paper\`)` |
| `"Custom"` | `t(\`${S}.PaperCustom\`)` |
| `"Print width (dots)"` / its description | `t(\`${S}.WidthDots\`)` / `t(\`${S}.WidthDotsHelp\`)` |
| `"Trim side margins"` / description | `t(\`${S}.TrimMargins\`)` / `t(\`${S}.TrimMarginsHelp\`)` |
| `"Black and white"`, `"Threshold (text)"`, `"Dither (photos)"` | `t(\`${S}.Tone\`)`, `t(\`${S}.ToneThreshold\`)`, `t(\`${S}.ToneDither\`)` |
| `"Threshold"` / `"1–254. Higher prints darker."` | `t(\`${S}.Threshold\`)` / `t(\`${S}.ThresholdHelp\`)` |
| `"Cut"`, `"None (tear bar)"`, `"Partial"`, `"Full"` | `t(\`${S}.Cut\`)`, `t(\`${S}.CutNone\`)`, `t(\`${S}.CutPartial\`)`, `t(\`${S}.CutFull\`)` |
| `"Tear line"` / description | `t(\`${S}.TearLine\`)` / `t(\`${S}.TearLineHelp\`)` |
| `"Feed after print (mm)"` / description | `t(\`${S}.FeedMm\`)` / `t(\`${S}.FeedMmHelp\`)` |
| cutter text child | `{t(\`${S}.CutterFeeds\`)}` |
| `"Check paper and cover"` / description | `t(\`${S}.CheckStatus\`)` / `t(\`${S}.CheckStatusHelp\`)` |
| `"Hide advanced"` / `"Show advanced"` | `t(\`${S}.HideAdvanced\`)` / `t(\`${S}.ShowAdvanced\`)` |
| `"Raster command"`, `"GS v 0"`, `"ESC * (older printers)"` | `t(\`${S}.RasterCommand\`)`, `t(\`${S}.RasterGsv0\`)`, `t(\`${S}.RasterEscStar\`)` |
| `"Dense-line time (ms)"` / description | `t(\`${S}.DenseLineMs\`)` / `t(\`${S}.DenseLineMsHelp\`)` |
| `"Send blank lines as paper feed"` / description | `t(\`${S}.SkipBlankRows\`)` / `t(\`${S}.SkipBlankRowsHelp\`)` |
| `"Band height (rows)"` / `"Rows per CPCL page"` | `t(\`${S}.BandHeight\`)` / `t(\`${S}.CpclPageRows\`)` |
| the two band descriptions | `t(\`${S}.BandHeightHelp\`)` / `t(\`${S}.CpclPageRowsHelp\`)` |
| `"Wait after connecting (ms)"` / description | `t(\`${S}.SettleMs\`)` / `t(\`${S}.SettleMsHelp\`)` |
| `"Chunk size (bytes)"` | `t(\`${S}.ChunkSize\`)` |
| `"Extra delay between chunks (ms)"` / description | `t(\`${S}.ChunkDelayMs\`)` / `t(\`${S}.ChunkDelayMsHelp\`)` |
| `"Wait before disconnecting (ms)"` / description | `t(\`${S}.LingerMs\`)` / `t(\`${S}.LingerMsHelp\`)` |

- [ ] **Step 6: Remove the bench tools and rename the screen and route**

```bash
git rm -q src/screens/staff/Printers/_components/PreviewPanel.tsx src/screens/staff/Printers/__tests__/PreviewPanel.router.test.tsx src/features/printing/samplePdf.ts assets/printing/TagDetailReport_58MM_FRO.pdf
git mv src/screens/staff/Printers/PrinterTestScreen.tsx src/screens/staff/Printers/PrintersScreen.tsx
git mv "src/app/(auth)/(modals)/printer-test.tsx" "src/app/(auth)/(modals)/printers.tsx"
git checkout origin/main -- metro.config.js
npm uninstall expo-document-picker
grep -rn "samplePdf\|expo-document-picker\|PreviewPanel\|printer-test" src app.config.* 2>/dev/null
```
Expected: the last grep finds only `PrintersScreen.tsx` (rewritten next) and `StaffProfileScreen.tsx` (Step 8).

`src/app/(auth)/(modals)/printers.tsx` becomes:

```tsx
import PrintersScreen from "@/screens/staff/Printers/PrintersScreen";

export default function Page() {
  return <PrintersScreen />;
}
```

- [ ] **Step 7: Rewrite `PrintersScreen.tsx`**

Full content:

```tsx
import { Text } from "@/components/rnr";
import {
  getBluetoothPrinter,
  printerErrorCode,
  requireBluetoothPrinter,
  type BluetoothDevice,
  type StatusBytes,
} from "@/features/printing/bluetoothPrinter";
import { displayName } from "@/features/printing/devices";
import { PRINTER_ERROR_KEYS, WARNING_KEYS } from "@/features/printing/messages";
import { defaultProfile } from "@/features/printing/profile";
import { senderFor } from "@/features/printing/senders";
import { decodeStatus, jobWarningCodes } from "@/features/printing/status";
import { buildTestPage } from "@/features/printing/testPage";
import { useLocalization } from "@/providers/LocalizationProvider";
import usePrinterSettingsStore, { useDefaultPrinter } from "@/store/printerSettings";
import { ModalTemplate } from "@/templates/Modal";
import React, { useState } from "react";
import { Alert, Linking, View } from "react-native";

import { BusyPanel } from "./_components/BusyPanel";
import { DeviceList } from "./_components/DeviceList";
import { SettingsForm } from "./_components/SettingsForm";
import { StatusPanel } from "./_components/StatusPanel";
import { useBluetoothPrinters } from "./useBluetoothPrinters";

type Job = { label: string; lines: string[]; failed: boolean };

/** Pair, set up and check the phone's printers. Prints themselves start from a tag. */
export default function PrintersScreen() {
  const { t } = useLocalization();
  const bt = useBluetoothPrinters();
  const printer = useDefaultPrinter();
  const profiles = usePrinterSettingsStore((state) => state.profiles);
  const saveProfile = usePrinterSettingsStore((state) => state.saveProfile);
  const removeProfile = usePrinterSettingsStore((state) => state.removeProfile);
  const setDefault = usePrinterSettingsStore((state) => state.setDefault);
  const [busy, setBusy] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);

  const canCancel = typeof getBluetoothPrinter()?.cancel === "function";
  const canPrint =
    printer !== null && bt.supported && bt.permitted === true && bt.enabled;

  function select(device: BluetoothDevice) {
    if (!profiles[device.address]) {
      saveProfile(defaultProfile(device.address, displayName(device)));
    }
    setDefault(device.address);
  }

  function forget(device: BluetoothDevice) {
    const name = displayName(device);
    Alert.alert(
      t("MobileApp.Printing.Page.ForgetTitle", { name }),
      t("MobileApp.Printing.Page.ForgetBody"),
      [
        { text: t("MobileApp.Printing.Cancel"), style: "cancel" },
        {
          text: t("MobileApp.Printing.Page.Forget"),
          style: "destructive",
          onPress: async () => {
            removeProfile(device.address);
            if (!(await bt.forget(device))) {
              void Linking.sendIntent("android.settings.BLUETOOTH_SETTINGS");
            }
          },
        },
      ],
    );
  }

  async function run(label: string, task: () => Promise<string[]>) {
    setBusy(label);
    setJob(null);
    try {
      setJob({ label, lines: await task(), failed: false });
    } catch (e) {
      setJob({ label, lines: [t(PRINTER_ERROR_KEYS[printerErrorCode(e)])], failed: true });
    } finally {
      setBusy(null);
    }
  }

  function statusLines(bytes: StatusBytes): string[] {
    const status = decodeStatus(bytes);
    if (!status.answered) return [t("MobileApp.Printing.Page.Status.NoAnswer")];
    const lines: string[] = [];
    if (status.online !== null) {
      lines.push(t(status.online ? "MobileApp.Printing.Page.Status.Online" : "MobileApp.Printing.Page.Status.Offline"));
    }
    if (status.coverOpen !== null) {
      lines.push(t(status.coverOpen ? "MobileApp.Printing.Page.Status.CoverOpen" : "MobileApp.Printing.Page.Status.CoverClosed"));
    }
    if (status.paperOut !== null || status.paperNearEnd !== null) {
      lines.push(
        t(
          status.paperOut
            ? "MobileApp.Printing.Page.Status.PaperOut"
            : status.paperNearEnd
              ? "MobileApp.Printing.Page.Status.PaperLow"
              : "MobileApp.Printing.Page.Status.PaperOk",
        ),
      );
    }
    return lines;
  }

  function checkPrinter() {
    if (!printer) return;
    void run(t("MobileApp.Printing.Page.CheckPrinter"), async () => {
      if (printer.language === "cpcl") {
        return [t("MobileApp.Printing.Page.Status.CpclNoStatus")];
      }
      const module = requireBluetoothPrinter();
      return statusLines(await module.status(printer.address, printer.settleMs));
    });
  }

  function printTestPage() {
    if (!printer) return;
    void run(t("MobileApp.Printing.Page.PrintTestPage"), async () => {
      const result = await senderFor(printer)(printer, buildTestPage(printer, new Date()));
      return [
        t("MobileApp.Printing.Page.TestPageSent", {
          bytes: result.bytesSent,
          seconds: (result.millis / 1000).toFixed(1),
        }),
        ...jobWarningCodes(result.statusBefore ?? [], result.statusAfter ?? []).map(
          (warning) => t(WARNING_KEYS[warning]),
        ),
      ];
    });
  }

  return (
    <ModalTemplate
      title={t("MobileApp.Printing.Page.Title")}
      action={{
        label: t("MobileApp.Printing.Page.PrintTestPage"),
        iconName: "print-outline",
        onPress: printTestPage,
        disabled: !canPrint || busy !== null,
        isLoading: busy === t("MobileApp.Printing.Page.PrintTestPage"),
      }}
      moreActions={[
        {
          label: t("MobileApp.Printing.Page.CheckPrinter"),
          description: t("MobileApp.Printing.Page.CheckPrinterDescription"),
          iconName: "pulse-outline",
          onPress: checkPrinter,
          disabled: !canPrint || busy !== null,
        },
      ]}
    >
      <StatusPanel bt={bt} />

      <DeviceList
        bt={bt}
        selected={printer?.address ?? null}
        onSelect={select}
        onForget={forget}
      />

      {printer ? (
        <SettingsForm key={printer.address} profile={printer} onChange={saveProfile} />
      ) : null}

      {busy ? (
        <BusyPanel
          label={busy}
          onCancel={canCancel ? () => getBluetoothPrinter()?.cancel?.() : undefined}
        />
      ) : null}

      {job ? (
        <View
          className={
            job.failed
              ? "mt-6 gap-1 rounded-md border border-error bg-card p-4"
              : "mt-6 gap-1 rounded-md border border-border bg-card p-4"
          }
        >
          <Text className="text-sm font-semibold text-foreground">{job.label}</Text>
          {job.lines.map((line) => (
            <Text
              key={line}
              className={job.failed ? "text-sm text-error" : "text-sm text-muted"}
            >
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </ModalTemplate>
  );
}
```

- [ ] **Step 8: Rename the profile row and gate it**

In `src/screens/shared/Profile/StaffProfileScreen.tsx`:
- add `import { REPORT_EXPORT_POLICIES } from "@/features/printing/grants";`, `import useUserStore from "@/store/user";` and `import { isActionGranted } from "@/utils/policies";`, and keep the `Platform` import the branch added;
- add `const { user } = useUserStore();` beside the screen's other hooks;
- replace the "Printer test" block with:

```tsx
    // Printing a report needs the export grant; on iOS there is no printer transport yet.
    ...(Platform.OS === "android" &&
    isActionGranted(user?.grantedPolicies, REPORT_EXPORT_POLICIES)
      ? [
          {
            title: t("MobileApp.Profile.Printers"),
            icon: "print-outline" as const,
            onPress: () =>
              guardNav(() => router.push("/(auth)/(modals)/printers")),
          },
        ]
      : []),
```

- [ ] **Step 9: Run the gates for this task**

```bash
npx jest src/screens/staff src/screens/shared/Profile src/features/printing
npm run typecheck 2>&1 | tail -5
npm run lint 2>&1 | tail -3
```
Expected: tests pass. Type-check is back to the Task 1 baseline (the Task 5 errors are gone). Lint shows no new errors.

- [ ] **Step 10: Commit**

```bash
git add -A src/screens/staff src/app assets/printing src/features/printing src/screens/shared/Profile metro.config.js package.json package-lock.json
git status --short
git commit -q -F - <<'MSG'
feat(printing): a translated Printers page in the profile, replacing the printer test bench

The sample-PDF preview and PDF picker were spike tools; a print now starts
from the tag.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```
Before committing, `git status --short` must list only files this task touched.

---

### Task 10: The three print-sheet steps

**Files:**
- Create: `src/screens/shared/Tags/TagDetail/_components/print/PrintTargetStep.tsx`
- Create: `src/screens/shared/Tags/TagDetail/_components/print/PrintLayoutStep.tsx`
- Create: `src/screens/shared/Tags/TagDetail/_components/print/PrintProgressStep.tsx`
- Create: `src/screens/shared/Tags/TagDetail/_components/print/__tests__/PrintSteps.router.test.tsx`

**Interfaces:**
- Consumes: `LayoutRow`, `LayoutChoice` (Task 4); `PrintStage` (Task 7); `STAGE_KEYS` (Task 7).
- Produces (props only, no hooks, so they render safely inside a `<BottomSheet>`):

```ts
export type Translate = (key: TranslationKey, values?: TranslationValues) => string;
export type PrinterTarget = { address: string; name: string; paper: string; lastUsed: boolean };
export type DeviceTarget = { id: string; name: string; online: boolean };
PrintTargetStep(props: { t: Translate; printers: PrinterTarget[] | null; devices: DeviceTarget[] | null;
  busy: boolean; onPickPrinter(address: string): void; onPickDevice(id: string): void; onAddPrinter(): void })
PrintLayoutStep(props: { t: Translate; printerName: string; catalogue: "loading" | "failed" | "ready";
  rows: LayoutRow[]; selected: LayoutChoice; onSelect(choice: LayoutChoice): void; onBack(): void;
  onPrint(choice: LayoutChoice): void; onRetry(): void })
PrintProgressStep(props: { t: Translate; stage: PrintStage | null;
  failure: { message: string; openPrinters: boolean } | null;
  onCancel(): void; onRetry(): void; onBack(): void; onOpenPrinters(): void })
```

- [ ] **Step 1: Write the failing test**

`src/screens/shared/Tags/TagDetail/_components/print/__tests__/PrintSteps.router.test.tsx`:

```tsx
import type { LayoutRow } from "@/features/printing/reportOptions";
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { PrintLayoutStep } from "../PrintLayoutStep";
import { PrintProgressStep } from "../PrintProgressStep";
import { PrintTargetStep } from "../PrintTargetStep";

jest.mock("@/components/Ionicons", () => ({ Ionicons: () => null }));

const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key} ${JSON.stringify(values)}` : key;

const ROWS: LayoutRow[] = [
  {
    sizeId: "a4",
    name: "A4",
    isDefaultSize: true,
    definitions: [{ id: "d-a4", name: "Tag Detail", isDefault: true }],
    fit: "shrunk",
    shrunkToMm: 72,
  },
  {
    sizeId: "r80",
    name: "80 mm receipt",
    isDefaultSize: false,
    definitions: [
      { id: "d-80", name: "Tag Detail (80 mm)", isDefault: true },
      { id: "d-80b", name: "Compact", isDefault: false },
    ],
    fit: "fits",
    shrunkToMm: null,
  },
];

describe("PrintTargetStep", () => {
  const props = {
    t,
    printers: [
      { address: "AA", name: "HM-E300", paper: "80 mm paper", lastUsed: true },
    ],
    devices: [{ id: "dev-1", name: "Desk POS", online: true }],
    busy: false,
    onPickPrinter: jest.fn(),
    onPickDevice: jest.fn(),
    onAddPrinter: jest.fn(),
  };

  it("lists printers and devices and reports which one was picked", () => {
    const { getByText } = render(<PrintTargetStep {...props} />);

    fireEvent.press(getByText("HM-E300"));
    fireEvent.press(getByText("Desk POS"));
    fireEvent.press(getByText("MobileApp.Printing.AddPrinter"));

    expect(props.onPickPrinter).toHaveBeenCalledWith("AA");
    expect(props.onPickDevice).toHaveBeenCalledWith("dev-1");
    expect(props.onAddPrinter).toHaveBeenCalled();
    expect(getByText(/MobileApp\.Printing\.LastUsed/)).toBeTruthy();
  });

  it("hides a group this account or phone cannot use", () => {
    const { queryByText } = render(
      <PrintTargetStep {...props} printers={null} />,
    );

    expect(queryByText("MobileApp.Printing.BluetoothPrinters")).toBeNull();
    expect(queryByText("MobileApp.Printing.ConnectedDevices")).toBeTruthy();
  });

  it("says when there are no printers yet, and still offers Add printer", () => {
    const { getByText } = render(
      <PrintTargetStep {...props} printers={[]} devices={null} />,
    );

    expect(getByText("MobileApp.Printing.NoPrinters")).toBeTruthy();
    expect(getByText("MobileApp.Printing.AddPrinter")).toBeTruthy();
  });

  it("says when there is nothing to print to at all", () => {
    const { getByText } = render(
      <PrintTargetStep {...props} printers={null} devices={[]} />,
    );

    expect(getByText("MobileApp.Printing.NoTargets")).toBeTruthy();
  });
});

describe("PrintLayoutStep", () => {
  const props = {
    t,
    printerName: "HM-E300",
    catalogue: "ready" as const,
    rows: ROWS,
    selected: { sizeId: "r80", reportDefinitionId: "d-80" },
    onSelect: jest.fn(),
    onBack: jest.fn(),
    onPrint: jest.fn(),
    onRetry: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it("badges the fitting size and the shrunk one", () => {
    const { getByText } = render(<PrintLayoutStep {...props} />);

    expect(getByText("MobileApp.Printing.FitsPrinter")).toBeTruthy();
    expect(getByText('MobileApp.Printing.TryIt {"mm":72}')).toBeTruthy();
  });

  it("selects a size with its default definition", () => {
    const { getByText } = render(<PrintLayoutStep {...props} />);

    fireEvent.press(getByText("A4"));

    expect(props.onSelect).toHaveBeenCalledWith({
      sizeId: "a4",
      reportDefinitionId: "d-a4",
    });
  });

  it("offers the versions of the selected size when it has several", () => {
    const { getByText } = render(<PrintLayoutStep {...props} />);

    fireEvent.press(getByText("Compact"));

    expect(props.onSelect).toHaveBeenCalledWith({
      sizeId: "r80",
      reportDefinitionId: "d-80b",
    });
  });

  it("prints the selected layout", () => {
    const { getByText } = render(<PrintLayoutStep {...props} />);

    fireEvent.press(getByText("MobileApp.Printing.Print"));

    expect(props.onPrint).toHaveBeenCalledWith(props.selected);
  });

  it("offers Retry and the default layout when the catalogue failed", () => {
    const { getByText } = render(
      <PrintLayoutStep {...props} catalogue="failed" rows={[]} />,
    );

    fireEvent.press(getByText("MobileApp.Printing.Retry"));
    fireEvent.press(getByText("MobileApp.Printing.PrintDefault"));

    expect(props.onRetry).toHaveBeenCalled();
    expect(props.onPrint).toHaveBeenCalledWith({
      sizeId: null,
      reportDefinitionId: null,
    });
  });
});

describe("PrintProgressStep", () => {
  const props = {
    t,
    stage: "printing" as const,
    failure: null,
    onCancel: jest.fn(),
    onRetry: jest.fn(),
    onBack: jest.fn(),
    onOpenPrinters: jest.fn(),
  };

  it("shows the stage and cancels", () => {
    const { getByText } = render(<PrintProgressStep {...props} />);

    expect(getByText("MobileApp.Printing.Stage.printing")).toBeTruthy();
    fireEvent.press(getByText("MobileApp.Printing.Cancel"));

    expect(props.onCancel).toHaveBeenCalled();
  });

  it("shows why it failed and offers Retry, Back and the Printers page", () => {
    const { getByText } = render(
      <PrintProgressStep
        {...props}
        stage={null}
        failure={{ message: "Paper out.", openPrinters: true }}
      />,
    );

    expect(getByText("Paper out.")).toBeTruthy();
    fireEvent.press(getByText("MobileApp.Printing.Retry"));
    fireEvent.press(getByText("MobileApp.Printing.Back"));
    fireEvent.press(getByText("MobileApp.Printing.OpenPrinters"));

    expect(props.onRetry).toHaveBeenCalled();
    expect(props.onBack).toHaveBeenCalled();
    expect(props.onOpenPrinters).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/screens/shared/Tags/TagDetail/_components/print`
Expected: FAIL, "Cannot find module '../PrintLayoutStep'".

- [ ] **Step 3: Implement `PrintTargetStep.tsx`**

```tsx
import { Ionicons } from "@/components/Ionicons";
import { Text } from "@/components/rnr";
import type { TranslationKey } from "@/localization/config";
import type { TranslationValues } from "@/providers/LocalizationProvider";
import { cn } from "@/utils/cn";
import React from "react";
import { Pressable, View } from "react-native";

export type Translate = (key: TranslationKey, values?: TranslationValues) => string;
export type PrinterTarget = { address: string; name: string; paper: string; lastUsed: boolean };
export type DeviceTarget = { id: string; name: string; online: boolean };

function GroupLabel({ icon, label }: { icon: "bluetooth-outline" | "phone-portrait-outline"; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Ionicons name={icon} size={14} className="text-muted" />
      <Text variant="caption" tone="muted">{label}</Text>
    </View>
  );
}

function TargetRow({
  title,
  subtitle,
  online,
  disabled,
  onPress,
}: {
  title: string;
  subtitle: string;
  online?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "min-h-15 flex-row items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5",
        disabled && "opacity-50",
      )}
    >
      {online !== undefined ? (
        <View className={cn("size-2 rounded-full", online ? "bg-success" : "bg-foreground/20")} />
      ) : null}
      <View className="flex-1">
        <Text variant="labelStrong">{title}</Text>
        <Text variant="caption" tone="muted">{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} className="text-muted" />
    </Pressable>
  );
}

/** Step 1. A group is `null` when this account or phone cannot use that kind of target. */
export function PrintTargetStep({
  t,
  printers,
  devices,
  busy,
  onPickPrinter,
  onPickDevice,
  onAddPrinter,
}: {
  t: Translate;
  printers: PrinterTarget[] | null;
  devices: DeviceTarget[] | null;
  busy: boolean;
  onPickPrinter: (address: string) => void;
  onPickDevice: (id: string) => void;
  onAddPrinter: () => void;
}) {
  const hasDevices = !!devices && devices.length > 0;

  return (
    <View className="gap-4">
      <View className="gap-0.5">
        <Text variant="caption" tone="muted">{t("MobileApp.Printing.Step1of2")}</Text>
        <Text variant="subheading">{t("MobileApp.Printing.WhereTitle")}</Text>
      </View>

      {printers ? (
        <View className="gap-2">
          <GroupLabel icon="bluetooth-outline" label={t("MobileApp.Printing.BluetoothPrinters")} />
          {printers.length === 0 ? (
            <Text variant="label" tone="muted">{t("MobileApp.Printing.NoPrinters")}</Text>
          ) : null}
          {printers.map((printer) => (
            <TargetRow
              key={printer.address}
              title={printer.name}
              subtitle={
                printer.lastUsed
                  ? `${printer.paper} · ${t("MobileApp.Printing.LastUsed")}`
                  : printer.paper
              }
              disabled={busy}
              onPress={() => onPickPrinter(printer.address)}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={onAddPrinter}
            className="min-h-11 flex-row items-center gap-1.5"
          >
            <Ionicons name="add" size={18} className="text-primary" />
            <Text variant="labelStrong" tone="primary">{t("MobileApp.Printing.AddPrinter")}</Text>
          </Pressable>
        </View>
      ) : null}

      {hasDevices ? (
        <View className="gap-2">
          <GroupLabel icon="phone-portrait-outline" label={t("MobileApp.Printing.ConnectedDevices")} />
          {devices.map((device) => (
            <TargetRow
              key={device.id}
              title={device.name}
              subtitle={t("MobileApp.Printing.PrintsRightAway")}
              online={device.online}
              disabled={busy}
              onPress={() => onPickDevice(device.id)}
            />
          ))}
        </View>
      ) : null}

      {!printers && !hasDevices ? (
        <Text variant="label" tone="muted">{t("MobileApp.Printing.NoTargets")}</Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 4: Implement `PrintLayoutStep.tsx`**

```tsx
import { Ionicons } from "@/components/Ionicons";
import { Badge, Button, Text } from "@/components/rnr";
import type { LayoutChoice, LayoutRow } from "@/features/printing/reportOptions";
import { cn } from "@/utils/cn";
import React from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import type { Translate } from "./PrintTargetStep";

const DEFAULT_CHOICE: LayoutChoice = { sizeId: null, reportDefinitionId: null };

function Radio({ on }: { on: boolean }) {
  return (
    <View
      className={cn(
        "size-4.5 items-center justify-center rounded-full border-2",
        on ? "border-primary" : "border-input",
      )}
    >
      {on ? <View className="size-2 rounded-full bg-primary" /> : null}
    </View>
  );
}

/** Step 2: the catalogue's sizes for this printer, and Print. */
export function PrintLayoutStep({
  t,
  printerName,
  catalogue,
  rows,
  selected,
  onSelect,
  onBack,
  onPrint,
  onRetry,
}: {
  t: Translate;
  printerName: string;
  catalogue: "loading" | "failed" | "ready";
  rows: LayoutRow[];
  selected: LayoutChoice;
  onSelect: (choice: LayoutChoice) => void;
  onBack: () => void;
  onPrint: (choice: LayoutChoice) => void;
  onRetry: () => void;
}) {
  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-2.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("MobileApp.Printing.Back")}
          onPress={onBack}
          className="size-11 items-center justify-center rounded-md bg-accent"
        >
          <Ionicons name="chevron-back" size={20} className="text-foreground" />
        </Pressable>
        <View className="flex-1">
          <Text variant="caption" tone="muted">
            {t("MobileApp.Printing.Step2of2", { printer: printerName })}
          </Text>
          <Text variant="subheading">{t("MobileApp.Printing.LayoutTitle")}</Text>
        </View>
      </View>

      {catalogue === "loading" ? (
        <View className="py-6">
          <ActivityIndicator />
        </View>
      ) : null}

      {catalogue === "failed" ? (
        <View className="gap-3">
          <Text variant="label" tone="error">{t("MobileApp.Printing.CatalogueFailed")}</Text>
          <Button action={{ label: t("MobileApp.Printing.Retry"), onPress: onRetry }} />
          <Button
            variant="outline"
            action={{
              label: t("MobileApp.Printing.PrintDefault"),
              onPress: () => onPrint(DEFAULT_CHOICE),
            }}
          />
        </View>
      ) : null}

      {catalogue === "ready" ? (
        <>
          <View className="gap-2">
            {rows.map((row) => {
              const on = row.sizeId === selected.sizeId;
              const definition =
                row.definitions.find((d) => d.id === selected.reportDefinitionId) ??
                row.definitions[0];
              return (
                <View key={row.sizeId ?? "default"} className="gap-1">
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() =>
                      onSelect({
                        sizeId: row.sizeId,
                        reportDefinitionId: row.definitions[0]?.id ?? null,
                      })
                    }
                    className={cn(
                      "min-h-16 flex-row items-center gap-3 rounded-md border px-3 py-2.5",
                      on ? "border-primary bg-primary-surface" : "border-border bg-card",
                    )}
                  >
                    <Radio on={on} />
                    <View className="flex-1">
                      <Text variant="labelStrong">
                        {row.sizeId ? row.name : t("MobileApp.Printing.DefaultLayout")}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {row.sizeId
                          ? (on ? definition?.name : row.definitions[0]?.name) ?? ""
                          : t("MobileApp.Printing.DefaultLayoutHint")}
                      </Text>
                    </View>
                    {row.fit === "fits" ? (
                      <Badge variant="success">
                        <Text>{t("MobileApp.Printing.FitsPrinter")}</Text>
                      </Badge>
                    ) : null}
                    {row.fit === "shrunk" ? (
                      <Badge variant="warning">
                        <Text>{t("MobileApp.Printing.TryIt", { mm: row.shrunkToMm ?? 0 })}</Text>
                      </Badge>
                    ) : null}
                  </Pressable>
                  {on && row.definitions.length > 1 ? (
                    <View className="gap-1 pl-10">
                      {row.definitions.map((d) => (
                        <Pressable
                          key={d.id}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: d.id === selected.reportDefinitionId }}
                          onPress={() =>
                            onSelect({ sizeId: row.sizeId, reportDefinitionId: d.id })
                          }
                          className="min-h-11 flex-row items-center gap-2"
                        >
                          <Radio on={d.id === selected.reportDefinitionId} />
                          <Text variant="label">{d.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
          <Button
            iconName="print-outline"
            action={{ label: t("MobileApp.Printing.Print"), onPress: () => onPrint(selected) }}
          />
        </>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 5: Implement `PrintProgressStep.tsx`**

```tsx
import { Ionicons } from "@/components/Ionicons";
import { Button, Text } from "@/components/rnr";
import { STAGE_KEYS } from "@/features/printing/messages";
import type { PrintStage } from "@/features/printing/printReport";
import React from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import type { Translate } from "./PrintTargetStep";

/** While printing: the stage and Cancel. After a failure: why, and the ways out. */
export function PrintProgressStep({
  t,
  stage,
  failure,
  onCancel,
  onRetry,
  onBack,
  onOpenPrinters,
}: {
  t: Translate;
  stage: PrintStage | null;
  failure: { message: string; openPrinters: boolean } | null;
  onCancel: () => void;
  onRetry: () => void;
  onBack: () => void;
  onOpenPrinters: () => void;
}) {
  if (failure) {
    return (
      <View className="gap-4">
        <View className="flex-row items-center gap-2">
          <Ionicons name="alert-circle" size={22} className="text-error" />
          <Text variant="subheading">{t("MobileApp.Printing.Failed")}</Text>
        </View>
        <Text variant="label">{failure.message}</Text>
        <Button action={{ label: t("MobileApp.Printing.Retry"), onPress: onRetry }} />
        <Button
          variant="outline"
          action={{ label: t("MobileApp.Printing.Back"), onPress: onBack }}
        />
        {failure.openPrinters ? (
          <Pressable accessibilityRole="button" onPress={onOpenPrinters} className="min-h-11 justify-center">
            <Text variant="labelStrong" tone="primary">{t("MobileApp.Printing.OpenPrinters")}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View className="items-center gap-4 py-4">
      <ActivityIndicator size="large" />
      <Text variant="bodyStrong">{stage ? t(STAGE_KEYS[stage]) : ""}</Text>
      {stage === "printing" ? (
        <Text variant="caption" tone="muted" className="text-center">
          {t("MobileApp.Printing.ConnectHint")}
        </Text>
      ) : null}
      <Button
        variant="outline"
        action={{ label: t("MobileApp.Printing.Cancel"), onPress: onCancel }}
      />
    </View>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `npx jest src/screens/shared/Tags/TagDetail/_components/print`
Expected: 11 passed. If a NativeWind class such as `min-h-15` or `size-4.5` is not in the Tailwind scale and the repo's class check rejects it, use `min-h-[60px]` / `size-[18px]`. Bracket values are supported here.

- [ ] **Step 7: Commit**

```bash
git add src/screens/shared/Tags/TagDetail/_components/print
git commit -q -F - <<'MSG'
feat(printing): the print sheet's three steps: where, which layout, progress

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 11: The print sheet container

**Files:**
- Rewrite: `src/screens/shared/Tags/TagDetail/_components/PrintTagSheet.tsx`
- Create: `src/screens/shared/Tags/TagDetail/_components/__tests__/PrintTagSheet.router.test.tsx`

**Interfaces:**
- Consumes: everything above; `postPrintTagApi(deviceId, tagId)`; `useDevices()` → `{ devices: DeviceWithStatus[] }`; `useUserStore()` → `{ user }`.
- Produces: `PrintTagSheet({ tagId, sheetRef })`. The props are unchanged, so `TagDetailScreen` needs no edit.

- [ ] **Step 1: Write the failing test**

`src/screens/shared/Tags/TagDetail/_components/__tests__/PrintTagSheet.router.test.tsx`:

```tsx
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

const mockShow = jest.fn();
const mockPostPrintTag = jest.fn();
const mockCatalogue = jest.fn();
const mockPrintReport = jest.fn();
const mockUser = jest.fn();
const mockDevices = jest.fn();
const mockPush = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("@/components/Ionicons", () => ({ Ionicons: () => null }));
jest.mock("@/providers/LocalizationProvider", () => ({
  useLocalization: () => ({ t: (key: string) => key }),
}));
jest.mock("@/providers/ToastProvider", () => ({
  useToastRef: () => ({ current: { show: (...args: unknown[]) => mockShow(...args) } }),
}));
jest.mock("@/hooks/useDevices", () => ({ useDevices: () => mockDevices() }));
jest.mock("@/store/user", () => ({ __esModule: true, default: () => mockUser() }));
jest.mock("@/actions/DeviceService/post", () => ({
  postPrintTagApi: (...args: unknown[]) => mockPostPrintTag(...args),
}));
jest.mock("@/actions/ReportService/actions", () => ({
  getReportCatalogueApi: (...args: unknown[]) => mockCatalogue(...args),
  downloadEntityReportPdf: jest.fn(),
}));
jest.mock("@/features/printing/printReport", () => ({
  ...jest.requireActual("@/features/printing/printReport"),
  printReport: (...args: unknown[]) => mockPrintReport(...args),
}));
jest.mock("@/features/printing/support", () => ({ canPrintLocally: () => true }));
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@gorhom/bottom-sheet", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  const BottomSheetModal = ReactLib.forwardRef(
    (props: { children?: unknown }, ref: unknown) => {
      ReactLib.useImperativeHandle(ref, () => ({ present: () => {}, dismiss: () => {} }));
      return ReactLib.createElement(View, null, props.children);
    },
  );
  const Passthrough = (props: { children?: unknown }) =>
    ReactLib.createElement(View, null, props.children);
  return {
    __esModule: true,
    BottomSheetModal,
    BottomSheetView: Passthrough,
    BottomSheetBackdrop: () => null,
  };
});

import { defaultProfile } from "@/features/printing/profile";
import { PrintReportError } from "@/features/printing/printReport";
import usePrinterSettingsStore from "@/store/printerSettings";
import { PrintTagSheet } from "../PrintTagSheet";

const DEVICE_GRANTS = {
  "DeviceService.Commands": true,
  "DeviceService.Commands.SubmitPrintTag": true,
  "DeviceService.Devices": true,
  "DeviceService.Devices.ViewList": true,
};
const REPORT_GRANTS = {
  "ReportService.Reports": true,
  "ReportService.Reports.CreateSynchronously": true,
  "ReportService.Reports.ViewDefinitionListByEntity": true,
};
const PRINTER = defaultProfile("AA:BB:CC:DD:EE:FF", "HM-E300");
const CATALOGUE = [
  {
    entityTypeId: "Tag",
    sizes: [
      {
        sizeId: "a4", name: "A4", widthMm: 210, isDefault: true,
        outputFormats: [{ outputFormatId: "Pdf", isDefault: true, definitions: [{ id: "d-a4", name: "Tag Detail", isDefault: true }] }],
      },
      {
        sizeId: "r80", name: "80 mm receipt", widthMm: 80, isDefault: false,
        outputFormats: [{ outputFormatId: "Pdf", isDefault: true, definitions: [{ id: "d-80", name: "Tag Detail (80 mm)", isDefault: true }] }],
      },
    ],
  },
];

function renderSheet() {
  return render(<PrintTagSheet tagId="tag-1" sheetRef={{ current: null }} />);
}

beforeEach(async () => {
  jest.clearAllMocks();
  // Rehydration is async; seeding before it finishes would be overwritten.
  await usePrinterSettingsStore.persist.rehydrate();
  usePrinterSettingsStore.setState({
    profiles: { [PRINTER.address]: PRINTER },
    defaultAddress: null,
    lastLayoutByPrinter: {},
  });
  mockUser.mockReturnValue({ user: { grantedPolicies: { ...DEVICE_GRANTS, ...REPORT_GRANTS } } });
  mockDevices.mockReturnValue({
    devices: [
      { id: "dev-1", displayName: "Desk POS", deviceType: "V3", isOnline: true, availableCommands: ["PrintTag"] },
    ],
  });
  mockCatalogue.mockResolvedValue(CATALOGUE);
  mockPrintReport.mockResolvedValue({ warnings: [] });
});

it("prints to a connected device straight from step 1", async () => {
  const { getByText } = renderSheet();

  await act(async () => fireEvent.press(getByText("Desk POS")));

  expect(mockPostPrintTag).toHaveBeenCalledWith("dev-1", "tag-1");
  expect(mockShow).toHaveBeenCalledWith("success", "MobileApp.TagDetail.PrintSent");
});

it("does not offer Bluetooth printers without the report grant", () => {
  mockUser.mockReturnValue({ user: { grantedPolicies: DEVICE_GRANTS } });
  const { queryByText } = renderSheet();

  expect(queryByText("MobileApp.Printing.BluetoothPrinters")).toBeNull();
  expect(queryByText("Desk POS")).toBeTruthy();
});

it("opens step 2 on the catalogue's layouts", async () => {
  const { getByText } = renderSheet();

  await act(async () => fireEvent.press(getByText("HM-E300")));

  expect(mockCatalogue).toHaveBeenCalledWith({ entityTypeId: "Tag" });
  await waitFor(() => getByText("80 mm receipt"));
  expect(getByText("A4")).toBeTruthy();
  expect(getByText("MobileApp.Printing.FitsPrinter")).toBeTruthy();
});

it("prints the chosen layout and remembers it for this printer", async () => {
  const { getByText } = renderSheet();
  await act(async () => fireEvent.press(getByText("HM-E300")));
  await waitFor(() => getByText("80 mm receipt"));

  await act(async () => fireEvent.press(getByText("MobileApp.Printing.Print")));

  expect(mockPrintReport).toHaveBeenCalledWith(
    expect.objectContaining({
      entityTypeId: "Tag",
      entityId: "tag-1",
      choice: { sizeId: "r80", reportDefinitionId: "d-80" },
    }),
    expect.any(Object),
  );
  expect(mockShow).toHaveBeenCalledWith("success", "MobileApp.Printing.Printed");
  expect(usePrinterSettingsStore.getState().lastLayoutByPrinter[PRINTER.address]).toEqual({
    sizeId: "r80",
    reportDefinitionId: "d-80",
  });
});

it("without the catalogue grant offers only the default layout", async () => {
  mockUser.mockReturnValue({
    user: {
      grantedPolicies: {
        ...DEVICE_GRANTS,
        "ReportService.Reports": true,
        "ReportService.Reports.CreateSynchronously": true,
      },
    },
  });
  const { getByText } = renderSheet();

  await act(async () => fireEvent.press(getByText("HM-E300")));

  expect(mockCatalogue).not.toHaveBeenCalled();
  expect(getByText("MobileApp.Printing.DefaultLayout")).toBeTruthy();
});

it("shows why a print failed and offers Retry", async () => {
  mockPrintReport.mockRejectedValue(
    new PrintReportError({ kind: "printer", code: "E_PAPER_OUT" }),
  );
  const { getByText } = renderSheet();
  await act(async () => fireEvent.press(getByText("HM-E300")));
  await waitFor(() => getByText("80 mm receipt"));

  await act(async () => fireEvent.press(getByText("MobileApp.Printing.Print")));

  expect(getByText("MobileApp.Printing.Errors.E_PAPER_OUT")).toBeTruthy();
  expect(getByText("MobileApp.Printing.Retry")).toBeTruthy();
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/screens/shared/Tags/TagDetail/_components/__tests__/PrintTagSheet.router.test.tsx`
Expected: FAIL. The old sheet has no Bluetooth group and never calls the catalogue.

- [ ] **Step 3: Rewrite `PrintTagSheet.tsx`**

Full content:

```tsx
import { postPrintTagApi } from "@/actions/DeviceService/post";
import {
  downloadEntityReportPdf,
  getReportCatalogueApi,
} from "@/actions/ReportService/actions";
import { BottomSheet } from "@/components/BottomSheet";
import {
  getBluetoothPrinter,
  requireBluetoothPrinter,
} from "@/features/printing/bluetoothPrinter";
import {
  REPORT_CATALOGUE_POLICIES,
  REPORT_EXPORT_POLICIES,
} from "@/features/printing/grants";
import {
  failureMessage,
  opensPrinters,
  WARNING_KEYS,
} from "@/features/printing/messages";
import {
  printReport,
  PrintReportError,
  type PrintFailure,
  type PrintStage,
} from "@/features/printing/printReport";
import {
  DEFAULT_LAYOUT_ROW,
  layoutRows,
  preselect,
  type LayoutChoice,
} from "@/features/printing/reportOptions";
import { senderFor } from "@/features/printing/senders";
import { canPrintLocally } from "@/features/printing/support";
import { useDevices } from "@/hooks/useDevices";
import { useLocalization } from "@/providers/LocalizationProvider";
import { useToastRef } from "@/providers/ToastProvider";
import type { UniRefund_ReportService_Reports_ReportCatalogueEntityTypeDto as CatalogueEntry } from "@/saas/ReportService";
import usePrinterSettingsStore from "@/store/printerSettings";
import useUserStore from "@/store/user";
import { isActionGranted } from "@/utils/policies";
import { TAG_ACTION_RULES } from "@/utils/tagActions";
import { deleteFileQuietly } from "@/utils/tempFile";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

import { PrintLayoutStep } from "./print/PrintLayoutStep";
import { PrintProgressStep } from "./print/PrintProgressStep";
import { PrintTargetStep } from "./print/PrintTargetStep";

const ENTITY_TYPE_ID = "Tag";

type Step =
  | { kind: "target" }
  | { kind: "layout"; address: string }
  | {
      kind: "progress";
      address: string;
      choice: LayoutChoice;
      stage: PrintStage | null;
      failure: PrintFailure | null;
    };

type Catalogue =
  | { status: "idle" | "loading" | "failed" }
  | { status: "ready"; entry: CatalogueEntry | null };

/**
 * Print a tag: on a saved Bluetooth printer (step 2 picks the layout from the
 * report catalogue) or on a connected device (sent straight away).
 *
 * `useLocalization` and `useToastRef` are called here, in the sheet's host,
 * and passed down: a hook called inside `<BottomSheet>` children loses context
 * in this app.
 */
export function PrintTagSheet({
  tagId,
  sheetRef,
}: {
  tagId: string;
  sheetRef: React.RefObject<BottomSheetModal | null>;
}) {
  const { t } = useLocalization();
  const toastRef = useToastRef();
  const { devices } = useDevices();
  const { user } = useUserStore();
  const profiles = usePrinterSettingsStore((state) => state.profiles);
  const lastAddress = usePrinterSettingsStore((state) => state.defaultAddress);
  const lastLayouts = usePrinterSettingsStore((state) => state.lastLayoutByPrinter);
  const rememberPrint = usePrinterSettingsStore((state) => state.rememberPrint);

  const [step, setStep] = useState<Step>({ kind: "target" });
  const [catalogue, setCatalogue] = useState<Catalogue>({ status: "idle" });
  const [choice, setChoice] = useState<LayoutChoice | null>(null);
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const policies = user?.grantedPolicies;
  const canPrintToDevice = isActionGranted(policies, TAG_ACTION_RULES.print.policies);
  const canPrintReport =
    canPrintLocally() && isActionGranted(policies, REPORT_EXPORT_POLICIES);
  const canChooseLayout = isActionGranted(policies, REPORT_CATALOGUE_POLICIES);

  const printers = useMemo(
    () =>
      canPrintReport
        ? Object.values(profiles)
            .sort(
              (a, b) =>
                Number(b.address === lastAddress) - Number(a.address === lastAddress) ||
                a.name.localeCompare(b.name),
            )
            .map((profile) => ({
              address: profile.address,
              name: profile.name,
              lastUsed: profile.address === lastAddress,
              paper:
                profile.paper === "custom"
                  ? t("MobileApp.Printing.PaperCustom")
                  : t("MobileApp.Printing.Paper", { width: profile.paper }),
            }))
        : null,
    [canPrintReport, profiles, lastAddress, t],
  );

  const targets = useMemo(
    () =>
      canPrintToDevice
        ? devices
            .filter((device) => device.availableCommands.includes("PrintTag"))
            .map((device) => ({
              id: device.id,
              name: device.displayName || device.deviceType,
              online: device.isOnline,
            }))
        : null,
    [canPrintToDevice, devices],
  );

  const printer = step.kind === "target" ? null : (profiles[step.address] ?? null);
  const rows = useMemo(() => {
    if (!printer) return [];
    if (!canChooseLayout) return [DEFAULT_LAYOUT_ROW];
    return catalogue.status === "ready" ? layoutRows(catalogue.entry, printer) : [];
  }, [printer, canChooseLayout, catalogue]);
  const selected =
    choice ?? preselect(rows, printer ? lastLayouts[printer.address] : null);
  const printing = step.kind === "progress" && step.failure === null;

  async function loadCatalogue() {
    setCatalogue({ status: "loading" });
    try {
      const entries = await getReportCatalogueApi({ entityTypeId: ENTITY_TYPE_ID });
      setCatalogue({ status: "ready", entry: entries[0] ?? null });
    } catch {
      setCatalogue({ status: "failed" });
    }
  }

  function pickPrinter(address: string) {
    // Android's own "Turn on Bluetooth?" pop-up, while they choose the layout.
    const module = getBluetoothPrinter();
    if (module && !module.isEnabled()) module.requestEnable();
    setChoice(null);
    setStep({ kind: "layout", address });
    if (canChooseLayout && (catalogue.status === "idle" || catalogue.status === "failed")) {
      void loadCatalogue();
    }
  }

  async function pickDevice(deviceId: string) {
    if (sending) return;
    setSending(true);
    sheetRef.current?.dismiss();
    try {
      await postPrintTagApi(deviceId, tagId);
      toastRef.current?.show("success", t("MobileApp.TagDetail.PrintSent"));
    } catch {
      toastRef.current?.show("error", t("MobileApp.TagDetail.PrintFailed"));
    } finally {
      setSending(false);
    }
  }

  async function print(address: string, layout: LayoutChoice) {
    const profile = profiles[address];
    if (!profile || abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const show = (stage: PrintStage | null, failure: PrintFailure | null) =>
      setStep({ kind: "progress", address, choice: layout, stage, failure });

    show("downloading", null);
    try {
      const { warnings } = await printReport(
        {
          entityTypeId: ENTITY_TYPE_ID,
          entityId: tagId,
          choice: layout,
          profile,
          signal: controller.signal,
          onStage: (stage) => show(stage, null),
        },
        {
          download: downloadEntityReportPdf,
          rasterize: (uri, options) => requireBluetoothPrinter().rasterizePdf(uri, options),
          send: senderFor(profile),
          deleteFile: deleteFileQuietly,
        },
      );
      rememberPrint(address, layout);
      toastRef.current?.show(
        warnings.length > 0 ? "warning" : "success",
        [
          t("MobileApp.Printing.Printed", { printer: profile.name }),
          ...warnings.map((warning) => t(WARNING_KEYS[warning])),
        ].join("\n"),
      );
      sheetRef.current?.dismiss();
    } catch (error) {
      const failure: PrintFailure =
        error instanceof PrintReportError
          ? error.failure
          : { kind: "printer", code: "E_UNKNOWN" };
      if (failure.kind === "cancelled") setStep({ kind: "layout", address });
      else show(null, failure);
    } finally {
      abortRef.current = null;
    }
  }

  function cancel() {
    const stop = () => {
      abortRef.current?.abort();
      getBluetoothPrinter()?.cancel?.();
    };
    if (step.kind === "progress" && step.stage === "printing") {
      Alert.alert(t("MobileApp.Printing.StopTitle"), t("MobileApp.Printing.StopWarning"), [
        { text: t("MobileApp.Printing.KeepPrinting"), style: "cancel" },
        { text: t("MobileApp.Printing.Stop"), style: "destructive", onPress: stop },
      ]);
    } else {
      stop();
    }
  }

  function openPrinters() {
    sheetRef.current?.dismiss();
    router.push("/(auth)/(modals)/printers");
  }

  function reset() {
    setStep({ kind: "target" });
    setChoice(null);
  }

  return (
    <BottomSheet ref={sheetRef} busy={printing} onDismiss={reset}>
      <BottomSheetView className="p-4">
        {step.kind === "target" ? (
          <PrintTargetStep
            t={t}
            printers={printers}
            devices={targets}
            busy={sending}
            onPickPrinter={pickPrinter}
            onPickDevice={(id) => void pickDevice(id)}
            onAddPrinter={openPrinters}
          />
        ) : step.kind === "layout" ? (
          <PrintLayoutStep
            t={t}
            printerName={printer?.name ?? ""}
            catalogue={
              !canChooseLayout || catalogue.status === "ready"
                ? "ready"
                : catalogue.status === "failed"
                  ? "failed"
                  : "loading"
            }
            rows={rows}
            selected={selected}
            onSelect={setChoice}
            onBack={() => setStep({ kind: "target" })}
            onPrint={(layout) => void print(step.address, layout)}
            onRetry={() => void loadCatalogue()}
          />
        ) : (
          <PrintProgressStep
            t={t}
            stage={step.stage}
            failure={
              step.failure
                ? {
                    message: failureMessage(step.failure, t),
                    openPrinters: opensPrinters(step.failure),
                  }
                : null
            }
            onCancel={cancel}
            onRetry={() => void print(step.address, step.choice)}
            onBack={() => setStep({ kind: "layout", address: step.address })}
            onOpenPrinters={openPrinters}
          />
        )}
      </BottomSheetView>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/screens/shared/Tags/TagDetail`
Expected: the new sheet test passes (6). The existing `TagDetailActions` / `TagDetailScreen` router tests still pass, because they stub `PrintTagSheet`.

- [ ] **Step 5: Type-check and lint**

Run: `npm run typecheck 2>&1 | tail -5 && npm run lint 2>&1 | tail -3`
Expected: the Task 1 baselines.

- [ ] **Step 6: Commit**

```bash
git add src/screens/shared/Tags/TagDetail/_components
git commit -q -F - <<'MSG'
feat(printing): print a tag on a Bluetooth printer from its detail page

Step 1 picks a saved printer or a connected device; step 2 picks the layout
from the report catalogue, preselecting the one that fits the printer's paper.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
MSG
```

---

### Task 12: Gates, device QA hand-off, PR

**Files:** none new.

- [ ] **Step 1: Full gates**

```bash
cd /c/unirefund/super-app-safe
npm run typecheck 2>&1 | tail -5
npm test 2>&1 | tail -8
npm run lint 2>&1 | tail -3
npx prettier --check $(git diff --name-only origin/main...HEAD -- '*.ts' '*.tsx' '*.json') 2>&1 | tail -5
```
Expected:
- the Task 1 baselines for type errors and lint errors;
- test count = baseline + the new tests, with 0 new failures;
- prettier clean on the changed files. For any file it flags that was clean at `origin/main`, run `npx prettier --write <file>` and commit it.

- [ ] **Step 2: Hand the native build to the user**

Do not build. Tell the user:

> The branch needs one new dev build on CPadNFC (the native module changed since the APK on it). In `super-app-safe`, with its Metro (8096) stopped: `npx expo run:android --device OrderPAD_3 --no-bundler`. Then start Metro with `npm start` in `super-app-safe` and reverse 8096 to the device.

- [ ] **Step 3: Device QA once the user confirms the build**

As the Faroe Islands `admin`, on CPadNFC with the HPRT HM-E300 paired, run these checks. Record each result with a screenshot (`adb -s LD38266200649 exec-out screencap -p > shot.png`, after a settle).

- [ ] Profile → Printers: scan, pair, set 80 mm, print a test page.
- [ ] A tag → Print → step 1 lists HM-E300 (last used) and any connected device.
- [ ] Step 2: 80 mm preselected with "Fits printer", and A4 shows "Try it · shrunk to 72 mm".
- [ ] Prints from a real tag:
  - [ ] 80 mm;
  - [ ] 58 mm;
  - [ ] A4.
- [ ] The next Print reopens on the last layout.
- [ ] Failure handling:
  - [ ] printer switched off → the unreachable message and Retry;
  - [ ] Bluetooth off → that message plus Open Printers;
  - [ ] Cancel during Printing → the confirmation, then back to step 2.
- [ ] A connected device still prints, if a device with `PrintTag` is available.

- [ ] **Step 4: Push and open the PR (only when the user asks)**

```bash
git push -u origin feat/bluetooth-printing
gh pr create --base main --head feat/bluetooth-printing --title "feat(printing): print a tag's report on a Bluetooth printer" --body-file <pr-body.md>
```
The PR body should follow the repo's Summary + Test plan shape, state which device checks were and were not run, and end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
