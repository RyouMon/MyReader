import type { NativeStackNavigationOptions } from "expo-router";
import type { ReactNode } from "react";

type AndroidHeaderToolbarNavigationOptionsInput = {
  hasLeft: boolean;
  hasRight: boolean;
  renderLeft: () => ReactNode;
  renderRight: () => ReactNode;
};

/** Builds native-stack header overrides for Android toolbar actions. */
export function buildAndroidHeaderToolbarNavigationOptions({
  hasLeft,
  hasRight,
  renderLeft,
  renderRight,
}: AndroidHeaderToolbarNavigationOptionsInput): NativeStackNavigationOptions {
  const options: NativeStackNavigationOptions = {};

  if (hasLeft) {
    options.headerBackVisible = false;
    options.headerLeft = renderLeft;
  }

  if (hasRight) {
    options.headerRight = renderRight;
  }

  return options;
}

export type { AndroidHeaderToolbarNavigationOptionsInput };
