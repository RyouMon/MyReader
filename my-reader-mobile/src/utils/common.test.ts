import { uuid } from "./common"

jest.mock("expo-crypto", () => ({
  randomUUID: () => "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
}))

describe("uuid", () => {
  it("returns 32-char hex string without hyphens", () => {
    const id = uuid()
    expect(id).toBe("a1b2c3d4e5f67890abcdef1234567890")
    expect(id).toHaveLength(32)
    expect(id).not.toContain("-")
  })
})
