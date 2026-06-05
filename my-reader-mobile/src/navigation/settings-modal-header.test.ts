import {
  ADD_LIBRARY_FLOW,
  resolveAddWebDavHeaderLead,
  resolveRemoteDirectoryBrowserHeaderLead,
  resolveRemoteSourcesListHeaderLead,
  shouldHideStackBackForToolbarLeft,
} from "./settings-modal-header";

describe("settings modal header lead policy", () => {
  describe("resolveRemoteDirectoryBrowserHeaderLead", () => {
    it.each([
      ["ios", ADD_LIBRARY_FLOW, "/", "toolbar-close"],
      ["ios", ADD_LIBRARY_FLOW, "/Books", "stack-back-only"],
      ["ios", undefined, "/", "stack-back-only"],
      ["android", ADD_LIBRARY_FLOW, "/", "stack-back-only"],
      ["android", ADD_LIBRARY_FLOW, "/nested", "stack-back-only"],
    ] as const)("platform=%s from=%s path=%s -> %s", (platform, from, currentPath, expected) => {
      expect(
        resolveRemoteDirectoryBrowserHeaderLead({
          platform,
          from,
          currentPath,
        }),
      ).toBe(expected);
    });
  });

  describe("resolveAddWebDavHeaderLead", () => {
    it.each([
      ["ios", ADD_LIBRARY_FLOW, "toolbar-close"],
      ["ios", undefined, "stack-back-only"],
      ["android", ADD_LIBRARY_FLOW, "stack-back-only"],
      ["android", undefined, "stack-back-only"],
    ] as const)("platform=%s from=%s -> %s", (platform, from, expected) => {
      expect(resolveAddWebDavHeaderLead({ platform, from })).toBe(expected);
    });
  });

  describe("resolveRemoteSourcesListHeaderLead", () => {
    it.each([
      ["ios", "toolbar-close"],
      ["android", "stack-back-only"],
    ] as const)("platform=%s -> %s", (platform, expected) => {
      expect(resolveRemoteSourcesListHeaderLead({ platform })).toBe(expected);
    });
  });

  describe("shouldHideStackBackForToolbarLeft", () => {
    it("hides native stack back when a custom toolbar left action is shown", () => {
      expect(shouldHideStackBackForToolbarLeft(true)).toBe(true);
      expect(shouldHideStackBackForToolbarLeft(false)).toBe(false);
    });
  });
});
