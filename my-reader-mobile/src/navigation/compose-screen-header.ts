import type { NativeStackNavigationOptions } from "expo-router";

import {
  resolveSettingsCloseDismissTarget,
  resolveSettingsHeaderLead,
  type SettingsHeaderContext,
  type SettingsRouteId,
} from "./policies/settings-routes";
import type { PlatformOS, SettingsHeaderLead } from "./types";

export type ComposedSettingsScreenHeader = {
  lead: SettingsHeaderLead;
  closeDismissTarget: ReturnType<typeof resolveSettingsCloseDismissTarget>;
  androidStackOptionsWhenToolbarLeft: Pick<NativeStackNavigationOptions, "headerBackVisible">;
};

/** Composes header lead policy and Android stack invariants for a settings screen. */
export function composeSettingsScreenHeader(ctx: SettingsHeaderContext): ComposedSettingsScreenHeader {
  const lead = resolveSettingsHeaderLead(ctx);
  const hasToolbarLeft = lead === "toolbar-close";

  return {
    lead,
    closeDismissTarget: resolveSettingsCloseDismissTarget(ctx.routeId, ctx.flow),
    androidStackOptionsWhenToolbarLeft: hasToolbarLeft ? { headerBackVisible: false } : {},
  };
}

export type { SettingsRouteId, SettingsHeaderContext, PlatformOS, SettingsHeaderLead };
