import { forwardRef, type ComponentRef } from "react"
import {
  TextInput as PaperTextInput,
  type TextInputProps,
} from "react-native-paper"

import { useTheme, type ThemePalette } from "@/src/design/tokens"
import { Text, View } from "@/tw"

type Props = Omit<TextInputProps, "label" | "error" | "theme" | "mode"> & {
  label: string
  required?: boolean
  error?: string
  labelMode?: "floating" | "hidden" | "external"
  colors?: Partial<ThemePalette>
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
    labelMode = "floating",
    colors,
    ...props
  },
  ref,
) {
  const { palette: appPalette, colorScheme } = useTheme()
  const palette = { ...appPalette, ...colors }
  const displayedLabel = required ? `${label} *` : label

  return (
    <View className="gap-1">
      {labelMode === "external" ? (
        <Text className="px-4 pb-1 text-base" style={{ color: palette.text }}>
          {displayedLabel}
        </Text>
      ) : null}
      <PaperTextInput
        ref={(input: ComponentRef<typeof PaperTextInput> | null) => {
          if (typeof ref === "function") ref(input)
          else if (ref) ref.current = input
        }}
        mode="flat"
        label={labelMode === "floating" ? displayedLabel : undefined}
        accessibilityLabel={label}
        placeholder={
          labelMode === "floating" && placeholder === label
            ? undefined
            : placeholder
        }
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
