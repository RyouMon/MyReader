import Foundation
import Testing
@testable import MyReaderCore

@Test
func should_expose_core_contract_version_when_native_library_loads() {
  #expect(coreContractVersion() == 2)
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

  #expect(coreContractVersion() == 2)
  #expect(object["domain"] as? String == "catalog")
  #expect(catalog["operation"] as? String == "validateLibrary")
  #expect(catalog["output"] as? Bool == false)
}
