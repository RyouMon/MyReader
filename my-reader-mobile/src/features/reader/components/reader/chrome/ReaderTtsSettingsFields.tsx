import { BottomSheetTextInput } from "@expo/ui/community/bottom-sheet"
import type { MenuAction } from "@react-native-menu/menu"
import { FormSelect, FormTextField } from "@/src/components"
import {
  VoiceSelect,
  type VoiceSelectPreviewProps,
} from "@/src/components/ui/voice-select"
import {
  type ReaderChromePalette,
  readerFormColors,
} from "@/src/design/reader-chrome-palette"
import { View } from "@/tw"

export function ReaderTtsMenuRow({
  title,
  value,
  actions,
  palette,
  onSelect,
  preview,
}: {
  title: string
  value: string
  actions: MenuAction[]
  palette: ReaderChromePalette
  preview?: VoiceSelectPreviewProps
  onSelect: (id: string) => void
}) {
  const props = {
    label: title,
    labelMode: "external" as const,
    value,
    colors: readerFormColors(palette),
    actions: actions.map(({ id, title, attributes, state }) => ({
      id,
      title,
      attributes,
      state: state === "on" ? ("on" as const) : ("off" as const),
    })),
    onSelect,
  }
  return (
    <View>
      {preview ? (
        <VoiceSelect {...props} {...preview} />
      ) : (
        <FormSelect {...props} />
      )}
    </View>
  )
}

export function ProviderTextField({
  label,
  editable = true,
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
  editable?: boolean
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
    <FormTextField
      label={label}
      editable={editable}
      required={required}
      colors={readerFormColors(palette)}
      autoCapitalize="none"
      autoCorrect={false}
      multiline={multiline}
      onChangeText={onChangeText}
      placeholder={placeholder}
      secureTextEntry={secureTextEntry}
      numberOfLines={multiline ? 3 : 1}
      render={(props) => <BottomSheetTextInput {...props} />}
      testID={testID}
      value={value}
    />
  )
}
