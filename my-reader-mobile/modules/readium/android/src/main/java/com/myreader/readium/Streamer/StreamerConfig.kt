package com.myreader.readium.Streamer

import com.myreader.readium.Types.FormatRegistrationRecord
import com.myreader.readium.Types.PublicationOpenerConfigRecord
import org.readium.r2.shared.publication.protection.ContentProtection

/**
 * Open-architecture configuration for the Readium Streamer (REP-005/006).
 *
 * Singleton holding custom format registrations, native onCreatePublication
 * transform ids, and content-protection schemes. `ReaderService` reads
 * `contentProtections` when building the `PublicationOpener`; the transform /
 * format entries are reserved for Phase 2 (CSS/JS injection, MOBI/AZW3 parsers,
 * LCP) — Phase 1 only stores them so the registration API is wired end-to-end.
 */
object StreamerConfig {
  val formatRegistrations = mutableMapOf<String, FormatRegistrationRecord>()
  val transforms = mutableSetOf<String>()
  var contentProtections: List<ContentProtection> = emptyList()
    private set

  fun apply(config: PublicationOpenerConfigRecord) {
    config.transforms?.let {
      transforms.clear()
      transforms.addAll(it)
    }
    config.formats?.forEach { registerFormat(it) }
    // contentProtection (REP-006) reserved — Phase 3.
  }

  fun registerFormat(registration: FormatRegistrationRecord) {
    formatRegistrations[registration.id] = registration
  }
}
