import type { DesktopTranslationKey } from "@my-reader/i18n/desktop"
import type { BuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"
import {
  isRemoteLibrarySourceType,
  libraryTypeOf,
} from "@my-reader/tools/types/library"
import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import {
  BookCopy,
  Check,
  ChevronsUpDown,
  Library,
  Monitor,
  Moon,
  Palette,
  PlusCircle,
  Settings,
  Sun,
  Tags,
  User,
} from "lucide-react"
import { useEffect } from "react"
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
} from "@/components/ui/sidebar"
import { useFavoriteBookIds } from "@/hooks/queries/useFavoriteBooksQuery"
import { useLibrariesQuery } from "@/hooks/queries/useLibrariesQuery"
import { useHasLocalOnlyBooks } from "@/hooks/queries/useLocalOnlyBooksQuery"
import { usePendingBookUploads } from "@/hooks/queries/usePendingBookUploadsQuery"
import { useDownloadQueue } from "@/hooks/useDownloadProgress"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import type { AppThemeMode } from "@/types/readerUiPreferences"
import {
  type DesktopBookCollectionDefinition,
  getVisibleStorageBookCollections,
  getVisibleTransferBookCollections,
  PRIMARY_BOOK_COLLECTIONS,
} from "./bookCollectionDefinitions"

const THEME_OPTIONS: Array<{
  value: AppThemeMode
  icon: typeof Sun
  tKey: DesktopTranslationKey
}> = [
  { value: "light", icon: Sun, tKey: "theme.light" },
  { value: "dark", icon: Moon, tKey: "theme.dark" },
  { value: "system", icon: Monitor, tKey: "theme.system" },
]

interface AppSidebarProps {
  onAddLibrary: () => void
}

export default function AppSidebar({ onAddLibrary }: AppSidebarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: libraries = [] } = useLibrariesQuery()
  const {
    activeLibraryId,
    activeCollectionId,
    setActiveCollectionId,
    switchLibrary,
  } = useLibraryUiStore()
  const { theme, setTheme } = useTheme()
  const activeLibrary = libraries.find((l) => l.id === activeLibraryId) ?? null
  const { data: favoriteIds = [] } = useFavoriteBookIds(activeLibraryId)
  const downloadQueue = useDownloadQueue(activeLibraryId)
  const isRemoteManagedLibrary = Boolean(
    activeLibrary &&
      libraryTypeOf(activeLibrary) === "myreader" &&
      isRemoteLibrarySourceType(activeLibrary.sourceType),
  )
  const {
    data: pendingUploadBookUuids = [],
    isLoading: pendingUploadsLoading,
  } = usePendingBookUploads(activeLibraryId, isRemoteManagedLibrary)
  const { data: hasLocalOnlyBooks = false, isLoading: localOnlyBooksLoading } =
    useHasLocalOnlyBooks(activeLibraryId, isRemoteManagedLibrary)
  const location = useLocation()

  const isSettingsActive = location.pathname === "/settings"
  const isLibraryWorkspace =
    location.pathname === "/" || location.pathname.startsWith("/book/")
  const totalCount = activeLibrary?.bookCount ?? 0
  const libraryLabel = activeLibrary?.name ?? t("sidebar.noLibrary")
  const collectionCounts: Partial<Record<BuiltInBookCollectionId, number>> = {
    all: totalCount,
    favorites: favoriteIds.length,
    downloading: new Set(downloadQueue.map((entry) => entry.bookId)).size,
    uploading: pendingUploadBookUuids.length,
  }
  const visibleTransferCollections =
    getVisibleTransferBookCollections(collectionCounts)
  const visibleStorageCollections =
    getVisibleStorageBookCollections(hasLocalOnlyBooks)

  useEffect(() => {
    const activeConditionalCollectionIsEmpty =
      (activeCollectionId === "downloading" &&
        collectionCounts.downloading === 0) ||
      (activeCollectionId === "uploading" &&
        !pendingUploadsLoading &&
        collectionCounts.uploading === 0) ||
      (activeCollectionId === "localOnly" &&
        !localOnlyBooksLoading &&
        !hasLocalOnlyBooks)
    if (activeConditionalCollectionIsEmpty) {
      setActiveCollectionId("all")
    }
  }, [
    activeCollectionId,
    collectionCounts.downloading,
    collectionCounts.uploading,
    hasLocalOnlyBooks,
    localOnlyBooksLoading,
    pendingUploadsLoading,
    setActiveCollectionId,
  ])

  function renderBookCollection(collection: DesktopBookCollectionDefinition) {
    const Icon = collection.icon
    const count = collectionCounts[collection.id]
    const title = t(collection.titleKey)
    return (
      <SidebarMenuItem key={collection.id}>
        <SidebarMenuButton
          isActive={isLibraryWorkspace && activeCollectionId === collection.id}
          tooltip={title}
          onClick={() => {
            setActiveCollectionId(collection.id)
            navigate({ to: "/" })
          }}
        >
          <Icon />
          <span>{title}</span>
        </SidebarMenuButton>
        {typeof count === "number" ? (
          <SidebarMenuBadge className="group-data-[collapsible=icon]:hidden">
            {count.toLocaleString()}
          </SidebarMenuBadge>
        ) : null}
      </SidebarMenuItem>
    )
  }

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
                    <span className="truncate font-semibold">MyReader</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {libraryLabel}
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

                <DropdownMenuItem onClick={onAddLibrary} className="gap-2 p-2">
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
              {PRIMARY_BOOK_COLLECTIONS.map(renderBookCollection)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleTransferCollections.length > 0 ? (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>
                {t("library.collections.transferSection")}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleTransferCollections.map(renderBookCollection)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : null}

        {visibleStorageCollections.length > 0 ? (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>
                {t("library.collections.storageSection")}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleStorageCollections.map(renderBookCollection)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : null}

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
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
