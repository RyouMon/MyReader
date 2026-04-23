import { randomUUID } from "expo-crypto";

import { getSyncMeta, setSyncMeta } from "./sync_meta";

const DEVICE_SCOPE = "device";
const DEVICE_KEY = "id";

/**
 * Returns a stable per-install device id, generating one on first call.
 *
 * Kept in `sync_meta` so it is durable across app launches and survives
 * across sync targets — manifests on every backend share the same id.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getSyncMeta(DEVICE_SCOPE, DEVICE_KEY);
  if (existing && existing.length > 0) return existing;
  const id = randomUUID();
  await setSyncMeta(DEVICE_SCOPE, DEVICE_KEY, id);
  return id;
}
