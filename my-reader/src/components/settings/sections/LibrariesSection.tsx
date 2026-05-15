import { Trash2 } from "lucide-react"
import type { Library } from "my-reader-tools/store/library"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { AppRow } from "@/components/common/AppRow"
import {
  GroupList,
  GroupListEmpty,
  GroupListItem,
} from "@/components/common/GroupList"
import { StatusNotice } from "@/components/common/StatusNotice"
import { AddLibraryPanel } from "@/components/settings/forms/AddLibraryPanel"
import { cn } from "@/lib/utils"
import { useLibrary } from "@/stores/libraryStore"

/**
 * 书库设置分区，负责展示、添加与删除书库引用。
 */
export default function LibrariesSection() {
  const { t } = useTranslation()
  const { libraries, addLibrary, removeLibrary, activeLibraryId } = useLibrary()

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
        <h1 className="text-xl font-semibold">{t("settings.libraries.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("settings.libraries.description")}
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-7 py-5">
        <p className="text-[11px] font-semibold tracking-[0.07em] uppercase text-muted-foreground mb-2.5">
          {t("settings.libraries.added")}
        </p>

        {/* Library list */}
        <GroupList className="mb-3">
          {libraries.length === 0 ? (
            <GroupListEmpty>{t("settings.libraries.empty")}</GroupListEmpty>
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

        <AddLibraryPanel onAddLibrary={addLibrary} />

        {/* Hint */}
        <StatusNotice className="mt-4">
          {t("settings.libraries.addPrompt")}
        </StatusNotice>
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

/**
 * 书库卡片行，采用统一 Row 结构承载状态与动作。
 */
function LibraryCard({
  lib,
  index,
  isActive,
  isPendingDelete,
  isRemoving,
  onDeleteClick,
}: LibraryCardProps) {
  const { t } = useTranslation()
  const isExternal =
    lib.path.toLowerCase().includes("volume") ||
    lib.path.toLowerCase().includes("external")
  const rowIcon = isExternal ? "hardDrive" : "folder"

  return (
    <GroupListItem
      className={cn(
        "bg-card transition-[opacity,transform,background-color]",
        "hover:bg-muted/40",
        isRemoving &&
          "pointer-events-none ltr:translate-x-2 rtl:-translate-x-2 opacity-0",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <AppRow
        icon={rowIcon}
        body={lib.name}
        detail={lib.path}
        detailClassName="font-mono"
        tail={
          <div className="flex items-center gap-2">
            {isActive && (
              <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
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
        }
      />
    </GroupListItem>
  )
}
