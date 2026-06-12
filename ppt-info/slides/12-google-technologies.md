# Slide 12 — Google Technologies / Services Used

**Required:** template notes at least one **Google AI model or service** (e.g. Gemini).

---

## Slide title
**Google technologies in LogiFlow**

---

## Primary (large bullets on slide)

| Google product | How we use it |
|----------------|---------------|
| **Gemini 2.5 Flash** | Shipment intent parsing · comparator/hybrid explanations · follow-up Q&A assistant |
| **Google Cloud Run** | Production FastAPI backend (asia-south1) — auto-scale, always-warm min instance |
| **Google Cloud Build / Artifact Registry** | Container build & deploy via GitHub Actions |
| **Google Sign-In (OAuth 2.0)** | User authentication → JWT session for dashboard & saved plans |

---

## Secondary / supporting

| Google product | How we use it |
|----------------|---------------|
| **Google Identity Services** | Frontend OAuth client (`GOOGLE_CLIENT_ID`) |
| **Google AI (Generative Language API)** | `GEMINI_API_KEY` on backend for structured + NL outputs |
| **GCP networking & IAM** | Service accounts for Cloud Run deployment |

---

## Compact slide text (copy-paste)

- **Gemini AI** — parse plain-English shipments; explain multimodal tradeoffs  
- **Google Cloud Run** — host FastAPI optimization engine at scale  
- **Google Sign-In** — secure login for planner & saved routes  
- **GCP CI/CD** — Docker deploy from GitHub Actions  

---

## Compliance note (speaker)

Gemini is invoked **server-side** with API keys in Cloud Run secrets — not exposed to the browser. User cargo text is sent only for intent/explain endpoints the user triggers.

---

## What is NOT Google (do not list on this slide)

TomTom, Vercel, Supabase, Redis, OpenWeather — those belong on slide 9 only.
