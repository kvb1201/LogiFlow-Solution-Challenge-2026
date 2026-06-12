# Slide 4 — Opportunities / Differentiation / USP

**Template asks:** How different? How does it solve the problem? USP?

---

## How it solves the problem

| Pain | LogiFlow answer |
|------|-----------------|
| Mode silos | One comparator run scores **all four modes** on the same cargo + priority |
| Opaque pricing | **IRCA rail tariffs**, TomTom road costs, air/water freight models in INR |
| Unreliable ETAs | **ML delay models** (road scrape, rail delays, water ETA) adjust time + risk |
| Complex rural legs | **Hybrid composer** + geo-hub finder chains village → station → port |
| No accountability | **Saved plans** + route health + reoptimization for active shipments |

---

## How we are different (vs typical tools)

- **Not mock data:** Returns `no_routes` when a corridor is undrivable or unsupported — no fabricated metrics.
- **Not road-only:** Rail parcel vans, maritime port graphs (~350 ports), and air OTP scoring in the same product.
- **Not static:** Live train APIs, traffic-aware road routing, weather enrichment, waiting room on overload.
- **Not black-box:** Template + **Gemini** explanations per mode; comparator shows **each pipeline’s best pick** side by side.

---

## USP (put in large text on slide)

**Compare every major freight mode on cost, time, and risk — in one AI-ranked run.**

---

## Secondary USPs (pick 2 for smaller bullets)

- Plain-English shipment brief → structured constraints (budget, deadline, cargo type)
- Chained **hybrid** itineraries across hubs (not just single-mode winners)
- Production deployment: **Vercel + GCP Cloud Run** with rate limits and warm-start

---

## Speaker note

> Our wedge is honest multimodal comparison for India-first corridors, with global water/air where data exists.
