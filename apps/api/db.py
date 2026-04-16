"""
Database connection pool for FastAPI.
Uses ThreadedConnectionPool (psycopg2) — appropriate for single-user sync endpoints.
DATABASE_URL format: postgresql://user:password@host:5432/dbname
"""
import os
from pathlib import Path
import psycopg2
import psycopg2.pool
import psycopg2.extras
from contextlib import contextmanager

_pool: psycopg2.pool.ThreadedConnectionPool | None = None
_SQL_DIR = Path(__file__).resolve().parent / "sql"


def init_pool() -> None:
    """Initialize the connection pool. Called once at FastAPI startup."""
    global _pool
    if _pool is not None:
        return
    database_url = os.environ["DATABASE_URL"]
    _pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=1,
        maxconn=10,
        dsn=database_url,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def close_pool() -> None:
    """Close all connections. Called at FastAPI shutdown."""
    global _pool
    if _pool is not None:
        _pool.closeall()
        _pool = None


def apply_runtime_sql_files(filenames: list[str]) -> None:
    """
    Apply idempotent SQL files against the live database.

    This keeps long-lived dev volumes aligned with repo SQL after the initial
    Postgres bootstrap has already happened.
    """
    assert _pool is not None, "Connection pool not initialized"
    conn = _pool.getconn()
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            for filename in filenames:
                sql_path = _SQL_DIR / filename
                with sql_path.open("r", encoding="utf-8") as f:
                    cur.execute(f.read())
    finally:
        conn.autocommit = False
        _pool.putconn(conn)


@contextmanager
def get_conn():
    """
    Context manager that yields a psycopg2 connection from the pool.
    Commits on success, rolls back on exception, always returns connection to pool.

    Usage:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
    """
    assert _pool is not None, "Connection pool not initialized"
    conn = _pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)
