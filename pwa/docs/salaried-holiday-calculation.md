# Salaried Employee — Holiday Day Estimation: Technical Reference

## Overview

This document describes how the Anonymous Payroll Reporter estimates holiday days taken and remaining for salaried workers. It covers the statutory background, the calculation pipeline, known limitations, and the precise arithmetic used.

The implementation lives in `pwa/src/report/build.js` (HTML report) and `pwa/src/report/pdf_export.js` (PDF export). There is no separate calculation module for salaried workers — the logic is embedded directly in the year-summary rendering path of each file.

---

## Statutory Background

Salaried workers receive a fixed annual salary regardless of the exact hours worked each week. UK law entitles them to a minimum of 5.6 weeks of paid holiday per year, capped at 28 days for a standard 5-day week. ([ACAS: Holiday entitlement](https://www.acas.org.uk/checking-holiday-entitlement))

Unlike hourly workers, salaried workers' holiday pay is not calculated from an hourly rate or a 52-week rolling average — their holiday pay is simply their normal salary, because salary continues unchanged during annual leave. The legal question for salaried workers is therefore not _at what rate was holiday paid?_ but _how many days of holiday were taken, and does the entitlement remain?_

Sage UK payslips (the primary supported format) record holiday pay for salaried workers as a flat `salary.holiday.amount` — a monetary amount only, with no accompanying hours or days figure. This means the tool must _infer_ days taken from the monetary amount, using the worker's basic salary as a reference.

**No underpayment rate check is performed for salaried workers.** Rate checks (Signals A and B in the hourly reference) require hourly units data that is not present in salaried payslips. The tool produces days taken / days remaining estimates only.

---

## Known Shortcomings

### 1. Salary must be positive in the same tax year

The daily rate is derived from the year's basic salary total. If the dataset for a given tax year contains no `salary.basic.amount` (e.g. only the final month is present and it shows only holiday pay), the daily rate will be zero and the day estimate is omitted — only the raw £ holiday amount is shown.

**Effect:** Partial-year datasets close to the tax-year boundary may produce a raw £ figure rather than a day estimate.

**Mitigation:** Ensure the dataset covers the full relevant tax year, or at least includes enough months of basic salary to produce a meaningful daily rate.

---

### 2. Constant-salary assumption

The daily rate is calculated as:

```text
dailyRate = yearBasicSalaryAmount / monthsInYear / workingDaysPerMonth
```

This assumes the worker's salary was the same throughout all months in the year. A pay rise mid-year will cause `yearBasicSalaryAmount` to be a blend of two rates, skewing `dailyRate` — and therefore the day estimate — slightly.

**Effect:** In a year containing a pay rise, days taken will be slightly over- or under-estimated depending on whether the pay rise was earlier or later in the year. The error is proportional to the size and timing of the pay rise.

**Mitigation:** None currently. The estimate is labelled as approximate (`≈`) in the report. Workers with a mid-year pay rise should treat the day estimate as indicative.

---

### 3. `typicalDays` dependency

`workingDaysPerMonth` is calculated as `(typicalDays × 52) / 12`. If the worker's `typicalDays` value is wrong (e.g. defaulting to 5 for a part-time worker who works 3 days per week), the daily rate and day count will be incorrect.

**Effect:** A 3-day-per-week worker using the default of 5 will have their daily rate overstated by ~67% and their days taken understated by ~40%.

**Mitigation:** The `typicalDays` field in the worker profile panel should be set correctly. The value used is visible in the field hint in the UI, which shows the suggested statutory entitlement based on `typicalDays`.

---

### 4. No per-month breakdown

The tool calculates days taken as an annual figure, not month by month. Individual month rows in the year summary show only the raw `salary.holiday.amount` for that month — not a days estimate. The day count appears only in the Annual Totals row and the year summary footer.

**Effect:** Workers who want to understand which specific months included holiday pay must inspect the individual payslip rows (within the year detail section) for non-zero `salary.holiday` amounts. The year-summary table shows only the annual aggregate.

---

### 5. `salary.holiday.units` is typically null

Sage UK payslips do not populate `salary.holiday.units` — the holiday amount is recorded as a lump sum with no unit count. The tool does not attempt to use `units` for salaried workers, even if it is present.

**Effect:** No per-payslip day estimate is possible for salaried workers. The annual aggregation via the daily rate formula is the only available approach.

---

## Worker Profile Fields Used

| Field                         | Default      | Effect                                                                   |
| ----------------------------- | ------------ | ------------------------------------------------------------------------ |
| Worker type                   | hourly       | Must be set to **Salaried** to activate this path                        |
| Typical days per week         | 5            | Used in `workingDaysPerMonth` and `dailyRate`                            |
| Statutory holiday entitlement | 28 days/year | Used to compute `daysRemaining`                                          |
| Contractual hours per week    | —            | Not used in salaried calculations                                        |
| Holiday year start month      | 4 (April)    | Controls which entries are grouped together for the holiday day estimate |

---

## Leave Year Grouping

By default, holiday days taken and remaining are computed per **tax year** (April – March), matching the UK tax year. When a different `leaveYearStartMonth` is set (e.g. 1 for January), the tool groups entries by **leave year** instead for the holiday cell.

For each row in the Annual Totals table (still keyed by tax year), the report looks up the leave year that the first entry of that tax year belongs to and uses all entries in _that leave year_ to compute `yearBasicSalaryAmount`, `yearHolidaySalaryAmount`, and `monthsInYear`. When the leave year differs from the tax year, the cell appends a **"Leave year: …"** note so it is clear which period the estimate covers.

When `leaveYearStartMonth === 4` (the default), the leave year exactly matches the tax year and the note is suppressed.

---

## Calculation Pipeline

### Inputs (per leave year)

| Symbol                    | Source                                                                     |
| ------------------------- | -------------------------------------------------------------------------- |
| `yearBasicSalaryAmount`   | Sum of `salary.basic.amount` across all entries for the leave year         |
| `yearHolidaySalaryAmount` | Sum of `salary.holiday.amount` across all entries for the leave year       |
| `monthsInYear`            | Count of distinct `monthIndex` values among entries for the leave year     |
| `typicalDays`             | `workerProfile.typicalDays` (default 5)                                    |
| `statutoryHolidayDays`    | `workerProfile.statutoryHolidayDays` (default 28)                          |
| `leaveYearStartMonth`     | `workerProfile.leaveYearStartMonth` (default 4 — April, matching tax year) |

---

### Step 1 — Working days per month

```text
workingDaysPerMonth = (typicalDays × 52) / 12
```

This converts a weekly days figure to the average number of working days per calendar month. Using `× 52 / 12` (≈ 4.333 weeks/month) rather than dividing by `typicalDays` directly ensures the correct monthly equivalent.

Examples:

| typicalDays | workingDaysPerMonth |
| ----------- | ------------------- |
| 5           | 21.67               |
| 4           | 17.33               |
| 3           | 13.00               |

---

### Step 2 — Daily rate

```text
dailyRate = yearBasicSalaryAmount / monthsInYear / workingDaysPerMonth
```

This is the average gross pay for one working day, derived from the worker's total basic salary for the year divided by the number of months worked and the working days per month.

**Guard:** If `yearBasicSalaryAmount = 0`, `dailyRate` is set to 0 and the day estimate is omitted (only the raw £ holiday amount is shown). The `workingDaysPerMonth > 0` condition is also checked but is vacuously satisfied in practice — `typicalDays` is always at least 1.

---

### Step 3 — Days taken

```text
daysTaken = yearHolidaySalaryAmount / dailyRate
```

The total holiday salary paid during the year, divided by the daily rate, gives the implied number of working days of holiday taken.

**Guard:** If `dailyRate = 0`, `daysTaken` is `null` and the step is skipped.

---

### Step 4 — Days remaining

```text
daysRemaining = max(0, statutoryHolidayDays − daysTaken)
overrun       = statutoryHolidayDays − daysTaken < 0
```

Days remaining is floored at zero for display. If the raw difference is negative, the report appends `(entitlement exceeded)` / `EXCEEDED` to the cell. `build.js` uses a named intermediate `salaryDaysRemainingRaw` for clarity; `pdf_export.js` inlines the subtraction.

---

### Step 5 — Rendered output

The year-summary holiday cell shows:

```text
HTML:  £{yearHolidaySalaryAmount}
       ≈{daysTaken}d taken / {daysRemaining} remaining [(entitlement exceeded)]

PDF:   £{yearHolidaySalaryAmount}
       ({daysTaken}d taken, {daysRemaining} rem [EXCEEDED])
```

If `daysTaken` is `null` (daily rate unavailable), only `£{yearHolidaySalaryAmount}` is shown.

---

## Worked Example

**Inputs:**

- Annual basic salary: £24,000 (12 months × £2,000)
- Holiday salary paid during year: £1,384.62
- `typicalDays`: 5
- `statutoryHolidayDays`: 28
- `monthsInYear`: 12

**Step 1:**

```text
workingDaysPerMonth = (5 × 52) / 12 = 21.667
```

**Step 2:**

```text
dailyRate = £24,000 / 12 / 21.667 = £92.31/day
```

**Step 3:**

```text
daysTaken = £1,384.62 / £92.31 = 15.0 days
```

**Step 4:**

```text
daysRemaining = 28 − 15.0 = 13.0 days
```

**Output:**

```text
£1,384.62
≈15.0 days taken / 13.0 remaining
```

---

## Contract-Type Mismatch Warning

When `workerType === 'salary'`, `build.js` also scans all entries for the presence of hourly pay (`hourly.basic.units > 0` or `hourly.holiday.units > 0`). If any is found, a warning banner is rendered:

> "Some payslips contain hourly pay (Basic Hours) but your worker profile is set to **Salaried**. If your contract changed part-way through, consider running separate reports for each contract period for accurate results."

This warning does not affect the day calculation — it is informational only.

---

## Relationship to the Hourly Path

| Aspect                  | Hourly workers                   | Salaried workers                 |
| ----------------------- | -------------------------------- | -------------------------------- |
| Underpayment rate check | ✓ Signals A and B                | ✗ Not applicable                 |
| Days taken estimate     | From `avgHoursPerDay` baseline   | From `dailyRate` formula         |
| Data source             | `hourly.basic`, `hourly.holiday` | `salary.basic`, `salary.holiday` |
| Requires worker profile | No (defaults to hourly)          | Yes (must set type to Salaried)  |
| Per-month day estimate  | ✗ Annual only                    | ✗ Annual only                    |
| Statutory reference     | 52-week rolling average          | Daily rate from annual salary    |
