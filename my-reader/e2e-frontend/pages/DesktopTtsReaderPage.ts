import { expect, type Page } from "@playwright/test"

type TtsHarnessState = {
  currentText: () => string | null
  failCurrent: (error?: string) => boolean
  finishCurrent: () => boolean
  spoken: string[]
  state: () => { paused: boolean; speaking: boolean }
}

export class DesktopTtsReaderPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/read/1?format=EPUB")
    await expect(this.controls()).toBeAttached({ timeout: 10_000 })
    await this.expectVisibleReaderText("TTS verification")
  }

  controls() {
    return this.page.getByTestId("reader-tts-controls")
  }

  async revealBottomChrome() {
    const viewport = this.page.viewportSize()
    if (!viewport) throw new Error("Reader viewport is unavailable")
    await this.page.mouse.move(viewport.width - 24, viewport.height - 8)
    await expect(this.controls()).toHaveAttribute("data-visible", "true")
  }

  async openControls() {
    await this.revealBottomChrome()
    await this.page.getByRole("button", { name: "打开听书播放器" }).click()
  }

  async play() {
    await this.page.getByRole("button", { name: "开始朗读" }).click()
    await expect(
      this.page.getByRole("button", { name: "暂停朗读" }),
    ).toBeVisible()
  }

  async pause() {
    await this.page.getByRole("button", { name: "暂停朗读" }).click()
    await expect(
      this.page.getByRole("button", { name: "开始朗读" }),
    ).toBeVisible()
  }

  async stop() {
    await this.page.getByRole("button", { name: "停止朗读" }).click()
    await expect(
      this.page.getByRole("button", { name: "打开听书播放器" }),
    ).toBeVisible()
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
    await this.page.getByRole("button", { name: "下一句" }).click()
  }

  async previousSentence() {
    await this.page.getByRole("button", { name: "上一句" }).click()
  }

  async goToChapter(title: string) {
    await this.beginChapterNavigation(title)
    await this.expectVisibleReaderText(title)
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
    expect(result).toEqual({ detachedBeforeCompletion: true, finished: true })
    await expect
      .poll(async () => (await this.spokenTexts()).length)
      .toBeGreaterThan(before)
  }

  async returnToPlaybackPosition() {
    await this.page.getByRole("button", { name: "返回播放位置" }).click()
  }

  async playFromCurrentPosition() {
    await this.page.getByRole("button", { name: "从当前位置播放" }).click()
  }

  detachedActions() {
    return this.page.locator(".reader-tts-detached-actions")
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
    expect(finished).toBe(true)
    await expect
      .poll(async () => (await this.spokenTexts()).length)
      .toBeGreaterThan(before)
  }

  async failCurrentSentence(error = "synthesis-unavailable") {
    const failed = await this.page.evaluate(
      (nextError) =>
        (
          window as unknown as { __MYREADER_TTS_E2E__: TtsHarnessState }
        ).__MYREADER_TTS_E2E__.failCurrent(nextError),
      error,
    )
    expect(failed).toBe(true)
  }

  async visibleReaderText(): Promise<string> {
    return this.page.locator("iframe").evaluateAll((iframes) => {
      const visible = iframes.filter((iframe) => {
        const style = getComputedStyle(iframe)
        return style.visibility !== "hidden" && style.opacity !== "0"
      })
      return visible
        .map((iframe) => {
          try {
            return (iframe as HTMLIFrameElement).contentDocument?.body.innerText
          } catch {
            return ""
          }
        })
        .join("\n")
    })
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

  async expectVisibleReaderText(text: string) {
    await expect.poll(() => this.visibleReaderText()).toContain(text)
    await expect.poll(() => this.visibleReaderFrameCount()).toBe(1)
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
