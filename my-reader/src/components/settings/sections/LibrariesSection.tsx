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
import { Trash2 } from "lucide-react"
import type { Library } from "my-reader-tools/store/library"
import { useRef, useState } from "react"

/**
 * 书库设置分区，负责展示、添加与删除书库引用。
 */
export default function LibrariesSection() {
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
        <h1 className="text-xl font-semibold">书库管理</h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理 Calibre 书库目录，支持添加多个本地书库并自由切换
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-7 py-5">
        <p className="text-[11px] font-semibold tracking-[0.07em] uppercase text-muted-foreground mb-2.5">
          已添加的书库
        </p>

        {/* Library list */}
        <GroupList className="mb-3">
          {libraries.length === 0 ? (
            <GroupListEmpty>暂无书库，请点击下方按钮添加</GroupListEmpty>
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
          请选择包含{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
            metadata.db
          </code>{" "}
          的 Calibre
          书库根目录。添加后将自动读取数据库中的书籍信息和封面。删除书库仅移除引用，不会影响磁盘文件。
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
  const isExternal =
    lib.path.toLowerCase().includes("volume") ||
    lib.path.toLowerCase().includes("external")
  const rowIcon = isExternal ? "hardDrive" : "folder"

  return (
    <GroupListItem
      className={cn(
        "bg-card transition-[opacity,transform,background-color]",
        "hover:bg-muted/40",
        isRemoving && "pointer-events-none translate-x-2 opacity-0",
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
                当前
              </span>
            )}
            {isPendingDelete ? (
              <span className="whitespace-nowrap text-[11.5px] text-destructive animate-in fade-in-0 duration-150">
                再次点击确认删除
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {lib.bookCount} 本
              </span>
            )}
          </div>
        }
        actions={
          <button
            type="button"
            onClick={() => onDeleteClick(lib.id)}
            title="删除书库"
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
