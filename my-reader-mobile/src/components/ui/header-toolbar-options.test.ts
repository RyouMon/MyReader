import { buildAndroidHeaderToolbarNavigationOptions } from "./header-toolbar-navigation-options.android";

describe("buildAndroidHeaderToolbarNavigationOptions", () => {
  const renderLeft = jest.fn();
  const renderRight = jest.fn();

  it("should not override stack back when only right actions are provided", () => {
    const options = buildAndroidHeaderToolbarNavigationOptions({
      hasLeft: false,
      hasRight: true,
      renderLeft,
      renderRight,
    });

    expect(options.headerBackVisible).toBeUndefined();
    expect(options.headerLeft).toBeUndefined();
    expect(typeof options.headerRight).toBe("function");
  });

  it("should hide stack back when custom left toolbar actions are provided", () => {
    const options = buildAndroidHeaderToolbarNavigationOptions({
      hasLeft: true,
      hasRight: false,
      renderLeft,
      renderRight,
    });

    expect(options.headerBackVisible).toBe(false);
    expect(typeof options.headerLeft).toBe("function");
    expect(options.headerRight).toBeUndefined();
  });

  it("should not enable stack back when custom left actions are present", () => {
    const options = buildAndroidHeaderToolbarNavigationOptions({
      hasLeft: true,
      hasRight: true,
      renderLeft,
      renderRight,
    });

    expect(options.headerBackVisible).toBe(false);
    expect(typeof options.headerLeft).toBe("function");
    expect(typeof options.headerRight).toBe("function");
  });
});
