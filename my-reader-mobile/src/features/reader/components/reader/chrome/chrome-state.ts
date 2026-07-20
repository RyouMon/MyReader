/**
 * Reader chrome state machine:
 *   Reading        — Chapter/page labels + active bookmark affordance
 *   Chrome         — + Close button (top-right) + More button (bottom-right)
 *   Expanded       — + navigation/settings pills and bookmark button
 *   NavigationSheet — Table of contents bottom sheet open
 *   AnnotationsSheet — Bookmarks and annotations bottom sheet open
 *   SettingsSheet  — Settings bottom sheet open
 *   SearchSheet    — In-book search bottom sheet open
 */
export enum ChromeState {
  Reading = 1,
  Chrome = 2,
  Expanded = 3,
  NavigationSheet = 4,
  AnnotationsSheet = 5,
  SettingsSheet = 6,
  SearchSheet = 7,
}

export type ChromeAction =
  | { type: "contentTap" }
  | { type: "moreButtonTap" }
  | { type: "navigationPillTap" }
  | { type: "annotationsPillTap" }
  | { type: "settingsPillTap" }
  | { type: "searchPillTap" }
  | { type: "closeButtonTap" }
  | { type: "navigationSelect" }
  | { type: "navigationDismiss" }
  | { type: "annotationSelect" }
  | { type: "annotationsDismiss" }
  | { type: "settingsDismiss" }
  | { type: "searchSelect" }
  | { type: "searchDismiss" }

export function chromeReducer(
  state: ChromeState,
  action: ChromeAction,
): ChromeState {
  switch (action.type) {
    case "contentTap":
      if (
        state === ChromeState.NavigationSheet ||
        state === ChromeState.AnnotationsSheet ||
        state === ChromeState.SettingsSheet ||
        state === ChromeState.SearchSheet
      )
        return ChromeState.Chrome
      if (state === ChromeState.Reading) return ChromeState.Chrome
      return ChromeState.Reading

    case "moreButtonTap":
      if (
        state === ChromeState.Chrome ||
        state === ChromeState.NavigationSheet ||
        state === ChromeState.AnnotationsSheet ||
        state === ChromeState.SettingsSheet ||
        state === ChromeState.SearchSheet
      )
        return ChromeState.Expanded
      return state

    case "navigationPillTap":
      if (state === ChromeState.Expanded) return ChromeState.NavigationSheet
      return state

    case "annotationsPillTap":
      if (state === ChromeState.Expanded) return ChromeState.AnnotationsSheet
      return state

    case "settingsPillTap":
      if (state === ChromeState.Expanded) return ChromeState.SettingsSheet
      return state

    case "searchPillTap":
      if (state === ChromeState.Expanded) return ChromeState.SearchSheet
      return state

    case "closeButtonTap":
      return state

    case "navigationSelect":
      return ChromeState.Reading

    case "navigationDismiss":
      if (state === ChromeState.NavigationSheet) return ChromeState.Chrome
      return state

    case "annotationSelect":
      return ChromeState.Reading

    case "annotationsDismiss":
      if (state === ChromeState.AnnotationsSheet) return ChromeState.Chrome
      return state

    case "settingsDismiss":
      if (state === ChromeState.SettingsSheet) return ChromeState.Chrome
      return state

    case "searchSelect":
      return ChromeState.Reading

    case "searchDismiss":
      if (state === ChromeState.SearchSheet) return ChromeState.Chrome
      return state
  }
}
