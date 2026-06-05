#!/usr/bin/env python3
"""Deprecated wrapper — use build_station_coords_cache.py."""

import os
import sys

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(__file__), "..")))
from build_station_coords_cache import main  # noqa: E402

if __name__ == "__main__":
    main()
