import {
  forwardRef,
  memo,
  useCallback,
  useMemo,
  type ComponentRef,
} from "react"
import { TextInput as NativeTextInput } from "react-native"
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
  floatLabel?: boolean
  colors?: Partial<ThemePalette>
}

const DEFAULT_CONTENT_STYLE = { paddingHorizontal: 16 } as const

const defaultRenderInput: NonNullable<TextInputProps["render"]> = (input) => (
  <NativeTextInput {...input} />
)

export const FormTextField = memo(
  forwardRef<ComponentRef<typeof PaperTextInput>, Props>(function FormTextField(
    {
      label,
      required,
      error,
      style,
      contentStyle,
      placeholder,
      labelMode = "floating",
      floatLabel = false,
      colors,
      ...props
    },
    ref,
  ) {
    const { palette: appPalette, colorScheme } = useTheme()
    const palette = useMemo(
      () => (colors ? { ...appPalette, ...colors } : appPalette),
      [appPalette, colors],
    )
    const displayedLabel = required ? `${label} *` : label
    const pinned =
      floatLabel &&
      labelMode === "floating" &&
      Boolean(placeholder) &&
      props.value !== undefined
    const customRender = props.render
    const rawValue = props.value
    const placeholderTextColor = props.placeholderTextColor ?? palette.textMuted

    const assignRef = useCallback(
      (input: ComponentRef<typeof PaperTextInput> | null) => {
        if (typeof ref === "function") ref(input)
        else if (ref) ref.current = input
      },
      [ref],
    )

    const paperTheme = useMemo(
      () => ({
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
      }),
      [
        colorScheme,
        palette.danger,
        palette.primary,
        palette.surface,
        palette.text,
        palette.textMuted,
      ],
    )

    const mergedStyle = useMemo(
      () => [
        {
          backgroundColor: palette.surface,
          borderRadius: 24,
          overflow: "hidden" as const,
          fontSize: 16,
        },
        style,
      ],
      [palette.surface, style],
    )

    const mergedContentStyle = useMemo(
      () =>
        contentStyle
          ? [DEFAULT_CONTENT_STYLE, contentStyle]
          : DEFAULT_CONTENT_STYLE,
      [contentStyle],
    )

    const pinnedRender = useCallback<NonNullable<TextInputProps["render"]>>(
      (input) => {
        const renderInput = customRender ?? defaultRenderInput
        return renderInput({
          ...input,
          value: rawValue,
          placeholderTextColor,
        })
      },
      [customRender, placeholderTextColor, rawValue],
    )

    return (
      <View className="gap-1">
        {labelMode === "external" ? (
          <Text className="px-4 pb-1 text-base" style={{ color: palette.text }}>
            {displayedLabel}
          </Text>
        ) : null}
        <PaperTextInput
          ref={ref ? assignRef : undefined}
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
          // Paper unconditionally sets `textAlign`, which causes RN Fabric on iOS to attach
          // an NSParagraphStyle defaulting to word-wrapping. On an unfocused single-line
          // UITextField that breaks long URLs after `https://` and clips line 2.
          lineBreakModeIOS={props.multiline ? undefined : "tail"}
          theme={paperTheme}
          style={mergedStyle}
          contentStyle={mergedContentStyle}
          {...props}
          // Paper floats labels from its value. Its public render slot keeps the
          // native value empty while the placeholder holds the label above it.
          value={pinned && !rawValue ? placeholder : rawValue}
          render={pinned ? pinnedRender : customRender}
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
  }),
)
