.PHONY: setup install dev dev-frontend dev-backend clean collect-delays collect-delays-pilot validate-active-trains validate-active-trains-resume discover-trains-corridors discover-trains-corridors-pilot discover-trains-corridors-resume validate-discovered-trains validate-discovered-trains-resume build-station-coords build-station-coords-geocode fetch-air-data verify-air-data test-otp-scoring

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
	cd backend && (test -d venv || python3.13 -m venv venv) && ./venv/bin/pip install -r requirements.txt
	@$(MAKE) fix-backend-venv

# Run everything concurrently
dev:
	@echo "🚀 Starting LogiFlow (Frontend + Backend)..."
	make -j 2 dev-backend dev-frontend

# Run frontend only
dev-frontend:
	@echo "💻 Starting Frontend (Next.js)..."
	cd frontend && npm run dev

# Upload N train corridor geometries to Supabase (default 100 for audit)
sync-rail-geometry-trains:
	cd backend && ./venv/bin/python scripts/sync_rail_supabase.py --trains $(or $(TRAINS),100)

# Full all-India geometry sync (single worker)
sync-rail-geometry-full:
	cd backend && ./venv/bin/python scripts/sync_rail_supabase.py --full --verbose

# Tail all active geometry sync shard logs (verbose, live)
tail-geometry-sync:
	cd backend && ./scripts/tail_geometry_sync.sh

status-geometry-sync:
	cd backend && ./scripts/tail_geometry_sync.sh --status

# Launch N parallel geometry sync workers (disjoint origin-city shards)
# Example: make sync-rail-geometry-parallel SHARDS=4
sync-rail-geometry-parallel:
	@shards=$(or $(SHARDS),4); \
	echo "Starting $$shards parallel geometry sync workers..."; \
	for i in $$(seq 0 $$((shards - 1))); do \
	  (cd backend && ./venv/bin/python scripts/sync_rail_supabase.py --full --verbose --shard $$i --shards $$shards \
	    2>&1 | tee logs/geometry_full_sync_s$$i.log) & \
	done; \
	wait; \
	echo "All $$shards workers finished."

# Audit map geometry: reads train_route_geometry from Supabase only
audit-rail-geometry:
	cd backend && ./venv/bin/python scripts/audit_rail_geometry.py --limit $(or $(TRAINS),100)

# Push rail ML model-info to Supabase (Vercel reads without Render cold start)
sync-rail-ml-metrics:
	cd backend && ./venv/bin/python scripts/sync_rail_ml_metrics.py

# Build station_name.pdf index (7k+ stations → stations_from_pdf_cache.json)
build-station-pdf-index:
	cd backend && ./venv/bin/python -c "from app.services.station_pdf_index import build_pdf_index; n=len(build_pdf_index(force=True)); print(f'Indexed {n} stations from station_name.pdf')"

# Fetch online IR catalogs (datameet + vstflugel) + build station_coords_cache.json
build-station-coords:
	cd backend && PYTHONUNBUFFERED=1 ./venv/bin/python -u scripts/build_station_coords_cache.py --force-fetch

# Fill remaining gaps via ORS → TomTom (parallel, live progress logs)
build-station-coords-geocode:
	cd backend && PYTHONUNBUFFERED=1 ./venv/bin/python -u scripts/build_station_coords_cache.py --geocode-missing --workers 6 --log-every 25

# Train delay predictor on scraped ir_train_delays.csv (k-fold CV + date backtest)
train-delay-ml:
	cd backend && ./venv/bin/python scripts/train_delay_ml.py

rail-ml-doc:
	cd backend && ./venv/bin/python scripts/generate_rail_ml_pdf.py

# Download + trim India-focused OpenFlights / OurAirports snapshots
fetch-air-data:
	cd backend && python scripts/fetch_air_data.py

verify-air-data:
	cd backend && python scripts/verify_air_data.py

test-otp-scoring:
	cd backend && PYTHONPATH=. python -m unittest discover -s tests -p "test_otp*.py" -v

# Run backend only
dev-backend:
	@echo "⚙️ Starting Backend (FastAPI)..."
	cd backend && ./run

# Recreate venv python symlinks when packages install to 3.13 but `python` points at 3.9
fix-backend-venv:
	cd backend/venv/bin && rm -f python python3 && ln -sf python3.13 python3 && ln -sf python3.13 python

# Clean environments if needed
clean:
	@echo "🧹 Cleaning up node_modules and venv..."
	rm -rf frontend/node_modules
	rm -rf backend/venv
