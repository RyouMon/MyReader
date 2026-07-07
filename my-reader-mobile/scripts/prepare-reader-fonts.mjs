#!/usr/bin/env node
import path from "node:path"
import { fileURLToPath } from "node:url"
import { prepareReaderFonts } from "../../packages/fonts/scripts/prepare-reader-fonts.mjs"

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

prepareReaderFonts({ target: "mobile", appRoot }).catch((error) => {
  console.error(error)
  process.exit(1)
})
