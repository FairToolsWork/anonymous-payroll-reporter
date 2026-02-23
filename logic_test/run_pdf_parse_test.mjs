import { createCanvas } from "canvas";
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";
import { fileURLToPath, pathToFileURL } from "url";
import vm from "vm";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

pdfjsLib.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/legacy/build/pdf.worker.js");

const PDF_PATH = path.resolve(
  __dirname,
  "./test_files/payslips/test-payslip-no-pw.pdf"
);

function loadParserFunctions() {
  const parserConfigPath = path.resolve(
    __dirname,
    "../pwa/js/parse/parser_config.js"
  );
  const parserPath = path.resolve(__dirname, "../pwa/js/parse/payroll.js");
  const extractPath = path.resolve(__dirname, "../pwa/js/pdf/extract.js");
  const pdfjsLibForTests = {
    ...pdfjsLib,
    getDocument: (args) => pdfjsLib.getDocument({ ...args, disableWorker: true })
  };
  const window = { pdfjsLib: pdfjsLibForTests };
  const document = {
    createElement: (tag) => {
      if (tag !== "canvas") {
        throw new Error(`Unsupported element: ${tag}`);
      }
      return createCanvas(1, 1);
    }
  };
  const context = {
    console,
    require,
    module: {},
    exports: {},
    process,
    window,
    document
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(parserConfigPath, "utf8"), context, {
    filename: parserConfigPath
  });
  vm.runInContext(fs.readFileSync(extractPath, "utf8"), context, {
    filename: extractPath
  });
  vm.runInContext(fs.readFileSync(parserPath, "utf8"), context, {
    filename: parserPath
  });
  return context;
}

function formatDiffValue(value) {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function diffValues(expected, actual, pathLabel = "", extraKeys = []) {
  const diffs = [];
  if (expected === actual) {
    return { diffs, extraKeys };
  }
  if (typeof expected !== typeof actual) {
    diffs.push(
      `${pathLabel}: expected (${typeof expected}) ${formatDiffValue(expected)}, got (${typeof actual}) ${formatDiffValue(actual)}`
    );
    return { diffs, extraKeys };
  }
  if (expected && typeof expected === "object" && actual) {
    const expectedKeys = Object.keys(expected);
    const actualKeys = Object.keys(actual);
    expectedKeys.forEach((key) => {
      const result = diffValues(expected[key], actual[key], `${pathLabel}.${key}`, extraKeys);
      diffs.push(...result.diffs);
    });
    actualKeys.forEach((key) => {
      if (!expectedKeys.includes(key)) {
        extraKeys.push(`${pathLabel}.${key}`);
      }
    });
    return { diffs, extraKeys };
  }
  diffs.push(`${pathLabel}: expected ${formatDiffValue(expected)}, got ${formatDiffValue(actual)}`);
  return { diffs, extraKeys };
}

async function run() {
  const parserContext = loadParserFunctions();
  if (typeof parserContext.buildPayrollDocument !== "function") {
    throw new Error("buildPayrollDocument is not defined in payroll.js");
  }
  if (typeof parserContext.extractPdfData !== "function") {
    throw new Error("extractPdfData is not defined in extract.js");
  }

  const buffer = fs.readFileSync(PDF_PATH);
  const file = {
    arrayBuffer: async () =>
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
  const { text, lines, lineItems } = await parserContext.extractPdfData(file, "");
  const actual = parserContext.buildPayrollDocument({ text, lines, lineItems });
  if (actual && typeof actual === "object" && "imageData" in actual) {
    delete actual.imageData;
  }
  const expectedModule = await import(pathToFileURL(
    path.resolve(__dirname, "./test_files/payslips/payslip_target_data_shape.js")
  ));
  const expected = expectedModule.default;

  const { diffs, extraKeys } = diffValues(expected, actual, "result", []);
  if (diffs.length) {
    console.error("\nParse test failed:");
    diffs.forEach((diff) => console.error(`- ${diff}`));
    if (extraKeys.length) {
      console.error("\nExtra keys found (not used for failure):");
      extraKeys.forEach((key) => console.error(`- ${key}`));
    }
    console.error("\nActual output:");
    console.error(JSON.stringify(actual, null, 2));
    process.exitCode = 1;
    return;
  }
  if (extraKeys.length) {
    console.warn("\nParse test warning: extra keys found:");
    extraKeys.forEach((key) => console.warn(`- ${key}`));
  }
  console.log("\nParse test passed.");
}

run().catch((error) => {
  console.error("Parse test error:", error);
  process.exitCode = 1;
});
