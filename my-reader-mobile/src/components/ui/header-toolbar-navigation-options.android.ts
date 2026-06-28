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
    options.headerLeft = wrapAndroidHeaderAction("left", renderLeft)
  }

  if (hasRight) {
    options.headerRight = wrapAndroidHeaderAction("right", renderRight)
  }

  return options
}

export type { AndroidHeaderToolbarNavigationOptionsInput }
