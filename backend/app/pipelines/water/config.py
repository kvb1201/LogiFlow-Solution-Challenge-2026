"""
Water pipeline configuration.

Runtime constants live here. PORTS / SEA_LANES / ROUTE_CHOKEPOINTS are built
dynamically from PortWatch CSV + spillover connectivity in sea_graph.py (Phase 2).
"""

from __future__ import annotations

# ── Runtime constants ────────────────────────────────────────────────────────

VESSEL_SPEED_KNOTS        = 16.0   # nm/hour — general cargo / container vessel
PORT_HANDLING_HOURS       = 6.0    # load/unload at each port call
TRANSSHIPMENT_EXTRA_HOURS = 10.0   # additional handling at intermediate port
TRUCK_SPEED_KMPH          = 45.0   # city → port road leg

# Cost model (INR)
SEA_COST_BASE_PER_KG_INR     = 1.2
SEA_COST_PER_KG_PER_NM_INR  = 0.015
PORT_FEE_BASE_INR            = 800.0
TRANSSHIPMENT_FEE_INR        = 1200.0
ROAD_COST_PER_KM_PER_TON_INR = 10.0
ROAD_HANDLING_BASE_INR       = 300.0

# Risk weights — 6 components (chokepoint + disruption)
RISK_WEIGHTS = {
    "weather":       0.25,
    "congestion":    0.20,
    "security":      0.20,
    "transshipment": 0.10,
    "chokepoint":    0.15,
    "disruption":    0.10,
}

from app.pipelines.water.chokepoints import CHOKEPOINTS  # noqa: E402
from app.pipelines.water.sea_graph import (  # noqa: E402
    PORTS,
    ROUTABLE_PORT_IDS,
    ROUTE_CHOKEPOINTS,
    SEA_LANES,
)
