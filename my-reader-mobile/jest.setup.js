jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

jest.mock("@my-reader/readium", () => {
  const mockReact = require("react");
  const { View } = require("react-native");
  return {
    ReadiumView: mockReact.forwardRef(function ReadiumViewMock(_props, ref) {
      mockReact.useImperativeHandle(ref, () => ({
        goTo: jest.fn(),
        goForward: jest.fn(),
        goBackward: jest.fn(),
        destroy: jest.fn(),
      }));
      return mockReact.createElement(View, { testID: "readium-view-mock" });
    }),
  };
});
