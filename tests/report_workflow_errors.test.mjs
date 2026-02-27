import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import {
    buildBrowserShims,
    runReportFromFixtures,
} from './utils/report_runner.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ERROR_FIXTURES_DIR = path.resolve(
    __dirname,
    './test_files/report-workflow-errors/fixtures/missing-employee'
)
const MIXED_EMPLOYEE_FIXTURES_DIR = path.resolve(
    __dirname,
    './test_files/report-workflow-errors/fixtures/mixed-employee'
)
const MIXED_EMPLOYER_FIXTURES_DIR = path.resolve(
    __dirname,
    './test_files/report-workflow-errors/fixtures/mixed-employer'
)
const MISSING_MONTHS_FIXTURES_DIR = path.resolve(
    __dirname,
    './test_files/report-workflow-errors/fixtures/missing-months'
)
const EXCEL_FIXTURES_DIR = path.resolve(
    __dirname,
    './test_files/excel-contribution/fixtures'
)

const MISSING_EMPLOYEE_PDF = path.resolve(
    ERROR_FIXTURES_DIR,
    'payslip-2024-04.pdf'
)
const PASSWORD_PDF = path.resolve(
    ERROR_FIXTURES_DIR,
    'payslip-2024-04-protected.pdf'
)
const MALFORMED_EXCEL = path.resolve(EXCEL_FIXTURES_DIR, 'malformed.xlsx')
const MIXED_EMPLOYER_EXCEL = path.resolve(
    EXCEL_FIXTURES_DIR,
    'nest-contribution-history-mixed-employers-report-workflow.xlsx'
)

describe('report workflow errors', () => {
    it('fails on password-protected PDFs', async () => {
        buildBrowserShims()
        await expect(
            runReportFromFixtures({ pdfPaths: [PASSWORD_PDF] })
        ).rejects.toMatchObject({
            message: 'PASSWORD_REQUIRED',
            fileName: 'payslip-2024-04-protected.pdf',
        })
    })

    it('fails on incorrect PDF password', async () => {
        buildBrowserShims()
        await expect(
            runReportFromFixtures({
                pdfPaths: [PASSWORD_PDF],
                pdfPassword: 'incorrect',
            })
        ).rejects.toMatchObject({
            message: 'INCORRECT_PASSWORD',
            fileName: 'payslip-2024-04-protected.pdf',
        })
    })

    it('fails on malformed contribution workbooks', async () => {
        await expect(
            runReportFromFixtures({
                pdfPaths: [],
                excelPaths: [MALFORMED_EXCEL],
            })
        ).rejects.toMatchObject({
            message: 'CONTRIBUTION_FILE_FAILURES',
        })
        try {
            await runReportFromFixtures({
                pdfPaths: [],
                excelPaths: [MALFORMED_EXCEL],
            })
        } catch (error) {
            expect(error.failures).toHaveLength(1)
            expect(error.failures[0]).toMatchObject({
                name: 'malformed.xlsx',
            })
            expect(typeof error.failures[0].code).toBe('string')
        }
    })

    it('rejects records missing employee details', async () => {
        buildBrowserShims()
        const result = await runReportFromFixtures({
            pdfPaths: [MISSING_EMPLOYEE_PDF],
            requireEmployeeDetails: true,
        })
        expect(result.records).toHaveLength(0)
        expect(result.report).toBeNull()
        expect(result.failedFiles).toContain('payslip-2024-04.pdf')
        expect(result.failedPayPeriods).toHaveLength(0)
    })

    it('fails on mixed employee payrolls', async () => {
        buildBrowserShims()
        const pdfPaths = ['payslip-2024-04.pdf', 'payslip-2024-05.pdf'].map(
            (file) => path.resolve(MIXED_EMPLOYEE_FIXTURES_DIR, file)
        )
        await expect(runReportFromFixtures({ pdfPaths })).rejects.toMatchObject(
            {
                message: 'PAYROLL_EMPLOYEE_MIXED',
            }
        )
    })

    it('fails on mixed employer payrolls', async () => {
        buildBrowserShims()
        const pdfPaths = ['payslip-2024-04.pdf', 'payslip-2024-05.pdf'].map(
            (file) => path.resolve(MIXED_EMPLOYER_FIXTURES_DIR, file)
        )
        await expect(runReportFromFixtures({ pdfPaths })).rejects.toMatchObject(
            {
                message: 'PAYROLL_EMPLOYER_MIXED',
            }
        )
    })

    it('reports missing months for sparse payrolls', async () => {
        buildBrowserShims()
        const pdfPaths = [
            'payslip-2024-04.pdf',
            'payslip-2024-05.pdf',
            'payslip-2024-07.pdf',
            'payslip-2024-09.pdf',
        ].map((file) => path.resolve(MISSING_MONTHS_FIXTURES_DIR, file))
        const result = await runReportFromFixtures({
            pdfPaths,
            includeReportContext: true,
            requireEmployeeDetails: false,
        })
        expect(result.report).toBeTruthy()
        expect(result.report.stats.missingMonthsByYear).toEqual(
            result.reportContext.missingMonths.missingMonthsByYear
        )
    })

    it('fails on mixed employer contribution workbooks', async () => {
        await expect(
            runReportFromFixtures({
                pdfPaths: [],
                excelPaths: [MIXED_EMPLOYER_EXCEL],
            })
        ).rejects.toMatchObject({
            message: 'CONTRIBUTION_FILE_FAILURES',
        })
        try {
            await runReportFromFixtures({
                pdfPaths: [],
                excelPaths: [MIXED_EMPLOYER_EXCEL],
            })
        } catch (error) {
            expect(error.failures).toHaveLength(1)
            expect(error.failures[0]).toMatchObject({
                name: 'nest-contribution-history-mixed-employers-report-workflow.xlsx',
                code: 'CONTRIBUTION_EMPLOYER_MIXED',
            })
        }
    })
})
