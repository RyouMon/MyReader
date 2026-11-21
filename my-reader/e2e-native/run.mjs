import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { cleanupWdioSession, startWdioSession } from "@wdio/tauri-service"

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
const formatFixtureRoot = join(root, "packages/reader-formats/tests/fixtures")
const convertedFormatFixtures = {
  TXT: "Daybreak.txt",
  MD: "Reading-journal.md",
  FB2: "ReaderFormats.fb2",
  FBZ: "ReaderFormats.fbz",
  "FB2.ZIP": "ReaderFormats.fb2.zip",
  TXTZ: "Daybreak.txtz",
  HTML: "Lantern.html",
  HTM: "Lantern.htm",
  XHTML: "Lantern.xhtml",
  HTMLZ: "Lantern.htmlz",
  MOBI: "Combo.mobi",
  AZW3: "Lantern.azw3",
  KF8: "Lantern.kf8",
  AZW: "Lantern.azw",
  PRC: "Lantern.prc",
  KEPUB: "Lantern.kepub",
  "KEPUB.EPUB": "Lantern.kepub.epub",
}
const convertedFormatText = {
  TXT: "渡船停在桥下",
  MD: "lantern on the river is still orange",
  FB2: "paper lantern glowed beside the window",
  FBZ: "paper lantern glowed beside the window",
  "FB2.ZIP": "paper lantern glowed beside the window",
  TXTZ: "渡船停在桥下",
  HTML: "paper lantern glowed beside the window",
  HTM: "paper lantern glowed beside the window",
  XHTML: "paper lantern glowed beside the window",
  HTMLZ: "paper lantern glowed beside the window",
  MOBI: "lantern glowed",
  AZW3: "lantern glowed",
  KF8: "lantern glowed",
  AZW: "lantern glowed",
  PRC: "lantern glowed",
  KEPUB: "MyReader reads this first sentence aloud",
  "KEPUB.EPUB": "MyReader reads this first sentence aloud",
}
const verifiedFormats = []
const verifiedSearchHighlights = []

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
  await focusMainWindow()
}

async function focusMainWindow() {
  await browser.switchToWindow(mainWindow)
  await browser.waitUntil(
    () =>
      evaluate(async () => {
        // Closing another native window can finish after the first focus request.
        const current = window.__TAURI__.window.getCurrentWindow()
        await current.unminimize()
        await current.show()
        await current.setFocus()
        return document.visibilityState === "visible"
      }),
    {
      timeoutMsg:
        "The native window must be visible before interacting with it",
    },
  )
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
  return browser.execute(fn, ...args)
}

async function click(selector) {
  const element = await browser.$(selector)
  await element.waitForDisplayed()
  await element.click()
}

async function revealReaderChrome() {
  const width = await evaluate(() => window.innerWidth)
  await browser
    .action("pointer")
    .move({ origin: "viewport", x: Math.floor(width / 2), y: 16 })
    .down({ button: 0 })
    .up({ button: 0 })
    .perform()
  await browser.$('section[data-reader-chrome-visible="true"]').waitForExist()
}

async function waitForTtsReady(format) {
  await browser.waitUntil(
    async () =>
      evaluate(() => {
        const section = document.querySelector(
          '[data-testid="reader-tts-controls"]',
        )
        const buttons = section?.querySelectorAll("button") ?? []
        const expand = buttons[buttons.length - 1]
        return Boolean(expand && !expand.disabled)
      }),
    {
      timeout: 30000,
      timeoutMsg: "Readium TTS did not become available for " + format,
    },
  )
  return true
}

async function readerText() {
  return evaluate(() => {
    const texts = [document.body?.innerText ?? ""]
    for (const frame of document.querySelectorAll("iframe")) {
      try {
        texts.push(frame.contentDocument?.body?.innerText ?? "")
      } catch {
        // Cross-origin frames are not publication content.
      }
    }
    return texts.join("\n")
  })
}

async function openReader(format) {
  const book = books[format]
  await focusMainWindow()
  const selector = `[role='button'][aria-label='Open ${book.title}']`
  const waitForDisplayed = async (timeout = 5000) => {
    await browser.waitUntil(
      async () => {
        try {
          const openButton = await browser.$(selector)
          return await openButton.isDisplayed()
        } catch {
          // The virtualized catalog can replace the button while it settles.
          return false
        }
      },
      { timeout },
    )
  }
  try {
    await waitForDisplayed()
  } catch {
    // The catalog virtualizes a long list. Filtering by title makes the
    // requested row render without refreshing the native WebView.
    const search = await browser.$(
      'input[role="combobox"][aria-label*="Search titles"]',
    )
    await search.waitForDisplayed({ timeout: 30000 })
    await search.clearValue()
    await search.setValue(book.title)
    await waitForDisplayed(30000)
  }
  await (await browser.$(selector)).click()
  const read = await browser.$(
    "button[aria-label='Start reading'], button[aria-label='Continue reading'], button[aria-label='Read again']",
  )
  await read.waitForExist()
  await evaluate(() =>
    document
      .querySelector(
        "button[aria-label='Start reading'], button[aria-label='Continue reading'], button[aria-label='Read again']",
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
  await browser.switchToWindow(reader)
  await browser
    .$("section[data-reader-theme], section[data-reader-mode]")
    .waitForExist({ timeout: 30000 })
  await browser.switchToWindow(mainWindow)
  await evaluate(async (label) => {
    const windowHandle = await window.__TAURI__.window.Window.getByLabel(label)
    await windowHandle.unminimize()
    await windowHandle.show()
    await windowHandle.setFocus()
  }, reader)
  await browser.switchToWindow(reader)
  await browser.waitUntil(
    () => evaluate(() => document.visibilityState === "visible"),
    {
      timeoutMsg:
        "The native reader must be visible before interacting with it",
    },
  )
  await browser.waitUntil(
    async () =>
      (
        await browser.$("section[data-reader-theme], section[data-reader-mode]")
      ).isDisplayed(),
    { timeout: 30000, timeoutMsg: "The native reader content must be visible" },
  )
  await browser.waitUntil(() =>
    evaluate(
      () =>
        !document.querySelector(
          '[data-reader-state="loading"], [role="status"][aria-label="Loading book…"]',
        ),
    ),
  )
  await revealReaderChrome()
}

async function closeReader() {
  const reader = await browser.getWindowHandle()
  await browser.switchToWindow(mainWindow)
  // Preserve the close request and progress flush without destroying the caller.
  await evaluate(async (label) => {
    const windowHandle = await window.__TAURI__.window.Window.getByLabel(label)
    await windowHandle.close()
  }, reader)
  await browser.waitUntil(
    async () => (await browser.getWindowHandles()).length === 1,
  )
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
  await browser.waitUntil(async () =>
    (await browser.$("body").getText()).includes("1 / 3"),
  )
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
      ...Object.fromEntries(
        Object.entries(convertedFormatFixtures).map(([format, file]) => [
          format,
          join(formatFixtureRoot, file),
        ]),
      ),
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
    for (const format of Object.keys(convertedFormatFixtures)) {
      await openReader(format)
      await browser.waitUntil(
        async () => {
          const saved = await position(format)
          return Boolean(saved?.locator?.href && saved?.locator?.locations)
        },
        { timeout: 30000, timeoutMsg: "Missing Readium Locator for " + format },
      )
      const saved = await position(format)
      await browser.waitUntil(
        async () =>
          (await readerText())
            .toLowerCase()
            .includes(convertedFormatText[format].toLowerCase()),
        {
          timeout: 30000,
          timeoutMsg: "Converted publication text is not visible for " + format,
        },
      )
      await revealReaderChrome()
      await browser.$('[data-testid="reader-tts-controls"]').waitForExist()
      const ttsReady = await waitForTtsReady(format)
      if (format === "FB2") {
        await click('button[title="Search"]')
        const search = await browser.$('input[role="searchbox"]')
        await search.setValue("folded from a map")
        await evaluate(() =>
          document
            .querySelector('input[role="searchbox"]')
            .form.requestSubmit(),
        )
        await click('//aside//ol//button[contains(., "folded from a map")]')
        await browser.waitUntil(async () =>
          (await position(format))?.locator.href.includes("chapter-0002.xhtml"),
        )
        const highlightState = await evaluate(() =>
          [...document.querySelectorAll("iframe")].map((frame) => {
            try {
              return {
                ready: Boolean(frame.contentDocument),
                groups: frame.contentDocument?.querySelectorAll(
                  '[data-readium="true"][data-group="search"]',
                ).length,
                cssHighlights: frame.contentWindow?.CSS?.highlights?.size ?? 0,
              }
            } catch {
              return { ready: false, groups: 0, cssHighlights: 0 }
            }
          }),
        )
        console.log("Readium search highlight state", highlightState)
        assert.equal(
          highlightState.some(
            (item) => item.groups > 0 || item.cssHighlights > 0,
          ),
          true,
          "Readium search result was not highlighted",
        )
        verifiedSearchHighlights.push(format)
        await click('button[title="Search"]')
        await revealReaderChrome()
      }
      verifiedFormats.push({
        format,
        locator: saved.locator,
        textMatched: true,
        ttsControls: true,
        ttsReady,
      })
      await click('button[title="Bookmark"]')
      await browser.waitUntil(
        async () =>
          (
            await invoke("list_reader_bookmarks", {
              libraryId: library.id,
              bookId: books[format].id,
              format,
            })
          ).length === 1,
      )
      await closeReader()
    }
  },
  async () => {
    await openReader("EPUB")
    await click('button[title="Contents"]')
    await click("button=Playback position authority")
    await browser.waitUntil(async () =>
      (await position("EPUB"))?.locator.href.includes("playback-position"),
    )
    await revealReaderChrome()
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
        formatVerification: verifiedFormats,
        searchHighlightVerification: verifiedSearchHighlights,
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
    await evaluate(() => {
      const errorDetails = [...document.querySelectorAll("button")].find(
        (button) => button.textContent === "Show Error",
      )
      errorDetails?.click()
    }).catch(console.error)
    await evaluate(() => {
      const button =
        document.querySelector(
          "section[data-reader-theme], section[data-reader-mode]",
        ) ||
        document.querySelector(
          "button[aria-label='Start reading'], button[aria-label='Continue reading'], button[aria-label='Read again']",
        )
      const ancestors = []
      for (let element = button; element; element = element.parentElement) {
        const style = getComputedStyle(element)
        ancestors.push({
          tag: element.tagName,
          testId: element.getAttribute("data-testid"),
          rect: element.getBoundingClientRect().toJSON(),
          opacity: style.opacity,
          visibility: style.visibility,
          display: style.display,
          scrollTop: element.scrollTop,
          scrollLeft: element.scrollLeft,
        })
      }
      return { visibility: document.visibilityState, ancestors }
    })
      .then((state) =>
        writeFileSync(
          join(output, "failure-layout.json"),
          JSON.stringify(state, null, 2),
        ),
      )
      .catch(console.error)
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
