jest.mock("@/src/services/db/calibre-db", () => ({
  withCalibreDb: jest.fn(),
}))

import { withCalibreDb } from "@/src/services/db/calibre-db"
import { getCalibreLibraryUuid } from "./library"

describe("getCalibreLibraryUuid", () => {
  it("should return canonical lowercase UUID when Calibre library_id exists", async () => {
    const get = jest
      .fn()
      .mockResolvedValue({ uuid: "018F2F8D-980B-40EF-B72E-C6E86CB7CC28" })
    const from = jest.fn(() => ({ get }))
    const select = jest.fn(() => ({ from }))
    jest
      .mocked(withCalibreDb)
      .mockImplementation(async (_uri, fn) => fn({ select } as never))

    await expect(
      getCalibreLibraryUuid("file:///library/metadata.db"),
    ).resolves.toBe("018f2f8d-980b-40ef-b72e-c6e86cb7cc28")
    expect(get).toHaveBeenCalledTimes(1)
  })
})
