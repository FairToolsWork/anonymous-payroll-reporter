# Auditor Verification Guide

## Purpose

This guide is an index for auditors who need to trace documented holiday and pension calculations to executable code and tests.

Use it together with:

- `pwa/docs/hourly-holiday-pay-calculation.md`
- `pwa/docs/salaried-holiday-calculation.md`
- `pwa/docs/pension-contribution-reconciliation.md`

## Scope Covered

- Hourly holiday pay rate checks (Signal A and Signal B)
- Salaried holiday day estimation
- Pension contribution reconciliation (expected vs actual)
- Recency classification for pension contribution freshness
- Rendering consistency across HTML and PDF report outputs

## Audit Entry Point

Start at report assembly:

- `buildReport` in `pwa/src/report/build.js`

From this entry point, the workflow calls:

1. `buildReportEntries` for dated report entries
2. `buildHolidayPayFlags` and `buildYearHolidayContext` for hourly holiday analysis
3. `buildContributionSummary` for pension reconciliation
4. `buildSummaryViewModel` and `buildYearViewModel` for display model construction
5. `renderHtmlReport` and `exportReportPdf` for output rendering

## Traceability Matrix

| Domain           | Operation                                  | Symbol(s)                                                                | File                                                                       |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Hourly holiday   | Reference-eligibility gate                 | `isReferenceEligible`, `SKIP_PAY_TITLES`                                 | `pwa/src/report/holiday_calculations.js`                                   |
| Hourly holiday   | Rolling reference builder                  | `buildRollingReference`, `getWeeksInPeriod`                              | `pwa/src/report/holiday_calculations.js`                                   |
| Hourly holiday   | Underpayment flags                         | `buildHolidayPayFlags`, `formatFlagLabel`                                | `pwa/src/report/holiday_calculations.js`, `pwa/src/report/flag_catalog.js` |
| Hourly holiday   | Context projection for day/hour summaries  | `buildYearHolidayContext`                                                | `pwa/src/report/holiday_calculations.js`                                   |
| Salaried holiday | Annual salary-based holiday day estimate   | `buildYearHolidaySummary` (salary branch)                                | `pwa/src/report/year_holiday_summary.js`                                   |
| Holiday display  | Text formatting and overrun suffix         | `buildHolidaySummaryDisplay`, `OVERRUN_SUFFIX`                           | `pwa/src/report/report_formatters.js`                                      |
| Pension          | Expected/actual month alignment and deltas | `buildContributionSummary`                                               | `pwa/src/report/pension_calculations.js`                                   |
| Pension          | Global totals roll-up                      | `buildContributionTotals`                                                | `pwa/src/report/build.js`                                                  |
| Pension          | Last contribution recency snapshot         | `buildContributionRecency`                                               | `pwa/src/report/build.js`                                                  |
| Pension          | Threshold-based stale/fresh styling        | `buildContributionRecencyDisplay`, `CONTRIBUTION_RECENCY_DAYS_THRESHOLD` | `pwa/src/report/report_formatters.js`, `pwa/src/report/uk_thresholds.js`   |
| Year balances    | Opening/closing pension balances           | `buildYearViewModel`                                                     | `pwa/src/report/report_view_model.js`                                      |
| Rendering        | HTML and PDF output paths                  | `renderHtmlReport`, `exportReportPdf`                                    | `pwa/src/report/html_export.js`, `pwa/src/report/pdf_export.js`            |

## Quick Alignment Checks

1. Verify that each operation described in the three technical docs has at least one named symbol in the traceability map.
2. Verify threshold values from code constants, not prose assumptions:
    - Contribution recency threshold is configured in `pwa/src/report/uk_thresholds.js`.
3. Verify display semantics from formatter functions, not raw calculations:
    - Holiday and pension labels are finalized in `pwa/src/report/report_formatters.js`.
4. Verify balance carry-forward behavior in both rendering flows:
    - HTML: `pwa/src/report/html_export.js`
    - PDF: `pwa/src/report/pdf_export.js`
5. Verify summary/year row composition in view models:
    - `pwa/src/report/report_view_model.js`

## Primary Test Evidence

- `tests/hol_pay_flags.test.mjs`
- `tests/variable_worker_entitlement.test.mjs`
- `tests/salary_snapshot.test.mjs`
- `tests/excel_contribution.test.mjs`
- `tests/report_view_model.test.mjs`
- `tests/report_workflow.test.mjs`
- `tests/run_snapshot.test.mjs`

These tests provide the strongest regression evidence for holiday/pension logic and rendered report consistency.
