"""
Payroll PDF Processor - Extract hours, employers, and staff pension contributions
"""

import os
import re
import calendar
import pdfplumber
import pandas as pd
from PIL import ImageChops
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import logging
from dateutil import parser

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class PayrollRecord:
    """Data class for payroll information"""
    employee_name: str
    employee_id: Optional[str]
    employer: str
    pay_period: str
    basic_hours: float
    basic_rate: float
    basic_amount: float
    nest_employee_contribution: float
    nest_employer_contribution: float
    pensions_adjustment: float
    corrections: float
    net_pay: float
    extraction_date: datetime


class PayrollPDFProcessor:
    """Main class for processing payroll PDFs"""

    def __init__(self, pdf_password: Optional[str] = None):
        self.records: List[PayrollRecord] = []
        self.pdf_password = pdf_password or os.environ.get("PAYROLL_DOC_PW")
        self.record_sources: List[str] = []

        # Regex patterns for data extraction
        self.patterns = {
            'employee_name': re.compile(r'(?:Employee|Name|Staff):\s*([A-Za-z\s]+)', re.IGNORECASE),
            'employee_id': re.compile(r'(?:ID|Ref|Employee\s*ID):\s*(\w+)', re.IGNORECASE),
            'employer': re.compile(r'(?:Employer|Company|Organization):\s*([A-Za-z\s&\-]+)', re.IGNORECASE),
            'pay_period': re.compile(r'(?:Period|Pay\s*Period|Week|Month):\s*([\d]{1,2}[\/\-][\d]{1,2}[\/\-][\d]{2,4}|[\w]+\s[\d]{4})', re.IGNORECASE),
            'basic_hours': re.compile(r'Basic\s*Hours\s+([\d,]+\.?\d*)', re.IGNORECASE),
            'basic_rate': re.compile(r'Basic\s*Hours\s+[\d,]+\.?\d*\s+£?([\d,]+\.?\d*)', re.IGNORECASE),
            'basic_amount': re.compile(r'Basic\s*Hours\s+[\d,]+\.?\d*\s+£?[\d,]+\.?\d*\s+£?([\d,]+\.?\d*)', re.IGNORECASE),
            'nest_employee': re.compile(r'NEST\s*Corporation\s*-\s*EE\s+£?([\d,]+\.?\d*)', re.IGNORECASE),
            'nest_employer': re.compile(r'NEST\s*Corporation\s*-\s*ER\s+£?([\d,]+\.?\d*)', re.IGNORECASE),
            'pensions_adjustment': re.compile(r'pensions\s*adjustment\s+£?([\d,]+\.?\d*)', re.IGNORECASE),
            'corrections': re.compile(r'Corrections?\s+£?([\d,]+\.?\d*)', re.IGNORECASE),
            'net_pay': re.compile(r'(?:Net\s*Pay|Take\s*Home|Net)\s+£?([\d,]+\.?\d*)', re.IGNORECASE),
            'header_date': re.compile(r'\b(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\b'),
            'header_name': re.compile(r'^([A-Za-z\s]+?)\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\b'),
        }

    def extract_text_from_pdf(self, pdf_path: str) -> str:
        """Extract text from PDF file"""
        try:
            with pdfplumber.open(pdf_path, password=self.pdf_password) as pdf:
                if pdf.pages:
                    self._save_first_page_screenshot(pdf, pdf_path)
                text = ""
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
            return text
        except Exception as e:
            logger.error(f"Error extracting text from {pdf_path}: {str(e)}")
            raise

    def _save_first_page_screenshot(self, pdf: pdfplumber.PDF, pdf_path: str) -> None:
        """Save a PNG screenshot of the first page to ./screenshots"""
        output_dir = "screenshots"
        os.makedirs(output_dir, exist_ok=True)
        base_name = os.path.splitext(os.path.basename(pdf_path))[0]
        output_path = os.path.join(output_dir, f"{base_name}_page_1.png")
        first_page = pdf.pages[0]
        page_image = first_page.to_image().original
        bbox = ImageChops.invert(page_image.convert("RGB")).getbbox()
        if bbox:
            whitespace_ratio = (page_image.height - bbox[3]) / page_image.height
            if whitespace_ratio > 0.4:
                points_per_cm = 72 / 2.54
                pixels_per_point = page_image.height / first_page.height
                extra_pixels = int(round(points_per_cm * 1.5 * pixels_per_point))
                crop_bottom = min(page_image.height, bbox[3] + extra_pixels)
                page_image = page_image.crop((0, 0, page_image.width, crop_bottom))
        page_image.save(output_path, format="PNG")

    def extract_field(self, text: str, field_name: str) -> Optional[str]:
        """Extract a specific field from text using regex patterns"""
        pattern = self.patterns.get(field_name)
        if not pattern:
            return None

        matches = pattern.findall(text)
        if matches:
            return matches[0].strip()
        return None

    def _extract_net_pay_from_text(self, text: str) -> Optional[str]:
        """Fallback: extract net pay from a standalone numeric line"""
        if not text:
            return None

        candidates = []
        for line in text.splitlines():
            stripped = line.strip()
            if re.match(r'^£?\d[\d,]*\.\d{2}$', stripped):
                candidates.append(stripped.lstrip('£'))

        if candidates:
            return candidates[-1]
        return None

    def parse_numeric_value(self, value: str) -> float:
        """Parse numeric value from string, handling commas and currency symbols"""
        if not value:
            return 0.0

        # Remove currency symbols and commas
        cleaned = re.sub(r'[£$,]', '', value.replace(',', ''))

        try:
            return float(cleaned)
        except ValueError:
            logger.warning(f"Could not parse numeric value: {value}")
            return 0.0

    def _format_currency(self, value: float) -> str:
        return f"£{value:.2f}"

    def _format_deduction(self, value: float) -> str:
        return f"-£{abs(value):.2f}"

    def extract_payroll_data(self, pdf_path: str) -> Optional[PayrollRecord]:
        """Extract payroll data from a single PDF file"""
        try:
            # Extract text from PDF
            text = self.extract_text_from_pdf(pdf_path)
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            header_line = lines[0] if lines else ""

            # Extract fields
            employee_name = self.extract_field(text, 'employee_name')
            employee_id = self.extract_field(text, 'employee_id')
            employer = self.extract_field(text, 'employer')
            pay_period = self.extract_field(text, 'pay_period')

            if not employee_name:
                employee_name = self._extract_header_name(header_line)

            if not pay_period:
                pay_period = self._extract_header_date(header_line)

            if not employer:
                employer = self._extract_employer_from_lines(lines)

            # Extract numeric values
            basic_hours_str = self.extract_field(text, 'basic_hours')
            basic_rate_str = self.extract_field(text, 'basic_rate')
            basic_amount_str = self.extract_field(text, 'basic_amount')
            nest_employee_str = self.extract_field(text, 'nest_employee')
            nest_employer_str = self.extract_field(text, 'nest_employer')
            pensions_adjustment_str = self.extract_field(text, 'pensions_adjustment')
            corrections_str = self.extract_field(text, 'corrections')
            net_pay_str = self.extract_field(text, 'net_pay')

            if not net_pay_str:
                net_pay_str = self._extract_net_pay_from_text(text)

            # Parse numeric values
            basic_hours = self.parse_numeric_value(basic_hours_str)
            basic_rate = self.parse_numeric_value(basic_rate_str)
            basic_amount = self.parse_numeric_value(basic_amount_str)
            nest_employee_contribution = self.parse_numeric_value(nest_employee_str)
            nest_employer_contribution = self.parse_numeric_value(nest_employer_str)
            pensions_adjustment = self.parse_numeric_value(pensions_adjustment_str)
            corrections = self.parse_numeric_value(corrections_str)
            net_pay = self.parse_numeric_value(net_pay_str)

            # Validate required fields
            if not employee_name or not employer:
                logger.warning(f"Missing required fields in {pdf_path}")
                return None

            # Create payroll record
            record = PayrollRecord(
                employee_name=employee_name,
                employee_id=employee_id,
                employer=employer,
                pay_period=pay_period or "Unknown",
                basic_hours=basic_hours,
                basic_rate=basic_rate,
                basic_amount=basic_amount,
                nest_employee_contribution=nest_employee_contribution,
                nest_employer_contribution=nest_employer_contribution,
                pensions_adjustment=pensions_adjustment,
                corrections=corrections,
                net_pay=net_pay,
                extraction_date=datetime.now()
            )

            self.record_sources = [pdf_path]
            return record

        except Exception as e:
            logger.error(f"Error processing {pdf_path}: {str(e)}")
            return None

    def process_multiple_pdfs(self, pdf_paths: List[str]) -> List[PayrollRecord]:
        """Process multiple PDF files"""
        records = []
        record_sources = []

        for pdf_path in pdf_paths:
            logger.info(f"Processing: {pdf_path}")
            record = self.extract_payroll_data(pdf_path)
            if record:
                records.append(record)
                record_sources.append(pdf_path)
                logger.info(f"Successfully extracted data for {record.employee_name}")
            else:
                logger.warning(f"Failed to extract data from {pdf_path}")

        self.records = records
        self.record_sources = record_sources
        return records

    def to_dataframe(self) -> pd.DataFrame:
        """Convert records to pandas DataFrame"""
        if not self.records:
            return pd.DataFrame()

        data = []
        for record in self.records:
            data.append({
                'Employee Name': record.employee_name,
                'Employee ID': record.employee_id,
                'Employer': record.employer,
                'Pay Period': record.pay_period,
                'Basic Hours (Units)': record.basic_hours,
                'Rate': record.basic_rate,
                'Amount': record.basic_amount,
                'NEST Corp - EE': record.nest_employee_contribution,
                'NEST Corp - ER': record.nest_employer_contribution,
                'Pensions Adjustment': record.pensions_adjustment,
                'Corrections': record.corrections,
                'Net Pay': record.net_pay,
                'Extraction Date': record.extraction_date
            })

        return pd.DataFrame(data)

    def export_to_csv(self, output_path: str) -> None:
        """Export extracted data to CSV file"""
        df = self.to_dataframe()
        if df.empty:
            logger.warning("No data to export")
            return

        df.to_csv(output_path, index=False)
        logger.info(f"Data exported to {output_path}")

    def get_summary_statistics(self) -> Dict:
        """Get summary statistics of extracted data"""
        if not self.records:
            return {}

        df = self.to_dataframe()

        summary = {
            'total_records': len(self.records),
            'total_basic_hours': df['Basic Hours (Units)'].sum(),
            'total_basic_amount': df['Amount'].sum(),
            'total_nest_employee': df['NEST Corp - EE'].sum(),
            'total_nest_employer': df['NEST Corp - ER'].sum(),
            'total_pensions_adjustment': df['Pensions Adjustment'].sum(),
            'total_corrections': df['Corrections'].sum(),
            'total_net_pay': df['Net Pay'].sum(),
            'average_rate': df['Rate'].mean(),
            'unique_employers': df['Employer'].nunique(),
            'employers': df['Employer'].unique().tolist()
        }

        return summary

    def _parse_pay_period_start(self, pay_period: str) -> Optional[datetime]:
        """Parse the start date from a pay period string"""
        if not pay_period:
            return None

        start_segment = pay_period.split("-")[0].strip()
        try:
            return parser.parse(start_segment, dayfirst=True, fuzzy=True)
        except (ValueError, parser.ParserError) as exc:
            logger.warning(f"Could not parse pay period '{pay_period}': {exc}")
            return None

    def _extract_header_date(self, header_line: str) -> Optional[str]:
        """Extract date from the header line if present"""
        if not header_line:
            return None
        match = self.patterns['header_date'].search(header_line)
        if match:
            return match.group(1)
        return None

    def _extract_header_name(self, header_line: str) -> Optional[str]:
        """Extract employee name from the header line if present"""
        if not header_line:
            return None
        match = self.patterns['header_name'].search(header_line)
        if match:
            return match.group(1).strip()
        return None

    def _extract_employer_from_lines(self, lines: List[str]) -> Optional[str]:
        """Extract employer from unlabelled lines (e.g., line ending with Ltd)"""
        for line in lines:
            if re.search(r'\bLtd\b|\bLimited\b', line):
                return line.strip()
        return None

    def generate_markdown_report(self, output_path: str = "payroll_report.md") -> None:
        """Generate a markdown report grouped by year with screenshots and summaries"""
        if not self.records:
            logger.warning("No data available to generate report")
            return

        if len(self.record_sources) == len(self.records):
            sources = self.record_sources
        else:
            sources = [None] * len(self.records)

        entries = []
        for record, source in zip(self.records, sources):
            parsed_date = self._parse_pay_period_start(record.pay_period)
            year = parsed_date.year if parsed_date else None
            month_index = parsed_date.month if parsed_date else 13
            month_label = parsed_date.strftime("%B") if parsed_date else "Unknown"
            entries.append({
                "record": record,
                "source": source,
                "parsed_date": parsed_date,
                "year": year,
                "month_index": month_index,
                "month_label": month_label,
            })

        def sort_key(entry: Dict) -> Tuple[int, int, str]:
            year_value = entry["year"] if entry["year"] is not None else 9999
            return (year_value, entry["month_index"], entry["record"].pay_period)

        entries.sort(key=sort_key)

        year_groups: Dict[Optional[int], List[Dict]] = {}
        for entry in entries:
            year_groups.setdefault(entry["year"], []).append(entry)

        parsed_dates = [entry["parsed_date"] for entry in entries if entry["parsed_date"]]
        if parsed_dates:
            range_start = min(parsed_dates)
            range_end = max(parsed_dates)
            date_range_label = (
                f"{range_start.strftime('%d %b %Y')} – {range_end.strftime('%d %b %Y')}"
            )
        else:
            date_range_label = "Unknown"

        employee_name = self.records[0].employee_name
        lines = [
            f"# Payroll Report - {employee_name}",
            "",
            "<style>",
            ".page {",
            "  text-align: center;",
            "  max-width: calc(100% - 12px);",
            "  padding: 6px;",
            "  margin: 0 6px;",
            "  border: 1px solid #ccc;",
            "  border-radius: 5px;",
            "  break-after: page;",
            "  page-break-before: always;",
            "  page-break-inside: avoid;",
            "  display: flex;",
            "  flex-direction: column;",
            "  flex-wrap: wrap;",
            "  align-items: stretch;",
            "  align-content: center;",
            "  justify-content: center;",
            "  overflow-x: auto;",
            "}",
            ".report-cell {",
            "  font-size: .8em;",
            "  width: 100%;",
            # "  margin: 3px 0;",
            # "  padding: 5px 0;",
            "  vertical-align: top;",
            "  display: flex;",
            "  flex-direction: row;",
            # "  flex-wrap: wrap;",
            "  align-content: center;",
            "  align-items: flex-start;",
            "  justify-content: center;",

            "}",
            ".report-cell.--empty {",
            "  min-height: 360px;",
            "}",
            ".report-image {",
            "  max-width: 100%;",
            "  border: 1px solid #ccc;",
            # "  max-height: 100mm;",
            "  border-radius: 5px;",
            "}",
            ".report-table {",
            "    font-size: .8em;",
            "    table-layout: fixed;",
            "    margin-left: 3px;",
            "    margin-block: 0;",
            "    border: 1px solid #ccc;",
            "    border-radius: 5px;",
            "    display: flex;",
            "    min-width: 165px;",
            "    flex-direction: column;",
            "    justify-content: center;",
            "    align-items: center;",
            "}",
            ".report-table table tr {",
            "   width: 100%;",
            "}",
            ".report-table table td {",
            "   width: 100%;",
            "}",
            ".report-table table th {",
            "   width: 100%;",
            "}",
            ".report-table.--empty {}",
            ".missing-time-cell {",
            "  height: 200px;",
            "  min-height: 200px;",
            "}",
            ".row-header {",
            "  font-weight: bold;",
            "}",
            "html body table {",
            "  font-size: .8em;",
            "  width: auto;",
            "  margin-block: 10px 15px;",
            "  display: block;",
            "  overflow: auto;",
            "  word-break: normal;",
            "  word-break: keep-all;",
            "}",
            "html body table th {",
            "  font-weight: normal;",
            "}",
            "th, td {",
            "  font-weight: normal;",
            "  border: 1px solid #ccc;",
            "}",
            "th {",
            "  background-color: #f2f2f2;",
            "}",
            "th, td {",
            "  padding: 5px;",
            "}",

            "</style>",
            "",
        ]

        total_nest_employee = 0.0
        total_nest_employer = 0.0
        total_pensions_adjustment = 0.0
        total_corrections = 0.0

        for year in sorted(year_groups.keys(), key=lambda value: value if value is not None else 9999):
            year_label = str(year) if year is not None else "Unknown Year"
            lines.extend([f"## {year_label}", ""])

            entries_for_year = year_groups[year]
            month_entries: Dict[int, Dict] = {
                entry["month_index"]: entry for entry in entries_for_year
                if entry["month_index"] in range(1, 13)
            }
            for month_index in range(1, 13):
                entry = month_entries.get(month_index)
                if not entry:
                    continue
                lines.append("<div class=\"page \">")

                lines.append(self._render_report_cell(entry))

                lines.append("</div>")
            lines.append("")
            lines.append("<div class=\"page \">")
            lines.append(f"<h2>{year_label} Summary: {employee_name}</h2>")
            lines.append("")
            lines.append("| Month | Basic Hours (Units) | NEST Corp - EE | NEST Corp - ER | Pensions Adjustment | Corrections | Combined NEST |")
            lines.append("| --- | --- | --- | --- | --- | --- | --- |")

            year_hours = 0.0
            year_nest_employee = 0.0
            year_nest_employer = 0.0
            year_pensions_adjustment = 0.0
            year_corrections = 0.0

            for month_index in range(1, 13):
                month_label = calendar.month_name[month_index]
                entry = month_entries.get(month_index)
                if entry:
                    record = entry["record"]
                    combined = record.nest_employee_contribution + record.nest_employer_contribution
                    hours_value = record.basic_hours
                    nest_employee_value = record.nest_employee_contribution
                    nest_employer_value = record.nest_employer_contribution
                    pensions_adjustment_value = record.pensions_adjustment
                    corrections_value = record.corrections
                else:
                    combined = 0.0
                    hours_value = 0.0
                    nest_employee_value = 0.0
                    nest_employer_value = 0.0
                    pensions_adjustment_value = 0.0
                    corrections_value = 0.0

                nest_employee_display = self._format_currency(nest_employee_value)
                nest_employer_display = self._format_currency(nest_employer_value)
                pensions_adjustment_display = self._format_deduction(pensions_adjustment_value)
                corrections_display = self._format_deduction(corrections_value)
                combined_display = self._format_currency(combined)
                lines.append(
                    f"| {month_label} | {hours_value:.2f} | {nest_employee_display} | "
                    f"{nest_employer_display} | {pensions_adjustment_display} | {corrections_display} | "
                    f"{combined_display} |"
                )

                year_hours += hours_value
                year_nest_employee += nest_employee_value
                year_nest_employer += nest_employer_value
                year_pensions_adjustment += pensions_adjustment_value
                year_corrections += corrections_value

            year_combined = year_nest_employee + year_nest_employer
            year_nest_employee_display = self._format_currency(year_nest_employee)
            year_nest_employer_display = self._format_currency(year_nest_employer)
            year_pensions_adjustment_display = self._format_deduction(year_pensions_adjustment)
            year_corrections_display = self._format_deduction(year_corrections)
            year_combined_display = self._format_currency(year_combined)
            lines.append(
                f"| Total | {year_hours:.2f} | {year_nest_employee_display} | {year_nest_employer_display} | "
                f"{year_pensions_adjustment_display} | {year_corrections_display} | {year_combined_display} |"
            )
            lines.append("")
            lines.append("</div>")
            lines.append("")

            total_nest_employee += year_nest_employee
            total_nest_employer += year_nest_employer
            total_pensions_adjustment += year_pensions_adjustment
            total_corrections += year_corrections

        total_combined = total_nest_employee + total_nest_employer

        lines.extend([
            "<div class=\"page\">",
            "",
            f"## Summary Totals: {employee_name} ({date_range_label})",
            "",
            "<div class=\"report-cell\">",
             "",
            "| NEST Corp - EE | NEST Corp - ER | Pensions Adjustment | Corrections | Total Contribution |",
            "| --- | --- | --- | --- | --- |",
            f"| {self._format_currency(total_nest_employee)} | {self._format_currency(total_nest_employer)} | "
            f"{self._format_deduction(total_pensions_adjustment)} | {self._format_deduction(total_corrections)} | "
            f"{self._format_currency(total_combined)} |",
             "",
            "</div>",
            "</div>",
            "",
        ])

        with open(output_path, "w", encoding="utf-8") as report_file:
            report_file.write("\n".join(lines))
        logger.info(f"Markdown report written to {output_path}")

    def _render_report_cell(self, entry: Dict) -> str:
        """Render a single report cell for the markdown report"""
        record = entry["record"]
        source = entry["source"]
        parsed_date = entry.get("parsed_date")
        if source:
            base_name = os.path.splitext(os.path.basename(source))[0]
            image_path = os.path.join("screenshots", f"{base_name}_page_1.png")
        else:
            image_path = ""
        if parsed_date:
            date_label = parsed_date.strftime("%d %b %Y")
        else:
            date_label = record.pay_period or "Unknown"
        combined = record.nest_employee_contribution + record.nest_employer_contribution

        image_html = (
            f"<img class=\"report-image\" src=\"{image_path}\" alt=\"{date_label}\" />"
            if image_path
            else ""
        )

        table_rows = [
            "    <table class=\"report-table\">",
            f"      <tr style=\"border-bottom: 2px solid black;\"><th class=\"row-header\" align=\"left\">Date</th><td>{date_label}</td></tr>",
            "       <tr><th class=\"row-header\" align=\"left\" colspan=\"2\">Payments</th></tr>",
            f"      <tr><th align=\"left\">Basic Hours (Units)</th><td>{record.basic_hours:.2f}</td></tr>",
            f"      <tr><th align=\"left\">Rate</th><td>{self._format_currency(record.basic_rate)}</td></tr>",
            f"      <tr><th align=\"left\">Pre-Tax Amount</th><td>{self._format_currency(record.basic_amount)}</td></tr>",
            "       <tr><th class=\"row-header\" align=\"left\" colspan=\"2\">Pension Deductions</th></tr>",
            f"      <tr><th align=\"left\">NEST Corp - EE</th><td>{self._format_currency(record.nest_employee_contribution)}</td></tr>",
            f"      <tr><th align=\"left\">NEST Corp - ER</th><td>{self._format_currency(record.nest_employer_contribution)}</td></tr>",
        ]
        if record.pensions_adjustment != 0:
            table_rows.append(
                f"      <tr><th align=\"left\">Pensions adjustment</th><td>{self._format_deduction(record.pensions_adjustment)}</td></tr>"
            )
        if record.corrections != 0:
            table_rows.append(
                f"      <tr><th align=\"left\">Corrections</th><td>{self._format_deduction(record.corrections)}</td></tr>"
            )
        table_rows.extend([
            f"      <tr><th class=\"row-header\" align=\"left\">Combined NEST</th><td>{self._format_currency(combined)}</td></tr>",
            # "       <tr><th class=\"row-header\" align=\"left\" colspan=\"2\">Net Pay</th></tr>",
            f"      <tr style=\"border-top: 2px solid black;\"><th class=\"row-header\" align=\"left\">Net Pay (after deductions)</th><td>{self._format_currency(record.net_pay)}</td></tr>",
            "    </table>",
        ])
        table_html = "\n".join(table_rows)

        return "\n".join([
            "  <div class=\"report-cell\">",
            f"    {image_html}",
            table_html,
            "  </div>",
        ])

    def _render_empty_report_cell(self, month_label: str, year: Optional[int]) -> str:
        """Render an empty report cell for a missing month"""
        if year:
            date_label = f"{month_label} {year}"
        else:
            date_label = month_label
        return "\n".join([
            "  <div class=\"report-cell --empty\">",
            f"      <strong>{month_label}</strong>",
            "      <div class=\"missing-time-cell\"></div>",
            "      <table class=\"report-table report-table --empty\">",
            f"       <tr style=\"border-bottom: 2px solid black;\"><th class=\"row-header\"align=\"left\">Date</th><td>{date_label}</td></tr>",
            "        <tr><th class=\"row-header\" align=\"left\" colspan=\"2\">Payments</th></tr>",
            "        <tr><th align=\"left\">Basic Hours (Units)</th><td>0.00</td></tr>",
            f"        <tr><th align=\"left\">Rate</th><td>{self._format_currency(0.0)}</td></tr>",
            f"        <tr><th align=\"left\">Pre-Tax Amount</th><td>{self._format_currency(0.0)}</td></tr>",
            "        <tr><th class=\"row-header\" align=\"left\" colspan=\"2\">Pension Deductions</th></tr>",
            f"        <tr><th align=\"left\">NEST Corp - EE</th><td>{self._format_currency(0.0)}</td></tr>",
            f"        <tr><th align=\"left\">NEST Corp - ER</th><td>{self._format_currency(0.0)}</td></tr>",
            f"        <tr><th align=\"left\">Pensions adjustment</th><td>{self._format_deduction(0.0)}</td></tr>",
            f"        <tr><th align=\"left\">Corrections</th><td>{self._format_deduction(0.0)}</td></tr>",
            # "        <tr><th class=\"row-header\" align=\"left\" colspan=\"2\">Net Pay</th></tr>",
            f"        <tr><th class=\"row-header\" align=\"left\">Combined contribution</th><td>{self._format_currency(0.0)}</td></tr>",
            f"        <tr style=\"border-top: 2px solid black;\"><th class=\"row-header\" align=\"left\">Net Pay (after deductions)</th><td>{self._format_currency(0.0)}</td></tr>",
            "      </table>",
            "  </div>",
        ])

def main():
    """Example usage"""
    processor = PayrollPDFProcessor()

    # Example: Process single PDF
    # record = processor.extract_payroll_data("path/to/payroll.pdf")
    # if record:
    #     print(f"Extracted data for {record.employee_name}")

    # Example: Process multiple PDFs
    # pdf_files = ["payroll1.pdf", "payroll2.pdf", "payroll3.pdf"]
    # records = processor.process_multiple_pdfs(pdf_files)

    # Export to CSV
    # processor.export_to_csv("payroll_data.csv")

    # Get summary
    # summary = processor.get_summary_statistics()
    # print(summary)


if __name__ == "__main__":
    main()
