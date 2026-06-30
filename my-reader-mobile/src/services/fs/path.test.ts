jest.mock("expo-file-system", () => {
  class MockDirectory {
    static nextExists = true
    exists = MockDirectory.nextExists
    uri: string
    create = jest.fn()

    constructor(base: string, ...segments: string[]) {
      this.uri = [base, ...segments].join("/")
      lastDirectory = this
    }
  }

  let lastDirectory: MockDirectory | undefined

  return {
    Directory: MockDirectory,
    Paths: { document: "file:///documents" },
    __mockFileSystem: {
      Directory: MockDirectory,
      getLastDirectory: () => lastDirectory,
    },
  }
})

import { AppInvariantError } from "@/src/errors"

import {
  assertSafeRelativePath,
  canonicalRelativePath,
  canonicalRelativePathSegments,
  encodeUrlPathFromChunks,
  ensureDocumentSubdirUri,
  fileUriFor,
  fileUriToNativeDirAndName,
  joinRelativePath,
  parentDirectoryUriForFileUri,
  toNativeFilesystemPath,
} from "./path"

const { __mockFileSystem } = jest.requireMock("expo-file-system")

describe("path helpers", () => {
  beforeEach(() => {
    __mockFileSystem.Directory.nextExists = true
  })

  it("should accept safe relative paths when path is non-empty and local", () => {
    expect(() => assertSafeRelativePath("Author/Book/book.epub")).not.toThrow()
  })

  it("should reject unsafe relative paths when path is empty absolute or traversing", () => {
    expect(() => assertSafeRelativePath("")).toThrow(AppInvariantError)
    expect(() => assertSafeRelativePath("/Author/Book")).toThrow(
      AppInvariantError,
    )
    expect(() => assertSafeRelativePath("Author/../Book")).toThrow(
      AppInvariantError,
    )
  })

  it("should normalize and decode segments when canonicalizing paths", () => {
    expect(canonicalRelativePath(" /Author%2520Name\\\\Book%20One/ ")).toBe(
      "Author Name/Book One",
    )
    expect(canonicalRelativePathSegments("Author//%E0%A4%A/Book")).toEqual([
      "Author",
      "%E0%A4%A",
      "Book",
    ])
  })

  it("should return segment only when joining without a book path", () => {
    expect(joinRelativePath(null, "/cover.jpg")).toBe("cover.jpg")
    expect(joinRelativePath("", "/cover.jpg")).toBe("cover.jpg")
  })

  it("should return segment only when book path normalizes to empty", () => {
    expect(joinRelativePath("///", "/cover.jpg")).toBe("cover.jpg")
  })

  it("should join normalized paths when book path is present", () => {
    expect(joinRelativePath("Author\\Book///", "/book.epub")).toBe(
      "Author/Book/book.epub",
    )
  })

  it("should build encoded file uri when resolving under a base directory", () => {
    expect(
      fileUriFor("file:///root/Calibre/", "Author%2520Name/Book One"),
    ).toBe("file:///root/Calibre/Author%20Name/Book%20One")
  })

  it("should encode url chunks when chunks contain slashes and encoded text", () => {
    expect(
      encodeUrlPathFromChunks(
        " /remote/root/ ",
        "",
        "Author%2520Name/Book One",
      ),
    ).toBe("remote/root/Author%20Name/Book%20One")
  })

  it("should decode native path when value is a file uri or bare path", () => {
    expect(toNativeFilesystemPath("file:///tmp/Author%20Name/book.epub")).toBe(
      "/tmp/Author Name/book.epub",
    )
    expect(toNativeFilesystemPath("/tmp/Author%2520Name/book.epub")).toBe(
      "/tmp/Author Name/book.epub",
    )
  })

  it("should fallback to stripped file path when file uri cannot be parsed", () => {
    expect(toNativeFilesystemPath("file://%")).toBe("/%")
  })

  it("should return parent uri when native path has a parent directory", () => {
    expect(parentDirectoryUriForFileUri("file:///tmp/Author/book.epub")).toBe(
      "file:///tmp/Author",
    )
  })

  it("should return encoded parent uri when value is a bare path", () => {
    expect(parentDirectoryUriForFileUri("tmp/Author Name/book.epub")).toBe(
      "file:///tmp/Author%20Name",
    )
  })

  it("should return null when native path has no parent directory", () => {
    expect(parentDirectoryUriForFileUri("file:///book.epub")).toBeNull()
  })

  it("should split file uri when directory and name can be parsed", () => {
    expect(fileUriToNativeDirAndName("file:///tmp/Author/book.epub")).toEqual({
      dir: "/tmp/Author",
      name: "book.epub",
    })
  })

  it("should throw when file uri has no directory", () => {
    expect(() => fileUriToNativeDirAndName("file:///book.epub")).toThrow(
      "Cannot parse file path",
    )
  })

  it("should return document subdir uri when directory already exists", () => {
    expect(ensureDocumentSubdirUri("libraries", "one")).toBe(
      "file:///documents/libraries/one",
    )
    expect(__mockFileSystem.getLastDirectory().create).not.toHaveBeenCalled()
  })

  it("should create document subdir when directory does not exist", () => {
    __mockFileSystem.Directory.nextExists = false

    expect(ensureDocumentSubdirUri("libraries", "one")).toBe(
      "file:///documents/libraries/one",
    )
    expect(__mockFileSystem.getLastDirectory().create).toHaveBeenCalledWith({
      idempotent: true,
      intermediates: true,
    })
  })
})
