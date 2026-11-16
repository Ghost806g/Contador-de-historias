import asyncio
from sqlalchemy import select

from app.core.config import settings
from app.db.database import async_session_factory
from app.db.models import LorebookEntry, StoryMessage, StorySession
from app.services.llm_service import complete_chat

_summarizing_sessions: set[int] = set()


def select_relevant_lore(
    entries: list[LorebookEntry],
    recent_messages: list[StoryMessage],
) -> list[LorebookEntry]:
    """Seleciona memórias fixadas e entradas do lorebook ativadas por palavras-chave recentes."""
    if not entries:
        return []

    corpus = " ".join(m.content.lower() for m in recent_messages[-6:])
    active: list[LorebookEntry] = []
    for entry in entries:
        if entry.always_active:
            active.append(entry)
            continue
        keywords = [k.strip().lower() for k in entry.keywords.split(",") if k.strip()]
        if any(kw in corpus for kw in keywords):
            active.append(entry)
    return active


def trim_history_to_budget(
    messages: list[StoryMessage],
    max_chars: int,
    min_keep: int = 6,
) -> list[StoryMessage]:
    """Mantém o histórico recente dentro do orçamento de caracteres preservando o contexto imediato."""
    if not messages or max_chars <= 0:
        return messages

    selected: list[StoryMessage] = []
    total_chars = 0
    for msg in reversed(messages):
        msg_len = len(msg.content)
        if len(selected) >= min_keep and total_chars + msg_len > max_chars:
            break
        selected.append(msg)
        total_chars += msg_len

    selected.reverse()
    return selected


async def summarize_session_by_id(session_id: int, force: bool = False) -> StorySession | None:
    """Consolida mensagens antigas em memória de longo prazo sem travar a conversa."""
    if session_id in _summarizing_sessions:
        return None

    _summarizing_sessions.add(session_id)
    try:
        async with async_session_factory() as db:
            session = await db.get(StorySession, session_id)
            if session is None:
                return None

            stmt = (
                select(StoryMessage)
                .where(
                    StoryMessage.session_id == session_id,
                    StoryMessage.id > session.summarized_up_to_id,
                )
                .order_by(StoryMessage.id.asc())
            )
            unsummarized = list((await db.execute(stmt)).scalars().all())

            keep_recent = 4 if force else settings.recent_window_messages
            if len(unsummarized) <= keep_recent:
                return session

            to_archive = unsummarized[:-keep_recent]
            if not force and len(to_archive) < settings.auto_summarize_threshold:
                return session

            transcript_lines = [
                f"{'Usuário' if m.role == 'user' else 'Narrador'}: {m.content}"
                for m in to_archive
            ]
            transcript = "\n\n".join(transcript_lines)
            if len(transcript) > 16000:
                transcript = transcript[-16000:]

            prompt_messages = [
                {
                    "role": "system",
                    "content": (
                        "Você é um arquivista narrativo objetivo. Sua função é manter um resumo factual "
                        "e conciso dos acontecimentos importantes da história em tópicos curtos em português. "
                        "Preserve: relações entre personagens, segredos revelados, promessas, ferimentos, "
                        "itens importantes, locais visitados e consequências. Não invente nada."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"MEMÓRIA ANTERIOR:\n{session.summary_memory or '(vazia)'}\n\n"
                        f"NOVAS CENAS PARA INCORPORAR:\n{transcript}\n\n"
                        "Retorne APENAS a memória consolidada atualizada em tópicos curtos (máximo 1500 caracteres)."
                    ),
                },
            ]

            updated_summary = await complete_chat(
                messages=prompt_messages,
                model=session.model_name,
                temperature=0.25,
                top_p=0.9,
            )
            if updated_summary:
                session.summary_memory = updated_summary[:3000]
                session.summarized_up_to_id = to_archive[-1].id
                await db.commit()
                await db.refresh(session)
            return session
    finally:
        _summarizing_sessions.discard(session_id)


def schedule_auto_summary(session_id: int) -> None:
    """Agenda atualização de memória em segundo plano."""
    if session_id in _summarizing_sessions:
        return
    asyncio.create_task(_safe_auto_summary(session_id))


async def _safe_auto_summary(session_id: int) -> None:
    try:
        await summarize_session_by_id(session_id, force=False)
    except Exception:
        # Falha silenciosa em segundo plano para nunca interromper o fluxo de chat
        pass

