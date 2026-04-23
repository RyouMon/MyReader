import { FlashList } from "@shopify/flash-list";
import { View, useWindowDimensions } from "react-native";

import type { BookItem } from "@/src/data/types";

import { BookCard } from "./book-card";

const GAP = 12;

export function LibraryGrid({
  data,
  onSelectBook,
}: {
  data: BookItem[];
  onSelectBook?: (book: BookItem) => void;
}) {
  const { width } = useWindowDimensions();
  const columns = width >= 768 ? 4 : 2;
  const cardWidth = (width - GAP * (columns - 1)) / columns;

  return (
    <FlashList
      data={data}
      key={columns}
      keyExtractor={(item) => item.id}
      numColumns={columns}
      scrollEnabled={false}
      ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
      renderItem={({ item, index }) => (
        <View style={{ paddingRight: (index + 1) % columns !== 0 ? GAP : 0 }}>
          <BookCard book={item} width={cardWidth} onPress={onSelectBook ? () => onSelectBook(item) : undefined} />
        </View>
      )}
    />
  );
}
