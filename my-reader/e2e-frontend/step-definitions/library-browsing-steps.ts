import { expect } from "@playwright/test"
import { createBdd } from "playwright-bdd"
import { setupLibraryMocks } from "../fixtures/library-mock"
import { test } from "../fixtures/test"
import { LibraryPage } from "../pages/LibraryPage"
import { MainPage } from "../pages/MainPage"

const { Given, When, Then } = createBdd(test)

Given("书库中已存在 {int} 本书", async ({ page }, count: number) => {
  await setupLibraryMocks(page, count)
})

Given("用户访问书库首页", async ({ page }) => {
  const libraryPage = new LibraryPage(page)
  await libraryPage.goto()
})

When("窗口宽度调整为 {int} 像素", async ({ page }, width: number) => {
  const libraryPage = new LibraryPage(page)
  await libraryPage.setViewport(width)
  // Allow ResizeObserver to settle and virtual list to recalculate
  await page.waitForTimeout(300)
  await libraryPage.waitForBooksLoaded()
})

When("用户向下滚动书库列表", async ({ page }) => {
  const libraryPage = new LibraryPage(page)
  await libraryPage.scrollDown(800)
  await page.waitForTimeout(200)
  await libraryPage.waitForBooksLoaded()
})

Then("页面应该显示应用标题 {string}", async ({ page }, text: string) => {
  const mainPage = new MainPage(page)
  await expect(mainPage.getBranding()).toBeVisible()
  await expect(mainPage.getBranding()).toContainText(text)
})

Then("页面应该显示主内容区域", async ({ page }) => {
  await expect(page.locator('main, [class*="sidebar-inset"], [data-slot="sidebar-inset"]')).toBeVisible()
})

Then("网格中每本书的封面和标题都完整可见", async ({ page }) => {
  const libraryPage = new LibraryPage(page)
  const cards = await libraryPage.getVisibleBookCards()
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i)
    await expect(card).toBeVisible()
    const box = await card.boundingBox()
    expect(box).not.toBeNull()
    // Card must have positive area
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  }
})

Then("没有任何书籍被其他书籍遮挡", async ({ page }) => {
  const libraryPage = new LibraryPage(page)
  const cards = await libraryPage.getVisibleBookCards()
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)

  const boxes: { x: number; y: number; width: number; height: number }[] = []
  for (let i = 0; i < count; i++) {
    const box = await cards.nth(i).boundingBox()
    expect(box).not.toBeNull()
    boxes.push(box!)
  }

  const overlaps: string[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const overlapX = a.x < b.x + b.width && a.x + a.width > b.x
      const overlapY = a.y < b.y + b.height && a.y + a.height > b.y
      if (overlapX && overlapY) {
        overlaps.push(`Card ${i} (${a.x},${a.y},${a.width}x${a.height}) overlaps with Card ${j} (${b.x},${b.y},${b.width}x${b.height})`)
      }
    }
  }

  expect(overlaps, overlaps.join("\n")).toHaveLength(0)
})

Then("可见区域内的每本书都完整显示", async ({ page }) => {
  const libraryPage = new LibraryPage(page)
  const cards = await libraryPage.getVisibleBookCards()
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i)
    await expect(card).toBeVisible()
  }
})

async function getRowSpacing(page: import("@playwright/test").Page): Promise<number> {
  const libraryPage = new LibraryPage(page)
  const cards = await libraryPage.getVisibleBookCards()
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)

  const boxes: { x: number; y: number; width: number; height: number }[] = []
  for (let i = 0; i < count; i++) {
    const box = await cards.nth(i).boundingBox()
    expect(box).not.toBeNull()
    boxes.push(box!)
  }

  // Sort by y coordinate to group rows
  boxes.sort((a, b) => a.y - b.y)
  const firstRowY = boxes[0].y
  const firstRowBottom = boxes[0].y + boxes[0].height
  const secondRowBox = boxes.find((b) => b.y > firstRowY + 5)
  expect(secondRowBox, "At least two rows of books should be visible").toBeDefined()
  const gap = secondRowBox!.y - firstRowBottom
  return Math.round(gap)
}

When("记录第一行与第二行书籍之间的垂直间距", async ({ page }) => {
  const spacing = await getRowSpacing(page)
  ;(page as unknown as Record<string, unknown>).recordedSpacing = spacing
})

Then("第一行与第二行书籍之间的垂直间距应与记录值相同", async ({ page }) => {
  const spacing = await getRowSpacing(page)
  const recorded = (page as unknown as Record<string, unknown>).recordedSpacing as number | undefined
  expect(recorded, "No recorded spacing found. Ensure the '记录' step ran before this step.").toBeDefined()
  expect(
    Math.abs(spacing - recorded!),
    `Spacing changed from ${recorded} to ${spacing}`,
  ).toBeLessThanOrEqual(2)
})

Then("第一行与第二行书籍之间的垂直间距应为 {int} 像素", async ({ page }, expected: number) => {
  const spacing = await getRowSpacing(page)
  expect(
    Math.abs(spacing - expected),
    `Expected spacing ${expected}, got ${spacing}`,
  ).toBeLessThanOrEqual(2)
})

Given("视图模式为网格", async () => {
  // Grid mode is the default; the IPC mock already returns "grid".
})

Then("每个可见书籍卡片的宽高比应为 2:3", async ({ page }) => {
  const libraryPage = new LibraryPage(page)
  const cards = await libraryPage.getVisibleBookCards()
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i)
    const cover = card.locator("> div:first-child")
    await expect(cover).toBeVisible()
    const box = await cover.boundingBox()
    expect(box).not.toBeNull()
    const ratio = box!.width / box!.height
    expect(
      Math.abs(ratio - 2 / 3),
      `Card ${i} ratio ${ratio} deviates from 2/3 at ${box!.width}x${box!.height}`,
    ).toBeLessThan(0.05)
  }
})
