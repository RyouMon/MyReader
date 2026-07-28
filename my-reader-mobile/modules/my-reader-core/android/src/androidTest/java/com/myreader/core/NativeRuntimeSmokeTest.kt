package com.myreader.core

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.myreader.core.uniffi.coreContractVersion
import com.myreader.core.uniffi.invokeCoreSync
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NativeRuntimeSmokeTest {
  @Test
  fun should_expose_core_contract_version_when_native_library_loads() {
    assertEquals(2U, coreContractVersion())
  }

  @Test
  fun should_route_request_when_native_transport_is_invoked() {
    val request =
      """{"domain":"catalog","request":{"operation":"validateLibrary","input":{"libraryRootPath":"/missing"}}}"""

    val response = JSONObject(invokeCoreSync(request))
    val catalog = response.getJSONObject("response")

    assertEquals(2U, coreContractVersion())
    assertEquals("catalog", response.getString("domain"))
    assertEquals("validateLibrary", catalog.getString("operation"))
    assertEquals(false, catalog.getBoolean("output"))
  }
}
