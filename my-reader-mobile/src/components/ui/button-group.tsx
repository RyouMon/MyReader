import { type ReactNode } from "react"

import { View } from "@/tw"

export function ButtonGroup({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <View className={`items-center ${className ?? ""}`}>
      <View className="w-full flex-row gap-3 px-4" style={{ maxWidth: 400 }}>
        {children}
      </View>
    </View>
  )
}
