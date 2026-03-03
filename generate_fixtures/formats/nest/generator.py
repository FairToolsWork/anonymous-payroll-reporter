import json
from datetime import date
from pathlib import Path

import openpyxl


def load_excel_structure(format_dir):
    path = Path(format_dir) / "excel_structure.json"
    if not path.exists():
        raise FileNotFoundError(f"Missing excel_structure.json: {path}")
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _round2(value):
    return round(value, 2)


def _build_row(entry, structure, employer_name):
    """
    Build a full 11-column NEST row for one contribution entry.

    Column order matches structure["columns"].
    """
    type_strings = structure["type_strings"]
    status = structure["contribution_status"]
    er_tax_status = structure["er_tax_relief_status"]
    ee_relief_rate = float(structure["ee_tax_relief_rate"])
    ee_relief_charge_rate = float(structure["ee_tax_relief_charge_rate"])
    er_charge_rate = float(structure["er_charge_rate"])

    entry_date = entry["date"]
    amount = entry["amount"]
    entry_type = entry["type"]
    type_str = type_strings[entry_type]
    date_str = entry_date.strftime("%d/%m/%Y")

    if entry_type == "ee":
        charge = _round2(-amount * er_charge_rate)
        tax_relief = _round2(amount * ee_relief_rate)
        tax_relief_date = date_str
        tax_relief_status = status
        tax_relief_charge = _round2(-tax_relief * ee_relief_charge_rate)
        amount_invested = None
    else:
        charge = _round2(-amount * er_charge_rate)
        tax_relief = None
        tax_relief_date = None
        tax_relief_status = er_tax_status
        tax_relief_charge = None
        amount_invested = None

    return [
        date_str,
        type_str,
        employer_name,
        amount,
        charge if charge != 0 else None,
        status,
        tax_relief,
        tax_relief_date,
        tax_relief_status,
        tax_relief_charge,
        amount_invested,
    ]


def generate_workbook(entries, structure, employer_name):
    """
    Build an openpyxl Workbook from a list of contribution entries.

    Parameters
    ----------
    entries : list[dict]
        Each dict has keys: ``date`` (date), ``type`` ("ee"|"er"),
        ``amount`` (float).
    structure : dict
        Loaded from excel_structure.json for this provider.
    employer_name : str
        The employer name to write in the employer column.

    Returns
    -------
    openpyxl.Workbook
    """
    sheet_name = structure["sheet_name"]
    columns = structure["columns"]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_name

    ws.append(columns)

    for entry in entries:
        row = _build_row(entry, structure, employer_name)
        ws.append(row)

    return wb
