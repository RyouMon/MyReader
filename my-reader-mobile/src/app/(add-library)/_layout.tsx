import { router, Slot, useNavigation } from "expo-router"
import { useCallback } from "react"

import { AddLibraryFlowProvider } from "@/src/features/settings/add-library-flow-context"

export default function AddLibraryModalLayout() {
  const rootNavigation = useNavigation("/")
  const dismiss = useCallback(() => {
    if (rootNavigation.canGoBack()) {
      rootNavigation.goBack()
      return
    }
    router.replace("/library")
  }, [rootNavigation])

  return (
    <AddLibraryFlowProvider onDismiss={dismiss}>
      <Slot />
    </AddLibraryFlowProvider>
  )
}
