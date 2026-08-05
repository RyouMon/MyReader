import { act, render } from "@testing-library/react-native"

import { deleteStagedBookImport } from "@/src/services/fs/staged-book-import"

import {
  AddLibraryFlowProvider,
  useAddLibraryFlow,
} from "./add-library-flow-context"

jest.mock("@/src/services/fs/staged-book-import", () => ({
  deleteStagedBookImport: jest.fn(),
}))

let flow: ReturnType<typeof useAddLibraryFlow> | undefined

function FlowProbe() {
  flow = useAddLibraryFlow()
  return null
}

describe("AddLibraryFlowProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    flow = undefined
  })

  it("should clean up an abandoned staged import", () => {
    const view = render(
      <AddLibraryFlowProvider>
        <FlowProbe />
      </AddLibraryFlowProvider>,
    )

    act(() => {
      flow?.setPendingImport({ uri: "file:///cache/staged.epub" })
    })
    view.unmount()

    expect(deleteStagedBookImport).toHaveBeenCalledWith(
      "file:///cache/staged.epub",
    )
  })

  it("should hand off a staged import without deleting it", () => {
    const view = render(
      <AddLibraryFlowProvider>
        <FlowProbe />
      </AddLibraryFlowProvider>,
    )

    act(() => {
      flow?.setPendingImport({ uri: "file:///cache/staged.epub" })
    })
    let pending: ReturnType<
      ReturnType<typeof useAddLibraryFlow>["takePendingImport"]
    > = null
    act(() => {
      pending = flow?.takePendingImport() ?? null
    })
    view.unmount()

    expect(pending).toEqual({ uri: "file:///cache/staged.epub" })
    expect(deleteStagedBookImport).not.toHaveBeenCalled()
  })
})
