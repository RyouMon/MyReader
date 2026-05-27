import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { DataSource, DataSourceWebdav, DataSourceConnectionTestResult } from "@my-reader/tools/types/data-source"
import { api } from "@/lib/tauri-api"

export const dataSourceKeys = {
  all: ["dataSources"] as const,
}

function mapDataSourceFromBackendJson(raw: Record<string, unknown>): DataSource | null {
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
      readonly: raw.readonly as boolean | undefined,
      createdAt: raw.createdAt as number | undefined,
    }
  }

  if (kind === "onedrive") {
    return {
      ...base,
      type: "onedrive",
      clientId: raw.clientId as string,
      displayName: raw.displayName as string | null | undefined,
      email: raw.email as string | null | undefined,
      rootPath: raw.rootPath as string | null | undefined,
      hasRefreshToken: Boolean(raw.hasRefreshToken),
      readonly: raw.readonly as boolean | undefined,
      createdAt: raw.createdAt as number | undefined,
    }
  }

  return null
}

async function fetchDataSources(): Promise<DataSource[]> {
  const rows = await api.listDataSources()
  return rows.map(mapDataSourceFromBackendJson).filter((d): d is DataSource => d !== null)
}

export function useDataSourcesQuery() {
  return useQuery({
    queryKey: dataSourceKeys.all,
    queryFn: fetchDataSources,
  })
}

export function useDataSourceMutations() {
  const queryClient = useQueryClient()

  const createDataSource = useMutation({
    mutationFn: async (input: DataSourceWebdav & { password?: string }) => {
      const raw = await api.addWebdavDataSource({
        name: input.name,
        endpoint: input.endpoint,
        username: input.username,
        password: input.password ?? "",
        rootPath: input.rootPath ?? null,
      })
      return mapDataSourceFromBackendJson(raw) as DataSource
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dataSourceKeys.all })
    },
  })

  const deleteDataSource = useMutation({
    mutationFn: async (id: string) => {
      await api.removeDataSource(id)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dataSourceKeys.all })
    },
  })

  const testConnection = useMutation({
    mutationFn: async (input: DataSourceWebdav & { password?: string }): Promise<DataSourceConnectionTestResult> => {
      try {
        await api.testWebdavConnection({
          endpoint: input.endpoint,
          username: input.username,
          password: input.password ?? "",
          rootPath: input.rootPath ?? null,
        })
        return { ok: true, message: "OK" }
      } catch (error) {
        const raw =
          typeof error === "object" && error !== null && "message" in error
            ? String((error as Record<string, unknown>).message)
            : String(error)
        return { ok: false, message: raw }
      }
    },
  })

  return {
    createDataSource: createDataSource.mutateAsync,
    deleteDataSource: deleteDataSource.mutateAsync,
    testConnection: testConnection.mutateAsync,
    isCreating: createDataSource.isPending,
    isDeleting: deleteDataSource.isPending,
    isTesting: testConnection.isPending,
  }
}