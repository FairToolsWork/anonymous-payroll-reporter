# Fixture Baselines — Independent Verification Reference

This document provides independently computed pay totals and holiday calculation baselines for each fixture dataset. These are derived directly from the `payroll_inputs*.json` source files using arithmetic only — no code involved — so they can be verified by anyone from first principles.

The authoritative machine-computed totals (including exact PAYE, NI, pension, and net pay as they appear on the generated PDF fixtures) are in the corresponding expected snapshot JSON files under `tests/test_files/report-workflow/`.

| Document                                     | Relationship                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pwa/docs/hourly-holiday-pay-calculation.md` | Methodology document whose Signal A/B logic and rolling reference calculation these baselines independently verify — consult this when cross-checking an unexpected flag or non-flag |
| `tests/TESTING.md`                           | Test strategy document describing the four fixture profiles, assertion patterns, and snapshot regeneration workflow that consume these baselines                                     |

---

## Shared Deduction Constants (all 5 datasets)

| Constant                 | Value                          |
| ------------------------ | ------------------------------ |
| Personal allowance       | £1,048.00/month (£12,570/year) |
| NI threshold             | £1,048.00/month                |
| NI employee rate         | 12%                            |
| NI employer rate         | 13.8%                          |
| Pension qualifying lower | £520.00/month                  |
| Pension qualifying upper | £4,189.17/month                |
| Pension employee rate    | 5%                             |
| Pension employer rate    | 3%                             |
| Tax regime               | Scottish income tax            |

### Scottish Income Tax Bands (monthly equivalents)†

| Band         | Monthly band width               | Rate |
| ------------ | -------------------------------- | ---- |
| Starter      | £0 – £1,283.08 of taxable income | 19%  |
| Basic        | next £2,290.92                   | 20%  |
| Intermediate | next £3,638.50                   | 21%  |
| Higher       | next £6,250.00                   | 42%  |

_Taxable income = gross pay − personal allowance (£1,048.00)._

> † Scottish tax bands are used in test fixtures, however in implementation the system is agnostic of tax regime, workers under different tax regimes will have different tax bands applied.

### Deduction Formulas

```
PAYE     = tax on max(0, gross - 1048.00) per band table above
NI       = max(0, gross - 1048.00) × 0.12
PensionEE = (min(gross, 4189.17) - 520.00) × 0.05
Net      = gross - PAYE - NI - PensionEE - other_deduction
```

For months below the NI/PAYE threshold (gross ≤ £1,048): PAYE = £0, NI = £0, and the `paye_zero` / `nat_ins_zero` flags are raised. These are correct flags — the worker genuinely had no liability that month.

---

## Dataset 1 — Baseline Hourly Worker

**Source:** `payroll_inputs.json`
**Period:** April 2024 – April 2025 (13 months)
**Fixture directory:** `tests/test_files/report-workflow/fixtures`
**Expected snapshot:** `tests/test_files/report-workflow/expected-run-snapshot.json`
**Employee ID:** 0005

This dataset models a real-world scenario: a rate change mid-April 2024 (£8.60/hr → £10.00/hr), occasional makeup hours, holiday pay correctly at the current basic rate, and a further rate change in April 2025 (£10.00 → £10.85).

### Gross Pay by Month

| Month    | Basic lines (hrs × rate)                | Makeup         | Holiday      | Other ded | Gross     |
| -------- | --------------------------------------- | -------------- | ------------ | --------- | --------- |
| Apr 2024 | 75.9×£8.60 + 75.9×£10.00 = £1,411.74    | —              | —            | —         | £1,411.74 |
| May 2024 | 170.78×£10.00 = £1,707.80               | —              | —            | —         | £1,707.80 |
| Jun 2024 | 218.21×£10.00 = £2,182.10               | 15h×£10 = £150 | 4h×£10 = £40 | £50       | £2,372.10 |
| Jul 2024 | 199.24×£10.00 = £1,992.40               | —              | —            | —         | £1,992.40 |
| Aug 2024 | 142.31×£10.00 = £1,423.10               | —              | 4h×£10 = £40 | —         | £1,463.10 |
| Sep 2024 | 246.68×£10.00 = £2,466.80               | —              | —            | —         | £2,466.80 |
| Oct 2024 | 180.26×£10.00 = £1,802.60               | —              | —            | —         | £1,802.60 |
| Nov 2024 | 208.73×£10.00 = £2,087.30               | 20h×£10 = £200 | —            | £50       | £2,287.30 |
| Dec 2024 | 161.29×£10.00 = £1,612.90               | —              | 7h×£10 = £70 | —         | £1,682.90 |
| Jan 2025 | 227.70×£10.00 = £2,277.00               | —              | 7h×£10 = £70 | —         | £2,347.00 |
| Feb 2025 | 132.83×£10.00 = £1,328.30               | 12h×£10 = £120 | —            | £50       | £1,448.30 |
| Mar 2025 | 237.19×£10.00 = £2,371.90               | —              | —            | —         | £2,371.90 |
| Apr 2025 | 94.88×£10.00 + 94.87×£10.85 = £1,978.14 | —              | —            | —         | £1,978.14 |

### Totals

|                                  | Hours         | Pay            |
| -------------------------------- | ------------- | -------------- |
| Basic (all months)               | 2,466.77h     | £24,642.08     |
| Makeup (Jun, Nov, Feb)           | 47h           | £470.00        |
| Holiday (Jun, Aug, Dec, Jan)     | 22h           | £220.00        |
| Other deductions (Jun, Nov, Feb) | —             | −£150.00       |
| **Total gross**                  | **2,535.77h** | **£25,332.08** |

### Holiday Pay Analysis

All four holiday months use £10.00/hr holiday rate, matching the basic rate in effect at the time. Holiday months with ≥3 prior eligible months will use the rolling average reference.

**Months with holiday pay:** June 2024, August 2024, December 2024, January 2025.

For December 2024 (first holiday month with ≥3 prior eligible months):

| Eligible prior month | Basic hours   | Basic pay                                           |
| -------------------- | ------------- | --------------------------------------------------- |
| Apr 2024             | 151.8h        | £1,411.74 (blended rate £9.30/hr due to transition) |
| May 2024             | 170.78h       | £1,707.80                                           |
| Jul 2024             | 199.24h       | £1,992.40                                           |
| Sep 2024             | 246.68h       | £2,466.80                                           |
| Oct 2024             | 180.26h       | £1,802.60                                           |
| Nov 2024             | 208.73h       | £2,087.30                                           |
| **Total**            | **1,157.49h** | **£11,468.64**                                      |

Rolling average rate: £11,468.64 ÷ 1,157.49h = **£9.908/hr**

Holiday rate: £10.00/hr > £9.908/hr → **no flag** (holiday rate exceeds rolling average due to the April 2024 rate transition pulling the average below £10.00).

---

## Dataset 2 — Predictable Hourly Worker, Good Place

**Source:** `payroll_inputs_good_place_predictable.json`
**Period:** April 2025 – May 2026 (14 months)
**Fixture directory:** `tests/test_files/report-workflow/fixtures-good-predictable`
**Expected snapshot:** `tests/test_files/report-workflow/expected-snapshot-good-predictable.json`
**Employee ID:** 0006

A worker with completely consistent hours and a correct holiday rate throughout. Holiday months use 157 basic hours + 8 holiday hours, so gross is identical to a regular 165-hour month. Two months (May, October) include 8 hours of makeup time.

### Gross Pay by Month

| Month    | Type    | Basic                   | Makeup           | Holiday          | Gross     |
| -------- | ------- | ----------------------- | ---------------- | ---------------- | --------- |
| Apr 2025 | Regular | 165h×£12.50 = £2,062.50 | —                | —                | £2,062.50 |
| May 2025 | Makeup  | 165h×£12.50 = £2,062.50 | 8h×£12.50 = £100 | —                | £2,162.50 |
| Jun 2025 | Holiday | 157h×£12.50 = £1,962.50 | —                | 8h×£12.50 = £100 | £2,062.50 |
| Jul 2025 | Regular | 165h×£12.50 = £2,062.50 | —                | —                | £2,062.50 |
| Aug 2025 | Regular | 165h×£12.50 = £2,062.50 | —                | —                | £2,062.50 |
| Sep 2025 | Holiday | 157h×£12.50 = £1,962.50 | —                | 8h×£12.50 = £100 | £2,062.50 |
| Oct 2025 | Makeup  | 165h×£12.50 = £2,062.50 | 8h×£12.50 = £100 | —                | £2,162.50 |
| Nov 2025 | Regular | 165h×£12.50 = £2,062.50 | —                | —                | £2,062.50 |
| Dec 2025 | Holiday | 157h×£12.50 = £1,962.50 | —                | 8h×£12.50 = £100 | £2,062.50 |
| Jan 2026 | Regular | 165h×£12.50 = £2,062.50 | —                | —                | £2,062.50 |
| Feb 2026 | Regular | 165h×£12.50 = £2,062.50 | —                | —                | £2,062.50 |
| Mar 2026 | Holiday | 157h×£12.50 = £1,962.50 | —                | 8h×£12.50 = £100 | £2,062.50 |
| Apr 2026 | Regular | 165h×£12.50 = £2,062.50 | —                | —                | £2,062.50 |
| May 2026 | Regular | 165h×£12.50 = £2,062.50 | —                | —                | £2,062.50 |

### Totals

|                              | Hours                     | Pay            |
| ---------------------------- | ------------------------- | -------------- |
| Basic                        | 2,278h (10×165h + 4×157h) | £28,475.00     |
| Makeup (May, Oct)            | 16h                       | £200.00        |
| Holiday (Jun, Sep, Dec, Mar) | 32h                       | £400.00        |
| **Total gross**              | **2,326h**                | **£29,075.00** |

### Indicative Deductions (Regular Month — £2,062.50 Gross)

| Deduction   | Calculation                                  | Amount          |
| ----------- | -------------------------------------------- | --------------- |
| PAYE        | (£2,062.50 − £1,048) × 19% = £1,014.50 × 19% | ≈ £192.76       |
| NI          | (£2,062.50 − £1,048) × 12% = £1,014.50 × 12% | £121.74         |
| Pension EE  | (£2,062.50 − £520) × 5% = £1,542.50 × 5%     | ≈ £77.13        |
| **Net pay** | £2,062.50 − £192.76 − £121.74 − £77.13       | **≈ £1,670.87** |

### Indicative Deductions (Makeup Month — £2,162.50 Gross)

| Deduction   | Calculation                                  | Amount          |
| ----------- | -------------------------------------------- | --------------- |
| PAYE        | (£2,162.50 − £1,048) × 19% = £1,114.50 × 19% | ≈ £211.76       |
| NI          | (£2,162.50 − £1,048) × 12% = £1,114.50 × 12% | £133.74         |
| Pension EE  | (£2,162.50 − £520) × 5% = £1,642.50 × 5%     | ≈ £82.13        |
| **Net pay** | £2,162.50 − £211.76 − £133.74 − £82.13       | **≈ £1,734.87** |

### 52-Week Rolling Reference

All basic work is at £12.50/hr. The rolling average rate is therefore **£12.50/hr** regardless of how many months are in the reference window. Holiday is also paid at £12.50/hr — the rates are equal so no flag fires on any of the four holiday months.

By the March 2026 holiday month, the reference window contains 8 eligible prior months:

| Eligible months                                  | Basic hours       | Weeks (approx) |
| ------------------------------------------------ | ----------------- | -------------- |
| Apr, May, Jul, Aug, Oct, Nov 2025; Jan, Feb 2026 | 8 × 165h = 1,320h | ~34.7          |

Average weekly hours: 1,320h ÷ 34.7 = **38.0h/week**
Average rate: £16,500 ÷ 1,320h = **£12.50/hr**
Expected holiday pay (8h at avg rate): **£100/period** — matches what was paid.

**Statutory entitlement context** (informational, not flagged):
Annual entitlement under 5.6-week rule: 5.6 × 38.0h/week = **212.8h/year**. The four fixture holiday periods (8h each = 32h total) represent a small subset of this entitlement; the fixture is not designed to model full holiday takeup.

---

## Dataset 3 — Predictable Hourly Worker, Bad Place

**Source:** `payroll_inputs_bad_place_predictable.json`
**Period:** April 2025 – May 2026 (14 months)
**Fixture directory:** `tests/test_files/report-workflow/fixtures-bad-predictable`
**Expected snapshot:** `tests/test_files/report-workflow/expected-snapshot-bad-predictable.json`
**Employee ID:** 0007

Identical to Dataset 2 except holiday months pay £9.00/hr rather than £12.50/hr — a clear underpayment of £3.50/hr that the system must detect.

### Gross Pay by Month

| Month        | Type              | Basic                   | Holiday            | Gross          |
| ------------ | ----------------- | ----------------------- | ------------------ | -------------- |
| Apr 2025     | Regular           | 165h×£12.50 = £2,062.50 | —                  | £2,062.50      |
| May 2025     | Makeup            | 165h×£12.50 + 8h×£12.50 | —                  | £2,162.50      |
| Jun 2025     | **Holiday (bad)** | 157h×£12.50 = £1,962.50 | 8h×**£9.00** = £72 | **£2,034.50**  |
| Jul–Aug 2025 | Regular ×2        | 165h×£12.50 each        | —                  | £2,062.50 each |
| Sep 2025     | **Holiday (bad)** | 157h×£12.50 = £1,962.50 | 8h×**£9.00** = £72 | **£2,034.50**  |
| Oct 2025     | Makeup            | 165h×£12.50 + 8h×£12.50 | —                  | £2,162.50      |
| Nov 2025     | Regular           | 165h×£12.50 = £2,062.50 | —                  | £2,062.50      |
| Dec 2025     | **Holiday (bad)** | 157h×£12.50 = £1,962.50 | 8h×**£9.00** = £72 | **£2,034.50**  |
| Jan–Feb 2026 | Regular ×2        | 165h×£12.50 each        | —                  | £2,062.50 each |
| Mar 2026     | **Holiday (bad)** | 157h×£12.50 = £1,962.50 | 8h×**£9.00** = £72 | **£2,034.50**  |
| Apr–May 2026 | Regular ×2        | 165h×£12.50 each        | —                  | £2,062.50 each |

### Totals

|                              | Hours      | Pay            |
| ---------------------------- | ---------- | -------------- |
| Basic                        | 2,278h     | £28,475.00     |
| Makeup                       | 16h        | £200.00        |
| Holiday (4 × 8h × **£9.00**) | 32h        | **£288.00**    |
| **Total gross**              | **2,326h** | **£28,963.00** |

Holiday **underpayment** versus correct rate: 4 × 8h × £3.50 = **£112.00**

### Expected Flag Behaviour

| Holiday month       | Prior eligible months                   | Ref available? | Flag expected                                            |
| ------------------- | --------------------------------------- | -------------- | -------------------------------------------------------- |
| Jun 2025 (index 2)  | Apr, May = 2 months                     | No (< 3)       | `holiday_rate_below_basic`                               |
| Sep 2025 (index 5)  | Apr, May, Jul, Aug = 4 months           | Yes            | `holiday_rate_below_rolling_avg` (suppresses basic flag) |
| Dec 2025 (index 8)  | Apr, May, Jul, Aug, Oct, Nov = 6 months | Yes            | `holiday_rate_below_rolling_avg`                         |
| Mar 2026 (index 11) | 8 prior months                          | Yes            | `holiday_rate_below_rolling_avg`                         |

The mixed-month gate now treats the holiday months in this dataset as eligible mostly-working months for later references, because each holiday month still carries 157 basic hours in a pattern where ordinary months carry 165 basic hours. That changes confidence metadata and later entitlement context, but it does not change the stored snapshot flag IDs — the underpayment remains obvious either way.

Rolling average rate (once reference exists): consistently **£12.50/hr**. Holiday rate **£9.00/hr** is £3.50 below — well outside the £0.05/hr tolerance.

---

## Dataset 4 — Zero-Hours Worker, Good Place

**Source:** `payroll_inputs_good_place_zero_hours.json`
**Period:** April 2025 – May 2026 (14 months)
**Fixture directory:** `tests/test_files/report-workflow/fixtures-good-zero-hours`
**Expected snapshot:** `tests/test_files/report-workflow/expected-snapshot-good-zero-hours.json`
**Employee ID:** 0008

Variable hours month-to-month, consistent rate of £12.50/hr throughout, correct holiday rate (£12.50/hr).

### Gross Pay by Month

| Month    | Basic hours      | Holiday          | Gross     |
| -------- | ---------------- | ---------------- | --------- |
| Apr 2025 | 42h = £525.00    | —                | £525.00   |
| May 2025 | 168h = £2,100.00 | —                | £2,100.00 |
| Jun 2025 | 84h = £1,050.00  | 8h×£12.50 = £100 | £1,150.00 |
| Jul 2025 | 21h = £262.50    | —                | £262.50   |
| Aug 2025 | 147h = £1,837.50 | —                | £1,837.50 |
| Sep 2025 | 189h = £2,362.50 | 8h×£12.50 = £100 | £2,462.50 |
| Oct 2025 | 63h = £787.50    | —                | £787.50   |
| Nov 2025 | 210h = £2,625.00 | —                | £2,625.00 |
| Dec 2025 | 126h = £1,575.00 | 8h×£12.50 = £100 | £1,675.00 |
| Jan 2026 | 35h = £437.50    | —                | £437.50   |
| Feb 2026 | 182h = £2,275.00 | —                | £2,275.00 |
| Mar 2026 | 105h = £1,312.50 | 8h×£12.50 = £100 | £1,412.50 |
| Apr 2026 | 77h = £962.50    | —                | £962.50   |
| May 2026 | 154h = £1,925.00 | —                | £1,925.00 |

### Totals

|                           | Hours      | Pay            |
| ------------------------- | ---------- | -------------- |
| Basic                     | 1,603h     | £20,037.50     |
| Holiday (4 × 8h × £12.50) | 32h        | £400.00        |
| **Total gross**           | **1,635h** | **£20,437.50** |

### Low-Earnings Months (NI/PAYE Threshold)

Months below the £1,048.00/month NI/PAYE threshold (< 83.84h at £12.50):

| Month    | Hours | Gross   | Flags expected              |
| -------- | ----- | ------- | --------------------------- |
| Apr 2025 | 42h   | £525.00 | `nat_ins_zero`, `paye_zero` |
| Jul 2025 | 21h   | £262.50 | `nat_ins_zero`, `paye_zero` |
| Oct 2025 | 63h   | £787.50 | `nat_ins_zero`, `paye_zero` |
| Jan 2026 | 35h   | £437.50 | `nat_ins_zero`, `paye_zero` |
| Apr 2026 | 77h   | £962.50 | `nat_ins_zero`, `paye_zero` |

These flags are **correct behaviour** — the worker had no NI or PAYE due those months. They are not holiday rate anomalies. The 14-month tests assert both that no _holiday rate_ flags fire **and** that `nat_ins_zero`/`paye_zero` are present on each of these months.

### 52-Week Rolling Reference

All work is at £12.50/hr. The rolling average rate is **£12.50/hr** regardless of the hours mix. Holiday at £12.50/hr = rolling average → no holiday rate flag on any of the four holiday months.

**Rolling reference before March 2026 holiday** (the most populated reference window):

| Eligible months                                                                   | Basic hours | Basic pay   |
| --------------------------------------------------------------------------------- | ----------- | ----------- |
| Apr(42) + May(168) + Jul(21) + Aug(147) + Oct(63) + Nov(210) + Jan(35) + Feb(182) | **868h**    | **£10,850** |

Average weekly hours: 868h ÷ ~34.6 weeks = **25.09h/week**
Average rate: £10,850 ÷ 868h = **£12.50/hr**

**Statutory entitlement context** (informational):
Annual entitlement for an irregular-hours worker: 5.6 × 25.09h/week = **140.5h/year** (based on the reference window available). Actual holiday taken in fixture = 32h across 14 months ≈ 27.4h annualised — well below entitlement, but the fixture does not attempt to model full takeup.

---

## Dataset 5 — Zero-Hours Worker, Bad Place

**Source:** `payroll_inputs_bad_place_zero_hours.json`
**Period:** April 2025 – May 2026 (14 months)
**Fixture directory:** `tests/test_files/report-workflow/fixtures-bad-zero-hours`
**Expected snapshot:** `tests/test_files/report-workflow/expected-snapshot-bad-zero-hours.json`
**Employee ID:** 0009

Identical to Dataset 4 except holiday paid at **£8.50/hr** — an underpayment of £4.00/hr relative to the basic rate.

### Gross Pay Differences from Dataset 4

| Month    | Good place       | Bad place          | Difference |
| -------- | ---------------- | ------------------ | ---------- |
| Jun 2025 | 8h×£12.50 = £100 | 8h×**£8.50** = £68 | −£32       |
| Sep 2025 | 8h×£12.50 = £100 | 8h×**£8.50** = £68 | −£32       |
| Dec 2025 | 8h×£12.50 = £100 | 8h×**£8.50** = £68 | −£32       |
| Mar 2026 | 8h×£12.50 = £100 | 8h×**£8.50** = £68 | −£32       |

|                              | Hours      | Pay            |
| ---------------------------- | ---------- | -------------- |
| Basic                        | 1,603h     | £20,037.50     |
| Holiday (4 × 8h × **£8.50**) | 32h        | **£272.00**    |
| **Total gross**              | **1,635h** | **£20,309.50** |

Total holiday **underpayment**: £400 − £272 = **£128.00** (£32 per period × 4 periods)

### Expected Flag Behaviour

| Holiday month | Prior eligible months            | Ref available? | Flag expected                    |
| ------------- | -------------------------------- | -------------- | -------------------------------- |
| Jun 2025      | Apr(42h), May(168h) = 2          | No (< 3)       | `holiday_rate_below_basic`       |
| Sep 2025      | Apr, May, Jul, Aug = 4           | Yes            | `holiday_rate_below_rolling_avg` |
| Dec 2025      | Apr, May, Jul, Aug, Oct, Nov = 6 | Yes            | `holiday_rate_below_rolling_avg` |
| Mar 2026      | 8 prior months                   | Yes            | `holiday_rate_below_rolling_avg` |

The mixed-month gate also admits the holiday months in this dataset into later rolling references, because their remaining basic hours are still close to the worker's expected hours for the month. As with Dataset 3, this leaves the stored snapshot flag IDs unchanged and mainly affects confidence signalling and rolling-context calculations elsewhere in the report.

Rolling average rate (once reference exists): **£12.50/hr**.
Holiday rate **£8.50/hr** is £4.00 below — well outside the £0.05/hr tolerance.

**Note on June 2025 (first holiday month):** Only 2 prior eligible months exist, so `buildRollingReference` returns `null`. The system falls back to Signal A (`holiday_rate_below_basic`), comparing £8.50 directly against the basic rate on the June payslip (£12.50). £12.50 − £8.50 = £4.00 > £0.05 tolerance → flag fires.

---

## Cross-Dataset Holiday Underpayment Summary

| Dataset            | Holiday rate | Correct rate | Underpayment/period  | Total underpayment (4 periods) |
| ------------------ | ------------ | ------------ | -------------------- | ------------------------------ |
| Predictable — Good | £12.50/hr    | £12.50/hr    | £0                   | £0                             |
| Predictable — Bad  | £9.00/hr     | £12.50/hr    | 8h × £3.50 = **£28** | **£112**                       |
| Zero-Hours — Good  | £12.50/hr    | £12.50/hr    | £0                   | £0                             |
| Zero-Hours — Bad   | £8.50/hr     | £12.50/hr    | 8h × £4.00 = **£32** | **£128**                       |
