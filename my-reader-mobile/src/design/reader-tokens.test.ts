import {
  chromeSegmentStyle,
  chromeThemeCardStyle,
  chromeTocLabelStyle,
  chromeTocRowStyle,
  READER_CHROME,
} from "./reader-tokens"

describe("reader chrome tokens", () => {
  it("should return active segment style when segment is active", () => {
    expect(chromeSegmentStyle(true)).toEqual({
      backgroundColor: READER_CHROME.surfaceActive,
      borderColor: READER_CHROME.borderActive,
    })
  })

  it("should return idle segment style when segment is inactive", () => {
    expect(chromeSegmentStyle(false)).toEqual({
      backgroundColor: READER_CHROME.surfaceIdle,
      borderColor: READER_CHROME.border,
    })
  })

  it("should return active theme card style when card is active", () => {
    expect(chromeThemeCardStyle(true)).toEqual({
      backgroundColor: READER_CHROME.surfaceActive,
      borderColor: READER_CHROME.borderActive,
    })
  })

  it("should return idle theme card style when card is inactive", () => {
    expect(chromeThemeCardStyle(false)).toEqual({
      backgroundColor: READER_CHROME.surfaceIdle,
      borderColor: READER_CHROME.border,
    })
  })

  it("should return active toc row style when row is active", () => {
    expect(chromeTocRowStyle(true)).toEqual({
      backgroundColor: READER_CHROME.surfaceActive,
      borderWidth: 1,
      borderColor: READER_CHROME.borderActive,
    })
  })

  it("should return idle toc row style when row is inactive", () => {
    expect(chromeTocRowStyle(false)).toEqual({
      backgroundColor: READER_CHROME.surfaceIdle,
      borderWidth: 0,
      borderColor: "transparent",
    })
  })

  it("should return active toc label style when label is active", () => {
    expect(chromeTocLabelStyle(true)).toEqual({
      color: READER_CHROME.accent,
      fontWeight: "700",
    })
  })

  it("should return idle toc label style when label is inactive", () => {
    expect(chromeTocLabelStyle(false)).toEqual({
      color: READER_CHROME.textSecondary,
      fontWeight: "500",
    })
  })
})
