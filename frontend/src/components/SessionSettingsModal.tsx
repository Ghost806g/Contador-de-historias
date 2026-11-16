import { useState } from "react";
import type { Persona, StorySession, ThemeName } from "../types";

interface SessionSettingsModalProps {
  session: StorySession;
  personas: Persona[];
  availableModels: string[];
  defaultModel: string;
  onClose: () => void;
  onSave: (
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
  ) => Promise<void>;
}

export function SessionSettingsModal({
  session,
  personas,
  availableModels,
  defaultModel,
  onClose,
  onSave,
}: SessionSettingsModalProps) {
  const [title, setTitle] = useState(session.title);
  const [characterName, setCharacterName] = useState(session.character_name);
  const [scenarioContext, setScenarioContext] = useState(session.scenario_context);
  const [personaId, setPersonaId] = useState<string>(
    session.persona_id !== null ? String(session.persona_id) : ""
  );
  const [modelName, setModelName] = useState(session.model_name ?? "");
  const [temperature, setTemperature] = useState(session.temperature);
  const [topP, setTopP] = useState(session.top_p);
  const [theme, setTheme] = useState<ThemeName>(
    session.theme === "arcane" ? "arcane" : "cyberpunk"
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !characterName.trim() || !scenarioContext.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        character_name: characterName.trim(),
        scenario_context: scenarioContext.trim(),
        persona_id: personaId ? Number(personaId) : null,
        model_name: modelName.trim() || null,
        temperature,
        top_p: topP,
        theme,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
      >
        <h2>Configurações da História</h2>

        <label className="field-label">Título da Sessão</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <div className="two-col-grid">
          <div>
            <label className="field-label">Modelo de IA</label>
            <select
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
            >
              <option value="">Padrão ({defaultModel})</option>
              {availableModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Tema Visual</label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as ThemeName)}
            >
              <option value="cyberpunk">Cyberpunk</option>
              <option value="arcane">Arcane</option>
            </select>
          </div>
        </div>

        <label className="field-label">Persona Ativa</label>
        <select value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
          <option value="">Sem persona vinculada</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <div className="two-col-grid">
          <div>
            <label className="field-label">
              Temperatura (Criatividade): {temperature.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="field-label">
              Top-P (Diversidade): {topP.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={topP}
              onChange={(e) => setTopP(Number(e.target.value))}
            />
          </div>
        </div>

        <label className="field-label">Seu Personagem na Cena</label>
        <input
          type="text"
          value={characterName}
          onChange={(e) => setCharacterName(e.target.value)}
          required
        />

        <label className="field-label">Cenário e Regras Atuais</label>
        <textarea
          value={scenarioContext}
          onChange={(e) => setScenarioContext(e.target.value)}
          required
        />

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Salvando..." : "Aplicar"}
          </button>
        </div>
      </form>
    </div>
  );
}

