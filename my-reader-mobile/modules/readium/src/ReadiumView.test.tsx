import { fireEvent, render } from "@testing-library/react-native"
import { createRef } from "react"
import * as ReactNative from "react-native"
import { ReadiumModule } from "./ReadiumModule"
import { ReadiumView } from "./ReadiumView"
import type { ReadiumViewRef } from "./ReadiumView.types"

jest.mock("expo", () => ({
  requireNativeView: () => require("react-native").View,
}))
jest.mock("./ReadiumModule", () => ({
  ReadiumModule: { exportImages: jest.fn() },
}))

describe("Readium image export bridge", () => {
  beforeEach(() => jest.clearAllMocks())
  afterEach(() => jest.restoreAllMocks())

  function setup() {
    const ref = createRef<ReadiumViewRef>()
    const onImagePress = jest.fn()
    const screen = render(
      <ReadiumView
        ref={ref}
        file={{ url: "file:///book.cbz" }}
        preferences={{}}
        onImagePress={onImagePress}
      />,
    )
    const container = screen.UNSAFE_root.findAll(
      (node) => typeof node.props.onLayout === "function",
    )[0]!
    fireEvent(container, "layout", {
      nativeEvent: { layout: { width: 400, height: 600 } },
    })
    return { ref, screen, onImagePress }
  }

  it("forwards selected originals and all visible native files without changing their metadata", async () => {
    jest
      .spyOn(
        jest.requireActual<typeof ReactNative>("react-native"),
        "findNodeHandle",
      )
      .mockReturnValue(42)
    const files = [2, 3].map((position) => ({
      uri: `file:///cache/${position}.jpg`,
      name: `${position}.jpg`,
      mimeType: "image/jpeg",
      position,
    }))
    jest.mocked(ReadiumModule.exportImages).mockResolvedValue(files)
    const { ref, screen, onImagePress } = setup()

    const nativeView = screen.UNSAFE_root.findAll(
      (node) => typeof node.props.onImagePress === "function",
    ).pop()!
    fireEvent(nativeView, "imagePress", {
      nativeEvent: { href: "images/3.jpg" },
    })
    expect(onImagePress).toHaveBeenCalledWith({ href: "images/3.jpg" })
    expect(ReadiumModule.exportImages).not.toHaveBeenCalled()
    await expect(ref.current!.exportImages("images/3.jpg")).resolves.toBe(files)
    expect(ReadiumModule.exportImages).toHaveBeenLastCalledWith(
      42,
      "images/3.jpg",
    )
    await expect(ref.current!.exportImages()).resolves.toBe(files)
    expect(ReadiumModule.exportImages).toHaveBeenLastCalledWith(42, null)
  })

  it("rejects unavailable readers and propagates native export failures", async () => {
    const tag = jest
      .spyOn(
        jest.requireActual<typeof ReactNative>("react-native"),
        "findNodeHandle",
      )
      .mockReturnValue(null)
    const { ref } = setup()
    await expect(ref.current!.exportImages()).rejects.toThrow(
      "READER_NOT_READY",
    )
    expect(ReadiumModule.exportImages).not.toHaveBeenCalled()
    tag.mockReturnValue(42)
    jest
      .mocked(ReadiumModule.exportImages)
      .mockRejectedValue(new Error("Original image unavailable"))
    await expect(ref.current!.exportImages("images/3.jpg")).rejects.toThrow(
      "Original image unavailable",
    )
  })
})
