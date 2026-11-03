import { useEffect, useState } from "react"

export function useSystemTtsVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    const update = () => setVoices(window.speechSynthesis?.getVoices() ?? [])
    update()
    window.speechSynthesis?.addEventListener("voiceschanged", update)
    return () =>
      window.speechSynthesis?.removeEventListener("voiceschanged", update)
  }, [])
  return voices
}
