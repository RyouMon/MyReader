import { Directory, Paths } from "expo-file-system";

import type { WebDavDataSource } from "../../data/types";
import { localCachedFileUri } from "../../utils/io";

import { LocalDirectBackend } from "./local";
import { WebDavBackend } from "./webdav";
import type { SyncBackend } from "./types";

export type {
  BackendKind,
  RemoteStat,
  DownloadRequest,
  UploadRequest,
  SyncBackend,
} from "./types";

// re-export backend classes for test access
export { LocalDirectBackend, WebDavBackend };

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
  return localCachedFileUri(libraryCacheDirUri, relativePath);
}

export function resolveLibraryBooksDir(libraryId: string): string {
  const dir = new Directory(Paths.document, "book-downloads", libraryId);
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }
  return dir.uri;
}