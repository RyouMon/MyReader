import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ComponentProps } from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useThemePalette } from "@/src/design/tokens";
import { Pressable, View } from "@/tw";

import { Button } from "./button";

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
      <Button
        className="self-start"
        disabled={disabled}
        onPress={onPress}
        size="md"
        title={label}
        variant="secondary"
      />
    </View>
  );
}
