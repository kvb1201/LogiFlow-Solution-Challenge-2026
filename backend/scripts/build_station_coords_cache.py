#!/usr/bin/env python3
"""
Build station_coords_cache.json from internet sources + optional CSV interpolation.
Run with: PYTHONUNBUFFERED=1 python -u scripts/build_station_coords_cache.py
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import sys
import time
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from app.services.online_station_catalog import catalog_stats, load_or_fetch_merged_catalog  # noqa: E402
from app.services.station_geocoder import geocode_station_name  # noqa: E402

RAIL_DIR = os.path.join(ROOT, "app", "pipelines", "rail")
CSV_PATH = os.path.join(RAIL_DIR, "Train_details_22122017.csv")
COORDS_PY = os.path.join(RAIL_DIR, "station_coordinates.py")
OUT_PATH = os.path.join(RAIL_DIR, "station_coords_cache.json")
CHECKPOINT_PATH = os.path.join(RAIL_DIR, "station_coords_geocode_checkpoint.json")

ALIASES = {
    "PRYJ": ["ALD"], "ALD": ["PRYJ"],
    "NDLS": ["DLI"], "DLI": ["NDLS"],
    "DDU": ["MGS"], "MGS": ["DDU"],
    "JHS": ["VGLB"], "VGLB": ["JHS"],
    "BCT": ["MMCT"], "MMCT": ["BCT"],
    "MAS": ["MS"], "MS": ["MAS"],
}

READ_CSV_KW = {"low_memory": False}


def log(msg: str) -> None:
    print(msg, flush=True)


def _load_hardcoded() -> dict[str, tuple[float, float]]:
    text = open(COORDS_PY, encoding="utf-8").read()
    match = re.search(
        r"HARDCODED_STATION_COORDS:\s*dict\[str,\s*tuple\[float,\s*float\]\]\s*=\s*(\{.*?\n\})",
        text,
        re.S,
    )
    if not match:
        raise RuntimeError("Could not parse HARDCODED_STATION_COORDS")
    return ast.literal_eval(match.group(1))


def _load_routes_df() -> pd.DataFrame | None:
    if not os.path.exists(CSV_PATH):
        log("[csv] Train schedule CSV not found — skipping interpolation")
        return None
    log("[csv] Loading Train_details_22122017.csv ...")
    t0 = time.monotonic()
    df = pd.read_csv(CSV_PATH, **READ_CSV_KW)
    df.columns = df.columns.str.strip()
    df.rename(
        columns={
            "Train No": "train_no",
            "SEQ": "seq",
            "Station Code": "station_code",
            "Station Name": "station_name",
            "Distance": "distance",
        },
        inplace=True,
    )
    df["train_no"] = df["train_no"].astype(str).str.strip()
    df["station_code"] = df["station_code"].astype(str).str.strip().str.upper()
    df["seq"] = pd.to_numeric(df["seq"], errors="coerce").fillna(0).astype(int)
    df["distance"] = pd.to_numeric(df["distance"], errors="coerce").fillna(0)
    df = df.sort_values(["train_no", "seq"])
    log(f"[csv] Loaded {len(df):,} rows, {df['train_no'].nunique():,} trains ({time.monotonic() - t0:.1f}s)")
    return df


def _interpolate_from_routes(
    df: pd.DataFrame,
    seed: dict[str, tuple[float, float]],
) -> dict[str, tuple[float, float]]:
    log("[interp] Propagating coordinates along train routes...")
    coords: dict[str, list[float]] = {k: [v[0], v[1]] for k, v in seed.items()}
    groups = list(df.groupby("train_no"))
    total_trains = len(groups)
    t0 = time.monotonic()

    for pass_i in range(40):
        changed = 0
        for ti, (_, group) in enumerate(groups):
            if ti and ti % 2000 == 0:
                log(f"  [interp] pass {pass_i + 1}/40 — train {ti}/{total_trains}, +{changed} so far")
            stops = group.to_dict("records")
            known = [(i, coords[s["station_code"]]) for i, s in enumerate(stops) if s["station_code"] in coords]
            if len(known) < 2:
                continue
            known.sort(key=lambda item: item[0])
            for k in range(len(known) - 1):
                i0, c0 = known[k]
                i1, c1 = known[k + 1]
                lat0, lng0 = c0
                lat1, lng1 = c1
                d0 = float(stops[i0]["distance"])
                d1 = float(stops[i1]["distance"])
                span = d1 - d0
                use_dist = span > 0
                if not use_dist:
                    span = float(i1 - i0) or 1.0
                for j in range(i0 + 1, i1):
                    code = stops[j]["station_code"]
                    if code in coords:
                        continue
                    frac = (float(stops[j]["distance"]) - d0) / span if use_dist else (j - i0) / span
                    coords[code] = [lat0 + frac * (lat1 - lat0), lng0 + frac * (lng1 - lng0)]
                    changed += 1
        log(f"  [interp] pass {pass_i + 1}/40 done — total {len(coords)} stations (+{changed} new)")
        if changed == 0:
            break

    log(f"[interp] Finished in {time.monotonic() - t0:.1f}s")
    return {k: (v[0], v[1]) for k, v in coords.items()}


def _catalog_from_online(merged: dict[str, dict]) -> dict[str, str]:
    return {code: str(row.get("name") or code) for code, row in merged.items()}


def _seed_from_online(
    merged: dict[str, dict],
    hardcoded: dict[str, tuple[float, float]],
) -> tuple[dict[str, tuple[float, float]], dict[str, str]]:
    coords: dict[str, tuple[float, float]] = dict(hardcoded)
    sources: dict[str, str] = {code: "hardcoded" for code in hardcoded}
    for code, row in merged.items():
        lat, lng = row.get("lat"), row.get("lng")
        if lat is None or lng is None or code in hardcoded:
            continue
        coords[code] = (float(lat), float(lng))
        sources[code] = str(row.get("coord_source") or "datameet")
    return coords, sources


def _write_cache(
    coords: dict[str, tuple[float, float]],
    catalog: dict[str, str],
    sources: dict[str, str],
    states: dict[str, str] | None = None,
) -> None:
    states = states or {}
    out: dict[str, dict] = {}
    for code, (lat, lng) in sorted(coords.items()):
        row: dict[str, object] = {
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "name": catalog.get(code, code),
            "source": sources.get(code, "unknown"),
        }
        if states.get(code):
            row["state_name"] = states[code]
        out[code] = row
    for code, alts in ALIASES.items():
        if code not in out:
            continue
        for alt in alts:
            if alt not in out:
                out[alt] = {**out[code], "source": "alias"}
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    log(f"[write] {len(out)} stations -> {OUT_PATH}")


def _load_checkpoint() -> dict:
    if not os.path.exists(CHECKPOINT_PATH):
        return {"skipped": []}
    try:
        data = json.load(open(CHECKPOINT_PATH, encoding="utf-8"))
        if isinstance(data, list):
            return {"skipped": [], "legacy_cleared": len(data)}
        return data if isinstance(data, dict) else {"skipped": []}
    except Exception:
        return {"skipped": []}


def _save_checkpoint(skipped: set[str]) -> None:
    with open(CHECKPOINT_PATH, "w", encoding="utf-8") as f:
        json.dump({"skipped": sorted(skipped)}, f)


def _geocode_one(
    code: str,
    name: str,
    state: str,
) -> tuple[str, tuple[float, float] | None, str | None]:
    hit, provider = geocode_station_name(name, code=code, state=state)
    return code, hit, provider


def _geocode_parallel(
    pending: list[str],
    catalog: dict[str, str],
    merged: dict[str, dict],
    coords: dict[str, tuple[float, float]],
    sources: dict[str, str],
    states: dict[str, str],
    skipped: set[str],
    *,
    workers: int,
    log_every: int,
) -> None:
    total = len(pending)
    log(f"[geocode] {total} stations to resolve (workers={workers})")
    t0 = time.monotonic()
    done = 0
    ok = 0
    fail = 0

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(
                _geocode_one,
                code,
                catalog.get(code, code),
                (merged.get(code) or {}).get("state_name") or "",
            ): code
            for code in pending
        }
        for fut in as_completed(futures):
            code = futures[fut]
            done += 1
            try:
                c, hit, provider = fut.result()
                if hit:
                    coords[c] = hit
                    sources[c] = provider or "geocoded"
                    ok += 1
                else:
                    skipped.add(c)
                    fail += 1
            except Exception as exc:
                skipped.add(code)
                fail += 1
                if done <= 5 or done % log_every == 0:
                    log(f"  [geocode] ERR {code}: {exc}")

            if done == 1 or done % log_every == 0 or done == total:
                elapsed = time.monotonic() - t0
                rate = done / elapsed if elapsed > 0 else 0
                eta = (total - done) / rate if rate > 0 else 0
                log(
                    f"  [geocode] {done}/{total} ({100 * done / total:.1f}%) "
                    f"ok={ok} skip={fail} elapsed={elapsed:.0f}s eta={eta:.0f}s"
                )
            if done % 100 == 0:
                _write_cache(coords, catalog, sources, states)
                _save_checkpoint(skipped)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force-fetch", action="store_true", help="Re-download online catalogs.")
    parser.add_argument("--geocode-missing", action="store_true", help="Geocode unresolved stations.")
    parser.add_argument("--max-geocode", type=int, default=0, help="Cap geocode attempts (0=all).")
    parser.add_argument("--workers", type=int, default=6, help="Parallel geocode workers.")
    parser.add_argument("--log-every", type=int, default=25, help="Progress log interval.")
    parser.add_argument("--no-csv-interpolation", action="store_true")
    args = parser.parse_args()

    log("=== LogiFlow station cache build ===")
    merged = load_or_fetch_merged_catalog(force=args.force_fetch)
    stats = catalog_stats(merged)
    log(f"[stats] Online catalog: {stats['total']} stations, {stats['with_coords']} with coordinates")

    hardcoded = _load_hardcoded()
    log(f"[hardcoded] {len(hardcoded)} verified junction coordinates")
    catalog = _catalog_from_online(merged)
    states = {code: str(row.get("state_name") or "") for code, row in merged.items()}

    df = _load_routes_df()
    if df is not None:
        extra = 0
        for _, row in df[["station_code", "station_name"]].drop_duplicates("station_code").iterrows():
            code = str(row["station_code"]).strip().upper()
            if code and code not in catalog:
                catalog[code] = str(row["station_name"]).strip()
                extra += 1
        if extra:
            log(f"[csv] Added {extra} station names not in online catalog")

    coords, sources = _seed_from_online(merged, hardcoded)
    log(f"[seed] {len(coords)} stations (hardcoded + datameet)")

    if not args.no_csv_interpolation and df is not None:
        interpolated = _interpolate_from_routes(df, coords)
        added = 0
        for code, pair in interpolated.items():
            if code not in coords:
                coords[code] = pair
                sources[code] = "interpolated"
                added += 1
        log(f"[seed] +{added} from CSV interpolation -> {len(coords)} total")

    missing = sorted(set(catalog) - set(coords))
    log(f"[summary] catalog={len(catalog)} resolved={len(coords)} missing={len(missing)}")

    if args.geocode_missing and missing:
        checkpoint = _load_checkpoint()
        skipped = set(checkpoint.get("skipped") or [])
        pending = [c for c in missing if c not in skipped]
        if args.max_geocode:
            pending = pending[: args.max_geocode]
        log(f"[geocode] Pending {len(pending)} (skipped {len(skipped)} from checkpoint)")
        _geocode_parallel(
            pending,
            catalog,
            merged,
            coords,
            sources,
            states,
            skipped,
            workers=max(1, args.workers),
            log_every=max(1, args.log_every),
        )
        _save_checkpoint(skipped)

    _write_cache(coords, catalog, sources, states)
    still_missing = sorted(set(catalog) - set(coords))
    pct = 100 * len(coords) / len(catalog) if catalog else 0
    log(f"=== Done: {len(coords)}/{len(catalog)} ({pct:.1f}%) ===")
    if still_missing:
        log(f"Still missing {len(still_missing)} — run again with --geocode-missing")


if __name__ == "__main__":
    main()
