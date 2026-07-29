import { router } from "expo-router"
import { useEffect, useMemo, useState } from "react"

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import { addRemoteLibraryFromSource } from "@/src/domain/library/hooks/library-actions"
import {
  isMissingMetadataDbError,
  normalizeCurrentPath,
} from "@/src/domain/library/remote-library"
import { notifyLibraryAdded } from "@/src/domain/notifications/library-notifications"
import {
  listRemoteDirectories,
  type RemoteDirectoryEntry,
} from "@/src/services/core/remote"
import { useAppStore } from "@/src/store/app-store"

export type UseRemoteDirectoryBrowserOpts = {
  dataSourceId: string | undefined
  currentPathParam: string | undefined
  sourceType: "webdav" | "onedrive"
}

export type RemoteDirectoryBrowserState = {
  /** No matching data source found in the store. */
  notFound: boolean
  /** Data source found but credentials could not be resolved. */
  resolveFailed: boolean
  candidateId: string | undefined
  entries: RemoteDirectoryEntry[]
  loading: boolean
  error: string | null
  saving: boolean
  currentPath: string
  chooseCurrentPath: (errorMessages: {
    notValidTitle: string
    notValidMessage: string
    duplicateTitle: string
    duplicateMessage: string
    generic: string
  }) => Promise<void>
}

export function useRemoteDirectoryBrowser({
  dataSourceId,
  currentPathParam,
  sourceType,
}: UseRemoteDirectoryBrowserOpts): RemoteDirectoryBrowserState {
  const currentPath = useMemo(
    () => normalizeCurrentPath(currentPathParam),
    [currentPathParam],
  )
  const dataSources = useAppStore((state) => state.dataSources)
  const candidate = useMemo(
    () =>
      dataSources.find(
        (item) => item.id === dataSourceId && item.type === sourceType,
      ) ?? null,
    [dataSourceId, dataSources, sourceType],
  )

  const [resolveFailed, setResolveFailed] = useState(false)
  const [entries, setEntries] = useState<RemoteDirectoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true

    async function load() {
      if (!candidate) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      setResolveFailed(false)

      try {
        const items = await listRemoteDirectories(
          candidate,
          currentPath === "/" ? "" : currentPath,
        )
        if (active) {
          setEntries(items.filter((item) => item.isDirectory))
        }
      } catch (caught) {
        if (active) {
          const message =
            caught instanceof Error
              ? caught.message
              : "Failed to read directory"
          if (
            message.includes("PASSWORD_REQUIRED") ||
            message.includes("REFRESH_TOKEN_REQUIRED")
          ) {
            setResolveFailed(true)
          } else {
            setError(message)
          }
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [candidate, currentPath])

  async function chooseCurrentPath(errorMessages: {
    notValidTitle: string
    notValidMessage: string
    duplicateTitle: string
    duplicateMessage: string
    generic: string
  }) {
    if (!candidate) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      const library = await addRemoteLibraryFromSource(
        candidate,
        currentPath || "/",
      )
      router.dismissTo("/settings")
      notifyLibraryAdded(library.name)
    } catch (caught) {
      if (isMissingMetadataDbError(caught)) {
        showAlertWithStatusBarRestore(
          errorMessages.notValidTitle,
          errorMessages.notValidMessage,
        )
        return
      }
      if (String(caught).includes("LIBRARY_ALREADY_EXISTS")) {
        showAlertWithStatusBarRestore(
          errorMessages.duplicateTitle,
          errorMessages.duplicateMessage,
        )
        return
      }
      setError(caught instanceof Error ? caught.message : errorMessages.generic)
    } finally {
      setSaving(false)
    }
  }

  return {
    notFound: candidate === null,
    resolveFailed,
    candidateId: candidate?.id,
    entries,
    loading,
    error,
    saving,
    currentPath,
    chooseCurrentPath,
  }
}
