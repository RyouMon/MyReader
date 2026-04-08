import { useMemo } from "react";

import { useAppStore } from "./app-store";

export function useDataSourceStore() {
  const dataSources = useAppStore((state) => state.dataSources);
  const addDataSource = useAppStore((state) => state.addDataSource);
  const removeDataSource = useAppStore((state) => state.removeDataSource);

  return useMemo(
    () => ({
      dataSources,
      addDataSource,
      removeDataSource,
    }),
    [dataSources, addDataSource, removeDataSource]
  );
}
