<div align="center">
  <img src="https://img.shields.io/badge/Status-Production%20Ready-success?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/Google-Solution%20Challenge%202026-blue?style=for-the-badge&logo=google" alt="Google Solution Challenge" />
  <br />
  <h1>🌍 <b>LogiFlow</b></h1>
  <h3>The Ultimate Decision Intelligence Platform for Global Multimodal Logistics</h3>
  <p><i>Building order from chaos. Predictable routing through unpredictable worlds.</i></p>
</div>

---

## 📖 The LogiFlow Narrative

In the complex realities of modern supply chains, **LogiFlow** emerged to solve an undeniable truth: *Transportation is never static.* Web searches and APIs fail when ports strike, trains delay, or weather halts cargo planes.

Built for the **Google Solution Challenge 2026**, LogiFlow isn’t just a simple route optimizer. It is a highly resilient, multi-modal **Decision Intelligence Ecosystem**. By orchestrating four inherently decoupled transport pipelines—**Rail, Air, Road, and Water**—into a singular *Hybrid Orchestrator*, LogiFlow calculates time, cost, and risk down to the exact ton and km. 

When official APIs go dark, LogiFlow’s built-in intelligent proxy architectures spoof sessions to extract critical tracking data. Where legacy routing sees point A to B, LogiFlow sees delay probabilities modeled by **XGBoost & CatBoost**. And when a user needs to understand *why* a route was chosen over another, **Google Gemini** evaluates the tradeoffs natively to deliver a crisp tactical verdict.

Welcome to the future of logistics routing.

---

## 🚀 The Tech Stack Arsenal

We refused to compromise on speed and stability. The system runs on a deeply separated, modern stack optimized for concurrency and high-throughput data extraction.

### 🧠 Backend (The Decision Engine)
- **Framework**: `FastAPI` + `Uvicorn` for blazing fast async concurrency.
- **Data & Intelligence**: `Python 3.12+`, `Pandas`, `NumPy`, `Pydantic` validation.
- **Machine Learning**: `Scikit-learn`, `CatBoost`, `XGBoost` for risk arrays and predictive delay modeling.
- **Resilience**: `Redis` for distributed caching, advanced circuit breakers, rotating proxy API headers (`requests`).

### 💻 Frontend (The Command Center)
- **Architecture**: `Next.js 16` (App Router) + `React 19`.
- **Styling & UI**: `Tailwind CSS v4`, `Radix UI` for headless accessible components, `Lucide React` for typography and iconography.
- **State & Data**: `Zustand` for global state hydration across heavy pipeline outputs.
- **Geospatial Visualization**: `Leaflet`, `React-Leaflet`, and `Mapbox GL` for drawing intricate transshipment routes dynamically.

---

## ⛓️ The Atomic Pipeline Architecture

The soul of LogiFlow relies on its `BasePipeline` contract. Every mode of transport operates completely independently, shielding the global platform from localized failures. 

### 🚂 1. Rail Pipeline (`rail`)
*Dominant Logic: Official Tariff Scaling & High-Availability Data Extraction*

The Indian Railway network is notorious for blocked APIs. Our pipeline bypasses this using extreme defensive engineering:
- **Web Scraping Ecosystem**: We cascade across three extraction strategies:
  1. **RailYatri HTML Parsing:** Robust regex HTML parsing to extract running status metrics.
  2. **ConfirmTkt Next.js State Extraction:** Directly lifting `__NEXT_DATA__` JSON framework state variables off SPA pages to bypass authorization APIs.
  3. **IRCTC Session Mimicry:** Generating dynamic client tokens (`greq` and `bmirak`) and spoofing synthetic requests to hit internal Akamai and WAF walls successfully.
- **Data Transformation**: Runs fuzzy station resolvers, historical timetable fallbacks (`Train_details_22122017.csv`), and enforces official 2026 Indian Railway scale tables for parcels.
- **Machine Learning**: Calculates **Severity Average** and **Delayed Ratio** to predict exactly how late your cargo will be.

### ✈️ 2. Air Pipeline (`air`)
*Dominant Logic: Airborne Network Graph Geometry*

Calculates real-world air cargo routing based on physical node connection:
- **Global Network Parsing**: Processes live and static OpenFlights data (`routes.dat`, `airports.csv`).
- **Risk Calculation**: Integrates METAR weather condition reports dynamically.
- **ML Congestion Matrix**: Predicts airport delay risks based on historical congestion.

### 🚚 3. Road Pipeline (`road`)
*Dominant Logic: Simulation & Spatial Simulation*

Built on robust Map engines with hyper-local granularity logic:
- **Dual Engine Architecture**: Supports standard `realtime` API routing and custom `simulation` routing.
- **Dynamic Variable Injection**: Takes dynamic traffic density, fuel pricing permutations, and physical highway conditions directly from UI sliders.
- **Cost Scaling**: Generates granular, km-by-km pricing estimates.

### 🚢 4. Water Pipeline (`water`)
*Dominant Logic: Maritime Hub Relays*

Connects internal cities to coastal seaports for heavy/bulk cargo:
- **Port Mapping Logic**: Finds the nearest logical transshipment port.
- **Coastal/Deep-Sea Engine**: Accurately scales maritime container pricing.

---

## 🌩️ The Hybrid Orchestrator & AI AI Brain

What happens when multiple pipelines return completely different structures (`duration_hrs` vs. `transit_minutes`, official tariffs vs. map estimates)?

1. **The Normalizer**: A specialized middleware that maps disparate pipeline structures, standardizing all cargo routes onto an immutable standard JSON dictionary evaluating **Time, Cost, and Risk**.
2. **The LLM Tradeoff Evaluator**: 
   - Connected natively to **Google Gemini APIs** (`gemini_explainer.py`).
   - Receives the normalized dataset and acts as a freight broker.
   - Summarizes *why* Road is picked over Rail, providing the ultimate **"Verdict"** back to the logistics manager in clean UI cards.
   - Falls back to `Groq` for high-throughput, instant summarization if primary models choke.

---

## 🛠️ Developer Check-List: Hacking the Machine

We designed LogiFlow to be extensible. Want to add drones? Or Hyperloop? 

1. **Registry**: Add your pipeline mode into `backend/app/services/pipeline_registry.py`.
2. **Extensibility**: Extend the `BasePipeline` (`backend/app/pipelines/base.py`). Ensure you expose a rigid `generate(source, destination, payload)` method.
3. **Normalize**: Map your new outputs through `Pipelines/hybrid/normalizer.py`.
4. **Dashboards**: Hydrate it on the frontend via Next.js components in `/frontend/src/components/`, adding Mapbox visualizations if the route calls for it.
5. **Testing First**: Never pollute the orchestrator without validating your pipeline with `python backend/app/pipelines/run_tests.py`.

---

## 🛡️ Getting Started

### 1. Bootstrapping the Backend (FastAPI)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Insert APIs to .env (.env.example provided)
uvicorn app.main:app --reload
```
API Documentation live at: `http://localhost:8000/docs`

### 2. Bootstrapping the Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```
Dashboard live at: `http://localhost:3000`

---

*LogiFlow was designed by a team absolutely dedicated to solving the unsolveable data problems found in modern global routing. We built fallbacks for our fallbacks.*