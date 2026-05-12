import { isTauri } from "@tauri-apps/api/core"
import { api } from "@/lib/tauri-api"
import { useCallback } from "react"

export interface SyncBackendInfo {
  id: string
  name: string
  enabled: boolean
  kind: "localDirect" | "webdav" | string
  summary: string
  isLocalDirect: boolean
}

export interface FileStateRow {
  path: string
  localState: "remote_only" | "present" | "local_only" | "dirty_push" | string
  localBlake3: string | null
  localSize: number | null
  localMtime: number | null
}

export interface DbSyncReport {
  pushed: number
  pulled: number
}

interface BackendFileStateRow {
  path: string
  localState: string
  localBlake3: string | null
  localSize: number | null
  localMtime: number | null
}

function normalizeRow(raw: BackendFileStateRow): FileStateRow {
  return {
    path: raw.path,
    localState: raw.localState,
    localBlake3: raw.localBlake3,
    localSize: raw.localSize,
    localMtime: raw.localMtime,
  }
}

function assertTauri(): void {
  if (!isTauri()) {
    throw new Error("当前环境不支持同步操作（仅桌面 Tauri）")
  }
}

/**
 * 桌面同步命令的 React hook 封装；供设置页的同步面板与书库视图共享。
 */
export function useSyncActions() {
  const listBackends = useCallback(async (): Promise<SyncBackendInfo[]> => {
    assertTauri()
    return await api.syncListBackends()
  }, [])

  const testBackend = useCallback(async (id: string): Promise<void> => {
    assertTauri()
    await api.syncTestBackend(id)
  }, [])

  const listFileStates = useCallback(
    async (libraryId: string, filter?: string): Promise<FileStateRow[]> => {
      assertTauri()
      const rows = await api.syncListFileStates(libraryId, filter ?? null)
      return rows.map(normalizeRow)
    },
    [],
  )

  const downloadFile = useCallback(
    async (
      libraryId: string,
      dataSourceId: string,
      relativePath: string,
    ): Promise<void> => {
      assertTauri()
      await api.syncDownloadFile(libraryId, dataSourceId, relativePath)
    },
    [],
  )

  const evictLocal = useCallback(
    async (libraryId: string, relativePath: string): Promise<void> => {
      assertTauri()
      await api.syncEvictLocalFile(libraryId, relativePath)
    },
    [],
  )

  const deleteEverywhere = useCallback(
    async (
      libraryId: string,
      dataSourceId: string,
      relativePath: string,
    ): Promise<void> => {
      assertTauri()
      await api.syncDeleteFileEverywhere(libraryId, dataSourceId, relativePath)
    },
    [],
  )

  const syncDbNow = useCallback(
    async (libraryId: string, dataSourceId: string): Promise<DbSyncReport> => {
      assertTauri()
      return await api.syncDbNow(libraryId, dataSourceId)
    },
    [],
  )

  const syncDbForLibrary = useCallback(
    async (libraryId: string): Promise<DbSyncReport> => {
      assertTauri()
      return await api.syncDbForLibrary(libraryId)
    },
    [],
  )

  return {
    listBackends,
    testBackend,
    listFileStates,
    downloadFile,
    evictLocal,
    deleteEverywhere,
    syncDbNow,
    syncDbForLibrary,
  }
}
