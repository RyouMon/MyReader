package com.myreader.readium.Converters

import com.myreader.readium.Types.PreferencesRecord
import org.junit.Assert.assertEquals
import org.junit.Test
import org.readium.r2.navigator.preferences.Axis

class PdfPreferencesContractTest {
  @Test
  fun horizontal_reading_uses_paginated_layout() {
    val preferences = preferencesRecordToPdf(PreferencesRecord(scroll = false))

    assertEquals(false, preferences.scroll)
    assertEquals(Axis.HORIZONTAL, preferences.scrollAxis)
  }

  @Test
  fun vertical_reading_keeps_continuous_scrolling() {
    val preferences = preferencesRecordToPdf(PreferencesRecord(scroll = true))

    assertEquals(true, preferences.scroll)
    assertEquals(Axis.VERTICAL, preferences.scrollAxis)
  }
}
