import { Loader2, PlugZap, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  GroupList,
  GroupListEmpty,
  GroupListItem,
} from "@/components/common/GroupList"
import { StatusNotice } from "@/components/common/StatusNotice"
import DownloadButton from "@/components/library/DownloadButton"
import { Button } from "@/components/ui/button"
import {
  type DbSyncReport,
  type FileStateRow,
  type SyncBackendInfo,
  useSyncActions,
} from "@/hooks/sync/useSyncActions"
import { cn } from "@/lib/utils"
import { useLibraryStore } from "@/stores/libraryStore"

/**
 * 同步设置分区：选择 library + 数据源 → 测连通、触发 DB 同步、管理 file_state 下载/释放/删除。
 *
 * 本期（阶段 1）仅支持 LocalDirect 与 WebDAV；对 LocalDirect 自动短路 DB 同步并隐藏下载/释放按钮。
 */
export default function SyncSection() {
  const actions = useSyncActions()
  const libraries = useLibraryStore((s) => s.libraries)
  const activeLibraryId = useLibraryStore((s) => s.activeLibraryId)
  const hydrateLibraries = useLibraryStore((s) => s.hydrateFromBackend)
  const librariesHydrated = useLibraryStore((s) => s.hydrated)

  const [backends, setBackends] = useState<SyncBackendInfo[]>([])
  const [backendsLoading, setBackendsLoading] = useState(false)
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(
    null,
  )
  const [selectedBackendId, setSelectedBackendId] = useState<string | null>(
    null,
  )

  const [fileStates, setFileStates] = useState<FileStateRow[]>([])
  const [fileStatesLoading, setFileStatesLoading] = useState(false)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    kind: "ok" | "err"
    text: string
  } | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncReport, setSyncReport] = useState<DbSyncReport | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const selectedBackend = useMemo(
    () => backends.find((b) => b.id === selectedBackendId) ?? null,
    [backends, selectedBackendId],
  )
  const isLocalDirect = selectedBackend?.isLocalDirect ?? false

  const loadBackends = useCallback(async () => {
    setBackendsLoading(true)
    try {
      const list = await actions.listBackends()
      setBackends(list)
      setSelectedBackendId((prev) => {
        if (prev && list.some((b) => b.id === prev)) return prev
        return list[0]?.id ?? null
      })
    } catch (err) {
      console.error("Failed to list sync backends:", err)
    } finally {
      setBackendsLoading(false)
    }
  }, [actions])

  const loadFileStates = useCallback(async () => {
    if (!selectedLibraryId) {
      setFileStates([])
      return
    }
    setFileStatesLoading(true)
    try {
      const rows = await actions.listFileStates(selectedLibraryId)
      setFileStates(rows)
    } catch (err) {
      console.error("Failed to list file states:", err)
      setFileStates([])
    } finally {
      setFileStatesLoading(false)
    }
  }, [actions, selectedLibraryId])

  useEffect(() => {
    if (!librariesHydrated) {
      void hydrateLibraries()
    }
  }, [hydrateLibraries, librariesHydrated])

  useEffect(() => {
    void loadBackends()
  }, [loadBackends])

  useEffect(() => {
    setSelectedLibraryId((prev) => {
      if (prev && libraries.some((l) => l.id === prev)) return prev
      return activeLibraryId ?? libraries[0]?.id ?? null
    })
  }, [libraries, activeLibraryId])

  useEffect(() => {
    void loadFileStates()
  }, [loadFileStates])

  async function handleTestBackend() {
    if (!selectedBackendId) return
    setTesting(true)
    setTestResult(null)
    try {
      await actions.testBackend(selectedBackendId)
      setTestResult({ kind: "ok", text: "数据源连接通过" })
    } catch (err) {
      setTestResult({ kind: "err", text: describeError(err) })
    } finally {
      setTesting(false)
    }
  }

  async function handleSyncDbNow() {
    if (!selectedLibraryId || !selectedBackendId) return
    setSyncing(true)
    setSyncError(null)
    setSyncReport(null)
    try {
      const report = await actions.syncDbNow(
        selectedLibraryId,
        selectedBackendId,
      )
      setSyncReport(report)
    } catch (err) {
      setSyncError(describeError(err))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-7 py-5 pb-4">
        <h1 className="text-xl font-semibold">同步与下载</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理 Calibre/MyReader 书库的 DB 同步与文件下载、释放、删除
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-5">
        <section className="mb-5">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            选择书库与数据源
          </p>
          <div className="grid grid-cols-1 gap-3 rounded-[var(--radius)] border border-border bg-card p-4 md:grid-cols-2">
            <LabelledSelect
              label="书库"
              value={selectedLibraryId ?? ""}
              onChange={(v) => setSelectedLibraryId(v || null)}
              options={libraries.map((l) => ({ value: l.id, label: l.name }))}
              placeholder="未选择书库"
              disabled={libraries.length === 0}
            />
            <LabelledSelect
              label="数据源"
              value={selectedBackendId ?? ""}
              onChange={(v) => setSelectedBackendId(v || null)}
              options={backends.map((b) => ({
                value: b.id,
                label: `${b.name} · ${b.kind}`,
              }))}
              placeholder={backendsLoading ? "加载中…" : "未选择数据源"}
              disabled={backends.length === 0}
            />
          </div>

          {selectedBackend && (
            <p className="mt-2 text-xs text-muted-foreground">
              {selectedBackend.summary}
            </p>
          )}
        </section>

        <section className="mb-5">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            连接与数据库同步
          </p>
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-border bg-card p-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!selectedBackendId || testing}
              onClick={handleTestBackend}
            >
              {testing ? <Loader2 className="animate-spin" /> : <PlugZap />}
              测试连通
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={
                !selectedBackendId ||
                !selectedLibraryId ||
                syncing ||
                isLocalDirect
              }
              onClick={handleSyncDbNow}
              title={
                isLocalDirect
                  ? "本地直读模式无需 DB 同步"
                  : "立即推拉数据库变更"
              }
            >
              {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              立即同步数据库
            </Button>

            {testResult && (
              <span
                className={cn(
                  "text-xs",
                  testResult.kind === "ok"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive",
                )}
              >
                {testResult.text}
              </span>
            )}

            {syncReport && (
              <span className="text-xs text-muted-foreground">
                push {syncReport.pushed} / pull {syncReport.pulled}
              </span>
            )}
            {syncError && (
              <span className="text-xs text-destructive">{syncError}</span>
            )}
          </div>

          {isLocalDirect && (
            <StatusNotice className="mt-3">
              本地直读数据源：DB 同步已跳过，文件仅支持「彻底删除」。
            </StatusNotice>
          )}
        </section>

        <section>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
              本地文件状态（file_state）
            </p>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => void loadFileStates()}
              disabled={fileStatesLoading || !selectedLibraryId}
            >
              {fileStatesLoading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              刷新
            </Button>
          </div>

          <GroupList>
            {!selectedLibraryId ? (
              <GroupListEmpty>请选择书库</GroupListEmpty>
            ) : fileStates.length === 0 ? (
              <GroupListEmpty>
                {fileStatesLoading
                  ? "加载中…"
                  : "暂无跟踪的文件（首次下载或推送后将出现在这里）"}
              </GroupListEmpty>
            ) : (
              fileStates.map((row) => (
                <FileStateRowView
                  key={row.path}
                  row={row}
                  libraryId={selectedLibraryId}
                  dataSourceId={selectedBackendId ?? ""}
                  disabled={!selectedBackendId}
                  isLocalDirect={isLocalDirect}
                  onChanged={() => void loadFileStates()}
                />
              ))
            )}
          </GroupList>
        </section>
      </div>
    </div>
  )
}

interface LabelledSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
  disabled?: boolean
}

function LabelledSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: LabelledSelectProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <select
        className={cn(
          "h-9 rounded-md border border-input bg-background px-3 text-sm",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          disabled && "cursor-not-allowed opacity-60",
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">{placeholder ?? "请选择"}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}

interface FileStateRowViewProps {
  row: FileStateRow
  libraryId: string
  dataSourceId: string
  disabled: boolean
  isLocalDirect: boolean
  onChanged: () => void
}

function FileStateRowView({
  row,
  libraryId,
  dataSourceId,
  disabled,
  isLocalDirect,
  onChanged,
}: FileStateRowViewProps) {
  return (
    <GroupListItem className="flex flex-wrap items-center justify-between gap-3 bg-card hover:bg-muted/40">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[12.5px] text-foreground">
          {row.path}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {row.localState}
          {row.localSize != null ? ` · ${formatBytes(row.localSize)}` : ""}
          {row.localBlake3 ? ` · ${row.localBlake3.slice(0, 12)}…` : ""}
        </p>
      </div>

      {disabled ? (
        <span className="text-[11px] text-muted-foreground">请选择数据源</span>
      ) : (
        <DownloadButton
          libraryId={libraryId}
          dataSourceId={dataSourceId}
          relativePath={row.path}
          initialState={row.localState}
          isLocalDirect={isLocalDirect}
          onStateChange={onChanged}
        />
      )}
    </GroupListItem>
  )
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
