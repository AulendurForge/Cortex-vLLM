from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select
from typing import Optional
from ..config import get_settings


router = APIRouter()


class OrgCreate(BaseModel):
    name: str


class OrgUpdate(BaseModel):
    name: Optional[str] = None


class OrgOut(BaseModel):
    id: int
    name: str


def _get_session():
    try:
        from ..main import SessionLocal  # type: ignore
        return SessionLocal
    except Exception:
        return None


@router.get("/orgs", response_model=list[OrgOut])
async def list_orgs(q: str | None = None, limit: int = 100, offset: int = 0, settings = Depends(get_settings)):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    from ..models import Organization
    async with SessionLocal() as session:
        stmt = select(Organization)
        if q:
            stmt = stmt.where(Organization.name.ilike(f"%{q}%"))
        stmt = stmt.order_by(Organization.id.desc()).limit(max(1, min(limit, 500))).offset(max(0, offset))
        rows = (await session.execute(stmt)).scalars().all()
        return [OrgOut(id=r.id, name=r.name) for r in rows]


@router.post("/orgs", response_model=OrgOut)
async def create_org(body: OrgCreate):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    from ..models import Organization
    async with SessionLocal() as session:
        exists = (await session.execute(select(Organization).where(Organization.name == body.name))).scalar_one_or_none()
        if exists:
            raise HTTPException(status_code=409, detail="name_exists")
        org = Organization(name=body.name)
        session.add(org)
        await session.commit()
        await session.refresh(org)
        return OrgOut(id=org.id, name=org.name)


@router.patch("/orgs/{org_id}", response_model=OrgOut)
async def update_org(org_id: int, body: OrgUpdate):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    from ..models import Organization
    async with SessionLocal() as session:
        org = (await session.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
        if not org:
            raise HTTPException(status_code=404, detail="not_found")
        if body.name is not None:
            org.name = body.name
        await session.commit()
        await session.refresh(org)
        return OrgOut(id=org.id, name=org.name)


@router.delete("/orgs/{org_id}")
async def delete_org(org_id: int):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    from ..models import Organization, User, APIKey, Usage
    from sqlalchemy import update
    async with SessionLocal() as session:
        org = (await session.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
        if not org:
            raise HTTPException(status_code=404, detail="not_found")
        # Best-effort detach of foreign key references to avoid constraint errors
        try:
            await session.execute(update(User).where(User.org_id == org_id).values(org_id=None))
            await session.execute(update(APIKey).where(APIKey.org_id == org_id).values(org_id=None))
            await session.execute(update(Usage).where(Usage.org_id == org_id).values(org_id=None))
        except Exception:
            pass
        await session.delete(org)
        await session.commit()
        return {"status": "ok"}


class OrgLookupOut(BaseModel):
    id: int
    name: str


@router.get("/orgs/lookup", response_model=list[OrgLookupOut])
async def orgs_lookup(limit: int = 100):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    from ..models import Organization
    async with SessionLocal() as session:
        rows = (await session.execute(select(Organization).order_by(Organization.name.asc()).limit(max(1, min(limit, 1000))))).scalars().all()
        return [OrgLookupOut(id=r.id, name=r.name) for r in rows]


