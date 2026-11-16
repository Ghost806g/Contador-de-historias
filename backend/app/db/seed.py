from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Character

BUILTIN_CHARACTERS = [
    {
        "name": "Night City — Submundo Neon",
        "world_key": "cyberpunk",
        "tagline": "Megalópole brutal de megacorporações, implantes e sobrevivência nas ruas.",
        "theme": "cyberpunk",
        "scenario": (
            "Night City: Uma megalópole obcecada por poder, glamour e modificações corporais. "
            "As megacorporações (Arasaka, Militech) ditam as regras lá de cima de seus arranha-céus, "
            "enquanto gangues, netrunners e mercenários lutam pela sobrevivência nas ruas de neon abaixo. "
            "A IA será um narrador implacável, focado em alta tecnologia, ciberpsicose, tiroteios cibernéticos "
            "e acordos sujos. O mundo não perdoa fraquezas, a linguagem é suja e as traições são comuns."
        ),
        "system_prompt": "",
        "greeting": "",
        "is_builtin": True,
    },
    {
        "name": "Piltover & Zaun — A Dualidade",
        "world_key": "arcane",
        "tagline": "Ouro Hextech nas alturas, Cintila tóxica e gangues nas vielas da Subferia.",
        "theme": "arcane",
        "scenario": (
            "O cenário se divide entre a rica e utópica cidade de Piltover e o miserável e oprimido "
            "submundo de Zaun. A magia (Hextech) e a ciência estão em constante conflito, assim como as "
            "classes sociais. Os Defensores patrulham as ruas de cima, enquanto os barões da química e "
            "as gangues governam as vielas tóxicas de baixo. A IA será um narrador sombrio e descritivo, "
            "focando na dualidade política, miséria, e no brilho hextech. NPCs devem reagir com preconceito "
            "se o personagem for de Zaun, ou com desconfiança se for de Piltover."
        ),
        "system_prompt": "",
        "greeting": "",
        "is_builtin": True,
    },
    {
        "name": "Terra Pós-Crise Ômnica",
        "world_key": "overwatch",
        "tagline": "Heróis caídos, facções rivais e dilemas entre humanos e ômnicos.",
        "theme": "cyberpunk",
        "scenario": (
            "Terra Pós-Crise Ômnica: Um mundo futurista e vibrante onde a humanidade e os robôs (Ômnicos) "
            "tentam coexistir após uma guerra devastadora global. A antiga força-tarefa internacional Overwatch "
            "caiu, e agora heróis aposentados, mercenários e organizações terroristas (como a Talon e a Null Sector) "
            "disputam o futuro do planeta. A IA deve narrar cenas intensas, uso de habilidades tecnológicas, "
            "e focar num clima dinâmico, com dilemas éticos e conflitos de facções."
        ),
        "system_prompt": "",
        "greeting": "",
        "is_builtin": True,
    },
    {
        "name": "Protocolo 2053 — Terra Ômega",
        "world_key": "valorant",
        "tagline": "Operações táticas clandestinas, Radianita e poderes sobrenaturais.",
        "theme": "cyberpunk",
        "scenario": (
            "Terra Ômega e Alpha: Um mundo moderno e tático no ano de 2053, após um evento cataclísmico "
            "chamado First Light, que concedeu poderes misteriosos (Radiantes) a certas pessoas. Outros usam "
            "tecnologia avançada movida a Radianita. Agentes secretos da Valorant Protocol lutam no submundo "
            "para impedir que dimensões paralelas roubem os recursos da Terra. A IA narra operações táticas "
            "precisas, espionagem e tensão constante combinada com poderes sobrenaturais."
        ),
        "system_prompt": "",
        "greeting": "",
        "is_builtin": True,
    },
]


async def seed_builtin_characters(db: AsyncSession) -> None:
    """Insere os mundos/personagens iniciais se o catálogo ainda estiver vazio."""
    existing = await db.scalar(select(Character.id).limit(1))
    if existing is not None:
        return

    for item in BUILTIN_CHARACTERS:
        db.add(Character(**item))
    await db.commit()

