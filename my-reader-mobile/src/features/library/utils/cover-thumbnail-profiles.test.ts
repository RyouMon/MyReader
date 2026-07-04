import {
  resolveCoverThumbnailPixelSize,
  resolveFullscreenGridCoverThumbnailSizes,
  selectNearestCoverThumbnailSize,
} from "./cover-thumbnail-profiles"

describe("cover thumbnail profiles", () => {
  it("converts rendered cover size to physical pixels", () => {
    expect(resolveCoverThumbnailPixelSize(150, 214.5, 2)).toEqual({
      widthPx: 300,
      heightPx: 429,
    })
  })

  it("derives only the fullscreen portrait and landscape grid sizes", () => {
    expect(
      resolveFullscreenGridCoverThumbnailSizes({
        pixelRatio: 2,
        screenHeight: 1194,
        screenWidth: 834,
      }),
    ).toEqual([
      { widthPx: 302, heightPx: 432 },
      { widthPx: 367, heightPx: 526 },
    ])
  })

  it("selects the closest grid thumbnail for non-grid layouts", () => {
    expect(
      selectNearestCoverThumbnailSize({ widthPx: 144, heightPx: 216 }, [
        { widthPx: 302, heightPx: 432 },
        { widthPx: 367, heightPx: 526 },
      ]),
    ).toEqual({ widthPx: 302, heightPx: 432 })
  })
})
