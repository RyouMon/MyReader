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

export type LocalDataSource = {
  id: string;
  type: "local";
  name: string;
  rootUri?: string;
  createdAt: number;
};

export type WebDavDataSource = {
  id: string;
  type: "webdav";
  name: string;
  serverUrl: string;
  username: string;
  password: string;
  basePath: string;
  createdAt: number;
};

export type DataSource = LocalDataSource | WebDavDataSource;

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
};

export type MobileLibrariesConfig = {
  libraries: MobileLibrary[];
  activeLibraryId: string | null;
  dataSources: DataSource[];
};
