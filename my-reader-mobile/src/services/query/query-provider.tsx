import AsyncStorage from "@react-native-async-storage/async-storage"
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import type { ComponentProps } from "react"
import { queryClient } from "./query-client"

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "myreader-query-cache",
})

export function QueryProvider({
  children,
}: Pick<ComponentProps<typeof PersistQueryClientProvider>, "children">) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 7 * 24 * 60 * 60 * 1000 }}
      // A process can exit after Core commits but before the throttled cache
      // write. Revalidate restored queries before allowing them to fetch.
      onSuccess={() => queryClient.invalidateQueries({ refetchType: "none" })}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
