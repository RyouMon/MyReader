/**
 * Reader chrome state machine:
 *   Reading        — Chapter/page labels + active bookmark affordance
 *   Chrome         — + Close button (top-right) + More button (bottom-right)
 *   Expanded       — + navigation/settings pills and bookmark button
 *   NavigationSheet — TOC/bookmarks bottom sheet open
 *   SettingsSheet  — Settings bottom sheet open
 */
export enum ChromeState {
  Reading = 1,
  Chrome = 2,
  Expanded = 3,
  NavigationSheet = 4,
  SettingsSheet = 5,
}

export type ChromeAction =
  | { type: "contentTap" }
  | { type: "moreButtonTap" }
  | { type: "navigationPillTap" }
  | { type: "settingsPillTap" }
  | { type: "closeButtonTap" }
  | { type: "navigationSelect" }
  | { type: "navigationDismiss" }
  | { type: "settingsDismiss" }

export function chromeReducer(
  state: ChromeState,
  action: ChromeAction,
): ChromeState {
  switch (action.type) {
    case "contentTap":
      if (
        state === ChromeState.NavigationSheet ||
        state === ChromeState.SettingsSheet
      )
        return ChromeState.Chrome
      if (state === ChromeState.Reading) return ChromeState.Chrome
      return ChromeState.Reading

    case "moreButtonTap":
      if (
        state === ChromeState.Chrome ||
        state === ChromeState.NavigationSheet ||
        state === ChromeState.SettingsSheet
      )
        return ChromeState.Expanded
      return state

    case "navigationPillTap":
      if (state === ChromeState.Expanded) return ChromeState.NavigationSheet
      return state

    case "settingsPillTap":
      if (state === ChromeState.Expanded) return ChromeState.SettingsSheet
      return state

    case "closeButtonTap":
      return state

    case "navigationSelect":
      return ChromeState.Reading

    case "navigationDismiss":
      if (state === ChromeState.NavigationSheet) return ChromeState.Chrome
      return state

    case "settingsDismiss":
      if (state === ChromeState.SettingsSheet) return ChromeState.Chrome
      return state
  }
}
