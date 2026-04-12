# Payroll Holiday Calculation System - Code Audit Report

**Date:** April 2, 2026
**Codebase:** Anonymous Payroll Reporter (`/Users/anachronistic/Documents/WebDev/payroll`)
**Audit Scope:** Holiday calculation implementations and edge case handling

---

## Executive Summary

The payroll system implements a two-signal holiday pay validation framework based on UK statutory law (ACAS guidance for irregular/hourly workers, Employment Rights Act 1996). The implementation is methodical, well-documented, and conservative in its approach. Key findings:

- **Strengths:** Clear separation of concerns, comprehensive documentation, edge case awareness, confidence tracking
- **Limitations:** Monthly granularity (not week-by-week), basic-pay only (excludes overtime/commission), zero-hours baseline assumptions, per-hour vs. per-week rate approximation
- **Test Coverage:** Extensive testing of edge cases (fewer than 3 months, mixed months, zero-hours workers, tax-year boundaries, duplicate payslips)

---

## 1. File Locations & Structure

### Core Implementation Files

| File                                                                             | Purpose                             | Key Functions                                                                                                                      |
| -------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [pwa/src/report/holiday_calculations.js](pwa/src/report/holiday_calculations.js) | Central holiday validation logic    | `buildHolidayPayFlags`, `buildRollingReference`, `buildYearHolidayContext`, `isReferenceEligible`, `buildAnnualHolidayCheckResult` |
| [pwa/src/report/tax_year_utils.js](pwa/src/report/tax_year_utils.js)             | Date/tax-year utilities and parsing | `parsePayPeriodStart`, `getWeeksInPeriod`, `getTaxYearKey`, `getLeaveYearKey`, `getFiscalMonthIndex`                               |
| [pwa/src/report/uk_thresholds.js](pwa/src/report/uk_thresholds.js)               | Statutory constants                 | `HOLIDAY_RATE_TOLERANCE` (0.05), `HOLIDAY_ACCRUAL_CUTOFF` (1 Apr 2024)                                                             |
| [pwa/src/report/year_holiday_summary.js](pwa/src/report/year_holiday_summary.js) | Salaried holiday day estimation     | `buildYearHolidaySummary`, `buildLeaveYearGroups`                                                                                  |
| [pwa/src/report/report_calculations.js](pwa/src/report/report_calculations.js)   | Report entry construction           | `buildReportEntries` (calls `parsePayPeriodStart`)                                                                                 |
| [pwa/src/report/build.js](pwa/src/report/build.js)                               | Report assembly orchestration       | `buildReport` (wires up holiday flags and context)                                                                                 |

### Documentation Files

| File                                                                                     | Content                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [pwa/docs/hourly-holiday-pay-calculation.md](pwa/docs/hourly-holiday-pay-calculation.md) | **Primary reference:** Statutory basis, calculation pipeline, known shortcomings (1–10), Signal A/B architecture, all function signatures |
| [pwa/docs/salaried-holiday-calculation.md](pwa/docs/salaried-holiday-calculation.md)     | Salaried worker day estimation and remaining-days logic                                                                                   |
| [pwa/docs/auditor-verification-guide.md](pwa/docs/auditor-verification-guide.md)         | Compliance and verification checklist                                                                                                     |

### Test Files

| File                                                                   | Focus                                                                                                                                                           |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [tests/hol_pay_flags.test.mjs](tests/hol_pay_flags.test.mjs)           | **Primary test suite:** Signal A/B logic, rolling reference edge cases, mixed-month gating, confidence levels, zero-hours handling, insufficient data scenarios |
| [tests/report_calculation.test.mjs](tests/report_calculation.test.mjs) | Date parsing, worker profile defaults, tax-year/leave-year boundaries                                                                                           |
| [tests/tax_year_utils.test.mjs](tests/tax_year_utils.test.mjs)         | `getWeeksInPeriod` (calendar month calculations), tax/leave year key generation                                                                                 |
| [tests/report_view_model.test.mjs](tests/report_view_model.test.mjs)   | `holidayContext` propagation with mixed months, low-confidence marking                                                                                          |
| [tests/run*snapshot*\*.test.mjs](tests/)                               | Snapshot-based integration tests (4 fixture profiles: good/bad × predictable/zero-hours)                                                                        |

---

## 2. Function Signatures & Key Logic

### 2.1 `parsePayPeriodStart(payPeriod: string | null): Date | null`

**Location:** [pwa/src/report/tax_year_utils.js](pwa/src/report/tax_year_utils.js#L182)

**Purpose:** Extract the start date from a pay-period string (e.g., "01/06/24 - 30/06/24" → Date(2024, 5, 1))

**Supported Formats:**

- `DD/MM/YY`, `DD-MM-YY` (numeric dates, 2-digit year expanded to 20xx)
- `DD MonthName YYYY` (long format with month name)
- `MonthName YYYY` (month-year only, defaults to day 1)

**Behavior:**

- Returns `null` if input is falsy or unparseable
- Handles month names case-insensitively
- 2-digit years < 100 are auto-incremented with 2000
- Validates calendar validity (e.g., rejects 31 Feb)

**Key Implementation Detail:**

```js
const startSegment = payPeriod.split('-')[0].trim() // Extract before hyphen
return parseDateValue(startSegment) // Parse the segment
```

### 2.2 `getWeeksInPeriod(date: Date): number`

**Location:** [pwa/src/report/tax_year_utils.js](pwa/src/report/tax_year_utils.js#L300)

**Purpose:** Approximate the number of calendar weeks in the month containing the given date

**Formula:**

```js
daysInMonth = new Date(year, month + 1, 0).getDate()
weeks = daysInMonth / 7
```

**Examples:**
| Month | Days | Weeks |
|-------|------|-------|
| January | 31 | 4.429 |
| February (leap) | 29 | 4.143 |
| February (non-leap) | 28 | 4.000 |
| April | 30 | 4.286 |
| July | 31 | 4.429 |

**Known Limitation:** Introduces 2–3% systematic bias (conservative for underpayment detection, safer failure mode)

### 2.3 `isReferenceEligible(entry: HolidayEntry): boolean`

**Location:** [pwa/src/report/holiday_calculations.js](pwa/src/report/holiday_calculations.js#L242)

**Purpose:** Determine if a payslip month should be included in the 52-week rolling reference average

**Three Eligibility Rules (all must pass):**

1. **Basic hours present:**
   `entry.record?.payrollDoc?.payments?.hourly?.basic?.units > 0`

2. **No statutory pay:**
   `misc.title` does NOT contain any of: `'statutory sick'`, `'ssp'`, `'maternity'`, `'smp'`, `'paternity'`, `'spp'`, `'shpp'`, `'statutory adoption'`, `'adoption pay'` (case-insensitive substring matching)

3. **No holiday payment (pure work month):**
   `(entry.record?.payrollDoc?.payments?.hourly?.holiday?.units ?? 0) <= 0 AND (entry.record?.payrollDoc?.payments?.hourly?.holiday?.amount ?? 0) <= 0`

**Returns:** `true` only if ALL three pass; `false` otherwise

**Special Case:** Months with BOTH basic work and holiday payment are **not** automatically excluded; they are processed by the mixed-month gate (see `buildRollingReference`)

### 2.4 `buildRollingReference(sortedEntries, targetEntry, options): RollingReference | null`

**Location:** [pwa/src/report/holiday_calculations.js](pwa/src/report/holiday_calculations.js#L250)

**Purpose:** Build a 52-week rolling average of basic pay/hours for a target payslip's holiday rate check

**Parameters:**

- `sortedEntries`: All entries sorted ascending by `parsedDate`
- `targetEntry`: The payslip being evaluated (containing holiday pay)
- `options.pureOnly`: If true, exclude mixed-month contribution (used internally)
- `options.mixedGateCache`: WeakMap for memo-ization of mixed-month gate evaluations

**Algorithm:**

1. **Extract cutoff:** `targetDate - 104 weeks` (max lookback window)
2. **Initialize accumulators:** `totalBasicPay = 0`, `totalBasicHours = 0`, `totalWeeks = 0`
3. **Walk backwards** from most recent to oldest entry:
    - Skip the target entry itself
    - Skip entries with `null` `parsedDate`
    - Skip entries with `parsedDate >= targetDate`
    - Break if `parsedDate < cutoffMs` (beyond 104 weeks)
    - Check eligibility: `isReferenceEligible(entry)` OR (if mixed-month gate passes) `isGatePassingMixedMonth(sortedEntries, entry, mixedGateCache)`
    - Skip if already seen this calendar month (deduplication key: `yearKey:monthIndex`)
    - Accumulate: `weeks += getWeeksInPeriod(entryDate)`, `totalBasicPay += basic.amount`, `totalBasicHours += basic.units`, `periodsCounted += 1`
    - Break if `totalWeeks >= 52` (target reached)

4. **Return condition:**
    - If `periodsCounted < 3`: return `null` (insufficient data)
    - Else: return object with `{ totalBasicPay, totalBasicHours, totalWeeks, periodsCounted, limitedData: totalWeeks < 52, mixedMonthsIncluded, confidence }`

**Return Type: `RollingReference | null`**

```ts
{
  totalBasicPay: number,          // Sum of hourly.basic.amount
  totalBasicHours: number,         // Sum of hourly.basic.units
  totalWeeks: number,              // Sum of getWeeksInPeriod per month
  periodsCounted: number,          // Number of months included (for dedup)
  limitedData: boolean,            // true if totalWeeks < 52
  mixedMonthsIncluded: number,     // Count of months that passed the mixed-month gate
  confidence: {                    // Structured confidence level and reasons
    level: 'high' | 'medium' | 'low',
    reasons: string[]
  }
}
```

**Confidence Levels:**

- `'high'`: 52+ weeks, no mixed months
- `'medium'`: Either `limitedData` OR `mixedMonthsIncluded > 0` (but not both)
- `'low'`: Both `limitedData` AND `mixedMonthsIncluded > 0`

**Mixed-Month Gate Logic:**
A month with both basic and holiday pay is included if ALL of:

- A prior pure-work reference exists (`ref !== null`)
- Prior reference has ≥12 weeks of data
- `actualHours / expectedHours >= 0.75` (worker worked ≥75% of typical hours)
- Where `expectedHours = (ref.totalBasicHours / ref.totalWeeks) × getWeeksInPeriod(mixedMonthDate)`

**Non-Circular Dependency:** Mixed months are included in THIS entry's evaluation but are NEVER added back into the rolling reference pool for evaluating OTHER months (pure-only recursion via `pureOnly: true` option).

### 2.5 `buildHolidayPayFlags(entries: HolidayEntry[]): void`

**Location:** [pwa/src/report/holiday_calculations.js](pwa/src/report/holiday_calculations.js#L521)

**Purpose:** Append Signal A and Signal B flags to each entry's `validation.flags` array

**Algorithm:**

1. Sort entries ascending by `parsedDate`
2. Initialize mixed-month gate cache (WeakMap)
3. For each entry with `holidayUnits > 0 AND holidayAmount > 0`:
    - Calculate `impliedHolidayRate = holidayAmount / holidayUnits`
    - Extract or derive `basicRate` from `basic.rate` or `basic.amount / basic.units`
    - Build rolling reference: `ref = buildRollingReference(sortedEntries, entry, { mixedGateCache })`
    - Apply mixed-month low-confidence marker if needed

4. **Signal A (same-payslip rate check):**
    - Fires when: `basicRate !== null AND basicRate - impliedHolidayRate > HOLIDAY_RATE_TOLERANCE (0.05)`
    - **Suppressed** if Signal B will also fire for the same entry (to avoid duplicate warnings)
    - Applicable to both fixed-hours and irregular-hours workers

5. **Signal B (52-week rolling average check):**
    - Fires when: `ref !== null AND basicRate - impliedHolidayRate <= HOLIDAY_RATE_TOLERANCE AND rollingAvgRate - impliedHolidayRate > HOLIDAY_RATE_TOLERANCE`
    - `rollingAvgRate = ref.totalBasicPay / ref.totalBasicHours` (only if `ref.totalBasicHours > 0`)
    - Includes metadata: `totalWeeks`, `periodsCounted`, `limitedData`, `mixedMonthsIncluded` in flag inputs

6. **Mark low-confidence:**
    - If entry has holiday payment AND `ref.mixedMonthsIncluded > 0`, set `entry.validation.lowConfidence = true`

**Flag Structure:**

```ts
{
  id: 'holiday_rate_below_basic' | 'holiday_rate_below_rolling_avg',
  label: string,  // Human-readable formatted label (from flag_catalog.js)
  ruleId: string,
  inputs: {
    impliedHolidayRate: number,
    basicRate?: number,          // Signal A only
    rollingAvgRate?: number,     // Signal B only
    totalWeeks?: number,
    periodsCounted?: number,
    mixedMonthsIncluded?: number
  }
}
```

### 2.6 `buildYearHolidayContext(entries: HolidayEntry[], workerProfile): void`

**Location:** [pwa/src/report/holiday_calculations.js](pwa/src/report/holiday_calculations.js#L353)

**Purpose:** Attach rolling-reference context to each entry for display and downstream calculations

**Parameters:**

- `entries`: All HolidayEntry objects (unsorted; function sorts internally)
- `workerProfile`: `{ typicalDays?, statutoryHolidayDays?, leaveYearStartMonth? } | null`

**Key Logic:**

1. **Extract worker profile fields:**
    - `typicalDays` (default 0 = zero-hours/irregular)
    - `leaveYearStartMonth` (default 4 = April)

2. **Sort entries ascending by `parsedDate`**

3. **For each entry:**
    - Call `buildRollingReference(sortedEntries, entry)` to get rolling avg
    - If reference is `null`:
        - Set `holidayContext = { hasBaseline: false, typicalDays }`
    - Else:
        - Calculate derived fields:
            - `avgWeeklyHours = ref.totalBasicHours / ref.totalWeeks`
            - `avgHoursPerDay = typicalDays > 0 ? avgWeeklyHours / typicalDays : 0`
            - `avgRatePerHour = ref.totalBasicPay / ref.totalBasicHours` (or 0 if no hours)
            - `entitlementHours = avgWeeklyHours × 5.6` (standard) or accrual method if post-Apr-2024
        - Set `useAccrualMethod = (leaveYearStart >= ACCRUAL_CUTOFF)` → `avgWeeklyHours × 5.6` (both methods converge to same formula)
        - Set `holidayContext = { hasBaseline: true, avgWeeklyHours, avgHoursPerDay, avgRatePerHour, typicalDays, entitlementHours, useAccrualMethod, mixedMonthsIncluded, confidence }`

4. **Special handling:**
    - **Zero-hours workers** (`typicalDays = 0`): `avgHoursPerDay = 0` (no day-per-week assumption), but `avgWeeklyHours` and entitlement still computed
    - **Pre-April-2024 accrual:** Uses 5.6-week statutory multiplier
    - **Post-April-2024 accrual:** Same 5.6-week formula (12.07% accrual is the per-payslip accumulation mechanism, not the annual calculation)

**Holiday Context Type:**

```ts
{
  // Variant 1: Insufficient data (<3 months)
  hasBaseline: false,
  typicalDays: number,

  // Variant 2: Sufficient data (≥3 months)
  hasBaseline: true,
  avgWeeklyHours: number,
  avgHoursPerDay: number,        // 0 if typicalDays = 0
  avgRatePerHour: number,
  typicalDays: number,
  entitlementHours?: number,
  useAccrualMethod?: boolean,
  mixedMonthsIncluded: number,
  confidence: ReferenceConfidence
}
```

### 2.7 `SKIP_PAY_TITLES`

**Location:** [pwa/src/report/holiday_calculations.js](pwa/src/report/holiday_calculations.js#L65)

**Purpose:** List of statutory/non-regular pay titles to exclude from rolling reference average

**Current Value:**

```js
;[
    'statutory sick',
    'ssp',
    'maternity',
    'smp',
    'paternity',
    'spp',
    'shpp',
    'statutory adoption',
    'adoption pay',
]
```

**Matching:** Case-insensitive substring match on `misc[*].title`

**Statutory Basis:** ACAS guidance requires exclusion of weeks paid as SSP/SMP/SPP/etc. This implementation approximates at the monthly level: any month containing any of these titles is excluded entirely.

---

## 3. Worker Profile Data Usage

### Overview

Worker profile fields control holiday estimation and baseline assumptions:

| Field                    | Type                       | Default  | Effect                                                                      | Constraints                  |
| ------------------------ | -------------------------- | -------- | --------------------------------------------------------------------------- | ---------------------------- |
| **typicalDays**          | number (days/week)         | 0        | Divisor for `avgHoursPerDay`; 0 = zero-hours baseline                       | Hourly: 0–7; Salaried: 0.5–7 |
| **statutoryHolidayDays** | number \| null (days/year) | null     | Enables "days remaining" calculation for salaried workers                   | 1–365 if set                 |
| **leaveYearStartMonth**  | number (1=Jan, 4=Apr)      | 4        | Controls which entries group into each leave year                           | 1–12; typically 1 or 4       |
| **workerType**           | 'hourly' \| 'salary'       | 'hourly' | Switches between rolling-reference (hourly) and daily-rate (salaried) logic | —                            |

### Propagation

1. **buildReportEntries** (report_calculations.js):
    - Receives `leaveYearStartMonth` from `workerProfile`
    - Passes to `getTaxYearKey` and `getLeaveYearKey` to assign each entry to correct leave year

2. **buildYearHolidayContext** (holiday_calculations.js):
    - Receives `workerProfile` with `typicalDays` and `leaveYearStartMonth`
    - Uses `typicalDays` to compute `avgHoursPerDay = avgWeeklyHours / typicalDays`
    - Returns early with `hasBaseline: false` if fewer than 3 months data

3. **buildYearHolidaySummary** (year_holiday_summary.js):
    - For salaried workers: uses `typicalDays` in `workingDaysPerMonth = (typicalDays × 52) / 12`
    - Then derives daily rate and computes estimated days taken/remaining

4. **App UI** (app.js):
    - Stores/loads `workerProfile` from localStorage
    - Enforces min/max for salaried (0.5–7 days), auto-corrects when switching worker type
    - Provides visual feedback when `typicalDays = 0` (shows "Variable pattern" instead of day count)

### Zero-Hours Baseline Design

**Deliberate Choice:** Default `typicalDays = 0` and `statutoryHolidayDays = null`

**Rationale:**

- Zero-hours contracts are prevalent in the UK labour market
- Assuming a fixed 5-day or 28-day entitlement would silently produce **incorrect** results for these workers
- Better to show no estimate and prompt the user to enter actual values than to silently misrepresent

**Side Effects:**

- First-time users see "Variable pattern" entitlement and must explicitly set `typicalDays` to see day estimates
- Safety mechanism: salaried workers cannot set `typicalDays < 0.5` (enforced in UI)

---

## 4. Test Coverage for Edge Cases

### 4.1 Insufficient Data (< 3 Months History)

**Test:** [hol_pay_flags.test.mjs (line 1024+)](tests/hol_pay_flags.test.mjs#L1024)

**Scenario:** Worker with only 2 prior months of eligible pay when holiday payslip arrives

**Expected Behavior:**

- `buildRollingReference` returns `null` (not enough data)
- Signal B flag does not fire
- Signal A may still fire if same-payslip rate is low (no 3-month threshold)
- `buildYearHolidayContext` sets `holidayContext.hasBaseline = false`

**Test Case:**

```js
it('does not fire Signal B when fewer than 3 eligible periods', () => {
  const entries = [
    makeEntry({ basicUnits: 160, basicRate: 14.5, … }),  // Month 1
    makeEntry({ basicUnits: 160, basicRate: 14.5, … }),  // Month 2
  ]
  const holidayEntry = makeEntry({ … holidayAmount: 80 })
  entries.push(holidayEntry)

  buildHolidayPayFlags(entries)

  const flag = holidayEntry.validation.flags.find(f => f.id === 'holiday_rate_below_rolling_avg')
  expect(flag).toBeUndefined()  // ← Returns null internally
})
```

### 4.2 Mixed Work + Holiday Months

**Test:** [hol_pay_flags.test.mjs (line 1500+)](tests/hol_pay_flags.test.mjs)

**Scenario:** A payslip contains both basic work hours and holiday pay; mixed-month gate determines eligibility

**Gate Conditions (all must be true):**

1. Prior pure-work reference exists and has ≥12 weeks data
2. `actualHours / expectedHours >= 0.75` (≥75% of typical hours worked)
3. `expectedHours = (ref.totalBasicHours / ref.totalWeeks) × getWeeksInPeriod(date)`

**Expected Behavior:**

- If gate passes: mixed month is **included** in rolling reference, `mixedMonthsIncluded++`, `confidence.level = 'medium'` or `'low'`
- If gate fails: mixed month is **excluded**, treated as ineligible
- Mixed months are NEVER recursively added to the reference pool for other months (pure-only safeguard)

**Example (from documentation):**

**Good Place — Month 5 (June, mostly working):**

- Prior pure-work avg: `1560 hrs / 43.14 weeks = 36.16 hrs/week`
- Expected hours for June: `36.16 × (30 / 7) = 154.98 hrs`
- Actual basic hours: `128 hrs`
- Ratio: `128 / 154.98 = 0.826 >= 0.75` → **PASSES gate** → included

**Bad Place — Month 2 (May, lightly working):**

- Prior pure-work avg: `520 hrs / 48 weeks = 10.83 hrs/week`
- Expected hours for May: `10.83 × (31 / 7) = 48 hrs`
- Actual basic hours: `35 hrs`
- Ratio: `35 / 48 = 0.729 < 0.75` → **FAILS gate** → excluded

### 4.3 Zero-Hours Workers

**Tests:** [run_snapshot_good_zero_hours.test.mjs](tests/run_snapshot_good_zero_hours.test.mjs), [run_snapshot_bad_zero_hours.test.mjs](tests/run_snapshot_bad_zero_hours.test.mjs)

**Scenario:** Worker with `typicalDays = 0` (irregular/zero-hours contract)

**Expected Behavior in `buildYearHolidayContext`:**

- `avgHoursPerDay = 0` (no day-per-week assumption available)
- `avgWeeklyHours` still computed from 52-week rolling reference
- `entitlementHours = avgWeeklyHours × 5.6` (statutory formula; 12.07% accrual is monthly mechanism)
- Report shows entitlement in **hours** not days (e.g., "~28.0 hrs/year" instead of "~5.6 days/year")
- Days estimation is suppressed (marked as N/A in UI)

**Test Assertion:**

```js
it('handles typicalDays = 0 (zero-hours workers) without division errors', () => {
  const entries = [
    makeEntry({ basicUnits: 100, … monthIndex: 1, … }),
    makeEntry({ basicUnits: 200, … monthIndex: 2, … }),
    makeEntry({ basicUnits: 150, … monthIndex: 3, … }),
  ]
  const targetEntry = makeEntry({ … monthIndex: 4 })
  entries.push(targetEntry)
  buildYearHolidayContext(entries, { typicalDays: 0 })

  const ctx = targetEntry.holidayContext
  expect(ctx.typicalDays).toBe(0)
  expect(ctx.hasBaseline).toBe(true)
  expect(ctx.avgHoursPerDay).toBe(0)
  expect(isNaN(ctx.avgHoursPerDay)).toBe(false)  // ← Avoid NaN
  expect(ctx.avgWeeklyHours).toBeGreaterThan(0)  // ← Still computed
})
```

### 4.4 Annual Holiday Summary with Limited Data (Salaried)

**Test:** [report_calculation.test.mjs (line 1318+)](tests/report_calculation.test.mjs#L1318)

**Scenario:** Salaried worker with partial tax year (fewer than 12 months)

**Expected Behavior:**

- Daily rate is computed from available months: `dailyRate = yearBasicSalaryAmount / monthsInYear / workingDaysPerMonth`
- If no basic salary found, daily rate = 0 and day estimate is omitted
- Result shows only raw £ amount with disclaimer "~ (approximate)"

### 4.5 Tax-Year Boundary Crossing (Hourly)

**Test:** [hol_pay_flags.test.mjs (line 1250+)](tests/hol_pay_flags.test.mjs#L1250)

**Scenario:** Holiday payslip in April 2025 (tax year 2025/26) pulls reference data from March 2024 (tax year 2024/25)

**Expected Behavior:**

- Rolling reference window (`targetDate - 104 weeks`) spans **both** tax years
- Entry sorting by `parsedDate` ensures backward walk finds both prior-year and current-year entries
- Signal B flag includes metadata about `totalWeeks` across the boundary

**Test:**

```js
it('crosses tax year boundaries — prior-year rolling window data triggers flag', () => {
    const entriesPrevYear = []
    for (let i = 0; i < 6; i++) {
        entriesPrevYear.push(
            makeEntry({
                basicUnits: 160,
                basicRate: 14.5,
                yearKey: '2023/24', // Prior tax year
                parsedDate: new Date(2023, 9 + i, 15),
            })
        )
    }
    const holidayEntry = makeEntry({
        holidayUnits: 8,
        holidayAmount: 80, // £10/hr implied
        yearKey: '2024/25',
        parsedDate: new Date(2024, 5, 15), // April 2024, crossing boundary
    })

    buildHolidayPayFlags([...entriesPrevYear, holidayEntry])

    const flag = holidayEntry.validation.flags.find(
        (f) => f.id === 'holiday_rate_below_rolling_avg'
    )
    expect(flag).toBeDefined()
    expect(flag.label).toMatch(/average basic rate/)
})
```

### 4.6 Duplicate Payslips (Same Month, Multiple Entries)

**Test:** [hol_pay_flags.test.mjs (line 1300+)](tests/hol_pay_flags.test.mjs#L1300)

**Scenario:** Worker has two payslips for the same calendar month (e.g., corrected payslip)

**Expected Behavior:**

- Deduplication key: `yearKey:monthIndex`
- Only the **first encountered** (most recent, since walking backward) contributes to rolling reference
- Earlier payslip for same month is skipped
- Prevents weeks denominator from being inflated

**Test:**

```js
it('does not count multiple entries in the same month toward the 3-month threshold', () => {
    const entries = [
        makeEntry({ monthIndex: 1, parsedDate: new Date(2024, 0, 15) }),
        makeEntry({ monthIndex: 1, parsedDate: new Date(2024, 0, 20) }), // Duplicate
        makeEntry({ monthIndex: 2, parsedDate: new Date(2024, 1, 15) }),
    ]
    const holidayEntry = makeEntry({
        holidayUnits: 8,
        holidayAmount: 80,
        parsedDate: new Date(2024, 6, 15),
    })
    entries.push(holidayEntry)

    buildHolidayPayFlags(entries)

    const flag = holidayEntry.validation.flags.find(
        (f) => f.id === 'holiday_rate_below_rolling_avg'
    )
    expect(flag).toBeUndefined() // Only 2 unique months (not 3)
})
```

### 4.7 Pre/Post April 2024 Accrual Method Switch

**Test:** [hol_pay_flags.test.mjs (3600+, entitlement method alignment)](tests/hol_pay_flags.test.mjs)

**Scenario:** Holiday entitlement calculation changes at ACCRUAL_CUTOFF (1 April 2024)

**Expected Behavior:**

- **Before April 2024:** `entitlementHours = avgWeeklyHours × 5.6` (statutory 5.6 weeks)
- **From April 2024 onwards:** `entitlementHours = avgWeeklyHours × 5.6` (same formula; 12.07% accrual is per-payslip mechanism, not annual)
- Detection: `leaveYearStart >= ACCRUAL_CUTOFF` (April 1, 2024)

**Test:**

```js
it('uses 5.6-weeks method for leave year starting before April 2024', () => {
    const entries = makeRefEntries(2023)
    const target = makeEntry({ parsedDate: new Date(2023, 6, 15) })
    entries.push(target)
    buildYearHolidayContext(entries, { typicalDays: 0, leaveYearStartMonth: 4 })

    const ctx = target.holidayContext
    expect(ctx.useAccrualMethod).toBe(false)
    const expectedEntitlement = ctx.avgWeeklyHours * 5.6
    expect(ctx.entitlementHours).toBeCloseTo(expectedEntitlement, 1)
})

it('uses 12.07% accrual method for leave year starting on/after April 2024', () => {
    const entries = makeRefEntries(2024)
    const target = makeEntry({ parsedDate: new Date(2024, 6, 15) })
    entries.push(target)
    buildYearHolidayContext(entries, { typicalDays: 0, leaveYearStartMonth: 4 })

    const ctx = target.holidayContext
    expect(ctx.useAccrualMethod).toBe(true)
    expect(ctx.entitlementHours).toBeCloseTo(ctx.avgWeeklyHours * 5.6, 1)
})
```

---

## 5. Code Patterns & Architectural Choices

### 5.1 Conservative Exclusions (Monthly Granularity)

**Pattern:** Exclude entire months rather than attempt intra-month splitting

**Example:** A month with "sick leave for 2 weeks + work for 2 weeks" is excluded entirely (Rule 2 of `isReferenceEligible`)

**Rationale:**

- Payslips are monthly data; splittable weeks are not available
- Tool cannot verify which weeks were worked vs. statutory-paid
- **Conservative = safer:** fewer false positives (may miss genuine underpayment, but avoids flagging correctly-paid workers)
- Documented in hourly-holiday-pay-calculation.md, Section "Known Shortcomings #1"

### 5.2 Mixed-Month Gating with Circular-Dependency Safeguard

**Pattern:** Allow mostly-working mixed months to contribute, but prevent recursion

**Key Line in `buildRollingReference`:**

```js
shouldInclude = isReferenceEligible(entry) ||
  (!pureOnly && isGatePassingMixedMonth(…))
```

And in `isGatePassingMixedMonth`:

```js
const pureRef = buildPureRollingReference(sortedEntries, mixedEntry)
// ↑ Uses `pureOnly: true`, ensuring pure-work months only
```

**Why:** Mixed months evaluated for THIS entry should not feed back into the reference pool for OTHER entries, avoiding circular bias

### 5.3 Confidence Levels as Metadata

**Pattern:** Attach structured confidence object to all results

**Type:**

```ts
{
  level: 'high' | 'medium' | 'low',
  reasons: string[]  // e.g., ["Limited reference: 30 weeks available", "Includes 1 mixed work+holiday month"]
}
```

**Consumed by:**

- Flag labels (append "— limited data" qualifier)
- UI rendering (visual confidence indicator)
- Annual reasonableness checks (inherit confidence ceiling)

### 5.4 Deduplication by Month

**Pattern:** Track `yearKey:monthIndex` in a Set to skip duplicate payslips

**Implementation:**

```js
const monthKey = `${yearKey}:${monthIndex}`
if (monthsSeen.has(monthKey)) {
  continue  // Already counted
}
monthsSeen.add(monthKey)
```

**Effect:** Prevents weeks denominator inflation when workers submit corrected payslips

### 5.5 Two-Signal Architecture (Not One)

**Pattern:** Signal A (same-payslip) and Signal B (rolling average) are independent; Signal A suppressed when B fires

**Rationale:**

- Signal A is **always** checkable (no historical data needed)
- Signal B is **more informative** (accounts for pay rises, cross-year variations)
- Avoid duplicate warnings on the same root cause

**Code:**

```js
if (basicRate !== null && …
    !rollingAvgFlagWillFire) {  // ← Only if B won't also fire
  entry.validation.flags.push(signalAFlag)
}
if (rollingAvgFlagWillFire) {
  entry.validation.flags.push(signalBFlag)
}
```

### 5.6 Timing Instrumentation (Optional)

**Pattern:** Global `globalThis.__payrollTiming` object optionally tracks performance metrics

**Used for:** Profiling `buildRollingReference` and related functions without blocking main logic

**Example:**

```js
if (timing?.enabled) {
    timing.start('holidayContext.total')
    timing.increment('holidayContext.calls')
    // …
    timing.record(
        'rollingReference.total',
        globalThis.performance.now() - startedAt
    )
}
```

---

## 6. Identified Patterns & Potential Issues

### 6.1 ✅ **Strong Pattern: Defensive Null Checks**

**Observation:** All payslip data access uses optional chaining or null guards

**Example:**

```js
const basic = entry.record?.payrollDoc?.payments?.hourly?.basic ?? null
const units = basic?.units ?? 0
```

**Assessment:** Prevents crashes on malformed payslip data; good practice

---

### 6.2 ✅ **Strong Pattern: Early Returns for Invalid States**

**Observation:** `buildRollingReference` returns `null` early if insufficient data

**Code:**

```js
if (periodsCounted < 3) {
    return null // No flag raised
}
```

**Assessment:** Clear intent; prevents downstream logic from handling edge case separately

---

### 6.3 ⚠️ **Unusual Pattern: No-Op on `typicalDays = 0.5–7`**

**Observation:** When `typicalDays = 0` for hourly workers, `avgHoursPerDay = 0` (no division error), but the field is meaningless for day-based estimation

**Code:**

```js
const avgHoursPerDay = typicalDays > 0 ? avgWeeklyHours / typicalDays : 0
```

**Assessment:**

- Intentional and documented (zero-hours baseline)
- UI suppresses day estimates when `typicalDays = 0`
- Could be clearer with explicit comment in code

---

### 6.4 ⚠️ **Potential Issue: `getWeeksInPeriod` Systematic Bias**

**Observation:** Calendar month approximation introduces 2–3% consistent bias

**Effect:**

- Longer months (31 days) contribute 4.429 weeks
- Shorter months (28 days) contribute 4.0 weeks
- Systematically deflates average pay (conservative)

**Documentation:** Clearly explained in hourly-holiday-pay-calculation.md § Known Shortcomings #2

**Assessment:**

- Acknowledged limitation; no active mitigation planned
- Acceptable trade-off (safer failure mode)
- Would require weekly payslip data to fix

---

### 6.5 ⚠️ **Potential Issue: Basic Pay Only (No Overtime/Commission)**

**Observation:** `buildRollingReference` uses only `hourly.basic.amount`, excludes `misc` payments (overtime, commission)

**Effect:**

- Rolling average understated for workers with regular overtime
- False negatives (genuine underpayment not flagged)
- **Most legally significant gap** per documentation

**Code:**

```js
totalBasicPay += basic.amount ?? 0 // ← Only basic, not misc overtime
```

**Mitigation:**

- Flag labels include "— request employer's weekly records to confirm"
- Documentation warns workers about this gap
- No current implementation plan to include overtime

**Assessment:**

- Design choice, not bug
- Documented; workers are advised to verify manually
- Risk accepted trade-off for simplicity

---

### 6.6 ✅ **Strong Pattern: Explicit Confidence Propagation**

**Observation:** Confidence metadata flows from `buildRollingReference` → flags → context → UI

**Path:**

```
buildRollingReference() → { confidence: { level, reasons } }
  → buildHolidayPayFlags() → flag labels (append confidence qualifier)
  → buildYearHolidayContext() → context propagation
  → report rendering (visual indicator)
```

**Assessment:** Good design; allows downstream consumers to adapt behavior based on confidence

---

### 6.7 ⚠️ **Potential Issue: No Rate-of-Change Detection**

**Observation:** System does not detect mid-year pay raises within the 52-week window

**Effect:**

- If a worker received a 20% raise in month 6 of 12, the rolling average blends both rates
- `avgWeeklyHours × avgRatePerHour` may not match the most recent actual rate accurately

**Mitigation:**

- Signal B uses recent data; pay-rise artefacts are caught by same-payslip rate check (Signal A)
- `!holidayMatchesBasic` guard prevents false positives where current rate matches

**Code:**

```js
const rollingAvgRate = … (blended average)
const basicRate = … (current payslip rate)
// If basicRate matches holiday rate, Signal B suppressed to avoid false positive
```

**Assessment:**

- By design; rate-of-change detection not planned
- Current approach is conservative (avoids false positives)

---

### 6.8 ✅ **Strong Pattern: Clear Test Naming Convention**

**Observation:** Test files follow naming convention: `[feature].test.mjs`

**Examples:**

- `hol_pay_flags.test.mjs` → tests Signal A/B logic, rolling reference, mixed months
- `hol_calc.test.mjs` → tests UI calculator functions
- `report_calculation.test.mjs` → tests report assembly

**Assessment:** Makes code review and maintenance easier

---

## 7. Edge Case Handling Summary

| Edge Case                                                        | Handler Function                           | Behavior                                                                                                   | Test File                            | Assessment                                             |
| ---------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------ |
| **< 3 months history**                                           | `buildRollingReference`                    | Returns `null`; no Signal B                                                                                | hol_pay_flags.test.mjs#1200          | ✅ Correctly prevents false positives                  |
| **Mixed work+holiday month**                                     | `isGatePassingMixedMonth`                  | Gate logic: ≥75% typical hours → include, `confidence = 'medium'`                                          | hol_pay_flags.test.mjs#1500+         | ✅ Conservative gate prevents over-inclusion           |
| **Zero-hours worker** (`typicalDays=0`)                          | `buildYearHolidayContext`                  | `avgHoursPerDay = 0`, `entitlementHours` still computed, UI suppresses day estimates                       | run*snapshot*\*\_zero_hours.test.mjs | ✅ Deliberate baseline avoids silent misrepresentation |
| **Partial tax year (salaried)**                                  | `buildYearHolidaySummary`                  | Daily rate = `yearBasicSalary / monthsInYear / workingDaysPerMonth`; omits day estimate if `dailyRate ≤ 0` | report_calculation.test.mjs#1350     | ✅ Shows raw £ when data insufficient                  |
| **Tax year boundary crossing**                                   | `buildRollingReference`                    | 104-week window spans both years; backward walk finds prior-year entries                                   | hol_pay_flags.test.mjs#1250          | ✅ Returns correct rolling average                     |
| **Duplicate payslips (same month)**                              | `buildRollingReference` (monthsSeen Set)   | First encountered (most recent) counted; duplicates skipped                                                | hol_pay_flags.test.mjs#1300          | ✅ Prevents weeks denominator inflation                |
| **Statutory pay month** (`misc` contains 'statutory sick', etc.) | `hasSkippedMiscPayments`                   | Excluded from reference per Rule 2 of `isReferenceEligible`                                                | hol_pay_flags.test.mjs#1100          | ✅ Follows ACAS guidance                               |
| **No parsedDate**                                                | `buildRollingReference`, sorting           | Entry skipped; sorts to position 0, excluded from walk                                                     | —                                    | ✅ Handles unparseable dates gracefully                |
| **Holiday amount = 0**                                           | `buildHolidayPayFlags`                     | Entry skipped entirely; no Signal A/B raised                                                               | hol_pay_flags.test.mjs#100           | ✅ Avoids division-by-zero                             |
| **Pre/post April 2024**                                          | `buildYearHolidayContext` (ACCRUAL_CUTOFF) | Both use `avgWeeklyHours × 5.6`; `useAccrualMethod` flag indicates era                                     | hol_pay_flags.test.mjs#3600+         | ✅ Statutory change correctly reflected                |

---

## 8. File Organization & Dependencies

```
pwa/src/report/
  ├─ holiday_calculations.js          ← Core logic (Signals A/B, reference, context)
  │   ├─ imports: tax_year_utils.js, uk_thresholds.js, flag_catalog.js
  │   ├─ exports: buildHolidayPayFlags, buildRollingReference, buildYearHolidayContext, isReferenceEligible
  │   └─ used by: build.js, report_calculations.js
  │
  ├─ tax_year_utils.js                ← Date/time utilities
  │   ├─ exports: parsePayPeriodStart, getWeeksInPeriod, getTaxYearKey, getLeaveYearKey, getFiscalMonthIndex
  │   └─ used by: report_calculations.js, holiday_calculations.js
  │
  ├─ uk_thresholds.js                 ← Constants
  │   ├─ exports: HOLIDAY_RATE_TOLERANCE (0.05), HOLIDAY_ACCRUAL_CUTOFF (1 Apr 2024)
  │   └─ used by: holiday_calculations.js, flag_catalog.js
  │
  ├─ year_holiday_summary.js          ← Salaried day estimation
  │   ├─ imports: tax_year_utils.js
  │   ├─ exports: buildYearHolidaySummary, buildLeaveYearGroups
  │   └─ used by: report_view_model.js, build.js
  │
  ├─ report_calculations.js           ← Report assembly
  │   ├─ imports: tax_year_utils.js, holiday_calculations.js, year_holiday_summary.js
  │   ├─ exports: buildReport, buildReportEntries
  │   └─ called by: build.js, tests
  │
  ├─ build.js                         ← Top-level orchestration
  │   ├─ imports: report_calculations.js, holiday_calculations.js, etc.
  │   ├─ exports: buildReport
  │   └─ called by: UI app.js, tests
  │
  └─ flag_catalog.js                  ← Flag label formatting
      ├─ exports: formatFlagLabel
      └─ used by: holiday_calculations.js

pwa/docs/
  ├─ hourly-holiday-pay-calculation.md    ← Primary reference (all Signals A/B logic)
  ├─ salaried-holiday-calculation.md      ← Salaried day estimation
  └─ auditor-verification-guide.md        ← Compliance checklist

tests/
  ├─ hol_pay_flags.test.mjs               ← Core logic tests (Signals, reference, context)
  ├─ report_calculation.test.mjs          ← Report assembly, date parsing
  ├─ tax_year_utils.test.mjs              ← getWeeksInPeriod, tax year keys
  ├─ report_view_model.test.mjs           ← Context propagation, low-confidence marking
  └─ run_snapshot_*.test.mjs              ← Integration snapshots (4 fixture profiles)
```

---

## 9. Key Constants & Thresholds

| Constant                   | Value      | File                    | Used In                 | Purpose                                                             |
| -------------------------- | ---------- | ----------------------- | ----------------------- | ------------------------------------------------------------------- |
| **HOLIDAY_RATE_TOLERANCE** | 0.05       | uk_thresholds.js        | holiday_calculations.js | Max acceptable rate difference (£ per hour) for Signals A/B         |
| **HOLIDAY_ACCRUAL_CUTOFF** | 2024-04-01 | uk_thresholds.js        | holiday_calculations.js | Cutoff for accrual method switch (5.6× vs. 12.07% accrual)          |
| **MIN_REFERENCE_PERIODS**  | 3          | holiday_calculations.js | buildRollingReference   | Minimum periods needed for rolling reference (not flagged if fewer) |
| **MAX_LOOKBACK_WEEKS**     | 104        | holiday_calculations.js | buildRollingReference   | Maximum weeks to look back (statutory allows up to 104)             |
| **TARGET_ROLLING_WEEKS**   | 52         | holiday_calculations.js | buildRollingReference   | Target rolling window (stop once reached)                           |
| **MIXED_MONTH_THRESHOLD**  | 0.75       | holiday_calculations.js | isGatePassingMixedMonth | Min ratio (actual/expected hours) for mixed month inclusion         |
| **MIN_REFERENCE_FOR_GATE** | 12         | holiday_calculations.js | isGatePassingMixedMonth | Min weeks in prior reference before evaluating mixed-month gate     |
| **STATUTORY_ENTITLEMENT**  | 5.6        | holiday_calculations.js | buildYearHolidayContext | Weeks of statutory holiday per year                                 |

---

## 10. Summary of Findings

### Strengths

1. **Clear Separation of Concerns:** Each function has a single responsibility; easy to unit test
2. **Comprehensive Documentation:** Embedded JSDoc, external .md files, and comment trails explain "why" not just "what"
3. **Edge Case Awareness:** Documented known shortcomings (10 in hourly ref); tests cover all major edge cases
4. **Confidence Tracking:** Structured metadata flows through system; UI can express uncertainty
5. **Conservative Design:** Prefers false negatives (missing flags) over false positives (incorrect flags)
6. **Tax-Year Boundary Handling:** Correctly crosses year boundaries in rolling reference
7. **Defensive Coding:** Null/optional chaining throughout; no unguarded divisions

### Limitations (Documented)

1. **Monthly Granularity:** Cannot split intra-month variations (sick leave + work in same month treated as excluded)
2. **Basic Pay Only:** Excludes overtime, commission, other regular misc payments (most legally significant gap)
3. **`getWeeksInPeriod` Bias:** 2–3% systematic approximation (conservative, acceptable)
4. **Zero-Hours Baseline:** Default `typicalDays=0` requires user input (deliberate; prevents silent misrepresentation)
5. **Per-Hour vs. Per-Week:** Uses hourly rate check; ACAS defines entitlement as weekly pay (edge case divergence)
6. **No Rate-of-Change:** Mid-year pay raises blend into average; mitigated by Signal A and current-rate checks
7. **Salaried Constant-Salary:** Assumes flat salary throughout year; pay rises distort day estimates

### Potential Issues (Minor)

1. **Implicit Expectations:** Mixed-month gate includes logic assumption `ref !== null && totalWeeks >= 12` that could be more explicit
2. **Limited Documentation in Code:** Comments sparse in holiday_calculations.js; main docs in .md files
3. **No Inline Examples:** No in-code examples of typical signal sequences (easily added to JSDoc)

### Code Quality

- **Test Coverage:** Very good for main paths; snapshot tests validate integration
- **Type Safety:** JSDoc types help; no TypeScript yet (not blocking for this codebase size)
- **Performance:** Timing instrumentation present; no obvious n² loops
- **Maintainability:** Clear naming, consistent patterns, easy to find functions

---

## 11. Audit Checklist

- [x] All functions that reference 'SKIP_PAY_TITLES' located and explained
- [x] `isReferenceEligible` logic (3 rules) documented and tested
- [x] `buildRollingReference` complete algorithm walkthrough provided
- [x] `buildHolidayPayFlags` Signal A/B architecture explained
- [x] `buildYearHolidayContext` flow mapped to worker profile fields
- [x] `parsePayPeriodStart` format support listed
- [x] `getWeeksInPeriod` approximation bias acknowledged
- [x] Mixed-month gating logic with circular-dependency safeguard explained
- [x] Edge cases: < 3 months, mixed months, zero-hours, tax-year boundaries, duplicates all covered
- [x] Worker profile data propagation traced through system
- [x] Test file organization and snapshot approach documented
- [x] Known limitations (10 in docs) cross-referenced with code
- [x] Code patterns identified (conservative exclusions, deduplication, confidence tracking, two-signal)
- [x] File organization and dependencies mapped
- [x] Constants and thresholds catalogued

---

## Conclusion

The holiday calculation system is a **well-architected, carefully documented implementation** of UK statutory holiday pay rules. It makes deliberate trade-offs (monthly granularity, basic-pay only, conservative exclusions) that are appropriate for a tool designed to **raise awareness without claiming legal authority**. The code is defensive, the tests are comprehensive, and edge cases are handled thoughtfully. The main limitations are statutory (no access to week-by-week data or overtime payments) rather than implementation issues.

**Recommendation for code review:** This codebase is audit-ready. Documentation is thorough; test coverage is good. Future enhancements (annual checks, mixed-month inclusion) should follow the same pattern: document the "why," implement conservatively, test edge cases explicitly.
