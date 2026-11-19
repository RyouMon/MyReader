import type {
  DataSourceDropbox,
  DataSourceGdrive,
  DataSourceS3,
} from "@my-reader/tools/types/data-source"

export type CloudProvider = "gdrive" | "dropbox" | "s3"

export type OAuthCloudProvider = Exclude<CloudProvider, "s3">

export type CloudDataSource =
  | DataSourceGdrive
  | DataSourceDropbox
  | DataSourceS3

export function isOAuthCloudProvider(
  provider: CloudProvider,
): provider is OAuthCloudProvider {
  return provider === "gdrive" || provider === "dropbox"
}

export function providerTitle(provider: CloudProvider): string {
  switch (provider) {
    case "gdrive":
      return "Google Drive"
    case "dropbox":
      return "Dropbox"
    case "s3":
      return "S3"
  }
}

export function cloudSourceIcon(provider: CloudProvider) {
  switch (provider) {
    case "gdrive":
      return "gdriveDataSource" as const
    case "dropbox":
      return "dropboxDataSource" as const
    case "s3":
      return "s3DataSource" as const
  }
}

export function cloudSourcePath(provider: CloudProvider): string {
  return `/settings/${provider}`
}

export function cloudAddPath(provider: CloudProvider): string {
  return `/settings/${provider}/add`
}

export function cloudBrowserPath(provider: CloudProvider): string {
  return `/settings/${provider}/browser`
}

export function cloudDetailPath(provider: CloudProvider): string {
  return `/settings/${provider}/[dataSourceId]`
}

export function cloudDataSource(
  provider: OAuthCloudProvider,
  input: {
    id?: string
    clientId: string
    accountId: string
    displayName: string
    email: string
    hasRefreshToken: boolean
  },
): DataSourceGdrive | DataSourceDropbox {
  return {
    id: input.id ?? "",
    type: provider,
    name: input.displayName || input.email || providerTitle(provider),
    enabled: true,
    clientId: input.clientId,
    accountId: input.accountId || null,
    displayName: input.displayName || null,
    email: input.email || null,
    rootPath: null,
    hasRefreshToken: input.hasRefreshToken,
  }
}
