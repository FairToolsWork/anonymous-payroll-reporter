/**
 * Payroll parsing types.
 */

/**
 * @typedef {Object} PayrollAddress
 * @property {string|null} street
 * @property {string|null} city
 * @property {string|null} administrativeArea
 * @property {string|null} postalCode
 */

/**
 * @typedef {Object} PayrollEmployee
 * @property {string|null} id
 * @property {string|null} name
 * @property {string|null} natInsNumber
 * @property {PayrollAddress} address
 */

/**
 * @typedef {Object} PayrollPayItem
 * @property {string} title
 * @property {number|null} units
 * @property {number|null} rate
 * @property {number|null} amount
 */

/**
 * @typedef {Object} PayrollHourlyPayments
 * @property {PayrollPayItem} basic
 * @property {PayrollPayItem} holiday
 */

/**
 * @typedef {Object} PayrollSalaryPayItem
 * @property {string} title
 * @property {number|null} amount
 */

/**
 * @typedef {Object} PayrollSalaryHoliday
 * @property {string} title
 * @property {number} units
 * @property {number} rate
 * @property {number} amount
 */

/**
 * @typedef {Object} PayrollSalaryPayments
 * @property {PayrollSalaryPayItem} basic
 * @property {PayrollSalaryHoliday} holiday
 */

/**
 * @typedef {Object} PayrollPayments
 * @property {PayrollHourlyPayments} hourly
 * @property {PayrollSalaryPayments} salary
 * @property {PayrollPayItem[]} misc
 */

/**
 * @typedef {Object} PayrollDeduction
 * @property {string} title
 * @property {number} amount
 */

/**
 * @typedef {Object} PayrollMiscDeduction
 * @property {string} title
 * @property {number|null} units
 * @property {number|null} rate
 * @property {number} amount
 */

/**
 * @typedef {Object} PayrollDeductions
 * @property {PayrollDeduction} payeTax
 * @property {PayrollDeduction} natIns
 * @property {PayrollDeduction} pensionEE
 * @property {PayrollDeduction} pensionER
 * @property {PayrollMiscDeduction[]} misc
 */

/**
 * @typedef {Object} PayrollDateField
 * @property {string} title
 * @property {string|null} date
 */

/**
 * @typedef {Object} PayrollTaxCode
 * @property {string} title
 * @property {string|null} code
 */

/**
 * @typedef {Object} PayrollPayMethod
 * @property {string} title
 * @property {string|null} method
 */

/**
 * @typedef {Object} PayrollPayRun
 * @property {string} title
 * @property {string|null} run
 */

/**
 * @typedef {Object} PayrollAmountField
 * @property {string} title
 * @property {number} amount
 */

/**
 * @typedef {Object} PayrollCycle
 * @property {string} title
 * @property {string|null} cycle
 */

/**
 * @typedef {Object} PayrollThisPeriod
 * @property {PayrollAmountField} earningsNI
 * @property {PayrollAmountField} grossForTax
 * @property {PayrollAmountField} totalGrossPay
 * @property {PayrollCycle} payCycle
 */

/**
 * @typedef {Object} PayrollYearToDate
 * @property {number} totalGrossPayTD
 * @property {number} grossForTaxTD
 * @property {number} taxPaidTD
 * @property {number} earningsForNITD
 * @property {number} nationalInsuranceTD
 * @property {number} employeePensionTD_AVC
 * @property {number} employerPensionTD
 */

/**
 * @typedef {Object} PayrollNetPay
 * @property {string} title
 * @property {number} amount
 */

/**
 * @typedef {Object} PayrollDocument
 * @property {PayrollDateField} processDate
 * @property {PayrollTaxCode} taxCode
 * @property {PayrollPayMethod} payMethod
 * @property {PayrollPayRun} payRun
 * @property {PayrollPayments} payments
 * @property {PayrollDeductions} deductions
 * @property {PayrollThisPeriod} thisPeriod
 * @property {PayrollYearToDate} yearToDate
 * @property {PayrollNetPay} netPay
 */

/**
 * @typedef {Object} PayrollRecord
 * @property {PayrollEmployee} employee
 * @property {string|null} employer
 * @property {PayrollDocument} payrollDoc
 */

export {}
