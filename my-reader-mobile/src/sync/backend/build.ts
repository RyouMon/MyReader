import { Directory, Paths } from "expo-file-system";

import type { WebDavDataSource } from "../../data/types";
import { localCachedFileUri } from "../../services/fs/path";

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

// Path resolution functions moved to services/fs/path for layering
export { resolveLibraryBooksDir, localFileUriFor } from "../../services/fs/path";
