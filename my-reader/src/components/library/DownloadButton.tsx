import { CheckCircle2, Download, Loader2, Trash2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { useSyncActions } from "@/hooks/sync/useSyncActions"
import type { FileStateRow } from "@/hooks/sync/useSyncActions"
import { cn } from "@/lib/utils"

export type DownloadButtonState = FileStateRow["localState"]

interface DownloadButtonProps {
  libraryId: string
  dataSourceId: string
  relativePath: string
  initialState?: DownloadButtonState
  /** LocalDirect 数据源时隐藏下载/释放，仅保留彻底删除。 */
  isLocalDirect?: boolean
  /** 外部通知文件状态变化（用于重新拉 file_state 列表等）。 */
  onStateChange?: (next: DownloadButtonState) => void
  className?: string
}

/**
 * 三态下载按钮：未下载 → 下载中 → 已下载，并暴露释放本地副本与彻底删除入口。
 *
 * 设计原则：
 * - `download` 成功后转为 `present`，展示释放/删除按钮；
 * - `evictLocal` 成功后回到 `remote_only`，隐藏释放按钮；
 * - `deleteEverywhere` 采用两步确认，避免误删云端与本地的唯一副本；
 * - LocalDirect 数据源下本地即唯一副本，隐藏下载/释放按钮。
 */
export default function DownloadButton({
  libraryId,
  dataSourceId,
  relativePath,
  initialState = "remote_only",
  isLocalDirect = false,
  onStateChange,
  className,
}: DownloadButtonProps) {
  const [state, setState] = useState<DownloadButtonState>(initialState)
  const [busy, setBusy] = useState<"download" | "evict" | "delete" | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const actions = useSyncActions()

  useEffect(() => {
    setState(initialState)
  }, [initialState])

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [])

  function commitState(next: DownloadButtonState) {
    setState(next)
    onStateChange?.(next)
  }

  function resetConfirmTimer() {
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    confirmTimer.current = setTimeout(() => setConfirmDelete(false), 3000)
  }

  async function handleDownload() {
    if (busy) return
    setError(null)
    setBusy("download")
    try {
      await actions.downloadFile(libraryId, dataSourceId, relativePath)
      commitState("present")
    } catch (err) {
      setError(describe(err))
    } finally {
      setBusy(null)
    }
  }

  async function handleEvict() {
    if (busy) return
    setError(null)
    setBusy("evict")
    try {
      await actions.evictLocal(libraryId, relativePath)
      commitState("remote_only")
    } catch (err) {
      setError(describe(err))
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete() {
    if (busy) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      resetConfirmTimer()
      return
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    setConfirmDelete(false)
    setError(null)
    setBusy("delete")
    try {
      await actions.deleteEverywhere(libraryId, dataSourceId, relativePath)
      commitState("remote_only")
    } catch (err) {
      setError(describe(err))
    } finally {
      setBusy(null)
    }
  }

  const isPresent = state === "present" || state === "dirty_push"

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {!isLocalDirect && !isPresent && (
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={busy !== null}
          onClick={handleDownload}
          title="下载整文件"
        >
          {busy === "download" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Download />
          )}
          {busy === "download" ? "下载中" : "下载"}
        </Button>
      )}

      {!isLocalDirect && isPresent && (
        <>
          <span
            className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
            title="已下载到本地"
          >
            <CheckCircle2 className="size-3.5" />
            已下载
          </span>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={busy !== null}
            onClick={handleEvict}
            title="释放本地空间（保留云端）"
          >
            {busy === "evict" ? <Loader2 className="animate-spin" /> : <X />}
            释放
          </Button>
        </>
      )}

      <Button
        type="button"
        size="xs"
        variant={confirmDelete ? "destructive" : "ghost"}
        disabled={busy !== null}
        onClick={handleDelete}
        title={
          isLocalDirect
            ? "从本地书库彻底删除该文件"
            : "同时删除本地与云端，并从 manifest 移除"
        }
      >
        {busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />}
        {confirmDelete ? "再次点击确认删除" : "删除"}
      </Button>

      {error && (
        <span
          className="text-[11px] text-destructive"
          title={error}
        >
          失败
        </span>
      )}
    </div>
  )
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}
