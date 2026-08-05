type MockEntry = {
  kind: "directory" | "file"
  name: string
  uri?: string
}

const mockDirectoryEntries = new Map<string, MockEntry[]>()

jest.mock("expo-file-system", () => {
  class MockDirectory {
    readonly uri: string

    constructor(input: string | MockDirectory) {
      this.uri = typeof input === "string" ? input : input.uri
    }

    get name() {
      return this.uri.split("/").at(-1) ?? ""
    }

    list() {
      return (mockDirectoryEntries.get(this.uri) ?? []).map((entry) =>
        entry.kind === "directory"
          ? new MockDirectory(entry.uri ?? `${this.uri}/${entry.name}`)
          : { name: entry.name },
      )
    }

    createDirectory(name: string) {
      const entries = mockDirectoryEntries.get(this.uri) ?? []
      if (entries.some((entry) => entry.name === name)) {
        throw new Error("already exists")
      }
      const uri = `${this.uri}/${name}`
      mockDirectoryEntries.set(this.uri, [
        ...entries,
        { kind: "directory", name, uri },
      ])
      mockDirectoryEntries.set(uri, [])
      return new MockDirectory(uri)
    }
  }

  return { Directory: MockDirectory }
})

// Jest factories above must be registered before importing the module under test.
// eslint-disable-next-line import/first
import { createExclusiveLibraryDirectory } from "./library-directory"

describe("createExclusiveLibraryDirectory", () => {
  beforeEach(() => {
    mockDirectoryEntries.clear()
  })

  it("should create a directory named after the library under the selected parent", () => {
    mockDirectoryEntries.set("file:///Books", [
      { kind: "file", name: "Keep.txt" },
    ])

    const created = createExclusiveLibraryDirectory(
      "file:///Books",
      "My Library",
    )

    expect(created.uri).toBe("file:///Books/My Library")
  })

  it("should reject an existing entry with the same name", () => {
    mockDirectoryEntries.set("file:///Books", [
      { kind: "file", name: "My Library" },
    ])

    expect(() =>
      createExclusiveLibraryDirectory("file:///Books", "My Library"),
    ).toThrow("LIBRARY_FOLDER_ALREADY_EXISTS")
  })
})
