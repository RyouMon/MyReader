import { forwardRef, type ComponentRef } from "react"
import {
  TextInput as PaperTextInput,
  type TextInputProps,
} from "react-native-paper"

import { useTheme } from "@/src/design/tokens"
import { Text, View } from "@/tw"

type Props = Omit<TextInputProps, "label" | "error" | "theme" | "mode"> & {
  label: string
  required?: boolean
  error?: string
}

export const FormTextField = forwardRef<
  ComponentRef<typeof PaperTextInput>,
  Props
>(function FormTextField(
  {
    label,
    required,
    error,
    style,
    contentStyle,
    placeholder,

    ...props
  },
  ref,
) {
  const { palette, colorScheme } = useTheme()
  const displayedLabel = required ? `${label} *` : label

  return (
    <View className="gap-1">
      <PaperTextInput
        ref={(input: ComponentRef<typeof PaperTextInput> | null) => {
          if (typeof ref === "function") ref(input)
          else if (ref) ref.current = input
        }}
        mode="flat"
        label={displayedLabel}
        accessibilityLabel={label}
        placeholder={placeholder === label ? undefined : placeholder}
        error={Boolean(error)}
        underlineColor="transparent"
        activeUnderlineColor={error ? palette.danger : palette.primary}
        textColor={palette.text}
        selectionColor={palette.primary}
        cursorColor={palette.primary}
        maxFontSizeMultiplier={0}
        theme={{
          dark: colorScheme === "dark",
          roundness: 24,
          colors: {
            primary: palette.primary,
            onSurface: palette.text,
            onSurfaceVariant: palette.textMuted,
            surfaceVariant: palette.surface,
            error: palette.danger,
            onSurfaceDisabled: palette.textMuted,
          },
        }}
        style={[
          {
            backgroundColor: palette.surface,
            borderRadius: 24,
            overflow: "hidden",
            fontSize: 16,
          },
          style,
        ]}
        contentStyle={[{ paddingHorizontal: 16 }, contentStyle]}
        {...props}
      />
      {error ? (
        <Text
          selectable
          accessibilityRole="alert"
          className="px-4 text-sm"
          style={{ color: palette.danger }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  )
})
