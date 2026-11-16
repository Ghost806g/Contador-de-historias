import json
from collections.abc import AsyncIterator, Awaitable, Callable

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import async_session_factory, get_db
from app.db.models import Character, LorebookEntry, Persona, StoryMessage, StorySession
from app.schemas import (
    MessageRead,
    SendMessageRequest,
    SessionCreate,
    SessionMemoryUpdate,
    SessionRead,
    SessionUpdate,
    SwitchVariantRequest,
    UpdateMessageRequest,
)
from app.services.llm_service import LlmError, list_available_models, stream_chat_completion
from app.services.memory_service import schedule_auto_summary, summarize_session_by_id
from app.services.prompt_builder import (
    CONTINUE_PROMPT,
    START_PROMPT,
    build_openai_messages,
    infer_theme,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def _sse_event(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _serialize_message(msg: StoryMessage) -> dict:
    return MessageRead.model_validate(msg).model_dump(mode="json")


async def _load_session_full(db: AsyncSession, session_id: int) -> StorySession:
    stmt = (
        select(StorySession)
        .options(selectinload(StorySession.character), selectinload(StorySession.persona))
        .where(StorySession.id == session_id)
    )
    session = await db.scalar(stmt)
    if session is None:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")
    return session


async def _load_history(db: AsyncSession, session_id: int) -> list[StoryMessage]:
    stmt = (
        select(StoryMessage)
        .where(StoryMessage.session_id == session_id)
        .order_by(StoryMessage.id.asc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def _load_session_lore(db: AsyncSession, session: StorySession) -> list[LorebookEntry]:
    conditions = [LorebookEntry.session_id == session.id]
    if session.character_id is not None:
        conditions.append(LorebookEntry.character_id == session.character_id)
    stmt = select(LorebookEntry).where(or_(*conditions)).order_by(LorebookEntry.id.asc())
    return list((await db.execute(stmt)).scalars().all())


def _stream_assistant_reply(
    session: StorySession,
    llm_messages: list[dict[str, str]],
    persist_fn: Callable[[AsyncSession, str], Awaitable[StoryMessage | None]],
    initial_events: list[dict] | None = None,
    trigger_auto_summary: bool = True,
) -> StreamingResponse:
    """Executa streaming SSE da LLM, persiste a resposta final e agenda resumo em segundo plano."""

    async def event_stream() -> AsyncIterator[str]:
        for event in initial_events or []:
            yield _sse_event(event)

        chunks: list[str] = []
        try:
            async for token in stream_chat_completion(
                messages=llm_messages,
                model=session.model_name,
                temperature=session.temperature,
                top_p=session.top_p,
            ):
                chunks.append(token)
                yield _sse_event({"type": "token", "text": token})

            full_text = "".join(chunks).strip()
            if not full_text:
                yield _sse_event({"type": "error", "detail": "A IA retornou uma resposta vazia."})
                return

            async with async_session_factory() as stream_db:
                saved_msg = await persist_fn(stream_db, full_text)
                if saved_msg is None:
                    yield _sse_event({"type": "error", "detail": "Mensagem removida durante a geração."})
                    return
                yield _sse_event({"type": "done", "message": _serialize_message(saved_msg)})

            if trigger_auto_summary:
                schedule_auto_summary(session.id)
        except (LlmError, Exception) as exc:
            yield _sse_event({"type": "error", "detail": str(exc)})

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=SSE_HEADERS)


async def _save_new_assistant_message(session_id: int, db: AsyncSession, content: str) -> StoryMessage:
    msg = StoryMessage(
        session_id=session_id,
        role="assistant",
        content=content,
        variants=[content],
        active_variant=0,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


@router.get("/models")
async def get_models() -> dict[str, object]:
    from app.core.config import settings

    models = await list_available_models()
    return {"default_model": settings.llm_model, "models": models}


@router.get("/sessions", response_model=list[SessionRead])
async def list_sessions(db: AsyncSession = Depends(get_db)) -> list[StorySession]:
    result = await db.execute(select(StorySession).order_by(StorySession.created_at.desc(), StorySession.id.desc()))
    return list(result.scalars().all())


@router.post("/sessions", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
async def create_session(payload: SessionCreate, db: AsyncSession = Depends(get_db)) -> StorySession:
    character: Character | None = None
    if payload.character_id is not None:
        character = await db.get(Character, payload.character_id)
        if character is None:
            raise HTTPException(status_code=404, detail="Personagem base não encontrado.")

    if payload.persona_id is not None:
        persona = await db.get(Persona, payload.persona_id)
        if persona is None:
            raise HTTPException(status_code=404, detail="Persona não encontrada.")

    theme = infer_theme(
        payload.character_name,
        payload.scenario_context,
        payload.theme or (character.theme if character else None),
    )
    title = (payload.title or "").strip() or (
        character.name if character else payload.character_name.split(",")[0][:80]
    )

    session = StorySession(
        character_id=payload.character_id,
        persona_id=payload.persona_id,
        title=title,
        character_name=payload.character_name.strip(),
        scenario_context=payload.scenario_context.strip(),
        theme=theme,
        model_name=payload.model_name,
        temperature=payload.temperature,
        top_p=payload.top_p,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.patch("/sessions/{session_id}", response_model=SessionRead)
async def update_session(
    session_id: int,
    payload: SessionUpdate,
    db: AsyncSession = Depends(get_db),
) -> StorySession:
    session = await db.get(StorySession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(session, field, value)

    await db.commit()
    await db.refresh(session)
    return session


@router.patch("/sessions/{session_id}/memory", response_model=SessionRead)
async def update_session_memory(
    session_id: int,
    payload: SessionMemoryUpdate,
    db: AsyncSession = Depends(get_db),
) -> StorySession:
    session = await db.get(StorySession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")

    session.summary_memory = payload.summary_memory.strip()
    await db.commit()
    await db.refresh(session)
    return session


@router.post("/sessions/{session_id}/summarize", response_model=SessionRead)
async def summarize_session_now(
    session_id: int,
    db: AsyncSession = Depends(get_db),
) -> StorySession:
    session = await db.get(StorySession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")

    try:
        updated = await summarize_session_by_id(session_id, force=True)
    except LlmError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if updated is None:
        await db.refresh(session)
        return session
    return updated


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: int, db: AsyncSession = Depends(get_db)) -> None:
    session = await db.get(StorySession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")
    await db.delete(session)
    await db.commit()


@router.get("/sessions/{session_id}/messages", response_model=list[MessageRead])
async def get_messages(session_id: int, db: AsyncSession = Depends(get_db)) -> list[StoryMessage]:
    session = await db.get(StorySession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")
    return await _load_history(db, session_id)


@router.post("/sessions/{session_id}/start")
async def start_session(session_id: int, db: AsyncSession = Depends(get_db)) -> StreamingResponse:
    session = await _load_session_full(db, session_id)
    history = await _load_history(db, session_id)
    if history:
        raise HTTPException(status_code=400, detail="A sessão já possui mensagens.")

    if session.character and session.character.greeting.strip():
        greeting_text = session.character.greeting.strip()
        msg = await _save_new_assistant_message(session_id, db, greeting_text)

        async def greeting_stream() -> AsyncIterator[str]:
            yield _sse_event({"type": "token", "text": greeting_text})
            yield _sse_event({"type": "done", "message": _serialize_message(msg)})

        return StreamingResponse(greeting_stream(), media_type="text/event-stream", headers=SSE_HEADERS)

    lore_entries = await _load_session_lore(db, session)
    llm_messages = build_openai_messages(
        session=session,
        history=[],
        persona=session.persona,
        lore_entries=lore_entries,
        extra_instruction=START_PROMPT,
    )
    return _stream_assistant_reply(
        session=session,
        llm_messages=llm_messages,
        persist_fn=lambda stream_db, content: _save_new_assistant_message(session_id, stream_db, content),
        trigger_auto_summary=False,
    )


@router.post("/sessions/{session_id}/send")
async def send_message(
    session_id: int,
    payload: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    session = await _load_session_full(db, session_id)
    user_text = payload.content.strip()
    if not user_text:
        raise HTTPException(status_code=400, detail="A mensagem não pode estar vazia.")

    user_msg = StoryMessage(
        session_id=session_id,
        role="user",
        content=user_text,
        variants=[user_text],
        active_variant=0,
    )
    db.add(user_msg)
    await db.commit()
    await db.refresh(user_msg)

    history = await _load_history(db, session_id)
    lore_entries = await _load_session_lore(db, session)
    llm_messages = build_openai_messages(
        session=session,
        history=history,
        persona=session.persona,
        lore_entries=lore_entries,
    )
    return _stream_assistant_reply(
        session=session,
        llm_messages=llm_messages,
        persist_fn=lambda stream_db, content: _save_new_assistant_message(session_id, stream_db, content),
        initial_events=[{"type": "user_saved", "message": _serialize_message(user_msg)}],
    )


@router.post("/sessions/{session_id}/continue")
async def continue_story(session_id: int, db: AsyncSession = Depends(get_db)) -> StreamingResponse:
    session = await _load_session_full(db, session_id)
    history = await _load_history(db, session_id)
    if not history:
        raise HTTPException(status_code=400, detail="Inicie a sessão antes de continuar.")

    lore_entries = await _load_session_lore(db, session)
    llm_messages = build_openai_messages(
        session=session,
        history=history,
        persona=session.persona,
        lore_entries=lore_entries,
        extra_instruction=CONTINUE_PROMPT,
    )
    return _stream_assistant_reply(
        session=session,
        llm_messages=llm_messages,
        persist_fn=lambda stream_db, content: _save_new_assistant_message(session_id, stream_db, content),
    )


@router.post("/sessions/{session_id}/messages/{message_id}/regenerate")
async def regenerate_message(
    session_id: int,
    message_id: int,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Gera uma nova variante (swipe) para a última resposta da IA."""
    session = await _load_session_full(db, session_id)
    history = await _load_history(db, session_id)
    target = next((m for m in history if m.id == message_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada.")
    if target.role != "assistant":
        raise HTTPException(status_code=400, detail="Só é possível regenerar mensagens da IA.")
    if history[-1].id != message_id:
        raise HTTPException(status_code=400, detail="Regenere apenas a última mensagem ou rebobine antes.")

    context_before = [m for m in history if m.id < message_id]
    extra = START_PROMPT if not context_before else None
    lore_entries = await _load_session_lore(db, session)
    llm_messages = build_openai_messages(
        session=session,
        history=context_before,
        persona=session.persona,
        lore_entries=lore_entries,
        extra_instruction=extra,
    )

    async def append_variant(stream_db: AsyncSession, content: str) -> StoryMessage | None:
        db_msg = await stream_db.get(StoryMessage, message_id)
        if db_msg is None:
            return None
        variants = list(db_msg.variants or [db_msg.content])
        variants.append(content)
        db_msg.variants = variants
        db_msg.active_variant = len(variants) - 1
        db_msg.content = content
        await stream_db.commit()
        await stream_db.refresh(db_msg)
        return db_msg

    return _stream_assistant_reply(
        session=session,
        llm_messages=llm_messages,
        persist_fn=append_variant,
        trigger_auto_summary=False,
    )


@router.patch("/sessions/{session_id}/messages/{message_id}/variant", response_model=MessageRead)
async def switch_variant(
    session_id: int,
    message_id: int,
    payload: SwitchVariantRequest,
    db: AsyncSession = Depends(get_db),
) -> StoryMessage:
    msg = await db.get(StoryMessage, message_id)
    if msg is None or msg.session_id != session_id:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada.")

    variants = list(msg.variants or [msg.content])
    if payload.variant_index >= len(variants):
        raise HTTPException(status_code=400, detail="Índice de variante inválido.")

    msg.active_variant = payload.variant_index
    msg.content = variants[payload.variant_index]
    await db.commit()
    await db.refresh(msg)
    return msg


@router.patch("/sessions/{session_id}/messages/{message_id}", response_model=MessageRead)
async def update_message(
    session_id: int,
    message_id: int,
    payload: UpdateMessageRequest,
    db: AsyncSession = Depends(get_db),
) -> StoryMessage:
    msg = await db.get(StoryMessage, message_id)
    if msg is None or msg.session_id != session_id:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada.")

    new_content = payload.content.strip()
    variants = list(msg.variants or [msg.content])
    idx = min(msg.active_variant, len(variants) - 1) if variants else 0
    if variants:
        variants[idx] = new_content
    else:
        variants = [new_content]

    msg.variants = variants
    msg.active_variant = idx
    msg.content = new_content
    await db.commit()
    await db.refresh(msg)
    return msg


@router.delete("/sessions/{session_id}/rewind/{message_id}")
async def rewind_history(
    session_id: int,
    message_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    session = await db.get(StorySession, session_id)
    if session is not None and session.summarized_up_to_id >= message_id:
        session.summarized_up_to_id = max(0, message_id - 1)

    stmt = delete(StoryMessage).where(
        StoryMessage.session_id == session_id,
        StoryMessage.id >= message_id,
    )
    result = await db.execute(stmt)
    await db.commit()
    return {"deleted": result.rowcount or 0, "rewound": True}
