---
paths:
  - "my-reader-mobile/**/*"
---

## Architecture

- **Routing**: Expo Router under `src/app/`.
- **Server state**: TanStack Query.
- **Device/UI state**: Zustand and platform storage.
- **Shared backend**: `myreader-core` through `myreader-rust-components`, UniFFI and an Expo Native Module.
- **Reader**: application-owned Expo Readium module backed by Readium Swift/Kotlin Toolkit.
- **Patches**: only the dependencies registered in `pnpm-workspace.yaml`; applied by pnpm.

Mobile has no independent application database backend. Do not add TypeScript repositories, SQL, Drizzle,
OP-SQLite, migration runners or CRDT merge logic. MyReader SQLite and Calibre query behavior belong in
`myreader-core`.

## Layer Model

```text
app/ + components/ + store/ + design/
                    ↓
features/           Product screens and feature-local interaction
domain/             Shared mobile UI/platform workflows
                    ↓
services/core/      Thin FFI facade
services/*          Platform infrastructure
                    ↓
Expo Native Modules / UniFFI / myreader-core
```

### `features/`

Own product surfaces, screen composition, feature hooks and feature-local UI state. A feature may consume
`domain/` and `services/`, but shared business rules should not be reimplemented here.

### `domain/`

Own only workflows that are both:

1. reused by multiple mobile features; and
2. tied to mobile UI or platform behavior.

Examples include React Query invalidation, native background-task queue/concurrency, Expo file URIs and
lifecycle-triggered sync. Downloaded-file validation and persisted file-state transitions belong to core. Do not
retain a `domain` file that merely renames or forwards one core method; call the thin core facade directly.

### `services/core/`

This is the mobile adapter to shared Rust. It may:

- convert Expo URIs to native paths;
- load platform credentials and pass short-lived values to core;
- serialize/parse binding DTOs;
- pass platform timestamps or identity values explicitly requested by a core API;
- invalidate React Query or announce a platform sync trigger after a successful mutation.

It must not contain SQL, Automerge rules, conflict resolution, migration logic, backend business policy or a
second implementation of a core use case.

### Other `services/`

Own platform infrastructure such as:

- filesystem and security-scoped bookmarks;
- SecureStore and OAuth;
- native/background downloads;
- React Query client and keys;
- mobile remote file transfer needed by platform download flows.

Infrastructure must not import from `features/` or UI components.

## Dependency Rules

1. Dependencies flow downward toward services/native/core.
2. `domain/` must not import from `features/`.
3. `features/` may consume `domain/`; cross-feature imports should be rare.
4. `services/core/` and other infrastructure services must not import from features or UI.
5. UI and platform code call shared business through a coarse core facade, not through database entities or
   repositories.
6. Platform-specific code is appropriate for Expo Router, React state, Readium, filesystem permissions,
   credentials, notifications, lifecycle, network events and timers.
7. Shared backend rules and data access are implemented once in Rust.

## Directory Map

```text
my-reader-mobile/src/
├── app/                    Expo Router routes
├── features/               Product screens, local hooks and components
├── domain/
│   ├── library/            Mobile library presentation/platform workflows
│   ├── sync/               Platform triggers, Calibre file flow and query refresh
│   ├── download/           Mobile download coordination
│   ├── reading-statistics/ UI-facing statistics hooks and calendar mapping
│   └── notifications/      Mobile notifications
├── services/
│   ├── core/               Thin UniFFI facade
│   ├── fs/                 Expo filesystem and path infrastructure
│   ├── auth/               OneDrive token lifecycle
│   ├── storage/            Credentials and device JSON
│   ├── download/           Native download implementation
│   ├── remote/             Platform remote file backend
│   └── query/              TanStack Query infrastructure
├── store/                  Zustand slices and persistence
├── components/             Shared mobile UI
├── design/                 Color and typography integration
├── i18n/                   Localization
├── errors/                 Platform-facing errors
└── utils/                  Pure mobile utilities
```

Do not reintroduce `src/repos/` or `src/services/db/`.

## Key Conventions

- Stable shared product types come from `@my-reader/tools` or the typed `services/core` facade.
- Calibre `metadata.db` remains read-only and is queried by `myreader-core`.
- A library uses one canonical local root and one sidecar root from `services/fs/library-paths.ts`.
- Remote provider secrets remain in platform credential storage; pass only the value required for the current
  core call.
- `services/core` mutations notify platform sync only after core has committed the local transaction/change.
- Reader UI, Navigator, selection/decoration and gestures remain in the mobile Readium integration.
- File names use hyphen-case unless generated/platform conventions require otherwise.

## Commands

Run commands from the repository root:

```bash
pnpm dev:mobile
pnpm --filter my-reader-mobile ios
pnpm --filter my-reader-mobile android
pnpm --filter my-reader-mobile exec jest --runInBand
pnpm --filter my-reader-mobile test:e2e
```

For Rust/binding changes:

```bash
cargo test -p myreader-core -p myreader-rust-components
bash my-reader-mobile/modules/myreader-rust-components/scripts/verify-native.sh
```

## Required Post-Change Verification

After any mobile change, run the complete mobile unit suite:

```bash
pnpm --filter my-reader-mobile exec jest --runInBand
```

Targeted tests are useful during development but do not replace the full package suite. Changes to shared Rust
or native bindings also require the applicable Cargo and native source-build checks.
