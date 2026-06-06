import type { RelativePathString } from "expo-router";

import {
  resolveSettingsCloseDismissTarget,
  resolveSettingsHeaderLead,
  type SettingsHeaderContext,
  type SettingsRouteId,
} from "./policies/settings-routes";
import type { HeaderLead, PlatformOS } from "./types";

export type ComposedScreenHeader = {
  lead: HeaderLead;
  closeDismissTarget?: RelativePathString;
};

export type ScreenHeaderInput = {
  domain: "settings";
  ctx: SettingsHeaderContext;
};

/** Composes header policy for a navigation domain into screen-ready decisions. */
export function composeScreenHeader(input: ScreenHeaderInput): ComposedScreenHeader {
  const lead = resolveSettingsHeaderLead(input.ctx);

  if (lead !== "toolbar-close") {
    return { lead };
  }

  return {
    lead,
    closeDismissTarget: resolveSettingsCloseDismissTarget(input.ctx.routeId, input.ctx.flow),
  };
}

export type { SettingsRouteId, SettingsHeaderContext, PlatformOS, HeaderLead };
