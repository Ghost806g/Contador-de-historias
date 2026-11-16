import html
import json
import re
from urllib.parse import quote, urlparse

import httpx

from app.schemas import WebImportPreview, WebSearchHit
from app.services.llm_service import complete_chat

USER_AGENT = "ContadorDeHistorias/1.0 (https://localhost; dev@example.com)"

WIKI_SOURCES: dict[str, list[tuple[str, str]]] = {
    "arcane": [
        ("Arcane Wiki", "https://arcane.fandom.com/api.php"),
        ("LoL Wiki", "https://leagueoflegends.fandom.com/api.php"),
    ],
    "cyberpunk": [
        ("Cyberpunk Wiki", "https://cyberpunk.fandom.com/api.php"),
    ],
    "overwatch": [
        ("Overwatch Wiki", "https://overwatch.fandom.com/api.php"),
    ],
    "valorant": [
        ("Valorant Wiki", "https://valorant.fandom.com/api.php"),
    ],
    "wikipedia-pt": [
        ("Wikipédia (PT)", "https://pt.wikipedia.org/w/api.php"),
    ],
    "wikipedia-en": [
        ("Wikipedia (EN)", "https://en.wikipedia.org/w/api.php"),
    ],
}

HTML_BLOCK_STRIP_RE = re.compile(
    r"<(script|style|table|aside|figure|sup|nav)[^>]*>[\s\S]*?</\1>",
    re.IGNORECASE,
)
HTML_TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")


def _strip_html(text: str) -> str:
    cleaned = HTML_BLOCK_STRIP_RE.sub(" ", text or "")
    cleaned = HTML_TAG_RE.sub(" ", cleaned)
    cleaned = html.unescape(cleaned)
    return WHITESPACE_RE.sub(" ", cleaned).strip()


def _resolve_sources(source: str, custom_wiki: str) -> list[tuple[str, str]]:
    normalized = source.strip().lower()
    if normalized == "custom-fandom" and custom_wiki.strip():
        slug = re.sub(r"[^a-zA-Z0-9-]", "", custom_wiki.strip())
        if slug:
            return [
                (f"{slug}.fandom.com", f"https://{slug}.fandom.com/api.php"),
                ("Wikipédia (PT)", "https://pt.wikipedia.org/w/api.php"),
            ]

    if normalized in WIKI_SOURCES:
        targets = list(WIKI_SOURCES[normalized])
        if normalized not in ("wikipedia-pt", "wikipedia-en"):
            targets.append(("Wikipédia (PT)", "https://pt.wikipedia.org/w/api.php"))
        return targets

    return [
        ("Wikipédia (PT)", "https://pt.wikipedia.org/w/api.php"),
        ("Wikipedia (EN)", "https://en.wikipedia.org/w/api.php"),
    ]


def _build_page_url(api_url: str, title: str) -> str:
    parsed = urlparse(api_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    slug = quote(title.replace(" ", "_"))
    return f"{base}/wiki/{slug}"


async def search_lore_sources(
    query: str,
    source: str = "auto",
    custom_wiki: str = "",
    limit_per_source: int = 4,
) -> list[WebSearchHit]:
    """Busca artigos relevantes em Wikis MediaWiki (Fandom / Wikipédia)."""
    targets = _resolve_sources(source, custom_wiki)
    hits: list[WebSearchHit] = []
    seen_urls: set[str] = set()

    timeout = httpx.Timeout(connect=15.0, read=20.0, write=10.0, pool=10.0)
    async with httpx.AsyncClient(
        timeout=timeout,
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
    ) as client:
        for label, api_url in targets:
            try:
                res = await client.get(
                    api_url,
                    params={
                        "action": "query",
                        "list": "search",
                        "srsearch": query.strip(),
                        "srlimit": limit_per_source,
                        "format": "json",
                    },
                )
                if res.status_code != 200:
                    continue
                data = res.json()
                results = (data.get("query") or {}).get("search") or []
                for item in results:
                    title = str(item.get("title") or "").strip()
                    if not title:
                        continue
                    page_url = _build_page_url(api_url, title)
                    if page_url in seen_urls:
                        continue
                    seen_urls.add(page_url)
                    hits.append(
                        WebSearchHit(
                            title=title,
                            snippet=_strip_html(str(item.get("snippet") or ""))[:240],
                            source_label=label,
                            api_url=api_url,
                            page_url=page_url,
                        )
                    )
            except Exception:
                continue

            if len(hits) >= 6:
                break

    return hits[:8]


async def fetch_article_extract(api_url: str, title: str, max_chars: int = 5000) -> tuple[str, str]:
    """Busca o texto limpo de um artigo MediaWiki (prop=extracts na Wikipédia ou action=parse na Fandom)."""
    parsed = urlparse(api_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("URL da wiki inválida.")

    timeout = httpx.Timeout(connect=8.0, read=15.0, write=8.0, pool=8.0)
    async with httpx.AsyncClient(
        timeout=timeout,
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
    ) as client:
        # 1. Tenta TextExtracts (Wikipédia e wikis com extensão TextExtracts)
        res = await client.get(
            api_url,
            params={
                "action": "query",
                "prop": "extracts",
                "explaintext": "1",
                "exchars": max_chars,
                "titles": title,
                "redirects": "1",
                "format": "json",
            },
        )
        res.raise_for_status()
        data = res.json()
        pages = ((data.get("query") or {}).get("pages") or {}).values()
        for page in pages:
            extract = str(page.get("extract") or "").strip()
            resolved_title = str(page.get("title") or title).strip()
            if extract:
                return resolved_title, extract

        # 2. Fallback para Fandom Wikis via action=parse (extrai parágrafos principais limpos)
        parse_res = await client.get(
            api_url,
            params={
                "action": "parse",
                "page": title,
                "prop": "text",
                "redirects": "1",
                "format": "json",
            },
        )
        parse_res.raise_for_status()
        parse_data = parse_res.json().get("parse") or {}
        html_body = ((parse_data.get("text") or {}).get("*")) or ""
        resolved_title = str(parse_data.get("title") or title).strip()
        if html_body:
            paragraphs = re.findall(r"<p[^>]*>([\s\S]*?)</p>", html_body, re.IGNORECASE)
            clean_paras = [_strip_html(p) for p in paragraphs]
            clean_paras = [
                p
                for p in clean_paras
                if len(p) > 35 and not p.lower().startswith("this page is about")
            ]
            text = "\n\n".join(clean_paras)[:max_chars].strip()
            if text:
                return resolved_title, text

    raise ValueError("Não foi possível extrair texto desse artigo.")


def _fallback_keywords(title: str) -> str:
    tokens = [t.lower() for t in re.findall(r"[a-zA-ZÀ-ÿ0-9]{3,}", title)]
    unique: list[str] = []
    for tok in tokens:
        if tok not in unique:
            unique.append(tok)
    return ", ".join(unique[:6])


def _clean_extractive_summary(text: str, max_len: int = 1200) -> str:
    paragraphs = [p.strip() for p in text.splitlines() if p.strip() and not p.strip().startswith("==")]
    joined = "\n\n".join(paragraphs[:4])
    if len(joined) <= max_len:
        return joined
    return joined[: max_len - 3].rsplit(" ", 1)[0] + "..."


async def import_lore_article(
    api_url: str,
    title: str,
    summarize_with_ai: bool = False,
    target_mode: str = "lorebook",
) -> WebImportPreview:
    """Importa um artigo da wiki e opcionalmente sintetiza em ficha de lorebook em português."""
    resolved_title, raw_extract = await fetch_article_extract(api_url, title)
    page_url = _build_page_url(api_url, resolved_title)
    default_keywords = _fallback_keywords(resolved_title)
    fallback_content = _clean_extractive_summary(raw_extract)

    if not summarize_with_ai:
        return WebImportPreview(
            title=resolved_title,
            keywords=default_keywords,
            content=fallback_content,
            source_url=page_url,
        )

    goal = (
        "um bloco de cenário/personagem rico para iniciar uma história interativa"
        if target_mode == "character"
        else "uma ficha de Lorebook concisa (máximo 750 caracteres) preservando personalidade, relações, aparência, habilidades, facções e segredos"
    )
    prompt = [
        {
            "role": "system",
            "content": (
                "Você é um editor de lore para histórias interativas. Responda APENAS com um JSON válido "
                'no formato {"title": "...", "keywords": "palavra1, palavra2, ...", "content": "..."} em português do Brasil.'
            ),
        },
        {
            "role": "user",
            "content": (
                f"ARTIGO: {resolved_title}\n\n"
                f"TEXTO DA WIKI:\n{raw_extract[:4000]}\n\n"
                f"Transforme em {goal}. Retorne somente o JSON."
            ),
        },
    ]

    try:
        raw_reply = await complete_chat(prompt, temperature=0.25, top_p=0.9)
        match = re.search(r"\{[\s\S]*\}", raw_reply)
        if match:
            parsed = json.loads(match.group(0))
            return WebImportPreview(
                title=str(parsed.get("title") or resolved_title)[:140],
                keywords=str(parsed.get("keywords") or default_keywords)[:500],
                content=str(parsed.get("content") or fallback_content).strip(),
                source_url=page_url,
            )
    except Exception:
        pass

    return WebImportPreview(
        title=resolved_title,
        keywords=default_keywords,
        content=fallback_content,
        source_url=page_url,
    )
