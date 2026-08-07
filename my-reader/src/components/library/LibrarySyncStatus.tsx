import type { DesktopTranslationKey } from "@my-reader/i18n/desktop"
import { formatHumanReadableTime } from "@my-reader/tools/human-readable-time"
import type {
  SyncIndicatorState,
  SyncReason,
  SyncStage,
} from "@my-reader/tools/sync-status"
import type { Library } from "@my-reader/tools/types/library"
import {
  Cloud,
  CloudAlert,
  CloudCheck,
  CloudDownload,
  CloudOff,
  CloudSync,
  CloudUpload,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react"
import { Popover } from "radix-ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { useSyncStatusPresentation } from "@/hooks/useSyncStatusPresentation"
import { cn } from "@/lib/utils"

const STATUS_ICONS = {
  idle: Cloud,
  offline: CloudOff,
  recent_success: CloudCheck,
  unchanged: CloudCheck,
  syncing: CloudSync,
  pushing: CloudUpload,
  pulling: CloudDownload,
  failed: CloudAlert,
} as const satisfies Record<SyncIndicatorState, LucideIcon>

const STATUS_LABEL_KEYS = {
  idle: "syncStatus.state.idle",
  offline: "syncStatus.state.offline",
  recent_success: "syncStatus.state.recentSuccess",
  unchanged: "syncStatus.state.unchanged",
  syncing: "syncStatus.state.syncing",
  pushing: "syncStatus.state.pushing",
  pulling: "syncStatus.state.pulling",
  failed: "syncStatus.state.failed",
} as const satisfies Record<SyncIndicatorState, DesktopTranslationKey>

const STAGE_LABEL_KEYS = {
  preparing: "syncStatus.stage.preparing",
  pushing: "syncStatus.stage.pushing",
  pulling: "syncStatus.stage.pulling",
  applying: "syncStatus.stage.applying",
  sidecar_complete: "syncStatus.stage.sidecarComplete",
  calibre: "syncStatus.stage.calibre",
  complete: "syncStatus.stage.complete",
} as const satisfies Record<SyncStage, DesktopTranslationKey>

const REASON_LABEL_KEYS = {
  manual: "syncStatus.reason.manual",
  local_change: "syncStatus.reason.localChange",
  automatic_check: "syncStatus.reason.automaticCheck",
} as const satisfies Record<SyncReason, DesktopTranslationKey>

type LibrarySyncStatusProps = {
  library: Library | null
  onSync?: () => Promise<void> | void
}

function statusColorClass(indicator: SyncIndicatorState) {
  switch (indicator) {
    case "failed":
      return "text-danger"
    case "recent_success":
    case "unchanged":
      return "text-success"
    case "offline":
      return "text-muted-foreground"
    case "idle":
      return "text-foreground"
    default:
      return "text-primary"
  }
}

function StatusIcon({
  className,
  indicator,
}: {
  className?: string
  indicator: SyncIndicatorState
}) {
  const Icon = STATUS_ICONS[indicator]
  return <Icon aria-hidden className={className} />
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-foreground">
        {value}
      </dd>
    </div>
  )
}

function SyncProgress({
  completed,
  running,
  total,
}: {
  completed: number
  running: boolean
  total: number
}) {
  const { t } = useTranslation()
  const determinate = total > 0
  const percentage = determinate
    ? Math.max(0, Math.min((completed / total) * 100, 100))
    : 0

  return (
    <div
      aria-hidden={!running}
      className={cn(
        "flex h-8 w-full flex-col justify-center gap-1.5 px-6 transition-opacity",
        running ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        className="h-1.5 overflow-hidden rounded-full bg-primary/20"
        role="progressbar"
        aria-valuemin={running && determinate ? 0 : undefined}
        aria-valuemax={running && determinate ? 100 : undefined}
        aria-valuenow={running && determinate ? percentage : undefined}
      >
        {running ? (
          <div
            className={cn(
              "h-full rounded-full bg-primary transition-[width]",
              !determinate &&
                "mx-auto w-1/3 animate-pulse motion-reduce:animate-none",
            )}
            style={determinate ? { width: `${percentage}%` } : undefined}
          />
        ) : null}
      </div>
      <span className="h-4 text-center text-xs tabular-nums text-muted-foreground">
        {running && determinate
          ? t("syncStatus.progress", { completed, total })
          : "\u00a0"}
      </span>
    </div>
  )
}

export default function LibrarySyncStatus({
  library,
  onSync,
}: LibrarySyncStatusProps) {
  const { t, i18n } = useTranslation()
  const { activity, history, indicator, isOffline, transientResult } =
    useSyncStatusPresentation(library)
  const [open, setOpen] = useState(false)
  const [manualSyncPending, setManualSyncPending] = useState(false)
  const displayIndicator =
    manualSyncPending && !activity ? "syncing" : indicator
  const statusLabel = t(STATUS_LABEL_KEYS[displayIndicator])
  const stageLabel = activity ? t(STAGE_LABEL_KEYS[activity.stage]) : null
  const reason =
    activity?.reason ??
    transientResult?.reason ??
    history?.lastFailure?.reason ??
    history?.lastSync?.reason
  const reasonLabel = reason ? t(REASON_LABEL_KEYS[reason]) : null
  const lastSyncLabel = history?.lastSync
    ? formatHumanReadableTime(
        history.lastSync.completedAt,
        i18n.resolvedLanguage ?? i18n.language,
      )
    : t("syncStatus.noHistory")
  const lastAttemptLabel = history?.lastFailure
    ? formatHumanReadableTime(
        history.lastFailure.completedAt,
        i18n.resolvedLanguage ?? i18n.language,
      )
    : null
  const isRunning = activity != null || manualSyncPending
  const canSync = Boolean(library && onSync && !isRunning && !isOffline)
  const idleTriggerLabel =
    displayIndicator === "idle" && history?.lastSync && lastSyncLabel
      ? lastSyncLabel
      : statusLabel
  const triggerLabel = library
    ? idleTriggerLabel
    : t("syncStatus.noActiveLibrary")
  const summaryLabel = library ? (stageLabel ?? statusLabel) : triggerLabel

  const handleSync = async () => {
    if (!canSync || !onSync) return
    setManualSyncPending(true)
    try {
      await onSync()
    } finally {
      setManualSyncPending(false)
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("syncStatus.accessibilityLabel", {
            status: triggerLabel,
          })}
        >
          {library ? (
            <StatusIcon className="size-3.5" indicator={displayIndicator} />
          ) : (
            <CloudOff aria-hidden className="size-3.5" />
          )}
          <span>{triggerLabel}</span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          role="dialog"
          aria-label={t("syncStatus.details")}
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 flex max-h-[calc(100vh-3rem)] w-80 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-md outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <h2 className="shrink-0 px-4 pt-4 text-sm font-semibold text-foreground">
            {t("syncStatus.title")}
          </h2>

          <div
            className="flex min-h-36 shrink-0 flex-col items-center justify-center px-5 py-3"
            aria-live="polite"
          >
            {library ? (
              <StatusIcon
                className={cn(
                  "size-10 stroke-[1.75]",
                  statusColorClass(displayIndicator),
                )}
                indicator={displayIndicator}
              />
            ) : (
              <CloudOff className="size-10 stroke-[1.75] text-muted-foreground" />
            )}
            <div
              className={cn(
                "mt-2 text-base font-semibold",
                library
                  ? statusColorClass(displayIndicator)
                  : "text-muted-foreground",
              )}
            >
              {summaryLabel}
            </div>
            <SyncProgress
              completed={activity?.completed ?? 0}
              running={activity != null}
              total={activity?.total ?? 0}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
            {library ? (
              <div className="space-y-3">
                <dl className="space-y-2.5 rounded-lg bg-muted/50 p-3">
                  <DetailRow
                    label={t("syncStatus.currentLibrary")}
                    value={library.name}
                  />
                  <DetailRow
                    label={t("syncStatus.currentStatus")}
                    value={statusLabel}
                  />
                  {stageLabel ? (
                    <DetailRow
                      label={t("syncStatus.currentStage")}
                      value={stageLabel}
                    />
                  ) : null}
                  {reasonLabel ? (
                    <DetailRow
                      label={t(
                        activity || transientResult
                          ? "syncStatus.currentReason"
                          : "syncStatus.lastReason",
                      )}
                      value={reasonLabel}
                    />
                  ) : null}
                  {!activity && history?.lastFailure?.failureStage ? (
                    <DetailRow
                      label={t("syncStatus.failureStage")}
                      value={t(
                        STAGE_LABEL_KEYS[history.lastFailure.failureStage],
                      )}
                    />
                  ) : null}
                  {lastAttemptLabel ? (
                    <DetailRow
                      label={t("syncStatus.lastAttempt")}
                      value={lastAttemptLabel}
                    />
                  ) : null}
                  <DetailRow
                    label={t("syncStatus.lastSync")}
                    value={lastSyncLabel}
                  />
                </dl>

                {isOffline ? (
                  <div className="space-y-1.5 rounded-lg bg-warning-soft p-3 text-sm">
                    <div className="font-semibold text-warning">
                      {t("syncStatus.waitingForNetwork")}
                    </div>
                    <p className="text-foreground">
                      {t("syncStatus.offlineDetail")}
                    </p>
                  </div>
                ) : null}

                {history?.lastFailure?.message ? (
                  <div className="space-y-1.5 rounded-lg bg-danger-soft p-3 text-sm">
                    <div className="font-semibold text-danger">
                      {t("syncStatus.failureReason")}
                    </div>
                    <p className="break-words text-foreground">
                      {history.lastFailure.message}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                {t("syncStatus.noActiveLibraryDetail")}
              </p>
            )}
          </div>

          <div className="shrink-0 px-4 pb-4 pt-2">
            <Button
              type="button"
              className="w-full"
              disabled={!canSync}
              onClick={() => void handleSync()}
            >
              {isRunning ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" />
              ) : null}
              {isRunning
                ? t("syncStatus.syncingAction")
                : isOffline
                  ? t("syncStatus.waitingForNetwork")
                  : t("syncStatus.manualSync")}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
