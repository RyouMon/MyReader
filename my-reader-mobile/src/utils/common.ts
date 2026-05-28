import { randomUUID } from "expo-crypto";

/** UUID4 as 32-char hex string (no hyphens). */
export function uuid(): string {
  return randomUUID().replace(/-/g, "");
}

/** Converts an unknown thrown value into a human-readable string. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
