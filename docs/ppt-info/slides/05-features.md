# Slide 5 — Features List

**Use two columns on slide if needed. Max ~12 bullets visible.**

---

## Core features (all modes)

1. **AI shipment brief** — natural language → cities, weight, priority, budget, deadline (`/intent/parse` + Gemini)
2. **Voice input (STT)** — describe shipment by voice on supported browsers
3. **Location funnel** — fuzzy city/station/airport resolution (9,500+ rail stations)
4. **Priority modes** — optimize for cost, time, safety, or balanced
5. **Live maps** — road polylines, rail corridor geometry, sea lanes
6. **Route explanations** — why this train / flight / road / port path was chosen
7. **Save shipment report** — planner with trip lifecycle and route health
8. **Google Sign-In** — JWT auth for dashboard and saved plans
9. **Waiting room** — queue UX when API is rate-limited (429/503)
10. **Demo corridors** — stable Delhi → Mumbai snapshot for judging

---

## Mode-specific features

| Mode | Highlights |
|------|------------|
| **Road** | TomTom traffic · tolls · multi-stop · corridor validity gate · ML delay |
| **Rail** | Cheapest / fastest / safest · IRCA tariffs · live schedules · delay ML |
| **Air** | Domestic + international · OTP congestion · confidence filter ≥60% |
| **Water** | Port graph · chokepoints · transshipment · delay/ETA ML |
| **Comparator** | 4-mode parallel score · per-pipeline best pick cards · winner + tradeoffs |
| **Hybrid** | Compose chained legs · rural hub discovery · SSE streaming results |

---

## Compact bullet list for slide (recommended)

- AI brief + voice input for shipment constraints  
- Road · Rail · Air · Water pipelines with real data sources  
- **Comparator** — all modes scored in one request  
- **Hybrid composer** — multi-leg hub chains  
- ML delay & risk on road, rail, water  
- Live maps + IRCA rail tariffs + air OTP scoring  
- Save plans · route health · Google login  
- Production on Vercel + GCP Cloud Run  
