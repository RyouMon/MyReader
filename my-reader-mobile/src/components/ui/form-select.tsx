import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native"
import { TextInput } from "react-native-paper"
import type { ComponentProps } from "react"
import { View } from "@/tw"
import { FormTextField } from "./form-text-field"
import { NativeSelectMenu } from "./native-select-menu"
import type { SelectMenuAction } from "./ios-select-menu"
import { PlatformIcon } from "./platform-icon"

type Props = Pick<
  ComponentProps<typeof FormTextField>,
  "label" | "labelMode" | "colors" | "error" | "placeholder" | "testID"
> & {
  value: string
  actions: SelectMenuAction[]
  onSelect: (id: string) => void
  disabled?: boolean
}

export function FormSelect({ actions, onSelect, disabled, ...field }: Props) {
  const unavailable = disabled || actions.length === 0
  return (
    <NativeSelectMenu
      label={field.label}
      actions={actions}
      disabled={unavailable}
      onSelect={onSelect}
    >
      {(open) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={field.label}
          accessibilityValue={{ text: field.value }}
          accessibilityState={{ disabled: unavailable }}
          disabled={unavailable}
          onPress={open}
          style={({ pressed }) => ({
            opacity: unavailable ? 0.55 : pressed ? 0.72 : 1,
          })}
        >
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <FormTextField
              {...field}
              editable={false}
              render={(props) => <SelectValue {...props} />}
              right={
                <TextInput.Icon
                  icon={({ size, color }) => (
                    <PlatformIcon
                      name={{ ios: "chevron.down", android: "arrow-drop-down" }}
                      size={size}
                      color={color}
                    />
                  )}
                />
              }
            />
          </View>
        </Pressable>
      )}
    </NativeSelectMenu>
  )
}

function SelectValue({
  style,
  value,
  placeholder,
  placeholderTextColor,
  testID,
}: Parameters<NonNullable<ComponentProps<typeof TextInput>["render"]>>[0]) {
  const {
    color,
    fontFamily,
    fontSize,
    fontWeight,
    letterSpacing,
    lineHeight,
    textAlign,
    ...layout
  } = StyleSheet.flatten(style) as TextStyle & ViewStyle
  return (
    <View style={[layout, { justifyContent: "center" }]}>
      <Text
        testID={testID}
        numberOfLines={1}
        style={{
          color: value ? color : placeholderTextColor,
          fontFamily,
          fontSize,
          fontWeight,
          letterSpacing,
          lineHeight,
          textAlign,
        }}
      >
        {value || placeholder}
      </Text>
    </View>
  )
}
