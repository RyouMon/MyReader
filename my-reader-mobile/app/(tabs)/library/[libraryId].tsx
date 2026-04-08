import { useLocalSearchParams } from "expo-router";

import LibraryScreen from "@/src/screen/library-screen";

export default function LibraryDetailRoute() {
  const { libraryId } = useLocalSearchParams<{ libraryId?: string }>();

  return <LibraryScreen libraryId={libraryId} />;
}
