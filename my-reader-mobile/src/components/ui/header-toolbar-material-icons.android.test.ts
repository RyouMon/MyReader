import CloseIcon from "@expo/material-symbols/close.xml"

import { resolveToolbarMaterialIcon } from "./header-toolbar-material-icons.android"

describe("resolveToolbarMaterialIcon", () => {
  it("should map the iOS close symbol to the Android close icon", () => {
    expect(resolveToolbarMaterialIcon("xmark")).toBe(CloseIcon)
  })
})
