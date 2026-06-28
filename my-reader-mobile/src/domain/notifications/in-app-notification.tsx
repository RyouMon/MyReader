import { StyleSheet, Text, View } from "react-native"

type InAppNotificationKind = "success" | "error" | "warning" | "info"

// Fixed light-palette colors — intentionally not theme-aware so backgrounds
// remain legible (high contrast) in both light and dark mode.
const BACKGROUND: Record<InAppNotificationKind, string> = {
  success: "#3A7D5A",
  error: "#B53A2F",
  warning: "#C4922D",
  info: "#D97757",
}

interface InAppNotificationProps {
  title?: string
  description?: string
  kind?: InAppNotificationKind
}

export function InAppNotification({
  title,
  description,
  kind = "info",
}: InAppNotificationProps) {
  return (
    <View style={[styles.card, { backgroundColor: BACKGROUND[kind] }]}>
      {!!title && <Text style={styles.title}>{title}</Text>}
      {!!description && <Text style={styles.description}>{description}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  description: {
    fontSize: 13,
    marginTop: 2,
    color: "rgba(255, 255, 255, 0.85)",
  },
})
