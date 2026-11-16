import type {
  Character,
  LorebookEntry,
  Persona,
  StoryMessage,
  StorySession,
  StreamEvent,
  WebImportPreview,
  WebSearchHit,
} from "../types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Erro HTTP ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export async function streamPost(
  url: string,
  body: unknown | undefined,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text();
    throw new Error(detail || `Falha ao abrir stream (HTTP ${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const lines = frame.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const event = JSON.parse(jsonStr) as StreamEvent;
          onEvent(event);
        } catch {
          // Ignora frame SSE incompleto ou inválido
        }
      }
    }
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Falha ao ler arquivo de imagem."));
    reader.readAsDataURL(file);
  });
}

export const api = {
  uploadAvatar: async (file: File): Promise<string> => {
    const data_base64 = await fileToBase64(file);
    const res = await requestJson<{ url: string }>("/api/uploads/avatar", {
      method: "POST",
      body: JSON.stringify({ filename: file.name, data_base64 }),
    });
    return res.url;
  },

  listCharacters: () => requestJson<Character[]>("/api/characters"),
  createCharacter: (payload: Omit<Character, "id" | "is_builtin" | "created_at">) =>
    requestJson<Character>("/api/characters", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCharacter: (
    characterId: number,
    payload: Partial<Omit<Character, "id" | "is_builtin" | "created_at">>
  ) =>
    requestJson<Character>(`/api/characters/${characterId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteCharacter: (characterId: number) =>
    requestJson<void>(`/api/characters/${characterId}`, { method: "DELETE" }),

  listModels: () =>
    requestJson<{ default_model: string; models: string[] }>("/api/chat/models"),

  listPersonas: () => requestJson<Persona[]>("/api/personas"),
  createPersona: (payload: Omit<Persona, "id" | "created_at">) =>
    requestJson<Persona>("/api/personas", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deletePersona: (personaId: number) =>
    requestJson<void>(`/api/personas/${personaId}`, { method: "DELETE" }),

  listSessions: () => requestJson<StorySession[]>("/api/chat/sessions"),
  createSession: (payload: {
    character_name: string;
    scenario_context: string;
    title?: string;
    character_id?: number | null;
    persona_id?: number | null;
    theme?: string | null;
  }) =>
    requestJson<StorySession>("/api/chat/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateSession: (
    sessionId: number,
    payload: Partial<
      Pick<
        StorySession,
        | "title"
        | "character_name"
        | "scenario_context"
        | "theme"
        | "model_name"
        | "temperature"
        | "top_p"
        | "persona_id"
      >
    >
  ) =>
    requestJson<StorySession>(`/api/chat/sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  updateSessionMemory: (sessionId: number, summaryMemory: string) =>
    requestJson<StorySession>(`/api/chat/sessions/${sessionId}/memory`, {
      method: "PATCH",
      body: JSON.stringify({ summary_memory: summaryMemory }),
    }),
  summarizeSession: (sessionId: number) =>
    requestJson<StorySession>(`/api/chat/sessions/${sessionId}/summarize`, {
      method: "POST",
    }),
  deleteSession: (sessionId: number) =>
    requestJson<void>(`/api/chat/sessions/${sessionId}`, { method: "DELETE" }),

  getMessages: (sessionId: number) =>
    requestJson<StoryMessage[]>(`/api/chat/sessions/${sessionId}/messages`),
  updateMessage: (sessionId: number, messageId: number, content: string) =>
    requestJson<StoryMessage>(`/api/chat/sessions/${sessionId}/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    }),
  switchVariant: (sessionId: number, messageId: number, variantIndex: number) =>
    requestJson<StoryMessage>(
      `/api/chat/sessions/${sessionId}/messages/${messageId}/variant`,
      {
        method: "PATCH",
        body: JSON.stringify({ variant_index: variantIndex }),
      }
    ),
  rewindToMessage: (sessionId: number, messageId: number) =>
    requestJson<{ deleted: number; rewound: boolean }>(
      `/api/chat/sessions/${sessionId}/rewind/${messageId}`,
      { method: "DELETE" }
    ),

  listLorebook: (sessionId?: number | null, characterId?: number | null) => {
    const params = new URLSearchParams();
    if (sessionId) params.set("session_id", String(sessionId));
    if (characterId) params.set("character_id", String(characterId));
    return requestJson<LorebookEntry[]>(`/api/lorebook?${params.toString()}`);
  },
  createLorebookEntry: (payload: {
    session_id?: number | null;
    character_id?: number | null;
    title: string;
    keywords: string;
    content: string;
    always_active: boolean;
  }) =>
    requestJson<LorebookEntry>("/api/lorebook", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateLorebookEntry: (
    entryId: number,
    payload: Partial<Pick<LorebookEntry, "title" | "keywords" | "content" | "always_active">>
  ) =>
    requestJson<LorebookEntry>(`/api/lorebook/${entryId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteLorebookEntry: (entryId: number) =>
    requestJson<void>(`/api/lorebook/${entryId}`, { method: "DELETE" }),

  searchWebLore: (payload: {
    query: string;
    source?: string;
    custom_wiki?: string;
  }) =>
    requestJson<WebSearchHit[]>("/api/lorebook/web-search", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  importWebLore: (payload: {
    api_url: string;
    title: string;
    source_label: string;
    summarize_with_ai: boolean;
    target_mode?: "lorebook" | "character";
  }) =>
    requestJson<WebImportPreview>("/api/lorebook/web-import", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
