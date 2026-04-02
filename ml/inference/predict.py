"""
Inference module for Railway Cargo ML models.
Loads trained models and provides prediction functions.

Usage:
    from ml.inference.predict import predict_route_delay, predict_route_duration
"""

import os
import sys

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))


def predict_route_delay(route_dict):
    """
    Predict expected delay for a given route.

    Args:
        route_dict: Route dictionary with train details

    Returns:
        float: Expected delay in minutes
    """
    from app.pipelines.rail.ml_models import predict_delay
    return predict_delay(route_dict)


def predict_route_duration(route_dict):
    """
    Predict actual/scheduled duration ratio for a route.

    Args:
        route_dict: Route dictionary with train details

    Returns:
        float: Duration multiplier (e.g., 1.1 = 10% longer than scheduled)
    """
    from app.pipelines.rail.ml_models import predict_duration_factor
    return predict_duration_factor(route_dict)


def batch_predict(routes):
    """
    Run predictions for multiple routes at once.

    Args:
        routes: List of route dictionaries

    Returns:
        List of dicts with delay and duration predictions
    """
    results = []
    for route in routes:
        results.append({
            "delay_minutes": predict_route_delay(route),
            "duration_factor": predict_route_duration(route),
        })
    return results


if __name__ == "__main__":
    # Quick test
    test_route = {
        "trains": [{
            "train_no": "12951",
            "train_name": "Mumbai Rajdhani Express",
            "from_station": "CSMT",
            "to_station": "NDLS",
            "departure_time": "17:00:00",
            "arrival_time": "08:35:00",
            "distance_km": 1384,
            "stops_between": 4,
            "total_train_stops": 6,
        }],
        "total_distance_km": 1384,
        "total_duration_minutes": 935,
    }

    print(f"Delay: {predict_route_delay(test_route):.1f} minutes")
    print(f"Duration factor: {predict_route_duration(test_route):.3f}")
