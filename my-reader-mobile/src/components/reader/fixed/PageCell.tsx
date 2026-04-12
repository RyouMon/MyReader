import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Image } from "expo-image";

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
          <ActivityIndicator size="large" color="rgba(255,255,255,0.7)" />
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
    backgroundColor: "#111",
    overflow: "hidden",
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  img: {
    backgroundColor: "#111",
  },
});

