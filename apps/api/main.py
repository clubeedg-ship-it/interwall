"""
Omiximo Inventory OS — FastAPI Application
Single-user inventory management backend.
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

import db
from auth import router as auth_router
from routers.health import router as health_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize DB pool on startup, close on shutdown."""
    db.init_pool()
    yield
    db.close_pool()


app = FastAPI(
    title="Omiximo Inventory OS",
    version="1.0.0",
    lifespan=lifespan,
)

# Session middleware — must be added before routers
# SESSION_SECRET must be at least 32 characters
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ["SESSION_SECRET"],
    session_cookie="omiximo_session",
    https_only=False,  # False for local Docker dev; set True in production
    same_site="lax",
)

# Routers
app.include_router(auth_router)
app.include_router(health_router)
