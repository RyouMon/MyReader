import { Directory, File, Paths } from "expo-file-system"

import {
  completeNativeTask,
  recoverNativeUploads,
  startNativeUpload,
} from "@/src/services/download/native"
import type { RemoteBackend } from "@/src/services/remote/backend"

const UPLOAD_DIRECTORY = "myreader-sidecar-uploads"

function temporaryUploadFile(remotePath: string): File {
  const directory = new Directory(Paths.cache, UPLOAD_DIRECTORY)
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true })
  }
  const name = remotePath.slice(remotePath.lastIndexOf("/") + 1)
  return new File(
    directory,
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`,
  )
}

export async function uploadLibrarySidecarObject(
  backend: RemoteBackend,
  remotePath: string,
  bytes: Uint8Array,
): Promise<void> {
  if (!backend.prepareUpload) {
    await backend.writeBytes(remotePath, bytes)
    return
  }

  const file = temporaryUploadFile(remotePath)
  file.create({ intermediates: true, overwrite: true })
  file.write(bytes)
  try {
    await backend.prepareUpload(file.uri, remotePath)
    const request = await backend.getUploadRequest(file.uri, remotePath)
    await startNativeUpload({
      relativePath: remotePath,
      url: backend.contentUrl(request.remotePath),
      sourceUri: request.localFileUri,
      headers: request.headers,
      options: {
        metadata: {
          purpose: "library-sidecar",
          remotePath,
          temporaryFileUri: file.uri,
        },
      },
    })
  } finally {
    if (file.exists) file.delete()
  }
}

export async function recoverLibrarySidecarUploads(): Promise<number> {
  const tasks = await recoverNativeUploads()
  const sidecarTasks = tasks.filter(
    (task) => task.metadata?.purpose === "library-sidecar",
  )
  for (const task of sidecarTasks) {
    const temporaryFileUri = task.metadata?.temporaryFileUri
    let finished = false
    const cleanup = () => {
      if (typeof temporaryFileUri === "string") {
        const file = new File(temporaryFileUri)
        if (file.exists) file.delete()
      }
    }
    const finish = () => {
      if (finished) return
      finished = true
      cleanup()
      completeNativeTask(task.id)
    }
    const fail = () => {
      if (finished) return
      finished = true
      cleanup()
    }
    task.bind({
      onDone: finish,
      onError: fail,
    })
    if (task.state === "DONE") finish()
  }
  return sidecarTasks.length
}
