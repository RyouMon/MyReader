import { WebDavUrlBuilder } from "../../webdav/url-builder"
import type { DataSourceWebdav } from "@my-reader/tools/types/data-source"

type WebDavDataSource = DataSourceWebdav & { password: string }

export async function testConnection(
  source: WebDavDataSource,
): Promise<Response> {
  const urlBuilder = new WebDavUrlBuilder(source)
  const response = await fetch(urlBuilder.urlFor(""), {
    method: "PROPFIND",
    headers: { ...urlBuilder.authHeaders, Depth: "0" },
  })
  return response
}
