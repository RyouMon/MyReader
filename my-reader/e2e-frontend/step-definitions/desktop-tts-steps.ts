import { expect, type Page } from "@playwright/test"
import { createBdd } from "playwright-bdd"
import { setupDesktopTtsMocks } from "../fixtures/desktop-tts-mock"
import { setupLibraryMocks } from "../fixtures/library-mock"
import { test } from "../fixtures/test"
import { DesktopTtsReaderPage } from "../pages/DesktopTtsReaderPage"

const { Given, When, Then } = createBdd(test)

const firstResource = "TTS verification"
const lifecycleResource = "Playback lifecycle"
const playbackPositionResource = "Playback position first page"
const selectedSpeech =
  "Long-press this second sentence and choose Read from here."
const initialSpeech = new WeakMap<Page, string>()

Given("用户已打开桌面端 TTS 测试书籍", async ({ page }) => {
  await setupLibraryMocks(page, 1)
  await setupDesktopTtsMocks(page)
  await new DesktopTtsReaderPage(page).goto()
})

When("用户展开听书控制", async ({ page }) => {
  await new DesktopTtsReaderPage(page).openControls()
})

Then("听书不会自动开始", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  expect(await reader.spokenTexts()).toEqual([])
  await expect(page.getByRole("button", { name: "开始朗读" })).toBeVisible()
})

When("用户开始朗读", async ({ page }) => {
  await new DesktopTtsReaderPage(page).play()
})

Then("当前页第一段文字开始朗读", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  await expect.poll(() => reader.currentSpeechText()).toContain(firstResource)
  initialSpeech.set(page, (await reader.currentSpeechText()) ?? "")
})

When("用户暂停再继续朗读", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  const text = await reader.currentSpeechText()
  const count = (await reader.spokenTexts()).length
  await reader.pause()
  expect(await reader.speechState()).toEqual({ paused: true, speaking: true })
  await reader.play()
  expect(await reader.speechState()).toEqual({ paused: false, speaking: true })
  expect(await reader.currentSpeechText()).toBe(text)
  expect(await reader.spokenTexts()).toHaveLength(count)
})

Then("朗读恢复且不会重新选择句子", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  expect((await reader.speechState()).speaking).toBe(true)
  await reader.expectVisibleReaderText(firstResource)
})

When("用户切换到下一句再返回上一句", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  const first = await reader.currentSpeechText()
  await reader.nextSentence()
  await expect.poll(() => reader.currentSpeechText()).not.toBe(first)
  await reader.previousSentence()
  await expect.poll(() => reader.currentSpeechText()).toBe(first)
})

Then("朗读位置按句子切换且页面保持可见", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  await reader.expectVisibleReaderText(firstResource)
  expect(await reader.currentSpeechText()).toBeTruthy()
})

When("用户停止朗读", async ({ page }) => {
  await new DesktopTtsReaderPage(page).stop()
})

Then("朗读停止并收起控制", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  expect(await reader.speechState()).toEqual({ paused: false, speaking: false })
  await expect(reader.controls()).toHaveAttribute("data-active", "false")
})

When("用户普通点击正文中的第二句话", async ({ page }) => {
  await new DesktopTtsReaderPage(page).clickReaderText(selectedSpeech)
})

Then("普通点击不会开始朗读", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  expect(await reader.spokenTexts()).toEqual([])
  await expect(page.getByRole("button", { name: "开始朗读" })).toBeVisible()
})

When("用户选择正文中的第二句话", async ({ page }) => {
  await new DesktopTtsReaderPage(page).selectReaderText(selectedSpeech)
})

Then("正文保持选中且朗读仍未开始", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  await expect.poll(() => reader.selectedReaderText()).toBe(selectedSpeech)
  expect(await reader.spokenTexts()).toEqual([])
})

Given("用户正在朗读第一页", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  await reader.openControls()
  await reader.play()
  await expect.poll(() => reader.currentSpeechText()).toContain(firstResource)
  initialSpeech.set(page, (await reader.currentSpeechText()) ?? "")
})

When("用户通过目录翻到播放生命周期章节", async ({ page }) => {
  await new DesktopTtsReaderPage(page).goToChapter(lifecycleResource)
})

Then("朗读继续并显示位置操作", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  expect((await reader.speechState()).speaking).toBe(true)
  expect(await reader.currentSpeechText()).toBe(initialSpeech.get(page))
  await expect(reader.detachedActions()).toBeVisible()
})

When("用户在分离状态切换上一句和下一句", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  await reader.nextSentence()
  await expect
    .poll(() => reader.currentSpeechText())
    .not.toBe(initialSpeech.get(page))
  await reader.previousSentence()
  await expect
    .poll(() => reader.currentSpeechText())
    .toBe(initialSpeech.get(page))
})

Then("视觉页面仍停留在播放生命周期章节", async ({ page }) => {
  await new DesktopTtsReaderPage(page).expectVisibleReaderText(
    lifecycleResource,
  )
})

When("用户返回播放位置", async ({ page }) => {
  await new DesktopTtsReaderPage(page).returnToPlaybackPosition()
})

Then("阅读器回到当前朗读位置并隐藏位置操作", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  await reader.expectVisibleReaderText(firstResource)
  await expect(reader.detachedActions()).not.toBeAttached()
  expect(await reader.currentSpeechText()).toBe(initialSpeech.get(page))
})

When("用户再次翻到播放生命周期章节并从当前位置播放", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  await reader.goToChapter(lifecycleResource)
  await expect(reader.detachedActions()).toBeVisible()
  await reader.playFromCurrentPosition()
})

Then("朗读改从当前章节开始且页面不回跳", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  await expect
    .poll(() => reader.currentSpeechText())
    .toContain(lifecycleResource)
  await reader.expectVisibleReaderText(lifecycleResource)
  await expect(reader.detachedActions()).not.toBeAttached()
})

Given("用户从播放生命周期章节开始朗读", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  await reader.goToChapter(lifecycleResource)
  await reader.openControls()
  await reader.play()
  await expect
    .poll(() => reader.currentSpeechText())
    .toContain(lifecycleResource)
})

When("当前章节的语句依次播放完毕", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  for (let index = 0; index < 8; index += 1) {
    if (
      (await reader.currentSpeechText())?.includes(playbackPositionResource)
    ) {
      return
    }
    await reader.finishCurrentSentence()
  }
  throw new Error("Narration did not advance to the next EPUB resource")
})

Then("阅读器自动进入播放位置章节且只有一个页面可见", async ({ page }) => {
  await new DesktopTtsReaderPage(page).expectVisibleReaderText(
    playbackPositionResource,
  )
})

When("用户翻到播放生命周期章节时当前语句恰好结束", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  await reader.finishCurrentSentenceWhileBeginningChapterNavigation(
    lifecycleResource,
  )
})

Then("阅读器留在播放生命周期章节且朗读继续", async ({ page }) => {
  const reader = new DesktopTtsReaderPage(page)
  await reader.expectVisibleReaderText(lifecycleResource)
  expect((await reader.speechState()).speaking).toBe(true)
  await expect(reader.detachedActions()).toBeVisible()
})

When("系统语音引擎报告错误", async ({ page }) => {
  await new DesktopTtsReaderPage(page).failCurrentSentence()
})

Then("阅读器显示朗读失败提示并退出播放状态", async ({ page }) => {
  await expect(page.getByText("朗读失败", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "开始朗读" })).toBeVisible()
})
