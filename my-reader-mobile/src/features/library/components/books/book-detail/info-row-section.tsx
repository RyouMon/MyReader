import type { CatalogToken } from "@my-reader/tools/catalog-navigation"
import { Pressable, Text } from "react-native"
import { useThemePalette } from "@/src/design/tokens"
import { SectionCard, ListRow, SectionLabel } from "@/src/components"
import { View } from "@/tw"
import type { InfoCardItem } from "./types"

type InfoRowSectionProps = {
  onBrowse?: (token: CatalogToken) => void
  items: InfoCardItem[]
  title: string
}

export function InfoRowSection({
  items,
  title,
  onBrowse,
}: InfoRowSectionProps) {
  const palette = useThemePalette()
  return (
    <View className="gap-3 px-4">
      <SectionLabel>{title}</SectionLabel>
      <SectionCard>
        {items.map((item, index) => (
          <ListRow
            key={`${item.label}-${item.value}`}
            isLast={index === items.length - 1}
            title={item.label}
            value={item.tokens?.length && onBrowse ? undefined : item.value}
            accessory={
              item.tokens?.length && onBrowse ? (
                <View className="flex-1 flex-row flex-wrap justify-end gap-2">
                  {item.tokens.map((token) => (
                    <Pressable
                      key={token.value}
                      accessibilityRole="link"
                      onPress={() => onBrowse(token)}
                    >
                      <Text style={{ color: palette.primary }}>
                        {token.value}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : undefined
            }
          />
        ))}
      </SectionCard>
    </View>
  )
}
