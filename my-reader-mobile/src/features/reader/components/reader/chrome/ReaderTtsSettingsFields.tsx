import { BottomSheetTextInput } from "@expo/ui/community/bottom-sheet"
import type { MenuAction } from "@react-native-menu/menu"
import { StyleSheet, View as RNView } from "react-native"
import { FormSelect } from "@/src/components"
import {
  readerFormColors,
  type ReaderChromePalette,
} from "@/src/design/reader-chrome-palette"
import { Text, View } from "@/tw"

export function ReaderTtsMenuRow({
  title,
  value,
  actions,
  palette,
  onSelect,
}: {
  title: string
  value: string
  actions: MenuAction[]
  palette: ReaderChromePalette
  onSelect: (id: string) => void
}) {
  return (
    <View>
      <FormSelect
        label={title}
        labelMode="external"
        value={value}
        colors={readerFormColors(palette)}
        actions={actions.map(({ id, title, attributes, state }) => ({
          id,
          title,
          attributes,
          state: state === "on" ? "on" : "off",
        }))}
        onSelect={onSelect}
      />
    </View>
  )
}

export function ProviderTextField({
  label,
  multiline = false,
  onChangeText,
  palette,
  placeholder,
  required = false,
  secureTextEntry = false,
  testID,
  value,
}: {
  label: string
  multiline?: boolean
  onChangeText: (value: string) => void
  palette: ReaderChromePalette
  placeholder?: string
  required?: boolean
  secureTextEntry?: boolean
  testID: string
  value: string
}) {
  return (
    <RNView style={styles.providerField}>
      <Text
        className="mb-2 text-base font-semibold"
        style={{ color: palette.textMuted }}
      >
        {label}
        {required ? " *" : ""}
      </Text>
      <BottomSheetTextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textFaint}
        secureTextEntry={secureTextEntry}
        selectionColor={palette.accentText}
        style={[
          styles.providerInput,
          multiline ? styles.providerMultilineInput : null,
          {
            backgroundColor: palette.segmentIdle,
            borderColor: palette.border,
            color: palette.text,
          },
        ]}
        testID={testID}
        value={value}
      />
    </RNView>
  )
}

const styles = StyleSheet.create({
  providerField: {
    marginBottom: 16,
  },
  providerInput: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
  },
  providerMultilineInput: {
    minHeight: 92,
    textAlignVertical: "top",
  },
})
