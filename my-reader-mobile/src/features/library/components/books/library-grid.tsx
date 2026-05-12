import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list";
import { View, useWindowDimensions } from "react-native";
import React, { useCallback } from "react";

import type { BookItem } from "@/src/data/types";

import { BookCard } from "./book-card";

const GAP = 12;

type GridItemProps = {
  item: BookItem;
  index: number;
  columns: number;
  cardWidth: number;
  onSelectBook?: (book: BookItem) => void;
};

const GridItem = React.memo(function GridItem({
  item,
  index,
  columns,
  cardWidth,
  onSelectBook,
}: GridItemProps) {
  return (
    <View style={{ paddingRight: (index + 1) % columns !== 0 ? GAP : 0 }}>
      <BookCard
        book={item}
        width={cardWidth}
        onPress={onSelectBook ? () => onSelectBook(item) : undefined}
      />
    </View>
  );
});

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

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<BookItem>) => (
      <GridItem
        item={item}
        index={index}
        columns={columns}
        cardWidth={cardWidth}
        onSelectBook={onSelectBook}
      />
    ),
    [columns, cardWidth, onSelectBook],
  );

  return (
    <FlashList
      data={data}
      key={columns}
      keyExtractor={(item) => item.id}
      numColumns={columns}
      scrollEnabled={false}
      ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
      renderItem={renderItem}
    />
  );
}
