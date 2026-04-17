# 🛰️ LogiFlow: Atomic Pipeline Architecture & Ecosystem Map

This document is the definitive blueprint for isolating, scaling, and maintaining the individual transport pipelines of LogiFlow. It maps every logical unit, data asset, and cross-cutting dependency with zero exceptions.

---

## 🏛️ 1. The Global Pipeline Protocol
Every pipeline is an atomic unit that implements the `BasePipeline` interface. This allows the `HybridPipeline` to perform concurrent execution and cross-modal optimization.

### 1.1 Interface: `backend/app/pipelines/base.py`
- **Class**: `BasePipeline`
- **Contract**:
    - `mode`: Unique slug (`rail`, `air`, `road`, `water`).
    - `name`: Display label.
    - `generate(source, destination, payload)`: The core execution entry point.
- **Payload Standards**: 
    - `source`, `destination`: City names.
    - `payload`: Dictionary containing `cargo_weight_kg`, `cargo_type`, `departure_date`, `priority`, and `constraints`.

---

## 🚂 2. Railway Pipeline (`rail`)
**Dominant Logic**: Schedule-based discovery and official tariff scaling.

### 2.1 Backend Logical Units (`backend/app/pipelines/rail/`)
- **`pipeline.py`**: High-level orchestration. Implements `generate` and handles the result ranking.
- **`engine.py`**: The Decision Logic. Contains the `RailCargoOptimizer` class.
- **`route_finder.py`**: Multi-source discovery. Searches for direct/transfer trains.
- **Scraping Clients**:
    - `railyatri_client.py`: Primary live data fetcher.
    - `railradar_client.py`: Secondary data fetcher.
- **Logic Support**:
    - `engineer.py`: Feature enrichment (Halts, Transit Windows).
    - `tariff.py`: Mathematical implementation of Indian Railways 2026 Parcel Rates.
    - `station_resolver.py`: Fuzzy matching for city names to station codes.
    - `fallback_stations.py`: Hardcoded station code hints for UI feedback.
- **Static Intelligence**:
    - `scale_s_official.json`, `scale_p_official.json`, `scale_r_official.json`, `scale_l_official.json`: Official rate tables.
    - `Train_details_22122017.csv`: Historical route fallback.
    - `stations.json`: Station metadata.
- **ML & Predictions**:
    - `ml_models.py`: XGBoost/Random Forest logic for predicting delay minutes based on train category and distance.

### 2.2 Frontend Components
- **Dashboard**: `frontend/src/components/RailwayDashboard.tsx`
- **Loading State**: `frontend/src/components/RailwayLoading.tsx`

---

## ✈️ 3. Air Pipeline (`air`)
**Dominant Logic**: Flight network graph and cargo-type handling rules.

### 3.1 Backend Logical Units (`backend/app/pipelines/air/`)
- **`pipeline.py`**: Global logic for flight selection and `CARGO_RULES` enforcement.
- **`engine.py`**: Route scoring and ranking based on priority (Time/Cost/Safe).
- **`ml_models.py`**: Prediction of flight delay probability and congestion risk.
- **Supporting Services (`backend/app/services/`)**:
    - `air_data_service.py`: Interface for OpenFlights and live flight data.
    - `airport_locator_service.py`: Spatial mapping of cities to IATA codes.
    - `air_weather_service.py`: Fetching METAR-derived weather risks.

### 3.2 Data Assets (`backend/data/`)
- `airports.csv`: Global airport registry.
- `routes.dat`: Network graph of global flight routes.

### 3.3 Frontend Components
- **Form**: `frontend/src/components/AirInputForm.tsx`
- **Results**: `frontend/src/components/AirResults.tsx`
- **Page Wrapper**: `frontend/src/app/air/page.tsx`

---

## 🚚 4. Road Pipeline (`road`)
**Dominant Logic**: Real-time traffic simulation and physical route geometry.

### 4.1 Backend Logical Units (`backend/app/pipelines/road/`)
- **`pipeline.py`**: Main logic. Features a dual-mode engine: `realtime` and `simulation`.
- **`route_provider.py`**: External API interface for OSRM/Maps route generation.
- **`adapter.py`**: Transformer for API raw data to LogiFlow standard JSON.
- **`engineer.py` / `engine.py`**: Logic for splitting routes by Highway Ratio and calculating Logistics-style pricing (Rate/km/ton).

### 4.2 Supporting Services (`backend/app/services/`)
- `ml_service.py`: Traffic-category delay modeling.
- `weather_service.py`: Local weather impacts on road safety and speed.
- `geocoding_service.py`: Converting city names to coordinates for the `route_provider`.

### 4.3 Frontend Components
- **Simulation Form**: `frontend/src/components/roadInputForm.tsx` (Contains sliders for Fuel Price, Traffic Level, Incidents).
- **Visualization**: `frontend/src/components/Map.tsx`, `Mapview.tsx`.

---

## 🚢 5. Water Pipeline (`water`)
**Dominant Logic**: Maritime port mapping and transshipment hubs.

### 5.1 Backend Logical Units (`backend/app/pipelines/water/`)
- **`pipeline.py`**: High-level logic for maritime path filtering.
- **`ports.py`**: mapping function for City -> Nearest Port.
- **`route_generator.py`**: Port-to-port network pathfinding.
- **`engineer.py`**: Coastal and Deep-sea logistics pricing logic.

### 5.2 Frontend Components
- **Form**: `frontend/src/components/waterInputForm.tsx`
- **Results**: `frontend/src/components/WaterRouteResults.tsx`

---

## 🔄 6. Hybrid & Cross-Cutting Systems
**Dominant Logic**: Multi-modal normalization and LLM-backed decision support.

### 6.1 The Orchestrator (`backend/app/pipelines/hybrid/`)
- **`pipeline.py`**: Concurrent execution of all mode-pipelines.
- **`normalizer.py`**: Maps mode-specific outputs (e.g., `effective_hours` in Rail, `duration` in Air) to global keys (`time_hr`, `cost_inr`).
- **`explain.py`**: The comparison logic that evaluates trade-offs.

### 6.2 The AI Brain (`backend/app/services/`)
- `gemini_service.py`: Connection to Google Gemini API.
- `gemini_explainer.py`: Logic for generating "The Verdict" in the hybrid view.
- `groq_service.py`: High-speed fallback for summarization.
- `train_explanation.py`: Detailed reasoning for Rail route choices.

---

## 🛠️ 7. Infrastructure & Tooling
- **Entry Point**: `backend/app/main.py` (FastAPI).
- **Network Routing**: `backend/app/routes/` (Mode-specific API endpoints).
- **Environment**: `backend/.env` (Contains all API keys for Gemini, Groq, OpenWeather, etc.).
- **Task Runner**: Root `Makefile` for setting up `venv` and running `dev` servers.
- **Execution Script**: `backend/run` (Bash script for uvicorn with auto-reload).

---

## 📋 8. Check-list for Creating/Isolating a New Pipeline
To ensure 100% compliance when working on a specific pipeline:

1.  **Registry**: Ensure the mode is registered in `backend/app/services/pipeline_registry.py`.
2.  **API Route**: Add a dedicated route in `backend/app/routes/`.
3.  **Base Class**: Extend `BasePipeline`.
4.  **Data Sink**: Any new datasets must go to `backend/data/` or mode-specific folders.
5.  **Normalization**: Update `backend/app/pipelines/hybrid/normalizer.py` to handle the new mode's output keys.
6.  **Frontend**: Create a corresponding component in `frontend/src/components/` and register the route in `frontend/src/app/`.
7.  **Service Mapping**: Update `frontend/src/services/api.ts` with the new endpoint method.
