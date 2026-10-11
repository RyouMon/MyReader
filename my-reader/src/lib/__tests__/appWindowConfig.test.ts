import { describe, expect, it } from "vitest"
import mainCapability from "../../../src-tauri/capabilities/default.json"
import config from "../../../src-tauri/tauri.conf.json"
import windowsConfig from "../../../src-tauri/tauri.windows.conf.json"

describe("main window chrome configuration", () => {
  it("keeps native macOS decorations with an overlaid, hidden title", () => {
    const main = config.app.windows[0]
    expect(main).toMatchObject({ titleBarStyle: "Overlay", hiddenTitle: true })
    expect((main as { decorations?: boolean }).decorations).not.toBe(false)
    expect(main.trafficLightPosition).toBeDefined()
  })

  it("removes Windows decorations while preserving the shared window constraints", () => {
    const main = config.app.windows[0]
    expect(windowsConfig.app.windows[0]).toMatchObject({
      title: main.title,
      width: main.width,
      height: main.height,
      minWidth: main.minWidth,
      minHeight: main.minHeight,
      decorations: false,
    })
  })

  it("authorizes dragging and every custom main-window control", () => {
    expect(mainCapability.windows).toContain("main")
    expect(mainCapability.permissions).toEqual(
      expect.arrayContaining([
        "core:window:allow-start-dragging",
        "core:window:allow-minimize",
        "core:window:allow-toggle-maximize",
        "core:window:allow-close",
      ]),
    )
  })
})
