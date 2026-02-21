const DEBUG_LEVEL = new URLSearchParams(window.location.search).get("debug");
const DEBUG_ENABLED = DEBUG_LEVEL === "1" || DEBUG_LEVEL === "2";
const DEBUG_PERSIST_PASSWORD = DEBUG_LEVEL === "2";

function initPayrollApp() {
  const app = Vue.createApp({
    data() {
      return {
        pdfPassword: "",
        status: "idle",
        progress: { current: 0, total: 0 },
        fileCount: 0,
        contributionFileCount: 0,
        contributionFiles: [],
        stagedFiles: [],
        stagedPdfCount: 0,
        stagedExcelCount: 0,
        reportHtml: "",
        reportTimestamp: "",
        reportReady: false,
        suggestedFilename: "",
        reportStats: {
          dateRangeLabel: "",
          missingMonthsLabel: "",
          missingMonthsByYear: {},
          validationSummary: {
            flaggedCount: 0,
            lowConfidenceCount: 0,
            flaggedPeriods: []
          }
        },
        dragActive: false,
        debugEnabled: DEBUG_ENABLED,
        error: "",
        updateAvailable: false,
        waitingWorker: null,
        swRegistration: null,
        debugText: "",
        failedFiles: [],
        failedPayPeriods: [],
        debugInfo: {
          parsed: "",
          matches: ""
        },
        debugCopySuccess: false,
        debugCopyResetTimer: null,
        acceptedDisclaimer: false,
        showScrollTop: false
      };
    },
    computed: {
      progressPercent() {
        if (!this.progress.total) {
          return 0;
        }
        return Math.round((this.progress.current / this.progress.total) * 100);
      },
      canRunReport() {
        return (
          this.stagedPdfCount > 0 &&
          this.acceptedDisclaimer &&
          this.status !== "processing"
        );
      }
    },
    watch: {
      pdfPassword(value) {
        if (!DEBUG_PERSIST_PASSWORD) {
          return;
        }
        if (value) {
          sessionStorage.setItem("pdf_password_debug", value);
          return;
        }
        sessionStorage.removeItem("pdf_password_debug");
      }
    },
    methods: {
      handleContributionFiles(event) {
        const rawFiles = Array.from(event.target.files || []);
        if (!rawFiles.length) {
          return;
        }
        const files = rawFiles.filter((file) => {
          const name = file.name || "";
          return (
            file.type ===
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            name.toLowerCase().endsWith(".xlsx")
          );
        });
        if (files.length !== rawFiles.length) {
          this.error =
            "One or more of your uploaded files was not an XLSX. Please try again.";
          event.target.value = "";
          return;
        }
        this.contributionFiles = files;
        this.contributionFileCount = files.length;
        event.target.value = "";
      },
      stageFiles(rawFiles) {
        const files = rawFiles.filter(Boolean);
        if (!files.length) {
          return;
        }
        const staged = [];
        const invalid = [];
        files.forEach((file) => {
          const name = (file.name || "").toLowerCase();
          if (file.type === "application/pdf" || name.endsWith(".pdf")) {
            staged.push({
              id: `${file.name}-${file.size}-${file.lastModified}`,
              name: file.name,
              type: "pdf",
              file
            });
            return;
          }
          if (
            file.type ===
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            name.endsWith(".xlsx")
          ) {
            staged.push({
              id: `${file.name}-${file.size}-${file.lastModified}`,
              name: file.name,
              type: "xlsx",
              file
            });
            return;
          }
          invalid.push(file.name || "Unknown");
        });

        if (invalid.length) {
          this.error =
            "Some files were not PDFs or XLSX files. Please remove them and try again.";
          return;
        }

        this.error = "";
        this.stagedFiles = [...this.stagedFiles, ...staged];
        this.stagedPdfCount = this.stagedFiles.filter((item) => item.type === "pdf").length;
        this.stagedExcelCount = this.stagedFiles.filter((item) => item.type === "xlsx").length;
        this.contributionFileCount = this.stagedExcelCount;
      },
      parseContributionDate(value) {
        if (value instanceof Date) {
          return value;
        }
        if (typeof value === "number" && window.XLSX?.SSF?.parse_date_code) {
          const parsed = window.XLSX.SSF.parse_date_code(value);
          if (parsed) {
            return new Date(parsed.y, parsed.m - 1, parsed.d);
          }
        }
        if (typeof value === "string") {
          const match = value.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
          if (match) {
            const day = parseInt(match[1], 10);
            const month = parseInt(match[2], 10) - 1;
            let year = parseInt(match[3], 10);
            if (year < 100) {
              year += 2000;
            }
            const parsed = new Date(year, month, day);
            if (!Number.isNaN(parsed.getTime())) {
              return parsed;
            }
          }
        }
        return null;
      },
      normalizeContributionType(value) {
        if (!value) {
          return null;
        }
        const normalized = String(value).toLowerCase();
        if (normalized.includes("from your salary")) {
          return "ee";
        }
        if (normalized.includes("from your employer")) {
          return "er";
        }
        return null;
      },
      async parseContributionFiles(files) {
        if (!files || !files.length) {
          return null;
        }
        if (!window.XLSX) {
          throw new Error("XLSX_NOT_AVAILABLE");
        }
        const entries = [];
        for (const file of files) {
          const buffer = await file.arrayBuffer();
          const workbook = window.XLSX.read(buffer, { type: "array" });
          const sheet = workbook.Sheets["Contribution Details"];
          if (!sheet) {
            throw new Error("CONTRIBUTION_SHEET_MISSING");
          }
          const rows = window.XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: null
          });
          for (let i = 1; i < rows.length; i += 1) {
            const row = rows[i];
            if (!row) {
              continue;
            }
            const dateValue = row[0];
            const typeValue = row[1];
            const amountValue = row[3];
            if (!dateValue || !typeValue || amountValue === null || amountValue === undefined) {
              continue;
            }
            const date = this.parseContributionDate(dateValue);
            const type = this.normalizeContributionType(typeValue);
            const amount = typeof amountValue === "number"
              ? amountValue
              : parseFloat(String(amountValue).replace(/[^0-9.\-]/g, ""));
            if (!date || !type || !Number.isFinite(amount)) {
              continue;
            }
            entries.push({ date, type, amount });
          }
        }
        return {
          entries,
          sourceFiles: files.map((file) => file.name || "Unknown")
        };
      },
      async copyDebugOutput() {
        const payload = [
          "=== Debug: Extracted Text ===",
          this.debugText || "<empty>",
          "=== Debug: Parsed Values ===",
          this.debugInfo.parsed || "<empty>",
          "=== Debug: Regex Matches ===",
          this.debugInfo.matches || "<empty>"
        ].join("\n\n");

        try {
          await navigator.clipboard.writeText(payload);
        } catch (err) {
          const textarea = document.createElement("textarea");
          textarea.value = payload;
          textarea.setAttribute("readonly", "");
          textarea.style.position = "absolute";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        } finally {
          this.debugCopySuccess = true;
          if (this.debugCopyResetTimer) {
            clearTimeout(this.debugCopyResetTimer);
          }
          this.debugCopyResetTimer = setTimeout(() => {
            this.debugCopySuccess = false;
          }, 2000);
        }
      },
      onDragOver(event) {
        event.preventDefault();
        if (this.status === "processing") {
          return;
        }
        this.dragActive = true;
      },
      onDragLeave(event) {
        event.preventDefault();
        if (event.currentTarget.contains(event.relatedTarget)) {
          return;
        }
        this.dragActive = false;
      },
      async onDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        if (this.status === "processing") {
          return;
        }
        this.dragActive = false;
        const items = Array.from(event.dataTransfer?.items || []);
        const itemFiles = items
          .filter((item) => item.kind === "file")
          .map((item) => item.getAsFile())
          .filter(Boolean);
        const rawFiles = itemFiles.length
          ? itemFiles
          : Array.from(event.dataTransfer?.files || []);
        this.stageFiles(rawFiles);
      },
      async handleFiles(event) {
        const rawFiles = Array.from(event.target.files || []);
        if (!rawFiles.length) {
          return;
        }
        this.stageFiles(rawFiles);
        event.target.value = "";
      },
      async runReport() {
        if (!this.canRunReport) {
          return;
        }
        const pdfFiles = this.stagedFiles
          .filter((item) => item.type === "pdf")
          .map((item) => item.file);
        const excelFiles = this.stagedFiles
          .filter((item) => item.type === "xlsx")
          .map((item) => item.file);
        this.contributionFiles = excelFiles;
        this.fileCount = pdfFiles.length;
        await this.processFiles(pdfFiles);
      },
      clearUploads() {
        this.stagedFiles = [];
        this.stagedPdfCount = 0;
        this.stagedExcelCount = 0;
        this.contributionFiles = [];
        this.fileCount = 0;
        this.contributionFileCount = 0;
        this.resetReportState();
      },
      resetReportState() {
        this.status = "idle";
        this.error = "";
        this.reportHtml = "";
        this.reportReady = false;
        this.debugText = "";
        this.debugInfo = { parsed: "", matches: "" };
        this.failedFiles = [];
        this.failedPayPeriods = [];
        this.showScrollTop = false;
        this.reportStats = {
          dateRangeLabel: "",
          missingMonthsLabel: "",
          missingMonthsByYear: {},
          validationSummary: {
            flaggedCount: 0,
            lowConfidenceCount: 0,
            flaggedPeriods: []
          }
        };
      },
      async processFiles(files) {
        if (!this.acceptedDisclaimer) {
          this.status = "idle";
          this.error = "Please accept the accuracy disclaimer before running the report.";
          return;
        }
        this.resetReportState();
        this.status = "processing";
        this.progress = { current: 0, total: files.length };
        console.info("Payroll: starting processing", { files: files.length });

        const records = [];
        let stopProcessing = false;

        for (let i = 0; i < files.length; i += 1) {
          const file = files[i];
          this.progress.current = i + 1;
          try {
            console.info("Payroll: extracting", { index: i + 1, name: file.name });
            const record = await this.extractPayrollRecord(file, i === 0);
            if (record) {
              records.push(record);
              console.info("Payroll: extracted", {
                name: record.employee?.name,
                period: record.payrollDoc?.processDate?.date
              });
            } else if (!this.failedFiles.includes(file.name)) {
              this.failedFiles.push(file.name);
            }
          } catch (err) {
            console.error("Payroll: extraction failed", {
              name: file.name,
              message: err?.message,
              error: err
            });
            if (err && err.message === "PASSWORD_REQUIRED") {
              this.error =
                "A password is required for one or more of the uploaded PDF(s). Enter a password and try again.";
              document.getElementById("pdf-password")?.focus();
              stopProcessing = true;
            } else if (err && err.message === "INCORRECT_PASSWORD") {
              this.error = `Incorrect password for ${file.name}. Please re-enter the PDF password.`;
              document.getElementById("pdf-password")?.focus();
              stopProcessing = true;
            } else {
              this.error = `Failed to read the following files:`;
              this.failedFiles.push(file.name);
            }
          }
          if (stopProcessing) {
            break;
          }
        }

        if (stopProcessing) {
          this.status = "idle";
          return;
        }

        console.info("Payroll: failed files summary", {
          count: this.failedFiles.length,
          files: [...this.failedFiles]
        });

        if (this.failedFiles.length && !this.error) {
          this.error = `Failed to read ${this.failedFiles.length} PDF(s).`;
        }

        if (!records.length) {
          this.status = "idle";
          this.error = this.error || "No payroll data was extracted.";
          console.warn("Payroll: no records extracted", {
            files: files.length,
            error: this.error
          });
          return;
        }

        let contributionData = null;
        try {
          contributionData = await this.parseContributionFiles(this.contributionFiles);
        } catch (err) {
          console.warn("Payroll: contribution parsing failed", {
            message: err?.message,
            error: err
          });
          this.error =
            "Failed to read contribution history Excel file(s). Report generated without reconciliation.";
          contributionData = null;
        }
        records.contributionData = contributionData;

        this.status = "rendering";
        const report = buildReport(records, this.failedPayPeriods);
        this.reportHtml = report.html;
        this.reportReady = true;
        this.status = "done";
        this.reportTimestamp = new Date().toLocaleString("en-GB");
        this.suggestedFilename = report.filename;
        this.reportStats = report.stats;
        document.title = report.filename;
        console.info("Payroll: report ready", { filename: report.filename });
        this.handleScroll();
      },
      async extractPayrollRecord(file, captureDebug) {
        const { text, imageData, lines, lineItems } = await extractPdfData(
          file,
          this.pdfPassword
        );
        if (this.debugEnabled && captureDebug && !this.debugText) {
          this.debugText = text;
        }
        const payrollRecord = buildPayrollDocument({
          text,
          lines: lines || [],
          lineItems: lineItems || []
        });
        payrollRecord.imageData = imageData;

        const employeeName = payrollRecord.employee?.name || null;
        const employer = payrollRecord.employer || null;
        const payPeriod = payrollRecord.payrollDoc?.processDate?.date || null;

        if (this.debugEnabled && captureDebug && this.debugText && !this.debugInfo.parsed) {
          const debugRecord = { ...payrollRecord };
          if (debugRecord.imageData && typeof debugRecord.imageData === "string") {
            const marker = "data:image/png;base64,";
            debugRecord.imageData = debugRecord.imageData.startsWith(marker)
              ? `${marker}<truncated>`
              : "<truncated>";
          }
          this.debugInfo.parsed = JSON.stringify(debugRecord, null, 2);
          this.debugInfo.matches = JSON.stringify(
            {
              nameDateId: text.match(PATTERNS.nameDateId)?.[0] || null,
              employerLine: text.match(PATTERNS.employerLine)?.[0] || null,
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
              netPay: text.match(PATTERNS.netPay)?.[0] || null
            },
            null,
            2
          );
        }

        if (!employeeName || !employer) {
          console.warn("Payroll: missing required fields", {
            name: employeeName,
            employer,
            payPeriod
          });
          if (payPeriod && !this.failedPayPeriods.includes(payPeriod)) {
            this.failedPayPeriods.push(payPeriod);
          }
          return null;
        }

        return payrollRecord;
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
      },
      handleScroll() {
        if (!this.reportReady) {
          this.showScrollTop = false;
          return;
        }
        const doc = document.documentElement;
        const scrollTop = window.scrollY || doc.scrollTop || 0;
        const viewportHeight = window.innerHeight || doc.clientHeight || 0;
        const scrollHeight = doc.scrollHeight || 0;
        const scrollableHeight = Math.max(scrollHeight - viewportHeight, 0);
        if (!scrollableHeight) {
          this.showScrollTop = false;
          return;
        }
        this.showScrollTop = scrollTop / scrollableHeight >= 0.2;
      },
      scrollToTop() {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    mounted() {
      if (!Array.isArray(this.stagedFiles)) {
        this.stagedFiles = [];
        console.info("Payroll: normalized stagedFiles (was not an array)");
      }
      if (!Array.isArray(this.failedFiles)) {
        this.failedFiles = [];
        console.info("Payroll: normalized failedFiles (was not an array)");
      }
      if (!Array.isArray(this.reportStats?.validationSummary?.flaggedPeriods)) {
        if (!this.reportStats) {
          this.reportStats = {};
        }
        if (!this.reportStats.validationSummary) {
          this.reportStats.validationSummary = {};
        }
        this.reportStats.validationSummary.flaggedPeriods = [];
        console.info("Payroll: normalized reportStats.validationSummary.flaggedPeriods");
      }
      if (DEBUG_PERSIST_PASSWORD) {
        this.acceptedDisclaimer = true;
        this.pdfPassword = sessionStorage.getItem("pdf_password_debug") || "";
      }
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
      window.addEventListener("scroll", this.handleScroll, { passive: true });
    }
  });

  app.mount("#app");
}
