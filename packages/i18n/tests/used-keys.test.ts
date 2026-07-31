import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { desktopResources } from "../src/desktop"
import type { TranslationResource } from "../src/merge-resources"
import { mobileResources } from "../src/mobile"

const repositoryRoot = path.resolve(import.meta.dirname, "../../..")

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : sourceFiles(entryPath)
    }
    if (
      !/\.(ts|tsx)$/.test(entry.name) ||
      /\.test\.(ts|tsx)$/.test(entry.name)
    ) {
      return []
    }
    return [entryPath]
  })
}

function literalTranslationKeys(directory: string): string[] {
  const keys = new Set<string>()

  for (const filePath of sourceFiles(directory)) {
    const source = readFileSync(filePath, "utf8")
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const usesReactI18next = source.includes('"react-i18next"')

    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node) && node.arguments.length > 0) {
        const [firstArgument] = node.arguments
        const callsHookTranslation =
          usesReactI18next &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "t"
        const callsI18nInstance =
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "i18n" &&
          node.expression.name.text === "t"

        if (
          (callsHookTranslation || callsI18nInstance) &&
          firstArgument &&
          ts.isStringLiteral(firstArgument)
        ) {
          keys.add(firstArgument.text)
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  return [...keys].sort()
}

function flattenKeys(
  resource: TranslationResource,
  prefix = "",
  keys = new Set<string>(),
): Set<string> {
  for (const [key, value] of Object.entries(resource)) {
    const resourceKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") {
      keys.add(resourceKey)
    } else {
      flattenKeys(value, resourceKey, keys)
    }
  }
  return keys
}

function expectUsedKeysToExist(
  sourceDirectory: string,
  resource: TranslationResource,
): void {
  const resourceKeys = flattenKeys(resource)
  const missingKeys = literalTranslationKeys(sourceDirectory).filter(
    (key) => !resourceKeys.has(key),
  )
  expect(missingKeys).toEqual([])
}

describe("i18n used keys", () => {
  it("should resolve every literal desktop key when application code calls i18next", () => {
    expectUsedKeysToExist(
      path.join(repositoryRoot, "my-reader/src"),
      desktopResources.en.translation,
    )
  })

  it("should resolve every literal mobile key when application code calls i18next", () => {
    expectUsedKeysToExist(
      path.join(repositoryRoot, "my-reader-mobile/src"),
      mobileResources.en.translation,
    )
  })
})
