const PATTERNS = {
  nameDateId: /^([A-Za-z]+(?:\s+[A-Za-z]+)+)\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})(?:\s+(\w+))?\s*$/m,
  employerLine: /^([A-Za-z0-9\s&',.\-]+(?:Ltd|Limited))\s*$/m,
  basicLine:
    /Basic\s+Hours\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i,
  holidayLine:
    /Holidays\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i,
  payeTax: /PAYE\s+Tax\s+([\d,]+\.\d{2})/i,
  nationalInsurance: /National\s+Insurance\s+(?!TD)([\d,]+\.\d{2})/i,
  nestEmployee: /NEST\s+Corporation\s*-\s*EE\s+([\d,]+\.\d{2})/i,
  nestEmployer: /NEST\s+Corporation\s*-\s*ER\s+([\d,]+\.\d{2})/i,
  earningsForNI: /Earnings\s+for\s+NI\s+([\d,]+\.\d{2})/i,
  grossForTax: /Gross\s+for\s+Tax\s+([\d,]+\.\d{2})/i,
  totalGrossPay: /Total\s+Gross\s+Pay\s+([\d,]+\.\d{2})/i,
  payCycle: /Pay\s+Cycle\s+([A-Za-z]+)/i,
  totalGrossPayTD: /Total\s+Gross\s+Pay\s+TD\s+([\d,]+\.\d{2})/i,
  grossForTaxTD: /Gross\s+for\s+Tax\s+TD\s+([\d,]+\.\d{2})/i,
  taxPaidTD: /Tax\s+Paid\s+TD\s+([\d,]+\.\d{2})/i,
  earningsForNITD: /Earnings\s+for\s+NI\s+TD\s+([\d,]+\.\d{2})/i,
  nationalInsuranceTD: /National\s+Insurance\s+TD\s+([\d,]+\.\d{2})/i,
  employeePensionTD: /Ee\s+Pension\s+TD\s+\(inc\s+AVC\)\s+([\d,]+\.\d{2})/i,
  employerPensionTD: /Employers\s+Pension\s+TD\s+([\d,]+\.\d{2})/i,
  pensionsAdjustment: /pensions\s*adjustment\s+£?([\d,]+\.?\d*)/i,
  corrections: /Corrections?\s+£?([\d,]+\.?\d*)/i,
  netPay: /Pay\s+Method:\s*[A-Za-z\s]+\s+([\d,]+\.\d{2})\s*$/m
};

function formatMonthLabel(monthIndex) {
  return new Date(2024, monthIndex - 1, 1).toLocaleDateString("en-GB", {
    month: "long"
  });
}

function getMissingMonths(entries) {
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

function buildMissingMonthsLabel(missingByYear) {
  const entries = Object.entries(missingByYear).filter(([, months]) => months.length);
  if (!entries.length) {
    return "None";
  }
  return entries
    .map(([year, months]) => `${year}: ${months.join(", ")}`)
    .join(" | ");
}

function buildMissingMonthsHtml(missingByYear) {
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

function buildMissingMonthsHtmlForYear(months) {
  if (!months.length) {
    return "<span class=\"missing-none\">None</span>";
  }
  return months
    .map((month) => `<span class=\"missing-pill\">${month}</span>`)
    .join("");
}
