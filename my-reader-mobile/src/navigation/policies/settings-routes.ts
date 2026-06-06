import type { RelativePathString } from "expo-router";

import type { PlatformOS, SettingsHeaderLead } from "../types";

export const SETTINGS_FLOW_ADD_LIBRARY = "add-library";

export type SettingsRouteId =
  | "settings.add-library"
  | "settings.library-detail"
  | "webdav.sources"
  | "webdav.add"
  | "webdav.browser"
  | "onedrive.sources"
  | "onedrive.browser";

export const SETTINGS_DISMISS_TARGETS = {
  settingsRoot: "/settings" as RelativePathString,
  addLibrary: "/settings/add-library" as RelativePathString,
} as const;

export type SettingsHeaderContext = {
  routeId: SettingsRouteId;
  platform: PlatformOS;
  flow?: string;
  currentPath?: string;
};

/** Resolves the leading header affordance for a settings-domain route. */
export function resolveSettingsHeaderLead(ctx: SettingsHeaderContext): SettingsHeaderLead {
  const { routeId, platform, flow, currentPath = "/" } = ctx;
  const fromAddLibrary = flow === SETTINGS_FLOW_ADD_LIBRARY;

  if (routeId === "settings.add-library" || routeId === "settings.library-detail") {
    return platform === "ios" ? "layout-close" : "stack-back";
  }

  if (routeId === "webdav.sources" || routeId === "onedrive.sources") {
    return platform === "ios" ? "toolbar-close" : "stack-back";
  }

  if (routeId === "webdav.add") {
    return platform === "ios" && fromAddLibrary ? "toolbar-close" : "stack-back";
  }

  if (routeId === "webdav.browser" || routeId === "onedrive.browser") {
    return platform === "ios" && fromAddLibrary && currentPath === "/" ? "toolbar-close" : "stack-back";
  }

  return "stack-back";
}

/** Target route for iOS toolbar close actions that use dismissTo. */
export function resolveSettingsCloseDismissTarget(
  routeId: SettingsRouteId,
  flow?: string,
): RelativePathString {
  if (flow === SETTINGS_FLOW_ADD_LIBRARY) {
    if (routeId === "webdav.add" || routeId === "webdav.browser" || routeId === "onedrive.browser") {
      return SETTINGS_DISMISS_TARGETS.addLibrary;
    }
  }

  if (routeId === "webdav.sources" || routeId === "onedrive.sources") {
    return SETTINGS_DISMISS_TARGETS.settingsRoot;
  }

  return SETTINGS_DISMISS_TARGETS.settingsRoot;
}

/** Android stack back must be hidden when a custom toolbar occupies headerLeft. */
export function shouldHideStackBackForToolbarLeft(hasToolbarLeft: boolean): boolean {
  return hasToolbarLeft;
}
