package com.myreader.readium.Converters

import com.myreader.readium.Types.LocatorLocationsRecord
import com.myreader.readium.Types.LocatorRecord
import com.myreader.readium.Types.LocatorTextRecord
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class LocatorContractTest {
  private val fixture: JsonObject by lazy {
    val resource = requireNotNull(
      javaClass.classLoader?.getResourceAsStream("reader-locator-contract.json")
    )
    val json = resource.bufferedReader().use { it.readText() }
    Json.parseToJsonElement(json).jsonObject
  }

  @Test
  fun should_preserve_publication_metadata_when_reader_locator_crosses_android_bridge() {
    val actual = roundTrip(fixture)

    assertEquals(fixture.getValue("href"), actual.getValue("href"))
    assertEquals(fixture.getValue("type"), actual.getValue("type"))
    assertEquals(fixture.getValue("title"), actual.getValue("title"))
  }

  @Test
  fun should_preserve_readium_locations_when_reader_locator_crosses_android_bridge() {
    val expected = fixture.getValue("locations").jsonObject

    val actual = roundTrip(fixture).getValue("locations").jsonObject

    assertEquals(expected.getValue("fragments"), actual.getValue("fragments"))
    assertEquals(expected.getValue("progression"), actual.getValue("progression"))
    assertEquals(expected.getValue("position"), actual.getValue("position"))
    assertEquals(
      expected.getValue("totalProgression"),
      actual.getValue("totalProgression"),
    )
  }

  @Test
  fun should_preserve_app_owned_anchors_when_reader_locator_crosses_android_bridge() {
    val expectedLocations = fixture.getValue("locations").jsonObject

    val actual = roundTrip(fixture)
    val actualLocations = actual.getValue("locations").jsonObject

    assertEquals(
      expectedLocations.getValue("cssSelector"),
      actualLocations.getValue("cssSelector"),
    )
    assertEquals(
      expectedLocations.getValue("partialCfi"),
      actualLocations.getValue("partialCfi"),
    )
    assertEquals(
      expectedLocations.getValue("domRange"),
      actualLocations.getValue("domRange"),
    )
  }

  @Test
  fun should_preserve_surrounding_text_when_reader_locator_crosses_android_bridge() {
    val actual = roundTrip(fixture)

    assertEquals(fixture.getValue("text"), actual.getValue("text"))
  }
}

private fun roundTrip(input: JsonObject): JsonObject {
  val readiumLocator = requireNotNull(locatorRecordToReadium(input.toRecord()))
  return readiumLocatorToMap(readiumLocator).toJsonObject()
}

private fun JsonObject.toRecord(): LocatorRecord {
  val locations = getValue("locations").jsonObject
  val text = getValue("text").jsonObject

  return LocatorRecord(
    href = string("href"),
    type = string("type"),
    title = string("title"),
    locations = LocatorLocationsRecord(
      fragments = locations.getValue("fragments").jsonArray.map {
        it.jsonPrimitive.content
      },
      progression = locations.getValue("progression").jsonPrimitive.double,
      position = locations.getValue("position").jsonPrimitive.double,
      totalProgression = locations.getValue("totalProgression").jsonPrimitive.double,
      cssSelector = locations.string("cssSelector"),
      partialCfi = locations.string("partialCfi"),
      domRange = locations.getValue("domRange").jsonObject.toBridgeMap(),
    ),
    text = LocatorTextRecord(
      before = text.string("before"),
      highlight = text.string("highlight"),
      after = text.string("after"),
    ),
  )
}

private fun JsonObject.string(key: String): String =
  getValue(key).jsonPrimitive.content

private fun JsonObject.toBridgeMap(): Map<String, Any> =
  entries.associate { (key, value) -> key to requireNotNull(value.toBridgeValue()) }

private fun JsonElement.toBridgeValue(): Any? = when (this) {
  JsonNull -> null
  is JsonObject -> mapValues { (_, value) -> value.toBridgeValue() }
  is JsonArray -> map { it.toBridgeValue() }
  is JsonPrimitive ->
    if (isString) content else booleanOrNull ?: longOrNull ?: doubleOrNull
}

private fun Map<*, *>.toJsonObject(): JsonObject =
  JsonObject(entries.associate { (key, value) ->
    require(key is String)
    key to value.toJsonElement()
  })

private fun Any?.toJsonElement(): JsonElement = when (this) {
  null -> JsonNull
  is String -> JsonPrimitive(this)
  is Boolean -> JsonPrimitive(this)
  is Byte -> JsonPrimitive(this)
  is Short -> JsonPrimitive(this)
  is Int -> JsonPrimitive(this)
  is Long -> JsonPrimitive(this)
  is Float -> JsonPrimitive(this)
  is Double -> JsonPrimitive(this)
  is Map<*, *> -> toJsonObject()
  is Iterable<*> -> JsonArray(map { it.toJsonElement() })
  else -> error("Unsupported bridge value: ${this::class.qualifiedName}")
}
