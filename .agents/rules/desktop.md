---
paths:
  - "my-reader/**/*"
---

# Desktop boundaries

Read [current architecture](../../docs/ARCHITECTURE.md) for ownership and
[quality checks](../../docs/QUALITY.md) for commands and test selection.

- Tauri commands/services adapt platform state, credentials and DTOs to `my_reader_core::api`.
  SQL, validation, filtering, CRDT and shared business transactions belong in Core.
- React routes/components consume hooks and UI stores. Pure `lib/` helpers may be used directly;
  backend operations use query/action hooks and the typed `lib/tauri-api.ts` facade.
- `lib/` must not depend on React, hooks, components or stores at runtime. Shared reader contracts
  live in `src/types/reader.ts`; `components/reader/types.ts` is a compatibility re-export.
- Zustand stores own UI/device state; TanStack Query owns backend state.
- Do not hand-edit `routeTree.gen.ts`, `tauri-specta.ts` or generated Reader scripts.
- Run `pnpm test:desktop` after frontend changes; run `cargo test -p my-reader` after
  Tauri changes. See Cargo.toml for the crate name if it changes.
- Playwright with IPC mocks proves frontend behavior. It does not prove native Tauri behavior.
