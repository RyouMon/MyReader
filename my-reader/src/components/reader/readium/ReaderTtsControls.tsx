import {
  FastForward,
  Headphones,
  Loader2,
  Pause,
  Play,
  Redo2,
  Rewind,
  Settings2,
  SkipBack,
  SkipForward,
  Square,
  Undo2,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { EpubTtsSession } from "@/hooks/reader/useEpubTtsSession"
import type { EpubTtsViewportRelation } from "@/lib/readium/epubTtsViewport"

type ReaderTtsControlsProps = {
  session: EpubTtsSession
  visible: boolean
  settingsOpen: boolean
  viewportRelation: EpubTtsViewportRelation
  onPlay?: () => void
  onPlayFromCurrentPosition: () => void
  onReturnToPlaybackPosition: () => void
  onToggleSettings: () => void
}

export function ReaderTtsControls({
  session,
  visible,
  settingsOpen,
  viewportRelation,
  onPlay,
  onPlayFromCurrentPosition,
  onReturnToPlaybackPosition,
  onToggleSettings,
}: ReaderTtsControlsProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const reportedErrorRef = useRef<string | null>(null)

  useEffect(() => {
    if (!session.error) {
      reportedErrorRef.current = null
      return
    }
    if (reportedErrorRef.current === session.error) return
    reportedErrorRef.current = session.error
    toast.error(t("reader.tts.error"), { description: session.error })
  }, [session.error, t])

  useEffect(() => {
    if (session.state === "playing" || session.state === "paused") {
      setExpanded(true)
    }
  }, [session.state])

  if (!session.available && !session.loading) return null

  const playing = session.state === "playing"
  const preparing = session.loading || session.state === "loading"
  const preparationLabel = t(
    session.remote ? "reader.tts.generating" : "reader.tts.loading",
  )
  const shown = visible
  const controlTabIndex = expanded && shown ? 0 : -1
  const { left, right } = navigationActions({
    session,
    viewportRelation,
    onPlayFromCurrentPosition,
    onReturnToPlaybackPosition,
  })
  const LeftActionIcon = left.icon
  const RightActionIcon = right.icon

  const startOrStop = () => {
    if (expanded) {
      if (settingsOpen) onToggleSettings()
      session.stop()
      setExpanded(false)
      return
    }
    setExpanded(true)
  }

  return (
    <section
      aria-label={t("reader.tts.controls")}
      data-active={expanded}
      data-visible={shown}
      data-viewport-detached={session.viewportDetached}
      data-viewport-relation={viewportRelation ?? "attached"}
      data-testid="reader-tts-controls"
      className="reader-tts-mini-player"
    >
      {expanded && preparing ? (
        <div
          className="reader-tts-mini-status"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          <span>{preparationLabel}</span>
        </div>
      ) : null}
      <div className="reader-tts-mini-controls">
        <button
          type="button"
          className="reader-chrome-icon-btn reader-tts-mini-control"
          aria-label={t("reader.tts.settings")}
          aria-expanded={settingsOpen}
          aria-haspopup="dialog"
          aria-hidden={!expanded}
          tabIndex={controlTabIndex}
          data-active={settingsOpen}
          data-shape="circle"
          onClick={onToggleSettings}
        >
          <Settings2 className="size-[17px]" aria-hidden />
        </button>
        <button
          type="button"
          className="reader-chrome-icon-btn reader-tts-mini-control"
          aria-label={t(left.label)}
          aria-hidden={!expanded}
          tabIndex={controlTabIndex}
          data-testid="reader-tts-left-action"
          data-shape="circle"
          onClick={left.onClick}
          disabled={!session.available}
        >
          <span
            key={`left-${viewportRelation ?? "attached"}`}
            className="reader-tts-mini-control-icon"
          >
            <LeftActionIcon className="size-[17px]" aria-hidden />
          </span>
        </button>
        <button
          type="button"
          className="reader-chrome-icon-btn reader-tts-mini-control"
          aria-label={t(playing ? "reader.tts.pause" : "reader.tts.play")}
          aria-hidden={!expanded}
          tabIndex={controlTabIndex}
          data-active={playing ? "true" : undefined}
          data-shape="circle"
          onClick={playing ? session.pause : () => (onPlay ?? session.play)()}
          disabled={!session.available}
        >
          <PlaybackIcon preparing={preparing} playing={playing} />
        </button>
        <button
          type="button"
          className="reader-chrome-icon-btn reader-tts-mini-control"
          aria-label={t(right.label)}
          aria-hidden={!expanded}
          tabIndex={controlTabIndex}
          data-testid="reader-tts-right-action"
          data-shape="circle"
          onClick={right.onClick}
          disabled={!session.available}
        >
          <span
            key={`right-${viewportRelation ?? "attached"}`}
            className="reader-tts-mini-control-icon"
          >
            <RightActionIcon className="size-[17px]" aria-hidden />
          </span>
        </button>
        <button
          type="button"
          className="reader-chrome-icon-btn reader-tts-mini-control"
          aria-label={t(
            expanded ? "reader.tts.stop" : "reader.tts.openControls",
          )}
          tabIndex={shown ? 0 : -1}
          data-shape="circle"
          onClick={startOrStop}
          disabled={!session.available || (!expanded && preparing)}
        >
          <ExpandIcon preparing={preparing} expanded={expanded} />
        </button>
      </div>
    </section>
  )
}

function navigationActions({
  session,
  viewportRelation,
  onPlayFromCurrentPosition,
  onReturnToPlaybackPosition,
}: Pick<
  ReaderTtsControlsProps,
  | "session"
  | "viewportRelation"
  | "onPlayFromCurrentPosition"
  | "onReturnToPlaybackPosition"
>) {
  if (viewportRelation === "after") {
    return {
      left: {
        icon: Undo2,
        label: "reader.tts.returnToPlaybackPosition",
        onClick: onReturnToPlaybackPosition,
      },
      right: {
        icon: FastForward,
        label: "reader.tts.playFromCurrentPosition",
        onClick: onPlayFromCurrentPosition,
      },
    } as const
  }
  if (viewportRelation === "before") {
    return {
      left: {
        icon: Rewind,
        label: "reader.tts.playFromCurrentPosition",
        onClick: onPlayFromCurrentPosition,
      },
      right: {
        icon: Redo2,
        label: "reader.tts.returnToPlaybackPosition",
        onClick: onReturnToPlaybackPosition,
      },
    } as const
  }
  return {
    left: {
      icon: SkipBack,
      label: "reader.tts.previousSentence",
      onClick: session.previous,
    },
    right: {
      icon: SkipForward,
      label: "reader.tts.nextSentence",
      onClick: session.next,
    },
  } as const
}

function PlaybackIcon({
  preparing,
  playing,
}: {
  preparing: boolean
  playing: boolean
}) {
  if (preparing)
    return <Loader2 className="size-[17px] animate-spin" aria-hidden />
  if (playing) return <Pause className="size-[17px]" aria-hidden />
  return <Play className="size-[17px]" aria-hidden />
}

function ExpandIcon({
  preparing,
  expanded,
}: {
  preparing: boolean
  expanded: boolean
}) {
  if (!expanded && preparing)
    return <Loader2 className="size-[17px] animate-spin" aria-hidden />
  if (expanded) return <Square className="size-[15px]" aria-hidden />
  return <Headphones className="size-[18px]" aria-hidden />
}
