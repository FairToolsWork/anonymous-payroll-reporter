# Test Strategy

## Philosophy: Best-Effort Payslip Review

This system is a **best-effort tool** for workers reviewing their own payslips. It does not have access to employer payroll systems, employment contracts, or HMRC records. Everything it reports is derived solely from what appears on the payslip PDFs and the optional pension contribution export.

Because of this, all flags it raises are phrased as prompts for the worker to verify, not as definitive assertions of error. The testing strategy reflects this: we verify that the system correctly identifies known anomalies in controlled fixture data, and that it does not produce false alarms on clean data.

---

## Related Documentation

| Document                                          | What it describes                                                                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwa/docs/hourly-holiday-pay-calculation.md`      | Full methodology for Signal A and B holiday rate checks, rolling reference calculation, known shortcomings, and the statutory basis — the primary reference for `hol_pay_flags.test.mjs` and all four `run_snapshot_*.test.mjs` files |
| `pwa/docs/salaried-holiday-calculation.md`        | Methodology for salaried day estimation — the primary reference for `salary_snapshot.test.mjs`                                                                                                                                        |
| `pwa/docs/pension-contribution-reconciliation.md` | Methodology for pension contribution reconciliation — the primary reference for `run_snapshot.test.mjs`, `excel_contribution.test.mjs`, and `report_workflow.test.mjs`                                                                |
| `generate_fixtures/FIXTURE_BASELINES.md`          | Independent first-principles verification of expected outputs for each fixture dataset — cross-check this when a snapshot test fails unexpectedly                                                                                     |

---

## Test Layers

### 1. Unit Tests

Pure logic tests with no file I/O. Cover:

| File                                   | Covers                                                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `hol_calc.test.mjs`                    | Holiday pay calculation utilities (rolling avg weekly pay, expected hours, expected pay amounts)                                         |
| `hol_pay_flags.test.mjs`               | `buildHolidayPayFlags` — signal A (rate below basic) and signal B (rate below rolling average), suppression logic between them           |
| `report_calculation.test.mjs`          | Contribution summary totals, validation flag logic, tolerance checks, missing-month detection, tax year boundary handling                |
| `hourly_pay_calculations.test.mjs`     | `buildValidation` — PAYE/NI zero flags, gross mismatch, net mismatch, payment line cross-checks                                          |
| `tax_year_utils.test.mjs`              | Date parsing, tax year key derivation, fiscal month indexing, weeks-in-period calculation                                                |
| `pdf_formatters.test.mjs`              | Number and date formatting utilities                                                                                                     |
| `parse_utils.test.mjs`                 | PDF text extraction utilities                                                                                                            |
| `report_view_model.test.mjs`           | Report view model construction                                                                                                           |
| `variable_worker_entitlement.test.mjs` | Worker profile defaults: zero-hours baseline (`typicalDays=0`, `statutoryHolidayDays=null`); explicit salaried/hourly profiles preserved |
| `sage_uk_parser.test.mjs`              | Sage UK PDF format parser (field extraction from text)                                                                                   |
| `debug_tools.test.mjs`                 | Timing and debug utility                                                                                                                 |

### 2. Integration Tests

Use actual generated PDF and Excel fixtures. Cover end-to-end parsing and report assembly:

| File                              | Covers                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pdf_parse.test.mjs`              | Parses each fixture PDF and compares output to expected JSON snapshots                         |
| `excel_contribution.test.mjs`     | Parses NEST pension contribution Excel files                                                   |
| `report_workflow.test.mjs`        | Full report assembly from PDFs + Excel: record count, HTML output, contribution totals         |
| `report_workflow_errors.test.mjs` | Edge cases: password-protected PDFs, mixed employees, missing months, missing employee details |
| `smoke.test.mjs`                  | Minimal end-to-end: one PDF + one Excel file processes without error                           |

### 3. Snapshot Regression Tests

Snapshot tests lock in the complete computed output (netPay, deductions, holiday hours, flag IDs) for each fixture dataset. Any code change that causes drift in a known value fails the snapshot test, requiring a deliberate regeneration to accept the change.

See §"Snapshot Tests" below for full detail.

---

## Unit Test Edge Cases

### `hol_pay_flags.test.mjs` — Signal A (same-payslip rate check)

| Scenario                                                          | Expected result                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| Holiday rate matches basic rate exactly                           | No flag                                                 |
| Rates differ by less than tolerance (0.04 delta < 0.05 threshold) | No flag                                                 |
| Holiday rate materially lower (e.g. £10.00 vs £14.50)             | `holiday_rate_below_basic`                              |
| `basicRate` is null but derivable from `basicAmount ÷ basicUnits` | `holiday_rate_below_basic` using derived rate           |
| No holiday units on the payslip                                   | No flag                                                 |
| `basicUnits = 0` and `basicRate = null` (holiday-only entry)      | No flag — no basis for comparison (see shortcoming #11) |

### `hol_pay_flags.test.mjs` — Signal B (rolling average rate check)

| Scenario                                                          | Expected result                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Holiday rate below rolling average with ≥ 3 prior eligible months | `holiday_rate_below_rolling_avg`                                                |
| Fewer than 3 eligible prior periods                               | Signal B absent                                                                 |
| Holiday rate matches rolling average                              | No flag                                                                         |
| Holiday rate matches same-payslip basic rate (pay-rise artefact)  | Signal B suppressed — employer paid at current rate, not below average          |
| Prior-year entries within 52-week window                          | Included — flag crosses tax year boundary correctly                             |
| Two payslips share the same `yearKey:monthIndex`                  | Deduplicated — counted as 1 period; Signal B absent if this drops total below 3 |
| ≥ 3 eligible months but fewer than 52 weeks of history            | Flags with `limitedData: true` in label                                         |
| Stable hourly rate with variable weekly hours                     | No false positive — rate check passes despite varying totals                    |

### `hol_pay_flags.test.mjs` — `buildYearHolidayContext`

| Scenario                                   | Expected result                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Fewer than 3 months in dataset             | `hasBaseline: false`                                                                     |
| 3+ months of data                          | `avgWeeklyHours` and `avgHoursPerDay` computed correctly                                 |
| `workerProfile.typicalDays` provided       | Used as divisor for `avgHoursPerDay`                                                     |
| `workerProfile` is null                    | `typicalDays` defaults to 0 (zero-hours baseline)                                        |
| Months with different rates                | `avgRatePerHour` is hours-weighted average, not simple mean                              |
| Prior-year entries within rolling window   | Included in context                                                                      |
| `hasBaseline: false` but `typicalDays` set | `typicalDays` present in `holidayContext` even without a baseline                        |
| `typicalDays = 0` (zero-hours profile)     | No division errors; `avgHoursPerDay = 0`; `avgWeeklyHours` and `avgRatePerHour` computed |
| `typicalDays = 0.5` (minimum salaried)     | `avgHoursPerDay` computed correctly                                                      |
| `typicalDays = 7` (maximum)                | `avgHoursPerDay` computed correctly                                                      |

### `hol_pay_flags.test.mjs` — `isReferenceEligible`

| Scenario                                                                   | Eligible?                              |
| -------------------------------------------------------------------------- | -------------------------------------- |
| Normal basic-hours entry                                                   | ✓                                      |
| `basicUnits = 0`                                                           | ✗                                      |
| `basicUnits = null`                                                        | ✗                                      |
| Entry contains holiday pay (any `holidayAmount > 0` or `holidayUnits > 0`) | ✗                                      |
| Misc payment with SSP title                                                | ✗                                      |
| Misc payment with SMP title                                                | ✗                                      |
| Misc payment with SPP title                                                | ✗                                      |
| Misc payment with SAP title                                                | ✗                                      |
| Mixed-case statutory pay title e.g. `"Statutory Sick Pay (SSP)"`           | ✗                                      |
| Holiday amount non-zero but `holidayUnits = 0`                             | ✗                                      |
| Misc payments with unrelated titles (Bonus, Overtime)                      | ✓                                      |
| Misc title containing `"spa"` substring (Spare Hours, Special Bonus)       | ✓ — no false positive on partial match |

### `hol_pay_flags.test.mjs` — `buildRollingReference`

| Scenario                                                                  | Expected result                                                            |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Target entry has no `parsedDate`                                          | Returns `null`                                                             |
| Fewer than 3 eligible periods before target                               | Returns `null`                                                             |
| Entries dated on or after target date                                     | Excluded from reference                                                    |
| Two payslips share the same `yearKey:monthIndex`                          | Deduplicated — counted once                                                |
| `yearKey = null` on all entries; distinct calendar months                 | Deduplication by `calendarYear:monthIndex` — counted correctly             |
| `yearKey = null` on all entries; same calendar month duplicated           | Deduplicated — may return `null` if remaining periods < 3                  |
| Fewer than 52 weeks accumulated                                           | `limitedData: true`                                                        |
| 13+ months (52+ weeks) accumulated                                        | `limitedData: false`                                                       |
| Entry at exactly 104-week cutoff boundary                                 | Excluded (strictly outside window)                                         |
| Entry on first day of 104-week window (calendar-day boundary / DST guard) | Included — cutoff uses `setDate(-728)` not raw ms subtraction              |
| Holiday month that also has basic hours                                   | Excluded from its own reference pool (`isReferenceEligible` returns false) |

### `hol_calc.test.mjs` — display utility guard rails

| Function                   | Zero / null input                                     | Normal input                                            |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| `holCalcAvgWeekly`         | `'—'` for 0 or null hours                             | Correct `hrs` string (e.g. `"15.38 hrs"` for 800h ÷ 52) |
| `holCalcExpectedWeeklyPay` | `'—'` for 0 hours or 0 rate                           | Correct `£` string                                      |
| `holCalcExpectedHours`     | `'—'` for 0 hours, 0 workDays, or 0 daysTaken         | Correct `hrs` string; scales with 4-day vs 5-day week   |
| `holCalcExpectedPay`       | `'—'` for 0 hours, 0 rate, 0 workDays, or 0 daysTaken | Correct `£` string; scales with 4-day vs 5-day week     |

---

## Salary Worker Tests — `salary_snapshot.test.mjs`

Tests `buildReport` and `buildRunSnapshot` directly with synthetic in-memory records (no fixture PDFs needed). Covers:

### Good Place — Full-Time (£2,500/month)

- `salariedPay` is captured as £2,500 on all 12 entries
- `basicHours` = 0 and `basicRate` = null (salaried, not hourly)
- No flags on any entry
- Net pay = gross − PAYE − NI − pensionEE (computed correctly)
- `pensionEE` captured correctly

### Good Place — Fractional 0.6 FTE (£1,500/month)

- `salariedPay` captured as £1,500
- No flags
- `pensionEE` proportionally lower than full-time

### Good Place — Salary with Holiday Pay

- When a month includes a salary holiday payment, `salariedPay` still reflects only the basic salary (not the holiday add-on)
- No flags on any entry including the holiday month

### Bad Place — Known Deduction Violations

Each scenario is tested in isolation:

| Condition                     | Flag Expected                                           |
| ----------------------------- | ------------------------------------------------------- |
| `taxCode` is empty            | `missing_tax_code`                                      |
| `payeTax` is £0               | `paye_zero`                                             |
| `natIns` is £0                | `nat_ins_zero`                                          |
| All violations simultaneously | All three flags; `salariedPay` still captured correctly |

These tests verify that the deduction validator works for salaried workers, not just hourly workers, and that validation failures do not corrupt the salary pay capture.

---

## Hourly Worker Tests — Fixture Profiles

Four fixture profiles each cover 14 months (April 2025 – May 2026). The fixture PDFs are generated by `pnpm fixtures:pdf` and then must exist on disk before these tests can run. When the fixture directories are absent, the tests skip gracefully.

### Profile Taxonomy

```
                  basic rate ≥ holiday rate?   holiday rate correct?
                  ─────────────────────────────────────────────────
good-predictable  ✓ consistent hours           ✓ £12.50 = basic rate
bad-predictable   ✓ consistent hours           ✗ £9.00 < basic rate
good-zero-hours   variable hours               ✓ £12.50 = basic rate
bad-zero-hours    variable hours               ✗ £8.50 < basic rate
```

Holiday months are June, September, December 2025 and March 2026 (indices 2, 5, 8, 11 in the sorted entry array).

### Test Files

| File                                     | Slices Tested              | Flag Assertions                                                                           |
| ---------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| `run_snapshot_good_predictable.test.mjs` | 3-month, 6-month, 14-month | No holiday rate flags on any entry                                                        |
| `run_snapshot_bad_predictable.test.mjs`  | 3-month, 6-month, 14-month | Holiday rate flag on each holiday month; clean months have no flags                       |
| `run_snapshot_good_zero_hours.test.mjs`  | 3-month, 6-month, 14-month | No holiday rate flags despite variable hours; varied `basicHours` confirmed across months |
| `run_snapshot_bad_zero_hours.test.mjs`   | 3-month, 6-month, 14-month | Holiday rate flag on each holiday month; clean months have no holiday flags               |

### Flag Suppression Behaviour

The flag logic has two signals:

- **Signal A** (`holiday_rate_below_basic`): holiday rate is below the basic rate shown on the **same payslip**. Used when there is insufficient prior reference data (< 3 eligible months).
- **Signal B** (`holiday_rate_below_rolling_avg`): holiday rate is below the 52-week rolling average of prior basic pay. Used when ≥ 3 eligible prior months exist. **Suppresses Signal A** to avoid double-flagging the same root cause.

In the bad-place profiles, the **first** holiday month (June 2025) only has April and May as prior eligible months — insufficient for a rolling average, so Signal A fires. Subsequent holiday months (September, December, March) have ≥ 3 prior eligible months, so Signal B fires and Signal A is suppressed.

The 3-month slice tests cover only the first holiday month (June 2025), where Signal B is unavailable, so both bad-place tests assert Signal A specifically:

```js
expect(snapshot.entries[2].flagIds).toContain('holiday_rate_below_basic')
```

The 6-month and 14-month slice tests cover later holiday months where either signal may fire, so they use the `||` form:

```js
expect(
    ids.includes('holiday_rate_below_basic') ||
        ids.includes('holiday_rate_below_rolling_avg')
).toBe(true)
```

### Zero-Hours NI/PAYE Flags

Months where the zero-hours worker happened to work fewer than ~84 hours (below the £1,048/month NI threshold) legitimately produce `nat_ins_zero` and `paye_zero` flags. This is **correct system behaviour** — the worker genuinely had no NI or PAYE due that month. Clean-entry assertions for zero-hours profiles therefore assert the absence of holiday rate flags rather than an empty flag list:

```js
expect(entry.flagIds).not.toContain('holiday_rate_below_basic')
expect(entry.flagIds).not.toContain('holiday_rate_below_rolling_avg')
```

The 14-month full-run tests additionally make positive assertions that the five provably below-threshold months (Apr/Jul/Oct 2025, Jan/Apr 2026) **do** carry these flags:

```js
for (const i of [0, 3, 6, 9, 12]) {
    expect(snapshot.entries[i].flagIds).toContain('nat_ins_zero')
    expect(snapshot.entries[i].flagIds).toContain('paye_zero')
}
```

---

## Snapshot Regression Baseline Tests

### How It Works

`buildRunSnapshot` produces a JSON object containing:

- `recordCount`: number of parsed payslips
- `entries[]`: per-payslip `{ period, netPay, basicHours, basicRate, salariedPay, holidayHours, payeTax, pensionEE, flagIds }`
- `contributions[]`: if a pension export was also provided

The snapshot is compared against a checked-in expected JSON file. Any drift in any field — caused by a parser change, calculation change, or fixture regeneration — will fail the test until the baseline is deliberately regenerated and the diff reviewed.

### Baseline Files

| Baseline JSON                                                              | Test File                                | Dataset                                           |
| -------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| `tests/test_files/report-workflow/expected-run-snapshot.json`              | `run_snapshot.test.mjs`                  | Original 13-payslip fixture (Apr 2024 – Apr 2025) |
| `tests/test_files/report-workflow/expected-snapshot-good-predictable.json` | `run_snapshot_good_predictable.test.mjs` | Good-place predictable (14 months)                |
| `tests/test_files/report-workflow/expected-snapshot-bad-predictable.json`  | `run_snapshot_bad_predictable.test.mjs`  | Bad-place predictable (14 months)                 |
| `tests/test_files/report-workflow/expected-snapshot-good-zero-hours.json`  | `run_snapshot_good_zero_hours.test.mjs`  | Good-place zero-hours (14 months)                 |
| `tests/test_files/report-workflow/expected-snapshot-bad-zero-hours.json`   | `run_snapshot_bad_zero_hours.test.mjs`   | Bad-place zero-hours (14 months)                  |

### Regenerating Baselines

If an intentional code change causes expected drift, regenerate the relevant baseline(s):

```bash
# Original 13-payslip baseline
pnpm exec vitest run tests/utils/regenerate_run_snapshot.test.mjs

# All four new profile baselines
pnpm exec vitest run tests/utils/regenerate_profile_snapshot.test.mjs
```

Review the diff before committing. If the change is unexpected, investigate before accepting.

---

## Running Tests

```bash
# All tests
pnpm test:all

# Single file
pnpm exec vitest run tests/salary_snapshot.test.mjs

# Profile snapshot tests (require pnpm fixtures:pdf first)
pnpm exec vitest run tests/run_snapshot_good_predictable.test.mjs \
                      tests/run_snapshot_bad_predictable.test.mjs \
                      tests/run_snapshot_good_zero_hours.test.mjs \
                      tests/run_snapshot_bad_zero_hours.test.mjs
```

### Generating Fixture PDFs (required once before profile snapshot tests)

```bash
# Generate all PDF fixtures for all runs in fixture_runs.json
pnpm fixtures:pdf

# Then capture the expected snapshot baselines for the new profiles
pnpm exec vitest run tests/utils/regenerate_profile_snapshot.test.mjs
```

---

## Limitations

- **Fixture PDFs must be generated locally** — they are not checked into the repository (binary artefacts). Profile snapshot tests skip gracefully when the fixture directories do not exist.
- **Scottish tax rates in fixtures only** — the synthetic PDF fixtures are generated using Scottish income tax bands (19%/20%/21%/42%), which differ from rUK bands (20%/40%). This affects only the PAYE figures stamped onto the fixture PDFs and the corresponding expected snapshot values. The system itself never computes PAYE — it reads whatever figure the employer printed on the payslip and reports it unchanged. Real workers on rUK rates will have their actual payslips processed correctly.
- **Holiday flags apply to hourly workers only** — the `buildHolidayPayFlags` function exits immediately if `hourly.basic.units` is zero or absent. Salaried workers do not receive holiday rate anomaly flags.
- **Salary snapshot tests are fixture-free** — they use synthetic in-memory records and run without any PDF generation step.
- **Zero-hours baseline for defaults** — when no `workerProfile` is provided, `typicalDays` defaults to 0 and `statutoryHolidayDays` defaults to null. This reflects the zero-hours/irregular-hours worker baseline. Tests that need specific worker profiles (salaried, hourly fixed-schedule) must pass an explicit `workerProfile` object. See `variable_worker_entitlement.test.mjs` for coverage of all profile variants.
