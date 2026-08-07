const mockDirectoryEntries = new Map<string, { name: string }[]>()

function mockJoinPath(...parts: (string | { uri: string })[]): string {
  const [head = "", ...tail] = parts.map((part) =>
    typeof part === "string" ? part : part.uri,
  )
  return [
    head.replace(/\/+$/, ""),
    ...tail.map((part) => part.replace(/^\/+|\/+$/g, "")),
  ]
    .filter(Boolean)
    .join("/")
}

jest.mock("expo-file-system", () => {
  class MockDirectory {
    readonly uri: string
    exists = true

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = mockJoinPath(...parts)
    }

    get name(): string {
      return this.uri.split("/").at(-1) ?? ""
    }

    list(): { name: string }[] {
      return mockDirectoryEntries.get(this.uri) ?? []
    }

    create(): void {
      this.exists = true
      mockDirectoryEntries.set(this.uri, [])
    }

    createDirectory(name: string): MockDirectory {
      const directory = new MockDirectory(this, name)
      mockDirectoryEntries.set(this.uri, [
        ...(mockDirectoryEntries.get(this.uri) ?? []),
        directory,
      ])
      mockDirectoryEntries.set(directory.uri, [])
      return directory
    }

    delete = jest.fn()
  }

  class MockFile {
    readonly uri: string
    exists = true

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = mockJoinPath(...parts)
    }

    get name(): string {
      return this.uri.split("/").at(-1) ?? ""
    }

    copy = jest.fn(async () => undefined)
    delete = jest.fn()
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    __mockFileSystem: { MockDirectory, MockFile },
  }
})

// Jest factories above must be registered before importing the module under test.
// eslint-disable-next-line import/first
import { copyFileIntoTree, mergeDirectoryTree } from "./android-saf"

type MockDirectoryInstance = {
  name: string
  uri: string
}
type MockFileInstance = MockDirectoryInstance & {
  copy: jest.Mock
}
type MockConstructor<T> = new (...parts: (string | { uri: string })[]) => T

const { MockDirectory, MockFile } = jest.requireMock("expo-file-system")
  .__mockFileSystem as {
  MockDirectory: MockConstructor<MockDirectoryInstance>
  MockFile: MockConstructor<MockFileInstance>
}

describe("Android SAF writes", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDirectoryEntries.clear()
  })

  it("should copy a changed file through its SAF parent when the destination already exists", async () => {
    const source = new MockDirectory("file:///source")
    const destination = new MockDirectory("content://tree/library")
    const sourceFile = new MockFile(source, "library.json")
    const destinationFile = new MockFile(destination, "library.json")
    mockDirectoryEntries.set(source.uri, [sourceFile])
    mockDirectoryEntries.set(destination.uri, [destinationFile])

    await mergeDirectoryTree(source as never, destination as never)

    expect(sourceFile.copy).toHaveBeenCalledWith(destination, {
      overwrite: true,
    })
  })

  it("should publish a file through its SAF parent when the destination already exists", async () => {
    const sourceFile = new MockFile("file:///source/book.epub")
    const destination = new MockDirectory("content://tree/library")
    const destinationFile = new MockFile(destination, "book.epub")
    mockDirectoryEntries.set(destination.uri, [destinationFile])

    await copyFileIntoTree(sourceFile as never, destination.uri, "book.epub")

    expect(sourceFile.copy).toHaveBeenCalledWith(
      expect.objectContaining({ uri: destination.uri }),
      { overwrite: true },
    )
    expect(sourceFile.copy.mock.calls[0]?.[0]).toBeInstanceOf(MockDirectory)
  })
})
