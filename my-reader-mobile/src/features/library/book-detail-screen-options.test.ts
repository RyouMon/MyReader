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

  it("should preserve base typography when adapting the header contrast", () => {
    const typography = { fontFamily: "system", fontWeight: "500" as const }
    const options = buildBookDetailScreenOptions(
      { headerTitleStyle: [typography, { color: "#111111" }] },
      "#ffffff",
      false,
    )

    expect(options.headerTitleStyle).toEqual({
      ...typography,
      color: "#ffffff",
    })
  })
})
