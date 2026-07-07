#!/usr/bin/env node
import { constants } from "node:fs"
import fs from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)
const catalogPath = path.join(packageRoot, "src", "reader-font-catalog.json")
const readerFontsPublicRoot = "/reader-fonts/Generated"
const readiumFontOverrideCss = `
:root[style*="--USER__fontFamily"] body,
:root[style*="--USER__fontFamily"] body *:not(code):not(var):not(kbd):not(samp):not(pre) {
  font-family: var(--USER__fontFamily) !important;
}

:root[style*="--USER__fontFamily"] :is(code, var, kbd, samp, pre) {
  font-family: var(--RS__monospaceTf) !important;
}
`.trim()

async function readCatalog() {
  return JSON.parse(await fs.readFile(catalogPath, "utf8"))
}

async function existingReadableFile(filePath) {
  await fs.access(filePath, constants.R_OK)
  return filePath
}

function packageFile(packageName, relativePath) {
  const packageJsonPath = require.resolve(`${packageName}/package.json`)
  return path.join(path.dirname(packageJsonPath), relativePath)
}

async function hardLinkOrCopy(sourcePath, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.rm(targetPath, { force: true })

  try {
    await fs.link(sourcePath, targetPath)
  } catch (error) {
    if (!["EXDEV", "EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      throw error
    }
    await fs.copyFile(sourcePath, targetPath)
  }
}

function fontOutputRootFor(target, appRoot) {
  if (target === "desktop") {
    return path.join(appRoot, "public", "reader-fonts", "Generated")
  }
  if (target === "mobile") {
    return path.join(
      appRoot,
      "modules",
      "readium",
      "ios",
      "Generated",
      "reader-fonts",
    )
  }
  throw new Error(`Unknown reader font target: ${target}`)
}

function generatedFontUrl(relativePath) {
  return `${readerFontsPublicRoot}/${relativePath.replace(/^\.\//, "")}`
}

function targetFontFaces(catalog, target) {
  return catalog.families.flatMap((font) =>
    (font.fontFaces?.[target] ?? []).map((face) => ({
      ...face,
      family: font.readiumFamilies?.[target],
      fallback: font.fallbacks?.[0],
    })),
  )
}

function targetLicenses(catalog, target) {
  return catalog.licenses.filter((license) =>
    license.platforms.includes(target),
  )
}

async function copySimpleFontFaces(catalog, target, outputRoot) {
  for (const face of targetFontFaces(catalog, target)) {
    const sourcePath = await existingReadableFile(
      packageFile(face.packageName, face.source),
    )
    await hardLinkOrCopy(sourcePath, path.join(outputRoot, face.target))
  }
}

async function copyLicenses(catalog, target, outputRoot) {
  for (const license of targetLicenses(catalog, target)) {
    const sourcePath = await existingReadableFile(
      packageFile(license.packageName, license.source),
    )
    await hardLinkOrCopy(sourcePath, path.join(outputRoot, license.target))
  }
}

async function copyDesktopWebFontCss(font, outputRoot) {
  const config = font.webFontCss
  const sourceRoot = path.dirname(
    packageFile(config.packageName, "package.json"),
  )
  const sourceDir = path.join(sourceRoot, config.sourceDir)
  const targetDir = path.join(outputRoot, config.sourceDir)
  await fs.mkdir(targetDir, { recursive: true })

  for (const entry of await fs.readdir(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".woff2")) continue
    await hardLinkOrCopy(
      path.join(sourceDir, entry.name),
      path.join(targetDir, entry.name),
    )
  }

  const sourceCss = await fs.readFile(
    path.join(sourceDir, config.cssFile),
    "utf8",
  )
  return sourceCss
    .replaceAll(
      `font-family:"${config.sourceFamily}"`,
      `font-family:"${config.targetFamily}"`,
    )
    .replaceAll(`local("${config.sourceFamily}"),`, "")
    .replaceAll('url("./', `url("./${config.sourceDir}/`)
}

function createDesktopSimpleCss(catalog) {
  return targetFontFaces(catalog, "desktop")
    .filter((face) => face.family && face.format)
    .map(
      (face) => `@font-face {
  font-family: "${face.family}";
  src: local("${face.family}"), url("./${face.target}") format("${face.format}");
  font-style: ${face.style ?? "normal"};
  font-weight: ${face.weight ?? "400"};
  font-display: swap;
}

.myreader-font-probe-${face.family} {
  font-family: "${face.family}", ${face.fallback ?? "serif"};
}`,
    )
    .join("\n\n")
}

function createReaderFontFaceManifest(catalog, webFontCss) {
  const faces = targetFontFaces(catalog, "desktop")
    .filter((face) => face.family && face.format)
    .map((face) => ({
      family: face.family,
      source: `url("${generatedFontUrl(face.target)}") format("${face.format}")`,
      descriptors: {
        style: face.style ?? "normal",
        weight: String(face.weight ?? "400"),
        display: "swap",
      },
    }))

  for (const match of webFontCss.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const block = match[1] ?? ""
    const family = block.match(/font-family\s*:\s*"([^"]+)"/)?.[1]
    const src = block.match(/src\s*:\s*url\("([^"]+)"\)\s*format\("([^"]+)"\)/)
    if (!family || !src) continue

    const unicodeRange = block
      .match(/unicode-range\s*:\s*([^;]+)\s*;/)?.[1]
      ?.trim()
    faces.push({
      family,
      source: `url("${generatedFontUrl(src[1])}") format("${src[2]}")`,
      descriptors: {
        style: "normal",
        weight: "400",
        display: "swap",
        ...(unicodeRange ? { unicodeRange } : {}),
      },
    })
  }

  return {
    version: 1,
    faces,
  }
}

async function writeDesktopFontCss(catalog, outputRoot) {
  const webCssBlocks = []
  for (const font of catalog.families) {
    if (font.platforms.includes("desktop") && font.webFontCss) {
      webCssBlocks.push(await copyDesktopWebFontCss(font, outputRoot))
    }
  }
  const webFontCss = webCssBlocks.join("\n\n")
  const simpleCss = createDesktopSimpleCss(catalog)

  await fs.writeFile(
    path.join(outputRoot, "reader-fonts.css"),
    `/* Generated by @my-reader/fonts. Do not edit. */\n${simpleCss}\n\n${webFontCss}\n\n${readiumFontOverrideCss}\n`,
  )
  await fs.writeFile(
    path.join(outputRoot, "reader-font-faces.json"),
    `${JSON.stringify(createReaderFontFaceManifest(catalog, webFontCss), null, 2)}\n`,
  )
}

function parseArgs(argv) {
  const out = { target: undefined, appRoot: undefined }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--target") out.target = argv[++i]
    if (arg === "--app-root") out.appRoot = argv[++i]
  }
  return out
}

export async function prepareReaderFonts({ target, appRoot }) {
  const catalog = await readCatalog()
  const resolvedAppRoot = path.resolve(appRoot)
  const outputRoot = fontOutputRootFor(target, resolvedAppRoot)

  await fs.rm(target === "desktop" ? outputRoot : path.dirname(outputRoot), {
    force: true,
    recursive: true,
  })
  await fs.mkdir(outputRoot, { recursive: true })

  await copySimpleFontFaces(catalog, target, outputRoot)
  await copyLicenses(catalog, target, outputRoot)
  if (target === "desktop") {
    await writeDesktopFontCss(catalog, outputRoot)
  }

  console.log(
    `Prepared reader fonts in ${path.relative(resolvedAppRoot, outputRoot)}`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { target, appRoot } = parseArgs(process.argv.slice(2))
  if (!target || !appRoot) {
    console.error(
      "Usage: prepare-reader-fonts --target <desktop|mobile> --app-root <path>",
    )
    process.exit(1)
  }
  prepareReaderFonts({ target, appRoot }).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
