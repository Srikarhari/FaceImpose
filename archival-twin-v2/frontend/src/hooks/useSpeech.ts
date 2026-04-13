import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTTSAudio } from "../api/client";

export function useSpeech(preloadText?: string | null) {
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Preload cache: keyed by text
  const cacheRef = useRef<{ text: string; url: string } | null>(null);
  const fetchingRef = useRef<string | null>(null);

  const revokeCache = useCallback(() => {
    if (cacheRef.current) {
      URL.revokeObjectURL(cacheRef.current.url);
      cacheRef.current = null;
    }
    fetchingRef.current = null;
  }, []);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const stop = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  const invalidate = useCallback(() => {
    stopPlayback();
    revokeCache();
  }, [stopPlayback, revokeCache]);

  // Preload TTS audio when preloadText changes
  useEffect(() => {
    if (!preloadText) {
      revokeCache();
      return;
    }
    // Already cached for this text
    if (cacheRef.current?.text === preloadText) return;
    // Already fetching this text
    if (fetchingRef.current === preloadText) return;

    revokeCache();
    fetchingRef.current = preloadText;
    const text = preloadText;

    fetchTTSAudio(text).then((blob) => {
      // Check we haven't been invalidated or text changed
      if (fetchingRef.current !== text) return;
      fetchingRef.current = null;
      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        cacheRef.current = { text, url };
      }
    });

    return () => {
      // If text changes mid-fetch, mark stale
      if (fetchingRef.current === text) {
        fetchingRef.current = null;
      }
    };
  }, [preloadText, revokeCache]);

  const speakBrowser = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.9;
    utter.pitch = 0.95;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  }, []);

  const playFromUrl = useCallback(
    (url: string, text: string) => {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { stopPlayback(); };
      audio.onerror = () => { stopPlayback(); speakBrowser(text); };
      setSpeaking(true);
      audio.play().catch(() => { stopPlayback(); speakBrowser(text); });
    },
    [stopPlayback, speakBrowser],
  );

  const toggle = useCallback(
    (text: string) => {
      if (speaking) {
        stop();
        return;
      }

      // Use cached audio if available
      if (cacheRef.current?.text === text) {
        playFromUrl(cacheRef.current.url, text);
        return;
      }

      // No cache — fall back to browser speech (instant, no delay)
      speakBrowser(text);
    },
    [speaking, stop, playFromUrl, speakBrowser],
  );

  return { speaking, toggle, stop, invalidate };
}
