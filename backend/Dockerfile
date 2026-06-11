# LogiFlow API — optimized for GCP Cloud Run (1Gi+ RAM, long compose timeouts).
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080 \
    WATER_SKIP_CONGESTION_SCAN=1 \
    WATER_AUTO_TRAIN=off \
    RAIL_PERMANENT_CACHE=false \
    RAIL_PRELOAD_ON_STARTUP=false

WORKDIR /app

# Build deps for scipy/sklearn wheels if needed
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
