import { buildAndroidHeaderToolbarNavigationOptions } from "./header-toolbar-navigation-options.android";

describe("buildAndroidHeaderToolbarNavigationOptions", () => {
  const renderLeft = jest.fn();
  const renderRight = jest.fn();

  it("does not override stack back when only right actions are provided", () => {
    const options = buildAndroidHeaderToolbarNavigationOptions({
      hasLeft: false,
      hasRight: true,
      renderLeft,
      renderRight,
    });

    expect(options.headerBackVisible).toBeUndefined();
    expect(options.headerLeft).toBeUndefined();
    expect(options.headerRight).toBe(renderRight);
  });

  it("hides stack back when custom left toolbar actions are provided", () => {
    const options = buildAndroidHeaderToolbarNavigationOptions({
      hasLeft: true,
      hasRight: false,
      renderLeft,
      renderRight,
    });

    expect(options.headerBackVisible).toBe(false);
    expect(options.headerLeft).toBe(renderLeft);
    expect(options.headerRight).toBeUndefined();
  });

  it("never enables stack back together with custom left actions", () => {
    const options = buildAndroidHeaderToolbarNavigationOptions({
      hasLeft: true,
      hasRight: true,
      renderLeft,
      renderRight,
    });

    expect(options.headerBackVisible).toBe(false);
    expect(options.headerLeft).toBe(renderLeft);
    expect(options.headerRight).toBe(renderRight);
  });
});
