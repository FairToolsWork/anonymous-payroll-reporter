const DATE_MONTHS = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11
};

function parsePayPeriodStart(payPeriod) {
  if (!payPeriod) {
    return null;
  }
  const startSegment = payPeriod.split("-")[0].trim();
  return parseDateValue(startSegment);
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }
  const numericMatch = value.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (numericMatch) {
    const day = parseInt(numericMatch[1], 10);
    const month = parseInt(numericMatch[2], 10) - 1;
    let year = parseInt(numericMatch[3], 10);
    if (year < 100) {
      year += 2000;
    }
    const parsed = new Date(year, month, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const longMatch = value.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (longMatch) {
    const day = parseInt(longMatch[1], 10);
    const monthKey = longMatch[2].toLowerCase();
    const month = DATE_MONTHS[monthKey];
    const year = parseInt(longMatch[3], 10);
    if (month !== undefined) {
      const parsed = new Date(year, month, day);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  const monthYearMatch = value.match(/([A-Za-z]{3,})\s+(\d{4})/);
  if (monthYearMatch) {
    const monthKey = monthYearMatch[1].toLowerCase();
    const month = DATE_MONTHS[monthKey];
    const year = parseInt(monthYearMatch[2], 10);
    if (month !== undefined) {
      const parsed = new Date(year, month, 1);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return null;
}

function formatDateLabel(date) {
  if (!date) {
    return "Unknown";
  }
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatDateKey(date) {
  if (!date) {
    return "unknown";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function formatTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function formatCurrency(value) {
  return `£${value.toFixed(2)}`;
}

function formatDeduction(value) {
  return `-£${Math.abs(value).toFixed(2)}`;
}

function sumMiscAmounts(items) {
  if (!items || !items.length) {
    return 0;
  }
  return items.reduce((sum, item) => sum + (item.amount || 0), 0);
}

function formatMiscLabel(item) {
  if (!item) {
    return "";
  }
  const label = item.label || item.title || "";
  if (item.units === null || item.rate === null) {
    return label;
  }
  return `${label} (${item.units.toFixed(2)} @ ${formatCurrency(item.rate)})`;
}

function buildMissingMonthsWithRange(presentMonths, minMonth, maxMonth) {
  if (!presentMonths.length || minMonth === null || maxMonth === null) {
    return [];
  }
  const present = new Set(presentMonths);
  const missing = [];
  for (let month = minMonth; month <= maxMonth; month += 1) {
    if (!present.has(month)) {
      missing.push(formatMonthLabel(month));
    }
  }
  return missing;
}

function buildReport(records, failedPayPeriods = []) {
  const entries = records.map((record) => {
    const parsedDate = parsePayPeriodStart(record.payrollDoc?.processDate?.date);
    const year = parsedDate ? parsedDate.getFullYear() : null;
    const monthIndex = parsedDate ? parsedDate.getMonth() + 1 : 13;
    const monthLabel = parsedDate
      ? parsedDate.toLocaleDateString("en-GB", { month: "long" })
      : "Unknown";
    return {
      record,
      parsedDate,
      year,
      monthIndex,
      monthLabel
    };
  });

  entries.sort((a, b) => {
    const yearA = a.year ?? 9999;
    const yearB = b.year ?? 9999;
    if (yearA !== yearB) {
      return yearA - yearB;
    }
    if (a.monthIndex !== b.monthIndex) {
      return a.monthIndex - b.monthIndex;
    }
    const fallbackA = a.record.payrollDoc?.processDate?.date || "Unknown";
    const fallbackB = b.record.payrollDoc?.processDate?.date || "Unknown";
    return fallbackA.localeCompare(fallbackB);
  });

  const yearGroups = new Map();
  entries.forEach((entry) => {
    const key = entry.year ?? "Unknown";
    if (!yearGroups.has(key)) {
      yearGroups.set(key, []);
    }
    yearGroups.get(key).push(entry);
  });

  const parsedDates = entries
    .map((entry) => entry.parsedDate)
    .filter((date) => date instanceof Date);
  const failedDates = failedPayPeriods
    .map((period) => parsePayPeriodStart(period))
    .filter((date) => date instanceof Date);
  const rangeDates = parsedDates.concat(failedDates);
  const rangeStart = rangeDates.length ? new Date(Math.min(...rangeDates)) : null;
  const rangeEnd = rangeDates.length ? new Date(Math.max(...rangeDates)) : null;
  const dateRangeLabel = rangeStart && rangeEnd
    ? `${formatDateLabel(rangeStart)} – ${formatDateLabel(rangeEnd)}`
    : "Unknown";

  const employeeName = records[0].employee?.name || "Unknown";
  const reportSections = [];
  const miscFootnotes = [];

  const failedMonthsByYear = {};
  failedDates.forEach((date) => {
    const yearKey = date.getFullYear();
    const monthIndex = date.getMonth() + 1;
    if (!failedMonthsByYear[yearKey]) {
      failedMonthsByYear[yearKey] = [];
    }
    if (!failedMonthsByYear[yearKey].includes(monthIndex)) {
      failedMonthsByYear[yearKey].push(monthIndex);
    }
  });

  const missingMonthsByYear = {};
  yearGroups.forEach((entriesForYear, yearKey) => {
    const presentMonths = entriesForYear
      .map((entry) => entry.monthIndex)
      .filter((month) => month >= 1 && month <= 12);
    const failedMonths = failedMonthsByYear[yearKey] || [];
    const combinedMonths = presentMonths.concat(failedMonths);
    if (!combinedMonths.length) {
      missingMonthsByYear[yearKey] = [];
      return;
    }
    const minMonth = Math.min(...combinedMonths);
    const maxMonth = Math.max(...combinedMonths);
    missingMonthsByYear[yearKey] = buildMissingMonthsWithRange(
      presentMonths,
      minMonth,
      maxMonth
    );
  });
  const missingMonthsLabel = buildMissingMonthsLabel(missingMonthsByYear);
  const missingMonthsHtml = buildMissingMonthsHtml(missingMonthsByYear);
  const missingMonthsPill = `Missing months: <span class="missing-months">${missingMonthsHtml}</span>`;
  const hasMissingMonths = Object.values(missingMonthsByYear).some(
    (months) => months.length
  );

  reportSections.push(
    `<div class="report-meta"><h2>Payroll Report - ${employeeName}</h2>` +
      `<p class="report-range">${dateRangeLabel}</p>` +
      (hasMissingMonths
        ? `<div class="report-missing">${missingMonthsPill}</div>`
        : "") +
      "</div>"
  );

  let totalNestEmployee = 0;
  let totalNestEmployer = 0;
  let totalMiscPayments = 0;
  let totalMiscDeductions = 0;

  Array.from(yearGroups.keys()).forEach((yearKey) => {
    const entriesForYear = yearGroups.get(yearKey);
    const yearLabel = yearKey === "Unknown" ? "Unknown Year" : yearKey;
    const yearMissing = missingMonthsByYear[yearKey] || [];
    const yearMissingHtml = buildMissingMonthsHtmlForYear(yearMissing);
    const yearMissingPill = `Missing months: <span class="missing-months">${yearMissingHtml}</span>`;

    entriesForYear.forEach((entry) => {
      const miscPayments = entry.record.payrollDoc?.payments?.misc || [];
      const miscDeductions = entry.record.payrollDoc?.deductions?.misc || [];
      const dateLabel = entry.parsedDate
        ? formatDateLabel(entry.parsedDate)
        : entry.record.payrollDoc?.processDate?.date || "Unknown";

      miscPayments.forEach((item) => {
        miscFootnotes.push({
          type: "payment",
          dateLabel,
          item
        });
      });
      miscDeductions.forEach((item) => {
        miscFootnotes.push({
          type: "deduction",
          dateLabel,
          item
        });
      });

      reportSections.push("<div class=\"page\">");
      reportSections.push(renderReportCell(entry));
      reportSections.push("</div>");
    });

    reportSections.push("<div class=\"page\">");
    reportSections.push(`<h2>${yearLabel} Summary: ${employeeName}</h2>`);
    if (yearMissing.length) {
      reportSections.push(`<p class="report-missing">${yearMissingPill}</p>`);
    }
    reportSections.push(renderYearSummary(entriesForYear));
    reportSections.push("</div>");

    const totals = entriesForYear.reduce(
      (acc, entry) => {
        acc.nestEmployee += entry.record.payrollDoc?.deductions?.nestEE?.amount || 0;
        acc.nestEmployer += entry.record.payrollDoc?.deductions?.nestER?.amount || 0;
        acc.miscPayments += sumMiscAmounts(entry.record.payrollDoc?.payments?.misc || []);
        acc.miscDeductions += sumMiscAmounts(entry.record.payrollDoc?.deductions?.misc || []);
        return acc;
      },
      {
        nestEmployee: 0,
        nestEmployer: 0,
        miscPayments: 0,
        miscDeductions: 0
      }
    );

    totalNestEmployee += totals.nestEmployee;
    totalNestEmployer += totals.nestEmployer;
    totalMiscPayments += totals.miscPayments;
    totalMiscDeductions += totals.miscDeductions;
  });

  const totalCombined = totalNestEmployee + totalNestEmployer;

  reportSections.push("<div class=\"page\">");
  reportSections.push(
    `<h2>Summary Totals: ${employeeName} (${dateRangeLabel})</h2>`
  );
  reportSections.push(
    "<table class=\"summary-table\"><thead><tr>" +
      "<th>NEST Corp - EE</th><th>NEST Corp - ER</th>" +
      "<th>Misc Earnings†</th><th>Misc Deductions†</th>" +
      "<th>Total Contribution</th></tr></thead>" +
      "<tbody><tr>" +
      `<td>${formatCurrency(totalNestEmployee)}</td>` +
      `<td>${formatCurrency(totalNestEmployer)}</td>` +
      `<td>${formatCurrency(totalMiscPayments)}</td>` +
      `<td>${formatDeduction(totalMiscDeductions)}</td>` +
      `<td>${formatCurrency(totalCombined)}</td>` +
      "</tr></tbody></table>"
  );
  reportSections.push("</div>");

  if (miscFootnotes.length) {
    const footnoteItems = miscFootnotes
      .map((entry) => {
        const typeLabel = entry.type === "deduction" ? "Deduction" : "Payment";
        const amountLabel =
          entry.type === "deduction"
            ? formatDeduction(entry.item.amount)
            : formatCurrency(entry.item.amount);
        const itemLabel = entry.item.label || entry.item.title || "";
        const detailLabel =
          entry.item.units === null || entry.item.rate === null
            ? "flat"
            : `${entry.item.units.toFixed(2)} @ ${formatCurrency(entry.item.rate)}`;
        return (
          `<li>${entry.dateLabel}: ${typeLabel}: ${itemLabel} ` +
          `(${detailLabel}): ${amountLabel}</li>`
        );
      })
      .join("");
    reportSections.push(
      `<div class=\"report-footnote\">` +
        "<p>† Misc entries</p>" +
        `<ul>${footnoteItems}</ul>` +
        "</div>"
    );
  }

  const timestamp = formatTimestamp(new Date());
  const dateStart = rangeStart ? formatDateKey(rangeStart) : "unknown";
  const dateFinish = rangeEnd ? formatDateKey(rangeEnd) : "unknown";
  const employeeSlug = employeeName.trim().replace(/\s+/g, "-");
  const filename = `${timestamp}-${employeeSlug}_${dateStart}-${dateFinish}.pdf`;

  return {
    html: reportSections.join("\n"),
    filename,
    stats: {
      dateRangeLabel,
      missingMonthsLabel,
      missingMonthsHtml,
      missingMonthsByYear
    }
  };
}

function renderReportCell(entry) {
  const record = entry.record;
  const parsedDate = entry.parsedDate;
  const dateLabel = parsedDate
    ? formatDateLabel(parsedDate)
    : record.payrollDoc?.processDate?.date || "Unknown";
  const natInsNumber = record.employee?.natInsNumber || "Unknown";
  const combined =
    (record.payrollDoc?.deductions?.nestEE?.amount || 0) +
    (record.payrollDoc?.deductions?.nestER?.amount || 0);
  const imageHtml = record.imageData
    ? `<img class="report-image" src="${record.imageData}" alt="${dateLabel}" />`
    : "";
  const hourlyPayments = record.payrollDoc?.payments?.hourly || {};
  const basicHours = hourlyPayments.basic?.units || 0;
  const basicRate = hourlyPayments.basic?.rate || 0;
  const basicAmount = hourlyPayments.basic?.amount || 0;
  const holidayHours = hourlyPayments.holiday?.units || 0;
  const holidayRate = hourlyPayments.holiday?.rate || 0;
  const holidayAmount = hourlyPayments.holiday?.amount || 0;
  const salaryPayments = record.payrollDoc?.payments?.salary || {};
  const basicSalaryAmount = salaryPayments.basic?.amount ?? null;
  const holidaySalaryUnits = salaryPayments.holiday?.units ?? null;
  const holidaySalaryRate = salaryPayments.holiday?.rate ?? null;
  const holidaySalaryAmount = salaryPayments.holiday?.amount ?? null;
  const miscPayments = record.payrollDoc?.payments?.misc || [];
  const miscDeductions = record.payrollDoc?.deductions?.misc || [];
  const payeTax = record.payrollDoc?.deductions?.payeTax?.amount || 0;
  const nationalInsurance = record.payrollDoc?.deductions?.natIns?.amount || 0;
  const nestEmployee = record.payrollDoc?.deductions?.nestEE?.amount || 0;
  const nestEmployer = record.payrollDoc?.deductions?.nestER?.amount || 0;
  const netPay = record.payrollDoc?.netPay?.amount || 0;
  const hasHolidayHourly = [holidayHours, holidayRate, holidayAmount].some(
    (value) => value !== null && value !== 0
  );
  const hasHolidaySalary = [
    holidaySalaryUnits,
    holidaySalaryRate,
    holidaySalaryAmount
  ].some((value) => value !== null && value !== 0);
  const corePaymentRows = [];
  if (basicHours || basicRate || basicAmount) {
    corePaymentRows.push({
      label: "Basic Hours",
      units: basicHours,
      rate: basicRate,
      amount: basicAmount
    });
  }
  if (hasHolidayHourly) {
    corePaymentRows.push({
      label: "Holiday Hours",
      units: holidayHours,
      rate: holidayRate,
      amount: holidayAmount
    });
  }
  if (basicSalaryAmount !== null) {
    corePaymentRows.push({
      label: "Basic Salary",
      units: null,
      rate: null,
      amount: basicSalaryAmount
    });
  }
  if (hasHolidaySalary) {
    corePaymentRows.push({
      label: "Holiday Salary",
      units: holidaySalaryUnits,
      rate: holidaySalaryRate,
      amount: holidaySalaryAmount
    });
  }
  const rows = [
    "<table class=\"report-table\">",
    `<tr style=\"border-bottom: 2px solid black;\"><th class=\"row-header\" align=\"left\">Date</th><td>${dateLabel}</td></tr>`,
    `<tr><th align=\"left\">NAT INS No.</th><td>${natInsNumber}</td></tr>`,
    "<tr><th class=\"row-header\" align=\"left\" colspan=\"2\">Payments</th></tr>",
    ...corePaymentRows.map(
      (item) =>
        `<tr><th align=\"left\">${formatMiscLabel(item)}</th><td>${formatCurrency(
          item.amount || 0
        )}</td></tr>`
    )
  ];

  if (miscPayments.length) {
    rows.push(
      "<tr><th class=\"row-header\" align=\"left\" colspan=\"2\">Misc Earnings</th></tr>",
      ...miscPayments.map(
        (item) =>
          `<tr><th align=\"left\">${formatMiscLabel(item)}</th><td>${formatCurrency(
            item.amount
          )}</td></tr>`
      )
    );
  }

  rows.push(
    "<tr><th class=\"row-header\" align=\"left\" colspan=\"2\">Deductions</th></tr>",
    `<tr><th align=\"left\">PAYE Tax</th><td>${formatDeduction(payeTax)}</td></tr>`,
    `<tr><th align=\"left\">National Insurance</th><td>${formatDeduction(
      nationalInsurance
    )}</td></tr>`,
    `<tr><th align=\"left\">NEST Corp - EE</th><td>${formatDeduction(
      nestEmployee
    )}</td></tr>`,
    `<tr><th align=\"left\">NEST Corp - ER</th><td>${formatDeduction(
      nestEmployer
    )}</td></tr>`
  );

  if (miscDeductions.length) {
    rows.push(
      "<tr><th class=\"row-header\" align=\"left\" colspan=\"2\">Misc Deductions</th></tr>",
      ...miscDeductions.map(
        (item) =>
          `<tr><th align=\"left\">${formatMiscLabel(item)}</th><td>${formatDeduction(
            item.amount
          )}</td></tr>`
      )
    );
  }

  rows.push(
    `<tr><th class=\"row-header\" align=\"left\">Combined NEST</th><td>${formatCurrency(combined)}</td></tr>`,
    `<tr style=\"border-top: 2px solid black;\"><th class=\"row-header\" align=\"left\">Net Pay (after deductions)</th><td>${formatCurrency(netPay)}</td></tr>`,
    "</table>"
  );

  return `
    <div class=\"report-cell\">
      ${imageHtml}
      ${rows.join("\n")}
    </div>
  `;
}

function renderYearSummary(entriesForYear) {
  const monthEntries = new Map();
  entriesForYear.forEach((entry) => {
    if (entry.monthIndex >= 1 && entry.monthIndex <= 12) {
      monthEntries.set(entry.monthIndex, entry);
    }
  });

  let yearHours = 0;
  let yearNestEmployee = 0;
  let yearNestEmployer = 0;
  let yearMiscPayments = 0;
  let yearMiscDeductions = 0;

  const bodyRows = [];

  for (let monthIndex = 1; monthIndex <= 12; monthIndex += 1) {
    const monthName = new Date(2024, monthIndex - 1, 1).toLocaleDateString("en-GB", {
      month: "long"
    });
    const entry = monthEntries.get(monthIndex);
    const record = entry ? entry.record : null;
    const hours = record?.payrollDoc?.payments?.hourly?.basic?.units || 0;
    const nestEmployee = record?.payrollDoc?.deductions?.nestEE?.amount || 0;
    const nestEmployer = record?.payrollDoc?.deductions?.nestER?.amount || 0;
    const miscPayments = sumMiscAmounts(record?.payrollDoc?.payments?.misc || []);
    const miscDeductions = sumMiscAmounts(record?.payrollDoc?.deductions?.misc || []);
    const combined = nestEmployee + nestEmployer;

    bodyRows.push(
      "<tr>" +
        `<th>${monthName}</th>` +
        `<td>${hours.toFixed(2)}</td>` +
        `<td>${formatCurrency(nestEmployee)}</td>` +
        `<td>${formatCurrency(nestEmployer)}</td>` +
        `<td>${formatCurrency(miscPayments)}</td>` +
        `<td>${formatDeduction(miscDeductions)}</td>` +
        `<td>${formatCurrency(combined)}</td>` +
        "</tr>"
    );

    yearHours += hours;
    yearNestEmployee += nestEmployee;
    yearNestEmployer += nestEmployer;
    yearMiscPayments += miscPayments;
    yearMiscDeductions += miscDeductions;
  }

  const yearCombined = yearNestEmployee + yearNestEmployer;

  return (
    "<table class=\"summary-table\">" +
    "<thead><tr>" +
    "<th>Month</th><th>Basic Hours (Units)</th>" +
    "<th>NEST Corp - EE</th><th>NEST Corp - ER</th>" +
    "<th>Misc Earnings†</th><th>Misc Deductions†</th>" +
    "<th>Combined NEST</th>" +
    "</tr></thead>" +
    `<tbody>${bodyRows.join("")}</tbody>` +
    "<tfoot>" +
    "<tr>" +
    "<th>Total</th>" +
    `<td>${yearHours.toFixed(2)}</td>` +
    `<td>${formatCurrency(yearNestEmployee)}</td>` +
    `<td>${formatCurrency(yearNestEmployer)}</td>` +
    `<td>${formatCurrency(yearMiscPayments)}</td>` +
    `<td>${formatDeduction(yearMiscDeductions)}</td>` +
    `<td>${formatCurrency(yearCombined)}</td>` +
    "</tr>" +
    "</tfoot>" +
    "</table>"
  );
}
