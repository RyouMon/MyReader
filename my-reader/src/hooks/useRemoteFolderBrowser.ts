import { useEffect, useState } from "react"
import { errorMessage } from "@/lib/error-presentation"
import { api } from "@/lib/tauri-api"
import type { WebdavFolderEntry } from "@/lib/tauri-specta"

export function useRemoteFolderBrowser(
  dataSourceId: string,
  open: boolean,
  listFolders = api.remoteListFolders,
) {
  const [currentPath, setCurrentPath] = useState("/")
  const [folders, setFolders] = useState<WebdavFolderEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (open) setCurrentPath("/")
  }, [open, dataSourceId])

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setError(null)
    void listFolders(dataSourceId, currentPath)
      .then((entries) => {
        if (active) setFolders(entries)
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(errorMessage(caught))
          setFolders([])
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, dataSourceId, currentPath, listFolders, revision])

  return {
    currentPath,
    folders,
    loading,
    error,
    navigateTo: setCurrentPath,
    refresh: () => setRevision((value) => value + 1),
    createFolder: async (name: string) => {
      const folder = await api.remoteCreateFolder(
        dataSourceId,
        currentPath,
        name,
      )
      setFolders((previous) => [folder, ...previous])
      return folder
    },
  }
}
