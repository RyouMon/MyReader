import { test, expect } from "@playwright/test"
import { injectTauriInternals } from "../../../e2e-frontend/fixtures/tauri-browser-mock"
import { setupLibrariesMock } from "../../../e2e-frontend/fixtures/library-mock"

test("repairs a moved library and keeps long paths and diagnostics inside the dialog", async ({
  page,
}, testInfo) => {
  const library = {
    id: "location-test",
    name: "迁移测试书库",
    path: "/cache",
    sourceType: "webdav",
    dataSourceId: "dav",
    sourcePath: "/old",
    bookCount: 1,
  }
  await injectTauriInternals(page)
  await setupLibrariesMock(page, [library], library.id)
  await page.addInitScript((library) => {
    const handlers = (
      window as unknown as {
        __TAURI_IPC_HANDLERS__: Record<
          string,
          (args: Record<string, unknown>) => unknown
        >
      }
    ).__TAURI_IPC_HANDLERS__
    const longPath = `https://example.test/dav/base/${"very-long-folder-name".repeat(14)}/old`
    let current = {
      libraryId: library.id,
      libraryName: library.name,
      dataSourceId: "dav",
      dataSourceName: "WebDAV",
      sourceRoot: "/base",
      path: "/old",
      effectivePath: longPath,
      canRelocate: true,
      problem: "path_unavailable" as string | null,
      detail: `HTTP 404 ${longPath}` as string | null,
    }
    handlers.get_library_location = () => current
    handlers.webdav_list_folders = () => [{ name: "已移动书库", path: "/new" }]
    handlers.list_data_sources = () => []
    handlers.get_theme = () => "light"
    handlers.get_language = () => "zh-CN"
    handlers.get_tts_configs = () => ({ configs: [], defaultConfigId: null })
    handlers.get_app_version = () => "0.19.0"
    handlers.relocate_library = (args) => {
      if (args.id !== library.id || args.path !== "/new")
        throw new Error("Wrong repair target")
      current = {
        ...current,
        path: "/new",
        effectivePath: "https://example.test/dav/base/new",
        problem: null,
        detail: null,
      }
      return current
    }
    handlers.sync_db_for_library = () => ({
      pushed: 0,
      pulled: 0,
      changed: false,
    })
  }, library)
  await page.setViewportSize({ width: 480, height: 800 })
  await page.goto("/settings?section=libraries")
  await page.getByRole("button", { name: "修改书库路径" }).click()
  const dialog = page.getByRole("dialog")
  await expect(
    dialog.getByText("无法访问书库路径", { exact: true }),
  ).toBeVisible()
  await dialog.getByText("技术详情", { exact: true }).click()
  await expect(dialog.locator("pre")).toBeVisible()
  const dimensions = await dialog.evaluate((element) => ({
    width: element.clientWidth,
    scroll: element.scrollWidth,
  }))
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1)
  await page.screenshot({ path: testInfo.outputPath("long-library-path.png") })
  await dialog.getByRole("button", { name: "重新选择位置" }).click()
  await dialog.getByText("已移动书库", { exact: true }).click()
  await dialog.getByRole("button", { name: "校验并保存" }).click()
  await expect(dialog.getByRole("status")).toContainText("已保存")
  await dialog.getByRole("button", { name: "立即同步" }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __TAURI_TEST__: { calls: Record<string, number> }
            }
          ).__TAURI_TEST__.calls.sync_db_for_library,
      ),
    )
    .toBe(1)
  await page.screenshot({
    path: testInfo.outputPath("library-location-repaired.png"),
  })
})
