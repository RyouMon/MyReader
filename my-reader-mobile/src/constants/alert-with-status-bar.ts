import i18n from "@/src/i18n"

import {
  Alert,
  Appearance,
  type AlertButton,
  type AlertOptions,
} from "react-native"
import { setStatusBarStyle, type StatusBarStyle } from "expo-status-bar"

const STATUS_BAR_RESTORE_DELAY_MS = [0, 80, 240] as const
let preferredStatusBarStyle: StatusBarStyle | null = null

/**
 * Stores app-level preferred status bar style for alert restoration.
 */
export function setAlertStatusBarPreferredStyle(style: StatusBarStyle) {
  preferredStatusBarStyle = style
}

/**
 * Returns the preferred status bar style based on the current color scheme.
 */
function getPreferredStatusBarStyle(): StatusBarStyle {
  if (preferredStatusBarStyle) {
    return preferredStatusBarStyle
  }

  return Appearance.getColorScheme() === "dark" ? "light" : "dark"
}

/**
 * Re-applies app status bar style after native alert overlay is dismissed.
 */
function restoreStatusBarStyle() {
  const style = getPreferredStatusBarStyle()
  for (const delay of STATUS_BAR_RESTORE_DELAY_MS) {
    setTimeout(() => {
      setStatusBarStyle(style, true)
    }, delay)
  }
}

/**
 * Wraps alert buttons so any dismissal path restores status bar style.
 */
function wrapButtons(buttons?: readonly AlertButton[]) {
  if (!buttons || buttons.length === 0) {
    return [
      {
        text: i18n.t("common.confirm"),
        onPress: restoreStatusBarStyle,
      } satisfies AlertButton,
    ]
  }

  return buttons.map((button) => {
    const originalOnPress = button.onPress
    return {
      ...button,
      onPress: (value?: unknown) => {
        ;(originalOnPress as ((param?: unknown) => void) | undefined)?.(value)
        restoreStatusBarStyle()
      },
    } satisfies AlertButton
  })
}

/**
 * Shows a native alert and guarantees status bar style restoration.
 */
export function showAlertWithStatusBarRestore(
  title: string,
  message?: string,
  buttons?: readonly AlertButton[],
  options?: AlertOptions,
) {
  Alert.alert(title, message, wrapButtons(buttons), {
    ...options,
    onDismiss: () => {
      options?.onDismiss?.()
      restoreStatusBarStyle()
    },
  })
}
