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

## Database Layer

The project uses a **single-source-of-truth** schema defined in `packages/db/` via Drizzle ORM. Both platforms derive their table definitions from this package — mobile reuses Drizzle directly, desktop generates SeaORM entities from the same SQL and uses Entity-First schema sync at runtime.

### Architecture

```
packages/db/                          Schema single source of truth
  src/schema/                         Drizzle table definitions
  src/crdt.ts                         CRR table list + registration SQL (mobile)
  src/types.ts                        InferSelectModel / InferInsertModel exports
  drizzle/                            Generated by drizzle-kit
    0000_*.sql                        SQL migration files
    migrations.js                     JS module for mobile runtime migrator
    meta/_journal.json                Migration journal

my-reader/src-tauri/src/entities/     Generated by sea-orm-cli
  file_state.rs                       SeaORM entity for file_state table
  reading_progress.rs                 SeaORM entity for reading_progress table
  sync_meta.rs                        SeaORM entity for sync_meta table
```

### Tables

| Table | Scope | CRR (mobile) | Purpose |
|-------|-------|-------------|---------|
| `reading_progress` | Library-wide | Yes | Book reading position + timestamp |
| `file_state` | Library-wide | Yes | Per-file sync state (remote_only / present / local_only / dirty_push) |
| `sync_meta` | Library-wide | No | Sync cursor metadata (not merged across devices) |

Each library has its own `myreader.db` inside the library's `.myreader/` directory. There is no app-wide database.

### Schema change workflow

1. **Edit Drizzle schema** in `packages/db/src/schema/`
2. **Generate migration + entities**: `pnpm db:generate` — runs `drizzle-kit generate` then regenerates SeaORM entities from the SQL
3. **Update queries** — mobile: Drizzle queries auto-align with schema; desktop: update SeaORM entity queries if columns changed. New tables/columns are auto-created by Entity-First sync at runtime.
4. **Commit** — schema + migration + entities + query changes together

### Mobile (Drizzle ORM + cr-sqlite)

Runtime migration uses Drizzle's official `migrate()` function from `drizzle-orm/op-sqlite/migrator`:

```ts
import { migrate } from "drizzle-orm/op-sqlite/migrator";
import migrations from "@my-reader/db/drizzle/migrations";

const db = drizzle(raw, { schema });
migrate(db, migrations);
```

**Prerequisites for `.sql` imports** (already configured):
- `metro.config.js` — `config.resolver.sourceExts.push("sql")`
- `babel.config.js` — `plugins: [["inline-import", { extensions: [".sql"] }]]`

After migration, CRR tables are registered for cr-sqlite CRDT sync:

```ts
import { crrRegistrationSQL } from "@my-reader/db/crdt";
for (const sql of crrRegistrationSQL()) {
  raw.executeSync(sql);
}
```

### Desktop (SeaORM Entity-First + sqlx)

Desktop uses SeaORM's **Entity-First** workflow — schema is auto-synced from entity definitions at runtime, no manual migration files needed.

```rust
use sea_orm::{Database, DatabaseConnection};

let db = Database::connect(&url).await?;
db.get_schema_registry("my_reader_lib::entity::*")
    .sync(&db)
    .await?;
// db is now a DatabaseConnection — tables auto-created/updated from entities
```

Queries use SeaORM entities (not raw SQL) for our three tables:

```rust
use crate::entities::reading_progress;

// SELECT
let model = reading_progress::Entity::find()
    .filter(reading_progress::Column::BookId.eq(book_id))
    .one(&db).await?;

// INSERT / UPSERT
let active = reading_progress::ActiveModel {
    book_id: ActiveValue::set(book_id),
    format: ActiveValue::set(format),
    locator_json: ActiveValue::set(json),
    updated_at: ActiveValue::set(ts),
};
active.save(&db).await?;
```

`calibre_repo.rs` still uses raw `sqlx::query` because it reads from Calibre's external `metadata.db` (schema not under our control).

### Key commands

| Command | What it does |
|---------|-------------|
| `pnpm db:generate` | `drizzle-kit generate` + regenerate SeaORM entities |

### Package exports (`@my-reader/db`)

| Export | Contents |
|--------|---------|
| `@my-reader/db/schema` | Drizzle table definitions (`readingProgress`, `fileState`, `syncMeta`) |
| `@my-reader/db/types` | Inferred TypeScript types (`ReadingProgress`, `FileState`, `SyncMeta`, etc.) |
| `@my-reader/db/crdt` | `CRR_TABLES` list + `crrRegistrationSQL()` |
| `@my-reader/db/drizzle/migrations` | Generated `migrations.js` for mobile runtime migrator |

## VS Code Setup

Recommended extensions (auto-suggested via `.vscode/extensions.json`):

- **Tauri** (`tauri-apps.tauri-vscode`) — Tauri development support
- **rust-analyzer** (`rust-lang.rust-analyzer`) — Rust IDE features
- **Expo Tools** (`expo.vscode-expo-tools`) — Expo/React Native development

Settings in `.vscode/settings.json` configure Biome as the default formatter with format-on-save and organize-imports-on-save.
