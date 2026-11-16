from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.core.config import settings
from app.db.database import Base, async_session_factory, engine
from app.db.seed import seed_builtin_characters
from app.routers import characters, chat, lorebook, personas, uploads

SCHEMA_PATCHES = (
    "ALTER TABLE characters ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE personas ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE story_sessions ADD COLUMN IF NOT EXISTS summarized_up_to_id INTEGER NOT NULL DEFAULT 0",
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Path(settings.uploads_dir).mkdir(parents=True, exist_ok=True)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for sql in SCHEMA_PATCHES:
            await conn.execute(text(sql))

    async with async_session_factory() as db:
        await seed_builtin_characters(db)

    yield
    await engine.dispose()


app = FastAPI(
    title="Contador de Histórias API",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Path(settings.uploads_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")

app.include_router(characters.router)
app.include_router(personas.router)
app.include_router(chat.router)
app.include_router(lorebook.router)
app.include_router(uploads.router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "llm_model": settings.llm_model}
