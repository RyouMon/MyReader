import { type ReactNode } from "react";
import {
  Platform,
  Pressable as RNPressable,
  StyleSheet,
  TouchableNativeFeedback,
  type ViewStyle,
} from "react-native";

import chroma from "chroma-js";

import { mixInk } from "@/src/design/reader-chrome-palette";
import { useTheme, useThemePalette, type ThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

const ROW_CLASS = "min-h-16 flex-row items-center justify-between gap-3 px-4 py-4";
const SECONDARY_CLASS = "text-[13px] leading-5";

function settingsRowPressedBackground(colorScheme: "light" | "dark", palette: ThemePalette) {
  if (colorScheme === "light") {
    return mixInk(palette.text, palette.surface, 12);
  }

  return chroma(palette.surface).brighten(0.5).hex();
}

function settingsRowAndroidPressBackground(colorScheme: "light" | "dark", palette: ThemePalette) {
  if (colorScheme === "light") {
    return TouchableNativeFeedback.Ripple(chroma(palette.text).alpha(0.14).css(), false);
  }

  return TouchableNativeFeedback.SelectableBackground();
}

function rowSeparatorStyle(isLast: boolean | undefined, palette: ThemePalette): ViewStyle {
  return {
    borderBottomColor: palette.borderStrong,
    borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
  };
}

type SettingsRowProps = {
  title: string;
  /** Muted secondary text shown below the title. */
  detail?: string;
  /** Muted secondary text shown on the trailing edge. */
  value?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  isLast?: boolean;
};

export function SettingsRow({
  title,
  detail,
  value,
  trailing,
  onPress,
  isLast,
}: SettingsRowProps) {
  const { colorScheme } = useTheme();
  const palette = useThemePalette();
  const resolvedScheme = colorScheme === "dark" ? "dark" : "light";
  const rowPressedBackground = settingsRowPressedBackground(resolvedScheme, palette);
  const androidPressBackground = settingsRowAndroidPressBackground(resolvedScheme, palette);
  const separatorStyle = rowSeparatorStyle(isLast, palette);
  const hasValue = value != null && value.length > 0;

  const body = (
    <>
      <View className="flex-1 gap-1">
        <Text selectable className="text-[16px] leading-6" style={{ color: palette.text }}>
          {title}
        </Text>
        {detail ? (
          <Text selectable className={SECONDARY_CLASS} style={{ color: palette.textMuted }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {hasValue ? (
        <Text selectable className={`shrink ${SECONDARY_CLASS}`} style={{ color: palette.textMuted }}>
          {value}
        </Text>
      ) : null}
      {trailing}
    </>
  );

  if (!onPress) {
    return (
      <View className={ROW_CLASS} style={separatorStyle}>
        {body}
      </View>
    );
  }

  if (Platform.OS === "android") {
    return (
      <View style={separatorStyle}>
        <TouchableNativeFeedback
          accessibilityRole="button"
          background={androidPressBackground}
          onPress={onPress}
        >
          <View className={ROW_CLASS} style={{ backgroundColor: palette.surface }}>
            {body}
          </View>
        </TouchableNativeFeedback>
      </View>
    );
  }

  return (
    <View style={separatorStyle}>
      <RNPressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.pressableRow,
          { backgroundColor: pressed ? rowPressedBackground : palette.surface },
        ]}
      >
        <View className={ROW_CLASS}>{body}</View>
      </RNPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pressableRow: {
    width: "100%",
  },
});
