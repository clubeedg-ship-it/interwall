"""
Session-based authentication for Interwall Inventory OS.
Single user. Password stored as bcrypt hash in users table.
Session signed with itsdangerous via Starlette SessionMiddleware.
"""
from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from fastapi.responses import JSONResponse
from passlib.hash import bcrypt

from db import get_conn

router = APIRouter(prefix="/api/auth", tags=["auth"])


def require_session(request: Request) -> dict:
    """
    FastAPI dependency. Returns session dict if user is logged in.
    Raises HTTP 401 if no valid session cookie is present.
    """
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return {"user_id": user_id}


@router.post("/login")
def login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
):
    """
    Accepts username + password as form data.
    On success: sets signed httpOnly session cookie and returns 200.
    On failure: returns 401.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, password_hash FROM users WHERE username = %s",
                (username,),
            )
            row = cur.fetchone()

    if row is None or not bcrypt.verify(password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    request.session["user_id"] = str(row["id"])
    return JSONResponse({"ok": True})


@router.post("/logout")
def logout(request: Request):
    """Clears the session cookie."""
    request.session.clear()
    return JSONResponse({"ok": True})


@router.get("/me")
def me(session: dict = Depends(require_session)):
    """Returns current user_id from session. Useful for frontend session check."""
    return {"user_id": session["user_id"]}
