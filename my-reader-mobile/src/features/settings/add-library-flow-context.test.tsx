import { act, renderHook, waitFor } from "@testing-library/react-native"
import type { PropsWithChildren } from "react"

import { switchActiveLibrary } from "@/src/domain/library/hooks/library-actions"
import { promptLibraryAdded } from "@/src/domain/notifications/library-notifications"
import { deleteStagedBookImport } from "@/src/services/fs/staged-book-import"

import {
  AddLibraryFlowProvider,
  useAddLibraryFlow,
} from "./add-library-flow-context"

jest.mock("@/src/services/fs/staged-book-import", () => ({
  deleteStagedBookImport: jest.fn(),
}))
jest.mock("@/src/domain/library/hooks/library-actions", () => ({
  switchActiveLibrary: jest.fn(),
}))
jest.mock("@/src/domain/notifications/library-notifications", () => ({
  promptLibraryAdded: jest.fn(),
}))
jest.mock("expo-router", () => ({
  router: { dismissTo: jest.fn() },
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

  it("should offer to stay on the current page after adding a library", () => {
    const { result } = renderHook(() => useAddLibraryFlow(), {
      wrapper: FlowWrapper,
    })

    act(() =>
      result.current.finishAddingLibrary({
        id: "new-library",
        name: "New Library",
      }),
    )

    expect(promptLibraryAdded).toHaveBeenCalledWith(
      "New Library",
      expect.objectContaining({
        onStay: expect.any(Function),
        onSwitch: expect.any(Function),
      }),
    )
    expect(mockDismiss).not.toHaveBeenCalled()

    const actions = jest.mocked(promptLibraryAdded).mock.calls[0]?.[1]
    act(() => actions?.onStay())

    expect(mockDismiss).toHaveBeenCalledTimes(1)
    expect(switchActiveLibrary).not.toHaveBeenCalled()
  })

  it("should switch to the added library before opening it", async () => {
    const { router } = jest.requireMock("expo-router") as {
      router: { dismissTo: jest.Mock }
    }
    jest.mocked(switchActiveLibrary).mockResolvedValue()
    const { result } = renderHook(() => useAddLibraryFlow(), {
      wrapper: FlowWrapper,
    })

    act(() =>
      result.current.finishAddingLibrary({
        id: "new-library",
        name: "New Library",
      }),
    )
    const actions = jest.mocked(promptLibraryAdded).mock.calls[0]?.[1]
    act(() => actions?.onSwitch())

    await waitFor(() =>
      expect(switchActiveLibrary).toHaveBeenCalledWith("new-library"),
    )
    expect(router.dismissTo).toHaveBeenCalledWith("/library")
    expect(mockDismiss).not.toHaveBeenCalled()
  })
})
