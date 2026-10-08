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

const PILL_SHEETS = {
  navigationPillTap: ChromeState.NavigationSheet,
  annotationsPillTap: ChromeState.AnnotationsSheet,
  settingsPillTap: ChromeState.SettingsSheet,
  searchPillTap: ChromeState.SearchSheet,
} as const

const DISMISSED_SHEETS = {
  navigationDismiss: ChromeState.NavigationSheet,
  annotationsDismiss: ChromeState.AnnotationsSheet,
  settingsDismiss: ChromeState.SettingsSheet,
  searchDismiss: ChromeState.SearchSheet,
} as const

function isSheet(state: ChromeState) {
  return (
    state === ChromeState.NavigationSheet ||
    state === ChromeState.AnnotationsSheet ||
    state === ChromeState.SettingsSheet ||
    state === ChromeState.SearchSheet
  )
}

export function chromeReducer(
  state: ChromeState,
  action: ChromeAction,
): ChromeState {
  switch (action.type) {
    case "contentTap":
      return isSheet(state) || state === ChromeState.Reading
        ? ChromeState.Chrome
        : ChromeState.Reading
    case "moreButtonTap":
      return isSheet(state) || state === ChromeState.Chrome
        ? ChromeState.Expanded
        : state
    case "navigationPillTap":
    case "annotationsPillTap":
    case "settingsPillTap":
    case "searchPillTap":
      return state === ChromeState.Expanded ? PILL_SHEETS[action.type] : state
    case "navigationDismiss":
    case "annotationsDismiss":
    case "settingsDismiss":
    case "searchDismiss":
      return state === DISMISSED_SHEETS[action.type]
        ? ChromeState.Chrome
        : state
    case "navigationSelect":
    case "annotationSelect":
    case "searchSelect":
      return ChromeState.Reading
    case "closeButtonTap":
      return state
  }
}
