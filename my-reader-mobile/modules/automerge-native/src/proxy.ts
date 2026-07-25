/**
 * Proxy system for native Automerge backend
 *
 * This provides a WASM-compatible proxy interface without any WASM dependencies.
 * Property assignments are intercepted and translated to native API calls.
 */

/**
 * Create a root proxy for an Automerge document (for writing during change())
 */
export function createRootProxy(doc: any): any {
  return createProxy(doc, "_root", [])
}

/**
 * Create a read-only proxy for viewing an Automerge document
 * This makes the document readable as a plain JavaScript object
 */
export function createReadableDoc(doc: any): any {
  // Materialize the full document into a plain JS object
  const data = doc.materialize ? doc.materialize("_root") : doc

  // But attach the doc instance for internal use (like change() method)
  Object.defineProperty(data, "__doc__", {
    value: doc,
    enumerable: false,
    writable: false,
  })

  return data
}

/**
 * Create a proxy for a specific object in the document
 */
function createProxy(doc: any, objId: string, path: (string | number)[]): any {
  const objType = doc.getObjectType(objId)

  if (objType === "text") {
    // Text objects return the string directly
    return doc.text(objId)
  }

  if (objType === "list") {
    return createListProxy(doc, objId, path)
  }

  // Default: map/object
  return createMapProxy(doc, objId, path)
}

/**
 * Create a proxy for a map/object
 */
function createMapProxy(
  doc: any,
  objId: string,
  path: (string | number)[],
): any {
  const handler: ProxyHandler<any> = {
    get(target, prop: string | symbol) {
      // Handle special cases
      if (prop === Symbol.toStringTag) return "Object"
      if (prop === "constructor") return Object
      if (typeof prop === "symbol") return undefined

      // Get value from document
      const result = doc.get(objId, prop)
      if (result === undefined) return undefined

      const [datatype, value] = result

      // Handle different datatypes
      switch (datatype) {
        case "map":
          return createMapProxy(doc, value, [...path, prop])
        case "list":
          return createListProxy(doc, value, [...path, prop])
        case "text":
          return doc.text(value)
        default:
          return value
      }
    },

    set(target, prop: string | symbol, value: any) {
      if (typeof prop === "symbol") return false

      // Convert value to appropriate type
      const datatype = inferDatatype(value)

      if (datatype === "map" || datatype === "list" || datatype === "text") {
        // Create nested object
        const newObjId = doc.putObject(objId, prop, datatype)

        // Fill it with values
        if (datatype === "map" && typeof value === "object") {
          const nestedProxy = createMapProxy(doc, newObjId, [...path, prop])
          Object.assign(nestedProxy, value)
        } else if (datatype === "list" && Array.isArray(value)) {
          const nestedProxy = createListProxy(doc, newObjId, [...path, prop])
          for (let i = 0; i < value.length; i++) {
            nestedProxy[i] = value[i]
          }
        }
      } else {
        // Set scalar value
        doc.put(objId, prop, value, datatype)
      }

      return true
    },

    deleteProperty(target, prop: string | symbol) {
      if (typeof prop === "symbol") return false
      doc.delete(objId, prop)
      return true
    },

    has(target, prop: string | symbol) {
      if (typeof prop === "symbol") return false
      const keys = doc.keys(objId)
      return keys.includes(prop)
    },

    ownKeys(target) {
      return doc.keys(objId)
    },

    getOwnPropertyDescriptor(target, prop) {
      const keys = doc.keys(objId)
      if (keys.includes(prop)) {
        return {
          configurable: true,
          enumerable: true,
          writable: true,
        }
      }
      return undefined
    },
  }

  return new Proxy({}, handler)
}

/**
 * Create a proxy for a list/array
 */
function createListProxy(
  doc: any,
  objId: string,
  path: (string | number)[],
): any {
  const handler: ProxyHandler<any[]> = {
    get(target, prop: string | symbol) {
      // Handle array methods
      if (prop === "length") {
        return doc.length(objId)
      }

      if (prop === "push") {
        return (...values: any[]) => {
          for (const value of values) {
            const datatype = inferDatatype(value)
            if (
              datatype === "map" ||
              datatype === "list" ||
              datatype === "text"
            ) {
              const newObjId = doc.pushObject(objId, datatype)
              // Fill nested object/list
              if (datatype === "map" && typeof value === "object") {
                const nestedProxy = createMapProxy(doc, newObjId, [
                  ...path,
                  doc.length(objId) - 1,
                ])
                Object.assign(nestedProxy, value)
              } else if (datatype === "list" && Array.isArray(value)) {
                const nestedProxy = createListProxy(doc, newObjId, [
                  ...path,
                  doc.length(objId) - 1,
                ])
                for (let i = 0; i < value.length; i++) {
                  nestedProxy[i] = value[i]
                }
              }
            } else {
              doc.push(objId, value, datatype)
            }
          }
          return doc.length(objId)
        }
      }

      // Handle special cases
      if (prop === Symbol.toStringTag) return "Array"
      if (prop === "constructor") return Array
      if (typeof prop === "symbol") return undefined

      // Parse index
      const index = typeof prop === "string" ? parseInt(prop, 10) : NaN
      if (isNaN(index)) return undefined

      // Get value at index
      const result = doc.get(objId, index)
      if (result === undefined) return undefined

      const [datatype, value] = result

      switch (datatype) {
        case "map":
          return createMapProxy(doc, value, [...path, index])
        case "list":
          return createListProxy(doc, value, [...path, index])
        case "text":
          return doc.text(value)
        default:
          return value
      }
    },

    set(target, prop: string | symbol, value: any) {
      if (prop === "length") {
        // Handle array truncation
        const currentLen = doc.length(objId)
        const newLen = Number(value)
        if (newLen < currentLen) {
          doc.splice(objId, newLen, currentLen - newLen)
        }
        return true
      }

      if (typeof prop === "symbol") return false

      const index = typeof prop === "string" ? parseInt(prop, 10) : NaN
      if (isNaN(index)) return false

      const datatype = inferDatatype(value)

      if (datatype === "map" || datatype === "list" || datatype === "text") {
        const newObjId = doc.putObject(objId, index, datatype)
        if (datatype === "map" && typeof value === "object") {
          const nestedProxy = createMapProxy(doc, newObjId, [...path, index])
          Object.assign(nestedProxy, value)
        } else if (datatype === "list" && Array.isArray(value)) {
          const nestedProxy = createListProxy(doc, newObjId, [...path, index])
          for (let i = 0; i < value.length; i++) {
            nestedProxy[i] = value[i]
          }
        }
      } else {
        doc.put(objId, index, value, datatype)
      }

      return true
    },
  }

  return new Proxy([], handler)
}

/**
 * Infer Automerge datatype from JavaScript value
 */
function inferDatatype(value: any): string {
  if (value === null) return "null"
  if (value === undefined) return "null"
  if (typeof value === "string") return "str"
  if (typeof value === "boolean") return "boolean"
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return value >= 0 ? "uint" : "int"
    }
    return "f64"
  }
  if (value instanceof Date) return "timestamp"
  if (value instanceof Uint8Array) return "bytes"
  if (Array.isArray(value)) return "list"
  if (typeof value === "object") return "map"
  return "str" // fallback
}
