from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.optimize import router as optimize_router
from app.routes.comparator import router as comparator_router
from app.routes.rail_routes import router as rail_router
from app.routes.road_routes import road_router
from app.routes.water_routes import water_router
from app.routes.air_routes import air_router
from app.routes.explain_routes import router as explain_router
from app.routes.intent_routes import intent_router
from app.routes.compose import router as compose_router
from app.routes.location_routes import location_router

from app.routes.auth_routes import router as auth_router
from app.routes.planner_routes import router as planner_router
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


def _warm_rail_data():
    """
    Optional rail CSV preload. Disabled by default on Render free tier (512MB RAM).
    Set RAIL_PRELOAD_ON_STARTUP=true when the instance has >=1GB memory.
    """
    import os

    if os.getenv("RAIL_PRELOAD_ON_STARTUP", "").lower() not in ("1", "true", "yes"):
        print("[startup] Rail preload skipped (set RAIL_PRELOAD_ON_STARTUP=true to enable)")
        return
    try:
        from app.pipelines.rail.data_loader import load_data

        load_data()
        print("[startup] Rail schedule data pre-loaded")
    except Exception as exc:
        print(f"[startup] Rail preload skipped: {exc}")

@app.on_event("startup")
async def startup_event():
    from app.config.database import engine, Base
    import app.models.domain  # registers User, UserPreferences, ShipmentReport with Base
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    _warm_rail_data()


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(optimize_router)
app.include_router(comparator_router)
app.include_router(rail_router)
app.include_router(road_router)
app.include_router(water_router)
app.include_router(air_router)
app.include_router(explain_router)
app.include_router(intent_router)
app.include_router(compose_router)
app.include_router(location_router)

app.include_router(auth_router)
app.include_router(planner_router)
