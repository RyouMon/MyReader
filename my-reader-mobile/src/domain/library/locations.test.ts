import type { Library } from "../types";

jest.mock("@/src/services/fs/path", () => ({
  ensureDocumentSubdirUri: (...segments: string[]) => `file:///documents/${segments.join("/")}`,
  fileUriFor: (base: string, rel: string) => `${base.replace(/\/$/, "")}/${rel}`,
  joinRelativePath: (left: string, right: string) => `${left}/${right}`,
  canonicalRelativePath: (path: string) => path,
}));

jest.mock("expo-file-system", () => ({
  File: class MockFile {
    exists = true;
    size = 100;
    uri: string;
    constructor(mockUri: string) {
      this.uri = mockUri;
    }
  },
}));

const platformOs = { current: "ios" as "ios" | "android" };
jest.mock("react-native", () => ({
  Platform: { get OS() { return platformOs.current; } },
}));

import type { RemoteBackend } from "@/src/services/remote/backend";

import {
  libraryBookFileUri,
  libraryContainerRootUri,
  libraryLocalRootUri,
  libraryMetadataUri,
  libraryMyReaderDirUri,
  libraryRootUri,
  librarySidecarRootUri,
  resolveCoverUri,
  usesIosContainerSidecar,
} from "./locations";

function localLibrary(overrides: Partial<Library> = {}): Library {
  return {
    id: "lib-1",
    name: "Local",
    path: "file:///external/Calibre",
    metadataUri: "",
    bookCount: 0,
    addedAt: 0,
    sourceType: "local",
    ...overrides,
  };
}

describe("library path helpers", () => {
  beforeEach(() => {
    platformOs.current = "ios";
  });

  test("remote library root and sidecar share app container", () => {
    const library = localLibrary({ sourceType: "webdav", path: "/remote/lib" });
    expect(libraryRootUri(library)).toBe("file:///documents/libraries/lib-1");
    expect(librarySidecarRootUri(library)).toBe("file:///documents/libraries/lib-1");
    expect(libraryMetadataUri(library)).toBe("file:///documents/libraries/lib-1/metadata.db");
    expect(libraryMyReaderDirUri(library)).toBe("file:///documents/libraries/lib-1/.myreader");
  });

  test("iOS local external reads from local root, sidecar in container", () => {
    const library = localLibrary({
      securityScopedBookmark: {
        bookmarkBase64: "bookmark-data",
        resolvedUri: "file:///external/Calibre",
        stale: false,
      },
    });

    expect(usesIosContainerSidecar(library)).toBe(true);
    expect(libraryLocalRootUri(library)).toBe("file:///external/Calibre");
    expect(libraryRootUri(library)).toBe("file:///external/Calibre");
    expect(librarySidecarRootUri(library)).toBe("file:///documents/libraries/lib-1");
    expect(libraryMetadataUri(library)).toBe("file:///external/Calibre/metadata.db");
    expect(libraryMyReaderDirUri(library)).toBe("file:///documents/libraries/lib-1/.myreader");
    expect(libraryBookFileUri(library, "Author/Title (1)/book.epub")).toBe(
      "file:///external/Calibre/Author/Title (1)/book.epub",
    );
  });

  test("non-iOS local library uses same local root for tree and sidecar", () => {
    platformOs.current = "android";
    const library = localLibrary({
      path: "file:///sdcard/Calibre",
      securityScopedBookmark: {
        bookmarkBase64: "unused",
        resolvedUri: "file:///sdcard/Calibre",
        stale: false,
      },
    });

    expect(usesIosContainerSidecar(library)).toBe(false);
    expect(libraryLocalRootUri(library)).toBe("file:///sdcard/Calibre");
    expect(libraryRootUri(library)).toBe("file:///sdcard/Calibre");
    expect(librarySidecarRootUri(library)).toBe("file:///sdcard/Calibre");
    expect(libraryMetadataUri(library)).toBe("file:///sdcard/Calibre/metadata.db");
    expect(libraryMyReaderDirUri(library)).toBe("file:///sdcard/Calibre/.myreader");
  });

  test("libraryContainerRootUri creates predictable document path", () => {
    expect(libraryContainerRootUri("abc")).toBe("file:///documents/libraries/abc");
  });
});

describe("resolveCoverUri", () => {
  test("remote library uses backend URL even when container cover.jpg exists", () => {
    const library = localLibrary({ sourceType: "webdav", path: "https://example.com/lib" });
    const backend = {
      contentUrl: (relative: string) => `https://example.com/lib/${relative}`,
      getCachedAuthHeaders: () => ({ Authorization: "Bearer token" }),
    } as Pick<RemoteBackend, "contentUrl" | "getCachedAuthHeaders"> as RemoteBackend;

    expect(resolveCoverUri(library, "Author/Book", true, backend)).toEqual({
      uri: "https://example.com/lib/Author/Book/cover.jpg",
      headers: { Authorization: "Bearer token" },
    });
  });

  test("local library prefers on-disk cover.jpg", () => {
    const library = localLibrary({ path: "file:///external/Calibre" });
    expect(resolveCoverUri(library, "Author/Book", true)).toBe(
      "file:///external/Calibre/Author/Book/cover.jpg",
    );
  });
});
