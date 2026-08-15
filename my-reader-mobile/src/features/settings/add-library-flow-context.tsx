import type { Library } from "@my-reader/tools/types/library"
import { router } from "expo-router"
import type { PropsWithChildren } from "react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import type { PickedLocalLibrary } from "@/src/domain/library/local-library-picker"
import { switchActiveLibrary } from "@/src/domain/library/hooks/library-actions"
import { promptLibraryAddedAfterNavigation } from "@/src/domain/notifications/library-notifications"
import {
  deleteStagedBookImport,
  type StagedBookImport,
} from "@/src/services/fs/staged-book-import"

type AddLibraryFlowValue = {
  dismiss: () => void
  finishAddingLibrary: (library: Pick<Library, "id" | "name">) => void
  localFolder: PickedLocalLibrary | null
  setLocalFolder: (folder: PickedLocalLibrary | null) => void
  pendingImport: StagedBookImport | null
  setPendingImport: (pendingImport: StagedBookImport) => void
  takePendingImport: () => StagedBookImport | null
}

const AddLibraryFlowContext = createContext<AddLibraryFlowValue>({
  dismiss: () => undefined,
  finishAddingLibrary: () => undefined,
  localFolder: null,
  setLocalFolder: () => undefined,
  pendingImport: null,
  setPendingImport: () => undefined,
  takePendingImport: () => null,
})

export function AddLibraryFlowProvider({
  children,
  onDismiss,
}: PropsWithChildren<{ onDismiss: () => void }>) {
  const [localFolder, setLocalFolder] = useState<PickedLocalLibrary | null>(
    null,
  )
  const [pendingImport, setPendingImportState] =
    useState<StagedBookImport | null>(null)
  const pendingImportRef = useRef<StagedBookImport | null>(null)

  const setPendingImport = useCallback((next: StagedBookImport) => {
    const previous = pendingImportRef.current
    if (previous && previous.uri !== next.uri) {
      deleteStagedBookImport(previous.uri)
    }
    pendingImportRef.current = next
    setPendingImportState(next)
  }, [])

  const takePendingImport = useCallback(() => {
    const pending = pendingImportRef.current
    pendingImportRef.current = null
    setPendingImportState(null)
    return pending
  }, [])

  const finishAddingLibrary = useCallback(
    (library: Pick<Library, "id" | "name">) => {
      const actions = {
        onStay: () => undefined,
        onSwitch: () => {
          void switchActiveLibrary(library.id).then(() => {
            router.replace("/library")
          })
        },
      }
      router.dismissTo("/settings")
      promptLibraryAddedAfterNavigation(library.name, actions)
    },
    [],
  )

  useEffect(
    () => () => {
      const pending = pendingImportRef.current
      if (pending) deleteStagedBookImport(pending.uri)
    },
    [],
  )

  const value = useMemo(
    () => ({
      dismiss: onDismiss,
      finishAddingLibrary,
      localFolder,
      setLocalFolder,
      pendingImport,
      setPendingImport,
      takePendingImport,
    }),
    [
      localFolder,
      onDismiss,
      finishAddingLibrary,
      pendingImport,
      setPendingImport,
      takePendingImport,
    ],
  )

  return (
    <AddLibraryFlowContext.Provider value={value}>
      {children}
    </AddLibraryFlowContext.Provider>
  )
}

export function useAddLibraryFlow(): AddLibraryFlowValue {
  return useContext(AddLibraryFlowContext)
}
