import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import {
  BookCopy,
  Check,
  ChevronsUpDown,
  Clock,
  Library,
  Monitor,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  Settings,
  Star,
  Sun,
  Tags,
  User,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { useTheme } from "@/components/AppThemeProvider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  useSidebar,
} from "@/components/ui/sidebar"
import { useLibrariesQuery } from "@/hooks/queries/useLibrariesQuery"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import type { AppThemeMode } from "@/types/readerUiPreferences"

export type SidebarView = "all" | "recent" | "favorites"

const THEME_OPTIONS: Array<{
  value: AppThemeMode
  icon: typeof Sun
  tKey: string
}> = [
  { value: "light", icon: Sun, tKey: "theme.light" },
  { value: "dark", icon: Moon, tKey: "theme.dark" },
  { value: "system", icon: Monitor, tKey: "theme.system" },
]

export default function AppSidebar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { state, toggleSidebar } = useSidebar()
  const isCollapsed = state === "collapsed"
  const { data: libraries = [] } = useLibrariesQuery()
  const { activeLibraryId, switchLibrary } = useLibraryUiStore()
  const { theme, setTheme } = useTheme()
  const activeLibrary = libraries.find((l) => l.id === activeLibraryId) ?? null
  const location = useLocation()

  const isSettingsActive = location.pathname === "/settings"
  const isLibraryActive = location.pathname === "/"
  const totalCount = activeLibrary?.bookCount ?? 0
  const libraryLabel = activeLibrary?.name ?? t("sidebar.noLibrary")

  return (
    <Sidebar
      collapsible="icon"
      className="min-w-0 overflow-x-hidden touch-pan-y overscroll-x-none"
    >
      <SidebarHeader className="gap-0 overflow-x-hidden">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip={t("sidebar.switchLibrary")}
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <Library className="size-4" />
                  </div>
                  <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold">
                      {libraryLabel}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {activeLibrary
                        ? t("sidebar.connected")
                        : t("sidebar.disconnected")}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="right"
                align="start"
                sideOffset={4}
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {t("sidebar.libraries")}
                </DropdownMenuLabel>

                {libraries.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    {t("sidebar.noLibraries")}
                  </div>
                ) : (
                  libraries.map((lib) => (
                    <DropdownMenuItem
                      key={lib.id}
                      onClick={() => switchLibrary(lib.id)}
                      className="gap-2 p-2"
                    >
                      <Library className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {lib.name}
                      </span>
                      {lib.id === activeLibraryId && (
                        <Check
                          data-testid="active-library-check"
                          className="ml-auto size-4 shrink-0 text-primary"
                        />
                      )}
                    </DropdownMenuItem>
                  ))
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => navigate({ to: "/settings" })}
                  className="gap-2 p-2"
                >
                  <PlusCircle className="size-4 shrink-0" />
                  <span className="font-medium text-muted-foreground">
                    {t("addLibraryForm.label")}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
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
                  tooltip={t("sidebar.all")}
                >
                  <Link to="/">
                    <Library />
                    <span>{t("sidebar.all")}</span>
                  </Link>
                </SidebarMenuButton>
                <SidebarMenuBadge className="group-data-[collapsible=icon]:hidden">
                  {totalCount.toLocaleString()}
                </SidebarMenuBadge>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton tooltip={t("sidebar.recent")}>
                  <Clock />
                  <span>{t("sidebar.recent")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton tooltip={t("sidebar.favorites")}>
                  <Star />
                  <span>{t("sidebar.favorites")}</span>
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
          <SidebarGroupLabel>{t("sidebar.browse")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip={t("sidebar.tags")}>
                  <Tags />
                  <span>{t("sidebar.tags")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton tooltip={t("sidebar.series")}>
                  <BookCopy />
                  <span>{t("sidebar.series")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton tooltip={t("sidebar.authors")}>
                  <User />
                  <span>{t("sidebar.authors")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="overflow-x-hidden p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton tooltip={t("theme.label")}>
                  <Palette />
                  <span>{t("theme.label")}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" sideOffset={8}>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {t("theme.label")}
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(value) => setTheme(value as AppThemeMode)}
                >
                  {THEME_OPTIONS.map(({ value, icon: Icon, tKey }) => (
                    <DropdownMenuRadioItem
                      key={value}
                      value={value}
                      className="gap-2"
                    >
                      <Icon className="size-4" />
                      <span>{t(tKey)}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip={t("sidebar.settings")}
              isActive={isSettingsActive}
            >
              <Link to="/settings">
                <Settings />
                <span>{t("sidebar.settings")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem className="flex justify-end">
            <button
              type="button"
              data-testid="sidebar-toggle-button"
              onClick={toggleSidebar}
              title={isCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
              aria-label={
                isCollapsed ? t("sidebar.expand") : t("sidebar.collapse")
              }
              className="inline-flex size-8 items-center justify-center rounded-md text-sidebar-foreground ring-sidebar-ring outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
            >
              {isCollapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </button>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
