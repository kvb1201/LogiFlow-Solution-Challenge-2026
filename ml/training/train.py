"""
Training script for Railway Cargo ML models.
Trains GradientBoosting models on Indian Railways schedule data
and saves them for later inference.

Usage:
    cd backend
    python -m ml.training.train
"""

import os
import sys

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))


def main():
    print("=" * 55)
    print("  LOGIFLOW — ML MODEL TRAINING")
    print("=" * 55)

    from app.pipelines.rail.ml_models import _train_models, get_model_info

    print("\nTraining ML models from Indian Railways schedule data...\n")
    _train_models()

    info = get_model_info()
    print("\n" + "=" * 55)
    print("  MODEL SUMMARY")
    print("=" * 55)
    print(f"  Delay Model    : {info['delay_model']}")
    print(f"  Duration Model : {info['duration_model']}")
    print(f"  Features       : {len(info['features'])} features")
    for f in info["features"]:
        print(f"    - {f}")
    print(f"\n  Models saved to: backend/app/pipelines/rail/models/")
    print("=" * 55)


if __name__ == "__main__":
    main()
