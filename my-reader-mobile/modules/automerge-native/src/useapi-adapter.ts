/**
 * UseApi adapter for @automerge/automerge/slim
 *
 * Bridges the ubrn-generated TypeScript API (from UniFFI Rust bindings)
 * to the `API` interface expected by `@automerge/automerge/slim`'s `UseApi()`.
 *
 * Usage:
 *   import { UseApi } from '@automerge/automerge/slim';
 *   import { nativeApi } from 'react-native-automerge-generated';
 *   UseApi(nativeApi);
 */

import {
  Doc,
  SyncState as GenSyncState,
  ObjType,
  Value,
  Value_Tags,
  ScalarValue,
  ScalarValue_Tags,
  Prop,
  Prop_Tags,
  PatchAction_Tags,
  ExpandMark,
  root,
  type ObjId,
  type ActorId,
  type ChangeHash,
  type Cursor,
  type Patch as GenPatch,
  type PatchAction as GenPatchAction,
  type DocInterface,
  type SyncStateInterface,
  type Mark as GenMark,
  type PathElement,
  type KeyValue,
} from "./generated/automerge"
import { createRootProxy, createReadableDoc } from "./proxy"

// =============================================================================
// Base64 encoding/decoding (no external dependency)
// =============================================================================

const B64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

function uint8ToBase64(bytes: Uint8Array): string {
  let result = ""
  const len = bytes.length
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i] ?? 0
    const b1 = i + 1 < len ? (bytes[i + 1] ?? 0) : 0
    const b2 = i + 2 < len ? (bytes[i + 2] ?? 0) : 0
    result += B64_CHARS[(b0 >> 2) & 0x3f]!
    result += B64_CHARS[((b0 << 4) | (b1 >> 4)) & 0x3f]!
    result += i + 1 < len ? B64_CHARS[((b1 << 2) | (b2 >> 6)) & 0x3f]! : "="
    result += i + 2 < len ? B64_CHARS[b2 & 0x3f]! : "="
  }
  return result
}

function base64ToUint8(str: string): Uint8Array {
  let padding = 0
  if (str.endsWith("==")) padding = 2
  else if (str.endsWith("=")) padding = 1
  const bytes = new Uint8Array((str.length * 3) / 4 - padding)
  let j = 0
  for (let i = 0; i < str.length; i += 4) {
    const a = B64_CHARS.indexOf(str[i]!)
    const b = B64_CHARS.indexOf(str[i + 1]!)
    const c = B64_CHARS.indexOf(str[i + 2]!)
    const d = B64_CHARS.indexOf(str[i + 3]!)
    bytes[j++] = (a << 2) | (b >> 4)
    if (c !== -1 && str[i + 2] !== "=")
      bytes[j++] = ((b << 4) | (c >> 2)) & 0xff
    if (d !== -1 && str[i + 3] !== "=") bytes[j++] = ((c << 6) | d) & 0xff
  }
  return bytes
}

// =============================================================================
// Type Conversion Utilities
// =============================================================================

// Cache the root ObjId bytes for fast comparison
let _rootBytes: Uint8Array | null = null
function getRootBytes(): Uint8Array {
  if (!_rootBytes) {
    _rootBytes = new Uint8Array(root())
  }
  return _rootBytes
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function objIdToStr(buf: ObjId): string {
  const bytes = new Uint8Array(buf)
  if (arraysEqual(bytes, getRootBytes())) return "_root"
  return "o:" + uint8ToBase64(bytes)
}

function strToObjId(s: string): ObjId {
  if (s === "_root" || s === "/") return root()
  if (s.startsWith("o:")) return base64ToUint8(s.slice(2)).buffer as ObjId
  throw new Error(`Invalid ObjId string: ${s}`)
}

function hexEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let hex = ""
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0")
  }
  return hex
}

function hexDecode(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes.buffer
}

function changeHashToHex(buf: ChangeHash): string {
  return hexEncode(buf)
}

function hexToChangeHash(hex: string): ChangeHash {
  return hexDecode(hex) as ChangeHash
}

function actorIdToHex(buf: ActorId): string {
  return hexEncode(buf)
}

function hexToActorId(hex: string): ActorId {
  return hexDecode(hex) as ActorId
}

function cursorToStr(buf: Cursor): string {
  return "c:" + uint8ToBase64(new Uint8Array(buf))
}

function strToCursor(s: string): Cursor {
  if (s.startsWith("c:")) return base64ToUint8(s.slice(2)).buffer as Cursor
  throw new Error(`Invalid cursor string: ${s}`)
}

function hexToHeads(heads: string[]): ChangeHash[] {
  return heads.map(hexToChangeHash)
}

function headsToHex(heads: ChangeHash[]): string[] {
  return heads.map(changeHashToHex)
}

function numberArrayToUint8Array(a: number[]): Uint8Array {
  return new Uint8Array(a)
}

function uint8ArrayToNumberArray(u: Uint8Array): number[] {
  return Array.from(u)
}

// --- ScalarValue conversions ---

function jsToScalarValue(val: any, datatype?: string): ScalarValue {
  if (datatype) {
    switch (datatype) {
      case "int":
        return new ScalarValue.Int({ value: BigInt(Math.floor(val)) })
      case "uint":
        return new ScalarValue.Uint({ value: BigInt(Math.floor(val)) })
      case "f64":
        return new ScalarValue.F64({ value: val })
      case "counter":
        return new ScalarValue.Counter({ value: BigInt(Math.floor(val)) })
      case "timestamp":
        if (val instanceof Date) {
          return new ScalarValue.Timestamp({ value: BigInt(val.getTime()) })
        }
        return new ScalarValue.Timestamp({ value: BigInt(Math.floor(val)) })
      case "bytes":
        if (val instanceof Uint8Array) {
          return new ScalarValue.Bytes({ value: uint8ArrayToNumberArray(val) })
        }
        return new ScalarValue.Bytes({ value: Array.from(val) })
      case "boolean":
        return new ScalarValue.Boolean({ value: !!val })
      case "null":
        return new ScalarValue.Null()
      case "str":
        return new ScalarValue.String({ value: String(val) })
    }
  }
  if (val === null || val === undefined) return new ScalarValue.Null()
  if (typeof val === "string") return new ScalarValue.String({ value: val })
  if (typeof val === "boolean") return new ScalarValue.Boolean({ value: val })
  if (typeof val === "number") return new ScalarValue.F64({ value: val })
  if (val instanceof Date)
    return new ScalarValue.Timestamp({ value: BigInt(val.getTime()) })
  if (val instanceof Uint8Array)
    return new ScalarValue.Bytes({ value: uint8ArrayToNumberArray(val) })
  return new ScalarValue.String({ value: String(val) })
}

function scalarValueToJS(sv: ScalarValue): any {
  switch (sv.tag) {
    case ScalarValue_Tags.String:
      return sv.inner.value
    case ScalarValue_Tags.Int:
      return Number(sv.inner.value)
    case ScalarValue_Tags.Uint:
      return Number(sv.inner.value)
    case ScalarValue_Tags.F64:
      return sv.inner.value
    case ScalarValue_Tags.Boolean:
      return sv.inner.value
    case ScalarValue_Tags.Null:
      return null
    case ScalarValue_Tags.Counter:
      return Number(sv.inner.value)
    case ScalarValue_Tags.Timestamp:
      return new Date(Number(sv.inner.value))
    case ScalarValue_Tags.Bytes:
      return numberArrayToUint8Array((sv.inner as any).value)
    case ScalarValue_Tags.Unknown:
      return undefined
    default:
      return undefined
  }
}

function scalarValueToDatatype(sv: ScalarValue): string {
  switch (sv.tag) {
    case ScalarValue_Tags.String:
      return "str"
    case ScalarValue_Tags.Int:
      return "int"
    case ScalarValue_Tags.Uint:
      return "uint"
    case ScalarValue_Tags.F64:
      return "f64"
    case ScalarValue_Tags.Boolean:
      return "boolean"
    case ScalarValue_Tags.Null:
      return "null"
    case ScalarValue_Tags.Counter:
      return "counter"
    case ScalarValue_Tags.Timestamp:
      return "timestamp"
    case ScalarValue_Tags.Bytes:
      return "bytes"
    default:
      return "unknown"
  }
}

/**
 * Convert a generated Value to a "FullValue" tuple as expected by the automerge proxy system.
 * Returns [datatype, value] for scalars, [objtype, objIdStr] for objects.
 */
function genValueToFullValue(val: Value): [string, any] {
  if (val.tag === Value_Tags.Object) {
    const inner = val.inner as { typ: ObjType; id: ObjId }
    const objTypeStr =
      inner.typ === ObjType.Map
        ? "map"
        : inner.typ === ObjType.List
          ? "list"
          : "text"
    return [objTypeStr, objIdToStr(inner.id)]
  } else {
    const inner = val.inner as { value: ScalarValue }
    return [scalarValueToDatatype(inner.value), scalarValueToJS(inner.value)]
  }
}

function objTypeStrToEnum(s: string): ObjType {
  switch (s) {
    case "map":
      return ObjType.Map
    case "list":
      return ObjType.List
    case "text":
      return ObjType.Text
    default:
      return ObjType.Map
  }
}

// --- Prop conversion ---

function propToGenProp(prop: string | number): {
  isMap: boolean
  key: string
  index: number
} {
  if (typeof prop === "string") {
    return { isMap: true, key: prop, index: 0 }
  }
  return { isMap: false, key: "", index: prop }
}

// --- Patch conversion ---

function genPropToJS(prop: any): string | number {
  if (prop.tag === Prop_Tags.Key) return prop.inner.value
  if (prop.tag === Prop_Tags.Index) return Number(prop.inner.value)
  return prop
}

function convertGenPatch(gp: GenPatch): any {
  const basePath: (string | number)[] = gp.path.map((pe: PathElement) => {
    return genPropToJS(pe.prop)
  })

  const action = gp.action
  switch (action.tag) {
    case PatchAction_Tags.Put: {
      const inner = action.inner as { obj: ObjId; prop: any; value: Value }
      const [datatype, value] = genValueToFullValue(inner.value)
      const prop = genPropToJS(inner.prop)
      return {
        action: "put",
        path: [...basePath, prop],
        value,
        datatype,
      }
    }
    case PatchAction_Tags.Insert: {
      const inner = action.inner as {
        obj: ObjId
        index: bigint
        values: Value[]
      }
      const values = inner.values.map(genValueToFullValue)
      return {
        action: "insert",
        path: [...basePath, Number(inner.index)],
        values: values.map(([, v]) => v),
        datatype: values.length > 0 ? values[0]![0] : undefined,
      }
    }
    case PatchAction_Tags.SpliceText: {
      const inner = action.inner as {
        obj: ObjId
        index: bigint
        value: string
        marks: Map<string, Value>
      }
      const marks: Record<string, any> = {}
      if (inner.marks) {
        for (const [k, v] of inner.marks) {
          const [, jsVal] = genValueToFullValue(v)
          marks[k] = jsVal
        }
      }
      return {
        action: "splice",
        path: [...basePath, Number(inner.index)],
        value: inner.value,
        marks: Object.keys(marks).length > 0 ? marks : undefined,
      }
    }
    case PatchAction_Tags.Increment: {
      const inner = action.inner as { obj: ObjId; prop: any; value: bigint }
      return {
        action: "inc",
        path: [...basePath, genPropToJS(inner.prop)],
        value: Number(inner.value),
      }
    }
    case PatchAction_Tags.Conflict: {
      const inner = action.inner as { obj: ObjId; prop: any }
      return {
        action: "conflict",
        path: [...basePath, genPropToJS(inner.prop)],
      }
    }
    case PatchAction_Tags.DeleteMap: {
      const inner = action.inner as { obj: ObjId; key: string }
      return {
        action: "del",
        path: [...basePath, inner.key],
      }
    }
    case PatchAction_Tags.DeleteSeq: {
      const inner = action.inner as {
        obj: ObjId
        index: bigint
        length: bigint
      }
      return {
        action: "del",
        path: [...basePath, Number(inner.index)],
        length: Number(inner.length),
      }
    }
    case PatchAction_Tags.Marks: {
      const inner = action.inner as { obj: ObjId; marks: GenMark[] }
      return {
        action: "mark",
        path: basePath,
        marks: inner.marks.map((m) => ({
          start: Number(m.start),
          end: Number(m.end),
          name: m.name,
          value: scalarValueToJS(m.value),
        })),
      }
    }
    default:
      return { action: "unknown", path: basePath }
  }
}

// =============================================================================
// NativeAutomerge class
// =============================================================================

let _nextWbgPtr = 1

class NativeAutomerge {
  doc: DocInterface
  private _freeze: boolean = false
  private _datatypes: Map<
    string,
    { construct: Function; deconstruct: Function }
  > = new Map()
  private _diffCursorHeads: ChangeHash[] | null = null

  // Unique per-instance ID used by automerge's isSameDocument() check.
  // The proxy code compares val[STATE].handle.__wbg_ptr === context.__wbg_ptr
  // to detect circular references. Without this, both are undefined and the
  // comparison incorrectly returns true for all values.
  __wbg_ptr: number

  constructor(doc: DocInterface) {
    this.doc = doc
    this.__wbg_ptr = _nextWbgPtr++
    // Initialize diff cursor to track changes from the start
    this.updateDiffCursor()
  }

  // --- Lifecycle ---

  free(): void {
    // Let GC handle Rust Arc cleanup via uniffiDestroy
  }

  // --- High-level API ---

  /**
   * Make changes to the document using a proxy-based API (WASM-compatible)
   * @param optionsOrCallback - Either a callback function or options object
   * @param callback - The callback function if options were provided
   * @returns The modified document (modifies in place)
   */
  change(optionsOrCallback: any, callback?: any): NativeAutomerge {
    // Parse arguments (WASM API allows message as string or options object)
    let changeFn: Function
    let message: string | undefined
    let time: number | undefined

    if (typeof optionsOrCallback === "function") {
      changeFn = optionsOrCallback
      message = undefined
    } else {
      changeFn = callback!
      message =
        typeof optionsOrCallback === "string"
          ? optionsOrCallback
          : optionsOrCallback?.message
      time = optionsOrCallback?.time
    }

    // Create proxy for mutation
    const proxy = createRootProxy(this)

    try {
      // Call user's change function with the proxy
      changeFn(proxy)

      // Commit pending operations if any were made
      if (this.pendingOps() > 0) {
        this.commit(message, time)
      }
    } catch (error) {
      // Rollback any pending operations on error
      if (this.pendingOps() > 0) {
        this.rollback()
      }
      throw error
    }

    return this
  }

  // --- Lifecycle ---

  clone(actor?: string): NativeAutomerge {
    const forked = this.doc.fork() as Doc
    if (actor) {
      forked.setActor(hexToActorId(actor))
    }
    return new NativeAutomerge(forked)
  }

  fork(actor?: string, heads?: string[]): NativeAutomerge {
    let forked: DocInterface
    if (heads && heads.length > 0) {
      forked = this.doc.forkAt(hexToHeads(heads))
    } else {
      forked = this.doc.fork()
    }
    if (actor) {
      forked.setActor(hexToActorId(actor))
    }
    return new NativeAutomerge(forked)
  }

  // --- Freeze / Datatypes ---

  enableFreeze(enable: boolean): boolean {
    const old = this._freeze
    this._freeze = enable
    return old
  }

  registerDatatype(
    typeName: string,
    construct: Function,
    deconstruct: Function,
  ): void {
    this._datatypes.set(typeName, { construct, deconstruct })
  }

  // --- Heads / Actor ---

  getHeads(): string[] {
    return headsToHex(this.doc.heads())
  }

  getActorId(): string {
    return actorIdToHex(this.doc.actorId())
  }

  // --- Commit / Rollback ---

  pendingOps(): number {
    try {
      return Number((this.doc as any).pendingOps())
    } catch {
      return 0
    }
  }

  commit(message?: string, time?: number): string | null {
    const t = time != null ? BigInt(time) : BigInt(0)
    this.doc.commitWith(message ?? undefined, t)
    const heads = this.doc.heads()
    if (heads.length > 0) {
      return changeHashToHex(heads[0]!)
    }
    return null
  }

  rollback(): number {
    try {
      return Number((this.doc as any).rollback())
    } catch {
      return 0
    }
  }

  emptyChange(message?: string, time?: number): string | null {
    const t = time != null ? BigInt(time) : BigInt(0)
    this.doc.commitWith(message ?? undefined, t)
    const heads = this.doc.heads()
    if (heads.length > 0) {
      return changeHashToHex(heads[0]!)
    }
    return null
  }

  // --- Diff cursor for incremental patches ---

  updateDiffCursor(): void {
    this._diffCursorHeads = this.doc.heads()
  }

  diffIncremental(): any[] {
    const before = this._diffCursorHeads || []
    const after = this.doc.heads()
    this._diffCursorHeads = after
    if (before.length === 0 && after.length === 0) return []
    const genPatches = this.doc.difference(before, after)
    return genPatches.map(convertGenPatch)
  }

  applyPatches(obj: any, meta?: any): any {
    const patches = this.diffIncremental()
    return applyPatchesToObject(obj, patches, meta)
  }

  applyAndReturnPatches(obj: any, meta?: any): { value: any; patches: any[] } {
    const patches = this.diffIncremental()
    const result = applyPatchesToObject(obj, patches, meta)
    return { value: result, patches }
  }

  // --- Mutation: put ---

  put(obj: string, prop: string | number, value: any, datatype?: string): void {
    const objId = strToObjId(obj)
    const { isMap, key, index } = propToGenProp(prop)
    const sv = jsToScalarValue(value, datatype)
    if (isMap) {
      this.doc.putInMap(objId, key, sv)
    } else {
      this.doc.putInList(objId, BigInt(index), sv)
    }
  }

  putObject(obj: string, prop: string | number, objType: string): string {
    const objId = strToObjId(obj)
    const ot = objTypeStrToEnum(objType)
    const { isMap, key, index } = propToGenProp(prop)
    let newId: ObjId
    if (isMap) {
      newId = this.doc.putObjectInMap(objId, key, ot)
    } else {
      newId = this.doc.putObjectInList(objId, BigInt(index), ot)
    }
    return objIdToStr(newId)
  }

  // --- Mutation: insert ---

  insert(obj: string, index: number, value: any, datatype?: string): void {
    const objId = strToObjId(obj)
    const sv = jsToScalarValue(value, datatype)
    this.doc.insertInList(objId, BigInt(index), sv)
  }

  insertObject(obj: string, index: number, objType: string): string {
    const objId = strToObjId(obj)
    const ot = objTypeStrToEnum(objType)
    const newId = this.doc.insertObjectInList(objId, BigInt(index), ot)
    return objIdToStr(newId)
  }

  push(obj: string, value: any, datatype?: string): void {
    const objId = strToObjId(obj)
    const len = Number(this.doc.length(objId))
    const sv = jsToScalarValue(value, datatype)
    this.doc.insertInList(objId, BigInt(len), sv)
  }

  pushObject(obj: string, objType: string): string {
    const objId = strToObjId(obj)
    const len = Number(this.doc.length(objId))
    const ot = objTypeStrToEnum(objType)
    const newId = this.doc.insertObjectInList(objId, BigInt(len), ot)
    return objIdToStr(newId)
  }

  // --- Mutation: delete ---

  delete(obj: string, prop: string | number): void {
    const objId = strToObjId(obj)
    const { isMap, key, index } = propToGenProp(prop)
    if (isMap) {
      this.doc.deleteInMap(objId, key)
    } else {
      this.doc.deleteInList(objId, BigInt(index))
    }
  }

  // --- Mutation: increment ---

  increment(obj: string, prop: string | number, value: number): void {
    const objId = strToObjId(obj)
    const { isMap, key, index } = propToGenProp(prop)
    if (isMap) {
      this.doc.incrementInMap(objId, key, BigInt(value))
    } else {
      this.doc.incrementInList(objId, BigInt(index), BigInt(value))
    }
  }

  // --- Mutation: splice ---

  splice(obj: string, start: number, deleteCount: number, text?: string): void {
    const objId = strToObjId(obj)
    if (text !== undefined) {
      // Text splice
      this.doc.spliceText(objId, BigInt(start), BigInt(deleteCount), text)
    } else {
      // List splice with no values (just delete)
      this.doc.splice(objId, BigInt(start), BigInt(deleteCount), [])
    }
  }

  // --- Query: get ---

  get(
    obj: string,
    prop: string | number,
    heads?: string[],
  ): [string, any] | undefined {
    const objId = strToObjId(obj)
    const { isMap, key, index } = propToGenProp(prop)
    let val: Value | undefined
    if (heads && heads.length > 0) {
      const h = hexToHeads(heads)
      if (isMap) {
        val = this.doc.getAtInMap(objId, key, h)
      } else {
        val = this.doc.getAtInList(objId, BigInt(index), h)
      }
    } else {
      if (isMap) {
        val = this.doc.getInMap(objId, key)
      } else {
        val = this.doc.getInList(objId, BigInt(index))
      }
    }
    if (val === undefined || val === null) return undefined

    // Handle Text objects specially - read their string content instead of returning ObjId
    if (val.tag === Value_Tags.Object) {
      const inner = val.inner as { typ: ObjType; id: ObjId }
      if (inner.typ === ObjType.Text) {
        const textObjId = objIdToStr(inner.id)
        const textContent =
          heads && heads.length > 0
            ? this.doc.textAt(strToObjId(textObjId), hexToHeads(heads))
            : this.doc.text(strToObjId(textObjId))
        return ["str", textContent]
      }
    }

    return genValueToFullValue(val)
  }

  getWithType(
    obj: string,
    prop: string | number,
    heads?: string[],
  ): [string, any] | undefined {
    return this.get(obj, prop, heads)
  }

  getAll(
    obj: string,
    prop: string | number,
    heads?: string[],
  ): [string, any][] {
    const objId = strToObjId(obj)
    const { isMap, key, index } = propToGenProp(prop)
    let vals: Value[]
    if (heads && heads.length > 0) {
      const h = hexToHeads(heads)
      if (isMap) {
        vals = this.doc.getAllAtInMap(objId, key, h)
      } else {
        vals = this.doc.getAllAtInList(objId, BigInt(index), h)
      }
    } else {
      if (isMap) {
        vals = this.doc.getAllInMap(objId, key)
      } else {
        vals = this.doc.getAllInList(objId, BigInt(index))
      }
    }

    // Handle Text objects specially - read their string content
    return vals.map((val) => {
      if (val.tag === Value_Tags.Object) {
        const inner = val.inner as { typ: ObjType; id: ObjId }
        if (inner.typ === ObjType.Text) {
          const textObjId = objIdToStr(inner.id)
          const textContent =
            heads && heads.length > 0
              ? this.doc.textAt(strToObjId(textObjId), hexToHeads(heads))
              : this.doc.text(strToObjId(textObjId))
          return ["str", textContent] as [string, any]
        }
      }
      return genValueToFullValue(val)
    })
  }

  // --- Query: keys, text, length ---

  keys(obj: string, heads?: string[]): string[] {
    const objId = strToObjId(obj)
    if (heads && heads.length > 0) {
      return this.doc.mapKeysAt(objId, hexToHeads(heads))
    }
    return this.doc.mapKeys(objId)
  }

  text(obj: string, heads?: string[]): string {
    const objId = strToObjId(obj)
    if (heads && heads.length > 0) {
      return this.doc.textAt(objId, hexToHeads(heads))
    }
    return this.doc.text(objId)
  }

  length(obj: string, heads?: string[]): number {
    const objId = strToObjId(obj)
    if (heads && heads.length > 0) {
      return Number(this.doc.lengthAt(objId, hexToHeads(heads)))
    }
    return Number(this.doc.length(objId))
  }

  // --- Query: object info ---

  getObjectType(obj: string): string {
    const objId = strToObjId(obj)
    const ot = this.doc.objectType(objId)
    return ot === ObjType.Map ? "map" : ot === ObjType.List ? "list" : "text"
  }

  // --- Materialization ---

  materialize(obj?: string, heads?: string[], meta?: any): any {
    const objStr = !obj || obj === "/" ? "_root" : obj
    const objId = strToObjId(objStr)
    const result = this._materializeObj(objId, objStr, heads, meta)
    return result
  }

  private _materializeObj(
    objId: ObjId,
    objStr: string,
    heads?: string[],
    meta?: any,
  ): any {
    const ot = this.doc.objectType(objId)
    if (ot === ObjType.Text) {
      const textContent =
        heads && heads.length > 0
          ? this.doc.textAt(objId, hexToHeads(heads))
          : this.doc.text(objId)
      return textContent
    }
    if (ot === ObjType.Map) {
      const result: Record<string, any> = {}
      let mapKeys: string[]
      if (heads && heads.length > 0) {
        mapKeys = this.doc.mapKeysAt(objId, hexToHeads(heads))
      } else {
        mapKeys = this.doc.mapKeys(objId)
      }
      for (const key of mapKeys) {
        let val: Value | undefined
        if (heads && heads.length > 0) {
          val = this.doc.getAtInMap(objId, key, hexToHeads(heads))
        } else {
          val = this.doc.getInMap(objId, key)
        }
        if (val === undefined || val === null) continue
        if (val.tag === Value_Tags.Object) {
          const inner = val.inner as { typ: ObjType; id: ObjId }
          const childStr = objIdToStr(inner.id)
          result[key] = this._materializeObj(inner.id, childStr, heads, meta)
        } else {
          const inner = val.inner as { value: ScalarValue }
          result[key] = scalarValueToJS(inner.value)
        }
      }
      if (meta) {
        attachMeta(result, objStr, meta)
      }
      if (this._freeze) Object.freeze(result)
      return result
    }
    // List
    const len =
      heads && heads.length > 0
        ? Number(this.doc.lengthAt(objId, hexToHeads(heads)))
        : Number(this.doc.length(objId))
    const result: any[] = []
    for (let i = 0; i < len; i++) {
      let val: Value | undefined
      if (heads && heads.length > 0) {
        val = this.doc.getAtInList(objId, BigInt(i), hexToHeads(heads))
      } else {
        val = this.doc.getInList(objId, BigInt(i))
      }
      if (val === undefined || val === null) {
        result.push(undefined)
        continue
      }
      if (val.tag === Value_Tags.Object) {
        const inner = val.inner as { typ: ObjType; id: ObjId }
        const childStr = objIdToStr(inner.id)
        result.push(this._materializeObj(inner.id, childStr, heads, meta))
      } else {
        const inner = val.inner as { value: ScalarValue }
        result.push(scalarValueToJS(inner.value))
      }
    }
    if (meta) {
      attachMeta(result, objStr, meta)
    }
    if (this._freeze) Object.freeze(result)
    return result
  }

  toJS(obj?: string): any {
    return this.materialize(obj)
  }

  // --- Persistence ---

  save(): Uint8Array {
    return numberArrayToUint8Array(this.doc.save())
  }

  saveIncremental(): Uint8Array {
    return numberArrayToUint8Array(this.doc.encodeNewChanges())
  }

  saveNoCompress(): Uint8Array {
    return this.save()
  }

  saveAndVerify(): Uint8Array {
    return this.save()
  }

  saveSince(heads: string[]): Uint8Array {
    return numberArrayToUint8Array(
      this.doc.encodeChangesSince(hexToHeads(heads)),
    )
  }

  loadIncremental(data: Uint8Array): number {
    this.doc.applyEncodedChanges(uint8ArrayToNumberArray(data))
    return 0
  }

  // --- Changes ---

  applyChanges(changes: Uint8Array[]): void {
    for (const change of changes) {
      this.doc.applyEncodedChanges(uint8ArrayToNumberArray(change))
    }
  }

  getChanges(haveDeps: string[]): Uint8Array[] {
    return this.doc
      .changesSince(hexToHeads(haveDeps))
      .map((change) => numberArrayToUint8Array(change.bytes))
  }

  getChangesAdded(other: NativeAutomerge): Uint8Array[] {
    return other.doc
      .changesSince(this.doc.heads())
      .map((change) => numberArrayToUint8Array(change.bytes))
  }

  getLastLocalChange(): Uint8Array | undefined {
    const heads = this.doc.heads()
    if (heads.length === 0) return undefined

    // Get the most recent change (last head in the array)
    const lastHead = heads[heads.length - 1]!
    const change = this.doc.changeByHash(lastHead)
    if (!change) return undefined

    // Return the bytes for this single change (can be decoded with decodeChange)
    return numberArrayToUint8Array(change.bytes)
  }

  getMissingDeps(heads: string[] = []): string[] {
    return headsToHex(this.doc.missingDeps(hexToHeads(heads)))
  }

  // --- Sync ---

  generateSyncMessage(state: NativeSyncState): Uint8Array | undefined {
    const msg = this.doc.generateSyncMessage(state.inner)
    if (msg === undefined || msg === null) return undefined
    return numberArrayToUint8Array(msg)
  }

  receiveSyncMessage(state: NativeSyncState, message: Uint8Array): void {
    this.doc.receiveSyncMessage(state.inner, uint8ArrayToNumberArray(message))
  }

  receiveSyncMessageWithPatches(
    state: NativeSyncState,
    message: Uint8Array,
  ): any[] {
    const genPatches = this.doc.receiveSyncMessageWithPatches(
      state.inner,
      uint8ArrayToNumberArray(message),
    )
    return genPatches.map(convertGenPatch)
  }

  // --- Marks ---

  mark(
    obj: string,
    range: { start: number; end: number; expand?: string },
    name: string,
    value: any,
  ): void {
    const objId = strToObjId(obj)
    let expand: ExpandMark
    switch (range.expand) {
      case "before":
        expand = ExpandMark.Before
        break
      case "after":
        expand = ExpandMark.After
        break
      case "both":
        expand = ExpandMark.Both
        break
      case "none":
      default:
        expand = ExpandMark.None
        break
    }
    const sv = jsToScalarValue(value)
    this.doc.mark(
      objId,
      BigInt(range.start),
      BigInt(range.end),
      expand,
      name,
      sv,
    )
  }

  marks(obj: string, heads?: string[]): any[] {
    const objId = strToObjId(obj)
    let genMarks: GenMark[]
    if (heads && heads.length > 0) {
      genMarks = this.doc.marksAt(objId, hexToHeads(heads))
    } else {
      genMarks = this.doc.marks(objId)
    }
    return genMarks.map((m) => ({
      start: Number(m.start),
      end: Number(m.end),
      name: m.name,
      value: scalarValueToJS(m.value),
    }))
  }

  // --- Cursors ---

  getCursor(obj: string, index: number, heads?: string[]): string {
    const objId = strToObjId(obj)
    let cursor: Cursor
    if (heads && heads.length > 0) {
      cursor = this.doc.cursorAt(objId, BigInt(index), hexToHeads(heads))
    } else {
      cursor = this.doc.cursor(objId, BigInt(index))
    }
    return cursorToStr(cursor)
  }

  getCursorPosition(obj: string, cursor: string, heads?: string[]): number {
    const objId = strToObjId(obj)
    const c = strToCursor(cursor)
    if (heads && heads.length > 0) {
      return Number(this.doc.cursorPositionAt(objId, c, hexToHeads(heads)))
    }
    return Number(this.doc.cursorPosition(objId, c))
  }

  // --- Rich text ---

  splitBlock(obj: string, index: number): string {
    const objId = strToObjId(obj)
    const newId = this.doc.splitBlock(objId, index)
    return objIdToStr(newId)
  }

  joinBlock(obj: string, index: number): void {
    const objId = strToObjId(obj)
    this.doc.joinBlock(objId, index)
  }

  updateText(obj: string, text: string): void {
    const objId = strToObjId(obj)
    this.doc.updateText(objId, text)
  }

  // --- Merge ---

  merge(other: NativeAutomerge): void {
    this.doc.merge(other.doc)
  }

  mergeWithPatches(other: NativeAutomerge): any[] {
    const genPatches = this.doc.mergeWithPatches(other.doc)
    return genPatches.map(convertGenPatch)
  }

  // --- Diff ---

  diff(before: string[], after: string[]): any[] {
    const genPatches = this.doc.difference(
      hexToHeads(before),
      hexToHeads(after),
    )
    return genPatches.map(convertGenPatch)
  }

  // --- Integration stubs ---

  isolate(heads: string[]): void {
    // No-op stub (advanced feature)
  }

  integrate(): void {
    // No-op stub
  }

  // --- Stubbed methods ---

  unmark(): void {
    throw new Error("unmark() not implemented in native adapter")
  }

  spans(): any[] {
    return []
  }

  getBlock(): null {
    return null
  }

  updateBlock(): void {
    // no-op
  }

  updateSpans(): void {
    // no-op
  }

  hasOurChanges(): boolean {
    return false
  }

  dump(): void {
    // no-op debug
  }

  topoHistoryTraversal(): string[] {
    return []
  }

  stats(): Record<string, any> {
    return { numOps: 0, numChanges: 0 }
  }

  saveBundle(): never {
    throw new Error("saveBundle() not implemented in native adapter")
  }

  getChangesMeta(): any[] {
    return []
  }

  getChangeMetaByHash(): null {
    return null
  }

  getDecodedChangeByHash(): null {
    return null
  }
}

// =============================================================================
// Helper: attach STATE and OBJECT_ID symbols to materialized objects
// =============================================================================

const STATE = Symbol.for("_am_meta")
const OBJECT_ID = Symbol.for("_am_objectId")

function attachMeta(obj: any, objId: string, meta: any): void {
  if (meta && meta.handle) {
    Object.defineProperty(obj, STATE, {
      value: meta,
      enumerable: false,
      configurable: true,
      writable: true,
    })
  }
  Object.defineProperty(obj, OBJECT_ID, {
    value: objId,
    enumerable: false,
    configurable: true,
    writable: true,
  })
}

// =============================================================================
// Helper: apply patches to a JS object tree
// =============================================================================

function applyPatchesToObject(obj: any, patches: any[], meta?: any): any {
  for (const patch of patches) {
    const { action, path } = patch
    if (path.length === 0) continue

    // Walk the path to find the parent
    let target = obj
    for (let i = 0; i < path.length - 1; i++) {
      if (target === undefined || target === null) break
      target = target[path[i]]
    }
    if (target === undefined || target === null) continue

    const lastProp = path[path.length - 1]

    switch (action) {
      case "put":
        target[lastProp] = patch.value
        break
      case "del":
        if (Array.isArray(target)) {
          const delLen = patch.length || 1
          target.splice(lastProp as number, delLen)
        } else {
          delete target[lastProp]
        }
        break
      case "splice":
        if (
          typeof target === "string" ||
          typeof target[Symbol.toPrimitive] === "function"
        ) {
          // Text splice - need to modify the parent
          const parentPath = path.slice(0, -1)
          let parent = obj
          for (let i = 0; i < parentPath.length - 1; i++) {
            parent = parent[parentPath[i]]
          }
          if (parentPath.length > 0) {
            const parentProp = parentPath[parentPath.length - 1]
            const str = String(parent[parentProp])
            const idx = lastProp as number
            parent[parentProp] =
              str.slice(0, idx) + patch.value + str.slice(idx)
          }
        } else if (
          typeof patch.value === "string" &&
          typeof target === "object"
        ) {
          // Text object splice
          const prop = path[path.length - 2]
          let textParent = obj
          for (let i = 0; i < path.length - 2; i++) {
            textParent = textParent[path[i]]
          }
          if (typeof textParent[prop] === "string") {
            const str = textParent[prop] as string
            const idx = lastProp as number
            textParent[prop] = str.slice(0, idx) + patch.value + str.slice(idx)
          }
        }
        break
      case "insert":
        if (Array.isArray(target)) {
          const values = patch.values || [patch.value]
          target.splice(lastProp as number, 0, ...values)
        }
        break
      case "inc":
        if (typeof target[lastProp] === "number") {
          target[lastProp] += patch.value
        }
        break
    }
  }

  // Ensure metadata is attached to the root object after applying patches
  if (meta && meta.handle) {
    attachMeta(obj, "_root", meta)
  }

  return obj
}

// =============================================================================
// NativeSyncState class
// =============================================================================

class NativeSyncState {
  inner: SyncStateInterface
  lastSentHeads: string[] = []
  sentHashes: Set<string> = new Set()

  constructor(inner?: SyncStateInterface) {
    this.inner = inner || new GenSyncState()
  }

  free(): void {
    // Let GC handle via uniffiDestroy
  }

  clone(): NativeSyncState {
    const encoded = this.inner.encode()
    const decoded = GenSyncState.decode(encoded) as GenSyncState
    const clone = new NativeSyncState(decoded)
    clone.lastSentHeads = [...this.lastSentHeads]
    clone.sentHashes = new Set(this.sentHashes)
    return clone
  }

  get sharedHeads(): string[] {
    const heads = this.inner.theirHeads()
    if (!heads) return []
    return headsToHex(heads)
  }
}

// =============================================================================
// nativeApi object — implements the API interface for UseApi()
// =============================================================================

const nativeApi = {
  create(options?: any): NativeAutomerge {
    let doc: DocInterface
    if (options?.actor) {
      doc = Doc.newWithActor(hexToActorId(options.actor))
    } else {
      doc = new Doc()
    }
    return new NativeAutomerge(doc)
  },

  load(data: Uint8Array, options?: any): NativeAutomerge {
    const doc = Doc.load(uint8ArrayToNumberArray(data))
    if (options?.actor) {
      doc.setActor(hexToActorId(options.actor))
    }
    return new NativeAutomerge(doc)
  },

  encodeChange(): never {
    throw new Error("encodeChange() not implemented in native adapter")
  },

  decodeChange(data: Uint8Array): any {
    const {
      decodeChange: nativeDecodeChange,
    } = require("./generated/automerge")
    const changeBytes = numberArrayToUint8Array(Array.from(data))
    const change = nativeDecodeChange(changeBytes.buffer)
    // Convert ArrayBuffer fields to hex strings for compatibility
    return {
      hash: changeHashToHex(change.hash),
      actor: actorIdToHex(change.actorId),
      seq: change.seq,
      startOp: change.startOp,
      time: change.timestamp,
      message: change.message || "",
      deps: change.deps.map((d: ChangeHash) => changeHashToHex(d)),
      ops: [], // ops array not available from native API (would require decoding change bytes)
    }
  },

  initSyncState(): NativeSyncState {
    return new NativeSyncState()
  },

  encodeSyncMessage(): never {
    throw new Error("encodeSyncMessage() not implemented in native adapter")
  },

  decodeSyncMessage(): never {
    throw new Error("decodeSyncMessage() not implemented in native adapter")
  },

  encodeSyncState(state: NativeSyncState): Uint8Array {
    return numberArrayToUint8Array(state.inner.encode())
  },

  decodeSyncState(data: Uint8Array): NativeSyncState {
    const inner = GenSyncState.decode(
      uint8ArrayToNumberArray(data),
    ) as GenSyncState
    return new NativeSyncState(inner)
  },

  exportSyncState(state: NativeSyncState): any {
    return {
      sharedHeads: state.sharedHeads,
      lastSentHeads: state.lastSentHeads,
      sentHashes: state.sentHashes,
    }
  },

  importSyncState(obj: any): NativeSyncState {
    const state = new NativeSyncState()
    if (obj.lastSentHeads) state.lastSentHeads = obj.lastSentHeads
    if (obj.sentHashes) state.sentHashes = new Set(obj.sentHashes)
    return state
  },

  readBundle(): never {
    throw new Error("readBundle() not implemented in native adapter")
  },

  wasmReleaseInfo() {
    return {
      backend: "native-rust",
      version: "0.10.0",
    }
  },
}

// =============================================================================
// WASM-compatible API — drop-in replacement for @automerge/automerge
// =============================================================================

// Helper to extract underlying NativeAutomerge from readable doc
function unwrapDoc(doc: any): NativeAutomerge {
  return doc.__doc__ || doc
}

export const Automerge = {
  // Factory methods
  init: (options?: any) => {
    const doc = nativeApi.create(options)
    return createReadableDoc(doc)
  },

  from: (obj: any, options?: any) => {
    const doc = nativeApi.create(options)
    if (obj && typeof obj === "object") {
      doc.change((d: any) => Object.assign(d, obj))
    }
    return createReadableDoc(doc)
  },

  // Document mutation
  change: (doc: any, optionsOrCallback: any, callback?: any) => {
    const nativeDoc = unwrapDoc(doc)
    nativeDoc.change(optionsOrCallback, callback)
    return createReadableDoc(nativeDoc)
  },

  // Clone/view operations
  clone: (doc: any, options?: any) => {
    const nativeDoc = unwrapDoc(doc)
    const cloned = nativeDoc.clone(options?.actor)
    return createReadableDoc(cloned)
  },

  fork: (doc: any, options?: any) => {
    const nativeDoc = unwrapDoc(doc)
    const forked = nativeDoc.fork(options?.actor)
    return createReadableDoc(forked)
  },

  // Serialization
  save: (doc: any) => {
    const nativeDoc = unwrapDoc(doc)
    return nativeDoc.save()
  },

  saveIncremental: (doc: any) => {
    const nativeDoc = unwrapDoc(doc)
    return nativeDoc.saveIncremental()
  },

  load: (data: Uint8Array, options?: any) => {
    const doc = nativeApi.load(data, options)
    return createReadableDoc(doc)
  },

  loadIncremental: (doc: any, data: Uint8Array) => {
    const nativeDoc = unwrapDoc(doc)
    nativeDoc.loadIncremental(data)
    return createReadableDoc(nativeDoc)
  },

  // Change management
  getLastLocalChange: (doc: any) => {
    const nativeDoc = unwrapDoc(doc)
    return nativeDoc.getLastLocalChange()
  },

  getHeads: (doc: any) => {
    const nativeDoc = unwrapDoc(doc)
    return nativeDoc.getHeads()
  },

  getChanges: (oldDoc: any, newDoc: any) => {
    const nativeOldDoc = unwrapDoc(oldDoc)
    const nativeNewDoc = unwrapDoc(newDoc)
    return nativeOldDoc.getChangesAdded(nativeNewDoc)
  },

  applyChanges: (doc: any, changes: Uint8Array[]) => {
    const nativeDoc = unwrapDoc(doc)
    nativeDoc.applyChanges(changes)
    return [createReadableDoc(nativeDoc)] // WASM API returns [doc] array
  },

  // Metadata
  getActorId: (doc: any) => {
    const nativeDoc = unwrapDoc(doc)
    return nativeDoc.getActorId()
  },

  // Utility
  merge: (local: any, remote: any) => {
    const nativeLocal = unwrapDoc(local)
    const nativeRemote = unwrapDoc(remote)
    nativeLocal.merge(nativeRemote)
    return createReadableDoc(nativeLocal)
  },

  // Read document contents
  toJS: (doc: any) => {
    const nativeDoc = unwrapDoc(doc)
    return nativeDoc.toJS()
  },

  materialize: (doc: any, obj?: string, heads?: string[]) => {
    const nativeDoc = unwrapDoc(doc)
    return nativeDoc.materialize(obj, heads)
  },

  // Decode change bytes
  decodeChange: (data: Uint8Array) => nativeApi.decodeChange(data),

  // Sync state management
  initSyncState: () => nativeApi.initSyncState(),

  generateSyncMessage: (doc: any, syncState: NativeSyncState) => {
    const nativeDoc = unwrapDoc(doc)
    const msg = nativeDoc.generateSyncMessage(syncState)
    return [syncState, msg]
  },

  receiveSyncMessage: (
    doc: any,
    syncState: NativeSyncState,
    message: Uint8Array,
  ) => {
    const nativeDoc = unwrapDoc(doc)
    nativeDoc.receiveSyncMessage(syncState, message)
    return [createReadableDoc(nativeDoc), syncState, null]
  },

  encodeSyncState: (state: NativeSyncState) => nativeApi.encodeSyncState(state),

  decodeSyncState: (data: Uint8Array) => nativeApi.decodeSyncState(data),
}

export { nativeApi, NativeAutomerge, NativeSyncState }
