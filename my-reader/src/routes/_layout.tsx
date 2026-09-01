import {
  createFileRoute,
  useLocation,
  useNavigate,
} from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"

import { AddLibraryDialog } from "@/components/library/AddLibraryDialog"
import AppSidebar from "@/components/library/AppSidebar"
import LibraryWorkspace from "@/components/library/LibraryWorkspace"
import SettingsActivity from "@/components/settings/SettingsActivity"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useWindowSizeClass } from "@/hooks/use-window-size-class"
import type { SettingsSection } from "@/types/settings"

export const Route = createFileRoute("/_layout")({
  component: Layout,
})

const BOOK_DETAIL_PATH_RE = /^\/book\/([^/]+)$/

function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const windowSizeClass = useWindowSizeClass()
  const isLargeWindow = windowSizeClass === "large"
  const [sidebarOpen, setSidebarOpen] = useState(isLargeWindow)
  const [addLibraryOpen, setAddLibraryOpen] = useState(false)
  const settingsOpen = location.pathname === "/settings"
  const settingsSearch = new URLSearchParams(window.location.search)
  const requestedSection = settingsSearch.get("section")
  const settingsSection: SettingsSection =
    requestedSection === "dataSources" ||
    requestedSection === "speech" ||
    requestedSection === "appearance" ||
    requestedSection === "about"
      ? requestedSection
      : "libraries"
  const returnBookId = settingsSearch.get("returnBookId")?.trim() || null
  const returnFormat = settingsSearch.get("returnFormat")?.trim() || undefined
  const lastWorkspacePathRef = useRef("/")
  const wasLargeWindowRef = useRef<boolean | null>(null)

  useEffect(() => {
    if (wasLargeWindowRef.current === isLargeWindow) return
    wasLargeWindowRef.current = isLargeWindow
    setSidebarOpen(isLargeWindow)
  }, [isLargeWindow])

  useEffect(() => {
    if (settingsOpen) return
    if (
      location.pathname === "/" ||
      BOOK_DETAIL_PATH_RE.test(location.pathname)
    ) {
      lastWorkspacePathRef.current = location.pathname
    }
  }, [location.pathname, settingsOpen])

  const workspacePath = settingsOpen
    ? lastWorkspacePathRef.current
    : location.pathname
  const activeBookId = getBookIdFromPath(workspacePath)

  const closeSettings = useCallback(() => {
    if (returnBookId) {
      navigate({
        to: "/read/$bookId",
        params: { bookId: returnBookId },
        search: returnFormat ? { format: returnFormat } : {},
      })
      return
    }
    const bookId = getBookIdFromPath(lastWorkspacePathRef.current)
    if (bookId) {
      navigate({ to: "/book/$bookId", params: { bookId } })
      return
    }
    navigate({ to: "/" })
  }, [navigate, returnBookId, returnFormat])

  return (
    <SidebarProvider
      open={isLargeWindow && sidebarOpen}
      onOpenChange={(open) => {
        if (isLargeWindow) setSidebarOpen(open)
      }}
      forceCollapsed={!isLargeWindow}
      className="relative h-svh min-h-0 overflow-hidden"
    >
      <AppSidebar onAddLibrary={() => setAddLibraryOpen(true)} />
      <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <LibraryWorkspace
          activeBookId={activeBookId}
          onAddLibrary={() => setAddLibraryOpen(true)}
        />
      </SidebarInset>

      {settingsOpen ? (
        <div className="absolute inset-0 z-50 bg-background animate-in fade-in-0 duration-150">
          <SettingsActivity
            onClose={closeSettings}
            onAddLibrary={() => setAddLibraryOpen(true)}
            initialSection={settingsSection}
          />
        </div>
      ) : null}

      <AddLibraryDialog
        open={addLibraryOpen}
        onOpenChange={setAddLibraryOpen}
      />
    </SidebarProvider>
  )
}

function getBookIdFromPath(pathname: string) {
  return BOOK_DETAIL_PATH_RE.exec(pathname)?.[1] ?? null
}
