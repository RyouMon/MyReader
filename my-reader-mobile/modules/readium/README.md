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

## Architecture

```
JS API (src/)
  ├─ ReadiumView            Expo View: reader surface + props + events + ref
  ├─ streamer               PublicationOpener config: custom parsers, onCreatePublication (REP-005)
  ├─ format                 Custom format registration: extensions/mediaType → native parser (REP-005)
  ├─ publication            Publication handle: metadata/TOC/positions/content (REP-003/004)
  ├─ search                 Full-text search API (REP-007, reserved)
  ├─ tts                    TTSEngine interface + utterance foundation (reserved)
  └─ types/                 Locator / Preferences / Decoration / Publication / ... (ported from fork)

Native bridge (ios/ android/)
  ├─ ReadiumModule          Module definition: View + Props + Events + AsyncFunctions
  ├─ ReadiumView            ExpoView hosting the Readium reader ViewController / Fragment
  ├─ Reader/                Ported: ReaderService + EPUB/PDF/CBZ controllers & fragments
  ├─ Streamer/              Open PublicationOpener: parser registry, onCreatePublication
  ├─ Publication/           Publication handle table (id ↔ native Publication)
  └─ Format/                FormatRegistry + custom PublicationParser registration
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
      selectionActions={selectionActions}
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
| `selectionActions` | `SelectionAction[]` | Defines the text-selection action menu. |
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
| `search.search(id, query, options?)` / `search.next(sessionId)` | 007 | **Reserved** — native rejects `ERR_SEARCH_NOT_IMPLEMENTED` (Phase 2) |
| `tts` — `TTSEngine` / `Utterance` interfaces | — | **Interface only** — no coordinator/engine (Phase 2) |

TTS is intentionally position-neutral: utterances come from `publication.getContent`,
and reading highlight reuses the Decoration API (REP-008). Any future path — JS engine,
iOS native `TTSEngine` via `PublicationSpeechSynthesizer`, or Android self-built engine
(the toolkit ships no TTS) — consumes the same utterance stream.

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
pnpm exec expo run:ios --device <UDID>     # rebuild + run iOS
pnpm exec expo run:android --device <id>   # rebuild + run Android
pnpm run test:ci                            # Jest (module sources mapped via moduleNameMapper)
```

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
