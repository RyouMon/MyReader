import {
  managedBookDirectory,
  managedBookRelativePaths,
} from "./android-saf-paths"

describe("Android SAF managed book paths", () => {
  it("should derive the single-format body path from the shared catalog path", () => {
    expect(
      managedBookRelativePaths([
        {
          path: "Books/018f2f8d-980b-40ef-b72e-c6e86cb7cc28",
          formats: ["EPUB"],
        },
      ]),
    ).toEqual(["Books/018f2f8d-980b-40ef-b72e-c6e86cb7cc28/book.epub"])
  })

  it("should only allow exact UUID book directories to be deleted", () => {
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
