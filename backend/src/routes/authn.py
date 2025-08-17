from fastapi import APIRouter, HTTPException, Depends, Response, Request
from pydantic import BaseModel
from sqlalchemy import select
from ..config import get_settings
from ..crypto import pwd_context


router = APIRouter()


class LoginRequest(BaseModel):
  username: str
  password: str


@router.post("/login")
async def login(body: LoginRequest, response: Response, settings = Depends(get_settings)):
  """Dev-grade login that sets an httpOnly cookie with the username.
  In production, replace with a signed/expiring token or session middleware.
  """
  # Lazy import to avoid cycles
  from ..main import SessionLocal  # type: ignore
  from ..models import User  # type: ignore
  if SessionLocal is None:
    raise HTTPException(status_code=503, detail="Database not ready")
  async with SessionLocal() as session:
    result = await session.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not pwd_context.verify(body.password, user.password_hash):
      raise HTTPException(status_code=401, detail="invalid_credentials")
    # Set a very simple cookie for dev
    response.set_cookie(
      key="cortex_session",
      value=f"{user.username}",
      httponly=True,
      samesite="lax",
      secure=False,
      max_age=60 * 60 * 8,
      path="/",
    )
    return {"status": "ok", "user": {"username": user.username, "role": user.role}}


@router.post("/logout")
async def logout(response: Response):
  response.delete_cookie("cortex_session", path="/")
  return {"status": "ok"}


@router.get("/me")
async def me(request: Request, settings = Depends(get_settings)):
  from ..main import SessionLocal  # type: ignore
  from ..models import User  # type: ignore
  if SessionLocal is None:
    raise HTTPException(status_code=503, detail="Database not ready")
  username = request.cookies.get("cortex_session")
  if not username:
    raise HTTPException(status_code=401, detail="unauthenticated")
  async with SessionLocal() as session:
    result = await session.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
      raise HTTPException(status_code=401, detail="unauthenticated")
    return {"username": user.username, "role": user.role}


