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

export type DataSource = DataSourceWebdav | DataSourceOnedrive

export type DataSourceType = DataSource["type"]

export type DataSourceConnectionTestResult = {
  ok: boolean
  message: string
}
