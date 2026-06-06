import type { LibraryScreenVariant, LibraryScreenVariantInput } from "../types/library-header";

/** Derives which library index screen body/header chrome variant is active. */
export function resolveLibraryScreenVariant(input: LibraryScreenVariantInput): LibraryScreenVariant {
  const { storeReady, effectiveLibraryId, hasSelectedLibrary, librariesCount } = input;

  if (!storeReady && typeof effectiveLibraryId === "string" && !hasSelectedLibrary) {
    return "loading";
  }

  if (typeof effectiveLibraryId === "string" && !hasSelectedLibrary && !storeReady && librariesCount > 0) {
    return "invalid";
  }

  if (librariesCount === 0) {
    return "empty";
  }

  if (!hasSelectedLibrary) {
    return "unselected";
  }

  return "loaded";
}
