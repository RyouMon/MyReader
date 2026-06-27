import { createRootRoute, Outlet } from "@tanstack/react-router"

import { AppThemeProvider } from "@/components/AppThemeProvider"
import { AppUiPreferencesSync } from "@/components/AppUiPreferencesSync"

export const Route = createRootRoute({
  component: () => (
    <AppThemeProvider>
      <AppUiPreferencesSync />
      <Outlet />
      {/* {import.meta.env.DEV && (
        <TanStackRouterDevtools position="bottom-right" />
      )} */}
    </AppThemeProvider>
  ),
})
