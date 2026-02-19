const pdfjsLib = window.pdfjsLib;

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

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

const DEBUG_ENABLED = new URLSearchParams(window.location.search).get("debug") === "1";

function extractField(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

function parseNumericValue(value) {
  if (!value) {
    return 0;
  }
  const cleaned = value.replace(/[,£$]/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatCurrency(value) {
  return `£${value.toFixed(2)}`;
}

function formatDeduction(value) {
  return `-£${Math.abs(value).toFixed(2)}`;
}

function extractNetPayFromText(text) {
  if (!text) {
    return null;
  }
  const candidates = [];
  text.split("\n").forEach((line) => {
    const stripped = line.trim();
    if (/^£?\d[\d,]*\.\d{2}$/.test(stripped)) {
      candidates.push(stripped.replace(/^£/, ""));
    }
  });
  return candidates.length ? candidates[candidates.length - 1] : null;
}

function extractEmployerFromLines(lines) {
  for (const line of lines) {
    if (/\bLtd\b|\bLimited\b/.test(line)) {
      return line.trim();
    }
  }
  return null;
}


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

async function extractPdfData(file, password) {
  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data, password: password || undefined });
  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    if (error && error.name === "PasswordException") {
      const reason = error.code === 2 ? "INCORRECT_PASSWORD" : "PASSWORD_REQUIRED";
      throw new Error(reason);
    }
    throw error;
  }
  let text = "";
  const allLines = [];
  let imageData = null;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageLines = buildLinesFromTextItems(content.items);
    allLines.push(...pageLines);
    text += `${pageLines.join("\n")}\n`;

    if (pageNum === 1) {
      imageData = await renderPageImage(page);
    }
  }

  return { text, imageData, lines: allLines };
}

function buildLinesFromTextItems(items) {
  const lines = [];
  const lineTolerance = 2;

  items.forEach((item) => {
    const transform = item.transform;
    const x = transform[4];
    const y = transform[5];
    const text = item.str.trim();
    if (!text) {
      return;
    }

    let line = lines.find((entry) => Math.abs(entry.y - y) <= lineTolerance);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push({ x, text });
  });

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((lineText) => lineText);
}

function findEmployerLine(lines) {
  return lines.find((line) => /\b(Ltd|Limited)\b/.test(line)) || null;
}

function findNetPayFromLines(lines) {
  const payMethodIndex = lines.findIndex((line) => /Pay\s+Method:/i.test(line));
  const amountRegex = /^\d[\d,]*\.\d{2}$/;
  if (payMethodIndex >= 0) {
    for (let i = payMethodIndex + 1; i < lines.length; i += 1) {
      if (amountRegex.test(lines[i])) {
        return lines[i];
      }
    }
    for (let i = payMethodIndex - 1; i >= 0; i -= 1) {
      if (amountRegex.test(lines[i])) {
        return lines[i];
      }
    }
  }

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (amountRegex.test(lines[i])) {
      return lines[i];
    }
  }
  return null;
}

async function renderPageImage(page) {
  const viewport = page.getViewport({ scale: 1.1 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: context, viewport }).promise;

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;
  const threshold = 245;
  let contentBottom = -1;

  for (let y = height - 1; y >= 0; y -= 1) {
    let hasContent = false;
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x += 2) {
      const index = rowStart + x * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      if (r < threshold || g < threshold || b < threshold) {
        hasContent = true;
        break;
      }
    }
    if (hasContent) {
      contentBottom = y;
      break;
    }
  }

  if (contentBottom >= 0) {
    const whitespaceRatio = (height - (contentBottom + 1)) / height;
    if (whitespaceRatio > 0.4) {
      const pointsPerCm = 72 / 2.54;
      const pageHeightPoints = Array.isArray(page.view) ? page.view[3] : height;
      const pixelsPerPoint = height / pageHeightPoints;
      const extraPixels = Math.round(pointsPerCm * 1.5 * pixelsPerPoint);
      const cropBottom = Math.min(height, contentBottom + 1 + extraPixels);

      const croppedCanvas = document.createElement("canvas");
      const croppedContext = croppedCanvas.getContext("2d");
      croppedCanvas.width = width;
      croppedCanvas.height = cropBottom;
      croppedContext.drawImage(canvas, 0, 0, width, cropBottom, 0, 0, width, cropBottom);
      return croppedCanvas.toDataURL("image/png");
    }
  }

  return canvas.toDataURL("image/png");
}

const app = Vue.createApp({
  data() {
    return {
      pdfPassword: "",
      status: "idle",
      progress: { current: 0, total: 0 },
      fileCount: 0,
      reportHtml: "",
      reportTimestamp: "",
      reportReady: false,
      suggestedFilename: "",
      reportStats: {
        dateRangeLabel: "",
        missingMonthsLabel: "",
        missingMonthsByYear: {}
      },
      debugEnabled: DEBUG_ENABLED,
      error: "",
      updateAvailable: false,
      waitingWorker: null,
      swRegistration: null,
      debugText: "",
      debugInfo: {
        parsed: "",
        matches: ""
      }
    };
  },
  computed: {
    progressPercent() {
      if (!this.progress.total) {
        return 0;
      }
      return Math.round((this.progress.current / this.progress.total) * 100);
    }
  },
  methods: {
    async handleFiles(event) {
      const files = Array.from(event.target.files || []);
      if (!files.length) {
        return;
      }
      this.fileCount = files.length;
      await this.processFiles(files);
      event.target.value = "";
    },
    async processFiles(files) {
      this.status = "processing";
      this.error = "";
      this.reportHtml = "";
      this.reportReady = false;
      this.debugText = "";
      this.debugInfo = { parsed: "", matches: "" };
      this.reportStats = {
        dateRangeLabel: "",
        missingMonthsLabel: "",
        missingMonthsByYear: {}
      };
      this.progress = { current: 0, total: files.length };

      const records = [];

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        this.progress.current = i + 1;
        try {
          const record = await this.extractPayrollRecord(file, i === 0);
          if (record) {
            records.push(record);
          }
        } catch (err) {
          console.error(err);
          if (err && err.message === "PASSWORD_REQUIRED") {
            this.error = `Password required for ${file.name}. Enter the PDF password and try again.`;
          } else if (err && err.message === "INCORRECT_PASSWORD") {
            this.error = `Incorrect password for ${file.name}. Please re-enter the PDF password.`;
          } else {
            this.error = `Failed to read ${file.name}`;
          }
        }
      }

      if (!records.length) {
        this.status = "idle";
        this.error = this.error || "No payroll data was extracted.";
        return;
      }

      this.status = "rendering";
      const report = this.buildReport(records);
      this.reportHtml = report.html;
      this.reportReady = true;
      this.status = "done";
      this.reportTimestamp = new Date().toLocaleString("en-GB");
      this.suggestedFilename = report.filename;
      this.reportStats = report.stats;
      document.title = report.filename;
    },
    async extractPayrollRecord(file, captureDebug) {
      const { text, imageData, lines } = await extractPdfData(file, this.pdfPassword);
      if (this.debugEnabled && captureDebug && !this.debugText) {
        this.debugText = text;
      }
      const lineItems = lines || [];

      const nameMatch = text.match(PATTERNS.nameDateId);
      let employeeName = nameMatch ? nameMatch[1].trim() : null;
      let payPeriod = nameMatch ? nameMatch[2].trim() : null;
      let employeeId = nameMatch ? nameMatch[3].trim() : null;
      const employer = findEmployerLine(lineItems);

      const basicMatch = text.match(PATTERNS.basicLine);
      const basicHours = parseNumericValue(basicMatch ? basicMatch[1] : null);
      const basicRate = parseNumericValue(basicMatch ? basicMatch[2] : null);
      const basicAmount = parseNumericValue(basicMatch ? basicMatch[3] : null);
      const holidayMatch = text.match(PATTERNS.holidayLine);
      const holidayHours = parseNumericValue(holidayMatch ? holidayMatch[1] : null);
      const holidayRate = parseNumericValue(holidayMatch ? holidayMatch[2] : null);
      const holidayAmount = parseNumericValue(holidayMatch ? holidayMatch[3] : null);
      const payeTax = parseNumericValue(extractField(text, PATTERNS.payeTax));
      const nationalInsurance = parseNumericValue(
        extractField(text, PATTERNS.nationalInsurance)
      );
      const nestEmployee = parseNumericValue(extractField(text, PATTERNS.nestEmployee));
      const nestEmployer = parseNumericValue(extractField(text, PATTERNS.nestEmployer));
      const earningsForNI = parseNumericValue(extractField(text, PATTERNS.earningsForNI));
      const grossForTax = parseNumericValue(extractField(text, PATTERNS.grossForTax));
      const totalGrossPay = parseNumericValue(extractField(text, PATTERNS.totalGrossPay));
      const payCycle = extractField(text, PATTERNS.payCycle);
      const totalGrossPayTD = parseNumericValue(extractField(text, PATTERNS.totalGrossPayTD));
      const grossForTaxTD = parseNumericValue(extractField(text, PATTERNS.grossForTaxTD));
      const taxPaidTD = parseNumericValue(extractField(text, PATTERNS.taxPaidTD));
      const earningsForNITD = parseNumericValue(extractField(text, PATTERNS.earningsForNITD));
      const nationalInsuranceTD = parseNumericValue(
        extractField(text, PATTERNS.nationalInsuranceTD)
      );
      const employeePensionTD = parseNumericValue(
        extractField(text, PATTERNS.employeePensionTD)
      );
      const employerPensionTD = parseNumericValue(
        extractField(text, PATTERNS.employerPensionTD)
      );
      const pensionsAdjustment = parseNumericValue(
        extractField(text, PATTERNS.pensionsAdjustment)
      );
      const corrections = parseNumericValue(extractField(text, PATTERNS.corrections));
      let netPay = parseNumericValue(extractField(text, PATTERNS.netPay));
      if (!netPay) {
        const lineNetPay = findNetPayFromLines(lineItems);
        netPay = parseNumericValue(lineNetPay);
      }

      if (!netPay) {
        const fallback = extractNetPayFromText(text);
        netPay = parseNumericValue(fallback);
      }

      if (this.debugEnabled && captureDebug && this.debugText && !this.debugInfo.parsed) {
        this.debugInfo.parsed = JSON.stringify(
          {
            employeeName,
            employeeId,
            employer,
            payPeriod,
            basicHours,
            basicRate,
            basicAmount,
            holidayHours,
            holidayRate,
            holidayAmount,
            payeTax,
            nationalInsurance,
            nestEmployee,
            nestEmployer,
            earningsForNI,
            grossForTax,
            totalGrossPay,
            payCycle,
            totalGrossPayTD,
            grossForTaxTD,
            taxPaidTD,
            earningsForNITD,
            nationalInsuranceTD,
            employeePensionTD,
            employerPensionTD,
            pensionsAdjustment,
            corrections,
            netPay
          },
          null,
          2
        );
        this.debugInfo.matches = JSON.stringify(
          {
            nameDateId: nameMatch ? nameMatch[0] : null,
            employerLine: employer,
            basicLine: basicMatch ? basicMatch[0] : null,
            holidayLine: holidayMatch ? holidayMatch[0] : null,
            payeTax: text.match(PATTERNS.payeTax)?.[0] || null,
            nationalInsurance: text.match(PATTERNS.nationalInsurance)?.[0] || null,
            nestEmployee: text.match(PATTERNS.nestEmployee)?.[0] || null,
            nestEmployer: text.match(PATTERNS.nestEmployer)?.[0] || null,
            earningsForNI: text.match(PATTERNS.earningsForNI)?.[0] || null,
            grossForTax: text.match(PATTERNS.grossForTax)?.[0] || null,
            totalGrossPay: text.match(PATTERNS.totalGrossPay)?.[0] || null,
            payCycle: text.match(PATTERNS.payCycle)?.[0] || null,
            totalGrossPayTD: text.match(PATTERNS.totalGrossPayTD)?.[0] || null,
            grossForTaxTD: text.match(PATTERNS.grossForTaxTD)?.[0] || null,
            taxPaidTD: text.match(PATTERNS.taxPaidTD)?.[0] || null,
            earningsForNITD: text.match(PATTERNS.earningsForNITD)?.[0] || null,
            nationalInsuranceTD: text.match(PATTERNS.nationalInsuranceTD)?.[0] || null,
            employeePensionTD: text.match(PATTERNS.employeePensionTD)?.[0] || null,
            employerPensionTD: text.match(PATTERNS.employerPensionTD)?.[0] || null,
            pensionsAdjustment: text.match(PATTERNS.pensionsAdjustment)?.[0] || null,
            corrections: text.match(PATTERNS.corrections)?.[0] || null,
            netPay: text.match(PATTERNS.netPay)?.[0] || null,
            lineNetPay: findNetPayFromLines(lineItems)
          },
          null,
          2
        );
      }

      if (!employeeName || !employer) {
        return null;
      }

      employeeId = employeeId || null;
      payPeriod = payPeriod || "Unknown";

      return {
        employeeName,
        employeeId,
        employer,
        payPeriod,
        basicHours,
        basicRate,
        basicAmount,
        holidayHours,
        holidayRate,
        holidayAmount,
        payeTax,
        nationalInsurance,
        nestEmployeeContribution: nestEmployee,
        nestEmployerContribution: nestEmployer,
        earningsForNI,
        grossForTax,
        totalGrossPay,
        payCycle,
        totalGrossPayTD,
        grossForTaxTD,
        taxPaidTD,
        earningsForNITD,
        nationalInsuranceTD,
        employeePensionTD,
        employerPensionTD,
        pensionsAdjustment,
        corrections,
        netPay,
        imageData
      };
    },
    buildReport(records) {
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
      const rangeStart = parsedDates.length ? new Date(Math.min(...parsedDates)) : null;
      const rangeEnd = parsedDates.length ? new Date(Math.max(...parsedDates)) : null;
      const dateRangeLabel = rangeStart && rangeEnd
        ? `${formatDateLabel(rangeStart)} – ${formatDateLabel(rangeEnd)}`
        : "Unknown";

      const employeeName = records[0].employeeName;
      const reportSections = [];

      const missingMonthsByYear = {};
      yearGroups.forEach((entriesForYear, yearKey) => {
        missingMonthsByYear[yearKey] = getMissingMonths(entriesForYear);
      });
      const missingMonthsLabel = buildMissingMonthsLabel(missingMonthsByYear);
      const missingMonthsHtml = buildMissingMonthsHtml(missingMonthsByYear);
      const missingMonthsPill = `Missing months: <span class=\"missing-months\">${missingMonthsHtml}</span>`;

      reportSections.push(
        `<div class="report-meta"><h2>Payroll Report - ${employeeName}</h2>` +
          `<p class="report-range">${dateRangeLabel}</p>` +
          `<p class="report-missing">${missingMonthsPill}</p></div>`
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
        const yearMissingPill = `Missing months: <span class=\"missing-months\">${yearMissingHtml}</span>`;

        entriesForYear.forEach((entry) => {
          reportSections.push("<div class=\"page\">");
          reportSections.push(this.renderReportCell(entry));
          reportSections.push("</div>");
        });

        reportSections.push("<div class=\"page\">");
        reportSections.push(`<h2>${yearLabel} Summary: ${employeeName}</h2>`);
        reportSections.push(`<p class="report-missing">${yearMissingPill}</p>`);
        reportSections.push(this.renderYearSummary(entriesForYear));
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
    },
    renderReportCell(entry) {
      const record = entry.record;
      const parsedDate = entry.parsedDate;
      const dateLabel = parsedDate ? formatDateLabel(parsedDate) : record.payPeriod;
      const combined = record.nestEmployeeContribution + record.nestEmployerContribution;
      const imageHtml = record.imageData
        ? `<img class="report-image" src="${record.imageData}" alt="${dateLabel}" />`
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
        <div class="report-cell">
          ${imageHtml}
          ${rows.join("\n")}
        </div>
      `;
    },
    renderYearSummary(entriesForYear) {
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
    },
    printReport() {
      if (!this.reportReady) {
        return;
      }
      window.print();
    },
    applyUpdate() {
      if (!this.waitingWorker) {
        if (this.swRegistration) {
          this.swRegistration.update();
        }
        window.location.reload();
        return;
      }
      if (!sessionStorage.getItem("sw_refresh_pending")) {
        sessionStorage.setItem("sw_refresh_pending", "true");
        this.waitingWorker.postMessage({ type: "SKIP_WAITING" });
        setTimeout(() => {
          window.location.reload();
        }, 800);
      }
    }
  },
  mounted() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").then((registration) => {
        this.swRegistration = registration;
        registration.update();
        if (registration.waiting) {
          this.updateAvailable = true;
          this.waitingWorker = registration.waiting;
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) {
            return;
          }
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              this.updateAvailable = true;
              this.waitingWorker = newWorker;
            }
          });
        });
      });

    }
  }
});

app.mount("#app");
