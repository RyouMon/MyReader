import { invoke, isTauri } from "@tauri-apps/api/core"
import { create } from "zustand"

import type {
  DataSource,
  NewLocalDataSourceInput,
  NewWebdavDataSourceInput,
} from "@/types/dataSource"

const BUILTIN_LOCAL_SOURCE: DataSource = {
  id: "builtin-local-storage",
  kind: "local",
  name: "本地存储",
  enabled: true,
  readonly: true,
  rootPath: "当前设备本地文件系统",
}

function withBuiltinLocalSource(rows: DataSource[]): DataSource[] {
  const webdavRows = rows.filter((row) => row.kind !== "local")
  return [BUILTIN_LOCAL_SOURCE, ...webdavRows]
}

interface DataSourceStoreState {
  dataSources: DataSource[]
  loading: boolean
  hydrated: boolean
  hydrateFromBackend: () => Promise<void>
  refreshDataSources: () => Promise<void>
  addLocalDataSource: (input: NewLocalDataSourceInput) => Promise<DataSource>
  addWebdavDataSource: (input: NewWebdavDataSourceInput) => Promise<DataSource>
  removeDataSource: (id: string) => Promise<void>
}

export const useDataSourceStore = create<DataSourceStoreState>()(
  (set, get) => ({
    dataSources: [],
    loading: true,
    hydrated: false,

    refreshDataSources: async () => {
      if (!isTauri()) return
      const rows = await invoke<DataSource[]>("list_data_sources")
      set({ dataSources: withBuiltinLocalSource(rows) })
    },

    hydrateFromBackend: async () => {
      if (!isTauri()) {
        set({ loading: false, hydrated: true })
        return
      }
      set({ loading: true })
      try {
        const rows = await invoke<DataSource[]>("list_data_sources")
        set({ dataSources: withBuiltinLocalSource(rows) })
      } finally {
        set({ loading: false, hydrated: true })
      }
    },

    addLocalDataSource: async (input) => {
      const created = await invoke<DataSource>("add_local_data_source", {
        input,
      })
      await get().refreshDataSources()
      return created
    },

    addWebdavDataSource: async (input) => {
      const created = await invoke<DataSource>("add_webdav_data_source", {
        input,
      })
      await get().refreshDataSources()
      return created
    },

    removeDataSource: async (id) => {
      if (id === BUILTIN_LOCAL_SOURCE.id) return
      await invoke("remove_data_source", { id })
      await get().refreshDataSources()
    },
  }),
)

/**
 * 数据源状态钩子；封装设置页所需的列表与增删行为。
 */
export function useDataSource() {
  return useDataSourceStore((s) => ({
    dataSources: s.dataSources,
    loading: s.loading,
    addLocalDataSource: s.addLocalDataSource,
    addWebdavDataSource: s.addWebdavDataSource,
    removeDataSource: s.removeDataSource,
    refreshDataSources: s.refreshDataSources,
  }))
}
