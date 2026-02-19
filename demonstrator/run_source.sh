#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if [ -f "$ROOT_DIR/.env" ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' "$ROOT_DIR/.env" | xargs)
fi

"$ROOT_DIR/.venv/bin/python" - <<'PY'
import glob
from payroll_processor import PayrollPDFProcessor

pdfs = sorted(glob.glob("source/*.pdf"))
processor = PayrollPDFProcessor()
records = processor.process_multiple_pdfs(pdfs)
processor.export_to_csv("payroll_data.csv")
processor.generate_markdown_report("payroll_report.md")
print(f"Processed {len(records)} PDFs")
PY
