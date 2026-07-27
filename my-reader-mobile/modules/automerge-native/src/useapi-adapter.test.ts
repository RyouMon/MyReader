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
  ScalarValue: {
    String: class {
      tag: string
      inner: { value: string }
      constructor(value: { value: string }) {
        this.tag = "String"
        this.inner = value
      }
    },
    Int: class {
      tag: string
      inner: { value: bigint }
      constructor(value: { value: bigint }) {
        this.tag = "Int"
        this.inner = value
      }
    },
    Boolean: class {
      tag: string
      inner: { value: boolean }
      constructor(value: { value: boolean }) {
        this.tag = "Boolean"
        this.inner = value
      }
    },
    Null: class {
      tag = "Null"
    },
  },
  Prop: {},
  Prop_Tags: { Key: "Key", Index: "Index" },
  PatchAction_Tags: { Put: "Put" },
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

function key(value: string) {
  return {
    tag: "Key",
    inner: { value },
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

  it("should materialize a nested map when object and field patches arrive together", () => {
    const document = {
      heads: jest
        .fn()
        .mockReturnValueOnce([])
        .mockReturnValue([new Uint8Array([9]).buffer]),
      difference: jest.fn().mockReturnValue([
        {
          path: [{ prop: key("annotations") }],
          action: {
            tag: "Put",
            inner: {
              prop: key("annotation-id"),
              value: {
                tag: "Object",
                inner: {
                  typ: 0,
                  id: new Uint8Array([1]).buffer,
                },
              },
            },
          },
        },
        {
          path: [{ prop: key("annotations") }, { prop: key("annotation-id") }],
          action: {
            tag: "Put",
            inner: {
              prop: key("bookId"),
              value: {
                tag: "Scalar",
                inner: {
                  value: {
                    tag: "Uint",
                    inner: { value: 7n },
                  },
                },
              },
            },
          },
        },
      ]),
    }
    const adapter = new NativeAutomerge(document as never)

    const result = adapter.applyAndReturnPatches({
      annotations: {},
    })

    expect(result.value).toEqual({
      annotations: {
        "annotation-id": {
          bookId: 7,
        },
      },
    })
    expect(
      result.value.annotations["annotation-id"][
        Symbol.for("_am_objectId") as never
      ],
    ).toBe("o:AQ==")
  })

  it("should hydrate a nested map when Automerge assigns an annotation object", () => {
    const annotationObjectId = new Uint8Array([1]).buffer
    const document = {
      heads: jest.fn().mockReturnValue([]),
      putObjectInMap: jest.fn().mockReturnValue(annotationObjectId),
      putInMap: jest.fn(),
    }
    const adapter = new NativeAutomerge(
      document as never,
    ) as NativeAutomerge & {
      putObjectFromHydrate(
        objectId: string,
        property: string,
        value: unknown,
      ): string
    }
    const immutableString = (value: string) => ({
      [Symbol.for("_am_immutableString")]: true,
      toString: () => value,
    })

    const objectId = adapter.putObjectFromHydrate("_root", "annotation-id", {
      id: immutableString("annotation-id"),
      bookId: 2,
      deleted: false,
      note: null,
    })

    expect(objectId).toBe("o:AQ==")
    expect(document.putObjectInMap).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      "annotation-id",
      0,
    )
    expect(document.putInMap).toHaveBeenCalledTimes(4)
  })
})
