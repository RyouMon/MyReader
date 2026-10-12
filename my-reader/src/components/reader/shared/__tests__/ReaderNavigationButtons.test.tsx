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
      locations: { progression: 0.8, position: 8 },
    })
    const onNavigate = vi.fn()
    const view = render(
      <ReaderNavigationButtons
        history={history}
        chromeVisible={false}
        getLocationLabel={(locator) => String(locator.locations?.position)}
        onNavigate={onNavigate}
      />,
    )
    act(() =>
      history.receiveRemote("remote", {
        href: "chapter.xhtml",
        type: "application/xhtml+xml",
        locations: { progression: 0.2, position: 2 },
      }),
    )
    expect(
      screen.getByRole("button", {
        name: "reader.navigationForward, 2",
      }),
    ).toBeVisible()
    expect(screen.getByText("2")).toBeVisible()
    expect(screen.queryByText("8")).toBeNull()
    expect(
      screen.queryByRole("button", { name: /reader.navigationBack/ }),
    ).toBeNull()
    act(() => history.dismissRemoteHint())
    expect(
      screen.queryByRole("button", { name: /reader.navigationForward/ }),
    ).toBeNull()
    expect(screen.queryByText("2")).toBeNull()
    view.rerender(
      <ReaderNavigationButtons
        history={history}
        chromeVisible
        getLocationLabel={(locator) => String(locator.locations?.position)}
        onNavigate={onNavigate}
      />,
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "reader.navigationForward, 2",
      }),
    )
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ locations: { progression: 0.2, position: 2 } }),
    )
    expect(
      screen.getByRole("button", { name: "reader.navigationBack, 8" }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: /reader.navigationForward/ }),
    ).toBeNull()
  })
})
