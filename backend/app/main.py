from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.optimize import router as optimize_router
from app.routes.rail_routes import router as rail_router
from app.routes.road_routes import road_router
from app.routes.water_routes import water_router
from app.routes.air_routes import air_router
from app.routes.explain_routes import router as explain_router

app = FastAPI(title="LogiFlow — Multimodal Cargo Optimizer")

# CORS — allow Vercel frontend, localhost dev, and Capacitor mobile apps
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://logi-flow-solution-challenge-2026.vercel.app",
    ],
    allow_origin_regex=".*",  # for mobile apps (Capacitor sends no origin / origin=null)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(optimize_router)
app.include_router(rail_router)
app.include_router(road_router)
app.include_router(water_router)
app.include_router(air_router)
app.include_router(explain_router)
