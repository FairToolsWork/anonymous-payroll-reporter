import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import XLSX from "xlsx";
import { parseContributionWorkbook } from "../pwa/js/parse/contribution_validation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_DIR = path.resolve(
  __dirname,
  "./test_files/nest-test-penstion-reports"
);

const SUMMARY_PATH = path.resolve(
  __dirname,
  "./test_files/nest-test-penstion-reports/nest_contribution_target_summary.js"
);

const FIXTURES = {
  malformed: {
    file: "malformed.xlsx",
    error: "CONTRIBUTION_HEADER_INVALID"
  },
  mixedCompanies: {
    file: "nest-contribution-history-mixed-companies.xlsx",
    error: "CONTRIBUTION_EMPLOYER_MIXED"
  },
  missingEE: {
    file: "nest-contribution-history-missing-EE.xlsx",
    error: "CONTRIBUTION_MISSING_EE_ER",
    missingTypes: ["Employee"]
  },
  missingER: {
    file: "nest-contribution-history-missing-ER.xlsx",
    error: "CONTRIBUTION_MISSING_EE_ER",
    missingTypes: ["Employer"]
  },
  correct: {
    file: "nest-contribution-history-correct.xlsx",
    error: null
  }
};

function readWorkbook(filename) {
  const filePath = path.join(FIXTURE_DIR, filename);
  const buffer = fs.readFileSync(filePath);
  return XLSX.read(buffer, { type: "buffer" });
}

function assertArrayEquals(actual, expected, label) {
  const normalizedActual = Array.isArray(actual) ? actual.slice().sort() : actual;
  const normalizedExpected = Array.isArray(expected) ? expected.slice().sort() : expected;
  const match = JSON.stringify(normalizedActual) === JSON.stringify(normalizedExpected);
  if (!match) {
    throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function buildSummary(entries) {
  const summary = {
    totalEntries: entries.length,
    eeCount: 0,
    erCount: 0,
    eeTotal: 0,
    erTotal: 0,
    startDate: null,
    endDate: null
  };
  entries.forEach((entry) => {
    if (entry.type === "ee") {
      summary.eeCount += 1;
      summary.eeTotal += entry.amount;
    } else if (entry.type === "er") {
      summary.erCount += 1;
      summary.erTotal += entry.amount;
    }
    const timeValue = entry.date.getTime();
    if (summary.startDate === null || timeValue < summary.startDate) {
      summary.startDate = timeValue;
    }
    if (summary.endDate === null || timeValue > summary.endDate) {
      summary.endDate = timeValue;
    }
  });
  summary.eeTotal = Number(summary.eeTotal.toFixed(2));
  summary.erTotal = Number(summary.erTotal.toFixed(2));
  summary.startDate = summary.startDate === null
    ? null
    : new Date(summary.startDate).toISOString().slice(0, 10);
  summary.endDate = summary.endDate === null
    ? null
    : new Date(summary.endDate).toISOString().slice(0, 10);
  return summary;
}

function runFixture(expectedSummary, { file, error, missingTypes }) {
  const workbook = readWorkbook(file);
  if (!error) {
    const result = parseContributionWorkbook(workbook, file, XLSX);
    if (!result.entries || !result.entries.length) {
      throw new Error(`${file}: expected entries, got none`);
    }
    const summary = buildSummary(result.entries);
    const match = JSON.stringify(summary) === JSON.stringify(expectedSummary);
    if (!match) {
      throw new Error(`${file}: summary mismatch. expected ${JSON.stringify(expectedSummary)}, got ${JSON.stringify(summary)}`);
    }
    return;
  }
  try {
    parseContributionWorkbook(workbook, file, XLSX);
  } catch (err) {
    if (err?.message !== error) {
      throw new Error(`${file}: expected error ${error}, got ${err?.message}`);
    }
    if (error === "CONTRIBUTION_EMPLOYER_MIXED" && !Array.isArray(err?.employers)) {
      throw new Error(`${file}: expected employers list on error`);
    }
    if (error === "CONTRIBUTION_MISSING_EE_ER" && missingTypes) {
      assertArrayEquals(err?.missingTypes || [], missingTypes, `${file}: missingTypes`);
    }
    return;
  }
  throw new Error(`${file}: expected error ${error}, got success`);
}

async function run() {
  const expectedSummary = (await import(pathToFileURL(SUMMARY_PATH))).default;
  const failures = [];
  Object.values(FIXTURES).forEach((fixture) => {
    try {
      runFixture(expectedSummary, fixture);
      console.log(`✔ ${fixture.file}`);
    } catch (err) {
      failures.push({ file: fixture.file, error: err });
      console.error(`✘ ${fixture.file}: ${err?.message || err}`);
    }
  });

  if (failures.length) {
    console.error(`\nContribution tests failed (${failures.length}).`);
    process.exitCode = 1;
    return;
  }

  console.log("\nContribution tests passed.");
}

run().catch((err) => {
  console.error(err?.message || err);
  process.exitCode = 1;
});
