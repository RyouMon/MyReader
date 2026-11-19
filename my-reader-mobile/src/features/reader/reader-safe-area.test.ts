import type { EdgeInsets } from "react-native-safe-area-context"

import {
  readerContentBottomInset,
  readerContentTopInset,
  reserveReaderInsets,
} from "./reader-safe-area"

const insets: EdgeInsets = { top: 0, right: 0, bottom: 20, left: 0 }

it("only reserves the bottom action row on Android", () => {
  expect(readerContentBottomInset(34, "ios")).toBe(52)
  expect(readerContentBottomInset(20, "ios")).toBe(50)
  expect(readerContentBottomInset(20, "ios", true)).toBe(22)
  expect(readerContentBottomInset(15, "android")).toBe(84)
})

it("keeps the physical top inset reserved while the status bar is hidden", () => {
  expect(
    reserveReaderInsets(insets, { top: 24, right: 0, bottom: 20, left: 0 }),
  ).toEqual({ top: 24, right: 0, bottom: 20, left: 0 })
})

it("keeps the physical bottom inset reserved while navigation chrome is hidden", () => {
  expect(
    reserveReaderInsets(insets, { top: 24, right: 0, bottom: 32, left: 0 }),
  ).toEqual({ top: 24, right: 0, bottom: 32, left: 0 })
})

it("uses a newly observed inset when the initial metrics are unavailable", () => {
  expect(reserveReaderInsets({ ...insets, top: 24 }, null)).toEqual({
    top: 24,
    right: 0,
    bottom: 20,
    left: 0,
  })
})

it("reserves the complete Android top edge", () => {
  expect(readerContentTopInset(24, "android")).toBe(84)
  expect(readerContentTopInset(48, "android")).toBe(100)
})

it("adds only the floating row beyond Readium's iOS inset", () => {
  expect(readerContentTopInset(24, "ios")).toBe(50)
  expect(readerContentTopInset(59, "ios")).toBe(52)
  expect(readerContentTopInset(24, "ios", true)).toBe(22)
})
