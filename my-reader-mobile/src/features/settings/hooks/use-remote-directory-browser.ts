import { useEffect, useMemo, useState } from "react"

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import { openRemoteExistingLibrary } from "@/src/domain/library/hooks/library-actions"
import {
  isMissingMetadataDbError,
  normalizeCurrentPath,
} from "@/src/domain/library/remote-library"
import type { DataSource } from "@/src/domain/types"
import type { Library } from "@my-reader/tools/types/library"
import {
  listRemoteDirectories,
  type RemoteDirectoryEntry,
} from "@/src/services/core/remote"
import { useAppStore } from "@/src/store/app-store"

export type UseRemoteDirectoryBrowserOpts = {
  dataSourceId: string | undefined
  currentPathParam: string | undefined
  libraryAction: RemoteLibraryAction
  onLibraryOpened: (library: Library) => void
  sourceType: "webdav" | "onedrive"
}

export type RemoteLibraryAction = "create" | "open"

export type RemoteDirectoryBrowserState = {
  /** No matching data source found in the store. */
  notFound: boolean
  /** Data source found but credentials could not be resolved. */
  resolveFailed: boolean
  candidate: DataSource | null
  candidateId: string | undefined
  entries: RemoteDirectoryEntry[]
  loading: boolean
  error: string | null
  saving: boolean
  currentPath: string
  retry: () => void
  choosePath: (
    sourcePath: string,
    errorMessages: RemoteDirectoryBrowserErrorMessages,
  ) => Promise<void>
  chooseCurrentPath: (
    errorMessages: RemoteDirectoryBrowserErrorMessages,
  ) => Promise<void>
}

type RemoteDirectoryBrowserErrorMessages = {
  notValidTitle: string
  notValidMessage: string
  duplicateTitle: string
  duplicateMessage: string
  generic: string
}

function isCredentialFailure(
  message: string,
  sourceType: "webdav" | "onedrive",
): boolean {
  return sourceType === "webdav"
    ? /PASSWORD_REQUIRED|WEBDAV_(?:UNAUTHORIZED|FORBIDDEN)|\b40[13]\b/i.test(
        message,
      )
    : /REFRESH_TOKEN_REQUIRED|ONEDRIVE_UNAUTHORIZED|INVALID_GRANT|AUTH_ERROR/i.test(
        message,
      )
}

export function useRemoteDirectoryBrowser({
  dataSourceId,
  currentPathParam,
  libraryAction,
  onLibraryOpened,
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
  const [reloadIndex, setReloadIndex] = useState(0)

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
          if (isCredentialFailure(message, sourceType)) {
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
  }, [candidate, currentPath, reloadIndex])

  async function choosePath(
    selectedPath: string,
    errorMessages: RemoteDirectoryBrowserErrorMessages,
  ) {
    if (!candidate) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      const sourcePath = selectedPath || "/"
      if (libraryAction !== "open") return
      const library = await openRemoteExistingLibrary(candidate, sourcePath)
      onLibraryOpened(library)
    } catch (caught) {
      const message = String(caught)
      if (
        isMissingMetadataDbError(caught) ||
        message.includes("LIBRARY_TYPE_NOT_RECOGNIZED") ||
        message.includes("MYREADER_LIBRARY_MARKER_NOT_FOUND")
      ) {
        showAlertWithStatusBarRestore(
          errorMessages.notValidTitle,
          errorMessages.notValidMessage,
        )
        return
      }
      if (message.includes("LIBRARY_ALREADY_EXISTS")) {
        showAlertWithStatusBarRestore(
          errorMessages.duplicateTitle,
          errorMessages.duplicateMessage,
        )
        return
      }
      setError(errorMessages.generic)
    } finally {
      setSaving(false)
    }
  }

  function chooseCurrentPath(
    errorMessages: RemoteDirectoryBrowserErrorMessages,
  ) {
    return choosePath(currentPath, errorMessages)
  }

  return {
    notFound: candidate === null,
    resolveFailed,
    candidate,
    candidateId: candidate?.id,
    entries,
    loading,
    error,
    saving,
    currentPath,
    retry: () => setReloadIndex((value) => value + 1),
    choosePath,
    chooseCurrentPath,
  }
}
