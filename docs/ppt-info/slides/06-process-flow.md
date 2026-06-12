# Slide 6 — Process Flow / Use-Case Diagram

**Diagram file:** `../diagrams/process-flow-slide.png` (ready) or `process-flow-slide.mmd`

---

## Slide title
**End-to-end user flow**

---

## Caption (under diagram, 1 line)

Shipper describes cargo → AI parses constraints → user picks single mode, comparator, or hybrid → engines return scored routes with maps → optional saved plan with route health.

---

## Actor steps (for presenter, not all on slide)

| Step | Action | System |
|------|--------|--------|
| 1 | Enter corridor + cargo (text/voice) | Frontend |
| 2 | Parse brief to structured fields | Gemini `/intent/parse` |
| 3 | Choose Road / Rail / Air / Water / Comparator / Hybrid | UI |
| 4 | Run optimize or compose | Cloud Run pipelines |
| 5 | View maps, costs, risk, explanations | Results pages |
| 6 | (Optional) Google login + save report | Planner API + Postgres |

---

## Use-case summary bullets (if no diagram room)

- **UC1** Optimize single mode for a corridor  
- **UC2** Compare all four modes (comparator)  
- **UC3** Build chained hybrid itinerary  
- **UC4** Save and monitor active shipment plan  

---

## Export instructions

1. Open `process-flow-slide.mmd` in https://mermaid.live  
2. Theme: **dark** (matches LogiFlow UI)  
3. Export PNG width **1600px**  
4. Insert on slide 6; leave template title visible at top  
