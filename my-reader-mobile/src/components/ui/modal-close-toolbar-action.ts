import { router, type RelativePathString } from "expo-router";

import type { HeaderToolbarAction } from "./header-toolbar";

/** Builds a native-toolbar close action that dismisses the modal stack on iOS. */
export function modalCloseToolbarAction(
  label: string,
  fallbackRoute: RelativePathString = "/settings" as RelativePathString,
  options?: { dismissTo?: boolean },
): HeaderToolbarAction {
  return {
    label,
    onPress: () => {
      if (options?.dismissTo) {
        router.dismissTo(fallbackRoute);
        return;
      }
      if (router.canGoBack()) {
        router.dismiss();
        return;
      }
      router.replace(fallbackRoute);
    },
    iosSfSymbol: "xmark",
    iconOnly: true,
  };
}
