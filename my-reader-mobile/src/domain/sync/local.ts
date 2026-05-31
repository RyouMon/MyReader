import { Directory, File } from "expo-file-system";

import i18n from "@/src/i18n";
import { DataIntegrityError } from "../../errors";
import { fileUriFor, parentDirectoryUriForFileUri } from "../../services/fs/path";

export type BackendKind = "local-direct";

export type RemoteStat = {
  size: number;
  mtimeMs: number;
  exists: boolean;
};

export interface RemoteFileOps {
  readonly kind: BackendKind;
  readBytes(relativePath: string): Promise<Uint8Array>;
  writeBytes(relativePath: string, bytes: Uint8Array): Promise<void>;
  deleteRemote(relativePath: string): Promise<void>;
  statRemote(relativePath: string): Promise<RemoteStat>;
  listRemote(prefix: string): Promise<string[]>;
}

export class LocalDirectBackend implements RemoteFileOps {
  readonly kind: BackendKind = "local-direct";

  constructor(private readonly libraryRootUri: string) {}

  private fileFor(relativePath: string): File {
    return new File(fileUriFor(this.libraryRootUri, relativePath));
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
      ? fileUriFor(this.libraryRootUri, normalizedPrefix)
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