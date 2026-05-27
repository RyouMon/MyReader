import { Loader2, PlugZap, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
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
import { useLibrariesQuery } from "@/hooks/queries/useLibrariesQuery"
import { useLibraryUiStore } from "@/stores/libraryUiStore"

/**
 * 同步设置分区：选择 library + 数据源 → 测连通、触发 DB 同步、管理 file_state 下载/释放/删除。
 *
 * 本期（阶段 1）仅支持 LocalDirect 与 WebDAV；对 LocalDirect 自动短路 DB 同步并隐藏下载/释放按钮。
 */
export default function SyncSection() {
  const { t } = useTranslation()
  const actions = useSyncActions()
  const { data: libraries = [] } = useLibrariesQuery()
  const activeLibraryId = useLibraryUiStore((s) => s.activeLibraryId)

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
      setTestResult({ kind: "ok", text: t("settings.sync.connectionOk") })
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
        <h1 className="text-xl font-semibold">{t("settings.sync.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.sync.description")}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-5">
        <section className="mb-5">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            {t("settings.sync.selectLibraryAndDataSource")}
          </p>
          <div className="grid grid-cols-1 gap-3 rounded-[var(--radius)] border border-border bg-card p-4 md:grid-cols-2">
            <LabelledSelect
              label={t("settings.sync.libraryLabel")}
              value={selectedLibraryId ?? ""}
              onChange={(v) => setSelectedLibraryId(v || null)}
              options={libraries.map((l) => ({ value: l.id, label: l.name }))}
              placeholder={t("settings.sync.libraryPlaceholder")}
              disabled={libraries.length === 0}
            />
            <LabelledSelect
              label={t("settings.sync.dataSourceLabel")}
              value={selectedBackendId ?? ""}
              onChange={(v) => setSelectedBackendId(v || null)}
              options={backends.map((b) => ({
                value: b.id,
                label: `${b.name} · ${b.kind}`,
              }))}
              placeholder={
                backendsLoading
                  ? t("settings.sync.dataSourcePlaceholderLoading")
                  : t("settings.sync.dataSourcePlaceholder")
              }
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
            {t("settings.sync.connectionAndSync")}
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
              {t("settings.sync.testConnection")}
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
                  ? t("settings.sync.localDirectNoSync")
                  : t("settings.sync.syncNow")
              }
            >
              {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {t("settings.sync.syncDb")}
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
                {t("settings.sync.pushPullReport", {
                  pushed: syncReport.pushed,
                  pulled: syncReport.pulled,
                })}
              </span>
            )}
            {syncError && (
              <span className="text-xs text-destructive">{syncError}</span>
            )}
          </div>

          {isLocalDirect && (
            <StatusNotice className="mt-3">
              {t("settings.sync.localDirectHint")}
            </StatusNotice>
          )}
        </section>

        <section>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
              {t("settings.sync.fileStates")}
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
              {t("settings.sync.refresh")}
            </Button>
          </div>

          <GroupList>
            {!selectedLibraryId ? (
              <GroupListEmpty>
                {t("settings.sync.pleaseSelectLibrary")}
              </GroupListEmpty>
            ) : fileStates.length === 0 ? (
              <GroupListEmpty>
                {fileStatesLoading
                  ? t("common.loading")
                  : t("settings.sync.fileStatesEmpty")}
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
  const { t } = useTranslation()
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
        <option value="">{placeholder ?? t("common.pleaseSelect")}</option>
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
  const { t } = useTranslation()
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
        <span className="text-[11px] text-muted-foreground">
          {t("settings.sync.selectDataSourceHint")}
        </span>
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
