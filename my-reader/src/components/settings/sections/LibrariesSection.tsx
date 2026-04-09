import { useRef, useState } from "react"
import {
  Folder,
  FolderSearch,
  HardDrive,
  Info,
  Loader2,
  PlusCircle,
  Trash2,
} from "lucide-react"
import { open } from "@tauri-apps/plugin-dialog"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useLibrary } from "@/stores/libraryStore"
import type { LibraryInfo } from "my-reader-tools/types/book"

export default function LibrariesSection() {
  const { libraries, addLibrary, removeLibrary, activeLibraryId } = useLibrary()

  const [addPanelOpen, setAddPanelOpen] = useState(false)
  const [pathInput, setPathInput] = useState("")
  const [pathError, setPathError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathInputRef = useRef<HTMLInputElement>(null)

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

  function handleOpenAddPanel() {
    setAddPanelOpen(true)
    setTimeout(() => pathInputRef.current?.focus(), 50)
  }

  function handleCloseAddPanel() {
    setAddPanelOpen(false)
    setPathInput("")
    setPathError(null)
  }

  async function handleBrowse() {
    console.info("Start to open directory picker for Calibre library path.")
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择 Calibre 书库目录",
      })
      if (selected) {
        const path = selected as string
        console.info(`Success to pick library directory. path: "${path}"`)
        setPathInput(path)
        setPathError(null)
        pathInputRef.current?.focus()
      } else {
        console.info("Success to open directory picker. result: cancelled")
      }
    } catch (e) {
      console.error("Failed to open directory picker for library path. error:", e)
    }
  }

  async function handleConfirmAdd() {
    const path = pathInput.trim()
    if (!path) {
      setPathError("请输入书库路径")
      pathInputRef.current?.focus()
      return
    }

    setAdding(true)
    setPathError(null)
    try {
      await addLibrary(path)
      handleCloseAddPanel()
    } catch (e) {
      console.error(
        `Failed to confirm add library from settings UI. path: "${path}", error:`,
        e,
      )
      setPathError(String(e))
    } finally {
      setAdding(false)
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
        <div className="flex flex-col gap-2 mb-3">
          {libraries.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              暂无书库，请点击下方按钮添加
            </p>
          )}
          {libraries.map((lib, index) => (
            <LibraryCard
              key={lib.id}
              lib={lib}
              index={index}
              isActive={lib.id === activeLibraryId}
              isPendingDelete={pendingDeleteId === lib.id}
              isRemoving={removingId === lib.id}
              onDeleteClick={handleDeleteClick}
            />
          ))}
        </div>

        {/* Add panel */}
        <div
          className={cn(
            "overflow-hidden rounded-[var(--radius)] transition-colors",
            addPanelOpen
              ? "border border-primary"
              : "border border-dashed border-border",
          )}
        >
          <button
            type="button"
            onClick={addPanelOpen ? handleCloseAddPanel : handleOpenAddPanel}
            className="flex w-full items-center gap-2.5 bg-primary/5 px-4 py-3 text-[13.5px] font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <PlusCircle className="size-[15px]" />
            添加书库
          </button>

          {addPanelOpen && (
            <div className="px-4 py-4 bg-card border-t border-border flex flex-col gap-2.5 animate-in slide-in-from-top-1 fade-in-0 duration-200">
              <div className="flex gap-2 items-center">
                <Input
                  ref={pathInputRef}
                  value={pathInput}
                  onChange={(e) => {
                    setPathInput(e.target.value)
                    setPathError(null)
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleConfirmAdd()}
                  placeholder="输入 Calibre 书库路径，例如 D:\CalibreLibrary"
                  className={cn(
                    "flex-1 font-mono text-xs h-9",
                    pathError &&
                      "border-destructive ring-1 ring-destructive/30",
                  )}
                  spellCheck={false}
                  autoComplete="off"
                  disabled={adding}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={handleBrowse}
                  disabled={adding}
                >
                  <FolderSearch className="size-[13px]" />
                  浏览
                </Button>
              </div>
              {pathError && (
                <p className="text-xs text-destructive animate-in fade-in-0 duration-150">
                  {pathError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCloseAddPanel}
                  disabled={adding}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={handleConfirmAdd}
                  disabled={adding}
                >
                  {adding ? (
                    <Loader2 className="size-[13px] animate-spin" />
                  ) : (
                    <PlusCircle className="size-[13px]" />
                  )}
                  {adding ? "添加中…" : "确认添加"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Hint */}
        <div className="mt-4 flex gap-2.5 rounded-[9px] border border-primary/20 bg-primary/5 p-3">
          <Info className="mt-[1px] shrink-0 text-primary size-3.5" />
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            请选择包含{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              metadata.db
            </code>{" "}
            的 Calibre 书库根目录。添加后将自动读取数据库中的书籍信息和封面。删除书库仅移除引用，不会影响磁盘文件。
          </p>
        </div>
      </div>
    </div>
  )
}

interface LibraryCardProps {
  lib: LibraryInfo
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
  const isExternal =
    lib.path.toLowerCase().includes("volume") ||
    lib.path.toLowerCase().includes("external")
  const LibIcon = isExternal ? HardDrive : Folder

  return (
    <div
      className={cn(
        "settings-card-in flex items-center gap-3 px-4 py-3 bg-card border rounded-[var(--radius)]",
        "transition-[opacity,transform,box-shadow]",
        "hover:shadow-[0_4px_12px_rgba(59,47,47,0.10),0_2px_4px_rgba(59,47,47,0.05)] hover:-translate-y-px",
        isActive ? "border-primary/30" : "border-border",
        isRemoving &&
          "opacity-0 translate-x-2 scale-y-95 duration-200 pointer-events-none",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Icon */}
      <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] bg-primary/10 text-primary">
        <LibIcon className="size-[18px]" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-medium text-foreground truncate">
            {lib.name}
          </span>
          {isActive && (
            <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-sm font-medium">
              当前
            </span>
          )}
        </div>
        <div className="text-[11.5px] text-muted-foreground font-mono truncate">
          {lib.path}
        </div>
      </div>

      {/* Count / confirm tip */}
      {isPendingDelete ? (
        <span className="text-[11.5px] text-destructive shrink-0 whitespace-nowrap animate-in fade-in-0 duration-150">
          再次点击确认删除
        </span>
      ) : (
        <span className="text-xs text-muted-foreground shrink-0">
          {lib.bookCount} 本
        </span>
      )}

      {/* Delete button */}
      <button
        type="button"
        onClick={() => onDeleteClick(lib.id)}
        title="删除书库"
        className={cn(
          "shrink-0 size-[30px] rounded-[7px] border flex items-center justify-center transition-colors",
          isPendingDelete
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-transparent text-muted-foreground hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive",
        )}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}
