import { expect } from "@playwright/test"
import { createBdd, DataTable } from "playwright-bdd"
import { setupLibraryMocks } from "../fixtures/library-mock"
import { test } from "../fixtures/test"
import { LibraryPage } from "../pages/LibraryPage"
import { MainPage } from "../pages/MainPage"

const { Given, When, Then } = createBdd(test)
const ANCHOR_PERCENT_TOLERANCE = 8
const TOP_ROW_ANCHOR_BOOK_NUMBER = "topRowAnchorBookNumber"

Given("书库中已存在 {int} 本书", async ({ page }, count: number) => {
  await setupLibraryMocks(page, count)
})

Given("用户访问书库首页", async ({ page }) => {
  const libraryPage = new LibraryPage(page)
  await libraryPage.goto()
})

Given(
  "用户正在 {int} 像素宽的网格视图中从第 {int} 本书所在行开始浏览",
  async ({ page }, width: number, bookNumber: number) => {
    const libraryPage = new LibraryPage(page)
    await libraryPage.setViewport(width)
    await libraryPage.goto()
    await libraryPage.waitForBooksLoaded()
    await libraryPage.scrollBookRowToTop(bookNumber)
    const [topBookNumber] = await libraryPage.getTopVisibleBookNumbers()
    expect(topBookNumber).toEqual(expect.any(Number))
    ;(page as unknown as Record<string, unknown>)[TOP_ROW_ANCHOR_BOOK_NUMBER] =
      topBookNumber
  },
)

Given(
  "用户正在 {int} 像素宽的网格视图中浏览书库",
  async ({ page }, width: number) => {
    const libraryPage = new LibraryPage(page)
    await libraryPage.setViewport(width)
    await libraryPage.goto()
    await libraryPage.waitForBooksLoaded()
  },
)

Given(
  "用户已在网格视图中打开第 {int} 本书的详情页",
  async ({ page }, bookNumber: number) => {
    const libraryPage = new LibraryPage(page)
    await libraryPage.setViewport(1280)
    await libraryPage.goto()
    await libraryPage.waitForBooksLoaded()
    await libraryPage.scrollBookCenterToPercent(bookNumber, 50)
    await libraryPage.openBookDetail(bookNumber)
  },
)

Given(
  "第 {int} 本书中心位于可见区域高度的 {int}% 处",
  async ({ page }, bookNumber: number, anchorPercent: number) => {
    const libraryPage = new LibraryPage(page)
    await libraryPage.scrollBookCenterToPercent(bookNumber, anchorPercent)
  },
)

Given(
  "第 {int} 本书中心位于书库列表可见区域高度的 {int}% 处",
  async ({ page }, bookNumber: number, anchorPercent: number) => {
    const libraryPage = new LibraryPage(page)
    await libraryPage.scrollBookCenterToPercent(bookNumber, anchorPercent)
  },
)

When("窗口宽度调整为 {int} 像素", async ({ page }, width: number) => {
  const libraryPage = new LibraryPage(page)
  await libraryPage.setViewport(width)
  // Allow ResizeObserver to settle and virtual list to recalculate
  await page.waitForTimeout(300)
  await libraryPage.waitForBooksLoaded()
})

When("窗口宽度依次调整为:", async ({ page }, dataTable: DataTable) => {
  const libraryPage = new LibraryPage(page)
  const rows = dataTable.hashes() as Array<{ width: string }>
  for (const row of rows) {
    await libraryPage.setViewport(Number(row.width))
    await libraryPage.waitForBooksLoaded()
  }
})

When("用户打开第 {int} 本书的详情页", async ({ page }, bookNumber: number) => {
  const libraryPage = new LibraryPage(page)
  await libraryPage.openBookDetail(bookNumber)
})

When("用户关闭书籍详情页", async ({ page }) => {
  const libraryPage = new LibraryPage(page)
  await libraryPage.closeBookDetail()
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
  await expect(
    page.locator('main, [class*="sidebar-inset"], [data-slot="sidebar-inset"]'),
  ).toBeVisible()
})

Then("页面顶部第一行应包含调整前位于顶部第一行的第一本书", async ({ page }) => {
  const libraryPage = new LibraryPage(page)
  const bookNumber = (page as unknown as Record<string, unknown>)[
    TOP_ROW_ANCHOR_BOOK_NUMBER
  ] as number | undefined
  expect(bookNumber).toEqual(expect.any(Number))
  await expect
    .poll(() => libraryPage.isBookInTopVisibleRow(bookNumber!), {
      message: `Expected book ${bookNumber} to stay in the top visible grid row`,
    })
    .toBe(true)
})

Then(
  "第 {int} 本书中心仍应接近书库列表可见区域高度的 {int}% 处",
  async ({ page }, bookNumber: number, anchorPercent: number) => {
    const libraryPage = new LibraryPage(page)
    await expect
      .poll(
        async () => {
          const actualPercent =
            await libraryPage.getBookCenterPercent(bookNumber)
          return Math.abs(actualPercent - anchorPercent)
        },
        {
          message: `Expected book ${bookNumber} center to stay near ${anchorPercent}%`,
        },
      )
      .toBeLessThanOrEqual(ANCHOR_PERCENT_TOLERANCE)
  },
)

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
        overlaps.push(
          `Card ${i} (${a.x},${a.y},${a.width}x${a.height}) overlaps with Card ${j} (${b.x},${b.y},${b.width}x${b.height})`,
        )
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

async function getRowSpacing(
  page: import("@playwright/test").Page,
): Promise<number> {
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
  expect(
    secondRowBox,
    "At least two rows of books should be visible",
  ).toBeDefined()
  const gap = secondRowBox!.y - firstRowBottom
  return Math.round(gap)
}

When("记录第一行与第二行书籍之间的垂直间距", async ({ page }) => {
  const spacing = await getRowSpacing(page)
  ;(page as unknown as Record<string, unknown>).recordedSpacing = spacing
})

Then("第一行与第二行书籍之间的垂直间距应与记录值相同", async ({ page }) => {
  const spacing = await getRowSpacing(page)
  const recorded = (page as unknown as Record<string, unknown>)
    .recordedSpacing as number | undefined
  expect(
    recorded,
    "No recorded spacing found. Ensure the '记录' step ran before this step.",
  ).toBeDefined()
  expect(
    Math.abs(spacing - recorded!),
    `Spacing changed from ${recorded} to ${spacing}`,
  ).toBeLessThanOrEqual(2)
})

Then(
  "第一行与第二行书籍之间的垂直间距应为 {int} 像素",
  async ({ page }, expected: number) => {
    const spacing = await getRowSpacing(page)
    expect(
      Math.abs(spacing - expected),
      `Expected spacing ${expected}, got ${spacing}`,
    ).toBeLessThanOrEqual(2)
  },
)

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
