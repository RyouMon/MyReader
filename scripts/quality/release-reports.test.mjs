import assert from "node:assert/strict"
import test from "node:test"
import { assertPassingJUnit } from "../release/junit.mjs"

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
