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

import { cn } from "@/lib/utils"

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
      className={cn(
        "reader-chrome-panel-aside reader-chrome-panel-shadow-up absolute inset-x-0 bottom-16 z-40 flex flex-col gap-3 border-t border-reader-chrome-border px-6 pt-4 pb-3.5 transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="flex items-center justify-center gap-4">
        <TtsNavBtn onClick={onPrev}>
          <SkipBack className="size-4" />
          上一句
        </TtsNavBtn>

        <button
          type="button"
          onClick={onTogglePlay}
          className="flex size-12 items-center justify-center rounded-full border-none bg-reader-chrome-active text-reader-bg shadow-[0_2px_8px_oklch(0.35_0.04_55_/_0.15)] transition-all hover:brightness-110 active:scale-90"
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

      <div className="flex flex-wrap items-center justify-center gap-4">
        <div className="flex items-center gap-2 text-xs text-reader-chrome-muted">
          <span className="whitespace-nowrap font-medium">语速</span>
          <span className="min-w-[28px] text-center font-mono text-xs text-reader-chrome-fg">
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
          <span className="min-w-[28px] text-center font-mono text-xs font-medium text-reader-chrome-fg">
            {speed.toFixed(1)}x
          </span>
          <span className="min-w-[28px] text-center font-mono text-xs text-reader-chrome-fg">
            2.0x
          </span>
        </div>

        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            className="reader-chrome-outline-btn flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-[13px]"
            onClick={(e) => {
              e.stopPropagation()
              setDropdownOpen((p) => !p)
            }}
          >
            <AudioLines className="size-3.5 opacity-60" />
            <span>{currentConfig.name}</span>
            <ChevronUp className="size-3 opacity-50" />
          </button>

          {dropdownOpen && (
            <div className="reader-chrome-panel-aside reader-dropdown-enter absolute bottom-[calc(100%+8px)] right-0 z-60 min-w-[220px] overflow-hidden rounded-[10px] border border-reader-chrome-border shadow-[0_8px_24px_oklch(0.35_0.04_55_/_0.12)]">
              {DEFAULT_TTS_CONFIGS.map((config) => (
                <button
                  key={config.id}
                  type="button"
                  className="reader-chrome-dropdown-item flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13.5px]"
                  data-active={config.id === configId ? "true" : undefined}
                  onClick={() => selectConfig(config)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{config.name}</div>
                    <div className="reader-chrome-dropdown-item-muted mt-px text-[11.5px]">
                      {config.description}
                    </div>
                  </div>
                  <span className="w-4 shrink-0">
                    {config.id === configId && <Check className="size-3.5" />}
                  </span>
                </button>
              ))}
              <div className="h-px bg-reader-chrome-border" />
              <button
                type="button"
                className="reader-chrome-dropdown-item-accent flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[13.5px]"
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
    <button type="button" onClick={onClick} className="reader-chrome-text-btn">
      {children}
    </button>
  )
}
