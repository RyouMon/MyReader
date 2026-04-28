import { Text, View } from "../../../tw";
import { FONT_MONO, FONT_UI } from "../../../design/typography";
import type { DetailColors, InfoCardItem } from "./types";
import { SectionFrame, SectionHeader } from "./section-frame";

type InfoRowSectionProps = {
  colors: DetailColors;
  items: InfoCardItem[];
  title: string;
};

function InfoRow({
  colors,
  isLast,
  item,
}: {
  colors: DetailColors;
  isLast: boolean;
  item: InfoCardItem;
}) {
  return (
    <View
      className="min-h-12 flex-row items-start justify-between gap-3 px-4 py-3"
      style={{
        borderBottomColor: colors.border,
        borderBottomWidth: isLast ? 0 : 1,
      }}
    >
      <Text
        className="shrink-0 text-sm leading-5"
        style={{ color: colors.muted, fontFamily: FONT_UI, fontWeight: "500" }}
      >
        {item.label}
      </Text>
      <Text
        className="flex-1 text-right text-sm leading-5"
        style={{ color: colors.text, fontFamily: item.mono ? FONT_MONO : FONT_UI }}
      >
        {item.value}
      </Text>
    </View>
  );
}

export function InfoRowSection({ colors, items, title }: InfoRowSectionProps) {
  return (
    <SectionFrame colors={colors}>
      <SectionHeader colors={colors} title={title} />
      <View className="-mx-4">
        {items.map((item, index) => (
          <InfoRow key={`${item.label}-${item.value}`} colors={colors} isLast={index === items.length - 1} item={item} />
        ))}
      </View>
    </SectionFrame>
  );
}
