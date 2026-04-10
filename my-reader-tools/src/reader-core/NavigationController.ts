import type { ReaderNavigationState } from "./types"

const DEFAULT_NAVIGATION_STATE: ReaderNavigationState = {
  currentChapter: 0,
  currentPageInChapter: 0,
  totalPagesInChapter: 1,
  chapterStartFromEnd: false,
}

export class NavigationController {
  private state: ReaderNavigationState = { ...DEFAULT_NAVIGATION_STATE }

  getSnapshot(): ReaderNavigationState {
    return { ...this.state }
  }

  reset(): void {
    this.state = { ...DEFAULT_NAVIGATION_STATE }
  }

  gotoChapter(index: number, totalChapters: number): boolean {
    if (index < 0 || index >= totalChapters) return false
    this.state = {
      currentChapter: index,
      currentPageInChapter: 0,
      totalPagesInChapter: 1,
      chapterStartFromEnd: false,
    }
    return true
  }

  gotoChapterWithResume(
    index: number,
    totalChapters: number,
    columnPageOffset = 0,
  ): boolean {
    if (index < 0 || index >= totalChapters) return false
    this.state = {
      currentChapter: index,
      currentPageInChapter: Math.max(0, Math.floor(columnPageOffset)),
      totalPagesInChapter: 1,
      chapterStartFromEnd: false,
    }
    return true
  }

  gotoChapterFromEnd(index: number, totalChapters: number): boolean {
    if (index < 0 || index >= totalChapters) return false
    this.state = {
      currentChapter: index,
      currentPageInChapter: 0,
      totalPagesInChapter: 1,
      chapterStartFromEnd: true,
    }
    return true
  }

  gotoPageInChapter(totalPages: number, pageOffset: number): void {
    const clampedTotal = Math.max(1, Math.floor(totalPages))
    const clampedOffset = Math.max(
      0,
      Math.min(Math.floor(pageOffset), clampedTotal - 1),
    )
    this.state = {
      ...this.state,
      totalPagesInChapter: clampedTotal,
      currentPageInChapter: clampedOffset,
    }
  }

  nextChapter(totalChapters: number): boolean {
    return this.gotoChapter(this.state.currentChapter + 1, totalChapters)
  }

  prevChapter(totalChapters: number): boolean {
    return this.gotoChapter(this.state.currentChapter - 1, totalChapters)
  }

  setCurrentChapter(index: number): void {
    this.state = { ...this.state, currentChapter: Math.max(0, Math.floor(index)) }
  }

  setCurrentPageInChapter(offset: number): void {
    this.state = {
      ...this.state,
      currentPageInChapter: Math.max(0, Math.floor(offset)),
    }
  }

  setTotalPagesInChapter(totalPages: number): void {
    this.state = {
      ...this.state,
      totalPagesInChapter: Math.max(1, Math.floor(totalPages)),
    }
  }

  setChapterStartFromEnd(value: boolean): void {
    this.state = { ...this.state, chapterStartFromEnd: value }
  }
}
