import { apiErrorKind } from "@/lib/api-error"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  DataSource,
  DataSourceOnedrive,
  DataSourceWebdav,
  DataSourceS3,
  DataSourceConnectionTestResult,
} from "@my-reader/tools/types/data-source"
import { api } from "@/lib/tauri-api"

export const dataSourceKeys = {
  all: ["dataSources"] as const,
}

function oauthFields(raw: Record<string, unknown>) {
  return {
    clientId: (raw.clientId ?? raw.client_id) as string,
    accountId: (raw.accountId ?? raw.account_id) as string | null | undefined,
    displayName: (raw.userName ?? raw.user_name ?? raw.displayName) as
      | string
      | null
      | undefined,
    email: (raw.userEmail ?? raw.user_email ?? raw.email) as
      | string
      | null
      | undefined,
    hasRefreshToken: Boolean(raw.hasRefreshToken ?? raw.has_refresh_token),
  }
}

function mapDataSourceFromBackendJson(
  raw: Record<string, unknown>,
): DataSource | null {
  const kind = raw.kind
  const base = {
    id: raw.id as string,
    name: raw.name as string,
    enabled: Boolean(raw.enabled),
    rootPath: (raw.rootPath ?? raw.root_path) as string | null | undefined,
    readonly: raw.readonly as boolean | undefined,
    createdAt: raw.createdAt as number | undefined,
  }
  switch (kind) {
    case "webdav":
      return {
        ...base,
        type: kind,
        endpoint: raw.endpoint as string,
        username: raw.username as string,
        hasPassword: Boolean(raw.hasPassword ?? raw.has_password),
      }
    case "onedrive":
      return {
        ...base,
        ...oauthFields(raw),
        type: kind,
        tenantId: (raw.tenantId ?? raw.tenant_id) as string | null | undefined,
      }
    case "gdrive":
      return {
        ...base,
        ...oauthFields(raw),
        type: kind,
        rootFolderId: (raw.rootFolderId ?? raw.root_folder_id) as
          | string
          | null
          | undefined,
      }
    case "dropbox":
      return { ...base, ...oauthFields(raw), type: kind }
    case "s3":
      return {
        ...base,
        type: kind,
        endpoint: raw.endpoint as string,
        bucket: raw.bucket as string,
        region: raw.region as string,
        virtualHostStyle: Boolean(
          raw.virtualHostStyle ?? raw.virtual_host_style,
        ),
        hasCredentials: Boolean(raw.hasCredentials ?? raw.has_credentials),
      }
    default:
      return null
  }
}

async function fetchDataSources(): Promise<DataSource[]> {
  const rows = await api.listDataSources()
  return rows
    .map(mapDataSourceFromBackendJson)
    .filter((d): d is DataSource => d !== null)
}

export type OAuthDataSourceInput = {
  type: "gdrive" | "dropbox"
  rootFolderId?: string | null
}

export type CreateDataSourceInput =
  | (DataSourceWebdav & { password?: string })
  | (DataSourceOnedrive & { refreshToken?: string })
  | OAuthDataSourceInput
  | (DataSourceS3 & {
      accessKeyId: string
      secretAccessKey: string
      sessionToken?: string
    })

export function useDataSourcesQuery() {
  return useQuery({
    queryKey: dataSourceKeys.all,
    queryFn: fetchDataSources,
  })
}

export function useDataSourceMutations() {
  const queryClient = useQueryClient()

  const createDataSource = useMutation({
    mutationFn: async (input: CreateDataSourceInput) => {
      if (input.type === "webdav") {
        const raw = await api.addWebdavDataSource({
          name: input.name,
          endpoint: input.endpoint,
          username: input.username,
          password: input.password ?? "",
          rootPath: input.rootPath ?? null,
        })
        return mapDataSourceFromBackendJson(raw) as DataSource
      }

      if (input.type === "gdrive" || input.type === "dropbox") {
        const raw = await api.connectCloudSource({
          provider: input.type,
          rootFolderId:
            input.type === "gdrive" ? (input.rootFolderId ?? null) : null,
        })
        return mapDataSourceFromBackendJson(raw) as DataSource
      }
      if (input.type === "s3") {
        const raw = await api.addS3Source({
          name: input.name,
          endpoint: input.endpoint,
          bucket: input.bucket,
          region: input.region,
          rootPath: input.rootPath ?? null,
          virtualHostStyle: input.virtualHostStyle,
          accessKeyId: input.accessKeyId,
          secretAccessKey: input.secretAccessKey,
          sessionToken: input.sessionToken ?? null,
        })
        return mapDataSourceFromBackendJson(raw) as DataSource
      }

      if (input.type === "onedrive") {
        const raw = await api.addOnedriveDataSource({
          name: input.name,
          clientId: input.clientId || null,
          tenantId: input.tenantId ?? null,
          rootPath: input.rootPath ?? null,
          userName: input.displayName ?? null,
          userEmail: input.email ?? null,
          refreshToken: input.refreshToken ?? null,
        })
        return mapDataSourceFromBackendJson(raw) as DataSource
      }

      throw new Error(`Unsupported data source type: ${input.type}`)
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
    mutationFn: async (
      input: DataSourceWebdav & { password?: string },
    ): Promise<DataSourceConnectionTestResult> => {
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
        return { ok: false, message: raw, errorKind: apiErrorKind(error) }
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
