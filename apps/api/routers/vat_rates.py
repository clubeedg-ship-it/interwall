"""
VAT rates per marketplace/country.
GET: list all rates. PUT: update a rate. POST: add new marketplace.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from db import get_conn
from auth import require_session

router = APIRouter(prefix="/api/vat-rates", tags=["vat-rates"])


class VatRateUpdate(BaseModel):
    rate: float


class VatRateCreate(BaseModel):
    marketplace: str
    country: str
    rate: float


@router.get("")
def list_vat_rates(session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, marketplace, country, rate, updated_at "
                "FROM vat_rates ORDER BY marketplace"
            )
            return cur.fetchall()


@router.put("/{rate_id}")
def update_vat_rate(rate_id: str, body: VatRateUpdate, session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE vat_rates SET rate = %s, updated_at = NOW() "
                "WHERE id = %s RETURNING id, marketplace, country, rate",
                (body.rate, rate_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "VAT rate not found")
            conn.commit()
            return row


@router.post("")
def create_vat_rate(body: VatRateCreate, session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO vat_rates (marketplace, country, rate) "
                "VALUES (%s, %s, %s) RETURNING id, marketplace, country, rate",
                (body.marketplace, body.country, body.rate),
            )
            row = cur.fetchone()
            conn.commit()
            return row
