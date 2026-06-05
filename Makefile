.PHONY: setup install dev dev-frontend dev-backend clean collect-delays collect-delays-pilot validate-active-trains validate-active-trains-resume discover-trains-corridors discover-trains-corridors-pilot discover-trains-corridors-resume validate-discovered-trains validate-discovered-trains-resume build-station-coords build-station-coords-geocode

# IR delay CSV — see docs/INDIAN_RAILWAYS_DATA.md (history = runningstatus, not unlimited NTES)
# Step 1: filter 2017 CSV → trains that still show on runningstatus.in (~1–2h)
validate-active-trains:
	cd backend && rm -f data/ir_delay_scrape/active_validation_checkpoint.json && PYTHONUNBUFFERED=1 ./venv/bin/python scripts/build_active_train_list.py --lookback 3 --resume --log-interval 60

validate-active-trains-resume:
	cd backend && PYTHONUNBUFFERED=1 ./venv/bin/python scripts/build_active_train_list.py --lookback 3 --resume --log-interval 60

# Step 1b (parallel): scrape RailYatri/ConfirmTkt corridors → discovered_trains.txt (~2–4h cities mode)
discover-trains-corridors-pilot:
	cd backend && PYTHONUNBUFFERED=1 ./venv/bin/python scripts/discover_trains_from_corridors.py --pilot --resume --log-interval 60

discover-trains-corridors:
	cd backend && rm -f data/ir_delay_scrape/.discover_corridors.lock data/ir_delay_scrape/discovered_corridors_checkpoint.json && PYTHONUNBUFFERED=1 ./venv/bin/python scripts/discover_trains_from_corridors.py --mode cities --bidirectional --sleep 2.0 --log-interval 60

discover-trains-corridors-resume:
	cd backend && PYTHONUNBUFFERED=1 ./venv/bin/python scripts/discover_trains_from_corridors.py --mode cities --bidirectional --sleep 2.0 --resume --log-interval 60

# Step 2b (after discovery): validate only trains not in 2017 CSV (separate checkpoint)
validate-discovered-trains:
	cd backend && PYTHONUNBUFFERED=1 ./venv/bin/python scripts/build_active_train_list.py --trains-file data/ir_delay_scrape/discovered_not_in_2017.txt --lookback 3 --log-interval 60

validate-discovered-trains-resume:
	cd backend && PYTHONUNBUFFERED=1 ./venv/bin/python scripts/build_active_train_list.py --trains-file data/ir_delay_scrape/discovered_not_in_2017.txt --lookback 3 --resume --log-interval 60

collect-delays:
	cd backend && ./venv/bin/python scripts/collect_ir_delay_history.py --days 90 --resume --strategy history

collect-delays-3d:
	cd backend && rm -f data/ir_delay_scrape/.collector.lock && PYTHONUNBUFFERED=1 ./venv/bin/python scripts/collect_ir_delay_history.py --days 3 --resume --strategy history --sleep 1.1 --log-interval 60

# Run in a dedicated terminal tab — progress every 60s (~10h for 11k×3d)
collect-delays-3d-foreground:
	cd backend && rm -f data/ir_delay_scrape/.collector.lock && PYTHONUNBUFFERED=1 ./venv/bin/python scripts/collect_ir_delay_history.py --days 3 --resume --strategy history --sleep 1.1 --log-interval 60

collect-delays-pilot:
	cd backend && ./venv/bin/python scripts/collect_ir_delay_history.py --pilot

collect-delays-live:
	cd backend && ENABLE_IRCTC_RAPIDAPI=true ./venv/bin/python scripts/collect_ir_delay_history.py --strategy live-today --max-trains 50

# Setup dependencies for both projects
setup: install

install:
	@echo "📦 Installing frontend dependencies..."
	cd frontend && npm install
	@echo "🐍 Installing backend dependencies..."
	cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt

# Run everything concurrently
dev:
	@echo "🚀 Starting LogiFlow (Frontend + Backend)..."
	make -j 2 dev-backend dev-frontend

# Run frontend only
dev-frontend:
	@echo "💻 Starting Frontend (Next.js)..."
	cd frontend && npm run dev

# Fetch online IR catalogs (datameet + vstflugel) + build station_coords_cache.json
build-station-coords:
	cd backend && PYTHONUNBUFFERED=1 ./venv/bin/python -u scripts/build_station_coords_cache.py --force-fetch

# Fill remaining gaps via ORS → TomTom (parallel, live progress logs)
build-station-coords-geocode:
	cd backend && PYTHONUNBUFFERED=1 ./venv/bin/python -u scripts/build_station_coords_cache.py --geocode-missing --workers 6 --log-every 25

# Run backend only
dev-backend:
	@echo "⚙️ Starting Backend (FastAPI)..."
	cd backend && ./run

# Clean environments if needed
clean:
	@echo "🧹 Cleaning up node_modules and venv..."
	rm -rf frontend/node_modules
	rm -rf backend/venv
