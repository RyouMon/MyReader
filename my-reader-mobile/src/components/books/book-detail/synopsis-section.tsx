import { Pressable, Text } from "../../../tw";
import { FONT_UI } from "../../../design/typography";
import type { DetailColors } from "./types";
import { SectionFrame, SectionHeader } from "./section-frame";

type SynopsisSectionProps = {
  colors: DetailColors;
  expanded: boolean;
  onToggle: () => void;
  text: string;
};

export function SynopsisSection({ colors, expanded, onToggle, text }: SynopsisSectionProps) {
  return (
    <SectionFrame colors={colors}>
      <SectionHeader colors={colors} title="简介" />
      <Text
        className="text-[13px] leading-[22px]"
        numberOfLines={expanded ? undefined : 6}
        style={{ color: colors.muted, fontFamily: FONT_UI }}
      >
        {text}
      </Text>
      <Pressable accessibilityRole="button" className="self-start" onPress={onToggle}>
        <Text
          className="text-[13px] leading-5"
          style={{ color: colors.accent, fontFamily: FONT_UI, fontWeight: "500" }}
        >
          {expanded ? "收起" : "展开全文"}
        </Text>
      </Pressable>
    </SectionFrame>
  );
}
