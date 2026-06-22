import { useState } from "react";

import { useTranslation } from "react-i18next";

import { SectionCard, SettingsSectionLabel } from "@/src/components/ui";
import { FONT_UI } from "@/src/design/typography";
import { Pressable, Text, View } from "@/tw";
import type { DetailColors } from "./types";

type SynopsisSectionProps = {
  colors: DetailColors;
  text: string;
};

export function SynopsisSection({ colors, text }: SynopsisSectionProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [totalLines, setTotalLines] = useState(0);

  const needsExpand = totalLines > 3;

  return (
    <View className="gap-3 px-4">
      <SettingsSectionLabel>{t("bookDetail.synopsis")}</SettingsSectionLabel>
      <SectionCard>
        <View className="p-4">
          <Text
            className="text-[16px] leading-6"
            numberOfLines={expanded ? undefined : 3}
            style={{ color: colors.muted, fontFamily: FONT_UI }}
          >
            {text}
          </Text>
          {needsExpand && (
            <Pressable
              accessibilityLabel={expanded ? t("bookDetail.collapse") : t("bookDetail.expand")}
              accessibilityRole="button"
              className="mt-2 self-start"
              onPress={() => setExpanded((prev) => !prev)}
            >
              <Text
                className="text-[16px] leading-6 font-medium"
                style={{ color: colors.accent, fontFamily: FONT_UI }}
              >
                {expanded ? t("bookDetail.collapse") : t("bookDetail.expand")}
              </Text>
            </Pressable>
          )}
          <Text
            className="text-[16px] leading-6"
            numberOfLines={undefined}
            onTextLayout={(e) => setTotalLines(e.nativeEvent.lines.length)}
            style={{
              color: colors.muted,
              fontFamily: FONT_UI,
              position: "absolute",
              opacity: 0,
              left: 0,
              right: 0,
            }}
          >
            {text}
          </Text>
        </View>
      </SectionCard>
    </View>
  );
}
