import type { DataSource } from "@my-reader/tools/types/data-source";

import type { AppStateSlice } from "./app-store.types";

type DataSourceSlice = {
  dataSources: DataSource[];
  loading: boolean;
  hydrated: boolean;
  error: string | null;

  // Pure setters
  setDataSources: (dataSources: DataSource[]) => void;
  setLoading: (loading: boolean) => void;
  setHydrated: (value: boolean) => void;
  setError: (error: string | null) => void;
  upsertDataSource: (ds: DataSource) => void;
  removeDataSourceById: (id: string) => void;
  clearError: () => void;
};

export const createDataSourceSlice: AppStateSlice<DataSourceSlice> = (set) =>
  ({
    dataSources: [],
    loading: true,
    hydrated: false,
    error: null,

    setDataSources(dataSources: DataSource[]) {
      set({ dataSources });
    },
    setLoading(loading: boolean) {
      set({ loading });
    },
    setHydrated(value: boolean) {
      set({ hydrated: value });
    },
    setError(error: string | null) {
      set({ error });
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
    clearError() {
      set({ error: null });
    },
  });