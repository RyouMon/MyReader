import type { Utterance } from './publication-handle';

/**
 * TTS engine abstraction point — POSITION-NEUTRAL by design.
 *
 * The architecture does NOT predetermine whether a TTS engine lives in JS or
 * native. Three future paths must remain possible:
 *   (a) Unified JS engine (system TTS / network service / custom model)
 *   (b) iOS native: implement Readium Swift `TTSEngine` protocol, inject via
 *       `PublicationSpeechSynthesizer(engineFactory:)`
 *   (c) Android native: self-built engine + audio playback (toolkit has no TTS)
 *
 * Phase 1 lays only the path-agnostic foundation: `publication.content()`
 * utterance iteration + this interface shape. No coordinator/engine is
 * implemented. Reading highlight will reuse the Decoration API (REP-008).
 */
export interface TTSEngine {
  /**
   * Synthesize `text`, invoking `onRange(start, end)` with character offsets
   * as portions (e.g. words) are spoken — drives word-level highlight.
   * Returns a handle to cancel playback.
   */
  speak(
    text: string,
    opts: {
      voice?: string;
      rate?: number;
      onRange?: (start: number, end: number) => void;
    }
  ): { cancel: () => void };
}

/** Re-exported for TTS consumers. */
export type { Utterance };
