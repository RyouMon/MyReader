import Foundation
import ReadiumShared

/// Open-architecture Streamer configuration (REP-005/006).
///
/// Phase 1 stores the configuration and always opens publications with the
/// default Readium parsers. Custom `PublicationParser` registration (MOBI/AZW3),
/// `onCreatePublication` transforms (CSS/JS injection, custom services), and
/// content protections (LCP/DRM) are wired in Phase 2. The shape is fixed now
/// so the JS API (`streamer.configure`, `format.register`) is stable.
final class StreamerConfig {
  static let shared = StreamerConfig()

  /// Registered custom format parsers, keyed by registration id. Phase 2 will
  /// route sniffed assets to the matching native `PublicationParser`.
  private(set) var formatRegistrations: [FormatRegistrationRecord] = []

  /// Native transform ids to apply via `onCreatePublication` (Phase 2).
  private(set) var transforms: [String] = []

  /// Native content protections to pass to `PublicationOpener` (Phase 2: LCP/DRM).
  var contentProtections: [ContentProtection] = []

  private init() {}

  func apply(_ config: PublicationOpenerConfigRecord) {
    self.transforms = config.transforms ?? []
    if let formats = config.formats {
      var byId = Dictionary(uniqueKeysWithValues: formatRegistrations.map { ($0.id, $0) })
      for format in formats {
        byId[format.id] = format
      }
      formatRegistrations = Array(byId.values)
    }
  }

  func registerFormat(_ registration: FormatRegistrationRecord) {
    var byId = Dictionary(uniqueKeysWithValues: formatRegistrations.map { ($0.id, $0) })
    byId[registration.id] = registration
    formatRegistrations = Array(byId.values)
  }
}
