<div align="center">

# LogiFlow

### Compare every way to move cargo — road, rail, air, water, and chained hybrid routes — in one honest run.

[![Google Solution Challenge 2026](https://img.shields.io/badge/Google-Solution%20Challenge%202026-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/solution-challenge)
[![Live Demo](https://img.shields.io/badge/Web-Live%20on%20Vercel-000?style=for-the-badge&logo=vercel)](https://logi-flow-solution-challenge-2026.vercel.app/)
[![Backend](https://img.shields.io/badge/API-GCP%20Cloud%20Run-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)](https://logiflow-api-sbexkjk72q-el.a.run.app/health)

<br/>

[**Try the app**](https://logi-flow-solution-challenge-2026.vercel.app/) · [**API health**](https://logiflow-api-sbexkjk72q-el.a.run.app/health) · [**Documentation**](./docs/) · [**Android APK**](https://drive.google.com/file/d/11l_qnlY7JiAerHGyBcq2wIVn0NtWNXNl/view?usp=sharing)

</div>

---

## The problem

India moves **4.6 billion tonnes** of freight every year, yet most shippers still plan in **one mode at a time**. A corridor that is faster by rail, cheaper by water, or safer by road rarely gets compared side-by-side. The result is higher cost, missed deadlines, and blind risk — especially for MSMEs who cannot afford a full logistics desk.

## The solution

**LogiFlow** runs five transport pipelines in parallel, normalizes every result into one schema, and ranks options with **priority-weighted scoring** and **Pareto dominance**. Shippers get cheapest / fastest / safest picks, a full multimodal comparator, chained hybrid itineraries, saved shipment plans with route health monitoring, and plain-language AI explanations — backed by **real data**, not fabricated routes.

---

## How it fits together

<p align="center">
  <img src="./docs/diagrams/png/01-system-architecture.png" alt="LogiFlow system architecture" width="900"/>
  <br/>
  <sub>Full diagram set → <a href="./docs/diagrams/">docs/diagrams</a></sub>
</p>

| Layer | What it does |
|-------|----------------|
| **Web & Android** | Next.js 16 app + Capacitor APK — planners, maps, comparator, saved trips |
| **Edge (Vercel)** | Same-origin API proxy, compose streaming, backend warmup, Google Sign-In |
| **API (Cloud Run)** | FastAPI orchestrator — one endpoint per mode plus hybrid, compose, and planner |
| **Pipelines** | Road · Rail · Air · Water — each with its own data sources and ML where it matters |
| **Intelligence** | Gemini intent parsing, delay/OTP models, template or LLM explanations |
| **Data** | TomTom · RailRadar · OpenFlights · PortWatch · Supabase · Redis · Postgres |

<p align="center">
  <img src="./docs/diagrams/png/02-user-journey.png" alt="User journey from brief to ranked routes" width="900"/>
</p>

---

## Pipelines at a glance

| Mode | API | Primary data | Docs |
|------|-----|--------------|------|
| **Road** | `POST /road/optimize` | TomTom · OpenWeather · ML delay | [road.md](./docs/pipelines/road.md) |
| **Rail** | `POST /railway/optimize` | Schedules · tariffs · delay ML · geometry | [rail.md](./docs/pipelines/rail.md) |
| **Air** | `POST /air/optimize` | OpenFlights · OTP · international graph | [air.md](./docs/pipelines/air.md) |
| **Water** | `POST /water/optimize` | PortWatch (~350 ports) · sea-lane graph | [water.md](./docs/pipelines/water.md) |
| **Hybrid** | `POST /optimize` · `/comparator/routes` | All four in parallel | [hybrid.md](./docs/pipelines/hybrid.md) |
| **Composer** | `POST /compose` · `/compose/stream` | Chained hub templates | [architecture.md](./docs/architecture.md) |

<p align="center">
  <img src="./docs/diagrams/png/04-comparator-hybrid.png" alt="Comparator and hybrid compose flow" width="900"/>
</p>

---

## For developers

**Stack:** Next.js 16 · React 19 · FastAPI · Python 3.11+ · Supabase · Redis · GCP Cloud Run · Vercel · Gemini 2.5 Flash

```bash
# Backend
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt && cp .env.example .env
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev   # → http://localhost:3000
```

| Resource | Path |
|----------|------|
| Documentation index | [docs/README.md](./docs/README.md) |
| Architecture & API map | [docs/architecture.md](./docs/architecture.md) |
| API request/response schemas | [docs/miscellaneous/api_contract.md](./docs/miscellaneous/api_contract.md) |
| Deployment (Vercel · Cloud Run · APK) | [docs/deployment.md](./docs/deployment.md) |
| Domain deep-dives (rail data, air OTP, intl routing, …) | [docs/miscellaneous/](./docs/miscellaneous/) |
| Presentation kit (slides + diagrams) | [docs/ppt-info/](./docs/ppt-info/) |
| All diagrams (PNG · SVG · Mermaid) | [docs/diagrams/](./docs/diagrams/) |

**Production:** [logi-flow-solution-challenge-2026.vercel.app](https://logi-flow-solution-challenge-2026.vercel.app) · API [health](https://logiflow-api-sbexkjk72q-el.a.run.app/health)

---

## Team

Built by **Neural Foundry** for the **Google Solution Challenge 2026**.

| Member | Focus |
|--------|-------|
| Kavya Bhatiya | Founder · road pipeline · hybrid scoring · auth/planner · deployment |
| Ojas Srivastava | Technical lead · Next.js · rail · compose · Supabase · GCP |
| Shreya | Water/maritime pipeline · PortWatch · cockpit UI |
| Samanvitha Bolisetty | Air cargo · OTP scoring · international routing |

---

## A note from the team

We built LogiFlow because logistics should not be a guessing game. Every farmer, factory owner, and small business deserves the same clarity that large freight desks take for granted — **see every option, understand the tradeoff, and ship with confidence.**

This repository is our finished submission: working product, real pipelines, and documentation we would hand to the next engineer on day one. Thank you for taking the time to explore what we made. We hope it helps someone move cargo smarter, somewhere in India or beyond.

— **Kavya, Ojas, Shreya & Samanvitha** · Neural Foundry · 2026

---

## License

Competition submission — **team members only**. External reuse or redistribution is not permitted.  
All rights reserved © 2026 **Kavya Bhatiya**
