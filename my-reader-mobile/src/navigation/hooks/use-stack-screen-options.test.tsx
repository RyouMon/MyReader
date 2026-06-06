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

  it("should use native stack back when platform is iOS", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });

    const options = useStackScreenOptions();

    expect(options.headerBackVisible).toBe(true);
    expect(options.headerLeft).toBeUndefined();
  });

  it("should use a single custom back button when platform is Android", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });

    const options = useStackScreenOptions();

    expect(options.headerBackVisible).toBe(false);
    expect(options.headerLeft).toEqual(expect.any(Function));
  });
});
