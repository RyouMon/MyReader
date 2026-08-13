<div align="right"><a href="./README.md">简体中文</a></div>

<div align="center">
  <img src="./assets/app-icon/c4-pilot-1024.png" width="112" alt="MyReader icon" />
  <h1>MyReader</h1>
  <p>A local-first, cross-platform reader for Calibre users, with lightweight managed libraries for standalone use.</p>
  <p>
    <a href="https://github.com/RyouMon/MyReader/releases/latest">Install</a>
    · <a href="./docs/ROADMAP_EN.md">Roadmap</a>
    · <a href="./docs/README_EN.md">Docs</a>
    · <a href="./docs/DEVELOPMENT_EN.md">Development</a>
  </p>
</div>

## Features

- Local-first, with no central server or account required
- Available on mobile and desktop
- Multiple library management
- Calibre library support
- Import libraries from OneDrive and WebDAV, with more providers in development
- EPUB, PDF, and CBZ support, with more formats in development
- Cross-device reading data sync

> [!WARNING]
> MyReader is under active development and may introduce breaking data migrations. Keep independent backups of your original library and remote storage; do not use a preview build as the only copy of your books.
>
> Cross-device sync is experimental and not yet stable. Unknown sync, merge, or recovery issues may occur.

## Data source support

| Data source | Current status | Platform scope and notes |
|---|---|---|
| Local directory | Available, with platform differences | Desktop can use local directories; iOS / iPadOS supports app-internal libraries and retained access to external directories; Android currently supports app-internal libraries only |
| WebDAV | Available | Desktop, iOS / iPadOS, and Android |
| OneDrive | Available | Desktop, iOS / iPadOS, and Android |
| Google Drive | Planned | Not implemented; integration design and platform scope are undecided |
| Dropbox | Planned | Not implemented; integration design and platform scope are undecided |
| S3-compatible object storage | Planned | Not implemented; integration design and platform scope are undecided |

## Reading format support

| Format | Current status | Platform scope and notes |
|---|---|---|
| EPUB | Available | Desktop, iOS / iPadOS, and Android |
| PDF | Available | Desktop, iOS / iPadOS, and Android |
| CBZ | Available | Desktop, iOS / iPadOS, and Android |
| MOBI / AZW3 | Planned | Not implemented; parser and reader design are undecided |
| FB2 | Planned | Not implemented; parser and reader design are undecided |
| TXT / HTML | Planned | Not implemented; import and layout design are undecided |
| CBR | Planned | Not implemented; archive parsing design is undecided |

> [!NOTE]
> “Planned” means the item is on the evaluation list. It does not imply a committed design, release, or delivery date.

See the [roadmap](./docs/ROADMAP_EN.md) for the detailed format/platform matrix and the [architecture guide](./docs/ARCHITECTURE_EN.md) for current system boundaries.

## Why MyReader

Calibre is excellent at managing an ebook library, but continuing the same book between a computer and a phone often still means downloading, importing, switching readers, and finding your place again. Calibre-Web is a viable solution, but it requires users to self-host a web service, and reading in a browser is not as seamless as using a native desktop or mobile app. MyReader can be understood as an enhanced Calibre Sync: it goes beyond connecting to, browsing, and downloading a Calibre library by bringing native EPUB, PDF, and CBZ reading together with cross-device progress, bookmarks, highlights, and notes in one complete reading experience.

MyReader was originally designed for readers who use Calibre to manage their ebook libraries. Calibre remains responsible for comprehensive catalog and metadata management, while MyReader reuses existing libraries and focuses on native reading and cross-device continuity. The project also supports lightweight MyReader-managed libraries for importing and reading books without Calibre. This capability currently covers basic metadata only and is not intended to replace Calibre.

## Architecture and technology

| Scope | Main technologies and frameworks | Reading and data capabilities |
|---|---|---|
| Desktop | Tauri 2, React 18, TypeScript, Vite 6, Tailwind CSS 4, Rust | Readium Web and PDF.js |
| iOS / iPadOS | Expo 56, React Native 0.85, Expo Router, NativeWind 5, native Swift modules | Readium Swift Toolkit |
| Android | Expo 56, React Native 0.85, Expo Router, NativeWind 5, native Kotlin modules | Readium Kotlin Toolkit |
| Shared business and data layer | Rust `my-reader-core`, SeaORM, SQLite | Shared catalog queries, reading data, and sync rules |
| Sync and merge | Automerge, WebDAV, OneDrive | Automerge merges concurrent changes to the same library; WebDAV / OneDrive store and exchange sync objects |

## Future development directions

- TTS
- ComfyUI integration
- More data source support
- More reading format support

Explicit non-goals: MyReader will not write to or replace Calibre's `metadata.db`, does not promise conversion or identity mapping between Calibre and MyReader libraries, and does not aim to reproduce Calibre's full metadata management in its managed libraries.

## Installation

Installers for the current stable release are available from [GitHub Releases](https://github.com/RyouMon/MyReader/releases/latest):

| Platform | Status | Package |
|---|---|---|
| Android | Available | Signed APK with SHA-256 checksum |
| macOS | Available | Apple Silicon / Intel DMG |
| Windows | Available | x64 EXE / MSI |
| Linux | Available | AppImage / DEB / RPM |
| iOS / iPadOS | Preparing for review | External TestFlight will open after approval |

> [!NOTE]
> Release asset names include a version number. Open the latest Release first, then choose the installer that matches your platform and architecture.

## Contributing

MyReader is maintained by one person. Focused issues and pull requests are welcome. Read the [contributing guide](./.github/CONTRIBUTING_EN.md) and [Code of Conduct](./.github/CODE_OF_CONDUCT_EN.md) before starting; see the [development guide](./docs/DEVELOPMENT_EN.md) for local setup, builds, and verification commands. Report vulnerabilities privately as described in the [security policy](./.github/SECURITY_EN.md).

## License and third-party notices

MyReader's own code and assets are licensed under the [MIT License](./LICENSE). Third-party notices for the mobile Readium integration and bundled fonts are in [my-reader-mobile/modules/readium/NOTICE](./my-reader-mobile/modules/readium/NOTICE). The local example library has been removed from version control and is not distributed with the repository.

Calibre, OneDrive, and other product names and marks belong to their respective owners. MyReader is an independent project and is not endorsed by or affiliated with those projects or vendors.
