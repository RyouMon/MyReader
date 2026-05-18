import { randomUUID } from "expo-crypto";

/** UUID4 as 32-char hex string (no hyphens). */
export function uuid(): string {
  return randomUUID().replace(/-/g, "");
}
