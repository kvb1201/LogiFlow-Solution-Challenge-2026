# 🧠 LogiFlow Architecture

This document explains the **end-to-end architecture** of LogiFlow — a modular, multimodal logistics decision engine.

---

# 🚀 System Overview

LogiFlow is designed as a **layered decision system**:

```
Frontend → API → Optimizer → Pipelines → Validation → Scoring → Enrichment → Response
```

---

# 🔁 End-to-End Flow

1. User inputs:
   - source
   - destination
   - priority
   - preferences / constraints

2. Frontend sends request → `/optimize`

3. Backend flow:
   - routes request to optimizer
   - optimizer calls all pipelines
   - pipelines generate candidate routes
   - validator checks structure
   - scorer ranks routes
   - enricher adds coordinates

4. Backend returns:
   - best route
   - alternative routes

5. Frontend:
   - renders routes on map
   - shows comparison

---

# 🧱 Backend Architecture

## 🔹 Entry Layer

### `main.py`
- Initializes FastAPI app
- Registers routes
- Enables CORS

---

## 🔹 API Layer

### `routes/optimize.py`
- Handles `/optimize` POST request
- Extracts user input
- Calls optimizer
- Returns structured response

---

## 🔹 Core Decision Engine

### `services/optimizer.py`
This is the **brain of the system**.

Responsibilities:
- fetch routes from all pipelines
- apply constraints (excluded modes)
- validate routes
- score routes
- select best + alternatives

---

## 🔹 Pipeline Management

### `services/pipeline_registry.py`
- Maintains list of all pipelines
- Enables plug-and-play architecture

Example:
```python
PIPELINES = [RoadPipeline(), RailPipeline(), WaterPipeline(), HybridPipeline()]
```

---

## 🔹 Pipelines (Core Logic)

Located in:

```
app/pipelines/
```

Each mode has its own folder:
- road/
- rail/
- water/
- hybrid/

### Pipeline Structure

```
pipeline.py → route generation logic
test.py → independent testing
```

### Standard Interface

Each pipeline implements:

```python
generate(source, destination) → list[route]
```

### Route Format

```json
{
  "type": "Road",
  "mode": "road",
  "time": 6,
  "cost": 2500,
  "risk": 0.4,
  "segments": [...]
}
```

---

## 🔹 Validation Layer

### `services/validator.py`
- Ensures route structure is correct
- Prevents invalid data from propagating

---

## 🔹 Scoring Engine

### `services/scorer.py`
- Assigns score based on:
  - time
  - cost
  - risk

Priority-based weighting:
- Fast → prioritize time
- Cheap → prioritize cost
- Safe → prioritize risk

---

## 🔹 Data Enrichment

### `services/enricher.py`
- Converts city names → coordinates
- Prepares data for frontend map rendering

---

## 🔹 Utilities

### `utils/coordinates.py`
- Stores location → (lat, lng) mapping
- Acts as lightweight geolocation service

---

# 🌐 Frontend Architecture

Located in:

```
frontend/src/
```

---

## 🔹 Main Controller

### `App.jsx`
- Manages global state
- Handles API calls
- Renders UI

---

## 🔹 Components

| Component | Purpose |
|----------|--------|
| InputForm | Collect user inputs |
| MapView | Render route visually |
| BestRouteCard | Show best route |
| RouteComparison | Show alternatives |
| SegmentList | Detailed breakdown |

---

## 🔹 API Layer

### `services/api.js`
- Sends requests to backend
- Handles responses

---

## 🔹 Utilities

- `constants.js` → static data
- `helpers.js` → reusable functions

---

# 🤖 ML Layer (Future Integration)

Located in:

```
ml/
```

Planned uses:
- delay prediction
- risk estimation
- demand forecasting

---

# 🧩 Architectural Layers Summary

```
1. Input Layer → frontend
2. API Layer → routes
3. Decision Layer → optimizer
4. Generation Layer → pipelines
5. Validation Layer → validator
6. Intelligence Layer → scorer
7. Data Layer → enricher + utils
8. Output Layer → frontend
```

---

# 🏆 Key Design Principles

## ✅ Modular
Each component is independent

## ✅ Scalable
New pipelines can be added easily

## ✅ Testable
Each pipeline is independently testable

## ✅ Extendable
Supports ML and simulation

---

# 🚀 Future Extensions

- Simulation engine
- Real-time data integration
- ML-based predictions
- Dynamic rerouting

---

# 📌 Summary

LogiFlow is a **modular logistics decision engine** that separates:
- route generation (pipelines)
- decision logic (optimizer)
- intelligence (scoring)

This design enables scalability, flexibility, and real-world applicability.
