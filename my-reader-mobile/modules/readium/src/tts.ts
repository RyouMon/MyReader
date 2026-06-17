/**
 * TTS extension point (REP-adjacent). Position-neutral by design — see
 * `types/tts.ts`. Phase 1 ships only the interface + the `publication.content()`
 * utterance foundation; no coordinator/engine is implemented here.
 *
 * Future paths (all must remain possible):
 *  (a) JS engine implementing `TTSEngine` (system TTS / network / custom model)
 *  (b) iOS native `TTSEngine` protocol injected into `PublicationSpeechSynthesizer`
 *  (c) Android native self-built engine (toolkit has no TTS)
 *
 * Utterances come from `publication.getContent(id)`; reading highlight reuses
 * the Decoration API (REP-008).
 */
export type { TTSEngine, Utterance } from './types';
