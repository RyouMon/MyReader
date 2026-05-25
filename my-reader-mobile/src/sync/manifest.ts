import type { RemoteFileOps } from "./backend";

/** 与桌面端 `MANIFEST_PATH` 保持一致。 */
export const MANIFEST_PATH = ".myreader/manifest.json";

export type ManifestEntry = {
  path: string;
  size: number;
  blake3: string;
  /** 源端 mtime，毫秒时间戳；用于 LWW 冲突检测。 */
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

export function emptyManifest(device: string): Manifest {
  return { version: 1, updatedAt: 0, device, entries: [] };
}

export function findEntry(manifest: Manifest, path: string): ManifestEntry | undefined {
  return manifest.entries.find((entry) => entry.path === path);
}

export function upsertEntry(manifest: Manifest, entry: ManifestEntry): void {
  const idx = manifest.entries.findIndex((e) => e.path === entry.path);
  if (idx >= 0) {
    manifest.entries[idx] = entry;
  } else {
    manifest.entries.push(entry);
  }
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

/**
 * Loads the manifest; treats NotFound as an empty manifest so the first sync
 * run can upload it fresh.
 */
export async function loadManifest(backend: RemoteFileOps, device: string): Promise<Manifest> {
  try {
    const bytes = await backend.readBytes(MANIFEST_PATH);
    if (bytes.byteLength === 0) return emptyManifest(device);
    return JSON.parse(utf8Decode(bytes)) as Manifest;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Match both WebDAV 404 and LocalDirect "not found" surface strings.
    if (/404|not found|不存在/i.test(message)) {
      return emptyManifest(device);
    }
    throw error;
  }
}

export async function saveManifest(backend: RemoteFileOps, manifest: Manifest): Promise<void> {
  manifest.updatedAt = Date.now();
  const bytes = utf8Encode(JSON.stringify(manifest, null, 2));
  await backend.writeBytes(MANIFEST_PATH, bytes);
}
