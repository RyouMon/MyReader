import { composeSettingsScreenHeader } from "./compose-screen-header";
import { SETTINGS_FLOW_ADD_LIBRARY } from "./policies/settings-routes";

describe("composeSettingsScreenHeader", () => {
  it("should hide Android stack back when toolbar close is the lead action", () => {
    const composed = composeSettingsScreenHeader({
      routeId: "webdav.sources",
      platform: "ios",
    });

    expect(composed.lead).toBe("toolbar-close");
    expect(composed.closeDismissTarget).toBe("/settings");
    expect(composed.androidStackOptionsWhenToolbarLeft).toEqual({ headerBackVisible: false });
  });

  it("should not hide Android stack back when lead is stack-back on Android", () => {
    const composed = composeSettingsScreenHeader({
      routeId: "webdav.sources",
      platform: "android",
    });

    expect(composed.lead).toBe("stack-back");
    expect(composed.androidStackOptionsWhenToolbarLeft).toEqual({});
  });

  it("should dismiss to add-library when closing webdav.add from add-library flow on iOS", () => {
    const composed = composeSettingsScreenHeader({
      routeId: "webdav.add",
      platform: "ios",
      flow: SETTINGS_FLOW_ADD_LIBRARY,
    });

    expect(composed.lead).toBe("toolbar-close");
    expect(composed.closeDismissTarget).toBe("/settings/add-library");
  });
});
