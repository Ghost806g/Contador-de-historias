from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CharacterBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    world_key: str = Field(default="custom", max_length=50)
    tagline: str = Field(default="", max_length=255)
    scenario: str = Field(min_length=1)
    system_prompt: str = ""
    greeting: str = ""
    theme: str = Field(default="cyberpunk", max_length=50)
    avatar_url: str = ""


class CharacterCreate(CharacterBase):
    pass


class CharacterUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    world_key: str | None = Field(default=None, max_length=50)
    tagline: str | None = Field(default=None, max_length=255)
    scenario: str | None = Field(default=None, min_length=1)
    system_prompt: str | None = None
    greeting: str | None = None
    theme: str | None = Field(default=None, max_length=50)
    avatar_url: str | None = None


class CharacterRead(CharacterBase):
    id: int
    is_builtin: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PersonaBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1)
    avatar_url: str = ""


class PersonaCreate(PersonaBase):
    pass


class PersonaRead(PersonaBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SessionCreate(BaseModel):
    character_name: str = Field(min_length=1, max_length=255)
    scenario_context: str = Field(min_length=1)
    title: str | None = Field(default=None, max_length=255)
    character_id: int | None = None
    persona_id: int | None = None
    theme: str | None = Field(default=None, max_length=50)
    model_name: str | None = Field(default=None, max_length=120)
    temperature: float = Field(default=1.0, ge=0.0, le=2.0)
    top_p: float = Field(default=0.95, ge=0.0, le=1.0)


class SessionUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    character_name: str | None = Field(default=None, min_length=1, max_length=255)
    scenario_context: str | None = Field(default=None, min_length=1)
    theme: str | None = Field(default=None, max_length=50)
    model_name: str | None = Field(default=None, max_length=120)
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    top_p: float | None = Field(default=None, ge=0.0, le=1.0)
    persona_id: int | None = None


class SessionMemoryUpdate(BaseModel):
    summary_memory: str = ""


class SessionRead(BaseModel):
    id: int
    character_id: int | None
    persona_id: int | None
    title: str
    character_name: str
    scenario_context: str
    theme: str
    summary_memory: str
    summarized_up_to_id: int
    model_name: str | None
    temperature: float
    top_p: float
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MessageRead(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    variants: list[str]
    active_variant: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1)


class UpdateMessageRequest(BaseModel):
    content: str = Field(min_length=1)


class SwitchVariantRequest(BaseModel):
    variant_index: int = Field(ge=0)


class LorebookCreate(BaseModel):
    session_id: int | None = None
    character_id: int | None = None
    title: str = Field(min_length=1, max_length=140)
    keywords: str = Field(default="", max_length=500)
    content: str = Field(min_length=1)
    always_active: bool = False


class LorebookUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=140)
    keywords: str | None = Field(default=None, max_length=500)
    content: str | None = Field(default=None, min_length=1)
    always_active: bool | None = None


class LorebookRead(BaseModel):
    id: int
    session_id: int | None
    character_id: int | None
    title: str
    keywords: str
    content: str
    always_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AvatarUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    data_base64: str = Field(min_length=1)


class WebSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=200)
    source: str = Field(default="auto", max_length=60)
    custom_wiki: str = Field(default="", max_length=120)


class WebSearchHit(BaseModel):
    title: str
    snippet: str
    source_label: str
    api_url: str
    page_url: str


class WebImportRequest(BaseModel):
    api_url: str = Field(min_length=1, max_length=400)
    title: str = Field(min_length=1, max_length=200)
    source_label: str = Field(default="Web", max_length=80)
    summarize_with_ai: bool = False
    target_mode: str = Field(default="lorebook", max_length=30)  # "lorebook" | "character"


class WebImportPreview(BaseModel):
    title: str
    keywords: str
    content: str
    source_url: str
