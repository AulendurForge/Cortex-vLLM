from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select
from typing import Optional
from ..config import get_settings
from ..crypto import pwd_context


router = APIRouter()


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = 'User'
    org_id: Optional[int] = None


class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None
    org_id: Optional[int] = None
    status: Optional[str] = None


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    org_id: Optional[int]
    status: str


def _get_session():
    try:
        from ..main import SessionLocal  # type: ignore
        return SessionLocal
    except Exception:
        return None


@router.get("/users", response_model=list[UserOut])
async def list_users(
    q: str | None = None,
    org_id: int | None = None,
    role: str | None = None,
    status: str | None = None,
    sort: str = "created_at:desc",
    limit: int = 100,
    offset: int = 0,
    settings = Depends(get_settings),
):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    from ..models import User
    async with SessionLocal() as session:
        stmt = select(User)
        if q:
            stmt = stmt.where(User.username.ilike(f"%{q}%"))
        if org_id is not None:
            stmt = stmt.where(User.org_id == org_id)
        if role:
            stmt = stmt.where(User.role == role)
        if status:
            stmt = stmt.where(User.status == status)

        # Sort parsing: field:dir
        try:
            field, direction = (sort or "").split(":", 1)
        except ValueError:
            field, direction = "created_at", "desc"
        direction = direction.lower() if direction else "desc"
        desc = direction == "desc"
        from sqlalchemy import desc as sqldesc, asc as sqlasc
        order_col = {
            "id": User.id,
            "username": User.username,
            "created_at": User.created_at,
            "role": User.role,
            "status": User.status,
        }.get(field, User.created_at)
        stmt = stmt.order_by(sqldesc(order_col) if desc else sqlasc(order_col))

        stmt = stmt.limit(max(1, min(limit, 500))).offset(max(0, offset))
        rows = (await session.execute(stmt)).scalars().all()
        return [UserOut(id=r.id, username=r.username, role=r.role, org_id=r.org_id, status=r.status) for r in rows]


@router.post("/users", response_model=UserOut)
async def create_user(body: UserCreate):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    from ..models import User
    async with SessionLocal() as session:
        exists = (await session.execute(select(User).where(User.username == body.username))).scalar_one_or_none()
        if exists:
            raise HTTPException(status_code=409, detail="username_exists")
        user = User(
            username=body.username,
            password_hash=pwd_context.hash(body.password),
            role=body.role,
            org_id=body.org_id,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return UserOut(id=user.id, username=user.username, role=user.role, org_id=user.org_id, status=user.status)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: int, body: UserUpdate):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    from ..models import User
    async with SessionLocal() as session:
        user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="not_found")
        if body.password is not None:
            user.password_hash = pwd_context.hash(body.password)
        if body.role is not None:
            user.role = body.role
        if body.org_id is not None:
            user.org_id = body.org_id
        if body.status is not None:
            user.status = body.status
        await session.commit()
        await session.refresh(user)
        return UserOut(id=user.id, username=user.username, role=user.role, org_id=user.org_id, status=user.status)


@router.delete("/users/{user_id}")
async def delete_user(user_id: int):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    from ..models import User, APIKey, Usage
    from sqlalchemy import update
    async with SessionLocal() as session:
        user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="not_found")
        # Detach foreign key references before deleting to avoid FK constraint errors
        try:
            await session.execute(update(APIKey).where(APIKey.user_id == user_id).values(user_id=None))
            await session.execute(update(Usage).where(Usage.user_id == user_id).values(user_id=None))
        except Exception:
            # Best-effort; continue to attempt delete
            pass
        await session.delete(user)
        await session.commit()
        return {"status": "ok"}


class UserLookupOut(BaseModel):
    id: int
    username: str


@router.get("/users/lookup", response_model=list[UserLookupOut])
async def users_lookup(q: str | None = None, limit: int = 100):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    from ..models import User
    async with SessionLocal() as session:
        stmt = select(User)
        if q:
            stmt = stmt.where(User.username.ilike(f"%{q}%"))
        rows = (await session.execute(stmt.order_by(User.username.asc()).limit(max(1, min(limit, 1000))))).scalars().all()
        return [UserLookupOut(id=r.id, username=r.username) for r in rows]


