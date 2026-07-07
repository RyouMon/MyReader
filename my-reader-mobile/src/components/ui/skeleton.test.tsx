import { render } from "@testing-library/react-native"
import { View } from "react-native"
import * as Reanimated from "react-native-reanimated"

import { resetSkeletonPulseSyncForTests, Skeleton } from "./skeleton"

describe("Skeleton", () => {
  beforeEach(() => {
    resetSkeletonPulseSyncForTests()
    jest.clearAllMocks()
  })

  it("should share one pulse animation for skeletons with the same sync key when rendering synchronized skeletons", () => {
    render(
      <View>
        <Skeleton animated pulseSyncKey="cover-loading" />
        <Skeleton animated pulseSyncKey="cover-loading" />
      </View>,
    )

    expect(Reanimated.withRepeat).toHaveBeenCalledTimes(1)
  })
})
