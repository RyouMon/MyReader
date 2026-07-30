import Foundation
import Testing
@testable import MyReaderRustComponents

@Test
func should_expose_sync_contract_version_when_native_library_loads() {
  #expect(syncContractVersion() == 11)
}

@Test
func should_route_request_when_native_transport_is_invoked() throws {
  let request = """
    {"domain":"catalog","request":{"operation":"validateLibrary","input":{"libraryRootPath":"/missing"}}}
    """

  let response = try invokeCoreSync(requestJson: request)
  let object = try #require(
    JSONSerialization.jsonObject(with: Data(response.utf8)) as? [String: Any]
  )
  let catalog = try #require(object["response"] as? [String: Any])

  #expect(coreContractVersion() == 1)
  #expect(object["domain"] as? String == "catalog")
  #expect(catalog["operation"] as? String == "validateLibrary")
  #expect(catalog["output"] as? Bool == false)
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
