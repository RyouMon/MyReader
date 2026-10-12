import { ReaderNavigationHistory } from "@my-reader/tools/reader-navigation-history"
import { act, fireEvent, render } from "@testing-library/react-native"

import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import { ReaderNavigationButtons } from "./ReaderNavigationButtons"

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock("./reader/chrome/ReaderChromeIcon", () => {
  const React = jest.requireActual("react")
  const { Text } = jest.requireActual("react-native")
  return {
    ReaderChromeIcon: ({ name, size }: { name: string; size: number }) =>
      React.createElement(Text, { style: { fontSize: size } }, name),
  }
})

it("shows each destination with its action and hides both after a page turn", () => {
  const history = new ReaderNavigationHistory()
  history.update({
    href: "publication.pdf",
    type: "application/pdf",
    locations: { progression: 0.8, position: 8 },
  })
  const onNavigate = jest.fn()
  const props = {
    history,
    insetsTop: 0,
    title: "A long chapter title that exceeds the available navigation space",
    palette: readerChromePalette("#FFFFFF", "#181842"),
    getLocationLabel: (locator: { locations?: { position?: number } }) =>
      String(locator.locations?.position),
    onNavigate,
  }
  const screen = render(
    <ReaderNavigationButtons {...props} chromeVisible={false} />,
  )
  act(() =>
    history.receiveRemote("remote", {
      href: "publication.pdf",
      type: "application/pdf",
      locations: { progression: 0.2, position: 2 },
    }),
  )
  expect(screen.getByText("2")).toBeTruthy()
  expect(screen.queryByText("8")).toBeNull()
  expect(screen.queryByText(props.title)).toBeNull()
  act(() => history.dismissRemoteHint())
  expect(screen.queryByText("2")).toBeNull()
  screen.rerender(<ReaderNavigationButtons {...props} chromeVisible />)
  expect(screen.getByText(props.title).props.numberOfLines).toBe(1)
  expect(screen.getByText(props.title).props.ellipsizeMode).toBe("tail")
  const forwardIconSize =
    screen.getByText("historyForward").props.style.fontSize
  fireEvent.press(screen.getByLabelText("reader.navigationForward, 2"))
  expect(onNavigate).toHaveBeenCalledWith(
    expect.objectContaining({ locations: { progression: 0.2, position: 2 } }),
  )
  expect(screen.getByLabelText("reader.navigationBack, 8")).toBeTruthy()
  expect(screen.getByText("8")).toBeTruthy()
  expect(screen.queryByText("2")).toBeNull()
  expect(screen.getByText("2", { includeHiddenElements: true })).toBeTruthy()
  expect(
    screen.getByText("historyForward", { includeHiddenElements: true }).props
      .style.fontSize,
  ).toBe(forwardIconSize)

  act(() =>
    history.receiveRemote("next-remote", {
      href: "publication.pdf",
      type: "application/pdf",
      locations: { progression: 0.3, position: 3 },
    }),
  )
  expect(screen.getByLabelText("reader.navigationForward, 3")).toBeTruthy()
  expect(screen.getByText("3")).toBeTruthy()
  expect(screen.queryByText("2", { includeHiddenElements: true })).toBeNull()
})
