export type PlatformOS = "ios" | "android";

/** How the leading header affordance should behave on a settings modal screen. */
export type HeaderLeadRole = "toolbar-close" | "stack-back-only";

export const ADD_LIBRARY_FLOW = "add-library";

export type RemoteDirectoryBrowserHeaderContext = {
  platform: PlatformOS;
  from?: string;
  currentPath: string;
};

/** Resolves the leading header control for WebDAV / OneDrive directory browsers. */
export function resolveRemoteDirectoryBrowserHeaderLead(
  ctx: RemoteDirectoryBrowserHeaderContext,
): HeaderLeadRole {
  if (ctx.platform === "ios" && ctx.from === ADD_LIBRARY_FLOW && ctx.currentPath === "/") {
    return "toolbar-close";
  }

  return "stack-back-only";
}

export type AddWebDavHeaderContext = {
  platform: PlatformOS;
  from?: string;
};

/** Resolves the leading header control for the add WebDAV data source form. */
export function resolveAddWebDavHeaderLead(ctx: AddWebDavHeaderContext): HeaderLeadRole {
  if (ctx.platform === "ios" && ctx.from === ADD_LIBRARY_FLOW) {
    return "toolbar-close";
  }

  return "stack-back-only";
}

export type RemoteSourcesListHeaderContext = {
  platform: PlatformOS;
};

/** Resolves the leading header control for WebDAV / OneDrive source list index screens. */
export function resolveRemoteSourcesListHeaderLead(ctx: RemoteSourcesListHeaderContext): HeaderLeadRole {
  if (ctx.platform === "ios") {
    return "toolbar-close";
  }

  return "stack-back-only";
}

/** True when a custom toolbar close/back must not compete with the native stack back button. */
export function shouldHideStackBackForToolbarLeft(hasToolbarLeft: boolean): boolean {
  return hasToolbarLeft;
}
