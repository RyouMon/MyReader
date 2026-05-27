import { canonicalRelativePathSegments } from "../../services/fs/path";
import { WebDavUrlBuilder } from "../../services/webdav/url-builder";
import { NetworkError } from "../../errors";
import i18n from "@/src/i18n";

import type { BackendKind, DownloadRequest, UploadRequest, RemoteStat, RemoteFileOps, NativeTransferOps } from "./types";
import type { WebDavDataSource } from "../../data/types";

export class WebDavBackend implements RemoteFileOps, NativeTransferOps {
  readonly kind: BackendKind = "webdav";
  private readonly urlBuilder: WebDavUrlBuilder;

  constructor(
    source: WebDavDataSource,
    libraryRootPath: string,
  ) {
    this.urlBuilder = new WebDavUrlBuilder(source, libraryRootPath);
  }

  private authHeader(): Record<string, string> {
    return this.urlBuilder.authHeaders;
  }

  private urlFor(relativePath: string): string {
    return this.urlBuilder.urlFor(relativePath);
  }

  getDownloadRequest(relativePath: string): DownloadRequest {
    return {
      url: this.urlFor(relativePath),
      headers: this.authHeader(),
    };
  }

  getUploadRequest(relativePath: string): UploadRequest {
    return {
      url: this.urlFor(relativePath),
      method: "PUT",
      headers: {
        ...this.authHeader(),
        "Content-Type": "application/octet-stream",
      },
    };
  }

  async readBytes(relativePath: string): Promise<Uint8Array> {
    const response = await fetch(this.urlFor(relativePath), {
      method: "GET",
      headers: this.authHeader(),
    });
    if (!response.ok) {
      throw new NetworkError(i18n.t("sync.webdavGetFailed", { status: response.status, path: relativePath }), response.status);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async writeBytes(relativePath: string, bytes: Uint8Array): Promise<void> {
    await this.prepareUpload(relativePath);
    const response = await fetch(this.urlFor(relativePath), {
      method: "PUT",
      headers: {
        ...this.authHeader(),
        "Content-Type": "application/octet-stream",
      },
      body: bytes as unknown as BodyInit,
    });
    if (!response.ok) {
      throw new NetworkError(i18n.t("sync.webdavPutFailed", { status: response.status, path: relativePath }), response.status);
    }
  }

  async prepareUpload(relativePath: string): Promise<void> {
    await this.ensureParentDirectories(relativePath);
  }

  async deleteRemote(relativePath: string): Promise<void> {
    const response = await fetch(this.urlFor(relativePath), {
      method: "DELETE",
      headers: this.authHeader(),
    });
    if (!response.ok && response.status !== 404) {
      throw new NetworkError(i18n.t("sync.webdavDeleteFailed", { status: response.status, path: relativePath }), response.status);
    }
  }

  async statRemote(relativePath: string): Promise<RemoteStat> {
    const response = await fetch(this.urlFor(relativePath), {
      method: "PROPFIND",
      headers: { ...this.authHeader(), Depth: "0" },
    });
    if (response.status === 404) {
      return { size: 0, mtimeMs: 0, exists: false };
    }
    if (!response.ok) {
      throw new NetworkError(i18n.t("sync.webdavPropfindFailed", { status: response.status, path: relativePath }), response.status);
    }
    const xml = await response.text();
    const size = Number(xml.match(/<[^>]*getcontentlength[^>]*>(\d+)</i)?.[1] ?? 0);
    const lastModified = xml.match(/<[^>]*getlastmodified[^>]*>([^<]+)</i)?.[1];
    const mtimeMs = lastModified ? new Date(lastModified).getTime() || 0 : 0;
    return { size, mtimeMs, exists: true };
  }

  async listRemote(prefix: string): Promise<string[]> {
    const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
    const url = this.urlFor(normalizedPrefix);
    const response = await fetch(url, {
      method: "PROPFIND",
      headers: { ...this.authHeader(), Depth: "1" },
    });
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new NetworkError(
        i18n.t("sync.webdavPropfindListFailed", { status: response.status, path: normalizedPrefix }),
        response.status,
      );
    }
    const xml = await response.text();
    const requestPath = decodeURIComponent(url.replace(/^https?:\/\/[^/]+/, "")).replace(
      /\/?$/,
      "/",
    );
    const children: string[] = [];
    const hrefRegex = /<(?:[^>:]*:)?href>([^<]+)</gi;
    let match: RegExpExecArray | null;
    while ((match = hrefRegex.exec(xml)) !== null) {
      const hrefPath = decodeURIComponent(match[1]!.trim().replace(/^https?:\/\/[^/]+/, ""));
      if (hrefPath.replace(/\/?$/, "/") === requestPath) continue;
      const hrefWithSlash = hrefPath.endsWith("/") ? hrefPath : `${hrefPath}/`;
      if (!hrefWithSlash.startsWith(requestPath)) continue;
      const childRaw = hrefPath.slice(requestPath.length);
      const childName = hrefPath.endsWith("/")
        ? `${childRaw.replace(/\/$/, "")}/`
        : childRaw;
      if (childName && !childName.replace(/\/$/, "").includes("/")) {
        children.push(childName);
      }
    }
    return children;
  }

  private async ensureParentDirectories(relativePath: string): Promise<void> {
    const parts = canonicalRelativePathSegments(relativePath);
    if (parts.length <= 1) return;
    let cursor = "";
    for (let i = 0; i < parts.length - 1; i += 1) {
      cursor = cursor ? `${cursor}/${parts[i]}` : parts[i]!;
      const response = await fetch(this.urlFor(cursor), {
        method: "MKCOL",
        headers: this.authHeader(),
      });
      if (!response.ok && ![201, 301, 405].includes(response.status)) {
        throw new NetworkError(i18n.t("sync.webdavMkcolFailed", { status: response.status, path: cursor }), response.status);
      }
    }
  }
}