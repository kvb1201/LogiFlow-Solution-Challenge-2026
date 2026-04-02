"""
Configuration constants for the Railway Cargo Decision Engine.
Indian Railways parcel tariffs, station codes, cargo constraints, and risk factors.
"""

# ── Parcel rates (Indian Railways official tariff, approx) ─────────────
# Slab-based formula: (rate_per_km × distance_km / 100) + (per_kg_charge × weight_kg)
# Calibrated to real IR parcel rates: 300kg Mumbai→Delhi (~1384km) ≈ ₹8,000-12,000
PARCEL_RATE_TIERS = [
    {"max_kg": 50,   "rate_per_km_paise": 150, "per_kg_charge": 40.0, "min_charge_rs": 100},
    {"max_kg": 100,  "rate_per_km_paise": 120, "per_kg_charge": 35.0, "min_charge_rs": 250},
    {"max_kg": 500,  "rate_per_km_paise": 100, "per_kg_charge": 25.0, "min_charge_rs": 500},
    {"max_kg": 9999, "rate_per_km_paise": 80,  "per_kg_charge": 18.0, "min_charge_rs": 1000},
]

# ── City name → primary station code mapping ──────────────────────────
CITY_TO_STATION = {
    "Mumbai":      ["CSMT", "LTT", "BDTS", "BCT", "DR"],
    "Delhi":       ["NDLS", "DLI", "ANVT", "DSJ"],
    "Bengaluru":   ["SBC", "YPR", "BNCE"],
    "Chennai":     ["MAS", "MS"],
    "Kolkata":     ["HWH", "KOAA", "SRC"],
    "Hyderabad":   ["SC", "HYB"],
    "Ahmedabad":   ["ADI"],
    "Pune":        ["PUNE"],
    "Jaipur":      ["JP"],
    "Lucknow":     ["LKO"],
    "Nagpur":      ["NGP"],
    "Surat":       ["ST"],
    "Kochi":       ["ERS", "ERN"],
    "Patna":       ["PNBE", "RJPB"],
    "Bhopal":      ["BPL"],
    "Kanpur":      ["CNB"],
    "Varanasi":    ["BSB"],
    "Agra":        ["AGC"],
    "Visakhapatnam": ["VSKP"],
    "Vijayawada":  ["BZA"],
    "Madurai":     ["MDU"],
    "Coimbatore":  ["CBE"],
    "Guwahati":    ["GHY", "KYQ"],
    "Bhubaneswar": ["BBS"],
    "Indore":      ["INDB"],
    "Vadodara":    ["BRC"],
    "Jhansi":      ["JHS"],
    "Allahabad":   ["ALD"],
    "Raipur":      ["R"],
    "Ranchi":      ["RNC"],
    "Itarsi":      ["ET"],
    "Bhusaval":    ["BSL"],
    "Howrah":      ["HWH"],
    "Secunderabad": ["SC"],
    "Trivandrum":  ["TVC"],
    "Mangalore":   ["MAJN"],
    "Goa":         ["MAO", "KRMI"],
    "Jabalpur":    ["JBP"],
    "Gwalior":     ["GWL"],
    "Amritsar":    ["ASR"],
    "Jammu":       ["JAT"],
    "Dehradun":    ["DDN"],
    "Gorakhpur":   ["GKP"],
    "Bilaspur":    ["BSP"],
    "Ratnagiri":   ["RN"],
    "Panvel":      ["PNVL"],
    "Kalyan":      ["KYN"],
    "Thane":       ["TNA"],
    "Lonavla":     ["LNL"],
    "Nasik":       ["NK"],
    "Rajkot":      ["RJT"],
    "Jodhpur":     ["JU"],
    "Udaipur":     ["UDZ"],
    "Ajmer":       ["AII"],
    "Kota":        ["KOTA"],
    "Ujjain":      ["UJN"],
    "Ratlam":      ["RTM"],
    "Mathura":     ["MTJ"],
    "Meerut":      ["MTC"],
    "Ambala":      ["UMB"],
    "Ludhiana":    ["LDH"],
    "Jalandhar":   ["JUC", "JRC"],
    "Pathankot":   ["PTKC"],
    "Roorkee":     ["RK"],
    "Haridwar":    ["HW"],
    "Bareilly":    ["BE"],
    "Moradabad":   ["MB"],
    "Dhanbad":     ["DHN"],
    "Tatanagar":   ["TATA"],
    "Kharagpur":   ["KGP"],
    "Cuttack":     ["CTC"],
    "Sambalpur":   ["SBP"],
    "Jharsuguda":  ["JSG"],
    "Rourkela":    ["ROU"],
    "Salem":       ["SA"],
    "Erode":       ["ED"],
    "Tiruppur":    ["TUP"],
    "Tiruchirappalli": ["TPJ"],
    "Nagercoil":   ["NCJ"],
    "Kanyakumari": ["CAPE"],
    "Warangal":    ["WL"],
    "Nanded":      ["NED"],
    "Aurangabad":  ["AWB"],
    "Solapur":     ["SUR"],
    "Wardha":      ["WR"],
    "Gondia":      ["G"],
    "Durg":        ["DURG"],
    "Katni":       ["KTE"],
    "Satna":       ["STA"],
}

# Build reverse lookup: station_code → city_name
STATION_TO_CITY = {}
for city, codes in CITY_TO_STATION.items():
    for code in codes:
        STATION_TO_CITY[code] = city

# ── Cargo types and their constraints ──────────────────────────────────
CARGO_CONSTRAINTS = {
    "General":    {"max_kg_per_booking": 500, "fragile": False},
    "Perishable": {"max_kg_per_booking": 200, "fragile": True,
                   "notes": "Cold storage not guaranteed in SLR"},
    "Fragile":    {"max_kg_per_booking": 100, "fragile": True},
    "Hazardous":  {"max_kg_per_booking": 0,
                   "notes": "NOT allowed in passenger parcel vans"},
    "Electronics": {"max_kg_per_booking": 200, "fragile": True,
                    "notes": "Recommend VPU coach for better protection"},
    "Textiles":   {"max_kg_per_booking": 500, "fragile": False},
    "Auto Parts": {"max_kg_per_booking": 300, "fragile": False},
    "Pharmaceuticals": {"max_kg_per_booking": 150, "fragile": True,
                        "notes": "Temperature-sensitive cargo"},
}

# ── Transit risk multipliers ───────────────────────────────────────────
RISK_MULTIPLIERS = {
    "monsoon_months": [6, 7, 8, 9],
    "monsoon_delay_factor": 2.5,
    "fog_months": [12, 1, 2],
    "fog_delay_factor": 1.6,
    "festival_months": [10, 11],
    "festival_delay_factor": 1.8,
}

# ── Known junction stations (higher connectivity = better for transfers) ──
MAJOR_JUNCTIONS = {
    "NDLS", "DLI", "CSMT", "HWH", "MAS", "SBC", "SC", "BPL", "NGP",
    "ADI", "JP", "LKO", "CNB", "BSL", "ET", "JHS", "BSP", "BRC",
    "MGS", "PNBE", "GHY", "BBS", "PUNE", "ST", "KGP", "DURG", "R",
    "KTE", "ROU", "JSG", "BZA", "VSKP", "AK", "MMR", "DD", "RTM",
    "UMB", "LDH", "JUC", "ASR", "AGC", "GWL", "MTJ", "SRC", "TATA",
}

# ── Speed categories for trains (km/h estimates for scheduling) ────────
TRAIN_SPEED_CATEGORIES = {
    "rajdhani": 85,   # Rajdhani Express class
    "shatabdi": 90,   # Shatabdi Express class
    "duronto":  80,   # Duronto Express
    "superfast": 65,  # Superfast Express
    "express":  50,   # Regular Express/Mail
    "passenger": 35,  # Passenger trains
    "default":  45,   # Fallback
}
