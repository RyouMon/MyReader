import { useMemo } from "react";
import { router } from "expo-router";

import { useThemePalette } from "@/src/design/tokens";
import { Image, Text, View } from "@/tw";

import { EmptyState, HeroCard, HorizontalBookShelf, PrimaryButton, ProgressBar, Screen, SecondaryButton, SectionHeading } from "@/src/components";
import { useLibraryStore } from "@/src/store/library-store";

export default function HomeScreen() {
  const palette = useThemePalette();
  const { activeLibrary, books, loadingBooks } = useLibraryStore();

  const currentBook = books[0];
  const recentBooks = useMemo(() => books.slice(0, 5), [books]);
  const addedBooks = useMemo(
    () =>
      [...books]
        .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
        .slice(0, 5),
    [books]
  );
  const continueProgress = 0.32;

  function openBookDetail(bookId: string) {
    router.push({ pathname: "/book/[id]", params: { id: bookId } });
  }

  return (
    <Screen>
      {!activeLibrary ? (
        <EmptyState
          title="还没有添加书库"
          detail="在设置里添加本地 Calibre 书库后，这里会显示继续阅读和最近添加的图书。"
          action={<PrimaryButton title="添加书库" onPress={() => router.push("/settings/add-library")} />}
          icon={{ ios: "books.vertical.fill", android: "library-books" }}
        />
      ) : currentBook ? (
        <>
          <HeroCard>
            <View className="gap-4">
              <View className="flex-row items-start justify-between gap-3">
                <View className="gap-1">
                  <Text selectable className="text-[16px] leading-6" style={{ color: palette.textMuted, fontWeight: "600" }}>
                    继续阅读
                  </Text>
                  <Text
                    selectable
                    className="text-[30px] leading-[36px]"
                    style={{ color: palette.text, fontWeight: "700", letterSpacing: -0.2 }}
                  >
                    {currentBook.title}
                  </Text>
                </View>
                <View className="rounded-full px-3 py-2" style={{ backgroundColor: palette.backgroundSecondary }}>
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: palette.primary, fontVariant: ["tabular-nums"] }}
                  >
                    {Math.round(continueProgress * 100)}%
                  </Text>
                </View>
              </View>

              <View className="flex-row gap-4">
                {currentBook.coverUri ? (
                  <Image source={currentBook.coverUri} className="h-[168px] w-[112px] rounded-[18px]" />
                ) : (
                  <View className="h-[168px] w-[112px] items-center justify-center rounded-[18px]" style={{ backgroundColor: palette.backgroundSecondary }}>
                    <Text className="text-sm" style={{ color: palette.textMuted, fontWeight: "600" }}>
                      无封面
                    </Text>
                  </View>
                )}
                <View className="flex-1 gap-3">
                  <View className="gap-1">
                    <Text selectable className="text-base font-semibold leading-6" style={{ color: palette.text }}>
                      {currentBook.author}
                    </Text>
                    <Text selectable className="text-sm leading-6" style={{ color: palette.textMuted }}>
                      当前书库：{activeLibrary.name} · 共 {books.length} 本
                    </Text>
                  </View>
                  <ProgressBar progress={continueProgress} />
                  <View className="flex-row gap-3 pt-1">
                    <PrimaryButton title="继续阅读" onPress={() => openBookDetail(currentBook.id)} />
                    <SecondaryButton title={loadingBooks ? "读取中" : "查看书籍"} onPress={() => openBookDetail(currentBook.id)} />
                  </View>
                </View>
              </View>
            </View>
          </HeroCard>

          <View className="gap-3">
            <SectionHeading title="最近阅读" detail={`${Math.min(recentBooks.length, books.length)} 本`} />
            <HorizontalBookShelf data={recentBooks} onSelectBook={(book) => openBookDetail(book.id)} />
          </View>

          <View className="gap-3">
            <SectionHeading title="最近添加" />
            <HorizontalBookShelf data={addedBooks} onSelectBook={(book) => openBookDetail(book.id)} />
          </View>
        </>
      ) : (
        <EmptyState
          title="书库中还没有图书"
          detail="请确认你选择的是有效的 Calibre 书库，并且 metadata.db 中存在 books 表数据。"
          icon={{ ios: "book", android: "book" }}
        />
      )}
    </Screen>
  );
}
