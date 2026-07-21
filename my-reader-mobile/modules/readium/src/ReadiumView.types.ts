import type {
  Preferences,
  Locator,
  ReadiumFile,
  FontFamilyDeclaration,
  DecorationGroup,
  SelectionAction,
  SelectionMenuConfig,
  PublicationReadyEvent,
  DecorationActivatedEvent,
  SelectionEvent,
  SelectionActionEvent,
  TapEvent,
} from "./types"

/** Imperative ref contract — kept identical to the fork for drop-in migration. */
export type ReadiumViewRef = {
  goTo: (locator: Locator) => void
  goForward: () => void
  goBackward: () => void
  clearSelection: () => void
  getBookmarkLocator: () => Promise<Locator | null>
  isBookmarkVisible: (locator: Locator) => Promise<boolean>
}

/** Public props contract — kept identical to the fork for drop-in migration. */
export type ReadiumProps = {
  file: ReadiumFile
  preferences: Preferences
  fontFamilyDeclarations?: FontFamilyDeclaration[]
  decorations?: DecorationGroup[]
  selectionActions?: SelectionAction[]
  selectionMenu?: SelectionMenuConfig
  customSelectionMenu?: boolean
  style?: any
  onLocationChange?: (locator: Locator) => void
  onPublicationReady?: (event: PublicationReadyEvent) => void
  onDecorationActivated?: (event: DecorationActivatedEvent) => void
  onSelectionChange?: (event: SelectionEvent) => void
  onSelectionAction?: (event: SelectionActionEvent) => void
  onTap?: (event: TapEvent) => void
}
