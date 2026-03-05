/**
 * @typedef {Object} ParserPatterns
 * @property {RegExp} nameDateId
 * @property {RegExp} employeeNo
 * @property {RegExp} employerLine
 * @property {RegExp} basicLine
 * @property {RegExp} holidayLabel
 * @property {RegExp} basicSalaryLine
 * @property {RegExp} holidaySalaryLine
 * @property {RegExp} payeTax
 * @property {RegExp} natIns
 * @property {RegExp} pensionEe
 * @property {RegExp} pensionEr
 * @property {RegExp} taxCode
 * @property {RegExp} payRun
 * @property {RegExp} payMethod
 * @property {RegExp} earningsNi
 * @property {RegExp} grossTax
 * @property {RegExp} totalGrossPay
 * @property {RegExp} payCycle
 * @property {RegExp} totalGrossPayTd
 * @property {RegExp} grossTaxTd
 * @property {RegExp} taxPaidTd
 * @property {RegExp} earningsNiTd
 * @property {RegExp} niTd
 * @property {RegExp} pensionEeTd
 * @property {RegExp} pensionErTd
 * @property {RegExp} netPay
 */

/** @type {ParserPatterns} */
export const PATTERNS = {
    // <generated from labels.json — do not edit this section manually>
    // PAYE tax deduction amount.
    payeTax: /PAYE\s+Tax\s+([\d,]+\.\d{2})/i,
    // National Insurance deduction amount (current period). Negative lookahead (?!TD) prevents matching the TD variant on the same line.
    natIns: /National\s+Insurance\s+(?!TD)([\d,]+\.\d{2})/i,
    // Employee pension contribution.
    pensionEe: /NEST\s+Corporation\s*-\s*EE\s+([\d,]+\.\d{2})/i,
    // Employer pension contribution.
    pensionEr: /NEST\s+Corporation\s*-\s*ER\s+([\d,]+\.\d{2})/i,
    // Tax code.
    taxCode: /Tax\s+Code:\s*([A-Z0-9]+)/i,
    // Pay run label.
    payRun: /Pay\s+Run:\s*([A-Za-z]+\s+\d+)/i,
    // Pay method label.
    payMethod: /Pay\s+Method:\s*([A-Za-z\s]+)/i,
    // Earnings for NI (current period). Negative lookahead (?!TD) prevents matching the TD variant.
    earningsNi: /Earnings\s+for\s+NI\s+(?!TD)([\d,]+\.\d{2})/i,
    // Gross for tax (current period). Negative lookahead (?!TD) prevents matching the TD variant.
    grossTax: /Gross\s+for\s+Tax\s+(?!TD)([\d,]+\.\d{2})/i,
    // Total gross pay (current period). Negative lookahead (?!TD) prevents matching the TD variant.
    totalGrossPay: /Total\s+Gross\s+Pay\s+(?!TD)([\d,]+\.\d{2})/i,
    // Pay cycle label.
    payCycle: /Pay\s+Cycle\s+([A-Za-z]+)/i,
    // Total gross pay TD.
    totalGrossPayTd: /Total\s+Gross\s+Pay\s+TD\s+([\d,]+\.\d{2})/i,
    // Gross for tax TD.
    grossTaxTd: /Gross\s+for\s+Tax\s+TD\s+([\d,]+\.\d{2})/i,
    // Tax paid TD.
    taxPaidTd: /Tax\s+Paid\s+TD\s+([\d,]+\.\d{2})/i,
    // Earnings for NI TD.
    earningsNiTd: /Earnings\s+for\s+NI\s+TD\s+([\d,]+\.\d{2})/i,
    // National Insurance TD.
    niTd: /National\s+Insurance\s+TD\s+([\d,]+\.\d{2})/i,
    // Employee pension TD (inc AVC).
    pensionEeTd: /Ee\s+Pension\s+TD\s+\(inc\s+AVC\)\s+([\d,]+\.\d{2})/i,
    // Employer pension TD.
    pensionErTd: /Employers\s+Pension\s+TD\s+([\d,]+\.\d{2})/i,
    // </generated>
    // Employee name, pay date, and optional NI number.
    nameDateId:
        /^(?:\d+\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)+)\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d(?:\s*\d){3})(?:\s+([A-Za-z]{2}\s*\d{2}\s*\d{2}\s*\d{2}\s*[A-Za-z]))?\s*$/m,
    // Employee number/ID.
    employeeNo: /Employee\s+No\.?\s*:?\s*(\w+)/i,
    // Employer legal line (Ltd/Limited).
    employerLine: /^([A-Za-z0-9 &'.,-]+(?:Ltd|Limited))\s*$/m,
    // Basic hours line (units, rate, amount).
    basicLine:
        /Basic\s+Hours\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i,
    // Holiday hours line (units, rate, amount).
    holidayLabel:
        /Holidays\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i,
    // Basic salary amount.
    basicSalaryLine: /Basic\s+Salary\s+([\d,]+\.\d{2})/i,
    // Holiday salary amount.
    holidaySalaryLine: /Holiday\s+Salary\s+([\d,]+\.\d{2})/i,
    // Net pay amount on pay method line.
    netPay: /Pay\s+Method:\s*[A-Za-z\s]+\s+([\d,]+\.\d{2})\s*$/m,
}
