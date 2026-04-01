import { Check, Settings } from "lucide-react"

import { cn } from "@/lib/utils"

import {
  READER_FONTS,
  READER_THEMES,
  type ReaderSettings,
  type ReaderTheme,
} from "./types"

interface SettingsPanelProps {
  visible: boolean
  settings: ReaderSettings
  onThemeChange: (theme: ReaderTheme) => void
  onSettingsChange: (patch: Partial<ReaderSettings>) => void
}

export function SettingsPanel({
  visible,
  settings,
  onThemeChange,
  onSettingsChange,
}: SettingsPanelProps) {
  return (
    <aside
      className="absolute inset-y-0 right-0 z-60 flex w-[300px] flex-col overflow-y-auto border-l transition-all duration-300 ease-out"
      style={{
        background: "var(--reader-panel-bg)",
        borderColor: "var(--reader-chrome-border)",
        boxShadow: "-8px 0 24px oklch(0.35 0.04 55 / 0.10)",
        transform: visible ? "translateX(0)" : "translateX(100%)",
        opacity: visible ? 1 : 0,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 border-b px-5 py-4 text-[15px] font-semibold"
        style={{
          fontFamily: "'Lora', 'Noto Serif SC', serif",
          color: "var(--reader-chrome-fg)",
          borderColor: "var(--reader-chrome-border)",
        }}
      >
        <Settings className="size-[18px] opacity-60" />
        阅读设置
      </div>

      {/* Theme */}
      <SettingsSection title="主题">
        <div className="grid grid-cols-4 gap-2">
          {READER_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onThemeChange(t.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-[10px] border-2 px-1.5 py-2.5 transition-all",
              )}
              style={{
                borderColor:
                  settings.theme === t.id
                    ? "var(--reader-chrome-active)"
                    : "transparent",
                background: "transparent",
              }}
              onMouseEnter={(e) => {
                if (settings.theme !== t.id)
                  e.currentTarget.style.background =
                    "var(--reader-chrome-hover)"
              }}
              onMouseLeave={(e) => {
                if (settings.theme !== t.id)
                  e.currentTarget.style.background = "transparent"
              }}
            >
              <div
                className="flex size-8 items-center justify-center rounded-full border text-sm"
                style={{
                  background: t.swatch,
                  borderColor: "var(--reader-chrome-border)",
                  color: t.swatchFg,
                }}
              >
                {t.icon}
              </div>
              <span
                className="text-[11px] font-medium"
                style={{ color: "var(--reader-chrome-fg)" }}
              >
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* Font */}
      <SettingsSection title="字体">
        <div className="flex flex-col gap-1.5">
          {READER_FONTS.map((font) => {
            const isActive = settings.fontFamily === font.value
            return (
              <button
                key={font.value}
                type="button"
                onClick={() => onSettingsChange({ fontFamily: font.value })}
                className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-all"
                style={{
                  borderColor: isActive
                    ? "var(--reader-chrome-active)"
                    : "transparent",
                  background: isActive
                    ? "color-mix(in srgb, var(--reader-chrome-active) 8%, transparent)"
                    : "transparent",
                  color: isActive
                    ? "var(--reader-chrome-active)"
                    : "var(--reader-chrome-fg)",
                  fontFamily: font.value,
                  fontWeight: isActive ? 500 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!isActive)
                    e.currentTarget.style.background =
                      "var(--reader-chrome-hover)"
                }}
                onMouseLeave={(e) => {
                  if (!isActive)
                    e.currentTarget.style.background = "transparent"
                }}
              >
                <span className="flex-1">{font.label}</span>
                <span className="w-4">
                  {isActive && <Check className="size-3.5" />}
                </span>
              </button>
            )
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="阅读方式">
        <div className="flex gap-2">
          <LayoutChoice
            label="翻页"
            active={settings.readingLayout === "paginate"}
            onClick={() => onSettingsChange({ readingLayout: "paginate" })}
          />
          <LayoutChoice
            label="滚动"
            active={settings.readingLayout === "scroll"}
            onClick={() => onSettingsChange({ readingLayout: "scroll" })}
          />
        </div>
      </SettingsSection>

      {/* Typography */}
      <SettingsSection title="排版">
        <SettingSlider
          label="字号"
          min={14}
          max={28}
          step={1}
          value={settings.fontSize}
          displayValue={String(settings.fontSize)}
          leftHint={<span className="text-xs">A</span>}
          rightHint={<span className="text-xl">A</span>}
          onChange={(v) => onSettingsChange({ fontSize: v })}
        />
        <SettingSlider
          label="行距"
          min={1.4}
          max={2.4}
          step={0.05}
          value={settings.lineHeight}
          displayValue={settings.lineHeight.toFixed(2)}
          onChange={(v) => onSettingsChange({ lineHeight: v })}
        />
        <SettingSlider
          label="边距"
          min={1.0}
          max={5.0}
          step={0.5}
          value={settings.paddingX}
          displayValue={settings.paddingX.toFixed(1)}
          onChange={(v) => onSettingsChange({ paddingX: v })}
        />
      </SettingsSection>

      {/* TTS settings */}
      <SettingsSection title="TTS 设置">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <span
              className="min-w-[60px] text-[13px] font-medium"
              style={{ color: "var(--reader-chrome-fg)" }}
            >
              默认语速
            </span>
            <select
              className="flex-1 cursor-pointer rounded-lg border bg-transparent px-2.5 py-1.5 text-[13px] outline-none"
              style={{
                borderColor: "var(--reader-chrome-border)",
                color: "var(--reader-chrome-fg)",
                fontFamily: "inherit",
              }}
              defaultValue="1.0x"
            >
              <option>0.75x</option>
              <option>1.0x</option>
              <option>1.25x</option>
              <option>1.5x</option>
            </select>
          </div>
          <div className="flex items-center gap-2.5">
            <span
              className="min-w-[60px] text-[13px] font-medium"
              style={{ color: "var(--reader-chrome-fg)" }}
            >
              自动翻页
            </span>
            <select
              className="flex-1 cursor-pointer rounded-lg border bg-transparent px-2.5 py-1.5 text-[13px] outline-none"
              style={{
                borderColor: "var(--reader-chrome-border)",
                color: "var(--reader-chrome-fg)",
                fontFamily: "inherit",
              }}
              defaultValue="开启"
            >
              <option>开启</option>
              <option>关闭</option>
            </select>
          </div>
        </div>
      </SettingsSection>
    </aside>
  )
}

function LayoutChoice({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-all"
      style={{
        borderColor: active
          ? "var(--reader-chrome-active)"
          : "var(--reader-chrome-border)",
        background: active
          ? "color-mix(in srgb, var(--reader-chrome-active) 10%, transparent)"
          : "transparent",
        color: active
          ? "var(--reader-chrome-active)"
          : "var(--reader-chrome-fg)",
      }}
    >
      {label}
    </button>
  )
}

function SettingsSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      className="border-b px-5 py-4"
      style={{ borderColor: "var(--reader-chrome-border)" }}
    >
      <div
        className="mb-3 text-[11.5px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--reader-chrome-muted)" }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function SettingSlider({
  label,
  min,
  max,
  step,
  value,
  displayValue,
  leftHint,
  rightHint,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  displayValue: string
  leftHint?: React.ReactNode
  rightHint?: React.ReactNode
  onChange: (v: number) => void
}) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5 last:mb-0">
      <span
        className="min-w-[40px] text-[13px] font-medium"
        style={{ color: "var(--reader-chrome-fg)" }}
      >
        {label}
      </span>
      {leftHint && (
        <span style={{ color: "var(--reader-chrome-muted)" }}>{leftHint}</span>
      )}
      <input
        type="range"
        className="reader-slider flex-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span
        className="min-w-[28px] text-right font-mono text-xs"
        style={{ color: "var(--reader-chrome-muted)" }}
      >
        {displayValue}
      </span>
      {rightHint && (
        <span style={{ color: "var(--reader-chrome-muted)" }}>{rightHint}</span>
      )}
    </div>
  )
}
