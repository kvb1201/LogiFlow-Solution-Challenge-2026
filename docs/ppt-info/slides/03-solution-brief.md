# Slide 3 — Brief About Your Solution

**Keep to 4–5 short bullets on the slide.**

---

## Slide title
**LogiFlow — Multimodal Cargo Intelligence**

---

## Bullets (copy-paste)

- **What:** Web + Android app that plans and **compares road, rail, air, and water** freight for Indian and global corridors.
- **How:** Five parallel pipelines normalize every mode into one schema; **comparator** picks the best single mode; **hybrid composer** chains legs (e.g. road → rail → air).
- **AI:** Shippers describe cargo in **plain English**; **Google Gemini** parses intent and explains tradeoffs; ML models predict delays and risk.
- **Output:** Ranked routes with **maps, INR cost, ETA, risk %**, saved shipment plans, and route health monitoring.
- **Stack:** Next.js on Vercel → FastAPI on **Google Cloud Run** → Supabase / Redis / Postgres.

---

## One-sentence version (if space is tight)

LogiFlow lets shippers enter a corridor once and get an honest, scored comparison of road, rail, air, and water — with AI briefs, live maps, and chained hybrid itineraries.

---

## Speaker note (30 sec)

> Unlike single-mode tools, we run all pipelines in parallel, reject fake routes when data is missing, and explain why one mode wins.
