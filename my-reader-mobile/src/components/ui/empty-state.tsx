import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolView } from "expo-symbols";
import { type ReactNode } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";

import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

export type EmptyStateIcon = {
  ios: string;
  android: string;
};

const DEFAULT_ICON: EmptyStateIcon = {
  ios: "book.closed.fill",
  android: "menu-book",
};

const TAB_BAR_ESTIMATE = Platform.OS === "ios" ? 49 : 56;
const SCREEN_PAD = 56; // pt-4 (16) + pb-10 (40)

export function EmptyState({
  title,
  detail,
  action,
  icon = DEFAULT_ICON,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
  icon?: EmptyStateIcon;
}) {
  const palette = useThemePalette();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const availableHeight = windowHeight - insets.top - insets.bottom - headerHeight - TAB_BAR_ESTIMATE;
  const minHeight = availableHeight - SCREEN_PAD;

  return (
    <View
      className="flex-1 items-center justify-center px-6"
      style={{ minHeight: Math.max(minHeight, 300), gap: 24 }}
    >
      {Platform.OS === "ios" ? (
        <SymbolView name={icon.ios as never} size={80} tintColor={palette.border} />
      ) : (
        <MaterialIcons name={icon.android as never} size={80} color={palette.border} />
      )}

      <View className="items-center" style={{ gap: 8 }}>
        <Text
          className="text-center text-[17px] leading-6"
          style={{ color: palette.text, fontWeight: "600" }}
        >
          {title}
        </Text>
        <Text
          className="text-center text-[15px] leading-6"
          style={{ color: palette.textMuted, maxWidth: 280 }}
        >
          {detail}
        </Text>
      </View>

      {action ? (
        <View className="w-full flex-row justify-center" style={{ maxWidth: 280 }}>
          {action}
        </View>
      ) : null}
    </View>
  );
}
