---
paths:
  - "my-reader-mobile/**/*"
---

# Mobile boundaries

Read [current architecture](../../docs/ARCHITECTURE.md) and
[quality checks](../../docs/QUALITY.md) for ownership, commands and validation scope.

- Expo Router owns `src/app/`; keep fixtures and tests outside that directory.
- Features own product surfaces; `domain/` contains cross-feature mobile UI/platform workflows.
  Dependencies flow toward `services/`, native adapters and Core. Infrastructure never imports UI/features.
- `services/core/` converts platform paths, credentials and DTOs, calls generated bindings and invalidates
  queries after a successful mutation. It does not implement SQL, CRDT, migration or backend policy.
- MyReader SQLite, Calibre read-only queries and shared business rules belong to `my-reader-core`.
  Do not reintroduce `repos/`, `services/db/`, Drizzle or a second database writer.
- TanStack Query owns backend state; Zustand owns UI/device state.
- `modules/readium` owns native Navigator, Locator, selection and decoration integration. Rust Core owns
  provider configuration/inference, not native playback, audio focus, system TTS or Navigator traversal.
- Credentials remain in platform secure storage; pass only short-lived values into Core.
- `modules/my-reader-core` glue is generated. Its Rust crate owns typed UniFFI exports/conversions;
  regenerate the binding after exported Rust API changes.
- Prefer official platform APIs and existing adapters. Keep platform-specific navigation, permissions,
  filesystem access, lifecycle, background scheduling and notifications on the platform.
- Run the full `pnpm test:mobile` suite after changes. Rust/FFI changes also require full Cargo tests;
  native changes require the applicable source build and simulator verification.
- Native build and simulator commands: [DEVELOPMENT.md](../../docs/DEVELOPMENT.md).
  Flow conventions: [Maestro](../../my-reader-mobile/e2e/README.md).
