it("loads the Android module only when authorization is requested", () => {
  const ExpoModulesCore = require("expo-modules-core")
  const mockRequireNativeModule = jest.spyOn(
    ExpoModulesCore,
    "requireNativeModule",
  )
  const { googleAuthorization } = require("./index")
  expect(mockRequireNativeModule).not.toHaveBeenCalled()
  const native = { authorize: jest.fn(), clearToken: jest.fn() }
  mockRequireNativeModule.mockReturnValue(native)
  expect(googleAuthorization()).toBe(native)
  expect(mockRequireNativeModule).toHaveBeenCalledWith(
    "MyReaderGoogleAuthorization",
  )
  mockRequireNativeModule.mockRestore()
})
