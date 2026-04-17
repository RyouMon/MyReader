import { invoke, isTauri } from "@tauri-apps/api/core"
import type {
  DataSource,
  DataSourceStore,
} from "my-reader-tools/store/data-source"
import { create } from "zustand"

function isRuntimeAvailable(): boolean {
  return isTauri()
}

function mapDataSourceFromBackendJson(
  raw: Record<string, unknown>,
): DataSource {
  const kind = raw.kind as string
  const base = {
    id: raw.id as string,
    name: raw.name as string,
    enabled: Boolean(raw.enabled),
  }

  if (kind === "local") {
    return {
      ...base,
      type: "local",
      readonly: raw.readonly as boolean | undefined,
      rootPath: raw.rootPath as string | null | undefined,
      rootUri: raw.rootUri as string | null | undefined,
      createdAt: raw.createdAt as number | undefined,
    }
  }

  if (kind === "webdav") {
    return {
      ...base,
      type: "webdav",
      endpoint: raw.endpoint as string,
      username: raw.username as string,
      hasPassword: Boolean(raw.hasPassword),
      rootPath: raw.rootPath as string | null | undefined,
      password: raw.password as string | undefined,
      readonly: raw.readonly as boolean | undefined,
      createdAt: raw.createdAt as number | undefined,
    }
  }

  throw new Error(`未知的数据源 kind: ${String(kind)}`)
}

async function fetchDataSources(): Promise<DataSource[]> {
  const rows = await invoke<Record<string, unknown>[]>("list_data_sources")
  return rows.map((row) => mapDataSourceFromBackendJson(row))
}

async function createLocalDataSource(input: {
  name: string
  rootPath: string
}): Promise<DataSource> {
  const raw = await invoke<Record<string, unknown>>("add_local_data_source", {
    input,
  })
  return mapDataSourceFromBackendJson(raw)
}

async function createWebdavDataSource(input: {
  name: string
  endpoint: string
  username: string
  password: string
  rootPath?: string
}): Promise<DataSource> {
  const raw = await invoke<Record<string, unknown>>("add_webdav_data_source", {
    input,
  })
  return mapDataSourceFromBackendJson(raw)
}

async function removeDataSource(id: string): Promise<void> {
  await invoke("remove_data_source", { id })
}

async function testWebdavConnection(input: {
  endpoint: string
  username: string
  password: string
  rootPath?: string
}): Promise<void> {
  await invoke("test_webdav_connection", { input })
}

const BUILTIN_LOCAL_SOURCE: DataSource = {
  id: "builtin-local-storage",
  type: "local",
  name: "本地存储",
  enabled: true,
  readonly: true,
  rootPath: "当前设备本地文件系统",
}

function withBuiltinLocalSource(rows: DataSource[]): DataSource[] {
  const webdavRows = rows.filter((row) => row.type !== "local")
  return [BUILTIN_LOCAL_SOURCE, ...webdavRows]
}

export const useDataSourceStore = create<DataSourceStore>()((set, get) => ({
  dataSources: [],
  loading: true,
  hydrated: false,

  refreshDataSources: async (_id: string) => {
    if (!isRuntimeAvailable()) return
    const rows = await fetchDataSources()
    set({ dataSources: withBuiltinLocalSource(rows) })
  },

  hydrateFromBackend: async () => {
    if (!isRuntimeAvailable()) {
      set({ loading: false, hydrated: true })
      return
    }
    set({ loading: true })
    try {
      const rows = await fetchDataSources()
      set({ dataSources: withBuiltinLocalSource(rows) })
    } finally {
      set({ loading: false, hydrated: true })
    }
  },

  createDataSource: async (datasource: DataSource) => {
    if (!isRuntimeAvailable()) {
      throw new Error("当前环境不支持创建数据源")
    }
    let created: DataSource
    if (datasource.type === "local") {
      created = await createLocalDataSource({
        name: datasource.name,
        rootPath: datasource.rootPath ?? "",
      })
    } else {
      created = await createWebdavDataSource({
        name: datasource.name,
        endpoint: datasource.endpoint,
        username: datasource.username,
        password: datasource.password ?? "",
        rootPath: datasource.rootPath ?? undefined,
      })
    }
    await get().refreshDataSources(created.id)
    return created
  },

  updateDataSource: async () => {
    throw new Error("桌面端暂不支持修改数据源，请删除后重新添加。")
  },

  deleteDataSource: async (id) => {
    if (id === BUILTIN_LOCAL_SOURCE.id) return
    await removeDataSource(id)
    await get().refreshDataSources(id)
  },

  testDataSourceConnection: async (datasource: DataSource) => {
    if (datasource.type !== "webdav") {
      return
    }
    await testWebdavConnection({
      endpoint: datasource.endpoint,
      username: datasource.username,
      password: datasource.password ?? "",
      rootPath: datasource.rootPath ?? undefined,
    })
  },
}))

export function useDataSource() {
  return useDataSourceStore((s) => ({
    dataSources: s.dataSources,
    loading: s.loading,
    hydrated: s.hydrated,
    hydrateFromBackend: s.hydrateFromBackend,
    createDataSource: s.createDataSource,
    updateDataSource: s.updateDataSource,
    deleteDataSource: s.deleteDataSource,
    refreshDataSources: s.refreshDataSources,
    testDataSourceConnection: s.testDataSourceConnection,
  }))
}
