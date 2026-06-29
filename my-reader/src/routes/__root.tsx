import { createRootRoute, Outlet } from "@tanstack/react-router"

import { AppThemeProvider } from "@/components/AppThemeProvider"
import { AppUiPreferencesSync } from "@/components/AppUiPreferencesSync"
import { Toaster } from "@/components/ui/sonner"
import { useDownloadProgressEvents } from "@/hooks/useDownloadProgress"

function RootShell() {
  useDownloadProgressEvents()
  return (
    <AppThemeProvider>
      <AppUiPreferencesSync />
      <Outlet />
      <Toaster position="bottom-right" richColors />
      {/* {import.meta.env.DEV && (
        <TanStackRouterDevtools position="bottom-right" />
      )} */}
    </AppThemeProvider>
  )
}

export const Route = createRootRoute({
  component: RootShell,
})
