import type { DataSource } from "@my-reader/tools/types/data-source"

import type { AppStateSlice } from "./app-store.types"

export type DataSourceSlice = {
  dataSources: DataSource[]

  // Pure setters
  setDataSources: (dataSources: DataSource[]) => void
}

export const createDataSourceSlice: AppStateSlice<DataSourceSlice> = (set) => ({
  dataSources: [],

  setDataSources(dataSources: DataSource[]) {
    set({ dataSources })
  },
})
