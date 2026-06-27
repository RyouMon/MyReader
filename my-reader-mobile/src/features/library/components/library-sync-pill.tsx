import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Animated, Platform, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useThemePalette } from "@/src/design/tokens";
import { useIsLibrarySyncing } from "@/src/domain/sync/hooks/use-sync-library";

const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 49 : 56;

export function LibrarySyncPill() {
  const { t } = useTranslation();
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();
  const isSyncing = useIsLibrarySyncing();

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: isSyncing ? 1 : 0,
        duration: isSyncing ? 220 : 160,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: isSyncing ? 0 : 14,
        duration: isSyncing ? 220 : 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isSyncing, opacity, translateY]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pill,
        {
          bottom: insets.bottom + TAB_BAR_HEIGHT + 10,
          opacity,
          transform: [{ translateY }],
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      <ActivityIndicator size="small" color={palette.primary} />
      <Text style={[styles.label, { color: palette.text }]}>{t("notifications.librarySyncing")}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 7,
  },
});
