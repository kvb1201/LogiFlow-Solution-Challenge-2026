# Deployment

## Backend (Render)

### Setup

1. Create a new **Web Service** on [Render](https://render.com)
2. Connect your GitHub repository
3. Set the following:

| Setting | Value |
|---------|-------|
| **Root Directory** | `backend` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| **Python Version** | 3.10+ |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ | Google Gemini API key |
| `TOMTOM_API_KEY` | ✅ | TomTom routing API key |
| `REDIS_URL` | ❌ | Redis connection URL (omit for in-memory cache) |
| `RAIL_PERMANENT_CACHE` | ❌ | Set to `true` to persist rail cache indefinitely |
| `GEMINI_MODEL` | ❌ | Gemini model (default: `gemini-1.5-flash-latest`) |
| `GEMINI_TIMEOUT_S` | ❌ | Gemini timeout in seconds (default: `5`) |
| `CONFIRMTKT_CONNECT_TIMEOUT_S` | ❌ | ConfirmTkt connect timeout (default: `3`) |
| `CONFIRMTKT_READ_TIMEOUT_S` | ❌ | ConfirmTkt read timeout (default: `4`) |

### Health Check

```
GET /
→ {"status": "ok"}
```

---

## Frontend (Vercel)

### Setup

1. Create a new project on [Vercel](https://vercel.com)
2. Connect your GitHub repository
3. Set the following:

| Setting | Value |
|---------|-------|
| **Root Directory** | `frontend` |
| **Framework Preset** | Next.js |
| **Build Command** | `npm run build` |
| **Output Directory** | `.next` (auto-detected) |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | ✅ | Backend URL (e.g., `https://logiflow-api.onrender.com`) |

### Configuration

Ensure `next.config.js` has:
```js
module.exports = {
  output: "export",  // Static site generation for Capacitor compatibility
}
```

---

## Mobile (Capacitor — Android)

### Prerequisites

- Node.js 18+
- Android Studio with SDK 33+
- Java 17

### Setup

```bash
cd frontend

# Install Capacitor
npm install @capacitor/core @capacitor/cli
npx cap init LogiFlow com.logiflow.app --web-dir=out

# Add Android platform
npx cap add android

# Build and sync
npm run build
npx cap sync android
```

### Build APK

```bash
# Open in Android Studio
npx cap open android

# Or build from command line
cd android
./gradlew assembleDebug
```

The APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

### Configuration

In `capacitor.config.ts`:
```typescript
const config: CapacitorConfig = {
  appId: 'com.logiflow.app',
  appName: 'LogiFlow',
  webDir: 'out',
  server: {
    url: 'https://logiflow-api.onrender.com',  // Production API
    cleartext: true,  // For local dev with HTTP
  }
};
```

---

## Local Development

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Add API keys
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

### Redis (Optional)
```bash
# macOS
brew install redis
brew services start redis

# Or use Docker
docker run -d -p 6379:6379 redis:alpine
```

Without Redis, the backend falls back to in-memory caching automatically.
