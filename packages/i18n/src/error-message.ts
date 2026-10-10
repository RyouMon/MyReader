const ERROR_MESSAGES = {
  Request: "operationError.connectivity",
  Storage: "operationError.connectivity",
  Network: "operationError.connectivity",
  connectivity: "operationError.connectivity",
  Auth: "operationError.credential",
  Credential: "operationError.credential",
  credential: "operationError.credential",
  Config: "operationError.configuration",
  configuration: "operationError.configuration",
  LibraryAlreadyExists: "operationError.configuration",
  LibraryRootNotEmpty: "operationError.configuration",
  LibraryFolderAlreadyExists: "operationError.configuration",
  DataSourceInUse: "operationError.configuration",
  NotFound: "operationError.notFound",
  LibraryNotFound: "operationError.notFound",
  NoActiveLibrary: "operationError.notFound",
  MetadataDbNotFound: "operationError.notFound",
  LibraryMarkerNotFound: "operationError.notFound",
  Io: "operationError.io",
  DataIntegrity: "operationError.dataIntegrity",
  LibraryContainsMetadataDb: "operationError.dataIntegrity",
  data_integrity: "operationError.dataIntegrity",
  Tts: "operationError.tts",
} as const

/** Only stable categories select UI copy; diagnostics never become translation keys. */
export function errorMessageKey(kind?: string) {
  return kind && Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, kind)
    ? ERROR_MESSAGES[kind as keyof typeof ERROR_MESSAGES]
    : "operationError.unexpected"
}
