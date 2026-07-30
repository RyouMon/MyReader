const mockOpen = jest.fn()
const mockDrizzle = jest.fn()
const mockMigrateLibraryDatabase = jest.fn()

jest.mock("expo-file-system", () => ({
  Directory: jest.fn(() => ({
    exists: true,
    uri: "file:///library/.myreader",
  })),
}))
jest.mock("@op-engineering/op-sqlite", () => ({ open: mockOpen }))
jest.mock("drizzle-orm/op-sqlite", () => ({ drizzle: mockDrizzle }))
jest.mock("@/modules/myreader-rust-components", () => ({
  __esModule: true,
  default: {
    migrateLibraryDatabase: mockMigrateLibraryDatabase,
  },
}))
jest.mock("@my-reader/db/schema", () => ({}))
jest.mock("../fs/library-paths", () => ({
  LIBRARY_MYREADER_DIR: ".myreader",
  librarySidecarRootUri: () => "file:///library",
}))
jest.mock("../fs/path", () => ({
  fileUriFor: () => "file:///library/.myreader/myreader.db",
  toNativeFilesystemPath: () => "/library/.myreader/myreader.db",
}))

describe("getLibraryDatabase", () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it("should retry database initialization when core migration previously fails", async () => {
    const raw = { closeAsync: jest.fn() }
    mockOpen.mockReturnValue(raw)
    mockDrizzle.mockReturnValue({})
    mockMigrateLibraryDatabase
      .mockRejectedValueOnce(new Error("migration failed"))
      .mockResolvedValueOnce(undefined)

    const { getLibraryDatabase } = require("./library-db")

    await expect(getLibraryDatabase({ id: "library" })).rejects.toThrow(
      "migration failed",
    )
    await expect(getLibraryDatabase({ id: "library" })).resolves.toMatchObject({
      raw,
    })
    expect(mockMigrateLibraryDatabase).toHaveBeenCalledTimes(2)
    expect(mockOpen).toHaveBeenCalledTimes(1)
  })

  it("should migrate with core before opening the query connection", async () => {
    const raw = { closeAsync: jest.fn() }
    mockMigrateLibraryDatabase.mockResolvedValue(undefined)
    mockOpen.mockReturnValue(raw)
    mockDrizzle.mockReturnValue({})

    const { getLibraryDatabase } = require("./library-db")

    await getLibraryDatabase({ id: "library" })

    expect(mockMigrateLibraryDatabase).toHaveBeenCalledWith(
      "/library/.myreader/myreader.db",
    )
    expect(mockMigrateLibraryDatabase.mock.invocationCallOrder[0]).toBeLessThan(
      mockOpen.mock.invocationCallOrder[0],
    )
  })

  it("should close the database when query initialization fails", async () => {
    const raw = { closeAsync: jest.fn() }
    mockMigrateLibraryDatabase.mockResolvedValue(undefined)
    mockOpen.mockReturnValue(raw)
    mockDrizzle.mockImplementation(() => {
      throw new Error("query initialization failed")
    })

    const { getLibraryDatabase } = require("./library-db")

    await expect(getLibraryDatabase({ id: "library" })).rejects.toThrow(
      "query initialization failed",
    )
    expect(raw.closeAsync).toHaveBeenCalled()
  })
})
