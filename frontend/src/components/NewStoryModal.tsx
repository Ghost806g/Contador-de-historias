import { useState } from "react";
import type { Character, Persona, ThemeName } from "../types";

interface NewStoryModalProps {
  characters: Character[];
  personas: Persona[];
  initialCharacter?: Character | null;
  onClose: () => void;
  onCreate: (payload: {
    character_name: string;
    scenario_context: string;
    title?: string;
    character_id?: number | null;
    persona_id?: number | null;
    theme?: ThemeName;
  }) => Promise<void>;
}

export function NewStoryModal({
  characters,
  personas,
  initialCharacter,
  onClose,
  onCreate,
}: NewStoryModalProps) {
  const defaultChar = initialCharacter ?? characters[0] ?? null;

  const [selectedCharId, setSelectedCharId] = useState<number | "custom">(
    defaultChar ? defaultChar.id : "custom"
  );
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");
  const [characterName, setCharacterName] = useState("");
  const [scenario, setScenario] = useState(defaultChar?.scenario ?? "");
  const [theme, setTheme] = useState<ThemeName>(
    defaultChar?.theme === "arcane" ? "arcane" : "cyberpunk"
  );
  const [submitting, setSubmitting] = useState(false);

  function selectWorld(char: Character | "custom") {
    if (char === "custom") {
      setSelectedCharId("custom");
      setScenario("");
      return;
    }
    setSelectedCharId(char.id);
    setScenario(char.scenario);
    setTheme(char.theme === "arcane" ? "arcane" : "cyberpunk");
  }

  function handlePersonaChange(value: string) {
    setSelectedPersonaId(value);
    if (!value) return;
    const persona = personas.find((p) => p.id === Number(value));
    if (persona && !characterName.trim()) {
      setCharacterName(`${persona.name} — ${persona.description}`);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!characterName.trim() || !scenario.trim()) return;
    setSubmitting(true);
    try {
      await onCreate({
        character_name: characterName.trim(),
        scenario_context: scenario.trim(),
        character_id: selectedCharId === "custom" ? null : selectedCharId,
        persona_id: selectedPersonaId ? Number(selectedPersonaId) : null,
        theme,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
      >
        <h2>Iniciar Nova História</h2>

        <label className="field-label">1. Escolha o Mundo / Personagem Base</label>
        <div className="world-selector">
          {characters.map((char) => (
            <button
              key={char.id}
              type="button"
              className={`world-btn ${selectedCharId === char.id ? "active" : ""}`}
              onClick={() => selectWorld(char)}
            >
              {char.world_key !== "custom" ? char.world_key : char.name}
            </button>
          ))}
          <button
            type="button"
            className={`world-btn ${selectedCharId === "custom" ? "active" : ""}`}
            onClick={() => selectWorld("custom")}
          >
            Outro
          </button>
        </div>

        {personas.length > 0 && (
          <>
            <label className="field-label">Persona Salva (Opcional)</label>
            <select
              value={selectedPersonaId}
              onChange={(e) => handlePersonaChange(e.target.value)}
            >
              <option value="">Sem persona fixa</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        )}

        <label className="field-label">2. Quem é você na cena?</label>
        <input
          type="text"
          value={characterName}
          onChange={(e) => setCharacterName(e.target.value)}
          placeholder="Ex: Jinx, cabelo azul, imprevisível..."
          required
        />

        <label className="field-label">3. Cenário, Regras e Reações</label>
        <textarea
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          placeholder="Descreva o cenário, atmosfera e como os personagens reagem a você..."
          required
        />

        <label className="field-label">4. Tema Visual</label>
        <div className="world-selector">
          <button
            type="button"
            className={`world-btn ${theme === "cyberpunk" ? "active" : ""}`}
            onClick={() => setTheme("cyberpunk")}
          >
            Cyberpunk
          </button>
          <button
            type="button"
            className={`world-btn ${theme === "arcane" ? "active" : ""}`}
            onClick={() => setTheme("arcane")}
          >
            Arcane
          </button>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Conectando..." : "Conectar"}
          </button>
        </div>
      </form>
    </div>
  );
}

