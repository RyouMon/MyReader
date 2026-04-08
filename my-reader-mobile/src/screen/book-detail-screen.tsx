import { useMemo, useState } from "react";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useThemePalette } from "@/src/design/tokens";
import { Image, Pressable, ScrollView, Text, View } from "@/tw";

import { EmptyState, ProgressBar, Sheet, SheetOption } from "../components";
import { useLibraries } from "../data/library-context";

const formatOptions = ["EPUB", "AZW3", "PDF"] as const;

export default function BookDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();
  const { books, activeLibrary } = useLibraries();
  const [selectedFormat, setSelectedFormat] = useState<(typeof formatOptions)[number]>("EPUB");
  const [formatSheetOpen, setFormatSheetOpen] = useState(false);

  const book = useMemo(() => books.find((item) => item.id === id) ?? null, [books, id]);

  if (!book) {
    return (
      <View className="flex-1 px-4 pt-4" style={{ backgroundColor: palette.background }}>
        <View className="gap-4">
          <EmptyState title="没有找到这本书" detail="它可能已从当前书库移除，或页面参数已经失效。" />
        </View>
      </View>
    );
  }

  const progress = typeof book.progress === "number" ? book.progress : 0.42;
  const progressLabel = `${Math.round(progress * 100)}%`;
  const authors = book.authors?.length ? book.authors : [book.author];
  const libraryPath = book.path ?? `${book.title.replaceAll(" ", "-")}.${selectedFormat.toLowerCase()}`;

  return (
    <View className="flex-1" style={{ backgroundColor: palette.background }}>
      <Stack.Screen
        options={{
          title: book.title,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              className="min-h-10 min-w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }}
            >
              <MaterialIcons name="ios-share" size={18} color={palette.textMuted} />
            </Pressable>
          ),
        }}
      />
      <ScrollView className="flex-1" contentInsetAdjustmentBehavior="never" contentContainerClassName="px-4 pb-36" style={{ backgroundColor: palette.background }}>
        <View className="gap-4 pt-2">
          <View className="items-center rounded-[32px] px-4 pb-5 pt-6" style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }}>
            <View className="w-full items-center gap-4">
              <View className="w-[208px] overflow-hidden rounded-[26px]" style={{ backgroundColor: palette.primaryStrong }}>
                {book.coverUri ? (
                  <Image source={book.coverUri} className="aspect-[2/3] w-full" />
                ) : (
                  <View className="aspect-[2/3] items-center justify-end px-6 py-5" style={{ backgroundColor: palette.primary }}>
                    <Text className="text-center text-[22px] leading-8" style={{ color: palette.primaryForeground, fontWeight: "700" }}>
                      {book.title}
                    </Text>
                    <Text className="mt-2 text-sm" style={{ color: palette.primaryForeground, opacity: 0.8 }}>
                      {book.author}
                    </Text>
                  </View>
                )}
              </View>

              <View className="w-full gap-2">
                <Text className="text-[30px] leading-[36px]" style={{ color: palette.text, fontWeight: "700" }}>
                  {book.title}
                </Text>
                <Text className="text-sm leading-6" style={{ color: palette.textMuted }}>
                  {activeLibrary?.name ?? "当前书库"} · 共 {books.length} 本
                </Text>
                <View className="flex-row flex-wrap gap-x-3 gap-y-2">
                  {authors.map((author) => (
                    <Text key={author} className="text-base" style={{ color: palette.primary, fontWeight: "700" }}>
                      {author}
                    </Text>
                  ))}
                </View>
              </View>
            </View>
          </View>

          <View className="gap-3 rounded-[24px] px-4 py-4" style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }}>
            <View className="flex-row items-center justify-between">
              <Text className="text-[13px]" style={{ color: palette.textMuted, fontWeight: "600" }}>
                阅读进度
              </Text>
              <Text className="text-[13px]" style={{ color: palette.primary, fontWeight: "700" }}>
                {progressLabel}
              </Text>
            </View>
            <ProgressBar progress={progress} />
          </View>

          <View className="gap-3 rounded-[24px] px-4 py-4" style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }}>
            <Text className="text-[18px]" style={{ color: palette.text, fontWeight: "700" }}>
              书籍信息
            </Text>
            <Text className="text-xs leading-6" style={{ color: palette.textMuted }}>
              文件路径：{libraryPath}
            </Text>
            <Text className="text-xs leading-6" style={{ color: palette.textMuted }}>
              当前格式：{selectedFormat}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View className="px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12), backgroundColor: palette.background, borderTopColor: palette.border, borderTopWidth: 1 }}>
        <View className="flex-row gap-3">
          <Pressable accessibilityRole="button" className="min-h-14 flex-1 flex-row items-center justify-between rounded-[20px] px-4" style={{ backgroundColor: palette.primary }}>
            <View className="flex-row items-center gap-3">
              <MaterialIcons name="menu-book" size={20} color={palette.primaryForeground} />
              <View>
                <Text className="text-[16px]" style={{ color: palette.primaryForeground, fontWeight: "700" }}>
                  继续阅读 {progressLabel}
                </Text>
                <Text className="text-xs" style={{ color: palette.primaryForeground, opacity: 0.82 }}>
                  返回上次阅读位置
                </Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={palette.primaryForeground} />
          </Pressable>

          <Pressable accessibilityRole="button" className="min-h-14 min-w-[96px] flex-row items-center justify-center gap-1 rounded-[20px] px-4" onPress={() => setFormatSheetOpen(true)} style={{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }}>
            <Text className="text-[15px]" style={{ color: palette.text, fontWeight: "700" }}>
              {selectedFormat}
            </Text>
            <MaterialIcons name="expand-more" size={18} color={palette.textMuted} />
          </Pressable>
        </View>
      </View>

      <Sheet open={formatSheetOpen} onClose={() => setFormatSheetOpen(false)}>
        <Text className="px-1 text-xs font-semibold uppercase tracking-[0.4px]" style={{ color: palette.textMuted }}>
          选择格式
        </Text>
        <View className="gap-2">
          {formatOptions.map((format) => (
            <SheetOption
              key={format}
              label={format}
              active={format === selectedFormat}
              onPress={() => {
                setSelectedFormat(format);
                setFormatSheetOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </View>
  );
}
