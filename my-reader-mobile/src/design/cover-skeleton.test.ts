import {
  COVER_LOADING_SKELETON_DARK_OPACITY,
  COVER_LOADING_SKELETON_LIGHT_OPACITY,
} from "./cover-skeleton"

describe("coverLoadingSkeletonColor", () => {
  it("keeps the static light state lighter than the animated dark state", () => {
    expect(COVER_LOADING_SKELETON_LIGHT_OPACITY).toBeLessThan(
      COVER_LOADING_SKELETON_DARK_OPACITY,
    )
  })
})
