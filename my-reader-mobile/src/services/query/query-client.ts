import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "myreader-query-cache",
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
    },
  },
});

const [, persistPromise] = persistQueryClient({
  queryClient,
  persister: asyncStoragePersister,
  maxAge: 7 * 24 * 60 * 60 * 1000,
});
persistPromise.catch((err: unknown) => {
  console.warn("[query-persist] failed to persist query client:", err);
});
