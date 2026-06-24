import type { ReactNode } from "react";

import { useThemePalette } from "@/src/design/tokens";
import { Text, View } from "@/tw";

import { FORM_FIELD_CONTROL_MIN_HEIGHT_CLASS } from "./form-field-tokens";

/**
 * 表单横向行：左侧固定宽度标签，右侧为输入或其它控件（如开关）。
 */
export function FormLabeledFieldRow({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  const palette = useThemePalette();

  return (
    <View className="gap-1">
      <View
        className="min-h-12 flex-row items-center gap-2 rounded-[18px] px-3 py-2"
        style={{ backgroundColor: palette.backgroundSecondary }}
      >
        <View className="w-28 shrink-0 justify-center pr-1">
          <Text className="text-base font-semibold" numberOfLines={2} style={{ color: palette.text }}>
            {label}
            {required ? <Text style={{ color: palette.error }}> *</Text> : null}
          </Text>
        </View>
        <View className={`min-w-0 flex-1 justify-center ${FORM_FIELD_CONTROL_MIN_HEIGHT_CLASS}`}>{children}</View>
      </View>
      {error ? (
        <Text className="pl-3 text-xs" style={{ color: palette.error }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
