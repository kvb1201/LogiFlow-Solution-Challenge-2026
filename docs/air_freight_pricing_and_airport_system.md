# Air Freight Pricing and Airport System

## 1. Current Problems Identified

### Why pricing was incorrect
The original pipeline calculated cost using a flat rate per kg (`8.0` for direct, `6.5` for one-stop) and ignored the distance traveled. This resulted in almost identical pricing regardless of whether the route was a short domestic flight (BLR → DEL) or a long-haul international flight (BLR → JFK). The pricing engine was also missing volumetric weight support and dynamic operational surcharges.

### Why international searches failed
The system relied solely on the `airports.csv` dataset, which was heavily skewed towards Indian airports. When searching for international hubs like `JFK` or `LHR`, the `airport_locator_service` failed to find them in the dataset. It then fell back to geocoding the city names. However, the `geocoder` explicitly appended `, India` to all queries, forcing global cities to resolve to the nearest Indian coordinates, mapping international airports to random domestic locations. Additionally, the `corridor_endpoints` logic from the rail pipeline was erroneously being applied to air freight, causing IATA codes to fuzzy-match against railway stations instead of airports.

---

## 2. Airport Data Architecture

### Data Sources
- **`airports.csv`**: Retained for comprehensive domestic coverage.
- **`international_airports.csv`**: A new dataset integrated to provide coordinates and metadata for major global hubs.

### Merge and Deduplication Strategy
Both datasets are loaded sequentially in `_load_ourairports()`. The integration maps the differing column names (`latitude` vs `latitude_deg`) into a unified schema:
- `iata_code`, `name`, `municipality`, `country`, `lat`, `lng`, `timezone`

Deduplication occurs by enforcing a unique `IATA` code constraint via a dictionary map (`airports_map`). If an IATA code is loaded from the first dataset, it is preserved, and duplicate entries in the second dataset are skipped.

### Lookup Flow
1. **Direct IATA Match**: `resolve_city_to_airport` checks if the input is a 3-letter code and looks it up in the merged dataset.
2. **Canonical Mapping**: If it's a city name, it checks the static `CITY_TO_AIRPORT` overrides.
3. **Nearest Airport Fallback**: Uses the coordinate-based distance search (`find_nearest_airport_for_city`).
4. **Bypass Rail Logic**: Removed the `corridor_endpoints` wrapper from the Air Pipeline's `generate()` method to prevent erroneous matching with Indian railway stations.

---

## 3. Distance Calculation

Distance is dynamically computed using the Haversine formula based on the exact coordinates of the source and destination airports. 

**Formula:**
```python
def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_km * c
```

**Example Output:**
- BLR → DEL: ~1709 km
- BLR → JFK: ~13366 km

---

## 4. Volumetric Weight Logic

To align with airline industry standards, shipping costs are charged based on whichever is greater: the actual weight or the volumetric weight. 

**Formula:**
```python
volumetric_weight = (length_cm * width_cm * height_cm) / 6000.0
chargeable_weight = max(actual_weight, volumetric_weight)
```

**Example:**
For a 50kg package measuring 120cm x 80cm x 60cm:
- Actual Weight: 50kg
- Volumetric Weight: (120 * 80 * 60) / 6000 = 96kg
- **Chargeable Weight**: 96kg

---

## 5. Pricing Engine

The new pricing engine categorizes routes into Domestic and International, applying distinct rates based on the `chargeable_weight` and `distance_km`.

### Domestic Route
**Parameters:**
- Base Charge: ₹500
- Distance Rate: ₹0.80 per km
- Weight Rate: ₹25.0 per kg
- Airport Handling Fee: ₹500
- Fuel Surcharge Rate: ₹0.15 per km

### International Route
**Parameters:**
- Base Charge: ₹2500
- Distance Rate: ₹2.50 per km
- Weight Rate: ₹60.0 per kg
- Airport Handling Fee: ₹2500
- Fuel Surcharge Rate: ₹0.40 per km

**Fuel Surcharge Model:**
Fuel surcharge scales linearly with distance (`distance_km * fuel_rate_per_km`), naturally making longer flights more expensive.

---

## 6. Dynamic Pricing (Operational Factors)

The pipeline dynamically adjusts the cost based on operational intelligence parameters fetched during route generation.

**Multipliers:**
- **Weather Risk (`weatherRisk`)**: Up to +10% 
- **Congestion Score (`congestionScore`)**: Up to +15%
- **OTP Score (Reliability)**: Up to +10% penalty for low reliability.

**Application:**
```python
cost_multiplier = 1.0 + (weather_risk * 0.10) + (congestion_score * 0.15) + ((1.0 - otp_score) * 0.10)
cost_multiplier = max(1.0, min(cost_multiplier, 1.5)) # Clamped between 1.0 and 1.5
final_cost = adjusted_cost * cost_multiplier
```

---

## 7. Cost Breakdown Example

### Domestic Example (BLR → DEL)
- **Distance**: 1709 km
- **Chargeable Weight**: 96 kg
- **Base Cost**: ₹500 + (1709 * 0.8) + (96 * 25) = ₹4267.20
- **Fuel Surcharge**: 1709 * 0.15 = ₹256.35
- **Handling**: ₹500
- **Final Adjusted Cost** (with multipliers): ~₹5307.38

### International Example (BLR → JFK)
- **Distance**: 13366 km
- **Chargeable Weight**: 96 kg
- **Base Cost**: ₹2500 + (13366 * 2.5) + (96 * 60) = ₹41675.00
- **Fuel Surcharge**: 13366 * 0.40 = ₹5346.40
- **Handling**: ₹2500
- **Final Adjusted Cost** (with multipliers): ~₹52402.56

---

## 8. Validation Results

The automated validation suite (`scripts/validate_air_freight.py`) successfully tested both domestic and international scenarios.

**Test Outputs:**
```
Testing BLR -> DEL
Airport Lookup: Success (Source: BLR, Dest: DEL)
Distance: 1709.0 km
Cost: 5307.38 INR
Route Type: Domestic

Testing BLR -> FRA
Airport Lookup: Success (Source: BLR, Dest: FRA)
Distance: 7400.0 km
Cost: 34201.53 INR
Route Type: International

Testing BLR -> JFK
Airport Lookup: Success (Source: BLR, Dest: JFK)
Distance: 13366.0 km
Cost: 52402.56 INR
Route Type: International
```

**Checks Passed:**
1. All lookups succeeded: PASS
2. Valid distances: PASS
3. Unique distances per route: PASS
4. Unique costs per route: PASS
5. International costs > Domestic costs: PASS
6. Fuel surcharge scales with distance: PASS
7. Volumetric pricing (120x80x60 = 96kg): PASS
8. No international city mapped to India: PASS
9. Route classification correct: PASS

---

## 9. Future Improvements

- **Real Airline APIs**: Integrate with live carrier endpoints (e.g., Emirates SkyCargo API, Lufthansa Cargo) for real-time spot pricing.
- **Live Fuel Prices**: Replace static fuel rates with a live commodity index feed (e.g., Platts Jet Fuel Index).
- **Historical Demand Forecasting**: Incorporate seasonal modifiers to surge pricing during peak logistical windows (e.g., Q4 holidays).
- **ML-based Pricing Models**: Train machine learning regressors on historical awb pricing datalakes to infer dynamic elastic pricing parameters.
- **Capacity-aware Pricing**: Increase costs dynamically when specific wide-body belly capacities dwindle on certain congested corridors.
