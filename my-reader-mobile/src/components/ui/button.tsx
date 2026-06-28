import MaterialIcons from "@expo/vector-icons/MaterialIcons"
import { router, type Href } from "expo-router"
import { SymbolView } from "expo-symbols"
import { type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  ActivityIndicator,
  Platform,
  Pressable,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native"

import { useThemePalette, type ThemePalette } from "@/src/design/tokens"
import { Text, TouchableHighlight, View } from "@/tw"

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
export type ButtonSize = "sm" | "md" | "lg"
export type HeaderCloseButtonProps = {
  fallbackRoute?: Href
  dismissTo?: boolean
}

type ButtonColorOverrides = {
  backgroundColor?: string
  borderColor?: string
  indicatorColor?: string
  textColor?: string
  underlayColor?: string
}

export type ButtonProps = {
  accessibilityLabel?: string
  children?: ReactNode
  className?: string
  colors?: ButtonColorOverrides
  contentClassName?: string
  disabled?: boolean
  loading?: boolean
  onPress?: () => void
  size?: ButtonSize
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
  title?: string
  variant?: ButtonVariant
}

const SIZE_CLASS: Record<
  ButtonSize,
  { content: string; text: string; gap: number }
> = {
  sm: {
    content: "min-h-9 px-3 py-1.5",
    gap: 6,
    text: "text-sm",
  },
  md: {
    content: "min-h-11 px-4 py-2",
    gap: 8,
    text: "text-base",
  },
  lg: {
    content: "min-h-12 px-4 py-3",
    gap: 8,
    text: "text-lg",
  },
}

/**
 * Joins NativeWind class names without introducing an external dependency.
 */
function cx(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(" ")
}

/**
 * Resolves the semantic button colors from the current mobile theme.
 */
function getButtonColors(
  palette: ThemePalette,
  variant: ButtonVariant,
): Required<ButtonColorOverrides> {
  switch (variant) {
    case "primary":
      return {
        backgroundColor: palette.primary,
        borderColor: palette.primary,
        indicatorColor: palette.primaryForeground,
        textColor: palette.primaryForeground,
        underlayColor: palette.secondary,
      }
    case "secondary":
      return {
        backgroundColor: palette.surface,
        borderColor: palette.border,
        indicatorColor: palette.text,
        textColor: palette.text,
        underlayColor: palette.background,
      }
    case "outline":
      return {
        backgroundColor: "transparent",
        borderColor: palette.border,
        indicatorColor: palette.text,
        textColor: palette.text,
        underlayColor: palette.backgroundSecondary,
      }
    case "ghost":
      return {
        backgroundColor: "transparent",
        borderColor: "transparent",
        indicatorColor: palette.text,
        textColor: palette.text,
        underlayColor: palette.backgroundSecondary,
      }
    case "danger":
      return {
        backgroundColor: palette.danger,
        borderColor: palette.danger,
        indicatorColor: palette.primaryForeground,
        textColor: palette.primaryForeground,
        underlayColor: palette.error,
      }
  }
}

/**
 * Renders the shared touch-highlight button used by mobile CTA and pill actions.
 */
export function Button({
  accessibilityLabel,
  children,
  className,
  colors,
  contentClassName,
  disabled = false,
  loading = false,
  onPress,
  size = "lg",
  style,
  textStyle,
  title,
  variant = "primary",
}: ButtonProps) {
  const palette = useThemePalette()
  const sizeClass = SIZE_CLASS[size]
  const resolvedColors = {
    ...getButtonColors(palette, variant),
    ...colors,
  }
  const isDisabled = disabled || loading

  return (
    <TouchableHighlight
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      className={cx("overflow-hidden rounded-full", className)}
      disabled={isDisabled}
      onPress={onPress}
      underlayColor={resolvedColors.underlayColor}
      style={[
        {
          backgroundColor: resolvedColors.backgroundColor,
          borderColor: resolvedColors.borderColor,
          borderWidth: resolvedColors.borderColor === "transparent" ? 0 : 1,
          opacity: isDisabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      <View
        className={cx(
          "flex-row items-center justify-center rounded-full",
          sizeClass.content,
          contentClassName,
        )}
        style={{ columnGap: sizeClass.gap }}
      >
        {loading ? (
          <ActivityIndicator
            color={resolvedColors.indicatorColor}
            size="small"
          />
        ) : null}
        {children ?? (
          <Text
            className={cx(sizeClass.text, "font-bold")}
            style={[{ color: resolvedColors.textColor }, textStyle]}
          >
            {title}
          </Text>
        )}
      </View>
    </TouchableHighlight>
  )
}

/**
 * Renders the primary action button with theme-aware colors.
 */
export function PrimaryButton({
  title,
  onPress,
  disabled,
}: {
  disabled?: boolean
  title: string
  onPress?: () => void
}) {
  return (
    <Button
      className="flex-1"
      disabled={disabled}
      onPress={onPress}
      title={title}
      variant="primary"
    />
  )
}

/**
 * Renders the secondary action button with the shared button treatment.
 */
export function SecondaryButton({
  title,
  onPress,
  disabled,
}: {
  disabled?: boolean
  title: string
  onPress?: () => void
}) {
  return (
    <Button
      className="flex-1"
      disabled={disabled}
      onPress={onPress}
      title={title}
      variant="secondary"
    />
  )
}

/**
 * Renders a compact round icon button for toolbars and header actions.
 */
export function RoundIconButton({
  label,
  onPress,
  icon,
  size = "default",
  disabled,
}: {
  disabled?: boolean
  icon?: ReactNode
  label: string
  onPress?: () => void
  size?: "default" | "large"
}) {
  const palette = useThemePalette()
  const isLarge = size === "large"

  return (
    <TouchableHighlight
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cx("overflow-hidden", isLarge ? "rounded-2xl" : "rounded-3xl")}
      disabled={disabled}
      onPress={onPress}
      underlayColor={palette.backgroundSecondary}
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        borderWidth: 1,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <View
        className={
          isLarge
            ? "min-h-14 min-w-14 items-center justify-center px-4"
            : "min-h-12 min-w-12 items-center justify-center px-3"
        }
      >
        {icon ?? (
          <Text
            className="text-sm font-semibold"
            style={{ color: palette.text }}
          >
            {label}
          </Text>
        )}
      </View>
    </TouchableHighlight>
  )
}

/**
 * Renders a selectable filter chip with the same touch feedback as buttons.
 */
export function FilterChip({
  active,
  label,
  onPress,
}: {
  active?: boolean
  label: string
  onPress?: () => void
}) {
  return (
    <Button
      className="self-start"
      onPress={onPress}
      size="md"
      title={label}
      variant={active ? "primary" : "secondary"}
    />
  )
}

/**
 * Reuses the same modal-close behavior and icon across stack headers.
 */
export function HeaderCloseButton({
  fallbackRoute = "/",
  dismissTo,
}: HeaderCloseButtonProps) {
  const { t } = useTranslation()
  const palette = useThemePalette()

  return (
    <Pressable
      hitSlop={8}
      testID="header-close-button"
      accessibilityLabel={t("common.close")}
      accessibilityRole="button"
      onPress={() => {
        if (dismissTo) {
          router.dismissTo(fallbackRoute)
          return
        }
        if (router.canGoBack()) {
          router.dismiss()
          return
        }
        router.replace(fallbackRoute)
      }}
    >
      {Platform.OS === "ios" ? (
        <SymbolView name="xmark" weight="semibold" tintColor={palette.text} />
      ) : (
        <MaterialIcons name="close" size={24} color={palette.text} />
      )}
    </Pressable>
  )
}
