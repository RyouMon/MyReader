import { useTranslation } from "react-i18next";

import { Text } from "@/tw";
import { FONT_UI } from "@/src/design/typography";
import type { DetailColors } from "./types";
import { SectionFrame, SectionHeader } from "./section-frame";

type SynopsisSectionProps = {
  colors: DetailColors;
  text: string;
};

export function SynopsisSection({ colors, text }: SynopsisSectionProps) {
  const { t } = useTranslation();

  return (
    <SectionFrame colors={colors}>
      <SectionHeader colors={colors} title={t("bookDetail.synopsis")} />
      <Text
        className="text-base leading-relaxed"
        style={{ color: colors.muted, fontFamily: FONT_UI }}
      >
        {text}
      </Text>
    </SectionFrame>
  );
}
