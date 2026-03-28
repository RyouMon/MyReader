import { createRootRoute, Outlet } from "@tanstack/react-router"

import { LibraryProvider } from "@/contexts/LibraryContext"

export const Route = createRootRoute({
  component: () => (
    <LibraryProvider>
      <Outlet />
      {/* {import.meta.env.DEV && (
        <TanStackRouterDevtools position="bottom-right" />
      )} */}
    </LibraryProvider>
  ),
})
