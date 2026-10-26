import { BottomSheetTextInput } from "@expo/ui/community/bottom-sheet"
import {
  MenuView,
  type MenuAction,
  type MenuComponentRef,
} from "@react-native-menu/menu"
import { useRef } from "react"
import { Platform, Pressable, StyleSheet, View as RNView } from "react-native"
import { IosSelectMenu } from "@/src/components/ui/ios-select-menu"
import type { ReaderChromePalette } from "@/src/design/reader-chrome-palette"
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
  const menuRef = useRef<MenuComponentRef>(null)

  const trigger = (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      disabled={actions.length === 0}
      onPress={() => menuRef.current?.show()}
      style={({ pressed }) => [
        styles.menuRow,
        {
          backgroundColor: palette.segmentIdle,
          opacity: actions.length === 0 ? 0.55 : pressed ? 0.72 : 1,
        },
      ]}
    >
      <Text className="text-base font-semibold" style={{ color: palette.text }}>
        {title}
      </Text>
      <Text
        className="min-w-0 flex-1 text-right text-base"
        numberOfLines={1}
        style={{ color: palette.textMuted }}
      >
        {value}
      </Text>
    </Pressable>
  )
  return (
    <View style={styles.menuAnchor}>
      {Platform.OS === "android" ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <MenuView
            ref={menuRef}
            actions={actions}
            isAnchoredToRight
            onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
            style={StyleSheet.absoluteFill}
          >
            <View style={StyleSheet.absoluteFill} />
          </MenuView>
        </View>
      ) : null}
      {Platform.OS === "ios" ? (
        <IosSelectMenu
          label={title}
          onSelect={onSelect}
          actions={actions.map(({ id, title, attributes, state }) => ({
            id,
            title,
            attributes,
            state: state === "on" ? "on" : state === "off" ? "off" : undefined,
          }))}
        >
          {trigger}
        </IosSelectMenu>
      ) : (
        trigger
      )}
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
  menuAnchor: {
    position: "relative",
    marginBottom: 18,
  },
  menuRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
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
