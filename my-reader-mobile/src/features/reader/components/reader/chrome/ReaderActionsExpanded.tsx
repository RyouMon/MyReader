import { useEffect } from "react";
import { Dimensions, StyleSheet, View as RNView } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useTranslation } from "react-i18next";

import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette";
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
        <TouchableHighlight
          accessibilityRole="button"
          accessibilityLabel={t("reader.toc")}
          underlayColor={palette.underlay}
          className="rounded-[20px] px-[18px] py-[14px]"
          style={[styles.pillShadow, { backgroundColor: palette.surface, width: ACTION_PILL_WIDTH }]}
          onPress={onOpenToc}
        >
          <RNView style={styles.pillInner}>
            <RNView style={[styles.pillFill, { backgroundColor: palette.accent, opacity: progressPercent / 100 * 0.15 }]} />
            <RNView style={styles.pillContent}>
              <Text
                className="flex-1 text-[15px] font-semibold"
                style={{ color: palette.text }}
              >
                {progressPercent}%
              </Text>
              <MaterialIcons
                name="list"
                size={18}
                color={palette.text}
              />
            </RNView>
          </RNView>
        </TouchableHighlight>

        <TouchableHighlight
          accessibilityRole="button"
          accessibilityLabel={t("reader.settings")}
          underlayColor={palette.underlay}
          className="rounded-[20px] px-[18px] py-[14px]"
          style={[styles.pillShadow, { backgroundColor: palette.surface, width: ACTION_PILL_WIDTH }]}
          onPress={onOpenSettings}
        >
          <RNView style={styles.pillContent}>
            <Text
              className="text-[15px] font-semibold"
              style={{ color: palette.text }}
            >
              {t("reader.settings")}
            </Text>
            <MaterialIcons
              name="tune"
              size={18}
              color={palette.text}
            />
          </RNView>
        </TouchableHighlight>
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
  pillInner: {
    borderRadius: 20,
  },
  pillFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
  },
  pillContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
