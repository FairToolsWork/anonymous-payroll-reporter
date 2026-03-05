from reportlab.pdfbase.pdfmetrics import stringWidth


def build_line_map(words):
    lines = {}
    line_text = {}
    for idx, word in enumerate(words):
        top = round(word["top"], 1)
        lines.setdefault(top, []).append(idx)
    for top, indices in lines.items():
        ordered = sorted(indices, key=lambda i: words[i]["x0"])
        line_text[top] = " ".join(words[i]["text"] for i in ordered)
        lines[top] = ordered
    return lines, line_text


def find_line(line_text, needle, exclude=None):
    for top, text in line_text.items():
        if needle in text:
            if exclude is None or exclude not in text:
                return top
    raise ValueError(f"Line not found for {needle}")


def find_line_containing(line_text, needle):
    for top, text in line_text.items():
        if needle in text:
            return top
    raise ValueError(f"Line not found containing {needle}")


def find_numeric_indices(words, indices):
    numeric = []
    for idx in indices:
        text = words[idx]["text"].replace(",", "")
        if text.replace(".", "", 1).isdigit() and "." in text:
            numeric.append(idx)
    return numeric


def update_text(words, idx, text):
    words[idx]["text"] = text


def align_right(words, indices, target_x1, font_name, font_name_bold):
    for idx in indices:
        text = words[idx]["text"]
        font = font_name_bold if words[idx].get("bold") else font_name
        if not text:
            continue
        size = max(6, round(words[idx]["bottom"] - words[idx]["top"], 1))
        width = stringWidth(text, font, size)
        words[idx]["x1"] = target_x1
        words[idx]["x0"] = target_x1 - width


def fmt_money(value):
    return f"{value:.2f}"


def fmt_units(value):
    return f"{value:.2f}"
