CITY_TO_AIRPORT = {
    "Delhi": {"code": "DEL", "name": "Indira Gandhi International Airport"},
    "Mumbai": {"code": "BOM", "name": "Chhatrapati Shivaji Maharaj International Airport"},
    "Bengaluru": {"code": "BLR", "name": "Kempegowda International Airport"},
    "Bangalore": {"code": "BLR", "name": "Kempegowda International Airport"},
    "Chennai": {"code": "MAA", "name": "Chennai International Airport"},
    "Hyderabad": {"code": "HYD", "name": "Rajiv Gandhi International Airport"},
    "Kolkata": {"code": "CCU", "name": "Netaji Subhas Chandra Bose International Airport"},
    "Tirupati": {"code": "TIR", "name": "Tirupati Airport"},
}

CITY_ALIASES = {
    "bangalore": "Bengaluru",
    "bengaluru": "Bengaluru",
    "bombay": "Mumbai",
    "calcutta": "Kolkata",
    "madras": "Chennai",
    "tirupati": "Tirupati",
    "delhi": "Delhi",
    "mumbai": "Mumbai",
    "hyderabad": "Hyderabad",
    "kolkata": "Kolkata",
}

AIRLINE_RELIABILITY = {
    "IndiGo": 0.88,
    "Air India": 0.76,
    "Akasa Air": 0.82,
    "SpiceJet": 0.68,
}

MOCK_ROUTES = {
    ("Delhi", "Mumbai"): [
        {
            "airline": "IndiGo",
            "stops": 0,
            "distance": 1150,
            "duration": 2.0,
            "delay_risk": 0.18,
            "cost_per_kg": 8.0,
            "cargo_types": ["general", "fragile", "perishable"],
        },
        {
            "airline": "Air India",
            "stops": 1,
            "distance": 1300,
            "duration": 3.1,
            "delay_risk": 0.32,
            "cost_per_kg": 6.2,
            "cargo_types": ["general", "fragile"],
        },
        {
            "airline": "Akasa Air",
            "stops": 0,
            "distance": 1180,
            "duration": 2.4,
            "delay_risk": 0.22,
            "cost_per_kg": 7.3,
            "cargo_types": ["general", "fragile"],
        },
    ],
}
