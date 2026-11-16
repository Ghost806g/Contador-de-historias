from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Character(Base):
    """Personagem / universo narrativo disponível para iniciar histórias."""

    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    world_key: Mapped[str] = mapped_column(String(50), nullable=False, default="custom")
    tagline: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    scenario: Mapped[str] = mapped_column(Text, nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    greeting: Mapped[str] = mapped_column(Text, nullable=False, default="")
    theme: Mapped[str] = mapped_column(String(50), nullable=False, default="cyberpunk")
    avatar_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    sessions: Mapped[list["StorySession"]] = relationship(back_populates="character")
    lorebook_entries: Mapped[list["LorebookEntry"]] = relationship(
        back_populates="character",
        cascade="all, delete-orphan",
    )


class Persona(Base):
    """Identidade/personagem controlado pelo usuário nas histórias."""

    __tablename__ = "personas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    avatar_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    sessions: Mapped[list["StorySession"]] = relationship(back_populates="persona")


class StorySession(Base):
    """Sessão de história interativa."""

    __tablename__ = "story_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    character_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("characters.id", ondelete="SET NULL"), nullable=True
    )
    persona_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("personas.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="Nova História")
    character_name: Mapped[str] = mapped_column(String(255), nullable=False)
    scenario_context: Mapped[str] = mapped_column(Text, nullable=False)
    theme: Mapped[str] = mapped_column(String(50), nullable=False, default="cyberpunk")
    summary_memory: Mapped[str] = mapped_column(Text, nullable=False, default="")
    summarized_up_to_id: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    model_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    temperature: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    top_p: Mapped[float] = mapped_column(Float, nullable=False, default=0.95)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="Ativa")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    character: Mapped[Character | None] = relationship(back_populates="sessions")
    persona: Mapped[Persona | None] = relationship(back_populates="sessions")
    messages: Mapped[list["StoryMessage"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="StoryMessage.id",
    )
    lorebook_entries: Mapped[list["LorebookEntry"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
    )


class StoryMessage(Base):
    """Mensagem da narrativa, com suporte a múltiplas variantes (swipe/regeneração)."""

    __tablename__ = "story_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("story_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(30), nullable=False)  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    variants: Mapped[list[str] | Any] = mapped_column(JSONB, nullable=False, default=list)
    active_variant: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    session: Mapped[StorySession] = relationship(back_populates="messages")


class LorebookEntry(Base):
    """Fatos fixados e entradas de lore ativadas por palavras-chave."""

    __tablename__ = "lorebook_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("story_sessions.id", ondelete="CASCADE"), nullable=True, index=True
    )
    character_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("characters.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(140), nullable=False)
    keywords: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    always_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    session: Mapped[StorySession | None] = relationship(back_populates="lorebook_entries")
    character: Mapped[Character | None] = relationship(back_populates="lorebook_entries")
