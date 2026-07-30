import Foundation
import Testing
@testable import MyReaderRustComponents

@Test
func should_expose_contract_version_when_native_library_loads() {
  #expect(syncContractVersion() == 11)
}

@Test
func should_create_database_when_native_migration_runs() throws {
  let database = FileManager.default.temporaryDirectory
    .appendingPathComponent(UUID().uuidString)
    .appendingPathExtension("db")
  defer {
    try? FileManager.default.removeItem(at: database)
  }

  try migrateLibraryDatabase(databasePath: database.path)

  #expect(FileManager.default.fileExists(atPath: database.path))
}
