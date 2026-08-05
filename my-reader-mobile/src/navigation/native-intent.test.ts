import { redirectSystemPath } from "./native-intent"

describe("redirectSystemPath", () => {
  it("should route Expo share intents to the incoming share screen", () => {
    expect(
      redirectSystemPath({
        path: "myreadermobile://expo-sharing",
        initial: true,
      }),
    ).toBe("/handle-share")
  })

  it("should preserve unrelated app links", () => {
    expect(
      redirectSystemPath({
        path: "myreadermobile://library-book/42",
        initial: true,
      }),
    ).toBe("myreadermobile://library-book/42")
  })
})
