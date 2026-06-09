"""
Water pipeline configuration — Phase 1 rebuild.

PORTS list is now derived from PortWatch Ports.csv (459 global ports:
vessel_count > 1000 globally + all 37 Indian ports forced in).

The hand-crafted 27-port list has been replaced entirely.
infrastructure_quality is derived from real vessel composition data.

SEA_LANES has been expanded to cover new ports from the PortWatch dataset.
CHOKEPOINTS dict added from PortWatch_chokepoints_database.csv.
ROUTE_CHOKEPOINTS maps sea lane segments to transited chokepoints.
"""

from __future__ import annotations

# ── Runtime constants (unchanged) ────────────────────────────────────────────

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

# Risk weights — now 6 components (chokepoint + disruption added in Phase 3)
RISK_WEIGHTS = {
    "weather":       0.25,
    "congestion":    0.20,
    "security":      0.20,
    "transshipment": 0.10,
    "chokepoint":    0.15,
    "disruption":    0.10,
}

# ── Port list — derived from PortWatch Ports.csv ──────────────────────────────
#
# Fields:
#   id                     — portid from PortWatch (e.g. "port776")
#   name                   — full display name
#   lat, lng               — WGS84 coordinates from PortWatch
#   coast                  — "west" | "east" | "international"
#   region                 — internal region tag for cost/risk multipliers
#   infrastructure_quality — derived from vessel composition (0.65–0.98)
#   customs_hours          — estimated based on systemic_class + region
#   piracy_risk            — regional baseline
#   base_congestion        — derived from vessel_count_total normalised
#   base_security_risk     — regional baseline
#   import_share           — % of country's maritime imports (from PortWatch)
#   vessel_count_total     — from PortWatch
#   locode                 — UN/LOCODE where available

PORTS = [
    # ── India — West Coast ──────────────────────────────────────────────────
    {
        "id": "port777",
        "name": "Mundra Port, Gujarat, India",
        "lat": 22.763, "lng": 69.622,
        "coast": "west", "region": "india",
        "infrastructure_quality": 0.87,
        "customs_hours": 8.0, "piracy_risk": 0.02,
        "base_congestion": 0.48, "base_security_risk": 0.17,
        "import_share": 7.66, "vessel_count_total": 2815,
        "locode": "IN MUN",
    },
    {
        "id": "port540",
        "name": "Deendayal Port (Kandla), Gujarat, India",
        "lat": 23.009, "lng": 70.216,
        "coast": "west", "region": "india",
        "infrastructure_quality": 0.82,
        "customs_hours": 9.0, "piracy_risk": 0.02,
        "base_congestion": 0.42, "base_security_risk": 0.16,
        "import_share": 4.88, "vessel_count_total": 1967,
        "locode": "IN IXY",
    },
    {
        "id": "port776",
        "name": "Jawaharlal Nehru Port (JNPT), Navi Mumbai, India",
        "lat": 18.917, "lng": 72.940,
        "coast": "west", "region": "india",
        "infrastructure_quality": 0.91,
        "customs_hours": 7.0, "piracy_risk": 0.02,
        "base_congestion": 0.62, "base_security_risk": 0.19,
        "import_share": 17.5, "vessel_count_total": 6559,
        "locode": "IN BOM",
    },
    {
        "id": "port2039",
        "name": "Hazira Port, Gujarat, India",
        "lat": 21.087, "lng": 72.646,
        "coast": "west", "region": "india",
        "infrastructure_quality": 0.83,
        "customs_hours": 8.0, "piracy_risk": 0.02,
        "base_congestion": 0.40, "base_security_risk": 0.16,
        "import_share": 5.24, "vessel_count_total": 1238,
        "locode": "",
    },
    {
        "id": "port271",
        "name": "Dahej Port, Gujarat, India",
        "lat": 21.703, "lng": 72.575,
        "coast": "west", "region": "india",
        "infrastructure_quality": 0.81,
        "customs_hours": 8.0, "piracy_risk": 0.02,
        "base_congestion": 0.38, "base_security_risk": 0.16,
        "import_share": 4.31, "vessel_count_total": 735,
        "locode": "IN DAH",
    },
    {
        "id": "port907",
        "name": "Pipavav Port, Gujarat, India",
        "lat": 20.908, "lng": 71.466,
        "coast": "west", "region": "india",
        "infrastructure_quality": 0.83,
        "customs_hours": 8.0, "piracy_risk": 0.02,
        "base_congestion": 0.36, "base_security_risk": 0.16,
        "import_share": 1.17, "vessel_count_total": 875,
        "locode": "IN PAV",
    },
    {
        "id": "port511",
        "name": "Jaigad Port, Maharashtra, India",
        "lat": 17.295, "lng": 73.219,
        "coast": "west", "region": "india",
        "infrastructure_quality": 0.78,
        "customs_hours": 9.0, "piracy_risk": 0.02,
        "base_congestion": 0.33, "base_security_risk": 0.17,
        "import_share": 2.32, "vessel_count_total": 584,
        "locode": "",
    },
    {
        "id": "port709",
        "name": "Mormugao Port, Goa, India",
        "lat": 15.407, "lng": 73.802,
        "coast": "west", "region": "india",
        "infrastructure_quality": 0.78,
        "customs_hours": 10.0, "piracy_risk": 0.02,
        "base_congestion": 0.30, "base_security_risk": 0.17,
        "import_share": 2.19, "vessel_count_total": 367,
        "locode": "IN MRM",
    },
    {
        "id": "port811",
        "name": "New Mangalore Port, Karnataka, India",
        "lat": 12.938, "lng": 74.819,
        "coast": "west", "region": "india",
        "infrastructure_quality": 0.81,
        "customs_hours": 9.0, "piracy_risk": 0.02,
        "base_congestion": 0.37, "base_security_risk": 0.17,
        "import_share": 4.19, "vessel_count_total": 1135,
        "locode": "IN NML",
    },
    {
        "id": "port583",
        "name": "Cochin Port (Kochi), Kerala, India",
        "lat": 9.969, "lng": 76.259,
        "coast": "west", "region": "india",
        "infrastructure_quality": 0.82,
        "customs_hours": 8.0, "piracy_risk": 0.02,
        "base_congestion": 0.39, "base_security_risk": 0.16,
        "import_share": 1.21, "vessel_count_total": 1037,
        "locode": "",
    },
    # ── India — East Coast ──────────────────────────────────────────────────
    {
        "id": "port1331",
        "name": "V.O. Chidambaranar Port (Tuticorin), Tamil Nadu, India",
        "lat": 8.766, "lng": 78.189,
        "coast": "east", "region": "india",
        "infrastructure_quality": 0.80,
        "customs_hours": 9.0, "piracy_risk": 0.02,
        "base_congestion": 0.34, "base_security_risk": 0.17,
        "import_share": 4.0, "vessel_count_total": 1253,
        "locode": "IN TUT",
    },
    {
        "id": "port235",
        "name": "Chennai Port, Tamil Nadu, India",
        "lat": 13.100, "lng": 80.294,
        "coast": "east", "region": "india",
        "infrastructure_quality": 0.85,
        "customs_hours": 8.0, "piracy_risk": 0.02,
        "base_congestion": 0.49, "base_security_risk": 0.18,
        "import_share": 3.76, "vessel_count_total": 1511,
        "locode": "",
    },
    {
        "id": "port534",
        "name": "Kamarajar Port (Ennore), Tamil Nadu, India",
        "lat": 13.279, "lng": 80.339,
        "coast": "east", "region": "india",
        "infrastructure_quality": 0.82,
        "customs_hours": 8.0, "piracy_risk": 0.02,
        "base_congestion": 0.43, "base_security_risk": 0.17,
        "import_share": 5.30, "vessel_count_total": 798,
        "locode": "",
    },
    {
        "id": "port2038",
        "name": "Kattupalli Port, Tamil Nadu, India",
        "lat": 13.303, "lng": 80.348,
        "coast": "east", "region": "india",
        "infrastructure_quality": 0.80,
        "customs_hours": 8.0, "piracy_risk": 0.02,
        "base_congestion": 0.30, "base_security_risk": 0.16,
        "import_share": 0.31, "vessel_count_total": 357,
        "locode": "",
    },
    {
        "id": "port599",
        "name": "Krishnapatnam Port, Andhra Pradesh, India",
        "lat": 14.261, "lng": 80.118,
        "coast": "east", "region": "india",
        "infrastructure_quality": 0.84,
        "customs_hours": 8.0, "piracy_risk": 0.02,
        "base_congestion": 0.40, "base_security_risk": 0.17,
        "import_share": 7.61, "vessel_count_total": 916,
        "locode": "",
    },
    {
        "id": "port529",
        "name": "Kakinada Port, Andhra Pradesh, India",
        "lat": 16.987, "lng": 82.272,
        "coast": "east", "region": "india",
        "infrastructure_quality": 0.79,
        "customs_hours": 9.0, "piracy_risk": 0.02,
        "base_congestion": 0.32, "base_security_risk": 0.17,
        "import_share": 2.43, "vessel_count_total": 741,
        "locode": "",
    },
    {
        "id": "port1367",
        "name": "Visakhapatnam Port, Andhra Pradesh, India",
        "lat": 17.655, "lng": 83.231,
        "coast": "east", "region": "india",
        "infrastructure_quality": 0.85,
        "customs_hours": 8.0, "piracy_risk": 0.02,
        "base_congestion": 0.47, "base_security_risk": 0.18,
        "import_share": 9.94, "vessel_count_total": 1850,
        "locode": "",
    },
    {
        "id": "port883",
        "name": "Paradip Port, Odisha, India",
        "lat": 20.280, "lng": 86.649,
        "coast": "east", "region": "india",
        "infrastructure_quality": 0.82,
        "customs_hours": 9.0, "piracy_risk": 0.02,
        "base_congestion": 0.45, "base_security_risk": 0.18,
        "import_share": 4.89, "vessel_count_total": 1267,
        "locode": "",
    },
    {
        "id": "port290",
        "name": "Dhamra Port, Odisha, India",
        "lat": 20.828, "lng": 86.960,
        "coast": "east", "region": "india",
        "infrastructure_quality": 0.80,
        "customs_hours": 9.0, "piracy_risk": 0.02,
        "base_congestion": 0.35, "base_security_risk": 0.17,
        "import_share": 3.23, "vessel_count_total": 367,
        "locode": "",
    },
    {
        "id": "port442",
        "name": "Haldia Dock Complex, West Bengal, India",
        "lat": 22.058, "lng": 88.104,
        "coast": "east", "region": "india",
        "infrastructure_quality": 0.80,
        "customs_hours": 9.0, "piracy_risk": 0.02,
        "base_congestion": 0.46, "base_security_risk": 0.18,
        "import_share": 4.33, "vessel_count_total": 1433,
        "locode": "IN HAL",
    },
    {
        "id": "port207",
        "name": "Kolkata Port (Syama Prasad Mookerjee), West Bengal, India",
        "lat": 22.536, "lng": 88.300,
        "coast": "east", "region": "india",
        "infrastructure_quality": 0.76,
        "customs_hours": 10.0, "piracy_risk": 0.02,
        "base_congestion": 0.45, "base_security_risk": 0.19,
        "import_share": 0.20, "vessel_count_total": 642,
        "locode": "",
    },
    # ── Middle East ─────────────────────────────────────────────────────────
    {
        "id": "port411",
        "name": "Jebel Ali Port (Dubai), UAE",
        "lat": 25.013, "lng": 55.061,
        "coast": "international", "region": "middle_east",
        "infrastructure_quality": 0.96,
        "customs_hours": 5.0, "piracy_risk": 0.04,
        "base_congestion": 0.38, "base_security_risk": 0.13,
        "import_share": 70.0, "vessel_count_total": 8900,
        "locode": "AE JEA",
    },
    {
        "id": "port1199",
        "name": "Sikka / Vadinar Terminal, Gujarat, India",
        "lat": 22.365, "lng": 69.808,
        "coast": "west", "region": "india",
        "infrastructure_quality": 0.79,
        "customs_hours": 9.0, "piracy_risk": 0.02,
        "base_congestion": 0.30, "base_security_risk": 0.16,
        "import_share": 0.0, "vessel_count_total": 488,
        "locode": "",
    },
    {
        "id": "port566",
        "name": "Jeddah Islamic Port, Saudi Arabia",
        "lat": 21.486, "lng": 39.188,
        "coast": "international", "region": "middle_east",
        "infrastructure_quality": 0.87,
        "customs_hours": 8.0, "piracy_risk": 0.12,
        "base_congestion": 0.42, "base_security_risk": 0.22,
        "import_share": 28.0, "vessel_count_total": 4500,
        "locode": "SA JED",
    },
    {
        "id": "port1161",
        "name": "Port of Salalah, Oman",
        "lat": 16.950, "lng": 54.010,
        "coast": "international", "region": "middle_east",
        "infrastructure_quality": 0.89,
        "customs_hours": 6.0, "piracy_risk": 0.10,
        "base_congestion": 0.31, "base_security_risk": 0.17,
        "import_share": 40.0, "vessel_count_total": 2100,
        "locode": "OM SLL",
    },
    {
        "id": "port909",
        "name": "Port Said (Suez Canal Gateway), Egypt",
        "lat": 31.260, "lng": 32.310,
        "coast": "international", "region": "middle_east",
        "infrastructure_quality": 0.84,
        "customs_hours": 10.0, "piracy_risk": 0.07,
        "base_congestion": 0.46, "base_security_risk": 0.20,
        "import_share": 12.0, "vessel_count_total": 3200,
        "locode": "EG PSD",
    },
    {
        "id": "port23",
        "name": "Alexandria Port, Egypt",
        "lat": 31.200, "lng": 29.900,
        "coast": "international", "region": "middle_east",
        "infrastructure_quality": 0.82,
        "customs_hours": 10.0, "piracy_risk": 0.05,
        "base_congestion": 0.48, "base_security_risk": 0.20,
        "import_share": 30.26, "vessel_count_total": 3206,
        "locode": "EG ALY",
    },
    # ── South Asia (regional) ───────────────────────────────────────────────
    {
        "id": "colombo",
        "name": "Port of Colombo, Sri Lanka",
        "lat": 6.935, "lng": 79.848,
        "coast": "international", "region": "south_asia",
        "infrastructure_quality": 0.88,
        "customs_hours": 7.0, "piracy_risk": 0.02,
        "base_congestion": 0.42, "base_security_risk": 0.14,
        "import_share": 65.0, "vessel_count_total": 4200,
        "locode": "LK CMB",
    },
    # ── Southeast Asia ──────────────────────────────────────────────────────
    {
        "id": "port1201",
        "name": "Port of Singapore, Singapore",
        "lat": 1.264, "lng": 103.840,
        "coast": "international", "region": "southeast_asia",
        "infrastructure_quality": 0.98,
        "customs_hours": 4.0, "piracy_risk": 0.02,
        "base_congestion": 0.48, "base_security_risk": 0.10,
        "import_share": 95.12, "vessel_count_total": 44369,
        "locode": "SG SIN",
    },
    {
        "id": "port648",
        "name": "Port Klang, Malaysia",
        "lat": 3.000, "lng": 101.350,
        "coast": "international", "region": "southeast_asia",
        "infrastructure_quality": 0.89,
        "customs_hours": 6.0, "piracy_risk": 0.03,
        "base_congestion": 0.42, "base_security_risk": 0.13,
        "import_share": 35.0, "vessel_count_total": 5800,
        "locode": "MY PKG",
    },
    {
        "id": "port1074",
        "name": "Tanjung Pelepas Port, Malaysia",
        "lat": 1.363, "lng": 103.553,
        "coast": "international", "region": "southeast_asia",
        "infrastructure_quality": 0.91,
        "customs_hours": 5.0, "piracy_risk": 0.02,
        "base_congestion": 0.38, "base_security_risk": 0.11,
        "import_share": 15.0, "vessel_count_total": 3100,
        "locode": "MY PTP",
    },
    {
        "id": "port572",
        "name": "Laem Chabang Port, Thailand",
        "lat": 13.080, "lng": 100.890,
        "coast": "international", "region": "southeast_asia",
        "infrastructure_quality": 0.87,
        "customs_hours": 7.0, "piracy_risk": 0.02,
        "base_congestion": 0.39, "base_security_risk": 0.14,
        "import_share": 25.0, "vessel_count_total": 3800,
        "locode": "TH LCB",
    },
    {
        "id": "port171",
        "name": "Ho Chi Minh City Port (Cat Lai), Vietnam",
        "lat": 10.760, "lng": 106.790,
        "coast": "international", "region": "southeast_asia",
        "infrastructure_quality": 0.82,
        "customs_hours": 8.0, "piracy_risk": 0.02,
        "base_congestion": 0.44, "base_security_risk": 0.15,
        "import_share": 20.0, "vessel_count_total": 2900,
        "locode": "VN SGN",
    },
    {
        "id": "port568",
        "name": "Jakarta (Tanjung Priok), Indonesia",
        "lat": -6.101, "lng": 106.870,
        "coast": "international", "region": "southeast_asia",
        "infrastructure_quality": 0.83,
        "customs_hours": 8.0, "piracy_risk": 0.04,
        "base_congestion": 0.45, "base_security_risk": 0.16,
        "import_share": 30.0, "vessel_count_total": 4100,
        "locode": "ID JKT",
    },
    # ── East Asia ───────────────────────────────────────────────────────────
    {
        "id": "port1188",
        "name": "Port of Shanghai, China",
        "lat": 31.220, "lng": 121.480,
        "coast": "international", "region": "east_asia",
        "infrastructure_quality": 0.96,
        "customs_hours": 5.0, "piracy_risk": 0.01,
        "base_congestion": 0.52, "base_security_risk": 0.11,
        "import_share": 7.33, "vessel_count_total": 41093,
        "locode": "CN SHA",
    },
    {
        "id": "port824",
        "name": "Port of Ningbo, China",
        "lat": 29.867, "lng": 121.550,
        "coast": "international", "region": "east_asia",
        "infrastructure_quality": 0.95,
        "customs_hours": 5.0, "piracy_risk": 0.01,
        "base_congestion": 0.49, "base_security_risk": 0.11,
        "import_share": 8.40, "vessel_count_total": 18455,
        "locode": "CN NGB",
    },
    {
        "id": "port474",
        "name": "Port of Hong Kong",
        "lat": 22.300, "lng": 114.160,
        "coast": "international", "region": "east_asia",
        "infrastructure_quality": 0.94,
        "customs_hours": 4.0, "piracy_risk": 0.01,
        "base_congestion": 0.44, "base_security_risk": 0.11,
        "import_share": 100.0, "vessel_count_total": 16306,
        "locode": "HK HKG",
    },
    {
        "id": "port1065",
        "name": "Port of Busan, South Korea",
        "lat": 35.096, "lng": 129.040,
        "coast": "international", "region": "east_asia",
        "infrastructure_quality": 0.95,
        "customs_hours": 5.0, "piracy_risk": 0.01,
        "base_congestion": 0.46, "base_security_risk": 0.10,
        "import_share": 17.35, "vessel_count_total": 19994,
        "locode": "KR PUS",
    },
    {
        "id": "port485",
        "name": "Port of Tokyo, Japan",
        "lat": 35.630, "lng": 139.780,
        "coast": "international", "region": "east_asia",
        "infrastructure_quality": 0.93,
        "customs_hours": 5.0, "piracy_risk": 0.01,
        "base_congestion": 0.43, "base_security_risk": 0.10,
        "import_share": 12.0, "vessel_count_total": 4800,
        "locode": "JP TYO",
    },
    # ── Europe ──────────────────────────────────────────────────────────────
    {
        "id": "port1114",
        "name": "Port of Rotterdam, Netherlands",
        "lat": 51.924, "lng": 4.477,
        "coast": "international", "region": "europe",
        "infrastructure_quality": 0.98,
        "customs_hours": 4.0, "piracy_risk": 0.00,
        "base_congestion": 0.42, "base_security_risk": 0.07,
        "import_share": 76.05, "vessel_count_total": 32584,
        "locode": "NL RTM",
    },
    {
        "id": "port57",
        "name": "Port of Antwerp-Bruges, Belgium",
        "lat": 51.219, "lng": 4.402,
        "coast": "international", "region": "europe",
        "infrastructure_quality": 0.95,
        "customs_hours": 5.0, "piracy_risk": 0.00,
        "base_congestion": 0.40, "base_security_risk": 0.07,
        "import_share": 83.64, "vessel_count_total": 22760,
        "locode": "BE ANR",
    },
    {
        "id": "port446",
        "name": "Port of Hamburg, Germany",
        "lat": 53.551, "lng": 9.993,
        "coast": "international", "region": "europe",
        "infrastructure_quality": 0.93,
        "customs_hours": 5.0, "piracy_risk": 0.00,
        "base_congestion": 0.44, "base_security_risk": 0.08,
        "import_share": 46.26, "vessel_count_total": 6740,
        "locode": "DE HAM",
    },
    {
        "id": "port504",
        "name": "Port of Istanbul (Ambarli), Türkiye",
        "lat": 41.020, "lng": 28.660,
        "coast": "international", "region": "europe",
        "infrastructure_quality": 0.87,
        "customs_hours": 7.0, "piracy_risk": 0.01,
        "base_congestion": 0.45, "base_security_risk": 0.12,
        "import_share": 6.17, "vessel_count_total": 9107,
        "locode": "TR IST",
    },
    # ── Africa ──────────────────────────────────────────────────────────────
    {
        "id": "port311",
        "name": "Port of Durban, South Africa",
        "lat": -29.870, "lng": 31.040,
        "coast": "international", "region": "africa",
        "infrastructure_quality": 0.83,
        "customs_hours": 9.0, "piracy_risk": 0.03,
        "base_congestion": 0.50, "base_security_risk": 0.18,
        "import_share": 66.27, "vessel_count_total": 2506,
        "locode": "ZA DUR",
    },
    {
        "id": "port1265",
        "name": "Tanger Med, Morocco",
        "lat": 35.890, "lng": -5.500,
        "coast": "international", "region": "africa",
        "infrastructure_quality": 0.90,
        "customs_hours": 7.0, "piracy_risk": 0.01,
        "base_congestion": 0.40, "base_security_risk": 0.11,
        "import_share": 54.33, "vessel_count_total": 4177,
        "locode": "MA TNG",
    },
    # ── Americas ─────────────────────────────────────────────────────────────
    {
        "id": "port481",
        "name": "Port of Houston, United States",
        "lat": 29.749, "lng": -95.208,
        "coast": "international", "region": "north_america",
        "infrastructure_quality": 0.90,
        "customs_hours": 6.0, "piracy_risk": 0.01,
        "base_congestion": 0.44, "base_security_risk": 0.10,
        "import_share": 8.21, "vessel_count_total": 7358,
        "locode": "US HOU",
    },
    {
        "id": "port1160",
        "name": "Port of Santos, Brazil",
        "lat": -23.970, "lng": -46.320,
        "coast": "international", "region": "south_america",
        "infrastructure_quality": 0.84,
        "customs_hours": 9.0, "piracy_risk": 0.03,
        "base_congestion": 0.46, "base_security_risk": 0.16,
        "import_share": 13.47, "vessel_count_total": 5258,
        "locode": "BR STS",
    },
]

# ── Chokepoints — all 28 from PortWatch ──────────────────────────────────────
CHOKEPOINTS = {
    "chokepoint1":  {"name": "Suez Canal",           "lat": 30.593, "lng": 32.437,  "vessel_count_total": 19787},
    "chokepoint2":  {"name": "Panama Canal",          "lat":  9.121, "lng": -79.767, "vessel_count_total": 11020},
    "chokepoint3":  {"name": "Bosporus Strait",       "lat": 41.169, "lng": 29.092,  "vessel_count_total": 35125},
    "chokepoint4":  {"name": "Bab el-Mandeb Strait",  "lat": 12.789, "lng": 43.350,  "vessel_count_total": 19306},
    "chokepoint5":  {"name": "Malacca Strait",        "lat":  1.517, "lng": 102.665, "vessel_count_total": 71451},
    "chokepoint6":  {"name": "Strait of Hormuz",      "lat": 26.297, "lng": 56.860,  "vessel_count_total": 32496},
    "chokepoint7":  {"name": "Cape of Good Hope",     "lat": -34.927,"lng": 20.883,  "vessel_count_total": 21531},
    "chokepoint8":  {"name": "Gibraltar Strait",      "lat": 35.942, "lng": -5.755,  "vessel_count_total": 47801},
    "chokepoint9":  {"name": "Dover Strait",          "lat": 51.030, "lng":  1.506,  "vessel_count_total": 60580},
    "chokepoint10": {"name": "Oresund Strait",        "lat": 55.508, "lng": 12.851,  "vessel_count_total": 17833},
    "chokepoint11": {"name": "Taiwan Strait",         "lat": 24.724, "lng": 119.831, "vessel_count_total": 88436},
    "chokepoint12": {"name": "Korea Strait",          "lat": 34.131, "lng": 129.209, "vessel_count_total": 82119},
    "chokepoint13": {"name": "Tsugaru Strait",        "lat": 41.328, "lng": 140.353, "vessel_count_total": 16440},
    "chokepoint14": {"name": "Luzon Strait",          "lat": 20.489, "lng": 121.352, "vessel_count_total": 25748},
    "chokepoint15": {"name": "Lombok Strait",         "lat": -8.419, "lng": 115.801, "vessel_count_total": 12918},
    "chokepoint16": {"name": "Ombai Strait",          "lat": -8.399, "lng": 125.091, "vessel_count_total":  4084},
    "chokepoint17": {"name": "Bohai Strait",          "lat": 38.373, "lng": 120.900, "vessel_count_total": 64100},
    "chokepoint18": {"name": "Torres Strait",         "lat": -9.863, "lng": 142.248, "vessel_count_total":  3308},
    "chokepoint19": {"name": "Sunda Strait",          "lat": -5.967, "lng": 105.775, "vessel_count_total": 10393},
    "chokepoint20": {"name": "Makassar Strait",       "lat":  0.352, "lng": 119.257, "vessel_count_total": 19117},
    "chokepoint25": {"name": "Balabac Strait",        "lat":  7.414, "lng": 117.115, "vessel_count_total":  3794},
    "chokepoint26": {"name": "Bering Strait",         "lat": 65.966, "lng":-165.550, "vessel_count_total":   294},
    "chokepoint27": {"name": "Mindoro Strait",        "lat": 12.468, "lng": 120.403, "vessel_count_total": 16493},
    "chokepoint28": {"name": "Kerch Strait",          "lat": 45.267, "lng": 36.544,  "vessel_count_total": 10390},
}

# ── Sea lanes adjacency ───────────────────────────────────────────────────────
# Expanded to cover new ports from PortWatch dataset.
# Format: port_id → [connected_port_ids]
SEA_LANES: dict[str, list[str]] = {
    # ── India West Coast chain ──────────────────────────────────────────────
    "port540":   ["port777", "port776"],                          # Kandla
    "port777":   ["port540", "port776", "port411", "port2039",    # Mundra
                  "port1199"],
    "port2039":  ["port777", "port271", "port907"],               # Hazira
    "port271":   ["port2039", "port907"],                         # Dahej
    "port907":   ["port271", "port776", "port511"],               # Pipavav
    "port776":   ["port777", "port540", "port907", "port511",     # JNPT
                  "port709", "port411"],
    "port511":   ["port776", "port709"],                          # Jaigad
    "port709":   ["port776", "port511", "port811"],               # Mormugao
    "port811":   ["port709", "port583"],                          # New Mangalore
    "port583":   ["port811", "port1331", "port235", "colombo",    # Kochi
                  "port1201"],
    "port1199":  ["port777", "port540"],                          # Sikka/Vadinar

    # ── India East Coast chain ──────────────────────────────────────────────
    "port1331":  ["port583", "port235"],                          # Tuticorin
    "port235":   ["port1331", "port534", "port583", "port1367",   # Chennai
                  "port2038", "port599", "colombo", "port1201"],
    "port2038":  ["port235", "port534", "port599"],               # Kattupalli
    "port534":   ["port235", "port2038", "port599"],              # Kamarajar
    "port599":   ["port534", "port235", "port529", "port1367"],   # Krishnapatnam
    "port529":   ["port599", "port1367"],                         # Kakinada
    "port1367":  ["port529", "port599", "port883", "port1201"],   # Vizag
    "port883":   ["port1367", "port290", "port442"],              # Paradip
    "port290":   ["port883", "port442"],                          # Dhamra
    "port442":   ["port290", "port883", "port207", "port1201"],   # Haldia
    "port207":   ["port442", "port1201"],                         # Kolkata

    # ── Sri Lanka ───────────────────────────────────────────────────────────
    "colombo":   ["port583", "port235", "port1201", "port648"],   # Colombo

    # ── Middle East ─────────────────────────────────────────────────────────
    "port411":   ["port777", "port776", "port1161", "port566",    # Jebel Ali
                  "port909"],
    "port566":   ["port411", "port1161", "port909"],              # Jeddah
    "port1161":  ["port411", "port566"],                          # Salalah
    "port909":   ["port566", "port23", "port1114", "port57",      # Port Said
                  "port446"],
    "port23":    ["port909"],                                      # Alexandria

    # ── Southeast Asia ──────────────────────────────────────────────────────
    "port1201":  ["port583", "port235", "port442", "port207",     # Singapore
                  "port648", "port1074", "port572", "port171",
                  "port568", "port1188", "port474", "port824"],
    "port648":   ["port1201", "port1074", "colombo"],             # Port Klang
    "port1074":  ["port648", "port1201"],                         # Tanjung Pelepas
    "port572":   ["port1201", "port171"],                         # Laem Chabang
    "port171":   ["port572", "port568", "port474", "port1188"],   # Ho Chi Minh
    "port568":   ["port1201", "port171"],                         # Jakarta

    # ── East Asia ───────────────────────────────────────────────────────────
    "port1188":  ["port1201", "port824", "port474", "port171",    # Shanghai
                  "port1065"],
    "port824":   ["port1201", "port1188", "port474"],             # Ningbo
    "port474":   ["port1201", "port1188", "port824", "port171",   # Hong Kong
                  "port1065"],
    "port1065":  ["port474", "port1188", "port485"],              # Busan
    "port485":   ["port1065"],                                     # Tokyo

    # ── Europe ──────────────────────────────────────────────────────────────
    "port1114":  ["port909", "port57", "port446", "port1265"],    # Rotterdam
    "port57":    ["port1114", "port909", "port446"],              # Antwerp
    "port446":   ["port1114", "port57", "port909"],               # Hamburg
    "port504":   ["port909", "port23"],                           # Istanbul

    # ── Africa ──────────────────────────────────────────────────────────────
    "port311":   ["port1265", "port1201"],                        # Durban
    "port1265":  ["port909", "port1114", "port311"],              # Tanger Med

    # ── Americas ─────────────────────────────────────────────────────────────
    "port481":   ["port1160"],                                     # Houston
    "port1160":  ["port481"],                                      # Santos
}

# ── Chokepoint transit map ────────────────────────────────────────────────────
# Maps (origin_port_id, dest_port_id) pairs to list of chokepoints transited.
# Used by route_generator to annotate paths and by engineer.py for risk.
ROUTE_CHOKEPOINTS: dict[tuple[str, str], list[str]] = {
    # ── India ↔ Middle East (Strait of Hormuz) ────────────────────────────
    ("port776", "port411"):   ["chokepoint6"],   # JNPT → Jebel Ali
    ("port777", "port411"):   ["chokepoint6"],   # Mundra → Jebel Ali
    ("port540", "port411"):   ["chokepoint6"],   # Kandla → Jebel Ali
    ("port583", "port411"):   ["chokepoint6"],   # Kochi → Jebel Ali
    ("port1161", "port776"):  ["chokepoint6"],   # Salalah → JNPT
    ("port1161", "port777"):  ["chokepoint6"],   # Salalah → Mundra
    ("port411", "port776"):   ["chokepoint6"],
    ("port411", "port777"):   ["chokepoint6"],
    ("port411", "port540"):   ["chokepoint6"],

    # ── Middle East ↔ Europe (Bab-el-Mandeb + Suez Canal + Gibraltar) ────
    ("port411", "port909"):   ["chokepoint4", "chokepoint1"],
    ("port411", "port1114"):  ["chokepoint4", "chokepoint1", "chokepoint8"],
    ("port411", "port57"):    ["chokepoint4", "chokepoint1", "chokepoint8"],
    ("port411", "port446"):   ["chokepoint4", "chokepoint1", "chokepoint8"],
    ("port566", "port909"):   ["chokepoint4", "chokepoint1"],
    ("port566", "port1114"):  ["chokepoint4", "chokepoint1", "chokepoint8"],
    ("port1161", "port909"):  ["chokepoint4", "chokepoint1"],
    ("port1161", "port1114"): ["chokepoint4", "chokepoint1", "chokepoint8"],
    # Reverse
    ("port909", "port411"):   ["chokepoint1", "chokepoint4"],
    ("port1114", "port411"):  ["chokepoint8", "chokepoint1", "chokepoint4"],

    # ── India ↔ Europe (via Bab-el-Mandeb + Suez + Gibraltar) ────────────
    ("port776", "port1114"):  ["chokepoint6", "chokepoint4", "chokepoint1", "chokepoint8"],
    ("port777", "port1114"):  ["chokepoint6", "chokepoint4", "chokepoint1", "chokepoint8"],
    ("port235", "port1114"):  ["chokepoint5", "chokepoint4", "chokepoint1", "chokepoint8"],
    ("port583", "port1114"):  ["chokepoint4", "chokepoint1", "chokepoint8"],
    ("port1367", "port1114"): ["chokepoint5", "chokepoint4", "chokepoint1", "chokepoint8"],

    # ── India ↔ Singapore (Malacca Strait) ────────────────────────────────
    ("port583", "port1201"):  ["chokepoint5"],
    ("port235", "port1201"):  ["chokepoint5"],
    ("port1367", "port1201"): ["chokepoint5"],
    ("port442", "port1201"):  ["chokepoint5"],
    ("port207", "port1201"):  ["chokepoint5"],
    ("port1331", "port1201"): ["chokepoint5"],
    ("colombo", "port1201"):  ["chokepoint5"],
    # Reverse
    ("port1201", "port583"):  ["chokepoint5"],
    ("port1201", "port235"):  ["chokepoint5"],

    # ── Singapore ↔ East Asia (Taiwan Strait, Korea Strait) ──────────────
    ("port1201", "port1188"): ["chokepoint11"],
    ("port1201", "port824"):  ["chokepoint11"],
    ("port1201", "port474"):  ["chokepoint11"],
    ("port1201", "port1065"): ["chokepoint11", "chokepoint12"],
    ("port1201", "port485"):  ["chokepoint11", "chokepoint12"],
    ("port474", "port1065"):  ["chokepoint12"],
    ("port1188", "port1065"): ["chokepoint12"],
    # Reverse
    ("port1188", "port1201"): ["chokepoint11"],
    ("port474", "port1201"):  ["chokepoint11"],

    # ── Singapore ↔ India (full corridor) ────────────────────────────────
    ("port1201", "port583"):  ["chokepoint5"],
    ("port1201", "port235"):  ["chokepoint5"],

    # ── India ↔ East Asia (Malacca + Taiwan Strait) ───────────────────────
    ("port235", "port1188"):  ["chokepoint5", "chokepoint11"],
    ("port583", "port1188"):  ["chokepoint5", "chokepoint11"],
    ("port583", "port474"):   ["chokepoint5", "chokepoint11"],
    ("port235", "port474"):   ["chokepoint5", "chokepoint11"],
    ("port235", "port1065"):  ["chokepoint5", "chokepoint11", "chokepoint12"],

    # ── Cape of Good Hope (Durban corridor — avoids Suez) ─────────────────
    ("port311", "port1114"):  ["chokepoint7"],
    ("port311", "port57"):    ["chokepoint7"],
    ("port311", "port446"):   ["chokepoint7"],
    ("port311", "port1201"):  ["chokepoint7"],
    # Reverse
    ("port1114", "port311"):  ["chokepoint7"],
    ("port1201", "port311"):  ["chokepoint7"],

    # ── Europe ↔ Mediterranean (Gibraltar) ────────────────────────────────
    ("port909", "port1114"):  ["chokepoint8"],
    ("port909", "port57"):    ["chokepoint8"],
    ("port909", "port446"):   ["chokepoint8"],
    ("port23", "port1114"):   ["chokepoint8"],
    # Reverse
    ("port1114", "port909"):  ["chokepoint8"],
    ("port57", "port909"):    ["chokepoint8"],
    ("port446", "port909"):   ["chokepoint8"],

    # ── Tanger Med (Gibraltar) ────────────────────────────────────────────
    ("port1265", "port909"):  ["chokepoint8"],
    ("port1265", "port1114"): ["chokepoint8"],

    # ── Rotterdam ↔ Americas (no chokepoint — open Atlantic) ─────────────
    # ("port1114", "port481"):  [],   # Rotterdam → Houston (open Atlantic)
    # ("port1114", "port1160"): [],   # Rotterdam → Santos

    # ── Singapore ↔ Indonesia (Sunda / Lombok) ───────────────────────────
    ("port1201", "port568"):  ["chokepoint5"],
    ("port568", "port1188"):  ["chokepoint15"],
    ("port568", "port474"):   ["chokepoint15"],

    # ── Bosporus (Istanbul / Black Sea routes) ────────────────────────────
    ("port504", "port909"):   ["chokepoint3"],
    ("port504", "port1114"):  ["chokepoint3", "chokepoint8"],
    ("port909", "port504"):   ["chokepoint3"],

    # ── Panama Canal (Americas ↔ Pacific) ─────────────────────────────────
    ("port481", "port1201"):  ["chokepoint2"],
    ("port481", "port1188"):  ["chokepoint2", "chokepoint11"],
    # Reverse
    ("port1201", "port481"):  ["chokepoint2"],
}
