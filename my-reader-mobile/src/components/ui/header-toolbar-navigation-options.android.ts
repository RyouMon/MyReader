import type { NativeStackNavigationOptions } from "expo-router"
import type { ReactNode } from "react"

import { wrapAndroidHeaderAction } from "./android-header-layout"

type AndroidHeaderToolbarNavigationOptionsInput = {
  hasLeft: boolean
  hasRight: boolean
  renderLeft: () => ReactNode
  renderRight: () => ReactNode
}

/** Builds native-stack header overrides for Android toolbar actions. */
export function buildAndroidHeaderToolbarNavigationOptions({
  hasLeft,
  hasRight,
  renderLeft,
  renderRight,
}: AndroidHeaderToolbarNavigationOptionsInput): NativeStackNavigationOptions {
  const options: NativeStackNavigationOptions = {}

  if (hasLeft) {
    options.headerBackVisible = false
    options.headerLeft = wrapAndroidHeaderAction(renderLeft)
  }

  if (hasRight) {
    options.headerRight = wrapAndroidHeaderAction(renderRight)
  }

  return options
}

export type { AndroidHeaderToolbarNavigationOptionsInput }
