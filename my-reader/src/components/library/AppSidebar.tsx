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
import { useState } from "react"

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
import { useLibrary } from "@/contexts/LibraryContext"
import { cn } from "@/lib/utils"

export type SidebarView = "all" | "recent" | "favorites"

export default function AppSidebar() {
  const { libraries, activeLibrary, switchLibrary } = useLibrary()
  const location = useLocation()
  const [libMenuOpen, setLibMenuOpen] = useState(false)

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
            className="size-9 flex items-center justify-center rounded-[10px] text-white font-bold text-base flex-shrink-0"
            style={{
              background:
                "linear-gradient(135deg, var(--primary), var(--accent-foreground, #7a2e3b))",
              fontFamily: "'Lora', 'Noto Serif SC', serif",
            }}
          >
            M
          </div>
          <span
            className="text-lg font-bold tracking-tight group-data-[collapsible=icon]:hidden"
            style={{ fontFamily: "'Lora', 'Noto Serif SC', serif" }}
          >
            MyReader
          </span>
        </div>

        <div className="relative group-data-[collapsible=icon]:hidden">
          <button
            onClick={() => setLibMenuOpen(!libMenuOpen)}
            className={cn(
              "mt-1 mx-1 w-[calc(100%-8px)] flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors",
              "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              libMenuOpen && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <span
              className="size-2 rounded-full flex-shrink-0"
              style={{ background: activeLibrary ? "#6dae54" : "#aaa" }}
            />
            <span className="flex-1 truncate text-left">
              {activeLibrary?.name ?? "未选择书库"}
            </span>
            <ChevronsUpDown className="size-3 opacity-50" />
          </button>

          {libMenuOpen && libraries.length > 0 && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setLibMenuOpen(false)}
              />
              <div className="absolute left-1 right-1 top-full mt-1 z-50 rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-150">
                {libraries.map((lib) => (
                  <button
                    key={lib.id}
                    onClick={() => {
                      switchLibrary(lib.id)
                      setLibMenuOpen(false)
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      lib.id === activeLibrary?.id &&
                        "text-primary font-medium",
                    )}
                  >
                    <span className="flex-1 truncate text-left">
                      {lib.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {lib.bookCount} 本
                    </span>
                    {lib.id === activeLibrary?.id && (
                      <Check className="size-3 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </>
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
