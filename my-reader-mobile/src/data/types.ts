import type {
  DataSource,
  DataSourceLocal,
  DataSourceWebdav,
} from "my-reader-tools/store/data-source";

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

export type DataSourceType = "local" | "webdav";

export type SecurityScopedBookmark = {
  bookmarkBase64: string;
  resolvedUri: string;
  stale: boolean;
};

export type { DataSource, DataSourceLocal, DataSourceWebdav };

/** WebDAV API 层：要求已配置密码 */
export type WebDavDataSource = DataSourceWebdav & { password: string };

export type MobileLibrary = {
  id: string;
  name: string;
  path: string;
  metadataUri: string;
  bookCount: number;
  addedAt: number;
  dataSourceId?: string;
  sourceType?: DataSourceType;
  sourcePath?: string;
  securityScopedBookmark?: SecurityScopedBookmark;
};

export type MobileLibrariesConfig = {
  libraries: MobileLibrary[];
  activeLibraryId: string | null;
  dataSources: DataSource[];
};
