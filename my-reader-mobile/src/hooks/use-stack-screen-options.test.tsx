import { Platform } from "react-native";

import { useStackScreenOptions } from "./use-stack-screen-options";

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({
    text: "#111111",
  }),
}));

jest.mock("@/src/components/ui/header-back-button", () => ({
  HeaderBackButton: () => null,
}));

describe("useStackScreenOptions", () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: originalPlatform });
  });

  it("uses native stack back on iOS", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });

    const options = useStackScreenOptions();

    expect(options.headerBackVisible).toBe(true);
    expect(options.headerLeft).toBeUndefined();
  });

  it("uses a single custom back button on Android", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });

    const options = useStackScreenOptions();

    expect(options.headerBackVisible).toBe(false);
    expect(options.headerLeft).toEqual(expect.any(Function));
  });
});
