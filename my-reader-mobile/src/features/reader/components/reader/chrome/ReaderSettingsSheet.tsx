import { SlideInDown, SlideOutDown } from "react-native-reanimated";

import { READER_CHROME } from "@/src/design/reader-tokens";
import { Animated, AnimatedScrollView, Text, View } from "@/tw";
import type { FixedReaderSettings, ReadingLayout, ReflowableReaderSettings } from "@/src/store/app-store.types";

import {
  FIXED_NAVIGATION_OPTIONS,
  READER_THEME_OPTIONS,
  READING_LAYOUT_OPTIONS,
} from "./readerChromeConstants";
import {
  SettingSectionLabel,
  SettingSegment,
  SettingStepper,
  SettingThemeCard,
} from "./SettingControls";

export type ReaderSettingsSheetProps = {
  insetsBottom: number;
  isReflowSurface: boolean;
  isFixedSurface: boolean;
  activeReadingLayout: ReadingLayout;
  reflowSettings: ReflowableReaderSettings;
  fixedSettings: FixedReaderSettings;
  onPatchReflowableReaderSettings: (patch: Partial<ReflowableReaderSettings>) => void;
  onPatchFixedReaderSettings: (patch: Partial<FixedReaderSettings>) => void;
};

/**
 * 底部弹出的阅读设置：主题、版式、亮度与字号/缩放等。
 */
export function ReaderSettingsSheet({
  insetsBottom,
  isReflowSurface,
  isFixedSurface,
  activeReadingLayout,
  reflowSettings,
  fixedSettings,
  onPatchReflowableReaderSettings,
  onPatchFixedReaderSettings,
}: ReaderSettingsSheetProps) {
  return (
    <Animated.View
      entering={SlideInDown.duration(280)}
      exiting={SlideOutDown.duration(220)}
      className="absolute bottom-0 left-0 right-0 z-40 max-h-[72%] rounded-t-[26px]"
      style={{
        backgroundColor: READER_CHROME.surface,
        borderTopWidth: 1,
        borderTopColor: READER_CHROME.border,
        paddingBottom: Math.max(insetsBottom, 16),
        elevation: 18,
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: -8 },
      }}
    >
      <View
        className="mb-2 mt-3 h-[5px] w-11 self-center rounded-full"
        style={{ backgroundColor: READER_CHROME.surfaceIdle }}
      />
      <Text
        className="px-5 py-3 text-base font-bold"
        style={{ color: READER_CHROME.textIdle }}
      >
        阅读设置
      </Text>
      <AnimatedScrollView
        className="px-4"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-5"
      >
        <SettingSectionLabel label="主题" />
        <View className="mb-1 flex-row flex-wrap gap-2.5">
          {READER_THEME_OPTIONS.map((themeOption) => {
            const active = isReflowSurface
              ? reflowSettings.theme === themeOption.key
              : fixedSettings.theme === themeOption.key;
            return (
              <SettingThemeCard
                key={themeOption.key}
                option={themeOption}
                active={active}
                onPress={() => {
                  if (isReflowSurface) onPatchReflowableReaderSettings({ theme: themeOption.key });
                  else onPatchFixedReaderSettings({ theme: themeOption.key });
                }}
              />
            );
          })}
        </View>

        <SettingSectionLabel label="阅读方式" />
        <View className="mb-1 flex-row gap-2.5">
          {READING_LAYOUT_OPTIONS.map((layout) => (
            <SettingSegment
              key={layout.key}
              active={activeReadingLayout === layout.key}
              label={layout.label}
              onPress={() => {
                if (isReflowSurface) onPatchReflowableReaderSettings({ readingLayout: layout.key });
                else onPatchFixedReaderSettings({ readingLayout: layout.key });
              }}
            />
          ))}
        </View>

        {isFixedSurface && activeReadingLayout === "paginate" ? (
          <>
            <SettingSectionLabel label="翻页方向" />
            <View className="mb-1 flex-row gap-2.5">
              {FIXED_NAVIGATION_OPTIONS.map((mode) => (
                <SettingSegment
                  key={mode.key}
                  active={fixedSettings.navigationMode === mode.key}
                  label={mode.label}
                  onPress={() => onPatchFixedReaderSettings({ navigationMode: mode.key })}
                />
              ))}
            </View>
          </>
        ) : null}

        <SettingSectionLabel label="亮度" />
        <SettingStepper
          value={`${isReflowSurface ? reflowSettings.brightness : fixedSettings.brightness}%`}
          onDecrease={() => {
            if (isReflowSurface) {
              onPatchReflowableReaderSettings({ brightness: Math.max(40, reflowSettings.brightness - 10) });
            } else {
              onPatchFixedReaderSettings({ brightness: Math.max(40, fixedSettings.brightness - 10) });
            }
          }}
          onIncrease={() => {
            if (isReflowSurface) {
              onPatchReflowableReaderSettings({ brightness: Math.min(120, reflowSettings.brightness + 10) });
            } else {
              onPatchFixedReaderSettings({ brightness: Math.min(120, fixedSettings.brightness + 10) });
            }
          }}
        />

        {isReflowSurface ? (
          <>
            <SettingSectionLabel label="字号" />
            <SettingStepper
              value={`${reflowSettings.fontSize}px`}
              onDecrease={() => onPatchReflowableReaderSettings({ fontSize: Math.max(14, reflowSettings.fontSize - 1) })}
              onIncrease={() => onPatchReflowableReaderSettings({ fontSize: Math.min(28, reflowSettings.fontSize + 1) })}
            />

            <SettingSectionLabel label="行距" />
            <SettingStepper
              value={reflowSettings.lineHeight.toFixed(2)}
              onDecrease={() =>
                onPatchReflowableReaderSettings({
                  lineHeight: Number(Math.max(1.4, reflowSettings.lineHeight - 0.1).toFixed(2)),
                })
              }
              onIncrease={() =>
                onPatchReflowableReaderSettings({
                  lineHeight: Number(Math.min(2.4, reflowSettings.lineHeight + 0.1).toFixed(2)),
                })
              }
            />

            <SettingSectionLabel label="边距" />
            <SettingStepper
              value={`${reflowSettings.paddingX}px`}
              onDecrease={() => onPatchReflowableReaderSettings({ paddingX: Math.max(12, reflowSettings.paddingX - 4) })}
              onIncrease={() => onPatchReflowableReaderSettings({ paddingX: Math.min(36, reflowSettings.paddingX + 4) })}
            />
          </>
        ) : (
          <>
            <SettingSectionLabel label="缩放" />
            <SettingStepper
              value={`${Math.round(fixedSettings.zoomScale * 100)}%`}
              onDecrease={() =>
                onPatchFixedReaderSettings({ zoomScale: Number(Math.max(1, fixedSettings.zoomScale - 0.1).toFixed(2)) })
              }
              onIncrease={() =>
                onPatchFixedReaderSettings({ zoomScale: Number(Math.min(3, fixedSettings.zoomScale + 0.1).toFixed(2)) })
              }
            />
            <Text className="-mt-0.5 mb-2 text-xs leading-[18px] text-white/[0.42]">
              固定版式支持双指捏合缩放。
            </Text>
          </>
        )}
      </AnimatedScrollView>
    </Animated.View>
  );
}
