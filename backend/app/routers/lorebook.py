from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import LorebookEntry
from app.schemas import (
    LorebookCreate,
    LorebookRead,
    LorebookUpdate,
    WebImportPreview,
    WebImportRequest,
    WebSearchHit,
    WebSearchRequest,
)
from app.services.lore_research_service import import_lore_article, search_lore_sources

router = APIRouter(prefix="/api/lorebook", tags=["lorebook"])


@router.get("", response_model=list[LorebookRead])
async def list_lorebook(
    session_id: int | None = Query(default=None),
    character_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[LorebookEntry]:
    stmt = select(LorebookEntry)
    conditions = []
    if session_id is not None:
        conditions.append(LorebookEntry.session_id == session_id)
    if character_id is not None:
        conditions.append(LorebookEntry.character_id == character_id)

    if conditions:
        stmt = stmt.where(or_(*conditions))

    stmt = stmt.order_by(LorebookEntry.always_active.desc(), LorebookEntry.id.desc())
    return list((await db.execute(stmt)).scalars().all())


@router.post("", response_model=LorebookRead, status_code=status.HTTP_201_CREATED)
async def create_lorebook_entry(
    payload: LorebookCreate,
    db: AsyncSession = Depends(get_db),
) -> LorebookEntry:
    if payload.session_id is None and payload.character_id is None:
        raise HTTPException(
            status_code=400,
            detail="Informe session_id ou character_id para vincular a memória.",
        )

    entry = LorebookEntry(**payload.model_dump())
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.patch("/{entry_id}", response_model=LorebookRead)
async def update_lorebook_entry(
    entry_id: int,
    payload: LorebookUpdate,
    db: AsyncSession = Depends(get_db),
) -> LorebookEntry:
    entry = await db.get(LorebookEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entrada de memória não encontrada.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)

    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lorebook_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    entry = await db.get(LorebookEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entrada de memória não encontrada.")
    await db.delete(entry)
    await db.commit()


@router.post("/web-search", response_model=list[WebSearchHit])
async def search_web_lore(payload: WebSearchRequest) -> list[WebSearchHit]:
    return await search_lore_sources(
        query=payload.query,
        source=payload.source,
        custom_wiki=payload.custom_wiki,
    )


@router.post("/web-import", response_model=WebImportPreview)
async def import_web_lore(payload: WebImportRequest) -> WebImportPreview:
    try:
        return await import_lore_article(
            api_url=payload.api_url,
            title=payload.title,
            summarize_with_ai=payload.summarize_with_ai,
            target_mode=payload.target_mode,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro ao importar da wiki: {exc}") from exc
