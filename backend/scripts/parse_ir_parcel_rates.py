#!/usr/bin/env python3
"""
Parse official Indian Railways parcel rate PDFs into scale_*_official.json.

Sources (parcel.indianrail.gov.in / indianrailways.gov.in):
  - scale_l_official.json  ← luggage_rates.pdf
  - scale_s_official.json  ← Standered_rates.pdf
  - scale_p_official.json  ← Premier_rates.pdf

Usage:
  cd backend && ./venv/bin/python scripts/parse_ir_parcel_rates.py [--verify-only]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "app" / "pipelines" / "rail"

PDF_URLS = {
    "L": "https://indianrailways.gov.in/railwayboard/uploads/parcel/downloads/luggage_rates.pdf",
    "S": "https://parcel.indianrail.gov.in/Rates/Standered_rates.pdf",
    "P": "https://parcel.indianrail.gov.in/Rates/Premier_rates.pdf",
}

DIST_RE = re.compile(r"(\d+)\s*[-–]\s*(\d+)")


def _parse_distance_cell(text: str) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for line in (text or "").splitlines():
        m = DIST_RE.search(line.replace(" ", ""))
        if m:
            out.append((int(m.group(1)), int(m.group(2))))
    return out


def _parse_rate_cell(text: str) -> list[float]:
    vals: list[float] = []
    for line in (text or "").splitlines():
        line = line.strip().replace(",", "")
        if not line:
            continue
        try:
            vals.append(float(line))
        except ValueError:
            continue
    return vals


def parse_scale_pdf(path: Path) -> list[dict]:
    rows: list[dict] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables() or []
            if not tables:
                continue
            table = tables[0]
            if len(table) < 4:
                continue
            dist_col = table[3][0] if len(table) > 3 else ""
            dist_slabs = _parse_distance_cell(dist_col)
            if not dist_slabs:
                continue
            weight_cols = table[3][1:11]
            rate_matrix: list[list[float]] = []
            for col in weight_cols:
                rate_matrix.append(_parse_rate_cell(col[0] if col else ""))
            if not rate_matrix or not rate_matrix[0]:
                continue
            n = min(len(dist_slabs), len(rate_matrix[0]))
            for i in range(n):
                lo, hi = dist_slabs[i]
                rates = [rate_matrix[w][i] for w in range(10) if i < len(rate_matrix[w])]
                if len(rates) == 10:
                    rows.append({"lo": lo, "hi": hi, "rates": rates})
    return rows


def load_json_scale(scale: str) -> list[dict]:
    path = OUT_DIR / f"scale_{scale.lower()}_official.json"
    with open(path) as f:
        return json.load(f)["rows"]


def verify(scale: str, pdf_path: Path) -> int:
    parsed = parse_scale_pdf(pdf_path)
    existing = load_json_scale(scale)
    mismatches = 0
    for p_row, e_row in zip(parsed, existing):
        if p_row["lo"] != e_row["lo"] or p_row["hi"] != e_row["hi"]:
            mismatches += 1
            continue
        for a, b in zip(p_row["rates"], e_row["rates"]):
            if abs(a - b) > 0.05:
                mismatches += 1
                print(f"  {scale} {p_row['lo']}-{p_row['hi']}: PDF {a} vs JSON {b}")
                break
    print(f"Scale-{scale}: {len(parsed)} PDF rows, {mismatches} mismatches vs JSON")
    return mismatches


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--pdf-dir", type=Path, default=Path("/tmp"))
    args = parser.parse_args()

    total_bad = 0
    for scale, url in PDF_URLS.items():
        pdf_path = args.pdf_dir / f"scale_{scale.lower()}_rates.pdf"
        if not pdf_path.exists():
            print(f"Missing {pdf_path} — download: curl -L -o {pdf_path} {url}")
            continue
        if args.verify_only:
            total_bad += verify(scale, pdf_path)
        else:
            rows = parse_scale_pdf(pdf_path)
            out = {"scale": scale, "rows": rows}
            out_path = OUT_DIR / f"scale_{scale.lower()}_official.json"
            with open(out_path, "w") as f:
                json.dump(out, f, indent=2)
            print(f"Wrote {len(rows)} rows → {out_path}")
            total_bad += verify(scale, pdf_path)

    return 1 if total_bad else 0


if __name__ == "__main__":
    sys.exit(main())
