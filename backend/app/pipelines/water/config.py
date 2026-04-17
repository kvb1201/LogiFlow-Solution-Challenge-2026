from __future__ import annotations

# Major India ports (lightweight, heuristic-first).
# Coordinates are approximate and only used for distance estimation.

PORTS = [
    # West coast
    {
        "id": "mundra",
        "name": "Mundra Port, Gujarat, India",
        "lat": 22.839,
        "lng": 69.721,
        "coast": "west",
        "base_congestion": 0.45,
        "base_security_risk": 0.18,
    },
    {
        "id": "kandla",
        "name": "Deendayal Port (Kandla), Gujarat, India",
        "lat": 23.033,
        "lng": 70.217,
        "coast": "west",
        "base_congestion": 0.40,
        "base_security_risk": 0.16,
    },
    {
        "id": "jnpt",
        "name": "Jawaharlal Nehru Port (JNPT), Navi Mumbai, India",
        "lat": 18.950,
        "lng": 72.950,
        "coast": "west",
        "base_congestion": 0.55,
        "base_security_risk": 0.20,
    },
    {
        "id": "mumbai",
        "name": "Mumbai Port, Maharashtra, India",
        "lat": 18.944,
        "lng": 72.839,
        "coast": "west",
        "base_congestion": 0.55,
        "base_security_risk": 0.22,
    },
    {
        "id": "mormugao",
        "name": "Mormugao Port, Goa, India",
        "lat": 15.405,
        "lng": 73.799,
        "coast": "west",
        "base_congestion": 0.30,
        "base_security_risk": 0.18,
    },
    {
        "id": "new_mangalore",
        "name": "New Mangalore Port, Karnataka, India",
        "lat": 12.914,
        "lng": 74.807,
        "coast": "west",
        "base_congestion": 0.35,
        "base_security_risk": 0.17,
    },
    {
        "id": "kochi",
        "name": "Cochin Port (Kochi), Kerala, India",
        "lat": 9.967,
        "lng": 76.270,
        "coast": "west",
        "base_congestion": 0.38,
        "base_security_risk": 0.16,
    },
    # East coast
    {
        "id": "tuticorin",
        "name": "V.O. Chidambaranar Port (Thoothukudi), Tamil Nadu, India",
        "lat": 8.764,
        "lng": 78.180,
        "coast": "east",
        "base_congestion": 0.33,
        "base_security_risk": 0.17,
    },
    {
        "id": "chennai",
        "name": "Chennai Port, Tamil Nadu, India",
        "lat": 13.095,
        "lng": 80.292,
        "coast": "east",
        "base_congestion": 0.48,
        "base_security_risk": 0.18,
    },
    {
        "id": "kamarajar",
        "name": "Kamarajar Port (Ennore), Tamil Nadu, India",
        "lat": 13.235,
        "lng": 80.333,
        "coast": "east",
        "base_congestion": 0.42,
        "base_security_risk": 0.17,
    },
    {
        "id": "vizag",
        "name": "Visakhapatnam Port, Andhra Pradesh, India",
        "lat": 17.689,
        "lng": 83.281,
        "coast": "east",
        "base_congestion": 0.46,
        "base_security_risk": 0.18,
    },
    {
        "id": "paradip",
        "name": "Paradip Port, Odisha, India",
        "lat": 20.265,
        "lng": 86.691,
        "coast": "east",
        "base_congestion": 0.44,
        "base_security_risk": 0.18,
    },
    {
        "id": "kolkata_haldia",
        "name": "Kolkata Port (Haldia Dock Complex), West Bengal, India",
        "lat": 22.021,
        "lng": 88.059,
        "coast": "east",
        "base_congestion": 0.50,
        "base_security_risk": 0.19,
    },
]

# Adjacency list describing realistic coastal connectivity.
# This is intentionally sparse; routing uses these edges for multi-leg paths.
SEA_LANES = {
    # West coast chain
    "kandla": ["mundra", "jnpt"],
    "mundra": ["kandla", "jnpt"],
    "mumbai": ["jnpt", "mormugao"],
    "jnpt": ["mundra", "kandla", "mumbai", "mormugao"],
    "mormugao": ["jnpt", "mumbai", "new_mangalore"],
    "new_mangalore": ["mormugao", "kochi"],
    "kochi": ["new_mangalore", "tuticorin", "chennai"],
    # East coast chain
    "tuticorin": ["kochi", "chennai"],
    "chennai": ["tuticorin", "kamarajar", "kochi", "vizag"],
    "kamarajar": ["chennai", "vizag"],
    "vizag": ["kamarajar", "chennai", "paradip"],
    "paradip": ["vizag", "kolkata_haldia"],
    "kolkata_haldia": ["paradip"],
}


# --- Heuristic constants (units: hours, INR, nautical miles) ---

# Sea travel
VESSEL_SPEED_KNOTS = 16.0  # nm/hour
PORT_HANDLING_HOURS = 6.0  # load/unload at each port call
TRANSSHIPMENT_EXTRA_HOURS = 10.0  # additional handling at intermediate port

# Road legs (city->port / port->city)
TRUCK_SPEED_KMPH = 45.0

# Cost model
SEA_COST_BASE_PER_KG_INR = 1.2
SEA_COST_PER_KG_PER_NM_INR = 0.015
PORT_FEE_BASE_INR = 800.0
TRANSSHIPMENT_FEE_INR = 1200.0
ROAD_COST_PER_KM_PER_TON_INR = 10.0
ROAD_HANDLING_BASE_INR = 300.0

# Risk weights (combined and clamped into 0..1)
RISK_WEIGHTS = {
    "weather": 0.30,
    "congestion": 0.30,
    "security": 0.25,
    "transshipment": 0.15,
}

