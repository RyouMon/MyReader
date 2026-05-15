import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type ReaderSettingsSectionProps = {
  title: string
  children: ReactNode
}

export function ReaderSettingsSection({ title, children }: ReaderSettingsSectionProps) {
  return (
    <div className="border-b border-reader-chrome-border px-5 py-4">
      <div className="mb-3 text-[11.5px] font-semibold tracking-wider text-reader-chrome-muted uppercase">
        {title}
      </div>
      {children}
    </div>
  )
}

type ReaderSettingSliderProps = {
  label: string
  min: number
  max: number
  step?: number
  value: number
  displayValue: string
  leftHint?: ReactNode
  rightHint?: ReactNode
  onChange: (v: number) => void
}

export function ReaderSettingSlider({
  label,
  min,
  max,
  step = 1,
  value,
  displayValue,
  leftHint,
  rightHint,
  onChange,
}: ReaderSettingSliderProps) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5 last:mb-0">
      <span className="min-w-[40px] text-[13px] font-medium text-reader-chrome-fg">
        {label}
      </span>
      {leftHint != null && (
        <span className="text-reader-chrome-muted">{leftHint}</span>
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
      <span className="min-w-[28px] text-right font-mono text-xs text-reader-chrome-muted">
        {displayValue}
      </span>
      {rightHint != null && (
        <span className="text-reader-chrome-muted">{rightHint}</span>
      )}
    </div>
  )
}

type ReaderSettingsLayoutChoiceProps = {
  label: string
  active: boolean
  onClick: () => void
}

/**
 * 流式设置里「翻页 / 滚动」等并排选项按钮。
 */
export function ReaderSettingsLayoutChoice({
  label,
  active,
  onClick,
}: ReaderSettingsLayoutChoiceProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-all",
        active
          ? "border-reader-chrome-active bg-[color-mix(in_srgb,var(--reader-chrome-active)_10%,transparent)] text-reader-chrome-active"
          : "border-reader-chrome-border text-reader-chrome-fg",
      )}
    >
      {label}
    </button>
  )
}

type ReaderSettingRowProps = {
  label: string
  children: ReactNode
}

export function ReaderSettingRow({ label, children }: ReaderSettingRowProps) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5 last:mb-0">
      <span className="min-w-[60px] text-[13px] font-medium text-reader-chrome-fg">
        {label}
      </span>
      {children}
    </div>
  )
}

type ReaderSettingSelectOption = { value: string; label: string }

type ReaderSettingSelectProps = {
  value: string
  onChange: (value: string) => void
  options: ReaderSettingSelectOption[]
}

export function ReaderSettingSelect({
  value,
  onChange,
  options,
}: ReaderSettingSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="reader-chrome-select flex-1 cursor-pointer rounded-lg border bg-transparent px-3 py-[7px] text-[13px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {options.map((opt) => (
        <option
          key={opt.value}
          value={opt.value}
          className="bg-reader-panel-bg text-reader-chrome-fg"
        >
          {opt.label}
        </option>
      ))}
    </select>
  )
}
