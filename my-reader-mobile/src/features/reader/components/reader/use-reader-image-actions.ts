import {
  readerImageFileName,
  type ReaderImageBook,
} from "@my-reader/tools/reader-image-export"
import type { RefObject } from "react"
import { useCallback, useRef } from "react"
import { ActionSheetIOS, Alert, Platform } from "react-native"
import { useTranslation } from "react-i18next"
import { Directory, File } from "expo-file-system"
import { setImageAsync } from "expo-clipboard"
import { Asset, requestPermissionsAsync } from "expo-media-library"
import { shareAsync } from "expo-sharing"
import type { ReadiumViewRef } from "@my-reader/readium"

export function useReaderImageActions(
  reader: RefObject<ReadiumViewRef | null>,
  book: ReaderImageBook = { title: "" },
) {
  const { t } = useTranslation()
  const busy = useRef(false)
  const run = useCallback(
    async (action: "copy" | "files" | "photos" | "share", href?: string) => {
      if (busy.current) return
      busy.current = true
      try {
        if (!reader.current) throw new Error("READER_NOT_READY")
        const exported = await reader.current.exportImages(href)
        const images = exported.map((image) => {
          const file = new File(image.uri)
          const name = readerImageFileName(
            book,
            image.position,
            image.name,
            image.mimeType,
          )
          file.rename(name)
          return { ...image, name, uri: file.uri }
        })
        const image = images[0]
        if (!image) throw new Error("READER_NOT_READY")
        if (action === "share") {
          await shareAsync(image.uri, {
            mimeType: images.every((item) => item.mimeType === image.mimeType)
              ? image.mimeType
              : "image/*",
            additionalUrls: images.slice(1).map((item) => item.uri),
          })
        } else if (action === "copy") {
          await setImageAsync(await new File(image.uri).base64())
        } else if (action === "files") {
          const directory = await Directory.pickDirectoryAsync()
          const destination = directory.createFile(image.name, image.mimeType)
          new File(image.uri).copy(destination)
        } else {
          const permission = await requestPermissionsAsync(true, ["photo"])
          if (!permission.granted) {
            Alert.alert(t("reader.imagePhotoPermission"))
            return
          }
          await Asset.create(image.uri)
        }
      } catch (error) {
        const code = (error as { code?: string })?.code ?? ""
        if (/cancel/i.test(code)) return
        console.error("Reader image export failed", error)
        Alert.alert(t("reader.imageActionFailed"))
      } finally {
        busy.current = false
      }
    },
    [reader, t, book],
  )
  const onImagePress = useCallback(
    ({ href }: { href: string }) => {
      if (busy.current) return
      const actions = [
        {
          text: t("reader.copyImage"),
          onPress: () => {
            void run("copy", href)
          },
        },
        {
          text: t("reader.saveImageToFiles"),
          onPress: () => {
            void run("files", href)
          },
        },
        {
          text: t("reader.saveImageToPhotos"),
          onPress: () => {
            void run("photos", href)
          },
        },
        { text: t("common.cancel"), style: "cancel" as const },
      ]
      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: actions.map((action) => action.text),
            cancelButtonIndex: 3,
          },
          (index) => actions[index]?.onPress?.(),
        )
      } else
        Alert.alert(t("reader.image"), undefined, actions.slice(0, 3), {
          cancelable: true,
        })
    },
    [run, t],
  )
  return { onImagePress, sharePage: useCallback(() => run("share"), [run]) }
}
