import importlib.util
import calendar
import json
import re
import sys
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = Path(__file__).resolve().parent / "fixture_runs.json"
INPUTS_PATH = Path(__file__).resolve().parent / "payroll_inputs.json"
FORMATS_DIR = Path(__file__).resolve().parent / "formats"

PENS_QUAL_LOWER_MONTHLY = 0.0
PENS_QUAL_UPPER_MONTHLY = 0.0
PENS_EMPLOYEE_RATE = 0.0
PENS_EMPLOYER_RATE = 0.0
FIXED_METADATA_DT = datetime(2024, 1, 1, tzinfo=timezone.utc)
FIXED_METADATA_ISO = "2024-01-01T00:00:00Z"
FIXED_ZIP_TIMESTAMP = (2024, 1, 1, 0, 0, 0)


def normalize_workbook_metadata(workbook):
    props = workbook.properties
    props.created = FIXED_METADATA_DT
    props.modified = FIXED_METADATA_DT
    props.lastModifiedBy = "fixtures"


def normalize_xlsx_archive(output_path):
    temp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    with zipfile.ZipFile(output_path, "r") as source:
        with zipfile.ZipFile(temp_path, "w") as dest:
            for info in sorted(source.infolist(), key=lambda item: item.filename):
                data = source.read(info.filename)
                if info.filename == "docProps/core.xml":
                    text = data.decode("utf-8")
                    text = re.sub(
                        r"<dcterms:created[^>]*>.*?</dcterms:created>",
                        f"<dcterms:created xsi:type=\"dcterms:W3CDTF\">{FIXED_METADATA_ISO}</dcterms:created>",
                        text,
                    )
                    text = re.sub(
                        r"<dcterms:modified[^>]*>.*?</dcterms:modified>",
                        f"<dcterms:modified xsi:type=\"dcterms:W3CDTF\">{FIXED_METADATA_ISO}</dcterms:modified>",
                        text,
                    )
                    data = text.encode("utf-8")
                new_info = zipfile.ZipInfo(info.filename, date_time=FIXED_ZIP_TIMESTAMP)
                new_info.compress_type = info.compress_type
                new_info.external_attr = info.external_attr
                new_info.internal_attr = info.internal_attr
                new_info.flag_bits = info.flag_bits
                new_info.create_system = info.create_system
                new_info.create_version = info.create_version
                new_info.extract_version = info.extract_version
                new_info.volume = info.volume
                new_info.comment = info.comment
                dest.writestr(new_info, data)
    temp_path.replace(output_path)


def load_inputs():
    with INPUTS_PATH.open("r", encoding="utf-8") as fh:
        payload = json.load(fh)
    constants = payload["constants"]
    global PENS_QUAL_LOWER_MONTHLY, PENS_QUAL_UPPER_MONTHLY
    global PENS_EMPLOYEE_RATE, PENS_EMPLOYER_RATE
    PENS_QUAL_LOWER_MONTHLY = float(constants.get("pens_qual_lower_monthly", 0.0))
    PENS_QUAL_UPPER_MONTHLY = float(constants.get("pens_qual_upper_monthly", 0.0))
    PENS_EMPLOYEE_RATE = float(constants.get("pens_employee_rate", 0.0))
    PENS_EMPLOYER_RATE = float(constants.get("pens_employer_rate", 0.0))
    return payload


def calc_gross(data):
    basic_total = sum(hours * rate for hours, rate in data["basic_lines"])
    makeup_total = sum(hours * rate for hours, rate in data["makeup_lines"])
    holiday_total = sum(hours * rate for hours, rate in data["holiday_lines"])
    return round(basic_total + makeup_total + holiday_total, 2)


def calc_pens(gross):
    qualifying = min(gross, PENS_QUAL_UPPER_MONTHLY) - PENS_QUAL_LOWER_MONTHLY
    qualifying = max(0.0, qualifying)
    ee = round(qualifying * PENS_EMPLOYEE_RATE, 2)
    er = round(qualifying * PENS_EMPLOYER_RATE, 2)
    return ee, er


def build_contribution_entries(dataset, months, pay_day):
    """
    Compute EE and ER amounts for each month and return a list of entry dicts.

    Parameters
    ----------
    dataset : list[dict]
        Raw payroll_inputs dataset entries.
    months : list[str]
        YYYY-MM month strings to include (must be a subset of dataset months).
    pay_day : int
        Day-of-month for the contribution received date.

    Returns
    -------
    list[dict]
        Each dict: ``date`` (date), ``type`` ("ee"|"er"), ``amount`` (float).
    """
    dataset_by_month = {entry["month"]: entry for entry in dataset}
    entries = []
    for month_str in months:
        data = dataset_by_month.get(month_str)
        if data is None:
            raise ValueError(
                f"Month {month_str} not found in payroll_inputs dataset"
            )
        year_int, month_int = int(month_str[:4]), int(month_str[5:7])
        last_day = calendar.monthrange(year_int, month_int)[1]
        if pay_day > last_day:
            raise ValueError(
                f"pay_day {pay_day} is invalid for {year_int}-{month_int:02d}; "
                f"last day is {last_day}"
            )
        pay_date = date(year_int, month_int, pay_day)
        gross = calc_gross(data)
        ee, er = calc_pens(gross)
        entries.append({"date": pay_date, "type": "er", "amount": er})
        entries.append({"date": pay_date, "type": "ee", "amount": ee})
    return entries


def load_generator(provider_dir):
    generator_path = Path(provider_dir) / "generator.py"
    if not generator_path.exists():
        raise FileNotFoundError(f"Missing generator: {generator_path}")
    spec = importlib.util.spec_from_file_location("excel_generator", generator_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["excel_generator"] = module
    spec.loader.exec_module(module)
    return module


def load_excel_structure(structure_path):
    path = Path(structure_path)
    if not path.exists():
        raise FileNotFoundError(f"Missing excel_structure.json: {path}")
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def resolve_output_path(output_file):
    resolved = Path(output_file)
    if not resolved.is_absolute():
        resolved = BASE_DIR / resolved
    return resolved


def apply_run_variant(entries, variant):
    """
    Apply a variant transformation to the entry list for error-case fixtures.

    Supported variants:
      - ``omit_ee``             — remove all EE entries
      - ``omit_er``             — remove all ER entries
      - ``mixed_employers``     — assign alternating employer names
      - ``malformed``           — return None (signal: write a malformed file instead)
    """
    if variant == "omit_ee":
        return [e for e in entries if e["type"] != "ee"]
    if variant == "omit_er":
        return [e for e in entries if e["type"] != "er"]
    if variant == "mixed_employers":
        return entries
    if variant == "malformed":
        return None
    return entries


def main():
    inputs_payload = load_inputs()
    dataset = inputs_payload["dataset"]

    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"fixture_runs.json not found: {CONFIG_PATH}")
    with CONFIG_PATH.open("r", encoding="utf-8") as fh:
        config = json.load(fh)

    pension_runs = config.get("pension_runs")
    if not pension_runs:
        return

    default_pension_structure = config.get("default_pension_structure")
    if default_pension_structure is not None and not isinstance(default_pension_structure, str):
        raise ValueError("Run config default_pension_structure must be a string path")

    for run in pension_runs:
        if not isinstance(run, dict):
            raise ValueError("Each excel run must be a JSON object")

        run_id = run.get("id", "?")
        structure_ref = run.get("structure") or default_pension_structure
        if not structure_ref:
            raise ValueError(f"Run '{run_id}' has no 'structure' and no 'default_pension_structure' is set in fixture_runs.json")

        structure_path = Path(structure_ref)
        if not structure_path.is_absolute():
            structure_path = BASE_DIR / structure_path
        provider_dir = structure_path.parent
        generator = load_generator(provider_dir)
        structure = load_excel_structure(structure_path)
        required_keys = ("sheet_name", "columns", "type_strings")
        missing_keys = [key for key in required_keys if key not in structure]
        if missing_keys:
            missing = ", ".join(missing_keys)
            raise ValueError(
                f"excel_structure.json at '{structure_path}' is missing: {missing}"
            )

        pay_day = int(structure.get("pay_day", 20))
        months = run.get("months") or [e["month"] for e in dataset]
        employer_name = run.get("employer_name", "The Better Place Catering Company Limited")

        output_file = run.get("output_file")
        if not output_file:
            raise ValueError(f"Run '{run_id}' missing 'output_file'")
        output_path = resolve_output_path(output_file)

        variant = run.get("variant")

        entries = build_contribution_entries(dataset, months, pay_day)
        transformed = apply_run_variant(entries, variant)

        output_path.parent.mkdir(parents=True, exist_ok=True)

        if transformed is None:
            import openpyxl
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = structure["sheet_name"]
            ws.append(["Totally ", "Wrong", "Document", "Not ", "A ", "Correct ", "Report"])
            normalize_workbook_metadata(wb)
            wb.save(output_path)
            normalize_xlsx_archive(output_path)
        elif variant == "mixed_employers":
            mixed_employers = run.get("mixed_employer_names", [employer_name, "Some Other Company Ltd"])
            import openpyxl
            from datetime import date as _date
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = structure["sheet_name"]
            ws.append(structure["columns"])
            type_strings = structure["type_strings"]
            for i, entry in enumerate(transformed):
                emp = mixed_employers[i % len(mixed_employers)]
                row = generator._build_row(entry, structure, emp)
                ws.append(row)
            normalize_workbook_metadata(wb)
            wb.save(output_path)
            normalize_xlsx_archive(output_path)
        else:
            wb = generator.generate_workbook(transformed, structure, employer_name)
            normalize_workbook_metadata(wb)
            wb.save(output_path)
            normalize_xlsx_archive(output_path)


if __name__ == "__main__":
    main()
