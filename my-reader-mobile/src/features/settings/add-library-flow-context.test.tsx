import { act, renderHook } from "@testing-library/react-native"
import type { PropsWithChildren } from "react"

import { deleteStagedBookImport } from "@/src/services/fs/staged-book-import"

import {
  AddLibraryFlowProvider,
  useAddLibraryFlow,
} from "./add-library-flow-context"

jest.mock("@/src/services/fs/staged-book-import", () => ({
  deleteStagedBookImport: jest.fn(),
}))

const mockDismiss = jest.fn()

function FlowWrapper({ children }: PropsWithChildren) {
  return (
    <AddLibraryFlowProvider onDismiss={mockDismiss}>
      {children}
    </AddLibraryFlowProvider>
  )
}

describe("AddLibraryFlowProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should clean up an abandoned staged import", () => {
    const { result, unmount } = renderHook(() => useAddLibraryFlow(), {
      wrapper: FlowWrapper,
    })

    act(() => {
      result.current.setPendingImport({ uri: "file:///cache/staged.epub" })
    })
    unmount()

    expect(deleteStagedBookImport).toHaveBeenCalledWith(
      "file:///cache/staged.epub",
    )
  })

  it("should hand off a staged import without deleting it", () => {
    const { result, unmount } = renderHook(() => useAddLibraryFlow(), {
      wrapper: FlowWrapper,
    })

    act(() => {
      result.current.setPendingImport({ uri: "file:///cache/staged.epub" })
    })
    let pending: ReturnType<
      ReturnType<typeof useAddLibraryFlow>["takePendingImport"]
    > = null
    act(() => {
      pending = result.current.takePendingImport()
    })
    unmount()

    expect(pending).toEqual({ uri: "file:///cache/staged.epub" })
    expect(deleteStagedBookImport).not.toHaveBeenCalled()
  })

  it("should delegate dismissal to the modal owner", () => {
    const { result } = renderHook(() => useAddLibraryFlow(), {
      wrapper: FlowWrapper,
    })

    act(() => result.current.dismiss())

    expect(mockDismiss).toHaveBeenCalledTimes(1)
  })
})
