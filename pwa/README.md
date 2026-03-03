# Payroll PDF Processor (PWA)

A client-side PWA that extracts payroll data from PDF payslips and renders a printable report.
All processing happens locally in the browser — no uploads or server calls, privacy focused.

## Features

- Client-side PDF extraction via PDF.js
- Report rendering with per-payslip tables and summary totals
- Missing-month detection (highlighted in report and UI)
- Offline-capable PWA with service worker caching
- Optional PDF password support
- Print / Save as PDF export

## How it works

1. Select one or more payslip PDFs.
2. The app extracts text, parses payroll fields, and builds an HTML report.
3. Use **Print / Save as PDF** to export.

## Local usage

Open `pwa/index.html` in a browser or serve the folder with any static server.

### Debug flags

| Flag       | What it enables                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `?debug=1` | Debug panel: extracted PDF text, parsed values, regex matches, Excel raw rows and parsed entries. Copy-to-clipboard button.              |
| `?debug=2` | Everything in `?debug=1`, plus forces the update banner to appear on mount (for testing the SW update UI without a real waiting worker). |

```text
index.html?debug=1
index.html?debug=2
```

## Deploying changes

> For hosting setup, Wrangler commands, and Cloudflare Workers configuration see the [Deployment section in the root README](../README.md#deployment).

Whenever JS, CSS, HTML, or any other cached asset changes, the Service Worker cache must be invalidated so users receive the updated files. The SW uses a versioned cache name to control this.

### Releases and `CACHE_NAME` versioning

`CACHE_NAME` in `pwa/sw.js` is managed automatically by [release-please](https://github.com/googleapis/release-please). On every push to `main`, the release-please GitHub Action maintains an open release PR. When that PR is merged, `CACHE_NAME` is bumped to match the new semver version and a GitHub release is tagged.

Use [conventional commits](https://www.conventionalcommits.org/) to drive version increments:

| Commit prefix                 | Version bump              |
| ----------------------------- | ------------------------- |
| `fix:`                        | patch — `1.0.0` → `1.0.1` |
| `feat:`                       | minor — `1.0.0` → `1.1.0` |
| `feat!:` / `BREAKING CHANGE:` | major — `1.0.0` → `2.0.0` |

The `CACHE_NAME` bump causes the new SW to delete the old cache on activate and re-fetch all assets fresh. Without a changed `CACHE_NAME`, users may be served stale cached files indefinitely.

### Checklist for every deployment

1. **Merge the release-please PR** on GitHub — this bumps `package.json` and `CACHE_NAME` in `sw.js` atomically and creates the release tag.

2. **Deploy all changed files** — the SW itself (`sw.js`) must be included. Browsers re-fetch `sw.js` on every navigation (it is not cached by the SW), so a changed `sw.js` will trigger the install → wait → activate cycle automatically.

3. **Users with the app open** will see the update banner once the new SW reaches the `waiting` state. Clicking **Refresh** sends `SKIP_WAITING`, the new SW activates, and the page reloads with fresh assets.

4. **Orphaned instances** (tabs open for more than 24 hours without a reload) will show the update banner automatically via the `staleInstance` flag, prompting the user to refresh.

### If the cache is stuck during development

Open DevTools → **Application** → **Storage** → **Clear site data**, then hard-reload (`Cmd+Shift+R`). This bypasses the SW entirely and fetches fresh files.

## Tech

- Vue 3 (CDN)
- PDF.js (CDN)
- Service Worker + Web Manifest

## Parser architecture

The PDF parsing layer is split into three tiers:

```bash
pwa/js/parse/
├── payroll.js                      ← generic layout/parsing utilities (shared)
├── payroll.types.js                ← PayrollRecord JSDoc type definitions
├── parser_config.js                ← formatting utilities + re-exports PATTERNS
├── pdf_validation.js               ← public entry point: parsePayrollPdf()
└── formats/
    └── sage-uk/
        ├── patterns.js             ← regex patterns for Sage UK payslip fields
        └── parser.js               ← buildPayrollDocument() for Sage UK
```

**`payroll.js`** — format-agnostic. Exports low-level layout helpers used by all format parsers: `extractField`, `parseNumericValue`, `parseAmountValue`, `extractNetPayFromText`, `buildLinesFromLineItems`, `splitLineItemsIntoBands`, `computeColumnCentroids`, `computeCentroidsFromValues`, `bucketLinesByColumn`, `bucketLinesByLineLeft`.

**`formats/<name>/patterns.js`** — regex patterns specific to one payslip format. Exports a single `PATTERNS` object.

**`formats/<name>/parser.js`** — all format-specific parsing logic. Exports a single function:

```js
export function buildPayrollDocument({ text, lines, lineItems }) → PayrollRecord
```

**`pdf_validation.js`** — the sole entry point used by the rest of the app. Calls `extractPdfData` then delegates to `buildPayrollDocument` from whichever format parser is imported.

## Switching formats

The PWA is deployed for one payroll format at a time. Switching format means changing **one import line** in `pdf_validation.js`:

```js
// current (Sage UK)
import { buildPayrollDocument } from './formats/sage-uk/parser.js'

// switching to a hypothetical other format
import { buildPayrollDocument } from './formats/<name>/parser.js'
```

Nothing else in the app needs to change — `app.js`, the report builder, and all calculations depend only on the `PayrollRecord` shape, not on any format-specific internals.

`parser_config.js` re-exports `PATTERNS` from the active format's `patterns.js` for use in the debug panel in `app.js`. If you switch formats, update that re-export too:

```js
// parser_config.js
export { PATTERNS } from './formats/<name>/patterns.js'
```

## Adding a new format

1. Create `pwa/js/parse/formats/<name>/patterns.js` — export a `PATTERNS` object with `RegExp` values for every field the parser needs to extract from raw PDF text.

2. Create `pwa/js/parse/formats/<name>/parser.js` — implement `buildPayrollDocument({ text, lines, lineItems })` returning a `PayrollRecord`. Import generic utilities from `../../payroll.js` and your patterns from `./patterns.js`.

3. In `pdf_validation.js`, change the import to point at your new parser.

4. In `parser_config.js`, change the `PATTERNS` re-export to point at your new patterns file.

5. Run `pnpm test:all` — if the PDF fixtures being tested were generated for the previous format, regenerate them first with `pnpm fixtures:generate` and `pnpm fixtures:expected`.

See `generate_fixtures/README.md` for the parallel steps on the fixture generation side.

## `PayrollRecord` shape

All format parsers must return a `PayrollRecord` as defined in `pwa/js/parse/payroll.types.js`. The key fields consumed by the report builder are:

| Path                                     | Description                                                |
| ---------------------------------------- | ---------------------------------------------------------- |
| `employee.name`                          | Employee full name                                         |
| `employee.id`                            | Employee ID / payroll number                               |
| `employer`                               | Employer name string                                       |
| `payrollDoc.processDate.date`            | Pay date string                                            |
| `payrollDoc.payments.hourly.basic`       | Basic hours pay item                                       |
| `payrollDoc.payments.hourly.holiday`     | Holiday hours pay item                                     |
| `payrollDoc.payments.salary.basic`       | Basic salary pay item                                      |
| `payrollDoc.deductions.payeTax.amount`   | PAYE tax amount                                            |
| `payrollDoc.deductions.natIns.amount`    | Employee NI amount                                         |
| `payrollDoc.deductions.pensionEE.amount` | Employee pension contribution                              |
| `payrollDoc.deductions.pensionER.amount` | Employer pension contribution                              |
| `payrollDoc.deductions.misc`             | Array of other deductions                                  |
| `payrollDoc.thisPeriod.*`                | Earnings for NI, Gross for Tax, Total Gross Pay, Pay Cycle |
| `payrollDoc.yearToDate.*`                | All year-to-date cumulative figures                        |
| `payrollDoc.netPay.amount`               | Net pay                                                    |
