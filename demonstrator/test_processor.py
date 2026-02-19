"""
Test script for the Payroll PDF Processor
"""

import unittest
import os
from unittest.mock import patch, MagicMock
from payroll_processor import PayrollPDFProcessor, PayrollRecord


class TestPayrollProcessor(unittest.TestCase):
    """Test cases for PayrollPDFProcessor"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.processor = PayrollPDFProcessor()
        
        # Sample text that mimics payroll PDF content
        self.sample_text = """
        PAYROLL STATEMENT
        
        Employee: John Smith
        Employee ID: EMP001
        Employer: ABC Company Ltd
        Pay Period: 01/02/2024 - 15/02/2024
        
        Hours Worked: 40.0
        Hourly Rate: £15.50
        Gross Pay: £620.00
        
        Staff Pension Contribution: £31.00
        Employer Pension Contribution: £46.50
        Net Pay: £542.50
        """
    
    def test_extract_field(self):
        """Test field extraction from text"""
        # Test employee name extraction
        name = self.processor.extract_field(self.sample_text, 'employee_name')
        self.assertEqual(name, 'John Smith')
        
        # Test employer extraction
        employer = self.processor.extract_field(self.sample_text, 'employer')
        self.assertEqual(employer, 'ABC Company Ltd')
        
        # Test hours worked extraction
        hours = self.processor.extract_field(self.sample_text, 'hours_worked')
        self.assertEqual(hours, '40.0')
        
        # Test pension extraction
        staff_pension = self.processor.extract_field(self.sample_text, 'staff_pension')
        self.assertEqual(staff_pension, '31.00')
    
    def test_parse_numeric_value(self):
        """Test numeric value parsing"""
        # Test basic number
        result = self.processor.parse_numeric_value("123.45")
        self.assertEqual(result, 123.45)
        
        # Test with currency symbol
        result = self.processor.parse_numeric_value("£620.00")
        self.assertEqual(result, 620.00)
        
        # Test with commas
        result = self.processor.parse_numeric_value("£1,234.56")
        self.assertEqual(result, 1234.56)
        
        # Test empty string
        result = self.processor.parse_numeric_value("")
        self.assertEqual(result, 0.0)
        
        # Test invalid string
        result = self.processor.parse_numeric_value("invalid")
        self.assertEqual(result, 0.0)
    
    @patch('payroll_processor.pdfplumber.open')
    def test_extract_text_from_pdf(self, mock_pdf_open):
        """Test PDF text extraction"""
        # Mock PDF content
        mock_page = MagicMock()
        mock_page.extract_text.return_value = self.sample_text
        mock_pdf = MagicMock()
        mock_pdf.pages = [mock_page]
        mock_pdf_open.return_value.__enter__.return_value = mock_pdf
        
        # Test extraction
        result = self.processor.extract_text_from_pdf("test.pdf")
        self.assertIn("John Smith", result)
        self.assertIn("ABC Company Ltd", result)
    
    def test_extract_payroll_data(self):
        """Test complete payroll data extraction"""
        # Mock the PDF text extraction
        with patch.object(self.processor, 'extract_text_from_pdf', return_value=self.sample_text):
            record = self.processor.extract_payroll_data("test.pdf")
            
            # Verify extracted data
            self.assertIsInstance(record, PayrollRecord)
            self.assertEqual(record.employee_name, 'John Smith')
            self.assertEqual(record.employee_id, 'EMP001')
            self.assertEqual(record.employer, 'ABC Company Ltd')
            self.assertEqual(record.hours_worked, 40.0)
            self.assertEqual(record.hourly_rate, 15.50)
            self.assertEqual(record.gross_pay, 620.00)
            self.assertEqual(record.staff_pension_contribution, 31.00)
            self.assertEqual(record.employer_pension_contribution, 46.50)
            self.assertEqual(record.net_pay, 542.50)
    
    def test_to_dataframe(self):
        """Test DataFrame conversion"""
        # Create sample records
        record1 = PayrollRecord(
            employee_name="John Smith",
            employee_id="EMP001",
            employer="ABC Company",
            pay_period="Feb 2024",
            hours_worked=40.0,
            hourly_rate=15.50,
            gross_pay=620.00,
            staff_pension_contribution=31.00,
            employer_pension_contribution=46.50,
            net_pay=542.50,
            extraction_date=None
        )
        
        record2 = PayrollRecord(
            employee_name="Jane Doe",
            employee_id="EMP002",
            employer="XYZ Corp",
            pay_period="Feb 2024",
            hours_worked=35.5,
            hourly_rate=18.00,
            gross_pay=639.00,
            staff_pension_contribution=31.95,
            employer_pension_contribution=63.90,
            net_pay=543.15,
            extraction_date=None
        )
        
        self.processor.records = [record1, record2]
        df = self.processor.to_dataframe()
        
        # Verify DataFrame
        self.assertEqual(len(df), 2)
        self.assertEqual(df.iloc[0]['Employee Name'], 'John Smith')
        self.assertEqual(df.iloc[1]['Employee Name'], 'Jane Doe')
        self.assertEqual(df.iloc[0]['Employer'], 'ABC Company')
        self.assertEqual(df.iloc[1]['Employer'], 'XYZ Corp')
    
    def test_get_summary_statistics(self):
        """Test summary statistics calculation"""
        # Create sample records
        record1 = PayrollRecord(
            employee_name="John Smith",
            employee_id="EMP001",
            employer="ABC Company",
            pay_period="Feb 2024",
            hours_worked=40.0,
            hourly_rate=15.50,
            gross_pay=620.00,
            staff_pension_contribution=31.00,
            employer_pension_contribution=46.50,
            net_pay=542.50,
            extraction_date=None
        )
        
        record2 = PayrollRecord(
            employee_name="Jane Doe",
            employee_id="EMP002",
            employer="ABC Company",
            pay_period="Feb 2024",
            hours_worked=35.5,
            hourly_rate=18.00,
            gross_pay=639.00,
            staff_pension_contribution=31.95,
            employer_pension_contribution=63.90,
            net_pay=543.15,
            extraction_date=None
        )
        
        self.processor.records = [record1, record2]
        summary = self.processor.get_summary_statistics()
        
        # Verify statistics
        self.assertEqual(summary['total_records'], 2)
        self.assertEqual(summary['total_hours_worked'], 75.5)
        self.assertEqual(summary['total_gross_pay'], 1259.00)
        self.assertEqual(summary['total_staff_pension'], 62.95)
        self.assertEqual(summary['total_employer_pension'], 110.40)
        self.assertEqual(summary['total_net_pay'], 1085.65)
        self.assertEqual(summary['unique_employers'], 1)
        self.assertEqual(summary['employers'], ['ABC Company'])


def run_integration_test():
    """Run integration test with real PDF if available"""
    print("Integration Test")
    print("=" * 40)
    
    processor = PayrollPDFProcessor()
    
    # Check for test PDF files
    test_files = []
    for file in os.listdir('.'):
        if file.lower().endswith('.pdf') and 'test' in file.lower():
            test_files.append(file)
    
    if test_files:
        print(f"Found {len(test_files)} test PDF files")
        for pdf_file in test_files:
            print(f"\nProcessing: {pdf_file}")
            try:
                record = processor.extract_payroll_data(pdf_file)
                if record:
                    print(f"✓ Successfully extracted data for {record.employee_name}")
                    print(f"  Employer: {record.employer}")
                    print(f"  Hours: {record.hours_worked}")
                    print(f"  Staff Pension: £{record.staff_pension_contribution}")
                else:
                    print(f"✗ Failed to extract data from {pdf_file}")
            except Exception as e:
                print(f"✗ Error processing {pdf_file}: {str(e)}")
    else:
        print("No test PDF files found")
        print("To run integration tests, place sample payroll PDFs with 'test' in the filename")


if __name__ == "__main__":
    # Run unit tests
    print("Running Unit Tests")
    print("=" * 40)
    unittest.main(verbosity=2, exit=False)
    
    print("\n" + "=" * 40)
    
    # Run integration test
    run_integration_test()
