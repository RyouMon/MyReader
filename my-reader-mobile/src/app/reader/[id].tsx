import { SafeAreaProvider } from "react-native-safe-area-context"

import ReaderScreen from "@/src/features/reader/reader-screen"

export default function ReaderRoute() {
  return (
    <SafeAreaProvider>
      <ReaderScreen />
    </SafeAreaProvider>
  )
}
