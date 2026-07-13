import { buildBookDetailScreenOptions } from "./book-detail-screen-options"

describe("buildBookDetailScreenOptions", () => {
  it("should hide the title and keep the narrow detail header fully transparent", () => {
    expect(
      buildBookDetailScreenOptions({ title: "Book detail" }, "#ffffff", true),
    ).toMatchObject({
      title: "",
      headerShadowVisible: false,
      headerStyle: { backgroundColor: "transparent" },
      headerTintColor: "#ffffff",
      headerTitleStyle: { color: "#ffffff" },
      headerTransparent: true,
    })
  })

  it("should preserve the title in wide mode", () => {
    expect(
      buildBookDetailScreenOptions({ title: "Book detail" }, "#3b2f2f", false)
        .title,
    ).toBe("Book detail")
  })
})
