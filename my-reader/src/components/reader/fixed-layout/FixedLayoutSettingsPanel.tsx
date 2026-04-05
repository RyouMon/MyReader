import { Settings } from "lucide-react"

import {
  ReaderSettingRow,
  ReaderSettingSelect,
  ReaderSettingSlider,
  ReaderSettingsSection,
} from "@/components/reader/shared/ReaderSettingsPanelPrimitives"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import type {
  DisplayMode,
  FixedLayoutSettings,
  ReadingDirection,
  ReadingLayout,
  ZoomMode,
} from "../types"

interface FixedLayoutSettingsPanelProps {
  visible: boolean
  settings: FixedLayoutSettings
  onSettingsChange: (patch: Partial<FixedLayoutSettings>) => void
}

export function FixedLayoutSettingsPanel({
  visible,
  settings,
  onSettingsChange,
}: FixedLayoutSettingsPanelProps) {
  return (
    <ReaderSidePanelFrame visible={visible} side="right">
      <ReaderSidePanelHeader title="阅读设置" icon={Settings} />

      <ReaderSettingsSection title="显示">
        <ReaderSettingRow label="阅读方式">
          <ReaderSettingSelect
            value={settings.readingLayout}
            onChange={(v) =>
              onSettingsChange({ readingLayout: v as ReadingLayout })
            }
            options={[
              { value: "paginate", label: "翻页" },
              { value: "scroll", label: "连续滚动" },
            ]}
          />
        </ReaderSettingRow>
        <ReaderSettingRow label="页面模式">
          <ReaderSettingSelect
            value={settings.displayMode}
            onChange={(v) =>
              onSettingsChange({ displayMode: v as DisplayMode })
            }
            options={[
              { value: "single", label: "单页" },
              { value: "spread", label: "双页展开" },
            ]}
          />
        </ReaderSettingRow>
        <ReaderSettingRow label="缩放">
          <ReaderSettingSelect
            value={settings.zoomMode}
            onChange={(v) => onSettingsChange({ zoomMode: v as ZoomMode })}
            options={[
              { value: "fit-height", label: "适应高度" },
              { value: "fit-width", label: "适应宽度" },
              { value: "original", label: "原始尺寸" },
            ]}
          />
        </ReaderSettingRow>
        <ReaderSettingRow label="阅读方向">
          <ReaderSettingSelect
            value={settings.direction}
            onChange={(v) =>
              onSettingsChange({ direction: v as ReadingDirection })
            }
            options={[
              { value: "ltr", label: "从左到右" },
              { value: "rtl", label: "从右到左 (日漫)" },
            ]}
          />
        </ReaderSettingRow>
      </ReaderSettingsSection>

      <ReaderSettingsSection title="背景">
        <ReaderSettingSlider
          label="亮度"
          min={20}
          max={100}
          value={settings.brightness}
          displayValue={`${settings.brightness}%`}
          onChange={(v) => onSettingsChange({ brightness: v })}
        />
      </ReaderSettingsSection>

      <ReaderSettingsSection title="页面间距">
        <ReaderSettingSlider
          label="间距"
          min={0}
          max={48}
          value={settings.pageGap}
          displayValue={`${settings.pageGap}px`}
          onChange={(v) => onSettingsChange({ pageGap: v })}
        />
      </ReaderSettingsSection>
    </ReaderSidePanelFrame>
  )
}
