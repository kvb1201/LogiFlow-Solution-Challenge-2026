# Slide 10 — Estimated Implementation Cost (Optional)

**Template marks this optional — include for credibility.**

---

## Slide title
**Estimated monthly operating cost (team profile)**

---

## Summary table (paste on slide)

| Service | Tier | Est. monthly (USD) |
|---------|------|-------------------|
| Vercel (frontend) | Hobby / Pro | $0 – $20 |
| GCP Cloud Run | 1 min instance · 2 vCPU · 2 GiB | $30 – $80 |
| Supabase | Free / Pro | $0 – $25 |
| Redis (Upstash or similar) | Free tier | $0 – $10 |
| TomTom API | Pay-as-you-go | $10 – $50 |
| OpenWeather | Free tier | $0 |
| Gemini API | Pay-as-you-go | $5 – $30 |
| Postgres (planner) | Managed / Supabase | $0 – $25 |
| **Total (student MVP)** | | **~$45 – $150 / mo** |

---

## One-line note

Costs scale with traffic; **rate limits + response cache** on `/optimize` keep Cloud Run spend predictable for demo/judging load.

---

## Development cost (optional footnote)

- **Team time:** 4 members × ~3 months (GDSC Solution Challenge scope)  
- **Infra during build:** mostly free tiers + GCP credits if available  

---

## Speaker note

> We moved off Render 512MB limits to Cloud Run with lazy rail data loading — production-stable for demos without enterprise budget.
