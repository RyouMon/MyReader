import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router"

import AppSidebar from "@/components/library/AppSidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export const Route = createFileRoute("/_layout")({
  component: Layout,
})

function Layout() {
  const location = useLocation()

  if (location.pathname === "/settings") {
    return (
      <div className="h-svh min-h-0 overflow-hidden bg-background">
        <Outlet />
      </div>
    )
  }

  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden">
      <AppSidebar />
      <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
