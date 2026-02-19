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
    const parsedDate = parsePayPeriodStart(record.payPeriod);
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
    return a.record.payPeriod.localeCompare(b.record.payPeriod);
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

  const employeeName = records[0].employeeName;
  const reportSections = [];

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
  let totalPensionsAdjustment = 0;
  let totalCorrections = 0;

  Array.from(yearGroups.keys()).forEach((yearKey) => {
    const entriesForYear = yearGroups.get(yearKey);
    const yearLabel = yearKey === "Unknown" ? "Unknown Year" : yearKey;
    const yearMissing = missingMonthsByYear[yearKey] || [];
    const yearMissingHtml = buildMissingMonthsHtmlForYear(yearMissing);
    const yearMissingPill = `Missing months: <span class="missing-months">${yearMissingHtml}</span>`;

    entriesForYear.forEach((entry) => {
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
        acc.nestEmployee += entry.record.nestEmployeeContribution;
        acc.nestEmployer += entry.record.nestEmployerContribution;
        acc.pensionsAdjustment += entry.record.pensionsAdjustment;
        acc.corrections += entry.record.corrections;
        return acc;
      },
      {
        nestEmployee: 0,
        nestEmployer: 0,
        pensionsAdjustment: 0,
        corrections: 0
      }
    );

    totalNestEmployee += totals.nestEmployee;
    totalNestEmployer += totals.nestEmployer;
    totalPensionsAdjustment += totals.pensionsAdjustment;
    totalCorrections += totals.corrections;
  });

  const totalCombined = totalNestEmployee + totalNestEmployer;

  reportSections.push("<div class=\"page\">");
  reportSections.push(
    `<h2>Summary Totals: ${employeeName} (${dateRangeLabel})</h2>`
  );
  reportSections.push(
    "<table class=\"summary-table\"><thead><tr>" +
      "<th>NEST Corp - EE</th><th>NEST Corp - ER</th>" +
      "<th>Pensions Adjustment</th><th>Corrections</th>" +
      "<th>Total Contribution</th></tr></thead>" +
      "<tbody><tr>" +
      `<td>${formatCurrency(totalNestEmployee)}</td>` +
      `<td>${formatCurrency(totalNestEmployer)}</td>` +
      `<td>${formatDeduction(totalPensionsAdjustment)}</td>` +
      `<td>${formatDeduction(totalCorrections)}</td>` +
      `<td>${formatCurrency(totalCombined)}</td>` +
      "</tr></tbody></table>"
  );
  reportSections.push("</div>");

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
  const dateLabel = parsedDate ? formatDateLabel(parsedDate) : record.payPeriod;
  const combined = record.nestEmployeeContribution + record.nestEmployerContribution;
  const imageHtml = record.imageData
    ? `<img class=\"report-image\" src=\"${record.imageData}\" alt=\"${dateLabel}\" />`
    : "";
  const rows = [
    "<table class=\"report-table\">",
    `<tr style=\"border-bottom: 2px solid black;\"><th class=\"row-header\" align=\"left\">Date</th><td>${dateLabel}</td></tr>`,
    "<tr><th class=\"row-header\" align=\"left\" colspan=\"2\">Payments</th></tr>",
    `<tr><th align=\"left\">Basic Hours (Units)</th><td>${record.basicHours.toFixed(2)}</td></tr>`,
    `<tr><th align=\"left\">Rate</th><td>${formatCurrency(record.basicRate)}</td></tr>`,
    `<tr><th align=\"left\">Pre-Tax Amount</th><td>${formatCurrency(record.basicAmount)}</td></tr>`,
    `<tr><th align=\"left\">Holidays (Units)</th><td>${record.holidayHours.toFixed(2)}</td></tr>`,
    `<tr><th align=\"left\">Holiday Rate</th><td>${formatCurrency(record.holidayRate)}</td></tr>`,
    `<tr><th align=\"left\">Holiday Amount</th><td>${formatCurrency(record.holidayAmount)}</td></tr>`,
    "<tr><th class=\"row-header\" align=\"left\" colspan=\"2\">Pension Deductions</th></tr>",
    `<tr><th align=\"left\">NEST Corp - EE</th><td>${formatCurrency(record.nestEmployeeContribution)}</td></tr>`,
    `<tr><th align=\"left\">NEST Corp - ER</th><td>${formatCurrency(record.nestEmployerContribution)}</td></tr>`
  ];

  if (record.pensionsAdjustment !== 0) {
    rows.push(
      `<tr><th align=\"left\">Pensions adjustment</th><td>${formatDeduction(record.pensionsAdjustment)}</td></tr>`
    );
  }
  if (record.corrections !== 0) {
    rows.push(
      `<tr><th align=\"left\">Corrections</th><td>${formatDeduction(record.corrections)}</td></tr>`
    );
  }

  rows.push(
    `<tr><th class=\"row-header\" align=\"left\">Combined NEST</th><td>${formatCurrency(combined)}</td></tr>`,
    `<tr style=\"border-top: 2px solid black;\"><th class=\"row-header\" align=\"left\">Net Pay (after deductions)</th><td>${formatCurrency(record.netPay)}</td></tr>`,
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
  let yearPensionsAdjustment = 0;
  let yearCorrections = 0;

  const bodyRows = [];

  for (let monthIndex = 1; monthIndex <= 12; monthIndex += 1) {
    const monthName = new Date(2024, monthIndex - 1, 1).toLocaleDateString("en-GB", {
      month: "long"
    });
    const entry = monthEntries.get(monthIndex);
    const record = entry ? entry.record : null;

    const hours = record ? record.basicHours : 0;
    const nestEmployee = record ? record.nestEmployeeContribution : 0;
    const nestEmployer = record ? record.nestEmployerContribution : 0;
    const pensionsAdjustment = record ? record.pensionsAdjustment : 0;
    const corrections = record ? record.corrections : 0;
    const combined = nestEmployee + nestEmployer;

    bodyRows.push(
      "<tr>" +
        `<th>${monthName}</th>` +
        `<td>${hours.toFixed(2)}</td>` +
        `<td>${formatCurrency(nestEmployee)}</td>` +
        `<td>${formatCurrency(nestEmployer)}</td>` +
        `<td>${formatDeduction(pensionsAdjustment)}</td>` +
        `<td>${formatDeduction(corrections)}</td>` +
        `<td>${formatCurrency(combined)}</td>` +
        "</tr>"
    );

    yearHours += hours;
    yearNestEmployee += nestEmployee;
    yearNestEmployer += nestEmployer;
    yearPensionsAdjustment += pensionsAdjustment;
    yearCorrections += corrections;
  }

  const yearCombined = yearNestEmployee + yearNestEmployer;

  return (
    "<table class=\"summary-table\">" +
    "<thead><tr>" +
    "<th>Month</th><th>Basic Hours (Units)</th>" +
    "<th>NEST Corp - EE</th><th>NEST Corp - ER</th>" +
    "<th>Pensions Adjustment</th><th>Corrections</th>" +
    "<th>Combined NEST</th>" +
    "</tr></thead>" +
    `<tbody>${bodyRows.join("")}</tbody>` +
    "<tfoot>" +
    "<tr>" +
    "<th>Total</th>" +
    `<td>${yearHours.toFixed(2)}</td>` +
    `<td>${formatCurrency(yearNestEmployee)}</td>` +
    `<td>${formatCurrency(yearNestEmployer)}</td>` +
    `<td>${formatDeduction(yearPensionsAdjustment)}</td>` +
    `<td>${formatDeduction(yearCorrections)}</td>` +
    `<td>${formatCurrency(yearCombined)}</td>` +
    "</tr>" +
    "</tfoot>" +
    "</table>"
  );
}
