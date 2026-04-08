import { useThemePalette } from "@/src/design/tokens";
import { Text, TextInput, View } from "@/tw";

export function SearchField({
  placeholder,
  value,
  onChangeText,
}: {
  placeholder: string;
  value?: string;
  onChangeText?: (value: string) => void;
}) {
  const palette = useThemePalette();

  return (
    <View
      className="min-h-12 flex-row items-center gap-3 rounded-[20px] px-4 py-3"
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
      }}
    >
      <Text className="text-sm font-medium" style={{ color: palette.textMuted }}>
        搜索
      </Text>
      <TextInput
        editable
        placeholder={placeholder}
        placeholderTextColor={palette.textMuted}
        className="flex-1 text-[15px]"
        value={value}
        onChangeText={onChangeText}
        style={{ color: palette.text }}
      />
    </View>
  );
}
