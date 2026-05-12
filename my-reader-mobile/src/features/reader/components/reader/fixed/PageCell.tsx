import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Image } from "expo-image";

import { READER_CHROME, READER_FIXED } from "@/src/design/reader-tokens";

type PageCellProps = {
  uri: string | null;
  loading?: boolean;
  width: number;
  height: number;
  scale?: number;
};

export function PageCell({ uri, loading, width, height, scale = 1 }: PageCellProps) {
  return (
    <View style={[styles.wrap, { width, height }]}>
      {loading || !uri ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={READER_CHROME.loadingIndicator} />
        </View>
      ) : (
        <Image
          source={{ uri }}
          style={[
            styles.img,
            {
              width: width * scale,
              height: height * scale,
            },
          ]}
          contentFit="contain"
          transition={120}
          cachePolicy="memory-disk"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: READER_FIXED.canvasBg,
    overflow: "hidden",
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  img: {
    backgroundColor: READER_FIXED.canvasBg,
  },
});
