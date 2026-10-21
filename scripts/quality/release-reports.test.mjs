import assert from "node:assert/strict"
import test from "node:test"
import { assertPassingJUnit, assertPassingXCTest } from "../release/junit.mjs"

test("publishing requires a complete passing report, including no silent skips", () => {
  const passing =
    '<testsuite><testcase name="read"/><testcase name="resume"></testcase></testsuite>'
  assert.equal(assertPassingJUnit(passing, 2), 2)
  assert.throws(() => assertPassingJUnit(passing, 3), /Expected 3/)
  assert.throws(() => assertPassingJUnit("<testsuite/>", 2), /contains 0/)
  assert.throws(
    () => assertPassingJUnit('<testsuite><testcase name="read">', 1),
    /Malformed/,
  )
  assert.throws(
    () =>
      assertPassingJUnit('<testsuite failures="1"><testcase/></testsuite>', 1),
    /failures/,
  )
  for (const result of ["failure", "error", "skipped"]) {
    assert.throws(
      () =>
        assertPassingJUnit(
          `<testsuite><testcase><${result}/></testcase></testsuite>`,
          1,
        ),
      /failures, errors or skipped/,
    )
  }
})

test("XCTest must execute the whole suite with no skips or expected failures", () => {
  const passing = {
    result: "Passed",
    totalTestCount: 1,
    passedTests: 1,
    failedTests: 0,
    skippedTests: 0,
    expectedFailures: 0,
    testFailures: [],
  }
  assertPassingXCTest(passing, 1)
  for (const key of ["failedTests", "skippedTests", "expectedFailures"])
    assert.throws(() => assertPassingXCTest({ ...passing, [key]: 1 }, 1))
  assert.throws(() => assertPassingXCTest({ ...passing, result: "Failed" }, 1))
  assert.throws(() => assertPassingXCTest({ ...passing, totalTestCount: 0 }, 1))
  assert.throws(() => assertPassingXCTest({ ...passing, passedTests: 0 }, 1))
})
