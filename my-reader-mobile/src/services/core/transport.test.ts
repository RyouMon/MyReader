import MyReaderCore from "@/modules/my-reader-core"
import { invokeCoreAsync, invokeCoreSync } from "./transport"

describe("core transport", () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it("should return typed output when synchronous response matches request", () => {
    jest.spyOn(MyReaderCore, "coreContractVersion").mockReturnValue(2)
    jest
      .spyOn(MyReaderCore, "invokeCoreSync")
      .mockReturnValue(
        '{"domain":"catalog","response":{"operation":"validateLibrary","output":true}}',
      )

    const output = invokeCoreSync("catalog", "validateLibrary", {
      libraryRootPath: "/library",
    })

    expect(output).toBe(true)
    expect(MyReaderCore.invokeCoreSync).toHaveBeenCalledWith(
      '{"domain":"catalog","request":{"operation":"validateLibrary","input":{"libraryRootPath":"/library"}}}',
    )
  })

  it("should reject response when asynchronous operation does not match request", async () => {
    jest.spyOn(MyReaderCore, "coreContractVersion").mockReturnValue(2)
    jest
      .spyOn(MyReaderCore, "invokeCoreAsync")
      .mockResolvedValue(
        '{"domain":"catalog","response":{"operation":"listBooks","output":[]}}',
      )

    await expect(
      invokeCoreAsync("catalog", "countBooks", {
        libraryRootPath: "/library",
      }),
    ).rejects.toThrow("CORE_TRANSPORT_RESPONSE_MISMATCH")
  })

  it("should reject request when native contract version is incompatible", () => {
    jest.spyOn(MyReaderCore, "coreContractVersion").mockReturnValue(3)

    expect(() =>
      invokeCoreSync("catalog", "validateLibrary", {
        libraryRootPath: "/library",
      }),
    ).toThrow("CORE_CONTRACT_VERSION_MISMATCH: expected 2, received 3")
  })
})
