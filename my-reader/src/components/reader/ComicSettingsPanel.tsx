import { Settings } from "lucide-react"

import type {
  ComicSettings,
  DisplayMode,
  ReadingDirection,
  ZoomMode,
} from "./ComicReader"
import type { ReadingLayout } from "./types"

interface ComicSettingsPanelProps {
  visible: boolean
  settings: ComicSettings
  onSettingsChange: (patch: Partial<ComicSettings>) => void
}

export function ComicSettingsPanel({
  visible,
  settings,
  onSettingsChange,
}: ComicSettingsPanelProps) {
  return (
    <aside
      className="absolute inset-y-0 right-0 z-60 flex w-[300px] flex-col overflow-y-auto transition-all duration-300 ease-out"
      style={{
        background: "#222",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "-8px 0 24px rgba(0,0,0,0.30)",
        transform: visible ? "translateX(0)" : "translateX(100%)",
        opacity: visible ? 1 : 0,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 border-b px-5 py-4 text-[15px] font-semibold"
        style={{
          fontFamily: "'Lora', 'Noto Serif SC', serif",
          color: "rgba(255,255,255,0.85)",
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        <Settings className="size-[18px] opacity-50" />
        阅读设置
      </div>

      {/* Display */}
      <SettingsSection title="显示">
        <SettingRow label="阅读方式">
          <StyledSelect
            value={settings.readingLayout}
            onChange={(v) =>
              onSettingsChange({ readingLayout: v as ReadingLayout })
            }
            options={[
              { value: "paginate", label: "翻页" },
              { value: "scroll", label: "连续滚动" },
            ]}
          />
        </SettingRow>
        <SettingRow label="页面模式">
          <StyledSelect
            value={settings.displayMode}
            onChange={(v) =>
              onSettingsChange({ displayMode: v as DisplayMode })
            }
            options={[
              { value: "single", label: "单页" },
              { value: "spread", label: "双页展开" },
            ]}
          />
        </SettingRow>
        <SettingRow label="缩放">
          <StyledSelect
            value={settings.zoomMode}
            onChange={(v) => onSettingsChange({ zoomMode: v as ZoomMode })}
            options={[
              { value: "fit-height", label: "适应高度" },
              { value: "fit-width", label: "适应宽度" },
              { value: "original", label: "原始尺寸" },
            ]}
          />
        </SettingRow>
        <SettingRow label="阅读方向">
          <StyledSelect
            value={settings.direction}
            onChange={(v) =>
              onSettingsChange({ direction: v as ReadingDirection })
            }
            options={[
              { value: "ltr", label: "从左到右" },
              { value: "rtl", label: "从右到左 (日漫)" },
            ]}
          />
        </SettingRow>
      </SettingsSection>

      {/* Brightness */}
      <SettingsSection title="背景">
        <SettingSlider
          label="亮度"
          min={20}
          max={100}
          value={settings.brightness}
          displayValue={`${settings.brightness}%`}
          onChange={(v) => onSettingsChange({ brightness: v })}
        />
      </SettingsSection>

      {/* Page gap */}
      <SettingsSection title="页面间距">
        <SettingSlider
          label="间距"
          min={0}
          max={48}
          value={settings.pageGap}
          displayValue={`${settings.pageGap}px`}
          onChange={(v) => onSettingsChange({ pageGap: v })}
        />
      </SettingsSection>
    </aside>
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
      style={{ borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div
        className="mb-3 text-[11.5px] font-semibold uppercase tracking-wider"
        style={{ color: "rgba(255,255,255,0.40)" }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function SettingRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5 last:mb-0">
      <span
        className="min-w-[60px] text-[13px] font-medium"
        style={{ color: "rgba(255,255,255,0.7)" }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function StyledSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 cursor-pointer rounded-lg border px-3 py-[7px] text-[13px] outline-none"
      style={{
        borderColor: "rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.05)",
        color: "rgba(255,255,255,0.8)",
        fontFamily: "inherit",
      }}
    >
      {options.map((opt) => (
        <option
          key={opt.value}
          value={opt.value}
          style={{ background: "#333", color: "#eee" }}
        >
          {opt.label}
        </option>
      ))}
    </select>
  )
}

function SettingSlider({
  label,
  min,
  max,
  value,
  displayValue,
  onChange,
}: {
  label: string
  min: number
  max: number
  value: number
  displayValue: string
  onChange: (v: number) => void
}) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5 last:mb-0">
      <span
        className="min-w-[40px] text-[13px] font-medium"
        style={{ color: "rgba(255,255,255,0.7)" }}
      >
        {label}
      </span>
      <input
        type="range"
        className="reader-slider flex-1"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span
        className="min-w-[40px] text-right font-mono text-xs"
        style={{ color: "rgba(255,255,255,0.45)" }}
      >
        {displayValue}
      </span>
    </div>
  )
}
