import { parseWebDavPropfind } from "./propfind"

describe("parseWebDavPropfind", () => {
  it("should recognize directories when collection elements have attributes", () => {
    const source = {
      id: "webdav-1",
      type: "webdav" as const,
      name: "WebDAV",
      endpoint: "https://dav.example.com",
      username: "reader",
      password: "secret",
      rootPath: "/dav",
      enabled: true,
      hasPassword: true,
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <D:multistatus xmlns:D="DAV:">
        <D:response>
          <D:href>/dav/</D:href>
          <D:propstat>
            <D:prop>
              <D:resourcetype><D:collection xmlns:D="DAV:"/></D:resourcetype>
              <D:displayname>root</D:displayname>
            </D:prop>
          </D:propstat>
        </D:response>
        <D:response>
          <D:href>/dav/Shared/</D:href>
          <D:propstat>
            <D:prop>
              <D:resourcetype><D:collection xmlns:D="DAV:"/></D:resourcetype>
              <D:displayname>Shared</D:displayname>
            </D:prop>
          </D:propstat>
        </D:response>
      </D:multistatus>`

    expect(parseWebDavPropfind(source, xml)).toEqual([
      {
        href: "/Shared",
        path: "/Shared",
        name: "Shared",
        isDirectory: true,
      },
    ])
  })
})
