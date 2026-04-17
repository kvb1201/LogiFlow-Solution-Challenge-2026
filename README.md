<div align="center">
  <img src="https://img.shields.io/badge/Google-Solution%20Challenge%202026-blue?style=for-the-badge&logo=google" alt="Google Solution Challenge" />
  <img src="https://img.shields.io/badge/Status-Production%20Ready-success?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/Platform-Web%20%7C%20Mobile%20App-purple?style=for-the-badge&logo=react" alt="Platform Supported" />
  <img src="https://img.shields.io/badge/Backend-FastAPI%20%7C%20Python-009688?style=for-the-badge&logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Frontend-Next.js%2016-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/AI_Engine-Gemini%20%7C%20Groq-critical?style=for-the-badge&logo=google-gemini" alt="AI Engine" />

  <br /><br />
  <h1>🌍 <b>LogiFlow</b></h1>
  <h3>The Ultimate Decision Intelligence Platform for Global Multimodal Logistics</h3>
  <p><i>Building order from chaos. Predictable routing through unpredictable worlds.</i></p>
</div>

> **Available Across All Devices:** LogiFlow is engineered not just as an expansive Web Dashboard but as a fully responsive **Mobile Application (PWA)**, allowing on-the-ground fleet managers and train operators to receive real-time disruption alerts right in their pockets.

---

## 📖 The LogiFlow Narrative

In the complex realities of modern supply chains, **LogiFlow** emerged to solve an undeniable truth: *Transportation is never static.* Standard pathfinding API logic and static look-up charts fail catastrophically when ports strike, trains inherently delay over 10 hours, or weather halts cargo planes.

Built for the **Google Solution Challenge 2026**, LogiFlow isn’t a regular route optimizer connecting coordinates. It is a highly resilient, multi-modal **Decision Intelligence Ecosystem**. We orchestrated four inherently decoupled transport pipelines—**Rail, Air, Road, and Water**—into a singular *Hybrid Decision Orchestrator*. 

We built **fail-safes for our fail-safes**. When official APIs go down or impose paywalls, LogiFlow’s built-in intelligent proxy architectures spoof sessions to extract critical live-tracking data from the DOM itself. Where legacy routing sees simple transit times, LogiFlow models delay probabilities using **XGBoost & CatBoost**. And when the user needs to know *why* rail was chosen over air, **Google Gemini** natively evaluates the tradeoffs and delivers a clean verdict immediately to the Mobile or Desktop app.

Welcome to the absolute bleeding-edge of logistics intelligence.

---

## 🏛️ Comprehensive Architecture & Folder Structure

To scale smoothly with thousands of logic permutations across 4 different transport infrastructures, we decoupled everything.

```bash
📦 LogiFlow-Solution-Challenge-2026
 ┣ 📂 backend/               # Python/FastAPI Decision Ecosystem
 ┃ ┣ 📂 app/
 ┃ ┃ ┣ 📂 pipelines/         # 🧠 Atomic, independent transport logics
 ┃ ┃ ┃ ┣ 📂 air/             # OpenFlights graphs & METAR weather parsing (engine.py, ml_models.py)
 ┃ ┃ ┃ ┣ 📂 rail/            # The heavy-scraper: RailYatri, ConfirmTkt, IRCTC spoofing
 ┃ ┃ ┃ ┣ 📂 road/            # Geospacial traffic simulator map generation (engineer.py)
 ┃ ┃ ┃ ┣ 📂 water/           # Oceanic transshipment port mapping (ports.py, route_generator.py)
 ┃ ┃ ┃ ┗ 📂 hybrid/          # The Normalizer & Gemini/Groq LLM tradeoff pipeline
 ┃ ┃ ┣ 📂 services/          # Third party connections (Gemini, Weather APIs, Redis Caching)
 ┃ ┃ ┣ 📂 routes/            # REST API endpoints consumed by the Mobile/Web Frontend
 ┃ ┃ ┗ 📜 main.py            # Uvicorn Async Entrypoint
 ┃ ┣ 📂 data/                # Static historical fallback matrices (Airports, Official Tariffs)
 ┃ ┗ 📜 requirements.txt     # Python dependencies (Scikit-Learn, CatBoost, FastAPI)
 ┃
 ┣ 📂 frontend/              # Next.js 16 Web Dashboard & Mobile App View
 ┃ ┣ 📂 src/
 ┃ ┃ ┣ 📂 app/               # Server-Side Rendered pages & Routing logic
 ┃ ┃ ┣ 📂 components/        # React 19 UI: Sliders, Radix UI Cards, and Interactive Maps
 ┃ ┃ ┃ ┣ 📜 Mapview.tsx      # Mapbox GL and react-leaflet integration
 ┃ ┃ ┃ ┣ 📜 RailwayDashboard.tsx 
 ┃ ┃ ┃ ┗ 📜 RouteResults.tsx 
 ┃ ┃ ┗ 📂 store/             # Zustand Global Hydration states
 ┃ ┣ 📜 package.json         # Javascript dependencies
 ┃ ┗ 📜 tailwind.config.js   # Tailored UI Aesthetics
 ┃
 ┗ 📂 ml/                    # Data Science & Model Training Labs
   ┣ 📂 training/            # Neural Net & Tree model training scripts
   ┗ 📂 inference/           # Exported joblib models injected back into Backend Pipelines
```

---

## ⛓️ Deep Dive: The Atomic Pipeline Modules

Every mode operates locally using `engine.py`, evaluates via `pipeline.py`, and manipulates custom metrics in `engineer.py`. If one mode fails, the Orchestrator ignores it and computes the rest, guaranteeing zero downtime.

### 🚂 1. Rail Pipeline (`backend/app/pipelines/rail/`)
*Dominant Logic: Extreme Data Extraction & Official Parcel Tariff Scaling*

The Indian Railway network does not provide free live-tracking APIs for cargo. Our pipeline bypasses this using extreme defensive engineering:
- **Cascading Web Scraping Resiliency**: 
  1. **Regex HTML Table Extraction (`railyatri_client.py`)**: Traverses `<th>` and `<tr>` trees dynamically from localized HTML endpoints.
  2. **Next.js State Injection Hack (`railradar_client.py`)**: Locates the `__NEXT_DATA__` JSON dictionary directly inside the script blocks of aggregated sites to steal the internal serialized backend payload before browser hydrate.
  3. **Direct Session Spoofing (IRCTC Fallback)**: Automatically spoofs a `requests.Session()` coupled with dynamic `greq` and `bmirak` timestamped anti-bot cookies to hit internal APIs (Akamai protected) without rate limits.
- **Cargo Cost Determinism**: Enforces exact mathematical formulas mapped directly from `scale_p_official.json` and 2026 Indian scale rates.
- **Machine Learning Integration**: Pulls up to 14 days of running logs for the specific train identifier, pushing it through `ml_models.py` to calculate *Severity Average* and adjust exact arrival timestamps.

### ✈️ 2. Air Pipeline (`backend/app/pipelines/air/`)
*Dominant Logic: Geospatial Graph Theory & Turbulence Matrix*

Calculates real-world routing strictly based on physics, weather, and node connections.
- **Node-to-Node Graph Generation (`engine.py`)**: Scans massive internal `routes.dat` and `airports.csv` arrays to build paths bypassing heavy civilian airports.
- **METAR Congestion Risk**: Connects to aeronautical METAR endpoints to evaluate current wind speed, storm probability, and correlates that via ML to an expected risk percentage coefficient.
- **Scoring Engine**: Evaluates Time against standard global cargo weights. If the cargo is denoted as explosive or hazardous, the pipeline automatically filters out passenger-hybrid jet routes.

### 🚚 3. Road Pipeline (`backend/app/pipelines/road/`)
*Dominant Logic: Physical Route Geometry & Live Localized Simulation*

Built on robust Map engines with hyper-local granularity logic:
- **Dual Pipeline Simulation Mode**: Via `route_provider.py` and `engineer.py`, it can calculate real-world paths via OSRM map projections OR enter **Simulation Mode**.
- **Interactive UI Variables**: Fleet operators using the mobile app can change Fuel Price spikes, adjust hypothetical toll inflations, and introduce Traffic Incidents seamlessly—`roadInputForm.tsx` sends this immediately back to the model.
- **Logistics Cost Slicer**: Cuts coordinate array paths into distinct sections, applying cost permutations per highway ton/km to determine absolute profitability.

### 🚢 4. Water Pipeline (`backend/app/pipelines/water/`)
*Dominant Logic: Maritime Transshipment Bridging*

Connects internal landlocked cities to deep-sea container ports for bulk cargo.
- **Port Matching System**: Uses spatial bounding to find the absolute closest major industrial port.
- **Coastal/Deep-Sea Engine**: Adjusts transit days based on sea depth projections and container metrics.

---

## 🌩️ The Hybrid Orchestrator & AI Brain

What happens when multiple pipelines return completely different JSON structures (`effective_hours` vs `delay_minutes`, official tariffs vs algorithm estimates)?

1. **The Normalizer Constraint Engine**: A specialized middleware (`hybrid/normalizer.py`) that forcefully coerces disparate pipeline logic. It standardizes all cargo routes onto an immutable universal dictionary evaluating absolute **Time, Cost, and Risk**.
2. **The LLM Tradeoff Evaluator (`gemini_explainer.py`)**: 
   - Receives the normalized logistics dataset and connects natively to **Google Gemini APIs**.
   - Acts as a digital freight broker. It doesn’t just show the output—it *reads* the arrays and formulates a human-readable **Verdict** paragraph explaining exactly why taking Road Transport is 30% riskier during the current monsoon despite being 12 hours faster.
   - Falls back autonomously to **Groq Services** for instant sub-second summarization if rate ceilings are hit.

---

## 🚀 The Tech Stack Arsenal

We refused to compromise. The system runs on a deeply separated, modern stack designed for raw speed, async computing, and UI brilliance, scaling natively across mobile environments.

- **FastAPI + Uvicorn Backend**: Because synchronous frameworks die on multi-pipeline external API calls concurrently.
- **CatBoost & Scikit-Learn**: For hyper-fast inference tree mapping during risk estimations avoiding GPU bottlenecks.
- **Responsive Next.js & React 19**: Powered by Zustand for heavy global array hydration without rerenders. Tailored flawlessly by Tailwind CSS for mobile and desktop screens.
- **Mapbox Geospatial Intelligence**: Dynamically rendering complex routes visually instead of reading flat lat/long tables.

---

## 🛡️ Getting Started

### 1. Bootstrapping the Backend Ecosystem
*(Python 3.12+ Required)*
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill the .env with the appropriate Gemini/Groq keys
uvicorn app.main:app --reload
```
View the interactive pipeline swagger at: `http://localhost:8000/docs`

### 2. Bootstrapping the Frontend & Mobile Hub
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```
Dashboard deployed instantly on: `http://localhost:3000`

---
<div align="center">
  <p><i>LogiFlow was architected by a team absolutely dedicated to solving the unsolvable data problems found in global routing. We didn't build an app; we engineered an autonomous logistics mindset.</i></p>
</div>