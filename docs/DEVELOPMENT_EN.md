<div align="right"><a href="./DEVELOPMENT.md">简体中文</a></div>

# Development Guide

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 22 | LTS recommended |
| pnpm | 11.7.0 | Repository `packageManager` version |
| Rust | stable | Edition 2021; install with [rustup](https://rustup.rs) |
| Android Studio | Latest | Android SDK/NDK and emulator |
| Xcode | ≥ 16 | iOS development on macOS |

## First-Time Setup

```bash
git clone https://github.com/RyouMon/MyReader.git
cd MyReader
corepack enable
pnpm install
```

This installs the desktop, mobile, fonts and tools workspaces and prepares the Git hooks.

## Project Structure

```text
MyReader/
├── my-reader-core/                Shared Rust backend
├── my-reader/                     Tauri 2 + React desktop app
├── my-reader-mobile/              Expo 56 + React Native 0.85 app
│   └── modules/my-reader-core/    Core UniFFI/JSI mobile adapter
├── packages/
│   ├── fonts/                     Shared reading font catalog
│   └── tools/                     Shared TypeScript types and reader algorithms
├── docs/                           ADR and protocol documentation
└── scripts/                        Code generation and design-token scripts
```

See [ARCHITECTURE_EN.md](./ARCHITECTURE_EN.md) for ownership and dependency boundaries.

## Desktop (Tauri)

### Development

```bash
pnpm dev:desktop
```

This starts Vite on port 1420 and launches the Tauri window. The first Rust build takes longer.

### Tests

```bash
pnpm --filter my-reader run test:unit
pnpm --filter my-reader run test:unit:watch
pnpm --filter my-reader run test:unit:coverage

pnpm --filter my-reader run test:e2e:frontend
pnpm --filter my-reader run test:e2e:frontend:ui
pnpm --filter my-reader run test:e2e:desktop

(cd my-reader/src-tauri && cargo test)
```

### Formatting

```bash
pnpm --filter my-reader exec biome check --write .
cargo fmt --all
```

## Mobile (Expo)

### Development

```bash
pnpm dev:mobile
pnpm --filter my-reader-mobile ios
pnpm --filter my-reader-mobile android
```

`ios` and `android` build and install the development client. JS/TS-only changes normally need only a running
Metro server; native module, dependency or app-config changes require a native rebuild.

After changing `app.json`, config plugins or other generated native configuration:

```bash
pnpm --filter my-reader-mobile expo prebuild --clean
```

### Tests

```bash
pnpm --filter my-reader-mobile exec jest --runInBand
pnpm --filter my-reader-mobile test:e2e
```

Maestro E2E requires the Maestro CLI and a running development client.

### Shared Rust native verification

The mobile app consumes `my-reader-core` through generated UniFFI/JSI bindings in
`modules/my-reader-core`. Its internal `my-reader-core-ffi` crate owns the typed FFI boundary.
Build binaries locally instead of committing them:

```bash
cargo test -p my-reader-core -p my-reader-core-ffi
pnpm core:build-bindings:ios
pnpm core:build-bindings:android
```

To compile the iOS app against the generated bridge:

```bash
cd my-reader-mobile/ios
pod install
xcodebuild \
  -workspace myreadermobile.xcworkspace \
  -scheme myreadermobile \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

The generated TypeScript/C++ bindings and platform integration are derived from Rust source. Personal machine
build output, XCFrameworks and Android shared libraries do not belong in Git.

### Environment variables

Copy `my-reader-mobile/.env.example` to `my-reader-mobile/.env`:

```text
EXPO_PUBLIC_SENTRY_DSN=<your Sentry DSN>
SENTRY_AUTH_TOKEN=<your Sentry auth token>
```

Sentry is optional.

## Shared Packages

```bash
pnpm --filter @my-reader/fonts test
pnpm --filter @my-reader/tools test
```

`packages/tools` contains stable TypeScript contracts and Reader-side pure algorithms. Cross-platform backend
business belongs in `my-reader-core`, not in a new TypeScript service package.

## Database and Migration Ownership

### MyReader sidecar

Each library has an independent `.myreader/myreader.db`. Both desktop and mobile open it through
`my-reader-core`; TypeScript does not own a SQLite connection or run migrations.

```text
my-reader-core/
├── migrations/legacy/        Immutable imported migration history
├── src/migration.rs          Ordered SeaORM Migrator
├── src/database.rs           Open, handoff and migration lifecycle
├── src/entities/app/         SeaORM query mappings
└── src/repositories/         Database access hidden behind core services
```

The first core open of an older mobile database recognizes the historical `__drizzle_migrations` state, records
the equivalent SeaORM versions, applies later migrations, and removes the obsolete metadata table. This is a
one-time compatibility handoff, not a second active migration system.

### Calibre database

Calibre `metadata.db` is external and read-only. Its checked-in query mappings live under
`my-reader-core/src/entities/calibre/`. They are not registered with the MyReader Migrator and must never
be used to alter a Calibre library.

When support for a Calibre table or column changes:

1. Verify the field against a real supported Calibre schema.
2. Update the read-only entity mapping and repository query together.
3. Add or update a query test using a Calibre fixture.
4. Do not create a MyReader migration for the Calibre change.

### MyReader schema changes

1. Add an ordered migration to the Rust-owned `my-reader-core` Migrator. Existing migration files are immutable.
2. Update repository/service behavior and migration tests.
3. Run the complete Migrator against a new database and relevant upgrade fixtures.
4. Regenerate and review SeaORM query mappings:

   ```bash
   pnpm db:generate
   ```

5. Commit the migration, generated entities and behavior changes together.

`pnpm db:generate` creates a temporary database by executing the same `my-reader-core` Migrator used at runtime,
then runs `sea-orm-cli generate entity`. It does not use Drizzle or an Entity-First schema synchronizer.

Prerequisites for entity generation:

```bash
cargo install sea-orm-cli
```

### Database verification

At minimum, schema changes must cover:

- complete migration replay on a new SQLite database;
- upgrade from the applicable prior SeaORM version;
- one-time handoff when an older mobile Drizzle metadata table is relevant;
- repository behavior against the resulting real schema;
- no generated entity drift after `pnpm db:generate`.

## Design Tokens

After changing `../.agents/skills/myreader-design-system/colors_and_type.css` or [the design system](./DESIGN_EN.md):

```bash
pnpm sync:design-tokens
```

This propagates colors to desktop and mobile implementations.

## Monorepo Notes

- `node-linker=hoisted` is required for Metro compatibility.
- Internal pnpm packages use `workspace:*`.
- Desktop uses React 18; mobile uses React 19.
- Mobile dependency patches are registered in `pnpm-workspace.yaml` and stored under repository patch folders.
- Cargo packages share dependency versions from the root `Cargo.toml`.

## VS Code Setup

Recommended extensions:

- Tauri (`tauri-apps.tauri-vscode`)
- rust-analyzer (`rust-lang.rust-analyzer`)
- Expo Tools (`expo.vscode-expo-tools`)

Repository VS Code settings configure Biome formatting and import organization.
