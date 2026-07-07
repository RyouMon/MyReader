import type {
  Preferences,
  Locator,
  ReadiumFile,
  FontFamilyDeclaration,
  DecorationGroup,
  SelectionAction,
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
}

/** Public props contract — kept identical to the fork for drop-in migration. */
export type ReadiumProps = {
  file: ReadiumFile
  preferences: Preferences
  fontFamilyDeclarations?: FontFamilyDeclaration[]
  decorations?: DecorationGroup[]
  selectionActions?: SelectionAction[]
  style?: any
  onLocationChange?: (locator: Locator) => void
  onPublicationReady?: (event: PublicationReadyEvent) => void
  onDecorationActivated?: (event: DecorationActivatedEvent) => void
  onSelectionChange?: (event: SelectionEvent) => void
  onSelectionAction?: (event: SelectionActionEvent) => void
  onTap?: (event: TapEvent) => void
}
