import type { DataSource } from "@my-reader/tools/types/data-source"
import type { RemoteCredential as CoreRemoteCredential } from "my-reader-core"
import { CredentialError } from "@/src/errors"
import { refreshCloudAccessToken } from "../auth/cloud"
import { refreshAccessToken } from "../auth/onedrive"
import {
  type DataSourceSecrets,
  readOneDriveRefreshToken,
  readS3Credentials,
  readWebDavPassword,
} from "../storage/credentials"

/** Resolves the current platform credential for one provider operation. */
export async function resolveRemoteCredential(
  source: DataSource,
  secrets?: DataSourceSecrets,
): Promise<CoreRemoteCredential> {
  switch (source.type) {
    case "webdav":
      return resolveWebDavCredential(source, secrets)
    case "s3":
      return resolveS3Credential(source, secrets)
    case "gdrive":
    case "dropbox":
      return resolveCloudCredential(source, secrets)
    case "onedrive":
      return resolveOneDriveCredential(source, secrets)
  }
}

async function resolveWebDavCredential(
  source: Extract<DataSource, { type: "webdav" }>,
  secrets?: DataSourceSecrets,
): Promise<CoreRemoteCredential> {
  const password =
    secrets?.type === "webdav"
      ? secrets.password
      : await readWebDavPassword(source.id)
  if (!password) throw new CredentialError("WEBDAV_PASSWORD_REQUIRED")
  return { kind: "webdav", password }
}

async function resolveS3Credential(
  source: Extract<DataSource, { type: "s3" }>,
  secrets?: DataSourceSecrets,
): Promise<CoreRemoteCredential> {
  const credentials =
    secrets?.type === "s3" ? secrets : await readS3Credentials(source.id)
  if (!credentials) throw new CredentialError("S3_CREDENTIALS_REQUIRED")
  return {
    kind: "s3",
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
  }
}

async function resolveCloudCredential(
  source: Extract<DataSource, { type: "gdrive" | "dropbox" }>,
  secrets?: DataSourceSecrets,
): Promise<CoreRemoteCredential> {
  if (secrets?.type === source.type && secrets.accessToken) {
    return { kind: source.type, accessToken: secrets.accessToken }
  }
  const { accessToken } = await refreshCloudAccessToken(
    source.id,
    source.type,
    source.clientId,
  )
  return { kind: source.type, accessToken }
}

async function resolveOneDriveCredential(
  source: Extract<DataSource, { type: "onedrive" }>,
  secrets?: DataSourceSecrets,
): Promise<CoreRemoteCredential> {
  if (secrets?.type === "onedrive" && secrets.accessToken) {
    return { kind: "onedrive", accessToken: secrets.accessToken }
  }
  if (!(await readOneDriveRefreshToken(source.id))) {
    throw new CredentialError("ONEDRIVE_REFRESH_TOKEN_REQUIRED")
  }
  const { accessToken } = await refreshAccessToken(source.id)
  return { kind: "onedrive", accessToken }
}
