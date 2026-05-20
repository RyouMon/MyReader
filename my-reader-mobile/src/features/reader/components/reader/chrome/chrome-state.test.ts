import { ChromeState, chromeReducer, type ChromeAction } from "./chrome-state";

describe("chromeReducer", () => {
  function reduceFrom(initial: ChromeState, ...actions: ChromeAction[]) {
    return actions.reduce(chromeReducer, initial);
  }

  describe("When content is tapped", () => {
    it("Should show chrome when tapping content in reading state", () => {
      expect(chromeReducer(ChromeState.Reading, { type: "contentTap" })).toBe(ChromeState.Chrome);
    });

    it("Should hide chrome when tapping content in chrome state", () => {
      expect(chromeReducer(ChromeState.Chrome, { type: "contentTap" })).toBe(ChromeState.Reading);
    });

    it("Should return to reading when tapping content in expanded state", () => {
      expect(chromeReducer(ChromeState.Expanded, { type: "contentTap" })).toBe(ChromeState.Reading);
    });

    it("Should return to chrome when tapping content in toc sheet state", () => {
      expect(chromeReducer(ChromeState.TocSheet, { type: "contentTap" })).toBe(ChromeState.Chrome);
    });

    it("Should return to chrome when tapping content in settings sheet state", () => {
      expect(chromeReducer(ChromeState.SettingsSheet, { type: "contentTap" })).toBe(ChromeState.Chrome);
    });
  });

  describe("When more button is tapped", () => {
    it("Should expand actions when tapping more button in chrome state", () => {
      expect(chromeReducer(ChromeState.Chrome, { type: "moreButtonTap" })).toBe(ChromeState.Expanded);
    });

    it("Should ignore more button tap in non-chrome states", () => {
      expect(chromeReducer(ChromeState.Reading, { type: "moreButtonTap" })).toBe(ChromeState.Reading);
      expect(chromeReducer(ChromeState.Expanded, { type: "moreButtonTap" })).toBe(ChromeState.Expanded);
      expect(chromeReducer(ChromeState.TocSheet, { type: "moreButtonTap" })).toBe(ChromeState.TocSheet);
      expect(chromeReducer(ChromeState.SettingsSheet, { type: "moreButtonTap" })).toBe(ChromeState.SettingsSheet);
    });
  });

  describe("When toc pill is tapped", () => {
    it("Should open toc sheet when tapping toc pill in expanded state", () => {
      expect(chromeReducer(ChromeState.Expanded, { type: "tocPillTap" })).toBe(ChromeState.TocSheet);
    });

    it("Should ignore toc pill tap in non-expanded states", () => {
      expect(chromeReducer(ChromeState.Reading, { type: "tocPillTap" })).toBe(ChromeState.Reading);
      expect(chromeReducer(ChromeState.Chrome, { type: "tocPillTap" })).toBe(ChromeState.Chrome);
    });
  });

  describe("When settings pill is tapped", () => {
    it("Should open settings sheet when tapping settings pill in expanded state", () => {
      expect(chromeReducer(ChromeState.Expanded, { type: "settingsPillTap" })).toBe(ChromeState.SettingsSheet);
    });

    it("Should ignore settings pill tap in non-expanded states", () => {
      expect(chromeReducer(ChromeState.Reading, { type: "settingsPillTap" })).toBe(ChromeState.Reading);
      expect(chromeReducer(ChromeState.Chrome, { type: "settingsPillTap" })).toBe(ChromeState.Chrome);
    });
  });

      describe("When a toc item is selected", () => {
    it("Should return to reading when selecting a toc item", () => {
      expect(chromeReducer(ChromeState.TocSheet, { type: "tocSelect" })).toBe(ChromeState.Reading);
      expect(chromeReducer(ChromeState.Chrome, { type: "tocSelect" })).toBe(ChromeState.Reading);
      expect(chromeReducer(ChromeState.Expanded, { type: "tocSelect" })).toBe(ChromeState.Reading);
    });

        it("Should stay in reading when dismissing toc after selecting", () => {
      const result = reduceFrom(ChromeState.TocSheet, { type: "tocSelect" }, { type: "tocDismiss" });
      expect(result).toBe(ChromeState.Reading);
    });
  });

  describe("When toc sheet is dismissed", () => {
    it("Should return to chrome when dismissing toc sheet", () => {
      expect(chromeReducer(ChromeState.TocSheet, { type: "tocDismiss" })).toBe(ChromeState.Chrome);
    });

        it("Should ignore dismiss when not in toc sheet state", () => {
      expect(chromeReducer(ChromeState.Reading, { type: "tocDismiss" })).toBe(ChromeState.Reading);
      expect(chromeReducer(ChromeState.Chrome, { type: "tocDismiss" })).toBe(ChromeState.Chrome);
      expect(chromeReducer(ChromeState.Expanded, { type: "tocDismiss" })).toBe(ChromeState.Expanded);
      expect(chromeReducer(ChromeState.SettingsSheet, { type: "tocDismiss" })).toBe(ChromeState.SettingsSheet);
    });
  });

      describe("When settings sheet is dismissed", () => {
    it("Should return to chrome when dismissing settings sheet", () => {
      expect(chromeReducer(ChromeState.SettingsSheet, { type: "settingsDismiss" })).toBe(ChromeState.Chrome);
    });

        it("Should ignore dismiss when not in settings sheet state", () => {
      expect(chromeReducer(ChromeState.Reading, { type: "settingsDismiss" })).toBe(ChromeState.Reading);
      expect(chromeReducer(ChromeState.TocSheet, { type: "settingsDismiss" })).toBe(ChromeState.TocSheet);
    });
  });

  describe("Complete user flows", () => {
    it("Should return to reading after browsing toc and selecting a chapter", () => {
      const result = reduceFrom(
        ChromeState.Reading,
        { type: "contentTap" },
        { type: "moreButtonTap" },
        { type: "tocPillTap" },
        { type: "tocSelect" },
      );
      expect(result).toBe(ChromeState.Reading);
    });

    it("Should return to reading after opening and closing settings", () => {
      const result = reduceFrom(
        ChromeState.Reading,
        { type: "contentTap" },
        { type: "moreButtonTap" },
        { type: "settingsPillTap" },
        { type: "settingsDismiss" },
        { type: "contentTap" },
      );
      expect(result).toBe(ChromeState.Reading);
    });

        it("Should stay in reading when toc dismiss arrives after toc select", () => {
      const result = reduceFrom(
        ChromeState.Reading,
        { type: "contentTap" },
        { type: "moreButtonTap" },
        { type: "tocPillTap" },
        { type: "tocSelect" },
        { type: "tocDismiss" },
      );
      expect(result).toBe(ChromeState.Reading);
    });

    it("Should toggle chrome visibility on consecutive content taps", () => {
      const result = reduceFrom(ChromeState.Reading, { type: "contentTap" }, { type: "contentTap" });
      expect(result).toBe(ChromeState.Reading);
    });

    it("Should return to reading when tapping content while expanded", () => {
      const result = reduceFrom(
        ChromeState.Reading,
        { type: "contentTap" },
        { type: "moreButtonTap" },
        { type: "contentTap" },
      );
      expect(result).toBe(ChromeState.Reading);
    });
  });
});
