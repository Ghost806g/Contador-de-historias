import { useState } from "react";
import { api } from "../api/client";
import type { Persona } from "../types";

interface PersonaModalProps {
  personas: Persona[];
  onClose: () => void;
  onCreate: (name: string, description: string, avatarUrl: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function PersonaModal({
  personas,
  onClose,
  onCreate,
  onDelete,
}: PersonaModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;
    setSaving(true);
    try {
      await onCreate(name.trim(), description.trim(), avatarUrl.trim());
      setName("");
      setDescription("");
      setAvatarUrl("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Suas Personas</h2>

        <form
          onSubmit={(e) => void handleAdd(e)}
          style={{ display: "flex", flexDirection: "column", gap: "10px" }}
        >
          <label className="field-label">Nome da Persona</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Kael, mercenário silencioso"
            required
          />

          <label className="field-label">Avatar (Opcional)</label>
          <div className="avatar-upload-row">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Prévia" className="avatar-thumb" />
            ) : (
              <div className="avatar-thumb placeholder">
                {(name[0] || "P").toUpperCase()}
              </div>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={uploading}
              onChange={(e) => void handleFileChange(e)}
            />
          </div>

          <label className="field-label">Aparência, Personalidade & Passado</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Como os NPCs te enxergam, seu jeito de falar e história..."
            required
          />
          <div className="modal-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || uploading}
            >
              {saving ? "Salvando..." : "+ Salvar Persona"}
            </button>
          </div>
        </form>

        <label className="field-label">Personas Cadastradas</label>
        <div className="persona-list">
          {personas.length === 0 ? (
            <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>
              Nenhuma persona salva ainda.
            </p>
          ) : (
            personas.map((persona) => (
              <div key={persona.id} className="persona-item">
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  {persona.avatar_url ? (
                    <img
                      src={persona.avatar_url}
                      alt={persona.name}
                      className="avatar-thumb"
                    />
                  ) : (
                    <div className="avatar-thumb placeholder">
                      {persona.name[0]?.toUpperCase() || "P"}
                    </div>
                  )}
                  <div>
                    <strong style={{ color: "var(--cy-yellow)" }}>
                      {persona.name}
                    </strong>
                    <p style={{ fontSize: "0.82rem", marginTop: "4px" }}>
                      {persona.description}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-icon-danger"
                  onClick={() => void onDelete(persona.id)}
                  title="Apagar persona"
                >
                  🗑
                </button>
              </div>
            ))
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
