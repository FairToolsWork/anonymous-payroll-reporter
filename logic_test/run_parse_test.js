const fs = require("fs");
const path = require("path");
const vm = require("vm");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

pdfjsLib.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/legacy/build/pdf.worker.js");

const PDF_PATH = path.resolve(
  __dirname,
  "test-payslip-no-pw.pdf"
);

function buildLineItemsFromTextItems(items) {
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
    .map((line) => ({
      ...line,
      items: line.items.sort((a, b) => a.x - b.x)
    }));
}

function buildLinesFromLineItems(lineItems) {
  return lineItems
    .map((line) =>
      line.items
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((lineText) => lineText);
}

function loadParserFunctions() {
  const parserConfigPath = path.resolve(
    __dirname,
    "../pwa/js/parser_config.js"
  );
  const parserPath = path.resolve(__dirname, "../pwa/js/parse/payroll.js");
  const context = {
    console,
    require,
    module: {},
    exports: {},
    process
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(parserConfigPath, "utf8"), context, {
    filename: parserConfigPath
  });
  vm.runInContext(fs.readFileSync(parserPath, "utf8"), context, {
    filename: parserPath
  });
  return context;
}

function diffValues(expected, actual, pathLabel = "") {
  const diffs = [];
  if (expected === actual) {
    return diffs;
  }
  if (typeof expected !== typeof actual) {
    diffs.push(`${pathLabel}: expected ${typeof expected}, got ${typeof actual}`);
    return diffs;
  }
  if (expected && typeof expected === "object" && actual) {
    const expectedKeys = Object.keys(expected);
    const actualKeys = Object.keys(actual);
    expectedKeys.forEach((key) => {
      diffs.push(...diffValues(expected[key], actual[key], `${pathLabel}.${key}`));
    });
    actualKeys.forEach((key) => {
      if (!expectedKeys.includes(key)) {
        diffs.push(`${pathLabel}.${key}: unexpected key`);
      }
    });
    return diffs;
  }
  diffs.push(`${pathLabel}: expected ${expected}, got ${actual}`);
  return diffs;
}

async function extractPdfData(pdfPath) {
  const buffer = fs.readFileSync(pdfPath);
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data, disableWorker: true });
  const pdf = await loadingTask.promise;
  let text = "";
  const allLines = [];
  const allLineItems = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const pageLineItems = buildLineItemsFromTextItems(content.items).map((line) => ({
      ...line,
      pageNumber: pageNum,
      pageWidth: viewport.width,
      pageHeight: viewport.height
    }));
    const pageLines = buildLinesFromLineItems(pageLineItems);
    allLineItems.push(...pageLineItems);
    allLines.push(...pageLines);
    text += `${pageLines.join("\n")}\n`;
  }

  return { text, lines: allLines, lineItems: allLineItems };
}

async function run() {
  const parserContext = loadParserFunctions();
  if (typeof parserContext.buildPayrollDocument !== "function") {
    throw new Error("buildPayrollDocument is not defined in payroll.js");
  }

  const { text, lines, lineItems } = await extractPdfData(PDF_PATH);
  const actual = parserContext.buildPayrollDocument({ text, lines, lineItems });

  const expected = {
    employee: {
      id: null,
      name: "[REDACTED]",
      natInsNumber: "[REDACTED]",
      address: {
        street: "Broadford Cottage",
        city: "Burnhead",
        administrativeArea: "DUMFRIES",
        postalCode: "DG2 0RS"
      }
    },
    employer: "[REDACTED]",
    payrollDoc: {
      processDate: {
        title: "Process Date",
        date: "28 Jul 2022"
      },
      taxCode: {
        title: "Tax Code",
        code: "S1257L"
      },
      payMethod: {
        title: "Pay Method",
        method: "Bank Transfer"
      },
      payRun: {
        title: "Pay Run",
        run: "Month 4"
      },
      payments: {
        hourly: {
          basic: {
            title: "Basic Hours",
            units: 189.75,
            rate: 10,
            amount: 1897.5
          },
          holiday: {
            title: "Holiday Hours",
            units: 0,
            rate: 0,
            amount: 0
          }
        },
        salary: {
          basic: {
            title: "Basic Salary",
            amount: null
          },
          holiday: {
            title: "Holiday Salary",
            units: 0,
            rate: 0,
            amount: 0
          }
        },
        misc: [
          {
            label: "Basic Hours-make up",
            units: 56.5,
            rate: 10,
            amount: 565
          }
        ]
      },
      deductions: {
        payeTax: {
          title: "PAYE Tax",
          amount: 261.6
        },
        natIns: {
          title: "National Insurance",
          amount: 187.42
        },
        nestEE: {
          title: "NEST Corporation - EE",
          amount: 97.13
        },
        nestER: {
          title: "NEST Corporation - ER",
          amount: 58.28
        },
        misc: [
          {
            title: "Other Net Deduction",
            units: null,
            rate: null,
            amount: 500
          }
        ]
      },
      thisPeriod: {
        earningsNI: {
          title: "Earnings for NI",
          amount: 2462.5
        },
        grossForTax: {
          title: "Gross for Tax",
          amount: 2365.37
        },
        totalGrossPay: {
          title: "Total Gross Pay",
          amount: 2462.5
        },
        payCycle: {
          title: "Pay Cycle",
          cycle: "Monthly"
        }
      },
      yearToDate: {
        totalGrossPayTD: 8630,
        grossForTaxTD: 8372.89,
        taxPaidTD: 828.59,
        earningsForNITD: 8620.15,
        nationalInsuranceTD: 676.17,
        employeePensionTD_AVC: 311.06,
        employerPensionTD: 196.21
      },
      netPay: {
        title: "Net Pay",
        amount: 1416.35
      }
    }
  };

  const diffs = diffValues(expected, actual, "result");
  if (diffs.length) {
    console.error("\nParse test failed:");
    diffs.forEach((diff) => console.error(`- ${diff}`));
    console.error("\nActual output:");
    console.error(JSON.stringify(actual, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log("\nParse test passed.");
}

run().catch((error) => {
  console.error("Parse test error:", error);
  process.exitCode = 1;
});
