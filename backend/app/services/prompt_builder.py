from app.core.config import settings
from app.db.models import LorebookEntry, Persona, StoryMessage, StorySession
from app.services.memory_service import select_relevant_lore, trim_history_to_budget

BASE_NARRATOR_DIRECTIVES = """Você é o Narrador (Diretor de Cena e Voz dos Personagens) de uma história interativa imersiva, cinematográfica e adulta.

SUAS DIRETRIZES DE NARRAÇÃO (SIGA RIGOROSAMENTE):
1. IDIOMA E PROSA NATURAL: Escreva sempre em português brasileiro fluente, vivo e sem traduções literais ou palavras em inglês fora de lugar (use apenas gírias próprias do universo quando fizer sentido).
2. ESTILO CINEMATOGRÁFICO: Use *itálico* para ações, microexpressões, sensações e descrição do ambiente, e aspas ("...") para falas diretas dos personagens. Evite repetições de frases ou clichês de resumo no final.
3. TOM ADULTO, CRU E REALISTA: Não suavize o mundo nem aplique censura ou lições de moral quando o contexto pedir crueza, tensão psicológica, conflito, violência ou linguagem pesada condizente com os personagens.
4. FIDELIDADE E IMERSÃO SENSORIAL: Mantenha coerência absoluta com o universo, motivações ocultas e consequências reais. Descreva sons, cheiros, iluminação, tensão corporal e subtexto nos diálogos.
5. REGRA DE OURO (PROIBIDO CONTROLAR O JOGADOR): Você NUNCA decide, narra ou presume as ações, falas ou pensamentos do usuário. Narre apenas o mundo, os NPCs e as consequências, abrindo espaço imediato para a reação dele."""


START_PROMPT = (
    "(INSTRUÇÃO SILENCIOSA DE INÍCIO: O usuário acabou de entrar na cena. "
    "INICIE A HISTÓRIA IMEDIATAMENTE em mídia res. Descreva o ambiente de forma visceral "
    "baseada no contexto e na identidade dele, coloque-o diante de um dilema ou interação "
    "imediata e termine esperando sua reação. Não diga 'Bem-vindo'.)"
)

CONTINUE_PROMPT = (
    "(INSTRUÇÃO SILENCIOSA: Continue a cena naturalmente a partir do último parágrafo, "
    "avançando a reação dos NPCs e do ambiente sem repetir o que já foi dito e sem controlar o usuário.)"
)


def infer_theme(character_name: str, scenario_context: str, explicit_theme: str | None = None) -> str:
    """Detecta o tema visual com base nas palavras-chave caso não seja especificado."""
    if explicit_theme:
        return explicit_theme
    combined = f"{character_name} {scenario_context}".lower()
    if any(word in combined for word in ("arcane", "piltover", "zaun", "hextech")):
        return "arcane"
    return "cyberpunk"


def build_system_prompt(
    session: StorySession,
    persona: Persona | None = None,
    active_lore: list[LorebookEntry] | None = None,
) -> str:
    """Monta o system prompt unificando diretrizes, cenário, lorebook e memória."""
    parts = [BASE_NARRATOR_DIRECTIVES]

    parts.append(f"\n[PROTAGONISTA / USUÁRIO NA CENA]\n{session.character_name}")
    if persona is not None:
        parts.append(f"[PERSONA ATIVA: {persona.name}]\n{persona.description}")

    parts.append(f"\n[CENÁRIO, PERSONAGENS E REGRAS DO MUNDO]\n{session.scenario_context}")

    if session.character and session.character.system_prompt.strip():
        parts.append(f"\n[DIRETRIZES ESPECÍFICAS DO PERSONAGEM]\n{session.character.system_prompt.strip()}")

    if active_lore:
        lore_lines = [f"- {entry.title}: {entry.content}" for entry in active_lore]
        parts.append("\n[MEMÓRIAS FIXADAS & LORE ATIVO]\n" + "\n".join(lore_lines))

    if session.summary_memory.strip():
        parts.append(f"\n[MEMÓRIA RESUMIDA DOS EVENTOS ANTERIORES]\n{session.summary_memory.strip()}")

    return "\n".join(parts)


def build_openai_messages(
    session: StorySession,
    history: list[StoryMessage],
    persona: Persona | None = None,
    lore_entries: list[LorebookEntry] | None = None,
    extra_instruction: str | None = None,
    max_messages: int | None = None,
) -> list[dict[str, str]]:
    """Converte o histórico dentro do orçamento de contexto e injeta lore relevante."""
    recent_limit = max_messages or settings.max_history_messages
    if session.summarized_up_to_id > 0:
        unsummarized = [m for m in history if m.id > session.summarized_up_to_id]
        recent_pool = history[-settings.recent_window_messages :]
        seen_ids = {m.id for m in unsummarized}
        merged = list(unsummarized)
        for m in recent_pool:
            if m.id not in seen_ids:
                merged.append(m)
        merged.sort(key=lambda m: m.id)
        candidate_history = merged[-recent_limit:]
    else:
        candidate_history = history[-recent_limit:]

    budgeted_history = trim_history_to_budget(candidate_history, settings.max_context_chars)
    active_lore = select_relevant_lore(lore_entries or [], budgeted_history)

    messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": build_system_prompt(session, persona=persona, active_lore=active_lore),
        }
    ]

    last_role = ""
    for msg in budgeted_history:
        role = "user" if msg.role == "user" else "assistant"
        if role == last_role:
            continue
        last_role = role
        messages.append({"role": role, "content": msg.content})

    if extra_instruction:
        if last_role == "user":
            messages[-1]["content"] = f"{messages[-1]['content']}\n\n{extra_instruction}"
        else:
            messages.append({"role": "user", "content": extra_instruction})

    return messages
