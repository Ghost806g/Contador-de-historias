import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { LorebookEntry, StorySession, WebImportPreview } from "../types";
import { WebLoreImporter } from "./WebLoreImporter";

interface MemoryModalProps {
  session: StorySession;
  onClose: () => void;
  onSessionUpdated: (updated: StorySession) => void;
}

function guessWikiSource(session: StorySession): string {
  const txt = `${session.title} ${session.scenario_context}`.toLowerCase();
  if (txt.includes("arcane") || txt.includes("piltover") || txt.includes("zaun")) return "arcane";
  if (txt.includes("cyberpunk") || txt.includes("night city") || txt.includes("arasaka")) return "cyberpunk";
  if (txt.includes("overwatch") || txt.includes("ômnica")) return "overwatch";
  if (txt.includes("valorant") || txt.includes("radianita")) return "valorant";
  return "auto";
}

export function MemoryModal({
  session,
  onClose,
  onSessionUpdated,
}: MemoryModalProps) {
  const [tab, setTab] = useState<"summary" | "lorebook" | "web">("summary");
  const [summaryDraft, setSummaryDraft] = useState(session.summary_memory);
  const [savingSummary, setSavingSummary] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  const [entries, setEntries] = useState<LorebookEntry[]>([]);
  const [loadingLore, setLoadingLore] = useState(true);
  const [title, setTitle] = useState("");
  const [keywords, setKeywords] = useState("");
  const [content, setContent] = useState("");
  const [alwaysActive, setAlwaysActive] = useState(true);
  const [scope, setScope] = useState<"session" | "character">("session");
  const [error, setError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  useEffect(() => {
    setSummaryDraft(session.summary_memory);
  }, [session.summary_memory]);

  useEffect(() => {
    async function load() {
      setLoadingLore(true);
      try {
        const list = await api.listLorebook(session.id, session.character_id);
        setEntries(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar memórias.");
      } finally {
        setLoadingLore(false);
      }
    }
    void load();
  }, [session.id, session.character_id]);

  async function handleSaveSummary() {
    setSavingSummary(true);
    setError(null);
    try {
      const updated = await api.updateSessionMemory(session.id, summaryDraft);
      onSessionUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar memória.");
    } finally {
      setSavingSummary(false);
    }
  }

  async function handleAutoSummarizeNow() {
    setSummarizing(true);
    setError(null);
    try {
      const updated = await api.summarizeSession(session.id);
      setSummaryDraft(updated.summary_memory);
      onSessionUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao resumir com a IA.");
    } finally {
      setSummarizing(false);
    }
  }

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setError(null);
    try {
      const created = await api.createLorebookEntry({
        session_id: scope === "session" ? session.id : null,
        character_id:
          scope === "character" && session.character_id
            ? session.character_id
            : null,
        title: title.trim(),
        keywords: alwaysActive ? "" : keywords.trim(),
        content: content.trim(),
        always_active: alwaysActive,
      });
      setEntries((prev) => [created, ...prev]);
      setTitle("");
      setKeywords("");
      setContent("");
      setImportNotice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao adicionar memória.");
    }
  }

  function handleWebImported(preview: WebImportPreview) {
    setTitle(preview.title);
    setKeywords(preview.keywords);
    setContent(preview.content);
    setAlwaysActive(false);
    setImportNotice(
      `Lore importada de ${preview.source_url}. Revise as palavras-chave e clique em "+ Adicionar Memória".`
    );
    setTab("lorebook");
  }

  async function handleToggleAlwaysActive(entry: LorebookEntry) {
    const updated = await api.updateLorebookEntry(entry.id, {
      always_active: !entry.always_active,
    });
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  async function handleDeleteEntry(id: number) {
    await api.deleteLorebookEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Memória Longa & Lorebook</h2>

        <div className="world-selector">
          <button
            type="button"
            className={`world-btn ${tab === "summary" ? "active" : ""}`}
            onClick={() => setTab("summary")}
          >
            Resumo Automático
          </button>
          <button
            type="button"
            className={`world-btn ${tab === "lorebook" ? "active" : ""}`}
            onClick={() => setTab("lorebook")}
          >
            Lorebook ({entries.length})
          </button>
          <button
            type="button"
            className={`world-btn ${tab === "web" ? "active" : ""}`}
            onClick={() => setTab("web")}
          >
            🌐 Buscar Lore na Web
          </button>
        </div>

        {error && <div className="message system">{error}</div>}
        {importNotice && <div className="message system">{importNotice}</div>}

        {tab === "summary" ? (
          <>
            <p style={{ fontSize: "0.82rem", opacity: 0.85 }}>
              As cenas antigas são resumidas automaticamente em segundo plano
              para a IA lembrar de tudo sem estourar o limite de tokens (já
              arquivado até mensagem #{session.summarized_up_to_id}).
            </p>
            <textarea
              value={summaryDraft}
              onChange={(e) => setSummaryDraft(e.target.value)}
              placeholder="Nenhum resumo gerado ainda. Você pode escrever fatos importantes aqui ou pedir para a IA resumir as cenas antigas."
              style={{ minHeight: "180px" }}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={summarizing}
                onClick={() => void handleAutoSummarizeNow()}
              >
                {summarizing ? "Resumindo..." : "⚡ Resumir com IA Agora"}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={savingSummary}
                onClick={() => void handleSaveSummary()}
              >
                {savingSummary ? "Salvando..." : "Salvar Resumo"}
              </button>
            </div>
          </>
        ) : tab === "web" ? (
          <>
            <p style={{ fontSize: "0.82rem", opacity: 0.85 }}>
              Pesquise personagens, facções ou locais em Wikis (Fandom /
              Wikipédia) e importe como ficha de Lorebook ativada por
              palavras-chave.
            </p>
            <WebLoreImporter
              defaultSource={guessWikiSource(session)}
              targetMode="lorebook"
              onImported={handleWebImported}
            />
          </>
        ) : (
          <>
            <form
              onSubmit={(e) => void handleAddEntry(e)}
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              <label className="field-label">Novo Fato / Entrada de Lore</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Pacto com Viktor / Segredo do Beco"
                required
              />

              <div className="two-col-grid">
                <div>
                  <label className="field-label">Ativação</label>
                  <select
                    value={alwaysActive ? "always" : "keywords"}
                    onChange={(e) => setAlwaysActive(e.target.value === "always")}
                  >
                    <option value="always">Memória Fixada (Sempre ativa)</option>
                    <option value="keywords">Por Palavras-chave</option>
                  </select>
                </div>

                {session.character_id !== null && (
                  <div>
                    <label className="field-label">Escopo</label>
                    <select
                      value={scope}
                      onChange={(e) =>
                        setScope(e.target.value as "session" | "character")
                      }
                    >
                      <option value="session">Apenas nesta história</option>
                      <option value="character">Global do Personagem</option>
                    </select>
                  </div>
                )}
              </div>

              {!alwaysActive && (
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="Palavras-chave separadas por vírgula (ex: viktor, laboratorio, hexcore)"
                  required
                />
              )}

              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Fato ou detalhe de lore que a IA precisa lembrar..."
                required
              />

              <div className="modal-actions">
                <button type="submit" className="btn-primary">
                  + Adicionar Memória
                </button>
              </div>
            </form>

            <label className="field-label">Memórias Salvas</label>
            <div className="persona-list">
              {loadingLore ? (
                <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>Carregando...</p>
              ) : entries.length === 0 ? (
                <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>
                  Nenhuma memória fixada ou entrada de lore ainda.
                </p>
              ) : (
                entries.map((entry) => (
                  <div key={entry.id} className="persona-item">
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <strong style={{ color: "var(--cy-yellow)" }}>
                          {entry.title}
                        </strong>
                        <span className="character-card-badge">
                          {entry.always_active
                            ? "Fixada"
                            : `Gatilho: ${entry.keywords}`}
                        </span>
                        {entry.character_id && !entry.session_id && (
                          <span className="character-card-badge greeting">
                            Global
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: "0.82rem", marginTop: "4px" }}>
                        {entry.content}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button
                        type="button"
                        className="msg-action-btn"
                        onClick={() => void handleToggleAlwaysActive(entry)}
                        title="Alternar Fixada / Palavras-chave"
                      >
                        {entry.always_active ? "📌" : "🔑"}
                      </button>
                      <button
                        type="button"
                        className="btn-icon-danger"
                        onClick={() => void handleDeleteEntry(entry.id)}
                        title="Apagar entrada"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
