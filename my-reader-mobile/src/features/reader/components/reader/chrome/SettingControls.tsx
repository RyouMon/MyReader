import {
  mixInk,
  type ReaderChromePalette,
  underlayFromSurface,
} from "@/src/design/reader-chrome-palette"
import { Text, TouchableHighlight, View } from "@/tw"
import Slider from "@react-native-community/slider"
import { useTranslation } from "react-i18next"
import { StyleSheet } from "react-native"

import { ReaderChromeIcon } from "./ReaderChromeIcon"
import {
  READER_THEME_CHECK_ICON_SIZE,
  READER_THEME_OPTIONS,
} from "./readerChromeConstants"

/* ═══════════════════════════════════════
   Shared helpers
   ═══════════════════════════════════════ */

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="mb-2 mt-3 text-base font-bold uppercase tracking-[0.8px]"
      style={{ color }}
    >
      {label}
    </Text>
  )
}

/* ═══════════════════════════════════════
   Theme swatches — 4-column grid, pure color blocks
   ═══════════════════════════════════════ */

export function ThemeSwatches({
  value,
  onChange,
  palette,
}: {
  value: string
  onChange: (key: string) => void
  palette: ReaderChromePalette
}) {
  const { t } = useTranslation()
  return (
    <>
      <SectionLabel
        label={t("reader.settingsTheme")}
        color={palette.textMuted}
      />
      <View className="flex-row flex-wrap gap-2.5">
        {READER_THEME_OPTIONS.map((option) => {
          const active = value === option.key
          return (
            <TouchableHighlight
              key={option.key}
              underlayColor={mixInk(option.fg, option.swatch, 18)}
              className="relative min-h-[44px] w-[23%] items-center justify-center rounded-xl border-2"
              style={{
                backgroundColor: option.swatch,
                borderColor: active ? palette.accent : "transparent",
              }}
              onPress={() => onChange(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${t("reader.settingsTheme")}: ${t(option.label)}${
                active ? `, ${t("common.selected")}` : ""
              }`}
            >
              <View
                style={StyleSheet.absoluteFill}
                className="items-center justify-center"
              >
                <Text
                  className="text-base font-semibold"
                  style={{ color: option.fg }}
                >
                  {t(option.label)}
                </Text>
                {active ? (
                  <View
                    className="absolute right-1.5 top-1.5 h-[18px] w-[18px] items-center justify-center rounded-full"
                    style={{ backgroundColor: palette.accent }}
                  >
                    <ReaderChromeIcon
                      name="check"
                      size={READER_THEME_CHECK_ICON_SIZE}
                      color={palette.bg}
                    />
                  </View>
                ) : null}
              </View>
            </TouchableHighlight>
          )
        })}
      </View>
    </>
  )
}

/* ═══════════════════════════════════════
   Segment picker — multi-option row
   ═══════════════════════════════════════ */

export function SegmentPicker<T extends string>({
  label,
  options,
  value,
  onChange,
  palette,
}: {
  label?: string
  options: readonly { key: T; label: string }[]
  value: T
  onChange: (key: T) => void
  palette: ReaderChromePalette
}) {
  const { t } = useTranslation()
  return (
    <>
      {label ? <SectionLabel label={label} color={palette.textMuted} /> : null}
      <View className="flex-row gap-2.5">
        {options.map((opt) => {
          const active = value === opt.key
          return (
            <TouchableHighlight
              key={opt.key}
              underlayColor={underlayFromSurface(
                active ? palette.segmentActive : palette.segmentIdle,
                palette.bg,
              )}
              className="min-h-[44px] flex-1 items-center justify-center rounded-2xl border"
              style={{
                backgroundColor: active
                  ? palette.segmentActive
                  : palette.segmentIdle,
                borderColor: active ? palette.border : "transparent",
              }}
              onPress={() => onChange(opt.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label ?? ""}${label ? ": " : ""}${opt.label}${
                active ? `, ${t("common.selected")}` : ""
              }`}
            >
              <Text
                className="text-base font-semibold"
                style={{
                  color: active ? palette.accentText : palette.textMuted,
                }}
              >
                {opt.label}
              </Text>
            </TouchableHighlight>
          )
        })}
      </View>
    </>
  )
}

/* ═══════════════════════════════════════
   Font family segment control
   ═══════════════════════════════════════ */

const FONT_OPTIONS = [
  { key: "serif", label: "Serif" },
  { key: "sans", label: "Sans" },
  { key: "system", label: "系统" },
] as const

export function FontPicker({
  value,
  onChange,
  palette,
}: {
  value: string
  onChange: (key: string) => void
  palette: ReaderChromePalette
}) {
  const { t } = useTranslation()
  return (
    <>
      <SectionLabel
        label={t("reader.font") ?? "字体"}
        color={palette.textMuted}
      />
      <View className="flex-row gap-2.5">
        {FONT_OPTIONS.map((opt) => {
          const active = value === opt.key
          return (
            <TouchableHighlight
              key={opt.key}
              underlayColor={underlayFromSurface(
                active ? palette.segmentActive : palette.segmentIdle,
                palette.bg,
              )}
              className="min-h-[44px] flex-1 items-center justify-center rounded-2xl border"
              style={{
                backgroundColor: active
                  ? palette.segmentActive
                  : palette.segmentIdle,
                borderColor: active ? palette.border : "transparent",
              }}
              onPress={() => onChange(opt.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${t("reader.font")}: ${opt.label}${
                active ? `, ${t("common.selected")}` : ""
              }`}
            >
              <Text
                className="text-base font-semibold"
                style={{
                  color: active ? palette.accentText : palette.textMuted,
                }}
              >
                {opt.label}
              </Text>
            </TouchableHighlight>
          )
        })}
      </View>
    </>
  )
}

/* ═══════════════════════════════════════
   Slider control (native Slider)
   ═══════════════════════════════════════ */

export function SliderControl({
  label,
  value,
  onChange,
  min,
  max,
  step,
  formatValue,
  palette,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  formatValue: (v: number) => string
  palette: ReaderChromePalette
}) {
  return (
    <>
      <SectionLabel label={label} color={palette.textMuted} />
      <View
        className="mb-2.5 flex-row items-center gap-3 rounded-2xl px-4 py-3"
        style={{ backgroundColor: palette.segmentIdle }}
      >
        <Slider
          accessibilityLabel={label}
          accessibilityValue={{ text: formatValue(value) }}
          accessibilityRole="adjustable"
          tapToSeek
          style={{ flex: 1 }}
          minimumValue={min}
          maximumValue={max}
          step={step}
          value={value}
          onValueChange={onChange}
          minimumTrackTintColor={palette.accent}
          maximumTrackTintColor={palette.sliderTrack}
          thumbTintColor={palette.accent}
        />
        <View className="min-w-[52px] items-end">
          <Text
            className="text-base font-semibold"
            style={{ color: palette.text }}
          >
            {formatValue(value)}
          </Text>
        </View>
      </View>
    </>
  )
}
