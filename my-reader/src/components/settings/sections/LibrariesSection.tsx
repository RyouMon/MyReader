import type { Library } from "@my-reader/tools/types/library"
import { Library as LibraryIcon, Trash2 } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { AddPanelButton } from "@/components/common/AddPanelButton"
import { AppRow } from "@/components/common/AppRow"
import { EntityIcon, type EntityIconKind } from "@/components/common/EntityIcon"
import { GroupList, GroupListItem } from "@/components/common/GroupList"
import { SectionHeader } from "@/components/common/SectionHeader"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  useLibrariesQuery,
  useLibraryMutations,
} from "@/hooks/queries/useLibrariesQuery"
import { cn } from "@/lib/utils"
import { useLibraryUiStore } from "@/stores/libraryUiStore"

interface LibrariesSectionProps {
  onAddLibrary: () => void
}

export default function LibrariesSection({
  onAddLibrary,
}: LibrariesSectionProps) {
  const { t } = useTranslation()
  const { data: libraries = [] } = useLibrariesQuery()
  const { removeLibrary } = useLibraryMutations()
  const activeLibraryId = useLibraryUiStore((s) => s.activeLibraryId)

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleDeleteClick(id: string) {
    if (pendingDeleteId === id) {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
      setPendingDeleteId(null)
      setRemovingId(id)
      removeLibrary(id).finally(() => setRemovingId(null))
    } else {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
      setPendingDeleteId(id)
      deleteTimerRef.current = setTimeout(() => setPendingDeleteId(null), 3000)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-7 py-5 pb-4 border-b border-border shrink-0">
        <h1 className="text-xl font-semibold">
          {t("settings.libraries.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("settings.libraries.description")}
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-7 py-5">
        <SectionHeader title={t("settings.libraries.added")} />

        <GroupList className="mb-3">
          {libraries.length === 0 ? (
            <Empty className="min-h-48 rounded-none border-0 p-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LibraryIcon />
                </EmptyMedia>
                <EmptyTitle>{t("addLibraryFlow.noLibrary.title")}</EmptyTitle>
                <EmptyDescription>
                  {t("addLibraryFlow.noLibrary.description")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            libraries.map((lib, index) => (
              <LibraryCard
                key={lib.id}
                lib={lib}
                index={index}
                isActive={lib.id === activeLibraryId}
                isPendingDelete={pendingDeleteId === lib.id}
                isRemoving={removingId === lib.id}
                onDeleteClick={handleDeleteClick}
              />
            ))
          )}
        </GroupList>

        <div className="overflow-hidden rounded-lg border border-dashed border-border">
          <AddPanelButton
            label={t("addLibraryForm.label")}
            onClick={onAddLibrary}
          />
        </div>
      </div>
    </div>
  )
}

interface LibraryCardProps {
  lib: Library
  index: number
  isActive: boolean
  isPendingDelete: boolean
  isRemoving: boolean
  onDeleteClick: (id: string) => void
}

function LibraryCard({
  lib,
  index,
  isActive,
  isPendingDelete,
  isRemoving,
  onDeleteClick,
}: LibraryCardProps) {
  const { t } = useTranslation()
  const isWebdav = lib.sourceType === "webdav"
  const isOnedrive = lib.sourceType === "onedrive"
  const sourceIconKind: EntityIconKind = isOnedrive
    ? "onedriveDataSource"
    : isWebdav
      ? "webdavDataSource"
      : "localDataSource"
  const sourceLabel = isOnedrive
    ? t("addDataSourceForm.typeOnedrive")
    : isWebdav
      ? t("addLibraryForm.typeWebdav")
      : t("addLibraryForm.typeLocal")
  const libraryIconKind =
    lib.libraryType === "myreader" ? "myreaderLibrary" : "calibreLibrary"
  const libraryLabel = lib.libraryType === "myreader" ? "MyReader" : "Calibre"

  return (
    <GroupListItem
      className={cn(
        "@container/library-row transition-[opacity,transform,background-color] hover:bg-accent",
        isRemoving &&
          "pointer-events-none ltr:translate-x-2 rtl:-translate-x-2 opacity-0",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <AppRow
        head={<EntityIcon kind={libraryIconKind} label={libraryLabel} />}
        body={lib.name}
        detail={lib.sourcePath ?? lib.path}
        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 @2xl/library-row:grid-cols-[auto_minmax(8rem,1fr)_auto_auto] @2xl/library-row:items-center @2xl/library-row:gap-y-0"
        headClassName="row-span-2 row-start-1 mt-0 self-center @2xl/library-row:row-span-1"
        bodyClassName="col-start-2 row-start-1"
        detailClassName="font-mono"
        tailClassName="col-start-2 row-start-2 min-w-0 justify-self-start @2xl/library-row:col-start-3 @2xl/library-row:row-start-1"
        actionsClassName="col-start-3 row-span-2 row-start-1 justify-self-end @2xl/library-row:col-start-4 @2xl/library-row:row-span-1"
        tail={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <EntityIcon
              kind={sourceIconKind}
              label={sourceLabel}
              variant="inline"
            />
            {isActive && (
              <span className="rounded-sm bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                {t("settings.libraries.current")}
              </span>
            )}
            {isPendingDelete ? (
              <span className="whitespace-nowrap text-[11.5px] text-destructive animate-in fade-in-0 duration-150">
                {t("settings.libraries.confirmDelete")}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {t("settings.libraries.bookCount", { count: lib.bookCount })}
              </span>
            )}
          </div>
        }
        actions={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onDeleteClick(lib.id)}
              title={t("settings.libraries.deleteTitle")}
              className={cn(
                "size-[30px] rounded-md border flex items-center justify-center transition-colors",
                isPendingDelete
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-transparent text-muted-foreground hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive",
              )}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        }
      />
    </GroupListItem>
  )
}
