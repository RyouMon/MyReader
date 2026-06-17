package com.myreader.readium.Types

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord

// MARK: - Locator (REP-003)

@OptimizedRecord
data class LocatorLocationsRecord(
  @Field val progression: Double = 0.0,
  @Field val position: Double? = null,
  @Field val totalProgression: Double? = null
) : Record

@OptimizedRecord
data class LocatorTextRecord(
  @Field val before: String? = null,
  @Field val highlight: String? = null,
  @Field val after: String? = null
) : Record

@OptimizedRecord
data class LocatorRecord(
  @Field val href: String = "",
  @Field val type: String = "",
  @Field val target: Int? = null,
  @Field val title: String? = null,
  @Field val locations: LocatorLocationsRecord? = null,
  @Field val text: LocatorTextRecord? = null
) : Record

// MARK: - Preferences (REP-009, all 25 fields)

@OptimizedRecord
data class PreferencesRecord(
  @Field val backgroundColor: String? = null,
  @Field val columnCount: String? = null,
  @Field val fontFamily: String? = null,
  @Field val fontSize: Double? = null,
  @Field val fontWeight: Double? = null,
  @Field val hyphens: Boolean? = null,
  @Field val imageFilter: String? = null,
  @Field val language: String? = null,
  @Field val letterSpacing: Double? = null,
  @Field val ligatures: Boolean? = null,
  @Field val lineHeight: Double? = null,
  @Field val pageMargins: Double? = null,
  @Field val paragraphIndent: Double? = null,
  @Field val paragraphSpacing: Double? = null,
  @Field val publisherStyles: Boolean? = null,
  @Field val readingProgression: String? = null,
  @Field val scroll: Boolean? = null,
  @Field val spread: String? = null,
  @Field val textAlign: String? = null,
  @Field val textColor: String? = null,
  @Field val textNormalization: Boolean? = null,
  @Field val theme: String? = null,
  @Field val typeScale: Double? = null,
  @Field val verticalText: Boolean? = null,
  @Field val wordSpacing: Double? = null
) : Record

// MARK: - Decoration (REP-008)

@OptimizedRecord
data class DecorationStyleRecord(
  @Field val type: String = "highlight",
  @Field val tint: String? = null,
  @Field val isActive: Boolean? = null,
  @Field val id: String? = null,
  @Field val html: String? = null,
  @Field val css: String? = null,
  @Field val layout: String? = null,
  @Field val width: String? = null
) : Record

@OptimizedRecord
data class DecorationRecord(
  @Field val id: String = "",
  @Field val locator: LocatorRecord? = null,
  @Field val style: DecorationStyleRecord? = null,
  @Field val extras: Map<String, Any>? = null
) : Record

@OptimizedRecord
data class DecorationGroupRecord(
  @Field val name: String = "",
  @Field val decorations: List<DecorationRecord>? = null
) : Record

// MARK: - Selection

@OptimizedRecord
data class SelectionActionRecord(
  @Field val id: String = "",
  @Field val label: String = ""
) : Record

// MARK: - File

@OptimizedRecord
data class ReadiumFileRecord(
  @Field val url: String = "",
  @Field val initialLocation: LocatorRecord? = null
) : Record

// MARK: - Streamer / open-architecture config (REP-005/006)

@OptimizedRecord
data class FormatRegistrationRecord(
  @Field val id: String = "",
  @Field val extensions: List<String>? = null,
  @Field val mediaType: String? = null,
  /// Native parser module name (Phase 2: routes sniffed assets to a native
  /// `PublicationParser`, e.g. MOBI/AZW3). Phase 1 stores it for later dispatch.
  @Field val parserModule: String? = null
) : Record

@OptimizedRecord
data class PublicationOpenerConfigRecord(
  /// Native transform ids applied via `onCreatePublication` (Phase 2).
  @Field val transforms: List<String>? = null,
  @Field val formats: List<FormatRegistrationRecord>? = null,
  /// Native content-protection id (Phase 2: LCP/DRM).
  @Field val contentProtection: String? = null
) : Record

// MARK: - Search (REP-007, reserved — Phase 2)

@OptimizedRecord
data class SearchOptionsRecord(
  @Field val caseSensitive: Boolean? = null,
  @Field val diacriticSensitive: Boolean? = null,
  @Field val wholeWord: Boolean? = null,
  @Field val exact: Boolean? = null,
  @Field val language: String? = null,
  @Field val regularExpression: Boolean? = null
) : Record
