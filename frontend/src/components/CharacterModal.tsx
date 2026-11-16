import { useState } from "react";
import { api } from "../api/client";
import type { Character, ThemeName, WebImportPreview } from "../types";
import { WebLoreImporter } from "./WebLoreImporter";

interface CharacterModalProps {
  editingCharacter?: Character | null;
  onClose: () => void;
  onSave: (
    payload: Omit<Character, "id" | "is_builtin" | "created_at">,
    existingId?: number
  ) => Promise<void>;
}

export function CharacterModal({
  editingCharacter,
  onClose,
  onSave,
}: CharacterModalProps) {
  const [name, setName] = useState(editingCharacter?.name ?? "");
  const [worldKey, setWorldKey] = useState(
    editingCharacter?.world_key ?? "custom"
  );
  const [tagline, setTagline] = useState(editingCharacter?.tagline ?? "");
  const [scenario, setScenario] = useState(editingCharacter?.scenario ?? "");
  const [systemPrompt, setSystemPrompt] = useState(
    editingCharacter?.system_prompt ?? ""
  );
  const [greeting, setGreeting] = useState(editingCharacter?.greeting ?? "");
  const [avatarUrl, setAvatarUrl] = useState(editingCharacter?.avatar_url ?? "");
  const [theme, setTheme] = useState<ThemeName>(
    editingCharacter?.theme === "arcane" ? "arcane" : "cyberpunk"
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showWebSearch, setShowWebSearch] = useState(false);

  function handleWebImported(preview: WebImportPreview) {
    if (!name.trim()) setName(preview.title);
    if (!tagline.trim()) {
      setTagline(preview.content.split("\n")[0].slice(0, 140));
    }
    setScenario(preview.content);
    setShowWebSearch(false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await api.uploadAvatar(file);
      setAvatarUrl(url);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !scenario.trim()) return;
    setSaving(true);
    try {
      await onSave(
        {
          name: name.trim(),
          world_key: worldKey.trim() || "custom",
          tagline: tagline.trim(),
          scenario: scenario.trim(),
          system_prompt: systemPrompt.trim(),
          greeting: greeting.trim(),
          avatar_url: avatarUrl.trim(),
          theme,
        },
        editingCharacter?.id
      );
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
        <h2>
          {editingCharacter
            ? "Editar Personagem / Universo"
            : "Criar Personagem / Universo"}
        </h2>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => setShowWebSearch((prev) => !prev)}
        >
          {showWebSearch
            ? "Fechar Busca Web"
            : "🌐 Puxar Lore da Web (Wiki / Fandom)"}
        </button>

        {showWebSearch && (
          <WebLoreImporter
            targetMode="character"
            onImported={handleWebImported}
          />
        )}

        <label className="field-label">Avatar / Capa (Opcional)</label>
        <div className="avatar-upload-row">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Prévia" className="avatar-thumb large" />
          ) : (
            <div className="avatar-thumb large placeholder">
              {(name[0] || "?").toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
            <input
              type="text"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="Cole uma URL de imagem ou envie um arquivo abaixo..."
            />
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={uploading}
              onChange={(e) => void handleFileChange(e)}
            />
          </div>
        </div>

        <label className="field-label">Nome do Personagem ou História</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Vi — Beco da Subferia"
          required
        />

        <div className="two-col-grid">
          <div>
            <label className="field-label">Tag / Gênero</label>
            <input
              type="text"
              value={worldKey}
              onChange={(e) => setWorldKey(e.target.value)}
              placeholder="cyberpunk, arcane, fantasia, sci-fi..."
            />
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

        <label className="field-label">Descrição Curta (Card)</label>
        <input
          type="text"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="Resumo de 1 linha exibido na vitrine..."
        />

        <label className="field-label">Cenário & Regras do Mundo</label>
        <textarea
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          placeholder="Descreva o ambiente, conflito inicial e comportamento dos NPCs..."
          required
        />

        <label className="field-label">
          Personalidade & Diretrizes do Bot (Opcional)
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Traços de fala, segredos do personagem, tom narrativo..."
        />

        <label className="field-label">
          Saudação Inicial Pronta (Opcional — estilo PolyBuzz)
        </label>
        <textarea
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          placeholder="Se preencher, toda nova história já abre exatamente com esta cena/fala inicial..."
        />

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={saving || uploading}
          >
            {saving ? "Salvando..." : "Salvar no Catálogo"}
          </button>
        </div>
      </form>
    </div>
  );
}
