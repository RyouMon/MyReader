import { WebDavRemoteBackend } from "../../remote/webdav/backend";

describe("WebDAV upload request contract", () => {
  test("builds a native PUT upload request with auth and content type", async () => {
    const source = {
      id: "source-1",
      type: "webdav",
      name: "WebDAV",
      endpoint: "https://dav.example/root",
      username: "user",
      password: "pass",
      rootPath: "Books",
      enabled: true,
      hasPassword: true,
    };
    const backend = new WebDavRemoteBackend(source, "Library Root");

    const request = await backend.getUploadRequest("file:///local/作者/书.epub", "作者/书.epub");

    expect(request).toMatchObject({
      localFileUri: "file:///local/作者/书.epub",
      remotePath: "作者/书.epub",
      headers: {
        Authorization: "Basic dXNlcjpwYXNz",
        "Content-Type": "application/octet-stream",
      },
    });
  });
});