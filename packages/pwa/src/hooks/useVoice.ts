import { useState, useRef, useCallback } from "react";

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function useVoice(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const supported = !!SpeechRecognition;

  const toggle = useCallback(() => {
    if (!SpeechRecognition) return;

    if (listening && recRef.current) {
      recRef.current.stop();
      setListening(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "zh-CN";
    rec.interimResults = false;
    rec.continuous = false;
    recRef.current = rec;

    rec.onresult = (e: any) => {
      const text = e.results[0]?.[0]?.transcript || "";
      if (text) onResult(text);
      setListening(false);
    };

    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);

    rec.start();
    setListening(true);
  }, [listening, onResult]);

  return { listening, toggle, supported };
}
