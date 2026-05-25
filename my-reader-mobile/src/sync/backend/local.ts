import { Directory, File } from "expo-file-system";

import { localCachedFileUri, parentDirectoryUriForFileUri } from "../../utils/io";
import { DataIntegrityError } from "../../errors";
import i18n from "@/src/i18n";

import type { BackendKind, RemoteStat, RemoteFileOps } from "./types";

export class LocalDirectBackend implements RemoteFileOps {
  readonly kind: BackendKind = "local-direct";

  constructor(private readonly libraryRootUri: string) {}

  private fileFor(relativePath: string): File {
    return new File(localCachedFileUri(this.libraryRootUri, relativePath));
  }

  private ensureParent(relativePath: string): void {
    const parentUri = parentDirectoryUriForFileUri(this.fileFor(relativePath).uri);
    if (!parentUri) return;
    const parent = new Directory(parentUri);
    if (!parent.exists) {
      parent.create({ idempotent: true, intermediates: true });
    }
  }

  async readBytes(relativePath: string): Promise<Uint8Array> {
    const file = this.fileFor(relativePath);
    if (!file.exists) {
      throw new DataIntegrityError(i18n.t("sync.localFileNotExist", { path: relativePath }));
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

  async listRemote(prefix: string): Promise<string[]> {
    const normalizedPrefix = prefix.replace(/\/$/, "");
    const dirUri = normalizedPrefix
      ? localCachedFileUri(this.libraryRootUri, normalizedPrefix)
      : this.libraryRootUri;
    const dir = new Directory(dirUri);
    if (!dir.exists) return [];
    try {
      return dir
        .list()
        .map((item) =>
          item instanceof Directory ? `${item.name}/` : (item.name ?? ""),
        )
        .filter(Boolean);
    } catch {
      return [];
    }
  }
}