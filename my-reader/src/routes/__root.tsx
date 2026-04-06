import { createRootRoute, Outlet } from "@tanstack/react-router"

import { AppUiPreferencesSync } from "@/components/AppUiPreferencesSync"
import { LibraryProvider } from "@/contexts/LibraryContext"

export const Route = createRootRoute({
  component: () => (
    <LibraryProvider>
      <AppUiPreferencesSync />
      <Outlet />
      {/* {import.meta.env.DEV && (
        <TanStackRouterDevtools position="bottom-right" />
      )} */}
    </LibraryProvider>
  ),
})
