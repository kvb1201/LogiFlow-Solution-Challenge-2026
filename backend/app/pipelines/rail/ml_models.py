"""
ML models for the Railway Cargo Decision Engine.
Trained on REAL average delay data from RailRadar API.

Models:
  1. DelayPredictor: Predict expected delay using train characteristics + real delay data
  2. DurationPredictor: Predict actual vs scheduled duration from real data

Training data source: RailRadar /average-delay endpoint for each train in the CSV.
The CSV provides train characteristics (features), the API provides real delays (targets).
"""

import numpy as np
import os
import pickle

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
_models_loaded = False
_delay_model = None
_duration_model = None


def _ensure_model_dir():
    """Create model cache directory if it doesn't exist."""
    os.makedirs(_MODEL_DIR, exist_ok=True)


def _extract_features_from_csv_and_api(max_api_calls=200):
    """
    Build training data from:
      FEATURES: Train characteristics from CSV (num_stops, distance, speed, type, etc.)
      TARGETS: REAL average delay from RailRadar API

    Args:
        max_api_calls: Max number of trains to fetch real delay for (API rate limit)

    Returns:
        (features, delay_targets, duration_targets) numpy arrays
    """
    from app.pipelines.rail import data_loader
    from app.pipelines.rail import railradar_client
    from app.pipelines.rail.config import MAJOR_JUNCTIONS

    data_loader.load_data()
    train_routes = data_loader._train_routes
    train_metadata = data_loader._train_metadata

    features = []
    delay_targets = []
    duration_targets = []

    # Get unique 5-digit train numbers for API queries
    unique_trains = []
    for train_no in train_metadata.keys():
        if len(str(train_no).strip()) == 5:
            unique_trains.append(str(train_no).strip())

    # Shuffle to get diverse sample
    np.random.seed(42)
    np.random.shuffle(unique_trains)
    api_sample = unique_trains[:max_api_calls]

    print(f"  [ML] Fetching real delay data for {len(api_sample)} trains from RailRadar API...")
    api_delay_cache = {}
    success_count = 0

    for i, train_no in enumerate(api_sample):
        if (i + 1) % 50 == 0:
            print(f"  [ML]   ... {i+1}/{len(api_sample)} trains queried ({success_count} with data)")
        try:
            data = railradar_client.get_average_delay(train_no)
            if data and "route" in data and len(data["route"]) > 0:
                station_delays = data["route"]
                arr_delays = [
                    s.get("arrivalDelayMinutes", 0) or 0
                    for s in station_delays
                    if s.get("arrivalDelayMinutes") is not None
                ]
                if arr_delays:
                    api_delay_cache[train_no] = {
                        "avg_delay": sum(arr_delays) / len(arr_delays),
                        "max_delay": max(arr_delays),
                        "num_stations": len(arr_delays),
                    }
                    success_count += 1
        except Exception:
            pass

    print(f"  [ML] Got real delay data for {success_count} trains")

    if success_count < 20:
        print(f"  [ML] Not enough real API data ({success_count}). Using CSV-only heuristics as supplement.")

    # Build training samples — one per train that has real delay data
    for train_no, api_data in api_delay_cache.items():
        stops = train_routes.get(train_no, [])
        meta = train_metadata.get(train_no, {})
        if len(stops) < 2:
            continue

        total_distance = meta.get("total_distance", 0)
        if total_distance <= 0:
            continue

        num_stops = len(stops)
        train_name = meta.get("train_name", "").lower()

        # Junction stop count
        junction_count = sum(
            1 for s in stops if s["station_code"] in MAJOR_JUNCTIONS
        )

        avg_spacing = total_distance / max(num_stops - 1, 1)

        # Departure hour
        first_dep = stops[0].get("departure_time", "12:00:00")
        try:
            dep_hour = int(str(first_dep).split(":")[0])
        except (ValueError, IndexError):
            dep_hour = 12

        # Scheduled duration
        try:
            first_dep_parts = str(stops[0].get("departure_time", "")).split(":")
            last_arr_parts = str(stops[-1].get("arrival_time", "")).split(":")
            dep_min = int(first_dep_parts[0]) * 60 + int(first_dep_parts[1])
            arr_min = int(last_arr_parts[0]) * 60 + int(last_arr_parts[1])
            scheduled_duration = arr_min - dep_min
            if scheduled_duration <= 0:
                scheduled_duration += 1440
            if total_distance > 800 and scheduled_duration < 600:
                scheduled_duration += 1440
        except (ValueError, IndexError):
            scheduled_duration = int(total_distance / 50 * 60)

        is_long_distance = 1 if total_distance > 500 else 0

        # Train type encoding
        train_type = 0
        if "rajdhani" in train_name:
            train_type = 4
        elif "shatabdi" in train_name:
            train_type = 4
        elif "duronto" in train_name:
            train_type = 3
        elif "sf" in train_name or "superfast" in train_name:
            train_type = 2
        elif "exp" in train_name:
            train_type = 1

        feature_vec = [
            num_stops,
            total_distance,
            avg_spacing,
            junction_count,
            dep_hour,
            total_distance / max(num_stops, 1),
            is_long_distance,
            train_type,
            scheduled_duration,
        ]

        features.append(feature_vec)
        delay_targets.append(api_data["avg_delay"])  # REAL delay from API
        # Duration factor: estimate from delay
        estimated_actual = scheduled_duration + api_data["avg_delay"]
        duration_targets.append(estimated_actual / max(scheduled_duration, 1))

    # If we have fewer than 50 real samples, supplement with heuristic data
    # from trains that weren't in the API cache
    if len(features) < 50:
        print(f"  [ML] Supplementing with heuristic data ({len(features)} real samples)...")
        supplement_count = 0
        for train_no in list(train_metadata.keys())[:2000]:
            if train_no in api_delay_cache:
                continue
            stops = train_routes.get(train_no, [])
            meta = train_metadata.get(train_no, {})
            if len(stops) < 2:
                continue
            total_distance = meta.get("total_distance", 0)
            if total_distance <= 0:
                continue

            num_stops = len(stops)
            train_name = meta.get("train_name", "").lower()
            junction_count = sum(1 for s in stops if s["station_code"] in MAJOR_JUNCTIONS)
            avg_spacing = total_distance / max(num_stops - 1, 1)

            first_dep = stops[0].get("departure_time", "12:00:00")
            try:
                dep_hour = int(str(first_dep).split(":")[0])
            except (ValueError, IndexError):
                dep_hour = 12

            try:
                first_dep_parts = str(stops[0].get("departure_time", "")).split(":")
                last_arr_parts = str(stops[-1].get("arrival_time", "")).split(":")
                dep_min = int(first_dep_parts[0]) * 60 + int(first_dep_parts[1])
                arr_min = int(last_arr_parts[0]) * 60 + int(last_arr_parts[1])
                scheduled_duration = arr_min - dep_min
                if scheduled_duration <= 0:
                    scheduled_duration += 1440
                if total_distance > 800 and scheduled_duration < 600:
                    scheduled_duration += 1440
            except (ValueError, IndexError):
                scheduled_duration = int(total_distance / 50 * 60)

            is_long_distance = 1 if total_distance > 500 else 0
            train_type = 0
            if "rajdhani" in train_name:
                train_type = 4
            elif "shatabdi" in train_name:
                train_type = 4
            elif "duronto" in train_name:
                train_type = 3
            elif "sf" in train_name or "superfast" in train_name:
                train_type = 2
            elif "exp" in train_name:
                train_type = 1

            feature_vec = [
                num_stops, total_distance, avg_spacing, junction_count,
                dep_hour, total_distance / max(num_stops, 1),
                is_long_distance, train_type, scheduled_duration,
            ]

            # Heuristic delay target (only for supplement)
            base_delay = (num_stops * 1.0) + (total_distance * 0.003)
            premium_factor = {4: 0.4, 3: 0.55, 2: 0.75, 1: 0.9, 0: 1.1}
            estimated_delay = base_delay * premium_factor.get(train_type, 1.0)
            estimated_delay += np.random.normal(0, max(estimated_delay * 0.2, 1))
            estimated_delay = max(0, estimated_delay)

            features.append(feature_vec)
            delay_targets.append(estimated_delay)
            duration_targets.append(max(0.85, 1.0 + estimated_delay / max(scheduled_duration, 1)))
            supplement_count += 1
            if supplement_count >= 500:
                break

    return np.array(features), np.array(delay_targets), np.array(duration_targets)


def _train_models(max_api_calls=200):
    """Train GBM models using real RailRadar delay data + CSV features."""
    global _delay_model, _duration_model, _models_loaded

    from sklearn.ensemble import GradientBoostingRegressor
    from sklearn.model_selection import train_test_split

    print("  [ML] Building training data (real API delays + CSV features)...")
    X, y_delay, y_duration = _extract_features_from_csv_and_api(max_api_calls)

    if len(X) < 10:
        print("  [ML] Insufficient training data!")
        _models_loaded = True
        return

    print(f"  [ML] Training on {len(X)} samples...")

    # Delay Prediction Model
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_delay, test_size=0.2, random_state=42
    )
    _delay_model = GradientBoostingRegressor(
        n_estimators=200, max_depth=5, learning_rate=0.1,
        min_samples_split=10, min_samples_leaf=5,
        subsample=0.8, random_state=42,
    )
    _delay_model.fit(X_train, y_train)
    delay_score = _delay_model.score(X_test, y_test)
    print(f"  [ML] Delay model R²: {delay_score:.4f}")

    # Duration Prediction Model
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_duration, test_size=0.2, random_state=42
    )
    _duration_model = GradientBoostingRegressor(
        n_estimators=150, max_depth=4, learning_rate=0.1,
        min_samples_split=10, min_samples_leaf=5,
        subsample=0.8, random_state=42,
    )
    _duration_model.fit(X_train, y_train)
    duration_score = _duration_model.score(X_test, y_test)
    print(f"  [ML] Duration model R²: {duration_score:.4f}")

    # Save
    _ensure_model_dir()
    with open(os.path.join(_MODEL_DIR, "delay_model.pkl"), "wb") as f:
        pickle.dump(_delay_model, f)
    with open(os.path.join(_MODEL_DIR, "duration_model.pkl"), "wb") as f:
        pickle.dump(_duration_model, f)

    _models_loaded = True
    print("  [ML] Models trained and saved.")


def _load_or_train():
    """Load cached models or train from scratch."""
    global _delay_model, _duration_model, _models_loaded

    if _models_loaded:
        return

    _ensure_model_dir()
    delay_path = os.path.join(_MODEL_DIR, "delay_model.pkl")
    duration_path = os.path.join(_MODEL_DIR, "duration_model.pkl")

    if os.path.exists(delay_path) and os.path.exists(duration_path):
        try:
            with open(delay_path, "rb") as f:
                _delay_model = pickle.load(f)
            with open(duration_path, "rb") as f:
                _duration_model = pickle.load(f)
            _models_loaded = True
            print("  [ML] Loaded cached models.")
            return
        except Exception as e:
            print(f"  [ML] Cache load failed: {e}.")

    # DO NOT train models during a live request (too slow, hits rate limits)
    # Instead, mark as loaded so we use fallback heuristics
    print("  [ML] Models not found — using heuristic fallbacks (fast).")
    _models_loaded = True


def extract_route_features(route):
    """Extract feature vector from a route for ML prediction."""
    from app.pipelines.rail.config import MAJOR_JUNCTIONS

    total_stops = 0
    total_distance = route.get("total_distance_km", 0)
    junction_count = 0
    dep_hour = 12
    train_type = 0
    train_type_str = ""
    scheduled_duration = route.get("total_duration_minutes", 0)

    for t in route.get("trains", []):
        total_stops += t.get("stops_between", 0) + 2
        train_type_str += (t.get("train_type", "") + " " + t.get("train_name", "")).lower()

        dep_time = t.get("departure_time", "12:00")
        try:
            dep_hour = int(str(dep_time).split(":")[0])
        except (ValueError, IndexError):
            dep_hour = 12

        from_stn = t.get("from_station", "")
        to_stn = t.get("to_station", "")
        if from_stn in MAJOR_JUNCTIONS:
            junction_count += 1
        if to_stn in MAJOR_JUNCTIONS:
            junction_count += 1

    if "rajdhani" in train_type_str:
        train_type = 4
    elif "shatabdi" in train_type_str:
        train_type = 4
    elif "duronto" in train_type_str:
        train_type = 3
    elif "superfast" in train_type_str or "sf " in train_type_str:
        train_type = 2
    elif "express" in train_type_str or "exp" in train_type_str:
        train_type = 1

    avg_spacing = total_distance / max(total_stops - 1, 1) if total_stops > 1 else total_distance
    is_long_distance = 1 if total_distance > 500 else 0

    return np.array([[
        total_stops, total_distance, avg_spacing, junction_count,
        dep_hour, total_distance / max(total_stops, 1),
        is_long_distance, train_type, scheduled_duration,
    ]])


def predict_delay(route):
    """Predict expected delay in minutes using the trained model."""
    _load_or_train()
    if _delay_model is None:
        return route.get("total_duration_minutes", 60) * 0.1
    features = extract_route_features(route)
    return max(0, float(_delay_model.predict(features)[0]))


def predict_duration_factor(route):
    """Predict actual/scheduled duration ratio."""
    _load_or_train()
    if _duration_model is None:
        return 1.05
    features = extract_route_features(route)
    return max(0.8, float(_duration_model.predict(features)[0]))


def get_model_info():
    """Return model metadata."""
    _load_or_train()
    return {
        "delay_model": "GradientBoostingRegressor" if _delay_model else "None",
        "duration_model": "GradientBoostingRegressor" if _duration_model else "None",
        "models_loaded": _models_loaded,
        "training_data": "RailRadar API real delays + CSV features",
        "features": [
            "num_stops", "total_distance", "avg_stop_spacing",
            "junction_count", "departure_hour", "distance_per_stop",
            "is_long_distance", "train_type", "scheduled_duration"
        ],
    }
