import { render } from "@testing-library/react-native"
import { Text } from "react-native"

import {
  ANDROID_HEADER_EDGE_INSET,
  ANDROID_HEADER_ICON_SIZE,
  ANDROID_HEADER_TITLE_LEADING_GAP,
  AndroidHeaderSlot,
  androidHeaderSlotStyle,
  wrapAndroidHeaderAction,
} from "./android-header-layout"

describe("android header layout", () => {
  it("should include title gap when slot is on the left", () => {
    expect(androidHeaderSlotStyle("left")).toEqual({
      marginStart: ANDROID_HEADER_EDGE_INSET,
      marginEnd: ANDROID_HEADER_TITLE_LEADING_GAP,
    })
  })

  it("should omit title gap when slot is on the right", () => {
    expect(androidHeaderSlotStyle("right")).toEqual({
      marginStart: 0,
      marginEnd: ANDROID_HEADER_EDGE_INSET,
    })
  })

  it("should render fixed icon slot when given children", () => {
    const screen = render(
      <AndroidHeaderSlot side="left">
        <Text>Action</Text>
      </AndroidHeaderSlot>,
    )

    expect(screen.toJSON()).toMatchObject({
      props: {
        style: expect.objectContaining({
          width: ANDROID_HEADER_ICON_SIZE,
          height: ANDROID_HEADER_ICON_SIZE,
          marginEnd: ANDROID_HEADER_TITLE_LEADING_GAP,
        }),
      },
    })
  })

  it("should wrap renderer when building a header action", () => {
    const renderAction = jest.fn(() => <Text>Wrapped</Text>)
    const HeaderAction = wrapAndroidHeaderAction("right", renderAction)

    const screen = render(<>{HeaderAction()}</>)

    expect(screen.getByText("Wrapped")).toBeTruthy()
    expect(renderAction).toHaveBeenCalledTimes(1)
  })
})
