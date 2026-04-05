import { Check, Settings } from "lucide-react"

import {
  ReaderSettingSlider,
  ReaderSettingsLayoutChoice,
  ReaderSettingsSection,
} from "@/components/reader/shared/ReaderSettingsPanelPrimitives"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
} from "@/components/reader/shared/ReaderSidePanelChrome"

import {
  READER_FONTS,
  READER_THEMES,
  type ReaderSettings,
  type ReaderTheme,
} from "../types"

interface ReflowableSettingsPanelProps {
  visible: boolean
  settings: ReaderSettings
  onThemeChange: (theme: ReaderTheme) => void
  onSettingsChange: (patch: Partial<ReaderSettings>) => void
}

export function ReflowableSettingsPanel({
  visible,
  settings,
  onThemeChange,
  onSettingsChange,
}: ReflowableSettingsPanelProps) {
  return (
    <ReaderSidePanelFrame visible={visible} side="right">
      <ReaderSidePanelHeader title="阅读设置" icon={Settings} />

      <ReaderSettingsSection title="主题">
        <div className="grid grid-cols-4 gap-2">
          {READER_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onThemeChange(t.id)}
              className="reader-settings-theme-btn flex flex-col items-center gap-1.5 rounded-[10px] border-2 px-1.5 py-2.5"
              data-selected={settings.theme === t.id ? "true" : undefined}
            >
              <div
                className="flex size-8 items-center justify-center rounded-full border border-reader-chrome-border text-sm"
                style={{ background: t.swatch, color: t.swatchFg }}
              >
                {t.icon}
              </div>
              <span className="text-[11px] font-medium text-reader-chrome-fg">
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </ReaderSettingsSection>

      <ReaderSettingsSection title="字体">
        <div className="flex flex-col gap-1.5">
          {READER_FONTS.map((font) => {
            const isActive = settings.fontFamily === font.value
            return (
              <button
                key={font.value}
                type="button"
                onClick={() => onSettingsChange({ fontFamily: font.value })}
                className="reader-settings-font-btn flex items-center gap-2.5 px-3 py-2 text-sm"
                style={{ fontFamily: font.value }}
                data-active={isActive ? "true" : undefined}
              >
                <span className="flex-1">{font.label}</span>
                <span className="w-4">
                  {isActive && <Check className="size-3.5" />}
                </span>
              </button>
            )
          })}
        </div>
      </ReaderSettingsSection>

      <ReaderSettingsSection title="阅读方式">
        <div className="flex gap-2">
          <ReaderSettingsLayoutChoice
            label="翻页"
            active={settings.readingLayout === "paginate"}
            onClick={() => onSettingsChange({ readingLayout: "paginate" })}
          />
          <ReaderSettingsLayoutChoice
            label="滚动"
            active={settings.readingLayout === "scroll"}
            onClick={() => onSettingsChange({ readingLayout: "scroll" })}
          />
        </div>
      </ReaderSettingsSection>

      <ReaderSettingsSection title="排版">
        <ReaderSettingSlider
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
        <ReaderSettingSlider
          label="行距"
          min={1.4}
          max={2.4}
          step={0.05}
          value={settings.lineHeight}
          displayValue={settings.lineHeight.toFixed(2)}
          onChange={(v) => onSettingsChange({ lineHeight: v })}
        />
        <ReaderSettingSlider
          label="边距"
          min={1.0}
          max={5.0}
          step={0.5}
          value={settings.paddingX}
          displayValue={settings.paddingX.toFixed(1)}
          onChange={(v) => onSettingsChange({ paddingX: v })}
        />
      </ReaderSettingsSection>

      <ReaderSettingsSection title="TTS 设置">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="min-w-[60px] text-[13px] font-medium text-reader-chrome-fg">
              默认语速
            </span>
            <select
              className="reader-chrome-select flex-1 cursor-pointer rounded-lg border bg-transparent px-2.5 py-1.5 text-[13px] outline-none"
              defaultValue="1.0x"
            >
              <option>0.75x</option>
              <option>1.0x</option>
              <option>1.25x</option>
              <option>1.5x</option>
            </select>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="min-w-[60px] text-[13px] font-medium text-reader-chrome-fg">
              自动翻页
            </span>
            <select
              className="reader-chrome-select flex-1 cursor-pointer rounded-lg border bg-transparent px-2.5 py-1.5 text-[13px] outline-none"
              defaultValue="开启"
            >
              <option>开启</option>
              <option>关闭</option>
            </select>
          </div>
        </div>
      </ReaderSettingsSection>
    </ReaderSidePanelFrame>
  )
}
