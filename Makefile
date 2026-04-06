.PHONY: setup install dev dev-frontend dev-backend clean

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

# Run backend only
dev-backend:
	@echo "⚙️ Starting Backend (FastAPI)..."
	cd backend && ./run

# Clean environments if needed
clean:
	@echo "🧹 Cleaning up node_modules and venv..."
	rm -rf frontend/node_modules
	rm -rf backend/venv
