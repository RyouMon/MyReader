import { isBuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"
import { Redirect, useLocalSearchParams } from "expo-router"

import LibraryScreen from "@/src/features/library/library-screen"

export default function LibraryCollectionRoute() {
  const { collectionId } = useLocalSearchParams<{ collectionId?: string }>()

  if (!isBuiltInBookCollectionId(collectionId)) {
    return <Redirect href="/library/collection/all" />
  }

  return <LibraryScreen key={collectionId} collectionId={collectionId} />
}
