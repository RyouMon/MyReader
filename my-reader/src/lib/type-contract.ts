import type { FileState as DrizzleFileState } from "@my-reader/db/types";
import type { FileStateRow as SpectaFileStateRow } from "./tauri-specta";

// Compile-time assertion: IPC boundary fields must be a subset of DB model fields.
// The Rust FileStateRow intentionally omits `updatedAt` (sync-internal column),
// but every field that IS exposed via IPC must match the Drizzle type exactly.
// If any assertion below errors, the Rust struct has drifted from the Drizzle schema.

export type _AssertPath = SpectaFileStateRow["path"] extends DrizzleFileState["path"] ? true : never;
export type _AssertLocalState = SpectaFileStateRow["localState"] extends DrizzleFileState["localState"] ? true : never;
export type _AssertBlake3 = SpectaFileStateRow["localBlake3"] extends DrizzleFileState["localBlake3"] ? true : never;
export type _AssertSize = SpectaFileStateRow["localSize"] extends DrizzleFileState["localSize"] ? true : never;
export type _AssertMtime = SpectaFileStateRow["localMtime"] extends DrizzleFileState["localMtime"] ? true : never;