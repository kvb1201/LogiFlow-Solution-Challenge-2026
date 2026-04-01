# 📡 LogiFlow API Contract

Defines the request/response structure for backend ↔ frontend communication.

---

# 🚀 Base URL

```
http://localhost:8000
```

---

# 🔹 Endpoint: Optimize Route

### POST `/optimize`

---

# 📥 Request Body

```json
{
  "source": "Surat",
  "destination": "Mumbai",
  "priority": "Fast",
  "preferences": {
    "preferred_mode": "road"
  },
  "constraints": {
    "excluded_modes": ["water"]
  }
}
```

---

## 🔸 Fields Explanation

| Field | Type | Description |
|------|------|------------|
| source | string | Starting location |
| destination | string | Ending location |
| priority | string | One of: Fast, Cheap, Safe |
| preferences.preferred_mode | string/null | Preferred transport mode |
| constraints.excluded_modes | array | Modes to exclude |

---

# 📤 Response Body

```json
{
  "best_route": {
    "type": "Road",
    "mode": "road",
    "time": 6,
    "cost": 2500,
    "risk": 0.4,
    "segments": [
      {
        "from": { "name": "Surat", "lat": 21.1702, "lng": 72.8311 },
        "to": { "name": "Mumbai", "lat": 19.0760, "lng": 72.8777 },
        "mode": "road"
      }
    ]
  },
  "alternatives": [
    {
      "type": "Rail",
      "mode": "rail",
      "time": 5,
      "cost": 1800,
      "risk": 0.5,
      "segments": [...]
    }
  ]
}
```

---

## 🔸 Response Explanation

### best_route
- The optimal route based on priority + constraints

### alternatives
- Other possible routes sorted by score

---

## 🔸 Route Object

| Field | Type | Description |
|------|------|------------|
| type | string | Human-readable label |
| mode | string | road / rail / water / hybrid |
| time | number | Estimated time |
| cost | number | Estimated cost |
| risk | number | Risk score (0–1) |
| segments | array | Route breakdown |

---

## 🔸 Segment Object

| Field | Type | Description |
|------|------|------------|
| from | object | { name, lat, lng } |
| to | object | { name, lat, lng } |
| mode | string | Mode of this segment |

---

# ⚠️ Important Rules

- Backend always returns coordinates (lat, lng)
- Frontend should NOT maintain its own location mapping
- Response structure must remain consistent

---

# 🧪 Example Curl Request

```bash
curl -X POST http://localhost:8000/optimize \
-H "Content-Type: application/json" \
-d '{
  "source": "Surat",
  "destination": "Mumbai",
  "priority": "Fast"
}'
```

---

# 🚀 Future Extensions

Planned additions:

- simulation endpoint
- ML predictions (delay/risk)
- real-time traffic integration

---

# 📌 Summary

This contract ensures:
- consistent frontend-backend communication
- predictable data structure
- scalable system evolution
