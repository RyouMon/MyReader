import { useMemo } from "react";

import { useAppStore } from "./app-store";

export function useDataSourceStore() {
  const dataSources = useAppStore((state) => state.dataSources);
  const loading = useAppStore((state) => state.loading);
  const hydrated = useAppStore((state) => state.hydrated);
  const hydrateFromBackend = useAppStore((state) => state.hydrateFromBackend);
  const refreshDataSources = useAppStore((state) => state.refreshDataSources);
  const createDataSource = useAppStore((state) => state.createDataSource);
  const updateDataSource = useAppStore((state) => state.updateDataSource);
  const deleteDataSource = useAppStore((state) => state.deleteDataSource);
  const testDataSourceConnection = useAppStore((state) => state.testDataSourceConnection);

  return useMemo(
    () => ({
      dataSources,
      loading,
      hydrated,
      hydrateFromBackend,
      refreshDataSources,
      createDataSource,
      updateDataSource,
      deleteDataSource,
      testDataSourceConnection,
    }),
    [
      dataSources,
      loading,
      hydrated,
      hydrateFromBackend,
      refreshDataSources,
      createDataSource,
      updateDataSource,
      deleteDataSource,
      testDataSourceConnection,
    ]
  );
}
