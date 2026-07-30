import MyReaderRustComponents from "@/modules/myreader-rust-components"
import { invokeCoreAsync, invokeCoreSync } from "./transport"

describe("core transport", () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it("should return typed output when synchronous response matches request", () => {
    jest.spyOn(MyReaderRustComponents, "coreContractVersion").mockReturnValue(1)
    jest
      .spyOn(MyReaderRustComponents, "invokeCoreSync")
      .mockReturnValue(
        '{"domain":"catalog","response":{"operation":"validateLibrary","output":true}}',
      )

    const output = invokeCoreSync<boolean>("catalog", "validateLibrary", {
      libraryRootPath: "/library",
    })

    expect(output).toBe(true)
    expect(MyReaderRustComponents.invokeCoreSync).toHaveBeenCalledWith(
      '{"domain":"catalog","request":{"operation":"validateLibrary","input":{"libraryRootPath":"/library"}}}',
    )
  })

  it("should reject response when asynchronous operation does not match request", async () => {
    jest.spyOn(MyReaderRustComponents, "coreContractVersion").mockReturnValue(1)
    jest
      .spyOn(MyReaderRustComponents, "invokeCoreAsync")
      .mockResolvedValue(
        '{"domain":"catalog","response":{"operation":"listBooks","output":[]}}',
      )

    await expect(
      invokeCoreAsync<number>("catalog", "countBooks", {
        libraryRootPath: "/library",
      }),
    ).rejects.toThrow("CORE_TRANSPORT_RESPONSE_MISMATCH")
  })

  it("should reject request when native contract version is incompatible", () => {
    jest.spyOn(MyReaderRustComponents, "coreContractVersion").mockReturnValue(2)

    expect(() =>
      invokeCoreSync<boolean>("catalog", "validateLibrary", {
        libraryRootPath: "/library",
      }),
    ).toThrow("CORE_CONTRACT_VERSION_MISMATCH: expected 1, received 2")
  })
})
