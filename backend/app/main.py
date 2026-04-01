from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.optimize import router as optimize_router

app = FastAPI()

# CORS (IMPORTANT for frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(optimize_router)