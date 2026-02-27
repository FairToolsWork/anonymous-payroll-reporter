# generate_fixtures

Generates synthetic payslip PDF fixtures used by the test suite in `tests/`. Each fixture is a real-looking PDF built from a source payslip template, with payroll values calculated from `payroll_inputs.json` and layout driven by a format-specific `payslip_structure.json`.

Fixtures are consumed by:

- `tests/pdf_parse.test.mjs` — verifies the PWA parser extracts correct values from PDFs
- `tests/report_workflow.test.mjs` — verifies the report builder handles a full payroll year
- `tests/report_workflow_errors.test.mjs` — verifies error cases (missing employee, missing months, etc.)

## Prerequisites

Python 3.11+ with a virtual environment. From the repo root:

```bash
cd generate_fixtures
python3 -m venv .venv
source .venv/bin/activate
pip install pdfplumber reportlab
```

The `.venv` directory is gitignored. You only need to do this once.

## pnpm commands

All commands are run from the repo root (or the `pwa/` folder — both resolve to the same workspace scripts).

| Command | What it does |
|---|---|
| `pnpm fixtures:generate` | Runs `generate_fixtures.py` — generates all fixture PDFs defined in `fixture_runs.json` |
| `pnpm fixtures:expected` | Runs `regenerate_expected_payslips.mjs` — snapshots the current fixture parse output as the expected baseline for `pdf_parse.test.mjs` |
| `pnpm fixtures:print-text` | Runs `print_pdf_text.py` — prints all text lines from the current format's base PDF with vertical positions, for use when configuring anchors in `structure.json` |
| `pnpm test:all` | Runs the full vitest suite |

Typical workflow after changing payroll inputs or structure:

```bash
pnpm fixtures:generate
pnpm fixtures:expected
pnpm test:all
```

## Available formats

| Format | Structure file | Source PDFs |
|---|---|---|
| **Sage UK** | `generate_fixtures/formats/sage-uk/structure.json` | - `generate_fixtures/formats/sage-uk/test-payslip-no-pw.pdf` (data) <br> - `generate_fixtures/formats/sage-uk/test-payslip-blank-©sage-(uk)-limited.pdf` (background) |

To add a new format, create a new directory under `generate_fixtures/formats/`, add the two source PDFs, a `structure.json`, and a `schema.json` (see the file reference below), then point `default_structure` in `fixture_runs.json` at it or set `structure` on individual runs.

> **Note:** `generate_fixtures.py` currently contains Sage UK-specific processing logic — it knows the exact semantics of each section (which fields are numeric, how many YTD columns each row has, how the pay run token is structured, etc.). Adding a genuinely different format would require updates to `apply_fixture()` in addition to the config files.

## Switching formats

Fixture generation is deployed for one payroll format at a time. Switching format means changing **one value** in `fixture_runs.json` — the `default_structure` field (or the `structure` field on a specific run):

```json
{
    "default_structure": "generate_fixtures/formats/<name>/structure.json",
    "runs": [ ... ]
}
```

The rest of the pipeline (fixture generation, expected snapshot regeneration, tests) is unchanged. After switching:

```bash
pnpm fixtures:generate
pnpm fixtures:expected
pnpm test:all
```

You must also switch the PWA parser to match — see `pwa/README.md` for the parallel steps on the parser side.

## Adding a new format

A new format requires a directory under `generate_fixtures/formats/<name>/` containing four files:

1. **`structure.json`** — layout config: source PDF paths, anchor strings, position nudges. See the [File reference](#file-reference) below for the full schema.

2. **`schema.json`** — declares which sections and string keys `structure.json` must contain. Validated automatically by `load_structure()`. Copy from `formats/sage-uk/schema.json` and adapt to match your section names.

3. **`processor.py`** — format-specific processing logic. `generate_fixtures.py` loads this at runtime via `importlib`. Must expose:
   - `configure(structure)` — called once per run; read layout config from `structure.json` into module state
   - `apply_fixture(words, line_map, line_text, structure, payroll_constants, data, month_index, month_label, year, reset_payrun, ...)` — mutates the word list for one month and returns the grouped word dict for rendering

   Import generic PDF utilities from `pdf_utils.py` (shared, format-agnostic helpers). See `formats/sage-uk/processor.py` as a reference implementation.

4. **Source PDFs** — a base PDF with real data (for extracting word positions and anchor strings) and a blank background PDF (rendered as the visual layer). See [Why two source PDFs](#why-two-source-pdfs).

Once the directory is in place, point `default_structure` in `fixture_runs.json` at `generate_fixtures/formats/<name>/structure.json` and run `pnpm fixtures:generate` to test.

### Sage UK layout

The Sage UK payslip is divided into four horizontal bands, each containing one or more columns. The seven sections in `structure.json` map to these bands as follows:

```
┌──────────────────────────────────────────────────────────────────┐
│  header_bar:                                                     │
│  Employee name · Process date · NI number · Employee ID          │
│  Basic pay line(s) · Net pay amount                              │
├────────────────────────────┬─────────────────────────────────────┤
│  payments_table:           │  deductions_table:                  │
│  Basic Hours               │  PAYE Tax                           │
│  Hours-make up (optional)  │  National Insurance                 │
│  Holiday (optional)        │  Pension EE · Pension ER            │
│                            │  Other Net Deduction (optional)     │
├─────────────┬──────────────┴──────────┬────────────────────────  │
│ address_    │  this_period            │  year_to_date:           │
│ block:      │  Earnings for NI        │  Total Gross Pay TD      │
│             │  Gross for Tax          │  Gross for Tax TD        │
│  Name       │  Total Gross Pay        │  Tax Paid TD             │
│  Line 1     │  Pay Cycle              │  Earnings for NI TD      │
│  Line 2     │                         │  National Insurance TD   │
│  Line 3     │                         │  Ee Pension TD           │
│  Postcode   │                         │  Employers Pension TD    │
├─────────────┴─────────────────────────┴──────────────────────────┤
│  footer                                                          │
│  Employer name · Net pay amount                                  │
│  Pay Run · Pay Method · Tax Code · Copyright                     │
└──────────────────────────────────────────────────────────────────┘
```

Key points about the layout:

- **`header_bar`** spans the full width. It contains the employee name/date/NI row, the basic pay line(s) used to locate row positions, and the net pay amount. The employee ID is rendered to the left of the name using `employee_id_offset`.

- **`payments_table`** and **`deductions_table`** sit side by side in the upper-middle band. Payments are on the left; deductions on the right. Both tables can have a variable number of rows — the script scans downward from the anchor row to find all rows.

- **`address_block`**, **`this_period`**, and **`year_to_date`** share the lower-middle band across three columns. Because words from all three sections appear interleaved in the same vertical range, the script groups them by horizontal position using `mid_band_scan_margin` to determine where the band starts.

- **`footer`** spans the full width at the bottom. It contains the employer name (`employer_anchor`), the net pay amount, tax code, pay run, pay method, and the copyright line. The pay run text is generated from `pay_run_text_template` with the month number substituted in.

## How it works

### Anchor-based layout

The script never hardcodes pixel coordinates for where values should appear on a payslip. Instead, every section in `structure.json` declares an `anchor` — a string of text that appears in a known, fixed location on that payslip format. At runtime, the script searches the extracted words from the base PDF for a line containing that string, then uses the positions of those words as the spatial reference for the entire section.

For example, `header_bar.anchor` is `"Jane Doe 20 Jul 2025 AA000000A"` — a line that always appears at the top of the target payslip regardless of the data values. Once found, the script knows where the name, date and NI number fields sit in PDF point space, and can overwrite them with the correct values for each generated month.

This means the layout is self-calibrating to whatever the source PDF looks like — if a payslip format shifts slightly between print runs or software versions, updating the anchor string in `structure.json` is all that is needed.

### Why two source PDFs

Two source PDFs are required for every format:

**Base PDF (`base_pdf`)** — a target payslip with real data values in all fields. This is the primary source of spatial information. `pdfplumber` extracts every word along with its exact bounding box coordinates (`x0`, `x1`, `top`, `bottom`). These coordinates form the skeleton that the generated fixtures are built from — the script mutates the text of those words while keeping their positions intact.

The anchor strings in `structure.json` must exactly match text that appears in this PDF. Use `pnpm fixtures:print-text` to inspect what text is present and on which lines.

**Background PDF (`background_pdf`)** — a blank copy of the same payslip template, with no data values filled in, typically just the printed form with labels and borders. This is rendered as a raster image behind the generated text so that the output looks like a real filled-in payslip. Without it, the output would be floating text on a white page with no visual structure.

The two PDFs are kept separate so the background image stays stable (it never changes between data runs), while the base PDF only needs to be replaced if the form layout itself changes.

### The coordinate system and position overrides

PDF coordinates in pdfplumber are measured in points (1/72 inch) from the **top-left** of the page. The `top` value of a word increases as you move down the page.

Each section in `structure.json` has a `position` object that controls how its words are placed in the output:

- **`anchor_point [x, y]`** — an absolute override for where the section's top-left starts. `[0, 0]` means "use the positions extracted from the source PDF as-is". Set a non-zero value to pin the section to a fixed location regardless of where it appeared in the source.

- **`nudge [x, y]`** — a relative offset applied on top of the source positions (or `anchor_point` if set). Positive `x` shifts right, negative shifts left. Positive `y` shifts down, negative shifts up. This is the primary tool for fine-tuning placement without changing the fundamental anchor.

- **`max_width`** — constrains how wide the section can be. `0` means unconstrained.

The typical workflow when calibrating a new format is:

1. Run `pnpm fixtures:print-text` to find the anchor strings and understand the source layout
2. Generate fixtures with `nudge: [0, 0]` and inspect the output
3. Adjust `nudge` to shift sections that are slightly off
4. Set `debug_boxes: true` in `layout` to render colored bounding boxes around each section group, making misalignment easy to spot

## File reference

### `generate_fixtures.py`

The main script. Orchestrates the full pipeline:

1. Loads `payroll_inputs.json` — payroll constants and monthly dataset
2. Loads `fixture_runs.json` — which runs (output dirs, months, employee overrides) to generate
3. For each run, loads the referenced `payslip_structure.json` — resolves source PDFs, layout config, and section anchors
4. Extracts word positions from the base PDF via pdfplumber
5. Calculates PAYE, NI, pension values for each month
6. Applies values into the word layout and writes output PDFs via reportlab using the blank background image

### `payroll_inputs.json`

Defines the payroll data to calculate from. Two top-level keys:

**`constants`** — tax/NI/pension rates and employee metadata:

| Key | Description |
|---|---|
| `personal_allowance_annual` / `_monthly` | Scottish income tax personal allowance |
| `national_tax_bands_annual` | Scottish income tax bands as `[upper_limit, rate]` pairs |
| `ni_threshold_monthly` | NI lower earnings threshold |
| `ni_employee_rate` / `ni_employer_rate` | NI contribution rates |
| `pens_qual_lower_monthly` / `_upper_monthly` | Qualifying earnings band for pension |
| `pens_employee_rate` / `pens_employer_rate` | Pension contribution rates |
| `pension_provider` | Label used in the deductions table (e.g. `"NEST Corporation"`) |
| `employee_id_text` | Employee ID rendered to the left of the name in the header |
| `tax_code_value` | Tax code shown in the footer |
| `pay_method_value` | Pay method shown in the footer |

**`dataset`** — one entry per month, each with:

| Key | Description |
|---|---|
| `month` | `YYYY-MM` identifier |
| `basic_lines` | Array of `[hours, rate]` pairs for basic pay lines |
| `makeup_lines` | Array of `[hours, rate]` pairs for hours-make-up lines |
| `holiday_lines` | Array of `[days, rate]` pairs for holiday pay lines |
| `other_deduction` | Fixed net deduction amount (£) |

### `fixture_runs.json`

Defines all fixture generation runs. Each entry in `runs` produces a set of PDFs in its `output_dir`.

**Run fields:**

| Field | Required | Description |
|---|---|---|
| `id` | yes | Human-readable identifier (for reference only) |
| `structure` | no | Path to the format structure JSON, relative to repo root. Falls back to `default_structure` if omitted. |
| `output_dir` | yes | Output directory for generated PDFs, relative to repo root |
| `months` | yes | Array of `YYYY-MM` strings to generate |
| `missing_months` | no | Months to skip even if listed in `months` |
| `employee` | no | Default employee override for the run (see below) |
| `employee_overrides` | no | Per-month employee overrides keyed by `YYYY-MM` |
| `fixture_overrides` | no | Per-month fixture flags keyed by `YYYY-MM` |

**`employee` / `employee_overrides` fields:**

| Field | Description |
|---|---|
| `name` | Replaces the employee name in the header and address block. Empty string clears it. |
| `employer` | Replaces the employer name in the header and footer. Empty string clears it. |
| `address` | Array of address lines (up to `address_lines` count from the structure). Replaces address lines in the address block. |

**`fixture_overrides` flags** (per month):

| Flag | Description |
|---|---|
| `omit_tax_code` | Removes the tax code from the footer |
| `omit_process_date` | Removes the process date from the header |
| `omit_pay_run` | Removes the pay run line from the footer |

### `pdf_utils.py`

Generic, format-agnostic PDF utilities shared by all processors:

- `build_line_map` — clusters extracted words into lines keyed by vertical position
- `find_line` / `find_line_containing` — locate a line by exact or substring match
- `find_numeric_indices` — filter word indices to those containing decimal numbers
- `update_text` — mutate a word's text in-place
- `align_right` — reposition word bounding boxes so text is right-aligned to a target x
- `fmt_money` / `fmt_units` — format floats as `"0.00"` strings

### `processor.py`

Lives alongside `structure.json` and `schema.json` in the format's directory (e.g. `generate_fixtures/formats/sage-uk/processor.py`). Contains all format-specific processing logic. `generate_fixtures.py` loads it at runtime via `importlib` from the structure file's parent directory.

A processor module must expose:

- `configure(structure)` — called once per run to apply layout config from `structure.json` into module-level state
- `apply_fixture(words, line_map, line_text, structure, payroll_constants, data, month_index, month_label, year, reset_payrun, ...)` — mutates the word list with the correct values for one month and returns the grouped word dict used for rendering

It may also expose `DEBUG_BOX_COLOURS` (a dict mapping group names to RGB tuples) for debug box rendering.

### `schema.json`

Lives alongside `structure.json` in the format's directory (e.g. `generate_fixtures/formats/sage-uk/schema.json`). Declares which sections are required and which string keys each section must have. `load_structure()` loads this file automatically from the same directory as `structure.json` and validates every listed key is present as a non-empty string in the corresponding section.

A different format can declare completely different sections and keys here without touching the core script.

### `structure.json`

Lives in the format's directory (e.g. `generate_fixtures/formats/sage-uk/structure.json`). Defines everything format-specific for one payslip layout. Each new format needs its own copy of this file.

**Top-level sections:**

**`sources`** — the two required source PDFs (paths relative to repo root):

- `base_pdf` — a real payslip PDF with data, used to extract word positions and text anchors
- `background_pdf` — a blank template PDF, rendered as the visual background of each generated fixture

**`layout`** — global rendering parameters:

| Key | Description |
|---|---|
| `font` / `bold_font` | Reportlab font names |
| `mid_band_scan_margin` | Pixel margin above the lower band when grouping words into sections |
| `row_cluster_threshold` | Max vertical distance (pts) between words to be considered the same row |
| `debug_boxes` | `true` to render coloured bounding boxes around each section group |
| `debug_box_line_width` | Stroke width of debug boxes |

**Section objects** (`header_bar`, `payments_table`, `deductions_table`, `address_block`, `this_period`, `year_to_date`, `footer`) — each has:

- String keys matching what `schema` declares (used as text anchors to locate lines in the source PDF)
- A `position` object with `anchor_point [x, y]`, `max_width`, `nudge [x, y]`, and optional section-specific spacing keys

**`address_block`** additionally has:

- `name_anchor` — a string uniquely identifying the employee name line in the address column
- `address_lines` — how many lines of address follow the anchor (used when replacing address content)

**`header_bar.position`** additional keys:

- `date_year_spacing` — gap in pts between month and year tokens
- `employee_id_offset` — pts to the left of the name word where the employee ID is placed
- `process_date_century` — century prefix for the process date year (e.g. `"20"`)

**`footer.position`** additional keys:

- `pay_run_min_spacing` / `pay_run_max_spacing` — acceptable gap range (pts) between pay run tokens
- `copyright_nudge` — pts to shift the copyright line leftward

### `print_pdf_text.py`

A diagnostic utility. Prints all text lines extracted from the base source PDF with their vertical positions, one line per row. Useful when:

- Setting up a new format — to find the right anchor strings for each section
- Debugging layout issues — to see exactly what text is on which line and at what `top` coordinate

Run it directly:

```bash
.venv/bin/python print_pdf_text.py
```

Output format:

```
 273.3: Jane Doe
 278.0: Earnings for NI 2462.50 Total Gross Pay TD 8630.00
 282.6: Some Apartment
 ...
```

The `top` value is the vertical position in PDF points from the top of the page.
