import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dimensions, View as RNView, StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { type ReaderChromePalette, underlayFromSurface } from "@/src/design/reader-chrome-palette";
import { Text, TouchableHighlight } from "@/tw";

const ACTION_PILL_WIDTH = Dimensions.get("window").width * 0.55;

type Props = {
  insetsBottom: number;
  visible: boolean;
  progressPercent: number;
  palette: ReaderChromePalette;
  onOpenToc: () => void;
  onOpenSettings: () => void;
};

export default function ReaderActionsExpanded({
  insetsBottom,
  visible,
  progressPercent,
  palette,
  onOpenToc,
  onOpenSettings,
}: Props) {
  const { t } = useTranslation();
  const translateY = useSharedValue(8);
  const scale = useSharedValue(0.95);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
      scale.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) });
    } else {
      opacity.value = withTiming(0, { duration: 150 });
      translateY.value = withTiming(8, { duration: 150 });
      scale.value = withTiming(0.95, { duration: 150 });
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          right: 16,
          bottom: Math.max(insetsBottom, 12) + 36,
        },
        animatedStyle,
      ]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <RNView style={styles.pillContainer}>
        <RNView style={styles.pillShadow}>
          <TouchableHighlight
            accessibilityRole="button"
            accessibilityLabel={t("reader.toc")}
            underlayColor={underlayFromSurface(palette.actionSurface, palette.bg)}
            className="rounded-[20px]"
            style={[styles.pillButton, { backgroundColor: palette.actionSurface, width: ACTION_PILL_WIDTH }]}
            onPress={onOpenToc}
          >
            <RNView style={styles.pillInner}>
              <RNView style={styles.pillFill} pointerEvents="none">
                <RNView style={[styles.pillFillBar, { backgroundColor: palette.progressFill, width: `${progressPercent}%` }]} />
              </RNView>
              {/* actionText layer — full width background text */}
              <RNView style={styles.pillContent}>
                <RNView style={styles.tocLabelGroup}>
                  <Text className="text-[15px] font-semibold" style={{ color: palette.actionText }}>
                    {t("reader.toc")}
                  </Text>
                  <Text className="text-[12px] font-semibold" style={{ color: palette.actionText }}>
                    {progressPercent}%
                  </Text>
                </RNView>
                <MaterialIcons name="list" size={18} color={palette.actionText} />
              </RNView>
              {/* progressText layer — clipped to progress width, using pixel value to match pillFill baseline */}
              <RNView style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: ACTION_PILL_WIDTH * progressPercent / 100, overflow: "hidden" }} pointerEvents="none">
                <RNView style={{ width: ACTION_PILL_WIDTH, paddingHorizontal: 18, paddingVertical: 14 }}>
                  <RNView style={styles.pillContent}>
                    <RNView style={styles.tocLabelGroup}>
                      <Text className="text-[15px] font-semibold" style={{ color: palette.progressText }}>
                        {t("reader.toc")}
                      </Text>
                      <Text className="text-[12px] font-semibold" style={{ color: palette.progressText }}>
                        {progressPercent}%
                      </Text>
                    </RNView>
                    <MaterialIcons name="list" size={18} color={palette.progressText} />
                  </RNView>
                </RNView>
              </RNView>
            </RNView>
          </TouchableHighlight>
        </RNView>

        <RNView style={styles.pillShadow}>
          <TouchableHighlight
            accessibilityRole="button"
            accessibilityLabel={t("reader.settings")}
            underlayColor={underlayFromSurface(palette.actionSurface, palette.bg)}
            className="rounded-[20px] px-[18px] py-[14px]"
            style={[{ backgroundColor: palette.actionSurface, width: ACTION_PILL_WIDTH }]}
            onPress={onOpenSettings}
          >
            <RNView style={styles.pillContent}>
              <Text
                className="text-[15px] font-semibold"
                style={{ color: palette.actionText }}
              >
                {t("reader.settings")}
              </Text>
              <MaterialIcons
                name="tune"
                size={18}
                color={palette.actionText}
              />
            </RNView>
          </TouchableHighlight>
        </RNView>
      </RNView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pillContainer: {
    flexDirection: "column",
    gap: 6,
  },
  pillShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  pillButton: {
    position: "relative",
    overflow: "hidden",
  },
  pillInner: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  pillFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    overflow: "hidden",
  },
  pillFillBar: {
    height: "100%",
  },
  pillContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tocLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
});
