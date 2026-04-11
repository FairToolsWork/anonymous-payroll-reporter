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

Validation intent note:

- These checks are anomaly detectors, not a substitute for payroll software or HMRC-calculated statutory outputs.
- NI checks are mainly threshold and earnings-period plausibility checks.
- PAYE checks compare reported deductions against personal allowance thresholds using tax-code and pay-cycle context. They are conservative anomaly detectors and do not attempt to reconstruct expected PAYE from tax bands.

## Severity model

- `warning`: likely payroll anomaly that should be investigated now.
- `notice`: informational context or lower-risk condition that may still need worker action.

This follows the existing `ValidationFlag` model (`id`, `label`, optional `severity`, `ruleId`, `inputs`).

## National Insurance flags

Heuristic scope:

- Current NI validation is deliberately heuristic.
- The rules use available period earnings plus configured tax-year thresholds to decide whether NI deductions look expected or unexpected.
- This is strong enough to surface many worker-facing anomalies, but it is not intended to be a full statutory NI calculator.

Current limitations:

- The validation does not currently model NI category-letter-specific outcomes.
- The validation does not currently model director-specific NI methods.
- The validation does not currently attempt full HMRC-equivalent reconstruction across all special cases, deferment variants, or edge-case payroll arrangements.
- Because of this, NI flags should be read as "unexpected given the available earnings and threshold context" rather than "legally impossible in all cases."

### `nat_ins_zero`

- Condition: `nationalInsurance <= 0`
- Threshold source: tax-year NI primary threshold (monthly) from `uk_thresholds`
- Severity split:
    - `warning` when gross pay is above NI primary threshold
    - `notice` when gross pay is at or below NI primary threshold

Current intent:

- Above threshold + zero NI should be treated as a stronger anomaly (`warning`).
- At/below threshold + zero NI is usually expected, but still surfaced as context (`notice`).

Legislative nuance:

- Class 1 employee NI is generally assessed per earnings period using category-letter thresholds and rates, rather than cumulative PAYE-style year-to-date balancing.
- This makes NI easier to validate from period earnings than PAYE, but not perfectly simple in every case: category letters, deferment variants, and director-specific methods can change what is expected.
- For that reason, this rule should be treated as a high-confidence heuristic for standard employee cases, not a universal statutory determination.

### `nat_ins_taken_below_threshold`

- Condition: `nationalInsurance > 0` while gross pay is at or below NI primary threshold
- Threshold source: tax-year NI primary threshold (monthly) from `uk_thresholds`
- Severity: always `warning`

Current intent:

- Surface likely ineligible NI deductions where threshold-driven rules indicate no NI should be taken.

Legislative nuance:

- This remains a strong anomaly signal for standard employee cases where gross pay is at or below the primary threshold.
- However, category-letter context and special-case methods can affect whether NI is actually due, so this rule is best framed as "unexpected given the available earnings context" rather than a definitive legal conclusion in all cases.

## Identity and baseline tax metadata flags

### `missing_nat_ins`

Used when the employee National Insurance number is missing on the parsed record.

### `missing_tax_code`

Used when the payslip tax code is missing on the parsed record.

## PAYE flags

Status: implemented as conservative anomaly checks.

Legislative nuance:

- PAYE checks are intentionally conservative and are designed to surface likely anomalies, not to replicate full HMRC PAYE reconciliation.
- The current path prioritizes period-level plausibility checks over full cumulative reconstruction.

### `paye_zero`

Used when reported PAYE is zero (or rounds to zero) and earnings appear to be above the tax-free allowance.

- Severity: `warning`
- Condition: PAYE rounds to zero, and gross pay for the period (or gross-for-tax year-to-date when available) exceeds the applicable personal allowance threshold.
- When earnings appear within the allowance and PAYE is zero, no flag is emitted — this is expected behaviour and is not surfaced as noise.

Interpretation note:

- Zero PAYE is not automatically anomalous just because earnings are present.
- Whether it is unexpected depends on tax code, allowance position, and pay frequency.
- YTD gross is used when available and the tax code is not an emergency code; otherwise the check falls back to period-only gross.

### `paye_taken_not_due`

- Condition: reported PAYE is positive, and gross pay for the period (or gross-for-tax year-to-date when available) appears to be within the personal allowance threshold.
- Severity: `warning`
- Emission behavior: raised as a distinct rule to make likely ineligible PAYE deductions explicit.

Interpretation note:

- This flag complements `paye_zero`: where `paye_zero` asks "should tax have been taken?", `paye_taken_not_due` asks "should tax have been taken when it was?".

### `paye_tax_code_unsupported`

Used when the tax code is outside the standard validation path (or region cannot be inferred safely).

- This does not trigger any previous-tax-year threshold fallback.
- The standard PAYE expected-value calculation path is skipped for that payslip and manual verification is required.

Interpretation note:

- This flag is important because PAYE anomaly checks are only as strong as the tax-code path being modeled.
- When the code is unsupported, the validator should prefer explicit uncertainty over pretending a threshold-only PAYE judgment is reliable.

### `paye_pay_cycle_unsupported`

Used when period position cannot be resolved from pay-cycle/date inputs.

### `tax_year_thresholds_unavailable`

Used when threshold-backed tax validation cannot run due to missing/unsupported threshold data.

- If the payslip is for a newer tax year than the latest configured threshold set, this warning is still emitted.
- In that future-year case, threshold-driven checks run using the most recent prior configured tax year as a temporary baseline, and the flag inputs include both requested and fallback tax years.
- Low confidence remains true for this pathway.
- For unknown tax year or unsupported historical tax years (where no earlier configured baseline exists), threshold-driven checks are skipped.
- Threshold-driven checks in this context include PAYE allowance-based anomaly checks, NI threshold checks, and pension threshold checks.

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
    - Deferment date quality is evaluated; problematic deferment data sets pension `lowConfidence` true.
    - Timing evidence fields are included in pension flag `inputs` payloads (`payrollRunStartDate`, elapsed run days, and 6-week/3-month window markers).

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

#### 4) `pension_employer_contrib_not_required`

Severity: `warning`

Current behavior:

- Fires when employer pension contribution is present (`pensionER > 0`) while earnings are below the period lower qualifying threshold.
- Raised before the generic deduction-evidence early return so this anomaly is not hidden.
- Includes payroll/threshold context in `inputs` for audit traceability.

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
