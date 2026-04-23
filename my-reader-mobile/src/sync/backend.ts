import { Directory, File, Paths } from "expo-file-system";

import type { WebDavDataSource } from "../data/types";

export type BackendKind = "webdav" | "local-direct";

export type RemoteStat = {
  size: number;
  /** mtime in ms; may be 0 when backend does not expose a modification date. */
  mtimeMs: number;
  exists: boolean;
};

/**
 * Uniform surface for the two supported mobile backends.
 *
 * Paths are always treated as **forward-slash** relative paths rooted at the
 * library; backends translate them into URLs, bookmarked directories or raw
 * filesystem paths as appropriate.
 */
export interface SyncBackend {
  readonly kind: BackendKind;
  readonly isLocalDirect: boolean;
  readBytes(relativePath: string): Promise<Uint8Array>;
  writeBytes(relativePath: string, bytes: Uint8Array): Promise<void>;
  deleteRemote(relativePath: string): Promise<void>;
  statRemote(relativePath: string): Promise<RemoteStat>;
  /**
   * Materialize the remote bytes into a local file. Default implementations
   * just read+write, but WebDAV can override with a streaming fetch later.
   */
  downloadToLocalFile(relativePath: string, localFileUri: string): Promise<number>;
}

function normalizeRelative(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  return trimmed.replace(/^\/+/, "").replace(/\/+$/, "");
}

function joinUrl(base: string, ...segments: string[]): string {
  const baseClean = base.replace(/\/+$/, "");
  const tail = segments
    .map((s) => s.trim().replace(/^\/+/, "").replace(/\/+$/, ""))
    .filter(Boolean)
    .join("/");
  return tail ? `${baseClean}/${tail}` : baseClean;
}

function encodeBasicAuth(username: string, password: string): string {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(`${username}:${password}`);
  }
  throw new Error("当前环境不支持 Basic Auth 编码");
}

function encodePathSegments(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

// ---------------------------- WebDAV backend ----------------------------

class WebDavBackend implements SyncBackend {
  readonly kind: BackendKind = "webdav";
  readonly isLocalDirect = false;

  constructor(
    private readonly source: WebDavDataSource,
    private readonly libraryRootPath: string,
  ) {}

  private authHeader(): Record<string, string> {
    return {
      Authorization: `Basic ${encodeBasicAuth(this.source.username, this.source.password)}`,
    };
  }

  private urlFor(relativePath: string): string {
    const rel = normalizeRelative(relativePath);
    const encoded = encodePathSegments(rel);
    const root = joinUrl(this.source.endpoint, this.source.rootPath ?? "", this.libraryRootPath);
    return encoded ? `${root.replace(/\/+$/, "")}/${encoded}` : root;
  }

  async readBytes(relativePath: string): Promise<Uint8Array> {
    const response = await fetch(this.urlFor(relativePath), {
      method: "GET",
      headers: this.authHeader(),
    });
    if (!response.ok) {
      throw new Error(`WebDAV GET 失败: ${response.status} ${relativePath}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async writeBytes(relativePath: string, bytes: Uint8Array): Promise<void> {
    await this.ensureParentDirectories(relativePath);
    const response = await fetch(this.urlFor(relativePath), {
      method: "PUT",
      headers: {
        ...this.authHeader(),
        "Content-Type": "application/octet-stream",
      },
      body: bytes as unknown as BodyInit,
    });
    if (!response.ok) {
      throw new Error(`WebDAV PUT 失败: ${response.status} ${relativePath}`);
    }
  }

  async deleteRemote(relativePath: string): Promise<void> {
    const response = await fetch(this.urlFor(relativePath), {
      method: "DELETE",
      headers: this.authHeader(),
    });
    // 404 is fine — the end-state is "file not there".
    if (!response.ok && response.status !== 404) {
      throw new Error(`WebDAV DELETE 失败: ${response.status} ${relativePath}`);
    }
  }

  async statRemote(relativePath: string): Promise<RemoteStat> {
    const response = await fetch(this.urlFor(relativePath), {
      method: "PROPFIND",
      headers: { ...this.authHeader(), Depth: "0" },
    });
    if (response.status === 404) {
      return { size: 0, mtimeMs: 0, exists: false };
    }
    if (!response.ok) {
      throw new Error(`WebDAV PROPFIND 失败: ${response.status} ${relativePath}`);
    }
    const xml = await response.text();
    const size = Number(xml.match(/<[^>]*getcontentlength[^>]*>(\d+)</i)?.[1] ?? 0);
    const lastModified = xml.match(/<[^>]*getlastmodified[^>]*>([^<]+)</i)?.[1];
    const mtimeMs = lastModified ? new Date(lastModified).getTime() || 0 : 0;
    return { size, mtimeMs, exists: true };
  }

  async downloadToLocalFile(relativePath: string, localFileUri: string): Promise<number> {
    const bytes = await this.readBytes(relativePath);
    const file = new File(localFileUri);
    if (file.exists) file.delete();
    file.create({ intermediates: true, overwrite: true });
    file.write(bytes);
    return bytes.byteLength;
  }

  /**
   * WebDAV servers return 409 for PUT into missing directories; MKCOL each
   * parent segment until reaching the target so uploads stay idempotent.
   */
  private async ensureParentDirectories(relativePath: string): Promise<void> {
    const rel = normalizeRelative(relativePath);
    const parts = rel.split("/").filter(Boolean);
    if (parts.length <= 1) return;
    let cursor = "";
    for (let i = 0; i < parts.length - 1; i += 1) {
      cursor = cursor ? `${cursor}/${parts[i]}` : parts[i]!;
      const response = await fetch(this.urlFor(cursor), {
        method: "MKCOL",
        headers: this.authHeader(),
      });
      // 201 = created, 405 = exists, 301 = collection already at path.
      if (!response.ok && ![201, 301, 405].includes(response.status)) {
        throw new Error(`WebDAV MKCOL 失败: ${response.status} ${cursor}`);
      }
    }
  }
}

// ---------------------------- LocalDirect backend ----------------------------

class LocalDirectBackend implements SyncBackend {
  readonly kind: BackendKind = "local-direct";
  readonly isLocalDirect = true;

  constructor(private readonly libraryRootUri: string) {}

  private fileFor(relativePath: string): File {
    const segments = normalizeRelative(relativePath).split("/").filter(Boolean);
    return new File(new Directory(this.libraryRootUri), ...segments);
  }

  private ensureParent(relativePath: string): void {
    const segments = normalizeRelative(relativePath).split("/").filter(Boolean);
    if (segments.length <= 1) return;
    const parent = new Directory(
      new Directory(this.libraryRootUri),
      ...segments.slice(0, -1),
    );
    if (!parent.exists) {
      parent.create({ idempotent: true, intermediates: true });
    }
  }

  async readBytes(relativePath: string): Promise<Uint8Array> {
    const file = this.fileFor(relativePath);
    if (!file.exists) {
      throw new Error(`本地文件不存在: ${relativePath}`);
    }
    return file.bytes();
  }

  async writeBytes(relativePath: string, bytes: Uint8Array): Promise<void> {
    this.ensureParent(relativePath);
    const file = this.fileFor(relativePath);
    if (file.exists) file.delete();
    file.create({ intermediates: true, overwrite: true });
    file.write(bytes);
  }

  async deleteRemote(relativePath: string): Promise<void> {
    const file = this.fileFor(relativePath);
    if (file.exists) file.delete();
  }

  async statRemote(relativePath: string): Promise<RemoteStat> {
    const file = this.fileFor(relativePath);
    if (!file.exists) return { size: 0, mtimeMs: 0, exists: false };
    return {
      size: file.size ?? 0,
      mtimeMs: file.modificationTime ? file.modificationTime * 1000 : 0,
      exists: true,
    };
  }

  async downloadToLocalFile(relativePath: string, localFileUri: string): Promise<number> {
    const source = this.fileFor(relativePath);
    if (!source.exists) {
      throw new Error(`本地源文件不存在: ${relativePath}`);
    }
    const dest = new File(localFileUri);
    if (dest.exists) dest.delete();
    dest.create({ intermediates: true, overwrite: true });
    source.copy(dest);
    return dest.size ?? source.size ?? 0;
  }
}

// ---------------------------- Factory ----------------------------

export type BackendBuildOptions =
  | {
      kind: "webdav";
      source: WebDavDataSource;
      /** Library root path **relative to the data source's rootPath**. */
      libraryPath: string;
    }
  | {
      kind: "local-direct";
      /** `file://` URI of the library root on the device's filesystem. */
      libraryRootUri: string;
    };

export function buildBackend(options: BackendBuildOptions): SyncBackend {
  if (options.kind === "webdav") {
    return new WebDavBackend(options.source, options.libraryPath);
  }
  return new LocalDirectBackend(options.libraryRootUri);
}

/**
 * Convenience helper mirroring the desktop Rust helper: returns the absolute
 * local file URI where a relative path should live for this backend.
 */
export function localFileUriFor(libraryCacheDirUri: string, relativePath: string): string {
  const rel = normalizeRelative(relativePath);
  const encoded = rel
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${libraryCacheDirUri.replace(/\/+$/, "")}/${encoded}`;
}

export function resolveLibraryCacheDir(libraryId: string): string {
  const dir = new Directory(Paths.document, "library-files-cache", libraryId);
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }
  return dir.uri;
}
