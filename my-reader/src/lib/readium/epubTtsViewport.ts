import {
  hrefRoughlyMatches,
  positionIndexForLocator,
  type ReaderLocator,
} from "@my-reader/tools/reader-toc"

export type EpubTtsViewportRelation = "before" | "after" | null

type EpubTtsViewportRelationInput = {
  viewportDetached: boolean
  viewportLocator?: ReaderLocator
  viewportOriginLocator?: ReaderLocator
  playbackLocator?: ReaderLocator
  positions: readonly ReaderLocator[]
}

function compareLocationNumbers(
  viewportValue: number | undefined,
  playbackValue: number | undefined,
): EpubTtsViewportRelation {
  if (
    viewportValue == null ||
    playbackValue == null ||
    !Number.isFinite(viewportValue) ||
    !Number.isFinite(playbackValue) ||
    viewportValue === playbackValue
  ) {
    return null
  }
  return viewportValue < playbackValue ? "before" : "after"
}

function compareLocators(
  viewportLocator: ReaderLocator,
  playbackLocator: ReaderLocator,
  positions: readonly ReaderLocator[],
): EpubTtsViewportRelation {
  const totalProgressionRelation = compareLocationNumbers(
    viewportLocator.locations?.totalProgression,
    playbackLocator.locations?.totalProgression,
  )
  if (totalProgressionRelation) return totalProgressionRelation

  const positionRelation = compareLocationNumbers(
    viewportLocator.locations?.position,
    playbackLocator.locations?.position,
  )
  if (positionRelation) return positionRelation

  if (hrefRoughlyMatches(viewportLocator.href, playbackLocator.href)) {
    const progressionRelation = compareLocationNumbers(
      viewportLocator.locations?.progression,
      playbackLocator.locations?.progression,
    )
    if (progressionRelation) return progressionRelation
  }

  return compareLocationNumbers(
    positionIndexForLocator(positions, viewportLocator),
    positionIndexForLocator(positions, playbackLocator),
  )
}

export function resolveEpubTtsViewportRelation({
  viewportDetached,
  viewportLocator,
  viewportOriginLocator,
  playbackLocator,
  positions,
}: EpubTtsViewportRelationInput): EpubTtsViewportRelation {
  if (!viewportDetached || !viewportLocator || !playbackLocator) return null

  const originRelation = viewportOriginLocator
    ? compareLocators(viewportLocator, viewportOriginLocator, positions)
    : null
  if (originRelation) return originRelation

  return compareLocators(viewportLocator, playbackLocator, positions)
}
