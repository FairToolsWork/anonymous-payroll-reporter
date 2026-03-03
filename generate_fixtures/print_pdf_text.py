import json
from pathlib import Path

import pdfplumber

BASE_DIR = Path(__file__).resolve().parents[1]
CONFIG_PATH = Path(__file__).resolve().parent / "fixture_runs.json"


def resolve_base_pdf():
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"Run config not found: {CONFIG_PATH}")
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    default_structure_ref = config.get("default_structure")
    if not default_structure_ref:
        raise ValueError("fixture_runs.json has no 'default_structure' set")
    structure_path = BASE_DIR / default_structure_ref
    if not structure_path.exists():
        raise FileNotFoundError(f"Structure file not found: {structure_path}")
    with structure_path.open("r", encoding="utf-8") as handle:
        structure = json.load(handle)
    base_pdf_ref = structure.get("sources", {}).get("base_pdf")
    if not base_pdf_ref:
        raise ValueError(f"Structure file missing sources.base_pdf: {structure_path}")
    base_pdf = BASE_DIR / base_pdf_ref
    if not base_pdf.exists():
        raise FileNotFoundError(f"base_pdf not found: {base_pdf}")
    return base_pdf


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
    return line_text


def main():
    base_pdf = resolve_base_pdf()
    with pdfplumber.open(base_pdf) as pdf:
        page = pdf.pages[0]
        words = page.extract_words(x_tolerance=1, y_tolerance=1, keep_blank_chars=False)
        line_text = build_line_map(words)
    for top in sorted(line_text):
        print(f"{top:7.1f}: {line_text[top]}")


if __name__ == "__main__":
    main()
