import type { SyncBackend } from "./resolve";
import { NetworkError } from "../../errors";

/** 与桌面端 `MANIFEST_PATH` 保持一致。 */
export const MANIFEST_PATH = ".myreader/manifest.json";

export type ManifestEntry = {
  path: string;
  size: number;
  blake3: string;
  mtime: number;
  required?: boolean;
  sourceOfTruth?: "cloud" | "local";
};

export type Manifest = {
  version: number;
  updatedAt: number;
  device: string;
  entries: ManifestEntry[];
};

function emptyManifest(device: string): Manifest {
  return { version: 1, updatedAt: 0, device, entries: [] };
}

export function findEntry(manifest: Manifest, path: string): ManifestEntry | undefined {
  return manifest.entries.find((entry) => entry.path === path);
}

export function removeEntry(manifest: Manifest, path: string): boolean {
  const before = manifest.entries.length;
  manifest.entries = manifest.entries.filter((entry) => entry.path !== path);
  return before !== manifest.entries.length;
}

function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export async function loadManifest(backend: SyncBackend, device: string): Promise<Manifest> {
  try {
    const bytes = await backend.readBytes(MANIFEST_PATH);
    if (bytes.byteLength === 0) return emptyManifest(device);
    return JSON.parse(utf8Decode(bytes)) as Manifest;
  } catch (error) {
    if (error instanceof NetworkError && error.statusCode === 404) {
      return emptyManifest(device);
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|不存在/i.test(message)) {
      return emptyManifest(device);
    }
    throw error;
  }
}

export async function saveManifest(backend: SyncBackend, manifest: Manifest): Promise<void> {
  manifest.updatedAt = Date.now();
  const bytes = utf8Encode(JSON.stringify(manifest, null, 2));
  await backend.writeBytes(MANIFEST_PATH, bytes);
}