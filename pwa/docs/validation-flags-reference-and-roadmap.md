# Validation Flags Reference and Roadmap

## Purpose

This document tracks validation-flag behavior across three areas:

1. National Insurance (implemented)
2. PAYE tax validation (implemented and actively evolving)
3. Pension auto-enrolment warnings (planned)

It is intended as a single source of truth for flag IDs, severity intent, and rollout scope.

## Severity model

- `warning`: likely payroll anomaly that should be investigated now.
- `notice`: informational context or lower-risk condition that may still need worker action.

This follows the existing `ValidationFlag` model (`id`, `label`, optional `severity`, `ruleId`, `inputs`).

## Current National Insurance flags

### `nat_ins_zero`

Status: implemented.

Current behavior in validation:

- Condition: `nationalInsurance <= 0`
- Threshold source: tax-year NI primary threshold (monthly) from `uk_thresholds`
- Severity split:
    - `warning` when gross pay is above NI primary threshold
    - `notice` when gross pay is at or below NI primary threshold

Current intent:

- Above threshold + zero NI should be treated as a stronger anomaly (`warning`).
- At/below threshold + zero NI is usually expected, but still surfaced as context (`notice`).

## Current PAYE flags

Status: implemented, with ongoing refinement work around cumulative modeling and confidence.

### `paye_zero`

Used when reported PAYE is zero and expected PAYE logic indicates this is notable.

### `paye_mismatch`

Used when reported PAYE differs from expected PAYE by more than tolerance.

### `paye_tax_code_unsupported`

Used when the tax code is outside the standard validation path (or region cannot be inferred safely).

### `paye_pay_cycle_unsupported`

Used when period position cannot be resolved from pay-cycle/date inputs.

### `tax_year_thresholds_unavailable`

Used when threshold-backed tax validation cannot run due to missing/unsupported threshold data.

### `tax_year_thresholds_partial_support`

Used when threshold support is partial for a known date range (for example, periods where one tax year has mid-year threshold changes that are only partially modeled).

## Planned pension auto-enrolment warnings

Status: planned.

Thresholds already available in `uk_thresholds` per tax year:

- `pensionAutoEnrolmentTriggerAnnual` (currently 10000)
- `pensionQualifyingEarningsLowerAnnual` (currently 6240)
- `pensionQualifyingEarningsUpperAnnual` (currently 50270)

### Planned rule group (proposal)

#### 1) `pension_auto_enrolment_missing_deductions`

Proposed severity: `warning`

Intent:

- Worker earnings are at/above the statutory auto-enrolment trigger, but pension deductions are not present.

Example condition shape (to be finalized in implementation):

- Annualized or periodized earnings meet/exceed trigger
- `deductions.pensionEE.amount <= 0`
- Optional: strengthen signal if `pensionER.amount <= 0` too

#### 2) `pension_opt_in_possible`

Proposed severity: `notice`

Intent:

- Earnings are below auto-enrolment trigger but high enough that the worker could opt in.

Example condition shape:

- Earnings are between lower qualifying threshold and auto-enrolment trigger
- No pension deductions present
- Message: worker may opt in; employer contribution expectations depend on legal category and should be confirmed

#### 3) `pension_join_no_mandatory_employer_contrib`

Proposed severity: `notice`

Intent:

- Earnings are below the lower qualifying threshold; worker may ask to join a pension, but employer may not be required to contribute.

Example condition shape:

- Earnings below lower qualifying threshold
- No pension deductions present
- Message explicitly distinguishes "can join" from "employer must contribute"

## Implementation notes for pension flags

- Reuse tax-year threshold resolution and periodization helpers rather than hard-coding monthly values.
- Keep rule IDs stable and add them to the central flag catalog before rollout.
- Include `inputs` payload values (`earnings`, resolved thresholds, contribution amounts) for audit traceability.
- Treat unsupported/unknown threshold contexts as low-confidence pathways rather than silent pass.

## Suggested rollout order

1. Add pension flag IDs to catalog and tests (no behavior change yet).
2. Implement core detection in hourly/report validation pass.
3. Add focused tests for:
    - Above-trigger missing deduction (warning)
    - Between-threshold opt-in (notice)
    - Below-lower-threshold join-only (notice)
4. Surface user-facing copy in HTML/PDF consistently with existing validation callout styles.
5. Validate across at least two tax years to confirm threshold lookup behavior.

## Open decisions to finalize

- Earnings basis for pension checks: period gross vs pensionable earnings proxy where available.
- Whether zero employee contribution with non-zero employer contribution is treated as expected scheme behavior or flagged.
- Exact severity policy when threshold context is partially supported.
- Final wording for legally cautious user-facing messages.
