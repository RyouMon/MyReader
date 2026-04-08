import { FlatList, useWindowDimensions } from "react-native";

import type { BookItem } from "@/src/data/types";

import { BookCard } from "./book-card";

export function LibraryGrid({
  data,
  onSelectBook,
}: {
  data: BookItem[];
  onSelectBook?: (book: BookItem) => void;
}) {
  const { width } = useWindowDimensions();
  const columns = width >= 768 ? 4 : 2;
  const cardWidth = width >= 768 ? (width - 76) / 4 : (width - 44) / 2;

  return (
    <FlatList
      data={data}
      key={columns}
      keyExtractor={(item) => item.id}
      numColumns={columns}
      scrollEnabled={false}
      columnWrapperStyle={{ gap: 12 }}
      contentContainerStyle={{ gap: 12 }}
      renderItem={({ item }) => <BookCard book={item} width={cardWidth} onPress={onSelectBook ? () => onSelectBook(item) : undefined} />}
    />
  );
}
