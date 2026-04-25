import { Link, useLocation } from "@tanstack/react-router"
import {
  BookCopy,
  Check,
  ChevronsUpDown,
  Clock,
  Library,
  Settings,
  Star,
  Tags,
  User,
} from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { useLibrary } from "@/stores/libraryStore"
import { cn } from "@/lib/utils"

export type SidebarView = "all" | "recent" | "favorites"

type LibMenuRect = { top: number; left: number; width: number }

/**
 * 应用主侧边栏，包含书库切换、筛选与设置入口。
 */
export default function AppSidebar() {
  const { libraries, activeLibrary, switchLibrary } = useLibrary()
  const location = useLocation()
  const [libMenuOpen, setLibMenuOpen] = useState(false)
  const [libMenuRect, setLibMenuRect] = useState<LibMenuRect | null>(null)
  const libTriggerRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (!libMenuOpen) {
      setLibMenuRect(null)
      return
    }

    const update = () => {
      const el = libTriggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setLibMenuRect({
        top: r.bottom + 4,
        left: r.left,
        width: r.width,
      })
    }

    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [libMenuOpen])

  const isSettingsActive = location.pathname === "/settings"
  const isLibraryActive = location.pathname === "/"
  const totalCount = activeLibrary?.bookCount ?? 0

  return (
    <Sidebar
      collapsible="icon"
      className="min-w-0 overflow-x-hidden touch-pan-y overscroll-x-none"
    >
      <SidebarHeader className="gap-0 pt-3 pb-2 overflow-x-hidden">
        <div className="flex items-center gap-3 px-2 py-1 group-data-[collapsible=icon]:justify-center">
          <div
            className="font-serif flex size-9 shrink-0 items-center justify-center rounded-lg text-base font-bold text-ink-inverse"
            style={{
              background:
                "linear-gradient(135deg, var(--primary), var(--secondary))",
            }}
          >
            M
          </div>
          <span className="font-serif text-lg font-bold tracking-tight group-data-[collapsible=icon]:hidden">
            MyReader
          </span>
        </div>

        <div className="relative group-data-[collapsible=icon]:hidden">
          <button
            ref={libTriggerRef}
            type="button"
            onClick={() => {
              if (libMenuOpen) {
                setLibMenuOpen(false)
                return
              }
              const el = libTriggerRef.current
              if (el) {
                const r = el.getBoundingClientRect()
                setLibMenuRect({
                  top: r.bottom + 4,
                  left: r.left,
                  width: r.width,
                })
              }
              setLibMenuOpen(true)
            }}
            className={cn(
              "mt-1 mx-1 w-[calc(100%-8px)] flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors",
              "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              libMenuOpen && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                activeLibrary
                  ? "bg-library-indicator-on"
                  : "bg-library-indicator-off",
              )}
            />
            <span className="flex-1 truncate text-left">
              {activeLibrary?.name ?? "未选择书库"}
            </span>
            <ChevronsUpDown className="size-3 opacity-50" />
          </button>

          {libMenuOpen &&
            libMenuRect &&
            createPortal(
              <>
                <div
                  className="fixed inset-0 z-40"
                  aria-hidden
                  onClick={() => setLibMenuOpen(false)}
                />
                <div
                  className="fixed z-50 min-w-0 rounded-lg border border-border bg-popover py-1 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150"
                  style={{
                    top: libMenuRect.top,
                    left: libMenuRect.left,
                    width: libMenuRect.width,
                  }}
                >
                  {libraries.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      暂无书库
                    </div>
                  ) : (
                    libraries.map((lib) => (
                      <button
                        type="button"
                        key={lib.id}
                        onClick={() => {
                          switchLibrary(lib.id)
                          setLibMenuOpen(false)
                        }}
                        className={cn(
                          "flex w-full min-w-0 items-center gap-2 px-3 py-2 text-xs transition-colors",
                          "hover:bg-accent hover:text-accent-foreground",
                          lib.id === activeLibrary?.id &&
                            "font-medium text-primary",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate text-left">
                          {lib.name}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                          {lib.bookCount} 本
                        </span>
                        {lib.id === activeLibrary?.id && (
                          <Check className="size-3 shrink-0 text-primary" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </>,
              document.body,
            )}
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent className="overflow-y-auto overflow-x-hidden touch-pan-y overscroll-x-none">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isLibraryActive}
                  tooltip="全部"
                >
                  <Link to="/">
                    <Library />
                    <span>全部</span>
                  </Link>
                </SidebarMenuButton>
                <SidebarMenuBadge className="group-data-[collapsible=icon]:hidden">
                  {totalCount.toLocaleString()}
                </SidebarMenuBadge>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton tooltip="最近阅读">
                  <Clock />
                  <span>最近阅读</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton tooltip="收藏">
                  <Star />
                  <span>收藏</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="group-data-[collapsible=icon]:hidden">
                  0
                </SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>分类浏览</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="标签">
                  <Tags />
                  <span>标签</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton tooltip="丛书">
                  <BookCopy />
                  <span>丛书</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton tooltip="作者">
                  <User />
                  <span>作者</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="overflow-x-hidden">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="设置"
              isActive={isSettingsActive}
            >
              <Link to="/settings">
                <Settings />
                <span>设置</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
