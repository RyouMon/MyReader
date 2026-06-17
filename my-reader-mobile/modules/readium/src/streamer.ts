import { ReadiumModule } from './ReadiumModule';
import type { PublicationOpenerConfig } from './types';

/**
 * Configure the shared PublicationOpener (REP-005).
 *
 * Call before opening publications. Enables native onCreatePublication
 * transforms, custom format parsers, and (Phase 3) content protection.
 */
export function configure(config: PublicationOpenerConfig): void {
  ReadiumModule.configure(config);
}
