import { Redirect } from "expo-router"
import { Platform } from "react-native"
import UpdateNotesScreen from "@/src/features/app-updates/update-notes-screen"

export default function UpdateNotesRoute() {
  return Platform.OS === "android" ? (
    <UpdateNotesScreen />
  ) : (
    <Redirect href="/settings" />
  )
}
