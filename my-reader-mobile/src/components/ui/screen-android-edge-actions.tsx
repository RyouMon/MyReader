import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ComponentProps } from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useThemePalette } from "@/src/design/tokens";
import { Pressable, Text, View } from "@/tw";

const FAB_SIZE = 56;

type MaterialName = ComponentProps<typeof MaterialIcons>["name"];

/**
 * Android-only floating action button anchored to the bottom-right safe area.
 */
export function ScreenAndroidFabPrimary({
  icon,
  onPress,
  accessibilityLabel,
  disabled,
}: {
  icon: MaterialName;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();

  if (Platform.OS !== "android") {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={{
        position: "absolute",
        right: 16,
        bottom: 16 + insets.bottom,
        width: FAB_SIZE,
        height: FAB_SIZE,
        borderRadius: FAB_SIZE / 2,
        alignItems: "center",
        justifyContent: "center",
        elevation: 6,
        opacity: disabled ? 0.45 : 1,
        backgroundColor: palette.primary,
      }}
    >
      <MaterialIcons name={icon} size={28} color={palette.primaryForeground} />
    </Pressable>
  );
}

/**
 * Android-only secondary action chip anchored to the bottom-left safe area.
 */
export function ScreenAndroidSecondaryBottomStart({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();

  if (Platform.OS !== "android") {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 16,
        bottom: 20 + insets.bottom,
        maxWidth: "52%",
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        disabled={disabled}
        className="min-h-11 justify-center rounded-full px-4 py-2"
        style={{
          opacity: disabled ? 0.45 : 1,
          backgroundColor: palette.backgroundSecondary,
          borderColor: palette.border,
          borderWidth: 1,
        }}
      >
        <Text className="text-[14px] font-bold" style={{ color: palette.text }} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}
