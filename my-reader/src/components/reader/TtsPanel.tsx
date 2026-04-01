import {
  AudioLines,
  Check,
  ChevronUp,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { DEFAULT_TTS_CONFIGS, type TtsConfig } from "./types"

interface TtsPanelProps {
  visible: boolean
  playing: boolean
  speed: number
  configId: string
  onTogglePlay: () => void
  onPrev: () => void
  onNext: () => void
  onSpeedChange: (speed: number) => void
  onConfigChange: (id: string) => void
}

export function TtsPanel({
  visible,
  playing,
  speed,
  configId,
  onTogglePlay,
  onPrev,
  onNext,
  onSpeedChange,
  onConfigChange,
}: TtsPanelProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentConfig =
    DEFAULT_TTS_CONFIGS.find((c) => c.id === configId) ?? DEFAULT_TTS_CONFIGS[0]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("click", handler)
    return () => document.removeEventListener("click", handler)
  }, [])

  const selectConfig = useCallback(
    (config: TtsConfig) => {
      onConfigChange(config.id)
      setDropdownOpen(false)
    },
    [onConfigChange],
  )

  return (
    <div
      className="absolute inset-x-0 bottom-16 z-40 flex flex-col gap-3 border-t px-6 pt-4 pb-3.5 transition-opacity duration-300 ease-out"
      style={{
        background: "var(--reader-panel-bg)",
        borderColor: "var(--reader-chrome-border)",
        boxShadow: "0 -4px 16px oklch(0.35 0.04 55 / 0.08)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* Play controls */}
      <div className="flex items-center justify-center gap-4">
        <TtsNavBtn onClick={onPrev}>
          <SkipBack className="size-4" />
          上一句
        </TtsNavBtn>

        <button
          type="button"
          onClick={onTogglePlay}
          className="flex size-12 items-center justify-center rounded-full border-none transition-all hover:brightness-110 active:scale-90"
          style={{
            background: "var(--reader-chrome-active)",
            color: "var(--reader-bg)",
            boxShadow: "0 2px 8px oklch(0.35 0.04 55 / 0.15)",
          }}
        >
          {playing ? (
            <Pause className="size-[22px]" />
          ) : (
            <Play className="size-[22px]" />
          )}
        </button>

        <TtsNavBtn onClick={onNext}>
          下一句
          <SkipForward className="size-4" />
        </TtsNavBtn>
      </div>

      {/* Speed & config */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        <div
          className="flex items-center gap-2 text-xs"
          style={{ color: "var(--reader-chrome-muted)" }}
        >
          <span className="whitespace-nowrap font-medium">语速</span>
          <span
            className="min-w-[28px] text-center font-mono text-xs"
            style={{ color: "var(--reader-chrome-fg)" }}
          >
            0.5x
          </span>
          <input
            type="range"
            className="tts-speed-slider"
            min="0.5"
            max="2.0"
            step="0.1"
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
          />
          <span
            className="min-w-[28px] text-center font-mono text-xs font-medium"
            style={{ color: "var(--reader-chrome-fg)" }}
          >
            {speed.toFixed(1)}x
          </span>
          <span
            className="min-w-[28px] text-center font-mono text-xs"
            style={{ color: "var(--reader-chrome-fg)" }}
          >
            2.0x
          </span>
        </div>

        {/* Voice config */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-[13px] transition-all"
            style={{
              borderColor: "var(--reader-chrome-border)",
              background: "transparent",
              color: "var(--reader-chrome-fg)",
              fontFamily: "inherit",
            }}
            onClick={(e) => {
              e.stopPropagation()
              setDropdownOpen((p) => !p)
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--reader-chrome-hover)"
              e.currentTarget.style.borderColor = "var(--reader-chrome-active)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent"
              e.currentTarget.style.borderColor = "var(--reader-chrome-border)"
            }}
          >
            <AudioLines className="size-3.5 opacity-60" />
            <span>{currentConfig.name}</span>
            <ChevronUp className="size-3 opacity-50" />
          </button>

          {dropdownOpen && (
            <div
              className="reader-dropdown-enter absolute bottom-[calc(100%+8px)] right-0 z-60 min-w-[220px] overflow-hidden rounded-[10px] border"
              style={{
                background: "var(--reader-panel-bg)",
                borderColor: "var(--reader-chrome-border)",
                boxShadow: "0 8px 24px oklch(0.35 0.04 55 / 0.12)",
              }}
            >
              {DEFAULT_TTS_CONFIGS.map((config) => (
                <button
                  key={config.id}
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13.5px] transition-colors"
                  style={{
                    color:
                      config.id === configId
                        ? "var(--reader-chrome-active)"
                        : "var(--reader-chrome-fg)",
                    fontWeight: config.id === configId ? 550 : 400,
                  }}
                  onClick={() => selectConfig(config)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      "var(--reader-chrome-hover)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent"
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{config.name}</div>
                    <div
                      className="mt-px text-[11.5px]"
                      style={{ color: "var(--reader-chrome-muted)" }}
                    >
                      {config.description}
                    </div>
                  </div>
                  <span className="w-4 shrink-0">
                    {config.id === configId && <Check className="size-3.5" />}
                  </span>
                </button>
              ))}
              <div
                className="h-px"
                style={{ background: "var(--reader-chrome-border)" }}
              />
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[13.5px] font-medium transition-colors"
                style={{ color: "var(--reader-chrome-active)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "var(--reader-chrome-hover)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent"
                }}
              >
                <Plus className="size-3.5" />
                <span>管理配置…</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TtsNavBtn({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg border-none px-4 py-2 text-[13px] transition-all active:scale-95"
      style={{
        background: "transparent",
        color: "var(--reader-chrome-muted)",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--reader-chrome-hover)"
        e.currentTarget.style.color = "var(--reader-chrome-fg)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent"
        e.currentTarget.style.color = "var(--reader-chrome-muted)"
      }}
    >
      {children}
    </button>
  )
}
