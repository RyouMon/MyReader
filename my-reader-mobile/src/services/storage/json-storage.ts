import { File, Paths } from "expo-file-system"

type JsonValue = string | null

export type JsonStorage = {
  getItem: (name: string) => Promise<JsonValue>
  setItem: (name: string, value: string) => Promise<void>
  removeItem: (name: string) => Promise<void>
}

function getStorageFile(name: string) {
  return new File(Paths.document, `${name}.json`)
}

export function createExpoJsonStorage(): JsonStorage {
  return {
    async getItem(name) {
      const file = getStorageFile(name)

      if (!file.exists) {
        return null
      }

      try {
        return await file.text()
      } catch {
        return null
      }
    },
    async setItem(name, value) {
      const file = getStorageFile(name)

      if (!file.exists) {
        file.create({ intermediates: true, overwrite: true })
      }

      file.write(value)
    },
    async removeItem(name) {
      const file = getStorageFile(name)

      if (file.exists) {
        file.delete()
      }
    },
  }
}
