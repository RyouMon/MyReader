import { WebDavUrlBuilder } from "./url-builder";

describe("WebDavUrlBuilder", () => {
  const source = {
    id: "ds-1",
    type: "webdav" as const,
    name: "Test",
    endpoint: "https://dav.example.com/remote.php/dav/files/user",
    username: "user",
    password: "pass",
    rootPath: "",
    createdAt: 0,
  };

  test("builds cover URL under data-source root and library root", () => {
    const builder = new WebDavUrlBuilder(source, "/Books/Calibre");
    expect(builder.urlFor("Author/Title (1)/cover.jpg")).toBe(
      "https://dav.example.com/remote.php/dav/files/user/Books/Calibre/Author/Title%20(1)/cover.jpg",
    );
  });

  test("builds metadata.db URL at library root", () => {
    const builder = new WebDavUrlBuilder(source, "Books/Calibre");
    expect(builder.urlFor("metadata.db")).toBe(
      "https://dav.example.com/remote.php/dav/files/user/Books/Calibre/metadata.db",
    );
  });
});
