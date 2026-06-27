import { SectionCard, ListRow, SectionLabel } from "@/src/components";
import { View } from "@/tw";
import type { InfoCardItem } from "./types";

type InfoRowSectionProps = {
  items: InfoCardItem[];
  title: string;
};

export function InfoRowSection({ items, title }: InfoRowSectionProps) {
  return (
    <View className="gap-3 px-4">
      <SectionLabel>{title}</SectionLabel>
      <SectionCard>
        {items.map((item, index) => (
          <ListRow
            key={`${item.label}-${item.value}`}
            isLast={index === items.length - 1}
            title={item.label}
            value={item.value}
          />
        ))}
      </SectionCard>
    </View>
  );
}
