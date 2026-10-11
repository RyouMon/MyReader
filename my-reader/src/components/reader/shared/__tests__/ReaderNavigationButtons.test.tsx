import { ReaderNavigationHistory } from "@my-reader/tools/reader-navigation-history"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReaderNavigationButtons } from "../ReaderNavigationButtons"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe("reader history buttons", () => {
  it("reacts immediately to a remote arrival and page turn while chrome remains hidden", () => {
    const history = new ReaderNavigationHistory()
    history.update({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0.8 },
    })
    const onNavigate = vi.fn()
    const view = render(
      <ReaderNavigationButtons
        history={history}
        chromeVisible={false}
        onNavigate={onNavigate}
      />,
    )
    act(() =>
      history.receiveRemote("remote", {
        href: "chapter.xhtml",
        type: "application/xhtml+xml",
        locations: { progression: 0.2 },
      }),
    )
    expect(
      screen.getByRole("button", { name: "reader.navigationForward" }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "reader.navigationBack" }),
    ).toBeNull()
    act(() => history.dismissRemoteHint())
    expect(
      screen.queryByRole("button", { name: "reader.navigationForward" }),
    ).toBeNull()
    view.rerender(
      <ReaderNavigationButtons
        history={history}
        chromeVisible
        onNavigate={onNavigate}
      />,
    )
    fireEvent.click(
      screen.getByRole("button", { name: "reader.navigationForward" }),
    )
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ locations: { progression: 0.2 } }),
    )
    expect(
      screen.getByRole("button", { name: "reader.navigationBack" }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "reader.navigationForward" }),
    ).toBeNull()
  })
})
