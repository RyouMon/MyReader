import type { DataSource, DataSourceWebdav, DataSourceOnedrive } from "@my-reader/tools/types/data-source";
import type { Library } from "@my-reader/tools/types/library";

export type BookItem = {
  id: string;
  calibreId?: number;
  title: string;
  author: string;
  authors?: string[];
  coverUri?: string | { uri: string; headers?: Record<string, string> };
  progress?: number;
  path?: string;
  hasCover?: boolean;
  timestamp?: string | null;
};

export type DataSourceType = "local" | "webdav" | "onedrive";

export type { DataSource, DataSourceWebdav, DataSourceOnedrive, Library };

/** WebDAV API layer: requires configured password */
export type WebDavDataSource = DataSourceWebdav & { password: string };

/** OneDrive API layer: requires valid access token */
export type OneDriveDataSource = DataSourceOnedrive & { accessToken: string };

export type LocalState = "present" | "remote_only" | "dirty_push";

export function isRemoteSourceType(sourceType?: string | null): boolean {  return sourceType === "webdav" || sourceType === "onedrive";
}

export type MobileLibrariesConfig = {
  libraries: Library[];
  activeLibraryId: string | null;
  dataSources: DataSource[];
};
