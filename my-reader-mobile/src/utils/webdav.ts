/**
 * Shared WebDAV URL construction helper used by both the sync backend and
 * the data-layer metadata operations. Auth header construction is delegated
 * to `utils/http.ts#buildHttpBasicAuthHeader` to avoid duplicating btoa
 * fallback logic.
 */

import { buildHttpBasicAuthHeader } from "./http";
import { encodeUrlPathFromChunks } from "./io";
import type { WebDavDataSource } from "../data/types";

export class WebDavUrlBuilder {
  private readonly serverUrl: string;
  private readonly rootPath: string;
  private readonly libraryRoot: string;
  readonly authHeaders: Record<string, string>;

  constructor(source: WebDavDataSource, libraryRoot = "") {
    this.serverUrl = source.endpoint.replace(/\/+$/, "");
    this.rootPath = source.rootPath ?? "";
    this.libraryRoot = libraryRoot;
    this.authHeaders = buildHttpBasicAuthHeader(source.username, source.password);
  }

  urlFor(relativePath: string): string {
    const encoded = encodeUrlPathFromChunks(this.rootPath, this.libraryRoot, relativePath);
    return encoded ? `${this.serverUrl}/${encoded}` : this.serverUrl;
  }
}