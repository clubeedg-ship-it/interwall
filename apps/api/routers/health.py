"""Health check endpoint. Returns 200 if API is running and DB is reachable."""
from fastapi import APIRouter
from db import get_conn

router = APIRouter(tags=["health"])


@router.get("/api/health")
def health():
    """Returns {'status': 'ok'} if API and database are reachable."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
    return {"status": "ok"}
