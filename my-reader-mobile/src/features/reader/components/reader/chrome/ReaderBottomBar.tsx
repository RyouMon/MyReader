import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { FadeIn, FadeOut } from "react-native-reanimated";
import { useTranslation } from "react-i18next";

import { READER_CHROME } from "@/src/design/reader-tokens";
import { Animated, Pressable, Text, View } from "@/tw";

export type ReaderBottomBarProps = {
  insetsBottom: number;
  pageLabel: string;
  progressPercent: number;
  progressColor: string;
  onOpenToc: () => void;
  onOpenSettings: () => void;
};

/**
 * 阅读器底栏：页码、进度条、目录与设置入口。
 */
export function ReaderBottomBar({
  insetsBottom,
  pageLabel,
  progressPercent,
  progressColor,
  onOpenToc,
  onOpenSettings,
}: ReaderBottomBarProps) {
  const { t } = useTranslation();
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      className="absolute bottom-0 left-0 right-0 z-20 min-h-[106px] px-3.5 pt-3"
      style={{
        backgroundColor: READER_CHROME.surfaceAlpha,
        borderTopWidth: 1,
        borderTopColor: READER_CHROME.border,
        paddingBottom: Math.max(insetsBottom, 12),
      }}
      pointerEvents="box-none"
    >
      <View pointerEvents="auto">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-xs" style={{ color: READER_CHROME.textMuted }}>
            {pageLabel}
          </Text>
          <Text className="text-xs" style={{ color: READER_CHROME.textMuted }}>
            {progressPercent}%
          </Text>
        </View>

        <View
          className="mb-3 h-[2px] overflow-hidden rounded-full"
          style={{ backgroundColor: READER_CHROME.surfaceIdle }}
        >
          <View
            className="h-full rounded-full"
            style={{
              backgroundColor: progressColor,
              width: `${progressPercent}%`,
            }}
          />
        </View>

        <View className="flex-row gap-3">
          <Pressable
            className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-2xl"
            style={{ backgroundColor: READER_CHROME.surfaceIdle }}
            onPress={onOpenToc}
          >
            <MaterialIcons
              name="list"
              size={18}
              color={READER_CHROME.textIdle}
            />
            <Text
              className="text-sm font-semibold"
              style={{ color: READER_CHROME.textIdle }}
            >
              {t("reader.toc")}
            </Text>
          </Pressable>
          <Pressable
            className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-2xl"
            style={{ backgroundColor: READER_CHROME.surfaceIdle }}
            onPress={onOpenSettings}
          >
            <MaterialIcons
              name="text-fields"
              size={18}
              color={READER_CHROME.textIdle}
            />
            <Text
              className="text-sm font-semibold"
              style={{ color: READER_CHROME.textIdle }}
            >
              Aa
            </Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}
