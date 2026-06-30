import { WebDavUrlBuilder } from "./url-builder"

describe("WebDavUrlBuilder", () => {
  const source = {
    id: "ds-1",
    type: "webdav" as const,
    name: "Test",
    endpoint: "https://dav.example.com/remote.php/dav/files/user",
    username: "user",
    password: "pass",
    rootPath: "",
    enabled: true,
    hasPassword: true,
    createdAt: 0,
  }

  test("should build cover URL when data-source and library roots exist", () => {
    const builder = new WebDavUrlBuilder(source, "/Books/Calibre")
    expect(builder.urlFor("Author/Title (1)/cover.jpg")).toBe(
      "https://dav.example.com/remote.php/dav/files/user/Books/Calibre/Author/Title%20(1)/cover.jpg",
    )
  })

  test("should build metadata URL when library root is set", () => {
    const builder = new WebDavUrlBuilder(source, "Books/Calibre")
    expect(builder.urlFor("metadata.db")).toBe(
      "https://dav.example.com/remote.php/dav/files/user/Books/Calibre/metadata.db",
    )
  })

  test("should use only data-source root when library root is omitted", () => {
    const builder = new WebDavUrlBuilder({
      ...source,
      rootPath: "/Remote Root",
    })

    expect(builder.urlFor("metadata.db")).toBe(
      "https://dav.example.com/remote.php/dav/files/user/Remote%20Root/metadata.db",
    )
  })

  test("should trim endpoint slashes when relative path is empty", () => {
    const builder = new WebDavUrlBuilder(
      {
        ...source,
        endpoint: "https://dav.example.com/remote.php/dav/files/user///",
        password: "",
        rootPath: undefined,
        username: " ",
      },
      "",
    )

    expect(builder.urlFor("")).toBe(
      "https://dav.example.com/remote.php/dav/files/user",
    )
    expect(builder.authHeaders).toEqual({})
  })
})
