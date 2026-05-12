import type { ReactNode } from "react";

import { TouchableNativeFeedback, View } from "react-native";
import type { MenuComponentRef } from "@react-native-menu/menu";

import { useThemePalette } from "@/src/design/tokens";

/** Renders an Android icon button with native ripple feedback for MenuView triggers. */
export function AndroidMenuRippleButton({
  icon,
  menuRef,
  accessibilityLabel,
}: {
  icon: ReactNode;
  menuRef: React.RefObject<MenuComponentRef | null>;
  accessibilityLabel?: string;
}) {
  const palette = useThemePalette();
  return (
    <TouchableNativeFeedback
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      background={TouchableNativeFeedback.SelectableBackgroundBorderless()}
      onPress={() => menuRef.current?.show()}
    >
      <View
        className="h-10 w-10 rounded-full items-center justify-center overflow-hidden border"
        style={{ backgroundColor: palette.surface, borderColor: palette.border }}
      >
        {icon}
      </View>
    </TouchableNativeFeedback>
  );
}
