import {
  AudioLines,
  Loader2,
  Pause,
  Play,
  Settings2,
  SkipBack,
  SkipForward,
  Square,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { EpubTtsSession } from "@/hooks/reader/useEpubTtsSession"
import { cn } from "@/lib/utils"

type ReaderTtsControlsProps = {
  session: EpubTtsSession
  visible: boolean
  settingsOpen: boolean
  onToggleSettings: () => void
  onExpandedChange: (expanded: boolean) => void
}

export function ReaderTtsControls({
  session,
  visible,
  settingsOpen,
  onToggleSettings,
  onExpandedChange,
}: ReaderTtsControlsProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (session.state === "playing" || session.state === "paused") {
      setExpanded(true)
    }
  }, [session.state])

  useEffect(() => {
    onExpandedChange(expanded)
  }, [expanded, onExpandedChange])

  useEffect(
    () => () => {
      onExpandedChange(false)
    },
    [onExpandedChange],
  )

  if (!session.available && !session.loading) return null

  const playing = session.state === "playing"
  const preparing = session.loading || session.state === "loading"
  const preparationLabel = t(
    session.remote ? "reader.tts.generating" : "reader.tts.loading",
  )
  const shown = visible || expanded || settingsOpen
  const controlTabIndex = expanded && shown ? 0 : -1

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
      data-active={expanded ? "true" : "false"}
      data-visible={shown ? "true" : "false"}
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
          className="reader-tts-mini-control"
          aria-label={t("reader.tts.settings")}
          aria-expanded={settingsOpen}
          aria-haspopup="dialog"
          aria-hidden={!expanded}
          tabIndex={controlTabIndex}
          data-active={settingsOpen ? "true" : "false"}
          onClick={onToggleSettings}
        >
          <Settings2 className="size-[17px]" aria-hidden />
        </button>
        <button
          type="button"
          className="reader-tts-mini-control"
          aria-label={t("reader.tts.previousSentence")}
          aria-hidden={!expanded}
          tabIndex={controlTabIndex}
          onClick={session.previous}
          disabled={!session.available}
        >
          <SkipBack className="size-[17px]" aria-hidden />
        </button>
        <button
          type="button"
          className="reader-tts-mini-control"
          aria-label={t(playing ? "reader.tts.pause" : "reader.tts.play")}
          aria-hidden={!expanded}
          tabIndex={controlTabIndex}
          data-role="playback"
          onClick={playing ? session.pause : session.play}
          disabled={!session.available}
        >
          {preparing ? (
            <Loader2 className="size-[17px] animate-spin" aria-hidden />
          ) : playing ? (
            <Pause className="size-[17px]" aria-hidden />
          ) : (
            <Play className="size-[17px]" aria-hidden />
          )}
        </button>
        <button
          type="button"
          className="reader-tts-mini-control"
          aria-label={t("reader.tts.nextSentence")}
          aria-hidden={!expanded}
          tabIndex={controlTabIndex}
          onClick={session.next}
          disabled={!session.available}
        >
          <SkipForward className="size-[17px]" aria-hidden />
        </button>
        <button
          type="button"
          className={cn(
            "reader-tts-mini-control",
            !expanded && "reader-tts-mini-trigger",
          )}
          aria-label={t(
            expanded ? "reader.tts.stop" : "reader.tts.openControls",
          )}
          tabIndex={shown ? 0 : -1}
          onClick={startOrStop}
          disabled={!session.available || (!expanded && preparing)}
        >
          {!expanded && preparing ? (
            <Loader2 className="size-[17px] animate-spin" aria-hidden />
          ) : expanded ? (
            <Square className="size-[15px]" aria-hidden />
          ) : (
            <AudioLines className="size-[18px]" aria-hidden />
          )}
        </button>
      </div>
    </section>
  )
}
