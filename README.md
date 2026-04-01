# LogiFlow-Solution-Challenge-
AI-powered multimodal logistics optimization system.

## Features
- Multimodal routing (road, rail, hybrid)
- Decision engine for cost, time, and risk
- Simulation of disruptions
- ML-based delay prediction

## Tech Stack
- Backend: FastAPI
- Frontend: React
- ML: Scikit-learn

## Structure
- backend/
- frontend/
- ml/
- docs/
# LogiFlow — Solution Challenge 2026

AI-powered **multimodal logistics optimization system** designed for intelligent routing, disruption handling, and decision support.

---

# 🚀 Project Vision

LogiFlow is a **decision intelligence platform** that:
- Optimizes logistics across multiple transport modes
- Adapts to constraints and preferences
- Simulates disruptions and recommends alternatives
- Evolves into ML-driven predictions

---

# 🧠 Current Architecture

## 🔹 Backend (FastAPI)

Structured into **modular layers**:

```
routes → services → pipelines → utils
```

### Components

#### 1. Routes
- `/optimize` → main API endpoint

#### 2. Services
- `optimizer.py` → core decision engine
- `pipeline_registry.py` → manages pipelines
- `scorer.py` → scoring logic (time/cost/risk)
- `enricher.py` → converts locations → coordinates
- `validator.py` → ensures pipeline output correctness

#### 3. Pipelines (Core Innovation)
Each transport mode is independent:

```
pipelines/
  road.py
  rail.py
  water.py
  hybrid.py
```

Each pipeline:
- generates routes
- follows a fixed schema
- is independently testable

#### 4. Utils
- `coordinates.py` → location mapping

---

# 🧩 Pipeline Architecture

Each pipeline implements:

```python
generate(source, destination) → list of routes
```

### Standard Output Format

```json
{
  "type": "Road",
  "mode": "road",
  "time": 7,
  "cost": 3000,
  "risk": 0.6,
  "segments": [...]
}
```

---

# 🧪 Testing Workflow

## 1. Individual Pipeline Testing

```bash
cd backend
python app/pipelines/test_road.py
```

## 2. Full Pipeline Testing

```bash
python app/pipelines/run_tests.py
```

## 3. Backend API Test

```bash
uvicorn app.main:app --reload
```

Then open:
```
http://localhost:8000/docs
```

---

# ⚙️ Development Workflow

## For Backend Developers

1. Work only in your pipeline:
```
app/pipelines/<mode>.py
```

2. Test locally:
```bash
python app/pipelines/test_<mode>.py
```

3. Validate integration:
```bash
python app/pipelines/run_tests.py
```

---

## Team Rules

### ❌ Do NOT modify:
- optimizer
- response format
- other pipelines

### ✅ Only modify:
- your assigned pipeline

---

# 🧠 Decision Engine

The optimizer:

1. Collects routes from all pipelines  
2. Applies constraints (excluded modes)  
3. Validates routes  
4. Scores routes based on priority  
5. Returns best + alternatives  

---

# 📊 Scoring Logic

Based on user priority:

| Priority | Focus |
|--------|------|
| Fast   | Minimize time |
| Cheap  | Minimize cost |
| Safe   | Minimize risk |

---

# 🔮 Upcoming Features

## 1. Simulation Engine (NEXT)
- Apply disruptions (weather, strikes)
- Recompute routes
- Compare before vs after

## 2. ML Integration
- Delay prediction
- Risk estimation
- Demand forecasting

## 3. Real-time Data
- Traffic APIs
- Weather APIs
- Map integration

---

# 🧭 Roadmap

### Phase 1 (Done)
- Backend modularization
- Pipeline architecture
- Testing + validation

### Phase 2 (In Progress)
- Improve pipeline realism
- Enhance scoring

### Phase 3 (Next)
- Simulation engine

### Phase 4 (Final)
- UI polish
- ML integration

---

# 🏁 Key Strengths

- Modular architecture  
- Independent pipeline development  
- Scalable design  
- Simulation-ready system  

---

# 🧑‍💻 Tech Stack

- Backend: FastAPI  
- Frontend: React  
- ML: Scikit-learn  

---

# 📌 Summary

LogiFlow is not just a route optimizer —  
it is a **scalable logistics decision engine** built for real-world complexity.