#!/usr/bin/env node

import { execFileSync } from "node:child_process"

const defaults = {
  cycles: 12,
  durationSeconds: 0.55,
  settleMs: 700,
  x: 417,
  downStartY: 980,
  downEndY: 420,
  upStartY: 420,
  upEndY: 980,
  tabX: 417,
  tabY: 54,
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const parseArgs = () => {
  const options = { ...defaults }
  const args = process.argv.slice(2)

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]

    if (!arg.startsWith("--")) {
      continue
    }

    const key = arg.slice(2)
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`)
    }

    index += 1
    const numberValue = Number(next)
    if (!Number.isFinite(numberValue)) {
      throw new Error(`Invalid numeric value for --${key}: ${next}`)
    }

    switch (key) {
      case "cycles":
        options.cycles = Math.max(1, Math.trunc(numberValue))
        break
      case "duration":
        options.durationSeconds = numberValue
        break
      case "settle-ms":
        options.settleMs = Math.max(0, Math.trunc(numberValue))
        break
      case "x":
        options.x = numberValue
        break
      case "down-start-y":
        options.downStartY = numberValue
        break
      case "down-end-y":
        options.downEndY = numberValue
        break
      case "up-start-y":
        options.upStartY = numberValue
        break
      case "up-end-y":
        options.upEndY = numberValue
        break
      case "tab-x":
        options.tabX = numberValue
        break
      case "tab-y":
        options.tabY = numberValue
        break
      default:
        throw new Error(`Unknown option --${key}`)
    }
  }

  return options
}

const run = (command, args, timeout = 20_000) =>
  execFileSync(command, args.map(String), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
  })

const describeAll = () =>
  JSON.parse(run("idb", ["ui", "describe-all", "--json"]))

const readLibraryState = () => {
  const elements = describeAll()
  const tabs = elements
    .filter((element) => ["主页", "书库", "设置"].includes(element.AXLabel))
    .map((element) => ({
      label: element.AXLabel,
      selected: element.AXValue === 1,
    }))
  const visibleBooks = elements
    .filter(
      (element) =>
        element.type === "Button" &&
        String(element.AXLabel ?? "").startsWith("打开《"),
    )
    .map((element) => ({
      label: String(element.AXLabel),
      x: Math.round(Number(element.frame?.x ?? -1) * 10) / 10,
      y: Math.round(Number(element.frame?.y ?? -1) * 10) / 10,
      height: Number(element.frame?.height ?? 0),
    }))
    .filter((book) => book.y + book.height > 120 && book.y < 1_120)
    .sort((a, b) => a.y - b.y || a.x - b.x)

  return {
    librarySelected: tabs.some((tab) => tab.label === "书库" && tab.selected),
    tabs,
    visibleBooks,
  }
}

const signatureOf = (books) =>
  books
    .slice(0, 10)
    .map((book) => `${book.y}:${book.x}:${book.label}`)
    .join("\n")

const previewOf = (books) =>
  books
    .slice(0, 3)
    .map((book) => `${book.y}/${book.x} ${book.label.slice(0, 34)}`)
    .join(" | ")

const ensureLibraryGate = async (options) => {
  run("idb", ["ui", "tap", options.tabX, options.tabY])
  await sleep(options.settleMs)

  const state = readLibraryState()
  if (!state.librarySelected || state.visibleBooks.length === 0) {
    throw new Error(
      [
        "Library gate failed.",
        `tabs=${JSON.stringify(state.tabs)}`,
        `visibleBooks=${state.visibleBooks.length}`,
      ].join(" "),
    )
  }

  return state
}

const swipe = (direction, options) => {
  const startY = direction === "down" ? options.downStartY : options.upStartY
  const endY = direction === "down" ? options.downEndY : options.upEndY

  // idb's --duration is seconds. Keep this below 1s for user-like, steady
  // profiling scrolls; passing millisecond values like 800 makes idb hang for
  // minutes and invalidates the sample. The default 560pt drag is long enough
  // to expose off-screen item work while still staying below fling speed.
  run("idb", [
    "ui",
    "swipe",
    options.x,
    startY,
    options.x,
    endY,
    "--duration",
    options.durationSeconds,
  ])
}

const directionFor = (index) => {
  const block = Math.floor(index / 4)
  return block % 2 === 0 ? "down" : "up"
}

const main = async () => {
  const options = parseArgs()
  const gate = await ensureLibraryGate(options)
  console.log(
    `library gate ok: books=${gate.visibleBooks.length}; first=${previewOf(gate.visibleBooks)}`,
  )

  let previousSignature = signatureOf(gate.visibleBooks)
  for (let index = 0; index < options.cycles; index += 1) {
    const direction = directionFor(index)
    swipe(direction, options)
    await sleep(options.settleMs)

    const state = readLibraryState()
    const nextSignature = signatureOf(state.visibleBooks)
    const moved = nextSignature !== previousSignature

    if (!state.librarySelected || state.visibleBooks.length === 0 || !moved) {
      throw new Error(
        [
          `Scroll ${index + 1}/${options.cycles} failed.`,
          `direction=${direction}`,
          `librarySelected=${state.librarySelected}`,
          `visibleBooks=${state.visibleBooks.length}`,
          `moved=${moved}`,
        ].join(" "),
      )
    }

    console.log(
      `scroll ${index + 1}/${options.cycles} ${direction}: ${previewOf(state.visibleBooks)}`,
    )
    previousSignature = nextSignature
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
