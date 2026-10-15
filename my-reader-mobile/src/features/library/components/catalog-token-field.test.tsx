import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native"
import { Keyboard, Platform, ScrollView, View } from "react-native"
import { useDebouncedValue } from "@/src/hooks/use-debounced-value"
import { CatalogTokenField } from "./catalog-token-field"
import { CatalogSuggestionsHost } from "./catalog-suggestions-overlay"

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("@/src/hooks/use-debounced-value", () => ({
  useDebouncedValue: jest.fn((value: string) => value),
}))
jest.mock("@/src/design/tokens", () => ({
  useTheme: () => ({ colorScheme: "light" }),
  useThemePalette: () => ({ text: "#3b2f2f", surface: "#f0e8db" }),
}))
jest.mock("@/modules/token-field/src", () => ({
  NativeTokenField: ({ placeholder, ...props }: { placeholder: string }) => {
    const React = require("react")
    return React.createElement(require("react-native").View, {
      ...props,
      accessibilityLabel: placeholder,
    })
  },
}))

const navigation = {
  authors: [{ name: "Author, Jr.", bookCount: 1, covers: [] }],
  tags: [
    { name: "标签 A", bookCount: 1, covers: [] },
    { name: "标签 B", bookCount: 1, covers: [] },
  ],
  series: [{ name: "Series A", bookCount: 1, covers: [] }],
}
beforeEach(() => {
  jest.spyOn(View.prototype, "measureInWindow").mockImplementation(function (
    this: View,
    callback,
  ) {
    callback(
      0,
      0,
      360,
      this.props.testID === "catalog-suggestions-host" ? 720 : 60,
    )
  })
  jest
    .mocked(useDebouncedValue)
    .mockReset()
    .mockImplementation((value) => value)
})
afterEach(() => jest.restoreAllMocks())
function setup(
  overrides: Partial<React.ComponentProps<typeof CatalogTokenField>> = {},
) {
  const props = {
    tokens: [],
    onTokensChange: jest.fn(),
    navigation,
    query: "",
    onQueryChange: jest.fn(),
    ...overrides,
  }
  render(<CatalogTokenField {...props} />, {
    wrapper: CatalogSuggestionsHost,
  })
  return { props, input: screen.getByLabelText("catalog.searchPlaceholder") }
}

it("keeps the main scroll view outside the overlay host for native header tracking", () => {
  render(
    <CatalogSuggestionsHost>
      <ScrollView testID="catalog-content" />
    </CatalogSuggestionsHost>,
  )
  expect(screen.getByTestId("catalog-content")).toBeTruthy()
  expect(
    within(screen.getByTestId("catalog-suggestions-host")).queryByTestId(
      "catalog-content",
    ),
  ).toBeNull()
})

it("adds a selected suggestion while preserving existing conditions", () => {
  const { props } = setup({
    tokens: [{ kind: "tags", value: "标签 A" }],
    query: "Author, Jr.",
  })
  fireEvent.press(screen.getByText("Author, Jr."))
  expect(props.onTokensChange).toHaveBeenCalledWith([
    { kind: "tags", value: "标签 A" },
    { kind: "authors", value: "Author, Jr." },
  ])
  expect(props.onQueryChange).toHaveBeenCalledWith("")
})

it.each([
  "Author, Jr.",
  "标签 A",
  "Series A",
  "unknown, name",
])("submits %j as free text without adding a suggested condition", (query) => {
  const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {})
  const { props, input } = setup({
    tokens: [{ kind: "tags", value: "标签 B" }],
    query,
  })
  fireEvent(input, "tokenFieldSubmit", {
    nativeEvent: { text: query },
  })
  expect(props.onTokensChange).not.toHaveBeenCalled()
  expect(props.onQueryChange).not.toHaveBeenCalled()
  expect(input.props.value.text).toBe(query)
  expect(screen.queryByTestId("catalog-suggestions-dismiss")).toBeNull()
  expect(dismiss).toHaveBeenCalled()
})

it.each(["", " \t "])("shows no suggestions for blank input %j", (query) => {
  setup({ query })
  for (const facets of Object.values(navigation)) {
    for (const facet of facets) {
      expect(screen.queryByText(facet.name)).toBeNull()
    }
  }
})

it.each([
  "",
  " \t ",
])("hides suggestions immediately when input becomes %j", (query) => {
  const { props } = setup({ query: "Author" })
  expect(screen.getByText("Author, Jr.")).toBeTruthy()
  jest.mocked(useDebouncedValue).mockReturnValue("Author")
  screen.rerender(<CatalogTokenField {...props} query={query} />)
  expect(screen.queryByText("Author, Jr.")).toBeNull()
})

it.each([
  "ios",
  "android",
] as const)("keeps typed suggestions selectable on %s without requiring a native focus event", (platform) => {
  jest.replaceProperty(Platform, "OS", platform)
  const { props } = setup({ query: "Author" })
  expect(
    within(screen.getByTestId("catalog-token-field")).queryByText(
      "Author, Jr.",
    ),
  ).toBeNull()
  fireEvent.press(screen.getByText("Author, Jr."))
  expect(props.onTokensChange).toHaveBeenCalledWith([
    { kind: "authors", value: "Author, Jr." },
  ])
})

it("dismisses the overlay without changing the search and reopens it when the field is touched", () => {
  const { props } = setup({ query: "Author" })
  fireEvent.press(screen.getByTestId("catalog-suggestions-dismiss"))
  expect(screen.queryByText("Author, Jr.")).toBeNull()
  expect(props.onQueryChange).not.toHaveBeenCalled()
  expect(props.onTokensChange).not.toHaveBeenCalled()
  fireEvent(screen.getByTestId("catalog-token-field"), "touchStart")
  expect(screen.getByText("Author, Jr.")).toBeTruthy()
})

it("removes suggestions when the search field is closed", () => {
  setup({ query: "Author" })
  expect(screen.getByText("Author, Jr.")).toBeTruthy()
  screen.rerender(<View />)
  expect(screen.queryByText("Author, Jr.")).toBeNull()
})

it("propagates native token deletion while preserving the query and remaining conditions", () => {
  const { props, input } = setup({
    query: "book title",
    tokens: [
      { kind: "tags", value: "标签 A" },
      { kind: "tags", value: "标签 B" },
    ],
  })
  fireEvent(input, "tokenFieldChange", {
    nativeEvent: {
      text: "book title",
      tokens: [
        {
          id: JSON.stringify({ kind: "tags", value: "标签 A" }),
          label: "标签 A",
        },
      ],
      eventCount: 1,
    },
  })
  expect(props.onTokensChange).toHaveBeenCalledWith([
    { kind: "tags", value: "标签 A" },
  ])
  expect(props.onQueryChange).toHaveBeenCalledWith("book title")
})

it("validates and deduplicates pasted native token values", () => {
  const { props, input } = setup()
  const token = {
    id: JSON.stringify({ kind: "tags", value: "标签 A" }),
    label: "标签 A",
  }
  fireEvent(input, "tokenFieldChange", {
    nativeEvent: {
      text: "novel",
      tokens: [
        token,
        token,
        { id: "malformed", label: "bad" },
        { id: '{"kind":"other","value":"bad"}', label: "bad" },
      ],
      eventCount: 2,
    },
  })
  expect(props.onTokensChange).toHaveBeenCalledWith([
    { kind: "tags", value: "标签 A" },
  ])
  expect(props.onQueryChange).toHaveBeenCalledWith("novel")
  expect(
    screen.getByLabelText("catalog.searchPlaceholder").props.value.eventCount,
  ).toBe(2)
})
