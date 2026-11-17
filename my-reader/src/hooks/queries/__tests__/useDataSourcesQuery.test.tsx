import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/tauri-api"
import type { DataSourceDto } from "@/lib/tauri-specta"
import {
  dataSourceKeys,
  useDataSourceMutations,
  useDataSourcesQuery,
} from "../useDataSourcesQuery"

vi.mock("@/lib/tauri-api", () => ({
  api: {
    listDataSources: vi.fn(),
    connectCloudSource: vi.fn(),
    addS3Source: vi.fn(),
    removeDataSource: vi.fn(),
  },
}))

function fixture() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}
function raw(kind: "gdrive" | "dropbox" | "s3"): DataSourceDto {
  return {
    id: `${kind}-1`,
    kind,
    name: "Reader",
    enabled: true,
    root_path: "/Books",
    client_id: "client",
    account_id: "account",
    user_name: "Reader Account",
    user_email: "reader@example.com",
    has_refresh_token: true,
    root_folder_id: "folder",
    endpoint: "https://storage.example",
    bucket: "books",
    region: "us-east-1",
    virtual_host_style: true,
    has_credentials: true,
  }
}

describe("cloud source queries", () => {
  beforeEach(() => vi.resetAllMocks())

  it("normalizes provider account fields from IPC and omits unsupported source kinds", async () => {
    vi.mocked(api.listDataSources).mockResolvedValue([
      raw("gdrive"),
      raw("dropbox"),
      raw("s3"),
      { ...raw("gdrive"), kind: "future" } as unknown as DataSourceDto,
    ])
    const { wrapper } = fixture()
    const { result } = renderHook(useDataSourcesQuery, { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(3)
    expect(result.current.data?.[0]).toMatchObject({
      type: "gdrive",
      clientId: "client",
      accountId: "account",
      displayName: "Reader Account",
      email: "reader@example.com",
      hasRefreshToken: true,
      rootFolderId: "folder",
      rootPath: "/Books",
    })
    expect(result.current.data?.[1]).toMatchObject({
      type: "dropbox",
      email: "reader@example.com",
    })
    expect(result.current.data?.[2]).toMatchObject({
      type: "s3",
      endpoint: "https://storage.example",
      bucket: "books",
      region: "us-east-1",
      hasCredentials: true,
      virtualHostStyle: true,
    })
  })

  it.each([
    "gdrive",
    "dropbox",
  ] as const)("creates %s with application-owned OAuth configuration and invalidates the source list", async (type) => {
    vi.mocked(api.connectCloudSource).mockResolvedValue(raw(type))
    const { client, wrapper } = fixture()
    const invalidate = vi.spyOn(client, "invalidateQueries")
    const { result } = renderHook(useDataSourceMutations, { wrapper })
    await act(async () => {
      await expect(
        result.current.createDataSource({ type, rootFolderId: "folder" }),
      ).resolves.toMatchObject({
        id: `${type}-1`,
        type,
        email: "reader@example.com",
      })
    })
    expect(api.connectCloudSource).toHaveBeenCalledWith({
      provider: type,
      rootFolderId: type === "gdrive" ? "folder" : null,
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: dataSourceKeys.all })
  })

  it("passes S3 credentials only to the native mutation and maps its safe result", async () => {
    vi.mocked(api.addS3Source).mockResolvedValue(raw("s3"))
    const { wrapper } = fixture()
    const { result } = renderHook(useDataSourceMutations, { wrapper })
    await act(async () => {
      const saved = await result.current.createDataSource({
        id: "",
        type: "s3",
        name: "Archive",
        enabled: true,
        endpoint: "https://storage.example",
        bucket: "books",
        region: "us-east-1",
        rootPath: "/Books",
        virtualHostStyle: true,
        hasCredentials: true,
        accessKeyId: "key",
        secretAccessKey: " secret ",
        sessionToken: "session",
      })
      expect(saved).not.toHaveProperty("secretAccessKey")
      expect(saved).toMatchObject({ type: "s3", bucket: "books" })
    })
    expect(api.addS3Source).toHaveBeenCalledWith({
      name: "Archive",
      endpoint: "https://storage.example",
      bucket: "books",
      region: "us-east-1",
      rootPath: "/Books",
      virtualHostStyle: true,
      accessKeyId: "key",
      secretAccessKey: " secret ",
      sessionToken: "session",
    })
  })

  it("preserves rejected mutations and refreshes the list only after successful removal", async () => {
    const error = new Error("access denied")
    vi.mocked(api.connectCloudSource).mockRejectedValue(error)
    const { client, wrapper } = fixture()
    const invalidate = vi.spyOn(client, "invalidateQueries")
    const { result } = renderHook(useDataSourceMutations, { wrapper })
    await act(async () =>
      expect(result.current.createDataSource({ type: "gdrive" })).rejects.toBe(
        error,
      ),
    )
    expect(invalidate).not.toHaveBeenCalled()
    vi.mocked(api.removeDataSource).mockResolvedValue(null)
    await act(async () => result.current.deleteDataSource("gdrive-1"))
    expect(api.removeDataSource).toHaveBeenCalledWith("gdrive-1")
    expect(invalidate).toHaveBeenCalledWith({ queryKey: dataSourceKeys.all })
  })
})
