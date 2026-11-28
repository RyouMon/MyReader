import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native"
import { useRef, useState } from "react"
import { ScrollView, View } from "react-native"
import {
  AnchoredSuggestions,
  SuggestionsOverlayHost,
  useDismissSuggestions,
} from "./suggestions-overlay"

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("@/src/design/tokens", () => ({
  useTheme: () => ({ colorScheme: "light", palette: {} }),
  useThemePalette: () => ({
    text: "#222",
    textMuted: "#666",
    surface: "#fff",
    border: "#ddd",
    borderStrong: "#ccc",
    overlay: "rgba(0,0,0,0.12)",
  }),
}))

function OverlayFixture({ onChoose }: { onChoose: (key: string) => void }) {
  const anchor = useRef<View>(null)
  const [open, setOpen] = useState(true)
  const dismissSuggestions = useDismissSuggestions()
  return (
    <ScrollView testID="form-scroll" onScrollBeginDrag={dismissSuggestions}>
      <View ref={anchor} testID="anchor-field" />
      <AnchoredSuggestions
        anchor={anchor}
        items={
          open
            ? [
                {
                  key: "https://api.minimaxi.com",
                  title: "China",
                  detail: "https://api.minimaxi.com",
                },
                {
                  key: "https://api.minimax.io",
                  title: "International",
                  detail: "https://api.minimax.io",
                },
              ]
            : []
        }
        accessibilityLabel="Suggested URLs"
        listTestID="endpoint-list"
        dismissTestID="endpoint-dismiss"
        onChoose={(item) => {
          onChoose(item.key)
          setOpen(false)
        }}
        onDismiss={() => setOpen(false)}
      />
    </ScrollView>
  )
}

beforeEach(() => {
  jest.spyOn(View.prototype, "measureInWindow").mockImplementation(function (
    this: View,
    callback,
  ) {
    callback(
      0,
      this.props.testID === "test-host" ? 0 : 100,
      360,
      this.props.testID === "test-host" ? 720 : 56,
    )
  })
})

afterEach(() => {
  jest.restoreAllMocks()
})

it("renders floating suggestions inside the host, dismisses on scroll drag, and selects an option", () => {
  const choose = jest.fn()
  const first = render(
    <SuggestionsOverlayHost testID="test-host">
      <OverlayFixture onChoose={choose} />
    </SuggestionsOverlayHost>,
  )
  const host = screen.getByTestId("test-host")
  expect(within(host).getByTestId("endpoint-list")).toBeTruthy()
  expect(
    within(screen.getByTestId("anchor-field")).queryByTestId("endpoint-list"),
  ).toBeNull()

  fireEvent(screen.getByTestId("form-scroll"), "scrollBeginDrag")
  expect(screen.queryByTestId("endpoint-list")).toBeNull()
  first.unmount()

  render(
    <SuggestionsOverlayHost testID="test-host">
      <OverlayFixture onChoose={choose} />
    </SuggestionsOverlayHost>,
  )
  fireEvent.press(screen.getByText("International"))
  expect(choose).toHaveBeenCalledWith("https://api.minimax.io")
  expect(screen.queryByTestId("endpoint-list")).toBeNull()
})
