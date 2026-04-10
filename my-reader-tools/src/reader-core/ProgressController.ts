import type { ChapterInfo, ReaderProgress } from "../rendition/types"

function spineWeightsForChapters(chapters: ChapterInfo[]): number[] {
  const raw = chapters.map((chapter) => {
    const weight = chapter.contentWeight
    if (typeof weight === "number" && Number.isFinite(weight) && weight > 0) {
      return weight
    }
    return 0
  })
  const sum = raw.reduce((acc, weight) => acc + weight, 0)
  if (sum > 0) return raw
  return chapters.map(() => 1)
}

export class ProgressController {
  getProgress(params: {
    chapters: ChapterInfo[]
    currentChapter: number
    inChapterFraction: number
  }): ReaderProgress {
    const { chapters, currentChapter, inChapterFraction } = params
    const totalChapters = chapters.length
    if (totalChapters === 0) {
      return {
        chapterIndex: 0,
        chapterTitle: "",
        totalChapters: 0,
        fraction: 0,
      }
    }

    const clampedChapter = Math.min(
      Math.max(0, Math.floor(currentChapter)),
      totalChapters - 1,
    )
    const weights = spineWeightsForChapters(chapters)
    const totalWeight = weights.reduce((acc, weight) => acc + weight, 0)
    let weightBefore = 0
    for (let index = 0; index < clampedChapter; index += 1) {
      weightBefore += weights[index] ?? 0
    }
    const currentWeight = weights[clampedChapter] ?? 0
    const fraction =
      totalWeight > 0
        ? Math.min(
            1,
            Math.max(
              0,
              (weightBefore + currentWeight * inChapterFraction) / totalWeight,
            ),
          )
        : 0

    return {
      chapterIndex: clampedChapter,
      chapterTitle: chapters[clampedChapter]?.title ?? "",
      totalChapters,
      fraction,
    }
  }
}
