# Contador de Histórias — Plataforma Narrativa Interativa

Plataforma de _storytelling_ e _character chat_ interativo estilo PolyBuzz, estruturada com:

- **Frontend:** TypeScript + React + Vite (`frontend/`)
- **Backend / Motor de IA:** Python + FastAPI + SQLAlchemy Async (`backend/`)
- **Banco de Dados:** PostgreSQL (`contador`)
- **LLM:** Endpoint compatível com OpenAI (Ollama local com `dolphin-llama3`, OpenRouter, vLLM, etc.)

---

## Recursos Principais

- **Catálogo de Personagens & Universos:** Cards na tela inicial, busca, criação/edição de personagens com _system prompt_, tema e saudação inicial pronta (`greeting`), além de upload de avatar/capa.
- **Personas do Usuário:** Cadastre múltiplas identidades (com avatar) e alterne entre elas em qualquer história.
- **Controle de Narrativa no Chat:** Streaming em tempo real, regeneração com múltiplas variantes (_swipe_ `◀ 1/N ▶`), edição de mensagens, botão _Continuar_ e _Rebobinar_.
- **Memória Longa & Lorebook:** Resumo automático progressivo das cenas antigas em segundo plano, edição manual da memória e fatos fixados ou ativados por palavras-chave.
- **Voz (TTS) & Áudio:** Leitura de respostas da IA em português via Web Speech API (botão _Ouvir_ por mensagem ou modo _Voz: AUTO_) e som de digitação opcional.

---

## Como rodar localmente

### 1. Backend (Python + FastAPI)

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

As configurações ficam em `backend/.env` (use `backend/.env.example` como referência).

### 2. Frontend (React + TypeScript + Vite)

```powershell
cd frontend
npm install
npm run dev
```

Acesse `http://localhost:5173`. O Vite faz proxy automático de `/api` e `/uploads` para `http://127.0.0.1:8000`.
