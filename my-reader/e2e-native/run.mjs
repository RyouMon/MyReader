import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  cleanupWdioSession,
  startWdioSession,
  withExecuteOptions,
} from "@wdio/tauri-service"

const desktop = fileURLToPath(new URL("../", import.meta.url))
const root = resolve(desktop, "..")
const binary = resolve(
  process.env.TAURI_E2E_BINARY ||
    join(
      root,
      "target/release",
      process.platform === "win32" ? "my-reader.exe" : "my-reader",
    ),
)
const output = resolve(
  process.env.E2E_REPORT_DIR || join(root, "reports/desktop-native"),
)
const suite = JSON.parse(
  readFileSync(new URL("suite.json", import.meta.url), "utf8"),
)
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim()
const sha256 = createHash("sha256").update(readFileSync(binary)).digest("hex")
mkdirSync(output, { recursive: true })
rmSync(join(output, "passed.json"), { force: true })
let browser
let mainWindow
let library
const books = {}
const completed = []

async function start() {
  browser = await startWdioSession(
    {
      "tauri:options": { application: binary },
      "wdio:tauriServiceOptions": {
        appBinaryPath: binary,
        driverProvider: "embedded",
        startTimeout: 60000,
        commandTimeout: 30000,
        logLevel: "warn",
        captureBackendLogs: true,
        logDir: output,
      },
    },
    { rootDir: root },
  )
  browser.options.waitforTimeout = 20000
  browser.options.connectionRetryCount = 0
  await browser.waitUntil(
    () => evaluate(() => Boolean(window.__TAURI__?.core)),
    { timeout: 30000 },
  )
  const identifier = await evaluate(async () =>
    window.__TAURI__.app.getIdentifier(),
  )
  assert.equal(
    identifier,
    "ryoumon.myreader.e2e",
    "Refusing to test a user's production data directory",
  )
  mainWindow = await browser.getWindowHandle()
  await evaluate(() => window.__TAURI__.window.getCurrentWindow().setFocus())
}

async function stop() {
  if (browser) await cleanupWdioSession(browser)
  browser = undefined
}

async function invoke(command, args = {}) {
  return evaluate(
    async (name, parameters) => window.__TAURI__.core.invoke(name, parameters),
    command,
    args,
  )
}

async function evaluate(fn, ...args) {
  return browser.tauri.execute(
    `return (${fn.toString()})(...${JSON.stringify(args)});`,
    withExecuteOptions({ windowLabel: await browser.getWindowHandle() }),
  )
}

async function click(selector) {
  const element = await browser.$(selector)
  await element.waitForDisplayed()
  await element.click()
}

async function openReader(format) {
  const book = books[format]
  await browser.switchToWindow(mainWindow)
  await evaluate(() => window.__TAURI__.window.getCurrentWindow().setFocus())
  await click(`[role='button'][aria-label='Open ${book.title}']`)
  const read = await browser.$(
    "button[aria-label='Start reading'], button[aria-label='Continue reading']",
  )
  await read.waitForExist()
  await evaluate(() =>
    document
      .querySelector(
        "button[aria-label='Start reading'], button[aria-label='Continue reading']",
      )
      .scrollIntoView({ block: "center" }),
  )
  await read.waitForDisplayed()
  await read.click()
  await browser.waitUntil(
    async () => (await browser.getWindowHandles()).length === 2,
  )
  const reader = (await browser.getWindowHandles()).find(
    (handle) => handle !== mainWindow,
  )
  await evaluate(async (label) => {
    const windowHandle = await window.__TAURI__.window.Window.getByLabel(label)
    await windowHandle.setFocus()
  }, reader)
  await browser.switchToWindow(reader)
  await browser
    .$("section[data-reader-theme], section[data-reader-mode]")
    .waitForDisplayed({ timeout: 30000 })
  await browser.waitUntil(() =>
    evaluate(
      () =>
        !document.querySelector(
          '[data-reader-state="loading"], [role="status"][aria-label="Loading book…"]',
        ),
    ),
  )
}

async function closeReader() {
  // Use the app's close request so pending reading progress is flushed.
  await browser.execute(() => {
    void window.__TAURI__.window.getCurrentWindow().close()
  })
  await browser.waitUntil(
    async () => (await browser.getWindowHandles()).length === 1,
  )
  await browser.switchToWindow(mainWindow)
}

async function position(format) {
  return invoke("get_reading_progress", {
    libraryId: library.id,
    bookId: books[format].id,
    format,
  })
}

async function fixedReader(format) {
  await openReader(format)
  await browser.keys("ArrowRight")
  await browser.waitUntil(
    async () => (await position(format))?.locator.locations.position === 2,
  )
  await browser.saveScreenshot(join(output, `${format}-page-2.png`))
  await closeReader()
  await openReader(format)
  await browser.waitUntil(async () =>
    (await browser.$("body").getText()).includes("2 / 3"),
  )
  assert.equal((await position(format)).locator.locations.position, 2)
  await closeReader()
}

const cases = [
  async () => {
    const prefs = await invoke("get_reader_ui_preferences")
    await invoke("set_reader_ui_preferences", {
      preferences: { ...prefs, appLanguage: "en" },
    })
    library = await invoke("create_myreader_library", {
      path: join(output, `library-${Date.now()}`),
      name: "Native Release E2E",
    })
    await invoke("switch_library", { id: library.id })
    const epub = join(output, "MyReader-TTS.epub")
    execFileSync(
      process.env.E2E_PYTHON ||
        (process.platform === "win32" ? "python" : "python3"),
      [join(root, "my-reader-mobile/e2e/scripts/build-fixture.py"), epub],
    )
    for (const [format, path] of Object.entries({
      EPUB: epub,
      PDF: join(root, "my-reader-mobile/e2e/fixtures/formats/MyReader-QA.pdf"),
      CBZ: join(root, "my-reader-mobile/e2e/fixtures/formats/MyReader-QA.cbz"),
    })) {
      const result = await invoke("import_book", {
        libraryId: library.id,
        sourceFilePath: path,
        title: `Native ${format}`,
        authors: ["MyReader"],
      })
      assert.ok(result.book, `Core import failed: ${format}`)
      books[format] = result.book
    }
    await browser.refresh()
    for (const book of Object.values(books))
      await browser
        .$(`[role='button'][aria-label='Open ${book.title}']`)
        .waitForDisplayed()
    await browser.saveScreenshot(join(output, "library.png"))
  },
  async () => {
    await openReader("EPUB")
    await click('button[title="Contents"]')
    await click("button=Playback position authority")
    await browser.waitUntil(async () =>
      (await position("EPUB"))?.locator.href.includes("playback-position"),
    )
    await click('button[title="Bookmark"]')
    await browser.waitUntil(
      async () =>
        (
          await invoke("list_reader_bookmarks", {
            libraryId: library.id,
            bookId: books.EPUB.id,
            format: "EPUB",
          })
        ).length === 1,
    )
    await closeReader()
    await openReader("EPUB")
    await browser.waitUntil(
      async () =>
        (await browser
          .$('button[title="Bookmark"]')
          .getAttribute("aria-pressed")) === "true",
    )
    await browser.saveScreenshot(join(output, "epub-restored-bookmark.png"))
    await closeReader()
  },
  () => fixedReader("PDF"),
  () => fixedReader("CBZ"),
  async () => {
    await stop()
    await start()
    assert.equal(await invoke("get_active_library_id"), library.id)
    for (const book of Object.values(books))
      await browser
        .$(`[role='button'][aria-label='Open ${book.title}']`)
        .waitForDisplayed()
    await openReader("EPUB")
    await browser.waitUntil(
      async () =>
        (await browser
          .$('button[title="Bookmark"]')
          .getAttribute("aria-pressed")) === "true",
    )
    await closeReader()
  },
]

try {
  assert.equal(cases.length, suite.length)
  await start()
  for (const [index, run] of cases.entries()) {
    console.log(`Native E2E: ${suite[index]}`)
    await run()
    completed.push(suite[index])
  }
  writeFileSync(
    join(output, "passed.json"),
    JSON.stringify(
      {
        platform: process.platform,
        arch: process.arch,
        commit,
        sha256,
        suite: completed,
      },
      null,
      2,
    ),
  )
} catch (error) {
  writeFileSync(
    join(output, "failure.json"),
    JSON.stringify(
      { commit, sha256, completed, error: String(error) },
      null,
      2,
    ),
  )
  if (browser) {
    await browser
      .saveScreenshot(join(output, "failure.png"))
      .catch(console.error)
    await browser
      .getPageSource()
      .then((html) => writeFileSync(join(output, "failure.html"), html))
      .catch(console.error)
  }
  throw error
} finally {
  await stop()
}
