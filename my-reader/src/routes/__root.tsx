import { createRootRoute, Outlet } from "@tanstack/react-router"

import { AppUiPreferencesSync } from "@/components/AppUiPreferencesSync"
import { Toaster } from "@/components/ui/sonner"
import { useReadingProgressEvents } from "@/hooks/queries/useReadingProgressQuery"
import { useBookUploadProgressEvents } from "@/hooks/useBookUploadProgress"
import { useDownloadProgressEvents } from "@/hooks/useDownloadProgress"
import { useSidecarSync } from "@/hooks/useSidecarSync"

function RootShell() {
  useDownloadProgressEvents()
  useBookUploadProgressEvents()
  useReadingProgressEvents()
  useSidecarSync()
  return (
    <>
      <AppUiPreferencesSync />
      <Outlet />
      <Toaster position="bottom-right" richColors />
      {/* {import.meta.env.DEV && (
        <TanStackRouterDevtools position="bottom-right" />
      )} */}
    </>
  )
}

export const Route = createRootRoute({
  component: RootShell,
})
