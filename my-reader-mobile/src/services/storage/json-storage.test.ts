jest.mock("expo-file-system", () => {
  class MockFile {
    exists = false
    content = ""
    create = jest.fn(() => {
      this.exists = true
    })
    delete = jest.fn(() => {
      this.exists = false
    })
    text = jest.fn(async () => this.content)
    write = jest.fn((value: string) => {
      this.content = value
      this.exists = true
    })

    constructor(_base: string, name: string) {
      const existing = files.get(name)
      if (existing) {
        return existing
      }
      files.set(name, this)
    }
  }

  const files = new Map<string, MockFile>()

  return {
    File: MockFile,
    Paths: { document: "file:///documents" },
    __mockFileSystem: {
      fileFor: (name: string) => files.get(name),
      reset: () => files.clear(),
      MockFile,
    },
  }
})

import { createExpoJsonStorage } from "./json-storage"

const { __mockFileSystem } = jest.requireMock("expo-file-system")

function fileFor(name: string) {
  return __mockFileSystem.fileFor(`${name}.json`)
}

describe("createExpoJsonStorage", () => {
  beforeEach(() => {
    __mockFileSystem.reset()
    jest.clearAllMocks()
  })

  test("should return null when stored item is missing", async () => {
    await expect(
      createExpoJsonStorage().getItem("settings"),
    ).resolves.toBeNull()
  })

  test("should return null when existing file cannot be read", async () => {
    const storage = createExpoJsonStorage()
    const file = new __mockFileSystem.MockFile(
      "file:///documents",
      "settings.json",
    )
    file.exists = true
    file.text.mockRejectedValue(new Error("read failed"))

    await expect(storage.getItem("settings")).resolves.toBeNull()
  })

  test("should create backing file when writing a new item", async () => {
    const storage = createExpoJsonStorage()

    await storage.setItem("settings", '{"theme":"dark"}')

    expect(fileFor("settings")?.create).toHaveBeenCalledWith({
      intermediates: true,
      overwrite: true,
    })
    expect(fileFor("settings")?.write).toHaveBeenCalledWith('{"theme":"dark"}')
  })

  test("should read and remove value when item exists", async () => {
    const storage = createExpoJsonStorage()
    await storage.setItem("settings", '{"theme":"dark"}')

    await expect(storage.getItem("settings")).resolves.toBe('{"theme":"dark"}')
    await storage.removeItem("settings")

    expect(fileFor("settings")?.delete).toHaveBeenCalledTimes(1)
    await expect(storage.getItem("settings")).resolves.toBeNull()
  })

  test("should not delete file when item is missing", async () => {
    await createExpoJsonStorage().removeItem("settings")

    expect(fileFor("settings")?.delete).not.toHaveBeenCalled()
  })
})
