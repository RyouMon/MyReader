import ExpoModulesCore
import Foundation

// MARK: - Locator (REP-003)

struct LocatorLocationsRecord: Record {
  @Field var fragments: [String]? = nil
  @Field var progression: Double = 0
  @Field var position: Double? = nil
  @Field var totalProgression: Double? = nil
  @Field var cssSelector: String? = nil
  @Field var partialCfi: String? = nil
  @Field var domRange: [String: Any]? = nil
  @Field var otherLocations: [String: Any]? = nil
}

struct LocatorTextRecord: Record {
  @Field var before: String? = nil
  @Field var highlight: String? = nil
  @Field var after: String? = nil
}

struct LocatorRecord: Record {
  @Field var href: String = ""
  @Field var type: String = ""
  @Field var target: Int? = nil
  @Field var title: String? = nil
  @Field var locations: LocatorLocationsRecord? = nil
  @Field var text: LocatorTextRecord? = nil
}

// MARK: - Preferences (REP-009, all 25 fields)

struct PreferencesRecord: Record {
  @Field var backgroundColor: String? = nil
  @Field var columnCount: String? = nil
  @Field var fontFamily: String? = nil
  @Field var fontSize: Double? = nil
  @Field var fontWeight: Double? = nil
  @Field var hyphens: Bool? = nil
  @Field var imageFilter: String? = nil
  @Field var language: String? = nil
  @Field var letterSpacing: Double? = nil
  @Field var ligatures: Bool? = nil
  @Field var lineHeight: Double? = nil
  @Field var pageMargins: Double? = nil
  @Field var paragraphIndent: Double? = nil
  @Field var paragraphSpacing: Double? = nil
  @Field var publisherStyles: Bool? = nil
  @Field var readingProgression: String? = nil
  @Field var scroll: Bool? = nil
  @Field var spread: String? = nil
  @Field var textAlign: String? = nil
  @Field var textColor: String? = nil
  @Field var textNormalization: Bool? = nil
  @Field var theme: String? = nil
  @Field var typeScale: Double? = nil
  @Field var verticalText: Bool? = nil
  @Field var wordSpacing: Double? = nil
}

// MARK: - Font declarations

struct FontFaceDeclarationRecord: Record {
  @Field var source: String = ""
  @Field var preload: Bool? = nil
  @Field var style: String? = nil
  @Field var weight: Double? = nil
}

struct FontFamilyDeclarationRecord: Record {
  @Field var fontFamily: String = ""
  @Field var alternates: [String]? = nil
  @Field var fontFaces: [FontFaceDeclarationRecord]? = nil
}

// MARK: - Decoration (REP-008)

struct DecorationStyleRecord: Record {
  @Field var type: String = "highlight"
  @Field var tint: String? = nil
  @Field var isActive: Bool? = nil
  @Field var id: String? = nil
  @Field var html: String? = nil
  @Field var css: String? = nil
  @Field var layout: String? = nil
  @Field var width: String? = nil
}

struct DecorationRecord: Record {
  @Field var id: String = ""
  @Field var locator: LocatorRecord? = nil
  @Field var style: DecorationStyleRecord? = nil
  @Field var extras: [String: String]? = nil
}

struct DecorationGroupRecord: Record {
  @Field var name: String = ""
  @Field var decorations: [DecorationRecord]? = nil
}

// MARK: - Selection

struct SelectionActionRecord: Record {
  @Field var id: String = ""
  @Field var label: String = ""
}

// MARK: - File

struct ReadiumFileRecord: Record {
  @Field var url: String = ""
  @Field var initialLocation: LocatorRecord? = nil
}

// MARK: - Streamer / open-architecture config (REP-005/006)

struct FormatRegistrationRecord: Record {
  @Field var id: String = ""
  @Field var extensions: [String]? = nil
  @Field var mediaType: String? = nil
  /// Native parser module name (Phase 2: routes sniffed assets to a native
  /// `PublicationParser`, e.g. MOBI/AZW3). Phase 1 stores it for later dispatch.
  @Field var parserModule: String? = nil
}

struct PublicationOpenerConfigRecord: Record {
  /// Native transform ids applied via `onCreatePublication` (Phase 2).
  @Field var transforms: [String]? = nil
  @Field var formats: [FormatRegistrationRecord]? = nil
  /// Native content-protection id (Phase 2: LCP/DRM).
  @Field var contentProtection: String? = nil
}

// MARK: - Search (REP-007, reserved — Phase 2)

struct SearchOptionsRecord: Record {
  @Field var caseSensitive: Bool? = nil
  @Field var diacriticSensitive: Bool? = nil
  @Field var wholeWord: Bool? = nil
  @Field var exact: Bool? = nil
  @Field var language: String? = nil
  @Field var regularExpression: Bool? = nil
}
