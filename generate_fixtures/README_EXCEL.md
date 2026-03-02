# generate_excel_fixtures

Generates synthetic pension contribution Excel fixtures used by the test suite in `tests/`. Each fixture is a real-looking `.xlsx` file built from payroll data in `payroll_inputs.json`, with column layout and type strings driven by a provider-specific `excel_structure.json`.

Fixtures are consumed by:

- `tests/excel_contribution.test.mjs` — verifies the PWA contribution parser extracts correct values from xlsx files

## Prerequisites

Python 3.11+ with a virtual environment. From the repo root:

```bash
cd generate_fixtures
python3 -m venv .venv
source .venv/bin/activate
pip install openpyxl
```

The `.venv` directory is gitignored. You only need to do this once.

## pnpm commands

All commands are run from the repo root (or the `pwa/` folder — both resolve to the same workspace scripts).

| Command                          | What it does                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm fixtures:excel`            | Runs `generate_excel_fixtures.py` — generates all xlsx fixtures defined in `fixture_runs.json`                                                                |
| `pnpm fixtures:expected-excel`   | Runs `regenerate_expected_contributions.mjs` — parses the correct fixture and snapshots the result as the expected baseline for `excel_contribution.test.mjs` |
| `pnpm fixtures:generate`         | Runs PDF generation, excel generation, and expected snapshot in sequence                                                                                      |
| `pnpm fixtures:print-excel-text` | Runs `print_excel_text.py` — prints the sheet name, column headers, and first rows of the default (or specified) xlsx fixture                                 |
| `pnpm test:all`                  | Runs the full vitest suite                                                                                                                                    |

Typical workflow after changing payroll inputs or pension provider config:

```bash
pnpm fixtures:excel
pnpm fixtures:expected-excel
pnpm test:all
```

## Available providers

| Provider | Structure file                                        | Output fixture                                                                        |
| -------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **NEST** | `generate_fixtures/formats/nest/excel_structure.json` | `tests/test_files/excel-contribution/fixtures/nest-contribution-history-correct.xlsx` |

To add a new provider, create a new directory under `generate_fixtures/formats/<name>/`, add an `excel_structure.json` and a `generator.py` (see [Adding a new provider](#adding-a-new-provider) below), then add entries to `excel_runs` in `fixture_runs.json`.

## Adding a new provider

A new provider requires a directory under `generate_fixtures/formats/<name>/` containing two files:

1. **`excel_structure.json`** — provider-specific config: sheet name, column header list, column role mapping, type strings, metadata rates, and `pay_day`. See [File reference — `excel_structure.json`](#excel_structurejson) below for the full schema.

2. **`generator.py`** — provider-specific xlsx builder. `generate_excel_fixtures.py` loads this at runtime via `importlib`. Must expose:
    - `generate_workbook(entries, structure, employer_name)` — accepts a list of computed contribution entries, the loaded `excel_structure.json`, and the employer name string; returns an `openpyxl.Workbook`
    - `_build_row(entry, structure, employer_name)` — builds one row list from a single entry (used by the orchestrator for mixed-employer variant fixtures)

    See `formats/nest/generator.py` as a reference implementation.

Once the directory is in place, add runs to `excel_runs` in `fixture_runs.json` pointing at `"provider": "<name>"` and run `pnpm fixtures:excel` to test.

## How it works

### Computed contribution amounts

The script does not use hard-coded pension amounts. It reads the same `payroll_inputs.json` dataset used by the PDF fixture generator and applies the same pension calculation logic:

```
qualifying_earnings = min(gross, pens_qual_upper_monthly) - pens_qual_lower_monthly
ee = qualifying_earnings × pens_employee_rate
er = qualifying_earnings × pens_employer_rate
```

This means the xlsx fixtures and the PDF fixtures are always consistent — if you change a pension rate in `payroll_inputs.json`, both sets of fixtures update together via `pnpm fixtures:generate`.

### Contribution dates

Each month in the run's `months` list produces two rows in the xlsx — one ER row and one EE row — both dated on `pay_day` of that month. `pay_day` is defined in `excel_structure.json` (e.g. `20` for NEST, meaning contributions are dated the 20th of each month).

### Variant fixtures

Error-case fixtures (missing EE, missing ER, mixed employers, malformed) are generated from the same dataset using `variant` flags defined in `fixture_runs.json`. No separate input data is needed. Supported variants:

| Variant           | Effect                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------- |
| `omit_ee`         | Removes all employee contribution rows                                                  |
| `omit_er`         | Removes all employer contribution rows                                                  |
| `mixed_employers` | Assigns employer names from `mixed_employer_names` cyclically across rows               |
| `malformed`       | Writes a single-row xlsx with nonsense headers (triggers `CONTRIBUTION_HEADER_INVALID`) |

## File reference

### `generate_excel_fixtures.py`

The main script. Orchestrates the full pipeline:

1. Loads `payroll_inputs.json` — payroll constants and monthly dataset
2. Loads `fixture_runs.json` — reads `excel_runs` array
3. For each run, loads the provider's `excel_structure.json` and `generator.py` via `importlib`
4. Computes EE and ER pension amounts for each month in the run
5. Applies the variant transformation (if any)
6. Calls `generator.generate_workbook()` and writes the `.xlsx` output

### `fixture_runs.json` — `excel_runs` array

Each entry in `excel_runs` produces one `.xlsx` file.

**Run fields:**

| Field                  | Required | Description                                                                                                |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `id`                   | yes      | Human-readable identifier (for reference only)                                                             |
| `provider`             | yes      | Name of the provider directory under `generate_fixtures/formats/`                                          |
| `months`               | no       | Array of `YYYY-MM` strings to include. Defaults to all months in the dataset.                              |
| `employer_name`        | no       | Employer name written into the employer column. Defaults to `"The Better Place Catering Company Limited"`. |
| `variant`              | no       | One of `omit_ee`, `omit_er`, `mixed_employers`, `malformed`. Omit for a normal fixture.                    |
| `mixed_employer_names` | no       | Array of employer names used when `variant` is `mixed_employers`. Applied cyclically across rows.          |
| `output_file`          | yes      | Output path for the generated `.xlsx`, relative to repo root.                                              |

### `excel_structure.json`

Lives in the provider's directory (e.g. `generate_fixtures/formats/nest/excel_structure.json`). Defines everything provider-specific for one contribution export format.

| Key                         | Description                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `sheet_name`                | Name of the worksheet to create (must match what the PWA parser expects)                                                                        |
| `columns`                   | Ordered list of all column header strings                                                                                                       |
| `column_roles`              | Maps logical roles (`date`, `type`, `employer`, `amount`) to their header strings — tells the orchestrator which columns carry the primary data |
| `type_strings`              | Maps `"ee"` and `"er"` to the provider's contribution type label strings                                                                        |
| `pay_day`                   | Day of month used for contribution received dates                                                                                               |
| `contribution_status`       | Status string written into the status column (e.g. `"Invested"`)                                                                                |
| `er_tax_relief_status`      | Tax relief status string for ER rows (e.g. `"Not eligible"`)                                                                                    |
| `ee_tax_relief_rate`        | Rate applied to EE amount to compute tax relief (e.g. `0.25` for 25%)                                                                           |
| `ee_tax_relief_charge_rate` | Rate applied to tax relief amount to compute the charge on tax relief                                                                           |
| `er_charge_rate`            | Rate applied to ER and EE amounts to compute the contribution charge                                                                            |

### `generator.py`

Lives in the provider's directory (e.g. `generate_fixtures/formats/nest/generator.py`). Contains all provider-specific workbook construction logic. `generate_excel_fixtures.py` loads it at runtime via `importlib`.

Must expose:

- `generate_workbook(entries, structure, employer_name)` — builds and returns an `openpyxl.Workbook` from the computed entries
- `_build_row(entry, structure, employer_name)` — returns a single row as a list, in column order matching `structure["columns"]`

### `regenerate_expected_contributions.mjs`

A Node.js script that reads the generated `nest-contribution-history-correct.xlsx`, parses it using the same `parseContributionWorkbook` function the test uses, and writes the result as the expected baseline to `tests/test_files/excel-contribution/expected/nest_contribution_target_summary.js`.

**Why this exists:** The xlsx fixtures and their expected summary are both gitignored (they live under `tests/test_files/**/fixtures/` and `**/expected/` respectively). This means they must be regenerated together after a clean checkout or whenever `payroll_inputs.json` changes. Running the script through the same JS parser — rather than computing expected values in Python — guarantees the expected file is always consistent with what the test will actually compute, including any timezone or date-parsing behaviour specific to the runtime environment.

This is called automatically by `pnpm fixtures:generate`. Run it standalone with:

```bash
pnpm fixtures:expected-excel
```

If you add a new provider with its own correct fixture, add a corresponding entry to this script to snapshot its expected summary.

### `print_excel_text.py`

A diagnostic utility. Prints the sheet names, column headers (with index), and first five data rows of an xlsx file.

Run it directly with the default output (first `excel_runs` entry):

```bash
pnpm fixtures:print-excel-text
```

Or pass a specific file path:

```bash
pnpm fixtures:print-excel-text tests/test_files/excel-contribution/fixtures/nest-contribution-history-missing-EE.xlsx
```

Output format:

```
File: .../nest-contribution-history-correct.xlsx
Sheets: ['Contribution Details']

Sheet: 'Contribution Details'  (26 data rows)
  col 0: 'CONTRIBUTION RECEIVED DATE'
  col 1: 'CONTRIBUTION TYPE'
  ...

  row 1: ('20/04/2024', 'From your employer', 'The Better Place Catering Company Limited', 26.75, ...)
  row 2: ('20/04/2024', 'From your salary', 'The Better Place Catering Company Limited', 44.59, ...)
  ...
```

Use this when setting up a new provider to verify the generated column layout matches what the PWA parser expects.
