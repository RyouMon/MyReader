export {
  fragmentFromHref,
  findLocatorForLinkHref,
  hasFragment,
  hrefRoughlyMatches,
  locatorWithHrefFragments,
  positionIndexForLocator,
  resolveReaderToc,
  resolveReaderTocAtPosition,
  stripFragment,
} from "@my-reader/tools/reader-toc"

export type {
  ReaderTocResolution,
  ReaderTocResolutionReason,
  ResolveReaderTocAtPositionInput,
  ResolveReaderTocInput,
} from "@my-reader/tools/reader-toc"
