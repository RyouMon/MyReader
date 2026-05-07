import { invoke, isTauri } from "@tauri-apps/api/core"
import type {
  DataSource,
  DataSourceConnectionTestResult,
  DataSourceStore,
} from "my-reader-tools/store/data-source"
import { create } from "zustand"

function isRuntimeAvailable(): boolean {
  return isTauri()
}

function mapDataSourceFromBackendJson(
  raw: Record<string, unknown>,
): DataSource | null {
  const kind = raw.kind as string
  const base = {
    id: raw.id as string,
    name: raw.name as string,
    enabled: Boolean(raw.enabled),
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

  if (kind === "local") {
    return null
  }

  throw new Error(`未知的数据源 kind: ${String(kind)}`)
}

async function fetchDataSources(): Promise<DataSource[]> {
  const rows = await invoke<Record<string, unknown>[]>("list_data_sources")
  return rows
    .map((row) => mapDataSourceFromBackendJson(row))
    .filter((row): row is DataSource => row !== null)
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
  return mapDataSourceFromBackendJson(raw) as DataSource
}

async function removeDataSource(id: string): Promise<void> {
  await invoke("remove_data_source", { id })
}

async function testWebdavConnection(input: {
  endpoint: string
  username: string
  password: string
  rootPath?: string
}): Promise<DataSourceConnectionTestResult> {
  try {
    await invoke("test_webdav_connection", { input })
    return { ok: true, message: "OK" }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export const useDataSourceStore = create<DataSourceStore>()((set, get) => ({
  dataSources: [],
  loading: true,
  hydrated: false,

  refreshDataSources: async (_id: string) => {
    if (!isRuntimeAvailable()) return
    const rows = await fetchDataSources()
    set({ dataSources: rows })
  },

  hydrateFromBackend: async () => {
    if (!isRuntimeAvailable()) {
      set({ loading: false, hydrated: true })
      return
    }
    set({ loading: true })
    try {
      const rows = await fetchDataSources()
      set({ dataSources: rows })
    } finally {
      set({ loading: false, hydrated: true })
    }
  },

  createDataSource: async (datasource: DataSource) => {
    if (!isRuntimeAvailable()) {
      throw new Error("当前环境不支持创建数据源")
    }
    const created = await createWebdavDataSource({
      name: datasource.name,
      endpoint: datasource.endpoint,
      username: datasource.username,
      password: datasource.password ?? "",
      rootPath: datasource.rootPath ?? undefined,
    })
    await get().refreshDataSources(created.id)
    return created
  },

  updateDataSource: async () => {
    throw new Error("桌面端暂不支持修改数据源，请删除后重新添加。")
  },

  deleteDataSource: async (id) => {
    await removeDataSource(id)
    await get().refreshDataSources(id)
  },

  testDataSourceConnection: async (datasource: DataSource) => {
    return await testWebdavConnection({
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
