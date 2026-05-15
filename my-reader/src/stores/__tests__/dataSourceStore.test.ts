import { mockIPC } from "@tauri-apps/api/mocks"
import { beforeEach, describe, expect, it } from "vitest"
import { useDataSourceStore } from "../dataSourceStore"

/**
 * Build a WebDAV row payload that matches backend DTO shape.
 */
function buildWebdavRow(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    id: "source-1",
    name: "My WebDAV",
    enabled: true,
    kind: "webdav",
    endpoint: "https://example.com/dav",
    username: "reader",
    hasPassword: true,
    rootPath: "/books",
    ...overrides,
  }
}

/**
 * Reset store to its initial state before each scenario.
 */
function resetStoreState(): void {
  ;(globalThis as typeof globalThis & { isTauri?: boolean }).isTauri = true
  useDataSourceStore.setState({
    dataSources: [],
    loading: true,
    hydrated: false,
  })
}

describe("useDataSourceStore", () => {
  beforeEach(() => {
    resetStoreState()
  })

  it("hydrateFromBackend 仅保留 WebDAV 数据源并更新状态", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_data_sources") {
        return [
          buildWebdavRow(),
          { id: "local-1", kind: "local", name: "Local", enabled: true },
        ]
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    await useDataSourceStore.getState().hydrateFromBackend()
    const state = useDataSourceStore.getState()

    expect(state.hydrated).toBe(true)
    expect(state.loading).toBe(false)
    expect(state.dataSources).toHaveLength(1)
    expect(state.dataSources[0]).toMatchObject({
      id: "source-1",
      type: "webdav",
      endpoint: "https://example.com/dav",
    })
  })

  it("createDataSource 调用新增命令后会刷新列表", async () => {
    const commandCalls: string[] = []
    mockIPC((cmd) => {
      commandCalls.push(cmd)
      if (cmd === "add_webdav_data_source") {
        return buildWebdavRow({ id: "source-created", name: "Created" })
      }
      if (cmd === "list_data_sources") {
        return [buildWebdavRow({ id: "source-created", name: "Created" })]
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    const created = await useDataSourceStore.getState().createDataSource({
      id: "client-temp",
      type: "webdav",
      name: "Created",
      endpoint: "https://example.com/dav",
      username: "reader",
      password: "secret",
      rootPath: "/books",
      enabled: true,
    })

    expect(created.id).toBe("source-created")
    expect(useDataSourceStore.getState().dataSources).toHaveLength(1)
    expect(commandCalls).toEqual([
      "add_webdav_data_source",
      "list_data_sources",
    ])
  })

  it("deleteDataSource 会调用删除命令并同步列表", async () => {
    mockIPC((cmd) => {
      if (cmd === "remove_data_source") {
        return null
      }
      if (cmd === "list_data_sources") {
        return []
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    await useDataSourceStore.getState().deleteDataSource("source-1")

    expect(useDataSourceStore.getState().dataSources).toHaveLength(0)
  })

  it("testDataSourceConnection 透传连接参数到后端命令", async () => {
    const seenInputs: unknown[] = []
    mockIPC((cmd, args) => {
      if (cmd === "test_webdav_connection") {
        if (
          args &&
          typeof args === "object" &&
          !Array.isArray(args) &&
          "input" in args
        ) {
          seenInputs.push(args.input)
        }
        return null
      }
      throw new Error(`unexpected command: ${cmd}`)
    })

    const result = await useDataSourceStore
      .getState()
      .testDataSourceConnection({
        id: "source-1",
        type: "webdav",
        name: "My WebDAV",
        endpoint: "https://example.com/dav",
        username: "reader",
        password: "secret",
        rootPath: "/books",
        enabled: true,
      })

    expect(result).toEqual({ ok: true, message: "OK" })
    expect(seenInputs).toEqual([
      {
        endpoint: "https://example.com/dav",
        username: "reader",
        password: "secret",
        rootPath: "/books",
      },
    ])
  })
})
