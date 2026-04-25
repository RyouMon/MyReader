import { Platform, Switch } from "react-native";

import { useThemePalette } from "@/src/design/tokens";
import { View } from "@/tw";

const FORM_FIELD_SWITCH_SCALE = Platform.OS === "android" ? 0.82 : 0.88;

/**
 * 与 `FormLabeledFieldRow` 右侧输入区对齐的开关：统一行内高度并略缩放置，便于与 `TextInput` 同排展示。
 */
export function FormFieldSwitch({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const palette = useThemePalette();

  return (
    <View className="w-full min-h-0 flex-1 flex-row items-center justify-end self-stretch">
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: palette.border, true: palette.primary }}
        thumbColor={palette.surface}
        ios_backgroundColor={palette.backgroundSecondary}
        style={{ transform: [{ scaleX: FORM_FIELD_SWITCH_SCALE }, { scaleY: FORM_FIELD_SWITCH_SCALE }] }}
      />
    </View>
  );
}
