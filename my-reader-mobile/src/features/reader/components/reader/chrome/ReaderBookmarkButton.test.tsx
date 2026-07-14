import { fireEvent, render } from "@testing-library/react-native"
import { StyleSheet } from "react-native"

import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import ReaderBookmarkButton, {
  readerBookmarkButtonVisible,
  readerBookmarkIconActiveState,
} from "./ReaderBookmarkButton"
import { ChromeState } from "./chrome-state"

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock("./ReaderChromeIcon", () => {
  const { View } = jest.requireActual("react-native")
  return {
    ReaderChromeIcon: ({ name, color }: { name: string; color: string }) => (
      <View testID={`reader-icon-${name}`} style={{ color }} />
    ),
  }
})

const palette = readerChromePalette("#2C2420", "#F5EFE9")

describe("ReaderBookmarkButton", () => {
  it("should show the standalone button when chrome is active or the page is bookmarked", () => {
    expect(readerBookmarkButtonVisible(ChromeState.Reading, true)).toBe(true)
    expect(readerBookmarkButtonVisible(ChromeState.Reading, false)).toBe(false)
    expect(readerBookmarkButtonVisible(ChromeState.Chrome, true)).toBe(true)
    expect(readerBookmarkButtonVisible(ChromeState.Chrome, false)).toBe(true)
    expect(readerBookmarkButtonVisible(ChromeState.Expanded, true)).toBe(true)
    expect(readerBookmarkButtonVisible(ChromeState.Expanded, false)).toBe(true)
  })

  it("should add a bookmark when the inactive themed button is pressed", () => {
    const onPress = jest.fn()
    const screen = render(
      <ReaderBookmarkButton
        bookmarked={false}
        disabled={false}
        iconOnly={false}
        insetsTop={24}
        visible
        palette={palette}
        onPress={onPress}
      />,
    )

    fireEvent.press(screen.getByLabelText("reader.bookmarks.addCurrent"))

    expect(onPress).toHaveBeenCalledTimes(1)
    expect(
      StyleSheet.flatten(
        screen.getByTestId("reader-bookmark-icon-inactive").props.style,
      ).opacity,
    ).toBe(1)
    expect(
      StyleSheet.flatten(
        screen.getByTestId("reader-icon-bookmark").props.style,
      ),
    ).toMatchObject({ color: palette.actionText })
    expect(
      StyleSheet.flatten(
        screen.getByTestId("reader-bookmark-icon-active").props.style,
      ).opacity,
    ).toBe(0)
    expect(
      StyleSheet.flatten(
        screen.getByTestId("reader-bookmark-button").props.style,
      ),
    ).toMatchObject({ left: 32, top: 24 })
    expect(
      StyleSheet.flatten(
        screen.getByTestId("reader-bookmark-surface").props.style,
      ).opacity,
    ).toBe(1)
  })

  it("should use the themed fill when the active bookmark is rendered", () => {
    const screen = render(
      <ReaderBookmarkButton
        bookmarked
        disabled={false}
        iconOnly={false}
        insetsTop={24}
        visible
        palette={palette}
        onPress={jest.fn()}
      />,
    )
    const button = screen.getByLabelText("reader.bookmarks.removeCurrent")

    expect(button.props.accessibilityState).toEqual({
      disabled: false,
      selected: true,
    })
    expect(
      StyleSheet.flatten(
        screen.getByTestId("reader-bookmark-icon-active").props.style,
      ).opacity,
    ).toBe(1)
    expect(
      StyleSheet.flatten(
        screen.getByTestId("reader-icon-bookmarkActive").props.style,
      ),
    ).toMatchObject({ color: palette.accentText })
    expect(
      StyleSheet.flatten(
        screen.getByTestId("reader-bookmark-icon-inactive").props.style,
      ).opacity,
    ).toBe(0)
  })

  it("should disable bookmark changes when the current location is unavailable", () => {
    const onPress = jest.fn()
    const screen = render(
      <ReaderBookmarkButton
        bookmarked={false}
        disabled
        iconOnly={false}
        insetsTop={24}
        visible
        palette={palette}
        onPress={onPress}
      />,
    )
    const button = screen.getByLabelText("reader.bookmarks.addCurrent")

    fireEvent.press(button)

    expect(onPress).not.toHaveBeenCalled()
  })

  it("should hide the bookmark button when immersive reading is unbookmarked", () => {
    const screen = render(
      <ReaderBookmarkButton
        bookmarked={false}
        disabled={false}
        iconOnly
        insetsTop={24}
        visible={false}
        palette={palette}
        onPress={jest.fn()}
      />,
    )

    expect(
      screen.getByTestId("reader-bookmark-button", {
        includeHiddenElements: true,
      }).props.pointerEvents,
    ).toBe("none")
    expect(screen.queryByLabelText("reader.bookmarks.addCurrent")).toBeNull()
  })

  it("should show only the bookmark icon when immersive reading is bookmarked", () => {
    const screen = render(
      <ReaderBookmarkButton
        bookmarked
        disabled={false}
        iconOnly
        insetsTop={24}
        visible
        palette={palette}
        onPress={jest.fn()}
      />,
    )

    expect(
      StyleSheet.flatten(
        screen.getByTestId("reader-bookmark-icon-active").props.style,
      ).opacity,
    ).toBe(1)
    expect(
      StyleSheet.flatten(
        screen.getByTestId("reader-bookmark-surface").props.style,
      ).opacity,
    ).toBe(0)
  })

  it("should retain the active icon for fading when the next page is not bookmarked", () => {
    expect(readerBookmarkIconActiveState(true, false, false)).toBe(true)
    expect(readerBookmarkIconActiveState(true, false, true)).toBe(false)

    const screen = render(
      <ReaderBookmarkButton
        bookmarked
        disabled={false}
        iconOnly
        insetsTop={24}
        visible
        palette={palette}
        onPress={jest.fn()}
      />,
    )

    screen.rerender(
      <ReaderBookmarkButton
        bookmarked={false}
        disabled={false}
        iconOnly
        insetsTop={24}
        visible={false}
        palette={palette}
        onPress={jest.fn()}
      />,
    )

    expect(
      screen.getByTestId("reader-icon-bookmarkActive", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy()
    expect(
      screen.getByTestId("reader-icon-bookmark", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy()
  })
})
