declare const Vue: any

declare namespace pdfjsLib {
    interface PDFPageProxy {
        getViewport(args: { scale: number }): { width: number; height: number }
        getTextContent(): Promise<{
            items: Array<{ transform: number[]; str: string }>
        }>
        view?: number[]
        render(args: {
            canvasContext: CanvasRenderingContext2D | null
            viewport: { width: number; height: number }
        }): { promise: Promise<void> }
    }
}

type PDFPageProxy = pdfjsLib.PDFPageProxy

declare const PATTERNS: {
    nameDateId: RegExp
    employeeNo: RegExp
    employerLine: RegExp
    basicLine: RegExp
    holidayLine: RegExp
    basicSalaryLine: RegExp
    holidaySalaryLine: RegExp
    payeTax: RegExp
    nationalInsurance: RegExp
    nestEmployee: RegExp
    nestEmployer: RegExp
    taxCode: RegExp
    payRun: RegExp
    payMethod: RegExp
    earningsForNI: RegExp
    grossForTax: RegExp
    totalGrossPay: RegExp
    payCycle: RegExp
    totalGrossPayTD: RegExp
    grossForTaxTD: RegExp
    taxPaidTD: RegExp
    earningsForNITD: RegExp
    nationalInsuranceTD: RegExp
    employeePensionTD: RegExp
    employerPensionTD: RegExp
    netPay: RegExp
}

declare function formatMonthLabel(monthIndex: number): string
declare function buildMissingMonthsLabel(
    missingByYear: Record<string, string[]>
): string
declare function buildMissingMonthsHtml(
    missingByYear: Record<string, string[]>
): string

declare function buildReport(
    records: any,
    failedPayPeriods?: string[]
): { html: string; filename: string; stats: any }
declare function extractPdfData(
    file: File,
    password: string
): Promise<{
    text: string
    imageData: string | null
    lines: string[]
    lineItems: Array<{
        pageNumber: number
        y: number
        items: Array<{ x: number; text: string }>
    }>
}>
declare function buildPayrollDocument(args: {
    text: string
    lines: string[]
    lineItems: Array<{
        pageNumber: number
        y: number
        items: Array<{ x: number; text: string }>
    }>
}): any

declare function parseContributionWorkbook(
    workbook: any,
    sourceName: string,
    xlsx: any
): {
    entries: Array<{ date: Date; type: 'ee' | 'er'; amount: number }>
    debugRows?: unknown[]
    debugEntries?: Array<{ date: Date; type: 'ee' | 'er'; amount: number }>
}

declare function parsePayrollPdf(
    file: File,
    password: string
): Promise<{
    record: any
    debug: {
        text: string
        lines: string[]
        lineItems: Array<{
            pageNumber: number
            y: number
            items: Array<{ x: number; text: string }>
        }>
        imageData: string | null
    }
}>

interface Window {
    XLSX?: any
    pdfjsLib?: typeof pdfjsLib
}
