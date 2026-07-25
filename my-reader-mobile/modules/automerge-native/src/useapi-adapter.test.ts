jest.mock("./generated/automerge", () => ({
  Doc: class {},
  SyncState: class {},
  ObjType: { Map: 0, List: 1, Text: 2 },
  Value_Tags: { Object: "Object", Scalar: "Scalar" },
  ScalarValue_Tags: {
    Bytes: "Bytes",
    String: "String",
    Uint: "Uint",
    Int: "Int",
    F64: "F64",
    Counter: "Counter",
    Timestamp: "Timestamp",
    Boolean: "Boolean",
    Unknown: "Unknown",
    Null: "Null",
  },
  Prop: {},
  Prop_Tags: { Key: "Key", Index: "Index" },
  PatchAction_Tags: {},
  ExpandMark: {},
  root: () => new Uint8Array([0]).buffer,
}))

jest.mock("./proxy", () => ({
  createRootProxy: jest.fn(),
  createReadableDoc: jest.fn(),
}))

import { NativeAutomerge } from "./useapi-adapter"

function stringValue(value: string, operationId: string) {
  return {
    value: {
      tag: "Scalar",
      inner: {
        value: {
          tag: "String",
          inner: { value },
        },
      },
    },
    operationId,
  }
}

describe("native Automerge UseApi adapter", () => {
  it("should preserve operation IDs when scalar values conflict", () => {
    const document = {
      heads: jest.fn().mockReturnValue([]),
      getAllInMap: jest
        .fn()
        .mockReturnValue([
          stringValue("first", "1@aaaaaaaa"),
          stringValue("second", "1@bbbbbbbb"),
        ]),
    }
    const adapter = new NativeAutomerge(document as never)

    expect(adapter.getAll("_root", "position")).toEqual([
      ["str", "first", "1@aaaaaaaa"],
      ["str", "second", "1@bbbbbbbb"],
    ])
  })
})
