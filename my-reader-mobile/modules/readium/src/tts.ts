import { ReadiumModule } from "./ReadiumModule"

export type {
  TtsEngineConfig,
  TtsEngineKind,
  TtsPlaybackState,
  TtsPlaybackStatus,
  TtsSynthesisCompletion,
  TtsSynthesisRequestEvent,
  TtsTiming,
  TtsVoice,
  Utterance,
} from "./types"

export const getSystemVoices = () => ReadiumModule.getSystemTtsVoices()
