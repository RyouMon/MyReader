import { formatTtsLanguageName } from "@my-reader/tools/reader-tts-language"
import { ChevronRight, Loader2, Settings2 } from "lucide-react"
import type { CSSProperties } from "react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { FormSelect, FormSelectItem } from "@/components/common/FormSelect"
import { FormSlider } from "@/components/common/FormSlider"
import { FormSwitch } from "@/components/common/FormSwitch"
import { VoiceSelect } from "@/components/common/VoiceSelect"
import { readerChromeThemeStyle } from "@/components/reader/shared/ReaderChromeShell"
import {
  READER_SETTINGS_CONTENT_CLASS,
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
  ReaderSidePanelScrollArea,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { TTS_PITCH_RANGE, TTS_SPEED_RANGE } from "@/constants/tts"
import type { EpubTtsSession } from "@/hooks/reader/useEpubTtsSession"
import { useTtsPreviewPlayer } from "@/hooks/useTtsPreviewPlayer"
import { errorMessage } from "@/lib/error-presentation"
import type { CharacterIntroduction } from "@/lib/readium/characterIntroductions"
import { openTtsProviderSettings } from "@/lib/settingsWindow"
import { api } from "@/lib/tauri-api"
import type {
  TtsConfigDto,
  TtsPlaybackPreferencesDto,
} from "@/lib/tauri-specta"
import { notifyTtsConfigChanged } from "@/lib/tts/events"
import {
  BookNarrationSettings,
  type NarrationBook,
  type NarrationSubview,
} from "./BookNarrationSettings"

type ReaderTtsSettingsPanelProps = {
  visible: boolean
  session: EpubTtsSession
  theme?: string
  book?: NarrationBook
  findIntroductions?: () => Promise<CharacterIntroduction[]>
}

const SETTINGS_EVENT_SOURCE = "reader-tts-settings"

function finitePreference(value: number | null, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function voiceId(voice: EpubTtsSession["voices"][number]): string {
  return voice.identifier ?? voice.voiceURI ?? voice.originalName ?? voice.name
}

export function ReaderTtsSettingsPanel({
  visible,
  session,
  theme,
  book,
  findIntroductions,
}: ReaderTtsSettingsPanelProps) {
  const { t, i18n } = useTranslation()
  const interfaceLanguage = i18n?.resolvedLanguage || i18n?.language || "en"
  const [config, setConfig] = useState<TtsConfigDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [narrationView, setNarrationView] = useState<NarrationSubview | null>(
    null,
  )
  const themeStyle = useMemo(() => readerChromeThemeStyle(theme), [theme])

  useEffect(() => {
    if (!visible) {
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const refresh = () => {
      void api
        .getTtsConfig()
        .then((next) => {
          if (!cancelled) setConfig(next)
        })
        .catch((loadError: unknown) => {
          if (!cancelled) setError(errorMessage(loadError))
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    refresh()
    window.addEventListener("focus", refresh)
    return () => {
      window.removeEventListener("focus", refresh)
      cancelled = true
    }
  }, [visible])

  const { preview, previewVoiceId, stopPreview } = useTtsPreviewPlayer({
    config,
    engineId:
      config?.defaultEngine.kind === "provider"
        ? config.defaultEngine.profileId
        : "system",
    voiceId: session.currentVoiceId,
    onError: setError,
  })
  useEffect(() => {
    if (!visible || narrationView) stopPreview()
  }, [visible, narrationView, stopPreview])

  const applyConfig = async (
    next: Awaited<ReturnType<typeof api.getTtsConfig>>,
  ) => {
    setConfig(next)
    await notifyTtsConfigChanged(SETTINGS_EVENT_SOURCE)
  }

  const selectEngine = async (profileId?: string) => {
    setSaving(true)
    setError(null)
    try {
      await applyConfig(
        await api.setTtsDefaultEngine(
          profileId ? { kind: "provider", profileId } : { kind: "system" },
        ),
      )
    } catch (saveError: unknown) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const updatePlayback = async (patch: Partial<TtsPlaybackPreferencesDto>) => {
    if (!config) return
    const previous = config
    const playback = { ...config.playback, ...patch }
    setConfig({ ...config, playback })
    setSaving(true)
    setError(null)
    try {
      await applyConfig(await api.setTtsPlaybackPreferences(playback))
    } catch (saveError: unknown) {
      setConfig(previous)
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const updateSpeed = (speed: number) => {
    if (!config) return
    setConfig({
      ...config,
      playback: { ...config.playback, speed },
    })
    session.setSpeed(speed)
  }

  const controls = config ? (
    <>
      {book ? <Separator className="bg-reader-chrome-border" /> : null}
      <ReaderTtsEngineSelect
        config={config}
        saving={saving}
        themeStyle={themeStyle}
        selectEngine={selectEngine}
      />

      <section className="flex flex-col gap-2">
        <VoiceSelect
          value={session.currentVoiceId}
          disabled={session.voices.length === 0}
          onValueChange={session.setVoice}
          id="reader-tts-voice"
          label={t("reader.tts.voice")}
          labelMode="external"
          placeholder={t("reader.tts.loadingVoices")}
          themeStyle={themeStyle}
          previewVoiceId={previewVoiceId}
          onPreview={(id) => {
            session.pause()
            void preview(id)
          }}
          onStopPreview={stopPreview}
          options={session.voices.map((voice) => ({
            value: voiceId(voice),
            label: `${voice.label || voice.name} · ${formatTtsLanguageName(voice.language, interfaceLanguage)}`,
          }))}
        />
      </section>

      <section className="flex flex-col gap-4">
        <FormSlider
          {...TTS_SPEED_RANGE}
          id="reader-tts-speed"
          label={t("reader.tts.speed")}
          value={session.speed}
          themeStyle={themeStyle}
          formatValue={(value) => `${value.toFixed(1)}×`}
          onCommit={updateSpeed}
        />
        <FormSlider
          {...TTS_PITCH_RANGE}
          id="reader-tts-pitch"
          label={t("reader.tts.pitch")}
          value={finitePreference(config.playback.pitch, 1)}
          themeStyle={themeStyle}
          formatValue={(value) => value.toFixed(1)}
          onCommit={(pitch) => void updatePlayback({ pitch })}
        />
      </section>

      <Separator className="bg-reader-chrome-border" />

      <FormSwitch
        align="between"
        id="reader-tts-skip-page-breaks"
        label={t("reader.tts.skipPageBreaks")}
        description={t("reader.tts.skipPageBreaksDescription")}
        checked={config.playback.skipPageBreaks}
        disabled={saving}
        onCheckedChange={(skipPageBreaks) =>
          void updatePlayback({ skipPageBreaks })
        }
      />
      <FormSwitch
        align="between"
        id="reader-tts-skip-footnotes"
        label={t("reader.tts.skipFootnotes")}
        description={t("reader.tts.skipFootnotesDescription")}
        checked={config.playback.skipFootnotes}
        disabled={saving}
        onCheckedChange={(skipFootnotes) =>
          void updatePlayback({ skipFootnotes })
        }
      />

      <Button
        type="button"
        variant="ghost"
        style={themeStyle}
        className="w-full justify-between text-reader-chrome-fg"
        onClick={() =>
          void openTtsProviderSettings().catch((error: unknown) =>
            setError(errorMessage(error)),
          )
        }
      >
        <span>{t("ttsSettings.manageProviders")}</span>
        <ChevronRight className="size-4 text-reader-chrome-muted" aria-hidden />
      </Button>
    </>
  ) : null

  return (
    <ReaderSidePanelFrame visible={visible} side="right">
      <ReaderSidePanelHeader
        title={narrationView?.title ?? t("reader.tts.settings")}
        icon={Settings2}
        onBack={narrationView?.onBack}
        backLabel={t("common.back")}
      />
      {error ? (
        <p
          className="m-4 select-text whitespace-pre-wrap break-words rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {loading ? (
        <div className="grid min-h-36 place-items-center" role="status">
          <Loader2 className="size-5 animate-spin text-reader-chrome-muted" />
        </div>
      ) : config ? (
        book ? (
          <BookNarrationSettings
            key={`${book.libraryId}:${book.bookId}`}
            book={book}
            readingPlan={session.readingPlan}
            config={config}
            readingVoice={
              config.defaultEngine.kind === "provider"
                ? {
                    engine: "provider",
                    profileId: config.defaultEngine.profileId,
                    voiceId: session.currentVoiceId,
                  }
                : { engine: "system", voiceId: session.currentVoiceId }
            }
            themeStyle={themeStyle}
            findIntroductions={findIntroductions}
            onSubviewChange={setNarrationView}
          >
            {controls}
          </BookNarrationSettings>
        ) : (
          <ReaderSidePanelScrollArea className={READER_SETTINGS_CONTENT_CLASS}>
            {controls}
          </ReaderSidePanelScrollArea>
        )
      ) : null}
    </ReaderSidePanelFrame>
  )
}

function ReaderTtsEngineSelect({
  config,
  saving,
  themeStyle,
  selectEngine,
}: {
  config: Awaited<ReturnType<typeof api.getTtsConfig>>
  saving: boolean
  themeStyle: CSSProperties | undefined
  selectEngine: (profileId?: string) => Promise<void>
}) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-2">
      <FormSelect
        value={
          config.defaultEngine.kind === "provider"
            ? config.defaultEngine.profileId
            : "system"
        }
        disabled={saving}
        onValueChange={(value) =>
          void selectEngine(value === "system" ? undefined : value)
        }
        id="reader-tts-engine"
        label={t("reader.tts.engine")}
        labelMode="external"
        themeStyle={themeStyle}
      >
        <FormSelectItem value="system">
          {t("reader.tts.systemEngine")}
        </FormSelectItem>
        {config.profiles.map((profile) => (
          <FormSelectItem key={profile.id} value={profile.id}>
            {`${profile.name}/${profile.model}`}
          </FormSelectItem>
        ))}
      </FormSelect>
    </section>
  )
}
