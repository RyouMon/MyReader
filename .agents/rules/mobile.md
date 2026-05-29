---
paths:
  - "my-reader-mobile/**/*"
---

## Architecture

- **Routing**: Expo Router file-based (`app/` directory)
- **State**: Zustand (app-store, data-source-store, library-store, settings-store)
- **Database**: op-sqlite with CR-SQLite enabled
- **Patches**: 4 patches in `patches/` (react-native, react-native-css, react-native-zip-archive, gradle-plugin). Applied automatically via `postinstall`.

### Three-Layer Dependency Model

```
UI (hooks / features / app / stores / components)
 ↓
domain/  — business orchestration (library, sync, download)
 ↓         may also call repos/ directly
repos/    — table-access CRUD (no React, no fetch, no orchestration)
 ↓
services/ — infrastructure (fs, db, storage, http, auth, download, remote)
```

**Strict rules**:
1. Dependencies only flow downward: `UI → domain → repos | services`, `repos → services`.
2. `services/` must not import from `repos/`, `domain/`, or any UI layer.
3. `repos/` must not import from `domain/` or any UI layer.
4. `domain/` must not import from any UI layer (`hooks/`, `features/`, `app/`, `stores/`).
5. `domain/` sub-directories (`library/`, `sync/`, `download/`) may call each other — enforced by convention and review, not lint.

### Directory Map

```
my-reader-mobile/src/
├── services/              Infrastructure — no business logic, no React
│   ├── db/                SQLite, library-db, calibre-db
│   ├── fs/                path, cache, bookmarks
│   ├── http/              auth HTTP client
│   ├── storage/           credentials, json-storage
│   ├── auth/              onedrive auth
│   ├── download/          native download
│   ├── webdav/            url-builder
│   └── remote/            backend interfaces, factory, auth-cache, webdav/, onedrive/
│
├── repos/                 Table-access CRUD — no React, no fetch, no orchestration
│   ├── file_state.ts      file_state table
│   └── sync_meta.ts       sync_meta table
│
├── domain/                Business orchestration
│   ├── library/           book-formats, calibre, cover-mirror, cover-url, metadata,
│   │                      remote-library, remote-library-shared
│   ├── sync/              scheduler, transfer, reconcile, manifest, db-sync, device,
│   │                      book-diff, refresh-library, resolve, connectivity, context, actions
│   ├── download/          download-service, download-store (React subscription kept in-place)
│   ├── reading-progress.ts
│   └── types.ts           BookItem, etc.
│
├── hooks/                 React hooks — sole callers of domain/ from UI
├── features/              Screen-level UI components
├── app/                   Expo Router file-based routes
├── stores/                Zustand store slices
├── components/            Shared UI components
├── constants/             App-wide constants
├── design/                Design tokens & typography
├── errors/                Error classes & global handler
├── notifications/         Download & in-app notifications
├── i18n/                  Internationalization
├── polyfills/             Reader engine globals
├── tw/                    NativeWind primitives
└── utils/                 Pure utility functions
```

### Key Conventions

- **Table schemas** live in `@my-reader/db`; `repos/` files are access facades named after their table.
- **Shared types** (`DataSource`, `Library`, etc.) come from `@my-reader/tools` — never from a local `data/types.ts` re-export.
- **Remote backends** are created via `services/remote/factory.ts`; UI must go through `domain/library/remote-library.ts`, never call factory directly.
- **`download-store.ts`** contains React subscriptions and stays in `domain/download/` — not split further unless a later pass.
- **Deleted directories**: `data/`, root-level `remote/`, root-level `sync/` — do not re-introduce these.
- **File naming**: hyphen-case in `domain/` and `services/`; underscore in `repos/` to match table names.

## Commands

All commands are package-specific. The repo root has no `package.json`.

### Mobile (`my-reader-mobile/`)

```bash
cd my-reader-mobile
npm install                   # Installs deps + applies patch-package patches
npx expo start                # Expo dev server
npm run android               # Run on Android (expo run:android)
npm run ios                   # Run on iOS device
npm run lint                  # ESLint (expo lint)
```

**Testing:**
```bash
npm run test:ci               # Jest in CI mode (jest-expo preset)
npm run test                  # Jest watch mode
npm run test:e2e              # Maestro E2E (runs all flows in e2e/maestro/)
  # Note: dev-build E2E requires a running Expo dev server (npx expo start)
npm run build:dev:android     # EAS local Android build (development profile)
npm run build:dev:ios         # EAS local iOS build (development profile)
```

## Testing

> **Mobile testing strategy** (four-layer architecture, Maestro E2E, toolchain, run commands): see `.agents/rules/expo-testing-strategy.md`.