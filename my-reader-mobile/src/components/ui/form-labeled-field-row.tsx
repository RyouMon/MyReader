import type { ReactNode } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

import { FORM_FIELD_CONTROL_MIN_HEIGHT_CLASS } from "./form-field-tokens";

/**
 * 表单横向行：左侧固定宽度标签，右侧为输入或其它控件（如开关）。
 */
export function FormLabeledFieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const palette = useThemePalette();

  return (
    <View
      className="min-h-12 flex-row items-center gap-2 rounded-[18px] px-3 py-2"
      style={{ backgroundColor: palette.backgroundSecondary }}
    >
      <View className="w-28 shrink-0 justify-center pr-1">
        <Text className="text-[15px] font-semibold leading-5" numberOfLines={2} style={{ color: palette.text }}>
          {label}
        </Text>
      </View>
      <View className={`min-w-0 flex-1 justify-center ${FORM_FIELD_CONTROL_MIN_HEIGHT_CLASS}`}>{children}</View>
    </View>
  );
}
