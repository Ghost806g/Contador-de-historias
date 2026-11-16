from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import Persona
from app.schemas import PersonaCreate, PersonaRead

router = APIRouter(prefix="/api/personas", tags=["personas"])


@router.get("", response_model=list[PersonaRead])
async def list_personas(db: AsyncSession = Depends(get_db)) -> list[Persona]:
    result = await db.execute(select(Persona).order_by(Persona.id.desc()))
    return list(result.scalars().all())


@router.post("", response_model=PersonaRead, status_code=status.HTTP_201_CREATED)
async def create_persona(payload: PersonaCreate, db: AsyncSession = Depends(get_db)) -> Persona:
    persona = Persona(**payload.model_dump())
    db.add(persona)
    await db.commit()
    await db.refresh(persona)
    return persona


@router.delete("/{persona_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_persona(persona_id: int, db: AsyncSession = Depends(get_db)) -> None:
    persona = await db.get(Persona, persona_id)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona não encontrada.")
    await db.delete(persona)
    await db.commit()

