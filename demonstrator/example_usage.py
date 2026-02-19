"""
Example usage of the Payroll PDF Processor
"""

import os
from payroll_processor import PayrollPDFProcessor


def process_single_pdf_example():
    """Example of processing a single payroll PDF"""
    # Option 1: rely on PAYROLL_DOC_PW in your environment
    processor = PayrollPDFProcessor()

    # Replace with your actual PDF file path
    pdf_path = "sample_payroll.pdf"

    if os.path.exists(pdf_path):
        record = processor.extract_payroll_data(pdf_path)
        if record:
            print(f"Successfully extracted data for {record.employee_name}")
            print(f"Employer: {record.employer}")
            print(f"Hours Worked: {record.hours_worked}")
            print(f"Staff Pension Contribution: £{record.staff_pension_contribution}")
            print(f"Employer Pension Contribution: £{record.employer_pension_contribution}")
        else:
            print("Failed to extract data from PDF")
    else:
        print(f"PDF file not found: {pdf_path}")


def process_multiple_pdfs_example():
    """Example of processing multiple payroll PDFs"""
    # Option 2: provide the password explicitly
    # processor = PayrollPDFProcessor(pdf_password="your-password-here")
    processor = PayrollPDFProcessor()

    # Replace with your actual PDF file paths
    pdf_files = [
        "payroll_jan.pdf",
        "payroll_feb.pdf",
        "payroll_mar.pdf"
    ]

    # Filter only existing files
    existing_files = [f for f in pdf_files if os.path.exists(f)]

    if existing_files:
        records = processor.process_multiple_pdfs(existing_files)
        print(f"Successfully processed {len(records)} files")

        # Export to CSV
        processor.export_to_csv("payroll_data.csv")

        # Generate markdown report
        processor.generate_markdown_report("payroll_report.md")

        # Get summary statistics
        summary = processor.get_summary_statistics()
        print("\nSummary Statistics:")
        print(f"Total Records: {summary['total_records']}")
        print(f"Total Hours Worked: {summary['total_hours_worked']}")
        print(f"Total Gross Pay: £{summary['total_gross_pay']}")
        print(f"Total Staff Pension: £{summary['total_staff_pension']}")
        print(f"Total Employer Pension: £{summary['total_employer_pension']}")
        print(f"Unique Employers: {summary['unique_employers']}")
        print(f"Employers: {', '.join(summary['employers'])}")
    else:
        print("No PDF files found")


def batch_process_directory_example():
    """Example of processing all PDFs in a directory"""
    processor = PayrollPDFProcessor()

    # Directory containing payroll PDFs
    payroll_dir = "payroll_pdfs"

    if os.path.exists(payroll_dir):
        # Get all PDF files in directory
        pdf_files = [
            os.path.join(payroll_dir, f)
            for f in os.listdir(payroll_dir)
            if f.lower().endswith('.pdf')
        ]

        if pdf_files:
            print(f"Found {len(pdf_files)} PDF files to process")
            records = processor.process_multiple_pdfs(pdf_files)

            # Export results
            output_csv = os.path.join(payroll_dir, "extracted_payroll_data.csv")
            processor.export_to_csv(output_csv)

            # Display summary
            summary = processor.get_summary_statistics()
            print(f"\nProcessing complete. Data saved to {output_csv}")
            print(f"Total records extracted: {summary['total_records']}")
        else:
            print("No PDF files found in directory")
    else:
        print(f"Directory not found: {payroll_dir}")


def custom_pattern_example():
    """Example of using custom regex patterns for specific PDF formats"""
    processor = PayrollPDFProcessor()

    # Add custom patterns if your PDFs have different formats
    processor.patterns.update({
        'custom_hours': r'Worked\s*Hours[:\s]*([\d\.]+)',
        'custom_pension': r'Employee\s*Pension[:\s]*£?([\d,\.]+)',
    })

    # Process files with custom patterns
    pdf_path = "custom_format_payroll.pdf"
    if os.path.exists(pdf_path):
        record = processor.extract_payroll_data(pdf_path)
        if record:
            print(f"Custom extraction successful for {record.employee_name}")
        else:
            print("Custom extraction failed")


if __name__ == "__main__":
    print("Payroll PDF Processor Examples")
    print("=" * 40)

    # Uncomment the example you want to run:

    # process_single_pdf_example()
    # process_multiple_pdfs_example()
    # batch_process_directory_example()
    # custom_pattern_example()

    print("\nTo run an example, uncomment the corresponding function call above")
    print("Make sure you have payroll PDF files in the specified locations")
