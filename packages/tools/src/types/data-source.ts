export type DataSourceWebdav = {
  id: string
  type: "webdav"
  name: string
  enabled: boolean
  endpoint: string
  username: string
  rootPath?: string | null
  hasPassword: boolean
  readonly?: boolean
  createdAt?: number
}

export type DataSourceOnedrive = {
  id: string
  type: "onedrive"
  name: string
  enabled: boolean
  clientId: string
  tenantId?: string | null
  displayName?: string | null
  email?: string | null
  rootPath?: string | null
  hasRefreshToken: boolean
  readonly?: boolean
  refreshToken?: string
  accessTokenExpiresAt?: number
  createdAt?: number
}

export type DataSourceGdrive = {
  id: string
  type: "gdrive"
  name: string
  enabled: boolean
  clientId: string
  accountId?: string | null
  displayName?: string | null
  email?: string | null
  rootPath?: string | null
  rootFolderId?: string | null
  hasRefreshToken: boolean
  readonly?: boolean
  createdAt?: number
}

export type DataSourceDropbox = {
  id: string
  type: "dropbox"
  name: string
  enabled: boolean
  clientId: string
  accountId?: string | null
  displayName?: string | null
  email?: string | null
  rootPath?: string | null
  hasRefreshToken: boolean
  readonly?: boolean
  createdAt?: number
}

export type DataSourceS3 = {
  id: string
  type: "s3"
  name: string
  enabled: boolean
  endpoint: string
  bucket: string
  region: string
  rootPath?: string | null
  virtualHostStyle: boolean
  hasCredentials: boolean
  readonly?: boolean
  createdAt?: number
}

export type DataSource =
  | DataSourceWebdav
  | DataSourceOnedrive
  | DataSourceGdrive
  | DataSourceDropbox
  | DataSourceS3

export type DataSourceType = DataSource["type"]

export type DataSourceConnectionTestResult = {
  ok: boolean
  message: string
  errorKind?: string
}
