import { fireEvent, render } from "@testing-library/react-native"
import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import type { useReaderPositionConflict } from "@/src/hooks/use-reader-position-conflict"
import { ReaderPositionConflict } from "./ReaderPositionConflict"

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}))
jest.mock("@expo/ui/community/bottom-sheet", () => {
  const React = jest.requireActual("react")
  const { View } = jest.requireActual("react-native")
  return {
    BottomSheetModal: React.forwardRef(
      ({ children }: { children: unknown }, ref: unknown) => {
        const [visible, setVisible] = React.useState(false)
        React.useImperativeHandle(ref, () => ({
          present: () => setVisible(true),
          dismiss: () => setVisible(false),
        }))
        return visible ? React.createElement(View, null, children) : null
      },
    ),
    BottomSheetScrollView: View,
  }
})

function setup(pending = false) {
  const conflict: ReturnType<typeof useReaderPositionConflict> = {
    candidates: [0.2, 0.8].map((progress, index) => ({
      operationId: `candidate-${index}`,
      locator: { href: "chapter.xhtml", type: "application/xhtml+xml" },
      displayProgression: progress,
      recordedAt: 1,
      replicaId: `device-${index}`,
    })),
    error: null,
    pending,
    refresh: jest.fn().mockResolvedValue(null),
    select: jest.fn().mockResolvedValue(null),
  }
  const onSelect = jest.fn().mockResolvedValue(undefined)
  const screen = render(
    <ReaderPositionConflict
      conflict={conflict}
      visible
      insetsTop={0}
      palette={readerChromePalette("#FFFFFF", "#181842")}
      onSelect={onSelect}
    />,
  )
  return { screen, conflict, onSelect }
}

it("waits for an explicit tap and keeps the entry available after dismissal", () => {
  const { screen, conflict, onSelect } = setup()
  expect(screen.queryByText("reader.positionConflictDescription")).toBeNull()
  fireEvent.press(screen.getByLabelText("reader.positionConflictTitle"))
  expect(conflict.refresh).toHaveBeenCalledTimes(1)
  expect(screen.getByText("reader.positionConflictDescription")).toBeTruthy()
  fireEvent.press(screen.getByText("common.cancel"))
  expect(screen.queryByText("reader.positionConflictDescription")).toBeNull()
  expect(screen.getByLabelText("reader.positionConflictTitle")).toBeTruthy()
  expect(onSelect).not.toHaveBeenCalled()
})

it("selects only the chosen candidate", () => {
  const { screen, onSelect } = setup()
  fireEvent.press(screen.getByLabelText("reader.positionConflictTitle"))
  fireEvent.press(screen.getByText("80%"))
  expect(onSelect).toHaveBeenCalledWith("candidate-1")
})

it("prevents candidate selection while progress is being saved or refreshed", () => {
  const { screen, onSelect } = setup(true)
  fireEvent.press(screen.getByLabelText("reader.positionConflictTitle"))
  fireEvent.press(screen.getByText("80%"))
  expect(onSelect).not.toHaveBeenCalled()
})
