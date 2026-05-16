import type { DataSource, DataSourceWebdav } from "@my-reader/tools/store/data-source";
import type { Library } from "@my-reader/tools/store/library";

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

export type { DataSource, DataSourceWebdav, Library };

/** WebDAV API 层：要求已配置密码 */
export type WebDavDataSource = DataSourceWebdav & { password: string };

export type MobileLibrariesConfig = {
  libraries: Library[];
  activeLibraryId: string | null;
  dataSources: DataSource[];
};
