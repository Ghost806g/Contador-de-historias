import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { StoryMessage } from "../types";

interface MessageBubbleProps {
  message: StoryMessage;
  isLastAssistant: boolean;
  isStreaming: boolean;
  ttsSupported: boolean;
  isSpeaking: boolean;
  onToggleSpeak: (messageId: number, content: string) => void;
  onEdit: (messageId: number, content: string) => Promise<void>;
  onRewind: (messageId: number) => Promise<void>;
  onRegenerate: (messageId: number) => Promise<void>;
  onSwitchVariant: (messageId: number, variantIndex: number) => Promise<void>;
}

export function MessageBubble({
  message,
  isLastAssistant,
  isStreaming,
  ttsSupported,
  isSpeaking,
  onToggleSpeak,
  onEdit,
  onRewind,
  onRegenerate,
  onSwitchVariant,
}: MessageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  const sanitizedHtml = useMemo(() => {
    if (message.role !== "assistant") return "";
    const parsed = marked.parse(message.content, { async: false });
    return DOMPurify.sanitize(parsed);
  }, [message.content, message.role]);

  const variantCount = message.variants?.length ?? 1;
  const activeIdx = message.active_variant ?? 0;

  async function handleSaveEdit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    await onEdit(message.id, trimmed);
    setEditing(false);
  }

  return (
    <div className={`message ${message.role}`}>
      <div className="message-header">
        <span className="message-role">
          {message.role === "user" ? "Você" : "Narrador (IA)"}
        </span>

        <div className="message-actions">
          {message.role === "assistant" && ttsSupported && (
            <button
              type="button"
              className="msg-action-btn"
              onClick={() => onToggleSpeak(message.id, message.content)}
              title={isSpeaking ? "Parar leitura" : "Ouvir narração"}
            >
              {isSpeaking ? "⏹ Parar" : "🔊 Ouvir"}
            </button>
          )}

          {message.role === "assistant" && variantCount > 1 && (
            <span className="variant-switcher">
              <button
                type="button"
                className="msg-action-btn"
                disabled={isStreaming || activeIdx <= 0}
                onClick={() => void onSwitchVariant(message.id, activeIdx - 1)}
                title="Variante anterior"
              >
                ◀
              </button>
              <span>
                {activeIdx + 1}/{variantCount}
              </span>
              <button
                type="button"
                className="msg-action-btn"
                disabled={isStreaming || activeIdx >= variantCount - 1}
                onClick={() => void onSwitchVariant(message.id, activeIdx + 1)}
                title="Próxima variante"
              >
                ▶
              </button>
            </span>
          )}

          {isLastAssistant && (
            <button
              type="button"
              className="msg-action-btn"
              disabled={isStreaming}
              onClick={() => void onRegenerate(message.id)}
              title="Gerar outra resposta"
            >
              ↻ Regenerar
            </button>
          )}

          <button
            type="button"
            className="msg-action-btn"
            disabled={isStreaming}
            onClick={() => {
              setDraft(message.content);
              setEditing((prev) => !prev);
            }}
            title="Editar mensagem"
          >
            ✎ Editar
          </button>

          <button
            type="button"
            className="msg-action-btn danger"
            disabled={isStreaming}
            onClick={() => void onRewind(message.id)}
            title="Apagar esta mensagem e voltar a história até aqui"
          >
            ⏪ Rebobinar
          </button>
        </div>
      </div>

      {editing ? (
        <div className="message-edit-box">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="modal-actions">
            <button
              type="button"
              className="msg-action-btn danger"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="msg-action-btn"
              onClick={() => void handleSaveEdit()}
            >
              Salvar
            </button>
          </div>
        </div>
      ) : message.role === "assistant" ? (
        <div
          className="message-body"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      ) : (
        <div className="message-body">{message.content}</div>
      )}
    </div>
  );
}
