import { ChromeState, chromeReducer, type ChromeAction } from "./chrome-state"

describe("chromeReducer", () => {
  function reduceFrom(initial: ChromeState, ...actions: ChromeAction[]) {
    return actions.reduce(chromeReducer, initial)
  }

  describe("When content is tapped", () => {
    it("should show chrome when tapping content in reading state", () => {
      expect(chromeReducer(ChromeState.Reading, { type: "contentTap" })).toBe(
        ChromeState.Chrome,
      )
    })

    it("should hide chrome when tapping content in chrome state", () => {
      expect(chromeReducer(ChromeState.Chrome, { type: "contentTap" })).toBe(
        ChromeState.Reading,
      )
    })

    it("should return to reading when tapping content in expanded state", () => {
      expect(chromeReducer(ChromeState.Expanded, { type: "contentTap" })).toBe(
        ChromeState.Reading,
      )
    })

    it("should return to chrome when tapping content in navigation sheet state", () => {
      expect(
        chromeReducer(ChromeState.NavigationSheet, { type: "contentTap" }),
      ).toBe(ChromeState.Chrome)
    })

    it("should return to chrome when tapping content in settings sheet state", () => {
      expect(
        chromeReducer(ChromeState.SettingsSheet, { type: "contentTap" }),
      ).toBe(ChromeState.Chrome)
    })
  })

  describe("When more button is tapped", () => {
    it("should expand actions when tapping more button in chrome state", () => {
      expect(chromeReducer(ChromeState.Chrome, { type: "moreButtonTap" })).toBe(
        ChromeState.Expanded,
      )
    })

    it("should ignore more button tap in non-chrome states when running the scenario", () => {
      expect(
        chromeReducer(ChromeState.Reading, { type: "moreButtonTap" }),
      ).toBe(ChromeState.Reading)
      expect(
        chromeReducer(ChromeState.Expanded, { type: "moreButtonTap" }),
      ).toBe(ChromeState.Expanded)
      expect(
        chromeReducer(ChromeState.NavigationSheet, { type: "moreButtonTap" }),
      ).toBe(ChromeState.NavigationSheet)
      expect(
        chromeReducer(ChromeState.SettingsSheet, { type: "moreButtonTap" }),
      ).toBe(ChromeState.SettingsSheet)
    })
  })

  describe("When navigation pill is tapped", () => {
    it("should open navigation sheet when tapping navigation pill in expanded state", () => {
      expect(
        chromeReducer(ChromeState.Expanded, { type: "navigationPillTap" }),
      ).toBe(ChromeState.NavigationSheet)
    })

    it("should ignore navigation pill tap in non-expanded states when running the scenario", () => {
      expect(
        chromeReducer(ChromeState.Reading, { type: "navigationPillTap" }),
      ).toBe(ChromeState.Reading)
      expect(
        chromeReducer(ChromeState.Chrome, { type: "navigationPillTap" }),
      ).toBe(ChromeState.Chrome)
    })
  })

  describe("When settings pill is tapped", () => {
    it("should open settings sheet when tapping settings pill in expanded state", () => {
      expect(
        chromeReducer(ChromeState.Expanded, { type: "settingsPillTap" }),
      ).toBe(ChromeState.SettingsSheet)
    })

    it("should ignore settings pill tap in non-expanded states when running the scenario", () => {
      expect(
        chromeReducer(ChromeState.Reading, { type: "settingsPillTap" }),
      ).toBe(ChromeState.Reading)
      expect(
        chromeReducer(ChromeState.Chrome, { type: "settingsPillTap" }),
      ).toBe(ChromeState.Chrome)
    })
  })

  describe("When a navigation item is selected", () => {
    it("should return to reading when selecting a navigation item", () => {
      expect(
        chromeReducer(ChromeState.NavigationSheet, {
          type: "navigationSelect",
        }),
      ).toBe(ChromeState.Reading)
      expect(
        chromeReducer(ChromeState.Chrome, { type: "navigationSelect" }),
      ).toBe(ChromeState.Reading)
      expect(
        chromeReducer(ChromeState.Expanded, { type: "navigationSelect" }),
      ).toBe(ChromeState.Reading)
    })

    it("should stay in reading when dismissing navigation after selecting", () => {
      const result = reduceFrom(
        ChromeState.NavigationSheet,
        { type: "navigationSelect" },
        { type: "navigationDismiss" },
      )
      expect(result).toBe(ChromeState.Reading)
    })
  })

  describe("When navigation sheet is dismissed", () => {
    it("should return to chrome when dismissing navigation sheet", () => {
      expect(
        chromeReducer(ChromeState.NavigationSheet, {
          type: "navigationDismiss",
        }),
      ).toBe(ChromeState.Chrome)
    })

    it("should ignore dismiss when not in navigation sheet state", () => {
      expect(
        chromeReducer(ChromeState.Reading, { type: "navigationDismiss" }),
      ).toBe(ChromeState.Reading)
      expect(
        chromeReducer(ChromeState.Chrome, { type: "navigationDismiss" }),
      ).toBe(ChromeState.Chrome)
      expect(
        chromeReducer(ChromeState.Expanded, { type: "navigationDismiss" }),
      ).toBe(ChromeState.Expanded)
      expect(
        chromeReducer(ChromeState.SettingsSheet, {
          type: "navigationDismiss",
        }),
      ).toBe(ChromeState.SettingsSheet)
    })
  })

  describe("When settings sheet is dismissed", () => {
    it("should return to chrome when dismissing settings sheet", () => {
      expect(
        chromeReducer(ChromeState.SettingsSheet, { type: "settingsDismiss" }),
      ).toBe(ChromeState.Chrome)
    })

    it("should ignore dismiss when not in settings sheet state", () => {
      expect(
        chromeReducer(ChromeState.Reading, { type: "settingsDismiss" }),
      ).toBe(ChromeState.Reading)
      expect(
        chromeReducer(ChromeState.NavigationSheet, {
          type: "settingsDismiss",
        }),
      ).toBe(ChromeState.NavigationSheet)
    })
  })

  describe("Complete user flows", () => {
    it("should return to reading after browsing toc and selecting a chapter when running the scenario", () => {
      const result = reduceFrom(
        ChromeState.Reading,
        { type: "contentTap" },
        { type: "moreButtonTap" },
        { type: "navigationPillTap" },
        { type: "navigationSelect" },
      )
      expect(result).toBe(ChromeState.Reading)
    })

    it("should return to reading after opening and closing settings when running the scenario", () => {
      const result = reduceFrom(
        ChromeState.Reading,
        { type: "contentTap" },
        { type: "moreButtonTap" },
        { type: "settingsPillTap" },
        { type: "settingsDismiss" },
        { type: "contentTap" },
      )
      expect(result).toBe(ChromeState.Reading)
    })

    it("should stay in reading when navigation dismiss arrives after selection", () => {
      const result = reduceFrom(
        ChromeState.Reading,
        { type: "contentTap" },
        { type: "moreButtonTap" },
        { type: "navigationPillTap" },
        { type: "navigationSelect" },
        { type: "navigationDismiss" },
      )
      expect(result).toBe(ChromeState.Reading)
    })

    it("should toggle chrome visibility on consecutive content taps when running the scenario", () => {
      const result = reduceFrom(
        ChromeState.Reading,
        { type: "contentTap" },
        { type: "contentTap" },
      )
      expect(result).toBe(ChromeState.Reading)
    })

    it("should return to reading when tapping content while expanded", () => {
      const result = reduceFrom(
        ChromeState.Reading,
        { type: "contentTap" },
        { type: "moreButtonTap" },
        { type: "contentTap" },
      )
      expect(result).toBe(ChromeState.Reading)
    })
  })
})
