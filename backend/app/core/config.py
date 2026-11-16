from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configurações da aplicação carregadas via variáveis de ambiente."""

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/contador"
    llm_url: str = "http://localhost:11434/api/chat"
    llm_model: str = "dolphin3"
    llm_num_ctx: int = 4096
    llm_repeat_penalty: float = 1.12
    llm_api_key: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    max_history_messages: int = 80
    recent_window_messages: int = 12
    auto_summarize_threshold: int = 8
    max_context_chars: int = 10000
    uploads_dir: str = "uploads"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
