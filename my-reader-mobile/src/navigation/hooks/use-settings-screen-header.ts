import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

import type { HeaderToolbarAction } from "@/src/components/ui/header-toolbar";
import { modalCloseToolbarAction } from "@/src/components/ui/modal-close-toolbar-action";

import { composeScreenHeader } from "../compose-screen-header";
import type { SettingsRouteId } from "../policies/settings-routes";
import type { PlatformOS } from "../types";

type UseSettingsScreenHeaderLeftParams = {
  routeId: SettingsRouteId;
  flow?: string;
  currentPath?: string;
};

/** Builds optional iOS toolbar close actions from settings header policy. */
export function useSettingsScreenHeaderLeft({
  routeId,
  flow,
  currentPath,
}: UseSettingsScreenHeaderLeftParams): HeaderToolbarAction[] | undefined {
  const { t } = useTranslation();
  const platform: PlatformOS = Platform.OS === "ios" ? "ios" : "android";

  return useMemo((): HeaderToolbarAction[] | undefined => {
    const composed = composeScreenHeader({
      domain: "settings",
      ctx: {
        routeId,
        platform,
        flow,
        currentPath,
      },
    });

    if (composed.lead !== "toolbar-close" || !composed.closeDismissTarget) {
      return undefined;
    }

    return [
      modalCloseToolbarAction(t("common.close"), composed.closeDismissTarget, {
        dismissTo: true,
      }),
    ];
  }, [currentPath, flow, platform, routeId, t]);
}
