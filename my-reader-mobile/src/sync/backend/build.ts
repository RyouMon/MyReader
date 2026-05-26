import { Directory, Paths } from "expo-file-system";

import type { WebDavDataSource } from "../../data/types";
import { localCachedFileUri } from "../../utils/io";

import { LocalDirectBackend } from "./local";
import { OneDriveBackend } from "./onedrive";
import { WebDavBackend } from "./webdav";
import type { RemoteFileOps, TransferBackend } from "./types";

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
    }
  | {
      kind: "onedrive";
      dataSourceId: string;
      /** Library root path **relative to the data source's rootPath**. */
      libraryPath: string;
    };

export function buildBackend(options: BackendBuildOptions): RemoteFileOps | TransferBackend {
  if (options.kind === "webdav") {
    return new WebDavBackend(options.source, options.libraryPath);
  }
  if (options.kind === "onedrive") {
    return new OneDriveBackend(options.dataSourceId, options.libraryPath);
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
