import { WebDavUrlBuilder } from "../services/webdav/url-builder";
import type { WebDavDataSource } from "./types";

export async function testConnection(source: WebDavDataSource): Promise<Response> {
  const urlBuilder = new WebDavUrlBuilder(source);
  const response = await fetch(urlBuilder.urlFor(""), {
    method: "PROPFIND",
    headers: { ...urlBuilder.authHeaders, Depth: "0" },
  });
  return response;
}
