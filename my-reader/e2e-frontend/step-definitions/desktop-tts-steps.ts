import { expect } from "@playwright/test"
import { createBdd } from "playwright-bdd"
import { test } from "../fixtures/reader-tts"
import type { DesktopTtsReaderPage } from "../pages/DesktopTtsReaderPage"

const { Given, When, Then } = createBdd(test)

const firstSpeech = "TTS verification"
const selectedSpeech =
  "Long-press this second sentence and choose Read from here."
const boundaryPrefix = "Previous-page prefix remains behind"
const boundaryTail = "Visible fragment completes the first sentence."
const chapters: Record<string, { title: string; visible: string }> = {
  "TTS verification": {
    title: "TTS verification",
    visible: "TTS verification",
  },
  "Playback lifecycle": {
    title: "Playback lifecycle",
    visible: "Playback lifecycle",
  },
  "Playback position first page": {
    title: "Playback position authority",
    visible: "Playback position first page",
  },
  "Sentence boundary visible page": {
    title: "Sentence boundary visible page",
    visible: boundaryTail,
  },
}

async function browseChapter(reader: DesktopTtsReaderPage, chapter: string) {
  const destination = chapters[chapter]
  if (!destination) throw new Error(`Unknown fixture chapter: ${chapter}`)
  await reader.goToChapter(destination.title, destination.visible)
}

async function startSpeech(reader: DesktopTtsReaderPage, text: string) {
  if (chapters[text] && text !== firstSpeech) await browseChapter(reader, text)
  await reader.openControls()
  await reader.play()
  await reader.waitForSpeechText(chapters[text] ? text : firstSpeech)
  if (!chapters[text]) {
    await reader.nextSentence()
    await reader.waitForSpeechText(text)
  }
}

async function assertSentenceActions(reader: DesktopTtsReaderPage) {
  await expect(reader.controls()).toHaveAttribute(
    "data-viewport-relation",
    "attached",
  )
  await expect(reader.leftAction()).toHaveAttribute("aria-label", "上一句")
  await expect(reader.rightAction()).toHaveAttribute("aria-label", "下一句")
}

async function assertViewportActions(
  reader: DesktopTtsReaderPage,
  relation: "before" | "after",
) {
  await expect(reader.controls()).toHaveAttribute(
    "data-viewport-relation",
    relation,
  )
  await expect(reader.leftAction()).toHaveAttribute(
    "aria-label",
    relation === "after" ? "返回播放位置" : "从当前位置播放",
  )
  await expect(reader.rightAction()).toHaveAttribute(
    "aria-label",
    relation === "after" ? "从当前位置播放" : "返回播放位置",
  )
}

Given("小文已打开支持跨页句子的测试书籍", async ({ ttsReader }) => {
  await ttsReader.goto()
})

Given("小文已展开听书控制", async ({ ttsReader }) => {
  await ttsReader.openControls()
})

Given(
  "小文正在朗读 {string}",
  async ({ ttsReader, ttsContext }, text: string) => {
    await startSpeech(ttsReader, text)
    ttsContext.initialText = await ttsReader.currentSpeechText()
    ttsContext.initialCount = (await ttsReader.spokenTexts()).length
  },
)

Given(
  "小文已暂停朗读 {string}",
  async ({ ttsReader, ttsContext }, text: string) => {
    await startSpeech(ttsReader, text)
    ttsContext.initialText = await ttsReader.currentSpeechText()
    ttsContext.initialCount = (await ttsReader.spokenTexts()).length
    await ttsReader.pause()
  },
)

Given(
  "小文正在朗读 {string}，但正在查看 {string}",
  async ({ ttsReader, ttsContext }, text: string, chapter: string) => {
    await startSpeech(ttsReader, text)
    ttsContext.initialText = await ttsReader.currentSpeechText()
    ttsContext.initialCount = (await ttsReader.spokenTexts()).length
    await browseChapter(ttsReader, chapter)
  },
)

Given(
  "小文已暂停朗读 {string}，但正在查看 {string}",
  async ({ ttsReader, ttsContext }, text: string, chapter: string) => {
    await startSpeech(ttsReader, text)
    ttsContext.initialText = await ttsReader.currentSpeechText()
    ttsContext.initialCount = (await ttsReader.spokenTexts()).length
    await ttsReader.pause()
    await browseChapter(ttsReader, chapter)
  },
)

Given("小文已从 {string} 重启朗读", async ({ ttsReader }, chapter: string) => {
  await startSpeech(ttsReader, firstSpeech)
  await browseChapter(ttsReader, chapter)
  await ttsReader.playFromCurrentPosition()
  await ttsReader.waitForSpeechText(chapter)
})

Given(
  "小文已停止朗读，并正在查看 {string}",
  async ({ ttsReader }, chapter: string) => {
    await startSpeech(ttsReader, firstSpeech)
    await ttsReader.stop()
    await browseChapter(ttsReader, chapter)
  },
)

Given("小文已选择正文中的第二句话", async ({ ttsReader }) => {
  await ttsReader.selectReaderText(selectedSpeech)
})

Given("小文正在朗读跨页句子", async ({ ttsReader }) => {
  await ttsReader.goToChapter("Sentence boundary start", boundaryPrefix)
  await ttsReader.openControls()
  await ttsReader.play()
  await ttsReader.waitForSpeechText(boundaryPrefix)
})

Given("语音服务会在新语句开始前错误地报告结束", async ({ ttsReader }) => {
  await ttsReader.endNextBeforeStart()
})

When("小文展开听书控制", async ({ ttsReader }) => {
  await ttsReader.openControls()
})

When("小文开始朗读", async ({ ttsReader }) => {
  await ttsReader.play()
})

When("小文暂停朗读", async ({ ttsReader }) => {
  await ttsReader.pause()
})

When("小文继续朗读", async ({ ttsReader }) => {
  await ttsReader.play()
})

When("小文播放下一句", async ({ ttsReader }) => {
  await ttsReader.nextSentence()
})

When("小文播放上一句", async ({ ttsReader }) => {
  await ttsReader.previousSentence()
})

When("小文停止朗读", async ({ ttsReader }) => {
  await ttsReader.stop()
})

When("小文点击正文中的第二句话", async ({ ttsReader }) => {
  await ttsReader.clickReaderText(selectedSpeech)
})

When("小文选择正文中的第二句话", async ({ ttsReader }) => {
  await ttsReader.selectReaderText(selectedSpeech)
})

When("小文选择从此处朗读", async ({ ttsReader }) => {
  await ttsReader.readSelectionAloud()
})

When("小文浏览到 {string}", async ({ ttsReader }, chapter: string) => {
  await browseChapter(ttsReader, chapter)
})

When("小文向后翻一页", async ({ ttsReader }) => {
  await ttsReader.nextPage()
})

When("小文返回朗读位置", async ({ ttsReader }) => {
  await ttsReader.returnToPlaybackPosition()
})

When("小文从当前页朗读", async ({ ttsReader }) => {
  await ttsReader.playFromCurrentPosition()
})

When("小文重新打开听书并开始朗读", async ({ ttsReader }) => {
  await ttsReader.openControls()
  await ttsReader.play()
})

When("当前语句朗读结束", async ({ ttsReader }) => {
  await ttsReader.finishCurrentSentence()
})

When(
  "小文浏览到 {string} 时当前语句恰好结束",
  async ({ ttsReader, ttsContext }, chapter: string) => {
    ttsContext.concurrentNavigation =
      await ttsReader.finishCurrentSentenceWhileBeginningChapterNavigation(
        chapters[chapter].title,
      )
  },
)

When("当前章节朗读完毕", async ({ ttsReader }) => {
  await ttsReader.finishChapter("Playback position first page")
})

When("小文浏览到该句的下一页片段", async ({ ttsReader }) => {
  await ttsReader.nextPage()
})

When("语音服务报告播放失败", async ({ ttsReader }) => {
  await ttsReader.failCurrentSentence()
})

Then("朗读未开始且可以手动播放", async ({ ttsReader }) => {
  expect(await ttsReader.spokenTexts()).toEqual([])
  await expect(ttsReader.startButton()).toBeVisible()
})

Then("正在朗读 {string}", async ({ ttsReader }, text: string) => {
  await expect.poll(() => ttsReader.currentSpeechText()).toBe(text)
  await expect
    .poll(() => ttsReader.speechState())
    .toEqual({ paused: false, speaking: true })
  await expect(ttsReader.pauseButton()).toBeVisible()
})

Then("正在朗读以 {string} 开头的语句", async ({ ttsReader }, text: string) => {
  await expect
    .poll(async () =>
      (await ttsReader.currentSpeechText())?.startsWith(`${text} `),
    )
    .toBe(true)
  await expect
    .poll(() => ttsReader.speechState())
    .toEqual({ paused: false, speaking: true })
  await expect(ttsReader.pauseButton()).toBeVisible()
})

Then("朗读暂停且保留当前语句", async ({ ttsReader, ttsContext }) => {
  await expect
    .poll(() => ttsReader.speechState())
    .toEqual({ paused: true, speaking: true })
  expect(await ttsReader.currentSpeechText()).toBe(ttsContext.initialText)
  await expect(ttsReader.startButton()).toBeVisible()
})

Then("朗读恢复且语句未重新播放", async ({ ttsReader, ttsContext }) => {
  await expect
    .poll(() => ttsReader.speechState())
    .toEqual({ paused: false, speaking: true })
  expect(await ttsReader.currentSpeechText()).toBe(ttsContext.initialText)
  expect(await ttsReader.spokenTexts()).toHaveLength(ttsContext.initialCount)
})

Then("朗读已停止且听书控制收起", async ({ ttsReader }) => {
  await expect
    .poll(() => ttsReader.speechState())
    .toEqual({ paused: false, speaking: false })
  await expect(ttsReader.controls()).toHaveAttribute("data-active", "false")
  await expect(ttsReader.openButton()).toBeVisible()
})

Then("朗读继续原来的语句", async ({ ttsReader, ttsContext }) => {
  expect(await ttsReader.currentSpeechText()).toBe(ttsContext.initialText)
  expect(await ttsReader.spokenTexts()).toHaveLength(ttsContext.initialCount)
  expect(await ttsReader.speechState()).toEqual({
    paused: false,
    speaking: true,
  })
})

Then("正文保持选中且朗读未开始", async ({ ttsReader }) => {
  await expect.poll(() => ttsReader.selectedReaderText()).toBe(selectedSpeech)
  expect(await ttsReader.spokenTexts()).toEqual([])
})

Then("左侧可以返回朗读位置，右侧可以从当前页朗读", async ({ ttsReader }) => {
  await assertViewportActions(ttsReader, "after")
})

Then("阅读画布保持在窗口内", async ({ page }) => {
  await expect
    .poll(async () => {
      const viewport = page.viewportSize()
      const canvas = await page.locator(".readium-epub-host").boundingBox()
      return Boolean(
        viewport &&
          canvas &&
          canvas.x >= 0 &&
          canvas.x + canvas.width <= viewport.width,
      )
    })
    .toBe(true)
})

Then("左侧可以从当前页朗读，右侧可以返回朗读位置", async ({ ttsReader }) => {
  await assertViewportActions(ttsReader, "before")
})

Then("当前页显示 {string}", async ({ ttsReader }, text: string) => {
  await expect.poll(() => ttsReader.visibleReaderText()).toContain(text)
  await expect.poll(() => ttsReader.visibleReaderFrameCount()).toBe(1)
})

Then(
  "朗读继续原来的语句且恢复上一句和下一句",
  async ({ ttsReader, ttsContext }) => {
    expect(await ttsReader.currentSpeechText()).toBe(ttsContext.initialText)
    expect(await ttsReader.spokenTexts()).toHaveLength(ttsContext.initialCount)
    await assertSentenceActions(ttsReader)
  },
)

Then(
  "朗读继续到下一句且仍可返回朗读位置",
  async ({ ttsReader, ttsContext }) => {
    expect(ttsContext.concurrentNavigation).toEqual({
      detachedBeforeCompletion: true,
      finished: true,
    })
    expect(await ttsReader.currentSpeechText()).not.toBe(ttsContext.initialText)
    expect(await ttsReader.speechState()).toEqual({
      paused: false,
      speaking: true,
    })
    await assertViewportActions(ttsReader, "after")
  },
)

Then("恢复上一句和下一句", async ({ ttsReader }) => {
  await assertSentenceActions(ttsReader)
})

Then("显示朗读失败提示且可以重新播放", async ({ ttsReader }) => {
  await expect(ttsReader.failureNotice()).toBeVisible()
  await expect(ttsReader.startButton()).toBeVisible()
  await expect
    .poll(() => ttsReader.speechState())
    .toEqual({ paused: false, speaking: false })
})
