export type LibraryScreenVariant =
  | "loading"
  | "invalid"
  | "empty"
  | "unselected"
  | "loaded"

export type LibraryScreenVariantInput = {
  storeReady: boolean
  effectiveLibraryId?: string
  hasSelectedLibrary: boolean
  librariesCount: number
}

export type LibraryHeaderChromeMode =
  | "default"
  | "toolbar-right"
  | "platform-menus"
