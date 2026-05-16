import { localCachedFileUri, toNativeFilesystemPath } from "./io";

describe("io path helpers", () => {
  test("builds local cache file URIs without double encoding", () => {
    const uri = localCachedFileUri(
      "file:///tmp/book-downloads/library",
      "Wei Zhi/Book With Space.cbz",
    );

    expect(uri).toBe("file:///tmp/book-downloads/library/Wei%20Zhi/Book%20With%20Space.cbz");
    expect(uri).not.toContain("%2520");
  });

  test("canonicalizes polluted local file URIs before native handoff", () => {
    expect(toNativeFilesystemPath("file:///tmp/Wei%2520Zhi/Book%2520With%2520Space.cbz")).toBe(
      "/tmp/Wei Zhi/Book With Space.cbz",
    );
  });
});
