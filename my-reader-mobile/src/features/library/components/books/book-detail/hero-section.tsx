import type { BookDetail } from "@my-reader/tools/types/book";
import type { MenuAction } from "@react-native-menu/menu";
import { MenuView } from "@react-native-menu/menu";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Button, ButtonGroup } from "@/src/components/ui";
import { FONT_DISPLAY, FONT_UI } from "@/src/design/typography";
import type { BookItem } from "@/src/domain/types";
import { Image, Text, View } from "@/tw";
import type { DetailColors } from "./types";

type HeroSectionProps = {
  book: BookDetail;
  colors: DetailColors;
  coverUri?: BookItem["coverUri"];
  canReadInApp: boolean;
  formats: string[];
  readButtonTitle: string;
  selectedFormat: string | null;
  onRead: () => void;
  onSetFormat: (format: string) => void;
};

export function HeroSection({
  book,
  colors,
  coverUri,
  canReadInApp,
  formats,
  readButtonTitle,
  selectedFormat,
  onRead,
  onSetFormat,
}: HeroSectionProps) {
  const { t } = useTranslation();
  const authors = book.authors.filter(Boolean).join(", ") || book.authorSort;

  const formatMenuActions = useMemo<MenuAction[]>(
    () =>
      formats.map((format) => ({
        id: format,
        title: format,
        state: format.toUpperCase() === selectedFormat?.toUpperCase() ? ("on" as const) : undefined,
      })),
    [formats, selectedFormat]
  );

  const handleFormatMenuAction = ({ nativeEvent }: { nativeEvent: { event: string } }) => {
    onSetFormat(nativeEvent.event);
  };

  return (
    <View className="px-4 pt-4">
      <View className="flex-row gap-4">
        <View className="h-[188px] w-[128px] overflow-hidden rounded-lg">
          {coverUri ? (
            <Image
              source={coverUri}
              className="h-full w-full object-cover"
              cachePolicy="memory-disk"
              recyclingKey={String(book.id)}
            />
          ) : (
            <View
              className="h-full w-full justify-end px-3 py-4"
              style={{ backgroundColor: colors.palette.surface }}
            >
              <Text
                className="text-center text-[15px] leading-5"
                numberOfLines={4}
                style={{
                  color: colors.text,
                  fontFamily: FONT_DISPLAY,
                  fontWeight: "700",
                  opacity: 0.6,
                }}
              >
                {book.title}
              </Text>
            </View>
          )}
        </View>

        <View className="flex-1 gap-3 py-1">
          <Text
            className="text-[26px] leading-8"
            numberOfLines={3}
            style={{ color: colors.text, fontFamily: FONT_DISPLAY, fontWeight: "700" }}
          >
            {book.title}
          </Text>
          <Text
            className="text-[15px] leading-5"
            numberOfLines={2}
            style={{ color: colors.accent, fontFamily: FONT_UI, fontWeight: "600" }}
          >
            {authors}
          </Text>
          {book.tags.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {book.tags.slice(0, 4).map((tag) => (
                <View
                  key={tag}
                  className="justify-center rounded-full border px-3 py-1"
                  style={{ borderColor: colors.border }}
                >
                  <Text
                    className="text-[16px] leading-6"
                    style={{ color: colors.muted, fontFamily: FONT_UI, fontWeight: "500" }}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <ButtonGroup className="mt-5">
        <Button
          accessibilityLabel={readButtonTitle}
          className="flex-1"
          colors={{
            backgroundColor: colors.accent,
            borderColor: colors.accent,
            textColor: colors.accentText,
            underlayColor: colors.accentPressed,
          }}
          disabled={!canReadInApp}
          onPress={onRead}
          size="lg"
          textStyle={{ fontFamily: FONT_UI }}
          title={readButtonTitle}
          variant="primary"
        />
        <View className="flex-1">
          <Button
            accessibilityLabel={t("bookDetail.setReadingFormat")}
            className="flex-1"
            onPress={() => {}}
            size="lg"
            textStyle={{ fontFamily: FONT_UI }}
            title={t("bookDetail.setReadingFormat")}
            variant="secondary"
          />
          <MenuView
            actions={formatMenuActions}
            onPressAction={handleFormatMenuAction}
            shouldOpenOnLongPress={false}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
            <View style={{ width: "100%", height: "100%" }} />
          </MenuView>
        </View>
      </ButtonGroup>
    </View>
  );
}
