import { useCallback, useRef, useState } from "react";

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback((text: string) => {
    if (!text || !window.speechSynthesis) return;

    // Stop any current speech
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.9;
    utter.pitch = 0.95;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    utterRef.current = utter;
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const toggle = useCallback(
    (text: string) => {
      if (speaking) stop();
      else speak(text);
    },
    [speaking, speak, stop],
  );

  return { speaking, toggle, stop };
}
