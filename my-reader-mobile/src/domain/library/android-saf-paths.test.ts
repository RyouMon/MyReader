import {
  managedBookCoverRelativePaths,
  managedBookDirectory,
  managedBookRelativePaths,
} from "./android-saf-paths"

describe("Android SAF managed book paths", () => {
  it("should use catalog format paths for managed book files", () => {
    expect(
      managedBookRelativePaths([
        {
          formatPaths: [
            "Books/A Wizard of Earthsea (018f2f)/A Wizard of Earthsea.epub",
          ],
        },
      ]),
    ).toEqual(["Books/A Wizard of Earthsea (018f2f)/A Wizard of Earthsea.epub"])
  })

  it("should include covers only when the catalog declares one", () => {
    expect(
      managedBookCoverRelativePaths([
        {
          path: "Books/A Wizard of Earthsea (018f2f)",
          hasCover: true,
        },
        { path: "Books/No Cover (123456)", hasCover: false },
      ]),
    ).toEqual(["Books/A Wizard of Earthsea (018f2f)/cover.jpg"])
  })

  it("should only allow managed readable or legacy book directories to be deleted", () => {
    expect(
      managedBookDirectory(
        "Books/A Wizard of Earthsea (018f2f)/A Wizard of Earthsea.epub",
      ),
    ).toBe("Books/A Wizard of Earthsea (018f2f)")
    expect(
      managedBookDirectory(
        "Books/018f2f8d-980b-40ef-b72e-c6e86cb7cc28/book.pdf",
      ),
    ).toBe("Books/018f2f8d-980b-40ef-b72e-c6e86cb7cc28")
    expect(managedBookDirectory("Books/user-files/book.pdf")).toBeNull()
    expect(
      managedBookDirectory(
        "Books/018f2f8d-980b-40ef-b72e-c6e86cb7cc28/nested/book.pdf",
      ),
    ).toBeNull()
  })
})
