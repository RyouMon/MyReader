# Development Guide

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 22 | LTS recommended |
| pnpm | ≥ 10 | Install via `npm install -g pnpm` or `corepack enable` |
| Rust | ≥ 1.77 | Edition 2021; install via [rustup](https://rustup.rs) |
| Android Studio | Latest | For android development (SDK 34+, NDK 26+) |
| Xcode | ≥ 16 | For iOS development (macOS only) |

## First-Time Setup

```bash
git clone https://github.com/RyouMon/MyReader.git
cd MyReader
pnpm install
```

This installs dependencies for all workspace packages (`my-reader`, `my-reader-mobile`, `packages/tools`) and runs the `prepare` hook (husky git hooks).

## Project Structure

```
MyReader/
├── packages/tools/        @my-reader/tools — shared types, utils, stores
├── my-reader/             Desktop app (Tauri 2 + React 18 + Vite + Tailwind CSS 4)
├── my-reader-mobile/      Mobile app (Expo SDK 55 + React Native 0.83 + NativeWind)
├── scripts/               Design-token sync and other repo-level scripts
├── pnpm-workspace.yaml    Workspace package definitions
├── package.json           Root scripts and devDependencies
└── .npmrc                 node-linker=hoisted (required for Metro compatibility)
```

## Desktop (Tauri)

### Change working directory

```bash
cd my-reader
```

### Start dev server with native window

```bash
pnpm tauri dev
```

This runs `pnpm run dev` (Vite on port 1420) then launches the Tauri native window. The Rust backend compiles on first run — expect a longer startup.

### Unit tests

```bash
pnpm test:unit          # run once
pnpm test:unit:watch    # watch mode
pnpm test:unit:coverage # with coverage
```

### E2E tests

```bash
pnpm test:e2e:frontend      # Playwright BDD (browser tests)
pnpm test:e2e:frontend:ui   # Playwright with UI mode
pnpm test:e2e:desktop       # WebdriverIO + Edge (native window)
```

### Linting

```bash
npx biome check --write .
```

Biome config is at `my-reader/biome.json`. VS Code uses it as the default formatter with format-on-save.

## Mobile (Expo)

### Change working directory

```bash
cd my-reader-mobile
```

### Generate native projects

```bash
pnpm expo prebuild
```

### Run on device

Build, install, and launch the **development client** locally (wraps `expo run:* --device`):

```bash
pnpm android    # expo run:android --device
pnpm ios        # expo run:ios --device (macOS only)
```

| Command | Requires | What it does |
|---------|----------|--------------|
| `pnpm android` | Android Studio (SDK 34+, NDK 26+), USB debugging or emulator | Gradle compile → install APK → open app with Metro |
| `pnpm ios` | Xcode ≥ 16, Apple signing for a physical device | Xcode compile → install on device → open app with Metro |

Both scripts pass `--device`, so they prefer a **connected physical device**. Connect one before running, or start an emulator/simulator and pick it when prompted.

**Typical loop** (JS/TS-only changes):

1. `pnpm start` in one terminal (Metro; `pnpm android` / `pnpm ios` can also start it).
2. `pnpm android` or `pnpm ios` when you need a native rebuild or first install.

The first native compile is slow (Readium and other native modules). Later runs are incremental unless you change native config or dependencies.

### Start Metro bundler

```bash
pnpm start
```

### Regenerate native projects

After changing `app.json`, config plugins under `plugins/`, or other native-facing settings, regenerate `ios/` and `android/`:

```bash
pnpm expo prebuild --clean
```

`--clean` deletes the existing native directories before regenerating so plugin changes are applied reliably. Run this before `pnpm android` / `pnpm ios` or a new EAS dev build when native config has changed.

### Unit tests

```bash
pnpm test
pnpm test:ci           # single-threaded (CI)
pnpm test:update-snapshots  # update Jest snapshots
```

### E2E tests

```bash
pnpm test:e2e   # Maestro (requires Maestro CLI installed)
```

### Environment variables

Copy `.env.example` to `.env` in `my-reader-mobile/`:

```
EXPO_PUBLIC_SENTRY_DSN=<your Sentry DSN>
SENTRY_AUTH_TOKEN=<your Sentry auth token>
```

Sentry is optional — the app runs without it.

## Shared Tools Package

`packages/tools` (`@my-reader/tools`) exports types, utils, and store interfaces used by both apps. It has no runtime dependencies.

```bash
cd packages/tools && pnpm test       # vitest run (no test files yet)
cd packages/tools && pnpm test:watch # vitest watch
```

Import pattern in consuming apps:

```ts
import type { CalibreBook } from "@my-reader/tools/types/book"
import type { LibraryStore } from "@my-reader/tools/store/library"
import { pickReadableFormat } from "@my-reader/tools/utils"
```

## Design Tokens

After changing tokens in `.agents/skills/myreader-design-system/colors_and_type.css` or `DESIGN.md`:

```bash
pnpm sync:design-tokens
```

This runs `scripts/sync-design-tokens.mjs` which propagates tokens to both desktop and mobile implementations.

## Monorepo Notes

- **`node-linker=hoisted`** — Required for Metro compatibility. Dependencies are installed in a flat layout similar to npm.
- **Workspace protocol** — Internal packages use `"workspace:*"` in dependencies. pnpm resolves this to the local package.
- **React versions** — Desktop uses React 18, mobile uses React 19. Each workspace resolves its own version from its `node_modules`.
- **`patch-package`** — Mobile uses `patch-package` for native dependency patches. Patches live in `my-reader-mobile/patches/`.

## VS Code Setup

Recommended extensions (auto-suggested via `.vscode/extensions.json`):

- **Tauri** (`tauri-apps.tauri-vscode`) — Tauri development support
- **rust-analyzer** (`rust-lang.rust-analyzer`) — Rust IDE features
- **Expo Tools** (`expo.vscode-expo-tools`) — Expo/React Native development

Settings in `.vscode/settings.json` configure Biome as the default formatter with format-on-save and organize-imports-on-save.
