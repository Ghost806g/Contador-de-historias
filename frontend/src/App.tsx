import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { api, streamPost } from "./api/client";
import { CharacterModal } from "./components/CharacterModal";
import { MemoryModal } from "./components/MemoryModal";
import { MessageBubble } from "./components/MessageBubble";
import { NewStoryModal } from "./components/NewStoryModal";
import { PersonaModal } from "./components/PersonaModal";
import { SessionSettingsModal } from "./components/SessionSettingsModal";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";
import { useTypingAudio } from "./hooks/useTypingAudio";
import type {
  Character,
  Persona,
  StoryMessage,
  StorySession,
  ThemeName,
} from "./types";

export function App() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [sessions, setSessions] = useState<StorySession[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState("dolphin-llama3");

  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<StoryMessage[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");

  const [inputValue, setInputValue] = useState("");
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<number | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [showNewStory, setShowNewStory] = useState(false);
  const [preselectedChar, setPreselectedChar] = useState<Character | null>(null);
  const [showPersonas, setShowPersonas] = useState(false);
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [showSessionSettings, setShowSessionSettings] = useState(false);
  const [showMemoryModal, setShowMemoryModal] = useState(false);

  const historyEndRef = useRef<HTMLDivElement | null>(null);
  const { soundEnabled, toggleSound, unlockAudio, playTick } = useTypingAudio();
  const {
    supported: ttsSupported,
    speakingMessageId,
    autoSpeak,
    toggleAutoSpeak,
    speak,
    stop: stopSpeaking,
  } = useSpeechSynthesis();

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  const activeCharacter = useMemo(
    () =>
      activeSession?.character_id
        ? characters.find((c) => c.id === activeSession.character_id) ?? null
        : null,
    [characters, activeSession]
  );

  const currentTheme: ThemeName =
    activeSession?.theme === "arcane" ? "arcane" : "cyberpunk";

  const isStreaming = streamingText !== null;

  const filteredCharacters = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.world_key.toLowerCase().includes(q) ||
        c.tagline.toLowerCase().includes(q)
    );
  }, [characters, catalogSearch]);

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

  const streamingHtml = useMemo(() => {
    if (!streamingText) return "";
    return DOMPurify.sanitize(marked.parse(streamingText, { async: false }));
  }, [streamingText]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [chars, pers, sess, modelsRes] = await Promise.all([
          api.listCharacters(),
          api.listPersonas(),
          api.listSessions(),
          api.listModels(),
        ]);
        setCharacters(chars);
        setPersonas(pers);
        setSessions(sess);
        setAvailableModels(modelsRes.models);
        setDefaultModel(modelsRes.default_model);
      } catch (err) {
        setErrorBanner(
          err instanceof Error
            ? err.message
            : "Não foi possível conectar com o backend FastAPI."
        );
      }
    }
    void bootstrap();
  }, []);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  async function runStream(
    url: string,
    body?: unknown,
    targetMessageId: number | null = null
  ) {
    setErrorBanner(null);
    setStreamingText("");
    setRegeneratingMessageId(targetMessageId);
    let accumulated = "";

    try {
      await streamPost(url, body, (event) => {
        if (event.type === "user_saved") {
          setMessages((prev) => [...prev, event.message]);
        } else if (event.type === "token") {
          accumulated += event.text;
          setStreamingText(accumulated);
          playTick();
        } else if (event.type === "done") {
          setMessages((prev) => {
            if (targetMessageId !== null) {
              return prev.map((m) =>
                m.id === targetMessageId ? event.message : m
              );
            }
            return [...prev, event.message];
          });
          if (autoSpeak && event.message.role === "assistant") {
            speak(event.message.id, event.message.content);
          }
        } else if (event.type === "error") {
          setErrorBanner(event.detail);
        }
      });
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : "Falha durante o streaming."
      );
    } finally {
      setStreamingText(null);
      setRegeneratingMessageId(null);
    }
  }

  async function selectSession(session: StorySession) {
    unlockAudio();
    stopSpeaking();
    setActiveSessionId(session.id);
    setErrorBanner(null);
    try {
      const loaded = await api.getMessages(session.id);
      setMessages(loaded);
      if (loaded.length === 0) {
        await runStream(`/api/chat/sessions/${session.id}/start`);
      }
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : "Erro ao carregar mensagens."
      );
    }
  }

  async function handleCreateSession(payload: {
    character_name: string;
    scenario_context: string;
    title?: string;
    character_id?: number | null;
    persona_id?: number | null;
    theme?: ThemeName;
  }) {
    const created = await api.createSession(payload);
    setSessions((prev) => [created, ...prev]);
    await selectSession(created);
  }

  async function handleDeleteSession(
    e: React.MouseEvent,
    sessionId: number
  ) {
    e.stopPropagation();
    if (!window.confirm("Tem certeza que deseja apagar esta história para sempre?")) {
      return;
    }
    await api.deleteSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      stopSpeaking();
      setActiveSessionId(null);
      setMessages([]);
    }
  }

  async function handleSaveCharacter(
    payload: Omit<Character, "id" | "is_builtin" | "created_at">,
    existingId?: number
  ) {
    if (existingId !== undefined) {
      const updated = await api.updateCharacter(existingId, payload);
      setCharacters((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
      return;
    }
    const created = await api.createCharacter(payload);
    setCharacters((prev) => [...prev, created]);
  }

  async function handleDeleteCharacter(e: React.MouseEvent, charId: number) {
    e.stopPropagation();
    if (!window.confirm("Apagar este personagem do catálogo?")) return;
    await api.deleteCharacter(charId);
    setCharacters((prev) => prev.filter((c) => c.id !== charId));
  }

  async function handleSend() {
    if (!activeSession || isStreaming) return;
    const content = inputValue.trim();
    if (!content) return;

    unlockAudio();
    setInputValue("");
    await runStream(`/api/chat/sessions/${activeSession.id}/send`, { content });
  }

  async function handleContinue() {
    if (!activeSession || isStreaming || messages.length === 0) return;
    unlockAudio();
    await runStream(`/api/chat/sessions/${activeSession.id}/continue`);
  }

  async function handleRegenerate(messageId: number) {
    if (!activeSession || isStreaming) return;
    unlockAudio();
    await runStream(
      `/api/chat/sessions/${activeSession.id}/messages/${messageId}/regenerate`,
      undefined,
      messageId
    );
  }

  async function handleSwitchVariant(messageId: number, variantIndex: number) {
    if (!activeSession) return;
    const updated = await api.switchVariant(
      activeSession.id,
      messageId,
      variantIndex
    );
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? updated : m))
    );
  }

  async function handleEditMessage(messageId: number, content: string) {
    if (!activeSession) return;
    const updated = await api.updateMessage(activeSession.id, messageId, content);
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? updated : m))
    );
  }

  async function handleRewind(messageId: number) {
    if (!activeSession) return;
    if (
      !window.confirm(
        "Rebobinar até aqui? Esta mensagem e todas as seguintes serão apagadas."
      )
    ) {
      return;
    }
    await api.rewindToMessage(activeSession.id, messageId);
    setMessages((prev) => prev.filter((m) => m.id < messageId));
  }

  async function handleToggleSessionTheme() {
    if (!activeSession) return;
    const nextTheme: ThemeName =
      activeSession.theme === "arcane" ? "cyberpunk" : "arcane";
    const updated = await api.updateSession(activeSession.id, { theme: nextTheme });
    setSessions((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s))
    );
  }

  function handleToggleSpeak(messageId: number, content: string) {
    if (speakingMessageId === messageId) {
      stopSpeaking();
      return;
    }
    speak(messageId, content);
  }

  async function refreshActiveSession() {
    if (!activeSessionId) return;
    const list = await api.listSessions();
    setSessions(list);
  }

  return (
    <div
      className="app-shell"
      data-theme={currentTheme === "arcane" ? "arcane" : undefined}
      onClick={unlockAudio}
    >
      <aside className="sidebar">
        <div className="sidebar-header">Sistemas Conectados</div>
        <div className="sidebar-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setPreselectedChar(null);
              setShowNewStory(true);
            }}
          >
            + Nova História
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowPersonas(true)}
          >
            Personas
          </button>
        </div>

        <div className="sidebar-subactions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              stopSpeaking();
              setActiveSessionId(null);
              setMessages([]);
            }}
          >
            Explorar Personagens / Mundos
          </button>
        </div>

        <ul className="session-list">
          {sessions.map((session) => (
            <li
              key={session.id}
              className={`session-item ${
                session.id === activeSessionId ? "active" : ""
              }`}
              onClick={() => void selectSession(session)}
            >
              <div className="session-header-row">
                <div className="session-title">
                  #{session.id} · {session.title}
                </div>
                <button
                  type="button"
                  className="btn-icon-danger"
                  onClick={(e) => void handleDeleteSession(e, session.id)}
                  title="Apagar sessão"
                >
                  🗑
                </button>
              </div>
              <div className="session-char">{session.character_name}</div>
            </li>
          ))}
        </ul>
      </aside>

      <main className="chat-container">
        <header className="chat-header">
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
            {activeSession &&
              (activeCharacter?.avatar_url ? (
                <img
                  src={activeCharacter.avatar_url}
                  alt={activeSession.title}
                  className="avatar-thumb"
                />
              ) : (
                <div className="avatar-thumb placeholder">
                  {activeSession.title[0]?.toUpperCase() || "H"}
                </div>
              ))}
            <div className="chat-header-info">
              <h1>
                {activeSession
                  ? `CONEXÃO #${activeSession.id} · ${activeSession.title}`
                  : "CATÁLOGO DE HISTÓRIAS & PERSONAGENS"}
              </h1>
              <p>
                {activeSession
                  ? `Personagem: ${activeSession.character_name} · Modelo: ${
                      activeSession.model_name || defaultModel
                    }`
                  : "Escolha um universo/bot abaixo, crie o seu ou retome uma história."}
              </p>
            </div>
          </div>

          <div className="header-controls">
            {activeSession && (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    void refreshActiveSession();
                    setShowMemoryModal(true);
                  }}
                >
                  🧠 Memória
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowSessionSettings(true)}
                >
                  ⚙ Config
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void handleToggleSessionTheme()}
                >
                  Tema: {currentTheme === "arcane" ? "Arcane" : "Cyberpunk"}
                </button>
              </>
            )}
            {ttsSupported && (
              <button
                type="button"
                className="btn-secondary"
                onClick={toggleAutoSpeak}
                title="Ler novas respostas da IA automaticamente"
              >
                Voz: {autoSpeak ? "AUTO" : "MANUAL"}
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={toggleSound}
            >
              Som: {soundEnabled ? "ON" : "OFF"}
            </button>
          </div>
        </header>

        <section className="chat-history">
          {errorBanner && <div className="message system">{errorBanner}</div>}

          {!activeSession ? (
            <>
              <div className="catalog-toolbar">
                <input
                  type="text"
                  className="catalog-search"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Buscar personagem, universo ou tag..."
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setEditingCharacter(null);
                    setShowCharacterModal(true);
                  }}
                >
                  + Criar Personagem / Universo
                </button>
              </div>

              <div className="welcome-grid">
                {filteredCharacters.map((char) => (
                  <div
                    key={char.id}
                    className="character-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setPreselectedChar(char);
                      setShowNewStory(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setPreselectedChar(char);
                        setShowNewStory(true);
                      }
                    }}
                  >
                    <div className="character-card-top">
                      <div className="character-card-badges">
                        <span className="character-card-badge">
                          {char.world_key}
                        </span>
                        {char.greeting && (
                          <span className="character-card-badge greeting">
                            Saudação Pronta
                          </span>
                        )}
                      </div>

                      {!char.is_builtin && (
                        <div className="character-card-actions">
                          <button
                            type="button"
                            className="msg-action-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCharacter(char);
                              setShowCharacterModal(true);
                            }}
                            title="Editar personagem"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="msg-action-btn danger"
                            onClick={(e) => void handleDeleteCharacter(e, char.id)}
                            title="Apagar personagem"
                          >
                            🗑
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="character-card-head">
                      {char.avatar_url ? (
                        <img
                          src={char.avatar_url}
                          alt={char.name}
                          className="avatar-thumb"
                        />
                      ) : (
                        <div className="avatar-thumb placeholder">
                          {char.name[0]?.toUpperCase() || "?"}
                        </div>
                      )}
                      <h3>{char.name}</h3>
                    </div>

                    <p>{char.tagline || char.scenario.slice(0, 110)}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {messages
                .filter((m) => m.id !== regeneratingMessageId)
                .map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isLastAssistant={msg.id === lastAssistantId}
                    isStreaming={isStreaming}
                    ttsSupported={ttsSupported}
                    isSpeaking={speakingMessageId === msg.id}
                    onToggleSpeak={handleToggleSpeak}
                    onEdit={handleEditMessage}
                    onRewind={handleRewind}
                    onRegenerate={handleRegenerate}
                    onSwitchVariant={handleSwitchVariant}
                  />
                ))}

              {isStreaming && (
                <div className="message assistant">
                  <div className="message-header">
                    <span className="message-role">Narrador (IA)</span>
                  </div>
                  <div className="message-body">
                    {streamingHtml ? (
                      <span
                        dangerouslySetInnerHTML={{ __html: streamingHtml }}
                      />
                    ) : (
                      <span>Conectando pensamento...</span>
                    )}
                    <span className="cursor" />
                  </div>
                </div>
              )}
            </>
          )}

          <div ref={historyEndRef} />
        </section>

        <div className="chat-input-area">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="O QUE VOCÊ FAZ AGORA?..."
            disabled={!activeSession || isStreaming}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={!activeSession || isStreaming || messages.length === 0}
            onClick={() => void handleContinue()}
            title="Pedir para o narrador continuar a cena"
          >
            Continuar
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!activeSession || isStreaming || !inputValue.trim()}
            onClick={() => void handleSend()}
          >
            Transmitir
          </button>
        </div>
      </main>

      {showNewStory && (
        <NewStoryModal
          characters={characters}
          personas={personas}
          initialCharacter={preselectedChar}
          onClose={() => setShowNewStory(false)}
          onCreate={handleCreateSession}
        />
      )}

      {showCharacterModal && (
        <CharacterModal
          editingCharacter={editingCharacter}
          onClose={() => {
            setShowCharacterModal(false);
            setEditingCharacter(null);
          }}
          onSave={handleSaveCharacter}
        />
      )}

      {showPersonas && (
        <PersonaModal
          personas={personas}
          onClose={() => setShowPersonas(false)}
          onCreate={async (name, description, avatarUrl) => {
            const created = await api.createPersona({
              name,
              description,
              avatar_url: avatarUrl,
            });
            setPersonas((prev) => [created, ...prev]);
          }}
          onDelete={async (id) => {
            await api.deletePersona(id);
            setPersonas((prev) => prev.filter((p) => p.id !== id));
          }}
        />
      )}

      {showSessionSettings && activeSession && (
        <SessionSettingsModal
          session={activeSession}
          personas={personas}
          availableModels={availableModels}
          defaultModel={defaultModel}
          onClose={() => setShowSessionSettings(false)}
          onSave={async (payload) => {
            const updated = await api.updateSession(activeSession.id, payload);
            setSessions((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s))
            );
          }}
        />
      )}

      {showMemoryModal && activeSession && (
        <MemoryModal
          session={activeSession}
          onClose={() => setShowMemoryModal(false)}
          onSessionUpdated={(updated) => {
            setSessions((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s))
            );
          }}
        />
      )}
    </div>
  );
}
export default App;
