const mockOpen = jest.fn()
const mockDrizzle = jest.fn()
const mockMigrate = jest.fn()

jest.mock("expo-file-system", () => ({
  Directory: jest.fn(() => ({
    exists: true,
    uri: "file:///library/.myreader",
  })),
}))
jest.mock("@op-engineering/op-sqlite", () => ({ open: mockOpen }))
jest.mock("drizzle-orm/op-sqlite", () => ({ drizzle: mockDrizzle }))
jest.mock("drizzle-orm/op-sqlite/migrator", () => ({
  migrate: mockMigrate,
}))
jest.mock("@my-reader/db/schema", () => ({}))
jest.mock("@my-reader/db/drizzle/migrations", () => ({}), { virtual: true })
jest.mock("../fs/library-paths", () => ({
  LIBRARY_MYREADER_DIR: ".myreader",
  librarySidecarRootUri: () => "file:///library",
}))
jest.mock("../fs/path", () => ({
  fileUriFor: () => "file:///library/.myreader/myreader.db",
}))

describe("getLibraryDatabase", () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it("should retry database initialization when a migration previously fails", async () => {
    const firstRaw = { closeAsync: jest.fn() }
    const secondRaw = { closeAsync: jest.fn() }
    mockOpen.mockReturnValueOnce(firstRaw).mockReturnValueOnce(secondRaw)
    mockDrizzle.mockReturnValue({})
    mockMigrate
      .mockRejectedValueOnce(new Error("migration failed"))
      .mockResolvedValueOnce(undefined)

    const { getLibraryDatabase } = require("./library-db")

    await expect(getLibraryDatabase({ id: "library" })).rejects.toThrow(
      "migration failed",
    )
    await expect(getLibraryDatabase({ id: "library" })).resolves.toMatchObject({
      raw: secondRaw,
    })
  })

  it("should close the database when its migration fails", async () => {
    const raw = { closeAsync: jest.fn() }
    mockOpen.mockReturnValue(raw)
    mockDrizzle.mockReturnValue({})
    mockMigrate.mockRejectedValue(new Error("migration failed"))

    const { getLibraryDatabase } = require("./library-db")

    await expect(getLibraryDatabase({ id: "library" })).rejects.toThrow(
      "migration failed",
    )
    expect(raw.closeAsync).toHaveBeenCalled()
  })
})
