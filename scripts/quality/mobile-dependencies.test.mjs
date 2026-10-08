import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const mobileRequire = createRequire(
  new URL("../../my-reader-mobile/package.json", import.meta.url),
)

test("Expo Router query parsing preserves reading links with the patched decoder", () => {
  const routerRequire = createRequire(mobileRequire.resolve("expo-router"))
  const queryString = routerRequire("query-string")
  const params = {
    title: "中文书名 & notes",
    location: "chapter/1#paragraph-2",
    tag: ["已读", "收藏"],
  }
  assert.deepEqual(
    { ...queryString.parse(queryString.stringify(params)) },
    params,
  )
  assert.equal(queryString.parse("title=%E4%B8%AD%FF").title, "中%FF")
})

test("Expo Xcode projects still generate unique PBX identifiers", () => {
  const configRequire = createRequire(
    mobileRequire.resolve("@expo/config-plugins"),
  )
  const xcode = configRequire("xcode")
  const project = xcode.project("fixture.pbxproj")
  project.hash = { project: { objects: {} } }
  const identifiers = new Set()
  for (let index = 0; index < 100; index += 1) {
    const identifier = project.generateUuid()
    assert.match(identifier, /^[A-F0-9]{24}$/)
    identifiers.add(identifier)
  }
  assert.equal(identifiers.size, 100)
})
