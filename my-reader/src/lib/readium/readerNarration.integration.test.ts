import { expect, test } from "@playwright/test"
import type {
  BookNarrationSettingsDto,
  CharacterDraftRequestDto,
} from "../tauri-specta"

type NarrationTestWindow = Window & {
  mountReadingPlanFixture: () => Promise<void>
  mountNarrationFixture: (
    enabled?: boolean,
    characterCount?: number,
  ) => Promise<void>
  narrationSaves: BookNarrationSettingsDto[]
  narrationDrafts: CharacterDraftRequestDto[]
}

test("character pages navigate as a stack and reuse bookmark selection and deletion", async ({
  page,
}) => {
  await page.goto("/integration-frontend/readerNarration.html")
  await page.evaluate(() =>
    (window as unknown as NarrationTestWindow).mountNarrationFixture(),
  )
  await page
    .getByRole("button", { name: "Edit character", exact: true })
    .click()
  await page.getByRole("button", { name: "Add character", exact: true }).click()
  await page.getByRole("menuitem", { name: "From this book" }).click()
  await page
    .getByRole("checkbox", { name: "Characters", exact: true })
    .waitFor()
  await page
    .getByRole("button", { name: "Organize with AI", exact: true })
    .click()
  await expect(page.getByRole("checkbox", { name: /Lin/ })).toBeChecked()
  expect(
    await page.evaluate(
      () => (window as unknown as NarrationTestWindow).narrationSaves,
    ),
  ).toEqual([])
  const drafts = await page.evaluate(
    () => (window as unknown as NarrationTestWindow).narrationDrafts,
  )
  expect(drafts[0].input).toEqual({
    kind: "book",
    passages: [{ title: "Characters", text: "Lin: a traveller." }],
  })
  await page
    .getByRole("button", { name: "Import selected", exact: true })
    .click()
  await page.getByRole("button", { name: /^Lin/ }).click()
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Lin")
  await expect(page.getByRole("button", { name: /^Narrator/ })).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Add character", exact: true }),
  ).toHaveCount(0)
  await page.getByRole("button", { name: "Back", exact: true }).click()
  await expect(page.getByRole("button", { name: /^Narrator/ })).toBeVisible()
  await page.getByRole("button", { name: /^Lin/ }).click({ button: "right" })
  await page.getByRole("menuitem", { name: "Select", exact: true }).click()
  await expect(page.getByRole("button", { name: /^Lin/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(page.getByRole("button", { name: /^Narrator/ })).toBeDisabled()
  await page
    .getByRole("button", { name: "Delete selected characters", exact: true })
    .click()
  await expect(page.getByRole("button", { name: /^Lin/ })).toHaveCount(0)
  await page.getByRole("button", { name: "Back", exact: true }).click()
  await expect(page.getByRole("switch")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Edit character", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Add character", exact: true }),
  ).toHaveCount(0)
})

test("the enable confirmation is clickable without dismissing the reader panel", async ({
  page,
}) => {
  await page.goto("/integration-frontend/readerNarration.html")
  await page.evaluate(() =>
    (window as unknown as NarrationTestWindow).mountNarrationFixture(false),
  )
  await page.getByRole("switch").click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enable", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Edit character", exact: true }),
  ).toBeVisible()
})

test("the character footer stays visible while scrolling and exposes deletion only in selection mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 600 })
  await page.goto("/integration-frontend/readerNarration.html")
  await page.evaluate(() =>
    (window as unknown as NarrationTestWindow).mountNarrationFixture(true, 30),
  )
  await page
    .getByRole("button", { name: "Edit character", exact: true })
    .click()
  const add = page.getByRole("button", { name: "Add character", exact: true })
  const select = page.getByRole("button", { name: "Select", exact: true })
  const remove = page.getByRole("button", {
    name: "Delete selected characters",
    exact: true,
  })
  await expect(add).toBeInViewport()
  await expect(select).toBeInViewport()
  await expect(remove).toHaveCount(0)
  const position = await add.boundingBox()
  await select.click()
  await expect(add).toHaveCount(0)
  await expect(remove).toBeDisabled()
  await page.getByRole("button", { name: "Select all", exact: true }).click()
  await expect(
    page.locator('aside li button[aria-pressed="true"]'),
  ).toHaveCount(30)
  await expect(page.getByRole("button", { name: /^Narrator/ })).toBeDisabled()
  await page.getByRole("button", { name: "Deselect all", exact: true }).click()
  await expect(remove).toBeDisabled()
  const deletePosition = await remove.boundingBox()
  expect(deletePosition!.x + deletePosition!.width).toBe(
    position!.x + position!.width,
  )
  await page.getByRole("button", { name: /^Character 1 Default$/ }).click()
  await expect(remove).toBeEnabled()
  await page.locator("aside .myreader-overlay-viewport").evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(
    page.getByRole("button", { name: /^Character 30 Default$/ }),
  ).toBeInViewport()
  await expect(remove).toBeInViewport()
  expect(await remove.boundingBox()).toEqual(deletePosition)
  await page.getByRole("button", { name: "Deselect", exact: true }).click()
  await expect(remove).toHaveCount(0)
  await expect(add).toBeInViewport()
  expect(await add.boundingBox()).toEqual(position)
  await add.click()
  const manual = page.getByRole("menuitem", {
    name: "Add manually",
    exact: true,
  })
  await expect(manual).toBeInViewport()
  await manual.click()
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Back", exact: true }).click()
  await expect(select).toHaveAttribute("aria-pressed", "false")
  await expect(remove).toHaveCount(0)
  await expect(add).toBeInViewport()
})

test("reading plans virtualize long lists and open at the current source without trapping scrolling", async ({
  page,
}) => {
  await page.goto("/integration-frontend/readerNarration.html")
  await page.evaluate(async () => {
    await (window as unknown as NarrationTestWindow).mountReadingPlanFixture()
  })
  const current = page.getByRole("button", {
    name: "Passage 1500.",
    exact: false,
  })
  await expect(current).toBeVisible()
  await expect(current).toHaveAttribute("aria-current", "location")
  expect(await page.locator("li").count()).toBeLessThan(60)
  const viewport = page.locator(".myreader-overlay-viewport")
  await viewport.evaluate((element) => {
    element.scrollTop -= element.clientHeight
  })
  await expect(
    page.getByRole("button", { name: "Passage 1495.", exact: false }),
  ).toBeVisible()
  await viewport.evaluate((element) => {
    element.scrollTop = 0
  })
  const first = page.getByRole("button", { name: "Passage 0.", exact: false })
  await expect(first).toBeVisible()
  await first.click()
  expect(
    await page.evaluate(
      () => (window as unknown as { planOpened: string[] }).planOpened,
    ),
  ).toEqual(["plan-0"])
  expect(
    await page.evaluate(
      () => (window as unknown as { planJumped: string[] }).planJumped,
    ),
  ).toEqual([])
  await first.click({ button: "right" })
  await page.getByRole("menuitem", { name: "Go to", exact: true }).click()
  expect(
    await page.evaluate(
      () => (window as unknown as { planJumped: string[] }).planJumped,
    ),
  ).toEqual(["plan-0"])
  expect(
    await page.evaluate(
      () => (window as unknown as { planOpened: string[] }).planOpened,
    ),
  ).toEqual(["plan-0"])
})
