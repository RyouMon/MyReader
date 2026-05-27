import { canonicalRelativePathSegments } from "../../services/fs/path";
import { NetworkError } from "../../errors";
import { GRAPH_API_BASE } from "../../constants/onedrive";
import { getValidAccessToken, refreshAccessToken } from "../../services/auth/onedrive";
import i18n from "@/src/i18n";

import type { BackendKind, DownloadRequest, UploadRequest, RemoteStat, RemoteFileOps, NativeTransferOps } from "./types";

export class OneDriveBackend implements RemoteFileOps, NativeTransferOps {
  readonly kind: BackendKind = "onedrive";

  constructor(
    private readonly dataSourceId: string,
    private readonly libraryRootPath: string,
  ) {}

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await getValidAccessToken(this.dataSourceId);
    return { Authorization: `Bearer ${token}` };
  }

  private fullPath(relativePath: string): string {
    return this.libraryRootPath
      ? `${this.libraryRootPath}/${relativePath}`
      : relativePath;
  }

  private contentUrl(relativePath: string): string {
    const path = encodeURI(this.fullPath(relativePath));
    return `${GRAPH_API_BASE}/me/drive/root:${path}:/content`;
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
    const headers = await this.authHeaders();
    const res = await fetch(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> ?? {}) } });

    if (res.status === 401) {
      await refreshAccessToken(this.dataSourceId);
      const retryHeaders = await this.authHeaders();
      return fetch(url, { ...init, headers: { ...retryHeaders, ...(init.headers as Record<string, string> ?? {}) } });
    }

    return res;
  }

  getDownloadRequest(relativePath: string): DownloadRequest {
    // Note: auth headers must be set by the caller since this method is sync.
    // The native download adapter will add headers from getUploadRequest.
    // For OneDrive, the caller must inject the Bearer token before starting.
    return {
      url: this.contentUrl(relativePath),
    };
  }

  getUploadRequest(relativePath: string): UploadRequest {
    return {
      url: this.contentUrl(relativePath),
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
    };
  }

  async readBytes(relativePath: string): Promise<Uint8Array> {
    const res = await this.fetchWithAuth(this.contentUrl(relativePath), { method: "GET" });
    if (!res.ok) {
      throw new NetworkError(
        i18n.t("sync.onedriveGetFailed", { status: res.status, path: relativePath }),
        res.status,
      );
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  async writeBytes(relativePath: string, bytes: Uint8Array): Promise<void> {
    await this.prepareUpload(relativePath);
    const res = await this.fetchWithAuth(this.contentUrl(relativePath), {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes as unknown as BodyInit,
    });
    if (!res.ok) {
      throw new NetworkError(
        i18n.t("sync.onedrivePutFailed", { status: res.status, path: relativePath }),
        res.status,
      );
    }
  }

  async prepareUpload(relativePath: string): Promise<void> {
    await this.ensureParentDirectories(relativePath);
  }

  async deleteRemote(relativePath: string): Promise<void> {
    const res = await this.fetchWithAuth(this.itemUrl(relativePath), { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      throw new NetworkError(
        i18n.t("sync.onedriveDeleteFailed", { status: res.status, path: relativePath }),
        res.status,
      );
    }
  }

  async statRemote(relativePath: string): Promise<RemoteStat> {
    const res = await this.fetchWithAuth(this.itemUrl(relativePath), { method: "GET" });
    if (res.status === 404) {
      return { size: 0, mtimeMs: 0, exists: false };
    }
    if (!res.ok) {
      throw new NetworkError(
        i18n.t("sync.onedriveGetFailed", { status: res.status, path: relativePath }),
        res.status,
      );
    }
    const item = await res.json() as { size?: number; lastModifiedDateTime?: string };
    return {
      size: item.size ?? 0,
      mtimeMs: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime).getTime() : 0,
      exists: true,
    };
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

  private async ensureParentDirectories(relativePath: string): Promise<void> {
    const parts = canonicalRelativePathSegments(relativePath);
    if (parts.length <= 1) return;

    let cursor = "";
    for (let i = 0; i < parts.length - 1; i += 1) {
      cursor = cursor ? `${cursor}/${parts[i]}` : parts[i]!;

      // Check if folder exists
      const statRes = await this.fetchWithAuth(this.itemUrl(cursor), { method: "GET" });
      if (statRes.ok) continue; // Folder exists

      // Create folder in parent
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