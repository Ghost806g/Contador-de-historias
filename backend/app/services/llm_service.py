import json
from collections.abc import AsyncIterator
from urllib.parse import urlparse

import httpx

from app.core.config import settings


class LlmError(Exception):
    """Erro retornado pelo provedor de LLM."""


def _build_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if settings.llm_api_key:
        headers["Authorization"] = f"Bearer {settings.llm_api_key}"
    return headers


def _is_ollama_native(url: str) -> bool:
    return url.rstrip("/").endswith("/api/chat")


def _build_payload(
    messages: list[dict[str, str]],
    model: str | None,
    temperature: float,
    top_p: float,
    stream: bool,
) -> dict:
    chosen_model = model or settings.llm_model
    if _is_ollama_native(settings.llm_url):
        options: dict[str, object] = {
            "temperature": temperature,
            "top_p": top_p,
            "repeat_penalty": settings.llm_repeat_penalty,
        }
        if settings.llm_num_ctx > 0:
            options["num_ctx"] = settings.llm_num_ctx
        return {
            "model": chosen_model,
            "messages": messages,
            "stream": stream,
            "options": options,
        }

    return {
        "model": chosen_model,
        "messages": messages,
        "temperature": temperature,
        "top_p": top_p,
        "frequency_penalty": 0.25,
        "presence_penalty": 0.15,
        "stream": stream,
    }


async def list_available_models() -> list[str]:
    """Consulta modelos instalados no Ollama (/api/tags) com fallback para o modelo padrão."""
    fallback = [settings.llm_model]
    parsed = urlparse(settings.llm_url)
    if not parsed.scheme or not parsed.netloc:
        return fallback

    tags_url = f"{parsed.scheme}://{parsed.netloc}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.get(tags_url)
            if res.status_code != 200:
                return fallback
            data = res.json()
            names = [m.get("name") for m in data.get("models", []) if isinstance(m, dict) and m.get("name")]
            if not names:
                return fallback
            if settings.llm_model not in names:
                names.insert(0, settings.llm_model)
            return names
    except Exception:
        return fallback


async def complete_chat(
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float = 0.3,
    top_p: float = 0.9,
) -> str:
    """Executa uma chamada não-streaming para tarefas internas (ex.: resumo de memória)."""
    payload = _build_payload(messages, model=model, temperature=temperature, top_p=top_p, stream=False)
    timeout = httpx.Timeout(connect=15.0, read=300.0, write=30.0, pool=15.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(settings.llm_url, headers=_build_headers(), json=payload)
        if response.status_code >= 400:
            raise LlmError(f"Erro LLM ({response.status_code}): {response.text}")
        data = response.json()
        if _is_ollama_native(settings.llm_url):
            return ((data.get("message") or {}).get("content") or "").strip()
        choices = data.get("choices") or []
        if not choices:
            return ""
        return ((choices[0].get("message") or {}).get("content") or "").strip()


async def stream_chat_completion(
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float = 1.0,
    top_p: float = 0.95,
) -> AsyncIterator[str]:
    """Faz streaming de tokens via Ollama nativo (/api/chat) ou endpoint OpenAI (/v1/chat/completions)."""
    native = _is_ollama_native(settings.llm_url)
    payload = _build_payload(messages, model=model, temperature=temperature, top_p=top_p, stream=True)

    timeout = httpx.Timeout(connect=15.0, read=300.0, write=30.0, pool=15.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", settings.llm_url, headers=_build_headers(), json=payload) as response:
            if response.status_code >= 400:
                body = await response.aread()
                raise LlmError(f"Erro LLM ({response.status_code}): {body.decode('utf-8', errors='replace')}")

            async for line in response.aiter_lines():
                if not line:
                    continue

                if native:
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    chunk = (data.get("message") or {}).get("content")
                    if chunk:
                        yield chunk
                    if data.get("done"):
                        break
                    continue

                if not line.startswith("data: "):
                    continue

                data_str = line[6:].strip()
                if data_str == "[DONE]":
                    break

                try:
                    data = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                choices = data.get("choices") or []
                if not choices:
                    continue

                delta = choices[0].get("delta") or {}
                chunk = delta.get("content")
                if chunk:
                    yield chunk
