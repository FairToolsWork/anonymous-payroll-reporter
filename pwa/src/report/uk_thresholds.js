/**
 * UK tax and payroll thresholds used by report calculations and notices.
 *
 * Keep these values synchronized with each UK tax year update.
 */

/** Annual Personal Allowance (£) for PAYE context text and low-pay notices.
 * https://www.gov.uk/income-tax-rates
 */
export const PERSONAL_ALLOWANCE_ANNUAL = 12570

/** Rounded monthly allowance equivalent used by existing monthly threshold checks. */
export const PERSONAL_ALLOWANCE_MONTHLY = Math.round(
    PERSONAL_ALLOWANCE_ANNUAL / 12
)

/** Default staleness threshold for contribution recency displays.
 * https://www.moneyhelper.org.uk/en/pensions-and-retirement/pension-problems/complaining-about-delays-to-your-pension#When-must-my-employer-make-my-pension-contributions-by--
 */
export const CONTRIBUTION_RECENCY_DAYS_THRESHOLD = 22

/** Pension qualifying earnings bands for UK auto-enrolment context.
 * https://www.moneyhelper.org.uk/en/pensions-and-retirement/pensions-basics/automatic-enrolment-an-introduction
 */
export const PENSION_AUTO_ENROLMENT_TRIGGER = 10000
export const PENSION_QUALIFYING_EARNINGS_LOWER = 6240
export const PENSION_QUALIFYING_EARNINGS_UPPER = 50270

/** Holiday pay tolerance (£/hr) used for rate comparison warnings.
 * This is our own internal threshold to allow for minor discrepancies
 * in rate calculations and rounding, not an official HMRC figure.
 */
export const HOLIDAY_RATE_TOLERANCE = 0.05

/** Tax year starts on 6 April in the UK tax calendar. */
export const TAX_YEAR_START_MONTH_INDEX = 3
export const TAX_YEAR_START_DAY = 6

/** Leave years starting on/after this date use 12.07% accrual for variable work patterns.
 * https://www.gov.uk/holiday-entitlement-rights/holiday-entitlement-for-workers-with-variable-hours
 */
export const HOLIDAY_ACCRUAL_CUTOFF = new Date(2024, 3, 1)
