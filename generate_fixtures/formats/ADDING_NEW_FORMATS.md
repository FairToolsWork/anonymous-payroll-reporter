# Adding a new format

This guide covers adding support for a new payroll PDF format or a new pension contribution provider. Both tracks follow the same principle: the fixture generator (Python) and the PWA parser (JavaScript) are thin consumers of a shared config layer — you define the format once and both sides derive their behaviour from it.

---

## Which track do you need?

| Track                                                           | What it covers                                | Example                                    |
| --------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------ |
| [Payroll PDF](#track-a--payroll-pdf-format)                     | A new payslip format delivered as a PDF       | Adding a new payroll PDF format            |
| [Pension contribution](#track-b--pension-contribution-provider) | A new pension export file (xlsx, csv, pdf, …) | Adding a new pension contribution provider |

You may need both if your new employer uses a different payroll software **and/or** a different pension provider.

---

## Track A — Payroll PDF format

A payroll PDF format touches both the fixture generator and the PWA parser. The shared `labels.json` file is the starting point for both sides.

### Overview of files to create

```
generate_fixtures/formats/<name>/
    labels.json              ← single source of truth for all label strings
    structure.json           ← layout config (anchors, positions, source PDFs)
    schema.json              ← declares required keys in structure.json
    processor.py             ← format-specific PDF mutation logic

pwa/js/parse/formats/<name>/
    patterns.js              ← generated from labels.json + hand-authored patterns
    parser.js                ← format-specific parsing logic
```

### Step 1 — Obtain source PDFs

You need two PDFs from a real payslip of the new format:

- **Base PDF** — a real payslip with data values filled in. All anchor strings and word positions are extracted from this file.
- **Background PDF** — the same form with no data, just the printed template. Used as the visual background layer of generated fixtures.

Store both in `generate_fixtures/formats/<name>/`.

#### Anonymising the source PDFs

> **Privacy is critical.** The source PDFs are committed to the repo. They must contain absolutely no real personal data — names, National Insurance numbers, addresses, tax codes, employee IDs, or any other identifying information — before you commit them.

You may start from a real payslip (your own or one shared with you by an employee), but you must sanitise it fully before use. Some practical tips:

- **Replace, don't just redact.** Blacking out text visually is not enough — the underlying text may still be present in the PDF structure and will be extracted by `pdfplumber`. Replace values with plausible dummy data instead (e.g. `AA000000A` for an NI number, `1234W` for a tax code).

- **Be mindful of format constraints.** NI numbers follow the format `AA 00 00 00 A`; tax codes are typically digits followed by a letter (e.g. `1257L`). Replacing with values that match the expected format avoids breaking anchor detection and regex patterns downstream.

- **Acrobat Pro and similar editors add a text layer.** When you edit a PDF in Adobe Acrobat Pro, your changes are written as a new overlay layer. This layered structure is often not correctly read by `pdfplumber` — the original text and your replacement text may both be present, or the positions may be wrong. To flatten the PDF to a single layer, use **File → Print → Save as PDF** (or the equivalent "Print to PDF" workflow) rather than saving the edited file directly. Do this for both the base and background PDFs after any editing.

- **Check line spacing after editing.** PDF editors can subtly alter character spacing or line positions. After flattening, run `pnpm fixtures:print-pdf-text` and compare the output against the original — unexpected gaps or merged lines indicate a spacing issue that will cause anchor matching to fail.

- **Verify the sanitised PDF with `pnpm fixtures:print-pdf-text`.** This prints every text string extracted from the PDF. Read through the full output carefully. Data you believed you had removed may still appear as a separate text element if it was not fully replaced in the editor. Do this as the final check before committing.

Run `pnpm fixtures:print-pdf-text` (after pointing it at your new base PDF) to print every text line with its vertical position. Keep this output open — you will need the exact text strings for anchors in the next steps.

### Step 2 — Create `labels.json`

`labels.json` is the single source of truth for every label string that appears in the PDF and needs to be both _written by the generator_ and _found by the parser_.

Create `generate_fixtures/formats/<name>/labels.json` as a JSON array. Each entry:

```json
{
    "key": "payeTax",
    "label": "PAYE Tax",
    "structureSection": "deductions_table",
    "structureKey": "payeTaxLabel",
    "patternSuffix": "\\s+([\\d,]+\\.\\d{2})",
    "patternFlags": "i",
    "comment": "PAYE tax deduction amount."
}
```

| Field              | Required | Description                                                                                                                                                                         |
| ------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`              | yes      | camelCase — becomes the `PATTERNS` property name in `patterns.js`                                                                                                                   |
| `label`            | yes      | Exact string as it appears in the PDF                                                                                                                                               |
| `structureSection` | yes      | Top-level section of `structure.json` this label belongs to                                                                                                                         |
| `structureKey`     | yes      | Key name under that section where the label will be injected                                                                                                                        |
| `patternSuffix`    | yes      | Regex capture group appended after the label prefix                                                                                                                                 |
| `patternFlags`     | yes      | Regex flags (`"i"` for case-insensitive)                                                                                                                                            |
| `patternOverride`  | no       | Verbatim regex string to use instead of the auto-generated one. Use when the label alone cannot describe the full pattern (e.g. a negative lookahead). Always explain in `comment`. |
| `comment`          | no       | Explains the entry; required if `patternOverride` is set                                                                                                                            |

**Which labels belong here?** Any label string that:

- Appears as printed text in the PDF (not a value — just the label)
- Is used by `processor.py` to locate a line
- Has a corresponding pattern in `patterns.js` that matches `<label> <captured value>`

Labels that appear only in anchors (not matched individually by the parser) do not need entries here.

Copy `generate_fixtures/formats/sage-uk/labels.json` as a starting reference.

### Step 3 — Create `structure.json`

`structure.json` defines the spatial layout of the format — source PDFs, section anchors, and position nudges. Label strings are **not** stored here; they are injected from `labels.json` at load time.

```json
{
    "sources": {
        "base_pdf": "generate_fixtures/formats/<name>/base.pdf",
        "background_pdf": "generate_fixtures/formats/<name>/background.pdf"
    },
    "layout": {
        "font": "Helvetica",
        "bold_font": "Helvetica-Bold",
        "mid_band_scan_margin": 6,
        "row_cluster_threshold": 3.0,
        "debug_boxes": false,
        "debug_box_line_width": 1
    },
    "<section_name>": {
        "anchor": "<exact text from the base PDF that identifies this section>",
        "position": {
            "anchor_point": [0, 0],
            "max_width": 0,
            "nudge": [0, 0]
        }
    }
}
```

Anchor strings must match text that appears verbatim in the base PDF. Use the output of `pnpm fixtures:print-pdf-text` to find them.

See `generate_fixtures/formats/sage-uk/structure.json` as a reference and `README_PDF.md` for the full `structure.json` field reference.

### Step 4 — Create `schema.json`

`schema.json` declares which string keys each section of `structure.json` must contain. Keys populated from `labels.json` do **not** need to be listed here — only keys that remain hardcoded in `structure.json`.

```json
{
    "<section_name>": ["anchor", "anyOtherHardcodedKey"],
    ...
}
```

Copy `generate_fixtures/formats/sage-uk/schema.json` and adapt section names and keys to match your new format.

### Step 5 — Create `processor.py`

`processor.py` contains all format-specific PDF mutation logic. `generate_pdf_fixtures.py` loads it at runtime via `importlib`.

It must expose two functions:

```python
def configure(structure):
    """Called once per run. Store layout config from structure into module state."""

def apply_fixture(words, line_map, line_text, structure, payroll_constants,
                  data, month_index, month_label, year, reset_payrun, ...):
    """
    Mutate the word list with correct values for one month.
    Returns the grouped word dict used for rendering.
    """
```

Use `generate_fixtures/formats/sage-uk/processor.py` as a reference. Import shared PDF utilities from `generate_fixtures/pdf_utils.py`.

> **Note:** `generate_pdf_fixtures.py` currently contains Sage UK-specific orchestration logic. Adding a genuinely different payslip structure (different section layout, different column count, etc.) may require updates to `apply_fixture()` in the core script in addition to the format directory.

### Step 6 — Generate `patterns.js`

Run the codegen script to create the label-derived portion of `patterns.js`:

```bash
pnpm fixtures:patterns
```

This reads `labels.json` and writes the generated section of `pwa/js/parse/formats/sage-uk/patterns.js`. It will fail with a clear error if the marker comments are missing — see step 7.

> The `fixtures:patterns` script currently targets the sage-uk format path. When adding a second format, update `generate_fixtures/formats/sage-uk/generate_patterns.mjs` (or create a parallel script for the new format) to point at the correct `patterns.js` output path.

### Step 7 — Create `patterns.js`

Create `pwa/js/parse/formats/<name>/patterns.js`. It has two sections:

```js
export const PATTERNS = {
    // <generated from labels.json — do not edit this section manually>
    // (codegen will write here)
    // </generated>

    // Hand-authored patterns — structural patterns that cannot be derived
    // from a label string alone:
    nameDateId: /.../, // employee name / date / NI number header line
    employeeNo: /.../,
    employerLine: /.../,
    basicLine: /.../,
    // ...etc
    netPay: /.../,
}
```

The generated section between the marker comments is overwritten by `pnpm fixtures:patterns`. Everything outside the markers is preserved. Hand-author only the patterns that cannot be derived from a label string.

Copy `pwa/js/parse/formats/sage-uk/patterns.js` as a starting point and adapt the hand-authored section to your new format's structural patterns.

### Step 8 — Create `parser.js`

Create `pwa/js/parse/formats/<name>/parser.js`. It must export:

```js
export function buildPayrollDocument({ text, lines, lineItems }) {
    // returns a PayrollRecord
}
```

Import generic utilities from `../../payroll.js` and your patterns from `./patterns.js`.

The returned `PayrollRecord` shape must match what `pwa/js/parse/payroll.types.js` defines — the report builder depends on this shape regardless of format. See `pwa/README.md` for the full field reference.

Copy `pwa/js/parse/formats/sage-uk/parser.js` as a reference implementation.

### Step 9 — Wire the new format into the PWA

In `pwa/js/parse/pdf_validation.js`, change the import to point at your new parser:

```js
import { buildPayrollDocument } from './formats/<name>/parser.js'
```

In `pwa/js/parse/parser_config.js`, update the `PATTERNS` re-export:

```js
export { PATTERNS } from './formats/<name>/patterns.js'
```

### Step 10 — Point fixture generation at the new format

In `generate_fixtures/fixture_runs.json`, set `default_payroll_structure`:

```json
{
    "default_payroll_structure": "generate_fixtures/formats/<name>/structure.json",
    "payroll_runs": [ ... ]
}
```

### Step 11 — Generate fixtures and verify

```bash
pnpm fixtures:generate        # regenerates PDFs and expected snapshots
pnpm test:all                 # all 44+ tests should pass
```

If tests fail, use `?debug=1` in the browser and `pnpm fixtures:print-pdf-text` to diagnose anchor or regex mismatches. Set `debug_boxes: true` in `layout` to visualise section boundaries in the generated PDFs.

---

## Track B — Pension contribution provider

A pension contribution provider touches the fixture generator and, if the file format is new (e.g. CSV instead of xlsx), the PWA contribution parser too.

### Current state of the contribution parser

`pwa/js/parse/contribution_validation.js` is currently format-agnostic for Excel files — it uses fuzzy header matching (`.includes('date')`, `.includes('type')`, etc.) rather than exact strings, so it works across providers without knowing column names in advance.

**If the new provider delivers an xlsx file** — you only need to create the generator-side files (steps 1–3 below). The existing parser will handle it automatically provided the column headers contain the expected keywords.

**If the new provider delivers a different file type** (CSV, PDF, etc.) — you will also need to extend the parser side (step 4).

### Step 1 — Create `excel_structure.json`

Create `generate_fixtures/formats/<name>/excel_structure.json`:

```json
{
    "sheet_name": "Sheet name as it appears in the provider's export",
    "columns": ["COLUMN HEADER ONE", "COLUMN HEADER TWO", "..."],
    "column_roles": {
        "date": "COLUMN HEADER FOR DATE",
        "type": "COLUMN HEADER FOR CONTRIBUTION TYPE",
        "employer": "COLUMN HEADER FOR EMPLOYER NAME",
        "amount": "COLUMN HEADER FOR AMOUNT"
    },
    "type_strings": {
        "ee": "Exact string the provider uses for employee contributions",
        "er": "Exact string the provider uses for employer contributions"
    },
    "pay_day": 20,
    "contribution_status": "Status string written into the status column",
    "er_tax_relief_status": "Tax relief status for ER rows",
    "ee_tax_relief_rate": 0.25,
    "ee_tax_relief_charge_rate": 0.009,
    "er_charge_rate": 0.018
}
```

Copy `generate_fixtures/formats/nest/excel_structure.json` and adapt to the new provider's column layout. Use `pnpm fixtures:print-excel-text` to inspect a real export from the provider.

> **No `labels.json` here (yet):** The `labels.json` / codegen pattern used on the PDF side has not been applied to the pension side because future providers may not deliver Excel files at all. If and when a second provider arrives with a known file format, refactor the contribution parser into per-provider modules (mirroring `pwa/js/parse/formats/<name>/`) and adopt `labels.json` at that point. See `README_EXCEL.md` for the full rationale.

### Step 2 — Create `generator.py`

Create `generate_fixtures/formats/<name>/generator.py`. It must expose:

```python
def generate_workbook(entries, structure, employer_name):
    """Build and return an openpyxl.Workbook from computed entries."""

def _build_row(entry, structure, employer_name):
    """Return one row as a list, in column order matching structure['columns']."""
```

Copy `generate_fixtures/formats/nest/generator.py` as a reference.

### Step 3 — Add runs to `fixture_runs.json`

In `generate_fixtures/fixture_runs.json`, add entries to `pension_runs`:

```json
{
    "id": "my-provider-correct",
    "provider": "<name>",
    "months": ["2024-04", "2024-05"],
    "employer_name": "My Employer Ltd",
    "output_file": "tests/test_files/excel-contribution/fixtures/<name>-contribution-history-correct.xlsx"
}
```

Then generate and verify:

```bash
pnpm fixtures:excel
pnpm fixtures:expected-excel
pnpm test:all
```

### Step 4 — Extend the parser for a non-xlsx format (if needed)

If the provider delivers something other than xlsx, the contribution parser needs extending. The recommended approach is:

1. Create `pwa/js/parse/formats/<name>/parser.js` with a function that accepts the raw file and returns a `ContributionParseResult` (same shape as `parseContributionWorkbook` returns).

2. In `contribution_validation.js`, dispatch to the right parser based on file type or a provider hint passed from `app.js`.

3. Create `generate_fixtures/formats/<name>/labels.json` containing the field/column label strings for the new provider, following the same schema as the PDF-side `labels.json`.

4. Create a `generate_patterns.mjs` (or equivalent) to derive any string-matching patterns from `labels.json`.

This work is deferred until a second provider exists — do not pre-build it speculatively.

---

## Checklist summary

### New payroll PDF format

- [ ] Two source PDFs obtained and stored in `generate_fixtures/formats/<name>/`
- [ ] `generate_fixtures/formats/<name>/labels.json` created
- [ ] `generate_fixtures/formats/<name>/structure.json` created
- [ ] `generate_fixtures/formats/<name>/schema.json` created
- [ ] `generate_fixtures/formats/<name>/processor.py` created
- [ ] `pwa/js/parse/formats/<name>/patterns.js` created (with marker comments)
- [ ] `pnpm fixtures:patterns` run successfully
- [ ] `pwa/js/parse/formats/<name>/parser.js` created
- [ ] `pdf_validation.js` import updated
- [ ] `parser_config.js` re-export updated
- [ ] `fixture_runs.json` `default_payroll_structure` updated
- [ ] `pnpm fixtures:generate` completes without errors
- [ ] `pnpm test:all` passes

### New pension contribution provider (xlsx)

- [ ] `generate_fixtures/formats/<name>/excel_structure.json` created
- [ ] `generate_fixtures/formats/<name>/generator.py` created
- [ ] `fixture_runs.json` `pension_runs` entries added
- [ ] `pnpm fixtures:excel` completes without errors
- [ ] `pnpm fixtures:expected-excel` run
- [ ] `pnpm test:all` passes

---

## Further reading

- `generate_fixtures/README_PDF.md` — deep-dive on the PDF fixture pipeline, anchor-based layout, file reference for all config files
- `generate_fixtures/README_EXCEL.md` — deep-dive on the Excel fixture pipeline and provider config
- `pwa/README.md` — parser architecture, `PayrollRecord` shape, switching formats in the PWA
