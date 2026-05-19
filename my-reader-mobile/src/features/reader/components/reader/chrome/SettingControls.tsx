import { READER_CHROME } from "@/src/design/reader-tokens";
import { Pressable, Text, View } from "@/tw";
import { useTranslation } from "react-i18next";

import type { ThemeOption } from "./readerChromeConstants";
import { chromeSegmentSurfaceStyle, chromeThemeCardSurfaceStyle } from "./readerChromePalette";

export function SettingSectionLabel({ label }: { label: string }) {
  return (
    <Text
      className="mb-2.5 mt-[18px] text-xs font-bold uppercase tracking-[0.8px]"
      style={{ color: READER_CHROME.textMuted }}
    >
      {label}
    </Text>
  );
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
    <Pressable
      className="min-h-11 flex-1 items-center justify-center rounded-2xl border"
      style={chromeSegmentSurfaceStyle(active)}
      onPress={onPress}
    >
      <Text
        className="text-sm font-semibold"
        style={{ color: active ? READER_CHROME.textStrong : READER_CHROME.textSecondary }}
      >
        {label}
      </Text>
    </Pressable>
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
    <Pressable
      className="min-w-[72px] items-center gap-2 rounded-2xl border px-2 py-2.5"
      style={{ width: "23%", ...chromeThemeCardSurfaceStyle(active) }}
      onPress={onPress}
    >
      <View
        className="h-[42px] w-[42px] items-center justify-center rounded-full border border-black/[0.08]"
        style={{ backgroundColor: option.swatch }}
      >
        <View className="h-4 w-4 rounded-full" style={{ backgroundColor: option.fg }} />
      </View>
      <Text
        className="text-xs font-semibold"
        style={{ color: active ? READER_CHROME.textStrong : READER_CHROME.textSecondary }}
      >
        {t(option.label)}
      </Text>
    </Pressable>
  );
}

/**
 * 设置面板中的数值步进控件（展示用轨道样式，非可拖拽滑块）。
 */
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
        borderColor: READER_CHROME.border,
        backgroundColor: READER_CHROME.surfaceIdle,
      }}
    >
      <Pressable
        className="h-[34px] w-[34px] items-center justify-center rounded-full"
        style={{ backgroundColor: READER_CHROME.surfaceIdle }}
        onPress={onDecrease}
      >
        <Text
          className="text-lg font-bold"
          style={{ color: READER_CHROME.textStrong }}
        >
          －
        </Text>
      </Pressable>
      <View
        className="relative h-1 flex-1 justify-center overflow-visible rounded-full"
        style={{ backgroundColor: READER_CHROME.border }}
      >
        <View
          className="h-1 rounded-full"
          style={{ width: "62%", backgroundColor: READER_CHROME.accent }}
        />
        <View
          className="absolute h-[18px] w-[18px] rounded-full"
          style={{
            left: "62%",
            marginLeft: -9,
            backgroundColor: READER_CHROME.accent,
            borderWidth: 3,
            borderColor: READER_CHROME.surface,
          }}
        />
      </View>
      <View className="min-w-[58px] items-end">
        <Text
          className="text-[13px] font-semibold"
          style={{ color: READER_CHROME.textStrong }}
        >
          {value}
        </Text>
      </View>
      <Pressable
        className="h-[34px] w-[34px] items-center justify-center rounded-full"
        style={{ backgroundColor: READER_CHROME.surfaceIdle }}
        onPress={onIncrease}
      >
        <Text
          className="text-lg font-bold"
          style={{ color: READER_CHROME.textStrong }}
        >
          ＋
        </Text>
      </Pressable>
    </View>
  );
}
