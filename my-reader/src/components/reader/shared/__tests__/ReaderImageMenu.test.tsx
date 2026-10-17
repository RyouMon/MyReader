import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReaderImageMenu, ReaderShareMenu } from "../ReaderImageMenu"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe("reader image menus", () => {
  it.each([
    "copy",
    "save",
  ] as const)("dispatches %s for the selected image and closes the menu", async (action) => {
    const source = { url: "https://reader.test/3.jpg", position: 3 }
    const onAction = vi.fn()
    const onClose = vi.fn()
    render(
      <ReaderImageMenu
        target={{ source, x: 10, y: 20 }}
        onAction={onAction}
        onClose={onClose}
      />,
    )
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: action === "copy" ? "reader.copyImage" : "reader.saveImage",
      }),
    )
    expect(onAction).toHaveBeenCalledExactlyOnceWith(action, source)
    expect(onClose).toHaveBeenCalled()
  })

  it("exposes page sharing through the keyboard and prevents another action while busy", async () => {
    const onShare = vi.fn()
    const { rerender } = render(
      <ReaderShareMenu visible busy={false} onShare={onShare} />,
    )
    fireEvent.keyDown(
      screen.getByRole("button", { name: "reader.imageMore" }),
      { key: "ArrowDown" },
    )
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "reader.sharePage" }),
    )
    expect(onShare).toHaveBeenCalledOnce()
    rerender(<ReaderShareMenu visible busy onShare={onShare} />)
    expect(
      screen.getByRole("button", { name: "reader.imageMore" }),
    ).toBeDisabled()
  })
})
