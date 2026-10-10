import type { ErrorKind } from "./tauri-specta"

export function apiErrorKind(error: unknown): ErrorKind["kind"] | undefined {
  if (typeof error !== "object" || error === null || !("kind" in error))
    return undefined
  return typeof error.kind === "string"
    ? (error.kind as ErrorKind["kind"])
    : undefined
}
