# LogiFlow 🚀

**Multi-Modal Cargo Logistics Optimizer** — Compare road, rail, air, and water routes in real-time with ML-powered delay predictions and AI-generated explanations.

Built for the **Google Solution Challenge 2026**.

---

## Problem

India's logistics sector moves 4.6 billion tonnes of freight annually, yet most shippers rely on single-mode planning tools that ignore cheaper, faster, or safer alternatives across other transport modes. The result: inflated costs, missed deadlines, and unnecessary cargo risk.

## Solution

LogiFlow is a **multi-modal logistics optimizer** that simultaneously evaluates road, rail, air, and water routes for any origin-destination pair. A hybrid scoring engine normalizes metrics across modes—time, cost, and risk—then ranks options using priority-weighted, non-linear scoring with Pareto dominance detection.

Key differentiators:
- **Real data, not mock**: OpenFlights for air, ConfirmTkt/RailYatri scraping for rail, TomTom for road
- **ML delay prediction**: Gradient Boosting models predict delays from traffic, weather, and historical patterns
- **Explainable AI**: Gemini-powered natural language explanations of why a mode was recommended
- **Strict correctness**: Pipelines return "no routes found" rather than fabricating data

---

## Features

| Feature | Description |
|---------|-------------|
| 🚛 **Road Optimization** | TomTom routing + ML delay prediction + weather integration |
| 🚂 **Rail Optimization** | Lightweight scraping (RailYatri + ConfirmTkt) + CSV fallback + official parcel tariffs |
| ✈️ **Air Optimization** | OpenFlights dataset + confidence filtering + airport resolution |
| 🚢 **Water Optimization** | Port-to-port BFS routing + risk modeling |
| ⚡ **Hybrid Engine** | Parallel execution + normalized scoring + Pareto dominance |
| 🤖 **Explainability** | Template-based (fast) + optional Gemini AI explanations |
| 📱 **Cross-Platform** | Next.js web app + Capacitor Android APK |
| 🔒 **Request Caching** | RequestContext eliminates redundant API calls across pipelines |

---

## Architecture

```
┌──────────────┐     ┌──────────────────────────────────────────┐
│   Frontend   │────▶│            FastAPI Backend               │
│  (Next.js)   │◀────│                                          │
└──────────────┘     │  ┌──────┐ ┌──────┐ ┌─────┐ ┌──────┐    │
                     │  │ Road │ │ Rail │ │ Air │ │Water │    │
                     │  └──┬───┘ └──┬───┘ └──┬──┘ └──┬───┘    │
                     │     └────────┴────────┴───────┘         │
                     │              ▼                           │
                     │     ┌────────────────┐                  │
                     │     │ Hybrid Engine  │                  │
                     │     │ (Normalize +   │                  │
                     │     │  Score + Rank) │                  │
                     │     └───────┬────────┘                  │
                     │             ▼                           │
                     │     ┌────────────────┐                  │
                     │     │  Explainer     │                  │
                     │     │ (Template/     │                  │
                     │     │  Gemini AI)    │                  │
                     │     └────────────────┘                  │
                     └──────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Zustand |
| Backend | Python, FastAPI, Uvicorn |
| ML | Scikit-learn (Gradient Boosting), custom feature engineering |
| Data | OpenFlights, TomTom API, ConfirmTkt, RailYatri, Indian Railways CSV |
| AI | Google Gemini 1.5 Flash (explainability) |
| Cache | Redis (production) + in-memory (local dev) |
| Deployment | Vercel (frontend), Render (backend) |
| Mobile | Capacitor (Android APK) |

---

## Demo

| Platform | Link |
|----------|------|
| 🌐 Web | *https://logi-flow-solution-challenge-2026.vercel.app/* |
| 📱 APK | *https://drive.google.com/file/d/11l_qnlY7JiAerHGyBcq2wIVn0NtWNXNl/view?usp=sharing* |

---

## Folder Structure

```
LogiFlow-Solution-Challenge-2026/
├── backend/
│   └── app/
│       ├── main.py                 # FastAPI entry point
│       ├── pipelines/
│       │   ├── road/               # TomTom + ML delay
│       │   ├── rail/               # Scraping + CSV + tariff
│       │   ├── air/                # OpenFlights + confidence
│       │   ├── water/              # Port BFS + risk
│       │   └── hybrid/             # Multi-modal scorer + explainer
│       ├── routes/                 # API endpoint handlers
│       ├── services/               # Gemini, weather, ML, geocoding
│       ├── utils/                  # RequestContext, coordinates
│       ├── models/                 # Data models
│       └── schemas/                # Pydantic request/response schemas
├── frontend/
│   └── src/
│       ├── app/                    # Next.js pages
│       ├── components/             # UI components
│       ├── services/               # API client
│       ├── store/                  # Zustand state management
│       └── styles/                 # Global styles
├── ml/                             # ML model training scripts
├── docs/                           # Documentation
└── README.md
```

---

## Documentation

Full technical documentation is available in the [`/docs`](./docs/) directory:

- [Architecture](./docs/architecture.md) — System overview and data flow
- [System Design](./docs/system-design.md) — Design principles and scalability
- [API Contract](./docs/api-contract.md) — Request/response schemas
- [Deployment](./docs/deployment.md) — Deploy to Vercel, Render, and Android
- **Pipeline docs**: [Road](./docs/pipelines/road.md) · [Rail](./docs/pipelines/rail.md) · [Air](./docs/pipelines/air.md) · [Water](./docs/pipelines/water.md) · [Hybrid](./docs/pipelines/hybrid.md)

---

## Quick Start

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Add your API keys
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

---

## Team

Built by Neural Foundry for the Google Solution Challenge 2026.

## License

MIT