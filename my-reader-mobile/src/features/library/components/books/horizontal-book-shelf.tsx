import { FlatList } from "react-native";

import type { BookItem } from "@/src/domain/types";

import { BookCard } from "./book-card";

export function HorizontalBookShelf({
  data,
  onSelectBook,
}: {
  data: BookItem[];
  onSelectBook?: (book: BookItem) => void;
}) {
  return (
    <FlatList
      horizontal
      data={data}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12, paddingHorizontal: 4, alignItems: "flex-start" }}
      renderItem={({ item }) => <BookCard book={item} width={156} onPress={onSelectBook ? () => onSelectBook(item) : undefined} />}
    />
  );
}
