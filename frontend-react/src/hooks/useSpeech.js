import { useCallback, useRef } from "react";
import { SPEECH_GAP } from "../constants";

/**
 * Speech synthesis wrapper with cooldown to prevent overlapping utterances.
 */
export default function useSpeech() {
  const synthRef     = useRef(window.speechSynthesis);
  const lastSpoken   = useRef(0);

  const speak = useCallback((text, force = false) => {
    const now = Date.now();
    if (force || now - lastSpoken.current > SPEECH_GAP) {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.2;
      synthRef.current.speak(u);
      lastSpoken.current = now;
    }
  }, []);

  const resetCooldown = useCallback(() => {
    lastSpoken.current = 0;
  }, []);

  return { speak, resetCooldown };
}
