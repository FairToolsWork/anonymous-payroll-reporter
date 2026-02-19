const DEBUG_ENABLED = new URLSearchParams(window.location.search).get("debug") === "1";

function initPayrollApp() {
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
        acceptedDisclaimer: false
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
        if (!this.acceptedDisclaimer) {
          this.error = "Please accept the accuracy disclaimer before uploading PDFs.";
          return;
        }
        const items = Array.from(event.dataTransfer?.items || []);
        const itemFiles = items
          .filter((item) => item.kind === "file")
          .map((item) => item.getAsFile())
          .filter(Boolean);
        const rawFiles = itemFiles.length
          ? itemFiles
          : Array.from(event.dataTransfer?.files || []);
        const files = rawFiles.filter((file) => {
          const name = file.name || "";
          return file.type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
        });
        if (files.length !== rawFiles.length) {
          this.error =
            "One or more of your uploaded files was not a PDF. Please try again.";
          return;
        }
        if (!files.length) {
          return;
        }
        this.fileCount = files.length;
        await this.processFiles(files);
      },
      async handleFiles(event) {
        if (!this.acceptedDisclaimer) {
          this.error = "Please accept the accuracy disclaimer before uploading PDFs.";
          event.target.value = "";
          return;
        }
        const rawFiles = Array.from(event.target.files || []);
        if (!rawFiles.length) {
          return;
        }
        const files = rawFiles.filter((file) => {
          const name = file.name || "";
          return file.type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
        });
        if (files.length !== rawFiles.length) {
          this.error =
            "One or more of your uploaded files was not a PDF. Please try again.";
          event.target.value = "";
          return;
        }
        this.fileCount = files.length;
        await this.processFiles(files);
        event.target.value = "";
      },
      async processFiles(files) {
        if (!this.acceptedDisclaimer) {
          this.status = "idle";
          this.error = "Please accept the accuracy disclaimer before uploading PDFs.";
          return;
        }
        this.status = "processing";
        this.error = "";
        this.reportHtml = "";
        this.reportReady = false;
        this.debugText = "";
        this.debugInfo = { parsed: "", matches: "" };
        this.failedFiles = [];
        this.failedPayPeriods = [];
        this.reportStats = {
          dateRangeLabel: "",
          missingMonthsLabel: "",
          missingMonthsByYear: {}
        };
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
                name: record.employeeName,
                period: record.payPeriod
              });
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
      },
      async extractPayrollRecord(file, captureDebug) {
        const { text, imageData, lines } = await extractPdfData(file, this.pdfPassword);
        if (this.debugEnabled && captureDebug && !this.debugText) {
          this.debugText = text;
        }
        const lineItems = lines || [];

        const nameMatch = text.match(PATTERNS.nameDateId);
        let employeeName = nameMatch && nameMatch[1] ? nameMatch[1].trim() : null;
        let payPeriod = nameMatch && nameMatch[2] ? nameMatch[2].trim() : null;
        let employeeId = nameMatch && nameMatch[3] ? nameMatch[3].trim() : null;
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
}
