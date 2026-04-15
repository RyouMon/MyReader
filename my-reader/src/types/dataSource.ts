export type DataSource =
  | {
      id: string
      name: string
      enabled: boolean
      kind: "local"
      rootPath?: string
      readonly?: boolean
    }
  | {
      id: string
      name: string
      enabled: boolean
      kind: "webdav"
      endpoint: string
      username: string
      rootPath?: string | null
      hasPassword: boolean
      readonly?: boolean
    }

export interface NewLocalDataSourceInput {
  name: string
  rootPath: string
}

export interface NewWebdavDataSourceInput {
  name: string
  endpoint: string
  username: string
  password: string
  rootPath?: string
}
