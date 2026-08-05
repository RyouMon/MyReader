import { Directory, File } from "expo-file-system"
import ky from "ky"

import i18n from "@/src/i18n"
import { GRAPH_API_BASE } from "../../../constants/onedrive"
import { NetworkError } from "../../../errors"
import {
  invalidateOneDriveAccessToken,
  refreshAccessToken,
} from "../../auth/onedrive"
import {
  canonicalRelativePathSegments,
  parentDirectoryUriForFileUri,
} from "../../fs/path"
import {
  getCachedAuth,
  invalidateCachedAuth,
  setCachedAuth,
} from "../auth-cache"

import type {
  DownloadRequest,
  PreparedUpload,
  RemoteBackend,
  RemoteFileStat,
  UploadRequest,
} from "../backend"

type DriveItem = {
  size?: number
  cTag?: string
  lastModifiedDateTime?: string
  "@microsoft.graph.downloadUrl"?: string
}

export class OneDriveRemoteBackend implements RemoteBackend {
  readonly kind = "onedrive" as const
  readonly dataSourceId: string

  private readonly libraryRootPath: string
  constructor(dataSourceId: string, libraryRootPath: string) {
    this.dataSourceId = dataSourceId
    this.libraryRootPath = libraryRootPath
  }

  // -- Auth --

  async getAuthHeaders(): Promise<Record<string, string>> {
    const cached = getCachedAuth(this.dataSourceId)
    if (cached) return cached

    const { accessToken, expiresAt } = await refreshAccessToken(
      this.dataSourceId,
    )
    const headers = { Authorization: `Bearer ${accessToken}` }
    setCachedAuth(this.dataSourceId, headers, expiresAt)
    return headers
  }

  getCachedAuthHeaders(): Record<string, string> | null {
    return getCachedAuth(this.dataSourceId)
  }

  invalidateAuth(): void {
    invalidateCachedAuth(this.dataSourceId)
    invalidateOneDriveAccessToken(this.dataSourceId)
  }

  // -- Stat --

  async statRemoteFile(remotePath: string): Promise<RemoteFileStat | null> {
    const url = this.itemUrl(remotePath)
    try {
      const res = await this.fetchWithAuth(url, { method: "GET" })
      if (res.status === 404) return null
      if (!res.ok) {
        throw new NetworkError(
          i18n.t("sync.onedriveGetFailed", {
            status: res.status,
            path: remotePath,
          }),
          res.status,
        )
      }
      const item = (await res.json()) as DriveItem
      return {
        etag: item.cTag ?? "",
        size: item.size ?? 0,
        mtimeMs: item.lastModifiedDateTime
          ? new Date(item.lastModifiedDateTime).getTime()
          : 0,
      }
    } catch (e) {
      if (e instanceof NetworkError) throw e
      return null
    }
  }

  // -- Transfer --

  async readBytes(remotePath: string): Promise<Uint8Array> {
    const res = await this.fetchWithAuth(this.contentUrl(remotePath), {
      method: "GET",
    })
    if (!res.ok) {
      throw new NetworkError(
        i18n.t("sync.onedriveGetFailed", {
          status: res.status,
          path: remotePath,
        }),
        res.status,
      )
    }
    return new Uint8Array(await res.arrayBuffer())
  }

  async writeBytes(remotePath: string, bytes: Uint8Array): Promise<void> {
    await this.ensureParentDirectories(remotePath)
    const res = await this.fetchWithAuth(this.contentUrl(remotePath), {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes as unknown as BodyInit,
    })
    if (!res.ok) {
      throw new NetworkError(
        i18n.t("sync.onedrivePutFailed", {
          status: res.status,
          path: remotePath,
        }),
        res.status,
      )
    }
  }

  async deleteRemote(remotePath: string): Promise<void> {
    const res = await this.fetchWithAuth(this.itemUrl(remotePath), {
      method: "DELETE",
    })
    if (!res.ok && res.status !== 404) {
      throw new NetworkError(
        i18n.t("sync.onedriveDeleteFailed", {
          status: res.status,
          path: remotePath,
        }),
        res.status,
      )
    }
  }

  async listRemote(prefix: string): Promise<string[]> {
    const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`
    const res = await this.fetchWithAuth(this.childrenUrl(normalizedPrefix), {
      method: "GET",
    })
    if (res.status === 404) return []
    if (!res.ok) {
      throw new NetworkError(
        i18n.t("sync.onedriveListFailed", {
          status: res.status,
          path: normalizedPrefix,
        }),
        res.status,
      )
    }
    const data = (await res.json()) as {
      value: { name: string; folder?: object }[]
    }
    return data.value.map((item) => (item.folder ? `${item.name}/` : item.name))
  }

  async downloadToUri(remotePath: string, localFileUri: string): Promise<File> {
    const headers = await this.getAuthHeaders()
    const url = `${GRAPH_API_BASE}/me/drive/root:${this.encodedPath(remotePath)}:/content`

    const response = await ky(url, { headers })
    const bytes = new Uint8Array(await response.arrayBuffer())
    const parentUri = parentDirectoryUriForFileUri(localFileUri)
    if (parentUri) {
      const parent = new Directory(parentUri)
      if (!parent.exists) {
        parent.create({ idempotent: true, intermediates: true })
      }
    }
    const file = new File(localFileUri)

    if (file.exists) {
      file.delete()
    }

    file.create({ intermediates: true, overwrite: true })
    file.write(bytes)
    return file
  }

  async getDownloadRequest(
    remotePath: string,
    localFileUri: string,
  ): Promise<DownloadRequest> {
    const select = encodeURIComponent("id,@microsoft.graph.downloadUrl")
    const res = await this.fetchWithAuth(
      `${this.itemUrl(remotePath)}?select=${select}`,
      { method: "GET" },
    )
    if (!res.ok) {
      throw new NetworkError(
        i18n.t("sync.onedriveGetFailed", {
          status: res.status,
          path: remotePath,
        }),
        res.status,
      )
    }
    const item = (await res.json()) as DriveItem
    const url = item["@microsoft.graph.downloadUrl"]
    if (!url) {
      throw new NetworkError(
        i18n.t("sync.onedriveDownloadUrlMissing", {
          path: remotePath,
        }),
      )
    }
    return { remotePath, localFileUri, url, headers: {} }
  }

  async getUploadRequest(
    localFileUri: string,
    remotePath: string,
  ): Promise<UploadRequest> {
    const headers = await this.getAuthHeaders()
    return {
      localFileUri,
      remotePath,
      headers: { ...headers, "Content-Type": "application/octet-stream" },
    }
  }

  async prepareUpload(
    _localFileUri: string,
    remotePath: string,
  ): Promise<PreparedUpload> {
    await this.ensureParentDirectories(remotePath)
    return { id: `${Date.now()}`, remotePath, headers: {} }
  }

  // -- Path / URL --

  contentUrl(remotePath: string): string {
    return `${GRAPH_API_BASE}/me/drive/root:${this.encodedPath(remotePath)}:/content`
  }

  private encodedPath(remotePath: string): string {
    return this.fullPath(remotePath)
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/")
  }

  // -- Private helpers --

  private fullPath(relativePath: string): string {
    const segments = [
      ...canonicalRelativePathSegments(this.libraryRootPath),
      ...canonicalRelativePathSegments(relativePath),
    ]
    return segments.length ? `/${segments.join("/")}` : ""
  }

  private itemUrl(relativePath: string): string {
    return `${GRAPH_API_BASE}/me/drive/root:${this.encodedPath(relativePath)}`
  }

  private childrenUrl(prefix: string): string {
    const encodedPath = this.encodedPath(prefix)
    return encodedPath
      ? `${GRAPH_API_BASE}/me/drive/root:${encodedPath}:/children`
      : `${GRAPH_API_BASE}/me/drive/root/children`
  }

  private async fetchWithAuth(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(url, {
      ...init,
      headers: {
        ...headers,
        ...((init.headers as Record<string, string>) ?? {}),
      },
    })

    if (res.status === 401) {
      this.invalidateAuth()
      const retryHeaders = await this.getAuthHeaders()
      return fetch(url, {
        ...init,
        headers: {
          ...retryHeaders,
          ...((init.headers as Record<string, string>) ?? {}),
        },
      })
    }

    return res
  }

  private async ensureParentDirectories(relativePath: string): Promise<void> {
    const parts = canonicalRelativePathSegments(relativePath)
    if (parts.length <= 1) return

    let cursor = ""
    for (let i = 0; i < parts.length - 1; i += 1) {
      cursor = cursor ? `${cursor}/${parts[i]}` : parts[i]!

      const statRes = await this.fetchWithAuth(this.itemUrl(cursor), {
        method: "GET",
      })
      if (statRes.ok) continue
      if (statRes.status !== 404) {
        throw new NetworkError(
          i18n.t("sync.onedriveGetFailed", {
            status: statRes.status,
            path: cursor,
          }),
          statRes.status,
        )
      }

      const parentParts = cursor.split("/")
      const folderName = parentParts.pop()!
      const parentPath = parentParts.join("/")

      const createRes = await this.fetchWithAuth(this.childrenUrl(parentPath), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: folderName,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      })

      if (createRes.ok) continue
      if (createRes.status === 409) {
        const conflictStatRes = await this.fetchWithAuth(this.itemUrl(cursor), {
          method: "GET",
        })
        if (conflictStatRes.ok) continue
        if (conflictStatRes.status !== 404) {
          throw new NetworkError(
            i18n.t("sync.onedriveGetFailed", {
              status: conflictStatRes.status,
              path: cursor,
            }),
            conflictStatRes.status,
          )
        }
      }

      throw new NetworkError(
        i18n.t("sync.onedriveMkdirFailed", {
          status: createRes.status,
          path: cursor,
        }),
        createRes.status,
      )
    }
  }
}
