import { SectionCard, SettingsRow } from "../../ui";
import type { DetailColors, InfoCardItem } from "./types";
import { SectionFrame, SectionHeader } from "./section-frame";

type InfoRowSectionProps = {
  colors: DetailColors;
  items: InfoCardItem[];
  title: string;
};

export function InfoRowSection({ colors, items, title }: InfoRowSectionProps) {
  return (
    <SectionFrame colors={colors}>
      <SectionHeader colors={colors} title={title} />
      <SectionCard>
        {items.map((item, index) => (
          <SettingsRow
            key={`${item.label}-${item.value}`}
            title={item.label}
            detail={item.value}
            isLast={index === items.length - 1}
          />
        ))}
      </SectionCard>
    </SectionFrame>
  );
}
