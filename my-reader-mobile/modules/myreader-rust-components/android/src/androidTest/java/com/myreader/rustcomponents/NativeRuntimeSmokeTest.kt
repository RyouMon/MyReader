package com.myreader.rustcomponents

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.myreader.rustcomponents.uniffi.migrateLibraryDatabase
import com.myreader.rustcomponents.uniffi.syncContractVersion
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NativeRuntimeSmokeTest {
  @Test
  fun should_expose_contract_version_when_native_library_loads() {
    assertEquals(11U, syncContractVersion())
  }

  @Test
  fun should_create_database_when_native_migration_runs() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val database = File(context.cacheDir, "myreader-rust-components-smoke.db")
    database.delete()

    migrateLibraryDatabase(database.absolutePath)

    assertTrue(database.exists())
    database.delete()
  }
}
