import sys
from pathlib import Path

from reportlab.pdfbase.pdfmetrics import stringWidth

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from pdf_utils import (
    align_right,
    find_line,
    find_line_containing,
    find_numeric_indices,
    fmt_money,
    fmt_units,
    update_text,
)

_FONT_NAME = "Helvetica"
_FONT_NAME_BOLD = "Helvetica-Bold"
_LOWER_BAND_TOP_MARGIN = 6
_ROW_TOLERANCE = 3.0
_DEBUG_BOXES = False
_DEBUG_BOX_LINE_WIDTH = 0.5
_MIN_PAY_RUN_GAP = 28
_MAX_PAY_RUN_GAP = 64
_HEADER_YEAR_GAP = 6
_SHIFT_LEFT = 18
_EMPLOYEE_ID_OFFSET = 56.7
_PROCESS_DATE_CENTURY = "20"
_DEFAULT_EMPLOYER = "The Better Place Catering Company Limited"

DEBUG_BOX_COLOURS = {
    "header":       (0.8, 0.0, 0.0),
    "payments":     (0.0, 0.6, 0.0),
    "deductions":   (0.0, 0.0, 0.8),
    "address":      (0.8, 0.5, 0.0),
    "this_period":  (0.5, 0.0, 0.8),
    "year_to_date": (0.0, 0.6, 0.6),
    "footer":       (0.6, 0.3, 0.0),
    "other":        (0.4, 0.4, 0.4),
}


def configure(structure):
    global _FONT_NAME, _FONT_NAME_BOLD, _LOWER_BAND_TOP_MARGIN, _ROW_TOLERANCE
    global _DEBUG_BOXES, _DEBUG_BOX_LINE_WIDTH
    global _MIN_PAY_RUN_GAP, _MAX_PAY_RUN_GAP, _HEADER_YEAR_GAP, _SHIFT_LEFT
    global _EMPLOYEE_ID_OFFSET, _PROCESS_DATE_CENTURY
    layout = structure["layout"]
    _FONT_NAME = layout["font"]
    _FONT_NAME_BOLD = layout["bold_font"]
    _LOWER_BAND_TOP_MARGIN = float(layout["mid_band_scan_margin"])
    _ROW_TOLERANCE = float(layout["row_cluster_threshold"])
    _DEBUG_BOXES = bool(layout.get("debug_boxes", False))
    _DEBUG_BOX_LINE_WIDTH = float(layout.get("debug_box_line_width", 0.5))
    footer_pos = structure["footer"]["position"]
    _MIN_PAY_RUN_GAP = float(footer_pos.get("pay_run_min_spacing", _MIN_PAY_RUN_GAP))
    _MAX_PAY_RUN_GAP = float(footer_pos.get("pay_run_max_spacing", _MAX_PAY_RUN_GAP))
    _SHIFT_LEFT = float(footer_pos.get("copyright_nudge", _SHIFT_LEFT))
    header_pos = structure["header_bar"]["position"]
    _HEADER_YEAR_GAP = float(header_pos.get("date_year_spacing", _HEADER_YEAR_GAP))
    _EMPLOYEE_ID_OFFSET = float(header_pos.get("employee_id_offset", _EMPLOYEE_ID_OFFSET))
    _PROCESS_DATE_CENTURY = str(header_pos.get("process_date_century", _PROCESS_DATE_CENTURY))


def _normalize_token(value):
    stripped = value.strip().lower()
    stripped = stripped.replace(",", "")
    return stripped.rstrip(":")


def _label_tokens(anchor):
    tokens = anchor.split()
    result = []
    for token in tokens:
        stripped = token.replace(",", "")
        if stripped.replace(".", "", 1).isdigit():
            break
        result.append(token)
    return result if result else tokens


def _find_phrase_indices(tokens, line_indices, words):
    ordered = sorted(line_indices, key=lambda i: words[i]["x0"])
    line_tokens = [words[i]["text"] for i in ordered]
    normalized_line = [_normalize_token(t) for t in line_tokens]
    normalized_tokens = [_normalize_token(t) for t in tokens]
    for idx in range(len(normalized_line) - len(normalized_tokens) + 1):
        if normalized_line[idx: idx + len(normalized_tokens)] == normalized_tokens:
            return ordered[idx: idx + len(tokens)]
    return ordered


def group_words(words, line_map, line_text, structure):
    header_bar = structure["header_bar"]
    payments_table = structure["payments_table"]
    deductions_table = structure["deductions_table"]
    address_block = structure["address_block"]
    this_period = structure["this_period"]
    year_to_date = structure["year_to_date"]
    footer = structure["footer"]

    header_top = find_line_containing(line_text, header_bar["anchor"])
    payments_top = find_line_containing(line_text, payments_table["anchor"])
    deductions_top = find_line_containing(line_text, deductions_table["anchor"])
    address_top = find_line_containing(line_text, address_block["anchor"])
    this_period_top = find_line_containing(line_text, this_period["anchor"])
    ytd_top = find_line_containing(line_text, year_to_date["anchor"])
    footer_top = find_line_containing(line_text, footer["anchor"])  # noqa: F841 kept for symmetry

    deductions_anchor_indices = _find_phrase_indices(
        _label_tokens(deductions_table["anchor"]),
        line_map[deductions_top],
        words,
    )
    deductions_left = min(words[idx]["x0"] for idx in deductions_anchor_indices)
    payments_right = max(
        words[idx]["x1"]
        for idx in line_map[payments_top]
        if words[idx]["x0"] < deductions_left
    )
    split_x = (payments_right + deductions_left) / 2

    ytd_anchor_indices = _find_phrase_indices(
        _label_tokens(year_to_date["anchor"]),
        line_map[ytd_top],
        words,
    )
    ytd_left = min(words[idx]["x0"] for idx in ytd_anchor_indices)
    this_period_right = max(
        words[idx]["x1"]
        for idx in line_map[this_period_top]
        if words[idx]["x0"] < ytd_left
    )
    period_split_x = (this_period_right + ytd_left) / 2

    this_period_anchor_indices = _find_phrase_indices(
        _label_tokens(this_period["anchor"]),
        line_map[this_period_top],
        words,
    )
    this_period_left = min(words[idx]["x0"] for idx in this_period_anchor_indices)
    address_right = max(words[idx]["x1"] for idx in line_map[address_top])
    address_split_x = (address_right + this_period_left) / 2

    grouped = {
        "header": [],
        "payments": [],
        "deductions": [],
        "address": [],
        "this_period": [],
        "year_to_date": [],
        "footer": [],
        "other": [],
    }

    lower_band_top = min(address_top, this_period_top) - _LOWER_BAND_TOP_MARGIN
    for word in words:
        top = round(word["top"], 1)
        x0 = word["x0"]
        if top < payments_top:
            grouped["header"].append(word)
        elif top < lower_band_top:
            if x0 < split_x:
                grouped["payments"].append(word)
            else:
                grouped["deductions"].append(word)
        elif top < footer_top:
            if x0 < address_split_x:
                grouped["address"].append(word)
            elif x0 < period_split_x:
                grouped["this_period"].append(word)
            else:
                grouped["year_to_date"].append(word)
        else:
            grouped["footer"].append(word)

    return grouped


def apply_group_positioning(word_groups, line_map, line_text, structure):
    group_config = {
        "header": structure["header_bar"],
        "payments": structure["payments_table"],
        "deductions": structure["deductions_table"],
        "address": structure["address_block"],
        "this_period": structure["this_period"],
        "year_to_date": structure["year_to_date"],
        "footer": structure["footer"],
    }

    for group_name, config in group_config.items():
        group = word_groups.get(group_name) or []
        if not group:
            continue
        anchor_top = find_line_containing(line_text, config["anchor"])
        anchor_indices = line_map[anchor_top]
        anchor_phrase_indices = _find_phrase_indices(
            _label_tokens(config["anchor"]),
            anchor_indices,
            word_groups["all"],
        )
        anchor_left = min(
            word_groups["all"][idx]["x0"] for idx in anchor_phrase_indices
        )
        position = config["position"]
        top_left = position.get("anchor_point", [0.0, 0.0])
        width = float(position.get("max_width", 0.0))
        offset = position.get("nudge", [0.0, 0.0])
        line_height = float(position.get("row_spacing", 0.0))

        group_min_x0 = min(word["x0"] for word in group)
        group_max_x1 = max(word["x1"] for word in group)
        group_min_top = min(word["top"] for word in group)

        target_x0 = top_left[0] if top_left[0] != 0 else anchor_left
        target_top = top_left[1] if top_left[1] != 0 else anchor_top

        dx = target_x0 - group_min_x0
        if width > 0:
            target_right = target_x0 + width
            overflow = (group_max_x1 + dx) - target_right
            if overflow > 0:
                dx -= overflow

        dy = target_top - group_min_top
        dx += offset[0]
        dy += offset[1]

        for word in group:
            word["x0"] += dx
            word["x1"] += dx
            word["top"] += dy
            word["bottom"] += dy

        if line_height > 0:
            row_tolerance = _ROW_TOLERANCE
            distinct_tops = sorted({round(word["top"], 1) for word in group})
            clusters = []
            for t in distinct_tops:
                if clusters and t - clusters[-1][0] <= row_tolerance:
                    clusters[-1].append(t)
                else:
                    clusters.append([t])
            cluster_rep = {}
            for cluster in clusters:
                rep = cluster[0]
                for t in cluster:
                    cluster_rep[t] = rep
            first_top = min(word["top"] for word in group)
            row_indices = {rep: i for i, rep in enumerate(sorted(set(cluster_rep.values())))}
            for word in group:
                orig_top = round(word["top"], 1)
                row_idx = row_indices[cluster_rep[orig_top]]
                row_height = word["bottom"] - word["top"]
                word["top"] = first_top + row_idx * line_height
                word["bottom"] = word["top"] + row_height


def apply_fixture(
    words,
    line_map,
    line_text,
    structure,
    payroll_constants,
    data,
    month_index,
    month_label,
    year,
    reset_payrun,
    employee_name=None,
    employer_name=None,
    employee_address=None,
    overrides=None,
):
    overrides = overrides or {}
    omit_tax_code = bool(overrides.get("omit_tax_code"))
    omit_process_date = bool(overrides.get("omit_process_date"))
    omit_pay_run = bool(overrides.get("omit_pay_run"))
    header_bar = structure["header_bar"]
    payments_table = structure["payments_table"]
    deductions_table = structure["deductions_table"]
    this_period = structure["this_period"]
    year_to_date = structure["year_to_date"]
    footer = structure["footer"]

    def _align_right(word_list, indices, target_x1):
        align_right(word_list, indices, target_x1, _FONT_NAME, _FONT_NAME_BOLD)

    basic_top = find_line(line_text, header_bar["basicLineAnchor"])
    basic_indices = line_map[basic_top]
    basic_numeric = find_numeric_indices(words, basic_indices)
    sorted_tops = sorted(line_map)
    basic_top_index = sorted_tops.index(basic_top)
    line_offset = None
    for next_top in sorted_tops[basic_top_index + 1:]:
        next_numeric = find_numeric_indices(words, line_map[next_top])
        if len(next_numeric) >= 3:
            line_offset = next_top - basic_top
            break
    if line_offset is None:
        line_diffs = [
            b - a
            for a, b in zip(sorted_tops, sorted_tops[1:])
            if b - a > 0
        ]
        line_offset = min(line_diffs) if line_diffs else 0.0
    holiday_line = data["holiday_lines"][0] if data["holiday_lines"] else None
    holiday_hours = holiday_line[0] if holiday_line else 0.0
    holiday_rate = holiday_line[1] if holiday_line else 0.0
    holiday_amount = round(holiday_hours * holiday_rate, 2)
    hours_first, rate_first = data["basic_lines"][0]
    amount_first = round(hours_first * rate_first, 2)
    replacements = [fmt_units(hours_first), fmt_money(rate_first), fmt_money(amount_first), fmt_money(data["paye"])]
    for idx, value in zip(basic_numeric, replacements):
        update_text(words, idx, value)
    paye_idx = basic_numeric[-1]
    makeup_top = basic_top + line_offset
    makeup_indices = line_map[makeup_top]
    makeup_numeric = find_numeric_indices(words, makeup_indices)

    if len(data["basic_lines"]) > 1:
        hours_tokens = payments_table["hoursLabel"].split()
        hours_display = hours_tokens[0].replace("-make", "")
        for idx in makeup_indices:
            text = words[idx]["text"]
            if text == hours_tokens[0]:
                update_text(words, idx, hours_display)
            elif len(hours_tokens) > 1 and text == hours_tokens[1]:
                update_text(words, idx, "")
        hours_second, rate_second = data["basic_lines"][1]
        amount_second = round(hours_second * rate_second, 2)
        replacements = [fmt_units(hours_second), fmt_money(rate_second), fmt_money(amount_second), fmt_money(data["ni"])]
    else:
        makeup_line = data["makeup_lines"][0] if data["makeup_lines"] else None
        if makeup_line:
            makeup_hours, makeup_rate = makeup_line
            makeup_amount = round(makeup_hours * makeup_rate, 2)
            replacements = [fmt_units(makeup_hours), fmt_money(makeup_rate), fmt_money(makeup_amount), fmt_money(data["ni"])]
        else:
            replacements = [fmt_units(0.0), fmt_money(0.0), fmt_money(0.0), fmt_money(data["ni"])]
    for idx, value in zip(makeup_numeric, replacements):
        update_text(words, idx, value)
    ni_idx = makeup_numeric[-1]

    payment_unit_indices = []
    payment_rate_indices = []
    payment_amount_indices = []
    holiday_unit_idx = None
    holiday_rate_idx = None
    holiday_amount_idx = None
    if len(basic_numeric) >= 3:
        payment_unit_indices.append(basic_numeric[0])
        payment_rate_indices.append(basic_numeric[1])
        payment_amount_indices.append(basic_numeric[2])
    if len(makeup_numeric) >= 3:
        payment_unit_indices.append(makeup_numeric[0])
        payment_rate_indices.append(makeup_numeric[1])
        payment_amount_indices.append(makeup_numeric[2])
    if holiday_line and payment_amount_indices:
        payment_right_edge = max(
            words[idx]["x1"] for idx in payment_amount_indices
        )
        payment_indices = sorted(
            [
                idx
                for idx in makeup_indices
                if words[idx]["x1"] <= payment_right_edge
            ],
            key=lambda i: words[i]["x0"],
        )

        def is_numeric_token(text):
            stripped = text.replace(",", "")
            return stripped.replace(".", "", 1).isdigit() and "." in stripped

        label_indices = [
            idx for idx in payment_indices if not is_numeric_token(words[idx]["text"])
        ]
        numeric_indices = [
            idx for idx in payment_indices if is_numeric_token(words[idx]["text"])
        ]
        holiday_label = payments_table["holidayLineAnchor"]
        holiday_values = [
            fmt_units(holiday_hours),
            fmt_money(holiday_rate),
            fmt_money(holiday_amount),
        ]
        if label_indices:
            label_anchor = words[label_indices[0]]
            label_size = max(6, round(label_anchor["bottom"] - label_anchor["top"], 1))
            holiday_width = stringWidth(holiday_label, _FONT_NAME, label_size)
            holiday_word = dict(label_anchor)
            holiday_word["text"] = holiday_label
            holiday_word["top"] = holiday_word["top"] + line_offset
            holiday_word["bottom"] = holiday_word["bottom"] + line_offset
            holiday_word["x1"] = holiday_word["x0"] + holiday_width
            words.append(holiday_word)
        for value, source_idx in zip(holiday_values, numeric_indices[:3]):
            new_word = dict(words[source_idx])
            new_word["text"] = value
            new_word["top"] = new_word["top"] + line_offset
            new_word["bottom"] = new_word["bottom"] + line_offset
            words.append(new_word)
            if holiday_unit_idx is None:
                holiday_unit_idx = len(words) - 1
            elif holiday_rate_idx is None:
                holiday_rate_idx = len(words) - 1
            elif holiday_amount_idx is None:
                holiday_amount_idx = len(words) - 1
        if holiday_unit_idx is not None:
            payment_unit_indices.append(holiday_unit_idx)
        if holiday_rate_idx is not None:
            payment_rate_indices.append(holiday_rate_idx)
        if holiday_amount_idx is not None:
            payment_amount_indices.append(holiday_amount_idx)
    if payment_unit_indices:
        unit_target_x1 = max(words[idx]["x1"] for idx in payment_unit_indices)
        _align_right(words, payment_unit_indices, unit_target_x1)
    if payment_rate_indices:
        rate_target_x1 = max(words[idx]["x1"] for idx in payment_rate_indices)
        _align_right(words, payment_rate_indices, rate_target_x1)
    if payment_amount_indices:
        amount_target_x1 = max(words[idx]["x1"] for idx in payment_amount_indices)
        _align_right(words, payment_amount_indices, amount_target_x1)

    remove_makeup_line = not data["makeup_lines"] and len(data["basic_lines"]) == 1
    if remove_makeup_line and makeup_indices and payment_amount_indices:
        payment_right_edge = max(
            words[idx]["x1"] for idx in payment_amount_indices
        )
        for idx in makeup_indices:
            if words[idx]["x1"] <= payment_right_edge:
                update_text(words, idx, "")

    pens_ee_top = find_line(line_text, deductions_table["pensionEeLabel"])
    pens_ee_idx = find_numeric_indices(words, line_map[pens_ee_top])[0]
    update_text(words, pens_ee_idx, fmt_money(data["ee"]))

    pens_er_top = find_line(line_text, deductions_table["pensionErLabel"])
    pens_er_idx = find_numeric_indices(words, line_map[pens_er_top])[0]
    update_text(words, pens_er_idx, fmt_money(data["er"]))

    other_ded_top = find_line(line_text, deductions_table["otherNetDedLabel"])
    other_ded_idx = find_numeric_indices(words, line_map[other_ded_top])[0]
    if data["other_deduction"]:
        update_text(words, other_ded_idx, fmt_money(data["other_deduction"]))
    else:
        for idx in line_map[other_ded_top]:
            update_text(words, idx, "")

    deduction_amount_indices = [paye_idx, ni_idx, pens_ee_idx, pens_er_idx]
    if data["other_deduction"]:
        deduction_amount_indices.append(other_ded_idx)
    deduction_amount_indices = [
        idx for idx in deduction_amount_indices if words[idx]["text"]
    ]
    if deduction_amount_indices:
        deduction_target_x1 = max(
            words[idx]["x1"] for idx in deduction_amount_indices
        )
        _align_right(words, deduction_amount_indices, deduction_target_x1)

    address_block = structure["address_block"]
    address_name_anchor = address_block.get("nameAnchor")
    address_line_count = address_block.get("address_lines", 0)
    if employee_name is not None and address_name_anchor:
        name_top = find_line_containing(line_text, address_name_anchor)
        name_indices = line_map[name_top]
        for idx in name_indices:
            update_text(words, idx, "")
        if employee_name:
            name_anchor_word = words[name_indices[0]]
            words.append(
                {
                    "text": employee_name,
                    "x0": name_anchor_word["x0"],
                    "x1": name_anchor_word["x1"],
                    "top": name_anchor_word["top"],
                    "bottom": name_anchor_word["bottom"],
                }
            )
    if employee_address is not None and address_line_count > 0:
        sorted_tops = sorted(line_map)
        anchor_top = find_line_containing(line_text, address_block["anchor"])
        this_period_top = find_line_containing(line_text, this_period["anchor"])
        anchor_pos = sorted_tops.index(anchor_top)
        candidate_tops = sorted_tops[anchor_pos: anchor_pos + address_line_count]
        address_tops = [t for t in candidate_tops if t < this_period_top]
        for line_top, replacement in zip(address_tops, employee_address):
            for idx in line_map[line_top]:
                update_text(words, idx, "")
            if replacement:
                anchor_word = words[line_map[line_top][0]]
                words.append(
                    {
                        "text": replacement,
                        "x0": anchor_word["x0"],
                        "x1": anchor_word["x1"],
                        "top": anchor_word["top"],
                        "bottom": anchor_word["bottom"],
                    }
                )
        for line_top in address_tops[len(employee_address):]:
            for idx in line_map[line_top]:
                update_text(words, idx, "")

    employer_top = find_line(line_text, footer["employerAnchor"])
    employer_indices = line_map[employer_top]
    for idx in employer_indices:
        update_text(words, idx, "")
    if employer_name is None:
        employer_name = _DEFAULT_EMPLOYER
    if employer_name:
        employer_anchor_word = words[employer_indices[0]]
        words.append(
            {
                "text": employer_name,
                "x0": employer_anchor_word["x0"],
                "x1": employer_anchor_word["x1"],
                "top": employer_anchor_word["top"],
                "bottom": employer_anchor_word["bottom"],
                "bold": True,
            }
        )

    earnings_top = find_line(line_text, this_period["earningsNiLabel"])
    earnings_numeric = find_numeric_indices(words, line_map[earnings_top])
    update_text(words, earnings_numeric[0], fmt_money(data["gross"]))
    update_text(words, earnings_numeric[1], fmt_money(data["ytd_gross"]))

    gross_tax_top = find_line(line_text, this_period["grossTaxLabel"])
    gross_tax_numeric = find_numeric_indices(words, line_map[gross_tax_top])
    update_text(words, gross_tax_numeric[0], fmt_money(round(data["gross"] - data["ee"], 2)))
    update_text(words, gross_tax_numeric[1], fmt_money(data["ytd_gross_tax"]))

    gross_pay_top = find_line(line_text, this_period["totalGrossPayLabel"])
    gross_pay_numeric = find_numeric_indices(words, line_map[gross_pay_top])
    update_text(words, gross_pay_numeric[0], fmt_money(data["gross"]))
    update_text(words, gross_pay_numeric[1], fmt_money(data["ytd_gross"]))

    pay_cycle_top = find_line(line_text, this_period["payCycleLabel"])
    pay_cycle_numeric = find_numeric_indices(words, line_map[pay_cycle_top])
    update_text(words, pay_cycle_numeric[0], fmt_money(data["ytd_gross"]))

    ni_td_top = find_line(line_text, year_to_date["niTdLabel"])
    ni_td_idx = find_numeric_indices(words, line_map[ni_td_top])[0]
    update_text(words, ni_td_idx, fmt_money(data["ytd_ni"]))

    ee_td_top = find_line(line_text, year_to_date["pensionEeTdLabel"])
    ee_td_idx = find_numeric_indices(words, line_map[ee_td_top])[0]
    update_text(words, ee_td_idx, fmt_money(data["ytd_ee"]))

    er_td_top = find_line(line_text, year_to_date["pensionErTdLabel"])
    er_td_idx = find_numeric_indices(words, line_map[er_td_top])[0]
    update_text(words, er_td_idx, fmt_money(data["ytd_er"]))

    ytd_amount_indices = [
        earnings_numeric[1],
        gross_tax_numeric[1],
        gross_pay_numeric[1],
        pay_cycle_numeric[0],
        ni_td_idx,
        ee_td_idx,
        er_td_idx,
    ]
    if ytd_amount_indices:
        ytd_target_x1 = max(words[idx]["x1"] for idx in ytd_amount_indices)
        _align_right(words, ytd_amount_indices, ytd_target_x1)

    net_top = find_line(line_text, header_bar["netAmountAnchor"])
    net_idx = find_numeric_indices(words, line_map[net_top])[0]
    update_text(words, net_idx, fmt_money(data["net"]))
    words[net_idx]["bold"] = True
    _align_right(words, [net_idx], words[net_idx]["x1"])

    month_number = 1 if reset_payrun else (month_index + 1)
    group_shift = 0
    tax_line = find_line_containing(line_text, footer["taxCodeLabel"])
    tax_indices = line_map[tax_line]
    for idx in tax_indices:
        update_text(words, idx, "")
    tax_anchor = words[tax_indices[0]]
    if not omit_tax_code:
        words.append(
            {
                "text": f"{footer['taxCodeLabel']} {payroll_constants['tax_code_value']}",
                "x0": max(0, tax_anchor["x0"] - group_shift),
                "x1": max(0, tax_anchor["x1"] - group_shift),
                "top": tax_anchor["top"],
                "bottom": tax_anchor["bottom"],
            }
        )
    pay_line = find_line_containing(line_text, footer["payRunLabel"])
    pay_indices = line_map[pay_line]
    for idx in pay_indices:
        update_text(words, idx, "")
    pay_sorted_indices = sorted(pay_indices, key=lambda i: words[i]["x0"])
    pay_tokens = [words[i]["text"] for i in pay_sorted_indices]

    def find_phrase_index(tokens, haystack):
        for idx in range(len(haystack) - len(tokens) + 1):
            if haystack[idx: idx + len(tokens)] == tokens:
                return idx
        return None

    pay_run_tokens = footer["payRunLabel"].split()
    pay_method_tokens = footer["payMethodLabel"].split()
    pay_run_idx = find_phrase_index(pay_run_tokens, pay_tokens)
    pay_method_idx = find_phrase_index(pay_method_tokens, pay_tokens)

    if pay_run_idx is None:
        pay_anchor = words[pay_sorted_indices[0]]
    else:
        pay_anchor = words[pay_sorted_indices[pay_run_idx]]

    if pay_method_idx is None:
        pay_method_anchor = words[pay_sorted_indices[-1]]
    else:
        pay_method_anchor = words[pay_sorted_indices[pay_method_idx]]
    pay_run_text = footer["payRunTextTemplate"].format(month_number)
    pay_method_width = pay_method_anchor["x1"] - pay_method_anchor["x0"]
    pay_run_end_x1 = pay_anchor["x1"]
    month_token = footer["payRunTextTemplate"].format("").split()[-1]
    month_idx = find_phrase_index([month_token], pay_tokens)
    if month_idx is not None:
        month_token_idx = pay_sorted_indices[month_idx]
        pay_run_end_x1 = words[month_token_idx]["x1"]
        if month_idx + 1 < len(pay_tokens):
            next_token = words[pay_sorted_indices[month_idx + 1]]
            if next_token["text"].isdigit():
                pay_run_end_x1 = next_token["x1"]
    min_gap = _MIN_PAY_RUN_GAP
    max_gap = _MAX_PAY_RUN_GAP
    desired_x0 = pay_method_anchor["x0"]
    min_x0 = pay_run_end_x1 + min_gap
    max_x0 = pay_run_end_x1 + max_gap
    pay_method_x0 = min(max(desired_x0, min_x0), max_x0)
    if not omit_pay_run:
        words.append(
            {
                "text": pay_run_text,
                "x0": max(0, pay_anchor["x0"] - group_shift),
                "x1": max(0, pay_anchor["x1"] - group_shift),
                "top": pay_anchor["top"],
                "bottom": pay_anchor["bottom"],
            }
        )
    words.append(
        {
            "text": f"{footer['payMethodLabel']} {payroll_constants['pay_method_value']}",
            "x0": max(0, pay_method_x0 - group_shift),
            "x1": max(0, pay_method_x0 + pay_method_width - group_shift),
            "top": pay_method_anchor["top"],
            "bottom": pay_method_anchor["bottom"],
        }
    )

    copyright_top = find_line_containing(line_text, footer["copyrightLine"])
    copyright_indices = line_map[copyright_top]
    for idx in copyright_indices:
        update_text(words, idx, "")
    copyright_anchor = words[copyright_indices[0]]
    shift_left = _SHIFT_LEFT
    words.append(
        {
            "text": footer["copyrightLine"],
            "x0": max(0, copyright_anchor["x0"] - shift_left),
            "x1": max(0, copyright_anchor["x1"] - shift_left),
            "top": copyright_anchor["top"],
            "bottom": copyright_anchor["bottom"],
        }
    )

    header_top = find_line(line_text, header_bar["niAnchor"])
    header_indices = line_map[header_top]
    header_words = [words[i]["text"] for i in header_indices]
    if len(header_words) >= 6:
        header_entries = sorted(header_indices, key=lambda i: words[i]["x0"])
        name_word = words[header_entries[0]]
        name_width = name_word["x1"] - name_word["x0"]
        if employee_name is not None:
            update_text(words, header_entries[0], employee_name)
        employee_x0 = max(0, name_word["x0"] - _EMPLOYEE_ID_OFFSET)
        words.append(
            {
                "text": payroll_constants["employee_id_text"],
                "x0": employee_x0,
                "x1": employee_x0 + name_width,
                "top": name_word["top"],
                "bottom": name_word["bottom"],
            }
        )
        if omit_process_date:
            update_text(words, header_indices[2], "")
            update_text(words, header_indices[3], "")
            update_text(words, header_indices[4], "")
        else:
            update_text(words, header_indices[2], _PROCESS_DATE_CENTURY)
            update_text(words, header_indices[3], month_label)
            update_text(words, header_indices[4], str(year))
            month_word = words[header_entries[3]]
            year_word = words[header_entries[4]]
            fixed_gap = _HEADER_YEAR_GAP
            year_width = year_word["x1"] - year_word["x0"]
            year_word["x0"] = month_word["x1"] + fixed_gap
            year_word["x1"] = year_word["x0"] + year_width

    if not omit_pay_run:
        payrun_top = find_line(line_text, footer["payRunLabel"])
        payrun_indices = line_map[payrun_top]
        for idx in payrun_indices:
            if words[idx]["text"] == month_token:
                update_text(
                    words,
                    payrun_indices[payrun_indices.index(idx) + 1],
                    str(month_number),
                )
                break

    groups = group_words(words, line_map, line_text, structure)
    groups["all"] = words
    apply_group_positioning(groups, line_map, line_text, structure)
    groups.pop("all", None)
    return groups
