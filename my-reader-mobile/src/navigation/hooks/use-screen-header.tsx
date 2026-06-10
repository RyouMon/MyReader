import {
  type NativeStackNavigationOptions,
  router,
} from "expo-router";
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import type { SFSymbol } from "expo-symbols";
import type { ColorValue } from "react-native";

import {
  buildAndroidHeaderToolbarNavigationOptions,
  renderHeaderToolbarActions,
} from "@/src/components/ui/header-toolbar.android";
import { HeaderToolbar } from "@/src/components/ui/header-toolbar";
import { HeaderCloseButton } from "@/src/components/ui/button";

export type ScreenHeaderAction = {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  iosSfSymbol?: SFSymbol;
  color?: ColorValue;
  iconOnly?: boolean;
  loading?: boolean;
  disabled?: boolean;
  variant?: "done" | "prominent" | "plain";
};

export type UseScreenHeaderOptions = {
  title?: string;
  headerLargeTitle?: boolean;
  headerShadowVisible?: boolean;
  back?: "auto" | "hidden";
  /** iOS: back button label on the next pushed screen (defaults to this screen's title). */
  backTitle?: string;
  close?: {
    label?: string;
    target?: string;
    dismissTo?: boolean;
    variant?: "toolbar" | "layout";
  };
  left?: ScreenHeaderAction[];
  right?: ScreenHeaderAction[];
};

export type UseScreenHeaderResult = {
  options: NativeStackNavigationOptions;
  toolbar: ReactNode;
};

function buildCloseAction(
  close: UseScreenHeaderOptions["close"],
  t: (key: string) => string,
): ScreenHeaderAction | undefined {
  if (!close) return undefined;

  const fallbackRoute = (close.target ?? "/settings") as import("expo-router").RelativePathString;

  return {
    label: close.label ?? t("common.close"),
    onPress: () => {
      if (close.dismissTo) {
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

/** Generates screen header options and platform-specific toolbar nodes. */
export function useScreenHeader({
  title,
  headerLargeTitle,
  headerShadowVisible,
  back = "auto",
  backTitle,
  close,
  left,
  right,
}: UseScreenHeaderOptions): UseScreenHeaderResult {
  const { t } = useTranslation();
  const closeAction = useMemo(() => buildCloseAction(close, t), [close, t]);

  const androidOptions = useMemo((): NativeStackNavigationOptions => {
    if (Platform.OS !== "android") return {};

    const options: NativeStackNavigationOptions = {};
    if (title !== undefined) options.title = title;
    if (headerLargeTitle !== undefined) options.headerLargeTitle = headerLargeTitle;
    if (headerShadowVisible !== undefined) options.headerShadowVisible = headerShadowVisible;

    const hasLeftActions = (left?.length ?? 0) > 0;
    const hasRightActions = (right?.length ?? 0) > 0;

    if (hasLeftActions || hasRightActions) {
      Object.assign(
        options,
        buildAndroidHeaderToolbarNavigationOptions({
          hasLeft: hasLeftActions,
          hasRight: hasRightActions,
          renderLeft: () => renderHeaderToolbarActions(left),
          renderRight: () => renderHeaderToolbarActions(right),
        }),
      );
    }

    return options;
  }, [title, headerLargeTitle, headerShadowVisible, left, right]);

  const useLayoutClose = close?.variant === "layout";

  const iosToolbarLeftActions = useMemo((): ScreenHeaderAction[] | undefined => {
    if (Platform.OS !== "ios") return undefined;

    const actions: ScreenHeaderAction[] = [];
    if (closeAction && !useLayoutClose) {
      actions.push(closeAction);
    }
    if (left?.length) {
      actions.push(...left);
    }

    return actions.length > 0 ? actions : undefined;
  }, [closeAction, useLayoutClose, left]);

  const iosOptions = useMemo((): NativeStackNavigationOptions => {
    if (Platform.OS !== "ios") return {};

    const options: NativeStackNavigationOptions = {};
    if (title !== undefined) options.title = title;
    if (headerLargeTitle !== undefined) options.headerLargeTitle = headerLargeTitle;
    if (headerShadowVisible !== undefined) options.headerShadowVisible = headerShadowVisible;

    const hasClose = close != null;

    if (useLayoutClose) {
      options.headerLeft = () => (
        <HeaderCloseButton
          fallbackRoute={(close?.target ?? "/settings") as import("expo-router").Href}
          dismissTo={close?.dismissTo}
        />
      );
    }

    if (backTitle !== undefined) {
      options.headerBackTitle = backTitle;
    }

    if (hasClose || back === "hidden") {
      options.headerBackVisible = false;
    } else if (back === "auto") {
      options.headerBackVisible = true;
      options.headerBackButtonDisplayMode = "generic";
    }

    return options;
  }, [title, headerLargeTitle, headerShadowVisible, back, backTitle, useLayoutClose, close]);

  const toolbar = useMemo((): ReactNode => {
    if (Platform.OS !== "ios") return null;

    const hasToolbarLeft = (iosToolbarLeftActions?.length ?? 0) > 0;
    const hasToolbarRight = (right?.length ?? 0) > 0;
    if (!hasToolbarLeft && !hasToolbarRight) return null;

    return <HeaderToolbar left={iosToolbarLeftActions} right={right} />;
  }, [iosToolbarLeftActions, right]);

  const options = Platform.OS === "android" ? androidOptions : iosOptions;

  return { options, toolbar };
}
