import { Directory, File, Paths } from "expo-file-system"
import { ImageManipulator, SaveFormat } from "expo-image-manipulator"
import { Image as ReactNativeImage } from "react-native"

import { COVER_THUMBNAIL_JPEG_COMPRESS } from "@/src/config/library-list-performance"

export type CoverThumbnailSource =
  | string
  | { uri: string; headers?: Record<string, string> }

export type CoverThumbnailCacheInput = {
  libraryId: string
  bookId: string
  source: CoverThumbnailSource
  coverIdentity: string
  widthPx: number
  heightPx: number
}

const COVER_THUMBNAIL_CACHE_ROOT = "myreader-cover-thumbnails"
export const COVER_THUMBNAIL_CACHE_VERSION = "v1"
const inFlightThumbnails = new Map<string, Promise<CoverThumbnailCacheFile>>()

export type CoverThumbnailCacheFile = {
  fileName: string
  fileSizeBytes: number
  uri: string
}

export type CoverThumbnailCacheFileLookup = {
  libraryId: string
  widthPx: number
  heightPx: number
  fileName: string
}

function sourceUri(source: CoverThumbnailSource): string {
  return typeof source === "string" ? source : source.uri
}

function sourceHeaders(
  source: CoverThumbnailSource,
): Record<string, string> | undefined {
  return typeof source === "string" ? undefined : source.headers
}

function sanitizeCacheSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "unknown"
}

function hashCacheKey(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function normalizedSize(
  input: Pick<CoverThumbnailCacheInput, "widthPx" | "heightPx">,
) {
  return {
    widthPx: Math.max(1, Math.round(input.widthPx)),
    heightPx: Math.max(1, Math.round(input.heightPx)),
  }
}

function cacheKey(input: CoverThumbnailCacheInput): string {
  const { widthPx, heightPx } = normalizedSize(input)
  return [
    input.libraryId,
    input.bookId,
    input.coverIdentity,
    widthPx,
    heightPx,
    COVER_THUMBNAIL_CACHE_VERSION,
  ].join("|")
}

function thumbnailDirectory(
  input: Pick<CoverThumbnailCacheInput, "heightPx" | "libraryId" | "widthPx">,
): Directory {
  const { widthPx, heightPx } = normalizedSize(input)
  // Expo owns the platform-specific cache root. The app only adds logical
  // child segments so iOS/Android path placement stays in expo-file-system.
  return new Directory(
    Paths.cache,
    COVER_THUMBNAIL_CACHE_ROOT,
    COVER_THUMBNAIL_CACHE_VERSION,
    sanitizeCacheSegment(input.libraryId),
    `${widthPx}x${heightPx}`,
  )
}

export function getCoverThumbnailCacheFileName(
  input: CoverThumbnailCacheInput,
): string {
  return `${sanitizeCacheSegment(input.bookId)}-${hashCacheKey(cacheKey(input))}.jpg`
}

export function getCoverThumbnailCacheFile(
  input: CoverThumbnailCacheInput,
): File {
  const dir = thumbnailDirectory(input)
  return new File(dir, getCoverThumbnailCacheFileName(input))
}

export function getCoverThumbnailCacheFileByName(
  input: CoverThumbnailCacheFileLookup,
): File {
  const dir = thumbnailDirectory(input)
  return new File(dir, input.fileName)
}

function cacheFileInfo(
  file: File,
  fileName: string,
): CoverThumbnailCacheFile | undefined {
  return file.exists && file.size > 0
    ? { fileName, fileSizeBytes: file.size, uri: file.uri }
    : undefined
}

export function getCachedCoverThumbnailUri(
  input: CoverThumbnailCacheInput,
): string | undefined {
  return getCachedCoverThumbnailFile(input)?.uri
}

export function getCachedCoverThumbnailFile(
  input: CoverThumbnailCacheInput,
): CoverThumbnailCacheFile | undefined {
  const fileName = getCoverThumbnailCacheFileName(input)
  const file = getCoverThumbnailCacheFile(input)
  return cacheFileInfo(file, fileName)
}

export function getCachedCoverThumbnailFileByName(
  input: CoverThumbnailCacheFileLookup,
): CoverThumbnailCacheFile | undefined {
  const file = getCoverThumbnailCacheFileByName(input)
  return cacheFileInfo(file, input.fileName)
}

function ensureDirectory(dir: Directory): void {
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true })
  }
}

function isLocalFileUri(uri: string): boolean {
  return uri.startsWith("file:")
}

async function prepareSourceFile(input: CoverThumbnailCacheInput): Promise<{
  uri: string
  cleanup?: () => void
}> {
  const uri = sourceUri(input.source)
  if (isLocalFileUri(uri)) {
    return { uri }
  }

  const tmpDir = new Directory(Paths.cache, COVER_THUMBNAIL_CACHE_ROOT, "tmp")
  ensureDirectory(tmpDir)
  const tmpSource = new File(
    tmpDir,
    `${hashCacheKey(cacheKey(input))}.source.jpg`,
  )
  const headers = sourceHeaders(input.source)
  try {
    await File.downloadFileAsync(
      uri,
      tmpSource,
      headers ? { headers, idempotent: true } : { idempotent: true },
    )
  } catch (error) {
    if (tmpSource.exists) {
      tmpSource.delete()
    }
    throw error
  }

  return {
    uri: tmpSource.uri,
    cleanup: () => {
      if (tmpSource.exists) {
        tmpSource.delete()
      }
    },
  }
}

async function renderCoverThumbnail(
  sourceFileUri: string,
  widthPx: number,
  heightPx: number,
) {
  const sourceSize = await readSourceImageSize(sourceFileUri)
  const sourceAspect = sourceSize.width / sourceSize.height
  const targetAspect = widthPx / heightPx
  const context = ImageManipulator.manipulate(sourceFileUri)

  if (!Number.isFinite(sourceAspect) || sourceAspect <= 0) {
    context.resize({ width: widthPx, height: heightPx })
  } else if (sourceAspect > targetAspect) {
    const resizedWidth = Math.ceil(heightPx * sourceAspect)
    context.resize({ height: heightPx })
    context.crop({
      originX: Math.max(0, Math.floor((resizedWidth - widthPx) / 2)),
      originY: 0,
      width: widthPx,
      height: heightPx,
    })
  } else {
    const resizedHeight = Math.ceil(widthPx / sourceAspect)
    context.resize({ width: widthPx })
    context.crop({
      originX: 0,
      originY: Math.max(0, Math.floor((resizedHeight - heightPx) / 2)),
      width: widthPx,
      height: heightPx,
    })
  }

  let image: Awaited<ReturnType<typeof context.renderAsync>> | undefined
  try {
    image = await context.renderAsync()
    return await image.saveAsync({
      compress: COVER_THUMBNAIL_JPEG_COMPRESS,
      format: SaveFormat.JPEG,
    })
  } finally {
    image?.release()
    context.release()
  }
}

async function readSourceImageSize(sourceFileUri: string): Promise<{
  width: number
  height: number
}> {
  try {
    // RN's image loader can read dimensions without creating an ImageManipulator
    // render context. Cold library scrolls may build many thumbnails, so avoid
    // paying ImageManipulator's decode/render cost twice per cover.
    return await ReactNativeImage.getSize(sourceFileUri)
  } catch {
    const metadataContext = ImageManipulator.manipulate(sourceFileUri)
    const sourceRef = await metadataContext.renderAsync()
    try {
      return { width: sourceRef.width, height: sourceRef.height }
    } finally {
      sourceRef.release()
      metadataContext.release()
    }
  }
}

async function createCoverThumbnail(
  input: CoverThumbnailCacheInput,
): Promise<CoverThumbnailCacheFile> {
  const fileName = getCoverThumbnailCacheFileName(input)
  const finalFile = getCoverThumbnailCacheFile(input)
  if (finalFile.exists && finalFile.size > 0) {
    return {
      fileName,
      fileSizeBytes: finalFile.size,
      uri: finalFile.uri,
    }
  }

  const dir = thumbnailDirectory(input)
  ensureDirectory(dir)
  const { widthPx, heightPx } = normalizedSize(input)
  const prepared = await prepareSourceFile(input)

  try {
    const result = await renderCoverThumbnail(prepared.uri, widthPx, heightPx)
    const renderedFile = new File(result.uri)
    await renderedFile.move(finalFile, { overwrite: true })
    const savedFile = new File(finalFile.uri)
    return {
      fileName,
      fileSizeBytes: savedFile.size,
      uri: savedFile.uri,
    }
  } finally {
    prepared.cleanup?.()
  }
}

export function ensureCoverThumbnailFileAsync(
  input: CoverThumbnailCacheInput,
): Promise<CoverThumbnailCacheFile> {
  const key = cacheKey(input)
  const existing = inFlightThumbnails.get(key)
  if (existing) {
    return existing
  }

  const promise = createCoverThumbnail(input).finally(() => {
    inFlightThumbnails.delete(key)
  })
  inFlightThumbnails.set(key, promise)
  return promise
}

export async function ensureCoverThumbnailAsync(
  input: CoverThumbnailCacheInput,
): Promise<string> {
  const file = await ensureCoverThumbnailFileAsync(input)
  return file.uri
}

export function clearCoverThumbnailCache(): void {
  const dir = new Directory(Paths.cache, COVER_THUMBNAIL_CACHE_ROOT)
  if (dir.exists) {
    dir.delete()
  }
}
