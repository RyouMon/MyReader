import {
  COVER_LOADING_SKELETON_DARK_OPACITY,
  COVER_LOADING_SKELETON_LIGHT_OPACITY,
} from "./cover-skeleton"

describe("coverLoadingSkeletonColor", () => {
  it("should keep the static light state lighter than the animated dark state when evaluating cover skeleton colors", () => {
    expect(COVER_LOADING_SKELETON_LIGHT_OPACITY).toBeLessThan(
      COVER_LOADING_SKELETON_DARK_OPACITY,
    )
  })
})
