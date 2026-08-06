import { ArrowDown, ArrowUp, CheckCircle2, Cloud } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { BookDownloadSnapshot } from "@/hooks/queries/useBookDownloadState"
import { cn } from "@/lib/utils"
import { CircularDownloadProgress } from "./CircularDownloadProgress"

interface BookDownloadIndicatorProps {
  state: BookDownloadSnapshot | null
  variant?: "cover" | "inline" | "icon"
  className?: string
  showPresent?: boolean
  remoteOnly?: boolean
}

export function BookDownloadIndicator({
  state,
  variant = "cover",
  className,
  showPresent = false,
  remoteOnly = false,
}: BookDownloadIndicatorProps) {
  const { t } = useTranslation()
  if (!state || (state.status === "present" && !showPresent)) return null
  if (remoteOnly && state.status !== "remote_only") return null

  const label = getDownloadLabel(state, t)
  const iconClassName = variant === "cover" ? "size-3.5" : "size-3"
  const isDownloadActive =
    state.status === "starting" || state.status === "downloading"
  const isUploadActive = state.status === "uploading"
  const Icon =
    state.status === "remote_only"
      ? Cloud
      : state.status === "present"
        ? CheckCircle2
        : Cloud

  if (variant === "inline") {
    return (
      <span
        className={cn(
          "inline-flex min-w-0 items-center gap-1 text-[10px]",
          inlineTone(state.status),
          className,
        )}
        data-download-status={state.status}
        title={label}
      >
        {isDownloadActive || isUploadActive ? (
          <CircularTransferProgress
            className="size-3 shrink-0"
            direction={isUploadActive ? "up" : "down"}
            percent={state.percent}
          />
        ) : state.status === "local_only" ? (
          <Cloud
            className={cn(iconClassName, "shrink-0")}
            strokeDasharray="2 2"
            aria-hidden="true"
          />
        ) : (
          <Icon className={cn(iconClassName, "shrink-0")} aria-hidden="true" />
        )}
        <span className="truncate">{label}</span>
      </span>
    )
  }

  if (variant === "icon") {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center",
          inlineTone(state.status),
          className,
        )}
        data-download-status={state.status}
        title={label}
        role="img"
        aria-label={label}
      >
        {isDownloadActive || isUploadActive ? (
          <CircularTransferProgress
            className="size-3"
            direction={isUploadActive ? "up" : "down"}
            percent={state.percent}
          />
        ) : state.status === "local_only" ? (
          <Cloud
            className={iconClassName}
            strokeDasharray="2 2"
            aria-hidden="true"
          />
        ) : (
          <Icon className={iconClassName} aria-hidden="true" />
        )}
      </span>
    )
  }

  return (
    <span
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md border shadow-[var(--shadow-sm)] backdrop-blur-sm",
        coverTone(state.status),
        className,
      )}
      data-download-status={state.status}
      title={label}
      role="img"
      aria-label={label}
    >
      {isDownloadActive || isUploadActive ? (
        <CircularTransferProgress
          className="size-4"
          direction={isUploadActive ? "up" : "down"}
          percent={state.percent}
        />
      ) : state.status === "local_only" ? (
        <Cloud
          className={iconClassName}
          strokeDasharray="2 2"
          aria-hidden="true"
        />
      ) : (
        <Icon className={iconClassName} aria-hidden="true" />
      )}
      {(state.status === "downloading" || state.status === "uploading") &&
      state.percent != null ? (
        <span className="sr-only">{Math.round(state.percent)}%</span>
      ) : null}
    </span>
  )
}

function getDownloadLabel(
  state: BookDownloadSnapshot,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  switch (state.status) {
    case "remote_only":
      return t("bookDownload.remoteOnly")
    case "starting":
      return t("bookDownload.starting")
    case "downloading":
      return state.percent != null
        ? t("bookDownload.downloadingPercent", { percent: state.percent })
        : t("bookDownload.downloading")
    case "local_only":
      return t("bookUpload.localOnly")
    case "uploading":
      return state.percent != null
        ? t("bookUpload.uploadingPercent", {
            percent: Math.round(state.percent),
          })
        : t("bookUpload.uploading")
    case "present":
      return t("bookDownload.present")
  }
}

function coverTone(status: BookDownloadSnapshot["status"]) {
  if (status === "remote_only") {
    return "border-border bg-card/85 text-muted-foreground"
  }
  if (status === "starting" || status === "downloading") {
    return "border-primary/20 bg-primary-soft text-primary"
  }
  if (status === "uploading") {
    return "border-primary/20 bg-primary-soft text-primary"
  }
  if (status === "local_only") {
    return "border-border bg-card/85 text-muted-foreground"
  }
  if (status === "present") {
    return "border-border bg-card/85 text-success"
  }
  return "border-destructive/20 bg-danger-soft text-destructive"
}

function inlineTone(status: BookDownloadSnapshot["status"]) {
  if (status === "remote_only") return "text-muted-foreground"
  if (
    status === "starting" ||
    status === "downloading" ||
    status === "uploading"
  )
    return "text-primary"
  if (status === "local_only") return "text-muted-foreground"
  if (status === "present") return "text-success"
  return "text-destructive"
}

function CircularTransferProgress({
  direction,
  percent,
  className,
}: {
  direction: "down" | "up"
  percent?: number
  className?: string
}) {
  const Arrow = direction === "up" ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center",
        className,
      )}
      aria-hidden="true"
    >
      <CircularDownloadProgress className="size-full" percent={percent} />
      <Arrow className="absolute size-[55%] stroke-[2.5]" />
    </span>
  )
}
