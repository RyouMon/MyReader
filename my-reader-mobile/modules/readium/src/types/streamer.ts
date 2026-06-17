import type { FormatRegistration } from './format';

/**
 * Streamer / PublicationOpener configuration (REP-005).
 *
 * The fork hard-codes `PublicationOpener(DefaultPublicationParser)` with no
 * hooks. This config opens it up: custom format parsers, onCreatePublication
 * transforms, and content protection can be configured from JS.
 */

/**
 * Identifier for a native `onCreatePublication` transform (e.g. css-inject,
 * meta-patch, resource-rewrite). The transform body is implemented in native
 * (Swift/Kotlin) and registered under this id; JS only enables it by id.
 *
 * (REP-002 Fetcher: resource transforms are the same mechanism.)
 */
export type PublicationTransformId = string;

export interface PublicationOpenerConfig {
  /** Enabled native onCreatePublication transforms. */
  transforms?: PublicationTransformId[];
  /** Custom format registrations to activate (see format/). */
  formats?: FormatRegistration[];
  /** Content protection scheme id (REP-006), e.g. 'lcp'. Reserved — Phase 3. */
  contentProtection?: string;
}
