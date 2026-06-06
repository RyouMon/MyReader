import {
  SETTINGS_FLOW_ADD_LIBRARY,
  resolveSettingsCloseDismissTarget,
  resolveSettingsHeaderLead,
  shouldHideStackBackForToolbarLeft,
} from "./settings-routes";

describe("settings header lead policy", () => {
  describe("resolveSettingsHeaderLead", () => {
    describe("webdav.browser", () => {
      it.each([
        ["toolbar-close", "ios", SETTINGS_FLOW_ADD_LIBRARY, "/"],
        ["stack-back", "ios", SETTINGS_FLOW_ADD_LIBRARY, "/Books"],
        ["stack-back", "ios", undefined, "/"],
        ["stack-back", "android", SETTINGS_FLOW_ADD_LIBRARY, "/"],
        ["stack-back", "android", SETTINGS_FLOW_ADD_LIBRARY, "/nested"],
      ] as const)(
        "should return %s when platform is %s, flow is %s, and path is %s",
        (expected, platform, flow, currentPath) => {
          expect(
            resolveSettingsHeaderLead({
              routeId: "webdav.browser",
              platform,
              flow,
              currentPath,
            }),
          ).toBe(expected);
        },
      );
    });

    describe("webdav.add", () => {
      it.each([
        ["toolbar-close", "ios", SETTINGS_FLOW_ADD_LIBRARY],
        ["stack-back", "ios", undefined],
        ["stack-back", "android", SETTINGS_FLOW_ADD_LIBRARY],
        ["stack-back", "android", undefined],
      ] as const)(
        "should return %s when platform is %s and flow is %s",
        (expected, platform, flow) => {
          expect(
            resolveSettingsHeaderLead({
              routeId: "webdav.add",
              platform,
              flow,
            }),
          ).toBe(expected);
        },
      );
    });

    describe("webdav.sources", () => {
      it.each([
        ["toolbar-close", "ios"],
        ["stack-back", "android"],
      ] as const)("should return %s when platform is %s", (expected, platform) => {
        expect(
          resolveSettingsHeaderLead({
            routeId: "webdav.sources",
            platform,
          }),
        ).toBe(expected);
      });
    });

    describe("settings modals", () => {
      it.each([
        ["layout-close", "ios", "settings.add-library"],
        ["stack-back", "android", "settings.add-library"],
        ["layout-close", "ios", "settings.library-detail"],
        ["stack-back", "android", "settings.library-detail"],
      ] as const)("should return %s when platform is %s on %s", (expected, platform, routeId) => {
        expect(
          resolveSettingsHeaderLead({
            routeId,
            platform,
          }),
        ).toBe(expected);
      });
    });
  });

  describe("resolveSettingsCloseDismissTarget", () => {
    it("should return /settings/add-library when closing webdav.browser from add-library flow", () => {
      expect(resolveSettingsCloseDismissTarget("webdav.browser", SETTINGS_FLOW_ADD_LIBRARY)).toBe(
        "/settings/add-library",
      );
    });

    it("should return /settings when closing remote sources list", () => {
      expect(resolveSettingsCloseDismissTarget("webdav.sources")).toBe("/settings");
      expect(resolveSettingsCloseDismissTarget("onedrive.sources")).toBe("/settings");
    });
  });

  describe("shouldHideStackBackForToolbarLeft", () => {
    it("should return true when custom toolbar left action is shown", () => {
      expect(shouldHideStackBackForToolbarLeft(true)).toBe(true);
    });

    it("should return false when custom toolbar left action is not shown", () => {
      expect(shouldHideStackBackForToolbarLeft(false)).toBe(false);
    });
  });
});
