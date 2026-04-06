# Validation Flags Reference

## Purpose

This document tracks validation-flag behavior, and is intended as a practical reference for flag IDs, severity intent, and rollout scope.

The canonical machine-readable flag list remains the central catalog in `pwa/src/report/flag_catalog.js`.

## Decision note

Threshold-backed validation follows four operating modes:

- `ok`: requested tax-year thresholds exist; run threshold-driven PAYE, NI, and pension checks normally.
- `fallback-to-previous-tax-year`: requested year is newer than configured data; emit `tax_year_thresholds_unavailable`, run threshold-driven checks using the most recent prior configured year, and keep low confidence true.
- `partial-threshold-support`: threshold rows exist but some checks are intentionally limited for the period; emit `tax_year_thresholds_partial_support`, skip threshold-driven PAYE/NI checks, and continue pension threshold checks.
- `skip`: tax year is unknown or unsupported historical with no usable fallback baseline; emit threshold warning flag and skip threshold-driven PAYE/NI/pension checks.
## Severity model

- `warning`: likely payroll anomaly that should be investigated now.
- `notice`: informational context or lower-risk condition that may still need worker action.

This follows the existing `ValidationFlag` model (`id`, `label`, optional `severity`, `ruleId`, `inputs`).

## National Insurance flags

### `nat_ins_zero`

Current behavior in validation:

- Condition: `nationalInsurance <= 0`
- Threshold source: tax-year NI primary threshold (monthly) from `uk_thresholds`
- Severity split:
    - `warning` when gross pay is above NI primary threshold
    - `notice` when gross pay is at or below NI primary threshold

Current intent:

- Above threshold + zero NI should be treated as a stronger anomaly (`warning`).
- At/below threshold + zero NI is usually expected, but still surfaced as context (`notice`).

## Identity and baseline tax metadata flags

### `missing_nat_ins`

Used when the employee National Insurance number is missing on the parsed record.

### `missing_tax_code`

Used when the payslip tax code is missing on the parsed record.

## PAYE flags

Status: implemented, with ongoing refinement work around cumulative modeling and confidence.

### `paye_zero`

Used when reported PAYE is zero and expected PAYE logic indicates this is notable.

### `paye_mismatch`

Used when reported PAYE differs from expected PAYE by more than tolerance.

Current behavior details:

- Mismatch significance is evaluated using absolute difference (`|reported - expected|`) against active tolerance.
- Standard PAYE tolerance: `0.5`.
- Cumulative table-mode tolerance: `2.0` (used to suppress known low-level table drift).
- Severity is `warning` when mismatch is significant for the active tolerance, otherwise `notice`.

### `paye_tax_code_unsupported`

Used when the tax code is outside the standard validation path (or region cannot be inferred safely).

Current behavior details:

- This does not trigger any previous-tax-year threshold fallback.
- The standard PAYE expected-value calculation path is skipped for that payslip and manual verification is required.

### `paye_pay_cycle_unsupported`

Used when period position cannot be resolved from pay-cycle/date inputs.

### `tax_year_thresholds_unavailable`

Used when threshold-backed tax validation cannot run due to missing/unsupported threshold data.

Current behavior details:

- If the payslip is for a newer tax year than the latest configured threshold set, this warning is still emitted.
- In that future-year case, threshold-driven checks run using the most recent prior configured tax year as a temporary baseline, and the flag inputs include both requested and fallback tax years.
- Low confidence remains true for this pathway.
- For unknown tax year or unsupported historical tax years (where no earlier configured baseline exists), threshold-driven checks are skipped.
- Threshold-driven checks in this context include PAYE expected-vs-reported logic, NI threshold checks, and pension threshold checks.

### `tax_year_thresholds_partial_support`

Used when threshold support is partial for a known date range (for example, periods where one tax year has mid-year threshold changes that are only partially modeled).

## Reconciliation flags

### `payment_line_mismatch`

Used when a payment line `units × rate` does not match the reported line amount (within configured tolerance).

### `gross_mismatch`

Used when summed payment lines do not reconcile with total gross pay.

### `net_mismatch`

Used when net pay does not reconcile with payments less deductions.

## Holiday validation flags

### `holiday_rate_below_basic`

Used when holiday pay implied hourly rate is below the basic hourly rate for the period.

### `holiday_rate_below_rolling_avg`

Used when holiday pay implied hourly rate is below rolling-average basic rate.

## Pension auto-enrolment flags

Status: implemented in v1.

Thresholds already available in `uk_thresholds` per tax year:

- `pensionAutoEnrolmentTriggerAnnual` (currently 10000)
- `pensionQualifyingEarningsLowerAnnual` (currently 6240)
- `pensionQualifyingEarningsUpperAnnual` (currently 50270)

### Implemented rule group

#### 1) `pension_auto_enrolment_missing_deductions`

Default severity: `warning`

Current behavior:

- Uses period gross pay (`thisPeriod.totalGrossPay`, fallback to payment sum) and periodized tax-year thresholds.
- Fires when earnings are at/above the period auto-enrolment trigger and no pension deduction evidence is present.
- Pension deduction evidence means either employee pension or employer pension amount is greater than zero.
- Special case in v1: `pensionEE == 0` with `pensionER > 0` is treated as contribution evidence, so this flag is not raised.
- Enrolment timing path (when payroll run start date is available):
    - More than 6 weeks with no pension deductions: emits `notice` stating enrolment should have happened or postponement should have been notified.
    - 3 months or more with no pension deductions: emits `warning` stating worker should have been auto-enrolled by now.
    - Before 6 weeks from payroll run start: emits `notice` using a pre-enrolment wording.
- Deferment handling in current implementation:
    - Deferment-specific branching is not currently applied in pension validation decisions.
    - Deferment-specific evidence fields are not currently included in pension flag `inputs` payloads.

#### 2) `pension_opt_in_possible`

Severity: `notice`

Current behavior:

- Fires when period earnings are between lower qualifying threshold and auto-enrolment trigger.
- Requires no pension deduction evidence for the period.
- Wording remains advisory and asks for confirmation of eligibility and contribution duties.

#### 3) `pension_join_no_mandatory_employer_contrib`

Severity: `notice`

Current behavior:

- Fires when period earnings are below the lower qualifying threshold.
- Requires no pension deduction evidence for the period.
- Message explicitly distinguishes join rights from mandatory employer-contribution rules.

## Implementation notes for pension flags

- Reuse tax-year threshold resolution and periodization helpers rather than hard-coding monthly values.
- Keep rule IDs stable in the central flag catalog.
- Include `inputs` payload values (`earnings`, resolved thresholds, contribution amounts) for audit traceability.
- Include timing inputs in pension flag payloads (`payrollRunStartDate`, elapsed run days, and 6-week/3-month threshold booleans).
- `payrollRunStartDate` comes from `buildReport`: use `workerProfile.payrollRunStartDate` when the caller provides one, otherwise fall back to the earliest parsed payslip date in the uploaded dataset.
- This precedence matters for incomplete datasets: relying only on the earliest uploaded payslip can make pension timing appear newer than the real payroll start and suppress 6-week or 3-month escalation behavior.
- Parser-level deferment extraction remains out of scope in this phase.

## Confirmed v1 decisions

- Earnings basis: period gross pay.
- `pensionEE == 0` with `pensionER > 0`: not treated as missing deductions in v1.
- Pre-6-week timing context: emit pre-enrolment `notice` for the missing-deductions pension flag.
