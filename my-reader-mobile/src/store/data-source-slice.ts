import type { DataSource } from "@my-reader/tools/types/data-source";

import type { AppStateSlice } from "./app-store.types";

export type DataSourceSlice = {
  dataSources: DataSource[];

  // Pure setters
  setDataSources: (dataSources: DataSource[]) => void;
  upsertDataSource: (ds: DataSource) => void;
  removeDataSourceById: (id: string) => void;
};

export const createDataSourceSlice: AppStateSlice<DataSourceSlice> = (set) =>
  ({
    dataSources: [],

    setDataSources(dataSources: DataSource[]) {
      set({ dataSources });
    },
    upsertDataSource(ds: DataSource) {
      set((state) => ({
        dataSources: state.dataSources.some((d) => d.id === ds.id)
          ? state.dataSources.map((d) => d.id === ds.id ? ds : d)
          : [...state.dataSources, ds],
      }));
    },
    removeDataSourceById(id: string) {
      set((state) => ({
        dataSources: state.dataSources.filter((d) => d.id !== id),
      }));
    },
  });
