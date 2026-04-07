import { ScrollView, Text, View } from "@/tw";

export default function Index() {
  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="flex-1 items-center justify-center p-4">
      <View className="gap-2">
        <Text className="text-xl font-bold text-gray-900">
          Tailwind 已就绪
        </Text>
        <Text className="text-base text-gray-600">
          使用 @/tw 中的组件以支持 className。
        </Text>
      </View>
    </ScrollView>
  );
}
