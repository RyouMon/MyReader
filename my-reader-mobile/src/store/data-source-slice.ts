import type { DataSource } from "../data/types";

import type { AppState, AppStateSlice } from "./app-store.types";
import { BUILT_IN_LOCAL_SOURCE, BUILT_IN_LOCAL_SOURCE_ID, mergeDataSources, persistableDataSources } from "./app-store.constants";

type DataSourceSlice = Pick<AppState, "dataSources" | "addDataSource" | "removeDataSource">;

export const createDataSourceSlice: AppStateSlice<DataSourceSlice> = (set, get) => ({
  dataSources: [BUILT_IN_LOCAL_SOURCE],
  async addDataSource(dataSource: DataSource) {
    set((state) => ({
      dataSources: mergeDataSources([...persistableDataSources(state.dataSources), dataSource]),
      error: null,
    }));
  },
  async removeDataSource(id: string) {
    const state = get();

    if (id === BUILT_IN_LOCAL_SOURCE_ID) {
      throw new Error("内置手机数据源不能删除");
    }

    if (state.libraries.some((library) => library.dataSourceId === id)) {
      throw new Error("请先移除使用该数据源的书库");
    }

    set({
      dataSources: mergeDataSources(
        persistableDataSources(state.dataSources).filter((source) => source.id !== id)
      ),
      error: null,
    });
  },
});
