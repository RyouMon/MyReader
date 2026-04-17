/**
 * 跨端数据源：单一 `DataSource` 模型与统一 Store 操作（增删改查、刷新、测试 WebDAV）。
 */

export type DataSourceLocal = {
  id: string
  type: "local"
  name: string
  enabled: boolean
  readonly?: boolean
  rootPath?: string | null
  rootUri?: string | null
  createdAt?: number
}

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
  password?: string
  createdAt?: number
}

export type DataSource = DataSourceLocal | DataSourceWebdav

/**
 * 数据源 Store
 */
export type DataSourceStore = {
  dataSources: DataSource[]
  loading: boolean
  hydrated: boolean
  /** 首次从后端或持久化装载列表 */
  hydrateFromBackend: () => Promise<void>
  /** 重新拉取列表（桌面 Tauri；移动端可为 no-op） */
  refreshDataSources: (id: string) => Promise<void>
  createDataSource: (datasource: DataSource) => Promise<DataSource>
  updateDataSource: (id: string, datasource: DataSource) => Promise<void>
  deleteDataSource: (id: string) => Promise<void>
  testDataSourceConnection: (datasource: DataSource) => Promise<void>
}
