/**
 * 跨端数据源：统一 Store 中的类型为已配置连接（当前为 WebDAV）。
 * 本机存储仅在各端 UI 中静态展示，不写入此模型。
 */

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

export type DataSource = DataSourceWebdav

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
