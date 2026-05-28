import { randomUUID } from "expo-crypto";

import { getSyncMeta, setSyncMeta } from "../../repos/sync_meta";
import type { Library } from "../../data/types";

const DEVICE_KEY = "id";

/**
 * Returns a stable per-install device id, generating one on first call.
 *
 * Kept in `sync_meta` so it is durable across app launches and survives
 * across sync targets — manifests on every backend share the same id.
 */
export async function getOrCreateDeviceId(library: Library): Promise<string> {
  const existing = await getSyncMeta(library, DEVICE_KEY);
  if (existing && existing.length > 0) return existing;
  const id = randomUUID();
  await setSyncMeta(library, DEVICE_KEY, id);
  return id;
}
