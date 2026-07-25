jest.mock("@automerge/automerge/slim", () => ({
  UseApi: jest.fn(),
}))

jest.mock("@my-reader/automerge-native", () => ({
  nativeApi: {},
}))

import { initializeLibrarySidecarAutomerge } from "./automerge-runtime"

describe("initializeLibrarySidecarAutomerge", () => {
  it("should install the native API once when WebAssembly is unavailable", async () => {
    const { UseApi } = jest.requireMock("@automerge/automerge/slim")
    const { nativeApi } = jest.requireMock("@my-reader/automerge-native")

    await initializeLibrarySidecarAutomerge()
    await initializeLibrarySidecarAutomerge()

    expect(UseApi).toHaveBeenCalledTimes(1)
    expect(UseApi).toHaveBeenCalledWith(nativeApi)
  })
})
