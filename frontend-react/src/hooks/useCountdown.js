import { useState, useCallback, useRef } from "react";
import useSpeech from "./useSpeech";

/**
 * 3-2-1-GO countdown with speech.
 */
export default function useCountdown() {
  const [countdown, setCountdown] = useState(null);
  const activeRef = useRef(false);
  const { speak, resetCooldown } = useSpeech();

  const isActive = () => activeRef.current;

  const run = useCallback(() => new Promise((resolve) => {
    const steps = [3, 2, 1, "GO"];
    let i = 0;
    activeRef.current = true;

    const tick = () => {
      setCountdown(steps[i]);
      resetCooldown();
      speak(String(steps[i]));
      i++;
      if (i < steps.length) {
        setTimeout(tick, 950);
      } else {
        setTimeout(() => {
          setCountdown(null);
          activeRef.current = false;
          resolve();
        }, 700);
      }
    };
    tick();
  }), [speak, resetCooldown]);

  return { countdown, runCountdown: run, isCountdownActive: isActive };
}
