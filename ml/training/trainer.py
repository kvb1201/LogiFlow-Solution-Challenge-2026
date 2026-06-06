import pandas as pd
import numpy as np
import joblib

from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics import accuracy_score, roc_auc_score, classification_report
from sklearn.ensemble import HistGradientBoostingClassifier

# =========================
# LOAD DATA
# =========================

df = pd.read_csv("smart_logistics_dataset.csv")

# =========================
# REMOVE LEAKAGE
# =========================

df = df.drop(columns=[
    "Shipment_Status",
    "Logistics_Delay_Reason",
    "Asset_ID",
    "User_Transaction_Amount",
    "User_Purchase_Frequency",
    "Latitude",
    "Longitude",
    "Waiting_Time"
])

# =========================
# TRAFFIC ENCODING
# =========================

traffic_map = {
    "Clear": 0,
    "Moderate": 1,
    "Heavy": 2,
    "Detour": 3
}

df["traffic_score"] = (
    df["Traffic_Status"]
    .map(traffic_map)
    .fillna(0)
)

df = df.drop(columns=["Traffic_Status"])

# =========================
# FEATURES
# =========================

FEATURES = [
    "traffic_score",
    "Temperature",
    "Humidity",
    "Asset_Utilization",
    "Demand_Forecast"
]

TARGET = "Logistics_Delay"

X = df[FEATURES]
y = df[TARGET]

# =========================
# TRAIN TEST SPLIT
# =========================

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

# =========================
# MODEL
# =========================

model = HistGradientBoostingClassifier(
    learning_rate=0.05,
    max_depth=5,
    max_iter=300,
    min_samples_leaf=20,
    random_state=42
)

model.fit(X_train, y_train)

# =========================
# EVALUATION
# =========================

probs = model.predict_proba(X_test)[:, 1]
preds = model.predict(X_test)

print("=" * 50)
print("Accuracy:", accuracy_score(y_test, preds))
print("ROC AUC:", roc_auc_score(y_test, probs))
print("=" * 50)

print(classification_report(y_test, preds))

# =========================
# CROSS VALIDATION
# =========================

cv_scores = cross_val_score(
    model,
    X,
    y,
    cv=5,
    scoring="roc_auc"
)

print("\nCV ROC-AUC Scores:")
print(cv_scores)

print("\nMean ROC-AUC:")
print(cv_scores.mean())

# =========================
# TRAIN FINAL MODEL
# =========================

final_model = HistGradientBoostingClassifier(
    learning_rate=0.05,
    max_depth=5,
    max_iter=300,
    min_samples_leaf=20,
    random_state=42
)

final_model.fit(X, y)

# =========================
# SAVE ARTIFACT
# =========================

artifact = {
    "model": final_model,
    "features": FEATURES,
    "traffic_map": traffic_map,
    "version": "v3_hist_gradient_boosting"
}

joblib.dump(
    artifact,
    "delay_model.pkl",
    compress=3
)

print("\nModel saved as delay_model.pkl")