import { type ReactNode } from "react";
import { Platform, TouchableNativeFeedback } from "react-native";

import { useThemePalette } from "@/src/design/tokens";
import { Pressable, Text, TouchableHighlight, View } from "@/tw";

const ROW_CLASS = "min-h-16 flex-row items-center justify-between gap-3 px-4 py-4";

export function SettingsRow({
  title,
  detail,
  trailing,
  onPress,
  isLast,
}: {
  title: string;
  detail?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  isLast?: boolean;
}) {
  const palette = useThemePalette();
  const borderStyle = {
    borderBottomColor: palette.border,
    borderBottomWidth: isLast ? 0 : 1,
  };

  const body = (
    <>
      <View className="flex-1 gap-1">
        <Text selectable className="text-[16px] leading-6" style={{ color: palette.text, fontWeight: "700" }}>
          {title}
        </Text>
        {detail ? (
          <Text selectable className="text-[13px] leading-5" style={{ color: palette.textMuted }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing}
    </>
  );

  if (!onPress) {
    return (
      <View className={ROW_CLASS} style={borderStyle}>
        {body}
      </View>
    );
  }

  if (Platform.OS === "android") {
    return (
      <TouchableNativeFeedback
        accessibilityRole="button"
        background={TouchableNativeFeedback.SelectableBackground()}
        onPress={onPress}
      >
        <View className={ROW_CLASS} style={borderStyle}>
          {body}
        </View>
      </TouchableNativeFeedback>
    );
  }

  if (Platform.OS === "ios") {
    return (
      <TouchableHighlight
        accessibilityRole="button"
        underlayColor={palette.surface}
        onPress={onPress}
      >
        <View className={ROW_CLASS} style={borderStyle}>
          {body}
        </View>
      </TouchableHighlight>
    );
  }

  return (
    <Pressable accessibilityRole="button" className={ROW_CLASS} onPress={onPress} style={borderStyle}>
      {body}
    </Pressable>
  );
}
