import { readFileSync } from "node:fs"
import assert from "node:assert/strict"
import { XMLParser, XMLValidator } from "fast-xml-parser"

export function assertPassingJUnit(xml, expectedTests) {
  if (XMLValidator.validate(xml) !== true)
    throw new Error("Malformed JUnit report")
  const report = new XMLParser({ ignoreAttributes: false }).parse(xml)
  if (!("testsuite" in report) && !("testsuites" in report))
    throw new Error("Missing JUnit test suite")
  let tests = 0
  function visit(value) {
    if (!value || typeof value !== "object") return
    for (const [key, child] of Object.entries(value)) {
      if (
        ["failure", "error", "skipped"].includes(key) ||
        (["@_failures", "@_errors", "@_skipped", "@_disabled"].includes(key) &&
          Number(child) !== 0)
      ) {
        throw new Error(
          "Test report contains failures, errors or skipped tests",
        )
      }
      if (key === "testcase") tests += Array.isArray(child) ? child.length : 1
      if (Array.isArray(child)) child.forEach(visit)
      else visit(child)
    }
  }
  visit(report)
  if (tests !== expectedTests)
    throw new Error(
      `Expected ${expectedTests} executed tests, report contains ${tests}`,
    )
  return tests
}

export function verifyJUnit(path, expectedTests) {
  return assertPassingJUnit(readFileSync(path, "utf8"), expectedTests)
}

export function assertPassingXCTest(report, expectedTests) {
  assert.equal(report.result, "Passed", "XCTest did not pass")
  assert.equal(report.totalTestCount, expectedTests, "Incomplete XCTest suite")
  assert.equal(report.passedTests, expectedTests)
  for (const key of ["failedTests", "skippedTests", "expectedFailures"])
    assert.equal(report[key], 0, `XCTest contains ${key}`)
  assert.deepEqual(report.testFailures, [])
}
