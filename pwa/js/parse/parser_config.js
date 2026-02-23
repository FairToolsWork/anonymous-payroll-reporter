/**
 * @typedef {Record<string, string[]>} MissingMonthsByYear
 * @typedef {{ monthIndex: number }} MonthEntry
 * @typedef {Object} ParserPatterns
 * @property {RegExp} nameDateId
 * @property {RegExp} employeeNo
 * @property {RegExp} employerLine
 * @property {RegExp} basicLine
 * @property {RegExp} holidayLine
 * @property {RegExp} basicSalaryLine
 * @property {RegExp} holidaySalaryLine
 * @property {RegExp} payeTax
 * @property {RegExp} nationalInsurance
 * @property {RegExp} nestEmployee
 * @property {RegExp} nestEmployer
 * @property {RegExp} taxCode
 * @property {RegExp} payRun
 * @property {RegExp} payMethod
 * @property {RegExp} earningsForNI
 * @property {RegExp} grossForTax
 * @property {RegExp} totalGrossPay
 * @property {RegExp} payCycle
 * @property {RegExp} totalGrossPayTD
 * @property {RegExp} grossForTaxTD
 * @property {RegExp} taxPaidTD
 * @property {RegExp} earningsForNITD
 * @property {RegExp} nationalInsuranceTD
 * @property {RegExp} employeePensionTD
 * @property {RegExp} employerPensionTD
 * @property {RegExp} netPay
 */

/** @type {ParserPatterns} */
export const PATTERNS = {
  // Employee name, pay date, and optional NI number.
  nameDateId: /^([A-Za-z]+(?:\s+[A-Za-z]+)+)\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d(?:\s*\d){3})(?:\s+([A-Za-z]{2}\s*\d{2}\s*\d{2}\s*\d{2}\s*[A-Za-z]))?\s*$/m,
  // Employee number/ID.
  employeeNo: /Employee\s+No\.?\s*:?\s*(\w+)/i,
  // Employer legal line (Ltd/Limited).
  employerLine: /^([A-Za-z0-9 &'.,\-]+(?:Ltd|Limited))\s*$/m,
  // Basic hours line (units, rate, amount).
  basicLine:
    /Basic\s+Hours\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i,
  // Holiday hours line (units, rate, amount).
  holidayLine:
    /Holidays\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i,
  // Basic salary amount.
  basicSalaryLine: /Basic\s+Salary\s+([\d,]+\.\d{2})/i,
  // Holiday salary amount.
  holidaySalaryLine: /Holiday\s+Salary\s+([\d,]+\.\d{2})/i,
  // PAYE tax deduction amount.
  payeTax: /PAYE\s+Tax\s+([\d,]+\.\d{2})/i,
  // National Insurance deduction amount (current period).
  nationalInsurance: /National\s+Insurance\s+(?!TD)([\d,]+\.\d{2})/i,
  // NEST employee pension contribution.
  nestEmployee: /NEST\s+Corporation\s*-\s*EE\s+([\d,]+\.\d{2})/i,
  // NEST employer pension contribution.
  nestEmployer: /NEST\s+Corporation\s*-\s*ER\s+([\d,]+\.\d{2})/i,
  // Tax code.
  taxCode: /Tax\s+Code:\s*([A-Z0-9]+)/i,
  // Pay run label.
  payRun: /Pay\s+Run:\s*([A-Za-z]+\s+\d+)/i,
  // Pay method label.
  payMethod: /Pay\s+Method:\s*([A-Za-z\s]+)/i,
  // Earnings for NI (current period).
  earningsForNI: /Earnings\s+for\s+NI\s+([\d,]+\.\d{2})/i,
  // Gross for tax (current period).
  grossForTax: /Gross\s+for\s+Tax\s+([\d,]+\.\d{2})/i,
  // Total gross pay (current period).
  totalGrossPay: /Total\s+Gross\s+Pay\s+([\d,]+\.\d{2})/i,
  // Pay cycle label.
  payCycle: /Pay\s+Cycle\s+([A-Za-z]+)/i,
  // Total gross pay TD.
  totalGrossPayTD: /Total\s+Gross\s+Pay\s+TD\s+([\d,]+\.\d{2})/i,
  // Gross for tax TD.
  grossForTaxTD: /Gross\s+for\s+Tax\s+TD\s+([\d,]+\.\d{2})/i,
  // Tax paid TD.
  taxPaidTD: /Tax\s+Paid\s+TD\s+([\d,]+\.\d{2})/i,
  // Earnings for NI TD.
  earningsForNITD: /Earnings\s+for\s+NI\s+TD\s+([\d,]+\.\d{2})/i,
  // National Insurance TD.
  nationalInsuranceTD: /National\s+Insurance\s+TD\s+([\d,]+\.\d{2})/i,
  // Employee pension TD (inc AVC).
  employeePensionTD: /Ee\s+Pension\s+TD\s+\(inc\s+AVC\)\s+([\d,]+\.\d{2})/i,
  // Employer pension TD.
  employerPensionTD: /Employers\s+Pension\s+TD\s+([\d,]+\.\d{2})/i,
  // Net pay amount on pay method line.
  netPay: /Pay\s+Method:\s*[A-Za-z\s]+\s+([\d,]+\.\d{2})\s*$/m
};

/**
 * @param {number} monthIndex
 * @returns {string}
 */
export function formatMonthLabel(monthIndex) {
  return new Date(2024, monthIndex - 1, 1).toLocaleDateString("en-GB", {
    month: "long"
  });
}

/**
 * @param {MonthEntry[]} entries
 * @returns {string[]}
 */
export function getMissingMonths(entries) {
  const monthIndexes = entries
    .map((entry) => entry.monthIndex)
    .filter((month) => month >= 1 && month <= 12);
  if (!monthIndexes.length) {
    return [];
  }
  const minMonth = Math.min(...monthIndexes);
  const maxMonth = Math.max(...monthIndexes);
  const present = new Set(monthIndexes);
  const missing = [];
  for (let month = minMonth; month <= maxMonth; month += 1) {
    if (!present.has(month)) {
      missing.push(formatMonthLabel(month));
    }
  }
  return missing;
}

/**
 * @param {MissingMonthsByYear} missingByYear
 * @returns {string}
 */
export function buildMissingMonthsLabel(missingByYear) {
  const entries = Object.entries(missingByYear).filter(([, months]) => months.length);
  if (!entries.length) {
    return "None";
  }
  return entries
    .map(([year, months]) => `${year}: ${months.join(", ")}`)
    .join(" | ");
}

/**
 * @param {MissingMonthsByYear} missingByYear
 * @returns {string}
 */
export function buildMissingMonthsHtml(missingByYear) {
  const entries = Object.entries(missingByYear).filter(([, months]) => months.length);
  if (!entries.length) {
    return "<span class=\"missing-none\">None</span>";
  }
  return entries
    .map(([year, months]) => {
      const pills = months
        .map((month) => `<span class=\"missing-pill\">${month}</span>`)
        .join("");
      return `<span class=\"missing-group\"><span class=\"missing-year\">${year}</span>${pills}</span>`;
    })
    .join("");
}

/**
 * @param {string[]} months
 * @returns {string}
 */
export function buildMissingMonthsHtmlForYear(months) {
  if (!months.length) {
    return "<span class=\"missing-none\">None</span>";
  }
  return months
    .map((month) => `<span class=\"missing-pill\">${month}</span>`)
    .join("");
}
