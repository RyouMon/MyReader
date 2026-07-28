import ExpoModulesCore

private func coreCall<T>(_ operation: () throws -> T) throws -> T {
  do {
    return try operation()
  } catch let CoreFfiError.Core(message) {
    throw Exception(
      name: "MyReaderCoreException",
      description: message,
      code: "CORE_ERROR"
    )
  } catch let CoreFfiError.Sync(message) {
    throw Exception(
      name: "MyReaderCoreSyncException",
      description: message,
      code: "SYNC_ERROR"
    )
  } catch {
    throw Exception(
      name: "MyReaderCoreException",
      description: error.localizedDescription,
      code: "CORE_ERROR"
    )
  }
}

public class MyReaderCoreModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MyReaderCore")

    Function("coreContractVersion") {
      coreContractVersion()
    }

    Function("invokeCoreSync") {
      (requestJson: String) in
      try coreCall {
        try invokeCoreSync(requestJson: requestJson)
      }
    }

    AsyncFunction("invokeCoreAsync") {
      (requestJson: String) in
      try coreCall {
        try invokeCoreAsync(requestJson: requestJson)
      }
    }
  }
}
