import { render, screen } from "@testing-library/react-native"

import { HelpSection } from "./help-section"

jest.mock("@expo/vector-icons/MaterialIcons", () => jest.fn(() => null))
jest.mock("expo-symbols", () => ({ SymbolView: jest.fn(() => null) }))

jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({
    border: "#ddd",
    primary: "#c4622d",
    surface: "#fff",
    text: "#111",
    textMuted: "#666",
  }),
}))

describe("HelpSection", () => {
  it("should present help content without interactive rows", () => {
    render(
      <HelpSection
        title="Library help"
        items={[
          { title: "Question one?", body: "Answer one." },
          { title: "Question two?", body: "Answer two." },
        ]}
      />,
    )

    expect(screen.getByText("Library help")).toBeTruthy()
    expect(screen.getByText("Question one?")).toBeTruthy()
    expect(screen.getByText("Answer two.")).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })
})
