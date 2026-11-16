import { useState } from "react";
import { api } from "../api/client";
import type { WebImportPreview, WebSearchHit } from "../types";

interface WebLoreImporterProps {
  defaultSource?: string;
  targetMode: "lorebook" | "character";
  onImported: (preview: WebImportPreview) => void;
}

const SOURCE_OPTIONS = [
  { value: "auto", label: "Wikipédia (PT/EN)" },
  { value: "arcane", label: "Arcane / LoL Wiki" },
  { value: "cyberpunk", label: "Cyberpunk Wiki" },
  { value: "overwatch", label: "Overwatch Wiki" },
  { value: "valorant", label: "Valorant Wiki" },
  { value: "custom-fandom", label: "Outra Fandom Wiki..." },
];

export function WebLoreImporter({
  defaultSource = "auto",
  targetMode,
  onImported,
}: WebLoreImporterProps) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState(defaultSource);
  const [customWiki, setCustomWiki] = useState("");
  const [summarizeWithAi, setSummarizeWithAi] = useState(false);

  const [searching, setSearching] = useState(false);
  const [importingTitle, setImportingTitle] = useState<string | null>(null);
  const [hits, setHits] = useState<WebSearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setHits([]);
    try {
      const results = await api.searchWebLore({
        query: query.trim(),
        source,
        custom_wiki: customWiki.trim(),
      });
      setHits(results);
      if (results.length === 0) {
        setError("Nenhum artigo encontrado. Tente outro termo ou troque a fonte.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na busca web.");
    } finally {
      setSearching(false);
    }
  }

  async function handlePickHit(hit: WebSearchHit) {
    setImportingTitle(hit.title);
    setError(null);
    try {
      const preview = await api.importWebLore({
        api_url: hit.api_url,
        title: hit.title,
        source_label: hit.source_label,
        summarize_with_ai: summarizeWithAi,
        target_mode: targetMode,
      });
      onImported(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar artigo.");
    } finally {
      setImportingTitle(null);
    }
  }

  return (
    <div className="web-importer-box">
      <div className="two-col-grid">
        <div>
          <label className="field-label">Fonte da Pesquisa</label>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label">Modo de Importação</label>
          <select
            value={summarizeWithAi ? "ai" : "fast"}
            onChange={(e) => setSummarizeWithAi(e.target.value === "ai")}
          >
            <option value="fast">Rápido (Extrato direto em 1s)</option>
            <option value="ai">Sintetizar em PT com IA (mais lento)</option>
          </select>
        </div>
      </div>

      {source === "custom-fandom" && (
        <input
          type="text"
          value={customWiki}
          onChange={(e) => setCustomWiki(e.target.value)}
          placeholder="Subdomínio da Fandom (ex: eldenring, witcher, harrypotter)"
        />
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSearch();
            }
          }}
          placeholder="Ex: Silco, Piltover, Arasaka, Zaun, Kiriko..."
        />
        <button
          type="button"
          className="btn-primary"
          disabled={searching || !query.trim()}
          onClick={() => void handleSearch()}
        >
          {searching ? "Buscando..." : "🌐 Buscar"}
        </button>
      </div>

      {error && <p style={{ color: "var(--cy-red)", fontSize: "0.82rem" }}>{error}</p>}

      {hits.length > 0 && (
        <div className="web-results-list">
          {hits.map((hit) => (
            <div key={hit.page_url} className="web-hit-card">
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ color: "var(--cy-yellow)" }}>{hit.title}</strong>
                  <span className="character-card-badge">{hit.source_label}</span>
                </div>
                {hit.snippet && (
                  <p style={{ fontSize: "0.8rem", marginTop: "4px", opacity: 0.85 }}>
                    {hit.snippet}...
                  </p>
                )}
              </div>
              <button
                type="button"
                className="btn-secondary"
                disabled={importingTitle !== null}
                onClick={() => void handlePickHit(hit)}
              >
                {importingTitle === hit.title ? "Lendo..." : "Importar"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

