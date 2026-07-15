import {
  mixInk,
  type ReaderChromePalette,
  underlayFromSurface,
} from "@/src/design/reader-chrome-palette"
import { Text, TouchableHighlight, View } from "@/tw"
import Slider from "@react-native-community/slider"
import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { StyleSheet } from "react-native"

import { READER_THEME_OPTIONS } from "./readerChromeConstants"

/* ═══════════════════════════════════════
   Shared helpers
   ═══════════════════════════════════════ */

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="mb-2 text-base font-bold uppercase tracking-[0.8px]"
      style={{ color }}
    >
      {label}
    </Text>
  )
}

function SettingsSection({
  children,
  testID,
}: {
  children: ReactNode
  testID?: string
}) {
  return (
    <View testID={testID} style={styles.section}>
      {children}
    </View>
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
  const swatches = READER_THEME_OPTIONS.map((option) => {
    const active = value === option.key
    return (
      <TouchableHighlight
        key={option.key}
        underlayColor={mixInk(option.fg, option.swatch, 18)}
        className="rounded-xl border-2"
        style={[
          styles.themeSwatch,
          {
            backgroundColor: option.swatch,
            borderColor: active ? palette.accent : "transparent",
          },
        ]}
        onPress={() => onChange(option.key)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${t("reader.settingsTheme")}: ${t(option.label)}${
          active ? `, ${t("common.selected")}` : ""
        }`}
      >
        <View className="min-h-14 items-center justify-center px-1 py-1.5">
          <Text
            className="flex-shrink text-center text-base font-semibold"
            style={{ color: option.fg }}
            numberOfLines={1}
          >
            {t(option.label)}
          </Text>
        </View>
      </TouchableHighlight>
    )
  })

  return (
    <SettingsSection testID="theme-swatches-section">
      <SectionLabel
        label={t("reader.settingsTheme")}
        color={palette.textMuted}
      />
      <View testID="theme-swatches-grid" style={styles.themeGrid}>
        {Array.from(
          { length: Math.ceil(swatches.length / 4) },
          (_, rowIndex) => (
            <View key={rowIndex} style={styles.themeRow}>
              {swatches.slice(rowIndex * 4, rowIndex * 4 + 4)}
            </View>
          ),
        )}
      </View>
    </SettingsSection>
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
    <SettingsSection>
      {label ? <SectionLabel label={label} color={palette.textMuted} /> : null}
      <View style={styles.optionGrid}>
        {options.map((opt) => {
          const active = value === opt.key
          return (
            <TouchableHighlight
              key={opt.key}
              underlayColor={underlayFromSurface(
                active ? palette.segmentActive : palette.segmentIdle,
                palette.bg,
              )}
              className="min-h-[44px] items-center justify-center rounded-2xl border px-2"
              style={[
                styles.segmentOption,
                {
                  backgroundColor: active
                    ? palette.segmentActive
                    : palette.segmentIdle,
                  borderColor: active ? palette.border : "transparent",
                },
              ]}
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
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {opt.label}
              </Text>
            </TouchableHighlight>
          )
        })}
      </View>
    </SettingsSection>
  )
}

/* ═══════════════════════════════════════
   Font family segment control
   ═══════════════════════════════════════ */

export function FontPicker({
  options,
  value,
  onChange,
  palette,
}: {
  options: readonly { key: string; label: string }[]
  value: string
  onChange: (key: string) => void
  palette: ReaderChromePalette
}) {
  const { t } = useTranslation()
  return (
    <SettingsSection testID="font-picker-section">
      <SectionLabel
        label={t("reader.font") ?? "字体"}
        color={palette.textMuted}
      />
      <View testID="font-picker-grid" style={styles.optionGrid}>
        {options.map((opt) => {
          const active = value === opt.key
          return (
            <TouchableHighlight
              key={opt.key}
              underlayColor={underlayFromSurface(
                active ? palette.segmentActive : palette.segmentIdle,
                palette.bg,
              )}
              className="min-h-[44px] items-center justify-center rounded-2xl border px-2"
              style={[
                styles.fontOption,
                {
                  backgroundColor: active
                    ? palette.segmentActive
                    : palette.segmentIdle,
                  borderColor: active ? palette.border : "transparent",
                },
              ]}
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
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {opt.label}
              </Text>
            </TouchableHighlight>
          )
        })}
      </View>
    </SettingsSection>
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
  const [draft, setDraft] = useState({ sourceValue: value, value })
  const displayedValue = draft.sourceValue === value ? draft.value : value

  return (
    <SettingsSection>
      <SectionLabel label={label} color={palette.textMuted} />
      <View
        className="flex-row items-center gap-3 rounded-2xl px-4 py-3"
        style={{ backgroundColor: palette.segmentIdle }}
      >
        <Slider
          accessibilityLabel={label}
          accessibilityValue={{ text: formatValue(displayedValue) }}
          accessibilityRole="adjustable"
          tapToSeek
          style={{ flex: 1 }}
          minimumValue={min}
          maximumValue={max}
          step={step}
          value={displayedValue}
          onValueChange={(nextValue) =>
            setDraft({ sourceValue: value, value: nextValue })
          }
          onSlidingComplete={(nextValue) => {
            setDraft({ sourceValue: value, value: nextValue })
            onChange(nextValue)
          }}
          minimumTrackTintColor={palette.accent}
          maximumTrackTintColor={palette.sliderTrack}
          thumbTintColor={palette.accent}
        />
        <View className="min-w-[52px] items-end">
          <Text
            className="text-base font-semibold"
            style={{ color: palette.text }}
          >
            {formatValue(displayedValue)}
          </Text>
        </View>
      </View>
    </SettingsSection>
  )
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
  },
  themeGrid: {
    gap: 8,
  },
  themeRow: {
    flexDirection: "row",
    gap: 8,
  },
  themeSwatch: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  segmentOption: {
    flexBasis: "31%",
    flexGrow: 1,
    flexShrink: 0,
  },
  fontOption: {
    flexBasis: "31%",
    flexGrow: 1,
    flexShrink: 0,
  },
})
