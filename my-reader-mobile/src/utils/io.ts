/**
 * 本地与 WebDAV 路径统一工具。
 *
 * ## 多重编码（如 `%2520`）从何而来
 *
 * 1. **真源**：Calibre `metadata.db` 里的相对路径应为「明文」目录名/文件名（含空格、括号、日文等）。
 * 2. **污染**：若某处把已经过 `encodeURIComponent` 的字符串当作路径片段保存或再传入（例如持久化、日志回灌、旧版 bug），则片段字面量会变成 `Wei%20Zhi` 而非 `Wei Zhi`。
 * 3. **二次编码**：对这类片段再调用 `encodeURIComponent`，`%` 会变成 `%25`，得到 `%2520`；或 Expo `File`/`Directory` 在已有编码的 URI 上再叠一层。
 * 4. **后果**：原生下载器写入路径 A，JS 侧用另一套编码拼出路径 B，出现「已下载但 size=0 / 打不开 / unzip 失败」。
 *
 * ## 约定
 *
 * - **逻辑相对路径**（manifest、`file_state.path`、Calibre 相对路径）：按明文片段理解；若发现片段含 `%`，先迭代替换解码到稳定，再参与任何本地文件或 URL 拼接。
 * - **本地 `file://` URI**：用 {@link localCachedFileUri} / {@link toFileUri}，由此处统一处理 scheme 与解码。
 * - **WebDAV URL 路径**：用 {@link encodeUrlPathFromChunks}，在明文片段上对每个 segment **只**做一次 `encodeURIComponent`。
 */

import i18n from "@/src/i18n";

/** 单一路径段内 `%` 序列的最大解码轮数（覆盖 `%25xx` 叠多层）。 */
export const IO_PATH_MAX_PERCENT_DECODE_ROUNDS = 8;

/**
 * 规范化「书库内相对路径」：去首尾空白、反斜杠转正斜杠、去掉首尾 `/`。
 */
export function normalizeRelativePath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  return trimmed.replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * 将单个路径段从可能的「多重百分号编码」还原为明文，直到稳定或遇到非法编码。
 */
function decodePathSegmentToPlainText(segment: string): string {
  let current = segment;
  for (let round = 0; round < IO_PATH_MAX_PERCENT_DECODE_ROUNDS; round += 1) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

/**
 * 将整条路径按 `/` 分段解码，避免 `%2F` 等字符在解码前改变分段边界。
 */
function decodePathToPlainText(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => (segment ? decodePathSegmentToPlainText(segment) : segment))
    .join("/");
}

/**
 * 相对路径 → 明文路径段数组（已规范化、已逐段解码）。
 */
export function canonicalRelativePathSegments(relativePath: string): string[] {
  const rel = normalizeRelativePath(relativePath);
  return rel.split("/").filter(Boolean).map((segment) => decodePathSegmentToPlainText(segment));
}

/**
 * 相对路径的规范「明文」形式（用 `/` 连接），便于日志或与远端明文路径比对。
 */
export function canonicalRelativePath(relativePath: string): string {
  return canonicalRelativePathSegments(relativePath).join("/");
}

/**
 * 在已存在的目录 URI 下，解析相对路径得到目标文件的 `file://` URI。
 * 所有片段先规范为明文，再交给 Expo `File`/`Directory` 构造，避免手工拼接与二次编码。
 */
export function localCachedFileUri(libraryCacheDirUri: string, relativePath: string): string {
  const base = toNativeFilesystemPath(libraryCacheDirUri).replace(/\/+$/, "");
  const segments = canonicalRelativePathSegments(relativePath);
  return toFileUri([base, ...segments].join("/"));
}

function encodeRelativePathForWebUrl(relativePath: string): string {
  return canonicalRelativePathSegments(relativePath).map((segment) => encodeURIComponent(segment)).join("/");
}

/**
 * 拼接多段「可能本身含 `/` 的子路径」（例如 rootPath、libraryPath、relativePath），
 * 每段先规范化，再对整段做 URL 编码，段与段之间用 `/` 连接。
 */
export function encodeUrlPathFromChunks(...pathChunks: string[]): string {
  return pathChunks
    .map((chunk) => normalizeRelativePath(chunk))
    .filter(Boolean)
    .map((chunk) => encodeRelativePathForWebUrl(chunk))
    .join("/");
}

/**
 * 判断字符串是否是本地文件 URI。
 */
export function isFileUri(value: string): boolean {
  return value.trim().startsWith("file:");
}

/**
 * 把原生绝对路径或裸路径规范成 `file:` URI，供 Expo `File` / `Directory` / legacy file-system 使用。
 */
export function toFileUri(pathOrUri: string): string {
  const normalized = pathOrUri.replace(/\\/g, "/").trim();
  const nativePath = isFileUri(normalized) ? toNativeFilesystemPath(normalized) : decodePathToPlainText(normalized);
  const encodedPath = nativePath
    .split("/")
    .map((segment) => (segment ? encodeURIComponent(segment) : segment))
    .join("/");
  return encodedPath.startsWith("/") ? `file://${encodedPath}` : `file:///${encodedPath}`;
}

/**
 * 将 `file:` URI 或裸路径转为原生层使用的文件系统路径字符串（去掉 scheme，路径各段做规范解码）。
 * 用于后台下载器 destination/source、SQLite location、zip 解压器等原生 API 交互场景。
 */
export function toNativeFilesystemPath(pathOrUri: string): string {
  const normalized = pathOrUri.replace(/\\/g, "/").trim();
  if (!isFileUri(normalized)) {
    return decodePathToPlainText(normalized);
  }
  try {
    return decodePathToPlainText(new URL(normalized).pathname);
  } catch {
    const stripped = normalized.replace(/^file:\/\//, "").replace(/^file:/, "");
    return decodePathToPlainText(stripped.startsWith("/") ? stripped : `/${stripped}`);
  }
}

/**
 * 返回文件 URI 的父目录 URI，避免调用方通过字符串截断自行拼 `file://`。
 */
export function parentDirectoryUriForFileUri(fileUri: string): string | null {
  const nativePath = toNativeFilesystemPath(fileUri).replace(/\/+$/, "");
  const lastSlash = nativePath.lastIndexOf("/");
  if (lastSlash <= 0) return null;
  return toFileUri(nativePath.slice(0, lastSlash));
}

/**
 * 拆分文件 URI 为原生目录路径与文件名，用于 op-sqlite 的 `{ location, name }`。
 */
export function fileUriToNativeDirAndName(fileUri: string): { dir: string; name: string } {
  const nativePath = toNativeFilesystemPath(fileUri).replace(/\/+$/, "");
  const lastSlash = nativePath.lastIndexOf("/");
  if (lastSlash <= 0) {
    throw new Error(i18n.t("sync.cannotParseFilePath", { uri: fileUri }));
  }
  return {
    dir: nativePath.slice(0, lastSlash),
    name: nativePath.slice(lastSlash + 1),
  };
}
