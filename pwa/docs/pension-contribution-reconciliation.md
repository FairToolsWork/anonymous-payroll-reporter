# Pension Contribution Reconciliation: Technical Reference

## Overview

This document describes how the Anonymous Payroll Reporter reconciles pension contributions for a worker. It covers the two data sources used, how they are aligned by tax year and fiscal month, the over/under calculation, the running balance across years, the contribution recency indicator, and the known shortcomings of the approach.

The implementation lives in:

- `pwa/src/report/pension_calculations.js` — core reconciliation logic (`buildContributionSummary`)
- `pwa/src/report/build.js` — totals aggregation (`buildContributionTotals`, `buildContributionRecency`), opening/closing balance computation, and report rendering

---

## Two Data Sources

The reconciliation compares two independent views of the same pension contributions:

### Source 1 — Payroll deductions (from payslips)

Each payslip records the pension contributions the employer deducted from the worker's pay and paid to the pension provider that period:

- `payrollDoc.deductions.pensionEE.amount` — employee contribution (deducted from gross pay)
- `payrollDoc.deductions.pensionER.amount` — employer contribution (added by employer)

These are the **expected** contributions — what the payslips say _should_ have been paid to the pension provider.

### Source 2 — Pension provider statements (from Excel upload)

The worker can upload a contribution statement exported from their pension provider (currently NEST). Each row records an actual payment received by the provider:

- `type: 'ee'` — employee contribution received
- `type: 'er'` — employer contribution received
- `date` — date the contribution was received

These are the **actual** contributions — what the pension provider confirms was received.

**Both sources are required for reconciliation.** If no pension statement is uploaded, the tool displays payroll deductions only and marks reported contribution columns as N/A.

---

## Fiscal Month Alignment

Both sources are aligned to the same key: `taxYearKey-fiscalMonthIndex` (zero-padded to two digits), e.g. `"2023/24-11"`.

- **Tax year key** — e.g. `"2023/24"`, derived from the date via `getTaxYearKey()`. The UK tax year runs 6 April to 5 April.
- **Fiscal month index** — 1 = April (from the 6th), 2 = May, … 12 = March, derived via `getFiscalMonthIndex()`. Dates in April 1–5 are treated as fiscal month 12 of the _prior_ tax year, consistent with the statutory tax year start of 6 April.

A payslip dated 28 February 2024 maps to fiscal month 11 of tax year 2023/24. A pension contribution received on 20 February 2024 maps to the same key and is matched against it.

**Important:** The tool matches by the _calendar date_ of the pension contribution, not the payroll period it relates to. If an employer pays pension contributions late — e.g. pays February's contributions in March — the contribution lands in fiscal month 12 (March) of that year, not month 11 (February). This is a known timing gap described in the shortcomings section below.

---

## Calculation Pipeline

### Step 1 — Build expected map from payslips

For each payslip entry with a valid `parsedDate` (derived from `payrollDoc.processDate.date` via `parsePayPeriodStart`):

```text
key = taxYearKey + '-' + zeroPad(fiscalMonthIndex, 2)   // e.g. "2023/24-11"
expectedByMonth[key].ee += pensionEE.amount
expectedByMonth[key].er += pensionER.amount
```

Multiple payslips for the same fiscal month are summed.

---

### Step 2 — Build actual map from pension statements

For each contribution entry with a valid `date`:

```text
key = taxYearKey + '-' + zeroPad(fiscalMonthIndex, 2)   // e.g. "2023/24-11"
if type === 'ee': actualByMonth[key].ee += amount
if type === 'er': actualByMonth[key].er += amount
```

Multiple contribution rows for the same fiscal month and type are summed.

---

### Step 3 — Determine year scope

The year list is the union of:

- Tax years present in the payslip data
- Tax years present in the pension contribution data

This ensures years that appear in the contribution data but have no payslips (or vice versa) are still included. Years are sorted chronologically using `getTaxYearSortKey()`.

---

### Step 4 — Per-year, per-month reconciliation

For each year in scope, fiscal months 1–12 are iterated in order:

```text
expectedTotal = expected.ee + expected.er
actualTotal   = actual.ee + actual.er
delta         = actualTotal − expectedTotal
runningBalance += delta
```

`delta` is the over/under for that month:

- Positive (`delta > 0`): more was received than the payslip shows — overpayment or a prior catch-up
- Negative (`delta < 0`): less was received than the payslip shows — underpayment or a delay

`runningBalance` accumulates within the year and is stored as `balance` on each month summary. At the end of the year, `runningBalance` is stored as `yearEndBalance` — the within-year cumulative position at year end.

`totals.delta` is the sum of all monthly deltas for the year, equivalent to `yearEndBalance`.

---

### Step 5 — Overall balance

```text
overallBalance = sum of totals.delta across all years
```

This is the true cumulative over/under across the entire dataset — the number shown in the **Accumulated Over/Under** cell of the global summary table. It is stored as the `balance` property on the returned `ContributionSummary` object (not `overallBalance`, which is only the local variable name in `pension_calculations.js`).

---

## Opening and Closing Balances (Per-Year Pages)

Each year's detail page _may_ show an opening balance and a closing balance in the table footer. These rows are conditional:

- The **opening balance row** is only rendered when `openingBalance !== 0` (i.e. it is hidden for the first year and for any year where all prior years net to zero).
- The **closing balance row** is only rendered when reconciliation data is present and `closingBalance` is non-null.

Both values are computed in `build.js` and `pdf_export.js` using a forward accumulation across years:

```text
openingBalance[year N] = sum of totals.delta for years 0 … N−1
closingBalance[year N] = openingBalance[year N] + totals.delta[year N]
```

The first year always has `openingBalance = 0`, so its opening balance row is never shown.

This means the closing balance on the final year's page equals the global **Accumulated Over/Under** figure — a built-in consistency check.

**Note:** `yearEndBalance` from `pension_calculations.js` stores only the within-year running balance (resets to 0 at the start of each year). The opening/closing balance displayed in the report is computed separately by summing prior-year deltas — it does not use `yearEndBalance` as a carry-forward.

---

## Contribution Recency

The tool records the most recent pension contribution date across all contribution entries and computes how many days have elapsed since then, relative to the report run date:

```text
daysSinceContribution = max(0, floor((reportRunDate − lastContributionDate) / 86,400,000 ms))
```

The result is clamped to ≥ 0. A post-dated contribution statement (last date in the future) yields 0 rather than a negative number.

The result is displayed in the **Last Contribution Date** column of the global summary. A threshold of **30 days** is applied:

- ≤ 30 days: displayed in green (`days--fresh`)
- \> 30 days: displayed in amber/red (`days--stale`)

This draws attention to workers whose pension provider has not received a contribution recently — which may indicate the employer has stopped making payments.

---

## Global Summary Totals

`buildContributionTotals` computes cross-year aggregates for the global summary row:

| Field                    | Source                                                      |
| ------------------------ | ----------------------------------------------------------- |
| `payrollEE`              | Sum of `pensionEE.amount` across all payslip entries        |
| `payrollER`              | Sum of `pensionER.amount` across all payslip entries        |
| `payrollContribution`    | `payrollEE + payrollER`                                     |
| `pensionEE`              | Sum of `actualEE` across all years in `contributionSummary` |
| `pensionER`              | Sum of `actualER` across all years in `contributionSummary` |
| `reportedContribution`   | `pensionEE + pensionER`                                     |
| `contributionDifference` | `reportedContribution − payrollContribution`                |

`contributionDifference` is the same as `overallBalance` from `buildContributionSummary`. They are computed independently and should match; any discrepancy indicates a data alignment issue.

---

## Known Shortcomings

### 1. Date-of-receipt vs. pay-period mismatch

The pension contribution statement records when the provider received the money. Employers are legally required to pay contributions by the 22nd of the month following the pay period (or the 19th for cheque payments). ([The Pensions Regulator: Paying contributions](https://www.thepensionsregulator.gov.uk/en/employers/managing-a-scheme/paying-contributions))

**Effect:** A contribution for payroll month M received in month M+1 will appear in fiscal month M+1 in the reconciliation, not month M. This produces a one-month apparent deficit in month M and a one-month apparent surplus in M+1. The _annual_ totals are unaffected as long as all contributions for a tax year are received within the same tax year.

**Effect at year boundaries:** A March payroll contribution received in April falls into the next tax year's April figure. This creates a permanent apparent deficit in the earlier year and a surplus in the later year that cannot be reconciled without week-level data. The report footnote `ACCUMULATED_TOTALS_NOTE` warns users about this.

**Mitigation:** The per-month over/under figures should be treated as indicative. The annual and cumulative totals are more reliable.

---

### 2. Contribution data is optional

If no pension statement is uploaded, `reportedContribution`, `pensionEE`, `pensionER`, and `contributionDifference` are all `null`. The reconciliation columns display N/A. No comparison is possible.

**Mitigation:** Workers should download their contribution history from their pension provider portal and upload it alongside their payslips. The tool currently supports NEST Excel exports.

---

### 3. Only NEST Excel format is supported

The pension parser is specific to the NEST contribution export format. Contributions from other providers (e.g. Peoples Pension, Aviva, Legal & General) are not parsed.

**Mitigation:** None currently. Adding support for additional providers requires implementing a new parser.

---

### 4. Both EE and ER rows must be present in the statement

The parser enforces that the uploaded contribution statement contains at least one row of each type. If either is missing, the file is rejected at parse time with the error `CONTRIBUTION_MISSING_EE_ER` and the worker is prompted to re-export their statement. The reconciliation is never populated from a statement that covers only one contribution type.

**Effect:** A statement that legitimately contains no ER contributions (e.g. the worker is self-employed and makes only personal contributions) cannot currently be loaded. This is an accepted limitation — the tool is designed for employer-sponsored workplace pension schemes where both EE and ER contributions are expected.

**Mitigation:** Workers in schemes where the employer pays both sides as a single combined contribution labelled "employer" should check that their export format reports the two sides as separate rows.

---

### 5. Catch-up payments create apparent surpluses

If an employer pays two months' contributions in a single payment, the full amount lands in one fiscal month. That month shows a surplus; the month that was skipped shows a deficit. The annual total remains correct.

**Mitigation:** Workers seeing alternating deficits and surpluses with roughly equal magnitudes should check for delayed or batched payments before concluding there is a genuine underpayment.

---

### 6. Payslip data is taken at face value

The `pensionEE` and `pensionER` amounts on payslips are employer-reported. If the employer has incorrectly stated the deduction amounts, the expected figure will be wrong, and the reconciliation will show a spurious over/under.

**Mitigation:** None. The tool cannot cross-reference payslip deductions against statutory minimums or contractual rates.

---

## Data Structure Reference

### `ContributionSummary` (returned by `buildContributionSummary`)

```text
{
  years: Map<taxYearKey, ContributionYearSummary>,
  balance: number,          // overall cumulative over/under
  sourceFiles: string[],    // filenames of uploaded pension statements
}
```

### `ContributionYearSummary`

```text
{
  months: Map<fiscalMonthIndex, ContributionMonthSummary>,
  totals: ContributionYearTotals,
  yearEndBalance: number,   // within-year cumulative delta at month 12
}
```

### `ContributionMonthSummary`

```text
{
  expectedEE: number,   // from payslip deductions
  expectedER: number,
  actualEE:   number,   // from pension statement
  actualER:   number,
  delta:      number,   // actualTotal − expectedTotal for this month
  balance:    number,   // running within-year cumulative delta at this month
}
```

### `ContributionYearTotals`

```text
{
  expectedEE: number,
  expectedER: number,
  actualEE:   number,
  actualER:   number,
  delta:      number,   // sum of monthly deltas = yearEndBalance
}
```
