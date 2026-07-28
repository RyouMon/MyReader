package com.myreader.core

import com.myreader.core.uniffi.CoreFfiException
import com.myreader.core.uniffi.coreContractVersion
import com.myreader.core.uniffi.invokeCoreAsync
import com.myreader.core.uniffi.invokeCoreSync
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MyReaderCoreModule : Module() {
  private fun <T> coreCall(operation: () -> T): T = try {
    operation()
  } catch (error: CoreFfiException) {
    when (error) {
      is CoreFfiException.Core ->
        throw CodedException("CORE_ERROR", error.v1, error)
      is CoreFfiException.Sync ->
        throw CodedException("SYNC_ERROR", error.v1, error)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("MyReaderCore")

    Function("coreContractVersion") {
      coreContractVersion()
    }
    Function("invokeCoreSync") { requestJson: String ->
      coreCall {
        invokeCoreSync(requestJson)
      }
    }
    AsyncFunction("invokeCoreAsync") { requestJson: String ->
      coreCall {
        invokeCoreAsync(requestJson)
      }
    }
  }
}
