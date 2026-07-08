import { describe, expect, it } from "vitest"
import { generateCoverGradient } from "../cover-gradient"

describe("generateCoverGradient", () => {
  it("should generate the muted fallback cover gradient used by the design draft", () => {
    const gradient = generateCoverGradient("Night Bookstore")

    expect(gradient).toMatch(
      /^linear-gradient\(160deg, hsl\(\d+, 22%, 38%\) 0%, hsl\(\d+, 18%, 28%\) 50%, hsl\(\d+, 15%, 20%\) 100%\)$/,
    )
    expect(gradient).not.toContain("var(--primary)")
    expect(gradient).not.toContain("var(--secondary)")
  })

  it("should keep fallback covers deterministic per title", () => {
    expect(generateCoverGradient("Night Bookstore")).toBe(
      generateCoverGradient("Night Bookstore"),
    )
    expect(generateCoverGradient("Night Bookstore")).not.toBe(
      generateCoverGradient("Morning Library"),
    )
  })
})
