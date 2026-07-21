# @my-reader/readium

Open-architecture [Readium](https://readium.org) bridge for React Native, built as an
[Expo Module](https://docs.expo.dev/modules/). Bridges Readium's Swift Toolkit and
Kotlin Toolkit to render EPUB / PDF / CBZ publications, while keeping the Readium
architecture proposals (REP-001~009) open for extension — custom format parsers,
publication services, search, and TTS.

**iOS + Android only. No Web.**

## Why this exists

Replaces the previous Nitro-Modules-based fork (`@ryoumon/react-native-readium`). The
fork had EPUB/PDF/CBZ working but sealed every extension point inside the native layer
(hard-coded `DefaultPublicationParser`, no `onCreatePublication` hook, no parser
registration, no Publication/service/TTS exposure to JS). This module re-bridges the
same Readium reader logic to Expo Modules with an **open** architecture, so custom
formats (MOBI/AZW3) and a path-agnostic TTS foundation can be added without forking
again.

The reader core (view-controllers / fragments, converters, utils) is **ported** from
the fork; the bridge layer (`ReadiumModule` / `ReadiumView`) is **rewritten** from
Nitro to Expo. The public TS contract (`ReadiumProps` / `ReadiumViewRef`) is kept
identical for drop-in migration. See [NOTICE](./NOTICE) for provenance and
[licenses/](./licenses) for third-party license texts.

## Architecture and ownership

MyReader's reader runs as three responsibility layers. `modules/readium` is the
application's native integration layer, not part of the third-party Toolkit. In a
non-React-Native application, the code in this layer would simply be the native app
code which consumes Readium Toolkit.

```
React Native product layer (MyReader)
  ├─ owns annotation state, persistence, note UI and product semantics
  └─ supplies locators, colors, localized action labels and menu state
                         ↓ typed props / events
App-owned native integration layer (modules/readium)
  ├─ src/                   Expo Module TypeScript contract
  ├─ ios/                   UIKit host, UIEditMenuInteraction and Toolkit adapter
  └─ android/               Fragment host, ActionMode and Toolkit adapter
                         ↓ Toolkit public APIs
Readium Swift / Kotlin Toolkit
  ├─ Publication / Streamer / services
  ├─ Navigator / Selection / Locator
  └─ Decoration rendering and interaction primitives
```

The placement rule is based on runtime ownership, not on whether something is
"UI":

- Cross-platform product state and workflows belong to React Native.
- Platform-native reader integration and system UI tied to the native navigator
  belong to `modules/readium`. The text-selection menu is implemented here because
  UIKit and Android own its lifecycle, anchoring and accessibility behavior.
- Generic publication and navigation mechanisms belong to Readium Toolkit. The
  module consumes Toolkit selection locators and the Decoration API; it does not
  patch Toolkit to add MyReader-specific highlights, notes, colors or menus.

EPUB decoration markup runs inside the Toolkit navigator's publication WebView; it
is not React Native UI. Shared decoration HTML/CSS lives in
`packages/tools/src/reader-note-marker/` and is generated into small Swift/Kotlin
constants at build time. The native adapters keep only Toolkit registration, escaping
and platform touch-target differences, so visual changes have one source without
sending arbitrary markup across the RN bridge.

For highlights, Toolkit provides the official mechanisms: selection returns a
`Locator`, `DecorableNavigator.applyDecorations` renders the highlight, and decoration
interaction observers report activation. MyReader owns the annotation record and
persistence. The native integration layer translates between those two sides and
presents the native selection menu (`UIEditMenuInteraction` on iOS,
`ActionMode.Callback2` on Android).

The rest of the bridge is organized as follows:

```text
src/                       ReadiumView props/events/ref and service APIs
ios/ReadiumModule.swift    Expo Module definition
android/.../ReadiumModule  Expo Module definition
Reader/                    EPUB/PDF/CBZ controllers and fragments
Streamer/                  Publication opener and parser registry
Publication/               Native Publication handle table
Search/                    Search iterator sessions and cancellation
Format/                    Custom PublicationParser registration
```

**Stateful-object bridging:** native keeps a `Publication` table; JS holds a
`publicationId: string` (from `onPublicationReady`) and operates via `AsyncFunction`s.
Imperative view navigation (`goTo`/`goForward`/`goBackward`) uses a view-tag registry:
JS passes `findNodeHandle(ref)`, native looks up the view by tag.

## Installation

Linked as a workspace dependency (`"link:./modules/readium"` in
`my-reader-mobile/package.json`); Expo autolinking discovers it via
`expo-module.config.json`. No manual install step.

- **iOS:** `Readium.podspec` declares the Readium pod deps; run `pod install` (or
  `expo run:ios`) after native changes.
- **Android:** `android/build.gradle` pulls `org.readium.kotlin-toolkit:*` from Maven.

## Usage

```tsx
import { useRef } from 'react';
import { ReadiumView, type ReadiumViewRef } from '@my-reader/readium';

export function Reader({ url }: { url: string }) {
  const ref = useRef<ReadiumViewRef>(null);

  return (
    <ReadiumView
      ref={ref}
      file={{ url, initialLocation: lastLocator /* optional: restore position */ }}
      preferences={preferences}
      decorations={decorationGroups}
      customSelectionMenu
      selectionMenu={selectionMenu}
      onLocationChange={(locator) => { /* persist progress */ }}
      onPublicationReady={(e) => { /* e.publicationId, e.tableOfContents, e.metadata, e.positions */ }}
      onDecorationActivated={(e) => { /* e.decoration, e.group, e.rect? */ }}
      onSelectionChange={(e) => { /* e.locator, e.selectedText */ }}
      onSelectionAction={(e) => { /* e.actionId, e.locator, e.selectedText */ }}
      onTap={(e) => { /* center-tap: toggle React Native chrome; e.point */ }}
    />
  );
}
```

### Props

| Prop | Type | Notes |
|---|---|---|
| `file` | `ReadiumFile` (`{ url, initialLocation? }`) | Native filesystem path or absolute URL. `initialLocation` restores last-read position. |
| `preferences` | `Preferences` | REP-009 full spec (font family/size, line height, letter spacing, page margins, text alignment, column count, theme, colors, type scale). |
| `decorations` | `DecorationGroup[]` | REP-008 Decorator API. |
| `selectionActions` | `SelectionAction[]` | Generic Toolkit selection actions. Kept for consumers that use the default menu path. |
| `customSelectionMenu` | `boolean` | Routes EPUB selection through the app-owned native menu integration. |
| `selectionMenu` | `SelectionMenuConfig` | Current native menu model: selection locator/rect, a localized color-submenu label, color-circle actions, and text actions. RN owns the model; UIKit/Android render it. |
| `onLocationChange` / `onPublicationReady` / `onDecorationActivated` / `onSelectionChange` / `onSelectionAction` / `onTap` | callbacks | See `src/types/events.ts`. |

### Imperative ref (`ReadiumViewRef`)

```ts
ref.current?.goTo(locator);
ref.current?.goForward();
ref.current?.goBackward();
```

## Open-architecture extension points

| API | REP | Status |
|---|---|---|
| `streamer.configure(config)` — `onCreatePublication` transforms, custom parsers, content protection | 005/006 | Native `StreamerConfig` wired |
| `format.registerFormat({ extensions, mediaType, parserModule })` — route to a native `PublicationParser` | 005 | Native `FormatRegistry` wired (parser implemented in Swift/Kotlin) |
| `publication.getSnapshot(id)` — metadata / TOC / readingOrder / positions | 003 | ✅ |
| `publication.getContent(id, fromLocator?)` — utterance stream (text + locator + language), the path-agnostic TTS foundation | 003 | ✅ |
| `search.getCapabilities(id)` / `search.search(id, query, options?)` / `search.next(sessionId)` / `search.cancel(sessionId)` | 007 | ✅ Reflowable EPUB, runtime-gated by the publication search service |
| `tts` — `TTSEngine` / `Utterance` interfaces | — | **Interface only** — no coordinator/engine (Phase 2) |

TTS is intentionally position-neutral: utterances come from `publication.getContent`,
and reading highlight reuses the Decoration API (REP-008). Any future path — JS engine,
iOS native `TTSEngine` via `PublicationSpeechSynthesizer`, or Android self-built engine
(the toolkit ships no TTS) — consumes the same utterance stream.

Search results are paged Locator collections. `search.next()` returns
`{ locators, resultCount?, done }`; callers must cancel a session when dismissing the
search UI. Starting a new query, closing its publication, or destroying the module
also closes the previous native iterator. Capability options only contain fields the
active iOS/Android service supports. Fixed-layout EPUB, PDF, and CBZ are deliberately
reported as not searchable by this bridge.

## Native notes

- **View-tag registry on iOS Fabric:** views register by `self.tag` (`UIView.tag`,
  set by React Native's Fabric mount), **not** `reactTag` (a Paper-era `NSNumber` that
  is `nil` on Fabric). `findNodeHandle` returns the same tag. Android uses `view.id`.
- The reader host lifecycle (`addChild` / `removeFromParent` on iOS, Fragment
  transactions on Android) is ported from the fork; the navigator is torn down on view
  removal.

## Development

From `my-reader-mobile/`:

```bash
pnpm prepare:reader-note-marker            # regenerate native constants from packages/tools/src/reader-note-marker
pnpm prepare:reader-viewport-anchor        # regenerate desktop, iOS, and Android viewport-anchor code
pnpm exec expo run:ios --device <UDID>     # rebuild + run iOS
pnpm exec expo run:android --device <id>   # rebuild + run Android
pnpm run test:ci                            # Jest (module sources mapped via moduleNameMapper)
```

The note-marker HTML/CSS in `packages/tools/src/reader-note-marker/` is shared by
desktop EPUB rendering and the native Readium bridges. Desktop consumes it directly;
this module's generator compiles the same source into Swift and Kotlin constants.

The viewport-anchor DOM implementation in
`packages/tools/src/reader-viewport-anchor.ts` is the only hand-written source.
Its generator emits the desktop TypeScript implementation and the Swift/Kotlin
JavaScript constants used inside Readium's EPUB web views.

Reader non-regression is covered by `e2e/flows/reader/read_book.yaml` (Maestro) on both
platforms: open EPUB, toggle chrome, TOC, settings, page navigation, locator persistence.

## License

This module's own source is MIT-licensed under the project's top-level
[`LICENSE`](../../../LICENSE). Third-party portions are attributed in
[NOTICE](./NOTICE), with full license texts in [licenses/](./licenses):

- [react-native-readium](https://github.com/5-stones/react-native-readium) — MIT,
  Copyright (c) 2021 Jacob Spizziri (ported reader core + bridge rewrite)
- [Readium Swift/Kotlin Toolkit](https://github.com/readium/swift-toolkit) —
  BSD 3-Clause, Copyright (c) 2017, Readium (runtime dependency + adapted navigator source)
- [Noto Sans SC / Noto Serif SC](https://github.com/googlefonts/noto-cjk) —
  SIL Open Font License 1.1 (reader font assets generated from npm packages)
- [LXGW WenKai](https://github.com/lxgw/LxgwWenKai) —
  SIL Open Font License 1.1 (reader font asset generated from an npm package)
- [Alimama FangYuanTi VF](https://www.iconfont.cn/fonts/detail?cnid=pOvFIr086ADR) —
  reader font asset and package metadata notice generated from an npm package
