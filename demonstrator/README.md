# Payroll PDF Processor DEMONSTRATOR

A Python application that extracts payroll information from PDF files, specifically designed to extract:

- Hours worked
- Employer information
- Staff pension contributions
- Employer pension contributions
- Additional payroll data

## Features

- **PDF Text Extraction**: Uses pdfplumber for reliable text extraction from PDF files
- **Pattern Matching**: Regex-based extraction for various payroll formats
- **Data Validation**: Built-in validation and error handling
- **CSV Export**: Export extracted data to CSV format
- **Batch Processing**: Process multiple PDF files at once
- **Summary Statistics**: Generate summary reports from extracted data

## Installation

1. Install the required dependencies:

```bash
pip install -r requirements.txt
```

1. The main dependencies are:

- `PyPDF2`: PDF file handling
- `pdfplumber`: Advanced PDF text extraction
- `pandas`: Data manipulation and CSV export
- `python-dateutil`: Date parsing
- `regex`: Advanced regex support

## Run Source Test

To process the PDFs in the `source/` directory and generate screenshots, CSV output, and the markdown report:

```bash
./run_source.sh
```

## Usage

### Basic Usage

```python
from payroll_processor import PayrollPDFProcessor

# Option 1: use PAYROLL_DOC_PW from your environment (e.g., in .env)
# processor = PayrollPDFProcessor()

# Option 2: pass the password explicitly
# processor = PayrollPDFProcessor(pdf_password="your-password-here")

# Initialize the processor
processor = PayrollPDFProcessor()

# Process a single PDF
record = processor.extract_payroll_data("payroll.pdf")
if record:
    print(f"Employee: {record.employee_name}")
    print(f"Hours Worked: {record.hours_worked}")
    print(f"Staff Pension: £{record.staff_pension_contribution}")

# Process multiple PDFs
pdf_files = ["payroll1.pdf", "payroll2.pdf", "payroll3.pdf"]
records = processor.process_multiple_pdfs(pdf_files)

# Export to CSV
processor.export_to_csv("payroll_data.csv")
```

### Batch Processing

```python
# Process all PDFs in a directory
import os

payroll_dir = "payroll_pdfs"
pdf_files = [
    os.path.join(payroll_dir, f)
    for f in os.listdir(payroll_dir)
    if f.lower().endswith('.pdf')
]

records = processor.process_multiple_pdfs(pdf_files)
processor.export_to_csv("extracted_data.csv")
```

### Summary Statistics

```python
# Get summary of extracted data
summary = processor.get_summary_statistics()
print(f"Total Records: {summary['total_records']}")
print(f"Total Hours: {summary['total_hours_worked']}")
print(f"Total Staff Pension: £{summary['total_staff_pension']}")
```

### Markdown Report

```python
# Generate a markdown report with screenshots and yearly summaries
processor.generate_markdown_report("payroll_report.md")
```

## Extracted Data Fields

The processor extracts the following information from payroll PDFs:

- **Employee Name**: Staff member name
- **Employee ID**: Staff identification number (if available)
- **Employer**: Company/organization name
- **Pay Period**: Payroll period (week/month)
- **Hours Worked**: Total hours for the period
- **Hourly Rate**: Pay rate per hour
- **Gross Pay**: Total pay before deductions
- **Staff Pension Contribution**: Employee pension amount
- **Employer Pension Contribution**: Company pension contribution
- **Net Pay**: Take-home pay after deductions

## Supported PDF Formats

The processor uses flexible regex patterns to handle various payroll formats:

- Employee names and IDs
- Different date formats (DD/MM/YYYY, Month YYYY, etc.)
- Currency symbols (£, $)
- Decimal and comma-separated numbers
- Various field label formats

## Custom Patterns

If your PDFs use different field labels, you can add custom patterns:

```python
processor = PayrollPDFProcessor()

# Add custom regex patterns
processor.patterns.update({
    'custom_hours': r'Worked\s*Hours[:\s]*([\d\.]+)',
    'custom_pension': r'Employee\s*Pension[:\s]*£?([\d,\.]+)',
})

# Process with custom patterns
record = processor.extract_payroll_data("custom_payroll.pdf")
```

## Error Handling

The processor includes comprehensive error handling:

- **File Access Errors**: Handles missing or corrupted PDF files
- **Text Extraction Errors**: Manages PDFs with extractable text
- **Data Validation**: Validates required fields and numeric values
- **Logging**: Detailed logging for debugging and monitoring

## Output Formats

### CSV Export

The extracted data is exported to CSV with the following columns:

- Employee Name
- Employee ID
- Employer
- Pay Period
- Hours Worked
- Hourly Rate
- Gross Pay
- Staff Pension Contribution
- Employer Pension Contribution
- Net Pay
- Extraction Date

### DataFrame

Access data as a pandas DataFrame for further analysis:

```python
df = processor.to_dataframe()
print(df.head())
print(df.describe())
```

### Markdown Report

The report is grouped by year and includes:

- Two-column screenshot layout (first page of each PDF)
- Per-document tables with hours and pension contributions
- Yearly summary tables with totals
- Overall summary totals at the end

## Examples

See `example_usage.py` for detailed examples of:

- Single PDF processing
- Batch processing
- Directory scanning
- Custom pattern usage

## Requirements

- Python 3.7+
- PDF files with extractable text (not scanned images)
- For password-protected PDFs, set PAYROLL_DOC_PW in your environment
- Sufficient memory for processing large batches of PDFs

## Limitations

- Requires PDFs with extractable text (not image-based PDFs)
- Regex patterns may need adjustment for unique payroll formats
- Performance depends on PDF size and complexity
- Large batches may require significant memory

## Troubleshooting

### Common Issues

1. **No data extracted**: Check if PDF has extractable text
2. **Missing fields**: Verify regex patterns match your PDF format
3. **Currency parsing**: Ensure currency symbols are supported
4. **Memory issues**: Process files in smaller batches

### Debug Mode

Enable detailed logging:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```
