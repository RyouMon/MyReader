import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Slider from "@react-native-community/slider";
import { StyleSheet } from "react-native";
import { mixInk } from "@/src/design/reader-chrome-palette";
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette";
import { Text, View, TouchableHighlight } from "@/tw";
import { useTranslation } from "react-i18next";

import type { ThemeOption } from "./readerChromeConstants";
import { READER_THEME_OPTIONS } from "./readerChromeConstants";

/* ═══════════════════════════════════════
   Shared helpers
   ═══════════════════════════════════════ */

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text
      className="mb-2 mt-3 text-xs font-bold uppercase tracking-[0.8px]"
      style={{ color }}
    >
      {label}
    </Text>
  );
}

/* ═══════════════════════════════════════
   Theme swatches — 4-column grid, pure color blocks
   ═══════════════════════════════════════ */

export function ThemeSwatches({
  value,
  onChange,
  palette,
}: {
  value: string;
  onChange: (key: string) => void;
  palette: ReaderChromePalette;
}) {
  const { t } = useTranslation();
  return (
    <>
      <SectionLabel label={t("reader.settingsTheme")} color={palette.textMuted} />
      <View className="flex-row flex-wrap gap-2.5">
        {READER_THEME_OPTIONS.map((option) => {
          const active = value === option.key;
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
            >
              <View style={StyleSheet.absoluteFill} className="items-center justify-center">
                <Text
                  className="text-[13px] font-semibold"
                  style={{ color: option.fg }}
                >
                  {t(option.label)}
                </Text>
                {active ? (
                  <View
                    className="absolute right-1.5 top-1.5 h-[18px] w-[18px] items-center justify-center rounded-full"
                    style={{ backgroundColor: palette.accent }}
                  >
                    <MaterialIcons name="check" size={12} color="#fff" />
                  </View>
                ) : null}
              </View>
            </TouchableHighlight>
          );
        })}
      </View>
    </>
  );
}

/* ═══════════════════════════════════════
   Font family segment control
   ═══════════════════════════════════════ */

const FONT_OPTIONS = [
  { key: "serif", label: "Serif" },
  { key: "sans", label: "Sans" },
  { key: "system", label: "系统" },
] as const;

export function FontPicker({
  value,
  onChange,
  palette,
}: {
  value: string;
  onChange: (key: string) => void;
  palette: ReaderChromePalette;
}) {
  const { t } = useTranslation();
  return (
    <>
      <SectionLabel label={t("reader.font") ?? "字体"} color={palette.textMuted} />
      <View className="flex-row gap-2.5">
        {FONT_OPTIONS.map((opt) => {
          const active = value === opt.key;
          return (
            <TouchableHighlight
              key={opt.key}
              underlayColor={palette.underlay}
              className="min-h-[44px] flex-1 items-center justify-center rounded-2xl border"
              style={{
                backgroundColor: active ? palette.segmentActive : palette.segmentIdle,
                borderColor: active ? palette.border : "transparent",
              }}
              onPress={() => onChange(opt.key)}
            >
              <Text
                className="text-sm font-semibold"
                style={{ color: active ? palette.accentText : palette.textMuted }}
              >
                {opt.label}
              </Text>
            </TouchableHighlight>
          );
        })}
      </View>
    </>
  );
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
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  formatValue: (v: number) => string;
  palette: ReaderChromePalette;
}) {
  return (
    <>
      <SectionLabel label={label} color={palette.textMuted} />
      <View
        className="mb-2.5 flex-row items-center gap-3 rounded-2xl px-4 py-3"
        style={{ backgroundColor: palette.segmentIdle }}
      >
        <Slider
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
          <Text className="text-[13px] font-semibold" style={{ color: palette.text }}>
            {formatValue(value)}
          </Text>
        </View>
      </View>
    </>
  );
}

/* ═══════════════════════════════════════
   Brightness control
   ═══════════════════════════════════════ */

export function BrightnessControl({
  value,
  onChange,
  palette,
}: {
  value: number;
  onChange: (v: number) => void;
  palette: ReaderChromePalette;
}) {
  const { t } = useTranslation();
  return (
    <SliderControl
      label={t("reader.brightness")}
      value={value}
      onChange={onChange}
      min={40}
      max={120}
      step={10}
      formatValue={(v) => `${v}%`}
      palette={palette}
    />
  );
}

/* ═══════════════════════════════════════
   Legacy exports (kept for backward compat)
   ═══════════════════════════════════════ */

export function SettingSectionLabel({ label }: { label: string }) {
  return <SectionLabel label={label} color="#636366" />;
}

export function SettingSegment({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableHighlight
      underlayColor="rgba(255,255,255,0.08)"
      className="min-h-[44px] flex-1 items-center justify-center rounded-2xl border"
      style={{
        backgroundColor: active ? "rgba(196, 96, 42, 0.12)" : "rgba(255,255,255,0.06)",
        borderColor: active ? "rgba(240, 235, 225, 0.20)" : "rgba(255,255,255,0.05)",
      }}
      onPress={onPress}
    >
      <Text
        className="text-sm font-semibold"
        style={{ color: active ? "#F4EEE6" : "#8E8E93" }}
      >
        {label}
      </Text>
    </TouchableHighlight>
  );
}

export function SettingThemeCard({
  option,
  active,
  onPress,
}: {
  option: ThemeOption;
  active: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <TouchableHighlight
      underlayColor="rgba(255,255,255,0.08)"
      className="min-h-[44px] w-[23%] items-center justify-center rounded-xl border py-2"
      style={{
        backgroundColor: active ? "rgba(196, 96, 42, 0.12)" : "rgba(255,255,255,0.06)",
        borderColor: active ? "rgba(240, 235, 225, 0.20)" : "rgba(255,255,255,0.05)",
      }}
      onPress={onPress}
    >
      <View style={StyleSheet.absoluteFill} className="items-center gap-2">
        <View
          className="h-[42px] w-[42px] items-center justify-center rounded-full border border-black/[0.08]"
          style={{ backgroundColor: option.swatch }}
        >
          <View className="h-4 w-4 rounded-full" style={{ backgroundColor: option.fg }} />
        </View>
        <Text
          className="text-xs font-semibold"
          style={{ color: active ? "#F4EEE6" : "#8E8E93" }}
        >
          {t(option.label)}
        </Text>
      </View>
    </TouchableHighlight>
  );
}

export function SettingStepper({
  value,
  onDecrease,
  onIncrease,
}: {
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <View
      className="mb-2.5 min-h-14 flex-row items-center gap-3 rounded-xl px-3"
      style={{
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
        backgroundColor: "rgba(255,255,255,0.06)",
      }}
    >
      <TouchableHighlight
        underlayColor="rgba(255,255,255,0.12)"
        className="h-[34px] w-[34px] items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
        onPress={onDecrease}
      >
        <Text className="text-lg font-bold" style={{ color: "#F4EEE6" }}>－</Text>
      </TouchableHighlight>
      <View className="flex-1 items-center">
        <Text className="text-[13px] font-semibold" style={{ color: "#F4EEE6" }}>{value}</Text>
      </View>
      <TouchableHighlight
        underlayColor="rgba(255,255,255,0.12)"
        className="h-[34px] w-[34px] items-center justify-center rounded-full"
        style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
        onPress={onIncrease}
      >
        <Text className="text-lg font-bold" style={{ color: "#F4EEE6" }}>＋</Text>
      </TouchableHighlight>
    </View>
  );
}

/** @deprecated Use SliderControl instead */
export function StepperControl(props: Parameters<typeof SliderControl>[0]) {
  return <SliderControl {...props} />;
}
