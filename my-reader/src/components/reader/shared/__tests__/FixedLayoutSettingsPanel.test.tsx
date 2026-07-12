import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_FIXED_LAYOUT_SETTINGS } from "@/components/reader/types"
import { useAppUiStore } from "@/stores/appUiStore"
import { FixedLayoutSettingsPanel } from "../FixedLayoutSettingsPanel"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe("FixedLayoutSettingsPanel", () => {
  beforeEach(() => {
    useAppUiStore.setState({
      fixedLayout: { ...DEFAULT_FIXED_LAYOUT_SETTINGS },
      readerPreferencesHydrated: false,
    })
  })

  it("should show the four mobile fixed-layout groups when reading PDF", () => {
    render(<FixedLayoutSettingsPanel showPageDirection />)

    expect(screen.getByText("reader.background")).toBeInTheDocument()
    expect(screen.getByText("reader.pageDirection")).toBeInTheDocument()
    expect(screen.getByText("reader.readingProgression")).toBeInTheDocument()
    expect(screen.getByText("reader.pageLayout")).toBeInTheDocument()
  })

  it("should hide page direction when reading CBZ", () => {
    render(<FixedLayoutSettingsPanel showPageDirection={false} />)

    expect(screen.queryByText("reader.pageDirection")).not.toBeInTheDocument()
    expect(screen.getByText("reader.background")).toBeInTheDocument()
    expect(screen.getByText("reader.readingProgression")).toBeInTheDocument()
    expect(screen.getByText("reader.pageLayout")).toBeInTheDocument()
  })

  it("should update persisted fixed-layout state when an option is selected", () => {
    render(<FixedLayoutSettingsPanel showPageDirection />)

    fireEvent.click(screen.getByText("reader.backgroundOptions.black"))
    fireEvent.click(screen.getByText("reader.pageDirectionOptions.vertical"))
    fireEvent.click(screen.getByText("reader.readingProgressionOptions.rtl"))
    fireEvent.click(screen.getByText("reader.pageLayoutOptions.single"))

    expect(useAppUiStore.getState().fixedLayout).toMatchObject({
      background: "black",
      navigationMode: "vertical",
      direction: "rtl",
      spreadMode: "single",
    })
  })
})
