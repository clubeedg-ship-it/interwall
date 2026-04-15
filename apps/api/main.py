"""
Interwall Inventory OS — FastAPI Application
Single-user inventory management backend.
"""
import os
import logging

# Configure logging so email_poller output is visible
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s: %(message)s",
)
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

import db
from auth import router as auth_router
from routers.health import router as health_router
from routers.products import router as products_router
from routers.compositions import router as compositions_router
from routers.fixed_costs import router as fixed_costs_router
from routers.profit import router as profit_router
from routers.stock_lots import router as stock_lots_router
from routers.stock_transfer import router as stock_transfer_router
from routers.categories import router as categories_router
from routers.shelves import router as shelves_router
from routers.vat_rates import router as vat_rates_router
from routers.item_groups import router as item_groups_router
from routers.builds import router as builds_router
from routers.external_xref import router as external_xref_router
from routers.zones import router as zones_router
from email_poller.poller import poll_once
from poller.bol_poller import poll_bol_once
from ingestion.worker import process_pending_events

scheduler = BackgroundScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize DB pool and email poller on startup; close on shutdown."""
    db.init_pool()
    # Run email poller twice a day: 8:00 and 20:00
    scheduler.add_job(
        poll_once, CronTrigger(hour='8,20', minute=0),
        id='email_poll',
        max_instances=1,
        coalesce=True,
    )
    # Also run once on startup (after 10s delay to let DB settle)
    scheduler.add_job(
        poll_once, 'date',
        id='email_poll_startup',
        run_date=None,  # runs immediately
        max_instances=1,
    )
    # Bol.com API order poller (D-097): runs every N minutes if configured
    bol_interval = int(os.environ.get("BOL_POLL_INTERVAL_MINUTES", "10"))
    if os.environ.get("BOL_CLIENT_ID"):
        scheduler.add_job(
            poll_bol_once,
            'interval',
            minutes=bol_interval,
            id='bol_poll',
            max_instances=1,
            coalesce=True,
        )
        scheduler.add_job(
            poll_bol_once,
            'date',
            id='bol_poll_startup',
            run_date=None,
            max_instances=1,
        )
    interval = int(os.getenv("INGESTION_WORKER_INTERVAL_MINUTES", "5"))
    scheduler.add_job(
        process_pending_events,
        "interval",
        minutes=interval,
        id="ingestion_worker",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        process_pending_events,
        "date",
        id="ingestion_worker_startup",
        run_date=None,
    )
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)
    db.close_pool()


app = FastAPI(
    title="Interwall Inventory OS",
    version="1.0.0",
    lifespan=lifespan,
)

# Session middleware — must be added before routers
# SESSION_SECRET must be at least 32 characters
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ["SESSION_SECRET"],
    session_cookie="interwall_session",
    https_only=False,  # False for local Docker dev; set True in production
    same_site="lax",
)

# Manual poll trigger
from fastapi import Depends
from auth import require_session
import threading

@app.post("/api/poll-now")
def trigger_poll(session=Depends(require_session)):
    """Manually trigger the email poller. Fetches ALL emails (including read ones)."""
    thread = threading.Thread(target=lambda: poll_once(fetch_all=True), daemon=True)
    thread.start()
    return {"ok": True, "message": "Email poll started (fetching all emails)"}

# Routers
app.include_router(auth_router)
app.include_router(health_router)
app.include_router(products_router)
app.include_router(compositions_router)
app.include_router(fixed_costs_router)
app.include_router(profit_router)
app.include_router(stock_lots_router)
app.include_router(stock_transfer_router)
app.include_router(categories_router)
app.include_router(shelves_router)
app.include_router(vat_rates_router)
app.include_router(item_groups_router)
app.include_router(builds_router)
app.include_router(external_xref_router)
app.include_router(zones_router)
