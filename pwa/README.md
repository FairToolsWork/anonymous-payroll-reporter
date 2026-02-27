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

To enable debug panel:

```bash
index.html?debug=1
```

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

| Path | Description |
|---|---|
| `employee.name` | Employee full name |
| `employee.id` | Employee ID / payroll number |
| `employer` | Employer name string |
| `payrollDoc.processDate.date` | Pay date string |
| `payrollDoc.payments.hourly.basic` | Basic hours pay item |
| `payrollDoc.payments.hourly.holiday` | Holiday hours pay item |
| `payrollDoc.payments.salary.basic` | Basic salary pay item |
| `payrollDoc.deductions.payeTax.amount` | PAYE tax amount |
| `payrollDoc.deductions.natIns.amount` | Employee NI amount |
| `payrollDoc.deductions.pensionEE.amount` | Employee pension contribution |
| `payrollDoc.deductions.pensionER.amount` | Employer pension contribution |
| `payrollDoc.deductions.misc` | Array of other deductions |
| `payrollDoc.thisPeriod.*` | Earnings for NI, Gross for Tax, Total Gross Pay, Pay Cycle |
| `payrollDoc.yearToDate.*` | All year-to-date cumulative figures |
| `payrollDoc.netPay.amount` | Net pay |
