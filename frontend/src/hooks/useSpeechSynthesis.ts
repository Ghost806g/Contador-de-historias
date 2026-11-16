import { useCallback, useEffect, useState } from "react";

function stripMarkdownForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~#>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function useSpeechSynthesis() {
  const [speakingMessageId, setSpeakingMessageId] = useState<number | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeakingMessageId(null);
  }, [supported]);

  useEffect(() => {
    return () => {
      if (supported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [supported]);

  const speak = useCallback(
    (messageId: number, rawText: string) => {
      if (!supported) return;
      const clean = stripMarkdownForSpeech(rawText);
      if (!clean) return;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = "pt-BR";
      utterance.rate = 1.03;

      const voices = window.speechSynthesis.getVoices();
      const ptVoice =
        voices.find((v) => v.lang.toLowerCase().startsWith("pt-br")) ||
        voices.find((v) => v.lang.toLowerCase().startsWith("pt"));
      if (ptVoice) {
        utterance.voice = ptVoice;
      }

      utterance.onend = () => setSpeakingMessageId(null);
      utterance.onerror = () => setSpeakingMessageId(null);

      setSpeakingMessageId(messageId);
      window.speechSynthesis.speak(utterance);
    },
    [supported]
  );

  const toggleAutoSpeak = useCallback(() => {
    setAutoSpeak((prev) => {
      if (prev) stop();
      return !prev;
    });
  }, [stop]);

  return {
    supported,
    speakingMessageId,
    autoSpeak,
    toggleAutoSpeak,
    speak,
    stop,
  };
}

