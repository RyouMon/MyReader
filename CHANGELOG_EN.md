<div align="right"><a href="./CHANGELOG.md">简体中文</a></div>

# Changelog

All notable changes to MyReader are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [0.12.1] - 2026-08-15

### Fixed

- Fixed reader assets failing to load when opening a OneDrive book on Windows
  ([#49](https://github.com/RyouMon/MyReader/issues/49), [#52](https://github.com/RyouMon/MyReader/pull/52),
  [#55](https://github.com/RyouMon/MyReader/pull/55))
- Fixed the selected EPUB reading theme not being applied to book content on macOS
  ([#51](https://github.com/RyouMon/MyReader/issues/51), [#54](https://github.com/RyouMon/MyReader/pull/54),
  [#55](https://github.com/RyouMon/MyReader/pull/55))
- Fixed the post-add library prompt sometimes not appearing on mobile and switching not reliably opening the
  new library ([#50](https://github.com/RyouMon/MyReader/issues/50),
  [#58](https://github.com/RyouMon/MyReader/pull/58))

### Privacy

- Mobile diagnostics are now off by default and collect new error diagnostics only after the user opts in from
  Settings

### Build and Distribution

- A single `v*` tag workflow now builds desktop and mobile releases. Separate manual desktop and mobile
  candidate workflows remain available for quick artifact validation. Production builds run in parallel and
  archive each platform independently as it completes; the draft GitHub Release is published manually after
  review

## [0.12.0] - 2026-08-12

### Highlights

- Added editable MyReader libraries for importing, reading, and managing EPUB, PDF, and CBZ through local storage, WebDAV, or OneDrive; Calibre libraries remain read-only.
- Completed cross-platform delivery through internal iOS TestFlight, a signed Android APK, and macOS, Windows, and Linux desktop installers.

### Breaking Changes

- Upgraded the MyReader catalog to schema v2. Only users of early 0.12.0 development builds need to delete and recreate MyReader libraries created with those builds.
- Android no longer supports SAF external-directory libraries from early development builds and now uses app-internal storage. iOS external-local directories retain authorization through security-scoped bookmarks.

> Calibre libraries upgraded normally from 0.11.0 are unaffected and do not need to be converted into MyReader libraries.

### Managed MyReader Libraries

- Create or open multiple MyReader libraries on local storage, WebDAV, or OneDrive, and import, edit, or delete EPUB, PDF, and CBZ books.
- Extract book metadata and covers automatically; added consistent cross-platform series, remote downloads, background uploads, progress, and failure retry.
- Sync catalog and reading data through Automerge. Content uses stable paths and SHA-256 verification; remote import is local-first and publishes only after confirmation.
- Sync a tombstone before deleting a remote book. Deleting an app-internal library removes the complete container, while removing an external or remote library preserves source files.
- Fixed missing upload scheduling, OneDrive large-file retry conflicts, and concurrent import overwrites.

### Mobile

- iOS and Android support app-internal MyReader libraries. iOS additionally supports external MyReader and Calibre directories with retained authorization.
- Added the iOS Share Extension, Android system sharing and file-picker import, metadata editing, deletion, series, transfer state, and sync state.
- Added manual sync and credential-recovery entry points; fixed Android file import and overwrite, sync lifecycle, and add-library issues.

### Desktop

- Create or open libraries on local storage, WebDAV, and OneDrive with local-first import, editing, deletion, upload, and retry.
- Added series, transfer state, and sync panels; improved path and credential recovery, download state, form overlays, and accessibility.

### Branding and Shared Core

- Unified desktop, mobile, installer, and window display names as `MyReader`, with updated platform icons and launch screens.
- The shared Rust core now unifies library validation, catalog, content transfer, and sync scheduling, with expanded cross-platform contracts and Chinese/English copy.

### Build and Distribution

- Added a GitHub Actions release pipeline that builds in parallel after the complete test suite passes. Manual runs validate a candidate; only `v*` tags create a GitHub Release.
- macOS produces signed and notarized Intel / Apple Silicon DMGs; Windows produces MSI / NSIS; Linux produces AppImage, DEB, and RPM.
- Android produces a signed APK and SHA-256 checksum through EAS; iOS uploads automatically to internal TestFlight through EAS Build / Submit.

## [0.11.0] - 2026-07-31

### Breaking Changes

- App configuration moved to the single `config.json` managed by `my-reader-core`. Legacy mobile Zustand configuration and development-time `device-registry.json` / `device-library-state.json` are not migrated; re-add or reauthorize data sources and libraries after upgrading, then review local preferences.
- Remote sidecars now use the `.myreader/automerge/<document_id>/<kind>/<hash>` StorageKey layout. Legacy remote sidecars and local transfer state are not read or migrated, and old directories are not deleted automatically. Existing local Automerge documents and business data are retained and publish a complete snapshot on the first sync to the new space.

### Mobile

#### Changed

- Moved library registration, Calibre catalog, content state, reading data, downloads, and sync to the shared Rust core through generated typed UniFFI/JSI bindings.
- Removed the TypeScript database, repositories, and legacy sync backend; core now owns SQLite migrations, transactions, and connection lifecycle.
- Reading completion, format selection, progress conversion, locator normalization, and reading-session batching now use consistent cross-platform rules.

#### Fixed

- Fixed OneDrive root browsing, library registration, and current sandbox path resolution.
- Fixed the home empty state without reading history, cover-cache reuse, and state convergence after deleting libraries or data sources.

#### Build

- Fixed Rust targets, Cargo NDK, core bindings, MMKV Pod configuration, and Sentry uploads required by EAS iOS/Android production builds.

### Desktop

#### Changed

- Reduced Tauri commands to a shared-core platform adapter, unifying data-source, library, catalog, reading, download, and sync semantics.
- Moved application databases, configuration persistence, and sidecar sync under core ownership.

### Shared

#### Added

- Added modular `my-reader-core` to centralize cross-platform databases, libraries, Calibre catalogs, content, reading, and sync business logic.
- Added shared `@my-reader/i18n` resources for consistent desktop/mobile Chinese and English copy.
- Established acceptance baselines for the core runtime, generated bindings, and cross-platform contracts.

#### Changed

- Moved MyReader database schema and migration authority to Rust / SeaORM, with a one-time handoff for legacy mobile Drizzle migration state.
- Adopted automerge-repo StorageKeys, content-addressed snapshots/incrementals, and concurrency-safe compaction for sidecar sync.
- Unified automatic sync timing, remote target resolution, download coordination, and reading-data projection in core.

## [0.10.0] - 2026-07-27

### Breaking Changes

- Switched library sidecar sync to Automerge; legacy `.myreader/changes/` and `.myreader/changes-v4/` are no longer read.
- Upgrades preserve existing local business data but do not migrate legacy sync state or remote changes. Existing records enter Automerge sync only after their next modification.

### Mobile

#### Added

- Automatically schedule uploads after sidecar changes and continue them after the app enters the background.

#### Changed

- Run Automerge on Hermes through the native UniFFI/JSI bridge.
- Atomically update reading progress, favorites, bookmarks, annotations, and reading statistics through the Automerge document and local SQLite projection.
- Execute database migrations transactionally, with complete rollback and retry after failure.

### Desktop

#### Added

- Schedule sidecar sync automatically on app start, library switch, reader close, and local writes.
- Sync reading statistics across devices and retain concurrent reading positions for later selection.

### Shared

#### Added

- Added Automerge-based cross-device sync for progress, favorites, bookmarks, annotations, reading sessions, and completion records.
- Persist documents, immutable incrementals, outbox, receipts, and projection metadata for crash recovery and idempotent replay.
- Added sync diagnostic snapshots and interoperability fixtures across Rust, TypeScript, and native bridges.

#### Changed

- Replaced custom HLC/JSON segment merging with Automerge causal history and conflict retention.
- Moved sync to event-driven scheduling with debounce, single-flight, retry, and pull/push mode upgrades.
- Trigger pull from app lifecycle, library context, and network state, and poll the active library for remote changes every minute.

## [0.9.0] - 2026-07-23

### Breaking Changes

- Legacy desktop remote caches and Entity-First databases are no longer migrated; affected local state must be recreated.
- Desktop OneDrive refresh tokens now use data-source IDs in their names; existing sources must be reauthorized or recreated.
- Bookmarks now use text-range anchors. Legacy bookmark keys and sync cursors are no longer read; existing remote libraries must be removed and added again.

### Mobile

#### Added

- Reading statistics: duration, trends, annual heatmap, and completion records.
- Recently read shelf and card-style settings on Home.
- Book favorites and filtering, format-file sharing, and persistent default reading format.
- Fixed-layout reading preferences, progress scrubbing, and more natural native book-open/book-close transitions.

#### Changed

- Moved Readium integration from an external fork to a maintained Expo module, exposing publications, parsers, and future extension points.
- Redesigned book details and the adaptive cover hero; migrated reader panels to native sheets.
- Optimized cover-thumbnail caching, skeletons, and list rendering to reduce cold-start and scrolling cost.

#### Fixed

- Fixed preview EAS builds, Android detail-page buttons, and home menu interaction.
- Fixed nested-directory resolution, iOS PDF zoom and scrollbars, and stuck sheet state.
- Apply the saved language immediately on startup; sync reading progress when adding a remote library.

### Desktop

#### Added

- OneDrive data sources, directory browsing, and remote libraries.
- Adaptive list-detail workspace, recent reading, favorites, default format, and per-format download state.
- Light, dark, and system themes plus interface-language settings.
- Immersive EPUB/PDF/CBZ reading windows; PDF/CBZ support trackpad, wheel, pinch, drag, and double-click zoom.

#### Changed

- Unified remote-storage and sync orchestration, moved Tauri commands into the service layer, and migrated application database queries to SeaORM.
- Reworked Settings, Sidebar, book details, and cover-loading flows.
- Batch-cache covers, file state, and paginated catalogs to improve large-library loading and window-resize performance.

#### Fixed

- Fixed EPUB images splitting across pages, PDF page scale/rotation errors, and Windows reader chrome.
- Preserve the library scroll anchor across detail changes and window resizing.
- Fixed duplicate downloads, missing remote cover caches, and concurrent OneDrive credential reads.

### Shared

#### Added

- Cross-desktop/mobile bookmarks, full-text search, highlights, and notes.
- Reading-font options based on content language.

#### Changed

- Unified cross-platform reading themes, table-of-contents navigation, and visible text anchors; restore the original reading position after font or layout changes.
- Separated displayed reading progress from the Readium locator so short books show consistent percentages based on actual position.
- Reduced the design system to color tokens and updated it with warm neutrals and a terracotta accent.

#### Fixed

- Bookmarks now use exact DOM ranges, preventing adjacent-page mismatches and improving positioning after reflow.
- Sort annotations by whole-book position and support XHTML note markers.

## [0.8.0] - 2026-06-13

### Mobile

#### Added

- Upgraded Expo SDK 55 → 56.
- Added SettingsRow icons and add-library notifications.
- Moved library search into the native header.
- Separated the OneDrive OAuth scheme and added post-sign-in progress feedback.

#### Changed

- Unified screen-header strategy across Android and iOS.
- Consolidated the remote directory browser and simplified Settings sections.

#### Fixed

- Fixed Readium NDK27 C++ compilation.
- Fixed Dynamic Type layout drift and SettingsRow press/separator behavior.
- Hid the local-library option on Android and fixed native `onTap` for reader chrome.

### Shared

#### Build

- `react-native-readium` git submodule

#### Fixed

- Fixed reversed light-background hierarchy tokens.

## [0.7.0] - 2026-05-30

### Mobile

#### Added

- OneDrive remote libraries with OAuth, directory browsing, and book downloads.
- Chinese/English localization.
- Unified `RemoteBackend` interface for WebDAV and OneDrive.
- `AuthCache`, `CoverMirror`, and etag-based incremental metadata detection.
- Three-layer ESLint boundaries for domain/features/services.
- Animated download progress ring.

#### Changed

- Migrated server data from Zustand to React Query.
- Refactored architecture to domain → repos → services.
- Centralized credentials in SecureStore.
- Switched covers to remote URLs and per-library data directories to `libraries/{id}`.

#### Fixed

- Fixed OneDrive book downloads and duplicate path prefixes causing `metadata.db` 404s.
- Fixed blocked library switching and React 19 `ReactNode` type errors.

### Desktop

#### Changed

- Migrated server data from Zustand to React Query.
- Migrated credential storage to macOS Keychain.

### Shared

#### Added

- Added OneDrive data-source type definitions in `packages/tools`; Desktop had query-layer mappings only, not a complete integration.

## [0.6.0] - 2026-05-17

### Desktop

#### Added

- WebDAV Calibre library import.

#### Changed

- Added Rust backend tracing and structured errors; reduced IPC surface.
- Added RTL-safe layouts through logical CSS.

### Shared

#### Added

- Added a pnpm workspaces monorepo for `my-reader`, `my-reader-mobile`, and `packages/*`.
- Added a shared Calibre `metadata.db` schema in `packages/db` using SeaORM.
- Added per-library reading-progress databases and LWW sync.

#### Changed

- Moved shared types into `@my-reader/tools`.

#### Build

- Husky + lint-staged

## [0.5.0] - 2026-05-13

### Mobile

#### Added

- Fully migrated EPUB/PDF/CBZ reading to Readium.

#### Changed

- Migrated to feature-based directories and NativeWind.

#### Fixed

- Fixed Android Readium desugaring, `networkSecurityConfig`, and `abiFilters`.

#### Test

- Added Maestro reader-chrome E2E coverage.

### Desktop

#### Added

- Integrated Readium publication/manifest/locator progress.
- Added reader scrolling mode, theme presets, and settings controls.
- Added localization infrastructure, ARIA, and reduced-motion support.

#### Changed

- Introduced repository/service backend layers.
- Unified the frontend around the generated tauri-specta API.

#### Test

- Added the Playwright + Gherkin BDD test framework.

### Shared

#### Changed

- Removed the legacy custom reader-core / foliate-js engine.
- Standardized reading progress on Readium locators.

## [0.4.0] - 2026-04-23

### Mobile

#### Added

- Added WebDAV remote libraries, a native transfer queue, and direct format downloads.
- Added swipe pagination in the book-details modal and native menu actions.

#### Test

- Added Maestro/Jest test pipelines.

#### Fixed

- Fixed WebDAV connection probing, sync lifecycle, and connection-test UX.

### Desktop

#### Added

- Added WebDAV data-source management with TanStack Form.
- Completed the Sync Phase 2 rollout.
- Added library grid/list views, skeletons, and download menus.

#### Fixed

- Fixed WebDAV form deadlocks, add-library deadlocks, and Chinese mojibake.

### Shared

#### Added

- Fully aligned design-system tokens and added an automatic sync script.

## [0.3.0] - 2026-04-12

### Mobile

#### Added

- Added the Expo mobile app using SDK 55 and NativeWind.
- Added local Calibre library browsing, library details, and library deletion.
- iOS Security-Scoped Bookmarks
- Added a fixed-layout reader and mobile EPUB/PDF/CBZ reading.
- Added reader chrome UI and a native comic reader.
- Added the development-client / EAS build chain.

#### Changed

- Replaced pdf.js with `react-native-pdf`.
- Limited mobile targets to iOS/Android and removed web support.

#### Fixed

- Fixed route hierarchy, PDF/CBZ readers, and black screens after iOS CBZ extraction.
- Fixed accidental fixed-layout pinch/tap gesture activation.
- Fixed Metro/RN prebuilt issues in EAS iOS archives.

### Shared

#### Added

- Extracted the shared `@my-reader/tools` package.

#### Changed

- Completed the six-stage Reader V2 architecture migration (A–F) and removed ArrayBuffer book sources.

## [0.2.0] - 2026-04-08

### Desktop

#### Added

- Added a separate-window reading mode.
- Added reading-position restoration and weighted whole-book progress.
- Added scroll/pagination anchor synchronization.
- Persisted reading preferences with Zustand.
- Added two-column rendering, debounced window resizing, and skeletons.
- Added synchronized frontend/backend logging.

#### Changed

- Refactored reader components behind a shared TextReader/ComicReader interface.
- Adjusted table-of-contents and bookmark placement.

#### Fixed

- Fixed chapter parsing and in-book hyperlink navigation.
- Fixed height clipping in comic scrolling mode.

### Shared

#### Added

- Added the initial design document and semantic tokens.

## [0.1.0] - 2026-04-01

### Desktop

#### Added

- Initialized the project with Tauri 2, React, and Vite.
- Added the Calibre library home, Settings, and book details.
- Added backend pagination and frontend virtual scrolling.
- Added the first custom EPUB/PDF/CBZ reader implementation.
- Added progressive pagination and a benchmark page.

#### Fixed

- Fixed horizontal scrolling in the sidebar.
