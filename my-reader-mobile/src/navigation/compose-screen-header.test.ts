import { composeScreenHeader } from "./compose-screen-header";
import { SETTINGS_FLOW_ADD_LIBRARY } from "./policies/settings-routes";

describe("composeScreenHeader", () => {
  describe("settings domain", () => {
    it("should return toolbar-close with dismiss target when on webdav sources on iOS", () => {
      const composed = composeScreenHeader({
        domain: "settings",
        ctx: { routeId: "webdav.sources", platform: "ios" },
      });

      expect(composed.lead).toBe("toolbar-close");
      expect(composed.closeDismissTarget).toBe("/settings");
    });

    it("should return stack-back without dismiss target on Android", () => {
      const composed = composeScreenHeader({
        domain: "settings",
        ctx: { routeId: "webdav.sources", platform: "android" },
      });

      expect(composed.lead).toBe("stack-back");
      expect(composed.closeDismissTarget).toBeUndefined();
    });

    it("should dismiss to add-library when closing webdav.add from add-library flow on iOS", () => {
      const composed = composeScreenHeader({
        domain: "settings",
        ctx: {
          routeId: "webdav.add",
          platform: "ios",
          flow: SETTINGS_FLOW_ADD_LIBRARY,
        },
      });

      expect(composed.lead).toBe("toolbar-close");
      expect(composed.closeDismissTarget).toBe("/settings/add-library");
    });
  });
});
