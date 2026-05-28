import { File, Paths } from "expo-file-system";
import ky from "ky";

import { GRAPH_API_BASE } from "../../constants/onedrive";
import { getValidAccessToken, refreshAccessToken } from "../../services/auth/onedrive";
import { canonicalRelativePathSegments } from "../../services/fs/path";
import { NetworkError } from "../../errors";
import i18n from "@/src/i18n";

import type { RemoteBackend, RemoteFileStat, RemoteDirEntry, DownloadRequest, UploadRequest, PreparedUpload } from "../backend";

type DriveItem = {
  id: string;
  name: string;
  size?: number;
  cTag?: string;
  lastModifiedDateTime?: string;
  file?: { mimeType: string };
  folder?: { childCount: number };
  deleted?: object;
  parentReference?: { path: string };
};

type DriveChildrenResponse = {
  value: DriveItem[];
  "@odata.nextLink"?: string;
};

export class OneDriveRemoteBackend implements RemoteBackend {
  readonly kind = "onedrive" as const;
  readonly dataSourceId: string;

  private readonly libraryRootPath: string;

  constructor(dataSourceId: string, libraryRootPath: string) {
    this.dataSourceId = dataSourceId;
    this.libraryRootPath = libraryRootPath;
  }

  // -- Auth --

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await getValidAccessToken(this.dataSourceId);
    return { Authorization: `Bearer ${token}` };
  }

  getCachedAuthHeaders(): Record<string, string> | null {
    return null;
  }

  invalidateAuth(): void {
    // Phase 2 will add AuthCache integration
  }

  // -- Stat --

  async statRemoteFile(remotePath: string): Promise<RemoteFileStat | null> {
    const url = this.itemUrl(remotePath);
    try {
      const res = await this.fetchWithAuth(url, { method: "GET" });
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new NetworkError(
          i18n.t("sync.onedriveGetFailed", { status: res.status, path: remotePath }),
          res.status,
        );
      }
      const item = await res.json() as DriveItem;
      return {
        etag: item.cTag ?? "",
        size: item.size ?? 0,
        mtimeMs: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime).getTime() : 0,
      };
    } catch (e) {
      if (e instanceof NetworkError) throw e;
      return null;
    }
  }

  // -- Transfer --

  async readBytes(remotePath: string): Promise<Uint8Array> {
    const res = await this.fetchWithAuth(this.contentUrl(remotePath), { method: "GET" });
    if (!res.ok) {
      throw new NetworkError(
        i18n.t("sync.onedriveGetFailed", { status: res.status, path: remotePath }),
        res.status,
      );
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  async writeBytes(remotePath: string, bytes: Uint8Array): Promise<void> {
    await this.ensureParentDirectories(remotePath);
    const res = await this.fetchWithAuth(this.contentUrl(remotePath), {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes as unknown as BodyInit,
    });
    if (!res.ok) {
      throw new NetworkError(
        i18n.t("sync.onedrivePutFailed", { status: res.status, path: remotePath }),
        res.status,
      );
    }
  }

  async deleteRemote(remotePath: string): Promise<void> {
    const res = await this.fetchWithAuth(this.itemUrl(remotePath), { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      throw new NetworkError(
        i18n.t("sync.onedriveDeleteFailed", { status: res.status, path: remotePath }),
        res.status,
      );
    }
  }

  async listRemote(prefix: string): Promise<string[]> {
    const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
    const res = await this.fetchWithAuth(this.childrenUrl(normalizedPrefix), { method: "GET" });
    if (res.status === 404) return [];
    if (!res.ok) {
      throw new NetworkError(
        i18n.t("sync.onedriveListFailed", { status: res.status, path: normalizedPrefix }),
        res.status,
      );
    }
    const data = await res.json() as { value: Array<{ name: string; folder?: object }> };
    return data.value.map((item) =>
      item.folder ? `${item.name}/` : item.name,
    );
  }

  async downloadToCache(remotePath: string, localName: string): Promise<File> {
    const headers = await this.getAuthHeaders();
    const encodedPath = encodeURI(remotePath.startsWith("/") ? remotePath : `/${remotePath}`);
    const url = `${GRAPH_API_BASE}/me/drive/root:${encodedPath}:/content`;

    const response = await ky(url, { headers });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const file = new File(Paths.cache, localName);

    if (!file.exists) {
      file.create({ intermediates: true, overwrite: true });
    }

    file.write(bytes);
    return file;
  }

  async getDownloadRequest(remotePath: string, localFileUri: string): Promise<DownloadRequest> {
    const headers = await this.getAuthHeaders();
    return { remotePath, localFileUri, headers };
  }

  async getUploadRequest(localFileUri: string, remotePath: string): Promise<UploadRequest> {
    const headers = await this.getAuthHeaders();
    return { localFileUri, remotePath, headers: { ...headers, "Content-Type": "application/octet-stream" } };
  }

  async prepareUpload(localFileUri: string, remotePath: string): Promise<PreparedUpload> {
    await this.ensureParentDirectories(remotePath);
    return { id: `${Date.now()}`, remotePath, headers: {} };
  }

  // -- Path / URL --

  normalizePath(path: string): string {
    return path.startsWith("/") ? path : `/${path}`;
  }

  contentUrl(remotePath: string): string {
    const path = encodeURI(this.fullPath(remotePath));
    return `${GRAPH_API_BASE}/me/drive/root:${path}:/content`;
  }

  // -- Browse --

  async listDirectory(path: string): Promise<RemoteDirEntry[]> {
    const encodedPath = encodeURI(path.startsWith("/") ? path : `/${path}`);
    const endpoint = encodedPath === "/"
      ? "/me/drive/root/children"
      : `/me/drive/root:${encodedPath}:/children`;

    let allItems: DriveItem[] = [];
    let nextUrl: string | undefined = endpoint;

    while (nextUrl) {
      const data: DriveChildrenResponse = await this.graphGetJson<DriveChildrenResponse>(
        nextUrl.replace(GRAPH_API_BASE, ""),
      );
      allItems = allItems.concat(data.value ?? []);
      nextUrl = data["@odata.nextLink"];
    }

    return allItems
      .filter((item) => item.folder && !item.deleted)
      .map((item) => {
        const parentPath = item.parentReference?.path ?? "";
        const relativeParent = parentPath.replace(/^\/drive\/root:/, "");
        const fullPath = relativeParent ? `${relativeParent}/${item.name}` : item.name;

        return {
          name: item.name,
          path: fullPath,
          isDirectory: true,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }

  // -- Private helpers --

  private fullPath(relativePath: string): string {
    return this.libraryRootPath
      ? `${this.libraryRootPath}/${relativePath}`
      : relativePath;
  }

  private itemUrl(relativePath: string): string {
    const path = encodeURI(this.fullPath(relativePath));
    return `${GRAPH_API_BASE}/me/drive/root:${path}`;
  }

  private childrenUrl(prefix: string): string {
    const path = encodeURI(this.fullPath(prefix));
    return `${GRAPH_API_BASE}/me/drive/root:${path}:/children`;
  }

  private async fetchWithAuth(url: string, init: RequestInit): Promise<Response> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> ?? {}) } });

    if (res.status === 401) {
      await refreshAccessToken(this.dataSourceId);
      const retryHeaders = await this.getAuthHeaders();
      return fetch(url, { ...init, headers: { ...retryHeaders, ...(init.headers as Record<string, string> ?? {}) } });
    }

    return res;
  }

  private async graphGetJson<T>(graphPath: string): Promise<T> {
    const headers = await this.getAuthHeaders();
    const res = await ky(`${GRAPH_API_BASE}${graphPath}`, {
      headers,
      throwHttpErrors: false,
    });
    if (res.status === 401) {
      await refreshAccessToken(this.dataSourceId);
      const retryHeaders = await this.getAuthHeaders();
      const retryRes = await ky(`${GRAPH_API_BASE}${graphPath}`, {
        headers: retryHeaders,
        throwHttpErrors: false,
      });
      return (await retryRes.json()) as T;
    }
    return (await res.json()) as T;
  }

  private async ensureParentDirectories(relativePath: string): Promise<void> {
    const parts = canonicalRelativePathSegments(relativePath);
    if (parts.length <= 1) return;

    let cursor = "";
    for (let i = 0; i < parts.length - 1; i += 1) {
      cursor = cursor ? `${cursor}/${parts[i]}` : parts[i]!;

      const statRes = await this.fetchWithAuth(this.itemUrl(cursor), { method: "GET" });
      if (statRes.ok) continue;

      const parentParts = cursor.split("/");
      const folderName = parentParts.pop()!;
      const parentPath = parentParts.join("/");

      const createUrl = parentPath
        ? this.childrenUrl(parentPath)
        : `${GRAPH_API_BASE}/me/drive/root/children`;

      const createRes = await this.fetchWithAuth(createUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderName, folder: {} }),
      });

      if (!createRes.ok && createRes.status !== 409) {
        throw new NetworkError(
          i18n.t("sync.onedriveMkdirFailed", { status: createRes.status, path: cursor }),
          createRes.status,
        );
      }
    }
  }
}
