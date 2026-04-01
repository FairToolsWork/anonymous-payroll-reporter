# Hourly Employee - Holiday Pay Calculation: Technical Reference

## Overview

This document describes how the Anonymous Payroll Reporter calculates and flags potential holiday pay underpayment for hourly-paid workers. It covers the calculation pipeline, the statutory basis for the approach, known shortcomings and their mitigations, and the precise arithmetic used.

The implementation lives in `pwa/src/report/holiday_calculations.js` and `pwa/src/report/tax_year_utils.js`.

---

## Statutory Background

UK employment law distinguishes two categories of hourly worker for the purposes of holiday pay:

**Fixed-hours workers** receive a fixed number of hours per week at a fixed rate. Their statutory holiday pay entitlement is simply their normal weekly pay — i.e. the same hourly rate they receive for ordinary work. No historical averaging is required.

**Irregular-hours and part-year workers** have no fixed schedule. Their holiday pay must be calculated as the average weekly pay over the previous 52 _paid_ weeks. Where a week falls within that window but the worker received only statutory sick pay, statutory maternity/paternity/adoption pay, <i>or no pay at all</i>, that week is skipped and an earlier week is substituted in its place — your employer should also be looking back as far as needed, up to a maximum of 104 weeks, to find 52 weeks of ordinary pay. ([ACAS: Holiday pay for irregular hours and part-year workers](https://www.acas.org.uk/irregular-hours-and-part-year-workers/calculating-holiday-pay))

This is codified in the Employment Rights Act 1996 (as amended by the Employment Rights (Amendment, Revocation and Transitional Provision) Regulations 2023) and explained in ACAS guidance for irregular hours and part-year workers.

The tool targets this second category. The fixed-hours check (Signal A, described below) also covers fixed-hours workers as a fast-path.

---

## Known Shortcomings

### Preface — Useful but not a legal determination

Holiday pay law is complex, the statutory calculation requires week-by-week payroll data that most workers never see, and employers rarely volunteer the working. This tool exists to close that information gap: it gives workers a way to sense-check their holiday pay using only the payslips they already hold, and to arrive at a conversation with their employer — or ACAS — with a specific, evidenced question rather than a vague suspicion.

Used with that framing, the tool is genuinely useful. For the majority of straightforward cases — a worker on a steady hourly rate, no significant overtime, no gaps in payslips — the rolling reference average the tool computes closely approximates what a statutory calculation would produce, and a flag is a reliable indicator that something deserves a closer look.

**Where it falls short of the full legal picture:**

- **It works from monthly payslips, not weekly pay records.** The statutory calculation operates week by week. Monthly payslips give us a total hours and total pay figure for each month; we convert to a per-week equivalent using an approximation (calendar days ÷ 7). This is accurate to within 2–3% but cannot capture intra-month variation — a month where the worker was sick for two weeks and worked for two is treated as a single excluded unit rather than being split.

- **It does not include overtime, commission, or other regular payments.** ACAS is clear that holiday pay must reflect _all_ pay the worker regularly receives, including regular overtime and commission. This tool uses only basic hourly pay from `hourly.basic`. A worker whose monthly pay regularly includes significant overtime will have their reference average understated, and the tool may fail to flag genuine underpayment. This is the most legally significant gap.

- **It cannot verify the statutory entitlement in weeks.** The tool checks whether the implied _hourly rate_ on holiday pay matches the rolling average basic hourly rate. ACAS defines the entitlement as average _weekly pay_ (pay ÷ weeks, not pay ÷ hours). These are equivalent only when weekly hours are stable. For workers with highly variable hours but a consistent hourly rate, the two measures can diverge — the tool may produce false negatives or, less commonly, false positives in edge cases.

- **It relies on employer-reported data.** The payslips are taken at face value. If an employer has mislabelled payments, split pay across unusual periods, or issued catch-up payslips that cover multiple months, the reference average may be skewed in ways the tool cannot detect.

A flag from this tool means _this is worth investigating_, not _you were definitely underpaid_. The absence of a flag does not mean you were paid correctly — particularly if you regularly receive overtime or commission.

Workers who believe they have a genuine claim should obtain their employer's week-by-week pay records (employers are legally required to provide these on request under the Employment Rights Act 1996) and seek advice from ACAS or a Citizens Advice Bureau before taking formal action.

---

### 1. Monthly granularity — no week-by-week data

**What it means:** The statutory calculation operates on individual weeks, substituting excluded weeks with earlier ones. ([ACAS: Weeks when someone is off or did not get paid](https://www.acas.org.uk/irregular-hours-and-part-year-workers/calculating-holiday-pay)) This implementation operates on complete calendar months because payslips are issued monthly. A month where the worker was sick for two weeks but worked the other two is excluded _in its entirety_ (Rules 1 and/or 2 of `isReferenceEligible`), even though two of those weeks were ordinary working weeks. The tool cannot split a monthly payslip into individual weeks.

**Effect:** The reference pool may be slightly smaller than the statutory ideal, and the tool uses exclusion rather than substitution. The tool is conservative — it excludes more months than strictly necessary, which means the rolling average may be based on fewer periods, but each period included represents unambiguously ordinary pay.

**Mitigation:** The minimum threshold of 3 eligible periods prevents a flag from firing when the reference pool is too thin to be meaningful. The `limitedData` flag in the label makes clear when fewer than 52 weeks of data were found.

---

### 2. `getWeeksInPeriod` approximation

**What it means:** Calendar months are not exact multiples of weeks. The approximation `daysInMonth / 7` introduces a small systematic bias. Longer months contribute ~4.43 weeks while shorter months contribute ~4.00 weeks, even if the worker's pay cycle was uniform.

**Effect:** The approximation is accurate to within approximately 2–3% across all months. The bias is directionally consistent: longer months (which coincide with months of higher total hours for workers on regular schedules) contribute slightly more weeks to the denominator, marginally deflating `avgWeeklyPay`. This means borderline underpayments may occasionally go unflagged rather than triggering a false positive — the safer failure mode for a tool advising workers.

**Mitigation:** None currently planned. Weekly payslip data would eliminate this but is not available in the input format.

---

### 3. Regular overtime and commission not included

**What it means:** ACAS is explicit that holiday pay must include payments linked to tasks required in the contract (e.g. commission), payments related to professional or personal status, and other payments the worker has regularly received — including overtime. ([ACAS: What holiday pay must include](https://www.acas.org.uk/irregular-hours-and-part-year-workers/calculating-holiday-pay)) For irregular hours workers, these payments must be included in the full 5.6 weeks' statutory leave entitlement. This implementation uses only `hourly.basic.amount` in `totalBasicPay`. Regular `misc` payments (overtime, commission) are not accumulated.

**Effect:** For workers who regularly receive overtime or commission, the rolling average rate is understated. The tool will fail to flag genuine underpayment — a false negative. This is the most legally significant gap in the current implementation.

**Mitigation:** The flag label includes `— request employer's weekly records to confirm`, which prompts workers to obtain the week-by-week records employers are legally required to provide. A worker who regularly receives overtime should compare their full average weekly pay (including all misc payments) against their holiday pay manually. This gap is not addressed in the current implementation and is documented here to ensure workers are aware of it.

---

### 4. Rate-basis approximation (per-hour vs. per-week)

**What it means:** The ACAS entitlement is defined as _average weekly pay_ (total pay ÷ total weeks). Comparing holiday pay to a per-hour rate (`totalBasicPay / totalBasicHours`) is equivalent only when weekly hours are stable across the reference period. For a worker whose hours vary significantly week to week but whose hourly rate is constant, the two measures diverge:

- **Scenario A — paid correct weekly amount but fewer hours:** The per-hour check passes (rate looks correct), but the worker received less total pay than the ACAS weekly-pay entitlement requires — a **false negative**.
- **Scenario B — paid correct per-hour rate but more hours than average:** The per-hour check would fire, but the worker is not actually underpaid by the ACAS definition. The `!holidayMatchesBasic` guard suppresses this where the rate matches the current payslip rate, reducing **false positives**.

**Effect:** Scenario A produces false negatives; Scenario B is partially mitigated. Both are accepted approximations given that weekly hours data is unavailable.

For zero-hours workers, this divergence can be material. If a worker's average working week is 25 hours but a given payslip shows only 8 holiday hours, the per-hour check assesses whether those 8 hours were paid at the correct hourly rate. The statutory per-week method would instead ask whether the employer paid at least a full week's average earnings for that week of leave — i.e. approximately 25h worth of pay, not 8h worth. The gap between the two methods grows as the holiday units on the payslip diverge from the worker's typical weekly hours. Zero-hours workers who routinely take short bursts of holiday rather than full-week absences should treat the rate check as a lower bound and verify against their employer's weekly earnings figure.

**Mitigation:** This is an accepted approximation. The tool's purpose is to help workers identify _potential_ underpayment and ask questions — not to make a legal determination. Week-by-week hours data would be required to resolve this, and it is not present in monthly payslips.

---

### 5. Misc payment title matching is best-effort

**What it means:** Detecting statutory pay relies on substring matching against known abbreviation strings (`'ssp'`, `'smp'`, etc.) in `misc[*].title`. An employer using non-standard labels (e.g. `"Absence Support Payment"`, `"Leave Supplement"`) will not be detected, and those months will incorrectly remain in the reference pool.

**Effect:** Months that should be excluded are included, inflating the denominator and potentially deflating the average rate — a conservative failure (understatement of the reference rate reduces the chance of a false positive).

**Mitigation:** The title list uses multi-word anchors (`'statutory sick'`, `'statutory adoption'`) alongside common abbreviations to reduce both false positives and false negatives. Extending the list requires updating `SKIP_PAY_TITLES` in `holiday_calculations.js`.

---

### 6. Same-month duplicate payslips

**What it means:** Where a worker has two payslips sharing the same fiscal `monthIndex` (e.g. a corrected or split payslip), the deduplication key `calendarYear:fiscalMonthIndex` ensures only one month's worth of weeks is counted in `totalWeeks`. The year component is the calendar year from `entryDate.getFullYear()` (not the tax year string); the month component is the fiscal month index (April=1 … March=12) from `entry.monthIndex`. Only the first payslip encountered (the one with the more recent date, since the loop is backwards) is included; subsequent payslips for the same month are skipped.

**Effect:** The hours and pay from the first payslip are included; the second is discarded. If the two payslips represent genuinely different pay (e.g. a correction that split one month's pay into two amounts), the reference average will undercount basic pay for that month.

**Mitigation:** Duplicate payslips for the same month almost always represent data quality issues (the worker uploaded both the original and the corrected version). Discarding the older of the two is the safer default.

---

### 7. Double-payment / catch-up payslips

**What it means:** A payslip that covers two months of work (e.g. a late payment, or a catch-up after a pay dispute) will contribute only one month's `weeksInPeriod` (~4.3 weeks) to the denominator while its `basicUnits` represents approximately 8.6 weeks of actual work. This inflates `avgWeeklyHours` and `avgRatePerHour`.

**Effect:** The tool has no way to detect from payslip data alone that a period covers an unusual span. Workers with known catch-up payments should treat rate estimates cautiously.

**Mitigation:** None. The tool cannot distinguish a normal monthly payslip from a catch-up payslip without additional metadata.

---

### 8. Rolled-up holiday pay not detected

**What it means:** From leave years starting on or after 1 April 2024, employers of irregular hours and part-year workers may legally use rolled-up holiday pay — adding a percentage uplift to the worker's hourly rate rather than paying holiday separately when it is taken. ([ACAS: Rolled-up holiday pay](https://www.acas.org.uk/irregular-hours-and-part-year-workers/rolled-up-holiday-pay)) A payslip with rolled-up pay will not show a separate holiday pay line, so the tool will not identify any holiday payment to check.

**Effect:** The tool produces no output for workers whose employer uses rolled-up pay. It will not flag underpayment and will not indicate that rolled-up pay is being used. Workers on rolled-up arrangements who wish to verify the uplift percentage must inspect their payslip annotations or contract terms directly.

**Mitigation:** None currently planned. Detecting rolled-up pay would require pattern-matching on payslip annotations or rate-level data not currently captured.

---

### 9. `typicalDays` assumption in context display

**What it means:** `buildYearHolidayContext` uses `workerProfile.typicalDays` (defaulting to 0 — variable/zero-hours pattern) to convert `avgWeeklyHours` into `avgHoursPerDay`. The "estimated N days holiday" annotation in the report relies on this figure. When `typicalDays` is 0, days-based estimates are suppressed and the report shows hours-based entitlement instead.

**Effect:** Workers on fixed-hours contracts must actively set their `typicalDays` value in the worker profile to see accurate day estimates. The zero-hours baseline ensures that workers with irregular patterns are not given misleading day counts by default.

**Mitigation:** The `typicalDays` value used is surfaced in the rendered output so the worker can identify and correct a wrong assumption. When `typicalDays` is 0, the UI disables the statutory entitlement field and displays "N/A (accrual-based)" instead of a fixed day count.

---

### 10. Zero-hours / highly variable patterns

**What it means:** Workers with highly variable shift patterns (zero-hours contracts, irregular-hours workers) may not have a meaningful "typical days per week" value. For these workers, `typicalDays` can be set to `0` in the worker profile.

**Effect:** When `typicalDays = 0`, days-taken estimates are suppressed — converting hours to days requires a shift-length assumption the tool does not have. Rate checks (Signals A and B) continue to operate normally.

**Mitigation:** The tool computes an hours-based entitlement instead. The **projected annual entitlement** uses the same formula for all leave years:

- **Annual projection (all leave years):** `entitlementHours = avgWeeklyHours × 5.6`

The label displayed to the worker differs based on when their leave year starts:

- **Leave years starting before 1 April 2024:** "5.6 week avg. method"
- **Leave years starting on or after 1 April 2024:** "12.07% accrual method"

This reflects the statutory framework for irregular-hours workers. The 5.6 weeks method derives from _Harpur Trust v Brazel_ [2022] UKSC 21, which defines entitlement as 5.6 weeks of average weekly hours. From April 2024, the Employment Rights (Amendment, Revocation and Transitional Provision) Regulations 2023 introduced the 12.07% accrual method for irregular-hours and part-year workers.

**Why both methods project the same annual total:** The 12.07% rate is derived as `5.6 ÷ 46.4`, where 46.4 = 52 working weeks − 5.6 weeks of statutory leave. Applied per-period to basic hours worked and summed over a full year, it yields `avgWeeklyHours × 5.6`. The difference between the two methods is the **accrual mechanism** (up-front grant vs. per-period accumulation), not the annual entitlement total. Both methods require no `typicalDays` value. The report displays the total holiday hours taken, the estimated annual entitlement in hours (derived from the rolling 52-week average), the calculation method label, and the hours remaining. For post-2024 leave years, monthly reports additionally show the per-period accrued hours (`+X hrs accrued`) to make the 12.07% mechanism visible. The statutory holiday entitlement field in the UI is disabled (days-based entitlement is not applicable for these workers).

**Enhanced contractual entitlement:** Because `statutoryHolidayDays` is disabled when `typicalDays = 0`, the calculation is anchored to the statutory minimum. Workers whose contract grants more than the statutory minimum (e.g. 30 days on a 5-day week = 6.0 weeks) will see the statutory floor only — the additional entitlement is not reflected in the hours-remaining figure. For a worker on a regular pattern who happens to set `typicalDays = 0`, this means the result is accurate for the 28-day statutory case (the pre-2024 method `avgWeeklyHours × 5.6` is algebraically equivalent to `28 days × avgHoursPerDay` when typical days = 5) but will understate remaining entitlement if enhanced contractual days apply. Workers with enhanced entitlement should use `typicalDays > 0` and set `statutoryHolidayDays` to their actual contractual figure.

---

### 11. Holiday-only payslip with insufficient prior history — no basis for comparison

**What it means:** Signal A requires a basic hourly rate derivable from the **same payslip** (`hourly.basic.units > 0` and `hourly.basic.amount > 0`). Signal B requires at least 3 prior eligible months. A payslip that records only holiday pay and zero basic hours satisfies neither condition: `basicRate` cannot be inferred from the payslip itself, and if fewer than 3 prior payslips with basic hours exist, Signal B is also unavailable.

**Effect:** The tool produces no flag and no warning for that month. This affects two real-world situations:

- **Workers in their first 1–2 months of employment** who take holiday before a reference pool of 3 months has accumulated. Signal B is always unavailable; Signal A is only available if the holiday month also contains basic hours.
- **Any month where the worker took all hours as holiday** (zero basic hours on the payslip). Neither signal has a reference rate.

The system has no data against which to assess the implied holiday rate. This is an unavoidable consequence of the tool operating solely from payslip data — without a same-payslip basic rate or a rolling reference, there is nothing to compare the holiday rate against.

**Mitigation:** None within the tool. Workers in this situation should compare the rate implied by `holidayAmount ÷ holidayUnits` on the affected payslip against the hourly rate stated in their employment contract or offer letter. Once 3 prior months of payslips with basic hours exist, Signal B becomes available and will flag any underpayment from that point forward.

---

## Data Requirements

The tool works from payslips the worker already holds — no additional data entry of weekly hours is required. The minimum useful dataset is **3 months** of payslips. Accuracy improves with more data; the rolling window becomes fully representative with **12 or more months** of continuous payslips — though workers with several excluded months (e.g. extended sick leave) may need more than 12 calendar months to accumulate 52 eligible weeks. ([ACAS: If someone has not been employed for 52 weeks](https://www.acas.org.uk/irregular-hours-and-part-year-workers/calculating-holiday-pay))

Workers in their **first year of employment** are handled correctly: the tool sets `limitedData: true` and continues to flag where 3 or more eligible months exist, using only the weeks accumulated so far — consistent with ACAS guidance that employers should use however many full weeks the worker has been employed for.

Entries without a parseable `parsedDate` are excluded from all calculations. Entries without `hourly.basic` data (e.g. salaried workers, or hourly workers whose payslip format was not fully parsed) produce no Signal B output but may still trigger Signal A if explicit rate data is present.

## Two-Signal Architecture

The tool raises two distinct types of holiday pay flag, operating at different levels of evidence:

### Signal A — Same-payslip rate check

Compares the implied holiday hourly rate against the basic hourly rate on the **same payslip**. No historical data is required.

- Fires when: `basicRate − impliedHolidayRate > HOLIDAY_RATE_TOLERANCE`
- Suppressed when Signal B also fires for the same entry (Signal B is more informative and covers the same root cause)

This catches the simplest and most common form of underpayment: a payslip where the employer has simply applied a lower rate to holiday hours than to regular hours. Applicable to both fixed-hours and irregular-hours workers. ([ACAS: Fixed hours](https://www.acas.org.uk/checking-holiday-entitlement/calculating-holiday-pay))

### Signal B — 52-week rolling average check

Compares the implied holiday rate against the worker's average basic rate over the prior 52 weeks. Crosses tax-year boundaries. Accounts for pay rises by using recent pay history rather than a fixed annual average. Aligned with the statutory 52-week reference period for irregular hours and part-year workers. ([ACAS: Holiday pay for irregular hours and part-year workers](https://www.acas.org.uk/irregular-hours-and-part-year-workers/calculating-holiday-pay))

- Fires when: `rollingAvgRate − impliedHolidayRate > HOLIDAY_RATE_TOLERANCE`
- Only fires when there are at least 3 eligible prior periods (minimum data threshold)
- Uses a `limitedData` flag when fewer than 52 weeks of history exist (e.g. workers in their first year of employment)

---

## Calculation Pipeline

### Step 1 — Sort entries by date

Both `buildHolidayPayFlags` and `buildYearHolidayContext` begin by sorting the full entry array ascending by `parsedDate`. This sorted array is passed to `buildRollingReference` so it can walk backwards efficiently.

```text
sortedEntries = entries.sort(ascending by parsedDate)
```

Entries with a `null` `parsedDate` sort to position zero and are skipped during the backwards walk.

---

### Step 2 — Identify reference-eligible periods (`isReferenceEligible`)

For each candidate prior-period entry, three eligibility rules are checked:

#### Rule 1 — Basic hours must be present

```text
hourly.basic.units > 0
```

A month with zero basic hours (e.g. a month entirely on sick leave, or a zero-hours month) contributes nothing to the reference average and is excluded.

#### Rule 2 — No statutory pay in the misc payments

```text
misc[*].title does not contain any of:
  'statutory sick', 'ssp', 'maternity', 'smp',
  'paternity', 'spp', 'shpp', 'statutory adoption', 'adoption pay'
```

Matching is case-insensitive substring. A month flagged as containing any statutory pay is excluded in line with the intent of ACAS guidance (which specifies week-level substitution; this tool approximates at month level), even if the worker also received some basic pay that month.

#### Rule 3 — Mixed holiday months are gated, not blanket-excluded

```text
(hourly.holiday.units ?? 0) <= 0  AND  (hourly.holiday.amount ?? 0) <= 0
```

Pure-work months still form the base reference pool. A month that contains both basic work and holiday pay is treated as a **mixed-month candidate** instead of being excluded automatically.

It is included only when all of the following are true:

```text
hourly.basic.units > 0
no statutory-pay misc titles are present
holiday units or amount are present
prior pure-work reference exists
prior pure-work reference has at least 12 weeks of data
actual basic hours / expected basic hours >= 0.75
```

Where:

```text
expected basic hours = (priorPureRef.totalBasicHours / priorPureRef.totalWeeks) × getWeeksInPeriod(mixedMonthDate)
```

This allows mostly-working months to remain in the rolling average while still excluding months that are dominated by holiday. Only `hourly.basic.amount` and `hourly.basic.units` are added to the reference totals — holiday pay itself is never added into the rolling average.

---

### Step 3 — Build the rolling reference (`buildRollingReference`)

For a given target entry (the payslip being checked for correct holiday pay):

#### Define the look-back window

```text
cutoffMs = targetDate − 104 weeks (in milliseconds)
```

The window is a maximum of 104 calendar weeks (approximately 2 years) before the target payslip date.

#### Walk backwards through sorted entries

The loop runs from the most-recent entry backwards:

```text
for i = length−1 down to 0:
    skip: entry is the target itself
    skip: parsedDate is null
    skip: parsedDate >= targetDate  (same date or future)
    break: parsedDate < cutoffMs    (beyond 104-week window)
    skip: not isReferenceEligible and not gate-passing mixed month
    skip: calendarYear:fiscalMonthIndex already seen (duplicate payslip deduplication)

    accumulate:
        weeks        += getWeeksInPeriod(entryDate)
        totalBasicPay  += hourly.basic.amount
        totalBasicHours += hourly.basic.units
        periodsCounted  += 1

    break if totalWeeks >= 52
```

#### Deduplication of same-month payslips

The deduplication key is `calendarYear:monthIndex`. Where a worker has two payslips for the same fiscal month (e.g. a corrected payslip), only the first one encountered (the more recent, since the loop is backwards) contributes. This prevents the weeks denominator from being inflated by duplicate data.

#### `getWeeksInPeriod(date)`

Since payslips are monthly, weeks per period are approximated from the calendar month:

```js
daysInMonth = new Date(year, month + 1, 0).getDate()
weeks = daysInMonth / 7
```

Examples:

| Month               | Days | Weeks |
| ------------------- | ---- | ----- |
| January             | 31   | 4.429 |
| February (non-leap) | 28   | 4.000 |
| February (leap)     | 29   | 4.143 |
| April               | 30   | 4.286 |
| July                | 31   | 4.429 |

#### Result structure

```text
{
  totalBasicPay:    number,   // £ total of basic pay across eligible periods
  totalBasicHours:  number,   // hours total of basic hours across eligible periods
  totalWeeks:       number,   // sum of weeksInPeriod for each eligible month
  periodsCounted:   number,   // number of distinct eligible months counted
  limitedData:      boolean,  // true when totalWeeks < 52 (worker tenure short)
  mixedMonthsIncluded: number,
  confidence: {
    level: 'high' | 'medium' | 'low',
    reasons: string[]
  }
}
```

Returns `null` if `periodsCounted < 3` (insufficient data — no flag raised).

`confidence.level` is interpreted as follows:

- `high`: 52+ weeks of pure-work reference
- `medium`: either limited history or one or more mixed work+holiday months included
- `low`: both limited history and one or more mixed work+holiday months included

---

### Step 4 — Derive rates and fire flags

#### Implied holiday rate

The rate the employer effectively paid for holiday hours:

```text
impliedHolidayRate = holidayAmount / holidayUnits
```

#### Rolling average rate

The rate the worker should have received, per the reference window:

```text
rollingAvgRate = totalBasicPay / totalBasicHours
```

This is arithmetically equivalent to `avgWeeklyPay / avgWeeklyHours` — it expresses the ACAS weekly-pay entitlement on a per-hour basis.

#### Tolerance

A tolerance of `£0.05/hr` is applied to absorb floating-point rounding and minor pay period edge effects:

```text
HOLIDAY_RATE_TOLERANCE = 0.05
```

#### Signal A condition

```text
basicRate − impliedHolidayRate > 0.05
AND Signal B will not fire
```

Where `basicRate` is taken from `hourly.basic.rate` if present, otherwise derived as `basicAmount / basicUnits`.

#### Signal B condition

```text
rollingAvgRate − impliedHolidayRate > 0.05
AND impliedHolidayRate does not match same-payslip basicRate within tolerance
AND ref is not null
```

The second condition (`!holidayMatchesBasic`) prevents Signal B from firing purely because a historical pay rise inflated the rolling average — if the worker is being paid the same rate as their current payslip basic rate, no flag is raised. This applies to both fixed-hours and irregular-hours workers: for a fixed-hours worker the current basic rate _is_ the correct holiday rate; for an irregular-hours worker who received a recent pay rise, paying the new rate is also acceptable.

---

### Step 5 — Compute holiday context (`buildYearHolidayContext`)

For each entry (including non-holiday entries), `buildRollingReference` is called and the result stored as `entry.holidayContext`. This is consumed by the report renderer to display an estimated days-of-holiday annotation.

```text
avgWeeklyHours = totalBasicHours / totalWeeks
avgHoursPerDay = avgWeeklyHours / typicalDays
avgRatePerHour = totalBasicPay / totalBasicHours

holidayContext = {
  hasBaseline: true,
  avgWeeklyHours,
  avgHoursPerDay,
  avgRatePerHour,
  typicalDays,
  mixedMonthsIncluded,
  confidence,
  entitlementHours: (if typicalDays = 0),
  useAccrualMethod: (if typicalDays = 0)
}
```

`typicalDays` defaults to 0 when not supplied by the caller via `workerProfile`, reflecting the zero-hours baseline. Entries without at least 3 eligible prior months receive `{ hasBaseline: false }`. When `mixedMonthsIncluded > 0`, the same context also carries a structured confidence object and the entry is marked low-confidence in the validation layer so the UI can signal that the estimate rests partly on mixed work+holiday months.

**Zero-hours handling:** When `typicalDays = 0` (irregular-hours workers), `avgHoursPerDay` is set to `0` (days conversion is not possible without a shift-length assumption). The context additionally computes `entitlementHours` and sets the `useAccrualMethod` flag:

- **Annual projection (all leave years):** `entitlementHours = avgWeeklyHours × 5.6`
- **Leave years starting before 1 April 2024:** `useAccrualMethod = false` (displays "5.6 week avg. method")
- **Leave years starting on or after 1 April 2024:** `useAccrualMethod = true` (displays "12.07% accrual method")

The leave year start date is determined by the `leaveYearStartMonth` field in the worker profile (default: April). The tool computes which leave year the entry falls into, then compares that leave year's start date to the April 2024 cutoff. The `useAccrualMethod` flag controls only the label shown to the worker — the annual projection formula is identical for both methods because 12.07% per-period accrual over a full year mathematically yields `avgWeeklyHours × 5.6`. Both `avgWeeklyHours` and `avgRatePerHour` are preserved for rate validation and entitlement display.

---

## Salaried Workers

The holiday pay rate checks (Signals A and B) operate entirely on hourly payment data (`hourly.basic`, `hourly.holiday`). Salaried payslips parse to `salary.basic` and `salary.holiday` — which carry no hourly rate — so **no underpayment rate check is performed for salaried workers**.

Days taken and days remaining _are_ estimated for salaried workers using the following approach:

```text
workingDaysPerMonth = (typicalDays × 52) / 12
dailyRate           = yearBasicSalaryAmount / monthsInYear / workingDaysPerMonth
daysTaken           = yearHolidaySalaryAmount / dailyRate
daysRemaining       = statutoryHolidayDays - daysTaken
```

Using `typicalDays × 52 / 12` converts a weekly days figure into the correct monthly working-day equivalent (e.g. 5 days/week → 21.67 working days/month). Dividing by `typicalDays` directly would produce a figure ~4.33× too high.

This requires `salary.basic.amount > 0` and `workingDaysPerMonth > 0`. If either is unavailable the day estimate is omitted and only the £ holiday amount is shown.

Note: Sage UK payslips print `Holiday Salary` as a flat amount only — `salary.holiday.units` is typically `null`. Days cannot be derived from hours for salaried workers; the amount-divided-by-daily-rate approximation is used instead.

**Known limitation:** This estimate assumes the worker's salary was constant throughout the year. A year containing a pay rise will skew `dailyRate` and produce a slightly inaccurate day count.

---

## Worker Profile Fields

The worker profile panel provides optional context that improves report accuracy:

| Field                         | Type                      | Default                          | Effect                                                                                                           |
| ----------------------------- | ------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Worker type                   | Radio (hourly / salaried) | hourly                           | Controls which fields are shown; used for mismatch detection                                                     |
| Statutory holiday entitlement | days/year                 | null (N/A — accrual-based)       | Used to compute days remaining in Annual Totals; null when `typicalDays = 0`; must be set by fixed-hours workers |
| Typical days per week         | number                    | 0 (hourly: 0–7, salaried: 0.5–7) | Used as divisor for `avgHoursPerDay` and salaried `dailyRate`; 0 = zero-hours/irregular-hours baseline           |
| Holiday year start month      | 1–12                      | 4 (April)                        | Controls which holiday hours are grouped together for the days estimate                                          |

None of the above fields affect the underlying payslip parsing or the 52-week rolling reference calculation. The calculation engine is payslip-data-driven.

**Zero-hours baseline:** The default profile assumes a zero-hours/irregular-hours worker (`typicalDays = 0`, `statutoryHolidayDays = null`). This is deliberate — zero-hours contracts are prevalent, and defaulting to a fixed 5-day/28-day assumption would silently produce incorrect entitlement figures for these workers. Standard-hours workers will see 0 days and N/A entitlement on first use, prompting them to enter their actual values. When `typicalDays = 0`:

- Days-taken estimates are suppressed (no shift-length assumption available)
- The statutory holiday entitlement field becomes disabled in the UI
- Rate checks (Signals A and B) continue to operate normally
- The report displays an hours-based entitlement using `avgWeeklyHours × 5.6` for the annual projection, with the label indicating the legislative framework:
    - **Pre-April 2024 leave years:** `≈X hrs/yr entitlement (Y avg hrs/wk × 5.6 wks)` labelled "5.6 week avg. method"
    - **April 2024+ leave years:** `≈X hrs/yr entitlement (Y avg hrs/wk × 5.6 wks)` labelled "12.07% accrual method"
    - For April 2024+ leave years, monthly reports additionally show `+Z hrs accrued` to make the 12.07% per-period mechanism visible
- Shows `Z hrs remaining` using the most recent entry's 52-week rolling context
- Falls back to `Days estimate not shown — variable work pattern` if no 52-week baseline exists (fewer than 3 eligible prior months)
- **Enhanced entitlement caveat:** the calculation is anchored to the statutory minimum; workers with enhanced contractual entitlement above this should set `typicalDays > 0` and enter their actual `statutoryHolidayDays` instead

### Leave year grouping

By default, the holiday hours total shown in each Annual Totals row is the sum of `hourly.holiday.units` for all payslips in that **tax year** (April – March). When `leaveYearStartMonth` is set to a different month, the tool instead sums holiday hours from the **leave year** group that the first entry of each tax year belongs to, and appends a **"Leave year: …"** note to the holiday cell.

The 52-week rolling reference average (`avgHoursPerDay`) is computed per entry across all entries regardless of year grouping — it is unaffected by `leaveYearStartMonth`.

### Baseline selection for the Annual Totals day estimate

When converting the year's total holiday hours to estimated days, the year summary scans the year's entries **backwards** and uses the `avgHoursPerDay` from the **last entry with a valid baseline** (`hasBaseline: true`, `avgHoursPerDay > 0`, `typicalDays > 0`). The last entry typically has the most complete rolling reference (more eligible prior periods), making it the most representative snapshot available.

This means a new starter whose first few months lack a baseline (fewer than 3 eligible prior periods) will still see a day estimate in the Annual Totals once enough payslips accumulate — even though those early entries individually could not produce a day estimate. If no entry in the year has a valid baseline, the summary falls back to hours-only display.

---

## Relationship to the Salaried Path

| Aspect                  | Hourly workers                   | Salaried workers                 |
| ----------------------- | -------------------------------- | -------------------------------- |
| Underpayment rate check | ✓ Signals A and B                | ✗ Not applicable                 |
| Days taken estimate     | From `avgHoursPerDay` baseline   | From `dailyRate` formula         |
| Data source             | `hourly.basic`, `hourly.holiday` | `salary.basic`, `salary.holiday` |
| Requires worker profile | No (defaults to hourly)          | Yes (must set type to Salaried)  |
| Per-month day estimate  | ✗ Annual only                    | ✗ Annual only                    |
| Statutory reference     | 52-week rolling average          | Daily rate from annual salary    |

---

## Contract-Type Mismatch Detection

When a worker profile is provided, the report checks for contradictions between the declared worker type and the parsed payslip data:

| Profile type | Signal                                         | Warning                                              |
| ------------ | ---------------------------------------------- | ---------------------------------------------------- |
| Hourly       | Any payslip has `salary.basic.amount !== null` | Banner above Annual Totals advising to split the run |
| Salaried     | Any payslip has `hourly.basic.units > 0`       | Banner above Annual Totals advising to split the run |

This typically indicates a contract change mid-dataset. The warning is advisory only — no calculations are suppressed. Workers who changed contract type part-way through should run separate reports for each contract period to get accurate holiday rate checks and day estimates for each period.

---

## Related Documentation

| Document                                   | Relationship                                                                                                                                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/TESTING.md`                         | Full test strategy — §"Hourly Worker Tests — Fixture Profiles" and §"Flag Suppression Behaviour" describe the fixture profiles and assertion patterns that exercise this methodology                                                         |
| `generate_fixtures/FIXTURE_BASELINES.md`   | Independent first-principles verification of expected flag behaviour for all four fixture profiles (good/bad × predictable/zero-hours), including per-month gross pay tables, rolling reference calculations, and NI/PAYE threshold analysis |
| `pwa/docs/salaried-holiday-calculation.md` | Counterpart document covering the salaried path — day estimation logic and the reasons rate checks are not performed for salaried workers                                                                                                    |

### Unit tests

| Test file                      | What it verifies                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/hol_pay_flags.test.mjs` | `buildHolidayPayFlags` — Signal A and B logic, tolerance, suppression, minimum-period threshold, tax-year boundary crossing; `buildRollingReference` and `isReferenceEligible` edge cases |
| `tests/hol_calc.test.mjs`      | Holiday calculation display utilities — average weekly pay, expected hours, expected pay amounts                                                                                          |

### Snapshot tests

| Test file                                      | Profile                      | Key assertions                                                                                                                       |
| ---------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/run_snapshot_good_predictable.test.mjs` | Good-place, consistent hours | No flags on any entry across all slice sizes; per-entry `flagIds` sweep on 14-month run                                              |
| `tests/run_snapshot_bad_predictable.test.mjs`  | Bad-place, consistent hours  | Signal A asserted specifically on 3-month slice (first holiday month, < 3 prior months); Signal A or B on later slices               |
| `tests/run_snapshot_good_zero_hours.test.mjs`  | Good-place, variable hours   | No holiday rate flags despite variable `basicHours`; positive `nat_ins_zero`/`paye_zero` assertions on five below-threshold months   |
| `tests/run_snapshot_bad_zero_hours.test.mjs`   | Bad-place, variable hours    | Signal A specifically on 3-month slice; Signal A or B on later slices; positive `nat_ins_zero`/`paye_zero` on below-threshold months |
