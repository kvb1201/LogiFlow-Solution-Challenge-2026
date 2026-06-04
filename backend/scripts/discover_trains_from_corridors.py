#!/usr/bin/env python3
"""
Discover train numbers by scraping trains-between corridors (RailYatri API; HTML fallback).

Independent of the 2017 CSV validation (`build_active_train_list.py`). Safe to run in a
second terminal while validation continues.

Writes (under data/ir_delay_scrape/):
  discovered_trains.txt              — unique train numbers (all corridors)
  discovered_trains.json             — summary + per-train metadata
  discovered_trains_rows.csv         — append-only audit (train, corridor, provider)
  discovered_not_in_2017.txt         — numbers not present in Train_details_22122017.csv
  discovered_corridors_checkpoint.json

Later (after 2017 validation finishes):
  make validate-discovered-trains
  # or merge lists manually before collect-delays

Examples:
  ./venv/bin/python scripts/discover_trains_from_corridors.py --pilot
  ./venv/bin/python scripts/discover_trains_from_corridors.py --resume --sleep 2.0
  ./venv/bin/python scripts/discover_trains_from_corridors.py --mode stations --max-corridors 200
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime, timedelta
from itertools import combinations, permutations
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

import importlib.util

import requests
from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from scripts.collect_ir_delay_history import CSV_PATH, _fmt_duration  # noqa: E402


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_rail_config = _load_module(
    "rail_config_standalone",
    BACKEND_ROOT / "app" / "pipelines" / "rail" / "config.py",
)
CITY_TO_STATION = _rail_config.CITY_TO_STATION

from scripts.scrapers.corridor_trains import fetch_trains_between_corridor  # noqa: E402

load_dotenv(BACKEND_ROOT / ".env")

OUT_DIR = BACKEND_ROOT / "data" / "ir_delay_scrape"
DISCOVERED_TXT = OUT_DIR / "discovered_trains.txt"
DISCOVERED_JSON = OUT_DIR / "discovered_trains.json"
DISCOVERED_ROWS_CSV = OUT_DIR / "discovered_trains_rows.csv"
NOT_IN_2017_TXT = OUT_DIR / "discovered_not_in_2017.txt"
CHECKPOINT = OUT_DIR / "discovered_corridors_checkpoint.json"
LOCK_FILE = OUT_DIR / ".discover_corridors.lock"

ROW_FIELDNAMES = [
    "train_number",
    "train_name",
    "from_station",
    "to_station",
    "journey_date",
    "provider",
    "discovered_at_utc",
]


def _normalize_train_no(raw: str) -> str:
    t = str(raw or "").strip()
    if not t:
        return ""
    if t.replace(".", "").isdigit():
        return t.split(".")[0].zfill(5)
    return t


def load_2017_train_numbers() -> Set[str]:
    nums: Set[str] = set()
    with CSV_PATH.open(newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        col = "Train No" if reader.fieldnames and "Train No" in reader.fieldnames else None
        for row in reader:
            raw = row.get(col or "", "") if col else ""
            n = _normalize_train_no(raw)
            if n:
                nums.add(n)
    return nums


def primary_station_per_city() -> List[Tuple[str, str]]:
    """(city_name, station_code) using first code in CITY_TO_STATION."""
    out: List[Tuple[str, str]] = []
    for city, codes in sorted(CITY_TO_STATION.items()):
        if codes:
            out.append((city, str(codes[0]).strip().upper()))
    return out


def unique_station_codes() -> List[str]:
    seen: Set[str] = set()
    codes: List[str] = []
    for city_codes in CITY_TO_STATION.values():
        for code in city_codes:
            c = str(code).strip().upper()
            if c and c not in seen:
                seen.add(c)
                codes.append(c)
    return sorted(codes)


def build_corridors(mode: str, *, bidirectional: bool) -> List[Tuple[str, str, str]]:
    """
    Returns list of (from_code, to_code, label) for logging/checkpoint keys.
    label is stable id e.g. NDLS→SBC
    """
    pairs: List[Tuple[str, str, str]] = []

    if mode == "cities":
        hubs = primary_station_per_city()
        codes = [c for _, c in hubs]
        if bidirectional:
            pairs = [(a, b, f"{a}→{b}") for a, b in permutations(codes, 2)]
        else:
            pairs = [(a, b, f"{a}→{b}") for a, b in combinations(codes, 2)]
    elif mode == "stations":
        codes = unique_station_codes()
        if bidirectional:
            pairs = [(a, b, f"{a}→{b}") for a, b in permutations(codes, 2)]
        else:
            pairs = [(a, b, f"{a}→{b}") for a, b in combinations(codes, 2)]
    else:
        raise ValueError(f"unknown mode: {mode}")

    # Deduplicate by corridor key
    seen: Set[str] = set()
    out: List[Tuple[str, str, str]] = []
    for a, b, label in pairs:
        key = f"{a}|{b}"
        if key in seen:
            continue
        seen.add(key)
        out.append((a, b, label))
    return out


def load_corridors_file(path: Path) -> List[Tuple[str, str, str]]:
    pairs: List[Tuple[str, str, str]] = []
    with path.open(newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            a = str(row.get("from") or row.get("from_station") or "").strip().upper()
            b = str(row.get("to") or row.get("to_station") or "").strip().upper()
            if a and b and a != b:
                pairs.append((a, b, f"{a}→{b}"))
    return pairs


def acquire_lock() -> bool:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if LOCK_FILE.exists():
        try:
            raw = LOCK_FILE.read_text().strip()
            if raw.startswith("pid:"):
                pid = int(raw.split(":")[1].strip().split()[0])
                os.kill(pid, 0)
                print(
                    f"[discover] already running (pid {pid}). "
                    f"Stop it or delete {LOCK_FILE} if stale.",
                    flush=True,
                )
                return False
        except ProcessLookupError:
            pass
        except (ValueError, OSError):
            pass
    LOCK_FILE.write_text(f"pid:{os.getpid()}\nstarted:{time.time()}\n")
    return True


def release_lock() -> None:
    try:
        LOCK_FILE.unlink(missing_ok=True)
    except OSError:
        pass


def load_checkpoint() -> dict:
    if CHECKPOINT.exists():
        return json.loads(CHECKPOINT.read_text())
    return {
        "completed_corridors": {},
        "trains": {},
        "stats": {"corridors_ok": 0, "corridors_empty": 0, "corridors_error": 0},
    }


def save_checkpoint(state: dict) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    CHECKPOINT.write_text(json.dumps(state, indent=2))


def extract_trains_from_response(data: Optional[dict]) -> List[Tuple[str, str, str]]:
    """Returns [(train_number, train_name, provider_hint)]."""
    if not data or not isinstance(data, dict):
        return []
    provider = "railyatri"
    if data.get("provider"):
        provider = str(data["provider"])
    rows: List[Tuple[str, str, str]] = []
    for t in data.get("trains") or []:
        if not isinstance(t, dict):
            continue
        no = _normalize_train_no(t.get("trainNumber", t.get("train_number", "")))
        if not no:
            continue
        name = str(t.get("trainName", t.get("train_name", "")) or "").strip()
        rows.append((no, name, provider))
    return rows


def write_outputs(state: dict, csv_2017: Set[str]) -> None:
    trains_meta: Dict[str, dict] = state.get("trains", {})
    train_numbers = sorted(trains_meta.keys())
    not_in_2017 = sorted(t for t in train_numbers if t not in csv_2017)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    DISCOVERED_TXT.write_text("\n".join(train_numbers) + ("\n" if train_numbers else ""))
    NOT_IN_2017_TXT.write_text("\n".join(not_in_2017) + ("\n" if not_in_2017 else ""))

    report = {
        "discovered_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "unique_trains": len(train_numbers),
        "not_in_2017_csv": len(not_in_2017),
        "csv_2017_train_count": len(csv_2017),
        "corridors_completed": len(state.get("completed_corridors", {})),
        "stats": state.get("stats", {}),
        "trains_sample": train_numbers[:50],
        "not_in_2017_sample": not_in_2017[:50],
    }
    DISCOVERED_JSON.write_text(json.dumps(report, indent=2))


def append_rows_csv(rows: Iterable[dict]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write_header = not DISCOVERED_ROWS_CSV.exists()
    with DISCOVERED_ROWS_CSV.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=ROW_FIELDNAMES)
        if write_header:
            writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Discover IR train numbers via RailYatri/ConfirmTkt corridor scrapes"
    )
    parser.add_argument(
        "--mode",
        choices=("cities", "stations"),
        default="cities",
        help="cities=one hub station per city (default); stations=all mapped codes",
    )
    parser.add_argument(
        "--corridors-file",
        type=Path,
        default=None,
        help="CSV with from,to columns instead of auto-generated corridors",
    )
    parser.add_argument(
        "--bidirectional",
        action="store_true",
        help="Query A→B and B→A (doubles requests; better coverage)",
    )
    parser.add_argument("--date", default=None, help="Journey date YYYY-MM-DD (default: tomorrow)")
    parser.add_argument("--max-corridors", type=int, default=None, help="Cap corridors (testing)")
    parser.add_argument("--sleep", type=float, default=2.0, help="Delay between corridor requests")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--log-interval", type=float, default=60.0)
    parser.add_argument(
        "--pilot",
        action="store_true",
        help="Shorthand: --max-corridors 25 --bidirectional --sleep 1.5",
    )
    args = parser.parse_args()

    if args.pilot:
        args.max_corridors = args.max_corridors or 25
        args.bidirectional = True
        args.sleep = min(args.sleep, 1.5)

    if not acquire_lock():
        return 1

    journey_date = args.date
    if not journey_date:
        journey_date = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

    if args.corridors_file:
        corridors = load_corridors_file(args.corridors_file)
        mode_label = f"file:{args.corridors_file.name}"
    else:
        corridors = build_corridors(args.mode, bidirectional=args.bidirectional)
        mode_label = args.mode + ("_bidir" if args.bidirectional else "")

    if args.max_corridors:
        corridors = corridors[: args.max_corridors]

    csv_2017 = load_2017_train_numbers()
    state = load_checkpoint() if args.resume else {
        "completed_corridors": {},
        "trains": {},
        "stats": {"corridors_ok": 0, "corridors_empty": 0, "corridors_error": 0},
    }
    completed: dict = state.setdefault("completed_corridors", {})
    trains: dict = state.setdefault("trains", {})

    total = len(corridors)
    pending = sum(1 for a, b, _ in corridors if f"{a}|{b}" not in completed)
    run_started = time.time()
    last_log = run_started
    processed = 0

    print(
        f"[discover] mode={mode_label} · corridors={total:,} · pending={pending:,} · "
        f"date={journey_date}",
        flush=True,
    )
    print(
        f"[discover] does NOT touch 2017 validation — separate checkpoint/lock",
        flush=True,
    )
    print(f"[discover] 2017 CSV trains loaded: {len(csv_2017):,}", flush=True)

    session = requests.Session()
    try:
        for from_code, to_code, label in corridors:
            key = f"{from_code}|{to_code}"
            if key in completed:
                continue

            try:
                data = fetch_trains_between_corridor(
                    from_code, to_code, journey_date, session=session
                )
                found = extract_trains_from_response(data)
                status = "ok" if found else "empty"
                if found:
                    state["stats"]["corridors_ok"] = state["stats"].get("corridors_ok", 0) + 1
                else:
                    state["stats"]["corridors_empty"] = (
                        state["stats"].get("corridors_empty", 0) + 1
                    )

                now_utc = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                row_batch = []
                for no, name, provider in found:
                    meta = trains.setdefault(
                        no,
                        {"train_name": name, "corridors": [], "first_seen_utc": now_utc},
                    )
                    if name and not meta.get("train_name"):
                        meta["train_name"] = name
                    corridor_tag = label
                    if corridor_tag not in meta["corridors"]:
                        meta["corridors"].append(corridor_tag)
                    row_batch.append(
                        {
                            "train_number": no,
                            "train_name": name,
                            "from_station": from_code,
                            "to_station": to_code,
                            "journey_date": journey_date,
                            "provider": provider,
                            "discovered_at_utc": now_utc,
                        }
                    )
                if row_batch:
                    append_rows_csv(row_batch)

                completed[key] = {
                    "status": status,
                    "trains_found": len(found),
                    "label": label,
                    "at": now_utc,
                }
            except Exception as e:
                state["stats"]["corridors_error"] = state["stats"].get("corridors_error", 0) + 1
                completed[key] = {
                    "status": "error",
                    "error": str(e)[:200],
                    "label": label,
                    "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }

            processed += 1
            pending = max(0, pending - 1)

            now = time.time()
            if now - last_log >= args.log_interval:
                unique = len(trains)
                not_new = sum(1 for t in trains if t not in csv_2017)
                print(
                    f"\n[discover] ── {time.strftime('%H:%M:%S')} "
                    f"(running {_fmt_duration(now - run_started)}) ──",
                    flush=True,
                )
                print(
                    f"  corridors: {len(completed):,} / {total:,} · {pending:,} left · "
                    f"last: {label}",
                    flush=True,
                )
                print(
                    f"  unique trains: {unique:,} · new vs 2017 CSV: {not_new:,}",
                    flush=True,
                )
                rate = processed / max(now - run_started, 1) * 60
                print(
                    f"  rate: {rate:.2f} corridors/min · "
                    f"ETA: {_fmt_duration(pending / max(rate / 60, 0.01))}",
                    flush=True,
                )
                write_outputs(state, csv_2017)
                save_checkpoint(state)
                last_log = now

            if processed % 20 == 0:
                save_checkpoint(state)

            time.sleep(args.sleep)

        write_outputs(state, csv_2017)
        save_checkpoint(state)

        unique = len(trains)
        not_new = sum(1 for t in trains if t not in csv_2017)
        print(f"\n[discover] done.", flush=True)
        print(f"  unique trains: {unique:,} · not in 2017 CSV: {not_new:,}", flush=True)
        print(f"  wrote: {DISCOVERED_TXT}", flush=True)
        print(f"  wrote: {NOT_IN_2017_TXT}", flush=True)
        print(f"  audit: {DISCOVERED_ROWS_CSV}", flush=True)
        print(
            f"  after 2017 validation: make validate-discovered-trains",
            flush=True,
        )
        return 0
    finally:
        release_lock()


if __name__ == "__main__":
    raise SystemExit(main())
