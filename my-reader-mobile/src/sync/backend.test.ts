import { buildBackend } from "./backend";

describe("WebDAV upload request contract", () => {
  test("builds a native PUT upload request with auth and content type", () => {
    const backend = buildBackend({
      kind: "webdav",
      libraryPath: "Library Root",
      source: {
        id: "source-1",
        type: "webdav",
        name: "WebDAV",
        endpoint: "https://dav.example/root",
        username: "user",
        password: "pass",
        rootPath: "Books",
        enabled: true,
        hasPassword: true,
      },
    });

    expect(backend.getUploadRequest("作者/书.epub")).toMatchObject({
      url: "https://dav.example/root/Books/Library%20Root/%E4%BD%9C%E8%80%85/%E4%B9%A6.epub",
      method: "PUT",
      headers: {
        Authorization: "Basic dXNlcjpwYXNz",
        "Content-Type": "application/octet-stream",
      },
    });
  });
});
