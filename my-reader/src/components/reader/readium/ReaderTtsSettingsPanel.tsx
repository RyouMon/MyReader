import { formatTtsLanguageName } from "@my-reader/tools/reader-tts-language"
import { ChevronRight, Loader2, Server, Settings2 } from "lucide-react"
import type { CSSProperties } from "react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ReaderSettingsRangeControl } from "@/components/reader/shared/ReaderSettingsRangeControl"
import { readerChromeThemeStyle } from "@/components/reader/shared/ReaderChromeShell"
import {
  READER_SETTINGS_CONTENT_CLASS,
  READER_SETTINGS_LABEL_CLASS,
  READER_SETTINGS_VALUE_CLASS,
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
  ReaderSidePanelScrollArea,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import { TtsProviderManager } from "@/components/settings/sections/SpeechSection"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { EpubTtsSession } from "@/hooks/reader/useEpubTtsSession"
import { api } from "@/lib/tauri-api"
import { errorMessage } from "@/lib/error-presentation"
import type {
  TtsConfigDto,
  TtsPlaybackPreferencesDto,
} from "@/lib/tauri-specta"
import { notifyTtsConfigChanged } from "@/lib/tts/events"

type ReaderTtsSettingsPanelProps = {
  visible: boolean
  session: EpubTtsSession
  theme?: string
}

const RANGE_INPUT_CLASS = "reader-settings-range disabled:opacity-50"
const SETTINGS_EVENT_SOURCE = "reader-tts-settings"
const rangeStyle = (value: number, min: number, max: number): CSSProperties =>
  ({
    "--reader-settings-range-progress": `${((value - min) / (max - min)) * 100}%`,
  }) as CSSProperties

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
}: ReaderTtsSettingsPanelProps) {
  const { t, i18n } = useTranslation()
  const interfaceLanguage = i18n?.resolvedLanguage || i18n?.language || "en"
  const [config, setConfig] = useState<TtsConfigDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<"settings" | "providers">("settings")
  const themeStyle = useMemo(() => readerChromeThemeStyle(theme), [theme])

  useEffect(() => {
    if (!visible) {
      setView("settings")
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
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
    return () => {
      cancelled = true
    }
  }, [visible])

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

  return (
    <ReaderSidePanelFrame visible={visible} side="right">
      <ReaderSidePanelHeader
        title={
          view === "providers"
            ? t("reader.tts.manageProviders")
            : t("reader.tts.settings")
        }
        icon={view === "providers" ? Server : Settings2}
        onBack={view === "providers" ? () => setView("settings") : undefined}
        backLabel={t("common.back")}
      />
      <ReaderSidePanelScrollArea className={READER_SETTINGS_CONTENT_CLASS}>
        {loading ? (
          <div className="grid min-h-36 place-items-center" role="status">
            <Loader2 className="size-5 animate-spin text-reader-chrome-muted" />
          </div>
        ) : null}

        {error ? (
          <p
            className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {!loading && config && view === "providers" ? (
          <TtsProviderManager
            config={config}
            onConfigChange={applyConfig}
            showPreview
            themeStyle={themeStyle}
          />
        ) : null}

        {!loading && config && view === "settings" ? (
          <>
            <ReaderTtsEngineSelect
              config={config}
              saving={saving}
              themeStyle={themeStyle}
              selectEngine={selectEngine}
            />

            <section className="flex flex-col gap-2">
              <Label
                className={READER_SETTINGS_LABEL_CLASS}
                htmlFor="reader-tts-voice"
              >
                {t("reader.tts.voice")}
              </Label>
              <Select
                value={session.currentVoiceId}
                disabled={session.voices.length === 0}
                onValueChange={session.setVoice}
              >
                <SelectTrigger
                  id="reader-tts-voice"
                  aria-label={t("reader.tts.voice")}
                  className="reader-tts-themed-trigger w-full"
                >
                  <SelectValue placeholder={t("reader.tts.loadingVoices")} />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  align="start"
                  style={themeStyle}
                >
                  <SelectGroup>
                    {session.voices.map((voice) => (
                      <SelectItem key={voiceId(voice)} value={voiceId(voice)}>
                        {voice.label || voice.name} ·{" "}
                        {formatTtsLanguageName(
                          voice.language,
                          interfaceLanguage,
                        )}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </section>

            <section className="flex flex-col gap-4 rounded-md bg-[var(--reader-chrome-segment-idle)] p-3">
              <ReaderSettingsRangeControl
                id="reader-tts-speed"
                label={t("reader.tts.speed")}
                value={session.speed}
                min={0.5}
                max={3}
                step={0.1}
                className={RANGE_INPUT_CLASS}
                labelClassName={READER_SETTINGS_LABEL_CLASS}
                valueClassName={READER_SETTINGS_VALUE_CLASS}
                formatValue={(value) => `${value.toFixed(1)}×`}
                rangeStyle={rangeStyle}
                onCommit={updateSpeed}
              />
              <ReaderSettingsRangeControl
                id="reader-tts-pitch"
                label={t("reader.tts.pitch")}
                value={finitePreference(config.playback.pitch, 1)}
                min={0.5}
                max={2}
                step={0.1}
                className={RANGE_INPUT_CLASS}
                labelClassName={READER_SETTINGS_LABEL_CLASS}
                valueClassName={READER_SETTINGS_VALUE_CLASS}
                formatValue={(value) => value.toFixed(1)}
                rangeStyle={rangeStyle}
                onCommit={(pitch) => void updatePlayback({ pitch })}
              />
            </section>

            <ReaderPlaybackSwitch
              id="reader-tts-skip-page-breaks"
              label={t("reader.tts.skipPageBreaks")}
              description={t("reader.tts.skipPageBreaksDescription")}
              checked={config.playback.skipPageBreaks}
              disabled={saving}
              onCheckedChange={(skipPageBreaks) =>
                void updatePlayback({ skipPageBreaks })
              }
            />
            <ReaderPlaybackSwitch
              id="reader-tts-skip-footnotes"
              label={t("reader.tts.skipFootnotes")}
              description={t("reader.tts.skipFootnotesDescription")}
              checked={config.playback.skipFootnotes}
              disabled={saving}
              onCheckedChange={(skipFootnotes) =>
                void updatePlayback({ skipFootnotes })
              }
            />

            <button
              type="button"
              className="flex h-11 w-full items-center justify-between rounded-md bg-[var(--reader-chrome-segment-idle)] px-3 text-[13px] font-medium text-reader-chrome-fg transition-colors hover:bg-[var(--reader-chrome-segment-active)]"
              onClick={() => setView("providers")}
            >
              <span>{t("reader.tts.manageProviders")}</span>
              <ChevronRight
                className="size-4 text-reader-chrome-muted"
                aria-hidden
              />
            </button>
          </>
        ) : null}
      </ReaderSidePanelScrollArea>
    </ReaderSidePanelFrame>
  )
}

function ReaderPlaybackSwitch({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <section className="flex min-h-14 items-center justify-between gap-4 rounded-md bg-[var(--reader-chrome-segment-idle)] px-3 py-2">
      <div className="min-w-0 flex-1">
        <Label
          htmlFor={id}
          className="text-[13px] font-medium text-reader-chrome-fg"
        >
          {label}
        </Label>
        <p className="mt-0.5 text-[11px] leading-4 text-reader-chrome-muted">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </section>
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
      <Label
        className={READER_SETTINGS_LABEL_CLASS}
        htmlFor="reader-tts-engine"
      >
        {t("reader.tts.engine")}
      </Label>
      <Select
        value={
          config.defaultEngine.kind === "provider"
            ? config.defaultEngine.profileId
            : "system"
        }
        disabled={saving}
        onValueChange={(value) =>
          void selectEngine(value === "system" ? undefined : value)
        }
      >
        <SelectTrigger
          id="reader-tts-engine"
          aria-label={t("reader.tts.engine")}
          className="reader-tts-themed-trigger w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start" style={themeStyle}>
          <SelectGroup>
            <SelectItem value="system">
              {t("reader.tts.systemEngine")}
            </SelectItem>
            {config.profiles.map((profile) => (
              <SelectItem
                key={profile.id}
                value={profile.id}
                disabled={!profile.enabled}
              >
                {profile.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </section>
  )
}
