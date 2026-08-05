import type {
  DataSource,
  DataSourceWebdav,
  DataSourceOnedrive,
} from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
export { isRemoteLibrarySourceType as isRemoteSourceType } from "@my-reader/tools/types/library"

export type BookItem = {
  id: string
  uuid?: string
  calibreId?: number
  title: string
  author: string
  authors?: string[]
  formats?: string[]
  readableFormats?: string[]
  preferredFormat?: string | null
  coverUri?: BookCoverUri
  progress?: number
  path?: string
  hasCover?: boolean
  timestamp?: string | null
  importStatus?: "importing"
}

export type BookCoverUri =
  | string
  | { uri: string; headers?: Record<string, string> }

export type DataSourceType = "local" | "webdav" | "onedrive"

export type { DataSource, DataSourceWebdav, DataSourceOnedrive, Library }

/** WebDAV API layer: requires configured password */
export type WebDavDataSource = DataSourceWebdav & { password: string }

/** OneDrive API layer: requires valid access token */
export type OneDriveDataSource = DataSourceOnedrive & { accessToken: string }

export type LocalState =
  | "present"
  | "remote_only"
  | "source_missing"
  | "remote_delete_pending"
  | "local_only"
  | "dirty_push"

export type MobileLibrariesConfig = {
  libraries: Library[]
  activeLibraryId: string | null
  dataSources: DataSource[]
}
