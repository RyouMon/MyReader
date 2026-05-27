import { createRootRoute, Outlet } from "@tanstack/react-router"

import { AppUiPreferencesSync } from "@/components/AppUiPreferencesSync"

export const Route = createRootRoute({
  component: () => (
    <>
      <AppUiPreferencesSync />
      <Outlet />
      {/* {import.meta.env.DEV && (
        <TanStackRouterDevtools position="bottom-right" />
      )} */}
    </>
  ),
})