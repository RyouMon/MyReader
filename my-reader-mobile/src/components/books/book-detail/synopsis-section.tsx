import { Text } from "../../../tw";
import { FONT_UI } from "../../../design/typography";
import type { DetailColors } from "./types";
import { SectionFrame, SectionHeader } from "./section-frame";

type SynopsisSectionProps = {
  colors: DetailColors;
  text: string;
};

export function SynopsisSection({ colors, text }: SynopsisSectionProps) {
  return (
    <SectionFrame colors={colors}>
      <SectionHeader colors={colors} title="简介" />
      <Text
        className="text-base leading-relaxed"
        style={{ color: colors.muted, fontFamily: FONT_UI }}
      >
        {text}
      </Text>
    </SectionFrame>
  );
}
