from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import Character
from app.schemas import CharacterCreate, CharacterRead, CharacterUpdate

router = APIRouter(prefix="/api/characters", tags=["characters"])


@router.get("", response_model=list[CharacterRead])
async def list_characters(db: AsyncSession = Depends(get_db)) -> list[Character]:
    result = await db.execute(select(Character).order_by(Character.is_builtin.desc(), Character.id.asc()))
    return list(result.scalars().all())


@router.post("", response_model=CharacterRead, status_code=status.HTTP_201_CREATED)
async def create_character(payload: CharacterCreate, db: AsyncSession = Depends(get_db)) -> Character:
    character = Character(**payload.model_dump(), is_builtin=False)
    db.add(character)
    await db.commit()
    await db.refresh(character)
    return character


@router.patch("/{character_id}", response_model=CharacterRead)
async def update_character(
    character_id: int,
    payload: CharacterUpdate,
    db: AsyncSession = Depends(get_db),
) -> Character:
    character = await db.get(Character, character_id)
    if character is None:
        raise HTTPException(status_code=404, detail="Personagem não encontrado.")
    if character.is_builtin:
        raise HTTPException(status_code=400, detail="Mundos padrão não podem ser alterados diretamente.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(character, field, value)

    await db.commit()
    await db.refresh(character)
    return character


@router.delete("/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_character(character_id: int, db: AsyncSession = Depends(get_db)) -> None:
    character = await db.get(Character, character_id)
    if character is None:
        raise HTTPException(status_code=404, detail="Personagem não encontrado.")
    if character.is_builtin:
        raise HTTPException(status_code=400, detail="Mundos padrão não podem ser removidos.")
    await db.delete(character)
    await db.commit()

