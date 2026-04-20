import fs from "node:fs"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const projectRoot = path.resolve(__dirname, "../..")
const webServerPort = 55173
const webDriverPort = 9515
const previewServerHost = "localhost"
const edgeDriverBinaryPath = path.resolve(projectRoot, "msedgedriver.exe")

let webServerProcess
let edgeDriverProcess

/**
 * Terminate a spawned process and all its child processes on Windows.
 */
function stopProcessTree(processRef) {
  if (!processRef?.pid) {
    return
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", `${processRef.pid}`, "/T", "/F"], {
      stdio: "ignore",
      shell: true,
    })
    return
  }
  processRef.kill()
}

/**
 * Install a tiny Foliate stub when the vendored foliate-js sources are missing.
 */
function ensureFoliateEpubStub() {
  const foliateDir = path.resolve(
    projectRoot,
    "node_modules/my-reader-tools/src/foliate-js",
  )
  const epubEntry = path.join(foliateDir, "epub.js")
  if (fs.existsSync(epubEntry)) {
    return
  }
  fs.mkdirSync(foliateDir, { recursive: true })
  fs.writeFileSync(
    epubEntry,
    `export class EPUB {}
export default EPUB;
`,
    "utf8",
  )
}

/**
 * Download msedgedriver.exe when it is not present in the project root.
 */
function ensureEdgeDriverBinary() {
  if (fs.existsSync(edgeDriverBinaryPath)) {
    return
  }
  const downloadResult = spawnSync("msedgedriver-tool", [], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: true,
  })
  if (downloadResult.status !== 0 || !fs.existsSync(edgeDriverBinaryPath)) {
    throw new Error("failed to download msedgedriver binary")
  }
}

/**
 * Wait until the preview server can accept HTTP traffic.
 */
async function waitForPreviewServerReady() {
  const serverUrl = `http://${previewServerHost}:${webServerPort}`
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(serverUrl)
      if (response.ok) {
        return
      }
    } catch {
      // wait and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error("preview server did not become ready in time")
}

/**
 * Start the Vite preview server used by browser E2E tests.
 */
async function startPreviewServer() {
  webServerProcess = spawn(
    "npm",
    [
      "run",
      "preview",
      "--",
      "--port",
      `${webServerPort}`,
      "--host",
      previewServerHost,
      "--strictPort",
    ],
    {
      cwd: projectRoot,
      stdio: [null, process.stdout, process.stderr],
      shell: true,
    },
  )
  await waitForPreviewServerReady()
}

/**
 * Start Microsoft Edge WebDriver as the WebdriverIO upstream endpoint.
 */
function startEdgeDriver() {
  edgeDriverProcess = spawn(
    edgeDriverBinaryPath,
    [`--port=${webDriverPort}`],
    { stdio: [null, process.stdout, process.stderr], shell: true },
  )
}

/**
 * Stop all helper processes created during E2E execution.
 */
function cleanupProcesses() {
  stopProcessTree(webServerProcess)
  stopProcessTree(edgeDriverProcess)
  webServerProcess = undefined
  edgeDriverProcess = undefined
}

export const config = {
  host: "127.0.0.1",
  port: webDriverPort,
  path: "/",
  baseUrl: `http://${previewServerHost}:${webServerPort}`,
  specs: ["./test/specs/**/*.e2e.js"],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      browserName: "MicrosoftEdge",
    },
  ],
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 120000,
  },
  connectionRetryCount: 0,
  onPrepare: async () => {
    cleanupProcesses()
    ensureFoliateEpubStub()
    ensureEdgeDriverBinary()
    const frontendBuildResult = spawnSync(
      "npm",
      ["run", "build:frontend:e2e"],
      {
        cwd: projectRoot,
        stdio: "inherit",
        shell: true,
      },
    )
    if (frontendBuildResult.status !== 0) {
      throw new Error("failed to build frontend dist for webdriver tests")
    }
    startEdgeDriver()
    await startPreviewServer()
  },
  onComplete: () => {
    cleanupProcesses()
  },
}
