import type { LibraryHeaderChromeMode, LibraryScreenVariant } from "../types/library-header";

/** Maps a library screen variant to its header chrome strategy. */
export function resolveLibraryHeaderChromeMode(variant: LibraryScreenVariant): LibraryHeaderChromeMode {
  switch (variant) {
    case "empty":
    case "unselected":
      return "toolbar-right";
    case "loaded":
      return "platform-menus";
    default:
      return "default";
  }
}
