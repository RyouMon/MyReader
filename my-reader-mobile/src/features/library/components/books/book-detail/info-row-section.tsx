import { SectionCard, SettingsRow, SettingsSectionLabel } from "@/src/components";
import { View } from "@/tw";
import type { InfoCardItem } from "./types";

type InfoRowSectionProps = {
  items: InfoCardItem[];
  title: string;
};

export function InfoRowSection({ items, title }: InfoRowSectionProps) {
  return (
    <View className="gap-3 px-4">
      <SettingsSectionLabel>{title}</SettingsSectionLabel>
      <SectionCard>
        {items.map((item, index) => (
          <SettingsRow
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
