import type { Page } from "@playwright/test"

type TtsHarnessState = {
  currentText: () => string | null
  failCurrent: (error?: string) => boolean
  finishCurrent: () => boolean
  endNextBeforeStart: () => void
  spoken: string[]
  state: () => { paused: boolean; speaking: boolean }
}

function readVisibleText(expected?: string): string | boolean {
  const text: string[] = []
  for (const frame of document.querySelectorAll<HTMLIFrameElement>("iframe")) {
    const style = getComputedStyle(frame)
    if (style.visibility === "hidden" || style.opacity === "0") continue
    const doc = frame.contentDocument
    const wnd = frame.contentWindow
    if (!doc?.body || !wnd) continue
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.textContent ?? ""
      const range = doc.createRange()
      for (let offset = 0; offset < value.length; offset += 1) {
        range.setStart(node, offset)
        range.setEnd(node, offset + 1)
        if (
          [...range.getClientRects()].some(
            (rect) =>
              rect.width > 0 &&
              rect.height > 0 &&
              rect.right > 0 &&
              rect.bottom > 0 &&
              rect.left < wnd.innerWidth &&
              rect.top < wnd.innerHeight,
          )
        )
          text.push(value[offset])
      }
      text.push(" ")
    }
  }
  const visible = text.join("").replace(/\s+/g, " ").trim()
  return expected === undefined ? visible : visible.includes(expected)
}

export class DesktopTtsReaderPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/read/1?format=EPUB")
    await this.controls().waitFor({ state: "attached", timeout: 10_000 })
    await this.waitForVisibleText("TTS verification")
  }

  controls() {
    return this.page.getByTestId("reader-tts-controls")
  }

  startButton() {
    return this.page.getByRole("button", { name: "开始朗读" })
  }
  pauseButton() {
    return this.page.getByRole("button", { name: "暂停朗读" })
  }
  openButton() {
    return this.page.getByRole("button", { name: "打开听书播放器" })
  }
  failureNotice() {
    return this.page.getByText("朗读失败", { exact: true })
  }
  leftAction() {
    return this.page.getByTestId("reader-tts-left-action")
  }
  rightAction() {
    return this.page.getByTestId("reader-tts-right-action")
  }

  async revealBottomChrome() {
    const viewport = this.page.viewportSize()
    if (!viewport) throw new Error("Reader viewport is unavailable")
    await this.page.mouse.move(viewport.width - 24, viewport.height - 8)
    await this.page.waitForFunction(
      () =>
        document
          .querySelector("[data-testid='reader-tts-controls']")
          ?.getAttribute("data-visible") === "true",
    )
  }

  async openControls() {
    await this.revealBottomChrome()
    await this.page.getByRole("button", { name: "打开听书播放器" }).click()
  }

  async play() {
    await this.revealBottomChrome()
    await this.startButton().click()
  }

  async pause() {
    await this.revealBottomChrome()
    await this.pauseButton().click()
  }

  async stop() {
    await this.revealBottomChrome()
    await this.page.getByRole("button", { name: "停止朗读" }).click()
  }

  async clickReaderText(text: string) {
    const point = await this.readerTextPoint(text)
    await this.page.mouse.click(point.x, point.y)
  }

  async selectReaderText(text: string) {
    const points = await this.readerTextSelectionPoints(text)
    await this.page.mouse.move(points.start.x, points.start.y)
    await this.page.mouse.down()
    await this.page.mouse.move(points.end.x, points.end.y, { steps: 12 })
    await this.page.mouse.up()
  }

  async selectedReaderText(): Promise<string> {
    return this.visibleReaderIframe().evaluate((iframe) => {
      const frame = iframe as HTMLIFrameElement
      return frame.contentWindow?.getSelection()?.toString() ?? ""
    })
  }

  async nextSentence() {
    await this.revealBottomChrome()
    await this.page.getByRole("button", { name: "下一句" }).click()
  }

  async previousSentence() {
    await this.revealBottomChrome()
    await this.page.getByRole("button", { name: "上一句" }).click()
  }

  async nextPage() {
    const viewport = this.page.viewportSize()
    if (!viewport) throw new Error("Reader viewport is unavailable")
    await this.page.mouse.move(viewport.width - 2, viewport.height / 2)
    const nextPage = this.page.getByTitle("下一页", { exact: true })
    await nextPage.click()
  }

  async goToChapter(title: string, expectedText = title) {
    await this.beginChapterNavigation(title)
    await this.waitForVisibleText(expectedText)
  }

  async beginChapterNavigation(title: string) {
    const viewport = this.page.viewportSize()
    if (!viewport) throw new Error("Reader viewport is unavailable")
    await this.page.mouse.move(viewport.width / 2, 8)
    await this.page.getByTitle("目录", { exact: true }).click()
    await this.page
      .locator(".reader-chrome-toc-item")
      .filter({ hasText: title })
      .click()
  }

  async finishCurrentSentenceWhileBeginningChapterNavigation(title: string) {
    const viewport = this.page.viewportSize()
    if (!viewport) throw new Error("Reader viewport is unavailable")
    await this.page.mouse.move(viewport.width / 2, 8)
    await this.page.getByTitle("目录", { exact: true }).click()
    const before = (await this.spokenTexts()).length
    const result = await this.page.evaluate(async (targetTitle) => {
      const target = [
        ...document.querySelectorAll<HTMLButtonElement>(
          ".reader-chrome-toc-item",
        ),
      ].find((button) => button.textContent?.includes(targetTitle))
      if (!target) return { detachedBeforeCompletion: false, finished: false }
      target.click()
      await Promise.resolve()
      const detachedBeforeCompletion =
        document
          .querySelector("[data-testid='reader-tts-controls']")
          ?.getAttribute("data-viewport-detached") === "true"
      const finished = (
        window as unknown as { __MYREADER_TTS_E2E__: TtsHarnessState }
      ).__MYREADER_TTS_E2E__.finishCurrent()
      return { detachedBeforeCompletion, finished }
    }, title)
    await this.waitForSpeechCount(before + 1)
    return result
  }

  async returnToPlaybackPosition() {
    await this.revealBottomChrome()
    await this.page.getByRole("button", { name: "返回播放位置" }).click()
  }

  async playFromCurrentPosition() {
    await this.revealBottomChrome()
    await this.page.getByRole("button", { name: "从当前位置播放" }).click()
  }

  async currentSpeechText(): Promise<string | null> {
    return this.page.evaluate(() =>
      (
        window as unknown as { __MYREADER_TTS_E2E__: TtsHarnessState }
      ).__MYREADER_TTS_E2E__.currentText(),
    )
  }

  async spokenTexts(): Promise<string[]> {
    return this.page.evaluate(() => [
      ...(window as unknown as { __MYREADER_TTS_E2E__: TtsHarnessState })
        .__MYREADER_TTS_E2E__.spoken,
    ])
  }

  async speechState(): Promise<{ paused: boolean; speaking: boolean }> {
    return this.page.evaluate(() =>
      (
        window as unknown as { __MYREADER_TTS_E2E__: TtsHarnessState }
      ).__MYREADER_TTS_E2E__.state(),
    )
  }

  async finishCurrentSentence() {
    const before = (await this.spokenTexts()).length
    const finished = await this.page.evaluate(() =>
      (
        window as unknown as { __MYREADER_TTS_E2E__: TtsHarnessState }
      ).__MYREADER_TTS_E2E__.finishCurrent(),
    )
    if (!finished) throw new Error("No active narration to finish")
    await this.waitForSpeechCount(before + 1)
  }

  async failCurrentSentence(error = "synthesis-unavailable") {
    const failed = await this.page.evaluate(
      (nextError) =>
        (
          window as unknown as { __MYREADER_TTS_E2E__: TtsHarnessState }
        ).__MYREADER_TTS_E2E__.failCurrent(nextError),
      error,
    )
    if (!failed) throw new Error("No active narration to fail")
  }

  async visibleReaderText(): Promise<string> {
    return this.page.evaluate(readVisibleText) as Promise<string>
  }

  async visibleReaderFrameCount(): Promise<number> {
    return this.page.locator("iframe").evaluateAll(
      (iframes) =>
        iframes.filter((iframe) => {
          const style = getComputedStyle(iframe)
          return style.visibility !== "hidden" && style.opacity !== "0"
        }).length,
    )
  }

  async waitForVisibleText(text: string) {
    await this.page.waitForFunction(readVisibleText, text)
    await this.visibleReaderIframe().evaluate(async (iframe) => {
      const frame = iframe as HTMLIFrameElement
      const wnd = frame.contentWindow
      const doc = frame.contentDocument
      if (!wnd || !doc) throw new Error("Reader document is unavailable")
      await doc.fonts.ready
      let previous = ""
      let stableFrames = 0
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise<void>((resolve) =>
          wnd.requestAnimationFrame(() => resolve()),
        )
        const metrics = JSON.stringify([
          wnd.innerWidth,
          wnd.innerHeight,
          wnd.scrollX,
          wnd.scrollY,
          doc.documentElement.scrollWidth,
          doc.documentElement.scrollHeight,
          wnd.getComputedStyle(doc.body).width,
        ])
        stableFrames = metrics === previous ? stableFrames + 1 : 0
        if (stableFrames >= 3) return
        previous = metrics
      }
      throw new Error("Reader pagination did not settle")
    })
  }

  async waitForSpeechText(text: string) {
    await this.page.waitForFunction(
      (expected) =>
        (
          window as unknown as { __MYREADER_TTS_E2E__: TtsHarnessState }
        ).__MYREADER_TTS_E2E__
          .currentText()
          ?.includes(expected),
      text,
    )
  }

  async waitForSpeechCount(count: number) {
    await this.page.waitForFunction(
      (minimum) =>
        (window as unknown as { __MYREADER_TTS_E2E__: TtsHarnessState })
          .__MYREADER_TTS_E2E__.spoken.length >= minimum,
      count,
    )
  }

  async finishChapter(nextChapter: string) {
    for (let index = 0; index < 8; index += 1) {
      if ((await this.currentSpeechText())?.includes(nextChapter)) return
      await this.finishCurrentSentence()
    }
    throw new Error(`Narration did not reach ${nextChapter}`)
  }

  async endNextBeforeStart() {
    await this.page.evaluate(() =>
      (
        window as unknown as { __MYREADER_TTS_E2E__: TtsHarnessState }
      ).__MYREADER_TTS_E2E__.endNextBeforeStart(),
    )
  }

  async readSelectionAloud() {
    await this.page.getByRole("button", { name: "从此处朗读" }).click()
  }

  private visibleReaderIframe() {
    return this.page.locator("iframe:visible").first()
  }

  private async readerTextSelectionPoints(text: string) {
    const points = await this.visibleReaderIframe().evaluate(
      (iframe, targetText) => {
        const frame = iframe as HTMLIFrameElement
        const wnd = frame.contentWindow
        const document = frame.contentDocument
        if (!wnd || !document) return null

        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        )
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const value = node.textContent ?? ""
          const start = value.indexOf(targetText)
          if (start < 0) continue

          const startRange = document.createRange()
          startRange.setStart(node, start)
          startRange.setEnd(node, start + 1)
          const endRange = document.createRange()
          endRange.setStart(node, start + targetText.length - 1)
          endRange.setEnd(node, start + targetText.length)
          const startRect = startRange.getClientRects()[0]
          const endRect = endRange.getClientRects()[0]
          if (!startRect || !endRect) return null
          const frameRect = frame.getBoundingClientRect()
          const scaleX = frameRect.width / wnd.innerWidth
          const scaleY = frameRect.height / wnd.innerHeight
          return {
            start: {
              x: frameRect.left + (startRect.left + 1) * scaleX,
              y:
                frameRect.top + (startRect.top + startRect.height / 2) * scaleY,
            },
            end: {
              x: frameRect.left + (endRect.right - 1) * scaleX,
              y: frameRect.top + (endRect.top + endRect.height / 2) * scaleY,
            },
          }
        }
        return null
      },
      text,
    )
    if (!points) throw new Error(`Reader text is unavailable: ${text}`)
    return points
  }

  private async readerTextPoint(text: string) {
    const point = await this.visibleReaderIframe().evaluate(
      (iframe, targetText) => {
        const frame = iframe as HTMLIFrameElement
        const wnd = frame.contentWindow
        const document = frame.contentDocument
        if (!wnd || !document) return null

        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        )
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const value = node.textContent ?? ""
          const start = value.indexOf(targetText)
          if (start < 0) continue

          const range = document.createRange()
          range.setStart(node, start)
          range.setEnd(node, start + 1)
          const textRect = range.getClientRects()[0]
          if (!textRect) return null
          const frameRect = frame.getBoundingClientRect()
          return {
            x:
              frameRect.left +
              (textRect.left + Math.min(2, textRect.width / 2)) *
                (frameRect.width / wnd.innerWidth),
            y:
              frameRect.top +
              (textRect.top + textRect.height / 2) *
                (frameRect.height / wnd.innerHeight),
          }
        }
        return null
      },
      text,
    )
    if (!point) throw new Error(`Reader text is unavailable: ${text}`)
    return point
  }
}
