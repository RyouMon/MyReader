import { act, renderHook } from "@testing-library/react-native"
import { ActionSheetIOS, Alert, Platform } from "react-native"
import type { ReadiumViewRef } from "@my-reader/readium"
import { Directory, File } from "expo-file-system"
import { setImageAsync } from "expo-clipboard"
import { Asset, requestPermissionsAsync } from "expo-media-library"
import { shareAsync } from "expo-sharing"
import { useReaderImageActions } from "./use-reader-image-actions"

jest.mock("expo-file-system", () => ({
  Directory: { pickDirectoryAsync: jest.fn() },
  File: jest.fn(),
}))
jest.mock("expo-clipboard", () => ({ setImageAsync: jest.fn() }))
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }))

const image = {
  uri: "file:///cache/original.jpg",
  name: "original.jpg",
  mimeType: "image/jpeg",
  position: 2,
}

function setup(images = [image]) {
  const exportImages = jest.fn().mockResolvedValue(images)
  const reader = { current: { exportImages } as unknown as ReadiumViewRef }
  const hook = renderHook(() =>
    useReaderImageActions(reader, { title: "山海", authors: ["张三"] }),
  )
  return { ...hook, exportImages }
}

describe("reader image actions", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, "error").mockImplementation(() => {})
    jest.spyOn(Alert, "alert").mockImplementation(() => {})
    ;(File as unknown as jest.Mock).mockImplementation((uri: string) => ({
      uri,
      rename(name: string) {
        this.uri = uri.replace(/[^/]+$/, name)
      },
      base64: jest.fn().mockResolvedValue("original-bytes"),
      copy: jest.fn(),
    }))
  })
  afterEach(() => jest.restoreAllMocks())

  it("shares the native current-page file without decoding or re-encoding it", async () => {
    const { result, exportImages } = setup()
    await act(() => result.current.sharePage())
    expect(exportImages).toHaveBeenCalledWith(undefined)
    expect(shareAsync).toHaveBeenCalledWith("file:///cache/张三-山海-2.jpg", {
      mimeType: "image/jpeg",
      additionalUrls: [],
    })
    expect(
      (File as unknown as jest.Mock).mock.results[0]!.value.base64,
    ).not.toHaveBeenCalled()
    expect(requestPermissionsAsync).not.toHaveBeenCalled()
  })

  it("shares all visible pages in one native sheet and names each with its own page", async () => {
    const { result } = setup([
      image,
      { ...image, uri: "file:///cache/second/original.jpg", position: 3 },
    ])
    await act(() => result.current.sharePage())
    expect(shareAsync).toHaveBeenCalledTimes(1)
    expect(shareAsync).toHaveBeenCalledWith("file:///cache/张三-山海-2.jpg", {
      mimeType: "image/jpeg",
      additionalUrls: ["file:///cache/second/张三-山海-3.jpg"],
    })
  })

  it("does not export or request permission just by opening the image menu", () => {
    const sheet = jest
      .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
      .mockImplementation(() => {})
    jest.replaceProperty(Platform, "OS", "ios")
    const { result, exportImages } = setup()
    act(() => result.current.onImagePress({ href: "images/original.jpg" }))
    expect(sheet).toHaveBeenCalled()
    expect(exportImages).not.toHaveBeenCalled()
    expect(requestPermissionsAsync).not.toHaveBeenCalled()
  })

  async function choose(index: number) {
    let select: (index: number) => void = () => {}
    jest
      .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
      .mockImplementation((_options, callback) => {
        select = callback
      })
    jest.replaceProperty(Platform, "OS", "ios")
    const hook = setup()
    await act(async () => {
      hook.result.current.onImagePress({ href: "images/original.jpg" })
      select(index)
    })
    return hook
  }

  it("copies the selected resource, not the current page", async () => {
    const { exportImages } = await choose(0)
    expect(exportImages).toHaveBeenCalledWith("images/original.jpg")
    expect(setImageAsync).toHaveBeenCalledWith("original-bytes")
  })

  it("treats a cancelled file picker as a cancellation", async () => {
    ;(Directory.pickDirectoryAsync as jest.Mock).mockRejectedValue({
      code: "ERR_FILE_PICKING_CANCELLED",
    })
    await choose(1)
    expect(Alert.alert).not.toHaveBeenCalled()
  })

  it("requests add-only photo access and does not save after denial", async () => {
    ;(requestPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    })
    await choose(2)
    expect(requestPermissionsAsync).toHaveBeenCalledWith(true, ["photo"])
    expect(Asset.create).not.toHaveBeenCalled()
    expect(Alert.alert).toHaveBeenCalled()
  })

  it("saves the selected original to the chosen directory with its book and position name", async () => {
    const destination = { uri: "file:///chosen/张三-山海-2.jpg" }
    const createFile = jest.fn().mockReturnValue(destination)
    ;(Directory.pickDirectoryAsync as jest.Mock).mockResolvedValue({
      createFile,
    })
    const { exportImages } = await choose(1)
    expect(exportImages).toHaveBeenCalledWith("images/original.jpg")
    expect(createFile).toHaveBeenCalledWith("张三-山海-2.jpg", "image/jpeg")
    expect(
      (File as unknown as jest.Mock).mock.results[1]!.value.copy,
    ).toHaveBeenCalledWith(destination)
    expect(shareAsync).not.toHaveBeenCalled()
  })

  it("adds an original to Photos only after add-only permission is granted", async () => {
    ;(requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true })
    await choose(2)
    expect(Asset.create).toHaveBeenCalledWith("file:///cache/张三-山海-2.jpg")
    expect(setImageAsync).not.toHaveBeenCalled()
  })

  it("shares mixed-format spreads without losing the second attachment", async () => {
    const { result } = setup([
      image,
      {
        ...image,
        uri: "file:///cache/second.png",
        name: "second.png",
        mimeType: "image/png",
        position: 3,
      },
    ])
    await act(() => result.current.sharePage())
    expect(shareAsync).toHaveBeenCalledWith("file:///cache/张三-山海-2.jpg", {
      mimeType: "image/*",
      additionalUrls: ["file:///cache/张三-山海-3.png"],
    })
  })

  it("prevents duplicate exports and restores the action after failure", async () => {
    const { result, exportImages } = setup()
    let reject!: (error: Error) => void
    exportImages.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    let pending!: Promise<void>
    act(() => {
      pending = result.current.sharePage()
    })
    await act(() => result.current.sharePage())
    expect(exportImages).toHaveBeenCalledTimes(1)
    await act(async () => {
      reject(new Error("Reader closed"))
      await pending
    })
    expect(shareAsync).not.toHaveBeenCalled()
    expect(Alert.alert).toHaveBeenCalledTimes(1)
    await act(() => result.current.sharePage())
    expect(shareAsync).toHaveBeenCalledTimes(1)
  })

  it("rejects an empty export instead of sharing a previously saved page", async () => {
    const { result } = setup([])
    await act(() => result.current.sharePage())
    expect(shareAsync).not.toHaveBeenCalled()
    expect(Alert.alert).toHaveBeenCalledTimes(1)
  })

  it("Android image menus export only the selected image when the user chooses copy", async () => {
    jest.replaceProperty(Platform, "OS", "android")
    const { result, exportImages } = setup()
    act(() => result.current.onImagePress({ href: "images/2.jpg" }))
    expect(exportImages).not.toHaveBeenCalled()
    const buttons = jest.mocked(Alert.alert).mock.calls[0]![2]!
    await act(async () => {
      buttons[0]!.onPress!()
    })
    expect(exportImages).toHaveBeenCalledWith("images/2.jpg")
    expect(setImageAsync).toHaveBeenCalledWith("original-bytes")
  })
})
