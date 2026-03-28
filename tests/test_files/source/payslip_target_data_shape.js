/**
 This is a reference object for a payroll document for PDF.js + Parser extraction tests.
 Associated Payroll Document Structure:

 Row 1: Heading (row spans whole width) -  ALWAYS CONTAINS  "Employee No" (may be empty value), "Employee Name", "Process Date", "National Insurance Number" (may be empty value)

 Row 2 Col 1: Payments - MAY contain Basic Hours, Salary, other misc payment types
 Row 2 Col 2: Deductions - ALWAYS CONTAINS  "PAYE Tax", "National Insurance", MAY CONTAIN  "NEST Corporation- EE", "NEST Corporation", MAY CONTAIN RANDOM DEDUCTONS (this example also has a random 'Other Net Dedictions')

 Row 3 Col 1: (no heading) will ALWAYS CONTAIN: Employee Name & Address
 Row 3 Col 2: Period Earnings - will ALWAYS CONTAIN: "Earnings for NI", "Gross for Tax", "Total Gross Pay", "Pay Cycle"
 Row 3 Col 3: Year To Date - will ALWAYS CONTAIN: "Total Gross Pay TD",
 "Tax Paid TD", "Earnings for NI TD", National Insurance TD", "Ee Pension TD (inc AVC)", "Employers Pension TD"

 Row 4 Col 1: Will ALWAYS CONTAIN: "Company Name": (eg [REDACTED]), "Tax Code", "Pay Run: Month: {N}", "Pay Method:"
 Row 4 Col 2: Will ALWAYS CONTAIN: "Net Pay"
*/

export default {
    employee: {
        id: null,
        name: 'Jane Doe',
        natInsNumber: 'AA000000A',
        address: {
            street: 'Some Apartment',
            city: 'SOMETOWN',
            administrativeArea: 'SOMEWHERE',
            postalCode: 'XX0 0XX',
        },
    },
    employer: 'The Better Place Catering Company Limited',
    payrollDoc: {
        processDate: {
            title: 'Process Date',
            date: '20 Jul 2025',
        },
        taxCode: {
            title: 'Tax Code',
            code: 'S1257L',
        },
        payMethod: {
            title: 'Pay Method',
            method: 'Bank Transfer',
        },
        payRun: {
            title: 'Pay Run',
            run: 'Month 4',
        },
        payments: {
            hourly: {
                basic: {
                    title: 'Basic Hours',
                    units: 189.75,
                    rate: 10,
                    amount: 1897.5,
                },
                holiday: {
                    title: 'Holiday',
                    units: null,
                    rate: null,
                    amount: null,
                },
            },
            salary: {
                basic: {
                    title: 'Salary',
                    amount: null,
                },
                holiday: {
                    title: 'Holiday',
                    units: null,
                    rate: null,
                    amount: null,
                },
            },
            misc: [
                {
                    title: 'Basic Hours make-up',
                    units: 56.5,
                    rate: 10,
                    amount: 565,
                },
            ],
        },
        deductions: {
            payeTax: {
                title: 'PAYE Tax',
                amount: 261.6,
            },
            natIns: {
                title: 'National Insurance',
                amount: 187.42,
            },
            pensionEE: {
                title: 'NEST Corporation - EE',
                amount: 97.13,
            },
            pensionER: {
                title: 'NEST Corporation - ER',
                amount: 58.28,
            },
            misc: [
                {
                    title: 'Other Net Deduction',
                    units: null,
                    rate: null,
                    amount: 500,
                },
            ],
        },
        thisPeriod: {
            earningsNI: {
                title: 'Earnings for NI',
                amount: 2462.5,
            },
            grossForTax: {
                title: 'Gross for Tax',
                amount: 2365.37,
            },
            totalGrossPay: {
                title: 'Total Gross Pay',
                amount: 2462.5,
            },
            payCycle: {
                title: 'Pay Cycle',
                cycle: 'Monthly',
            },
        },
        yearToDate: {
            totalGrossPayTD: 8630,
            grossForTaxTD: 8372.89,
            taxPaidTD: 828.59,
            earningsForNITD: 8620.15,
            nationalInsuranceTD: 676.17,
            employeePensionTD_AVC: 311.06,
            employerPensionTD: 196.21,
        },
        netPay: {
            title: 'Net Pay',
            amount: 1416.35,
        },
    },
}
