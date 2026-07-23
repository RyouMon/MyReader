import Foundation
import Testing
@testable import Readium

private enum FixtureError: Error {
  case missingResource
  case invalidObject
}

private struct ReaderLocatorFixture: Codable {
  struct Locations: Codable {
    struct DOMRange: Codable, Equatable {
      struct Point: Codable, Equatable {
        let cssSelector: String
        let textNodeIndex: Int
        let charOffset: Int
      }

      let start: Point
      let end: Point
    }

    let fragments: [String]
    let progression: Double
    let position: Int
    let totalProgression: Double
    let cssSelector: String
    let partialCfi: String
    let domRange: DOMRange
  }

  struct Text: Codable, Equatable {
    let before: String
    let highlight: String
    let after: String
  }

  let href: String
  let type: String
  let title: String
  let locations: Locations
  let text: Text

  func makeRecord() throws -> LocatorRecord {
    let recordLocations = LocatorLocationsRecord()
    recordLocations.fragments = locations.fragments
    recordLocations.progression = locations.progression
    recordLocations.position = Double(locations.position)
    recordLocations.totalProgression = locations.totalProgression
    recordLocations.cssSelector = locations.cssSelector
    recordLocations.partialCfi = locations.partialCfi
    recordLocations.domRange = try dictionary(from: locations.domRange)

    let recordText = LocatorTextRecord()
    recordText.before = text.before
    recordText.highlight = text.highlight
    recordText.after = text.after

    let record = LocatorRecord()
    record.href = href
    record.type = type
    record.title = title
    record.locations = recordLocations
    record.text = recordText
    return record
  }
}

private func dictionary<T: Encodable>(from value: T) throws -> [String: Any] {
  let data = try JSONEncoder().encode(value)
  guard let dictionary = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
    throw FixtureError.invalidObject
  }
  return dictionary
}

private func loadFixture() throws -> ReaderLocatorFixture {
  let url = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("fixtures/reader-locator-contract.json")
  guard FileManager.default.fileExists(atPath: url.path) else {
    throw FixtureError.missingResource
  }
  return try JSONDecoder().decode(
    ReaderLocatorFixture.self,
    from: Data(contentsOf: url)
  )
}

private func roundTrip(
  _ fixture: ReaderLocatorFixture
) throws -> ReaderLocatorFixture {
  let readiumLocator = try #require(
    locatorRecordToReadium(try fixture.makeRecord())
  )
  let data = try JSONSerialization.data(
    withJSONObject: locatorToDict(readiumLocator)
  )
  return try JSONDecoder().decode(ReaderLocatorFixture.self, from: data)
}

@Test
func should_preserve_publication_metadata_when_reader_locator_crosses_ios_bridge() throws {
  let expected = try loadFixture()

  let actual = try roundTrip(expected)

  #expect(actual.href == expected.href)
  #expect(actual.type == expected.type)
  #expect(actual.title == expected.title)
}

@Test
func should_preserve_readium_locations_when_reader_locator_crosses_ios_bridge() throws {
  let expected = try loadFixture()

  let actual = try roundTrip(expected)

  #expect(actual.locations.fragments == expected.locations.fragments)
  #expect(actual.locations.progression == expected.locations.progression)
  #expect(actual.locations.position == expected.locations.position)
  #expect(
    actual.locations.totalProgression == expected.locations.totalProgression
  )
}

@Test
func should_preserve_app_owned_anchors_when_reader_locator_crosses_ios_bridge() throws {
  let expected = try loadFixture()

  let actual = try roundTrip(expected)

  #expect(actual.locations.cssSelector == expected.locations.cssSelector)
  #expect(actual.locations.partialCfi == expected.locations.partialCfi)
  #expect(actual.locations.domRange == expected.locations.domRange)
}

@Test
func should_preserve_surrounding_text_when_reader_locator_crosses_ios_bridge() throws {
  let expected = try loadFixture()

  let actual = try roundTrip(expected)

  #expect(actual.text == expected.text)
}
