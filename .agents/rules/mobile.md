---
paths:
  - "my-reader-mobile/**/*"
---

## Architecture

- **Routing**: Expo Router file-based (`app/` directory)
- **State**: Zustand (app-store, data-source-store, library-store, settings-store)
- **Database**: op-sqlite with CR-SQLite enabled
- **Patches**: 4 patches in `patches/` (react-native, react-native-css, react-native-zip-archive, gradle-plugin). Applied automatically via `postinstall`.

### Layer Model

Two kinds of **feature modules** sit above infrastructure. They share the same internal shape; the difference is scope, not capability.

```
app/  stores/  components/  design/  …   — app shell & cross-cutting UI
 ↓
features/   — product surfaces (screens, flows); relatively isolated
domain/     — shared business areas reused across features (library, sync, download)
 ↓
repos/      — table-access CRUD (no React, no fetch, no orchestration)
 ↓
services/   — infrastructure (fs, db, storage, http, auth, download, remote)
```

**Module anatomy** (same for `features/<name>/` and `domain/<name>/`):

```
<module>/
├── hooks/          React hooks & store/query glue for this area
├── components/     UI pieces owned by this area (optional)
├── utils/          pure helpers (optional)
└── *.ts            orchestration, types, plain async APIs
```

Examples:
- `domain/sync/hooks/apply-sync-report.ts` — writes sync results to Zustand + React Query
- `domain/library/hooks/library-actions.ts` — register / remove / switch libraries
- `features/library/` — library screens and feature-local hooks (`useLibraryQuery`, `useBookActions`)

**`src/hooks/`** — only **app-wide** hooks with no natural module home (debounce, stack options, reader progress saver, etc.). Do not add new domain- or feature-specific hooks here; colocate them under the owning module.

### Dependency Rules

1. Dependencies flow **downward**: modules → `repos` | `services`; `repos` → `services`.
2. `services/` must not import from `repos/`, `domain/`, `features/`, or UI shell.
3. `repos/` must not import from `domain/`, `features/`, or UI shell.
4. **`domain/` must not import from `features/`** — shared logic stays in domain; features consume domain, not the reverse.
5. **`features/` may import from `domain/`** and from other features only when necessary (prefer domain for shared code).
6. **`domain/` sub-areas may import each other** (`sync` ↔ `library` ↔ `download`) — convention and review, not lint.
7. Module hooks may use **Zustand**, **React Query**, and **React** — that is not a layering violation when the hook lives inside the owning `domain/*` or `features/*` tree.

### Directory Map

```
my-reader-mobile/src/
├── services/              Infrastructure — no business logic, no React
│   ├── db/                SQLite, calibre-db (library sidecar DB in domain/library/library-db.ts)
│   ├── fs/                path, file-io, cache, bookmarks
│   ├── http/              auth HTTP client
│   ├── storage/           credentials, json-storage
│   ├── auth/              onedrive auth
│   ├── download/          native download, remote-to-local
│   ├── webdav/            url-builder
│   └── remote/            backend interfaces, factory, auth-cache, webdav/, onedrive/
│
├── repos/                 Table-access CRUD — no React, no fetch, no orchestration
│   ├── file_state.ts      file_state table
│   ├── sync_meta.ts       sync_meta table
│   ├── reading_progress.ts reading_progress table
│   └── calibre/           Calibre metadata.db (read-only; connection via services/db/calibre-db)
│       ├── books.ts       book list, count, summaries
│       ├── book_relations.ts  single-book relation rows
│       └── data.ts        formats and file paths
│
├── domain/                Shared business modules (same internal layout as features/)
│   ├── library/           calibre, locations, library-db, metadata,
│   │                      remote-library
│   │   └── hooks/         library-actions (hydrate, register, remove, switch)
│   ├── sync/              sync-library, calibre-sync, myreader-sync, policy, scheduler,
│   │                      transfer (orchestration), db-sync, context, file-actions
│   │   ├── hooks/         apply-sync-report, run-library-sync, use-sync-library
│   │   └── components/    SyncRuntime
│   ├── download/          download-service, download-store
│   ├── reading-progress.ts
│   └── types.ts           BookItem, etc.
│
├── features/              Product surfaces (screens + feature-local hooks/components)
├── hooks/                 App-wide hooks only (not domain/feature-specific)
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
- **Calibre tree**: local and remote share the same relative paths under a single **`libraryRootUri(library)`** per library (`domain/library/locations.ts`). Remote cache root: `document/libraries/{libraryId}/`; sidecar DB: `{libraryRoot}/.myreader/myreader.db`.
- **Path infra**: `joinRelativePath` and `fileUriFor(base, relative)` in `services/fs/path.ts`. Fixed Calibre literals: `"metadata.db"`, `"cover.jpg"` only; format filenames come from metadata.
- **Remote URLs**: `RemoteBackend.contentUrl(relative)` — no domain wrapper except cover display.
- **Cover display**: `resolveCoverUri(library, bookPath, hasCover, backend?)` in `domain/library/locations.ts` (local file under library root, else remote URL).
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
npm run build:dev:ios       # EAS local iOS build (development profile)
```

## Testing

> **Mobile testing strategy** (four-layer architecture, Maestro E2E, toolchain, run commands): see `.agents/rules/expo-testing-strategy.md`.

### Required Post-Change Verification

When modifying any file under `my-reader-mobile/`, run the full mobile unit test suite before final response:

```bash
pnpm --filter my-reader-mobile exec jest --runInBand
```

All tests must pass. Targeted Jest runs are allowed during development, but they are not a substitute for the final full unit test run.
