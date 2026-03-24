from io import BytesIO
import importlib.util
import json
from pathlib import Path
import sys

import pdfplumber
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from pdf_utils import build_line_map

BASE_DIR = Path(__file__).resolve().parent.parent
TEST_FIXTURE_DIR = BASE_DIR / "tests" / "test_files"

OUTPUT_DIR = TEST_FIXTURE_DIR / "pdf-parse" / "fixtures"
DEFAULT_EMPLOYER = "The Better Place Catering Company Limited"
CONFIG_PATH = Path(__file__).resolve().parent / "fixture_runs.json"
INPUTS_PATH = Path(__file__).resolve().parent / "payroll_inputs.json"
PAYROLL_CONSTANTS = {}
FORMAT_PROCESSOR = None

MONTHS = []
MONTH_ABBREVIATIONS = {
    1: "Jan",
    2: "Feb",
    3: "Mar",
    4: "Apr",
    5: "May",
    6: "Jun",
    7: "Jul",
    8: "Aug",
    9: "Sep",
    10: "Oct",
    11: "Nov",
    12: "Dec",
}

DATASET = []
PERSONAL_ALLOWANCE_ANNUAL = 0.0
PERSONAL_ALLOWANCE_MONTHLY = 0.0
NATIONAL_TAX_BANDS_ANNUAL = []
NATIONAL_TAX_BANDS_MONTHLY = []
NI_THRESHOLD_MONTHLY = 0.0
NI_EMPLOYEE_RATE = 0.0
NI_EMPLOYER_RATE = 0.0
PENS_QUAL_LOWER_MONTHLY = 0.0
PENS_QUAL_UPPER_MONTHLY = 0.0
PENS_EMPLOYEE_RATE = 0.0
PENS_EMPLOYER_RATE = 0.0

def load_inputs(path=None):
    target = path or INPUTS_PATH
    if not target.exists():
        raise FileNotFoundError(f"Missing payroll inputs file: {target}")
    with target.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("Payroll inputs must be a JSON object")
    constants = payload.get("constants")
    if not isinstance(constants, dict):
        raise ValueError("Payroll inputs must include a 'constants' object")
    dataset = payload.get("dataset")
    if not isinstance(dataset, list):
        raise ValueError("Payroll inputs must include a 'dataset' array")

    bands = constants.get("national_tax_bands_annual")
    if not isinstance(bands, list):
        raise ValueError("constants.national_tax_bands_annual must be an array")
    parsed_bands = []
    for band in bands:
        if not isinstance(band, list) or len(band) != 2:
            raise ValueError("Each tax band must be a [limit, rate] array")
        limit, rate = band
        if isinstance(limit, str) and limit.lower() == "inf":
            limit = float("inf")
        parsed_bands.append((float(limit), float(rate)))

    parsed_dataset = []
    for entry in dataset:
        if not isinstance(entry, dict):
            raise ValueError("Each dataset entry must be an object")
        basic_lines = entry.get("basic_lines")
        if not isinstance(basic_lines, list) or not basic_lines:
            raise ValueError("Each dataset entry must include basic_lines")
        parsed_lines = []
        for line in basic_lines:
            if not isinstance(line, list) or len(line) != 2:
                raise ValueError("Each basic line must be [hours, rate]")
            parsed_lines.append((float(line[0]), float(line[1])))
        makeup_lines = entry.get("makeup_lines")
        if not isinstance(makeup_lines, list):
            raise ValueError("Each dataset entry must include makeup_lines")
        holiday_lines = entry.get("holiday_lines")
        if not isinstance(holiday_lines, list):
            raise ValueError("Each dataset entry must include holiday_lines")
        if len(makeup_lines) > 1:
            raise ValueError("Each dataset entry must include at most one makeup line")
        if len(holiday_lines) > 1:
            raise ValueError("Each dataset entry must include at most one holiday line")
        parsed_makeup = []
        for line in makeup_lines:
            if not isinstance(line, list) or len(line) != 2:
                raise ValueError("Each makeup line must be [hours, rate]")
            parsed_makeup.append((float(line[0]), float(line[1])))
        parsed_holiday = []
        for line in holiday_lines:
            if not isinstance(line, list) or len(line) != 2:
                raise ValueError("Each holiday line must be [hours, rate]")
            parsed_holiday.append((float(line[0]), float(line[1])))
        parsed_entry = dict(entry)
        parsed_entry["basic_lines"] = parsed_lines
        parsed_entry["makeup_lines"] = parsed_makeup
        parsed_entry["holiday_lines"] = parsed_holiday
        parsed_dataset.append(parsed_entry)

    pension_provider = constants.get("pension_provider")
    if not isinstance(pension_provider, str) or not pension_provider.strip():
        raise ValueError("constants.pension_provider must be a non-empty string")

    employee_id_text = constants.get("employee_id_text")
    if not isinstance(employee_id_text, str) or not employee_id_text.strip():
        raise ValueError("constants.employee_id_text must be a non-empty string")

    tax_code_value = constants.get("tax_code_value")
    if not isinstance(tax_code_value, str) or not tax_code_value.strip():
        raise ValueError("constants.tax_code_value must be a non-empty string")

    pay_method_value = constants.get("pay_method_value")
    if not isinstance(pay_method_value, str) or not pay_method_value.strip():
        raise ValueError("constants.pay_method_value must be a non-empty string")

    return {
        "constants": constants,
        "dataset": parsed_dataset,
        "tax_bands": parsed_bands,
        "pension_provider": pension_provider,
        "employee_id_text": employee_id_text,
        "tax_code_value": tax_code_value,
        "pay_method_value": pay_method_value,
    }


def load_processor(format_dir):
    global FORMAT_PROCESSOR
    processor_path = format_dir / "processor.py"
    if not processor_path.exists():
        raise FileNotFoundError(f"Missing format processor: {processor_path}")
    spec = importlib.util.spec_from_file_location("format_processor", processor_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["format_processor"] = module
    spec.loader.exec_module(module)
    FORMAT_PROCESSOR = module


def resolve_source_path(value):
    resolved = Path(value)
    if not resolved.is_absolute():
        resolved = BASE_DIR / resolved
    return resolved


def load_structure(structure_path):
    path = structure_path
    if not path.exists():
        raise FileNotFoundError(f"Missing payslip structure file: {path}")
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("Payslip structure must be a JSON object")

    labels_path = path.parent / "labels.json"
    if labels_path.exists():
        with labels_path.open("r", encoding="utf-8") as handle:
            labels = json.load(handle)
        if not isinstance(labels, list):
            raise ValueError("labels.json must be a JSON array")
        for entry in labels:
            section = entry.get("structureSection")
            key = entry.get("structureKey")
            label = entry.get("label")
            if not isinstance(section, str) or not isinstance(key, str) or not isinstance(label, str):
                raise ValueError(f"labels.json entry missing structureSection, structureKey, or label: {entry}")
            if section not in payload:
                raise ValueError(
                    f"labels.json entry '{key}' references structureSection '{section}' "
                    f"which does not exist in structure.json"
                )
            if not isinstance(payload.get(section), dict):
                raise ValueError(
                    f"labels.json entry '{key}' references structureSection '{section}' "
                    f"which is not an object in structure.json"
                )
            payload[section][key] = label

    schema_path = path.parent / "schema.json"
    if not schema_path.exists():
        raise FileNotFoundError(f"Missing schema file: {schema_path}")
    with schema_path.open("r", encoding="utf-8") as handle:
        schema = json.load(handle)
    if not isinstance(schema, dict) or not schema:
        raise ValueError("Payslip schema must be a non-empty JSON object")
    for section, keys in schema.items():
        if not isinstance(keys, list):
            raise ValueError(f"Payslip structure schema.{section} must be an array")
        for key in keys:
            if not isinstance(key, str) or not key.strip():
                raise ValueError(
                    f"Payslip structure schema.{section} entries must be non-empty strings"
                )

    for section, string_keys in schema.items():
        section_payload = payload.get(section)
        if not isinstance(section_payload, dict):
            raise ValueError(f"Payslip structure missing '{section}' object")
        for key in string_keys:
            value = section_payload.get(key)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(
                    f"Payslip structure {section}.{key} must be a non-empty string"
                )

    address_block = payload.get("address_block") or {}
    address_lines = address_block.get("address_lines")
    if address_lines is not None and not isinstance(address_lines, int):
        raise ValueError("Payslip structure address_block.address_lines must be an integer")

    for section, string_keys in schema.items():
        section_payload = payload.get(section)
        position = section_payload.get("position")
        if position is not None:
            if not isinstance(position, dict):
                raise ValueError(
                    f"Payslip structure {section}.position must be an object"
                )
            anchor_point = position.get("anchor_point")
            if not isinstance(anchor_point, list) or len(anchor_point) != 2:
                raise ValueError(
                    f"Payslip structure {section}.position.anchor_point must be [x, y]"
                )
            if not all(isinstance(v, (int, float)) for v in anchor_point):
                raise ValueError(
                    f"Payslip structure {section}.position.anchor_point must be numeric"
                )
            max_width = position.get("max_width")
            if not isinstance(max_width, (int, float)):
                raise ValueError(
                    f"Payslip structure {section}.position.max_width must be numeric"
                )
            nudge = position.get("nudge")
            if not isinstance(nudge, list) or len(nudge) != 2:
                raise ValueError(
                    f"Payslip structure {section}.position.nudge must be [x, y]"
                )
            if not all(isinstance(v, (int, float)) for v in nudge):
                raise ValueError(
                    f"Payslip structure {section}.position.nudge must be numeric"
                )

    layout = payload.get("layout")
    if not isinstance(layout, dict):
        raise ValueError("Payslip structure missing 'layout' object")
    for key in ("font", "bold_font"):
        if not isinstance(layout.get(key), str) or not layout[key].strip():
            raise ValueError(f"Payslip structure layout.{key} must be a non-empty string")
    for key in ("mid_band_scan_margin", "row_cluster_threshold"):
        if not isinstance(layout.get(key), (int, float)):
            raise ValueError(f"Payslip structure layout.{key} must be numeric")

    sources = payload.get("sources")
    if not isinstance(sources, dict):
        raise ValueError("Payslip structure missing 'sources' object")
    for key in ("base_pdf", "background_pdf"):
        if not isinstance(sources.get(key), str) or not sources[key].strip():
            raise ValueError(f"Payslip structure sources.{key} must be a non-empty string")
    base_pdf = resolve_source_path(sources["base_pdf"])
    if not base_pdf.exists():
        raise FileNotFoundError(f"Payslip structure sources.base_pdf not found: {base_pdf}")
    background_pdf = resolve_source_path(sources["background_pdf"])
    if not background_pdf.exists():
        raise FileNotFoundError(f"Payslip structure sources.background_pdf not found: {background_pdf}")

    payload["_resolved_base_pdf"] = base_pdf
    payload["_resolved_background_pdf"] = background_pdf
    return payload


def apply_structure(payload):
    FORMAT_PROCESSOR.configure(payload)


def _build_month_meta():
    meta = {}
    for idx, (year, month_number, label) in enumerate(MONTHS):
        month_key = f"{year}-{month_number:02d}"
        meta[month_key] = {
            "index": idx,
            "year": year,
            "month_number": month_number,
            "label": label,
        }
    return meta


def apply_inputs(payload):
    global DATASET
    global PERSONAL_ALLOWANCE_ANNUAL
    global PERSONAL_ALLOWANCE_MONTHLY
    global NATIONAL_TAX_BANDS_ANNUAL
    global NATIONAL_TAX_BANDS_MONTHLY
    global NI_THRESHOLD_MONTHLY
    global NI_EMPLOYEE_RATE
    global NI_EMPLOYER_RATE
    global PENS_QUAL_LOWER_MONTHLY
    global PENS_QUAL_UPPER_MONTHLY
    global PENS_EMPLOYEE_RATE
    global PENS_EMPLOYER_RATE
    global MONTHS
    global PAYROLL_CONSTANTS

    constants = payload["constants"]
    DATASET = payload["dataset"]
    PERSONAL_ALLOWANCE_ANNUAL = float(constants.get("personal_allowance_annual", 0.0))
    PERSONAL_ALLOWANCE_MONTHLY = float(constants.get("personal_allowance_monthly", 0.0))
    NATIONAL_TAX_BANDS_ANNUAL = payload["tax_bands"]
    PAYROLL_CONSTANTS = payload["constants"]
    MONTHS = []
    for entry in DATASET:
        month_value = entry.get("month")
        if not isinstance(month_value, str) or "-" not in month_value:
            raise ValueError("Each dataset entry must include a YYYY-MM month string")
        year_text, month_text = month_value.split("-", 1)
        if not year_text.isdigit() or not month_text.isdigit():
            raise ValueError("Each dataset entry must include a YYYY-MM month string")
        month_number = int(month_text)
        label = MONTH_ABBREVIATIONS.get(month_number)
        if label is None:
            raise ValueError(f"Invalid month number in dataset: {month_value}")
        MONTHS.append((int(year_text), month_number, label))

    NATIONAL_TAX_BANDS_MONTHLY = []
    previous_limit = PERSONAL_ALLOWANCE_ANNUAL
    for limit, rate in NATIONAL_TAX_BANDS_ANNUAL:
        width = max(0.0, limit - previous_limit)
        NATIONAL_TAX_BANDS_MONTHLY.append((width / 12.0, rate))
        previous_limit = limit

    NI_THRESHOLD_MONTHLY = float(constants.get("ni_threshold_monthly", 0.0))
    NI_EMPLOYEE_RATE = float(constants.get("ni_employee_rate", 0.0))
    NI_EMPLOYER_RATE = float(constants.get("ni_employer_rate", 0.0))
    PENS_QUAL_LOWER_MONTHLY = float(constants.get("pens_qual_lower_monthly", 0.0))
    PENS_QUAL_UPPER_MONTHLY = float(constants.get("pens_qual_upper_monthly", 0.0))
    PENS_EMPLOYEE_RATE = float(constants.get("pens_employee_rate", 0.0))
    PENS_EMPLOYER_RATE = float(constants.get("pens_employer_rate", 0.0))




def calc_paye(gross_tax):
    taxable = max(0.0, gross_tax - PERSONAL_ALLOWANCE_MONTHLY)
    remaining = taxable
    tax = 0.0
    for band_width, rate in NATIONAL_TAX_BANDS_MONTHLY:
        if remaining <= 0:
            break
        band_amount = min(remaining, band_width)
        tax += band_amount * rate
        remaining -= band_amount
    return round(tax, 2)


def calc_ni_employee(gross):
    return round(max(0.0, gross - NI_THRESHOLD_MONTHLY) * NI_EMPLOYEE_RATE, 2)


def calc_ni_employer(gross):
    return round(max(0.0, gross - NI_THRESHOLD_MONTHLY) * NI_EMPLOYER_RATE, 2)


def calc_pens(gross):
    qualifying = min(gross, PENS_QUAL_UPPER_MONTHLY) - PENS_QUAL_LOWER_MONTHLY
    qualifying = max(0.0, qualifying)
    ee = round(qualifying * PENS_EMPLOYEE_RATE, 2)
    er = round(qualifying * PENS_EMPLOYER_RATE, 2)
    return ee, er


def calc_gross_from_payments(data):
    basic_total = sum(hours * rate for hours, rate in data["basic_lines"])
    makeup_total = sum(hours * rate for hours, rate in data["makeup_lines"])
    holiday_total = sum(hours * rate for hours, rate in data["holiday_lines"])
    holiday_hours = (
        data["holiday_lines"][0][0] if data["holiday_lines"] else 0.0
    )
    return round(basic_total + makeup_total + holiday_total, 2), holiday_hours


def apply_holiday_adjustments(dataset):
    adjusted = []
    ytd = {
        "gross": 0.0,
        "gross_tax": 0.0,
        "paye": 0.0,
        "ni": 0.0,
        "ee": 0.0,
        "er": 0.0,
    }
    for data in dataset:
        month_num = int(data["month"].split("-")[1])
        if month_num == 4:
            ytd = {
                "gross": 0.0,
                "gross_tax": 0.0,
                "paye": 0.0,
                "ni": 0.0,
                "ee": 0.0,
                "er": 0.0,
            }
        gross, holiday_hours = calc_gross_from_payments(data)
        ee, er = calc_pens(gross)
        gross_tax = round(gross - ee, 2)
        paye = calc_paye(gross_tax)
        ni = calc_ni_employee(gross)
        net = round(gross - paye - ni - ee - data["other_deduction"], 2)

        ytd["gross"] += gross
        ytd["gross_tax"] += gross_tax
        ytd["paye"] += paye
        ytd["ni"] += ni
        ytd["ee"] += ee
        ytd["er"] += er

        entry = dict(data)
        entry["holiday_hours"] = holiday_hours
        entry["gross"] = gross
        entry["paye"] = paye
        entry["ni"] = ni
        entry["ee"] = ee
        entry["er"] = er
        entry["net"] = net
        entry["ytd_gross"] = round(ytd["gross"], 2)
        entry["ytd_gross_tax"] = round(ytd["gross_tax"], 2)
        entry["ytd_paye"] = round(ytd["paye"], 2)
        entry["ytd_ni"] = round(ytd["ni"], 2)
        entry["ytd_ee"] = round(ytd["ee"], 2)
        entry["ytd_er"] = round(ytd["er"], 2)
        adjusted.append(entry)
    return adjusted


def apply_fixture(
    words,
    line_map,
    line_text,
    structure,
    data,
    month_index,
    month_label,
    year,
    reset_payrun,
    employee_name=None,
    employee_nat_ins=None,
    employer_name=None,
    employee_address=None,
    overrides=None,
):
    return FORMAT_PROCESSOR.apply_fixture(
        words,
        line_map,
        line_text,
        structure,
        PAYROLL_CONSTANTS,
        data,
        month_index,
        month_label,
        year,
        reset_payrun,
        employee_name=employee_name,
        employee_nat_ins=employee_nat_ins,
        employer_name=employer_name,
        employee_address=employee_address,
        overrides=overrides,
    )


def draw_pdf(words, width, height, output_path, background_image, word_groups=None):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(output_path), pagesize=(width, height), invariant=1)
    if background_image is not None:
        c.drawImage(background_image, 0, 0, width=width, height=height)

    def draw_debug_box(group_name, group_words):
        visible = [w for w in group_words if w.get("text")]
        if not visible:
            return
        x0 = min(w["x0"] for w in visible)
        x1 = max(w["x1"] for w in visible)
        top = min(w["top"] for w in visible)
        bottom = max(w["bottom"] for w in visible)
        colours = getattr(FORMAT_PROCESSOR, "DEBUG_BOX_COLOURS", {})
        r, g, b = colours.get(group_name, (0.5, 0.5, 0.5))
        c.saveState()
        c.setStrokeColorRGB(r, g, b)
        c.setLineWidth(getattr(FORMAT_PROCESSOR, "_DEBUG_BOX_LINE_WIDTH", 0.5))
        box_y = height - bottom
        box_h = bottom - top
        c.rect(x0, box_y, x1 - x0, box_h)
        c.setFillColorRGB(r, g, b)
        label_size = 5
        c.setFont(getattr(FORMAT_PROCESSOR, "_FONT_NAME", "Helvetica"), label_size)
        c.drawString(x0 + 1, box_y + box_h + 1, group_name)
        c.restoreState()

    def draw_group(group_words):
        text_obj = c.beginText()
        for word in group_words:
            text = word["text"]
            if not text:
                continue
            size = max(6, round(word["bottom"] - word["top"], 1))
            font_bold = getattr(FORMAT_PROCESSOR, "_FONT_NAME_BOLD", "Helvetica-Bold")
            font_reg = getattr(FORMAT_PROCESSOR, "_FONT_NAME", "Helvetica")
            font = font_bold if word.get("bold") else font_reg
            text_obj.setFont(font, size)
            x = word["x0"]
            y = height - word["top"] - size
            text_obj.setTextOrigin(x, y)
            text_obj.textOut(text)
        c.drawText(text_obj)

    if word_groups:
        group_order = [
            "header",
            "payments",
            "deductions",
            "address",
            "this_period",
            "year_to_date",
            "footer",
            "other",
        ]
        for group_name in group_order:
            group = word_groups.get(group_name) or []
            group_sorted = sorted(group, key=lambda word: (word["top"], word["x0"]))
            if getattr(FORMAT_PROCESSOR, "_DEBUG_BOXES", False):
                draw_debug_box(group_name, group_sorted)
            draw_group(group_sorted)
    else:
        draw_group(sorted(words, key=lambda word: (word["top"], word["x0"])))
    c.save()


def load_run_config():
    if not CONFIG_PATH.exists():
        return None, None
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("Run config must be a JSON object")
    runs = payload.get("payroll_runs")
    if not isinstance(runs, list):
        raise ValueError("Run config must include a 'payroll_runs' array")
    default_structure = payload.get("default_payroll_structure")
    if default_structure is not None and not isinstance(default_structure, str):
        raise ValueError("Run config default_payroll_structure must be a string path")
    return runs, default_structure


def resolve_output_dir(value):
    if not value:
        return OUTPUT_DIR
    resolved = Path(value)
    if not resolved.is_absolute():
        resolved = BASE_DIR / resolved
    return resolved


def main(check_only=False):
    global_inputs_payload = load_inputs()
    apply_inputs(global_inputs_payload)
    global_adjusted_dataset = apply_holiday_adjustments(DATASET)
    global_month_meta = _build_month_meta()

    default_months = [entry["month"] for entry in global_adjusted_dataset]
    runs, default_structure_ref = load_run_config()
    if runs is None:
        runs = [
            {
                "output_dir": str(OUTPUT_DIR),
                "months": default_months,
                "employee": {},
            }
        ]
    for run in runs:
        if not isinstance(run, dict):
            raise ValueError("Each run must be a JSON object")
        run_inputs_ref = run.get("inputs")
        if run_inputs_ref:
            run_inputs_path = resolve_source_path(run_inputs_ref)
            run_inputs_payload = load_inputs(run_inputs_path)
            apply_inputs(run_inputs_payload)
            adjusted_dataset = apply_holiday_adjustments(DATASET)
            month_meta = _build_month_meta()
        else:
            adjusted_dataset = global_adjusted_dataset
            month_meta = global_month_meta
        structure_ref = run.get("structure") or default_structure_ref
        if not structure_ref:
            raise ValueError(
                f"Run '{run.get('id', '?')}' has no 'structure' and no 'default_payroll_structure' is set in fixture_runs.json"
            )
        structure_path = resolve_source_path(structure_ref)
        structure_payload = load_structure(structure_path)
        load_processor(structure_path.parent)
        apply_structure(structure_payload)
        base_pdf = structure_payload["_resolved_base_pdf"]
        background_pdf = structure_payload["_resolved_background_pdf"]

        with pdfplumber.open(base_pdf) as pdf:
            page = pdf.pages[0]
            words = page.extract_words(x_tolerance=1, y_tolerance=1, keep_blank_chars=False)
            line_map, line_text = build_line_map(words)
            width = page.width
            height = page.height

        with pdfplumber.open(background_pdf) as pdf:
            background_page = pdf.pages[0]
            page_image = background_page.to_image(resolution=150)
            image_buffer = BytesIO()
            page_image.original.save(image_buffer, format="PNG")
            image_buffer.seek(0)
            background_image = ImageReader(image_buffer)

        months = run.get("months")
        if not isinstance(months, list) or not months:
            raise ValueError("Each run must define a non-empty 'months' array")
        missing_months = run.get("missing_months") or []
        if missing_months and not isinstance(missing_months, list):
            raise ValueError("missing_months must be an array when provided")
        months = [month for month in months if month not in set(missing_months)]
        for month in months:
            if month not in month_meta:  # noqa: F821 — bound above in loop
                raise ValueError(f"Unknown month in run config: {month}")
        employee = run.get("employee") or {}
        if not isinstance(employee, dict):
            raise ValueError("employee must be an object when provided")
        employee_overrides = run.get("employee_overrides") or {}
        if employee_overrides and not isinstance(employee_overrides, dict):
            raise ValueError("employee_overrides must be an object when provided")
        fixture_overrides = run.get("fixture_overrides") or {}
        if fixture_overrides and not isinstance(fixture_overrides, dict):
            raise ValueError("fixture_overrides must be an object when provided")
        employee_name = employee.get("name") if "name" in employee else None
        employer_name = employee.get("employer") if "employer" in employee else None
        employee_nat_ins = employee.get("nat_ins_number") if "nat_ins_number" in employee else None
        employee_address = employee.get("address") if "address" in employee else None
        if employee_address is not None and not isinstance(employee_address, list):
            raise ValueError("employee.address must be an array when provided")

        if check_only:
            continue

        output_dir = resolve_output_dir(run.get("output_dir"))
        output_dir.mkdir(parents=True, exist_ok=True)
        for month in months:
            meta = month_meta[month]
            idx = meta["index"]
            data = adjusted_dataset[idx]
            year = meta["year"]
            month_number = meta["month_number"]
            label = meta["label"]
            overrides = employee_overrides.get(month) or {}
            if overrides and not isinstance(overrides, dict):
                raise ValueError(
                    f"employee_overrides for {month} must be an object when provided"
                )
            month_employee_name = (
                overrides.get("name") if "name" in overrides else employee_name
            )
            month_employee_nat_ins = (
                overrides.get("nat_ins_number") if "nat_ins_number" in overrides else employee_nat_ins
            )
            month_employer_name = (
                overrides.get("employer") if "employer" in overrides else employer_name
            )
            month_employee_address = (
                overrides.get("address") if "address" in overrides else employee_address
            )
            month_fixture_overrides = fixture_overrides.get(month) or {}
            if month_fixture_overrides and not isinstance(month_fixture_overrides, dict):
                raise ValueError(
                    f"fixture_overrides for {month} must be an object when provided"
                )
            words_copy = [dict(word) for word in words]
            word_groups = apply_fixture(
                words_copy,
                line_map,
                line_text,
                structure_payload,
                data,
                idx,
                label,
                year,
                reset_payrun=(month_number == 4 and idx > 0),
                employee_name=month_employee_name,
                employee_nat_ins=month_employee_nat_ins,
                employer_name=month_employer_name,
                employee_address=month_employee_address,
                overrides=month_fixture_overrides,
            )
            out_path = output_dir / f"payslip-{data['month']}.pdf"
            draw_pdf(
                words_copy,
                width,
                height,
                out_path,
                background_image,
                word_groups=word_groups,
            )


if __name__ == "__main__":
    main(check_only="--check" in sys.argv)
