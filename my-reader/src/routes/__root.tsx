import { createRootRoute, Outlet } from "@tanstack/react-router"

import { AppUiPreferencesSync } from "@/components/AppUiPreferencesSync"
import { LibrarySync } from "@/stores/libraryStore"

export const Route = createRootRoute({
  component: () => (
    <>
      <LibrarySync />
      <AppUiPreferencesSync />
      <Outlet />
      {/* {import.meta.env.DEV && (
        <TanStackRouterDevtools position="bottom-right" />
      )} */}
    </>
  ),
})
