"""
Omiximo Inventory OS — FastAPI Application
Single-user inventory management backend.
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware
from apscheduler.schedulers.background import BackgroundScheduler

import db
from auth import router as auth_router
from routers.health import router as health_router
from routers.products import router as products_router
from routers.compositions import router as compositions_router
from routers.fixed_costs import router as fixed_costs_router
from routers.profit import router as profit_router
from routers.stock_lots import router as stock_lots_router
from routers.categories import router as categories_router
from routers.shelves import router as shelves_router
from email_poller.poller import poll_once

scheduler = BackgroundScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize DB pool and email poller on startup; close on shutdown."""
    db.init_pool()
    scheduler.add_job(
        poll_once, 'interval', seconds=60,
        id='email_poll',
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)
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
app.include_router(products_router)
app.include_router(compositions_router)
app.include_router(fixed_costs_router)
app.include_router(profit_router)
app.include_router(stock_lots_router)
app.include_router(categories_router)
app.include_router(shelves_router)
