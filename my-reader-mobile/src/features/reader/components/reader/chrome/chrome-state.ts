/**
 * Reader chrome state machine:
 *   Reading        — Only chapter label + page label visible
 *   Chrome         — + Close button (top-right) + More button (bottom-right)
 *   Expanded       — + TOC pill + Settings pill (floating, bottom-right)
 *   TocSheet       — TOC bottom sheet open
 *   SettingsSheet  — Settings bottom sheet open
 */
export enum ChromeState {
  Reading = 1,
  Chrome = 2,
  Expanded = 3,
  TocSheet = 4,
  SettingsSheet = 5,
}

export type ChromeAction =
  | { type: "contentTap" }
  | { type: "moreButtonTap" }
  | { type: "tocPillTap" }
  | { type: "settingsPillTap" }
  | { type: "closeButtonTap" }
  | { type: "tocSelect" }
  | { type: "tocDismiss" }
  | { type: "settingsDismiss" };

export function chromeReducer(state: ChromeState, action: ChromeAction): ChromeState {
  switch (action.type) {
    case "contentTap":
      if (state === ChromeState.TocSheet || state === ChromeState.SettingsSheet) return ChromeState.Chrome;
      if (state === ChromeState.Reading) return ChromeState.Chrome;
      return ChromeState.Reading;

    case "moreButtonTap":
      if (state === ChromeState.Chrome) return ChromeState.Expanded;
      return state;

    case "tocPillTap":
      if (state === ChromeState.Expanded) return ChromeState.TocSheet;
      return state;

    case "settingsPillTap":
      if (state === ChromeState.Expanded) return ChromeState.SettingsSheet;
      return state;

    case "closeButtonTap":
      return state;

    case "tocSelect":
      return ChromeState.Reading;

    case "tocDismiss":
      if (state === ChromeState.TocSheet) return ChromeState.Chrome;
      return state;

    case "settingsDismiss":
      if (state === ChromeState.SettingsSheet) return ChromeState.Chrome;
      return state;
  }
}
