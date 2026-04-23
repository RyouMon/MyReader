#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const sourceCssPath = path.join(
  repoRoot,
  ".agents/skills/myreader-design-system/colors_and_type.css"
);
const designDocPath = path.join(repoRoot, "DESIGN.md");
const desktopTokenPath = path.join(repoRoot, "my-reader/src/design-tokens.css");
const mobileTokenPath = path.join(repoRoot, "my-reader-mobile/src/design/tokens.tsx");
const readerTokenPath = path.join(repoRoot, "my-reader-mobile/src/design/reader-tokens.ts");

/**
 * Escapes a string for safe use inside RegExp patterns.
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns the CSS block body for a selector by balanced-brace parsing.
 * @param {string} cssText
 * @param {string} selector
 * @returns {string}
 */
function extractCssBlock(cssText, selector) {
  const selectorIndex = cssText.indexOf(selector);
  if (selectorIndex === -1) {
    throw new Error(`Cannot find selector: ${selector}`);
  }

  const blockStart = cssText.indexOf("{", selectorIndex);
  if (blockStart === -1) {
    throw new Error(`Cannot find block start for selector: ${selector}`);
  }

  let depth = 0;
  for (let i = blockStart; i < cssText.length; i += 1) {
    const ch = cssText[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return cssText.slice(blockStart + 1, i);
      }
    }
  }

  throw new Error(`Unclosed CSS block for selector: ${selector}`);
}

/**
 * Parses `--token: value;` declarations from a CSS block.
 * @param {string} blockText
 * @returns {Map<string, string>}
 */
function parseCssVars(blockText) {
  const tokenMap = new Map();
  const varRegex = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gim;

  for (const match of blockText.matchAll(varRegex)) {
    const token = match[1].trim();
    const value = match[2].trim();
    tokenMap.set(token, value);
  }

  return tokenMap;
}

/**
 * Resolves a token value with dark-theme fallback-to-root behavior.
 * @param {Map<string, string>} rootVars
 * @param {Map<string, string>} darkVars
 * @param {string} tokenName
 * @param {"light" | "dark"} theme
 * @returns {string}
 */
function getTokenValue(rootVars, darkVars, tokenName, theme) {
  const initialValue =
    theme === "dark"
      ? darkVars.get(tokenName) ?? rootVars.get(tokenName) ?? ""
      : rootVars.get(tokenName) ?? "";
  return resolveCssVarReference(initialValue, rootVars, darkVars, theme);
}

/**
 * Resolves `var(--token)` chains to concrete values.
 * @param {string} value
 * @param {Map<string, string>} rootVars
 * @param {Map<string, string>} darkVars
 * @param {"light" | "dark"} theme
 * @returns {string}
 */
function resolveCssVarReference(value, rootVars, darkVars, theme) {
  let current = value.trim();
  const visited = new Set();

  while (true) {
    const varMatch = current.match(/^var\((--[a-z0-9-]+)\)$/i);
    if (!varMatch) {
      return current;
    }

    const tokenName = varMatch[1];
    if (visited.has(tokenName)) {
      return current;
    }
    visited.add(tokenName);

    const nextValue =
      theme === "dark"
        ? darkVars.get(tokenName) ?? rootVars.get(tokenName)
        : rootVars.get(tokenName);
    if (!nextValue) {
      return current;
    }
    current = nextValue.trim();
  }
}

/**
 * Replaces the value of one key in a JS object literal block.
 * @param {string} source
 * @param {string} objectName
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */
function replaceObjectStringValue(source, objectName, key, value) {
  const objectRegex = new RegExp(
    `(const\\s+${escapeRegExp(objectName)}\\s*=\\s*\\{)([\\s\\S]*?)(\\}\\s+as\\s+const;)`,
    "m"
  );
  const match = source.match(objectRegex);
  if (!match) {
    throw new Error(`Cannot find object block: ${objectName}`);
  }

  const blockBody = match[2];
  const keyRegex = new RegExp(`(^\\s*${escapeRegExp(key)}:\\s*)["'][^"']*["'](,?)`, "m");
  if (!keyRegex.test(blockBody)) {
    throw new Error(`Cannot find key "${key}" in object "${objectName}"`);
  }
  const updatedBody = blockBody.replace(keyRegex, `$1"${value}"$2`);

  return source.replace(objectRegex, `${match[1]}${updatedBody}${match[3]}`);
}

/**
 * Replaces one CSS custom property value in a selector block.
 * @param {string} source
 * @param {string} selector
 * @param {string} token
 * @param {string} value
 * @returns {string}
 */
function replaceCssVarInSelector(source, selector, token, value) {
  const blockRegex = new RegExp(`(${escapeRegExp(selector)}\\s*\\{)([\\s\\S]*?)(\\n\\})`, "m");
  const match = source.match(blockRegex);
  if (!match) {
    throw new Error(`Cannot find selector block: ${selector}`);
  }

  const body = match[2];
  const tokenRegex = new RegExp(`(^\\s*${escapeRegExp(token)}\\s*:\\s*)[^;]*;`, "m");
  if (!tokenRegex.test(body)) {
    return source;
  }

  const updatedBody = body.replace(tokenRegex, `$1${value};`);
  return source.replace(blockRegex, `${match[1]}${updatedBody}${match[3]}`);
}

/**
 * Updates the color frontmatter section in DESIGN.md from CSS tokens.
 * @param {string} designDoc
 * @param {Map<string, string>} rootVars
 * @returns {string}
 */
function syncDesignFrontmatterColors(designDoc, rootVars) {
  const colorPairs = [
    ["bg", "--bg"],
    ["bg-subtle", "--bg-subtle"],
    ["surface", "--surface"],
    ["surface-2", "--surface-2"],
    ["surface-3", "--surface-3"],
    ["ink-1", "--ink-1"],
    ["ink-2", "--ink-2"],
    ["ink-3", "--ink-3"],
    ["ink-4", "--ink-4"],
    ["ink-inverse", "--ink-inverse"],
    ["accent", "--accent"],
    ["accent-hover", "--accent-hover"],
    ["accent-press", "--accent-press"],
    ["accent-soft", "--accent-soft"],
    ["accent-muted", "--accent-muted"],
    ["success", "--success"],
    ["success-soft", "--success-soft"],
    ["warning", "--warning"],
    ["warning-soft", "--warning-soft"],
    ["danger", "--danger"],
    ["danger-soft", "--danger-soft"],
    ["border-subtle", "--border-subtle"],
    ["border", "--border-default"],
    ["border-strong", "--border-strong"],
    ["border-active", "--border-active"],
    ["border-error", "--border-error"],
  ];

  const colorLines = colorPairs.map(([name, tokenName]) => {
    const value = rootVars.get(tokenName);
    if (!value) {
      throw new Error(`Missing token in source CSS: ${tokenName}`);
    }
    return `  ${name}: "${value}"`;
  });

  const replacement = `\ncolors:\n${colorLines.join("\n")}\ntypography:\n`;
  const colorsSectionRegex = /\ncolors:\n[\s\S]*?\ntypography:\n/m;
  if (!colorsSectionRegex.test(designDoc)) {
    throw new Error("Cannot find frontmatter colors section in DESIGN.md");
  }
  return designDoc.replace(colorsSectionRegex, replacement);
}

/**
 * Updates desktop CSS tokens from source CSS token maps.
 * @param {string} desktopCss
 * @param {Map<string, string>} rootVars
 * @param {Map<string, string>} darkVars
 * @returns {string}
 */
function syncDesktopTokens(desktopCss, rootVars, darkVars) {
  let output = desktopCss;

  const lightTokenNames = [
    "--bg",
    "--bg-subtle",
    "--surface",
    "--surface-2",
    "--surface-3",
    "--ink-1",
    "--ink-2",
    "--ink-3",
    "--ink-4",
    "--ink-inverse",
    "--accent",
    "--accent-hover",
    "--accent-press",
    "--accent-soft",
    "--accent-muted",
    "--success",
    "--success-soft",
    "--warning",
    "--warning-soft",
    "--danger",
    "--danger-soft",
  ];

  for (const tokenName of lightTokenNames) {
    const tokenValue = getTokenValue(rootVars, darkVars, tokenName, "light");
    output = replaceCssVarInSelector(output, ":root", tokenName, tokenValue);
  }

  output = replaceCssVarInSelector(
    output,
    ":root",
    "--border-color",
    getTokenValue(rootVars, darkVars, "--border-default", "light")
  );
  output = replaceCssVarInSelector(
    output,
    ":root",
    "--border-color-strong",
    getTokenValue(rootVars, darkVars, "--border-strong", "light")
  );

  const darkTokenNames = [
    "--bg",
    "--bg-subtle",
    "--surface",
    "--surface-2",
    "--surface-3",
    "--ink-1",
    "--ink-2",
    "--ink-3",
    "--ink-4",
    "--ink-inverse",
    "--accent",
    "--accent-hover",
    "--accent-press",
    "--accent-soft",
    "--accent-muted",
  ];

  for (const tokenName of darkTokenNames) {
    const sourceTokenName = `${tokenName}-dark`;
    const rawTokenValue =
      darkVars.get(tokenName) ?? rootVars.get(sourceTokenName) ?? rootVars.get(tokenName) ?? "";
    const tokenValue = resolveCssVarReference(rawTokenValue, rootVars, darkVars, "dark");
    output = replaceCssVarInSelector(output, ".dark", tokenName, tokenValue);
  }

  output = replaceCssVarInSelector(
    output,
    ".dark",
    "--border-color",
    getTokenValue(rootVars, darkVars, "--border-default", "dark")
  );
  output = replaceCssVarInSelector(
    output,
    ".dark",
    "--border-color-strong",
    getTokenValue(rootVars, darkVars, "--border-strong", "dark")
  );

  return output;
}

/**
 * Updates mobile theme palette file from source CSS token maps.
 * @param {string} mobileTokens
 * @param {Map<string, string>} rootVars
 * @param {Map<string, string>} darkVars
 * @returns {string}
 */
function syncMobileTokens(mobileTokens, rootVars, darkVars) {
  let output = mobileTokens;

  const borderValueLight = getTokenValue(rootVars, darkVars, "--border-default", "light");
  const borderValueDark = getTokenValue(rootVars, darkVars, "--border-default", "dark");
  const borderSubtleLight = getTokenValue(rootVars, darkVars, "--border-subtle", "light");
  const borderSubtleDark = getTokenValue(rootVars, darkVars, "--border-subtle", "dark");
  const borderStrongLight = getTokenValue(rootVars, darkVars, "--border-strong", "light");
  const borderStrongDark = getTokenValue(rootVars, darkVars, "--border-strong", "dark");
  const borderActiveLight = getTokenValue(rootVars, darkVars, "--border-active", "light");
  const borderActiveDark = getTokenValue(rootVars, darkVars, "--border-active", "dark");
  const borderErrorLight = getTokenValue(rootVars, darkVars, "--border-error", "light");
  const borderErrorDark = getTokenValue(rootVars, darkVars, "--border-error", "dark");

  output = output.replace(
    /(const APP_BORDER = \{\n  light: \{)[\s\S]*?(  \},\n  dark: \{)[\s\S]*?(\n  \},\n\} as const;)/m,
    `$1
    subtle: "${borderSubtleLight}",
    default: "${borderValueLight}",
    strong: "${borderStrongLight}",
    active: "${borderActiveLight}",
    error: "${borderErrorLight}",
$2
    subtle: "${borderSubtleDark}",
    default: "${borderValueDark}",
    strong: "${borderStrongDark}",
    active: "${borderActiveDark}",
    error: "${borderErrorDark}",
$3`
  );

  const lightMapping = [
    ["background", "--bg"],
    ["surface", "--surface"],
    ["surfaceMuted", "--surface-2"],
    ["surface2", "--surface-2"],
    ["surface3", "--surface-3"],
    ["text", "--ink-1"],
    ["textMuted", "--ink-2"],
    ["textSubtle", "--ink-3"],
    ["textGhost", "--ink-4"],
    ["textOnDark", "--ink-inverse"],
    ["primary", "--accent"],
    ["primaryStrong", "--accent-hover"],
    ["primaryForeground", "--ink-inverse"],
    ["accentSoft", "--accent-soft"],
    ["accentMuted", "--accent-muted"],
    ["success", "--success"],
    ["successSoft", "--success-soft"],
    ["warning", "--warning"],
    ["warningSoft", "--warning-soft"],
    ["error", "--danger"],
    ["dangerSoft", "--danger-soft"],
  ];

  for (const [key, tokenName] of lightMapping) {
    output = replaceObjectStringValue(
      output,
      "lightPaletteBase",
      key,
      getTokenValue(rootVars, darkVars, tokenName, "light")
    );
  }
  output = replaceObjectStringValue(output, "lightPaletteBase", "overlay", "rgba(28,23,20,0.22)");
  output = replaceObjectStringValue(
    output,
    "lightPaletteBase",
    "overlayStrong",
    "rgba(28,23,20,0.50)"
  );

  const darkMapping = [
    ["background", "--bg"],
    ["surface", "--surface"],
    ["surfaceMuted", "--surface-2"],
    ["surface2", "--surface-2"],
    ["surface3", "--surface-3"],
    ["text", "--ink-1"],
    ["textMuted", "--ink-2"],
    ["textSubtle", "--ink-3"],
    ["textGhost", "--ink-4"],
    ["textOnDark", "--ink-inverse"],
    ["primary", "--accent"],
    ["primaryStrong", "--accent-hover"],
    ["primaryForeground", "--ink-inverse"],
    ["accentSoft", "--accent-soft"],
    ["accentMuted", "--accent-muted"],
  ];

  for (const [key, tokenName] of darkMapping) {
    output = replaceObjectStringValue(
      output,
      "darkPaletteBase",
      key,
      getTokenValue(rootVars, darkVars, tokenName, "dark")
    );
  }
  output = replaceObjectStringValue(output, "darkPaletteBase", "overlay", "rgba(0,0,0,0.38)");
  output = replaceObjectStringValue(output, "darkPaletteBase", "overlayStrong", "rgba(0,0,0,0.65)");

  return output;
}

/**
 * Updates reader-chrome tokens that should stay aligned with shared accent tokens.
 * @param {string} readerTokens
 * @param {Map<string, string>} rootVars
 * @param {Map<string, string>} darkVars
 * @returns {string}
 */
function syncReaderTokens(readerTokens, rootVars, darkVars) {
  let output = readerTokens;

  const accentLight = getTokenValue(rootVars, darkVars, "--accent", "light");
  const accentDark = getTokenValue(rootVars, darkVars, "--accent", "dark");
  const borderActiveDark = getTokenValue(rootVars, darkVars, "--border-active", "dark");

  output = output.replace(/link:\s*"[^"]*",\n/g, (line) => {
    if (line.includes("paper") || line.includes("light")) {
      return `link: "${accentLight}",\n`;
    }
    return line;
  });

  output = output.replace(/(paper:\s*\{[\s\S]*?link:\s*)"[^"]*"/m, `$1"${accentLight}"`);
  output = output.replace(/(light:\s*\{[\s\S]*?link:\s*)"[^"]*"/m, `$1"${accentLight}"`);
  output = output.replace(/(dark:\s*\{[\s\S]*?link:\s*)"[^"]*"/m, `$1"${accentDark}"`);

  output = output.replace(/accent:\s*"[^"]*",/, `accent: "${accentDark}",`);
  output = output.replace(
    /active:\s*"rgba\([^"]*\)",/,
    `active: "${borderActiveDark}",`
  );
  output = output.replace(
    /backgroundColor:\s*active\s*\?\s*"rgba\([^"]*\)"\s*:\s*"rgba\([^"]*\)",/,
    'backgroundColor: active ? "rgba(212,112,58,0.10)" : "rgba(255,255,255,0.05)",'
  );

  return output;
}

/**
 * Runs the synchronization workflow.
 * @returns {Promise<void>}
 */
async function main() {
  const [sourceCss, designDoc, desktopCss, mobileTokens, readerTokens] = await Promise.all([
    readFile(sourceCssPath, "utf8"),
    readFile(designDocPath, "utf8"),
    readFile(desktopTokenPath, "utf8"),
    readFile(mobileTokenPath, "utf8"),
    readFile(readerTokenPath, "utf8"),
  ]);

  const rootVars = parseCssVars(extractCssBlock(sourceCss, ":root"));
  const darkVars = parseCssVars(extractCssBlock(sourceCss, '[data-theme="dark"]'));

  const nextDesignDoc = syncDesignFrontmatterColors(designDoc, rootVars)
    .replace(/`DESIGN\.desktop\.md`/g, "`my-reader/src/design-tokens.css`")
    .replace(/`DESIGN\.mobile\.md`/g, "`my-reader-mobile/src/design/tokens.tsx`")
    .replace(/`DESIGN\.tokens\.json`/g, "`.agents/skills/myreader-design-system/colors_and_type.css`")
    .replace(/Dark values live in `\.agents\/skills\/myreader-design-system\/colors_and_type\.css` `themes\.dark`\./g, "Dark values are defined in `.agents/skills/myreader-design-system/colors_and_type.css` under `[data-theme=\"dark\"]`.");
  const nextDesktopCss = syncDesktopTokens(desktopCss, rootVars, darkVars).replace(
    /Synced from .*colors_and_type\.css\./,
    "Synced from .agents/skills/myreader-design-system/colors_and_type.css."
  );
  const nextMobileTokens = syncMobileTokens(mobileTokens, rootVars, darkVars);
  const nextReaderTokens = syncReaderTokens(readerTokens, rootVars, darkVars);

  await Promise.all([
    writeFile(designDocPath, nextDesignDoc),
    writeFile(desktopTokenPath, nextDesktopCss),
    writeFile(mobileTokenPath, nextMobileTokens),
    writeFile(readerTokenPath, nextReaderTokens),
  ]);

  console.log("Synced design tokens from colors_and_type.css:");
  console.log(`- ${path.relative(repoRoot, designDocPath)}`);
  console.log(`- ${path.relative(repoRoot, desktopTokenPath)}`);
  console.log(`- ${path.relative(repoRoot, mobileTokenPath)}`);
  console.log(`- ${path.relative(repoRoot, readerTokenPath)}`);
}

main().catch((error) => {
  console.error("[sync-design-tokens] failed:", error);
  process.exitCode = 1;
});
